// Zusatzebenen (Fachdaten) über dem Luftbild, mit regelbarer Deckkraft.
// Die Ebenenliste wird aus dem Verzeichnis des Geoportals gelesen und je Thema
// über Suchmuster gefiltert (siehe THEMES in config.js).

import { THEMES, WMS_BASE } from './config.js';
import { getLayersConfig, wmtsTileUrl, wmsTileUrl } from './geoadmin.js';

const RENDERABLE = new Set(['wmts', 'wms', 'aggregate', 'geojson']);

function layerType(cfg) {
  if (cfg.type) return cfg.type;
  if (cfg.subLayersIds) return 'aggregate';
  if (cfg.geojsonUrl) return 'geojson';
  if (cfg.wmsLayers) return 'wms';
  return 'wmts';
}

/** Liste der Ebenen eines Themas: [{id, label, attribution, type}] */
export async function listThemeLayers(themeKey) {
  const theme = THEMES.find((t) => t.key === themeKey);
  if (!theme) return [];
  const cfg = await getLayersConfig();
  const out = [];
  for (const [id, c] of Object.entries(cfg)) {
    if (!c || typeof c !== 'object') continue;
    if (c.background) continue;
    if (c.parentLayerId) continue; // Unterebenen erscheinen über ihre Sammel-Ebene
    const type = layerType(c);
    if (!RENDERABLE.has(type)) continue;
    const label = String(c.label || id);
    if (!theme.pattern.test(label) && !theme.pattern.test(id)) continue;
    out.push({ id, label, attribution: c.attribution || '', type });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, 'de'));
  return out;
}

export class Overlays {
  constructor(map) {
    this.map = map;
    this.active = new Map(); // id -> {opacity, sources:[], layers:[], attribution}
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(this); }

  isActive(id) { return this.active.has(id); }

  async add(id, opacity) {
    if (this.active.has(id)) return;
    const cfg = await getLayersConfig();
    const c = cfg[id];
    if (!c) throw new Error(`Ebene ${id} nicht im Verzeichnis`);
    const entry = {
      id, cfg: c,
      opacity: opacity ?? (typeof c.opacity === 'number' ? c.opacity : 0.7),
      sources: [], layers: [], attribution: c.attribution || '',
    };
    this.active.set(id, entry);
    try {
      await this._addLayer(entry, id, c, cfg);
    } catch (err) {
      this.remove(id);
      throw err;
    }
    if (!this.active.has(id)) return; // inzwischen wieder entfernt
    this._emit();
  }

  async _addLayer(entry, id, c, cfg) {
    const type = layerType(c);
    if (type === 'aggregate') {
      for (const sub of c.subLayersIds || []) {
        if (cfg[sub]) await this._addLayer(entry, sub, cfg[sub], cfg);
      }
      return;
    }
    const srcId = `ov-src-${entry.id}-${id}`;
    const layerId = `ov-${entry.id}-${id}`;
    if (this.map.getSource(srcId)) return;

    if (type === 'geojson') {
      this.map.addSource(srcId, { type: 'geojson', data: c.geojsonUrl });
      const paintOpacity = entry.opacity;
      this.map.addLayer({
        id: `${layerId}-fill`, type: 'fill', source: srcId,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#3b9eff', 'fill-opacity': paintOpacity * 0.5 },
      });
      this.map.addLayer({
        id: `${layerId}-line`, type: 'line', source: srcId,
        filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'Polygon']],
        paint: { 'line-color': '#3b9eff', 'line-width': 2, 'line-opacity': paintOpacity },
      });
      this.map.addLayer({
        id: `${layerId}-circle`, type: 'circle', source: srcId,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 6, 'circle-color': '#3b9eff', 'circle-opacity': paintOpacity,
          'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': paintOpacity,
        },
      });
      entry.sources.push(srcId);
      entry.layers.push(`${layerId}-fill`, `${layerId}-line`, `${layerId}-circle`);
      return;
    }

    // WMTS bevorzugt (gecacht, schnell). Wird die Ebene in EPSG:3857 nicht als
    // WMTS ausgeliefert, auf den WMS-Dienst ausweichen.
    let wms = type === 'wms';
    let tiles = wms ? this._wmsUrl(id, c) : this._wmtsUrl(id, c);
    if (!wms && !(await this._probeWmts(tiles))) {
      wms = true;
      tiles = this._wmsUrl(id, c);
    }
    if (!this.active.has(entry.id) || this.map.getSource(srcId)) return; // inzwischen entfernt
    this.map.addSource(srcId, {
      type: 'raster', tiles: [tiles], tileSize: wms ? 512 : 256,
      minzoom: 0, maxzoom: 20, attribution: c.attribution || '',
    });
    this.map.addLayer({
      id: layerId, type: 'raster', source: srcId,
      paint: { 'raster-opacity': entry.opacity, 'raster-fade-duration': 150 },
    });
    entry.sources.push(srcId);
    entry.layers.push(layerId);
  }

  /** Fragt eine Kachel unter der Bildmitte ab; false bei 400/403/404. */
  async _probeWmts(template) {
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

  _wmtsUrl(id, c) {
    const stamps = Array.isArray(c.timestamps) ? c.timestamps.map(String) : [];
    const ts = stamps.includes('current') ? 'current' : (stamps[0] || 'current');
    return wmtsTileUrl(c.serverLayerName || id, ts, c.format || 'png');
  }

  _wmsUrl(id, c) {
    const stamps = Array.isArray(c.timestamps) ? c.timestamps.map(String) : [];
    const time = c.timeEnabled && stamps.length && stamps[0] !== 'current' ? stamps[0] : undefined;
    return wmsTileUrl(c.wmsUrl || WMS_BASE, c.wmsLayers || c.serverLayerName || id, { time });
  }

  remove(id) {
    const entry = this.active.get(id);
    if (!entry) return;
    for (const l of entry.layers) if (this.map.getLayer(l)) this.map.removeLayer(l);
    for (const s of entry.sources) if (this.map.getSource(s)) this.map.removeSource(s);
    this.active.delete(id);
    this._emit();
  }

  setOpacity(id, opacity) {
    const entry = this.active.get(id);
    if (!entry) return;
    entry.opacity = opacity;
    for (const l of entry.layers) {
      const layer = this.map.getLayer(l);
      if (!layer) continue;
      switch (layer.type) {
        case 'raster': this.map.setPaintProperty(l, 'raster-opacity', opacity); break;
        case 'fill': this.map.setPaintProperty(l, 'fill-opacity', opacity * 0.5); break;
        case 'line': this.map.setPaintProperty(l, 'line-opacity', opacity); break;
        case 'circle':
          this.map.setPaintProperty(l, 'circle-opacity', opacity);
          this.map.setPaintProperty(l, 'circle-stroke-opacity', opacity);
          break;
        default: break;
      }
    }
  }

  /** Quellenangaben der aktiven Ebenen (ohne Duplikate). */
  attributions() {
    const set = new Set();
    for (const e of this.active.values()) if (e.attribution) set.add(e.attribution);
    return [...set];
  }
}
