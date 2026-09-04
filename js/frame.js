// Verschieb- und ziehbarer Rahmen über der Karte. Der Rahmen ist geografisch
// verankert: Beim Verschieben oder Zoomen der Karte bleibt er an derselben Stelle
// am Boden. Vier Eckgriffe ändern die Grösse, Ziehen in der Fläche verschiebt ihn.

const EARTH = 40075016.686;
const MIN_PX = 36;

export class FrameSelector {
  /**
   * @param {maplibregl.Map} map
   * @param {HTMLElement} el   Container (#frame), deckt die Karte ab
   */
  constructor(map, el) {
    this.map = map;
    this.el = el;
    this.box = el.querySelector('.frame-box');
    this.bounds = null;      // {west, south, east, north}
    this.visible = false;
    this.listeners = new Set();
    this._raf = 0;
    map.on('move', () => this.render());
    this._bindPointer();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(this.bounds); }

  /**
   * Quadrat um die Kartenmitte: höchstens `meters` Kantenlänge, aber nie grösser
   * als 60 % der sichtbaren Kartenbreite, damit die Griffe erreichbar bleiben.
   */
  defaultBounds(meters = 160) {
    const center = this.map.getCenter();
    const metersPerCss = (EARTH * Math.cos((center.lat * Math.PI) / 180)) / (512 * 2 ** this.map.getZoom());
    const el = this.map.getContainer();
    const maxPx = Math.min(el.clientWidth, el.clientHeight) * 0.6;
    const half = Math.min(meters / metersPerCss, maxPx) / 2;
    const c = this.map.project(center);
    const tl = this.map.unproject([c.x - half, c.y - half]);
    const br = this.map.unproject([c.x + half, c.y + half]);
    return { west: tl.lng, north: tl.lat, east: br.lng, south: br.lat };
  }

  show(bounds) {
    if (bounds) this.bounds = bounds;
    if (!this.bounds) this.bounds = this.defaultBounds();
    this.visible = true;
    this.el.hidden = false;
    this.render();
  }

  hide() {
    this.visible = false;
    this.el.hidden = true;
  }

  reset(meters = 160) {
    this.bounds = this.defaultBounds(meters);
    this.render();
    this._emit();
  }

  getBounds() { return this.bounds ? { ...this.bounds } : null; }

  /** Bildschirmrechteck des Rahmens (CSS-Pixel relativ zur Karte). */
  rect() {
    const b = this.bounds;
    const p1 = this.map.project([b.west, b.north]);
    const p2 = this.map.project([b.east, b.south]);
    return { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y) };
  }

  render() {
    if (!this.visible || !this.bounds) return;
    const r = this.rect();
    this.box.style.transform = `translate(${r.x}px, ${r.y}px)`;
    this.box.style.width = `${Math.max(1, r.w)}px`;
    this.box.style.height = `${Math.max(1, r.h)}px`;
  }

  _setFromRect(r) {
    const tl = this.map.unproject([r.x, r.y]);
    const br = this.map.unproject([r.x + r.w, r.y + r.h]);
    this.bounds = { west: tl.lng, north: tl.lat, east: br.lng, south: br.lat };
    this.render();
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this._emit());
  }

  _bindPointer() {
    let drag = null;
    const onMove = (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      const s = drag.start;
      let r;
      if (drag.mode === 'move') {
        r = { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h };
      } else {
        let x0 = s.x, y0 = s.y, x1 = s.x + s.w, y1 = s.y + s.h;
        if (drag.mode.includes('w')) x0 = Math.min(x1 - MIN_PX, x0 + dx);
        if (drag.mode.includes('e')) x1 = Math.max(x0 + MIN_PX, x1 + dx);
        if (drag.mode.includes('n')) y0 = Math.min(y1 - MIN_PX, y0 + dy);
        if (drag.mode.includes('s')) y1 = Math.max(y0 + MIN_PX, y1 + dy);
        r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      this._setFromRect(r);
      ev.preventDefault();
    };
    const onUp = (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      drag = null;
      this.map.dragPan.enable();
      this.box.classList.remove('is-dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    this.box.addEventListener('pointerdown', (ev) => {
      if (drag || !this.visible) return;
      const mode = ev.target.dataset.handle || 'move';
      drag = { id: ev.pointerId, mode, sx: ev.clientX, sy: ev.clientY, start: this.rect() };
      this.map.dragPan.disable();
      this.box.classList.add('is-dragging');
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      ev.preventDefault();
      ev.stopPropagation();
    });
  }
}
