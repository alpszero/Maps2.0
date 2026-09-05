// Bekannte Orte der Schweiz von oben: eingebaute Liste mit Lage und passender
// Zoomstufe für die Zufallsfunktion; `tag` ist die kuratierte Zusatzzeile fürs
// Insta-Bild. Die Lage wird beim Anspringen über das
// Ortsverzeichnis von swisstopo nachgeschärft (siehe locatePlace), die Liste
// dient als Suchbegriff und als Rückfallwert.

import { searchLocations } from './geoadmin.js';

export const PLACES = [
  { name: 'Matterhorn', sub: 'Zermatt VS', lng: 7.6586, lat: 45.9763, zoom: 15, tag: '4478 m, Wahrzeichen der Schweiz' },
  { name: 'Zermatt', sub: 'Dorf am Fuss des Matterhorns', lng: 7.7491, lat: 46.0207, zoom: 16, tag: 'Autofreies Bergdorf, 1608 m' },
  { name: 'Gornergrat', sub: 'Zermatt VS', lng: 7.7847, lat: 45.9836, zoom: 16, tag: 'Aussichtsberg, 3089 m, Zahnradbahn seit 1898' },
  { name: 'Jungfraujoch', sub: 'Sphinx-Observatorium, Top of Europe', lng: 7.9853, lat: 46.5474, zoom: 16, tag: 'Höchstgelegener Bahnhof Europas, 3454 m' },
  { name: 'Rheinfall', sub: 'Neuhausen am Rheinfall SH', lng: 8.6154, lat: 47.6778, zoom: 17, tag: 'Grösster Wasserfall Europas nach Wassermenge' },
  { name: 'Schloss Chillon', sub: 'Veytaux VD', lng: 6.9272, lat: 46.4142, zoom: 18, tag: 'Wasserburg am Genfersee, 12. Jahrhundert' },
  { name: 'Kapellbrücke', sub: 'Luzern', lng: 8.3077, lat: 47.0517, zoom: 18, tag: 'Älteste erhaltene Holzbrücke Europas, 1365' },
  { name: 'Bundeshaus', sub: 'Bern', lng: 7.4442, lat: 46.9466, zoom: 17.5, tag: 'Sitz von Parlament und Bundesrat, 1902' },
  { name: 'Berner Altstadt', sub: 'Zytglogge, UNESCO-Welterbe', lng: 7.4478, lat: 46.9480, zoom: 17, tag: 'UNESCO-Welterbe seit 1983' },
  { name: 'Bürkliplatz', sub: 'Zürich, Seebecken', lng: 8.5412, lat: 47.3665, zoom: 17, tag: 'Am Zürichsee, Blick auf die Alpen' },
  { name: 'Zürich Hauptbahnhof', sub: 'Zürich', lng: 8.5402, lat: 47.3779, zoom: 17, tag: 'Grösster Bahnhof der Schweiz' },
  { name: 'Uetliberg', sub: 'Zürich', lng: 8.4910, lat: 47.3500, zoom: 16.5, tag: 'Hausberg von Zürich, 870 m' },
  { name: 'Letzigrund', sub: 'Zürich', lng: 8.5040, lat: 47.3826, zoom: 17.5, tag: 'Stadion, Heimat von Weltklasse Zürich' },
  { name: 'Flughafen Zürich', sub: 'Kloten ZH', lng: 8.5556, lat: 47.4581, zoom: 15, tag: 'Grösster Flughafen der Schweiz' },
  { name: 'Jet d’eau', sub: 'Genf', lng: 6.1558, lat: 46.2074, zoom: 17, tag: 'Wasserfontäne, 140 m hoch' },
  { name: 'Palais des Nations', sub: 'Genf', lng: 6.1403, lat: 46.2266, zoom: 17, tag: 'Europäischer Sitz der UNO' },
  { name: 'CERN', sub: 'Meyrin GE', lng: 6.0560, lat: 46.2330, zoom: 16.5, tag: 'Europäische Organisation für Kernforschung' },
  { name: 'Basler Münster', sub: 'Basel', lng: 7.5924, lat: 47.5563, zoom: 17.5, tag: 'Roter Sandstein, 1019 bis 1500' },
  { name: 'St. Jakob-Park', sub: 'Basel', lng: 7.6200, lat: 47.5415, zoom: 17.5, tag: 'Grösstes Fussballstadion der Schweiz' },
  { name: 'Stein am Rhein', sub: 'Altstadt SH', lng: 8.8598, lat: 47.6597, zoom: 17, tag: 'Bemalte Fassaden, mittelalterliches Städtchen' },
  { name: 'Munot', sub: 'Schaffhausen', lng: 8.6390, lat: 47.6970, zoom: 17.5, tag: 'Ringfestung, 16. Jahrhundert' },
  { name: 'Castelgrande', sub: 'Bellinzona TI', lng: 9.0224, lat: 46.1935, zoom: 17, tag: 'UNESCO-Welterbe, drei Burgen von Bellinzona' },
  { name: 'Gruyères', sub: 'Städtchen FR', lng: 7.0826, lat: 46.5834, zoom: 17, tag: 'Käsestädtchen mit Schloss, 13. Jahrhundert' },
  { name: 'Aletschgletscher', sub: 'Konkordiaplatz VS', lng: 8.0300, lat: 46.4900, zoom: 14.5, tag: 'Grösster Gletscher der Alpen, UNESCO-Welterbe' },
  { name: 'Creux du Van', sub: 'Felsenkessel NE', lng: 6.7300, lat: 46.9330, zoom: 15.5, tag: 'Felsenkessel, 160 m hohe Wände' },
  { name: 'Lavaux', sub: 'Weinberge bei Rivaz VD', lng: 6.7790, lat: 46.4780, zoom: 16, tag: 'Weinbergterrassen, UNESCO-Welterbe' },
  { name: 'Oeschinensee', sub: 'Kandersteg BE', lng: 7.7300, lat: 46.4980, zoom: 15.5, tag: 'Bergsee, 1578 m, UNESCO-Welterbe Jungfrau-Aletsch' },
  { name: 'Blausee', sub: 'Kandergrund BE', lng: 7.6650, lat: 46.5320, zoom: 17.5, tag: 'Kristallklarer Quellsee im Kandertal' },
  { name: 'Lauterbrunnen', sub: 'Staubbachfall BE', lng: 7.9080, lat: 46.5930, zoom: 17, tag: 'Tal der 72 Wasserfälle' },
  { name: 'Trümmelbachfälle', sub: 'Lauterbrunnen BE', lng: 7.9150, lat: 46.5700, zoom: 17, tag: 'Gletscherwasserfälle im Berginnern' },
  { name: 'Verzasca-Staumauer', sub: 'Contra TI', lng: 8.8433, lat: 46.1874, zoom: 17.5, tag: '220 m hoch, bekannt aus «GoldenEye»' },
  { name: 'Grande Dixence', sub: 'Staumauer VS', lng: 7.4034, lat: 46.0806, zoom: 16, tag: 'Höchste Gewichtsstaumauer der Welt, 285 m' },
  { name: 'Emosson', sub: 'Staumauer VS', lng: 6.9340, lat: 46.0640, zoom: 16.5, tag: 'Stausee an der Grenze zu Frankreich, 1930 m' },
  { name: 'Gotthardpass', sub: 'Hospiz', lng: 8.5670, lat: 46.5568, zoom: 16.5, tag: '2106 m, Nord-Süd-Achse seit dem Mittelalter' },
  { name: 'Furkapass', sub: 'Belvédère, Rhonegletscher', lng: 8.3960, lat: 46.5760, zoom: 16, tag: '2429 m, Rhonegletscher' },
  { name: 'Landwasserviadukt', sub: 'Filisur GR', lng: 9.6760, lat: 46.6805, zoom: 17.5, tag: 'Rhätische Bahn, UNESCO-Welterbe' },
  { name: 'Rheinschlucht', sub: 'Ruinaulta bei Versam GR', lng: 9.3300, lat: 46.8100, zoom: 15.5, tag: '«Swiss Grand Canyon»' },
  { name: 'Sion', sub: 'Valère und Tourbillon', lng: 7.3650, lat: 46.2345, zoom: 17, tag: 'Zwei Burghügel über der Kantonshauptstadt' },
  { name: 'Stiftsbezirk', sub: 'St. Gallen', lng: 9.3767, lat: 47.4233, zoom: 17.5, tag: 'UNESCO-Welterbe, Stiftsbibliothek' },
  { name: 'Appenzell', sub: 'Dorf AI', lng: 9.4090, lat: 47.3310, zoom: 17, tag: 'Bemalte Häuser, Landsgemeindeplatz' },
  { name: 'Säntis', sub: 'Gipfel AI/AR/SG', lng: 9.3433, lat: 47.2494, zoom: 16.5, tag: '2502 m, höchster Berg im Alpstein' },
  { name: 'Seealpsee', sub: 'Alpstein AI', lng: 9.4010, lat: 47.2680, zoom: 16.5, tag: 'Bergsee im Alpstein, 1143 m' },
  { name: 'Pilatus Kulm', sub: 'Luzern / Obwalden', lng: 8.2530, lat: 46.9790, zoom: 17, tag: 'Steilste Zahnradbahn der Welt' },
  { name: 'Rigi Kulm', sub: 'Schwyz', lng: 8.4855, lat: 47.0567, zoom: 16.5, tag: 'Königin der Berge, 1797 m' },
  { name: 'Titlis', sub: 'Engelberg OW', lng: 8.4380, lat: 46.7720, zoom: 16, tag: 'Drehende Luftseilbahn, 3020 m' },
  { name: 'Kloster Einsiedeln', sub: 'Einsiedeln SZ', lng: 8.7517, lat: 47.1266, zoom: 17.5, tag: 'Benediktinerabtei, Wallfahrtsort' },
  { name: 'Schloss Thun', sub: 'Thun BE', lng: 7.6290, lat: 46.7594, zoom: 17.5, tag: 'Zähringerburg, 12. Jahrhundert' },
  { name: 'Schloss Oberhofen', sub: 'Thunersee BE', lng: 7.6680, lat: 46.7310, zoom: 17.5, tag: 'Schloss am Thunersee' },
  { name: 'Schloss Spiez', sub: 'Thunersee BE', lng: 7.6790, lat: 46.6880, zoom: 17.5, tag: 'Schloss und Kirche über der Spiezer Bucht' },
  { name: 'Murten', sub: 'Altstadt FR', lng: 7.1170, lat: 46.9280, zoom: 17, tag: 'Mittelalterliches Städtchen mit Ringmauer' },
  { name: 'Neuchâtel', sub: 'Schloss und Kollegiatkirche', lng: 6.9250, lat: 46.9930, zoom: 17, tag: 'Schloss und Kollegiatkirche, 12. Jahrhundert' },
  { name: 'Interlaken', sub: 'Höhematte BE', lng: 7.8590, lat: 46.6860, zoom: 16.5, tag: 'Zwischen Thuner- und Brienzersee' },
  { name: 'Grindelwald', sub: 'BE', lng: 8.0340, lat: 46.6240, zoom: 16, tag: 'Gletscherdorf unter dem Eiger' },
  { name: 'Bachalpsee', sub: 'First, Grindelwald BE', lng: 8.0240, lat: 46.6700, zoom: 16.5, tag: 'Bergsee, 2265 m, Blick aufs Wetterhorn' },
  { name: 'Schilthorn', sub: 'Piz Gloria BE', lng: 7.8350, lat: 46.5570, zoom: 16.5, tag: 'Drehrestaurant Piz Gloria, 2970 m' },
  { name: 'Davos', sub: 'GR', lng: 9.8360, lat: 46.8027, zoom: 15.5, tag: 'Höchstgelegene Stadt Europas, 1560 m' },
  { name: 'St. Moritz', sub: 'GR', lng: 9.8380, lat: 46.4980, zoom: 16, tag: 'Zweifacher Olympiaort, 1822 m' },
  { name: 'Morteratschgletscher', sub: 'Pontresina GR', lng: 9.9350, lat: 46.4200, zoom: 15, tag: 'Grösster Gletscher der Ostalpen' },
  { name: 'Lago Bianco', sub: 'Berninapass GR', lng: 10.0230, lat: 46.4100, zoom: 15.5, tag: 'Stausee am Berninapass, 2234 m' },
  { name: 'Schloss Tarasp', sub: 'Scuol GR', lng: 10.2640, lat: 46.7790, zoom: 17.5, tag: 'Burg im Unterengadin, 11. Jahrhundert' },
  { name: 'Kloster St. Johann', sub: 'Müstair GR, UNESCO-Welterbe', lng: 10.4483, lat: 46.6292, zoom: 17.5, tag: 'UNESCO-Welterbe, karolingische Fresken' },
  { name: 'Kloster Disentis', sub: 'Disentis GR', lng: 8.8530, lat: 46.7050, zoom: 17.5, tag: 'Benediktinerkloster seit dem 8. Jahrhundert' },
  { name: 'Chur', sub: 'Altstadt GR', lng: 9.5330, lat: 46.8490, zoom: 17, tag: 'Älteste Stadt der Schweiz' },
  { name: 'Therme Vals', sub: 'Vals GR', lng: 9.1810, lat: 46.6160, zoom: 17.5, tag: 'Bad aus Valser Quarzit, Peter Zumthor' },
  { name: 'Bürgenstock', sub: 'Resort NW', lng: 8.3840, lat: 46.9967, zoom: 17, tag: 'Hotelresort über dem Vierwaldstättersee' },
  { name: 'Rütli', sub: 'Seelisberg UR', lng: 8.5950, lat: 46.9690, zoom: 17, tag: 'Wiege der Eidgenossenschaft' },
  { name: 'Schloss Lenzburg', sub: 'Lenzburg AG', lng: 8.1889, lat: 47.3868, zoom: 17.5, tag: 'Eine der ältesten Höhenburgen der Schweiz' },
  { name: 'Schloss Hallwyl', sub: 'Seengen AG', lng: 8.1981, lat: 47.2969, zoom: 17.5, tag: 'Wasserschloss am Hallwilersee' },
  { name: 'Wasserschloss', sub: 'Aare, Reuss und Limmat AG', lng: 8.2200, lat: 47.4935, zoom: 15.5, tag: 'Zusammenfluss von Aare, Reuss und Limmat' },
  { name: 'Brissago-Inseln', sub: 'Lago Maggiore TI', lng: 8.7360, lat: 46.1320, zoom: 17, tag: 'Botanischer Garten auf der Insel' },
  { name: 'Morcote', sub: 'Luganersee TI', lng: 8.9170, lat: 45.9230, zoom: 17, tag: 'Perle des Ceresio' },
  { name: 'Lugano', sub: 'Parco Ciani', lng: 8.9570, lat: 46.0045, zoom: 17, tag: 'Palmen am Luganersee' },
  { name: 'Locarno', sub: 'Piazza Grande', lng: 8.7960, lat: 46.1700, zoom: 17.5, tag: 'Filmfestival auf der Piazza Grande' },
  { name: 'Ascona', sub: 'Seepromenade TI', lng: 8.7720, lat: 46.1540, zoom: 17, tag: 'Künstlerdorf am Lago Maggiore' },
  { name: 'Lausanne', sub: 'Kathedrale', lng: 6.6355, lat: 46.5225, zoom: 17.5, tag: 'Gotische Kathedrale, 13. Jahrhundert' },
  { name: 'Ouchy', sub: 'Lausanne, Hafen', lng: 6.6260, lat: 46.5070, zoom: 16.5, tag: 'Hafenquartier am Genfersee' },
  { name: 'Montreux', sub: 'Quai VD', lng: 6.9110, lat: 46.4310, zoom: 17, tag: 'Jazz Festival an der Riviera' },
  { name: 'Vevey', sub: 'Seeufer VD', lng: 6.8430, lat: 46.4590, zoom: 17, tag: 'Riesengabel im See, Sitz von Nestlé' },
  { name: 'Fribourg', sub: 'Kathedrale St. Nikolaus', lng: 7.1625, lat: 46.8064, zoom: 17, tag: 'Gotische Kathedrale, Zähringerstadt' },
  { name: 'Solothurn', sub: 'St.-Ursen-Kathedrale', lng: 7.5380, lat: 47.2083, zoom: 17.5, tag: 'Schönste Barockstadt der Schweiz' },
  { name: 'Zug', sub: 'Altstadt', lng: 8.5160, lat: 47.1660, zoom: 17.5, tag: 'Altstadt am Zugersee' },
  { name: 'Rapperswil', sub: 'Schloss und Holzsteg SG', lng: 8.8170, lat: 47.2265, zoom: 17, tag: 'Rosenstadt, längster Holzsteg der Schweiz' },
  { name: 'Gelmersee', sub: 'Grimsel BE', lng: 8.3230, lat: 46.6260, zoom: 16, tag: 'Steilste Standseilbahn Europas' },
  { name: 'Lac de Moiry', sub: 'Staumauer VS', lng: 7.5810, lat: 46.1400, zoom: 16, tag: 'Türkisfarbener Stausee, 2249 m' },
  { name: 'Stade de Genève', sub: 'Lancy GE', lng: 6.1275, lat: 46.1778, zoom: 17.5, tag: 'Heimstadion von Servette FC' },

  // --- Pässe und Hochalpen
  { name: 'Grimselpass', sub: 'BE/VS', lng: 8.34, lat: 46.57, zoom: 15.5, tag: '2164 m, Grimselsee und Staumauern' },
  { name: 'Sustenpass', sub: 'BE/UR', lng: 8.45, lat: 46.73, zoom: 16, tag: '2224 m, Steingletscher' },
  { name: 'Klausenpass', sub: 'UR/GL', lng: 8.85, lat: 46.87, zoom: 16, tag: '1948 m, Urnerboden' },
  { name: 'Oberalppass', sub: 'UR/GR', lng: 8.67, lat: 46.66, zoom: 16, tag: '2044 m, Leuchtturm an der Rheinquelle' },
  { name: 'Tomasee', sub: 'Rheinquelle GR', lng: 8.67, lat: 46.63, zoom: 16.5, tag: 'Quelle des Rheins, 2345 m' },
  { name: 'Julierpass', sub: 'GR', lng: 9.73, lat: 46.47, zoom: 16, tag: '2284 m, römische Säulenreste' },
  { name: 'Simplonpass', sub: 'VS', lng: 8.03, lat: 46.25, zoom: 16, tag: '2005 m, Adler-Denkmal' },
  { name: 'Nufenenpass', sub: 'VS/TI', lng: 8.39, lat: 46.48, zoom: 16, tag: '2478 m, höchster Strassenpass innerhalb der Schweiz' },
  { name: 'Grosser St. Bernhard', sub: 'Hospiz VS', lng: 7.17, lat: 45.87, zoom: 16, tag: '2469 m, Hospiz seit 1050, Bernhardiner' },
  { name: 'San Bernardino', sub: 'Pass GR', lng: 9.17, lat: 46.50, zoom: 16, tag: '2066 m, Moesola-See' },
  { name: 'Splügen', sub: 'GR', lng: 9.32, lat: 46.55, zoom: 17, tag: 'Passdorf, Walser Häuser' },
  { name: 'Viamala', sub: 'Schlucht GR', lng: 9.44, lat: 46.68, zoom: 16.5, tag: 'Schlucht, 300 m tief' },
  { name: 'Andermatt', sub: 'UR', lng: 8.59, lat: 46.635, zoom: 16.5, tag: 'Passdorf am Gotthard, 1437 m' },
  { name: 'Diavolezza', sub: 'Pontresina GR', lng: 9.97, lat: 46.42, zoom: 16, tag: 'Blick auf Piz Bernina, 2978 m' },
  { name: 'Corvatsch', sub: 'Silvaplana GR', lng: 9.82, lat: 46.41, zoom: 16, tag: 'Höchste Bergstation der Ostalpen, 3303 m' },
  { name: 'Riffelsee', sub: 'Zermatt VS', lng: 7.76, lat: 45.98, zoom: 17, tag: 'Spiegelung des Matterhorns' },
  { name: 'Glacier 3000', sub: 'Les Diablerets VD', lng: 7.20, lat: 46.32, zoom: 15.5, tag: 'Peak Walk, Hängebrücke zwischen zwei Gipfeln' },
  { name: 'Rochers-de-Naye', sub: 'Montreux VD', lng: 6.98, lat: 46.43, zoom: 16, tag: 'Aussicht über den Genfersee, 2042 m' },
  { name: 'Kleine Scheidegg', sub: 'BE', lng: 7.96, lat: 46.585, zoom: 16.5, tag: 'Bahnhof unter der Eigernordwand, 2061 m' },
  { name: 'Männlichen', sub: 'Grindelwald BE', lng: 7.94, lat: 46.61, zoom: 16, tag: 'Royal Walk, Blick auf Eiger, Mönch und Jungfrau' },
  { name: 'Harder Kulm', sub: 'Interlaken BE', lng: 7.86, lat: 46.70, zoom: 17, tag: 'Aussichtsplattform über Interlaken, 1322 m' },
  { name: 'Niesen', sub: 'BE', lng: 7.65, lat: 46.65, zoom: 16, tag: 'Pyramide am Thunersee, längste Treppe der Welt' },
  { name: 'Stockhorn', sub: 'BE', lng: 7.55, lat: 46.69, zoom: 16, tag: '2190 m, Gipfel mit Fenster' },
  { name: 'Stanserhorn', sub: 'NW', lng: 8.34, lat: 46.93, zoom: 16.5, tag: 'Cabrio-Bahn, 1898 m' },
  { name: 'Stoos', sub: 'SZ', lng: 8.66, lat: 46.98, zoom: 16.5, tag: 'Steilste Standseilbahn der Welt, 110 %' },
  { name: 'Brienzer Rothorn', sub: 'BE', lng: 8.04, lat: 46.79, zoom: 16, tag: 'Dampfzahnradbahn, 2350 m' },
  { name: 'Cardada', sub: 'Locarno TI', lng: 8.79, lat: 46.19, zoom: 16.5, tag: 'Aussichtsberg über Locarno' },
  { name: 'Monte Brè', sub: 'Lugano TI', lng: 8.99, lat: 46.01, zoom: 16.5, tag: 'Sonnigster Berg der Schweiz' },
  { name: 'Monte San Salvatore', sub: 'Lugano TI', lng: 8.945, lat: 45.98, zoom: 16.5, tag: 'Zuckerhut von Lugano, 912 m' },
  // --- Seen und Wasser
  { name: 'Aareschlucht', sub: 'Meiringen BE', lng: 8.20, lat: 46.72, zoom: 16, tag: 'Schlucht, 1.4 km lang, bis 200 m tief' },
  { name: 'Reichenbachfall', sub: 'Meiringen BE', lng: 8.18, lat: 46.71, zoom: 16.5, tag: 'Wasserfall, Sherlock Holmes' },
  { name: 'Giessbachfälle', sub: 'Brienzersee BE', lng: 7.99, lat: 46.73, zoom: 16.5, tag: 'Wasserfälle und Grandhotel Giessbach' },
  { name: 'Iseltwald', sub: 'Brienzersee BE', lng: 7.96, lat: 46.71, zoom: 17.5, tag: 'Bilderbuchdorf am Brienzersee' },
  { name: 'Seerenbachfälle', sub: 'Walensee SG', lng: 9.19, lat: 47.13, zoom: 16.5, tag: 'Höchster Wasserfall der Schweiz, 585 m' },
  { name: 'Quinten', sub: 'Walensee SG', lng: 9.22, lat: 47.13, zoom: 16.5, tag: 'Autofreies Dorf am Walensee' },
  { name: 'Caumasee', sub: 'Flims GR', lng: 9.29, lat: 46.82, zoom: 16.5, tag: 'Türkisfarbener Waldsee' },
  { name: 'Heidsee', sub: 'Lenzerheide GR', lng: 9.56, lat: 46.74, zoom: 16, tag: 'Bergsee auf 1484 m' },
  { name: 'Klöntalersee', sub: 'Glarus', lng: 8.98, lat: 47.03, zoom: 15.5, tag: 'Bergsee im Glarnerland' },
  { name: 'Lac de Joux', sub: 'Vallée de Joux VD', lng: 6.29, lat: 46.63, zoom: 15, tag: 'Grösster See des Jura, 1004 m' },
  { name: 'Greifensee', sub: 'ZH', lng: 8.68, lat: 47.35, zoom: 15.5, tag: 'Naturschutzgebiet vor Zürich' },
  { name: 'Ufenau', sub: 'Zürichsee SZ', lng: 8.78, lat: 47.22, zoom: 17, tag: 'Klosterinsel im Zürichsee' },
  { name: 'St. Petersinsel', sub: 'Bielersee BE', lng: 7.14, lat: 47.06, zoom: 16, tag: 'Halbinsel im Bielersee, Rousseau' },
  { name: 'Twann', sub: 'Bielersee BE', lng: 7.16, lat: 47.095, zoom: 17, tag: 'Winzerdorf am Bielersee' },
  { name: 'Taminaschlucht', sub: 'Bad Ragaz SG', lng: 9.50, lat: 46.99, zoom: 16.5, tag: 'Thermalquelle in der Schlucht' },
  { name: 'Foroglio', sub: 'Bavonatal TI', lng: 8.58, lat: 46.37, zoom: 17, tag: 'Wasserfall, 110 m, Steindorf' },
  { name: 'Lavertezzo', sub: 'Verzascatal TI', lng: 8.838, lat: 46.259, zoom: 17.5, tag: 'Ponte dei Salti, smaragdgrünes Wasser' },
  { name: 'Gandria', sub: 'Luganersee TI', lng: 9.00, lat: 46.00, zoom: 17.5, tag: 'Fischerdorf am Luganersee' },
  { name: 'Melide', sub: 'Swissminiatur TI', lng: 8.945, lat: 45.955, zoom: 17.5, tag: 'Die Schweiz im Massstab 1:25' },
  { name: 'Dreiländereck', sub: 'Basel', lng: 7.59, lat: 47.59, zoom: 17, tag: 'Schweiz, Deutschland und Frankreich am Rhein' },
  { name: 'Bains des Pâquis', sub: 'Genf', lng: 6.155, lat: 46.21, zoom: 17.5, tag: 'Seebad und Leuchtturm' },
  // --- Bergdörfer und Kurorte
  { name: 'Mürren', sub: 'BE', lng: 7.892, lat: 46.559, zoom: 16.5, tag: 'Autofreies Dorf auf 1638 m' },
  { name: 'Wengen', sub: 'BE', lng: 7.921, lat: 46.606, zoom: 16, tag: 'Autofreies Dorf, Lauberhornrennen' },
  { name: 'Adelboden', sub: 'BE', lng: 7.56, lat: 46.49, zoom: 16, tag: 'Weltcup-Skiort im Engstligental' },
  { name: 'Gstaad', sub: 'BE', lng: 7.29, lat: 46.47, zoom: 16.5, tag: 'Promenade und Palace' },
  { name: 'Leukerbad', sub: 'VS', lng: 7.63, lat: 46.38, zoom: 16, tag: 'Grösster Thermalbadeort der Alpen' },
  { name: 'Saas-Fee', sub: 'VS', lng: 7.93, lat: 46.11, zoom: 16, tag: 'Perle der Alpen, 13 Viertausender' },
  { name: 'Verbier', sub: 'VS', lng: 7.23, lat: 46.10, zoom: 16, tag: 'Skigebiet 4 Vallées' },
  { name: 'Crans-Montana', sub: 'VS', lng: 7.48, lat: 46.31, zoom: 16, tag: 'Sonnenplateau über dem Rhonetal' },
  { name: 'Riederalp', sub: 'VS', lng: 8.03, lat: 46.38, zoom: 16, tag: 'Autofrei, Blick auf den Aletschgletscher' },
  { name: 'Bettmeralp', sub: 'VS', lng: 8.06, lat: 46.39, zoom: 16.5, tag: 'Autofreies Dorf, Kapelle Maria zum Schnee' },
  { name: 'Arosa', sub: 'GR', lng: 9.68, lat: 46.78, zoom: 16, tag: 'Bärenland und Obersee' },
  { name: 'Scuol', sub: 'Unterengadin GR', lng: 10.30, lat: 46.80, zoom: 16.5, tag: 'Engadiner Dorf, Mineralquellen' },
  { name: 'Guarda', sub: 'Unterengadin GR', lng: 10.15, lat: 46.78, zoom: 17.5, tag: 'Schellen-Ursli-Dorf, Sgraffiti' },
  { name: 'Zuoz', sub: 'Oberengadin GR', lng: 9.96, lat: 46.60, zoom: 17, tag: 'Engadiner Dorf mit Dorfplatz' },
  { name: 'Sils Maria', sub: 'Oberengadin GR', lng: 9.76, lat: 46.43, zoom: 17, tag: 'Nietzsche-Haus, Halbinsel Chastè' },
  { name: 'Pontresina', sub: 'GR', lng: 9.90, lat: 46.49, zoom: 16.5, tag: 'Bergsteigerdorf im Oberengadin' },
  { name: 'Bergün', sub: 'GR', lng: 9.75, lat: 46.63, zoom: 17, tag: 'Bahnerlebnisweg Albula, UNESCO-Welterbe' },
  { name: 'Bosco Gurin', sub: 'TI', lng: 8.49, lat: 46.32, zoom: 17, tag: 'Höchstgelegenes Dorf des Tessins, Walser' },
  { name: 'Château-d’Œx', sub: 'VD', lng: 7.13, lat: 46.475, zoom: 16.5, tag: 'Heissluftballon-Hauptstadt' },
  { name: 'Saillon', sub: 'VS', lng: 7.19, lat: 46.17, zoom: 17, tag: 'Mittelalterliches Dorf, kleinster Weinberg der Welt' },
  { name: 'Maienfeld', sub: 'Heididorf GR', lng: 9.53, lat: 47.005, zoom: 17, tag: 'Heidi-Dorf, Bündner Herrschaft' },
  // --- Schlösser, Klöster, Römer
  { name: 'Kloster Engelberg', sub: 'OW', lng: 8.406, lat: 46.821, zoom: 17, tag: 'Benediktinerkloster seit 1120' },
  { name: 'Stockalperpalast', sub: 'Brig VS', lng: 7.99, lat: 46.316, zoom: 17.5, tag: 'Barockpalast, 17. Jahrhundert' },
  { name: 'Amphitheater Martigny', sub: 'VS', lng: 7.07, lat: 46.09, zoom: 17.5, tag: 'Römisches Amphitheater' },
  { name: 'Maison Cailler', sub: 'Broc FR', lng: 7.10, lat: 46.605, zoom: 17.5, tag: 'Schokoladenfabrik seit 1898' },
  { name: 'Abteikirche Payerne', sub: 'VD', lng: 6.94, lat: 46.82, zoom: 17.5, tag: 'Romanische Abteikirche, 11. Jahrhundert' },
  { name: 'Avenches', sub: 'Amphitheater VD', lng: 7.04, lat: 46.88, zoom: 17.5, tag: 'Römische Hauptstadt Aventicum' },
  { name: 'Schloss Yverdon', sub: 'VD', lng: 6.64, lat: 46.78, zoom: 17.5, tag: 'Savoyer Schloss, 13. Jahrhundert' },
  { name: 'Estavayer-le-Lac', sub: 'FR', lng: 6.85, lat: 46.85, zoom: 17, tag: 'Rosenstädtchen am Neuenburgersee' },
  { name: 'Saint-Ursanne', sub: 'JU', lng: 7.15, lat: 47.365, zoom: 17.5, tag: 'Mittelalterliches Städtchen am Doubs' },
  { name: 'Porrentruy', sub: 'JU', lng: 7.07, lat: 47.42, zoom: 17.5, tag: 'Fürstbischöfliches Schloss' },
  { name: 'Augusta Raurica', sub: 'Kaiseraugst AG', lng: 7.72, lat: 47.535, zoom: 17, tag: 'Römerstadt mit Theater' },
  { name: 'Kyburg', sub: 'ZH', lng: 8.74, lat: 47.46, zoom: 17.5, tag: 'Schloss über der Töss' },
  { name: 'Kartause Ittingen', sub: 'Warth TG', lng: 8.87, lat: 47.58, zoom: 17.5, tag: 'Ehemaliges Kartäuserkloster' },
  { name: 'Schloss Arenenberg', sub: 'Salenstein TG', lng: 9.06, lat: 47.68, zoom: 17.5, tag: 'Napoleonmuseum am Untersee' },
  { name: 'Schloss Sargans', sub: 'SG', lng: 9.44, lat: 47.05, zoom: 17.5, tag: 'Grafenschloss über dem Rheintal' },
  { name: 'Schloss Burgdorf', sub: 'BE', lng: 7.63, lat: 47.06, zoom: 17.5, tag: 'Zähringerburg' },
  { name: 'Schloss Nyon', sub: 'VD', lng: 6.24, lat: 46.383, zoom: 17.5, tag: 'Schloss über dem Genfersee' },
  { name: 'Schloss Morges', sub: 'VD', lng: 6.50, lat: 46.507, zoom: 17.5, tag: 'Savoyer Wasserschloss' },
  { name: 'Schloss Aigle', sub: 'VD', lng: 6.97, lat: 46.315, zoom: 17.5, tag: 'Schloss inmitten der Reben' },
  { name: 'Salzbergwerk Bex', sub: 'VD', lng: 7.02, lat: 46.26, zoom: 17, tag: 'Salzbergwerk seit 1684' },
  { name: 'Madonna del Sasso', sub: 'Locarno TI', lng: 8.79, lat: 46.175, zoom: 17.5, tag: 'Wallfahrtskirche über Locarno' },
  { name: 'Telldenkmal', sub: 'Altdorf UR', lng: 8.64, lat: 46.88, zoom: 17.5, tag: 'Telldenkmal, 1895' },
  { name: 'Bundesbriefmuseum', sub: 'Schwyz', lng: 8.65, lat: 47.02, zoom: 17.5, tag: 'Bundesbrief von 1291' },
  { name: 'Ballenberg', sub: 'Freilichtmuseum BE', lng: 8.09, lat: 46.75, zoom: 16.5, tag: 'Freilichtmuseum, über 100 Gebäude' },
  { name: 'Schaukäserei Affoltern', sub: 'Emmental BE', lng: 7.73, lat: 47.06, zoom: 17.5, tag: 'Emmentaler Schaukäserei' },
  // --- Städte und Altstädte
  { name: 'Grossmünster', sub: 'Zürich', lng: 8.544, lat: 47.37, zoom: 17.5, tag: 'Wahrzeichen Zürichs, Zwinglis Kirche' },
  { name: 'Bahnhofstrasse', sub: 'Zürich', lng: 8.539, lat: 47.373, zoom: 17, tag: 'Eine der teuersten Einkaufsstrassen der Welt' },
  { name: 'Prime Tower', sub: 'Zürich-West', lng: 8.518, lat: 47.386, zoom: 17.5, tag: '126 m, Zürich-West' },
  { name: 'Lindenhof', sub: 'Zürich', lng: 8.541, lat: 47.373, zoom: 17.5, tag: 'Ältester Ort der Stadt, römisches Kastell' },
  { name: 'Zoo Zürich', sub: 'Zürichberg', lng: 8.575, lat: 47.385, zoom: 17, tag: 'Masoala-Regenwaldhalle' },
  { name: 'Dolder Grand', sub: 'Zürich', lng: 8.573, lat: 47.373, zoom: 17.5, tag: 'Grandhotel über der Stadt' },
  { name: 'Berner Münster', sub: 'Bern', lng: 7.451, lat: 46.947, zoom: 17.5, tag: 'Höchster Kirchturm der Schweiz, 100 m' },
  { name: 'Rosengarten', sub: 'Bern', lng: 7.46, lat: 46.95, zoom: 17.5, tag: 'Aussicht auf die Altstadt' },
  { name: 'Zentrum Paul Klee', sub: 'Bern', lng: 7.475, lat: 46.95, zoom: 17.5, tag: 'Wellenbau von Renzo Piano' },
  { name: 'Bärenpark', sub: 'Bern', lng: 7.459, lat: 46.948, zoom: 17.5, tag: 'Bären am Aareufer' },
  { name: 'Gurten', sub: 'Bern', lng: 7.44, lat: 46.92, zoom: 16.5, tag: 'Hausberg von Bern, 858 m' },
  { name: 'Schloss Schadau', sub: 'Thun BE', lng: 7.63, lat: 46.75, zoom: 17.5, tag: 'Schloss und Park am Thunersee' },
  { name: 'Tinguely-Brunnen', sub: 'Basel', lng: 7.59, lat: 47.55, zoom: 18, tag: 'Brunnen von Jean Tinguely' },
  { name: 'Roche-Türme', sub: 'Basel', lng: 7.605, lat: 47.56, zoom: 17, tag: 'Höchste Gebäude der Schweiz, 205 m' },
  { name: 'Fondation Beyeler', sub: 'Riehen BS', lng: 7.65, lat: 47.59, zoom: 17.5, tag: 'Museum von Renzo Piano' },
  { name: 'Zoo Basel', sub: 'Basel', lng: 7.58, lat: 47.55, zoom: 17, tag: 'Zolli, ältester Zoo der Schweiz' },
  { name: 'Reformationsdenkmal', sub: 'Genf', lng: 6.146, lat: 46.20, zoom: 18, tag: 'Reformationsmauer im Parc des Bastions' },
  { name: 'Cathédrale Saint-Pierre', sub: 'Genf', lng: 6.148, lat: 46.201, zoom: 17.5, tag: 'Calvins Kathedrale' },
  { name: 'Carouge', sub: 'Genf', lng: 6.14, lat: 46.18, zoom: 17, tag: 'Sardisches Städtchen' },
  { name: 'Musée Olympique', sub: 'Lausanne', lng: 6.634, lat: 46.508, zoom: 17.5, tag: 'Olympische Hauptstadt' },
  { name: 'Rolex Learning Center', sub: 'EPFL Lausanne', lng: 6.568, lat: 46.518, zoom: 17.5, tag: 'Wellenbau der EPFL' },
  { name: 'Tour de Sauvabelin', sub: 'Lausanne', lng: 6.64, lat: 46.535, zoom: 17.5, tag: 'Holzturm, 35 m' },
  { name: 'La Chaux-de-Fonds', sub: 'NE', lng: 6.83, lat: 47.10, zoom: 16, tag: 'Uhrenstadt im Schachbrettmuster, UNESCO-Welterbe' },
  { name: 'Le Locle', sub: 'NE', lng: 6.75, lat: 47.06, zoom: 16.5, tag: 'Uhrenstadt, UNESCO-Welterbe' },
  { name: 'Delémont', sub: 'JU', lng: 7.34, lat: 47.37, zoom: 17, tag: 'Hauptort des Jura' },
  { name: 'Biel/Bienne', sub: 'Altstadt', lng: 7.246, lat: 47.14, zoom: 17.5, tag: 'Zweisprachige Uhrenstadt' },
  { name: 'Aarau', sub: 'Altstadt AG', lng: 8.045, lat: 47.393, zoom: 17.5, tag: 'Stadt der schönen Giebel' },
  { name: 'Baden', sub: 'Altstadt AG', lng: 8.31, lat: 47.475, zoom: 17.5, tag: 'Thermalbad am Limmatknie' },
  { name: 'Bremgarten', sub: 'AG', lng: 8.34, lat: 47.35, zoom: 17.5, tag: 'Mittelalterliches Städtchen an der Reuss' },
  { name: 'Zofingen', sub: 'AG', lng: 7.945, lat: 47.29, zoom: 17.5, tag: 'Thutstadt' },
  { name: 'Rheinfelden', sub: 'AG', lng: 7.79, lat: 47.555, zoom: 17.5, tag: 'Zähringerstadt am Rhein' },
  { name: 'Laufenburg', sub: 'AG', lng: 8.06, lat: 47.56, zoom: 17.5, tag: 'Städtchen beidseits des Rheins' },
  { name: 'Winterthur', sub: 'Altstadt', lng: 8.73, lat: 47.50, zoom: 17, tag: 'Museumsstadt' },
  { name: 'Schaffhausen', sub: 'Altstadt', lng: 8.634, lat: 47.696, zoom: 17.5, tag: 'Erkerstadt am Rhein' },
  { name: 'Frauenfeld', sub: 'TG', lng: 8.90, lat: 47.556, zoom: 17.5, tag: 'Hauptort Thurgau, Schloss' },
  { name: 'Arbon', sub: 'Bodensee TG', lng: 9.43, lat: 47.515, zoom: 17, tag: 'Schloss am Bodensee' },
  { name: 'Rorschach', sub: 'Bodensee SG', lng: 9.49, lat: 47.48, zoom: 17, tag: 'Kornhaus am Bodensee' },
  { name: 'Herisau', sub: 'AR', lng: 9.28, lat: 47.386, zoom: 17, tag: 'Hauptort Appenzell Ausserrhoden' },
  { name: 'Glarus', sub: 'GL', lng: 9.067, lat: 47.04, zoom: 17, tag: 'Landsgemeinde-Stadt unter dem Glärnisch' },
  { name: 'Sarnen', sub: 'OW', lng: 8.245, lat: 46.896, zoom: 17, tag: 'Hauptort Obwalden am Sarnersee' },
  { name: 'Stans', sub: 'NW', lng: 8.366, lat: 46.958, zoom: 17.5, tag: 'Dorfplatz, Winkelried-Denkmal' },
  { name: 'Liestal', sub: 'BL', lng: 7.735, lat: 47.484, zoom: 17.5, tag: 'Hauptort Basel-Landschaft' },
];

// Suchbegriffe, wo der Name allein im Ortsverzeichnis nicht eindeutig ist.
const QUERY = {
  'Berner Altstadt': 'Zytglogge Bern', 'Bürkliplatz': 'Bürkliplatz Zürich', 'Zürich Hauptbahnhof': 'Zürich HB',
  'Letzigrund': 'Stadion Letzigrund', 'Jet d’eau': "Jet d'eau Genève", 'Palais des Nations': 'Palais des Nations Genève',
  'Basler Münster': 'Münster Basel', 'St. Jakob-Park': 'St. Jakob-Park Basel', 'Stein am Rhein': 'Stein am Rhein',
  'Castelgrande': 'Castelgrande Bellinzona', 'Aletschgletscher': 'Konkordiaplatz', 'Lavaux': 'Rivaz',
  'Lauterbrunnen': 'Staubbachfall', 'Verzasca-Staumauer': 'Diga di Contra', 'Grande Dixence': 'Barrage de la Grande Dixence',
  'Emosson': "Barrage d'Emosson", 'Gotthardpass': 'Gotthardpass Hospiz', 'Furkapass': 'Hotel Belvédère Furka',
  'Landwasserviadukt': 'Landwasserviadukt Filisur', 'Rheinschlucht': 'Ruinaulta', 'Sion': 'Château de Valère Sion',
  'Stiftsbezirk': 'Kathedrale St. Gallen', 'Appenzell': 'Appenzell', 'Interlaken': 'Höhematte Interlaken',
  'Bachalpsee': 'Bachalpsee', 'Davos': 'Davos Platz', 'Morteratschgletscher': 'Vadret da Morteratsch',
  'Lago Bianco': 'Lago Bianco', 'Kloster St. Johann': 'Kloster St. Johann Müstair', 'Chur': 'Chur Altstadt',
  'Therme Vals': 'Therme Vals', 'Bürgenstock': 'Bürgenstock', 'Wasserschloss': 'Wasserschloss Brugg',
  'Lugano': 'Parco Ciani Lugano', 'Locarno': 'Piazza Grande Locarno', 'Lausanne': 'Cathédrale de Lausanne',
  'Ouchy': 'Ouchy Lausanne', 'Fribourg': 'Cathédrale Saint-Nicolas Fribourg', 'Solothurn': 'St. Ursen Solothurn',
  'Zug': 'Zug Altstadt', 'Rapperswil': 'Schloss Rapperswil', 'Lac de Moiry': 'Barrage de Moiry',
  'Stade de Genève': 'Stade de Genève', 'Uetliberg': 'Uetliberg', 'Flughafen Zürich': 'Flughafen Zürich',
  'Rütli': 'Rütli Seelisberg', 'Zermatt': 'Zermatt',
  'Glacier 3000': 'Scex Rouge', 'Grosser St. Bernhard': 'Col du Grand St-Bernard', 'San Bernardino': 'Passo del San Bernardino',
  'Dreiländereck': 'Dreiländereck Basel', 'Tomasee': 'Lai da Tuma', 'Biel/Bienne': 'Biel/Bienne', 'Melide': 'Swissminiatur',
  'Avenches': 'Amphithéâtre Avenches', 'Amphitheater Martigny': 'Amphithéâtre Martigny', 'Salzbergwerk Bex': 'Mines de Sel Bex',
  'Gurten': 'Gurten Kulm', 'Rosengarten': 'Rosengarten Bern', 'Bärenpark': 'Bärenpark Bern', 'Lindenhof': 'Lindenhof Zürich',
  'Bahnhofstrasse': 'Bahnhofstrasse Zürich', 'Carouge': 'Carouge', 'Winterthur': 'Winterthur', 'Baden': 'Baden AG', 'Stans': 'Stans NW',
};

const cache = new Map();

/**
 * Lage eines Orts über das Ortsverzeichnis von swisstopo nachschärfen. Der erste
 * Treffer zählt, wenn er nahe genug an der eingebauten Lage liegt (sonst bleibt
 * die Liste massgebend, damit Namensvettern nicht in eine andere Region führen).
 * @returns {{lng:number, lat:number, source:'gazetteer'|'list'}}
 */
export async function locatePlace(place, { signal } = {}) {
  if (cache.has(place.name)) return cache.get(place.name);
  const fallback = { lng: place.lng, lat: place.lat, source: 'list' };
  try {
    const hits = await searchLocations(QUERY[place.name] || place.name, { signal });
    const hit = hits.find((h) => Number.isFinite(h.lat) && Number.isFinite(h.lon) && distanceM(h.lon, h.lat, place.lng, place.lat) < 3000);
    const res = hit ? { lng: hit.lon, lat: hit.lat, source: 'gazetteer' } : fallback;
    cache.set(place.name, res);
    return res;
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return fallback;
  }
}

/** Zufälliger Ort, nicht derselbe wie zuletzt. */
export function randomPlace(previous = null, rng = Math.random) {
  if (PLACES.length < 2) return PLACES[0];
  for (;;) {
    const p = PLACES[Math.floor(rng() * PLACES.length)];
    if (p !== previous) return p;
  }
}

/** Ort aus der Liste in der Nähe eines Punkts (innerhalb `meters`), sonst null. */
export function placeNear(lng, lat, meters = 400) {
  let best = null, bestD = Infinity;
  for (const p of PLACES) {
    const d = distanceM(lng, lat, p.lng, p.lat);
    if (d < bestD) { bestD = d; best = p; }
  }
  return bestD <= meters ? best : null;
}

export function distanceM(lng1, lat1, lng2, lat2) {
  const r = Math.PI / 180;
  const dx = (lng2 - lng1) * r * Math.cos(((lat1 + lat2) / 2) * r);
  const dy = (lat2 - lat1) * r;
  return Math.sqrt(dx * dx + dy * dy) * 6371000;
}
