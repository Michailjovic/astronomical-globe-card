/**
 * astro.js
 * Lehké astronomické výpočty pro Astronomical Globe Card.
 *
 * Zdroj vzorců: standardní nízko-přesné algoritmy pro polohu Slunce (NOAA
 * Solar Calculator / Meeus, "Astronomical Algorithms") a Měsíce (Meeus,
 * kap. 47 – zjednodušená řada, přesnost řádově desítky obloukových minut).
 * To plně stačí pro vizualizaci (poloha na glóbu, fáze, východ/západ).
 *
 * Všechny úhly interně v radiánech, veřejné API vrací stupně / hodiny.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function toJulian(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function julianCenturies(jd) {
  return (jd - 2451545.0) / 36525;
}

function norm360(deg) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function norm180(deg) {
  let d = norm360(deg);
  if (d > 180) d -= 360;
  return d;
}

/**
 * Geocentrická poloha Slunce (ekliptikální délka, deklinace, rektascenze,
 * rovnice času) pro dané Julián. století T.
 */
function sunGeocentric(T) {
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;

  const Mr = M * RAD;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);

  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);

  const eps0 =
    23 +
    (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const epsCorrected = eps0 + 0.00256 * Math.cos(omega * RAD);

  const lambdaR = appLong * RAD;
  const epsR = epsCorrected * RAD;

  const alpha = Math.atan2(Math.cos(epsR) * Math.sin(lambdaR), Math.cos(lambdaR)) * DEG;
  const delta = Math.asin(Math.sin(epsR) * Math.sin(lambdaR)) * DEG;

  const y = Math.tan(epsR / 2) ** 2;
  const eqTimeDeg =
    y * Math.sin(2 * L0 * RAD) -
    2 * e * Math.sin(Mr) +
    4 * e * y * Math.sin(Mr) * Math.cos(2 * L0 * RAD) -
    0.5 * y * y * Math.sin(4 * L0 * RAD) -
    1.25 * e * e * Math.sin(2 * Mr);
  const eqTimeMinutes = 4 * eqTimeDeg * DEG;

  return {
    rightAscension: norm360(alpha),
    declination: delta,
    equationOfTimeMinutes: eqTimeMinutes,
    eclipticLongitude: norm360(appLong),
    obliquity: epsCorrected,
  };
}

/**
 * Subsolární bod (lat/lon nad kterým Slunce právě stojí v zenitu) + čas.
 */
export function getSunPosition(date) {
  const jd = toJulian(date);
  const T = julianCenturies(jd);
  const sun = sunGeocentric(T);

  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;

  const subsolarLon = norm180(-15 * (utcHours - 12 + sun.equationOfTimeMinutes / 60));
  const subsolarLat = sun.declination;

  return {
    lat: subsolarLat,
    lon: subsolarLon,
    declination: sun.declination,
    rightAscension: sun.rightAscension,
    equationOfTimeMinutes: sun.equationOfTimeMinutes,
  };
}

/**
 * Zjednodušená geocentrická poloha Měsíce (Meeus, nízko-přesná řada).
 * Přesnost cca 0.3° v délce / šířce – pro vizualizaci naprosto dostatečná.
 */
function moonGeocentric(T) {
  const Lp = norm360(218.3164477 + 481267.88123421 * T); // střední délka
  const D = norm360(297.8501921 + 445267.1114034 * T); // elongace od Slunce
  const M = norm360(357.5291092 + 35999.0502909 * T); // stř. anomálie Slunce
  const Mp = norm360(134.9633964 + 477198.8675055 * T); // stř. anomálie Měsíce
  const F = norm360(93.272095 + 483202.0175233 * T); // argument šířky

  const Dr = D * RAD, Mr = M * RAD, Mpr = Mp * RAD, Fr = F * RAD;

  // hlavní periodické členy (zjednodušeno)
  const lonCorr =
    6.2886 * Math.sin(Mpr) +
    1.274 * Math.sin(2 * Dr - Mpr) +
    0.6583 * Math.sin(2 * Dr) +
    0.2136 * Math.sin(2 * Mpr) -
    0.1851 * Math.sin(Mr) -
    0.1143 * Math.sin(2 * Fr) +
    0.0588 * Math.sin(2 * Dr - 2 * Mpr) -
    0.0572 * Math.sin(2 * Dr - Mr - Mpr) +
    0.0533 * Math.sin(2 * Dr + Mpr);

  const latCorr =
    5.1281 * Math.sin(Fr) +
    0.2806 * Math.sin(Mpr + Fr) +
    0.2777 * Math.sin(Mpr - Fr) +
    0.1732 * Math.sin(2 * Dr - Fr);

  const distCorr =
    -20905 * Math.cos(Mpr) -
    3699 * Math.cos(2 * Dr - Mpr) -
    2956 * Math.cos(2 * Dr);

  const eclLon = norm360(Lp + lonCorr);
  const eclLat = latCorr;
  const distanceKm = 385000.56 + distCorr;

  const T2 = T;
  const eps0 =
    23 +
    (26 + (21.448 - T2 * (46.815 + T2 * (0.00059 - T2 * 0.001813))) / 60) / 60;
  const epsR = eps0 * RAD;

  const lr = eclLon * RAD;
  const br = eclLat * RAD;

  const alpha =
    Math.atan2(
      Math.sin(lr) * Math.cos(epsR) - Math.tan(br) * Math.sin(epsR),
      Math.cos(lr)
    ) * DEG;
  const delta =
    Math.asin(
      Math.sin(br) * Math.cos(epsR) + Math.cos(br) * Math.sin(epsR) * Math.sin(lr)
    ) * DEG;

  return {
    eclipticLongitude: eclLon,
    eclipticLatitude: eclLat,
    rightAscension: norm360(alpha),
    declination: delta,
    distanceKm,
    D, M, Mp, F,
  };
}

/**
 * Sublunární bod (lat/lon), fáze (0 = nov, 0.5 = úplněk, 1 = nov),
 * osvětlená frakce (0..1) a přibližný "věk" měsíce ve dnech.
 */
export function getMoonPosition(date) {
  const jd = toJulian(date);
  const T = julianCenturies(jd);
  const moon = moonGeocentric(T);
  const sun = sunGeocentric(T);

  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;

  // GHA měsíce z rektascenze (obdoba subsolárního bodu)
  const gmst = norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0));
  const moonLon = norm180(gmst - moon.rightAscension);
  const moonLat = moon.declination;

  // fázový úhel ze skutečné geocentrické elongace Slunce–Měsíc
  const elongation = Math.acos(
    Math.sin(sun.declination * RAD) * Math.sin(moon.declination * RAD) +
      Math.cos(sun.declination * RAD) *
        Math.cos(moon.declination * RAD) *
        Math.cos((sun.rightAscension - moon.rightAscension) * RAD)
  ) * DEG;

  const illuminatedFraction = (1 - Math.cos(elongation * RAD)) / 2;

  // fáze 0..1 (0/1 = nov, 0.5 = úplněk) podle rozdílu ekliptikálních délek
  let phase = norm360(moon.eclipticLongitude - sun.eclipticLongitude) / 360;
  const waxing = phase < 0.5;
  const ageDays = phase * 29.530588853;

  return {
    lat: moonLat,
    lon: moonLon,
    distanceKm: moon.distanceKm,
    phase,
    illuminatedFraction,
    waxing,
    ageDays,
  };
}

/**
 * Východ/západ Slunce, sluneční poledne a délka dne pro danou lat/lon a den.
 * Vrací Date objekty (UTC) nebo null pro polární den/noc.
 */
export function getSunTimes(date, lat, lon) {
  const jdMidnight = Math.floor(toJulian(date) - 0.5) + 0.5; // UTC půlnoc
  const T = julianCenturies(jdMidnight + 0.5);
  const sun = sunGeocentric(T);

  const dec = sun.declination * RAD;
  const latR = lat * RAD;

  const cosH =
    (Math.sin(-0.833 * RAD) - Math.sin(latR) * Math.sin(dec)) /
    (Math.cos(latR) * Math.cos(dec));

  const solarNoonUTC = 12 - lon / 15 - sun.equationOfTimeMinutes / 60;

  if (cosH > 1) {
    // polární noc
    return { sunrise: null, sunset: null, solarNoon: null, dayLengthHours: 0, polar: 'night' };
  }
  if (cosH < -1) {
    // polární den
    return { sunrise: null, sunset: null, solarNoon: null, dayLengthHours: 24, polar: 'day' };
  }

  const H0 = Math.acos(cosH) * DEG;
  const sunriseUTC = solarNoonUTC - H0 / 15;
  const sunsetUTC = solarNoonUTC + H0 / 15;
  const dayLengthHours = (2 * H0) / 15;

  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  const toDate = (h) => new Date(dayStart.getTime() + h * 3600000);

  return {
    sunrise: toDate(sunriseUTC),
    sunset: toDate(sunsetUTC),
    solarNoon: toDate(solarNoonUTC),
    dayLengthHours,
    polar: null,
  };
}

export function toEquirectangularUV(lat, lon) {
  // U roste s longitudou (0 na -180°, 1 na +180°), V roste od severního pólu dolů
  const u = (lon + 180) / 360;
  const v = (90 - lat) / 180;
  return { u, v };
}
