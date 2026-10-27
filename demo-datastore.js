// ============================================================
// Demo-Datenschicht: gleiche Funktionen wie datastore.js, aber
// komplett im Browser mit erfundenen Daten. Kein Firebase.
// Änderungen bleiben im Browser gespeichert, bis "Demo zurücksetzen".
// ============================================================
import { freierTag } from "./kalender.js";
import { bereicheFuer } from "./hilfen.js";

const SPEICHER = "reinigung-demo-v2";
const ANGEMELDET = "reinigung-demo-nutzer";

const EINRICHTUNGEN = [
  ["gs-1", "Grundschule Am Kreuzberg", "Grundschule"],
  ["gs-2", "Grundschule Hilbringen", "Grundschule"],
  ["gs-3", "Grundschule Brotdorf", "Grundschule"],
  ["gs-4", "Grundschule Besseringen", "Grundschule"],
  ["gs-5", "Grundschule Schwemlingen", "Grundschule"],
  ["gs-6", "Grundschule Merchingen", "Grundschule"],
  ["kita-1", "Kita Besseringen", "Kita"],
  ["kita-2", "Kita Fitten-Ballern", "Kita"],
  ["kita-3", "Kita Merchingen", "Kita"],
  ["kita-4", "Kita Hilbringen", "Kita"],
  ["kita-5", "Kita Brotdorf", "Kita"],
  ["kita-6", "Kita Mechern", "Kita"],
  ["kita-7", "Kita Bietzen", "Kita"],
  ["kita-8", "Kita Innenstadt", "Kita"],
  ["kita-alt", "Kita Am Bahnhof (geschlossen)", "Kita"]
].map(([id, name, typ], i) => ({ id, name, typ, adresse: `Beispielstraße ${i + 1}, 66663 Merzig`, aktiv: id !== "kita-alt" }));

// Demo-Zugänge: Passwort überall "demo", außer m.neu (Startpasswort, muss geändert werden)
const BENUTZER = [
  { uid: "demo-admin", name: "Admin (Demo)", vorname: "Admin", nachname: "Demo", benutzername: "admin", rolle: "leitung", einrichtungen: [], aktiv: true },
  { uid: "demo-leitung", name: "Lena Leitung", vorname: "Lena", nachname: "Leitung", benutzername: "l.leitung", rolle: "leitung", einrichtungen: [], aktiv: true },
  { uid: "demo-hm-1", name: "Peter Beispiel", vorname: "Peter", nachname: "Beispiel", benutzername: "p.beispiel", rolle: "hausmeister", einrichtungen: ["gs-1", "gs-2", "kita-1", "kita-2"], aktiv: true },
  { uid: "demo-hm-2", name: "Karin Muster", vorname: "Karin", nachname: "Muster", benutzername: "k.muster", rolle: "hausmeister", einrichtungen: ["gs-3", "gs-4", "kita-3", "kita-4", "kita-5"], aktiv: true },
  { uid: "demo-hm-3", name: "Jens Probe", vorname: "Jens", nachname: "Probe", benutzername: "j.probe", rolle: "hausmeister", einrichtungen: ["gs-5", "gs-6", "kita-6", "kita-7", "kita-8"], aktiv: true },
  { uid: "demo-hm-4", name: "Max Neu", vorname: "Max", nachname: "Neu", benutzername: "m.neu", rolle: "hausmeister", einrichtungen: ["kita-8"], aktiv: true, passwortAendern: true },
  { uid: "demo-hm-alt", name: "Bernd Früher", vorname: "Bernd", nachname: "Früher", benutzername: "b.frueher", rolle: "hausmeister", einrichtungen: ["kita-alt"], aktiv: false }
];
const PASSWORT = { "m.neu": "start123" };
const passwortVon = (b) => b.passwortNeu || PASSWORT[b.benutzername] || "demo";

const BEMERKUNGEN = [
  "Mülleimer in den Klassen nicht geleert", "Waschbecken verschmutzt", "Boden im Flur klebrig",
  "Papierhandtücher leer, Seife fehlt", "Krümel unter den Tischen", "Fensterbänke staubig",
  "Toilette im Erdgeschoss nicht gereinigt", "Spuren vom Vortag noch sichtbar",
  "Wickeltisch nicht desinfiziert", "Essensreste im Speiseraum", "Sand im Eingangsbereich nicht gefegt",
  "Spiegel in den Toiletten verschmiert", "Turnhallenboden stumpf und staubig", "Altpapier quillt über",
  "Klassenraum 2b komplett ausgelassen", "Treppenhaus nass gewischt, aber Schlieren", ""
];
const NACHTRAEGE = [
  "Reinigungsfirma telefonisch informiert", "Mit Leitung der Einrichtung besprochen",
  "Am Nachmittag erneut kontrolliert, jetzt in Ordnung", "Objektleiterin der Reinigungsfirma per Mail informiert",
  "Reinigungskraft war krank, Vertretung kommt morgen", "Nachgereinigt um 10 Uhr", "Schulleitung hat sich ebenfalls beschwert"
];
const WOCHENENDE = ["Sommerfest der Kita am Samstag – danach kontrolliert", "Elternabend am Freitagabend, Samstag nachkontrolliert"];

// Reproduzierbarer Zufall, damit die Demo immer gleich aussieht
function zufall(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
const iso = (d) => d.toLocaleDateString("sv-SE");
const wahl = (r, liste) => liste[Math.floor(r() * liste.length)];

function erzeugeKontrollen() {
  const r = zufall(42);
  const k = [];
  const heute = new Date();
  for (let t = 130; t >= 0; t--) {
    const d = new Date(heute);
    d.setDate(heute.getDate() - t);
    const datum = iso(d);
    for (const e of EINRICHTUNGEN) {
      const frei = freierTag(datum, e.typ);
      if (frei && !(frei === "Wochenende" && e.typ === "Kita" && r() < 0.015)) continue; // frei, selten Wochenend-Eintrag
      if (t === 0 && r() < 0.45) continue;                            // heute noch offen
      if (t > 0 && r() < 0.06) continue;                              // vergessen
      if (e.id === "kita-alt" && t < 45) continue;                    // vor 6 Wochen geschlossen
      const hm = BENUTZER.find((b) => b.einrichtungen.includes(e.id) && b.uid !== "demo-hm-4");
      const zeit = new Date(d); zeit.setHours(6, 30 + Math.floor(r() * 75), 0, 0);
      const mangel = r() < 0.17 + (e.id === "kita-3" ? 0.15 : 0);    // eine "Sorgen-Kita"
      const bereiche = mangel ? [...new Set([wahl(r, bereicheFuer(e.typ)), ...(r() < 0.35 ? [wahl(r, bereicheFuer(e.typ))] : [])])] : [];
      const eintrag = {
        id: `${datum}_${e.id}`, datum, einrichtungId: e.id, einrichtungName: e.name, einrichtungTyp: e.typ,
        status: mangel ? "mangel" : "ok",
        nichtGeputzt: mangel && r() < 0.4, nichtSauber: mangel,
        bereiche, bemerkung: frei ? wahl(r, WOCHENENDE) : mangel ? wahl(r, BEMERKUNGEN) : (r() < 0.04 ? "Alles bestens, Reinigung sehr gründlich" : ""),
        nachtraege: [], erfasstVon: hm.uid, erfasstVonName: hm.name, erfasstAm: zeit.toISOString()
      };
      if (r() < (mangel ? 0.3 : 0.05)) {
        const spaeter = new Date(zeit); spaeter.setHours(11 + Math.floor(r() * 4));
        const nachMangel = !mangel && r() < 0.5;
        eintrag.nachtraege.push({
          zeit: spaeter.toISOString(), von: hm.uid, vonName: hm.name, text: wahl(r, NACHTRAEGE),
          mangel: nachMangel, nichtGeputzt: false, nichtSauber: nachMangel, bereiche: nachMangel ? [wahl(r, bereicheFuer(e.typ))] : []
        });
        if (nachMangel) eintrag.status = "mangel";
      }
      k.push(eintrag);
    }
  }
  return k;
}

// ---------- Zustand ----------
function laden() {
  try {
    const roh = localStorage.getItem(SPEICHER);
    if (roh) {
      const z = JSON.parse(roh);
      if (z.erzeugtAm === iso(new Date())) return z;   // jeden Tag frisch, damit "heute" passt
    }
  } catch { /* ignorieren */ }
  return { erzeugtAm: iso(new Date()), einrichtungen: structuredClone(EINRICHTUNGEN), benutzer: structuredClone(BENUTZER), kontrollen: erzeugeKontrollen() };
}
let z = laden();
const sichern = () => { try { localStorage.setItem(SPEICHER, JSON.stringify(z)); } catch { /* voll oder gesperrt */ } };
const kopie = (x) => structuredClone(x);

export function demoZuruecksetzen() {
  try { localStorage.removeItem(SPEICHER); } catch { /* egal */ }
  location.reload();
}

// ---------- Anmeldung ----------
let rueckruf = null;
let ich = null;
const angemeldet = () => { try { return sessionStorage.getItem(ANGEMELDET) || ""; } catch { return ""; } };
const merke = (uid) => { try { uid ? sessionStorage.setItem(ANGEMELDET, uid) : sessionStorage.removeItem(ANGEMELDET); } catch { /* egal */ } };

function melden() {
  ich = z.benutzer.find((b) => b.uid === angemeldet()) || null;
  rueckruf?.(ich ? kopie(ich) : null);
}

export function onAuth(cb) { rueckruf = cb; setTimeout(melden, 0); }
export async function login(benutzername, passwort) {
  const b = z.benutzer.find((x) => x.benutzername === benutzername.trim().toLowerCase());
  if (!b || passwortVon(b) !== passwort) throw new Error("Benutzername oder Passwort ist falsch. (Demo: z. B. admin / demo)");
  merke(b.uid);
  melden();
}
export async function logout() { merke(""); melden(); }
export async function passwortAendern(neu) { ich.passwortNeu = neu; sichern(); }
export async function passwortWurdeGeaendert(uid) { z.benutzer.find((b) => b.uid === uid).passwortAendern = false; sichern(); }

export function demoAnmelden(uid) { merke(uid); location.reload(); }

// ---------- Einrichtungen ----------
export async function listEinrichtungen() {
  return kopie(z.einrichtungen).sort((a, b) => a.typ.localeCompare(b.typ) || a.name.localeCompare(b.name, "de"));
}
export async function saveEinrichtung(e) {
  const daten = { name: e.name, typ: e.typ, adresse: e.adresse || "", aktiv: e.aktiv !== false };
  if (e.id) Object.assign(z.einrichtungen.find((x) => x.id === e.id), daten);
  else z.einrichtungen.push({ id: "neu-" + Date.now() + Math.random().toString(36).slice(2, 6), ...daten });
  sichern();
}

// ---------- Kontrollen ----------
export async function kontrollenAm(datum) { return kopie(z.kontrollen.filter((k) => k.datum === datum)); }
export async function kontrollenZeitraum(von, bis) { return kopie(z.kontrollen.filter((k) => k.datum >= von && k.datum <= bis)); }
export async function neueKontrolle(k) {
  const id = `${k.datum}_${k.einrichtungId}`;
  if (z.kontrollen.some((x) => x.id === id)) throw new Error("Für diese Einrichtung wurde heute schon eine Kontrolle gespeichert.");
  z.kontrollen.push({ ...k, id, nachtraege: [], erfasstVon: ich.uid, erfasstAm: new Date().toISOString() });
  sichern();
}
export async function nachtragHinzufuegen(id, nachtrag) {
  const k = z.kontrollen.find((x) => x.id === id);
  k.nachtraege.push({ ...nachtrag, von: ich.uid, zeit: new Date().toISOString() });
  if (nachtrag.mangel) k.status = "mangel";
  sichern();
}
export async function loescheKontrolle(id) { z.kontrollen = z.kontrollen.filter((x) => x.id !== id); sichern(); }

// ---------- Benutzer ----------
export async function listBenutzer() { return kopie(z.benutzer).sort((a, b) => a.name.localeCompare(b.name, "de")); }
export async function createBenutzer({ benutzername, name, vorname, nachname, rolle, einrichtungen }) {
  if (z.benutzer.some((b) => b.benutzername === benutzername)) throw new Error("Diesen Benutzernamen gibt es schon.");
  z.benutzer.push({ uid: "demo-" + Date.now(), name, vorname, nachname, benutzername, rolle, einrichtungen: einrichtungen || [], aktiv: true, passwortAendern: true, passwortNeu: arguments[0].passwort });
  sichern();
}
export async function updateBenutzer(uid, daten) { Object.assign(z.benutzer.find((b) => b.uid === uid), daten); sichern(); }

// ---------- Datensicherung ----------
export async function exportAlles() {
  return { format: "reinigungskontrolle-merzig", version: 1, exportiertAm: new Date().toISOString(), demo: true, einrichtungen: kopie(z.einrichtungen), benutzer: kopie(z.benutzer), kontrollen: kopie(z.kontrollen) };
}
export async function importAlles() { throw new Error("Im Demo-Modus kann keine Sicherung eingespielt werden."); }
