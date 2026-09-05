// Zusatzebenen aus dem Verzeichnis des Geoportals (layersConfig), über das
// Gelände gelegt. WMTS bevorzugt; liefert der WMTS-Dienst für die Ebene keine
// Kachel, wird auf WMS ausgewichen. Sammel-Ebenen werden aufgelöst.

import { WMS_BASE } from './config.js';
import { getLayersConfig, wmtsTileUrl, tileIndexFor } from './geoadmin.js';
import { geoadminWmtsLayer, geoadminWmsLayer, groundPointAtCenter } from './scene.js';

export class Overlays {
  /**
   * @param viewer Cesium-Viewer
   * @param baseCount Funktion, die die Anzahl der Jahrgangs-Ebenen liefert
   */
  constructor(viewer, baseCount) {
    this.viewer = viewer;
    this.baseCount = baseCount;
    this.active = []; // [{id, label, layers: [ImageryLayer], opacity}]
    this.catalog = null;
  }

  /** Liste der darstellbaren Ebenen [{id, label, type}]. */
  async list() {
    if (this.catalog) return this.catalog;
    const cfg = await getLayersConfig();
    const out = [];
    for (const [id, l] of Object.entries(cfg)) {
      if (!l || typeof l !== 'object') continue;
      const type = String(l.type || '').toLowerCase();
      if (!['wmts', 'wms', 'aggregate'].includes(type)) continue;
      if (l.background) continue; // Hintergrundkarten ausgenommen
      const label = String(l.label || id).trim();
      if (!label) continue;
      out.push({ id, label, type });
    }
    out.sort((a, b) => a.label.localeCompare(b.label, 'de'));
    this.catalog = out;
    return out;
  }

  async search(text, limit = 40) {
    const all = await this.list();
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const hits = all.filter((l) => {
      const hay = `${l.label} ${l.id}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    return hits.slice(0, limit);
  }

  isActive(id) { return this.active.some((a) => a.id === id); }

  async add(id, opacity = 0.75) {
    if (this.isActive(id)) return this.active.find((a) => a.id === id);
    const cfg = await getLayersConfig();
    const layers = [];
    for (const leaf of resolveLeaves(cfg, id)) {
      const layer = await this.makeLayer(leaf, opacity);
      if (layer) {
        this.viewer.imageryLayers.add(layer); // zuoberst
        layers.push(layer);
      }
    }
    if (!layers.length) throw new Error('Ebene lässt sich nicht darstellen');
    const entry = { id, label: String(cfg[id]?.label || id), layers, opacity };
    this.active.push(entry);
    this.viewer.scene.requestRender();
    return entry;
  }

  remove(id) {
    const i = this.active.findIndex((a) => a.id === id);
    if (i < 0) return;
    for (const layer of this.active[i].layers) this.viewer.imageryLayers.remove(layer, true);
    this.active.splice(i, 1);
    this.viewer.scene.requestRender();
  }

  setOpacity(id, opacity) {
    const entry = this.active.find((a) => a.id === id);
    if (!entry) return;
    entry.opacity = opacity;
    for (const layer of entry.layers) layer.alpha = opacity;
    this.viewer.scene.requestRender();
  }

  /** Hält die Zusatzebenen oberhalb der Jahrgangs-Ebenen (nach einem Jahrgangswechsel). */
  raiseAll() {
    for (const entry of this.active) {
      for (const layer of entry.layers) this.viewer.imageryLayers.raiseToTop(layer);
    }
  }

  async makeLayer(leaf, opacity) {
    const type = String(leaf.type || '').toLowerCase();
    const wmsLayers = Array.isArray(leaf.wmsLayers) ? leaf.wmsLayers.join(',') : (leaf.wmsLayers || leaf.serverLayerName);
    const wmsUrl = (leaf.wmsUrl || WMS_BASE).replace(/\?.*$/, '');
    if (type === 'wmts' && leaf.serverLayerName) {
      const ts = pickTimestamp(leaf.timestamps);
      const format = leaf.format || 'png';
      if (await this.wmtsHasTile(leaf.serverLayerName, ts, format)) {
        return geoadminWmtsLayer(leaf.serverLayerName, ts, format, opacity);
      }
      if (!wmsLayers) return null;
      return geoadminWmsLayer(wmsUrl, wmsLayers, opacity);
    }
    if (type === 'wms' && wmsLayers) return geoadminWmsLayer(wmsUrl, wmsLayers, opacity);
    return null;
  }

  /** Probe-Anfrage: gibt es unter der Bildmitte eine WMTS-Kachel in EPSG:3857? */
  async wmtsHasTile(layerName, ts, format) {
    const p = groundPointAtCenter(this.viewer) || { lon: 8.2, lat: 46.8 };
    const { x, y, z } = tileIndexFor(p.lon, p.lat, 12);
    const url = wmtsTileUrl(layerName, ts, format)
      .replace('{z}', z).replace('{x}', x).replace('{y}', y);
    try {
      const res = await fetch(url, { method: 'GET', cache: 'force-cache' });
      return res.ok;
    } catch {
      return false;
    }
  }
}

function pickTimestamp(stamps) {
  if (!Array.isArray(stamps) || !stamps.length) return 'current';
  if (stamps.includes('current')) return 'current';
  return String(stamps[0]); // neuester zuerst im Verzeichnis
}

/** Löst Sammel-Ebenen in ihre darstellbaren Unter-Ebenen auf. */
function resolveLeaves(cfg, id, depth = 0) {
  const l = cfg[id];
  if (!l || depth > 3) return [];
  const type = String(l.type || '').toLowerCase();
  if (type === 'aggregate' && Array.isArray(l.subLayersIds)) {
    return l.subLayersIds.flatMap((sub) => resolveLeaves(cfg, sub, depth + 1));
  }
  return [l];
}
