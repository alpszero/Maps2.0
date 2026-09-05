// Oberfläche des Insta-Bilds: Rahmen aufziehen, Ortsname prüfen, Bild erstellen,
// als PNG oder JPEG herunterladen oder teilen. Bewusst wenige Schritte.

import { describeBounds, formatMeters, keepAwake, canvasToBlob, maxCanvasEdge, scaledCopy } from './enhance.js';
import { createInstaImage, lookupPlace, subtitleFor, planInsta } from './insta.js';
import { placeNear } from './places.js';

const $ = (sel, root = document) => root.querySelector(sel);
const PREVIEW_EDGE = 1600;

export function setupInsta({ map, button, panel, frame, getYear, closeOthers, onToggle, toast }) {
  const ui = {
    closers: panel.querySelectorAll('.panel-close'),
    step1: $('#in-step1', panel),
    step2: $('#in-step2', panel),
    result: $('#in-result', panel),
    name: $('#in-name', panel),
    tag: $('#in-tag', panel),
    aspect1: $('#in-aspect-1', panel),
    aspect45: $('#in-aspect-45', panel),
    label: $('#in-label', panel),
    info: $('#in-info', panel),
    run: $('#in-run', panel),
    cancel: $('#in-cancel', panel),
    progressBar: $('#in-progress-bar', panel),
    status: $('#in-status', panel),
    preview: $('#in-preview', panel),
    meta: $('#in-meta', panel),
    downloadPng: $('#in-download', panel),
    downloadJpeg: $('#in-download-jpeg', panel),
    share: $('#in-share', panel),
    again: $('#in-again', panel),
    resultStatus: $('#in-result-status', panel),
  };
  const state = {
    open: false, controller: null, lookup: null, lookupTimer: null,
    place: null, nameDirty: false, tagDirty: false, result: null, previewUrl: null,
    blobs: {}, maxEdge: 4096, busy: false,
  };
  maxCanvasEdge().then((edge) => { state.maxEdge = edge; updateInfo(); });

  function open() {
    closeOthers();
    state.open = true;
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.body.classList.add('is-framing');
    frame.setAspect(ui.aspect45.classList.contains('is-active') ? 0.8 : 1);
    frame.reset(400);
    frame.show();
    showStep(1);
    state.nameDirty = false;
    state.tagDirty = false;
    ui.name.value = '';
    ui.tag.value = '';
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
    const p = planInsta(b, state.maxEdge);
    const d = describeBounds(b, p.zoom);
    const y = getYear();
    const mp = ((p.outW * p.outH) / 1e6).toFixed(p.outW * p.outH < 5e6 ? 1 : 0);
    ui.info.textContent = `${formatMeters(d.widthM)} × ${formatMeters(d.heightM)} · ${p.outW} × ${p.outH} px (${mp} MP, ${p.tiles} Kacheln) · Jahrgang ${y.year}`;
  }
  frame.onChange(() => { updateInfo(); scheduleLookup(); });
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
      if (!state.nameDirty) ui.name.value = place.name;
      if (!state.tagDirty) ui.tag.value = place.tagline;
    } catch (err) {
      if (err?.name === 'AbortError') return;
      state.place = null;
      if (!state.nameDirty) ui.name.value = known?.name || 'Schweiz';
      if (!state.tagDirty) ui.tag.value = known?.tag || '';
    }
  }
  ui.name.addEventListener('input', () => { state.nameDirty = ui.name.value.trim() !== ''; });
  ui.tag.addEventListener('input', () => { state.tagDirty = ui.tag.value.trim() !== ''; });

  // Bild erstellen
  ui.run.addEventListener('click', async () => {
    const bounds = frame.getBounds();
    if (!bounds) return;
    state.controller?.abort();
    state.controller = new AbortController();
    const signal = state.controller.signal;
    const name = ui.name.value.trim() || state.place?.name || 'Schweiz';
    const tagline = ui.tag.value.trim();
    const y = getYear();
    showStep(2);
    ui.progressBar.style.width = '0%';
    ui.status.textContent = '';
    const lock = await keepAwake();
    try {
      const res = await createInstaImage({
        bounds, timestamp: y.ts, name,
        subtitle: subtitleFor(state.place, name), tagline,
        year: y.year, maxEdge: state.maxEdge, label: ui.label.checked, signal,
        onStatus: (s) => { ui.status.textContent = s; },
        onProgress: (p) => { ui.progressBar.style.width = `${Math.round(p * 100)}%`; },
      });
      if (signal.aborted) return;
      if (state.result?.canvas) { state.result.canvas.width = 0; state.result.canvas.height = 0; }
      state.result = { ...res, name, year: y.year };
      state.blobs = {};
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
    // Vorschau verkleinert, damit auch 100-Megapixel-Bilder flüssig angezeigt werden.
    const previewBlob = await canvasToBlob(scaledCopy(r.canvas, PREVIEW_EDGE), 'image/jpeg', 0.9);
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(previewBlob);
    ui.preview.src = state.previewUrl;
    const mp = ((r.width * r.height) / 1e6).toFixed(r.width * r.height < 5e6 ? 1 : 0);
    const missing = r.missing ? ` · ${r.missing} Kacheln ohne Bild` : '';
    ui.meta.textContent = `${r.width} × ${r.height} px (${mp} MP) · ${formatMeters(r.widthM)} breit · Kachelstufe ${r.sourceZoom}, ${r.tiles} Kacheln${missing} · Jahrgang ${r.year}`;
    ui.share.hidden = !(navigator.share && navigator.canShare);
    ui.resultStatus.textContent = '';
    showStep(3);
  }

  function fileName(ext) {
    const r = state.result;
    const slug = (r.name || 'luftbild').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'luftbild';
    return `${slug}-${r.year}.${ext}`;
  }

  /** PNG oder JPEG aus dem fertigen Bild erzeugen (einmal je Format). */
  async function getBlob(kind) {
    if (state.blobs[kind]) return state.blobs[kind];
    ui.resultStatus.textContent = `${kind.toUpperCase()} wird erzeugt …`;
    await new Promise((r) => setTimeout(r, 20));
    const blob = kind === 'png'
      ? await canvasToBlob(state.result.canvas, 'image/png')
      : await canvasToBlob(state.result.canvas, 'image/jpeg', 0.93);
    state.blobs[kind] = blob;
    ui.resultStatus.textContent = `${kind.toUpperCase()}: ${(blob.size / 1048576).toFixed(1)} MB`;
    return blob;
  }

  async function download(kind) {
    if (!state.result || state.busy) return;
    state.busy = true;
    try {
      const blob = await getBlob(kind);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName(kind === 'png' ? 'png' : 'jpg');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast(err.message || 'Datei konnte nicht erzeugt werden.');
    } finally {
      state.busy = false;
    }
  }
  ui.downloadPng.addEventListener('click', () => download('png'));
  ui.downloadJpeg.addEventListener('click', () => download('jpeg'));

  ui.share.addEventListener('click', async () => {
    if (!state.result || state.busy) return;
    state.busy = true;
    try {
      const blob = await getBlob('jpeg');
      const file = new File([blob], fileName('jpg'), { type: 'image/jpeg' });
      if (!navigator.canShare({ files: [file] })) { toast('Dieser Browser kann keine Bilder teilen; bitte herunterladen.'); return; }
      await navigator.share({ files: [file], title: state.result.name || 'Luftbild' });
    } catch (err) {
      if (err?.name !== 'AbortError') toast('Teilen nicht möglich; bitte herunterladen.');
    } finally {
      state.busy = false;
    }
  });
  ui.again.addEventListener('click', () => { showStep(1); scheduleLookup(); });

  return { open, close, isOpen: () => state.open };
}
