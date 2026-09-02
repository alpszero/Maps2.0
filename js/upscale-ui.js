// Oberfläche der Hochskalier-Funktion (Rahmen, Panel, Vergleich, Export).

import { METHODS, FACTORS, describeFrame, captureSource, upscale, canvasToBlob, formatMeters } from './upscale.js';

const $ = (sel, root = document) => root.querySelector(sel);

export function setupUpscale({ map, button, panel, frame, getEntries, closeOthers, onToggle, toast }) {
  const ui = {
    close: $('.panel-close', panel),
    step1: $('#up-step1', panel),
    step2: $('#up-step2', panel),
    year: $('#up-year', panel),
    info: $('#up-info', panel),
    hint: $('#up-hint', panel),
    capture: $('#up-capture', panel),
    captureProgress: $('#up-capture-progress', panel),
    thumb: $('#up-thumb', panel),
    srcMeta: $('#up-src-meta', panel),
    back: $('#up-back', panel),
    methods: $('#up-methods', panel),
    factors: $('#up-factors', panel),
    denoiseRow: $('#up-denoise-row', panel),
    denoise: $('#up-denoise', panel),
    denoiseLabel: $('#up-denoise-label', panel),
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
    open: $('#up-open', panel),
    fit: $('#up-fit', panel),
  };

  const state = {
    open: false,
    source: null,      // {canvas, zoom, timestamp, metersPerPx}
    result: null,      // {canvas, method, factor, ms}
    method: METHODS[0].key,
    factor: 2,
    denoise: 0.5,
    controller: null,
  };

  function syncMethodOptions() {
    const m = METHODS.find((x) => x.key === state.method);
    ui.denoiseRow.hidden = m?.kind !== 'realesrgan';
  }
  ui.denoise.addEventListener('input', () => {
    state.denoise = Number(ui.denoise.value);
    ui.denoiseLabel.textContent = `${Math.round(state.denoise * 100)} %`;
  });

  // --- Methoden & Faktoren --------------------------------------------------
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
  syncMethodOptions();
  for (const f of FACTORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg' + (f === state.factor ? ' is-active' : '');
    b.textContent = `${f}×`;
    b.setAttribute('aria-pressed', String(f === state.factor));
    b.addEventListener('click', () => {
      state.factor = f;
      for (const s of ui.factors.children) {
        const on = s === b;
        s.classList.toggle('is-active', on);
        s.setAttribute('aria-pressed', String(on));
      }
    });
    ui.factors.appendChild(b);
  }

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
  function updateInfo() {
    if (!state.open || ui.step1.hidden) return;
    const d = describeFrame(map, frame);
    ui.info.textContent = `${d.srcPx} × ${d.srcPx} px · ≈ ${formatMeters(d.metersPerPx)}/px · ${formatMeters(d.widthM)} breit`;
    if (d.tooSmall) ui.hint.textContent = 'Ausschnitt sehr klein. Etwas herauszoomen.';
    else if (!d.native) ui.hint.textContent = 'Für die volle Auflösung (≈10 cm) näher heranzoomen. Grössere Ausschnitte werden vor dem Vergrössern verkleinert geladen.';
    else ui.hint.textContent = 'Volle Auflösung der Kacheln. Karte verschieben oder zoomen, um den Ausschnitt zu setzen.';
    ui.capture.disabled = d.tooSmall;
  }
  map.on('move', updateInfo);
  map.on('zoom', updateInfo);
  window.addEventListener('resize', updateInfo);

  ui.capture.addEventListener('click', async () => {
    const d = describeFrame(map, frame);
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
    ui.thumb.height = Math.round((160 * s.canvas.height) / s.canvas.width);
    ctx.drawImage(s.canvas, 0, 0, ui.thumb.width, ui.thumb.height);
    const yearLabel = s.timestamp === 'current' ? 'aktuellster Stand' : `Jahrgang ${s.timestamp.slice(0, 4)}`;
    const missing = s.failed ? ` · ${s.failed} von ${s.total} Kacheln fehlen` : '';
    ui.srcMeta.textContent = `${s.canvas.width} × ${s.canvas.height} px · ≈ ${formatMeters(s.metersPerPx)}/px · ${yearLabel}${missing}`;
    ui.result.hidden = true;
    ui.progress.hidden = true;
    ui.status.textContent = '';
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
      const canvas = await upscale(state.source.canvas, state.method, state.factor, {
        signal: state.controller.signal,
        denoise: state.denoise,
        onProgress: (p) => { ui.progressBar.style.width = `${Math.round(p * 100)}%`; },
        onStatus: (s) => { ui.status.textContent = s; },
      });
      const ms = performance.now() - t0;
      state.result = { canvas, method: method.key, factor: state.factor, denoise: state.denoise, ms };
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
    const extra = method.kind === 'realesrgan' ? ` · Glättung ${Math.round(r.denoise * 100)} %` : '';
    ui.resultMeta.textContent = `${method.label}${extra} · ${r.factor}× · ${r.canvas.width} × ${r.canvas.height} px · ≈ ${formatMeters(s.metersPerPx / r.factor)}/px · ${secs}`;
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

  ui.download.addEventListener('click', async () => {
    if (!state.result) return;
    try {
      const blob = await canvasToBlob(state.result.canvas, 'image/png');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName('png');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { toast(err.message); }
  });

  ui.open.addEventListener('click', async () => {
    if (!state.result) return;
    try {
      const blob = await canvasToBlob(state.result.canvas, 'image/png');
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) toast('Popup blockiert. Bitte «Herunterladen» verwenden.');
    } catch (err) { toast(err.message); }
  });

  return { open, close, isOpen: () => state.open };
}
