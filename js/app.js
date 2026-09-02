// Einstiegspunkt: Karte, Zeitregler, Suche, Zusatzebenen, Standort.

import { Map as MapLibreMap } from '../vendor/maplibre-gl/maplibre-gl.mjs';
import {
  DEFAULT_CENTER, DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, MAX_BOUNDS, SWISS_BOUNDS,
  PLAY_INTERVAL_MS, THEMES, ATTRIBUTION,
} from './config.js';
import { getSwissimageTimestamps, identifyFlightInfo } from './geoadmin.js';
import { Timeline } from './timeline.js';
import { Overlays, listThemeLayers } from './overlays.js';
import { setupSearch } from './search.js';
import { setupUpscale } from './upscale-ui.js';

const $ = (sel) => document.querySelector(sel);

const ui = {
  yearBig: $('#year-big'),
  yearSub: $('#year-sub'),
  slider: $('#year-slider'),
  sliderMin: $('#slider-min'),
  sliderMax: $('#slider-max'),
  sliderCurrent: $('#slider-current'),
  btnUpscale: $('#btn-upscale'),
  upscalePanel: $('#upscale-panel'),
  frame: $('#frame'),
  btnPrev: $('#btn-prev'),
  btnNext: $('#btn-next'),
  btnPlay: $('#btn-play'),
  btnLocate: $('#btn-locate'),
  btnLayers: $('#btn-layers'),
  btnInfo: $('#btn-info'),
  layersPanel: $('#layers-panel'),
  infoPanel: $('#info-panel'),
  themes: $('#themes'),
  layersBadge: $('#layers-badge'),
  attribution: $('#attribution'),
  toast: $('#toast'),
  searchInput: $('#search-input'),
  searchResults: $('#search-results'),
};

// ---------------------------------------------------------------------------
// Karte

const map = new MapLibreMap({
  container: 'map',
  style: {
    version: 8,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0c1117' } }],
  },
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
  maxBounds: MAX_BOUNDS,
  attributionControl: false,
  pitchWithRotate: false,
  dragRotate: false,
  touchPitch: false,
  fadeDuration: 0,
});
map.touchZoomRotate.disableRotation();

// Fehlende Kacheln (kein Bild in diesem Jahrgang) sind normal – nicht als Fehler loggen.
map.on('error', (e) => {
  const status = e?.error?.status;
  if (status === 404 || status === 204 || e?.sourceId) return;
  console.warn('Kartenfehler', e?.error || e);
});

let timeline = null;
let overlays = null;
let upscaleCtl = null;
let flightCache = new Map();
let metaController = null;
let metaTimer = null;
let playTimer = null;

map.on('load', async () => {
  const entries = await getSwissimageTimestamps();
  timeline = new Timeline(map, entries);
  overlays = new Overlays(map);
  overlays.onChange(updateAttribution);

  setupSlider();
  setupControls();
  setupLayersPanel();
  setupInfoPanel();
  upscaleCtl = setupUpscale({
    map,
    button: ui.btnUpscale,
    panel: ui.upscalePanel,
    frame: ui.frame,
    getEntries: () => timeline.entries,
    getCurrentTs: () => timeline.current.ts,
    closeOthers: closePanels,
    onToggle: syncPanelState,
    toast,
  });
  setupSearch({
    input: ui.searchInput,
    results: ui.searchResults,
    onSelect: (hit) => {
      map.flyTo({ center: [hit.lon, hit.lat], zoom: hit.zoom, duration: 1200, essential: true });
    },
  });

  timeline.onChange(() => { renderYear(); scheduleMeta(); });
  map.on('moveend', scheduleMeta);
  renderYear();
  scheduleMeta();
  updateAttribution();
  locate({ silent: true });
});

// ---------------------------------------------------------------------------
// Jahresanzeige und Regler

function setupSlider() {
  const s = ui.slider;
  s.min = '0';
  s.max = String(timeline.length - 1);
  s.step = '1';
  s.value = String(timeline.index);
  ui.sliderMin.textContent = String(timeline.entries[0].year);
  ui.sliderMax.textContent = String(timeline.entries[timeline.length - 1].year);
  ui.sliderCurrent.textContent = `Jahrgang ${timeline.current.year}`;
  s.addEventListener('input', () => {
    stopPlay();
    timeline.show(Number(s.value));
  });
  timeline.onChange((entry, i) => {
    if (Number(s.value) !== i) s.value = String(i);
    ui.sliderCurrent.textContent = `Jahrgang ${entry.year}`;
  });
}

function setupControls() {
  ui.btnPrev.addEventListener('click', () => { stopPlay(); timeline.prev(); });
  ui.btnNext.addEventListener('click', () => { stopPlay(); timeline.next(); });
  ui.btnPlay.addEventListener('click', () => (playTimer ? stopPlay() : startPlay()));
  ui.btnLocate.addEventListener('click', () => locate({ silent: false }));
  document.addEventListener('keydown', (ev) => {
    if (ev.target === ui.searchInput) return;
    if (ev.key === 'ArrowLeft') { stopPlay(); timeline.prev(); }
    else if (ev.key === 'ArrowRight') { stopPlay(); timeline.next(); }
    else if (ev.key === ' ') { ev.preventDefault(); playTimer ? stopPlay() : startPlay(); }
    else if (ev.key === 'Escape') { closePanels(); }
  });
}

function startPlay() {
  if (timeline.index >= timeline.length - 1) timeline.show(0);
  ui.btnPlay.classList.add('is-playing');
  ui.btnPlay.setAttribute('aria-label', 'Pause');
  playTimer = setInterval(() => {
    if (timeline.index >= timeline.length - 1) { stopPlay(); return; }
    timeline.next();
  }, PLAY_INTERVAL_MS);
}

function stopPlay() {
  if (!playTimer) return;
  clearInterval(playTimer);
  playTimer = null;
  ui.btnPlay.classList.remove('is-playing');
  ui.btnPlay.setAttribute('aria-label', 'Abspielen');
}

function renderYear() {
  const entry = timeline.current;
  const info = flightCache.get(metaKey(entry));
  const big = ui.yearBig;
  if (info === undefined) {
    // Noch nicht ermittelt: Jahrgang anzeigen, gedämpft.
    big.textContent = String(entry.year);
    big.classList.add('is-provisional');
    ui.yearSub.textContent = 'Bildaufnahme vom: …';
  } else if (info === null) {
    big.textContent = String(entry.year);
    big.classList.add('is-provisional');
    ui.yearSub.textContent = 'Hier kein Luftbild in diesem Jahrgang';
  } else {
    big.textContent = String(info.year);
    big.classList.remove('is-provisional');
    ui.yearSub.textContent = info.date ? `Bildaufnahme vom: ${info.date}` : `Bildaufnahme: ${info.year}`;
  }
}

// ---------------------------------------------------------------------------
// Aufnahmejahr aus den Metadaten (für die Bildmitte)

function metaKey(entry, center = map.getCenter()) {
  // Auf ca. 100 m gerundet, damit kleine Verschiebungen den Cache nutzen.
  return `${entry.ts}|${center.lng.toFixed(3)}|${center.lat.toFixed(3)}`;
}

function scheduleMeta() {
  clearTimeout(metaTimer);
  metaTimer = setTimeout(fetchMeta, 220);
}

async function fetchMeta() {
  if (!timeline) return;
  const entry = timeline.current;
  const center = map.getCenter();
  const key = metaKey(entry, center);
  if (flightCache.has(key)) { renderYear(); prefetchNeighbours(center); return; }
  if (metaController) metaController.abort();
  metaController = new AbortController();
  const signal = metaController.signal;
  try {
    const info = await identifyFlightInfo(center.lng, center.lat, entry, { signal });
    flightCache.set(key, info);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.warn('Aufnahmejahr nicht ermittelbar', err);
    ui.yearSub.textContent = 'Bildaufnahme: Datum nicht verfügbar';
    return;
  }
  if (signal.aborted) return;
  renderYear();
  prefetchNeighbours(center);
}

// Nachbar-Jahrgänge im Hintergrund abfragen, damit der Wechsel sofort beschriftet ist.
function prefetchNeighbours(center) {
  for (const i of [timeline.index - 1, timeline.index + 1]) {
    const e = timeline.entries[i];
    if (!e) continue;
    const key = metaKey(e, center);
    if (flightCache.has(key)) continue;
    flightCache.set(key, undefined); // Platzhalter gegen Doppelabfragen
    identifyFlightInfo(center.lng, center.lat, e)
      .then((info) => { flightCache.set(key, info); if (timeline.current === e) renderYear(); })
      .catch(() => flightCache.delete(key));
  }
}

// ---------------------------------------------------------------------------
// Standort

function inSwitzerland(lng, lat) {
  return lng >= SWISS_BOUNDS[0] && lng <= SWISS_BOUNDS[2] && lat >= SWISS_BOUNDS[1] && lat <= SWISS_BOUNDS[3];
}

function locate({ silent }) {
  if (!('geolocation' in navigator)) {
    if (!silent) toast('Standortbestimmung nicht verfügbar');
    return;
  }
  ui.btnLocate.classList.add('is-busy');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      ui.btnLocate.classList.remove('is-busy');
      const { longitude: lng, latitude: lat } = pos.coords;
      if (!inSwitzerland(lng, lat)) {
        toast('Der Standort liegt ausserhalb der Schweiz – gezeigt wird Bern.');
        return;
      }
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16), duration: 1000, essential: true });
    },
    (err) => {
      ui.btnLocate.classList.remove('is-busy');
      if (!silent) toast(err.code === 1 ? 'Standortfreigabe verweigert' : 'Standort nicht ermittelbar');
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
  );
}

// ---------------------------------------------------------------------------
// Zusatzebenen

function setupLayersPanel() {
  ui.btnLayers.addEventListener('click', () => togglePanel(ui.layersPanel));
  ui.layersPanel.querySelector('.panel-close').addEventListener('click', () => togglePanel(ui.layersPanel, false));

  for (const theme of THEMES) {
    const details = document.createElement('details');
    details.className = 'theme';
    details.dataset.theme = theme.key;
    const summary = document.createElement('summary');
    summary.innerHTML = `<span class="theme-title"></span><span class="theme-desc"></span><span class="theme-count"></span>`;
    summary.querySelector('.theme-title').textContent = theme.label;
    summary.querySelector('.theme-desc').textContent = theme.description;
    details.appendChild(summary);
    const list = document.createElement('ul');
    list.className = 'layer-list';
    details.appendChild(list);
    details.addEventListener('toggle', () => { if (details.open) fillTheme(theme, list, summary); }, { once: false });
    ui.themes.appendChild(details);
  }
}

const filledThemes = new Set();

async function fillTheme(theme, list, summary) {
  if (filledThemes.has(theme.key)) return;
  filledThemes.add(theme.key);
  list.innerHTML = '<li class="layer-note">Ebenen werden geladen …</li>';
  let layers;
  try {
    layers = await listThemeLayers(theme.key);
  } catch (err) {
    filledThemes.delete(theme.key);
    list.innerHTML = '<li class="layer-note">Verzeichnis des Geoportals nicht erreichbar.</li>';
    console.warn(err);
    return;
  }
  summary.querySelector('.theme-count').textContent = layers.length ? String(layers.length) : '';
  list.innerHTML = '';
  if (!layers.length) {
    list.innerHTML = '<li class="layer-note">Keine passenden Ebenen gefunden.</li>';
    return;
  }
  for (const l of layers) list.appendChild(renderLayerItem(l));
}

function renderLayerItem(l) {
  const li = document.createElement('li');
  li.className = 'layer-item';
  const row = document.createElement('label');
  row.className = 'layer-row';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = overlays.isActive(l.id);
  const name = document.createElement('span');
  name.className = 'layer-name';
  name.textContent = l.label;
  row.append(cb, name);
  li.appendChild(row);

  const opWrap = document.createElement('div');
  opWrap.className = 'layer-opacity';
  opWrap.hidden = !cb.checked;
  const op = document.createElement('input');
  op.type = 'range';
  op.min = '0'; op.max = '1'; op.step = '0.05';
  op.value = String(overlays.active.get(l.id)?.opacity ?? 0.7);
  op.setAttribute('aria-label', `Deckkraft ${l.label}`);
  const opLabel = document.createElement('span');
  opLabel.textContent = `${Math.round(Number(op.value) * 100)} %`;
  opWrap.append(op, opLabel);
  li.appendChild(opWrap);

  cb.addEventListener('change', async () => {
    if (cb.checked) {
      cb.disabled = true;
      try {
        await overlays.add(l.id, Number(op.value));
        op.value = String(overlays.active.get(l.id)?.opacity ?? Number(op.value));
        opLabel.textContent = `${Math.round(Number(op.value) * 100)} %`;
        opWrap.hidden = false;
      } catch (err) {
        cb.checked = false;
        toast(`Ebene konnte nicht geladen werden: ${l.label}`);
        console.warn(err);
      }
      cb.disabled = false;
    } else {
      overlays.remove(l.id);
      opWrap.hidden = true;
    }
    updateLayersBadge();
  });
  op.addEventListener('input', () => {
    overlays.setOpacity(l.id, Number(op.value));
    opLabel.textContent = `${Math.round(Number(op.value) * 100)} %`;
  });
  return li;
}

function updateLayersBadge() {
  const n = overlays.active.size;
  ui.layersBadge.textContent = n ? String(n) : '';
  ui.layersBadge.hidden = !n;
}

function updateAttribution() {
  const extra = overlays ? overlays.attributions().filter((a) => a && !/swisstopo/i.test(a)) : [];
  ui.attribution.textContent = [ATTRIBUTION, ...extra].join(' · ');
}

// ---------------------------------------------------------------------------
// Panels, Hinweise

function setupInfoPanel() {
  ui.btnInfo.addEventListener('click', () => togglePanel(ui.infoPanel));
  ui.infoPanel.querySelector('.panel-close').addEventListener('click', () => togglePanel(ui.infoPanel, false));
}

function togglePanel(panel, open) {
  const willOpen = open ?? panel.hidden;
  closePanels();
  panel.hidden = !willOpen;
  ui.btnLayers.setAttribute('aria-expanded', String(panel === ui.layersPanel && willOpen));
  ui.btnInfo.setAttribute('aria-expanded', String(panel === ui.infoPanel && willOpen));
  syncPanelState();
}

function closePanels() {
  ui.layersPanel.hidden = true;
  ui.infoPanel.hidden = true;
  ui.btnLayers.setAttribute('aria-expanded', 'false');
  ui.btnInfo.setAttribute('aria-expanded', 'false');
  if (upscaleCtl?.isOpen()) upscaleCtl.close();
  syncPanelState();
}

// Auf kleinen Bildschirmen verdecken offene Panels die Seitenknöpfe; diese
// werden dann ausgeblendet (Schliessen über das × im Panel).
function syncPanelState() {
  const anyOpen = !ui.layersPanel.hidden || !ui.infoPanel.hidden || !ui.upscalePanel.hidden;
  document.body.classList.toggle('has-panel', anyOpen);
}

let toastTimer = null;
function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 3500);
}

// Für Tests und die Konsole.
window.zeitreise = {
  map,
  get timeline() { return timeline; },
  get overlays() { return overlays; },
};
