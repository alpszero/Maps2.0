# Zeitreise Luftbilder

Eine Web-App fürs Handy, die zeigt, wie ein Ort in der Schweiz früher aussah.

Man öffnet sie, sie springt auf den eigenen Standort, und mit dem Schieberegler
wandert man durch die Jahrzehnte: dieselbe Stelle, Jahrgang für Jahrgang, als
Luftbild von oben. Die Bilder blenden ineinander über, so dass sichtbar wird, was
sich verändert hat. Gross oben steht das Jahr, in dem tatsächlich geflogen wurde.

Statt des eigenen Standorts lässt sich über die Suche jede Adresse oder jeder Ort
in der Schweiz ansteuern. Über den Ebenen-Knopf lassen sich Fachdaten des
Bundes-Geoportals mit regelbarer Deckkraft über das Luftbild legen.

Mit dem Vergrössern-Knopf wird ein Ausschnitt der Luftbilder direkt im Browser
2- oder 4-fach hochskaliert, wahlweise mit einem neuronalen Netz (ESRGAN) oder
klassischen Filtern. Das Ergebnis lässt sich im Vorher/Nachher-Vergleich prüfen,
als PNG herunterladen oder in einem neuen Tab öffnen.

## Woher die Daten kommen

Alles stammt von swisstopo über die offenen Dienste des Bundes-Geoportals
([geo.admin.ch](https://www.geo.admin.ch/)), ohne Schlüssel oder Konto:

| Zweck          | Dienst                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------- |
| Luftbilder     | WMTS `ch.swisstopo.swissimage-product` (SWISSIMAGE Zeitreise), Zeitdimension = Jahrgang  |
| Jahrgänge      | `api3.geo.admin.ch/rest/services/api/MapServer/layersConfig` → `timestamps` der Ebene   |
| Aufnahmejahr   | Identify auf `ch.swisstopo.swissimage-product.metadata` für die Bildmitte, je Jahrgang    |
| Ortssuche      | `api3.geo.admin.ch/rest/services/api/SearchServer?type=locations`                        |
| Zusatzebenen   | Verzeichnis `layersConfig`, gefiltert nach vier Themen; Darstellung per WMTS, WMS, GeoJSON |

Abgedeckt ist nur die Schweiz, und nicht jeder Jahrgang deckt jeden Ort ab.
Wo nicht geflogen wurde, bleibt die Fläche leer. © swisstopo

## Betrieb

Reine statische Web-App ohne Build-Schritt. MapLibre GL JS liegt unter `vendor/`,
es wird nichts von einem CDN nachgeladen.

Lokal starten (ES-Module brauchen einen HTTP-Server, `file://` genügt nicht):

```
python3 -m http.server 8000
```

Dann <http://localhost:8000/> öffnen. Die Standortabfrage funktioniert nur über
`https://` oder `localhost`.

Veröffentlichen: Der Workflow `.github/workflows/pages.yml` stellt den Inhalt des
Repositories bei jedem Push auf `main` über GitHub Pages bereit (in den
Repository-Einstellungen unter *Pages* die Quelle *GitHub Actions* wählen).

### Animation

Ausschnitt mit demselben Rahmen wählen, Jahrgänge von/bis, Grösse (360 bis
1080 px), Standzeit und Überblendung. Die App lädt jeden Jahrgang für den
Ausschnitt (`js/animate.js`), überspringt Jahrgänge ohne Bild, blendet mit
Ease-in-out über und schreibt die Jahreszahl ins Bild. Ausgabe als GIF (gifenc,
256 Farben je Bild) oder als Video über MediaRecorder: MP4 in Safari, WebM in
Chrome und Firefox. Die Videoaufnahme läuft in Echtzeit, der Tab muss dabei offen
bleiben.

### Quiz «Wo ist das?»

Modus Gemeinden: Zufallspunkt in der Schweiz, Identify auf
`ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill` liefert Name und Umriss;
die Karte zoomt auf den Umriss (maximal Stufe 15). Drei weitere Gemeinden dienen
als Ablenker, eine davon aus der Nähe. Modus Seen: eingebaute Liste der grössten
Schweizer Seen. Während des Quiz ist die Suchleiste ausgeblendet.

## Aufbau

```
index.html            Oberfläche
css/style.css         Gestaltung (mobil zuerst, dunkles Design)
js/app.js             Einstieg: Karte, Regler, Standort, Panels
js/timeline.js        Jahrgänge: Überblendung ohne Flackern, Vorladen der Nachbarn
js/overlays.js        Zusatzebenen aus dem Geoportal-Verzeichnis
js/search.js          Ortssuche mit Vorschlägen
js/upscale.js         Hochskalieren: Kacheln laden, KI- und Filter-Methoden, Export
js/upscale-ui.js      Hochskalieren: Panel, Vergleich, Export
js/frame.js           Geografisch verankerter, ziehbarer Rahmen
js/animate.js         Animation: Jahrgänge laden, überblenden, GIF/Video
js/animate-ui.js      Animation: Panel
js/quiz.js            Quiz: Runden aus Geoportal (Gemeinden) und Seenliste
js/quiz-ui.js         Quiz: Panel
js/geoadmin.js        Zugriff auf die geo.admin.ch-Dienste
js/config.js          Dienste, Themen-Filter, Verhalten
vendor/maplibre-gl/   MapLibre GL JS (BSD-3-Lizenz)
vendor/tfjs/          TensorFlow.js (Apache-2.0), wird erst beim Hochskalieren geladen
vendor/esrgan/        ESRGAN-Modelle aus UpscalerJS (MIT), 2× und 4×, schlank und mittel
vendor/pica/          pica, Lanczos-Skalierung (MIT)
vendor/gifenc/        gifenc, GIF-Encoder (MIT)
vendor/realesrgan/    Real-ESRGAN-Gewichte (BSD-3), kompakt und x4plus
```

### Hochskalieren

* **Ausschnitt**: Ein Rahmen liegt über der Karte und ist geografisch verankert
  (`js/frame.js`). Eckgriffe ändern die Grösse, Ziehen in der Fläche verschiebt ihn,
  die Karte lässt sich daneben weiter bewegen; «Zurücksetzen» legt ein Quadrat von
  höchstens 160 m in die Mitte. Die Kacheln werden immer auf der höchsten Stufe der
  SWISSIMAGE in EPSG:3857 (Stufe 20, rund 10 cm) geladen und zusammengesetzt.
  Angezeigt werden Pixelgrösse, Bodenauflösung, Metermasse und die Druckgrösse bei
  300 dpi. Das Ergebnis ist auf 4096 Pixel Kante begrenzt (Leinwandgrenze auf dem
  Handy); Faktoren, die das sprengen, sind deaktiviert. 2× ist die Vorgabe.
* **Faktor 1×** setzt nur zusammen (volle Auflösung, ohne Netz), wahlweise mit
  Veredelung.
* **Tempo**: Rechen-Backend WebGPU, wo verfügbar (Chrome, Safari 26, Android),
  sonst WebGL; grössere Rechenkacheln auf Desktop-Geräten; der Bildschirm wird
  während der Berechnung wach gehalten (Wake Lock).
* **Foto-Veredelung** (Vorgabe ein): streckt die Tonwerte (0.5 bis 99.5 Prozent der
  Helligkeit, aus dem ganzen Bild bestimmt, damit alle Kacheln gleich behandelt
  werden), kräftigt die Farben um rund ein Fünftel, legt ein mildes Kontrast-S an
  und schärft mit einer Unschärfemaske sanft nach. Läuft kachelweise auf der
  Grafikeinheit.
* **Zoom-Knöpfe** links unten: Vergrössern, Verkleinern und «1:1», der Zoom, bei
  dem ein Kachelpixel einem Gerätepixel entspricht (Stufe 19 plus log2 der
  Pixeldichte, gedeckelt bei 20).
* **Bildstand**: «Aktuellster Stand» (Zeitstempel `current` des WMTS, also die
  neusten Aufnahmen) oder ein beliebiger Jahrgang.
* **Methoden**: Real-ESRGAN x4plus (das grosse Modell «RealESRGAN_x4plus», RRDBNet
  mit 16.7 Mio. Parametern, 34 MB einmaliger Download, klarste Kanten und
  Markierungen), Real-ESRGAN kompakt (Modell «realesr-general-x4v3», 33
  Faltungsschichten, mit regelbarer Glättung), ESRGAN gründlich und ESRGAN schnell,
  alle 2× und 4×, gerechnet mit TensorFlow.js auf der Grafikeinheit des Geräts,
  patchweise mit Überlappung, damit keine Nähte entstehen. Dazu Lanczos mit
  Nachschärfung (pica), bikubisch (Browser) und Pixelwiederholung als Referenz.
  Die Real-ESRGAN-Modelle rechnen fest 4-fach; 2× entsteht durch
  Lanczos-Verkleinerung des 4-fach-Ergebnisses.
* **Glättung** (nur Real-ESRGAN kompakt): mischt die Gewichte des normalen und des
  rauschunterdrückenden Modells linear, entsprechend `denoise_strength` im
  Original. 0 % belässt Körnung, 100 % glättet am stärksten; Vorgabe 50 %.
  Das Netz rechnet fest 4-fach; 2× entsteht durch sauberes Verkleinern (Lanczos).
* **Ergebnis**: Vorher/Nachher-Schieber, 1:1-Ansicht, Download als PNG oder JPEG
  (Qualität 93 %), Öffnen im neuen Tab. Es verlässt kein Bild das Gerät.

Zu den Modellen: Es gibt derzeit kein fertiges, im Browser lauffähiges
Super-Resolution-Modell, das speziell auf Luftbilder trainiert wurde. Real-ESRGAN
wurde mit `vendor/realesrgan/convert.py` ohne PyTorch aus den Original-Gewichten
umgewandelt und in TensorFlow.js nachgebaut (`js/upscale.js`); die Vorwärtsrechnung
ist gegen eine NumPy-Referenz geprüft. Alle Modelle sind auf allgemeine Fotografien
trainiert. Sie schärfen Kanten und Texturen von Dächern, Strassen und Vegetation
gut, können aber Details erfinden, die in der Aufnahme nicht existieren. Für
messbare Aussagen bleibt die Lanczos-Variante die ehrlichere Wahl.

### Wie der Jahrgangswechsel flüssig bleibt

* Jeder Jahrgang ist ein eigener Raster-Layer. Beim Wechsel wird der Ziel-Jahrgang
  zuoberst platziert und eingeblendet; der bisherige bleibt darunter voll sichtbar,
  bis die Überblendung fertig ist und die Kacheln des Ziels geladen sind. Erst dann
  wird er ohne Animation ausgeblendet. So gibt es weder Helligkeitseinbruch noch
  leere Flächen während des Wechsels.
* Die Jahrgänge im Umkreis von drei Schritten bleiben mit Deckkraft 0 aktiv, damit
  ihre Kacheln bereits geladen sind (z. B. 2013 ↔ 2014 hin und zurück). Das
  Vorladen setzt erst ein, wenn die Karte ruht und der sichtbare Jahrgang geladen
  ist, damit dessen Kacheln in der Warteschlange vorne stehen.
* Das Aufnahmejahr wird für die Bildmitte je Jahrgang abgefragt, zwischengespeichert
  und für die Nachbar-Jahrgänge vorab geholt.

### Hinweise zu den Diensten

* Die Liste der Jahrgänge wird aus dem Geoportal gelesen und lokal
  zwischengespeichert (30 Tage); beim allerersten Start greift nach vier Sekunden
  eine eingebaute Fallback-Liste.
* Die Attributnamen der Metadaten-Ebene werden nicht fest vorausgesetzt: Es wird
  das erste Attribut mit Flug-/Jahres-/Datumsbezug ausgewertet. Akzeptiert der
  Dienst für die Ebene keinen `timeInstant`, wird ohne Zeitfilter abgefragt und
  der passende Jahrgang selbst herausgesucht.
* Zusatzebenen werden per WMTS in EPSG:3857 geladen. Liefert der WMTS-Dienst für
  eine Ebene keine Kachel (Probe-Anfrage unter der Bildmitte), wird auf den
  WMS-Dienst ausgewichen. Sammel-Ebenen werden in ihre Unter-Ebenen aufgelöst,
  GeoJSON-Ebenen mit einer einfachen Standardsignatur gezeichnet.
