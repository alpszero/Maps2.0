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
