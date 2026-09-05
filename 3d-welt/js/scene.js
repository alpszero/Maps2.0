// Aufbau der 3D-Szene mit CesiumJS: Gelände, Luftbild-Ebenen, 3D-Objekte,
// Kamerahilfen. Cesium wird als klassisches Skript geladen (window.Cesium),
// damit Worker und Assets ohne Build-Schritt unter vendor/cesium/ liegen können.

import {
  TERRAIN_URL, TILESETS, tilesetUrl, IMAGERY_BOUNDS, NATIVE_TILE_ZOOM, MIN_TILE_ZOOM,
  CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE, ATTRIBUTION,
} from './config.js';
import { swissimageTileUrl, wmtsTileUrl } from './geoadmin.js';

const C = window.Cesium;
const DEG = Math.PI / 180;

let terrainReady = null; // Promise<TerrainProvider>

/** Erstellt den Viewer ohne die Cesium-Standardwidgets. */
export function createViewer(container) {
  // Es wird nichts von Cesium ion geladen (kein Konto, kein Schlüssel).
  C.Ion.defaultAccessToken = '';

  const terrain = new C.Terrain(C.CesiumTerrainProvider.fromUrl(TERRAIN_URL, {
    requestVertexNormals: false,
    requestWaterMask: false,
    credit: ATTRIBUTION,
  }));
  terrainReady = new Promise((resolve, reject) => {
    terrain.readyEvent.addEventListener((provider) => resolve(provider));
    terrain.errorEvent.addEventListener((err) => reject(err));
  });
  terrainReady.catch(() => { /* wird unten und in app.js behandelt */ });

  const viewer = new C.Viewer(container, {
    baseLayer: false,
    terrain,
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    vrButton: false,
    shadows: false,
    terrainShadows: C.ShadowMode.DISABLED,
    // Nur rendern, wenn sich etwas ändert: schont Akku und Grafikeinheit.
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    contextOptions: { webgl: { powerPreference: 'high-performance', antialias: true } },
  });

  const scene = viewer.scene;
  const globe = scene.globe;

  // Schlägt das Laden des Geländes fehl, lässt Cesium den Globus ohne
  // Höhenmodell zurück und zeichnet gar nichts mehr. Dann auf das glatte
  // Ellipsoid zurückfallen, damit Luftbilder und Bedienung weiter gehen.
  terrainReady.catch(() => {
    scene.terrainProvider = new C.EllipsoidTerrainProvider();
    scene.requestRender();
  });

  globe.depthTestAgainstTerrain = true;
  globe.baseColor = C.Color.fromCssColorString('#1c2731');
  globe.showGroundAtmosphere = true;
  globe.enableLighting = false;
  // Auf kleinen Bildschirmen etwas gröberes Gelände, dafür flüssiger.
  globe.maximumScreenSpaceError = window.innerWidth < 700 ? 2.5 : 2;
  scene.fog.enabled = true;
  scene.skyAtmosphere.show = true;
  scene.highDynamicRange = false;

  const ctrl = scene.screenSpaceCameraController;
  ctrl.minimumZoomDistance = CAMERA_MIN_DISTANCE;
  ctrl.maximumZoomDistance = CAMERA_MAX_DISTANCE;
  ctrl.enableCollisionDetection = true;

  return { viewer, terrain, terrainReady };
}

// ---------------------------------------------------------------------------
// Luftbild-Ebenen

const imageryRectangle = () => C.Rectangle.fromDegrees(...IMAGERY_BOUNDS);

/** Ebene für einen SWISSIMAGE-Jahrgang (WMTS in EPSG:3857). */
export function swissimageLayer(timestamp, alpha = 1) {
  return wmtsLayer(swissimageTileUrl(timestamp), { alpha, hasAlphaChannel: false });
}

/** Beliebige WMTS-Ebene des Geoportals als Cesium-Bildebene. */
export function wmtsLayer(urlTemplate, { alpha = 1, hasAlphaChannel = true, maximumLevel = NATIVE_TILE_ZOOM } = {}) {
  const provider = new C.UrlTemplateImageryProvider({
    url: urlTemplate,
    tilingScheme: new C.WebMercatorTilingScheme(),
    minimumLevel: MIN_TILE_ZOOM,
    maximumLevel,
    rectangle: imageryRectangle(),
    hasAlphaChannel,
    credit: ATTRIBUTION,
  });
  provider.errorEvent.addEventListener(() => { /* fehlende Kacheln sind normal (ausserhalb der Befliegung) */ });
  const layer = new C.ImageryLayer(provider, { alpha, rectangle: imageryRectangle() });
  return layer;
}

export function geoadminWmtsLayer(layerName, timestamp, format, alpha) {
  return wmtsLayer(wmtsTileUrl(layerName, timestamp, format), { alpha, maximumLevel: 18 });
}

/** WMS-Ebene des Geoportals (Rückfall, wenn eine Ebene nicht per WMTS vorliegt). */
export function geoadminWmsLayer(wmsUrl, wmsLayers, alpha) {
  const provider = new C.WebMapServiceImageryProvider({
    url: wmsUrl,
    layers: wmsLayers,
    parameters: { format: 'image/png', transparent: true, lang: 'de' },
    rectangle: imageryRectangle(),
    tileWidth: 512,
    tileHeight: 512,
    credit: ATTRIBUTION,
  });
  return new C.ImageryLayer(provider, { alpha, rectangle: imageryRectangle() });
}

// ---------------------------------------------------------------------------
// 3D-Objekte (3D Tiles)

const tilesets = new Map(); // key -> Promise<Cesium3DTileset>

export function tilesetConfig(key) {
  return TILESETS.find((t) => t.key === key) || null;
}

/** Lädt ein Tileset beim ersten Aufruf und hängt es in die Szene. */
export function loadTileset(viewer, key) {
  const cfg = tilesetConfig(key);
  if (!cfg) return Promise.reject(new Error(`Unbekanntes Tileset ${key}`));
  if (!tilesets.has(key)) {
    const p = C.Cesium3DTileset.fromUrl(tilesetUrl(cfg), {
      maximumScreenSpaceError: cfg.screenSpaceError,
      skipLevelOfDetail: false,
      // Gebäude sollen nicht ins Gelände einsinken bzw. darüber schweben.
      dynamicScreenSpaceError: true,
    }).then((tileset) => {
      viewer.scene.primitives.add(tileset);
      viewer.scene.requestRender();
      return tileset;
    });
    p.catch(() => tilesets.delete(key));
    tilesets.set(key, p);
  }
  return tilesets.get(key);
}

export async function setTilesetVisible(viewer, key, visible) {
  if (!visible && !tilesets.has(key)) return;
  const tileset = await loadTileset(viewer, key);
  tileset.show = visible;
  viewer.scene.requestRender();
}

// ---------------------------------------------------------------------------
// Kamera

export function toDegrees(rad) { return rad / DEG; }

/** Geländehöhe (m ü. Meer) an einem Punkt, mit Fallback. */
export async function terrainHeight(lon, lat, fallback = 600) {
  try {
    const provider = await withTimeout(terrainReady, 8000);
    const [carto] = await C.sampleTerrainMostDetailed(provider, [C.Cartographic.fromDegrees(lon, lat)]);
    return Number.isFinite(carto?.height) ? carto.height : fallback;
  } catch {
    return fallback;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), ms)),
  ]);
}

/**
 * Fliegt die Kamera auf einen Bodenpunkt. heading/pitch in Grad, range in Metern.
 * Der Punkt wird auf das Gelände gesetzt, deshalb wird zuerst die Höhe abgefragt.
 */
export async function flyToPoint(viewer, lon, lat, { range = 1500, heading = 25, pitch = -35, duration = 2.2 } = {}) {
  const h = await terrainHeight(lon, lat);
  const center = C.Cartesian3.fromDegrees(lon, lat, h);
  viewer.camera.flyToBoundingSphere(new C.BoundingSphere(center, 1), {
    offset: new C.HeadingPitchRange(heading * DEG, pitch * DEG, range),
    duration,
  });
}

/** Kamera sofort setzen (z. B. aus dem URL-Fragment). Höhe absolut in m ü. Meer. */
export function setCamera(viewer, { lon, lat, height, heading = 0, pitch = -35 }) {
  viewer.camera.setView({
    destination: C.Cartesian3.fromDegrees(lon, lat, height),
    orientation: { heading: heading * DEG, pitch: pitch * DEG, roll: 0 },
  });
  viewer.scene.requestRender();
}

/** Aktuelle Kamera als einfache Zahlen (Grad, Meter). */
export function cameraState(viewer) {
  const cam = viewer.camera;
  const c = cam.positionCartographic;
  return {
    lon: toDegrees(c.longitude),
    lat: toDegrees(c.latitude),
    height: c.height,
    heading: toDegrees(cam.heading),
    pitch: toDegrees(cam.pitch),
  };
}

/** Bodenpunkt unter der Bildmitte, oder null (z. B. Blick in den Himmel). */
export function groundPointAtCenter(viewer) {
  const canvas = viewer.canvas;
  const mid = new C.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
  const ray = viewer.camera.getPickRay(mid);
  if (!ray) return null;
  const pos = viewer.scene.globe.pick(ray, viewer.scene);
  if (!pos) return null;
  const carto = C.Cartographic.fromCartesian(pos);
  return {
    lon: toDegrees(carto.longitude),
    lat: toDegrees(carto.latitude),
    height: carto.height,
    cartesian: pos,
    range: C.Cartesian3.distance(viewer.camera.positionWC, pos),
  };
}

/** Dreht die Ansicht um den Bodenpunkt in der Bildmitte auf neue Blickwinkel. */
export function reorient(viewer, { heading, pitch, duration = 1.2 } = {}) {
  const p = groundPointAtCenter(viewer);
  const cur = cameraState(viewer);
  if (!p) {
    // Kein Boden unter der Bildmitte: nur die Blickrichtung drehen.
    viewer.camera.flyTo({
      destination: viewer.camera.positionWC,
      orientation: {
        heading: (heading ?? cur.heading) * DEG,
        pitch: (pitch ?? cur.pitch) * DEG,
        roll: 0,
      },
      duration,
    });
    return;
  }
  viewer.camera.flyToBoundingSphere(new C.BoundingSphere(p.cartesian, 1), {
    offset: new C.HeadingPitchRange((heading ?? cur.heading) * DEG, (pitch ?? cur.pitch) * DEG, p.range),
    duration,
  });
}

// ---------------------------------------------------------------------------
// Rundflug: langsame Drehung um den Bodenpunkt in der Bildmitte

let orbitStop = null;

export function isOrbiting() { return !!orbitStop; }

export function startOrbit(viewer, { degPerSecond = 6 } = {}) {
  stopOrbit(viewer);
  const p = groundPointAtCenter(viewer);
  if (!p) return false;
  const cur = cameraState(viewer);
  let heading = cur.heading * DEG;
  // Blickwinkel zum Zielpunkt aus der Geometrie, nicht aus der Kameraneigung.
  const pitch = Math.min(-8 * DEG, cur.pitch * DEG);
  const range = p.range;
  let last = performance.now();
  const remove = viewer.clock.onTick.addEventListener(() => {
    const now = performance.now();
    heading += ((now - last) / 1000) * degPerSecond * DEG;
    last = now;
    viewer.camera.lookAt(p.cartesian, new C.HeadingPitchRange(heading, pitch, range));
    viewer.scene.requestRender();
  });
  orbitStop = () => {
    remove();
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  };
  return true;
}

export function stopOrbit(viewer) {
  if (orbitStop) {
    orbitStop();
    orbitStop = null;
    viewer.scene.requestRender();
  }
}

// ---------------------------------------------------------------------------
// Hilfen

/** Wartet, bis das Gelände samt Bildebenen für die aktuelle Ansicht geladen ist. */
export function whenTilesLoaded(viewer, timeoutMs) {
  return new Promise((resolve) => {
    const globe = viewer.scene.globe;
    if (globe.tilesLoaded) { resolve(true); return; }
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      remove();
      clearTimeout(timer);
      resolve(ok);
    };
    const remove = globe.tileLoadProgressEvent.addEventListener((remaining) => {
      if (remaining === 0) finish(true);
    });
    const timer = setTimeout(() => finish(false), timeoutMs);
    viewer.scene.requestRender();
  });
}

/** Grober Massstab: Bodenauflösung in Metern pro Bildschirmpixel in der Bildmitte. */
export function metersPerPixelAtCenter(viewer) {
  const p = groundPointAtCenter(viewer);
  if (!p) return null;
  const fov = viewer.camera.frustum.fovy || (60 * DEG);
  const h = viewer.canvas.clientHeight || 1;
  return (2 * p.range * Math.tan(fov / 2)) / h;
}
