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
  { key: 'esrgan-medium', label: 'KI · ESRGAN gründlich', kind: 'ai', model: 'medium',
    note: 'Neuronales Netz mit 64 Schichten. Beste Rekonstruktion von Kanten und Texturen, braucht am längsten.' },
  { key: 'esrgan-slim', label: 'KI · ESRGAN schnell', kind: 'ai', model: 'slim',
    note: 'Kleineres Netz, etwa dreimal schneller, etwas weicher.' },
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
export async function upscale(source, method, factor, { onProgress, onStatus, signal } = {}) {
  const m = METHODS.find((x) => x.key === method);
  if (!m) throw new Error(`Unbekannte Methode ${method}`);
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
  const out = document.createElement('canvas');
  out.width = source.width * factor;
  out.height = source.height * factor;
  if (typeof window.pica !== 'function') await loadScript('vendor/pica/pica.min.js');
  const p = window.pica();
  await p.resize(source, out, { filter: 'lanczos3', unsharpAmount: 60, unsharpRadius: 0.6, unsharpThreshold: 2 });
  onProgress?.(1);
  return out;
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
