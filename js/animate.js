// Animation durch die Jahrgänge: Kacheln je Jahrgang laden, weich überblenden,
// als GIF (gifenc) oder Video (MediaRecorder, WebM oder MP4 je nach Browser) ausgeben.

import { captureSource, worldSize } from './upscale.js';

/** Format, das der Browser aufzeichnen kann (oder null). */
export function videoMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Lädt die Bilder aller Jahrgänge für den Ausschnitt.
 * @returns {{frames:[{year, canvas}], width, height, skipped:[]}}
 */
export async function collectYears({ bounds, entries, size, onStatus, onProgress, signal }) {
  // Kachelstufe so wählen, dass die längste Kante mindestens `size` Pixel misst.
  let zoom = 20;
  let [w, h] = worldSize(bounds, zoom);
  while (Math.max(w, h) > size * 1.6 && zoom > 8) { zoom--; [w, h] = worldSize(bounds, zoom); }
  const scale = size / Math.max(w, h);
  const width = Math.max(2, Math.round(w * scale)) & ~1; // gerade Masse (Videocodecs)
  const height = Math.max(2, Math.round(h * scale)) & ~1;

  const frames = [], skipped = [];
  for (let i = 0; i < entries.length; i++) {
    if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
    const e = entries[i];
    onStatus?.(`Lade Jahrgang ${e.year} (${i + 1} / ${entries.length}) …`);
    const res = await captureSource({ bounds, fetchZoom: zoom, timestamp: e.ts, signal, onProgress: (p) => onProgress?.((i + p) / entries.length) });
    if (res.failed === res.total) { skipped.push(e.year); continue; }
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(res.canvas, 0, 0, width, height);
    frames.push({ year: e.year, canvas: c });
  }
  return { frames, width, height, skipped };
}

/** Zeichnet den Zustand zwischen Jahrgang i und i+1 (t = 0..1) auf ctx. */
export function drawFrame(ctx, frames, i, t, { width, height, label = true }) {
  const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
  ctx.globalAlpha = 1;
  ctx.drawImage(a.canvas, 0, 0);
  if (t > 0 && b !== a) {
    ctx.globalAlpha = easeInOut(t);
    ctx.drawImage(b.canvas, 0, 0);
    ctx.globalAlpha = 1;
  }
  if (label) {
    const year = t < 0.5 ? a.year : b.year;
    const fs = Math.max(18, Math.round(height * 0.11));
    ctx.font = `800 ${fs}px system-ui, -apple-system, Helvetica, Arial, sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, fs * 0.16);
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = '#fff';
    const x = Math.round(fs * 0.5), y = height - Math.round(fs * 0.45);
    ctx.strokeText(String(year), x, y);
    ctx.fillText(String(year), x, y);
    const small = Math.max(9, Math.round(fs * 0.3));
    ctx.font = `500 ${small}px system-ui, -apple-system, Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'right';
    ctx.lineWidth = Math.max(2, small * 0.25);
    ctx.strokeText('© swisstopo', width - Math.round(small * 0.6), height - Math.round(small * 0.6));
    ctx.fillText('© swisstopo', width - Math.round(small * 0.6), height - Math.round(small * 0.6));
    ctx.textAlign = 'left';
  }
}

/** Ablaufplan: [{i, t, delayMs}] */
export function plan(frames, { holdMs, fadeMs, fps }) {
  const steps = [];
  const fadeFrames = Math.max(0, Math.round((fadeMs / 1000) * fps));
  for (let i = 0; i < frames.length; i++) {
    steps.push({ i, t: 0, delayMs: holdMs });
    if (i < frames.length - 1) {
      for (let k = 1; k <= fadeFrames; k++) steps.push({ i, t: k / (fadeFrames + 1), delayMs: 1000 / fps });
    }
  }
  return steps;
}

export async function encodeGif(frames, { width, height, holdMs, fadeMs, fps, onProgress, onStatus, signal }) {
  const { GIFEncoder, quantize, applyPalette } = await import('../vendor/gifenc/gifenc.esm.js');
  const gif = GIFEncoder();
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const steps = plan(frames, { holdMs, fadeMs, fps });
  onStatus?.(`GIF wird erzeugt (${steps.length} Bilder) …`);
  for (let k = 0; k < steps.length; k++) {
    if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
    const s = steps[k];
    drawFrame(ctx, frames, s.i, s.t, { width, height });
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const palette = quantize(rgba, 256, { format: 'rgb444' });
    const index = applyPalette(rgba, palette, 'rgb444');
    gif.writeFrame(index, width, height, { palette, delay: Math.max(20, Math.round(s.delayMs)), repeat: 0 });
    onProgress?.((k + 1) / steps.length);
    if (k % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), mime: 'image/gif', ext: 'gif', frames: steps.length, durationMs: steps.reduce((a, s) => a + s.delayMs, 0) };
}

export async function recordVideo(frames, { width, height, holdMs, fadeMs, fps, onProgress, onStatus, signal }) {
  const mime = videoMime();
  if (!mime) throw new Error('Dieser Browser kann kein Video aufzeichnen. Bitte GIF wählen.');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFrame(ctx, frames, 0, 0, { width, height });
  const stream = canvas.captureStream(fps);
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(width * height * fps * 0.12) });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((resolve, reject) => { rec.onstop = resolve; rec.onerror = (e) => reject(e.error || new Error('Aufnahme fehlgeschlagen')); });
  rec.start(250);
  onStatus?.('Video wird in Echtzeit aufgezeichnet … Bitte den Tab nicht verlassen.');

  const total = frames.length * holdMs + (frames.length - 1) * fadeMs;
  const t0 = performance.now();
  await new Promise((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) { rec.stop(); reject(new DOMException('Abgebrochen', 'AbortError')); return; }
      const el = performance.now() - t0;
      if (el >= total + 300) { resolve(); return; }
      // Position im Ablauf: Halten, dann Überblenden
      const seg = holdMs + fadeMs;
      const i = Math.min(frames.length - 1, Math.floor(el / seg));
      const within = el - i * seg;
      const t = i >= frames.length - 1 ? 0 : Math.max(0, Math.min(1, (within - holdMs) / Math.max(1, fadeMs)));
      drawFrame(ctx, frames, i, t, { width, height });
      onProgress?.(Math.min(1, el / total));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), mime: mime.split(';')[0], ext, frames: Math.round((total / 1000) * fps), durationMs: total };
}
