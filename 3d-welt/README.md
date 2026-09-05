# 3D-Welt Schweiz

Die Schweiz in 3D im Browser: Geländemodell, Gebäude mit Dachformen, Bauwerke
und Vegetation, darüber die Luftbilder von swisstopo. Mit dem Schieberegler
wandert man durch die Jahrgänge der SWISSIMAGE-Zeitreise; das Luftbild liegt
dabei auf dem Gelände, so dass Hänge, Täler und Städte plastisch erscheinen.

Über die Suche lässt sich jede Adresse, jeder Ort, jeder Berg in der Schweiz
ansteuern. Der Standort-Knopf springt auf die eigene Position. Über den
Ebenen-Knopf lassen sich die 3D-Objekte ein- und ausschalten und beliebige
Fachdaten aus dem Verzeichnis des Bundes-Geoportals mit regelbarer Deckkraft
über das Gelände legen. Ein Rundflug dreht die Kamera um die Bildmitte, und die
Ansicht lässt sich als Link teilen.

## Woher die Daten kommen

Alles stammt von swisstopo über die offenen Dienste des Bundes-Geoportals
([geo.admin.ch](https://www.geo.admin.ch/)), ohne Schlüssel oder Konto:

| Zweck          | Dienst                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------- |
| Gelände        | `3d.geo.admin.ch/ch.swisstopo.terrain.3d/v1/` (Quantized Mesh aus swissALTI3D)               |
| Gebäude        | `3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json` (3D Tiles)                |
| Bauwerke       | `3d.geo.admin.ch/ch.swisstopo.swisstlm3d.3d/v1/tileset.json` (Brücken, Türme, Staumauern)    |
| Vegetation     | `3d.geo.admin.ch/ch.swisstopo.vegetation.3d/v1/tileset.json`                                 |
| Luftbilder     | WMTS `ch.swisstopo.swissimage-product` (SWISSIMAGE Zeitreise), Zeitdimension = Jahrgang      |
| Jahrgänge      | `api3.geo.admin.ch/rest/services/api/MapServer/layersConfig` → `timestamps` der Ebene       |
| Aufnahmejahr   | Identify auf `ch.swisstopo.swissimage-product.metadata` für die Bildmitte, je Jahrgang        |
| Ortssuche      | `api3.geo.admin.ch/rest/services/api/SearchServer?type=locations`                            |
| Zusatzebenen   | Verzeichnis `layersConfig`; Darstellung per WMTS (EPSG:3857) oder WMS über dem Gelände       |

Das sind dieselben 3D-Dienste, die der 3D-Modus von map.geo.admin.ch verwendet.
Abgedeckt ist nur die Schweiz. Wo nicht geflogen wurde, bleibt die Fläche leer.
© swisstopo

## Betrieb

Reine statische Web-App ohne Build-Schritt. CesiumJS liegt unter `vendor/cesium/`,
es wird nichts von einem CDN und nichts von Cesium ion nachgeladen.

Lokal starten (ES-Module brauchen einen HTTP-Server, `file://` genügt nicht):

```
python3 -m http.server 8000
```

Dann <http://localhost:8000/> öffnen. Die Standortabfrage funktioniert nur über
`https://` oder `localhost`.

Veröffentlichen: Der Workflow `.github/workflows/pages.yml` stellt den Inhalt des
Repositories bei jedem Push auf `main` über GitHub Pages bereit (in den
Repository-Einstellungen unter *Pages* die Quelle *GitHub Actions* wählen).

## Aufbau

```
index.html            Oberfläche
css/style.css         Gestaltung (mobil zuerst, dunkles Design)
js/app.js             Einstieg: Szene, Regler, Standort, Panels, URL-Fragment
js/scene.js           Cesium: Viewer, Gelände, Bildebenen, 3D Tiles, Kamera, Rundflug
js/timeline.js        Jahrgänge: Überblendung ohne Flackern
js/overlays.js        Zusatzebenen aus dem Geoportal-Verzeichnis
js/search.js          Ortssuche mit Vorschlägen
js/geoadmin.js        Zugriff auf die geo.admin.ch-Dienste (aus «Zeitreise Luftbilder» übernommen)
js/config.js          Dienste, 3D-Ebenen, Verhalten
vendor/cesium/        CesiumJS 1.145 (Apache-2.0): Cesium.js, Workers, Assets, ThirdParty, widgets.css
```

### Wie die Szene aufgebaut ist

* **Gelände**: `CesiumTerrainProvider` auf dem Quantized-Mesh-Dienst von swisstopo.
  `depthTestAgainstTerrain` ist an, damit Gebäude und Ebenen korrekt vom Gelände
  verdeckt werden. Gerendert wird nur bei Änderungen (`requestRenderMode`), das
  schont Akku und Grafikeinheit.
* **Luftbilder**: Jeder Jahrgang ist eine eigene `ImageryLayer` auf dem WMTS in
  EPSG:3857 (Stufen 6 bis 20), begrenzt auf die Schweiz. Beim Wechsel wird der
  Ziel-Jahrgang oberhalb des bisherigen eingeblendet; der bisherige bleibt voll
  sichtbar, bis das Gelände mit dem neuen Bild geladen ist, und wird erst dann
  entfernt. Zusatzebenen liegen immer oberhalb der Jahrgänge.
* **3D-Objekte**: `Cesium3DTileset` je Ebene, geladen beim ersten Einschalten.
  Gebäude sind vorgabemässig an und werden mit kleinerem Bildschirmfehler geladen,
  damit keine Lücken entstehen.
* **Kamera**: Suche und Standort fliegen auf einen Bodenpunkt; dessen Höhe wird
  vorher aus dem Gelände abgefragt, die Distanz richtet sich nach der Ausdehnung
  des Treffers. «3D» wechselt zwischen schräger (−40°) und senkrechter Sicht,
  «Nord» richtet aus, beide drehen um den Bodenpunkt in der Bildmitte. Der
  Rundflug nutzt `camera.lookAt` um diesen Punkt.
* **Link teilen**: Das URL-Fragment enthält Kameraposition (Länge, Breite, Höhe),
  Blickrichtung, Neigung und Jahrgang: `#lon/lat/höhe/heading/pitch/jahr`.

### Hinweise zu den Diensten

* Die Liste der Jahrgänge wird aus dem Geoportal gelesen und lokal
  zwischengespeichert (30 Tage); beim allerersten Start greift nach vier Sekunden
  eine eingebaute Fallback-Liste.
* Zusatzebenen werden per WMTS geladen. Liefert der WMTS-Dienst für eine Ebene
  keine Kachel (Probe-Anfrage unter der Bildmitte), wird auf den WMS-Dienst
  ausgewichen. Sammel-Ebenen werden in ihre Unter-Ebenen aufgelöst; GeoJSON-Ebenen
  werden nicht angeboten.
* Die Ortsnamen-Ebene (`swissnames3d.3d`) des Bundes-Viewers ist kein einfaches
  3D-Tileset, sondern wird dort mit einem eigenen Renderer gezeichnet; sie ist
  deshalb hier nicht enthalten.
* Ist 3d.geo.admin.ch nicht erreichbar, bleibt die Karte flach und die App meldet
  es; Luftbilder, Suche und Zeitreise funktionieren weiter.
