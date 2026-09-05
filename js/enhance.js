// Bildaufbereitung im Browser: Kacheln eines Ausschnitts in voller Auflösung
// zusammensetzen und mit einem Foto-Filter für Luftaufnahmen veredeln.
//
//  1. Die Kacheln werden auf der höchsten verfügbaren SWISSIMAGE-Stufe
//     (EPSG:3857, Stufe 20, ≈10 cm) geladen und zu einem Bild zusammengesetzt;
//     die Leinwandgrenze des Browsers begrenzt die Grösse (4096 bis 10 240 px).
//  2. Der Filter (TensorFlow.js auf der Grafikeinheit, kachelweise): Dunst
//     entfernen durch Tonwertstreckung, mildes Kontrast-S, kräftigere Farben,
//     leichte Wärme, Klarheit (lokaler Kontrast), sanfte Schärfung und eine
//     dezente Vignette für den Insta-Look.

import { SWISSIMAGE_LAYER, NATIVE_TILE_ZOOM } from './config.js';
import { wmtsTileUrl } from './geoadmin.js';

const MIN_FETCH_ZOOM = 14;
const TILE = 256;
const EARTH = 40075016.686;

// ---------------------------------------------------------------------------
// Leinwandgrenze

/**
 * Grösste Leinwandkante, die dieser Browser verarbeiten kann. Wird einmal
 * gemessen (Leinwand anlegen, Pixel schreiben und zurücklesen), weil die Grenze
 * je nach Gerät zwischen 4096 und 16384 Pixeln liegt.
 */
let maxEdgePromise = null;
export function maxCanvasEdge() {
  if (!maxEdgePromise) {
    maxEdgePromise = (async () => {
      const mobile = (navigator.maxTouchPoints || 0) > 1 && Math.min(screen.width, screen.height) < 900;
      const candidates = mobile ? [4096, 6144, 8192] : [4096, 8192, 10240];
      let ok = 4096;
      for (const edge of candidates) {
        await new Promise((r) => setTimeout(r, 0));
        if (!canvasWorks(edge)) break;
        ok = edge;
      }
      return ok;
    })();
  }
  return maxEdgePromise;
}

function canvasWorks(edge) {
  try {
    const c = document.createElement('canvas');
    c.width = edge; c.height = edge;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    ctx.fillStyle = '#7b3';
    ctx.fillRect(edge - 2, edge - 2, 2, 2);
    const p = ctx.getImageData(edge - 1, edge - 1, 1, 1).data;
    c.width = 1; c.height = 1; // Speicher freigeben
    return p[3] === 255 && p[1] > 100;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Ausschnitt

/** Grösse des Ausschnitts in Weltpixeln auf einer Kachelstufe. */
export function worldSize(bounds, zoom) {
  const [x0, y0] = lngLatToWorldPx(bounds.west, bounds.north, zoom);
  const [x1, y1] = lngLatToWorldPx(bounds.east, bounds.south, zoom);
  return [Math.abs(x1 - x0), Math.abs(y1 - y0)];
}

/** Bodenauflösung (m je Kachelpixel) auf einer Stufe für eine Breite. */
export function metersPerPixel(lat, zoom) {
  return (EARTH * Math.cos((lat * Math.PI) / 180)) / (TILE * 2 ** zoom);
}

/**
 * Kachelstufe für einen Ausschnitt: beginnt bei `startZoom` (Vorgabe: native
 * Stufe) und geht so weit zurück, dass die längste Kante höchstens `maxEdge`
 * Pixel misst (nie unter MIN_FETCH_ZOOM).
 */
export function pickFetchZoom(bounds, maxEdge, startZoom = NATIVE_TILE_ZOOM) {
  let zoom = Math.max(MIN_FETCH_ZOOM, Math.min(NATIVE_TILE_ZOOM, Math.floor(startZoom)));
  let [w, h] = worldSize(bounds, zoom);
  while (Math.max(w, h) > maxEdge && zoom > MIN_FETCH_ZOOM) { zoom--; [w, h] = worldSize(bounds, zoom); }
  return zoom;
}

/** Beschreibt einen Ausschnitt: Bodenmasse und Quellpixel auf einer Stufe. */
export function describeBounds(bounds, zoom = NATIVE_TILE_ZOOM) {
  const lat = (bounds.north + bounds.south) / 2;
  const mpp = metersPerPixel(lat, zoom);
  const [w, h] = worldSize(bounds, zoom);
  const srcW = Math.max(1, Math.round(w)), srcH = Math.max(1, Math.round(h));
  return { srcW, srcH, metersPerPx: mpp, widthM: srcW * mpp, heightM: srcH * mpp, fetchZoom: zoom };
}

function lngLatToWorldPx(lng, lat, zoom) {
  const n = TILE * 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return [x, y];
}

/** Anzahl Kacheln, die ein Ausschnitt auf einer Stufe umfasst. */
export function tileCount(bounds, zoom) {
  const [x0, y0] = lngLatToWorldPx(bounds.west, bounds.north, zoom);
  const [x1, y1] = lngLatToWorldPx(bounds.east, bounds.south, zoom);
  const cols = Math.floor((x1 - 1) / TILE) - Math.floor(x0 / TILE) + 1;
  const rows = Math.floor((y1 - 1) / TILE) - Math.floor(y0 / TILE) + 1;
  return Math.max(1, cols) * Math.max(1, rows);
}

/**
 * Lädt die Kacheln des Ausschnitts und setzt sie zu einem Bild zusammen.
 * Fällt auf die nächsttiefere Stufe zurück, wenn dort keine Kacheln existieren.
 */
export async function captureSource({ bounds, fetchZoom, timestamp, onProgress, signal }) {
  let zoom = fetchZoom;
  for (;;) {
    const result = await stitch({ bounds, zoom, timestamp, onProgress, signal });
    if (result.failed < result.total || zoom <= MIN_FETCH_ZOOM) return { ...result, zoom };
    result.canvas.width = 0; result.canvas.height = 0;
    zoom -= 1; // an dieser Stelle gibt es auf dieser Stufe kein Bild
  }
}

async function stitch({ bounds, zoom, timestamp, onProgress, signal }) {
  const [x0, y0] = lngLatToWorldPx(bounds.west, bounds.north, zoom);
  const [x1, y1] = lngLatToWorldPx(bounds.east, bounds.south, zoom);
  const width = Math.max(1, Math.round(x1 - x0));
  const height = Math.max(1, Math.round(y1 - y0));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  const template = wmtsTileUrl(SWISSIMAGE_LAYER, timestamp, 'jpeg');
  const tiles = [];
  for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y1 - 1) / TILE); ty++) {
    for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x1 - 1) / TILE); tx++) tiles.push([tx, ty]);
  }
  let done = 0, failed = 0;
  const queue = tiles.slice();
  const worker = async () => {
    while (queue.length) {
      const [tx, ty] = queue.shift();
      const url = template.replace('{z}', zoom).replace('{x}', tx).replace('{y}', ty);
      try {
        const res = await fetch(url, { mode: 'cors', signal });
        if (!res.ok) throw new Error(String(res.status));
        const bmp = await createImageBitmap(await res.blob());
        ctx.drawImage(bmp, Math.round(tx * TILE - x0), Math.round(ty * TILE - y0));
        bmp.close?.();
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        failed++;
      }
      done++;
      onProgress?.(done / tiles.length, done, tiles.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, tiles.length) }, worker));
  return { canvas, total: tiles.length, failed };
}

// ---------------------------------------------------------------------------
// TensorFlow.js erst bei Bedarf laden (1.5 MB).

const scripts = new Map();
function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scripts.delete(src); reject(new Error(`Bibliothek konnte nicht geladen werden: ${src}`)); };
      document.head.appendChild(s);
    }));
  }
  return scripts.get(src);
}

let backendReady = null;

/** Rechen-Backend: WebGPU, sonst WebGL, sonst Prozessor. Einmal je Sitzung. */
export async function ensureBackend(onStatus) {
  if (!window.tf) {
    onStatus?.('Filter-Bibliothek wird geladen …');
    await loadScript('vendor/tfjs/tf.min.js');
  }
  const tf = window.tf;
  if (!backendReady) {
    backendReady = (async () => {
      if (navigator.gpu) {
        try {
          await loadScript('vendor/tfjs/tf-backend-webgpu.min.js');
          if (await tf.setBackend('webgpu')) { await tf.ready(); return tf.getBackend(); }
        } catch (err) { console.warn('WebGPU nicht nutzbar, weiche auf WebGL aus.', err); }
      }
      try {
        await tf.setBackend('webgl');
        await tf.ready();
      } catch {
        onStatus?.('Grafikbeschleunigung nicht verfügbar, rechne auf dem Prozessor (langsam) …');
        await tf.setBackend('cpu');
        await tf.ready();
      }
      return tf.getBackend();
    })();
  }
  return backendReady;
}

/** Bildschirm während der Berechnung wach halten (wo der Browser es erlaubt). */
export async function keepAwake() {
  try { return await navigator.wakeLock?.request('screen'); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Foto-Filter für Luftaufnahmen mit Insta-Look
//
// Die Tonwertgrenzen werden einmal aus dem ganzen Bild bestimmt, damit alle
// Kacheln gleich behandelt werden. Die Rechnung läuft kachelweise (512 px mit
// Rand), damit auch sehr grosse Bilder in den Grafikspeicher passen.

const POLISH_TILE = 512;
const POLISH_PAD = 12;

export const FILTER_DEFAULTS = {
  contrast: 0.08,   // mildes Kontrast-S
  saturation: 0.28, // Farben kräftigen
  warmth: 0.035,    // leichte Wärme (Rot +, Blau −)
  clarity: 0.22,    // lokaler Kontrast (Unschärfemaske mit grossem Radius)
  sharpen: 0.5,     // feine Schärfung
  vignette: 0.16,   // Abdunkeln zu den Ecken
};

/** Gauss-Kern [k, k, 3, 1] für tf.depthwiseConv2d. */
function gaussKernel(tf, size, sigma) {
  const half = (size - 1) / 2;
  const g = [];
  let s = 0;
  for (let i = 0; i < size; i++) { const v = Math.exp(-((i - half) ** 2) / (2 * sigma * sigma)); g.push(v); s += v; }
  const values = [];
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) { const v = (g[i] / s) * (g[j] / s); for (let c = 0; c < 3; c++) values.push(v); }
  return tf.tensor4d(values, [size, size, 3, 1]);
}

export async function polishCanvas(canvas, { onProgress, onStatus, signal, params = FILTER_DEFAULTS } = {}) {
  await ensureBackend(onStatus);
  const tf = window.tf;
  onStatus?.('Filter: Dunst, Farben, Klarheit, Schärfe, Vignette …');
  const { lo, hi } = tonalRange(canvas);
  const W = canvas.width, H = canvas.height;
  const src = canvas.getContext('2d', { willReadFrequently: true });
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d');
  const fine = gaussKernel(tf, 5, 1.1);
  const coarse = gaussKernel(tf, 11, 3.2);
  const warm = tf.tensor1d([1 + params.warmth, 1, 1 - params.warmth]);
  const lumW = tf.tensor1d([0.299, 0.587, 0.114]);
  const contrast = 1 + params.contrast;
  const sat = 1 + params.saturation;
  const cols = Math.ceil(W / POLISH_TILE), rows = Math.ceil(H / POLISH_TILE);
  const halfDiag = Math.hypot(W, H) / 2;
  let n = 0;
  try {
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
        const x0 = Math.max(0, tx * POLISH_TILE - POLISH_PAD), y0 = Math.max(0, ty * POLISH_TILE - POLISH_PAD);
        const x1 = Math.min(W, (tx + 1) * POLISH_TILE + POLISH_PAD), y1 = Math.min(H, (ty + 1) * POLISH_TILE + POLISH_PAD);
        const img = src.getImageData(x0, y0, x1 - x0, y1 - y0);
        const cx = tx * POLISH_TILE - x0, cy = ty * POLISH_TILE - y0;
        const cw = Math.min(POLISH_TILE, W - tx * POLISH_TILE), ch = Math.min(POLISH_TILE, H - ty * POLISH_TILE);
        const pixels = tf.tidy(() => {
          let t = tf.browser.fromPixels(img).toFloat().div(255);
          // Dunst entfernen: Tonwerte strecken, mildes Kontrast-S
          t = t.sub(lo).div(Math.max(0.2, hi - lo)).clipByValue(0, 1);
          t = t.sub(0.5).mul(contrast).add(0.5);
          // Farben kräftigen (über die Helligkeit), leichte Wärme
          const lum = t.mul(lumW).sum(-1, true);
          t = lum.add(t.sub(lum).mul(sat)).mul(warm);
          // Klarheit (grosser Radius) und feine Schärfung (kleiner Radius)
          const t4 = t.expandDims(0);
          const blurC = tf.depthwiseConv2d(t4, coarse, 1, 'same').squeeze([0]);
          const blurF = tf.depthwiseConv2d(t4, fine, 1, 'same').squeeze([0]);
          t = t.add(t.sub(blurC).mul(params.clarity)).add(t.sub(blurF).mul(params.sharpen));
          // Auf den Kern der Kachel zuschneiden
          t = t.slice([cy, cx, 0], [ch, cw, 3]);
          // Vignette: Abstand zur Bildmitte, normiert auf die halbe Diagonale
          if (params.vignette > 0) {
            const xs = tf.linspace(tx * POLISH_TILE - W / 2 + 0.5, tx * POLISH_TILE + cw - W / 2 - 0.5, cw).div(halfDiag).square().reshape([1, cw, 1]);
            const ys = tf.linspace(ty * POLISH_TILE - H / 2 + 0.5, ty * POLISH_TILE + ch - H / 2 - 0.5, ch).div(halfDiag).square().reshape([ch, 1, 1]);
            const r2 = xs.add(ys); // 0 in der Mitte, 1 in den Ecken
            const factor = tf.scalar(1).sub(r2.mul(r2).mul(params.vignette));
            t = t.mul(factor);
          }
          return t.clipByValue(0, 1).mul(255).round().toInt();
        });
        const data = await tf.browser.toPixels(pixels);
        pixels.dispose();
        octx.putImageData(new ImageData(data, cw, ch), tx * POLISH_TILE, ty * POLISH_TILE);
        n++;
        onProgress?.(n / (rows * cols));
        await tf.nextFrame();
      }
    }
  } finally {
    fine.dispose(); coarse.dispose(); warm.dispose(); lumW.dispose();
  }
  return out;
}

/** Helligkeitsgrenzen (0.5 % / 99.5 %) aus einer verkleinerten Kopie, sanft angewandt. */
function tonalRange(canvas) {
  const s = Math.min(1, 512 / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * s)), h = Math.max(1, Math.round(canvas.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const hist = new Uint32Array(256);
  let count = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0) continue; // fehlende Kacheln ignorieren
    hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
    count++;
  }
  if (!count) return { lo: 0, hi: 1 };
  const pick = (q) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= q * count) return v / 255; } return 1; };
  const lo = Math.min(pick(0.005), 0.15) * 0.7;
  const hi = 1 - (1 - Math.max(pick(0.995), 0.85)) * 0.7;
  return { lo, hi };
}

// ---------------------------------------------------------------------------
// Export

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht erzeugt werden'))), type, quality);
  });
}

/** Verkleinerte Kopie (längste Kante `edge`), z. B. für die Vorschau. */
export function scaledCopy(canvas, edge) {
  const s = Math.min(1, edge / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * s));
  c.height = Math.max(1, Math.round(canvas.height * s));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

export function formatMeters(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
  return m >= 1 ? `${m.toFixed(m < 10 ? 1 : 0)} m` : `${Math.round(m * 100)} cm`;
}
