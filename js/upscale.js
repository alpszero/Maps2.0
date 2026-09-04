// Hochskalieren eines Luftbild-Ausschnitts direkt im Browser.
//
// Ablauf:
//  1. Ein Rahmen in wählbarer Bodengrösse (z.B. Quartier, 160 m) liegt über der
//     Karte. Der Nutzer verschiebt die Karte darunter; der Rahmen wächst und
//     schrumpft mit dem Zoom, seine Bodengrösse bleibt gleich.
//  2. Die Kacheln werden immer auf der höchsten SWISSIMAGE-Stufe (EPSG:3857,
//     Stufe 20, ≈10 cm) geladen und zu einem Quellbild zusammengesetzt.
//  3. Das Quellbild wird mit der gewählten Methode vergrössert, patchweise mit
//     Überlappung: Real-ESRGAN x4plus, Real-ESRGAN kompakt, ESRGAN (UpscalerJS),
//     Lanczos (pica), bikubisch oder Pixelwiederholung.
//  4. Optional eine Veredelung (Tonwerte, Farbe, Schärfe) für ein druckbares,
//     stimmiges Bild. Danach Vergleich, Download als PNG oder JPEG.

import { SWISSIMAGE_LAYER, NATIVE_TILE_ZOOM } from './config.js';
import { wmtsTileUrl } from './geoadmin.js';

const MIN_FETCH_ZOOM = 14;
const TILE = 256;
const EARTH = 40075016.686;
/** Längste Kante des Ergebnisses (iOS erlaubt Leinwände bis etwa 16.7 Mio. Pixel). */
export const MAX_OUTPUT_EDGE = 4096;

export const METHODS = [
  { key: 'x4plus', label: 'KI · Real-ESRGAN x4plus', kind: 'x4plus',
    note: 'Das grosse Modell (17 Mio. Parameter, 34 MB einmaliger Download). Klare Kanten und Markierungen, kaum Rauschen. Braucht am längsten.' },
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

/** Bodengrösse des Ausschnitts (längste Kante in Metern). */
export const PRESETS = [
  { key: 'haus', label: 'Haus · 40 m', meters: 40 },
  { key: 'nachbarschaft', label: 'Nachbarschaft · 100 m', meters: 100 },
  { key: 'quartier', label: 'Quartier · 160 m', meters: 160 },
  { key: 'gross', label: 'Gross · 200 m', meters: 200 },
];

/** Seitenverhältnis Breite : Höhe. */
export const FORMATS = [
  { key: 'square', label: 'Quadrat', ratio: 1 },
  { key: 'l32', label: 'Quer 3:2', ratio: 1.5 },
  { key: 'a4l', label: 'A4 quer', ratio: Math.SQRT2 },
  { key: 'p23', label: 'Hoch 2:3', ratio: 2 / 3 },
  { key: 'a4p', label: 'A4 hoch', ratio: Math.SQRT1_2 },
];

// ---------------------------------------------------------------------------
// Ausschnitt

/**
 * Beschreibt den Ausschnitt um die Kartenmitte: Bodengrösse, Quellpixel auf der
 * nativen Stufe, Grösse auf dem Bildschirm und geografische Grenzen.
 */
export function describeFrame(map, { meters, ratio }) {
  const center = map.getCenter();
  const latR = (center.lat * Math.PI) / 180;
  const widthM = ratio >= 1 ? meters : meters * ratio;
  const heightM = ratio >= 1 ? meters / ratio : meters;
  const metersPerPx = (EARTH * Math.cos(latR)) / (TILE * 2 ** NATIVE_TILE_ZOOM);
  const srcW = Math.round(widthM / metersPerPx);
  const srcH = Math.round(heightM / metersPerPx);
  // MapLibre rechnet mit einer 512er-Welt: Meter je CSS-Pixel bei aktuellem Zoom.
  const metersPerCss = (EARTH * Math.cos(latR)) / (512 * 2 ** map.getZoom());
  const screenW = widthM / metersPerCss;
  const screenH = heightM / metersPerCss;
  const c = map.project(center);
  const tl = map.unproject([c.x - screenW / 2, c.y - screenH / 2]);
  const br = map.unproject([c.x + screenW / 2, c.y + screenH / 2]);
  const el = map.getContainer();
  return {
    widthM, heightM, srcW, srcH, metersPerPx, screenW, screenH,
    fetchZoom: NATIVE_TILE_ZOOM,
    fitsScreen: screenW <= el.clientWidth - 16 && screenH <= el.clientHeight * 0.6,
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

/**
 * Gemeinsame Kachelschleife für alle Netze: Quelle spiegelnd auffüllen, in gleich
 * grossen Stücken rechnen, Ränder abschneiden, bei Bedarf auf den gewünschten
 * Faktor mitteln (4-fach-Netz, 2-fach-Ergebnis) und ins Ergebnis schreiben.
 * forward(x): x [1,h,w,3] 0–1 → [1,h·netScale,w·netScale,3] 0–1
 */
async function runTiled(tf, source, { patch, pad, netScale, factor, forward, onProgress, onStatus, signal }) {
  const W = source.width, H = source.height;
  if (netScale % factor !== 0) throw new Error(`Faktor ${factor} mit Netz ×${netScale} nicht möglich`);
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
        onStatus?.(`Berechne … ${n} / ${total} Kacheln${remaining > 2 ? `, noch etwa ${formatSeconds(remaining)}` : ''}`);
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

// --- ESRGAN (UpscalerJS-Modelle, Keras-Format, eigene 2×/4×-Netze) -------------

const models = new Map();

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
  return runTiled(tf, source, {
    patch: 64, pad: 8, netScale: factor, factor,
    forward: (x) => net.predict(x.mul(255)).div(255), // Ein- und Ausgabe des Modells 0–255
    onProgress, onStatus, signal,
  });
}

// --- Real-ESRGAN kompakt (SRVGGNetCompact «realesr-general-x4v3») ----------------
//
// Das Netz rechnet auf der Eingangsauflösung (33 Faltungen à 64 Kanäle mit PReLU)
// und ordnet zum Schluss die Kanäle zu 4×4-Pixelblöcken um (Pixel-Shuffle); dazu
// kommt das 4-fach vergrösserte Original als Basis. Die «Glättung» mischt die
// Gewichte des normalen und des rauschunterdrückenden Modells («wdn») linear,
// genau wie denoise_strength im Original.

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
  return runTiled(tf, source, {
    patch: 96, pad: 12, netScale: net.scale, factor,
    forward: (x) => realesrganForward(tf, net, x),
    onProgress, onStatus, signal,
  });
}

// --- Real-ESRGAN x4plus (RRDBNet) ---------------------------------------------
//
// Das grosse Modell: 23 «Residual-in-Residual Dense Blocks» mit je drei dicht
// verbundenen Blöcken à fünf Faltungen (64 Merkmale, 32 Wachstumskanäle), danach
// zweimal Verdoppeln mit Faltung. Die Gewichte liegen als Float16 vor und werden
// beim Laden zu Float32 entpackt (16.7 Mio. Werte).

let x4Files = null;   // {manifest, weights: Float32Array}
let x4Net = null;     // {net: Map name -> tf.Tensor, scale, numBlocks}

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
  return runTiled(tf, source, {
    patch: 64, pad: 10, netScale: model.scale, factor,
    forward: (x) => x4Forward(tf, model, x),
    onProgress, onStatus, signal,
  });
}

// ---------------------------------------------------------------------------
// Veredelung: Tonwerte strecken, Farben kräftigen, sanft nachschärfen.
//
// Die Tonwertgrenzen werden einmal aus dem ganzen Bild bestimmt (0.5 % und
// 99.5 % der Helligkeit), damit alle Kacheln gleich behandelt werden und das
// Bild einheitlich bleibt. Die Rechnung läuft kachelweise, damit auch grosse
// Ergebnisse (4096 px) auf dem Handy in den Speicher passen.

const POLISH_TILE = 512;
const POLISH_PAD = 8;

export async function polishCanvas(canvas, { onProgress, onStatus, signal, strength = 1 } = {}) {
  await ensureBackend(onStatus);
  const tf = window.tf;
  onStatus?.('Veredle …');
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
    // Form [5, 5, 3, 1]: derselbe Kern für jeden der drei Farbkanäle
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
          // Tonwerte strecken, mildes Kontrast-S
          t = t.sub(lo).div(Math.max(0.2, hi - lo)).clipByValue(0, 1);
          t = t.sub(0.5).mul(contrast).add(0.5);
          // Sättigung über die Helligkeit (Rec. 601)
          const lum = t.mul(tf.tensor1d([0.299, 0.587, 0.114])).sum(-1, true);
          t = lum.add(t.sub(lum).mul(sat));
          // Unschärfemaske
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

/** Helligkeitsgrenzen (0.5 % / 99.5 %) aus einer verkleinerten Kopie. */
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
  // Sanft: nur zu 70 % strecken und die Grenzen deckeln, damit gleichmässige
  // Flächen (Wiese, Wasser) nicht absaufen oder ausbrennen.
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

export function formatMeters(m) {
  return m >= 1 ? `${m.toFixed(m < 10 ? 1 : 0)} m` : `${Math.round(m * 100)} cm`;
}

/** Druckgrösse in cm bei gegebener Auflösung. */
export function printSize(px, dpi = 300) {
  return (px / dpi) * 2.54;
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
