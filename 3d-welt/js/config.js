// Zentrale Konfiguration der App.
// Alle Datendienste stammen vom Bundes-Geoportal (geo.admin.ch, swisstopo).

export const WMTS_BASE = 'https://wmts.geo.admin.ch/1.0.0';
export const WMS_BASE = 'https://wms.geo.admin.ch/';
export const API_BASE = 'https://api3.geo.admin.ch/rest/services';
// 3D-Dienste (Gelände als Quantized Mesh, Objekte als 3D Tiles).
export const TILES3D_BASE = 'https://3d.geo.admin.ch';

// Geländemodell der Schweiz (swissALTI3D, als Cesium-Terrain aufbereitet).
export const TERRAIN_URL = `${TILES3D_BASE}/ch.swisstopo.terrain.3d/v1/`;

// 3D-Objekte als 3D Tiles. Der Pfad ist <Basis>/<Ebene>/<Version>/tileset.json.
export const TILESETS = [
  {
    key: 'gebaeude',
    id: 'ch.swisstopo.swissbuildings3d.3d',
    version: 'v1',
    label: 'Gebäude',
    description: 'swissBUILDINGS3D mit Dachformen',
    defaultOn: true,
    // Kleinerer Wert = mehr Kacheln geladen, weniger Lücken (wie im Bundes-Viewer).
    screenSpaceError: 10,
  },
  {
    key: 'bauwerke',
    id: 'ch.swisstopo.swisstlm3d.3d',
    version: 'v1',
    label: 'Bauwerke',
    description: 'Brücken, Türme, Staumauern, Seilbahnen (swissTLM3D)',
    defaultOn: false,
    screenSpaceError: 16,
  },
  {
    key: 'vegetation',
    id: 'ch.swisstopo.vegetation.3d',
    version: 'v1',
    label: 'Vegetation',
    description: 'Bäume und Wald',
    defaultOn: false,
    screenSpaceError: 16,
  },
];

export function tilesetUrl(t) {
  return `${TILES3D_BASE}/${t.id}/${t.version}/tileset.json`;
}

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
// Etwas grosszügiger für die Kachelabfrage, damit am Rand nichts fehlt.
export const IMAGERY_BOUNDS = [5.5, 45.6, 10.9, 48.0];

// Höchste Kachelstufe der SWISSIMAGE in EPSG:3857 (≈10 cm/px).
export const NATIVE_TILE_ZOOM = 20;
// Unterste Kachelstufe, die für die Schweiz angefragt wird. Auf Stufe 6 liegt
// das ganze Land in einer einzigen Kachel; Cesium verlangt höchstens vier.
export const MIN_TILE_ZOOM = 6;

// Startansicht: Bern, schräg von Südwesten.
export const DEFAULT_VIEW = {
  lon: 7.4474, lat: 46.9481,
  range: 2200,          // Distanz Kamera–Zielpunkt (m)
  heading: 25,          // Grad, 0 = Nord
  pitch: -35,           // Grad, -90 = senkrecht nach unten
};

// Kamera: Abstand zum Gelände (m).
export const CAMERA_MIN_DISTANCE = 20;
export const CAMERA_MAX_DISTANCE = 1_500_000;

// Dauer der Überblendung zwischen zwei Jahrgängen (ms).
export const CROSSFADE_MS = 400;
// Wie lange maximal auf die Kacheln des Zieljahrgangs gewartet wird,
// bevor der alte Jahrgang entfernt wird (ms).
export const SETTLE_TIMEOUT_MS = 3000;
// Intervall des automatischen Abspielens (ms).
export const PLAY_INTERVAL_MS = 1600;

export const ATTRIBUTION = '© swisstopo';
