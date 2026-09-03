// Hochskalieren eines Luftbild-Ausschnitts direkt im Browser.
//
// Ablauf:
//  1. Ein quadratischer Rahmen liegt über der Karte. Der Nutzer verschiebt und
//     zoomt die Karte darunter. Aus dem Rahmen wird der Ausschnitt in Kachel-
//     pixeln der höchsten SWISSIMAGE-Stufe (EPSG:3857, Stufe 20, ≈10 cm) berechnet.
//  2. Die Kacheln werden geladen und in eine Leinwand gesetzt (Quellbild).
//  3. Das Quellbild wird mit der gewählten Methode vergrössert:
//     - KI (ESRGAN, TensorFlow.js, patchweise mit Überlappung),
//     - Lanczos (pica), bikubisch (Browser) oder Pixelwiederholung.
//  4. Vorher/Nachher-Vergleich, Herunterladen oder im Browser öffnen.

import { SWISSIMAGE_LAYER } from './config.js';
import { wmtsTileUrl } from './geoadmin.js';

const NATIVE_TILE_ZOOM = 20;   // höchste Kachelstufe der SWISSIMAGE in EPSG:3857
const MIN_FETCH_ZOOM = 14;
const MAX_SOURCE_PX = 1024;    // Kantenlänge des Quellbilds (Pixel), Obergrenze
const TILE = 256;
const PATCH = 64;              // Quellpixel je KI-Durchgang
const PAD = 8;                 // Überlappung, damit keine Nähte entstehen
const EARTH = 40075016.686;

export const METHODS = [
  { key: 'x4plus', label: 'KI · Real-ESRGAN x4plus', kind: 'x4plus',
    note: 'Das grosse Modell (17 Mio. Parameter, 34 MB einmaliger Download). Klare Kanten und Markierungen, kaum Rauschen. Braucht auf dem Handy etwa eine Minute.' },
  { key: 'realesrgan', label: 'KI · Real-ESRGAN kompakt', kind: 'realesrgan',
    note: 'Kleines, schnelles Modell mit regelbarer Glättung. Verändert das Bild nur sanft.' },
  { key: 'esrgan-medium', label: 'KI · ESRGAN gründlich', kind: 'ai', model: 'medium',
    note: 'Betont Kanten und Texturen stark, kann körnig wirken.' },
  { key: 'esrgan-slim', label: 'KI · ESRGAN schnell', kind: 'ai', model: 'slim',
    note: 'Kleineres Netz, schneller, ebenfalls eher körnig.' },
  { key: 'lanczos', label: 'Lanczos-Filter', kind: 'classic',
    note: 'Klassische Interpolation mit Nachschärfung. Keine erfundenen Details, kein Rauschen.' },
  { key: 'bicubic', label: 'Bikubisch', kind: 'classic',
    note: 'Glatte Vergrösserung, wie sie der Browser beim Zoomen anwendet.' },
  { key: 'nearest', label: 'Pixel vergrössern', kind: 'classic',
    note: 'Ohne Glättung. Zeigt, was die Kachel wirklich enthält.' },
];

export const FACTORS = [2, 4];

// ---------------------------------------------------------------------------
// Ausschnitt

/** Beschreibt, was der Rahmen bei aktueller Kartenansicht liefern würde. */
export function describeFrame(map, frameEl) {
  const box = frameEl.querySelector('.frame-box') || frameEl;
  const rect = box.getBoundingClientRect();
  const mapRect = map.getContainer().getBoundingClientRect();
  const size = rect.width; // CSS-Pixel, quadratisch
  const z = map.getZoom();
  // Bildschirm-Pixel je Kachelpixel auf Stufe NATIVE_TILE_ZOOM (MapLibre rechnet mit 512er-Welt).
  const screenPerNative = 2 ** (z + 1 - NATIVE_TILE_ZOOM);
  let fetchZoom = NATIVE_TILE_ZOOM;
  let srcPx = size / screenPerNative;
  while (srcPx > MAX_SOURCE_PX && fetchZoom > MIN_FETCH_ZOOM) { fetchZoom--; srcPx /= 2; }
  srcPx = Math.round(srcPx);

  const tl = map.unproject([rect.left - mapRect.left, rect.top - mapRect.top]);
  const br = map.unproject([rect.right - mapRect.left, rect.bottom - mapRect.top]);
  const lat = (tl.lat + br.lat) / 2;
  const metersPerPx = (EARTH * Math.cos((lat * Math.PI) / 180)) / (TILE * 2 ** fetchZoom);
  return {
    srcPx, fetchZoom, metersPerPx,
    widthM: srcPx * metersPerPx,
    native: fetchZoom === NATIVE_TILE_ZOOM,
    tooSmall: srcPx < 64,
    bounds: { west: tl.lng, north: tl.lat, east: br.lng, south: br.lat },
  };
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
// Bibliotheken erst bei Bedarf laden (TensorFlow.js ist 1.5 MB gross).

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

// ---------------------------------------------------------------------------
// Vergrössern

/** Führt die gewählte Methode aus. Liefert die Ergebnis-Leinwand. */
export async function upscale(source, method, factor, { onProgress, onStatus, signal, denoise = 0.5 } = {}) {
  const m = METHODS.find((x) => x.key === method);
  if (!m) throw new Error(`Unbekannte Methode ${method}`);
  if (m.kind === 'x4plus') return x4plusUpscale(source, factor, { onProgress, onStatus, signal });
  if (m.kind === 'realesrgan') return realesrganUpscale(source, factor, denoise, { onProgress, onStatus, signal });
  if (m.kind === 'ai') return aiUpscale(source, m.model, factor, { onProgress, onStatus, signal });
  if (method === 'lanczos') return lanczos(source, factor, onProgress);
  return canvasScale(source, factor, method === 'nearest');
}

function canvasScale(source, factor, pixelated) {
  const out = document.createElement('canvas');
  out.width = source.width * factor;
  out.height = source.height * factor;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = !pixelated;
  if (!pixelated) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

async function lanczos(source, factor, onProgress) {
  const out = await picaResize(source, source.width * factor, source.height * factor, { unsharpAmount: 60, unsharpRadius: 0.6, unsharpThreshold: 2 });
  onProgress?.(1);
  return out;
}

async function picaResize(source, width, height, opts = {}) {
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  if (typeof window.pica !== 'function') await loadScript('vendor/pica/pica.min.js');
  await window.pica().resize(source, out, { filter: 'lanczos3', ...opts });
  return out;
}

// --- Real-ESRGAN (SRVGGNetCompact «realesr-general-x4v3») ----------------------
//
// Das Netz rechnet auf der Eingangsauflösung (33 Faltungen à 64 Kanäle mit PReLU)
// und ordnet zum Schluss die Kanäle zu 4×4-Pixelblöcken um (Pixel-Shuffle); dazu
// kommt das 4-fach vergrösserte Original als Basis. Die «Glättung» mischt die
// Gewichte des normalen und des rauschunterdrückenden Modells («wdn») linear,
// genau wie denoise_strength im Original.

const RESR_PATCH = 96;
const RESR_PAD = 12;
let resrFiles = null;   // {manifest, general, wdn}
let resrNet = null;     // {denoise, layers:[{type, w, b, a}]}

async function loadRealesrganFiles(onStatus) {
  if (!resrFiles) {
    onStatus?.('Real-ESRGAN-Modell wird geladen (9.7 MB) …');
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

async function realesrganUpscale(source, factor, denoise, { onProgress, onStatus, signal }) {
  await ensureBackend(onStatus);
  const tf = window.tf;
  const net = await getRealesrgan(tf, denoise, onStatus);
  onStatus?.('Berechne …');

  const W = source.width, H = source.height, s = net.scale;
  const out = document.createElement('canvas');
  out.width = W * s;
  out.height = H * s;
  const ctx = out.getContext('2d');
  const cols = Math.ceil(W / RESR_PATCH), rows = Math.ceil(H / RESR_PATCH);
  const padded = tf.tidy(() => {
    const img = tf.browser.fromPixels(source).toFloat().div(255);
    const padW = cols * RESR_PATCH - W, padH = rows * RESR_PATCH - H;
    const paddings = [[RESR_PAD, RESR_PAD + padH], [RESR_PAD, RESR_PAD + padW], [0, 0]];
    const mirrorOk = RESR_PAD + padH <= H && RESR_PAD + padW <= W;
    return mirrorOk ? tf.mirrorPad(img, paddings, 'symmetric') : tf.pad(img, paddings, 0);
  });
  const size = RESR_PATCH + 2 * RESR_PAD;
  let n = 0;
  try {
    for (let py = 0; py < rows; py++) {
      for (let px = 0; px < cols; px++) {
        if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
        const pixels = tf.tidy(() => {
          const patch = padded.slice([py * RESR_PATCH, px * RESR_PATCH, 0], [size, size, 3]).expandDims(0);
          const pred = realesrganForward(tf, net, patch);
          const crop = pred.slice([0, RESR_PAD * s, RESR_PAD * s, 0], [1, RESR_PATCH * s, RESR_PATCH * s, 3]);
          return crop.squeeze([0]).clipByValue(0, 1).mul(255).round().toInt();
        });
        const data = await tf.browser.toPixels(pixels);
        pixels.dispose();
        ctx.putImageData(new ImageData(data, RESR_PATCH * s, RESR_PATCH * s), px * RESR_PATCH * s, py * RESR_PATCH * s);
        n++;
        onProgress?.(n / (rows * cols));
        await tf.nextFrame();
      }
    }
  } finally {
    padded.dispose();
  }
  if (factor === s) return out;
  // Das Netz rechnet fest 4-fach; kleinere Faktoren durch sauberes Verkleinern.
  onStatus?.('Verkleinere auf den gewählten Faktor …');
  return picaResize(out, W * factor, H * factor);
}

// --- Real-ESRGAN x4plus (RRDBNet) ---------------------------------------------
//
// Das grosse Modell: 23 «Residual-in-Residual Dense Blocks» mit je drei dicht
// verbundenen Blöcken à fünf Faltungen (64 Merkmale, 32 Wachstumskanäle), danach
// zweimal Verdoppeln mit Faltung. Die Gewichte liegen als Float16 vor und werden
// beim Laden zu Float32 entpackt (16.7 Mio. Werte).

const X4_PATCH = 64;
const X4_PAD = 10;
let x4Files = null;   // {manifest, weights: Float32Array}
let x4Net = null;     // Map name -> tf.Tensor

function halfToFloat(u16) {
  const out = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i];
    const s = h & 0x8000 ? -1 : 1;
    const e = (h >> 10) & 0x1f;
    const f = h & 0x3ff;
    if (e === 0) out[i] = s * 2 ** -14 * (f / 1024);
    else if (e === 31) out[i] = f ? NaN : s * Infinity;
    else out[i] = s * 2 ** (e - 15) * (1 + f / 1024);
  }
  return out;
}

async function fetchBinary(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress?.(got, total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function loadX4Files(onStatus) {
  if (!x4Files) {
    x4Files = (async () => {
      const manifest = await (await fetch('vendor/realesrgan/x4plus.json')).json();
      const bytes = await fetchBinary('vendor/realesrgan/x4plus.bin', (got, total) => {
        const mb = (n) => (n / 1048576).toFixed(0);
        onStatus?.(total ? `Modell wird geladen … ${mb(got)} / ${mb(total)} MB` : `Modell wird geladen … ${mb(got)} MB`);
      });
      onStatus?.('Gewichte werden entpackt …');
      await new Promise((r) => setTimeout(r, 0));
      const weights = halfToFloat(new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2));
      return { manifest, weights };
    })().catch((err) => { x4Files = null; throw err; });
  }
  return x4Files;
}

async function getX4(tf, onStatus) {
  const files = await loadX4Files(onStatus);
  if (!x4Net) {
    const net = new Map();
    for (const [name, t] of Object.entries(files.manifest.tensors)) {
      const n = t.shape.reduce((a, b) => a * b, 1);
      net.set(name, tf.tensor(files.weights.subarray(t.offset, t.offset + n), t.shape));
    }
    x4Net = { net, scale: files.manifest.scale, numBlocks: files.manifest.numBlocks };
  }
  return x4Net;
}

/** Vorwärtsrechnung RRDBNet: x [1,h,w,3] im Bereich 0–1 → [1,4h,4w,3] */
function x4Forward(tf, model, x) {
  const { net, numBlocks } = model;
  const conv = (t, name) => tf.conv2d(t, net.get(`${name}.weight`), 1, 'same').add(net.get(`${name}.bias`));
  const lrelu = (t) => tf.leakyRelu(t, 0.2);
  const rdb = (input, p) => tf.tidy(() => {
    const x1 = lrelu(conv(input, `${p}.conv1`));
    const x2 = lrelu(conv(tf.concat([input, x1], 3), `${p}.conv2`));
    const x3 = lrelu(conv(tf.concat([input, x1, x2], 3), `${p}.conv3`));
    const x4 = lrelu(conv(tf.concat([input, x1, x2, x3], 3), `${p}.conv4`));
    const x5 = conv(tf.concat([input, x1, x2, x3, x4], 3), `${p}.conv5`);
    return x5.mul(0.2).add(input);
  });
  return tf.tidy(() => {
    const feat = conv(x, 'conv_first');
    let body = feat;
    for (let i = 0; i < numBlocks; i++) {
      const prev = body;
      body = tf.tidy(() => {
        let out = prev;
        for (const r of [1, 2, 3]) {
          const next = rdb(out, `body.${i}.rdb${r}`);
          if (out !== prev) out.dispose();
          out = next;
        }
        return out.mul(0.2).add(prev);
      });
      if (prev !== feat) prev.dispose();
    }
    let f = feat.add(conv(body, 'conv_body'));
    const [, h, w] = f.shape;
    f = lrelu(conv(tf.image.resizeNearestNeighbor(f, [h * 2, w * 2]), 'conv_up1'));
    f = lrelu(conv(tf.image.resizeNearestNeighbor(f, [h * 4, w * 4]), 'conv_up2'));
    return conv(lrelu(conv(f, 'conv_hr')), 'conv_last');
  });
}

async function x4plusUpscale(source, factor, { onProgress, onStatus, signal }) {
  await ensureBackend(onStatus);
  const tf = window.tf;
  const model = await getX4(tf, onStatus);
  onStatus?.('Berechne … (grosses Modell, bitte Geduld)');

  const W = source.width, H = source.height, s = model.scale;
  const out = document.createElement('canvas');
  out.width = W * s;
  out.height = H * s;
  const ctx = out.getContext('2d');
  const cols = Math.ceil(W / X4_PATCH), rows = Math.ceil(H / X4_PATCH);
  const padded = tf.tidy(() => {
    const img = tf.browser.fromPixels(source).toFloat().div(255);
    const padW = cols * X4_PATCH - W, padH = rows * X4_PATCH - H;
    const paddings = [[X4_PAD, X4_PAD + padH], [X4_PAD, X4_PAD + padW], [0, 0]];
    const mirrorOk = X4_PAD + padH <= H && X4_PAD + padW <= W;
    return mirrorOk ? tf.mirrorPad(img, paddings, 'symmetric') : tf.pad(img, paddings, 0);
  });
  const size = X4_PATCH + 2 * X4_PAD;
  let n = 0;
  const t0 = performance.now();
  try {
    for (let py = 0; py < rows; py++) {
      for (let px = 0; px < cols; px++) {
        if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
        const pixels = tf.tidy(() => {
          const patch = padded.slice([py * X4_PATCH, px * X4_PATCH, 0], [size, size, 3]).expandDims(0);
          const pred = x4Forward(tf, model, patch);
          const crop = pred.slice([0, X4_PAD * s, X4_PAD * s, 0], [1, X4_PATCH * s, X4_PATCH * s, 3]);
          return crop.squeeze([0]).clipByValue(0, 1).mul(255).round().toInt();
        });
        const data = await tf.browser.toPixels(pixels);
        pixels.dispose();
        ctx.putImageData(new ImageData(data, X4_PATCH * s, X4_PATCH * s), px * X4_PATCH * s, py * X4_PATCH * s);
        n++;
        const total = rows * cols;
        const remaining = ((performance.now() - t0) / n) * (total - n) / 1000;
        onProgress?.(n / total);
        onStatus?.(`Berechne … ${n} / ${total} Kacheln${remaining > 2 ? `, noch etwa ${Math.round(remaining)} s` : ''}`);
        await tf.nextFrame();
      }
    }
  } finally {
    padded.dispose();
  }
  if (factor === s) return out;
  onStatus?.('Verkleinere auf den gewählten Faktor …');
  return picaResize(out, W * factor, H * factor);
}

// Für Tests: direkter Zugriff auf die Vorwärtsrechnungen.
if (typeof window !== 'undefined') {
  window.__upscaleDebug = {
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
    async x4plusForward(data, h, w) {
      await ensureBackend();
      const tf = window.tf;
      const model = await getX4(tf);
      const x = tf.tensor4d(data, [1, h, w, 3]);
      const y = x4Forward(tf, model, x);
      const res = Array.from(await y.data());
      x.dispose(); y.dispose();
      return res;
    },
  };
}

// --- KI (ESRGAN über TensorFlow.js) ------------------------------------------

const models = new Map();
let backendReady = null;

async function ensureBackend(onStatus) {
  if (!window.tf) {
    onStatus?.('KI-Bibliothek wird geladen …');
    await loadScript('vendor/tfjs/tf.min.js');
  }
  const tf = window.tf;
  if (!backendReady) {
    backendReady = (async () => {
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

async function loadModel(model, factor, onStatus) {
  const key = `${model}-x${factor}`;
  if (!models.has(key)) {
    onStatus?.(`Modell ${key} wird geladen …`);
    models.set(key, window.tf.loadLayersModel(`vendor/esrgan/${key}/model.json`).catch((err) => {
      models.delete(key);
      throw err;
    }));
  }
  return models.get(key);
}

async function aiUpscale(source, model, factor, { onProgress, onStatus, signal }) {
  await ensureBackend(onStatus);
  const tf = window.tf;
  const net = await loadModel(model, factor, onStatus);
  onStatus?.('Berechne …');

  const W = source.width, H = source.height;
  const out = document.createElement('canvas');
  out.width = W * factor;
  out.height = H * factor;
  const ctx = out.getContext('2d');
  const cols = Math.ceil(W / PATCH), rows = Math.ceil(H / PATCH);

  // Quelle so auffüllen, dass jeder Durchgang exakt gleich gross ist (PATCH + 2·PAD).
  // Gleiche Formen bedeuten: die Grafikprogramme werden nur einmal übersetzt.
  const padded = tf.tidy(() => {
    const img = tf.browser.fromPixels(source).toFloat();
    const padW = cols * PATCH - W, padH = rows * PATCH - H;
    const paddings = [[PAD, PAD + padH], [PAD, PAD + padW], [0, 0]];
    const mirrorOk = PAD + padH <= H && PAD + padW <= W;
    return mirrorOk ? tf.mirrorPad(img, paddings, 'symmetric') : tf.pad(img, paddings, 0);
  });
  const size = PATCH + 2 * PAD;
  let n = 0;
  try {
    for (let py = 0; py < rows; py++) {
      for (let px = 0; px < cols; px++) {
        if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
        const pixels = tf.tidy(() => {
          const patch = padded.slice([py * PATCH, px * PATCH, 0], [size, size, 3]).expandDims(0);
          const pred = net.predict(patch);
          const crop = pred.slice([0, PAD * factor, PAD * factor, 0], [1, PATCH * factor, PATCH * factor, 3]);
          return crop.squeeze([0]).clipByValue(0, 255).round().toInt();
        });
        const data = await tf.browser.toPixels(pixels);
        pixels.dispose();
        // Ausserhalb der Leinwand liegende Ränder werden automatisch abgeschnitten.
        ctx.putImageData(new ImageData(data, PATCH * factor, PATCH * factor), px * PATCH * factor, py * PATCH * factor);
        n++;
        onProgress?.(n / (rows * cols));
        await tf.nextFrame();
      }
    }
  } finally {
    padded.dispose();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Export

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht erzeugt werden'))), type, quality);
  });
}

export function formatMeters(m) {
  return m >= 1 ? `${m.toFixed(m < 10 ? 1 : 0)} m` : `${Math.round(m * 100)} cm`;
}
