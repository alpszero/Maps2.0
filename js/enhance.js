// Bildaufbereitung im Browser: Kacheln eines Ausschnitts zusammensetzen,
// mit dem kompakten Real-ESRGAN 2-fach hochrechnen und veredeln.
//
//  1. Die Kacheln werden auf der höchsten sinnvollen SWISSIMAGE-Stufe (EPSG:3857,
//     bis Stufe 20, ≈10 cm) geladen und zu einem Quellbild zusammengesetzt.
//  2. Real-ESRGAN kompakt («realesr-general-x4v3», SRVGGNetCompact) rechnet
//     patchweise mit Überlappung 4-fach; das 2-fach-Ergebnis entsteht durch
//     Mittelung. Die Glättung mischt die Gewichte des normalen und des
//     rauschunterdrückenden Modells linear (wie denoise_strength im Original).
//  3. Veredelung: Tonwerte strecken, Farben kräftigen, sanft nachschärfen.

import { SWISSIMAGE_LAYER, NATIVE_TILE_ZOOM } from './config.js';
import { wmtsTileUrl } from './geoadmin.js';

const MIN_FETCH_ZOOM = 14;
const TILE = 256;
const EARTH = 40075016.686;

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

/**
 * Lädt die Kacheln des Ausschnitts und setzt sie zu einem Quellbild zusammen.
 * Fällt auf die nächsttiefere Stufe zurück, wenn dort keine Kacheln existieren.
 */
export async function captureSource({ bounds, fetchZoom, timestamp, onProgress, signal }) {
  let zoom = fetchZoom;
  for (;;) {
    const result = await stitch({ bounds, zoom, timestamp, onProgress, signal });
    if (result.failed < result.total || zoom <= MIN_FETCH_ZOOM) return { ...result, zoom };
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
      onProgress?.(done / tiles.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, tiles.length) }, worker));
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
    onStatus?.('KI-Bibliothek wird geladen …');
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

export function backendLabel() {
  const b = window.tf?.getBackend?.();
  return b === 'webgpu' ? 'WebGPU' : b === 'webgl' ? 'WebGL' : b === 'cpu' ? 'Prozessor' : '';
}

/** Grössere Rechenkacheln auf Geräten mit viel Grafikspeicher. */
function patchSize(base) {
  const mobile = (navigator.maxTouchPoints || 0) > 1 && Math.min(screen.width, screen.height) < 900;
  return mobile ? base : base * 2;
}

/** Bildschirm während der Berechnung wach halten (wo der Browser es erlaubt). */
export async function keepAwake() {
  try { return await navigator.wakeLock?.request('screen'); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Kachelschleife: Quelle spiegelnd auffüllen, in gleich grossen Stücken rechnen,
// Ränder abschneiden, auf den Zielfaktor mitteln, ins Ergebnis schreiben.
// forward(x): x [1,h,w,3] 0–1 → [1,h·netScale,w·netScale,3] 0–1

async function runTiled(tf, source, { patch, pad, netScale, factor, forward, onProgress, onStatus, signal }) {
  const W = source.width, H = source.height;
  const down = netScale / factor;
  const out = document.createElement('canvas');
  out.width = W * factor;
  out.height = H * factor;
  const ctx = out.getContext('2d');
  const cols = Math.ceil(W / patch), rows = Math.ceil(H / patch);
  const padded = tf.tidy(() => {
    const img = tf.browser.fromPixels(source).toFloat().div(255);
    const padW = cols * patch - W, padH = rows * patch - H;
    const paddings = [[pad, pad + padH], [pad, pad + padW], [0, 0]];
    const mirrorOk = pad + padH <= H && pad + padW <= W;
    return mirrorOk ? tf.mirrorPad(img, paddings, 'symmetric') : tf.pad(img, paddings, 0);
  });
  const size = patch + 2 * pad;
  const total = rows * cols;
  let n = 0;
  const t0 = performance.now();
  try {
    for (let py = 0; py < rows; py++) {
      for (let px = 0; px < cols; px++) {
        if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
        const pixels = tf.tidy(() => {
          const x = padded.slice([py * patch, px * patch, 0], [size, size, 3]).expandDims(0);
          const pred = forward(x);
          let crop = pred.slice([0, pad * netScale, pad * netScale, 0], [1, patch * netScale, patch * netScale, 3]);
          if (down > 1) crop = tf.avgPool(crop, down, down, 'valid');
          return crop.squeeze([0]).clipByValue(0, 1).mul(255).round().toInt();
        });
        const data = await tf.browser.toPixels(pixels);
        pixels.dispose();
        ctx.putImageData(new ImageData(data, patch * factor, patch * factor), px * patch * factor, py * patch * factor);
        n++;
        const remaining = ((performance.now() - t0) / n) * (total - n) / 1000;
        onProgress?.(n / total);
        onStatus?.(`Schärfe mit KI … ${n} / ${total}${remaining > 2 ? `, noch etwa ${formatSeconds(remaining)}` : ''}`);
        await tf.nextFrame();
      }
    }
  } finally {
    padded.dispose();
  }
  return out;
}

function formatSeconds(s) {
  return s >= 90 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`;
}

// ---------------------------------------------------------------------------
// Real-ESRGAN kompakt (SRVGGNetCompact «realesr-general-x4v3»)
//
// 33 Faltungen à 64 Kanäle mit PReLU auf der Eingangsauflösung, zum Schluss
// Pixel-Shuffle (depthToSpace) auf 4×, plus das 4-fach vergrösserte Original.

let resrFiles = null;   // {manifest, general, wdn}
let resrNet = null;     // {denoise, scale, layers:[{type, w, b, a}]}

async function loadRealesrganFiles(onStatus) {
  if (!resrFiles) {
    onStatus?.('KI-Modell wird geladen (9.7 MB) …');
    resrFiles = Promise.all([
      fetch('vendor/realesrgan/manifest.json').then((r) => r.json()),
      fetch('vendor/realesrgan/general.bin').then((r) => r.arrayBuffer()),
      fetch('vendor/realesrgan/wdn.bin').then((r) => r.arrayBuffer()),
    ]).then(([manifest, g, w]) => ({ manifest, general: new Float32Array(g), wdn: new Float32Array(w) }))
      .catch((err) => { resrFiles = null; throw err; });
  }
  return resrFiles;
}

function buildRealesrgan(tf, files, denoise) {
  const { manifest, general, wdn } = files;
  const s = Math.max(0, Math.min(1, denoise));
  const mixed = new Float32Array(general.length);
  for (let i = 0; i < mixed.length; i++) mixed[i] = (1 - s) * general[i] + s * wdn[i];
  const take = ({ offset, shape }) => tf.tensor(mixed.subarray(offset, offset + shape.reduce((a, b) => a * b, 1)), shape);
  const layers = manifest.layers.map((l) => (l.type === 'conv'
    ? { type: 'conv', w: take(l.w), b: take(l.b) }
    : { type: 'prelu', a: take(l.a) }));
  return { denoise: s, scale: manifest.scale, layers };
}

function disposeRealesrgan(net) {
  for (const l of net.layers) for (const k of ['w', 'b', 'a']) l[k]?.dispose();
}

/** Vorwärtsrechnung: x [1,h,w,3] im Bereich 0–1 → [1,4h,4w,3] */
function realesrganForward(tf, net, x) {
  return tf.tidy(() => {
    let out = x;
    for (const l of net.layers) {
      out = l.type === 'conv' ? tf.conv2d(out, l.w, 1, 'same').add(l.b) : tf.prelu(out, l.a);
    }
    out = tf.depthToSpace(out, net.scale);
    const base = tf.image.resizeNearestNeighbor(x, [x.shape[1] * net.scale, x.shape[2] * net.scale]);
    return out.add(base);
  });
}

async function getRealesrgan(tf, denoise, onStatus) {
  const files = await loadRealesrganFiles(onStatus);
  if (!resrNet || Math.abs(resrNet.denoise - denoise) > 1e-6) {
    if (resrNet) disposeRealesrgan(resrNet);
    resrNet = buildRealesrgan(tf, files, denoise);
  }
  return resrNet;
}

/** Vergrössert eine Leinwand mit Real-ESRGAN kompakt (Faktor 2 oder 4). */
export async function realesrganUpscale(source, { factor = 2, denoise = 0.5, onProgress, onStatus, signal } = {}) {
  await ensureBackend(onStatus);
  const tf = window.tf;
  const net = await getRealesrgan(tf, denoise, onStatus);
  onStatus?.(`Schärfe mit KI (${backendLabel()}) …`);
  return runTiled(tf, source, {
    patch: patchSize(96), pad: 12, netScale: net.scale, factor,
    forward: (x) => realesrganForward(tf, net, x),
    onProgress, onStatus, signal,
  });
}

// ---------------------------------------------------------------------------
// Veredelung: Tonwerte strecken, Farben kräftigen, sanft nachschärfen.
//
// Die Tonwertgrenzen werden einmal aus dem ganzen Bild bestimmt, damit alle
// Kacheln gleich behandelt werden. Die Rechnung läuft kachelweise.

const POLISH_TILE = 512;
const POLISH_PAD = 8;

export async function polishCanvas(canvas, { onProgress, onStatus, signal, strength = 1 } = {}) {
  await ensureBackend(onStatus);
  const tf = window.tf;
  onStatus?.('Veredle Farben und Schärfe …');
  const { lo, hi } = tonalRange(canvas);
  const W = canvas.width, H = canvas.height;
  const src = canvas.getContext('2d', { willReadFrequently: true });
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d');
  const kernel = tf.tidy(() => {
    // 5×5-Gauss (σ ≈ 1.1), je Kanal gleich, für die Unschärfemaske
    const g = [0.0561, 0.1353, 0.1353 * 1.36, 0.1353, 0.0561];
    const k = [];
    let sum = 0;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { const v = g[i] * g[j]; k.push(v); sum += v; }
    const values = [];
    for (const v of k) for (let c = 0; c < 3; c++) values.push(v / sum);
    return tf.tensor4d(values, [5, 5, 3, 1]);
  });
  const sat = 1 + 0.22 * strength;
  const sharpen = 0.55 * strength;
  const contrast = 1 + 0.06 * strength;
  const cols = Math.ceil(W / POLISH_TILE), rows = Math.ceil(H / POLISH_TILE);
  let n = 0;
  try {
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
        const x0 = Math.max(0, tx * POLISH_TILE - POLISH_PAD), y0 = Math.max(0, ty * POLISH_TILE - POLISH_PAD);
        const x1 = Math.min(W, (tx + 1) * POLISH_TILE + POLISH_PAD), y1 = Math.min(H, (ty + 1) * POLISH_TILE + POLISH_PAD);
        const img = src.getImageData(x0, y0, x1 - x0, y1 - y0);
        const pixels = tf.tidy(() => {
          let t = tf.browser.fromPixels(img).toFloat().div(255);
          t = t.sub(lo).div(Math.max(0.2, hi - lo)).clipByValue(0, 1);
          t = t.sub(0.5).mul(contrast).add(0.5);
          const lum = t.mul(tf.tensor1d([0.299, 0.587, 0.114])).sum(-1, true);
          t = lum.add(t.sub(lum).mul(sat));
          const blur = tf.depthwiseConv2d(t.expandDims(0), kernel, 1, 'same').squeeze([0]);
          t = t.add(t.sub(blur).mul(sharpen));
          const cx = tx * POLISH_TILE - x0, cy = ty * POLISH_TILE - y0;
          const cw = Math.min(POLISH_TILE, W - tx * POLISH_TILE), ch = Math.min(POLISH_TILE, H - ty * POLISH_TILE);
          return t.slice([cy, cx, 0], [ch, cw, 3]).clipByValue(0, 1).mul(255).round().toInt();
        });
        const data = await tf.browser.toPixels(pixels);
        const [ch, cw] = pixels.shape;
        pixels.dispose();
        octx.putImageData(new ImageData(data, cw, ch), tx * POLISH_TILE, ty * POLISH_TILE);
        n++;
        onProgress?.(n / (rows * cols));
        await tf.nextFrame();
      }
    }
  } finally {
    kernel.dispose();
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

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.93) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht erzeugt werden'))), type, quality);
  });
}

export function formatMeters(m) {
  return m >= 1 ? `${m.toFixed(m < 10 ? 1 : 0)} m` : `${Math.round(m * 100)} cm`;
}

// Für Tests: direkter Zugriff auf die Vorwärtsrechnung.
if (typeof window !== 'undefined') {
  window.__enhanceDebug = {
    async realesrganForward(data, h, w, denoise) {
      await ensureBackend();
      const tf = window.tf;
      const net = await getRealesrgan(tf, denoise);
      const x = tf.tensor4d(data, [1, h, w, 3]);
      const y = realesrganForward(tf, net, x);
      const res = Array.from(await y.data());
      x.dispose(); y.dispose();
      return res;
    },
  };
}
