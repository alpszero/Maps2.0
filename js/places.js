// Bekannte Orte der Schweiz von oben: eingebaute Liste mit Lage und passender
// Zoomstufe für die Zufallsfunktion.

export const PLACES = [
  { name: 'Matterhorn', sub: 'Zermatt VS', lng: 7.6586, lat: 45.9763, zoom: 15 },
  { name: 'Zermatt', sub: 'Dorf am Fuss des Matterhorns', lng: 7.7491, lat: 46.0207, zoom: 16 },
  { name: 'Gornergrat', sub: 'Zermatt VS', lng: 7.7847, lat: 45.9836, zoom: 16 },
  { name: 'Jungfraujoch', sub: 'Sphinx-Observatorium, Top of Europe', lng: 7.9853, lat: 46.5474, zoom: 16 },
  { name: 'Rheinfall', sub: 'Neuhausen am Rheinfall SH', lng: 8.6154, lat: 47.6778, zoom: 17 },
  { name: 'Schloss Chillon', sub: 'Veytaux VD', lng: 6.9272, lat: 46.4142, zoom: 18 },
  { name: 'Kapellbrücke', sub: 'Luzern', lng: 8.3077, lat: 47.0517, zoom: 18 },
  { name: 'Bundeshaus', sub: 'Bern', lng: 7.4442, lat: 46.9466, zoom: 17.5 },
  { name: 'Berner Altstadt', sub: 'Zytglogge, UNESCO-Welterbe', lng: 7.4478, lat: 46.9480, zoom: 17 },
  { name: 'Bürkliplatz', sub: 'Zürich, Seebecken', lng: 8.5412, lat: 47.3665, zoom: 17 },
  { name: 'Zürich Hauptbahnhof', sub: 'Zürich', lng: 8.5402, lat: 47.3779, zoom: 17 },
  { name: 'Uetliberg', sub: 'Zürich', lng: 8.4910, lat: 47.3500, zoom: 16.5 },
  { name: 'Letzigrund', sub: 'Zürich', lng: 8.5040, lat: 47.3826, zoom: 17.5 },
  { name: 'Flughafen Zürich', sub: 'Kloten ZH', lng: 8.5556, lat: 47.4581, zoom: 15 },
  { name: 'Jet d’eau', sub: 'Genf', lng: 6.1558, lat: 46.2074, zoom: 17 },
  { name: 'Palais des Nations', sub: 'Genf', lng: 6.1403, lat: 46.2266, zoom: 17 },
  { name: 'CERN', sub: 'Meyrin GE', lng: 6.0560, lat: 46.2330, zoom: 16.5 },
  { name: 'Basler Münster', sub: 'Basel', lng: 7.5924, lat: 47.5563, zoom: 17.5 },
  { name: 'St. Jakob-Park', sub: 'Basel', lng: 7.6200, lat: 47.5415, zoom: 17.5 },
  { name: 'Stein am Rhein', sub: 'Altstadt SH', lng: 8.8598, lat: 47.6597, zoom: 17 },
  { name: 'Munot', sub: 'Schaffhausen', lng: 8.6390, lat: 47.6970, zoom: 17.5 },
  { name: 'Castelgrande', sub: 'Bellinzona TI', lng: 9.0224, lat: 46.1935, zoom: 17 },
  { name: 'Gruyères', sub: 'Städtchen FR', lng: 7.0826, lat: 46.5834, zoom: 17 },
  { name: 'Aletschgletscher', sub: 'Konkordiaplatz VS', lng: 8.0300, lat: 46.4900, zoom: 14.5 },
  { name: 'Creux du Van', sub: 'Felsenkessel NE', lng: 6.7300, lat: 46.9330, zoom: 15.5 },
  { name: 'Lavaux', sub: 'Weinberge bei Rivaz VD', lng: 6.7790, lat: 46.4780, zoom: 16 },
  { name: 'Oeschinensee', sub: 'Kandersteg BE', lng: 7.7300, lat: 46.4980, zoom: 15.5 },
  { name: 'Blausee', sub: 'Kandergrund BE', lng: 7.6650, lat: 46.5320, zoom: 17.5 },
  { name: 'Lauterbrunnen', sub: 'Staubbachfall BE', lng: 7.9080, lat: 46.5930, zoom: 17 },
  { name: 'Trümmelbachfälle', sub: 'Lauterbrunnen BE', lng: 7.9150, lat: 46.5700, zoom: 17 },
  { name: 'Verzasca-Staumauer', sub: 'Contra TI', lng: 8.8433, lat: 46.1874, zoom: 17.5 },
  { name: 'Grande Dixence', sub: 'Staumauer VS', lng: 7.4034, lat: 46.0806, zoom: 16 },
  { name: 'Emosson', sub: 'Staumauer VS', lng: 6.9340, lat: 46.0640, zoom: 16.5 },
  { name: 'Gotthardpass', sub: 'Hospiz', lng: 8.5670, lat: 46.5568, zoom: 16.5 },
  { name: 'Furkapass', sub: 'Belvédère, Rhonegletscher', lng: 8.3960, lat: 46.5760, zoom: 16 },
  { name: 'Landwasserviadukt', sub: 'Filisur GR', lng: 9.6760, lat: 46.6805, zoom: 17.5 },
  { name: 'Rheinschlucht', sub: 'Ruinaulta bei Versam GR', lng: 9.3300, lat: 46.8100, zoom: 15.5 },
  { name: 'Sion', sub: 'Valère und Tourbillon', lng: 7.3650, lat: 46.2345, zoom: 17 },
  { name: 'Stiftsbezirk', sub: 'St. Gallen', lng: 9.3767, lat: 47.4233, zoom: 17.5 },
  { name: 'Appenzell', sub: 'Dorf AI', lng: 9.4090, lat: 47.3310, zoom: 17 },
  { name: 'Säntis', sub: 'Gipfel AI/AR/SG', lng: 9.3433, lat: 47.2494, zoom: 16.5 },
  { name: 'Seealpsee', sub: 'Alpstein AI', lng: 9.4010, lat: 47.2680, zoom: 16.5 },
  { name: 'Pilatus Kulm', sub: 'Luzern / Obwalden', lng: 8.2530, lat: 46.9790, zoom: 17 },
  { name: 'Rigi Kulm', sub: 'Schwyz', lng: 8.4855, lat: 47.0567, zoom: 16.5 },
  { name: 'Titlis', sub: 'Engelberg OW', lng: 8.4380, lat: 46.7720, zoom: 16 },
  { name: 'Kloster Einsiedeln', sub: 'Einsiedeln SZ', lng: 8.7517, lat: 47.1266, zoom: 17.5 },
  { name: 'Schloss Thun', sub: 'Thun BE', lng: 7.6290, lat: 46.7594, zoom: 17.5 },
  { name: 'Schloss Oberhofen', sub: 'Thunersee BE', lng: 7.6680, lat: 46.7310, zoom: 17.5 },
  { name: 'Schloss Spiez', sub: 'Thunersee BE', lng: 7.6790, lat: 46.6880, zoom: 17.5 },
  { name: 'Murten', sub: 'Altstadt FR', lng: 7.1170, lat: 46.9280, zoom: 17 },
  { name: 'Neuchâtel', sub: 'Schloss und Kollegiatkirche', lng: 6.9250, lat: 46.9930, zoom: 17 },
  { name: 'Interlaken', sub: 'Höhematte BE', lng: 7.8590, lat: 46.6860, zoom: 16.5 },
  { name: 'Grindelwald', sub: 'BE', lng: 8.0340, lat: 46.6240, zoom: 16 },
  { name: 'Bachalpsee', sub: 'First, Grindelwald BE', lng: 8.0240, lat: 46.6700, zoom: 16.5 },
  { name: 'Schilthorn', sub: 'Piz Gloria BE', lng: 7.8350, lat: 46.5570, zoom: 16.5 },
  { name: 'Davos', sub: 'GR', lng: 9.8360, lat: 46.8027, zoom: 15.5 },
  { name: 'St. Moritz', sub: 'GR', lng: 9.8380, lat: 46.4980, zoom: 16 },
  { name: 'Morteratschgletscher', sub: 'Pontresina GR', lng: 9.9350, lat: 46.4200, zoom: 15 },
  { name: 'Lago Bianco', sub: 'Berninapass GR', lng: 10.0230, lat: 46.4100, zoom: 15.5 },
  { name: 'Schloss Tarasp', sub: 'Scuol GR', lng: 10.2640, lat: 46.7790, zoom: 17.5 },
  { name: 'Kloster St. Johann', sub: 'Müstair GR, UNESCO-Welterbe', lng: 10.4483, lat: 46.6292, zoom: 17.5 },
  { name: 'Kloster Disentis', sub: 'Disentis GR', lng: 8.8530, lat: 46.7050, zoom: 17.5 },
  { name: 'Chur', sub: 'Altstadt GR', lng: 9.5330, lat: 46.8490, zoom: 17 },
  { name: 'Therme Vals', sub: 'Vals GR', lng: 9.1810, lat: 46.6160, zoom: 17.5 },
  { name: 'Bürgenstock', sub: 'Resort NW', lng: 8.3840, lat: 46.9967, zoom: 17 },
  { name: 'Rütli', sub: 'Seelisberg UR', lng: 8.5950, lat: 46.9690, zoom: 17 },
  { name: 'Schloss Lenzburg', sub: 'Lenzburg AG', lng: 8.1889, lat: 47.3868, zoom: 17.5 },
  { name: 'Schloss Hallwyl', sub: 'Seengen AG', lng: 8.1981, lat: 47.2969, zoom: 17.5 },
  { name: 'Wasserschloss', sub: 'Aare, Reuss und Limmat AG', lng: 8.2200, lat: 47.4935, zoom: 15.5 },
  { name: 'Brissago-Inseln', sub: 'Lago Maggiore TI', lng: 8.7360, lat: 46.1320, zoom: 17 },
  { name: 'Morcote', sub: 'Luganersee TI', lng: 8.9170, lat: 45.9230, zoom: 17 },
  { name: 'Lugano', sub: 'Parco Ciani', lng: 8.9570, lat: 46.0045, zoom: 17 },
  { name: 'Locarno', sub: 'Piazza Grande', lng: 8.7960, lat: 46.1700, zoom: 17.5 },
  { name: 'Ascona', sub: 'Seepromenade TI', lng: 8.7720, lat: 46.1540, zoom: 17 },
  { name: 'Lausanne', sub: 'Kathedrale', lng: 6.6355, lat: 46.5225, zoom: 17.5 },
  { name: 'Ouchy', sub: 'Lausanne, Hafen', lng: 6.6260, lat: 46.5070, zoom: 16.5 },
  { name: 'Montreux', sub: 'Quai VD', lng: 6.9110, lat: 46.4310, zoom: 17 },
  { name: 'Vevey', sub: 'Seeufer VD', lng: 6.8430, lat: 46.4590, zoom: 17 },
  { name: 'Fribourg', sub: 'Kathedrale St. Nikolaus', lng: 7.1625, lat: 46.8064, zoom: 17 },
  { name: 'Solothurn', sub: 'St.-Ursen-Kathedrale', lng: 7.5380, lat: 47.2083, zoom: 17.5 },
  { name: 'Zug', sub: 'Altstadt', lng: 8.5160, lat: 47.1660, zoom: 17.5 },
  { name: 'Rapperswil', sub: 'Schloss und Holzsteg SG', lng: 8.8170, lat: 47.2265, zoom: 17 },
  { name: 'Gelmersee', sub: 'Grimsel BE', lng: 8.3230, lat: 46.6260, zoom: 16 },
  { name: 'Lac de Moiry', sub: 'Staumauer VS', lng: 7.5810, lat: 46.1400, zoom: 16 },
  { name: 'Stade de Genève', sub: 'Lancy GE', lng: 6.1275, lat: 46.1778, zoom: 17.5 },
];

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
