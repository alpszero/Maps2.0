// Oberfläche der Hochskalier-Funktion (Rahmen, Panel, Vergleich, Export).

import {
  METHODS, FACTORS, PRESETS, FORMATS, MAX_OUTPUT_EDGE,
  describeFrame, captureSource, upscale, polishCanvas, canvasToBlob, formatMeters, printSize,
} from './upscale.js';

const $ = (sel, root = document) => root.querySelector(sel);

export function setupUpscale({ map, button, panel, frame, getEntries, closeOthers, onToggle, toast }) {
  const ui = {
    close: $('.panel-close', panel),
    step1: $('#up-step1', panel),
    step2: $('#up-step2', panel),
    year: $('#up-year', panel),
    preset: $('#up-preset', panel),
    format: $('#up-format', panel),
    info: $('#up-info', panel),
    hint: $('#up-hint', panel),
    capture: $('#up-capture', panel),
    captureProgress: $('#up-capture-progress', panel),
    thumb: $('#up-thumb', panel),
    srcMeta: $('#up-src-meta', panel),
    back: $('#up-back', panel),
    methods: $('#up-methods', panel),
    factors: $('#up-factors', panel),
    factorHint: $('#up-factor-hint', panel),
    denoiseRow: $('#up-denoise-row', panel),
    denoise: $('#up-denoise', panel),
    denoiseLabel: $('#up-denoise-label', panel),
    polish: $('#up-polish', panel),
    run: $('#up-run', panel),
    cancel: $('#up-cancel', panel),
    progress: $('#up-progress', panel),
    progressBar: $('#up-progress-bar', panel),
    status: $('#up-status', panel),
    result: $('#up-result', panel),
    compare: $('#up-compare', panel),
    before: $('#up-before', panel),
    after: $('#up-after', panel),
    divider: $('#up-divider', panel),
    resultMeta: $('#up-result-meta', panel),
    download: $('#up-download', panel),
    downloadJpeg: $('#up-download-jpeg', panel),
    open: $('#up-open', panel),
    fit: $('#up-fit', panel),
  };
  const frameBox = $('.frame-box', frame) || frame;

  const state = {
    open: false,
    preset: PRESETS.find((p) => p.key === 'quartier') || PRESETS[0],
    format: FORMATS[0],
    source: null,      // {canvas, zoom, timestamp, metersPerPx, failed, total}
    result: null,      // {canvas, method, factor, denoise, polished, ms}
    method: METHODS[0].key,
    factor: 2,
    denoise: 0.5,
    polish: true,
    controller: null,
  };

  // --- Auswahllisten ---------------------------------------------------------
  for (const p of PRESETS) {
    const o = document.createElement('option');
    o.value = p.key; o.textContent = p.label;
    ui.preset.appendChild(o);
  }
  ui.preset.value = state.preset.key;
  ui.preset.addEventListener('change', () => {
    state.preset = PRESETS.find((p) => p.key === ui.preset.value) || state.preset;
    updateInfo();
  });
  for (const f of FORMATS) {
    const o = document.createElement('option');
    o.value = f.key; o.textContent = f.label;
    ui.format.appendChild(o);
  }
  ui.format.value = state.format.key;
  ui.format.addEventListener('change', () => {
    state.format = FORMATS.find((f) => f.key === ui.format.value) || state.format;
    updateInfo();
  });

  for (const m of METHODS) {
    const label = document.createElement('label');
    label.className = 'up-method';
    label.innerHTML = '<input type="radio" name="up-method"><span class="up-method-text"><span class="up-method-name"></span><span class="up-method-note"></span></span>';
    const input = $('input', label);
    input.value = m.key;
    input.checked = m.key === state.method;
    $('.up-method-name', label).textContent = m.label;
    $('.up-method-note', label).textContent = m.note;
    input.addEventListener('change', () => { if (input.checked) { state.method = m.key; syncMethodOptions(); } });
    ui.methods.appendChild(label);
  }
  for (const f of FACTORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg';
    b.dataset.factor = String(f);
    b.textContent = `${f}×`;
    b.addEventListener('click', () => setFactor(f));
    ui.factors.appendChild(b);
  }
  setFactor(state.factor);

  function setFactor(f) {
    state.factor = f;
    for (const s of ui.factors.children) {
      const on = Number(s.dataset.factor) === f;
      s.classList.toggle('is-active', on);
      s.setAttribute('aria-pressed', String(on));
    }
  }

  function syncMethodOptions() {
    const m = METHODS.find((x) => x.key === state.method);
    ui.denoiseRow.hidden = m?.kind !== 'realesrgan';
  }
  ui.denoise.addEventListener('input', () => {
    state.denoise = Number(ui.denoise.value);
    ui.denoiseLabel.textContent = `${Math.round(state.denoise * 100)} %`;
  });
  ui.polish.checked = state.polish;
  ui.polish.addEventListener('change', () => { state.polish = ui.polish.checked; });
  syncMethodOptions();

  // --- Öffnen / Schliessen --------------------------------------------------
  function open() {
    closeOthers();
    state.open = true;
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    fillYears();
    showStep(1);
    updateInfo();
    onToggle?.();
  }
  function close() {
    state.open = false;
    panel.hidden = true;
    frame.hidden = true;
    document.body.classList.remove('is-framing');
    button.setAttribute('aria-expanded', 'false');
    state.controller?.abort();
    onToggle?.();
  }
  button.addEventListener('click', () => (state.open ? close() : open()));
  ui.close.addEventListener('click', close);

  function fillYears() {
    const current = ui.year.value;
    ui.year.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = 'current';
    opt.textContent = 'Aktuellster Stand (neuste Aufnahmen)';
    ui.year.appendChild(opt);
    const entries = getEntries().slice().reverse();
    for (const e of entries) {
      const o = document.createElement('option');
      o.value = e.ts;
      o.textContent = `Jahrgang ${e.year}`;
      ui.year.appendChild(o);
    }
    ui.year.value = current && [...ui.year.options].some((o) => o.value === current) ? current : 'current';
  }

  function showStep(n) {
    ui.step1.hidden = n !== 1;
    ui.step2.hidden = n !== 2;
    frame.hidden = n !== 1;
    panel.classList.toggle('is-compact', n === 1);
    document.body.classList.toggle('is-framing', n === 1);
  }

  // --- Schritt 1: Ausschnitt -----------------------------------------------
  function frameSpec() {
    return { meters: state.preset.meters, ratio: state.format.ratio };
  }

  function updateInfo() {
    if (!state.open || ui.step1.hidden) return;
    const d = describeFrame(map, frameSpec());
    frameBox.style.width = `${Math.round(d.screenW)}px`;
    frameBox.style.height = `${Math.round(d.screenH)}px`;
    const outW = d.srcW * state.factor, outH = d.srcH * state.factor;
    ui.info.textContent = `${d.srcW} × ${d.srcH} px · ≈ ${formatMeters(d.metersPerPx)}/px · ${formatMeters(d.widthM)} × ${formatMeters(d.heightM)}`;
    const print = `Bei 2× ergibt das ${d.srcW * 2} × ${d.srcH * 2} px, gedruckt ≈ ${printSize(d.srcW * 2).toFixed(0)} × ${printSize(d.srcH * 2).toFixed(0)} cm mit 300 dpi.`;
    ui.hint.textContent = d.fitsScreen
      ? `Volle Auflösung der Kacheln. Karte verschieben, um den Ausschnitt zu setzen. ${print}`
      : `Der Rahmen ist grösser als der Bildschirm; herauszoomen, um ihn ganz zu sehen. ${print}`;
    void outW; void outH;
  }
  map.on('move', updateInfo);
  map.on('zoom', updateInfo);
  window.addEventListener('resize', updateInfo);

  ui.capture.addEventListener('click', async () => {
    const d = describeFrame(map, frameSpec());
    const timestamp = ui.year.value || 'current';
    state.controller?.abort();
    state.controller = new AbortController();
    ui.capture.disabled = true;
    ui.captureProgress.hidden = false;
    ui.captureProgress.value = 0;
    try {
      const res = await captureSource({
        bounds: d.bounds, fetchZoom: d.fetchZoom, timestamp,
        signal: state.controller.signal,
        onProgress: (p) => { ui.captureProgress.value = p; },
      });
      if (res.failed === res.total) throw new Error('Für diesen Ausschnitt gibt es keine Kacheln.');
      const lat = (d.bounds.north + d.bounds.south) / 2;
      const metersPerPx = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** res.zoom);
      state.source = { canvas: res.canvas, zoom: res.zoom, timestamp, metersPerPx, failed: res.failed, total: res.total };
      state.result = null;
      showSource();
      showStep(2);
    } catch (err) {
      if (err?.name !== 'AbortError') toast(err.message || 'Ausschnitt konnte nicht geladen werden.');
    } finally {
      ui.capture.disabled = false;
      ui.captureProgress.hidden = true;
    }
  });

  function showSource() {
    const s = state.source;
    const ctx = ui.thumb.getContext('2d');
    ui.thumb.width = 160;
    ui.thumb.height = Math.max(1, Math.round((160 * s.canvas.height) / s.canvas.width));
    ctx.drawImage(s.canvas, 0, 0, ui.thumb.width, ui.thumb.height);
    const yearLabel = s.timestamp === 'current' ? 'aktuellster Stand' : `Jahrgang ${s.timestamp.slice(0, 4)}`;
    const missing = s.failed ? ` · ${s.failed} von ${s.total} Kacheln fehlen` : '';
    ui.srcMeta.textContent = `${s.canvas.width} × ${s.canvas.height} px · ≈ ${formatMeters(s.metersPerPx)}/px · ${yearLabel}${missing}`;
    ui.result.hidden = true;
    ui.progress.hidden = true;
    ui.status.textContent = '';
    syncFactorLimit();
  }

  // 4× nur, wenn das Ergebnis die Leinwandgrenze einhält.
  function syncFactorLimit() {
    const s = state.source;
    if (!s) return;
    const edge = Math.max(s.canvas.width, s.canvas.height);
    const four = ui.factors.querySelector('[data-factor="4"]');
    const ok4 = edge * 4 <= MAX_OUTPUT_EDGE;
    four.disabled = !ok4;
    if (!ok4 && state.factor === 4) setFactor(2);
    ui.factorHint.textContent = ok4 ? '' : `4× ist bei ${edge} px Quellbreite zu gross (Grenze ${MAX_OUTPUT_EDGE} px). Kleineren Ausschnitt wählen oder 2× verwenden.`;
  }

  ui.back.addEventListener('click', () => { state.controller?.abort(); showStep(1); updateInfo(); });

  // --- Schritt 2: Rechnen ---------------------------------------------------
  ui.run.addEventListener('click', async () => {
    if (!state.source) return;
    state.controller?.abort();
    state.controller = new AbortController();
    const method = METHODS.find((m) => m.key === state.method);
    ui.run.disabled = true;
    ui.cancel.hidden = false;
    ui.progress.hidden = false;
    ui.progressBar.style.width = '0%';
    ui.result.hidden = true;
    ui.status.textContent = 'Vorbereitung …';
    const t0 = performance.now();
    try {
      let canvas = await upscale(state.source.canvas, state.method, state.factor, {
        signal: state.controller.signal,
        denoise: state.denoise,
        onProgress: (p) => { ui.progressBar.style.width = `${Math.round(p * (state.polish ? 90 : 100))}%`; },
        onStatus: (s) => { ui.status.textContent = s; },
      });
      if (state.polish) {
        canvas = await polishCanvas(canvas, {
          signal: state.controller.signal,
          onProgress: (p) => { ui.progressBar.style.width = `${Math.round(90 + p * 10)}%`; },
          onStatus: (s) => { ui.status.textContent = s; },
        });
      }
      const ms = performance.now() - t0;
      state.result = { canvas, method: method.key, factor: state.factor, denoise: state.denoise, polished: state.polish, ms };
      showResult();
    } catch (err) {
      if (err?.name === 'AbortError') ui.status.textContent = 'Abgebrochen.';
      else {
        console.warn(err);
        ui.status.textContent = `Fehlgeschlagen: ${err.message || err}`;
      }
    } finally {
      ui.run.disabled = false;
      ui.cancel.hidden = true;
      ui.progress.hidden = !state.result;
    }
  });
  ui.cancel.addEventListener('click', () => state.controller?.abort());

  // --- Ergebnis --------------------------------------------------------------
  let fitMode = true;

  function showResult() {
    const r = state.result, s = state.source;
    const method = METHODS.find((m) => m.key === r.method);
    ui.status.textContent = '';
    ui.progress.hidden = true;
    ui.result.hidden = false;

    // Vorher: Quelle ohne Glättung auf Ergebnisgrösse gebracht.
    ui.before.width = r.canvas.width; ui.before.height = r.canvas.height;
    const bctx = ui.before.getContext('2d');
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(s.canvas, 0, 0, r.canvas.width, r.canvas.height);
    ui.after.width = r.canvas.width; ui.after.height = r.canvas.height;
    ui.after.getContext('2d').drawImage(r.canvas, 0, 0);

    ui.divider.value = '50';
    applyDivider();
    applyFit();
    const secs = r.ms >= 1000 ? `${(r.ms / 1000).toFixed(1)} s` : `${Math.round(r.ms)} ms`;
    const extra = (method.kind === 'realesrgan' ? ` · Glättung ${Math.round(r.denoise * 100)} %` : '') + (r.polished ? ' · veredelt' : '');
    const print = `≈ ${printSize(r.canvas.width).toFixed(0)} × ${printSize(r.canvas.height).toFixed(0)} cm bei 300 dpi`;
    ui.resultMeta.textContent = `${method.label}${extra} · ${r.factor}× · ${r.canvas.width} × ${r.canvas.height} px · ≈ ${formatMeters(s.metersPerPx / r.factor)}/px · ${print} · ${secs}`;
    ui.result.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  function applyDivider() {
    const pct = Number(ui.divider.value);
    ui.before.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    ui.compare.style.setProperty('--split', `${pct}%`);
  }
  ui.divider.addEventListener('input', applyDivider);

  function applyFit() {
    ui.compare.classList.toggle('is-fit', fitMode);
    ui.fit.textContent = fitMode ? '1:1 anzeigen' : 'Einpassen';
  }
  ui.fit.addEventListener('click', () => { fitMode = !fitMode; applyFit(); });

  function fileName(ext) {
    const s = state.source, r = state.result;
    const y = s.timestamp === 'current' ? 'aktuell' : s.timestamp.slice(0, 4);
    return `zeitreise-${y}-${r.method}-${r.factor}x.${ext}`;
  }

  async function download(type, ext, quality) {
    if (!state.result) return;
    try {
      const blob = await canvasToBlob(state.result.canvas, type, quality);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName(ext);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { toast(err.message); }
  }
  ui.download.addEventListener('click', () => download('image/png', 'png'));
  ui.downloadJpeg.addEventListener('click', () => download('image/jpeg', 'jpg', 0.93));

  ui.open.addEventListener('click', async () => {
    if (!state.result) return;
    try {
      const blob = await canvasToBlob(state.result.canvas, 'image/jpeg', 0.93);
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) toast('Popup blockiert. Bitte «Herunterladen» verwenden.');
    } catch (err) { toast(err.message); }
  });

  return { open, close, isOpen: () => state.open };
}
