// Einblendbare Ebenen über dem Luftbild (siehe OVERLAYS in config.js):
//  - Rasterebenen (Gelände): WMTS bevorzugt; liefert der WMTS-Dienst keine
//    Kachel in EPSG:3857, wird auf den WMS-Dienst ausgewichen.
//  - Beschriftungen (Ortsnamen): Die Namen werden als Punkte aus swissNAMES3D
//    für den sichtbaren Ausschnitt abgefragt und als Schriftzüge gezeichnet.
//    Die WMS-Ebene würde auch Flächennamen als Schraffur einzeichnen.

import { Marker } from '../vendor/maplibre-gl/maplibre-gl.mjs';
import { OVERLAYS, WMS_BASE } from './config.js';
import { wmtsTileUrl, wmsTileUrl, identifyEnvelope } from './geoadmin.js';

export class Overlays {
  constructor(map) {
    this.map = map;
    this.active = new Map(); // key -> {def, opacity, labels?}
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(this); }

  isActive(key) { return this.active.has(key); }
  layerId(key) { return `ov-${key}`; }
  sourceId(key) { return `ov-src-${key}`; }

  async toggle(key, on) {
    if (on) await this.add(key); else this.remove(key);
  }

  async add(key) {
    const def = OVERLAYS.find((o) => o.key === key);
    if (!def || this.active.has(key)) return;
    const entry = { def, opacity: def.opacity ?? 1 };
    this.active.set(key, entry);

    if (def.labels) {
      entry.labels = new NameLabels(this.map, def.labels);
      entry.labels.enable();
      this._emit();
      return;
    }

    let tiles = null, tileSize = 256;
    if (def.wmts) {
      const url = wmtsTileUrl(def.wmts, 'current', 'png');
      if (await this._probe(url)) tiles = url;
    }
    if (!tiles) { tiles = wmsTileUrl(WMS_BASE, def.wms); tileSize = 512; }
    if (!this.active.has(key)) return; // inzwischen wieder abgeschaltet

    const map = this.map;
    if (!map.getSource(this.sourceId(key))) {
      map.addSource(this.sourceId(key), { type: 'raster', tiles: [tiles], tileSize, minzoom: 0, maxzoom: 20 });
    }
    // Reihenfolge wie in OVERLAYS: frühere Einträge liegen oben.
    const idx = OVERLAYS.indexOf(def);
    const above = OVERLAYS.slice(0, idx).map((o) => this.layerId(o.key)).find((id) => map.getLayer(id));
    map.addLayer({
      id: this.layerId(key), type: 'raster', source: this.sourceId(key),
      paint: { 'raster-opacity': entry.opacity, 'raster-fade-duration': 150 },
    }, above);
    this._emit();
  }

  remove(key) {
    const entry = this.active.get(key);
    if (!entry) return;
    const map = this.map;
    entry.labels?.disable();
    if (map.getLayer(this.layerId(key))) map.removeLayer(this.layerId(key));
    if (map.getSource(this.sourceId(key))) map.removeSource(this.sourceId(key));
    this.active.delete(key);
    this._emit();
  }

  setOpacity(key, opacity) {
    const entry = this.active.get(key);
    if (!entry) return;
    entry.opacity = opacity;
    if (this.map.getLayer(this.layerId(key))) this.map.setPaintProperty(this.layerId(key), 'raster-opacity', opacity);
  }

  /** Fragt eine Kachel unter der Bildmitte ab; false bei 400/403/404. */
  async _probe(template) {
    const z = Math.max(0, Math.min(18, Math.floor(this.map.getZoom()) + 1));
    const { lng, lat } = this.map.getCenter();
    const n = 2 ** z;
    const x = Math.floor(((lng + 180) / 360) * n);
    const latR = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n);
    const url = template.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    try {
      const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
      return !(res.status === 400 || res.status === 403 || res.status === 404);
    } catch {
      return true; // Netzfehler: nicht wechseln
    }
  }
}

// ---------------------------------------------------------------------------
// Beschriftungen aus swissNAMES3D

const LABEL_MIN_ZOOM = 11;
const LABEL_LIMIT = 200;
const LABEL_MAX_SHOWN = 90;

// Namensarten nach Wichtigkeit; ab welcher Zoomstufe sie erscheinen.
function labelRank(kind) {
  const k = String(kind || '').toLowerCase();
  if (/^ort$|hauptort|^stadt|ortschaft/.test(k)) return 0;
  if (/quartier|ortsteil|dorf|weiler/.test(k)) return 1;
  if (/see|fluss|gletscher|gipfel|pass|berg|grat|kuppe|h[üu]gel|felsen|insel|wasserfall|tal/.test(k)) return 2;
  if (/lokalname|flurname|gebiet|alp|ebene|wald/.test(k)) return 3;
  if (/geb[äa]ude|haltestelle|strasse|bahnhof|sportanlage|schule|kirche|kapelle|schloss|turm|br[üu]cke|denkmal|bach/.test(k)) return 5;
  return 4;
}
const RANK_MIN_ZOOM = [0, 13, 12, 15, 17, 19];

export class NameLabels {
  constructor(map, layer) {
    this.map = map;
    this.layer = layer;
    this.markers = [];
    this.controller = null;
    this.timer = null;
    this.enabled = false;
    this.onMove = () => this.schedule();
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.map.on('moveend', this.onMove);
    this.schedule(0);
  }

  disable() {
    this.enabled = false;
    this.map.off('moveend', this.onMove);
    clearTimeout(this.timer);
    this.controller?.abort();
    this._clear();
  }

  schedule(ms = 250) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), ms);
  }

  _clear() {
    for (const m of this.markers) m.remove();
    this.markers = [];
  }

  async refresh() {
    if (!this.enabled) return;
    const map = this.map;
    const zoom = map.getZoom();
    if (zoom < LABEL_MIN_ZOOM) { this._clear(); return; }
    this.controller?.abort();
    this.controller = new AbortController();
    const b = map.getBounds();
    const dx = (b.getEast() - b.getWest()) * 0.05, dy = (b.getNorth() - b.getSouth()) * 0.05;
    const env = { west: b.getWest() - dx, east: b.getEast() + dx, south: b.getSouth() - dy, north: b.getNorth() + dy };
    let results;
    try {
      results = await identifyEnvelope(env, this.layer, { limit: LABEL_LIMIT, signal: this.controller.signal });
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('Ortsnamen nicht abrufbar', err);
      return;
    }
    if (!this.enabled) return;

    const items = [];
    for (const r of results) {
      const a = r?.attributes || {};
      const name = String(a.name || a.label || '').trim();
      const g = r.geometry;
      const p = g?.type === 'Point' ? g.coordinates : g?.type === 'MultiPoint' ? g.coordinates?.[0] : null;
      if (!name || !p) continue;
      const rank = labelRank(a.objektart || a.objektklasse);
      if (zoom < RANK_MIN_ZOOM[rank]) continue;
      items.push({ name, rank, lng: p[0], lat: p[1] });
    }
    items.sort((x, y) => x.rank - y.rank || x.name.localeCompare(y.name));

    // Überlappungen vermeiden: wichtige Namen zuerst, spätere weichen.
    const placed = [];
    const chosen = [];
    for (const it of items) {
      if (chosen.length >= LABEL_MAX_SHOWN) break;
      const px = map.project([it.lng, it.lat]);
      const fs = it.rank === 0 ? 15 : it.rank === 1 ? 13 : 12;
      const w = it.name.length * fs * 0.62 + 12, h = fs + 10;
      const box = { x0: px.x - w / 2, x1: px.x + w / 2, y0: px.y - h / 2, y1: px.y + h / 2 };
      if (placed.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0)) continue;
      placed.push(box);
      chosen.push(it);
    }

    this._clear();
    for (const it of chosen) {
      const el = document.createElement('div');
      el.className = `name-label rank-${Math.min(it.rank, 3)}`;
      el.textContent = it.name;
      this.markers.push(new Marker({ element: el, anchor: 'center' }).setLngLat([it.lng, it.lat]).addTo(map));
    }
  }
}
