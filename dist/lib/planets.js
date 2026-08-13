/**
 * planets.js
 * Zjednodušené heliocentrické polohy planet Merkur-Neptun pro
 * "sluneční soustava" pohled Astronomical Globe Card.
 *
 * Zdroj vzorců: standardní nízko-přesné střední Keplerovy elementy pro
 * J2000.0 epochu a jejich lineární rychlosti (Standish 1992 / JPL "Keplerian
 * Elements for Approximate Positions of the Major Planets", běžně
 * publikovaná tabulka) + řešení Keplerovy rovnice Newton-Raphsonem.
 * Přesnost řádově úhlové minuty pro vnitřní planety, pár úhlových minut pro
 * vnější - naprosto dostatečné pro vizualizaci (ne pro navigaci/dalekohled).
 * Platnost přibližně 1800-2050, což pro "poloha planet dnes" bohatě stačí.
 *
 * Všechny úhly interně v radiánech, veřejné API vrací AU (astronomické
 * jednotky) v heliocentrické ekliptikální J2000 soustavě souřadnic.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function toJulian(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function julianCenturies(jd) {
  return (jd - 2451545.0) / 36525;
}

/** Normalizuje úhel (stupně) do rozsahu (-180, 180]. */
function norm180(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Normalizuje úhel (stupně) do rozsahu [0, 360). */
function norm360(deg) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

/** Střední šikmost ekliptiky (stupně) pro Juliánské století T - stejný
 * IAU vzorec jako astro.js (zámerně zduplikováno, ať je tenhle modul
 * nezávislý na astro.js - žádný nový cross-modulový vztah navíc). */
function meanObliquityDeg(T) {
  return 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
}

// Střední elementy J2000.0 a jejich rychlosti za Juliánské století.
// a = velká poloosa (AU), e = excentricita, I = sklon dráhy (°),
// L = střední délka (°), peri = délka přísluní ϖ = Ω+ω (°),
// node = délka výstupného uzlu Ω (°). "_d" = derivace/století.
const ELEMENTS = {
  mercury: {
    a: 0.38709927, a_d: 0.00000037,
    e: 0.20563593, e_d: 0.00001906,
    I: 7.00497902, I_d: -0.00594749,
    L: 252.25032350, L_d: 149472.67411175,
    peri: 77.45779628, peri_d: 0.16047689,
    node: 48.33076593, node_d: -0.12534081,
  },
  venus: {
    a: 0.72333566, a_d: 0.00000390,
    e: 0.00677672, e_d: -0.00004107,
    I: 3.39467605, I_d: -0.00078890,
    L: 181.97909950, L_d: 58517.81538729,
    peri: 131.60246718, peri_d: 0.00268329,
    node: 76.67984255, node_d: -0.27769418,
  },
  earth: {
    a: 1.00000261, a_d: 0.00000562,
    e: 0.01671123, e_d: -0.00004392,
    I: -0.00001531, I_d: -0.01294668,
    L: 100.46457166, L_d: 35999.37244981,
    peri: 102.93768193, peri_d: 0.32327364,
    node: 0.0, node_d: 0.0,
  },
  mars: {
    a: 1.52371034, a_d: 0.00001847,
    e: 0.09339410, e_d: 0.00007882,
    I: 1.84969142, I_d: -0.00813131,
    L: -4.55343205, L_d: 19140.30268499,
    peri: -23.94362959, peri_d: 0.44441088,
    node: 49.55953891, node_d: -0.29257343,
  },
  jupiter: {
    a: 5.20288700, a_d: -0.00011607,
    e: 0.04838624, e_d: -0.00013253,
    I: 1.30439695, I_d: -0.00183714,
    L: 34.39644051, L_d: 3034.74612775,
    peri: 14.72847983, peri_d: 0.21252668,
    node: 100.47390909, node_d: 0.20469106,
  },
  saturn: {
    a: 9.53667594, a_d: -0.00125060,
    e: 0.05386179, e_d: -0.00050991,
    I: 2.48599187, I_d: 0.00193609,
    L: 49.95424423, L_d: 1222.49362201,
    peri: 92.59887831, peri_d: -0.41897216,
    node: 113.66242448, node_d: -0.28867794,
  },
  uranus: {
    a: 19.18916464, a_d: -0.00196176,
    e: 0.04725744, e_d: -0.00004397,
    I: 0.77263783, I_d: -0.00242939,
    L: 313.23810451, L_d: 428.48202785,
    peri: 170.95427630, peri_d: 0.40805281,
    node: 74.01692503, node_d: 0.04240589,
  },
  neptune: {
    a: 30.06992276, a_d: 0.00026291,
    e: 0.00859048, e_d: 0.00005105,
    I: 1.77004347, I_d: 0.00035372,
    L: -55.12002969, L_d: 218.45945325,
    peri: 44.96476227, peri_d: -0.32241464,
    node: 131.78422574, node_d: -0.00508664,
  },
};

export const PLANET_ORDER = [
  'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
];

/**
 * Střední vzdálenost od Slunce (velká poloosa, AU) pro každou planetu -
 * epochová (J2000) hodnota z `ELEMENTS`, prakticky konstantní (`a_d` je
 * zanedbatelné i za staletí). Určeno pro kreslení STATICKÉ oběžné dráhy
 * (kruh) ve vizualizaci - samotná planeta se pohybuje po skutečné
 * (mírně eliptické) dráze podle `getPlanetPositions()`, ne přesně po
 * tomhle kruhu, ale rozdíl je u všech planet kromě Merkuru/Marsu vizuálně
 * zanedbatelný.
 */
export const PLANET_MEAN_DISTANCE_AU = Object.fromEntries(
  PLANET_ORDER.map((key) => [key, ELEMENTS[key].a])
);

/**
 * Vyřeší Keplerovu rovnici M = E - e*sin(E) pro excentrickou anomálii E
 * (radiány) Newton-Raphsonovou iterací. Konverguje během pár kroků i pro
 * dost excentrické dráhy (nejhorší v naší tabulce je Merkur, e≈0.206).
 */
function solveKepler(meanAnomalyRad, e) {
  let E = meanAnomalyRad + e * Math.sin(meanAnomalyRad);
  for (let i = 0; i < 8; i++) {
    const dE = (meanAnomalyRad - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  return E;
}

/**
 * Heliocentrická ekliptikální poloha (J2000) jedné planety pro dané
 * Juliánské století T. Vrací {x, y, z, distanceAU, eclipticLongitude}.
 * x/y/z v AU; x směřuje k J2000 jarnímu bodu, z kolmo na ekliptiku k severu.
 */
function planetHeliocentric(key, T) {
  const el = ELEMENTS[key];
  const a = el.a + el.a_d * T;
  const e = el.e + el.e_d * T;
  const I = el.I + el.I_d * T;
  const L = el.L + el.L_d * T;
  const peri = el.peri + el.peri_d * T;
  const node = el.node + el.node_d * T;

  const argPeri = norm180(peri - node); // ω = ϖ - Ω
  const M = norm180(L - peri); // střední anomálie
  const Mr = M * RAD;

  const E = solveKepler(Mr, e);

  // Souřadnice v rovině dráhy (přísluní na kladné ose x této roviny)
  const xOrb = a * (Math.cos(E) - e);
  const yOrb = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const argPeriR = argPeri * RAD;
  const nodeR = node * RAD;
  const IR = I * RAD;

  const cosArg = Math.cos(argPeriR), sinArg = Math.sin(argPeriR);
  const cosNode = Math.cos(nodeR), sinNode = Math.sin(nodeR);
  const cosI = Math.cos(IR), sinI = Math.sin(IR);

  // Standardní transformace rovina-dráhy -> heliocentrická ekliptika J2000
  // (viz Meeus / Standish - rotace o ω kolem z, pak o I kolem x, pak o Ω
  // kolem z, sloučené do jedné matice).
  const x =
    (cosArg * cosNode - sinArg * sinNode * cosI) * xOrb +
    (-sinArg * cosNode - cosArg * sinNode * cosI) * yOrb;
  const y =
    (cosArg * sinNode + sinArg * cosNode * cosI) * xOrb +
    (-sinArg * sinNode + cosArg * cosNode * cosI) * yOrb;
  const z = (sinArg * sinI) * xOrb + (cosArg * sinI) * yOrb;

  return {
    x, y, z,
    distanceAU: Math.sqrt(x * x + y * y + z * z),
    eclipticLongitude: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
  };
}

/**
 * Heliocentrické polohy všech 8 planet pro dané Date. Vrací objekt
 * `{ mercury: {x,y,z,distanceAU,...}, venus: {...}, ... }`.
 */
export function getPlanetPositions(date) {
  const T = julianCenturies(toJulian(date));
  const result = {};
  for (const key of PLANET_ORDER) {
    result[key] = planetHeliocentric(key, T);
  }
  return result;
}

/** Planety rozeznatelné pouhým okem - Uran je za ideálních podmínek na
 * hraně viditelnosti (~5.7 mag), Neptun ne, oba proto vynechány z
 * "co je dnes vidět ze Země" (v0.13.0). */
export const NAKED_EYE_PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

/**
 * Greenwichský hvězdný čas (stupně, 0-360) pro dané Date - standardní
 * IAU aproximace (stejný vzorec jako u sublunárního bodu v astro.js).
 */
export function getGreenwichSiderealTimeDeg(date) {
  const jd = toJulian(date);
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0));
}

/**
 * Výška nad obzorem + azimut (od severu po směru hodinových ručiček) pro
 * naked-eye planety (viz NAKED_EYE_PLANETS), z dané zeměpisné polohy a
 * času - "co je dnes vidět ze Země" (v0.13.0). Standardní řetězec převodů
 * heliocentrická ekliptika -> geocentrická ekliptika -> rovníkové (RA/Dec)
 * -> horizontální (výška/azimut) souřadnice (Meeus, "Astronomical
 * Algorithms" - stejný zdroj jako astro.js). `raDeg`/`decDeg` v návratové
 * hodnotě jsou geocentrické (nezávisí na pozorovateli) - užitečné i mimo
 * tuhle funkci (test na `_subpoint_` konzistenci, budoucí rozšíření).
 * Vrací `{ mercury: {altitudeDeg, azimuthDeg, raDeg, decDeg}, venus: {...}, ... }`.
 */
export function getPlanetHorizontalPositions(date, lat, lon) {
  const jd = toJulian(date);
  const T = julianCenturies(jd);
  const epsR = meanObliquityDeg(T) * RAD;
  const earth = planetHeliocentric('earth', T);

  const gmstDeg = getGreenwichSiderealTimeDeg(date);
  const latR = lat * RAD;
  const cosLat = Math.cos(latR), sinLat = Math.sin(latR);

  const result = {};
  for (const key of NAKED_EYE_PLANETS) {
    const p = planetHeliocentric(key, T);
    // Geocentrická ekliptika = heliocentrická planeta MÍNUS heliocentrická
    // Země (stejný princip jako vzdálenost planeta-Země jinde v kartě).
    const gx = p.x - earth.x, gy = p.y - earth.y, gz = p.z - earth.z;
    const r = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;

    // Ekliptika -> rovníkové (rotace kolem osy x o šikmost ekliptiky).
    const raR = Math.atan2(gy * Math.cos(epsR) - gz * Math.sin(epsR), gx);
    const decR = Math.asin(Math.max(-1, Math.min(1, (gy * Math.sin(epsR) + gz * Math.cos(epsR)) / r)));
    const raDeg = norm360(raR * DEG);
    const decDeg = decR * DEG;

    // Rovníkové -> horizontální (výška/azimut) pro pozorovatele na (lat, lon).
    const lstDeg = norm360(gmstDeg + lon);
    const hR = norm180(lstDeg - raDeg) * RAD;

    const sinAlt = Math.sin(decR) * sinLat + Math.cos(decR) * cosLat * Math.cos(hR);
    const altDeg = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;
    const cosAlt = Math.cos(altDeg * RAD);

    let azDeg = 0;
    if (Math.abs(cosAlt) > 1e-9 && Math.abs(cosLat) > 1e-9) {
      const sinAz = (-Math.sin(hR) * Math.cos(decR)) / cosAlt;
      const cosAz = (Math.sin(decR) - sinAlt * sinLat) / (cosAlt * cosLat);
      azDeg = norm360(Math.atan2(sinAz, cosAz) * DEG);
    }

    result[key] = { altitudeDeg: altDeg, azimuthDeg: azDeg, raDeg, decDeg };
  }
  return result;
}
