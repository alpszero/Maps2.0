// Einblendbare Ebenen über dem Luftbild: Ortsnamen und Gelände (siehe OVERLAYS
// in config.js). WMTS wird bevorzugt; liefert der WMTS-Dienst für eine Ebene in
// EPSG:3857 keine Kachel, wird auf den WMS-Dienst ausgewichen.

import { OVERLAYS, WMS_BASE } from './config.js';
import { wmtsTileUrl, wmsTileUrl } from './geoadmin.js';

export class Overlays {
  constructor(map) {
    this.map = map;
    this.active = new Map(); // key -> {def, opacity}
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
    const entry = { def, opacity: def.opacity };
    this.active.set(key, entry);

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
    // Reihenfolge wie in OVERLAYS: frühere Einträge liegen oben (Namen über Relief).
    const idx = OVERLAYS.indexOf(def);
    const above = OVERLAYS.slice(0, idx).map((o) => this.layerId(o.key)).find((id) => map.getLayer(id));
    map.addLayer({
      id: this.layerId(key), type: 'raster', source: this.sourceId(key),
      paint: { 'raster-opacity': entry.opacity, 'raster-fade-duration': 150 },
    }, above);
    this._emit();
  }

  remove(key) {
    if (!this.active.has(key)) return;
    const map = this.map;
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
