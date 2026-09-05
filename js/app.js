// Einstiegspunkt: Karte, Zeitregler, Suche, Ebenen, Standort, Insta-Bild, Orte.

import { Map as MapLibreMap } from '../vendor/maplibre-gl/maplibre-gl.mjs';
import {
  DEFAULT_CENTER, DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, MAX_BOUNDS, SWISS_BOUNDS,
  PLAY_INTERVAL_MS, OVERLAYS, ATTRIBUTION,
} from './config.js';
import { getSwissimageTimestamps, identifyFlightInfo } from './geoadmin.js';
import { Timeline } from './timeline.js';
import { Overlays } from './layers.js';
import { setupSearch } from './search.js';
import { FrameSelector } from './frame.js';
import { setupInsta } from './insta-ui.js';
import { randomPlace, locatePlace } from './places.js';

const $ = (sel) => document.querySelector(sel);

const ui = {
  yearBig: $('#year-big'),
  yearSub: $('#year-sub'),
  slider: $('#year-slider'),
  sliderMin: $('#slider-min'),
  sliderMax: $('#slider-max'),
  sliderCurrent: $('#slider-current'),
  btnPrev: $('#btn-prev'),
  btnNext: $('#btn-next'),
  btnPlay: $('#btn-play'),
  btnLocate: $('#btn-locate'),
  btnLayers: $('#btn-layers'),
  btnInsta: $('#btn-insta'),
  btnRandom: $('#btn-random'),
  btnInfo: $('#btn-info'),
  layersPanel: $('#layers-panel'),
  layersList: $('#layers-list'),
  layersBadge: $('#layers-badge'),
  infoPanel: $('#info-panel'),
  instaPanel: $('#insta-panel'),
  frame: $('#frame'),
  placeCard: $('#place-card'),
  placeName: $('#place-name'),
  placeSub: $('#place-sub'),
  placeNext: $('#place-next'),
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
let instaCtl = null;
let frame = null;
let flightCache = new Map();
let metaController = null;
let metaTimer = null;
let playTimer = null;
let userActed = false; // Suche, Zufallsort oder Ziehen: dann kein Sprung zum Standort mehr
let lastPlace = null;

map.on('dragstart', () => { userActed = true; });

map.on('load', async () => {
  const entries = await getSwissimageTimestamps();
  timeline = new Timeline(map, entries);
  overlays = new Overlays(map);
  overlays.onChange(updateLayersBadge);

  setupSlider();
  setupControls();
  setupLayersPanel();
  setupInfoPanel();
  setupRandom();
  frame = new FrameSelector(map, ui.frame);
  instaCtl = setupInsta({
    map, frame,
    button: ui.btnInsta,
    panel: ui.instaPanel,
    getYear: () => {
      const entry = timeline.current;
      const info = flightCache.get(metaKey(entry));
      return { ts: entry.ts, year: info?.year || entry.year };
    },
    closeOthers: closePanels,
    onToggle: syncPanelState,
    toast,
  });
  setupSearch({
    input: ui.searchInput,
    results: ui.searchResults,
    onSelect: (hit) => {
      userActed = true;
      hidePlaceCard();
      map.flyTo({ center: [hit.lon, hit.lat], zoom: hit.zoom, duration: 1200, essential: true });
    },
  });

  timeline.onChange(() => { renderYear(); scheduleMeta(); });
  map.on('moveend', scheduleMeta);
  renderYear();
  scheduleMeta();
  ui.attribution.textContent = ATTRIBUTION;
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
  ui.btnLocate.addEventListener('click', () => { hidePlaceCard(); locate({ silent: false, force: true }); });
  document.addEventListener('keydown', (ev) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
    if (ev.key === 'ArrowLeft') { stopPlay(); timeline.prev(); }
    else if (ev.key === 'ArrowRight') { stopPlay(); timeline.next(); }
    else if (ev.key === ' ') { ev.preventDefault(); playTimer ? stopPlay() : startPlay(); }
    else if (ev.key === 'Escape') { closePanels(); hidePlaceCard(); }
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

function prefetchNeighbours(center) {
  for (const i of [timeline.index - 1, timeline.index + 1]) {
    const e = timeline.entries[i];
    if (!e) continue;
    const key = metaKey(e, center);
    if (flightCache.has(key)) continue;
    flightCache.set(key, undefined);
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

function locate({ silent, force = false }) {
  if (!('geolocation' in navigator)) {
    if (!silent) toast('Standortbestimmung nicht verfügbar');
    return;
  }
  ui.btnLocate.classList.add('is-busy');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      ui.btnLocate.classList.remove('is-busy');
      if (!force && userActed) return; // der Nutzer ist schon anderswo unterwegs
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
// Ebenen: Ortsnamen, Gelände

function setupLayersPanel() {
  ui.btnLayers.addEventListener('click', () => togglePanel(ui.layersPanel));
  ui.layersPanel.querySelector('.panel-close').addEventListener('click', () => togglePanel(ui.layersPanel, false));

  for (const def of OVERLAYS) {
    const row = document.createElement('label');
    row.className = 'switch-row';
    row.innerHTML = '<span class="switch-text"><span class="switch-label"></span><span class="switch-note"></span></span>'
      + '<input type="checkbox" role="switch" class="switch">';
    row.querySelector('.switch-label').textContent = def.label;
    row.querySelector('.switch-note').textContent = def.note;
    const cb = row.querySelector('input');
    cb.addEventListener('change', async () => {
      cb.disabled = true;
      try {
        await overlays.toggle(def.key, cb.checked);
      } catch (err) {
        cb.checked = false;
        toast(`Ebene konnte nicht geladen werden: ${def.label}`);
        console.warn(err);
      }
      cb.disabled = false;
    });
    ui.layersList.appendChild(row);
  }
}

function updateLayersBadge() {
  const n = overlays.active.size;
  ui.layersBadge.textContent = n ? String(n) : '';
  ui.layersBadge.hidden = !n;
}

// ---------------------------------------------------------------------------
// Bekannte Orte von oben

let placeController = null;

function setupRandom() {
  const go = async () => {
    userActed = true;
    closePanels();
    stopPlay();
    const p = randomPlace(lastPlace);
    lastPlace = p;
    ui.placeName.textContent = p.name;
    ui.placeSub.textContent = p.sub;
    ui.placeCard.hidden = false;
    // Lage über das Ortsverzeichnis nachschärfen, dann fliegen.
    placeController?.abort();
    placeController = new AbortController();
    let target = { lng: p.lng, lat: p.lat };
    try {
      target = await locatePlace(p, { signal: placeController.signal });
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    if (lastPlace !== p) return;
    map.flyTo({ center: [target.lng, target.lat], zoom: p.zoom, duration: 1800, curve: 1.6, essential: true });
  };
  ui.btnRandom.addEventListener('click', go);
  ui.placeNext.addEventListener('click', go);
  ui.placeCard.querySelector('.panel-close').addEventListener('click', hidePlaceCard);
}

function hidePlaceCard() {
  ui.placeCard.hidden = true;
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
  hidePlaceCard();
  ui.layersPanel.hidden = true;
  ui.infoPanel.hidden = true;
  ui.btnLayers.setAttribute('aria-expanded', 'false');
  ui.btnInfo.setAttribute('aria-expanded', 'false');
  if (instaCtl?.isOpen()) instaCtl.close();
  syncPanelState();
}

// Auf kleinen Bildschirmen verdecken offene Panels die Seitenknöpfe; diese
// werden dann ausgeblendet (Schliessen über das × im Panel).
function syncPanelState() {
  const anyOpen = [ui.layersPanel, ui.infoPanel, ui.instaPanel].some((p) => !p.hidden);
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
  get frame() { return frame; },
  get lastPlace() { return lastPlace; },
};
