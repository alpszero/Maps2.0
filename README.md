# Zeitreise Luftbilder

Eine Web-App fürs Handy, die zeigt, wie ein Ort in der Schweiz früher aussah.

Man öffnet sie, sie springt auf den eigenen Standort, und mit dem Schieberegler
wandert man durch die Jahrzehnte: dieselbe Stelle, Jahrgang für Jahrgang, als
Luftbild von oben. Die Bilder blenden ineinander über, so dass sichtbar wird, was
sich verändert hat. Gross oben steht das Jahr, in dem tatsächlich geflogen wurde.

Statt des eigenen Standorts lässt sich über die Suche jede Adresse oder jeder Ort
in der Schweiz ansteuern. Über den Ebenen-Knopf lassen sich Fachdaten des
Bundes-Geoportals mit regelbarer Deckkraft über das Luftbild legen.

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

## Aufbau

```
index.html            Oberfläche
css/style.css         Gestaltung (mobil zuerst, dunkles Design)
js/app.js             Einstieg: Karte, Regler, Standort, Panels
js/timeline.js        Jahrgänge: Überblendung ohne Flackern, Vorladen der Nachbarn
js/overlays.js        Zusatzebenen aus dem Geoportal-Verzeichnis
js/search.js          Ortssuche mit Vorschlägen
js/geoadmin.js        Zugriff auf die geo.admin.ch-Dienste
js/config.js          Dienste, Themen-Filter, Verhalten
vendor/maplibre-gl/   MapLibre GL JS (BSD-3-Lizenz, siehe LICENSE.txt)
```

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
