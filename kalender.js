// Kalender: Kalenderwochen, Feiertage und Schulferien im Saarland.
// Feiertage werden berechnet. Schulferien bitte jedes Jahr mit dem
// Bildungsserver Saarland abgleichen und hier ergänzen (ohne Gewähr).

// Schulferien Saarland (erster und letzter Ferientag). Gelten nur für Grundschulen.
export const FERIEN_SAARLAND = [
  ["2025-12-22", "2026-01-02", "Weihnachtsferien"],
  ["2026-02-16", "2026-02-20", "Fastnachtsferien"],
  ["2026-04-07", "2026-04-17", "Osterferien"],
  ["2026-06-29", "2026-08-07", "Sommerferien"],
  ["2026-10-05", "2026-10-16", "Herbstferien"],
  ["2026-12-21", "2026-12-31", "Weihnachtsferien"],
  ["2027-02-08", "2027-02-12", "Fastnachtsferien"],
  ["2027-03-30", "2027-04-09", "Osterferien"],
  ["2027-06-28", "2027-08-06", "Sommerferien"],
  ["2027-10-04", "2027-10-15", "Herbstferien"],
  ["2027-12-20", "2027-12-31", "Weihnachtsferien"]
];

const isoUtc = (d) => d.toISOString().slice(0, 10);
const datumUtc = (iso) => { const [y, m, t] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, t)); };

function ostersonntag(j) {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(j, monat - 1, tag));
}

const feiertagCache = {};
/** Gesetzliche Feiertage im Saarland: { "JJJJ-MM-TT": "Name" } */
export function feiertage(jahr) {
  if (feiertagCache[jahr]) return feiertagCache[jahr];
  const ostern = ostersonntag(jahr);
  const plus = (tage) => { const d = new Date(ostern); d.setUTCDate(d.getUTCDate() + tage); return isoUtc(d); };
  const f = {
    [`${jahr}-01-01`]: "Neujahr",
    [plus(-2)]: "Karfreitag",
    [plus(1)]: "Ostermontag",
    [`${jahr}-05-01`]: "Tag der Arbeit",
    [plus(39)]: "Christi Himmelfahrt",
    [plus(50)]: "Pfingstmontag",
    [plus(60)]: "Fronleichnam",
    [`${jahr}-08-15`]: "Mariä Himmelfahrt",
    [`${jahr}-10-03`]: "Tag der Deutschen Einheit",
    [`${jahr}-11-01`]: "Allerheiligen",
    [`${jahr}-12-25`]: "1. Weihnachtstag",
    [`${jahr}-12-26`]: "2. Weihnachtstag"
  };
  return (feiertagCache[jahr] = f);
}

export function ferienAm(iso) {
  const eintrag = FERIEN_SAARLAND.find(([von, bis]) => iso >= von && iso <= bis);
  return eintrag ? eintrag[2] : null;
}

/**
 * Warum an diesem Tag keine Kontrolle nötig ist – oder null, wenn es ein Arbeitstag ist.
 * Wochenende und Feiertage gelten für alle, Schulferien nur für Grundschulen.
 */
export function freierTag(iso, typ) {
  const wt = datumUtc(iso).getUTCDay();
  if (wt === 0 || wt === 6) return "Wochenende";
  const ft = feiertage(Number(iso.slice(0, 4)))[iso];
  if (ft) return ft;
  if (typ === "Grundschule") { const fe = ferienAm(iso); if (fe) return fe; }
  return null;
}

export function tageZwischen(von, bis) {
  const tage = [];
  for (let d = datumUtc(von); isoUtc(d) <= bis; d.setUTCDate(d.getUTCDate() + 1)) tage.push(isoUtc(d));
  return tage;
}

export const arbeitstage = (von, bis, typ) => tageZwischen(von, bis).filter((t) => !freierTag(t, typ));

/** ISO-Kalenderwoche */
export function kw(iso) {
  const t = datumUtc(iso);
  const tag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - tag);
  const jahr = t.getUTCFullYear();
  const woche = Math.ceil(((t - Date.UTC(jahr, 0, 1)) / 864e5 + 1) / 7);
  return { jahr, woche };
}
export const kwSchluessel = (iso) => { const { jahr, woche } = kw(iso); return `${jahr}-${String(woche).padStart(2, "0")}`; };
export const kwText = (iso) => { const { jahr, woche } = kw(iso); return `KW ${String(woche).padStart(2, "0")}/${jahr}`; };

/** Montag bis Sonntag einer Kalenderwoche */
export function kwZeitraum(jahr, woche) {
  const jan4 = new Date(Date.UTC(jahr, 0, 4));
  const montag = new Date(jan4);
  montag.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (woche - 1) * 7);
  const sonntag = new Date(montag);
  sonntag.setUTCDate(montag.getUTCDate() + 6);
  return { von: isoUtc(montag), bis: isoUtc(sonntag) };
}

/** "KW 41/2026" oder "KW 41–44/2026" für einen Zeitraum */
export function kwSpanne(von, bis) {
  const a = kw(von), b = kw(bis);
  if (a.jahr === b.jahr && a.woche === b.woche) return kwText(von);
  if (a.jahr === b.jahr) return `KW ${String(a.woche).padStart(2, "0")}–${String(b.woche).padStart(2, "0")}/${a.jahr}`;
  return `${kwText(von)} – ${kwText(bis)}`;
}
