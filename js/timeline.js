// Verwaltung der Jahrgänge: ein Raster-Layer pro Jahrgang, weiche Überblendung
// ohne Flackern und Vorladen der benachbarten Jahrgänge.
//
// Prinzip der Überblendung:
//  - Der Ziel-Jahrgang wird zuoberst im Jahrgangs-Stapel platziert und von 0 auf 1
//    eingeblendet. Der bisherige Jahrgang bleibt darunter voll sichtbar, bis die
//    Überblendung fertig ist und die Kacheln des Ziels geladen sind. Erst dann wird
//    er (ohne Animation) ausgeblendet. So gibt es keinen Helligkeitseinbruch und
//    keine leeren Flächen während des Wechsels.
//  - Jahrgänge im Umkreis von PRELOAD_RADIUS bleiben mit Deckkraft 0 sichtbar, damit
//    ihre Kacheln bereits geladen sind, wenn der Regler dorthin bewegt wird.

import {
  SWISS_BOUNDS, PRELOAD_RADIUS, CROSSFADE_MS, SETTLE_TIMEOUT_MS, MAX_ZOOM, ATTRIBUTION,
} from './config.js';
import { swissimageTileUrl } from './geoadmin.js';

export const OVERLAY_ANCHOR = 'overlays-anchor';

export class Timeline {
  /**
   * @param {maplibregl.Map} map
   * @param {{ts:string, year:number}[]} entries aufsteigend sortiert
   */
  constructor(map, entries) {
    this.map = map;
    this.entries = entries;
    this.index = entries.length - 1;
    this.pending = new Set(); // Layer, die noch sichtbar unter dem aktuellen liegen
    this.settleToken = 0;
    this.preloadToken = 0;
    this.moving = false; // während Pan/Zoom lädt nur der aktuelle Jahrgang
    this.listeners = new Set();
    this._install();
    // Vorladen erst, wenn die Karte ruht und der aktuelle Jahrgang geladen ist:
    // so stehen dessen Kacheln in der Warteschlange immer zuvorderst.
    map.on('movestart', () => { this.moving = true; this._updateWindow(); });
    map.on('moveend', () => { this.moving = false; this._schedulePreload(); });
  }

  layerId(i) { return `si-${this.entries[i].ts}`; }
  sourceId(i) { return `si-src-${this.entries[i].ts}`; }

  get current() { return this.entries[this.index]; }
  get length() { return this.entries.length; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  _install() {
    const map = this.map;
    if (!map.getLayer(OVERLAY_ANCHOR)) {
      map.addSource(OVERLAY_ANCHOR, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: OVERLAY_ANCHOR, type: 'line', source: OVERLAY_ANCHOR });
    }
    this.entries.forEach((e, i) => {
      map.addSource(this.sourceId(i), {
        type: 'raster',
        tiles: [swissimageTileUrl(e.ts)],
        tileSize: 256,
        minzoom: 0,
        maxzoom: MAX_ZOOM,
        bounds: SWISS_BOUNDS,
        attribution: ATTRIBUTION,
      });
      map.addLayer({
        id: this.layerId(i),
        type: 'raster',
        source: this.sourceId(i),
        layout: { visibility: 'none' },
        paint: {
          'raster-opacity': i === this.index ? 1 : 0,
          'raster-opacity-transition': { duration: 0, delay: 0 },
          'raster-fade-duration': 0,
        },
      }, OVERLAY_ANCHOR);
    });
    this._updateWindow();
  }

  /** Sichtbarkeitsfenster fürs Vorladen: aktueller Index ± PRELOAD_RADIUS. */
  _updateWindow() {
    const map = this.map;
    for (let i = 0; i < this.entries.length; i++) {
      const id = this.layerId(i);
      const inWindow = !this.moving && Math.abs(i - this.index) <= PRELOAD_RADIUS;
      const keep = i === this.index || inWindow || this.pending.has(id);
      const want = keep ? 'visible' : 'none';
      if (map.getLayoutProperty(id, 'visibility') !== want) {
        map.setLayoutProperty(id, 'visibility', want);
      }
    }
  }

  /** Aktuellen Jahrgang setzen (Index in entries). */
  show(i) {
    i = Math.max(0, Math.min(this.entries.length - 1, i));
    if (i === this.index) return;
    const map = this.map;
    const prevId = this.layerId(this.index);
    const nextId = this.layerId(i);
    this.index = i;

    // Der bisherige Jahrgang bleibt vorerst sichtbar (unter dem neuen).
    this.pending.add(prevId);
    this.pending.delete(nextId);
    this._updateWindow();

    map.moveLayer(nextId, OVERLAY_ANCHOR); // zuoberst im Jahrgangs-Stapel
    map.setPaintProperty(nextId, 'raster-opacity-transition', { duration: CROSSFADE_MS, delay: 0 });
    map.setPaintProperty(nextId, 'raster-opacity', 1);

    this._settle(nextId);
    for (const fn of this.listeners) fn(this.current, this.index);
  }

  /** Nach Abschluss der Überblendung alte Jahrgänge ausblenden. */
  async _settle(nextId) {
    const token = ++this.settleToken;
    const srcId = this.sourceId(this.index);
    await Promise.all([
      sleep(CROSSFADE_MS + 40),
      waitSourceLoaded(this.map, srcId, SETTLE_TIMEOUT_MS),
    ]);
    if (token !== this.settleToken) return; // inzwischen erneut gewechselt
    for (const id of this.pending) {
      if (id === nextId) continue;
      this.map.setPaintProperty(id, 'raster-opacity-transition', { duration: 0, delay: 0 });
      this.map.setPaintProperty(id, 'raster-opacity', 0);
    }
    this.pending.clear();
    this._updateWindow();
  }

  async _schedulePreload() {
    const token = ++this.preloadToken;
    await waitSourceLoaded(this.map, this.sourceId(this.index), 1500);
    if (token !== this.preloadToken || this.moving) return;
    this._updateWindow();
  }

  next() { this.show(this.index + 1); }
  prev() { this.show(this.index - 1); }

  indexOfYear(year) { return this.entries.findIndex((e) => e.year === year); }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function waitSourceLoaded(map, sourceId, timeoutMs) {
  return new Promise((resolve) => {
    if (safeIsLoaded(map, sourceId)) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      map.off('sourcedata', onData);
      map.off('idle', onData);
      clearTimeout(timer);
      resolve();
    };
    const onData = () => { if (safeIsLoaded(map, sourceId)) finish(); };
    const timer = setTimeout(finish, timeoutMs);
    map.on('sourcedata', onData);
    map.on('idle', onData);
  });
}

function safeIsLoaded(map, sourceId) {
  try { return map.isSourceLoaded(sourceId); } catch { return true; }
}
