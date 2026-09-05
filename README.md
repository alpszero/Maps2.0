# Zeitreise Luftbilder

Eine Web-App fürs Handy, die zeigt, wie ein Ort in der Schweiz früher aussah.

Man öffnet sie, sie springt auf den eigenen Standort, und mit dem Schieberegler
wandert man durch die Jahrzehnte: dieselbe Stelle, Jahrgang für Jahrgang, als
Luftbild von oben. Die Bilder blenden ineinander über, so dass sichtbar wird, was
sich verändert hat. Gross oben steht das Jahr, in dem tatsächlich geflogen wurde.

Dazu kommen vier Dinge, nicht mehr:

* **Suche**: jede Adresse oder jeder Ort in der Schweiz.
* **Ortsnamen und Gelände**: über den Ebenen-Knopf einblendbar.
* **Insta-Bild**: Ausschnitt wählen, ein Knopf: Luftbild in voller Auflösung zusammengesetzt, gefiltert, als PNG.
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
| Ortsnamen      | Identify (Rechteck) auf `ch.swisstopo.swissnames3d`, als Schriftzüge gezeichnet          |
| Gelände        | WMTS `ch.swisstopo.swissalti3d-reliefschattierung` (Fallback WMS)                        |
| Ortsangaben    | Identify (Rechteck) auf `ch.swisstopo.swissnames3d`, Identify (Punkt) auf `ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill` |
| Zusatzzeile    | Identify (Punkt) auf Inventare (UNESCO, Pärke, BLN, ISOS), Höhendienst `api3.geo.admin.ch/rest/services/height` |

Abgedeckt ist nur die Schweiz, und nicht jeder Jahrgang deckt jeden Ort ab.
Wo nicht geflogen wurde, bleibt die Fläche leer. © swisstopo

## Betrieb

Reine statische Web-App ohne Build-Schritt. MapLibre GL JS und TensorFlow.js
liegen unter `vendor/`, es wird nichts von einem CDN nachgeladen.

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
js/enhance.js         Kacheln zusammensetzen, Foto-Filter, Export
js/insta.js           Insta-Bild: Ortsbestimmung, Ablauf, Beschriftung
js/insta-ui.js        Insta-Bild: Bedienleiste und Ergebnis
js/places.js          Bekannte Orte der Schweiz (Liste), Zufallswahl, Lage nachschärfen
js/geoadmin.js        Zugriff auf die geo.admin.ch-Dienste
js/config.js          Dienste, Ebenen, Verhalten
vendor/maplibre-gl/   MapLibre GL JS (BSD-3-Lizenz)
vendor/tfjs/          TensorFlow.js (Apache-2.0), wird erst für den Filter geladen
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

Zwei Schalter. Die Ortsnamen werden nicht als WMS-Ebene eingeblendet, weil diese
auch Flächennamen als Schraffur einzeichnet; stattdessen fragt `js/layers.js` die
Namen als Punkte aus swissNAMES3D für den sichtbaren Ausschnitt ab (Identify mit
Rechteck, bis 200 Treffer) und zeichnet nur die Schriftzüge, ab Zoomstufe 11:
Orte zuerst, Quartiere ab 13, Landschaftsnamen ab 12, Flurnamen ab 15, Gebäude
und Haltestellen erst ab 19. Überlappende Schriftzüge weichen den wichtigeren.
Das Gelände kommt als Reliefschattierung aus swissALTI3D mit 45 % Deckkraft über
dem Luftbild (WMTS; liefert der Dienst keine Kachel, Fallback auf WMS).

### Insta-Bild

Ziel: mit möglichst wenigen Schritten zu einem Bild in voller Auflösung, das man
posten, drucken oder aufhängen kann.

1. **Rahmen** (`js/frame.js`): quadratisch (1:1) oder hochkant (4:5), beim Öffnen
   auf 80 % des sichtbaren Kartenausschnitts gesetzt, geografisch verankert,
   Eckgriffe ändern die Grösse, die Karte lässt sich darunter bewegen.
   Der Jahrgang ist der gerade eingestellte. Die Leiste zeigt Bodenmasse,
   Pixelgrösse, Megapixel und Kachelzahl schon vor dem Start.
2. **Ortsname und Zusatz**: Der Name ist nie leer. Steht der Rahmen auf einem Ort
   aus der eingebauten Liste, gilt dessen Name; sonst der beste Name aus
   swissNAMES3D für den Ausschnitt (Orte und Quartiere vor Flurnamen, Gebäude
   zuletzt), sonst die Gemeinde aus swissBOUNDARIES3D, sonst der Kanton, sonst
   «Schweiz». Die Zusatzzeile ist für die bekannten Orte kuratiert («Höchstgelegener
   Bahnhof Europas, 3454 m», «UNESCO-Welterbe seit 1983»); sonst wird die
   Bildmitte gegen die Inventare des Bundes geprüft (UNESCO-Welterbe, Pärke von
   nationaler Bedeutung, BLN-Landschaften, Ortsbilder von nationaler Bedeutung,
   Ebenen in `config.js`), und als letzte Stufe stehen Kanton und Höhe über Meer
   aus dem Höhendienst von swisstopo («Kanton Bern · 542 m ü. M.»). Beide Felder
   lassen sich überschreiben; «Text» schaltet die Beschriftung ganz aus.
3. **Bild erstellen** (`js/insta.js`, `js/enhance.js`): Alle Kacheln unter dem
   Rahmen werden auf der höchsten verfügbaren Stufe (20, rund 10 cm je Pixel)
   geladen und zusammengesetzt, acht parallel. Deckel ist die längste Kante von
   10 000 Pixeln und die einmal gemessene Leinwandgrenze des Browsers (4096 bis
   10 240, auf Handys bis 8192); reicht das nicht, geht die Stufe eine Stufe
   zurück. Ein Quadratkilometer ergibt so rund 10 000 × 10 000 Pixel aus 1600
   Kacheln. Dann der **Foto-Filter für Luftaufnahmen mit Insta-Look**
   (TensorFlow.js auf der Grafikeinheit, kachelweise à 512 px mit Rand): Dunst
   entfernen durch sanfte Tonwertstreckung (0.5 bis 99.5 Prozent, aus dem ganzen
   Bild bestimmt, damit alle Kacheln gleich behandelt werden), mildes Kontrast-S,
   Farben um gut ein Viertel kräftiger, leichte Wärme, Klarheit (lokaler
   Kontrast mit grossem Radius), feine Schärfung (Unschärfemaske) und eine
   dezente Vignette zu den Ecken. Zum Schluss wahlweise die Beschriftung in
   Weiss über einem dunklen Verlauf: Ortsname gross in Grossbuchstaben mit
   Sperrung, dünne Linie, Gemeinde und Kanton, Zusatzzeile kursiv, Koordinaten
   (WGS84, vier Nachkommastellen), rechts klein «© swisstopo · Luftbild Jahr».
4. **Ergebnis**: Vorschau verkleinert (1600 px), Download als PNG (verlustfrei)
   oder JPEG (Qualität 93 %), Teilen als JPEG, wo der Browser Dateien teilen
   kann (iOS, Android). Die Dateien werden erst beim Klick erzeugt; ein
   100-Megapixel-PNG kann über 100 MB gross werden. Es verlässt kein Bild das
   Gerät.

Tempo: Rechen-Backend WebGPU, wo verfügbar, sonst WebGL; der Bildschirm wird
während der Berechnung wach gehalten. Speicher: Quell- und Ergebnisbild liegen
kurz gleichzeitig vor (je 4 Byte pro Pixel), das Quellbild wird danach sofort
freigegeben.

### Orte von oben

`js/places.js` enthält über 220 bekannte Orte mit Lage, passender Zoomstufe und
Zusatzzeile: Gipfel und Pässe, Seen und Wasserfälle, Bergdörfer, Schlösser,
Klöster, Römerstätten, Altstädte und Kantonshauptorte (Matterhorn, Rheinfall,
Kapellbrücke, Landwasserviadukt, Kloster Müstair, Grimselpass, Caumasee …). Der
Würfel fliegt zu einem zufälligen Ort und zeigt Namen und Zusatz in einer kleinen
Karte; «Nächster» würfelt weiter. Die eingebauten Koordinaten sind nur Näherung:
Beim Anspringen wird der Ort über das Ortsverzeichnis von swisstopo
(`SearchServer`) gesucht und die Lage des ersten Treffers verwendet, sofern er
höchstens 3 km von der Näherung entfernt liegt (Schutz vor Namensvettern); sonst
bleibt die Näherung. Für mehrdeutige Namen gibt es eigene Suchbegriffe. Das Insta-Bild übernimmt den Namen, wenn der
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
