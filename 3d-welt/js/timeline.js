// Zeitreise: SWISSIMAGE-Jahrgänge als Bildebenen über dem Gelände, mit
// Überblendung ohne Flackern. Das Prinzip stammt aus «Zeitreise Luftbilder»:
// Der Ziel-Jahrgang wird oberhalb des bisherigen eingeblendet; der bisherige
// bleibt voll sichtbar, bis der Ziel-Jahrgang geladen ist, und wird dann entfernt.

import { CROSSFADE_MS, SETTLE_TIMEOUT_MS } from './config.js';
import { swissimageLayer, whenTilesLoaded } from './scene.js';

export class Timeline {
  /**
   * @param viewer Cesium-Viewer
   * @param entries Jahrgänge [{ts, year}], aufsteigend
   * @param onChange Rückruf (entry) nach jedem Wechsel
   */
  constructor(viewer, entries, onChange) {
    this.viewer = viewer;
    this.entries = entries;
    this.onChange = onChange;
    this.index = -1;
    this.layers = []; // aktive Jahrgangs-Ebenen, unterste zuerst
    this.current = null;
    this.generation = 0;
  }

  /** Anzahl Jahrgangs-Ebenen, damit Zusatzebenen darüber eingefügt werden können. */
  get baseLayerCount() { return this.layers.length; }

  get entry() { return this.entries[this.index] || null; }

  indexOfYear(year) {
    let best = 0;
    for (let i = 0; i < this.entries.length; i++) {
      if (Math.abs(this.entries[i].year - year) < Math.abs(this.entries[best].year - year)) best = i;
    }
    return best;
  }

  /** Setzt einen Jahrgang (Index). Erster Aufruf ohne Überblendung. */
  async show(index, { animate = true } = {}) {
    index = Math.max(0, Math.min(this.entries.length - 1, index));
    if (index === this.index) return;
    const entry = this.entries[index];
    this.index = index;
    const gen = ++this.generation;

    const first = !this.current;
    const layer = swissimageLayer(entry.ts, first || !animate ? 1 : 0);
    // Direkt oberhalb der bisherigen Jahrgänge, unterhalb der Zusatzebenen.
    this.viewer.imageryLayers.add(layer, this.layers.length);
    this.layers.push(layer);
    const previous = this.current;
    this.current = layer;
    this.onChange?.(entry);

    if (!first && animate) await this.fade(layer, gen);
    if (gen !== this.generation) return; // inzwischen weitergesprungen

    // Alte Jahrgänge erst entfernen, wenn der neue sichtbar geladen ist.
    await whenTilesLoaded(this.viewer, SETTLE_TIMEOUT_MS);
    if (gen !== this.generation) return;
    for (const old of this.layers.splice(0)) {
      if (old !== layer) this.viewer.imageryLayers.remove(old, true);
    }
    this.layers = [layer];
    if (previous && previous !== layer) this.viewer.scene.requestRender();
  }

  fade(layer, gen) {
    return new Promise((resolve) => {
      const start = performance.now();
      const step = () => {
        if (gen !== this.generation) { resolve(); return; }
        const t = Math.min(1, (performance.now() - start) / CROSSFADE_MS);
        layer.alpha = easeInOut(t);
        this.viewer.scene.requestRender();
        if (t < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  step(delta) { return this.show(this.index + delta); }
}

function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2; }
