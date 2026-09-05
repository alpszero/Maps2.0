// Zugriff auf die offenen Dienste des Bundes-Geoportals (api3.geo.admin.ch,
// wmts.geo.admin.ch, wms.geo.admin.ch). Alles ohne Schlüssel, per CORS.

import {
  API_BASE, WMTS_BASE, WMS_BASE,
  SWISSIMAGE_LAYER, SWISSIMAGE_META_LAYER, FALLBACK_TIMESTAMPS,
} from './config.js';

async function fetchJson(url, { signal } = {}) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} für ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Layer-Konfiguration (Verzeichnis aller Ebenen des Geoportals)

let layersConfigPromise = null;

/** Vollständige Layer-Konfiguration, einmal geladen und im Speicher gehalten. */
export function getLayersConfig() {
  if (!layersConfigPromise) {
    layersConfigPromise = fetchJson(`${API_BASE}/api/MapServer/layersConfig?lang=de`)
      .catch((err) => {
        layersConfigPromise = null; // nächster Versuch darf neu laden
        throw err;
      });
  }
  return layersConfigPromise;
}

/**
 * Jahrgänge der SWISSIMAGE Zeitreise als Liste von {ts, year}, aufsteigend.
 * ts ist der Zeitstempel, wie ihn der WMTS-Dienst in der URL erwartet.
 */
const TS_CACHE_KEY = 'zeitreise.swissimage.timestamps';

/**
 * Ablauf: Liegt eine zwischengespeicherte Liste vor, wird sie sofort verwendet
 * und im Hintergrund aufgefrischt (das Verzeichnis ist gross). Sonst wird bis zu
 * timeoutMs auf das Verzeichnis gewartet, danach greift die Fallback-Liste.
 */
export async function getSwissimageTimestamps({ timeoutMs = 4000 } = {}) {
  const cached = readCachedTimestamps();
  const fresh = fetchTimestampsFromConfig().then((stamps) => {
    if (stamps) writeCachedTimestamps(stamps);
    return stamps;
  });
  if (cached) return normalizeTimestamps(cached);

  const stamps = await Promise.race([fresh, timeout(timeoutMs)]);
  if (!stamps) console.warn('Jahrgänge aus dem Geoportal nicht rechtzeitig verfügbar, verwende Fallback.');
  return normalizeTimestamps(stamps || FALLBACK_TIMESTAMPS);
}

async function fetchTimestampsFromConfig() {
  try {
    const cfg = await getLayersConfig();
    const raw = cfg?.[SWISSIMAGE_LAYER]?.timestamps;
    if (Array.isArray(raw) && raw.length) return raw.map(String);
  } catch (err) {
    console.warn('Layer-Konfiguration nicht verfügbar.', err);
  }
  return null;
}

function readCachedTimestamps() {
  try {
    const raw = localStorage.getItem(TS_CACHE_KEY);
    if (!raw) return null;
    const { stamps, at } = JSON.parse(raw);
    // Höchstens 30 Tage alt, sonst neu laden.
    if (!Array.isArray(stamps) || !stamps.length || Date.now() - at > 30 * 864e5) return null;
    return stamps;
  } catch { return null; }
}

function writeCachedTimestamps(stamps) {
  try { localStorage.setItem(TS_CACHE_KEY, JSON.stringify({ stamps, at: Date.now() })); } catch { /* egal */ }
}

function timeout(ms) { return new Promise((r) => setTimeout(() => r(null), ms)); }

export function normalizeTimestamps(stamps) {
  const byYear = new Map();
  for (const ts of stamps) {
    const m = /^(\d{4})/.exec(String(ts));
    if (!m) continue; // z.B. "current" überspringen
    const year = Number(m[1]);
    if (year < 1900 || year > 2100) continue;
    // Bei mehreren Stempeln pro Jahr den ersten behalten.
    if (!byYear.has(year)) byYear.set(year, { ts: String(ts), year });
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

// ---------------------------------------------------------------------------
// Kachel-URLs

export function wmtsTileUrl(layerName, timestamp = 'current', format = 'png') {
  return `${WMTS_BASE}/${layerName}/default/${timestamp}/3857/{z}/{x}/{y}.${format}`;
}

export function swissimageTileUrl(timestamp) {
  return wmtsTileUrl(SWISSIMAGE_LAYER, timestamp, 'jpeg');
}

export function wmsTileUrl(wmsUrl, wmsLayers, { size = 512, time } = {}) {
  const base = (wmsUrl || WMS_BASE).replace(/\?.*$/, '');
  const params = [
    'SERVICE=WMS', 'VERSION=1.3.0', 'REQUEST=GetMap',
    `LAYERS=${encodeURIComponent(wmsLayers)}`, 'STYLES=',
    'FORMAT=image%2Fpng', 'TRANSPARENT=true', 'CRS=EPSG%3A3857',
    `WIDTH=${size}`, `HEIGHT=${size}`, 'LANG=de',
    'BBOX={bbox-epsg-3857}', // Platzhalter, den MapLibre ersetzt
  ];
  if (time) params.push(`TIME=${encodeURIComponent(time)}`);
  return `${base}?${params.join('&')}`;
}

// ---------------------------------------------------------------------------
// Ortssuche (Adress- und Ortsverzeichnis des Bundes)

export async function searchLocations(text, { signal, limit = 8 } = {}) {
  const q = text.trim();
  if (!q) return [];
  const url = `${API_BASE}/api/SearchServer?type=locations&sr=4326&lang=de`
    + `&limit=${limit}&searchText=${encodeURIComponent(q)}`;
  const data = await fetchJson(url, { signal });
  const results = [];
  for (const r of data?.results || []) {
    const a = r?.attrs || {};
    const lat = Number(a.lat), lon = Number(a.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    results.push({
      id: r.id,
      label: stripHtml(a.label || ''),
      detail: a.detail || '',
      origin: a.origin || '',
      lat, lon,
      bbox: parseBox2d(a.geom_st_box2d),
    });
  }
  return results;
}

export function stripHtml(s) {
  return String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// "BOX(x1 y1,x2 y2)" -> [x1, y1, x2, y2] oder null
function parseBox2d(s) {
  const m = /BOX\(([-\d.]+)\s+([-\d.]+),([-\d.]+)\s+([-\d.]+)\)/.exec(String(s || ''));
  return m ? m.slice(1, 5).map(Number) : null;
}

/** Sinnvolle Zoomstufe je nach Art des Treffers. */
export function zoomForOrigin(origin) {
  switch (origin) {
    case 'address': return 18;
    case 'parcel': return 18;
    case 'haltestellen': return 17;
    case 'gazetteer': return 16;
    case 'zipcode': return 14;
    case 'sn': return 14;
    case 'gg25': return 13.5;
    case 'district': return 11;
    case 'kantone': return 9.5;
    default: return 15;
  }
}

// ---------------------------------------------------------------------------
// Allgemeines Identify auf eine Ebene (Punkt in WGS84)

export async function identifyLayer(lng, lat, layer, { returnGeometry = false, signal } = {}) {
  const url = `${API_BASE}/all/MapServer/identify`
    + `?geometryType=esriGeometryPoint&geometry=${lng.toFixed(6)},${lat.toFixed(6)}`
    + `&sr=4326&tolerance=0&returnGeometry=${returnGeometry}&geometryFormat=geojson&lang=de`
    + `&layers=all:${layer}`;
  const data = await fetchJson(url, { signal });
  return data?.results || [];
}

/** Identify mit einem Rechteck (WGS84: west, süd, ost, nord) auf eine Ebene. */
export async function identifyEnvelope(bounds, layer, { returnGeometry = true, limit = 0, signal } = {}) {
  const geom = [bounds.west, bounds.south, bounds.east, bounds.north].map((v) => v.toFixed(6)).join(',');
  const url = `${API_BASE}/all/MapServer/identify`
    + `?geometryType=esriGeometryEnvelope&geometry=${geom}`
    + `&sr=4326&tolerance=0&returnGeometry=${returnGeometry}&geometryFormat=geojson&lang=de`
    + `&layers=all:${layer}${limit ? `&limit=${limit}` : ''}`;
  const data = await fetchJson(url, { signal });
  return data?.results || [];
}

/** WGS84 → LV95 (Näherungsformeln von swisstopo, auf etwa einen Meter genau). */
export function toLV95(lng, lat) {
  const p = (lat * 3600 - 169028.66) / 10000;
  const l = (lng * 3600 - 26782.5) / 10000;
  const e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3;
  const n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3;
  return { e, n };
}

/** Höhe über Meer (swissALTI3D) für einen Punkt, in Metern; null wenn nicht verfügbar. */
export async function heightAt(lng, lat, { signal } = {}) {
  const { e, n } = toLV95(lng, lat);
  const data = await fetchJson(`${API_BASE}/height?easting=${e.toFixed(1)}&northing=${n.toFixed(1)}&sr=2056`, { signal });
  const h = Number(data?.height);
  return Number.isFinite(h) ? h : null;
}

// ---------------------------------------------------------------------------
// Aufnahmejahr (Metadaten der SWISSIMAGE Zeitreise)

const YEAR_RE = /(19\d{2}|20\d{2})/;

/**
 * Ermittelt für einen Punkt und einen Jahrgang das tatsächliche Aufnahmejahr.
 * Liefert {year, date, attributes} oder null, wenn dort nichts geflogen wurde.
 */
export async function identifyFlightInfo(lng, lat, entry, { signal } = {}) {
  const base = `${API_BASE}/all/MapServer/identify`
    + `?geometryType=esriGeometryPoint&geometry=${lng.toFixed(6)},${lat.toFixed(6)}`
    + `&sr=4326&tolerance=0&returnGeometry=false&lang=de`
    + `&layers=all:${SWISSIMAGE_META_LAYER}`;

  let results = null;
  try {
    const data = await fetchJson(`${base}&timeInstant=${encodeURIComponent(entry.year)}`, { signal });
    results = data?.results || [];
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    // Falls der Dienst timeInstant für diese Ebene nicht akzeptiert: ohne Zeitfilter
    // abfragen und den passenden Jahrgang selbst herausfiltern.
    const data = await fetchJson(base, { signal });
    results = (data?.results || []).filter((r) => matchesYear(r?.attributes, entry.year));
  }

  if (!results.length) return null;
  const preferred = results.find((r) => matchesYear(r?.attributes, entry.year)) || results[0];
  return extractFlightInfo(preferred?.attributes || {});
}

function matchesYear(attrs, year) {
  if (!attrs) return false;
  return Object.values(attrs).some((v) => String(v ?? '').includes(String(year)));
}

/**
 * Sucht in den Attributen eines Metadaten-Features das Flugdatum bzw. -jahr.
 * Die Attributnamen werden bewusst nicht fest vorausgesetzt.
 */
export function extractFlightInfo(attrs) {
  const entries = Object.entries(attrs || {});
  const rank = (key) => {
    const k = key.toLowerCase();
    if (/(flight|flug|aufnahme|acquisition|befliegung)/.test(k)) return 0;
    if (/(year|jahr)/.test(k)) return 1;
    if (/(date|datum)/.test(k)) return 2;
    return 3;
  };
  entries.sort((a, b) => rank(a[0]) - rank(b[0]));

  for (const [key, value] of entries) {
    if (rank(key) === 3) continue;
    if (value === null || value === undefined || value === '') continue;
    const str = String(value);
    const m = YEAR_RE.exec(str);
    if (!m) continue;
    const isDate = /\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}|\d{8}/.test(str);
    return { year: Number(m[1]), date: isDate ? formatDate(str) : null, attributes: attrs };
  }
  // Letzte Möglichkeit: irgendein Attribut mit einer plausiblen Jahreszahl.
  for (const [, value] of entries) {
    const m = YEAR_RE.exec(String(value ?? ''));
    if (m) return { year: Number(m[1]), date: null, attributes: attrs };
  }
  return null;
}

function formatDate(str) {
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(str);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(str);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return null;
}
