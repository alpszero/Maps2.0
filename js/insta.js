// Insta-Bild: Ausschnitt in voller Auflösung zusammensetzen, Foto-Filter für
// Luftaufnahmen anwenden und Ortsangaben (Name, Gemeinde, Koordinaten) weiss
// einmontieren.

import { NAMES_LAYER, MUNICIPALITY_LAYER, INVENTORY_LAYERS, CANTONS, INSTA_MAX_SOURCE_EDGE } from './config.js';
import { identifyEnvelope, identifyLayer, heightAt } from './geoadmin.js';
import { placeNear } from './places.js';
import { captureSource, pickFetchZoom, polishCanvas, metersPerPixel, worldSize, tileCount } from './enhance.js';

const FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * Plan für einen Ausschnitt: höchste verfügbare Kachelstufe (20, rund 10 cm),
 * zurückgenommen, bis die längste Kante den Deckel (Leinwandgrenze des Browsers,
 * höchstens INSTA_MAX_SOURCE_EDGE) einhält; dazu Grösse und Kachelzahl.
 */
export function planInsta(bounds, maxEdge = 4096) {
  const cap = Math.min(INSTA_MAX_SOURCE_EDGE, maxEdge);
  const zoom = pickFetchZoom(bounds, cap);
  const [w, h] = worldSize(bounds, zoom).map((v) => Math.max(1, Math.round(v)));
  return { zoom, outW: w, outH: h, tiles: tileCount(bounds, zoom) };
}

// ---------------------------------------------------------------------------
// Ortsbestimmung

// Reihenfolge der Namensarten von swissNAMES3D: Orte und Quartiere zuerst,
// Landschaftsnamen danach, Gebäude und Haltestellen zuletzt.
function rankKind(kind) {
  const k = String(kind || '').toLowerCase();
  if (/^ort$|hauptort|^stadt|ortschaft/.test(k)) return 0;
  if (/quartier|ortsteil|dorf|weiler/.test(k)) return 1;
  if (/lokalname|flurname|gebiet|alp|tal|ebene/.test(k)) return 2;
  if (/see|fluss|bach|gletscher|gipfel|pass|berg|grat|kuppe|h[üu]gel|felsen|insel|wasserfall/.test(k)) return 2;
  if (/geb[äa]ude|haltestelle|strasse|bahnhof|sportanlage|schule|kirche|kapelle|schloss|turm|brücke|bruecke|denkmal/.test(k)) return 5;
  return 4;
}

function attrName(attrs) {
  if (!attrs) return '';
  for (const k of ['name', 'gemname', 'bln_name', 'we_name', 'park_name', 'ortsbild', 'label', 'bezeichnung', 'name_de', 'text']) {
    const v = attrs[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // Sonst das erste Textattribut, das nach einem Namen aussieht.
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'string' && v.trim().length > 2 && !/id|uuid|url|date|datum/i.test(k) && !/^\d+$/.test(v.trim())) return v.trim();
  }
  return '';
}

function geometryPoint(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') return geometry.coordinates;
  if (geometry.type === 'MultiPoint' && geometry.coordinates?.length) return geometry.coordinates[0];
  return null;
}

/**
 * Ermittelt Name, Gemeinde, Kanton und eine Zusatzzeile für einen Ausschnitt.
 * Der Name ist nie leer: Ortsname aus swissNAMES3D, sonst bekannter Ort in der
 * Nähe, sonst Gemeinde, sonst Kanton, sonst «Schweiz». Die Zusatzzeile kommt
 * vom bekannten Ort (kuratiert), sonst aus den Inventaren des Bundes (UNESCO,
 * Pärke, BLN, Ortsbilder), sonst Kanton und Höhe über Meer.
 * @returns {{name, kind, municipality, canton, cantonName, tagline, height}}
 */
export async function lookupPlace(bounds, { signal } = {}) {
  const cx = (bounds.west + bounds.east) / 2, cy = (bounds.north + bounds.south) / 2;
  const dx = (bounds.east - bounds.west) * 0.5, dy = (bounds.north - bounds.south) * 0.5;
  const wide = { west: bounds.west - dx, east: bounds.east + dx, south: bounds.south - dy, north: bounds.north + dy };
  const known = placeNear(cx, cy, Math.max(350, Math.hypot(dx, dy) * 111000));
  const [names, muni, height, ...inv] = await Promise.allSettled([
    identifyEnvelope(wide, NAMES_LAYER, { signal }),
    identifyLayer(cx, cy, MUNICIPALITY_LAYER, { signal }),
    heightAt(cx, cy, { signal }),
    ...INVENTORY_LAYERS.map((l) => identifyLayer(cx, cy, l.layer, { signal })),
  ]);
  if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');

  let municipality = '', canton = '';
  if (muni.status === 'fulfilled' && muni.value[0]) {
    const a = muni.value[0].attributes || {};
    municipality = attrName(a);
    canton = String(a.kanton || a.canton || a.kt || '').trim().toUpperCase();
  }
  const cantonName = CANTONS[canton] || '';

  let best = null;
  if (names.status === 'fulfilled') {
    for (const r of names.value) {
      const a = r?.attributes || {};
      const name = attrName(a);
      if (!name) continue;
      const kind = String(a.objektart || a.objektklasse || '');
      const rank = rankKind(kind);
      const p = geometryPoint(r.geometry);
      const nx = p ? (p[0] - cx) / Math.max(dx, 1e-9) : 0, ny = p ? (p[1] - cy) / Math.max(dy, 1e-9) : 0;
      const dist = p ? Math.hypot(nx, ny) : 1.5;
      const outside = p && (Math.abs(nx) > 1 || Math.abs(ny) > 1); // nur im erweiterten Umfeld
      const score = rank + Math.min(dist, 3) * 0.3 + (outside ? 0.8 : 0);
      if (!best || score < best.score) best = { name, kind, score };
    }
  }

  // Zusatzzeile
  let tagline = '';
  if (known?.tag) tagline = known.tag;
  else {
    for (let i = 0; i < INVENTORY_LAYERS.length && !tagline; i++) {
      const r = inv[i];
      if (r.status !== 'fulfilled' || !r.value[0]) continue;
      const n = attrName(r.value[0].attributes);
      const prefix = INVENTORY_LAYERS[i].prefix;
      tagline = n && n.toLowerCase() !== (municipality || '').toLowerCase() ? `${prefix} · ${n}` : prefix;
    }
  }
  const h = height.status === 'fulfilled' && height.value !== null ? Math.round(height.value) : null;
  if (!tagline) {
    const parts = [];
    if (cantonName) parts.push(`Kanton ${cantonName}`);
    if (h !== null) parts.push(`${h} m ü. M.`);
    tagline = parts.join(' · ');
  }

  const name = known?.name || best?.name || municipality || cantonName || 'Schweiz';
  return {
    name,
    kind: known ? 'Bekannter Ort' : best?.kind || (municipality ? 'Gemeinde' : ''),
    municipality, canton, cantonName, tagline, height: h,
  };
}

/** Untertitel: Gemeinde und Kanton, wenn sie nicht schon der Name sind. */
export function subtitleFor(place, name) {
  const n = (name || '').trim().toLowerCase();
  if (place?.municipality && place.municipality.toLowerCase() !== n) {
    return place.canton ? `${place.municipality} ${place.canton}` : place.municipality;
  }
  if (place?.cantonName && place.cantonName.toLowerCase() !== n) return `Kanton ${place.cantonName}`;
  return 'Schweiz';
}

/** «47.3665° N   8.5412° E» */
export function formatCoords(lng, lat) {
  const ns = lat >= 0 ? 'N' : 'S', ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}   ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

// ---------------------------------------------------------------------------
// Bild erzeugen

/**
 * @param {object} p
 * @param {{west,south,east,north}} p.bounds
 * @param {string} p.timestamp   WMTS-Zeitstempel des Jahrgangs
 * @param {string} p.name        Ortsname (darf leer sein)
 * @param {string} p.subtitle    Zweite Zeile (Gemeinde, Kanton)
 * @param {string} p.tagline     Zusatzzeile (Beschreibung)
 * @param {number|string} p.year Jahr für die Quellenangabe
 * @param {number} p.maxEdge     Leinwandgrenze des Browsers
 * @param {boolean} p.label      Ortsangaben einmontieren
 */
export async function createInstaImage({ bounds, timestamp, name, subtitle, tagline, year, maxEdge, label = true, onStatus, onProgress, signal }) {
  const plan = planInsta(bounds, maxEdge);
  onStatus?.(`Lade ${plan.tiles} Kacheln (Stufe ${plan.zoom}) …`);
  const src = await captureSource({
    bounds, fetchZoom: plan.zoom, timestamp, signal,
    onProgress: (p, done, total) => {
      onProgress?.(p * 0.55);
      if (total) onStatus?.(`Setze Kacheln zusammen … ${done} / ${total}`);
    },
  });
  if (src.failed === src.total) throw new Error('Für diesen Ausschnitt gibt es in diesem Jahrgang kein Luftbild.');

  const out = await polishCanvas(src.canvas, {
    signal, onStatus,
    onProgress: (p) => onProgress?.(0.55 + p * 0.42),
  });
  src.canvas.width = 0; src.canvas.height = 0; // Speicher freigeben

  const cx = (bounds.west + bounds.east) / 2, cy = (bounds.north + bounds.south) / 2;
  if (label) {
    onStatus?.('Beschrifte …');
    composeLabel(out, {
      name, subtitle, tagline,
      coords: formatCoords(cx, cy),
      credit: `© swisstopo · Luftbild ${year}`,
    });
  }
  onProgress?.(1);
  const mpp = metersPerPixel(cy, src.zoom);
  return {
    canvas: out, width: out.width, height: out.height,
    sourceZoom: src.zoom, tiles: src.total, missing: src.failed,
    metersPerPx: mpp, widthM: out.width * mpp,
  };
}

// ---------------------------------------------------------------------------
// Beschriftung: weiss, Grossbuchstaben mit Sperrung, dünne Linie, Koordinaten.

function drawSpaced(ctx, text, x, y, spacing) {
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
  return x;
}

function measureSpaced(ctx, text, spacing) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return Math.max(0, w - spacing);
}

export function composeLabel(canvas, { name = '', subtitle = '', tagline = '', coords = '', credit = '' }) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const u = Math.min(W, H) / 1000; // Masseinheit: Promille der kürzeren Kante

  // Dunkler Verlauf unten, damit Weiss auf jedem Untergrund lesbar bleibt.
  const gh = Math.round(Math.min(H * 0.4, 400 * u));
  const g = ctx.createLinearGradient(0, H - gh, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0.58)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H - gh, W, gh);

  const margin = 64 * u;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10 * u;
  ctx.shadowOffsetY = 2 * u;

  let y = H - margin;

  // Koordinaten (unterste Zeile), gesperrt
  const coordSize = 23 * u;
  ctx.font = `500 ${coordSize}px ${FONT}`;
  drawSpaced(ctx, coords, margin, y, coordSize * 0.2);

  // Quellenangabe rechts auf derselben Grundlinie
  if (credit) {
    ctx.save();
    ctx.font = `400 ${16 * u}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.globalAlpha = 0.72;
    ctx.fillText(credit, W - margin * 0.7, y);
    ctx.restore();
  }
  y -= coordSize * 1.85;

  // Zusatzzeile (Beschreibung), leicht und kursiv
  if (tagline) {
    const s = 24 * u;
    ctx.font = `italic 300 ${s}px ${FONT}`;
    ctx.globalAlpha = 0.92;
    drawSpaced(ctx, tagline, margin, y, s * 0.06);
    ctx.globalAlpha = 1;
    y -= s * 1.6;
  }

  // Untertitel (Gemeinde, Kanton)
  if (subtitle) {
    const s = 27 * u;
    ctx.font = `400 ${s}px ${FONT}`;
    drawSpaced(ctx, subtitle, margin, y, s * 0.1);
    y -= s * 1.55;
  }

  // Dünne Linie
  ctx.fillRect(margin, y - 8 * u, 70 * u, Math.max(2, Math.round(3 * u)));
  y -= 34 * u;

  // Ortsname gross, Grossbuchstaben, gesperrt; bei langen Namen kleiner
  if (name) {
    const text = name.toUpperCase();
    let fs = 80 * u;
    const maxW = W - 2 * margin;
    for (;;) {
      ctx.font = `700 ${fs}px ${FONT}`;
      if (measureSpaced(ctx, text, fs * 0.09) <= maxW || fs <= 26 * u) break;
      fs *= 0.93;
    }
    drawSpaced(ctx, text, margin - fs * 0.04, y, fs * 0.09);
  }
  ctx.restore();
  return canvas;
}
