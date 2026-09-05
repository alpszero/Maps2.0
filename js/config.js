// Zentrale Konfiguration der App.
// Alle Datendienste stammen vom Bundes-Geoportal (geo.admin.ch, swisstopo).

export const WMTS_BASE = 'https://wmts.geo.admin.ch/1.0.0';
export const WMS_BASE = 'https://wms.geo.admin.ch/';
export const API_BASE = 'https://api3.geo.admin.ch/rest/services';

// SWISSIMAGE Zeitreise: Orthofoto-Mosaike nach Jahrgang.
export const SWISSIMAGE_LAYER = 'ch.swisstopo.swissimage-product';
// Metadaten derselben Sammlung (Aufnahmedatum/-jahr pro Kachel).
export const SWISSIMAGE_META_LAYER = 'ch.swisstopo.swissimage-product.metadata';

// Fallback, falls die Layer-Konfiguration nicht geladen werden kann.
// Die tatsächliche Liste wird beim Start aus dem Geoportal gelesen.
export const FALLBACK_TIMESTAMPS = (() => {
  const list = ['1946'];
  for (let y = 1979; y <= 2024; y++) list.push(String(y));
  return list;
})();

// Ungefähre Ausdehnung der Schweiz (WGS84: west, süd, ost, nord).
export const SWISS_BOUNDS = [5.8, 45.75, 10.6, 47.9];
// Etwas grosszügiger für die Kartenbegrenzung.
export const MAX_BOUNDS = [[4.5, 45.0], [11.9, 48.6]];

export const DEFAULT_CENTER = [7.4474, 46.9481]; // Bern
export const DEFAULT_ZOOM = 15.5;
export const MIN_ZOOM = 7;
export const MAX_ZOOM = 20;
// Höchste Kachelstufe der SWISSIMAGE in EPSG:3857 (≈10 cm/px); 256er-Kacheln.
// Ein Kachelpixel entspricht einem CSS-Pixel bei Kartenzoom NATIVE_TILE_ZOOM − 1.
export const NATIVE_TILE_ZOOM = 20;

// Wie viele Jahrgänge links/rechts vom aktuellen im Hintergrund geladen werden.
export const PRELOAD_RADIUS = 3;
// Dauer der Überblendung zwischen zwei Jahrgängen (ms).
export const CROSSFADE_MS = 320;
// Wie lange maximal auf die Kacheln des Zieljahrgangs gewartet wird,
// bevor der alte Jahrgang ausgeblendet wird (ms).
export const SETTLE_TIMEOUT_MS = 2500;
// Intervall des automatischen Abspielens (ms).
export const PLAY_INTERVAL_MS = 1400;

// Einblendbare Ebenen über dem Luftbild.
export const OVERLAYS = [
  {
    key: 'names',
    label: 'Ortsnamen',
    note: 'Nur Beschriftungen, aus swissNAMES3D',
    // Die WMS-Ebene zeichnet auch Flächennamen als Schraffur; darum werden die
    // Namen als Punkte abgefragt und nur die Schriftzüge selbst gezeichnet.
    labels: 'ch.swisstopo.swissnames3d',
  },
  {
    key: 'terrain',
    label: 'Gelände',
    note: 'Reliefschattierung aus swissALTI3D',
    wmts: 'ch.swisstopo.swissalti3d-reliefschattierung',
    wms: 'ch.swisstopo.swissalti3d-reliefschattierung',
    opacity: 0.45,
  },
];

// Ebenen für die Ortsbestimmung eines Ausschnitts (Insta-Bild).
export const NAMES_LAYER = 'ch.swisstopo.swissnames3d';
export const MUNICIPALITY_LAYER = 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill';

// Inventare des Bundes für die Zusatzzeile, in dieser Reihenfolge geprüft.
// Unbekannte oder nicht erreichbare Ebenen werden übersprungen.
export const INVENTORY_LAYERS = [
  { layer: 'ch.bak.schutzgebiete-unesco_weltkulturerbe', prefix: 'UNESCO-Welterbe' },
  { layer: 'ch.bafu.schutzgebiete-unesco_weltnaturerbe', prefix: 'UNESCO-Weltnaturerbe' },
  { layer: 'ch.bafu.schutzgebiete-paerke_nationaler_bedeutung', prefix: 'Park von nationaler Bedeutung' },
  { layer: 'ch.bafu.bundesinventare-bln', prefix: 'Landschaft von nationaler Bedeutung' },
  { layer: 'ch.bak.bundesinventar-schuetzenswerte-ortsbilder', prefix: 'Ortsbild von nationaler Bedeutung' },
];

export const CANTONS = {
  ZH: 'Zürich', BE: 'Bern', LU: 'Luzern', UR: 'Uri', SZ: 'Schwyz', OW: 'Obwalden', NW: 'Nidwalden',
  GL: 'Glarus', ZG: 'Zug', FR: 'Freiburg', SO: 'Solothurn', BS: 'Basel-Stadt', BL: 'Basel-Landschaft',
  SH: 'Schaffhausen', AR: 'Appenzell Ausserrhoden', AI: 'Appenzell Innerrhoden', SG: 'St. Gallen',
  GR: 'Graubünden', AG: 'Aargau', TG: 'Thurgau', TI: 'Tessin', VD: 'Waadt', VS: 'Wallis',
  NE: 'Neuenburg', GE: 'Genf', JU: 'Jura',
};

// Insta-Bild: Kacheln auf der höchsten verfügbaren Stufe laden, höchstens aber
// so, dass die längste Kante INSTA_MAX_SOURCE_EDGE nicht übersteigt (zusätzlich
// gedeckelt durch die Leinwandgrenze des Browsers, siehe maxCanvasEdge).
export const INSTA_MAX_SOURCE_EDGE = 10000;

export const ATTRIBUTION = '© swisstopo';
