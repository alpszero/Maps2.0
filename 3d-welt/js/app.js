// Einstieg: Szene, Zeitreise, Suche, 3D-Objekte, Zusatzebenen, Bedienung.

import {
  TILESETS, DEFAULT_VIEW, SWISS_BOUNDS, PLAY_INTERVAL_MS,
} from './config.js';
import { getSwissimageTimestamps, identifyFlightInfo } from './geoadmin.js';
import {
  createViewer, flyToPoint, setCamera, cameraState, groundPointAtCenter, reorient,
  startOrbit, stopOrbit, isOrbiting, setTilesetVisible,
} from './scene.js';
import { Timeline } from './timeline.js';
import { setupSearch } from './search.js';
import { Overlays } from './overlays.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  globe: $('#globe'),
  loading: $('#loading'),
  toast: $('#toast'),
  yearBig: $('#year-big'),
  yearSub: $('#year-sub'),
  slider: $('#year-slider'),
  yearMin: $('#year-min'),
  yearMax: $('#year-max'),
  play: $('#btn-play'),
  prev: $('#btn-prev'),
  next: $('#btn-next'),
  locate: $('#btn-locate'),
  north: $('#btn-north'),
  tilt: $('#btn-tilt'),
  orbit: $('#btn-orbit'),
  layers: $('#btn-layers'),
  info: $('#btn-info'),
  share: $('#btn-share'),
  panelLayers: $('#panel-layers'),
  panelInfo: $('#panel-info'),
  tilesetList: $('#tileset-list'),
  overlaySearch: $('#overlay-search'),
  overlayResults: $('#overlay-results'),
  overlayActive: $('#overlay-active'),
  search: {
    form: $('#search-form'),
    input: $('#search-input'),
    clear: $('#search-clear'),
    list: $('#search-results'),
  },
};

if (!window.Cesium) {
  fail('Cesium konnte nicht geladen werden (vendor/cesium/Cesium.js fehlt).');
  throw new Error('Cesium fehlt');
}

let viewer;
let terrainReady;
try {
  ({ viewer, terrainReady } = createViewer(els.globe));
} catch (err) {
  console.error(err);
  fail('3D-Darstellung nicht möglich. Der Browser unterstützt kein WebGL oder die Grafik ist deaktiviert.');
  throw err;
}

// Für Fehlersuche in der Browserkonsole.
window.app = { viewer };

const overlays = new Overlays(viewer, () => timeline?.baseLayerCount ?? 0);
let timeline = null;
let playTimer = null;

// ---------------------------------------------------------------------------
// Start

main().catch((err) => {
  console.error(err);
  toast('Start fehlgeschlagen: ' + (err?.message || err), 6000);
});

async function main() {
  // Gelände-Fehler melden (z. B. kein Netz), die App bleibt bedienbar.
  viewer.scene.terrainProviderChanged.addEventListener(() => viewer.scene.requestRender());
  watchTerrain();

  const fromHash = parseHash();
  if (fromHash) setCamera(viewer, fromHash);
  else {
    setCamera(viewer, { lon: DEFAULT_VIEW.lon - 0.02, lat: DEFAULT_VIEW.lat - 0.02, height: 2500, heading: DEFAULT_VIEW.heading, pitch: DEFAULT_VIEW.pitch });
    flyToPoint(viewer, DEFAULT_VIEW.lon, DEFAULT_VIEW.lat, { range: DEFAULT_VIEW.range, heading: DEFAULT_VIEW.heading, pitch: DEFAULT_VIEW.pitch, duration: 3 });
  }

  const entries = await getSwissimageTimestamps();
  timeline = new Timeline(viewer, entries, onYearChange);
  setupSlider(entries);
  const startYear = fromHash?.year ?? entries[entries.length - 1].year;
  await timeline.show(timeline.indexOfYear(startYear), { animate: false });
  els.loading.hidden = true;

  setupTilesets();
  setupControls();
  setupOverlayPanel();
  setupSearch(els.search, ({ lon, lat, range }) => {
    stopOrbit(viewer);
    flyToPoint(viewer, lon, lat, { range, heading: 20, pitch: -35 });
  });

  viewer.camera.moveEnd.addEventListener(() => { writeHash(); scheduleFlightInfo(); });
  viewer.camera.moveStart.addEventListener(() => { if (!isOrbiting()) hideFlightInfo(); });
  // history.replaceState löst kein hashchange aus; hier kommt nur eine von
  // aussen geänderte Adresse an (eingefügter Link).
  window.addEventListener('hashchange', () => {
    const h = parseHash();
    if (!h) return;
    setCamera(viewer, h);
    if (h.year) timeline.show(timeline.indexOfYear(h.year));
  });
  scheduleFlightInfo();
}

let terrainErrorShown = false;
function watchTerrain() {
  // Das Geländemodell selbst (layer.json) liess sich nicht laden.
  terrainReady.catch((err) => onTerrainError(err, true));
  // Beim Wechsel (Terrain fertig geladen) den Fehlerkanal des neuen Providers anhängen.
  viewer.scene.terrainProviderChanged.addEventListener((p) => {
    if (p?.errorEvent) p.errorEvent.addEventListener((e) => onTerrainError(e, false));
  });
}

function onTerrainError(err, fatal) {
  if (terrainErrorShown) return;
  // Einzelne fehlende Geländekacheln (am Rand der Schweiz) sind normal.
  if (!fatal && (err?.level === undefined || err.level > 3)) return;
  terrainErrorShown = true;
  console.warn('Gelände:', err);
  toast('Geländemodell nicht erreichbar (3d.geo.admin.ch). Die Karte bleibt flach.', 6000);
}

// ---------------------------------------------------------------------------
// Zeitreise

function setupSlider(entries) {
  els.slider.min = 0;
  els.slider.max = entries.length - 1;
  els.slider.step = 1;
  els.yearMin.textContent = entries[0].year;
  els.yearMax.textContent = entries[entries.length - 1].year;
  els.slider.addEventListener('input', () => {
    const e = entries[Number(els.slider.value)];
    els.yearBig.textContent = e.year; // sofortige Rückmeldung
  });
  els.slider.addEventListener('change', () => timeline.show(Number(els.slider.value)));
  els.prev.addEventListener('click', () => { stopPlay(); timeline.step(-1); });
  els.next.addEventListener('click', () => { stopPlay(); timeline.step(1); });
  els.play.addEventListener('click', () => (playTimer ? stopPlay() : startPlay()));
}

function onYearChange(entry) {
  els.slider.value = timeline.index;
  els.yearBig.textContent = entry.year;
  els.yearSub.textContent = 'Jahrgang';
  overlays.raiseAll();
  writeHash();
  scheduleFlightInfo();
}

function startPlay() {
  if (timeline.index >= timeline.entries.length - 1) timeline.show(0);
  playTimer = setInterval(() => {
    if (timeline.index >= timeline.entries.length - 1) { stopPlay(); return; }
    timeline.step(1);
  }, PLAY_INTERVAL_MS);
  els.play.classList.add('on');
  els.play.setAttribute('aria-label', 'Anhalten');
}

function stopPlay() {
  clearInterval(playTimer);
  playTimer = null;
  els.play.classList.remove('on');
  els.play.setAttribute('aria-label', 'Abspielen');
}

// Aufnahmejahr für die Bildmitte (Metadaten der Zeitreise)
let flightTimer = null;
let flightController = null;
const flightCache = new Map();

function scheduleFlightInfo() {
  clearTimeout(flightTimer);
  flightTimer = setTimeout(loadFlightInfo, 500);
}

function hideFlightInfo() {
  els.yearSub.textContent = 'Jahrgang';
}

async function loadFlightInfo() {
  if (!timeline?.entry) return;
  const p = groundPointAtCenter(viewer);
  if (!p) { hideFlightInfo(); return; }
  if (!inSwitzerland(p.lon, p.lat)) { els.yearSub.textContent = 'Ausserhalb der Schweiz'; return; }
  const entry = timeline.entry;
  const key = `${entry.ts}|${p.lon.toFixed(3)}|${p.lat.toFixed(3)}`;
  flightController?.abort();
  flightController = new AbortController();
  try {
    let info = flightCache.get(key);
    if (info === undefined) {
      info = await identifyFlightInfo(p.lon, p.lat, entry, { signal: flightController.signal });
      flightCache.set(key, info);
    }
    if (entry !== timeline.entry) return;
    if (!info) els.yearSub.textContent = 'Hier nicht beflogen';
    else if (info.date) els.yearSub.textContent = `Aufnahme ${info.date}`;
    else els.yearSub.textContent = info.year === entry.year ? 'Aufnahmejahr' : `Aufnahme ${info.year}`;
  } catch (err) {
    if (err?.name !== 'AbortError') els.yearSub.textContent = 'Jahrgang';
  }
}

// ---------------------------------------------------------------------------
// 3D-Objekte

function setupTilesets() {
  els.tilesetList.innerHTML = '';
  for (const t of TILESETS) {
    const row = document.createElement('label');
    row.className = 'row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = t.defaultOn;
    const text = document.createElement('span');
    text.innerHTML = `<b></b><small></small>`;
    text.querySelector('b').textContent = t.label;
    text.querySelector('small').textContent = t.description;
    row.append(cb, text);
    els.tilesetList.appendChild(row);
    const apply = async () => {
      row.classList.add('busy');
      try {
        await setTilesetVisible(viewer, t.key, cb.checked);
      } catch (err) {
        console.warn(err);
        cb.checked = false;
        toast(`${t.label} konnten nicht geladen werden.`, 4000);
      } finally {
        row.classList.remove('busy');
      }
    };
    cb.addEventListener('change', apply);
    if (t.defaultOn) apply();
  }
}

// ---------------------------------------------------------------------------
// Bedienung

function setupControls() {
  els.locate.addEventListener('click', locate);
  els.north.addEventListener('click', () => { stopOrbit(viewer); reorient(viewer, { heading: 0 }); });
  els.tilt.addEventListener('click', () => {
    stopOrbit(viewer);
    const { pitch } = cameraState(viewer);
    const topDown = pitch < -80;
    reorient(viewer, { pitch: topDown ? -40 : -90 });
    els.tilt.classList.toggle('on', !topDown);
  });
  els.orbit.addEventListener('click', () => {
    if (isOrbiting()) { stopOrbit(viewer); els.orbit.classList.remove('on'); return; }
    if (startOrbit(viewer)) els.orbit.classList.add('on');
    else toast('Für den Rundflug muss Gelände in der Bildmitte liegen.', 3000);
  });
  // Jede Berührung beendet den Rundflug.
  viewer.canvas.addEventListener('pointerdown', () => { if (isOrbiting()) { stopOrbit(viewer); els.orbit.classList.remove('on'); } });
  viewer.canvas.addEventListener('wheel', () => { if (isOrbiting()) { stopOrbit(viewer); els.orbit.classList.remove('on'); } }, { passive: true });

  els.layers.addEventListener('click', () => togglePanel(els.panelLayers, els.layers));
  els.info.addEventListener('click', () => togglePanel(els.panelInfo, els.info));
  document.querySelectorAll('.panel .close').forEach((b) => b.addEventListener('click', closePanels));
  els.share.addEventListener('click', share);

  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowLeft') timeline.step(-1);
    else if (e.key === 'ArrowRight') timeline.step(1);
    else if (e.key === ' ') { e.preventDefault(); playTimer ? stopPlay() : startPlay(); }
    else if (e.key === 'Escape') closePanels();
  });
}

function togglePanel(panel, button) {
  const open = panel.hidden;
  closePanels();
  if (open) { panel.hidden = false; button.classList.add('on'); }
}

function closePanels() {
  for (const p of [els.panelLayers, els.panelInfo]) p.hidden = true;
  for (const b of [els.layers, els.info]) b.classList.remove('on');
}

function locate() {
  if (!navigator.geolocation) { toast('Standort im Browser nicht verfügbar.'); return; }
  els.locate.classList.add('busy');
  navigator.geolocation.getCurrentPosition((pos) => {
    els.locate.classList.remove('busy');
    const { longitude: lon, latitude: lat } = pos.coords;
    if (!inSwitzerland(lon, lat)) { toast('Standort liegt ausserhalb der Schweiz. Daten gibt es nur für die Schweiz.', 5000); }
    stopOrbit(viewer);
    flyToPoint(viewer, lon, lat, { range: 1200, heading: 0, pitch: -40 });
  }, (err) => {
    els.locate.classList.remove('busy');
    toast(err.code === 1 ? 'Standortfreigabe verweigert.' : 'Standort nicht ermittelbar.', 4000);
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

async function share() {
  writeHash();
  const url = location.href;
  try {
    if (navigator.share) { await navigator.share({ title: document.title, url }); return; }
    await navigator.clipboard.writeText(url);
    toast('Link in die Zwischenablage kopiert.');
  } catch (err) {
    if (err?.name !== 'AbortError') toast('Link: ' + url, 6000);
  }
}

// ---------------------------------------------------------------------------
// Zusatzebenen-Panel

function setupOverlayPanel() {
  let timer = null;
  els.overlaySearch.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(renderOverlayResults, 200);
  });
  renderActiveOverlays();
}

async function renderOverlayResults() {
  const text = els.overlaySearch.value.trim();
  els.overlayResults.innerHTML = '';
  if (text.length < 2) return;
  let hits;
  try {
    hits = await overlays.search(text);
  } catch (err) {
    console.warn(err);
    els.overlayResults.innerHTML = '<li class="hint">Verzeichnis des Geoportals nicht erreichbar.</li>';
    return;
  }
  if (!hits.length) { els.overlayResults.innerHTML = '<li class="hint">Keine Ebene gefunden.</li>'; return; }
  for (const h of hits) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = h.label;
    b.disabled = overlays.isActive(h.id);
    b.addEventListener('click', async () => {
      b.disabled = true;
      b.classList.add('busy');
      try {
        await overlays.add(h.id);
        renderActiveOverlays();
      } catch (err) {
        console.warn(err);
        b.disabled = false;
        toast('Diese Ebene lässt sich hier nicht darstellen.', 4000);
      } finally {
        b.classList.remove('busy');
      }
    });
    li.appendChild(b);
    els.overlayResults.appendChild(li);
  }
}

function renderActiveOverlays() {
  els.overlayActive.innerHTML = '';
  if (!overlays.active.length) {
    els.overlayActive.innerHTML = '<li class="hint">Keine Zusatzebene aktiv.</li>';
    return;
  }
  for (const a of overlays.active) {
    const li = document.createElement('li');
    li.className = 'active-layer';
    const name = document.createElement('span');
    name.textContent = a.label;
    const range = document.createElement('input');
    range.type = 'range'; range.min = 0; range.max = 1; range.step = 0.05; range.value = a.opacity;
    range.setAttribute('aria-label', `Deckkraft ${a.label}`);
    range.addEventListener('input', () => overlays.setOpacity(a.id, Number(range.value)));
    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'remove'; rm.textContent = '×';
    rm.setAttribute('aria-label', `${a.label} entfernen`);
    rm.addEventListener('click', () => { overlays.remove(a.id); renderActiveOverlays(); renderOverlayResults(); });
    li.append(name, range, rm);
    els.overlayActive.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// URL-Fragment: #lon/lat/höhe/heading/pitch/jahr

let hashTimer = null;

function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const s = cameraState(viewer);
    if (!Number.isFinite(s.lon)) return;
    const heading = ((Math.round(s.heading) % 360) + 360) % 360;
    const parts = [s.lon.toFixed(5), s.lat.toFixed(5), Math.round(s.height), heading, Math.round(s.pitch)];
    if (timeline?.entry) parts.push(timeline.entry.year);
    history.replaceState(null, '', '#' + parts.join('/'));
  }, 250);
}

function parseHash() {
  const m = location.hash.slice(1).split('/').map(Number);
  if (m.length < 3 || m.slice(0, 3).some((v) => !Number.isFinite(v))) return null;
  const [lon, lat, height, heading = 0, pitch = -35, year] = m;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90 || height < 0) return null;
  return { lon, lat, height, heading, pitch, year: Number.isFinite(year) ? year : undefined };
}

// ---------------------------------------------------------------------------
// Hilfen

function inSwitzerland(lon, lat) {
  const [w, s, e, n] = SWISS_BOUNDS;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

let toastTimer = null;
function toast(text, ms = 3000) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, ms);
}

function fail(text) {
  els.loading.hidden = true;
  const box = document.createElement('div');
  box.className = 'fatal';
  box.textContent = text;
  document.body.appendChild(box);
}
