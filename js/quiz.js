// Quiz: Wo ist das? Ein zufälliger Ausschnitt in Gemeindegrösse, vier Antworten.
// Gemeinden kommen dynamisch aus dem Geoportal (Identify auf swissBOUNDARIES3D),
// Seen aus einer eingebauten Liste der grössten Schweizer Seen.

import { identifyLayer } from './geoadmin.js';

const GEMEINDE_LAYER = 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill';

// Ungefähre Landesfläche als grobes Polygon (Lng/Lat), damit Zufallspunkte
// selten im Ausland landen. Das Identify prüft anschliessend genau.
const CH_POLY = [
  [6.02, 46.25], [6.9, 45.85], [7.9, 45.9], [8.5, 46.05], [9.0, 45.85], [9.5, 46.3], [10.1, 46.2],
  [10.5, 46.6], [10.4, 46.95], [9.6, 47.1], [9.7, 47.55], [8.6, 47.8], [8.0, 47.6], [7.1, 47.55],
  [6.6, 47.3], [6.0, 46.8], [5.97, 46.35],
];

const LAKES = [
  { name: 'Genfersee', lng: 6.55, lat: 46.42, km: 30 }, { name: 'Bodensee', lng: 9.4, lat: 47.6, km: 30 },
  { name: 'Neuenburgersee', lng: 6.83, lat: 46.9, km: 20 }, { name: 'Vierwaldstättersee', lng: 8.4, lat: 47.0, km: 18 },
  { name: 'Zürichsee', lng: 8.68, lat: 47.24, km: 18 }, { name: 'Lago Maggiore', lng: 8.72, lat: 46.1, km: 18 },
  { name: 'Thunersee', lng: 7.72, lat: 46.69, km: 12 }, { name: 'Bielersee', lng: 7.17, lat: 47.09, km: 10 },
  { name: 'Zugersee', lng: 8.49, lat: 47.12, km: 10 }, { name: 'Luganersee', lng: 8.98, lat: 45.98, km: 12 },
  { name: 'Brienzersee', lng: 7.97, lat: 46.72, km: 10 }, { name: 'Walensee', lng: 9.2, lat: 47.12, km: 10 },
  { name: 'Murtensee', lng: 7.08, lat: 46.93, km: 7 }, { name: 'Sempachersee', lng: 8.15, lat: 47.14, km: 6 },
  { name: 'Hallwilersee', lng: 8.21, lat: 47.28, km: 6 }, { name: 'Sihlsee', lng: 8.8, lat: 47.12, km: 6 },
  { name: 'Sarnersee', lng: 8.2, lat: 46.87, km: 5 }, { name: 'Ägerisee', lng: 8.62, lat: 47.12, km: 5 },
  { name: 'Baldeggersee', lng: 8.26, lat: 47.2, km: 4 }, { name: 'Greifensee', lng: 8.68, lat: 47.35, km: 5 },
  { name: 'Pfäffikersee', lng: 8.78, lat: 47.35, km: 4 }, { name: 'Lac de Joux', lng: 6.29, lat: 46.63, km: 7 },
  { name: 'Silsersee', lng: 9.73, lat: 46.42, km: 5 }, { name: 'Silvaplanersee', lng: 9.79, lat: 46.45, km: 4 },
  { name: 'Lungernsee', lng: 8.16, lat: 46.79, km: 4 }, { name: 'Oeschinensee', lng: 7.73, lat: 46.5, km: 3 },
  { name: 'Lauerzersee', lng: 8.6, lat: 47.04, km: 4 }, { name: 'Wägitalersee', lng: 8.93, lat: 47.09, km: 5 },
  { name: 'Klöntalersee', lng: 8.98, lat: 47.03, km: 5 }, { name: 'Lac de la Gruyère', lng: 7.09, lat: 46.67, km: 9 },
  { name: 'Sihlsee', lng: 8.8, lat: 47.13, km: 6 }, { name: 'Lac de Bienne', lng: 7.17, lat: 47.09, km: 10 },
].filter((l, i, a) => a.findIndex((x) => x.name === l.name) === i);

function pointInPoly(lng, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function randomPointCH(rng = Math.random) {
  for (let k = 0; k < 200; k++) {
    const lng = 5.95 + rng() * (10.5 - 5.95), lat = 45.82 + rng() * (47.81 - 45.82);
    if (pointInPoly(lng, lat, CH_POLY)) return { lng, lat };
  }
  return { lng: 7.44, lat: 46.95 };
}

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function nameOf(attrs) {
  if (!attrs) return null;
  for (const k of ['gemname', 'name', 'gemeindename', 'label']) if (attrs[k]) return String(attrs[k]);
  const k = Object.keys(attrs).find((key) => /name/i.test(key) && typeof attrs[key] === 'string');
  return k ? String(attrs[k]) : null;
}

function bboxOf(result) {
  if (Array.isArray(result?.bbox) && result.bbox.length === 4) return result.bbox;
  const g = result?.geometry;
  const coords = [];
  const walk = (c) => { if (typeof c[0] === 'number') coords.push(c); else c.forEach(walk); };
  if (g?.coordinates) walk(g.coordinates);
  else if (Array.isArray(g?.rings)) walk(g.rings);
  if (!coords.length) return null;
  const xs = coords.map((c) => c[0]), ys = coords.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Gemeinde am Punkt (oder null, wenn dort keine liegt). */
export async function municipalityAt(lng, lat, { geometry = false, signal } = {}) {
  const results = await identifyLayer(lng, lat, GEMEINDE_LAYER, { returnGeometry: geometry, signal });
  const r = results?.[0];
  const name = nameOf(r?.attributes);
  if (!name) return null;
  return { name, lng, lat, bbox: geometry ? bboxOf(r) : null, canton: r?.attributes?.kanton || r?.attributes?.kantonskuerzel || '' };
}

async function randomMunicipality(rng, opts) {
  for (let k = 0; k < 12; k++) {
    const p = opts?.near
      ? { lng: opts.near.lng + (rng() - 0.5) * 0.5, lat: opts.near.lat + (rng() - 0.5) * 0.35 }
      : randomPointCH(rng);
    const m = await municipalityAt(p.lng, p.lat, { geometry: !!opts?.geometry, signal: opts?.signal });
    if (m) return m;
  }
  return null;
}

/**
 * Eine Runde: Ziel und vier Antworten.
 * @returns {{mode, target:{name,lng,lat,bbox}, options:string[], correct:number}}
 */
export async function makeRound({ mode = 'gemeinde', rng = Math.random, signal } = {}) {
  if (mode === 'see') {
    const pool = shuffle(LAKES, rng);
    const target = pool[0];
    const options = shuffle([target.name, ...pool.slice(1, 4).map((l) => l.name)], rng);
    const d = target.km / 111 / 2;
    return { mode, target: { ...target, bbox: [target.lng - d * 1.4, target.lat - d, target.lng + d * 1.4, target.lat + d] }, options, correct: options.indexOf(target.name) };
  }
  const target = await randomMunicipality(rng, { geometry: true, signal });
  if (!target) throw new Error('Keine Gemeinde gefunden. Ist das Geoportal erreichbar?');
  const names = new Set([target.name]);
  const wanted = [{ near: target }, {}, {}];
  for (let k = 0; k < 10 && names.size < 4; k++) {
    const spec = wanted[Math.min(k, wanted.length - 1)];
    const m = await randomMunicipality(rng, { ...spec, signal });
    if (m) names.add(m.name);
  }
  if (names.size < 4) throw new Error('Zu wenige Antworten gefunden. Bitte erneut versuchen.');
  const options = shuffle([...names], rng);
  return { mode, target, options, correct: options.indexOf(target.name) };
}

export const MODES = [
  { key: 'gemeinde', label: 'Gemeinden', note: 'Zufällige Gemeinde aus dem Geoportal, Ausschnitt in Gemeindegrösse.' },
  { key: 'see', label: 'Seen', note: 'Die grössten Schweizer Seen von oben.' },
];
