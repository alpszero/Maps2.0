# Zeitreise Luftbilder

Eine Web-App fürs Handy, die zeigt, wie ein Ort in der Schweiz früher aussah.

Man öffnet sie, sie springt auf den eigenen Standort, und mit dem Schieberegler
wandert man durch die Jahrzehnte: dieselbe Stelle, Jahrgang für Jahrgang, als
Luftbild von oben. Die Bilder blenden ineinander über, so dass sichtbar wird, was
sich verändert hat. Gross oben steht das Jahr, in dem tatsächlich geflogen wurde.

Dazu kommen vier Dinge, nicht mehr:

* **Suche**: jede Adresse oder jeder Ort in der Schweiz.
* **Ortsnamen und Gelände**: über den Ebenen-Knopf einblendbar.
* **Insta-Bild**: Ausschnitt wählen, ein Knopf, fertiges Bild mit Ortsangaben.
* **Orte von oben**: der Würfel fliegt zu einem bekannten Ort der Schweiz.

## Woher die Daten kommen

Alles stammt von swisstopo über die offenen Dienste des Bundes-Geoportals
([geo.admin.ch](https://www.geo.admin.ch/)), ohne Schlüssel oder Konto:

| Zweck          | Dienst                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------- |
| Luftbilder     | WMTS `ch.swisstopo.swissimage-product` (SWISSIMAGE Zeitreise), Zeitdimension = Jahrgang  |
| Jahrgänge      | `api3.geo.admin.ch/rest/services/api/MapServer/layersConfig` → `timestamps` der Ebene   |
| Aufnahmejahr   | Identify auf `ch.swisstopo.swissimage-product.metadata` für die Bildmitte, je Jahrgang    |
| Ortssuche      | `api3.geo.admin.ch/rest/services/api/SearchServer?type=locations`                        |
| Ortsnamen      | WMS `ch.swisstopo.swissnames3d`                                                          |
| Gelände        | WMTS `ch.swisstopo.swissalti3d-reliefschattierung` (Fallback WMS)                        |
| Ortsangaben    | Identify (Rechteck) auf `ch.swisstopo.swissnames3d`, Identify (Punkt) auf `ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill` |

Abgedeckt ist nur die Schweiz, und nicht jeder Jahrgang deckt jeden Ort ab.
Wo nicht geflogen wurde, bleibt die Fläche leer. © swisstopo

## Betrieb

Reine statische Web-App ohne Build-Schritt. MapLibre GL JS, TensorFlow.js und die
Modellgewichte liegen unter `vendor/`, es wird nichts von einem CDN nachgeladen.

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
js/app.js             Einstieg: Karte, Regler, Standort, Suche, Ebenen, Orte, Panels
js/timeline.js        Jahrgänge: Überblendung ohne Flackern, Vorladen der Nachbarn
js/search.js          Ortssuche mit Vorschlägen
js/layers.js          Einblendbare Ebenen (Ortsnamen, Gelände)
js/frame.js           Geografisch verankerter, ziehbarer Rahmen mit Seitenverhältnis
js/enhance.js         Kacheln zusammensetzen, Real-ESRGAN kompakt, Veredelung, Export
js/insta.js           Insta-Bild: Ortsbestimmung, Ablauf, Beschriftung
js/insta-ui.js        Insta-Bild: Bedienleiste und Ergebnis
js/places.js          Bekannte Orte der Schweiz (Liste) und Zufallswahl
js/geoadmin.js        Zugriff auf die geo.admin.ch-Dienste
js/config.js          Dienste, Ebenen, Verhalten
vendor/maplibre-gl/   MapLibre GL JS (BSD-3-Lizenz)
vendor/tfjs/          TensorFlow.js (Apache-2.0), wird erst fürs Insta-Bild geladen
vendor/realesrgan/    Real-ESRGAN-Gewichte «realesr-general-x4v3» (BSD-3), 9.7 MB
```

### Suche

Treffer erscheinen als Liste unter dem Suchfeld; Antippen oder Enter fliegt zur
Stelle, die Zoomstufe richtet sich nach der Art des Treffers (Adresse, Ort, PLZ,
Gemeinde, Kanton). Die Treffer sind echte Schaltflächen und reagieren auf `click`:
Auf iOS werden Tipps auf nicht interaktive Elemente bei offener Tastatur oft nur
zum Schliessen der Tastatur verwendet, so dass scheinbar nichts passiert. Der
automatische Sprung zum eigenen Standort beim Start unterbleibt, wenn man vorher
schon gesucht, gewürfelt oder die Karte gezogen hat.

### Ortsnamen und Gelände

Zwei Schalter. Ortsnamen kommen als WMS-Beschriftungsebene (swissNAMES3D), das
Gelände als Reliefschattierung aus swissALTI3D mit 45 % Deckkraft über dem
Luftbild. Die Namen liegen immer über dem Relief. Liefert der WMTS-Dienst für eine
Ebene keine Kachel (Probe-Anfrage unter der Bildmitte), wird auf den WMS-Dienst
ausgewichen.

### Insta-Bild

Ziel: mit möglichst wenigen Schritten zu einem Bild, das man direkt posten kann.

1. **Rahmen** (`js/frame.js`): quadratisch (1:1) oder hochkant (4:5), geografisch
   verankert, Eckgriffe ändern die Grösse, die Karte lässt sich darunter bewegen.
   Der Jahrgang ist der gerade eingestellte.
2. **Ortsname**: wird aus swissNAMES3D für den Ausschnitt ermittelt (Orte und
   Quartiere vor Flurnamen, Gebäude zuletzt), Gemeinde und Kanton aus
   swissBOUNDARIES3D; steht der Rahmen auf einem Ort aus der eingebauten Liste, gilt
   dessen Name. Das Feld lässt sich überschreiben.
3. **Bild erstellen** (`js/insta.js`, `js/enhance.js`): Die Kacheln werden eine
   Stufe feiner geladen, als der Bildschirm sie zeigt (bei hochauflösenden
   Bildschirmen zählt deren Pixeldichte mit), höchstens Stufe 20 (rund 10 cm)
   und höchstens so, dass die längste Kante 2048 Pixel nicht übersteigt. So
   kommt echte Auflösung ins Bild. Ist das Quellbild kleiner als 1024 Pixel
   (kleiner Rahmen, wenige Kacheln), rechnet das kompakte Real-ESRGAN
   («realesr-general-x4v3», 33 Faltungsschichten) es 2-fach mit Glättung 50 %
   hoch: Das Netz arbeitet fest 4-fach, das 2-fach-Ergebnis entsteht durch
   Mittelung; die Glättung mischt die Gewichte des normalen und des
   rauschunterdrückenden Modells linear, wie `denoise_strength` im Original.
   Grössere Quellbilder bleiben bei ihren echten Pixeln. Anschliessend die
   Foto-Veredelung: Tonwerte sanft strecken (aus dem ganzen Bild bestimmt),
   Farben um rund ein Fünftel kräftigen, mildes Kontrast-S, Unschärfemaske.
   Zum Schluss die Beschriftung in Weiss über einem dunklen Verlauf: Ortsname gross
   in Grossbuchstaben mit Sperrung, dünne Linie, Gemeinde und Kanton, Koordinaten
   (WGS84, vier Nachkommastellen), rechts klein «© swisstopo · Luftbild Jahr».
4. **Ergebnis**: JPEG (Qualität 93 %) herunterladen oder, wo der Browser Dateien
   teilen kann (iOS, Android), direkt in die Teilen-Übersicht geben. Ausgabe bis
   2048 Pixel Kante; die Leiste zeigt die erwartete Grösse schon vor dem Start.
   Es verlässt kein Bild das Gerät.

Tempo: Rechen-Backend WebGPU, wo verfügbar, sonst WebGL; grössere Rechenkacheln
auf Desktop-Geräten; der Bildschirm wird während der Berechnung wach gehalten.
Das Modell wurde mit `vendor/realesrgan/convert.py` ohne PyTorch aus den
Original-Gewichten umgewandelt und in TensorFlow.js nachgebaut; die
Vorwärtsrechnung ist gegen eine NumPy-Referenz geprüft. Das Modell ist auf
allgemeine Fotografien trainiert; es schärft Kanten und Texturen, kann aber
Details erfinden, die in der Aufnahme nicht existieren.

### Orte von oben

`js/places.js` enthält rund 80 bekannte Orte mit Lage und passender Zoomstufe
(Matterhorn, Rheinfall, Kapellbrücke, Landwasserviadukt, Kloster Müstair …). Der
Würfel fliegt zu einem zufälligen Ort und zeigt Namen und Zusatz in einer kleinen
Karte; «Nächster» würfelt weiter. Das Insta-Bild übernimmt den Namen, wenn der
Rahmen auf einem dieser Orte steht.

### Wie der Jahrgangswechsel flüssig bleibt

* Jeder Jahrgang ist ein eigener Raster-Layer. Beim Wechsel wird der Ziel-Jahrgang
  zuoberst platziert und eingeblendet; der bisherige bleibt darunter voll sichtbar,
  bis die Überblendung fertig ist und die Kacheln des Ziels geladen sind. Erst dann
  wird er ohne Animation ausgeblendet. So gibt es weder Helligkeitseinbruch noch
  leere Flächen während des Wechsels.
* Die Jahrgänge im Umkreis von drei Schritten bleiben mit Deckkraft 0 aktiv, damit
  ihre Kacheln bereits geladen sind. Das Vorladen setzt erst ein, wenn die Karte
  ruht und der sichtbare Jahrgang geladen ist.
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
