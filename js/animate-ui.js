// Oberfläche der Animations-Funktion: Ausschnitt, Jahrgänge, GIF oder Video.

import { describeBounds, formatMeters, keepAwake } from './upscale.js';
import { collectYears, encodeGif, recordVideo, videoMime } from './animate.js';

const $ = (sel, root = document) => root.querySelector(sel);

export function setupAnimate({ map, button, panel, frame, getEntries, closeOthers, onToggle, toast }) {
  const ui = {
    close: $('.panel-close', panel),
    step1: $('#an-step1', panel),
    step2: $('#an-step2', panel),
    info: $('#an-info', panel),
    reset: $('#an-reset', panel),
    next: $('#an-next', panel),
    back: $('#an-back', panel),
    from: $('#an-from', panel),
    to: $('#an-to', panel),
    size: $('#an-size', panel),
    hold: $('#an-hold', panel),
    holdLabel: $('#an-hold-label', panel),
    fade: $('#an-fade', panel),
    fadeLabel: $('#an-fade-label', panel),
    formatGif: $('#an-format-gif', panel),
    formatVideo: $('#an-format-video', panel),
    videoNote: $('#an-video-note', panel),
    run: $('#an-run', panel),
    cancel: $('#an-cancel', panel),
    progress: $('#an-progress', panel),
    progressBar: $('#an-progress-bar', panel),
    status: $('#an-status', panel),
    result: $('#an-result', panel),
    preview: $('#an-preview', panel),
    meta: $('#an-meta', panel),
    download: $('#an-download', panel),
  };

  const state = { open: false, controller: null, result: null, url: null };

  const mime = videoMime();
  if (!mime) {
    ui.formatVideo.disabled = true;
    ui.videoNote.textContent = 'Video wird von diesem Browser nicht unterstützt; GIF ist verfügbar.';
  } else {
    ui.videoNote.textContent = mime.startsWith('video/mp4') ? 'Video als MP4 (H.264).' : 'Video als WebM; für MP4 Safari verwenden.';
  }

  function open() {
    closeOthers();
    state.open = true;
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    fillYears();
    showStep(1);
    onToggle?.();
  }
  function close() {
    state.open = false;
    panel.hidden = true;
    frame.hide();
    document.body.classList.remove('is-framing');
    button.setAttribute('aria-expanded', 'false');
    state.controller?.abort();
    onToggle?.();
  }
  button.addEventListener('click', () => (state.open ? close() : open()));
  ui.close.addEventListener('click', close);

  function showStep(n) {
    ui.step1.hidden = n !== 1;
    ui.step2.hidden = n !== 2;
    if (n === 1) frame.show(); else frame.hide();
    panel.classList.toggle('is-compact', n === 1);
    document.body.classList.toggle('is-framing', n === 1);
    if (n === 1) updateInfo();
  }

  function fillYears() {
    const entries = getEntries();
    if (ui.from.options.length) return;
    for (const sel of [ui.from, ui.to]) {
      for (const e of entries) {
        const o = document.createElement('option');
        o.value = e.ts; o.textContent = String(e.year);
        sel.appendChild(o);
      }
    }
    ui.from.value = entries[0].ts;
    ui.to.value = entries[entries.length - 1].ts;
  }

  function updateInfo() {
    if (!state.open || ui.step1.hidden) return;
    const b = frame.getBounds();
    if (!b) return;
    const d = describeBounds(b);
    ui.info.textContent = `${formatMeters(d.widthM)} × ${formatMeters(d.heightM)} · Rahmen ziehen oder verschieben, Karte daneben bewegen.`;
  }
  frame.onChange(updateInfo);
  ui.reset.addEventListener('click', () => frame.reset(400));

  ui.next.addEventListener('click', () => { state.bounds = frame.getBounds(); showStep(2); });
  ui.back.addEventListener('click', () => { state.controller?.abort(); showStep(1); });

  const syncLabels = () => {
    ui.holdLabel.textContent = `${Number(ui.hold.value).toFixed(1)} s`;
    ui.fadeLabel.textContent = `${Number(ui.fade.value).toFixed(1)} s`;
  };
  ui.hold.addEventListener('input', syncLabels);
  ui.fade.addEventListener('input', syncLabels);
  syncLabels();

  function selectedEntries() {
    const entries = getEntries();
    let a = entries.findIndex((e) => e.ts === ui.from.value);
    let b = entries.findIndex((e) => e.ts === ui.to.value);
    if (a < 0) a = 0;
    if (b < 0) b = entries.length - 1;
    if (a > b) [a, b] = [b, a];
    return entries.slice(a, b + 1);
  }

  ui.run.addEventListener('click', async () => {
    const entries = selectedEntries();
    if (entries.length < 2) { toast('Mindestens zwei Jahrgänge wählen.'); return; }
    state.controller?.abort();
    state.controller = new AbortController();
    const signal = state.controller.signal;
    ui.run.disabled = true;
    ui.cancel.hidden = false;
    ui.progress.hidden = false;
    ui.progressBar.style.width = '0%';
    ui.result.hidden = true;
    const lock = await keepAwake();
    const onStatus = (s) => { ui.status.textContent = s; };
    try {
      const size = Number(ui.size.value);
      const holdMs = Number(ui.hold.value) * 1000, fadeMs = Number(ui.fade.value) * 1000;
      const fps = ui.formatGif.checked ? 15 : 30;
      const col = await collectYears({
        bounds: state.bounds, entries, size, signal, onStatus,
        onProgress: (p) => { ui.progressBar.style.width = `${Math.round(p * 60)}%`; },
      });
      if (col.frames.length < 2) throw new Error('Für diesen Ausschnitt gibt es zu wenige Jahrgänge mit Bild.');
      const opts = { ...col, holdMs, fadeMs, fps, signal, onStatus, onProgress: (p) => { ui.progressBar.style.width = `${Math.round(60 + p * 40)}%`; } };
      const out = ui.formatGif.checked ? await encodeGif(col.frames, opts) : await recordVideo(col.frames, opts);
      state.result = { ...out, width: col.width, height: col.height, years: col.frames.map((f) => f.year), skipped: col.skipped };
      showResult();
    } catch (err) {
      if (err?.name === 'AbortError') ui.status.textContent = 'Abgebrochen.';
      else { console.warn(err); ui.status.textContent = `Fehlgeschlagen: ${err.message || err}`; }
    } finally {
      lock?.release?.();
      ui.run.disabled = false;
      ui.cancel.hidden = true;
      ui.progress.hidden = !state.result;
    }
  });
  ui.cancel.addEventListener('click', () => state.controller?.abort());

  function showResult() {
    const r = state.result;
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = URL.createObjectURL(r.blob);
    ui.preview.innerHTML = '';
    if (r.mime === 'image/gif') {
      const img = document.createElement('img');
      img.src = state.url; img.alt = 'Animation';
      ui.preview.appendChild(img);
    } else {
      const v = document.createElement('video');
      v.src = state.url; v.controls = true; v.loop = true; v.muted = true; v.playsInline = true; v.autoplay = true;
      ui.preview.appendChild(v);
    }
    const mb = (r.blob.size / 1048576).toFixed(1);
    const skipped = r.skipped.length ? ` · ohne Bild: ${r.skipped.join(', ')}` : '';
    ui.meta.textContent = `${r.ext.toUpperCase()} · ${r.width} × ${r.height} px · ${r.years.length} Jahrgänge (${r.years[0]} bis ${r.years[r.years.length - 1]}) · ${(r.durationMs / 1000).toFixed(0)} s · ${mb} MB${skipped}`;
    ui.status.textContent = '';
    ui.progress.hidden = true;
    ui.result.hidden = false;
  }

  ui.download.addEventListener('click', () => {
    const r = state.result;
    if (!r) return;
    const a = document.createElement('a');
    a.href = state.url;
    a.download = `zeitreise-${r.years[0]}-${r.years[r.years.length - 1]}.${r.ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  return { open, close, isOpen: () => state.open };
}
