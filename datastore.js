// ============================================================
// Datenschicht – die EINZIGE Datei, die mit Firebase spricht.
// Für einen Umzug (z. B. eigener Server mit REST-API) nur diese
// Datei neu schreiben; app.js und export.js bleiben unverändert,
// solange die exportierten Funktionen gleich heißen und dieselben
// Daten liefern.
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, writeBatch, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, LOGIN_DOMAIN } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loginAdresse = (benutzername) => {
  const b = benutzername.trim().toLowerCase();
  return b.includes("@") ? b : `${b}@${LOGIN_DOMAIN}`;
};

// ---------- Anmeldung ----------

/** cb(profil | null). profil = { uid, name, benutzername, rolle, einrichtungen[], aktiv, fehlt? } */
export function onAuth(cb) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return cb(null);
    try {
      const snap = await getDoc(doc(db, "benutzer", user.uid));
      if (!snap.exists()) return cb({ uid: user.uid, fehlt: true });
      cb({ uid: user.uid, ...snap.data() });
    } catch (e) {
      console.error(e);
      cb({ uid: user.uid, fehlt: true });
    }
  });
}

export async function login(benutzername, passwort) {
  try {
    await signInWithEmailAndPassword(auth, loginAdresse(benutzername), passwort);
  } catch (e) {
    const code = e.code || "";
    if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found") || code.includes("invalid-email")) {
      throw new Error("Benutzername oder Passwort ist falsch.");
    }
    if (code.includes("too-many-requests")) throw new Error("Zu viele Versuche. Bitte in ein paar Minuten erneut versuchen.");
    if (code.includes("network")) throw new Error("Keine Internetverbindung.");
    throw new Error("Anmeldung fehlgeschlagen (" + code + ").");
  }
}

export const logout = () => signOut(auth);

export async function passwortAendern(neu) {
  try {
    await updatePassword(auth.currentUser, neu);
  } catch (e) {
    if ((e.code || "").includes("requires-recent-login")) {
      throw new Error("Bitte einmal ab- und wieder anmelden, dann erneut versuchen.");
    }
    if ((e.code || "").includes("weak-password") || (e.code || "").includes("password-does-not-meet")) throw new Error("Das Passwort erfüllt die Passwortregeln nicht.");
    throw e;
  }
}

// ---------- Einrichtungen ----------

export async function listEinrichtungen() {
  const snap = await getDocs(collection(db, "einrichtungen"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.typ || "").localeCompare(b.typ || "") || (a.name || "").localeCompare(b.name || "", "de"));
}

export async function saveEinrichtung(e) {
  const ref = e.id ? doc(db, "einrichtungen", e.id) : doc(collection(db, "einrichtungen"));
  const daten = { name: e.name, typ: e.typ, adresse: e.adresse || "", aktiv: e.aktiv !== false };
  await setDoc(ref, daten, { merge: true });
  return { id: ref.id, ...daten };
}

// ---------- Kontrollen ----------
// Eine Kontrolle pro Einrichtung und Tag. Dokument-ID: <datum>_<einrichtungId>

export async function kontrollenAm(datum) {
  const snap = await getDocs(query(collection(db, "kontrollen"), where("datum", "==", datum)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function kontrollenZeitraum(von, bis) {
  const q = query(collection(db, "kontrollen"), where("datum", ">=", von), where("datum", "<=", bis));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Legt die Kontrolle eines Tages an. Gibt es für diese Einrichtung und
 * diesen Tag schon eine, wird nichts überschrieben (dann nur Nachtrag möglich).
 */
export async function neueKontrolle(k) {
  const id = `${k.datum}_${k.einrichtungId}`;
  const ref = doc(db, "kontrollen", id);
  if ((await getDoc(ref)).exists()) {
    throw new Error("Für diese Einrichtung wurde heute schon eine Kontrolle gespeichert. Bitte Seite neu laden und einen Nachtrag erfassen.");
  }
  await setDoc(ref, {
    ...k,
    nachtraege: [],
    erfasstVon: auth.currentUser.uid,
    erfasstAm: new Date().toISOString()
  });
  return id;
}

/** Hängt einen Nachtrag an. Ein nachgemeldeter Mangel setzt den Status auf "mangel". */
export async function nachtragHinzufuegen(id, nachtrag, alterStatus) {
  const eintrag = { ...nachtrag, von: auth.currentUser.uid, zeit: new Date().toISOString() };
  const aenderung = { nachtraege: arrayUnion(eintrag) };
  if (nachtrag.mangel && alterStatus !== "mangel") aenderung.status = "mangel";
  await updateDoc(doc(db, "kontrollen", id), aenderung);
}

/** Nur für die Leitung (Notfall). */
export async function loescheKontrolle(id) {
  await deleteDoc(doc(db, "kontrollen", id));
}

// ---------- Benutzer ----------

export async function listBenutzer() {
  const snap = await getDocs(collection(db, "benutzer"));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));
}

/** Legt ein Login + Profil an, ohne die angemeldete Leitung abzumelden. */
export async function createBenutzer({ benutzername, passwort, name, vorname, nachname, email, rolle, einrichtungen }) {
  const zweitApp = initializeApp(firebaseConfig, "anlage-" + Date.now());
  const zweitAuth = getAuth(zweitApp);
  try {
    const cred = await createUserWithEmailAndPassword(zweitAuth, loginAdresse(benutzername), passwort);
    await setDoc(doc(db, "benutzer", cred.user.uid), {
      name, vorname: vorname || "", nachname: nachname || "", email: email || "",
      benutzername: benutzername.trim().toLowerCase(), rolle,
      einrichtungen: einrichtungen || [], aktiv: true,
      passwortAendern: true
    });
    await signOut(zweitAuth);
  } catch (e) {
    const code = e.code || "";
    if (code.includes("email-already-in-use")) throw new Error("Diesen Benutzernamen gibt es schon.");
    if (code.includes("weak-password")) throw new Error("Das Passwort braucht mindestens 6 Zeichen.");
    if (code.includes("invalid-email")) throw new Error("Benutzername darf nur Buchstaben, Zahlen, Punkt und Bindestrich enthalten.");
    throw e;
  }
}

/** Nach dem Pflicht-Passwortwechsel: Merker im eigenen Profil zurücksetzen. */
export async function passwortWurdeGeaendert(uid) {
  await updateDoc(doc(db, "benutzer", uid), { passwortAendern: false });
}

/**
 * "Löschen": Profil wird gesperrt und ausgeblendet. Das Login-Konto selbst kann
 * nur die Firebase Console bzw. ein Server entfernen; ohne aktives Profil
 * kommt es aber an keine Daten mehr.
 */
export async function loescheBenutzer(uid) {
  await updateDoc(doc(db, "benutzer", uid), { aktiv: false, geloescht: true, geloeschtAm: new Date().toISOString() });
}

export async function updateBenutzer(uid, daten) {
  await updateDoc(doc(db, "benutzer", uid), daten);
}

// ---------- Datensicherung / Umzug ----------

export async function exportAlles() {
  const [einrichtungen, benutzer, kontrollenSnap] = await Promise.all([
    listEinrichtungen(), listBenutzer(), getDocs(collection(db, "kontrollen"))
  ]);
  return {
    format: "reinigungskontrolle-merzig",
    version: 1,
    exportiertAm: new Date().toISOString(),
    einrichtungen,
    benutzer,
    kontrollen: kontrollenSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  };
}

/** Spielt Einrichtungen und Kontrollen aus einem Export ein (Benutzer-Logins nicht). */
export async function importAlles(daten) {
  if (daten?.format !== "reinigungskontrolle-merzig") throw new Error("Das ist keine Sicherungsdatei dieser Anwendung.");
  const schreibe = [];
  for (const e of daten.einrichtungen || []) {
    const { id, ...rest } = e;
    schreibe.push([doc(db, "einrichtungen", id), rest]);
  }
  for (const k of daten.kontrollen || []) {
    const { id, ...rest } = k;
    schreibe.push([doc(db, "kontrollen", id), rest]);
  }
  for (let i = 0; i < schreibe.length; i += 400) {
    const batch = writeBatch(db);
    schreibe.slice(i, i + 400).forEach(([ref, d]) => batch.set(ref, d));
    await batch.commit();
  }
  return schreibe.length;
}
