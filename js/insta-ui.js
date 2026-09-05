// Oberfläche des Insta-Bilds: Rahmen aufziehen, Ortsname prüfen, Bild erstellen,
// herunterladen oder teilen. Bewusst wenige Schritte.

import { describeBounds, formatMeters, keepAwake, canvasToBlob, maxCanvasEdge } from './enhance.js';
import { createInstaImage, lookupPlace, subtitleFor, planInsta } from './insta.js';
import { placeNear } from './places.js';

const $ = (sel, root = document) => root.querySelector(sel);

export function setupInsta({ map, button, panel, frame, getYear, closeOthers, onToggle, toast }) {
  const ui = {
    closers: panel.querySelectorAll('.panel-close'),
    step1: $('#in-step1', panel),
    step2: $('#in-step2', panel),
    result: $('#in-result', panel),
    name: $('#in-name', panel),
    aspect1: $('#in-aspect-1', panel),
    aspect45: $('#in-aspect-45', panel),
    info: $('#in-info', panel),
    run: $('#in-run', panel),
    cancel: $('#in-cancel', panel),
    progressBar: $('#in-progress-bar', panel),
    status: $('#in-status', panel),
    preview: $('#in-preview', panel),
    meta: $('#in-meta', panel),
    download: $('#in-download', panel),
    share: $('#in-share', panel),
    again: $('#in-again', panel),
  };
  const state = {
    open: false, controller: null, lookup: null, lookupTimer: null,
    place: null, nameDirty: false, result: null, url: null, blob: null, maxEdge: 4096,
  };
  maxCanvasEdge().then((edge) => { state.maxEdge = edge; updateInfo(); });

  function open() {
    closeOthers();
    state.open = true;
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.body.classList.add('is-framing');
    frame.setAspect(ui.aspect45.classList.contains('is-active') ? 0.8 : 1);
    frame.reset(120);
    frame.show();
    showStep(1);
    state.nameDirty = false;
    ui.name.value = '';
    scheduleLookup();
    onToggle?.();
  }
  function close() {
    state.open = false;
    panel.hidden = true;
    frame.hide();
    document.body.classList.remove('is-framing');
    button.setAttribute('aria-expanded', 'false');
    state.controller?.abort();
    state.lookup?.abort();
    onToggle?.();
  }
  button.addEventListener('click', () => (state.open ? close() : open()));
  ui.closers.forEach((b) => b.addEventListener('click', close));

  function showStep(n) {
    ui.step1.hidden = n !== 1;
    ui.step2.hidden = n !== 2;
    ui.result.hidden = n !== 3;
    panel.classList.toggle('is-bar', n !== 3);
    if (n === 1) { frame.show(); updateInfo(); } else frame.hide();
    document.body.classList.toggle('is-framing', n === 1);
  }

  // Seitenverhältnis
  function setAspect(a) {
    ui.aspect1.classList.toggle('is-active', a === 1);
    ui.aspect45.classList.toggle('is-active', a !== 1);
    frame.setAspect(a);
  }
  ui.aspect1.addEventListener('click', () => setAspect(1));
  ui.aspect45.addEventListener('click', () => setAspect(0.8));

  function updateInfo() {
    if (!state.open || ui.step1.hidden) return;
    const b = frame.getBounds();
    if (!b) return;
    const d = describeBounds(b);
    const y = getYear();
    const p = planInsta(b, map.getZoom(), state.maxEdge);
    ui.info.textContent = `${formatMeters(d.widthM)} × ${formatMeters(d.heightM)} · ${p.outW} × ${p.outH} px${p.ai ? ' (KI 2×)' : ''} · Jahrgang ${y.year}`;
  }
  frame.onChange(() => { updateInfo(); scheduleLookup(); });
  map.on('zoom', () => { if (state.open) updateInfo(); });
  map.on('moveend', () => { if (state.open) updateInfo(); });

  // Ortsname ermitteln (verzögert, damit beim Ziehen nicht dauernd abgefragt wird)
  function scheduleLookup() {
    if (!state.open) return;
    clearTimeout(state.lookupTimer);
    state.lookupTimer = setTimeout(runLookup, 500);
  }
  async function runLookup() {
    const b = frame.getBounds();
    if (!b) return;
    state.lookup?.abort();
    state.lookup = new AbortController();
    const c = frame.center();
    const known = placeNear(c.lng, c.lat, 350);
    try {
      const place = await lookupPlace(b, { signal: state.lookup.signal });
      state.place = place;
      if (known) place.name = known.name;
      if (!state.nameDirty) ui.name.value = place.name;
    } catch (err) {
      if (err?.name === 'AbortError') return;
      state.place = null;
      if (known && !state.nameDirty) ui.name.value = known.name;
    }
  }
  ui.name.addEventListener('input', () => { state.nameDirty = ui.name.value.trim() !== ''; });

  // Bild erstellen
  ui.run.addEventListener('click', async () => {
    const bounds = frame.getBounds();
    if (!bounds) return;
    state.controller?.abort();
    state.controller = new AbortController();
    const signal = state.controller.signal;
    const name = ui.name.value.trim();
    const y = getYear();
    showStep(2);
    ui.progressBar.style.width = '0%';
    ui.status.textContent = '';
    const lock = await keepAwake();
    try {
      const res = await createInstaImage({
        bounds, timestamp: y.ts, name,
        subtitle: subtitleFor(state.place, name),
        year: y.year, viewZoom: map.getZoom(), maxEdge: state.maxEdge, signal,
        onStatus: (s) => { ui.status.textContent = s; },
        onProgress: (p) => { ui.progressBar.style.width = `${Math.round(p * 100)}%`; },
      });
      if (signal.aborted) return;
      state.result = { ...res, name, year: y.year };
      await showResult();
    } catch (err) {
      if (err?.name === 'AbortError') { showStep(1); return; }
      console.warn(err);
      toast(err.message || 'Bild konnte nicht erstellt werden.');
      showStep(1);
    } finally {
      lock?.release?.();
    }
  });
  ui.cancel.addEventListener('click', () => state.controller?.abort());

  async function showResult() {
    const r = state.result;
    state.blob = await canvasToBlob(r.canvas, 'image/jpeg', 0.93);
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = URL.createObjectURL(state.blob);
    ui.preview.src = state.url;
    const mb = (state.blob.size / 1048576).toFixed(1);
    const how = r.ai ? `Kachelstufe ${r.sourceZoom}, KI 2×` : `Kachelstufe ${r.sourceZoom}, echte Pixel`;
    ui.meta.textContent = `${r.width} × ${r.height} px · ${formatMeters(r.widthM)} breit · ${how} · Jahrgang ${r.year} · ${mb} MB`;
    ui.share.hidden = !canShare();
    showStep(3);
  }

  function fileName() {
    const r = state.result;
    const slug = (r.name || 'luftbild').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'luftbild';
    return `${slug}-${r.year}.jpg`;
  }

  function canShare() {
    if (!navigator.share || !navigator.canShare || !state.blob) return false;
    try { return navigator.canShare({ files: [new File([state.blob], 'x.jpg', { type: 'image/jpeg' })] }); } catch { return false; }
  }

  ui.download.addEventListener('click', () => {
    if (!state.url) return;
    const a = document.createElement('a');
    a.href = state.url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
  ui.share.addEventListener('click', async () => {
    if (!state.blob) return;
    const file = new File([state.blob], fileName(), { type: 'image/jpeg' });
    try {
      await navigator.share({ files: [file], title: state.result.name || 'Luftbild' });
    } catch (err) {
      if (err?.name !== 'AbortError') toast('Teilen nicht möglich; bitte herunterladen.');
    }
  });
  ui.again.addEventListener('click', () => { showStep(1); scheduleLookup(); });

  return { open, close, isOpen: () => state.open };
}
