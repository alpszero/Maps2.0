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

// Themen der Zusatzebenen. Die Ebenen selbst werden aus dem
// Verzeichnis des Geoportals gelesen und über diese Muster gefiltert.
export const THEMES = [
  {
    key: 'wasser',
    label: 'Wasser',
    description: 'Gewässer, Seen und Flüsse, Hochwasser- und Grundwasserdaten',
    pattern: /gew[äa]sser|\bseen?\b|fl[üu]ss|hochwasser|grundwasser|\bwasser(?!stoff)|hydrolog|abfluss|\bquellen?\b|[üu]berschwemm|fliess|wasserstand|pegel/i,
  },
  {
    key: 'laser',
    label: 'Laser & Gelände',
    description: 'LiDAR-Produkte, Höhen- und Oberflächenmodelle, Reliefschattierungen',
    pattern: /lidar|laser|swisssurface3d|swissalti3d|h[öo]henmodell|oberfl[äa]chenmodell|gel[äa]ndemodell|relief|schummerung|hillshade|\bdtm\b|\bdom\b|\bdsm\b|h[öo]henkurven|gel[äa]nde|terrain|punktwolke|\bh[öo]hen\b/i,
  },
  {
    key: 'radar',
    label: 'Radar & Wetter',
    description: 'Niederschlagsradar und verwandte Messdaten',
    pattern: /radar|niederschlag|wetter|meteo|hagel|blitz|\bwind\b|klima|temperatur/i,
  },
  {
    key: 'telekom',
    label: 'Telekommunikation',
    description: 'Mobilfunk- und Sendeanlagen',
    pattern: /mobilfunk|sendeanlage|antenne|telekom|\bfunk|rundfunk|\b5g\b|breitband|glasfaser|\bsender\b|kommunikation/i,
  },
];

export const ATTRIBUTION = '© swisstopo';
