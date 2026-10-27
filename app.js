import * as store from "./datastore.js";
import {
  $, esc, heute, fmtDatum, wochentag, TYPEN, TYP_PLURAL, melde, mitSperre,
  zusammenfassen, detailsHtml, mangelFelderHtml, leseMangelFelder
} from "./hilfen.js";
import { freierTag, kwText } from "./kalender.js";
import { tabAuswertung } from "./auswertung.js";
import * as exporter from "./export.js";

const inhalt = $("#inhalt");
const tabs = $("#tabs");
let ich = null;
let einrichtungen = [];
const aktiveEinrichtungen = () => einrichtungen.filter((e) => e.aktiv !== false);

// ---------- Start ----------
store.onAuth(async (profil) => {
  ich = profil;
  if (!profil) return zeigeLogin();
  if (profil.fehlt) { await store.logout(); return zeigeLogin("Für dieses Konto ist kein Profil angelegt. Bitte an die Leitung wenden."); }
  if (profil.aktiv === false) { await store.logout(); return zeigeLogin("Dieses Konto ist deaktiviert."); }
  try {
    einrichtungen = await store.listEinrichtungen();
  } catch (e) {
    console.error(e);
    inhalt.innerHTML = `<p class="fehler">Daten konnten nicht geladen werden. Bitte Seite neu laden.</p>`;
    return;
  }
  $("#kopf").hidden = false;
  $("#kopf-name").textContent = profil.name;
  if (profil.passwortAendern) return zeigeErstPasswort();
  starteAnsicht();
});

function starteAnsicht() {
  if (ich.rolle === "leitung") zeigeLeitung("heute");
  else { tabs.hidden = true; zeigeHausmeister(); }
}

const MIN_PW = 8;
function pruefePasswort(p1, p2) {
  if (p1.length < MIN_PW) return `Das Passwort braucht mindestens ${MIN_PW} Zeichen.`;
  if (!/[A-Za-zÄÖÜäöüß]/.test(p1) || !/[0-9]/.test(p1)) return "Das Passwort braucht Buchstaben und mindestens eine Zahl.";
  if (p1 !== p2) return "Die Passwörter stimmen nicht überein.";
  return "";
}

// Beim ersten Anmelden muss das Startpasswort ersetzt werden.
function zeigeErstPasswort() {
  tabs.hidden = true;
  $("#btn-passwort").hidden = true;
  inhalt.onclick = null;
  inhalt.innerHTML = `
    <form class="login panel" id="erst-pw">
      <h1>Eigenes Passwort festlegen</h1>
      <p class="untertitel">Hallo ${esc(ich.name)}, bitte ersetze das Startpasswort durch ein eigenes. Mindestens ${MIN_PW} Zeichen, mit Buchstaben und Zahl.</p>
      <div class="feld"><label for="e-pw1">Neues Passwort</label><input type="password" id="e-pw1" autocomplete="new-password" required></div>
      <div class="feld"><label for="e-pw2">Wiederholen</label><input type="password" id="e-pw2" autocomplete="new-password" required></div>
      <p class="fehler" id="e-fehler"></p>
      <button class="btn btn-primaer" type="submit" style="width:100%">Passwort speichern</button>
    </form>`;
  $("#erst-pw").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const p1 = $("#e-pw1").value, p2 = $("#e-pw2").value;
    const fehler = pruefePasswort(p1, p2);
    if (fehler) { $("#e-fehler").textContent = fehler; return; }
    ev.submitter.disabled = true;
    try {
      await store.passwortAendern(p1);
      await store.passwortWurdeGeaendert(ich.uid);
      ich.passwortAendern = false;
      $("#btn-passwort").hidden = false;
      melde("Passwort gespeichert.");
      starteAnsicht();
    } catch (e) {
      $("#e-fehler").textContent = e.message;
      ev.submitter.disabled = false;
    }
  });
}

$("#btn-abmelden").addEventListener("click", () => store.logout());
$("#btn-passwort").addEventListener("click", zeigePasswortDialog);

// ---------- Login ----------
function zeigeLogin(hinweis = "") {
  $("#kopf").hidden = true;
  tabs.hidden = true;
  inhalt.innerHTML = `
    <form class="login panel" id="login-form">
      <img src="logo.png" alt="Kreisstadt Merzig" class="login-logo" onerror="this.remove()">
      <h1>Reinigungskontrolle</h1>
      <p class="untertitel">Grundschulen und Kitas der Kreisstadt Merzig</p>
      <div class="feld"><label for="l-name">Benutzername</label>
        <input type="text" id="l-name" autocomplete="username" autocapitalize="none" required></div>
      <div class="feld"><label for="l-pw">Passwort</label>
        <input type="password" id="l-pw" autocomplete="current-password" required></div>
      <p class="fehler" id="l-fehler">${esc(hinweis)}</p>
      <button class="btn btn-primaer" type="submit" style="width:100%">Anmelden</button>
    </form>
    ${window.DEMO_HINWEIS || ""}`;
  $("#login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter || $("#login-form button");
    btn.disabled = true;
    $("#l-fehler").textContent = "";
    try {
      await store.login($("#l-name").value, $("#l-pw").value);
    } catch (e) {
      $("#l-fehler").textContent = e.message;
      btn.disabled = false;
    }
  });
}

function zeigePasswortDialog() {
  const d = document.createElement("dialog");
  d.innerHTML = `
    <form method="dialog" id="pw-form">
      <h2>Passwort ändern</h2>
      <div class="feld"><label for="pw1">Neues Passwort</label><input type="password" id="pw1" autocomplete="new-password" required></div>
      <div class="feld"><label for="pw2">Wiederholen</label><input type="password" id="pw2" autocomplete="new-password" required></div>
      <p class="fehler" id="pw-fehler"></p>
      <div class="aktionen"><button class="btn btn-primaer" value="ok">Passwort speichern</button><button class="btn" value="abbruch" formnovalidate>Abbrechen</button></div>
    </form>`;
  document.body.appendChild(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
  $("#pw-form", d).addEventListener("submit", async (ev) => {
    if (ev.submitter?.value === "abbruch") return;
    ev.preventDefault();
    const p1 = $("#pw1", d).value, p2 = $("#pw2", d).value;
    const fehler = pruefePasswort(p1, p2);
    if (fehler) { $("#pw-fehler", d).textContent = fehler; return; }
    try {
      await store.passwortAendern(p1);
      d.close();
      melde("Passwort gespeichert.");
    } catch (e) { $("#pw-fehler", d).textContent = e.message; }
  });
}

// ============================================================
// Hausmeister
// ============================================================
async function zeigeHausmeister() {
  const datum = heute();
  const meine = aktiveEinrichtungen().filter((e) => !ich.einrichtungen?.length || ich.einrichtungen.includes(e.id));
  inhalt.onclick = null;
  inhalt.innerHTML = `<p class="laden">Wird geladen …</p>`;
  let kontrollen;
  try { kontrollen = await store.kontrollenAm(datum); }
  catch (e) { console.error(e); inhalt.innerHTML = `<p class="fehler">Kontrollen konnten nicht geladen werden.</p>`; return; }
  const nach = Object.fromEntries(kontrollen.map((k) => [k.einrichtungId, k]));
  const erledigt = meine.filter((e) => nach[e.id]).length;

  if (!meine.length) {
    inhalt.innerHTML = `<p class="leer">Dir sind noch keine Einrichtungen zugeordnet. Bitte an die Leitung wenden.</p>`;
    return;
  }
  const frei = freierTag(datum, "Kita"); // Wochenende oder Feiertag
  inhalt.innerHTML = `
    <section class="tageskopf">
      <p class="kw">${kwText(datum)}</p>
      <h1>${wochentag(datum)}, ${fmtDatum(datum)}</h1>
      ${frei ? `<p class="hinweis-box">Heute ist ${esc(frei)}. Ein Eintrag ist freiwillig.</p>` : ""}
      <p>${erledigt} von ${meine.length} Einrichtungen kontrolliert</p>
      <div class="fortschritt"><span style="width:${Math.round((erledigt / meine.length) * 100)}%"></span></div>
    </section>
    ${TYPEN.map((typ) => {
      const liste = meine.filter((e) => e.typ === typ);
      if (!liste.length) return "";
      return `<h2 class="gruppe-titel">${TYP_PLURAL[typ]}</h2>` + liste.map((e) => karteHausmeister(e, nach[e.id])).join("");
    }).join("")}`;

  inhalt.onclick = async (ev) => {
    const btn = ev.target.closest("button[data-aktion]");
    if (!btn) return;
    const karte = btn.closest(".einrichtung");
    const e = einrichtungen.find((x) => x.id === karte.dataset.id);
    const k = nach[e.id];
    const aktion = btn.dataset.aktion;
    const formular = (name) => $(`[data-form=${name}]`, karte);

    if (aktion === "ok") {
      if (!confirm(`${e.name} als „Alles sauber“ speichern?\n\nDanach kann der Eintrag nicht mehr geändert, sondern nur noch ergänzt werden.`)) return;
      await mitSperre(btn, async () => {
        await store.neueKontrolle(basisKontrolle(datum, e, { status: "ok", nichtGeputzt: false, nichtSauber: false, bereiche: [], bemerkung: "" }));
        melde(`${e.name}: als sauber gespeichert.`);
        zeigeHausmeister();
      });
    } else if (aktion === "mangel-oeffnen" || aktion === "nachtrag-oeffnen") {
      const f = formular(aktion === "mangel-oeffnen" ? "mangel" : "nachtrag");
      const oeffnen = f.hidden;
      f.hidden = !oeffnen;
      btn.setAttribute("aria-pressed", String(oeffnen));
      if (oeffnen) $("input, textarea", f).focus();
    } else if (aktion === "mangel-speichern") {
      const f = formular("mangel");
      await mitSperre(btn, async () => {
        const felder = leseMangelFelder(f);
        if (!confirm(`Mangel für ${e.name} speichern?\n\nDanach kann der Eintrag nicht mehr geändert, sondern nur noch ergänzt werden.`)) return;
        await store.neueKontrolle(basisKontrolle(datum, e, { status: "mangel", ...felder, bemerkung: $("textarea", f).value.trim() }));
        melde(`${e.name}: Mangel gespeichert.`);
        zeigeHausmeister();
      });
    } else if (aktion === "nachtrag-speichern") {
      const f = formular("nachtrag");
      await mitSperre(btn, async () => {
        const text = $("textarea", f).value.trim();
        const mitMangel = $("[name=nachtragMangel]", f).checked;
        let mangel = { mangel: false, nichtGeputzt: false, nichtSauber: false, bereiche: [] };
        if (mitMangel) mangel = { mangel: true, ...leseMangelFelder($("[data-mangelfelder]", f)) };
        if (!text && !mitMangel) throw new Error("Bitte einen Text eingeben oder einen Mangel ankreuzen.");
        await store.nachtragHinzufuegen(k.id, { ...mangel, text, vonName: ich.name }, k.status);
        melde(`${e.name}: Nachtrag gespeichert.`);
        zeigeHausmeister();
      });
    } else if (aktion === "abbrechen") {
      btn.closest("[data-form]").hidden = true;
      karte.querySelectorAll("[aria-pressed]").forEach((b) => b.setAttribute("aria-pressed", "false"));
    }
  };

  inhalt.onchange = (ev) => {
    if (ev.target.name === "nachtragMangel") {
      $("[data-mangelfelder]", ev.target.closest("[data-form]")).hidden = !ev.target.checked;
    }
  };
}

function karteHausmeister(e, k) {
  const status = k ? zusammenfassen(k).status : "offen";
  const id = esc(e.id);
  if (!k) {
    return `
    <article class="einrichtung" data-id="${id}" data-status="offen">
      <div class="einrichtung-kopf">
        <div>
          <div class="einrichtung-name">${esc(e.name)}</div>
          ${e.adresse ? `<div class="einrichtung-adresse">${esc(e.adresse)}</div>` : ""}
        </div>
        <div class="aktionen">
          <button type="button" class="btn btn-ok" data-aktion="ok">Alles sauber</button>
          <button type="button" class="btn btn-mangel" data-aktion="mangel-oeffnen" aria-pressed="false">Mangel melden</button>
        </div>
      </div>
      ${detailsHtml(null)}
      <div class="unterformular" data-form="mangel" hidden>
        ${mangelFelderHtml(e.typ, "m-" + id)}
        <div class="feld">
          <label for="b-${id}">Bemerkung <span class="hinweis">(freiwillig)</span></label>
          <textarea id="b-${id}" maxlength="500" placeholder="z. B. Toiletten im Erdgeschoss, Mülleimer voll"></textarea>
        </div>
        <div class="aktionen">
          <button type="button" class="btn btn-primaer" data-aktion="mangel-speichern">Mangel speichern</button>
          <button type="button" class="btn" data-aktion="abbrechen">Abbrechen</button>
        </div>
      </div>
    </article>`;
  }
  return `
  <article class="einrichtung" data-id="${id}" data-status="${status}">
    <div class="einrichtung-kopf">
      <div>
        <div class="einrichtung-name">${esc(e.name)}</div>
        ${e.adresse ? `<div class="einrichtung-adresse">${esc(e.adresse)}</div>` : ""}
      </div>
      <div class="aktionen">
        <button type="button" class="btn" data-aktion="nachtrag-oeffnen" aria-pressed="false">Nachtrag hinzufügen</button>
      </div>
    </div>
    ${detailsHtml(k)}
    <p class="gesperrt">Gespeichert und gesperrt. Ergänzungen nur als Nachtrag.</p>
    <div class="unterformular" data-form="nachtrag" hidden>
      <div class="feld">
        <label for="n-${id}">Nachtrag</label>
        <textarea id="n-${id}" maxlength="500" placeholder="Was möchtest du ergänzen?"></textarea>
      </div>
      <label class="check"><input type="checkbox" name="nachtragMangel"> Zusätzlichen Mangel melden</label>
      <div data-mangelfelder hidden>${mangelFelderHtml(e.typ, "n-" + id)}</div>
      <div class="aktionen">
        <button type="button" class="btn btn-primaer" data-aktion="nachtrag-speichern">Nachtrag speichern</button>
        <button type="button" class="btn" data-aktion="abbrechen">Abbrechen</button>
      </div>
    </div>
  </article>`;
}

function basisKontrolle(datum, e, werte) {
  return { datum, einrichtungId: e.id, einrichtungName: e.name, einrichtungTyp: e.typ, erfasstVonName: ich.name, ...werte };
}

// ============================================================
// Leitung
// ============================================================
const LEITUNG_TABS = [
  ["heute", "Tagesübersicht"],
  ["auswertung", "Auswertung"],
  ["einrichtungen", "Einrichtungen"],
  ["benutzer", "Benutzer"],
  ["sicherung", "Datensicherung"]
];

function zeigeLeitung(tab) {
  tabs.hidden = false;
  tabs.innerHTML = LEITUNG_TABS.map(([id, titel]) =>
    `<button type="button" data-tab="${id}" ${id === tab ? 'aria-current="page"' : ""}>${titel}</button>`).join("");
  tabs.onclick = (ev) => { const b = ev.target.closest("[data-tab]"); if (b) zeigeLeitung(b.dataset.tab); };
  inhalt.onclick = null;
  inhalt.onchange = null;
  inhalt.innerHTML = `<p class="laden">Wird geladen …</p>`;
  const ansichten = {
    heute: () => tabHeute(),
    auswertung: () => tabAuswertung(inhalt, { einrichtungen, ich }),
    einrichtungen: tabEinrichtungen,
    benutzer: tabBenutzer,
    sicherung: tabSicherung
  };
  Promise.resolve(ansichten[tab]()).catch((e) => { console.error(e); inhalt.innerHTML = `<p class="fehler">Laden fehlgeschlagen: ${esc(e.message)}</p>`; });
}

// ---------- Tagesübersicht ----------
const tagVerschieben = (iso, tage) => { const d = new Date(iso + "T12:00"); d.setDate(d.getDate() + tage); return d.toLocaleDateString("sv-SE"); };

async function tabHeute(datum = heute()) {
  const kontrollen = await store.kontrollenAm(datum);
  const nach = Object.fromEntries(kontrollen.map((k) => [k.einrichtungId, k]));
  const liste = aktiveEinrichtungen();
  let ok = 0, mangel = 0, offen = 0, frei = 0;
  for (const e of liste) {
    const k = nach[e.id];
    if (k) zusammenfassen(k).status === "mangel" ? mangel++ : ok++;
    else freierTag(datum, e.typ) ? frei++ : offen++;
  }

  inhalt.innerHTML = `
    <div class="tag-navi">
      <button type="button" class="btn" data-tag="-1" aria-label="Vorheriger Tag">‹</button>
      <input type="date" id="t-datum" value="${datum}" aria-label="Tag">
      <button type="button" class="btn" data-tag="1" aria-label="Nächster Tag">›</button>
      <button type="button" class="btn" data-tag="0">Heute</button>
    </div>
    <p class="kw">${kwText(datum)}</p>
    <h1>${wochentag(datum)}, ${fmtDatum(datum)}</h1>
    <div class="zaehler">
      <span><strong>${ok}</strong>in Ordnung</span>
      <span class="z-mangel"><strong>${mangel}</strong>mit Mangel</span>
      <span class="z-offen"><strong>${offen}</strong>noch offen</span>
      ${frei ? `<span class="z-offen"><strong>${frei}</strong>frei (Wochenende, Feiertag, Ferien)</span>` : ""}
    </div>
    ${liste.length ? "" : `<p class="leer">Noch keine Einrichtungen angelegt. Unter „Einrichtungen“ hinzufügen.</p>`}
    ${TYPEN.map((typ) => {
      const l = liste.filter((e) => e.typ === typ);
      if (!l.length) return "";
      return `<h2 class="gruppe-titel">${TYP_PLURAL[typ]}</h2>` + l.map((e) => {
        const k = nach[e.id];
        const grund = !k && freierTag(datum, e.typ);
        return `
        <article class="einrichtung" data-status="${k ? zusammenfassen(k).status : grund ? "frei" : "offen"}">
          <div class="einrichtung-kopf">
            <div class="einrichtung-name">${esc(e.name)}</div>
            ${k ? `<button type="button" class="btn btn-klein" data-loeschen="${esc(k.id)}" data-name="${esc(e.name)}">Eintrag löschen</button>` : ""}
          </div>
          ${grund ? `<p class="status-zeile"><span class="badge offen">Frei</span> ${esc(grund)}</p>` : detailsHtml(k)}
        </article>`;
      }).join("");
    }).join("")}`;

  $("#t-datum").addEventListener("change", (ev) => ev.target.value && tabHeute(ev.target.value));
  inhalt.onclick = async (ev) => {
    const navi = ev.target.closest("[data-tag]");
    if (navi) return tabHeute(navi.dataset.tag === "0" ? heute() : tagVerschieben(datum, Number(navi.dataset.tag)));
    const del = ev.target.closest("[data-loeschen]");
    if (del) {
      if (!confirm(`Eintrag von ${del.dataset.name} am ${fmtDatum(datum)} endgültig löschen?\n\nDanach kann der Hausmeister den Tag neu erfassen.`)) return;
      await mitSperre(del, async () => {
        await store.loescheKontrolle(del.dataset.loeschen);
        melde("Eintrag gelöscht.");
        tabHeute(datum);
      });
    }
  };
}

// ---------- Einrichtungen ----------
function tabEinrichtungen() {
  inhalt.innerHTML = `
    <h1>Einrichtungen</h1>
    <div class="tabelle-wrap panel" style="padding:0">
      <table>
        <thead><tr><th>Name</th><th>Art</th><th>Adresse</th><th>Status</th><th></th></tr></thead>
        <tbody>${einrichtungen.length ? einrichtungen.map((e) => `
          <tr data-id="${esc(e.id)}">
            <td><input type="text" name="name" value="${esc(e.name)}" aria-label="Name"></td>
            <td><select name="typ" aria-label="Art">${TYPEN.map((t) => `<option ${t === e.typ ? "selected" : ""}>${t}</option>`).join("")}</select></td>
            <td><input type="text" name="adresse" value="${esc(e.adresse)}" aria-label="Adresse"></td>
            <td><label class="check"><input type="checkbox" name="aktiv" ${e.aktiv !== false ? "checked" : ""}> aktiv</label></td>
            <td><button type="button" class="btn" data-aktion="speichern">Speichern</button></td>
          </tr>`).join("") : `<tr><td colspan="5" class="leer">Noch keine Einrichtungen angelegt.</td></tr>`}
        </tbody>
      </table>
    </div>
    <p class="hinweis">Nicht mehr betreute Einrichtungen auf „inaktiv“ setzen statt löschen – so bleiben alte Kontrollen in der Auswertung erhalten.</p>

    <form class="panel" id="e-neu">
      <h2>Einrichtung hinzufügen</h2>
      <div class="raster">
        <div><label for="e-name">Name</label><input type="text" id="e-name" required></div>
        <div><label for="e-typ">Art</label><select id="e-typ">${TYPEN.map((t) => `<option>${t}</option>`).join("")}</select></div>
        <div><label for="e-adr">Adresse <span class="hinweis">(freiwillig)</span></label><input type="text" id="e-adr"></div>
        <div><button class="btn btn-primaer" type="submit">Einrichtung hinzufügen</button></div>
      </div>
    </form>

    <form class="panel" id="e-liste">
      <h2>Mehrere auf einmal hinzufügen</h2>
      <p class="hinweis">Eine Einrichtung pro Zeile: <code>Art;Name;Adresse</code> – Art ist „Grundschule“ oder „Kita“.</p>
      <textarea id="e-text" rows="6" placeholder="Grundschule;Grundschule St. Josef;Beethovenstraße 2a&#10;Kita;Kita Merchingen;Honzrather Straße 86"></textarea>
      <button class="btn btn-primaer" type="submit" style="margin-top:.6rem">Alle hinzufügen</button>
    </form>`;

  inhalt.onclick = async (ev) => {
    const btn = ev.target.closest("[data-aktion=speichern]");
    if (!btn) return;
    const tr = btn.closest("tr");
    await mitSperre(btn, async () => {
      await store.saveEinrichtung({
        id: tr.dataset.id,
        name: $("[name=name]", tr).value.trim(),
        typ: $("[name=typ]", tr).value,
        adresse: $("[name=adresse]", tr).value.trim(),
        aktiv: $("[name=aktiv]", tr).checked
      });
      einrichtungen = await store.listEinrichtungen();
      melde("Einrichtung gespeichert.");
    });
  };

  $("#e-neu").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await mitSperre(ev.submitter, async () => {
      await store.saveEinrichtung({ name: $("#e-name").value.trim(), typ: $("#e-typ").value, adresse: $("#e-adr").value.trim() });
      einrichtungen = await store.listEinrichtungen();
      melde("Einrichtung hinzugefügt.");
      tabEinrichtungen();
    });
  });

  $("#e-liste").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const zeilen = $("#e-text").value.split("\n").map((z) => z.trim()).filter(Boolean);
    const neu = [];
    for (const [i, z] of zeilen.entries()) {
      const [typRoh, name, adresse = ""] = z.split(";").map((s) => s.trim());
      const typ = TYPEN.find((t) => t.toLowerCase() === (typRoh || "").toLowerCase());
      if (!typ || !name) { melde(`Zeile ${i + 1} ist nicht im Format Art;Name;Adresse.`, true); return; }
      neu.push({ typ, name, adresse });
    }
    await mitSperre(ev.submitter, async () => {
      for (const e of neu) await store.saveEinrichtung(e);
      einrichtungen = await store.listEinrichtungen();
      melde(`${neu.length} Einrichtungen hinzugefügt.`);
      tabEinrichtungen();
    });
  });
}

// ---------- Benutzer ----------
function bildeBenutzername(vorname, nachname) {
  const umschreiben = (t) => t.trim().toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // é → e usw.
    .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const v = umschreiben(vorname), n = umschreiben(nachname);
  return v && n ? `${v[0]}.${n}` : "";
}

function erzeugePasswort() {
  // ohne verwechselbare Zeichen (0/O, 1/l/I)
  const buchstaben = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", zahlen = "23456789";
  const zufall = (menge) => menge[crypto.getRandomValues(new Uint32Array(1))[0] % menge.length];
  let pw = "";
  for (let i = 0; i < 7; i++) pw += zufall(buchstaben);
  for (let i = 0; i < 3; i++) pw += zufall(zahlen);
  return pw;
}

async function tabBenutzer() {
  const alle = await store.listBenutzer();
  const benutzer = alle.filter((b) => !b.geloescht);
  const einrCheckboxen = (ausgewaehlt = []) => aktiveEinrichtungen().map((e) => `
    <label class="check"><input type="checkbox" name="einr" value="${esc(e.id)}" ${ausgewaehlt.includes(e.id) ? "checked" : ""}> ${esc(e.name)}</label>`).join("")
    || `<p class="hinweis">Erst Einrichtungen anlegen.</p>`;

  inhalt.innerHTML = `
    <h1>Benutzer</h1>
    ${benutzer.map((b) => {
      const ichSelbst = b.uid === ich.uid;
      const vorname = b.vorname || b.name.split(" ")[0] || "";
      const nachname = b.nachname || b.name.split(" ").slice(1).join(" ");
      return `
      <details class="panel" data-uid="${esc(b.uid)}">
        <summary><strong>${esc(b.name)}</strong> <span class="hinweis">${b.rolle === "leitung" ? "Leitung" : "Hausmeister"}${b.aktiv === false ? ", deaktiviert" : ""}${b.passwortAendern ? ", Startpasswort noch nicht geändert" : ""}${ichSelbst ? ", das bist du" : ""}</span></summary>
        <div style="margin-top:1rem">
          <p>Benutzername: <strong>${esc(b.benutzername || "")}</strong> <span class="hinweis">(nicht änderbar)</span></p>
          <div class="raster">
            <div><label>Vorname</label><input type="text" name="vorname" value="${esc(vorname)}"></div>
            <div><label>Nachname</label><input type="text" name="nachname" value="${esc(nachname)}"></div>
            <div><label>E-Mail <span class="hinweis">(freiwillig)</span></label><input type="email" name="email" value="${esc(b.email || "")}" placeholder="name@merzig.de"></div>
            <div><label>Rolle</label><select name="rolle" ${ichSelbst ? "disabled" : ""}>
              <option value="hausmeister" ${b.rolle === "hausmeister" ? "selected" : ""}>Hausmeister</option>
              <option value="leitung" ${b.rolle === "leitung" ? "selected" : ""}>Leitung</option></select></div>
          </div>
          <div data-einr-wahl ${b.rolle === "hausmeister" ? "" : "hidden"} style="margin-top:1rem">
            <p><strong>Zuständig für</strong> <span class="hinweis">(nichts angekreuzt = alle Einrichtungen)</span></p>
            <div class="einr-spalten">${einrCheckboxen(b.einrichtungen || [])}</div>
          </div>
          <div class="trenner"><label class="check"><input type="checkbox" name="aktiv" ${b.aktiv !== false ? "checked" : ""} ${ichSelbst ? "disabled" : ""}> Konto aktiv <span class="hinweis">(deaktivierte Konten können sich nicht mehr anmelden)</span></label></div>
          <div class="aktionen" style="margin-top:.6rem">
            <button type="button" class="btn btn-primaer" data-aktion="benutzer-speichern">Änderungen speichern</button>
            ${ichSelbst ? "" : `<button type="button" class="btn btn-mangel" data-aktion="benutzer-loeschen">Benutzer löschen</button>`}
          </div>
        </div>
      </details>`;
    }).join("")}

    <form class="panel" id="b-neu">
      <h2>Benutzer anlegen</h2>
      <div class="raster">
        <div><label for="b-vorname">Vorname</label><input type="text" id="b-vorname" required></div>
        <div><label for="b-nachname">Nachname</label><input type="text" id="b-nachname" required></div>
        <div><label for="b-login">Benutzername <span class="hinweis">(automatisch)</span></label><input type="text" id="b-login" readonly required></div>
        <div><label for="b-email">E-Mail <span class="hinweis">(freiwillig)</span></label><input type="email" id="b-email" placeholder="name@merzig.de"></div>
        <div><label for="b-pw">Startpasswort</label>
          <div style="display:flex;gap:.4rem"><input type="text" id="b-pw" required><button type="button" class="btn" id="b-pw-neu" title="Neues Startpasswort erzeugen">Neu</button></div></div>
        <div><label for="b-rolle">Rolle</label><select id="b-rolle"><option value="hausmeister">Hausmeister</option><option value="leitung">Leitung</option></select></div>
      </div>
      <div id="b-einr-wahl" style="margin-top:1rem">
        <p><strong>Zuständig für</strong> <span class="hinweis">(nichts angekreuzt = alle Einrichtungen)</span></p>
        <div class="einr-spalten">${einrCheckboxen()}</div>
      </div>
      <button class="btn btn-primaer" type="submit" style="margin-top:.6rem">Benutzer anlegen</button>
    </form>
    <p class="hinweis">Der Benutzername wird aus erstem Buchstaben des Vornamens, Punkt und Nachnamen gebildet (z. B. Jürgen Müller → j.mueller). Beim ersten Anmelden muss jeder das Startpasswort durch ein eigenes ersetzen.
    Gelöschte Benutzer können sich nicht mehr anmelden; ihre bisherigen Einträge bleiben in der Auswertung erhalten.
    <strong>Passwort zurücksetzen</strong> geht in der aktuellen Version nur über die Firebase Console (Authentication → Nutzer).</p>`;

  const aktualisiereLogin = () => { $("#b-login").value = bildeBenutzername($("#b-vorname").value, $("#b-nachname").value); };
  $("#b-vorname").addEventListener("input", aktualisiereLogin);
  $("#b-nachname").addEventListener("input", aktualisiereLogin);
  $("#b-pw").value = erzeugePasswort();
  $("#b-pw-neu").addEventListener("click", () => { $("#b-pw").value = erzeugePasswort(); });
  $("#b-rolle").addEventListener("change", (ev) => { $("#b-einr-wahl").hidden = ev.target.value !== "hausmeister"; });

  inhalt.onchange = (ev) => {
    if (ev.target.name === "rolle") $("[data-einr-wahl]", ev.target.closest("details")).hidden = ev.target.value !== "hausmeister";
  };

  inhalt.onclick = async (ev) => {
    const btn = ev.target.closest("[data-aktion]");
    if (!btn) return;
    const box = btn.closest("details");
    const b = benutzer.find((x) => x.uid === box.dataset.uid);

    if (btn.dataset.aktion === "benutzer-loeschen") {
      if (!confirm(`${b.name} (${b.benutzername}) wirklich löschen?\n\nDer Benutzer kann sich danach nicht mehr anmelden. Seine bisherigen Einträge bleiben erhalten.`)) return;
      await mitSperre(btn, async () => {
        await store.loescheBenutzer(b.uid);
        melde(`${b.name} gelöscht.`);
        tabBenutzer();
      });
      return;
    }

    await mitSperre(btn, async () => {
      const vorname = $("[name=vorname]", box).value.trim(), nachname = $("[name=nachname]", box).value.trim();
      if (!vorname || !nachname) throw new Error("Vor- und Nachname dürfen nicht leer sein.");
      const email = $("[name=email]", box).value.trim();
      if (email && !$("[name=email]", box).checkValidity()) throw new Error("Die E-Mail-Adresse ist ungültig.");
      const rolle = $("[name=rolle]", box).value;
      const daten = { vorname, nachname, name: `${vorname} ${nachname}`, email };
      if (b.uid !== ich.uid) {
        daten.rolle = rolle;
        daten.aktiv = $("[name=aktiv]", box).checked;
      }
      daten.einrichtungen = rolle === "hausmeister" ? [...box.querySelectorAll("[data-einr-wahl] [name=einr]:checked")].map((h) => h.value) : [];
      await store.updateBenutzer(b.uid, daten);
      melde("Benutzer gespeichert.");
      tabBenutzer();
    });
  };

  $("#b-neu").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const rolle = $("#b-rolle").value;
    await mitSperre(ev.submitter, async () => {
      const vorname = $("#b-vorname").value.trim(), nachname = $("#b-nachname").value.trim();
      if (!$("#b-login").value) throw new Error("Aus Vor- und Nachname lässt sich kein Benutzername bilden.");
      const startpasswort = $("#b-pw").value;
      if (startpasswort.length < MIN_PW) throw new Error(`Das Startpasswort braucht mindestens ${MIN_PW} Zeichen.`);
      if ($("#b-email").value && !$("#b-email").checkValidity()) throw new Error("Die E-Mail-Adresse ist ungültig.");
      await store.createBenutzer({
        vorname, nachname,
        name: `${vorname} ${nachname}`,
        benutzername: $("#b-login").value.trim(),
        email: $("#b-email").value.trim(),
        passwort: startpasswort,
        rolle,
        einrichtungen: rolle === "hausmeister" ? [...$("#b-einr-wahl").querySelectorAll("[name=einr]:checked")].map((h) => h.value) : []
      });
      alert(`Benutzer angelegt.\n\nBenutzername: ${$("#b-login").value}\nStartpasswort: ${startpasswort}\n\nBitte notieren und weitergeben. Beim ersten Anmelden muss ein eigenes Passwort gesetzt werden.`);
      tabBenutzer();
    });
  });
}

// ---------- Datensicherung ----------
function tabSicherung() {
  inhalt.innerHTML = `
    <h1>Datensicherung</h1>
    <section class="panel">
      <h2>Sicherung herunterladen</h2>
      <p>Alle Einrichtungen, Benutzerprofile und Kontrollen als JSON-Datei. Diese Datei ist auch die Grundlage für einen späteren Umzug auf einen eigenen Server.</p>
      <button class="btn btn-primaer" type="button" id="s-export">Sicherung herunterladen</button>
    </section>
    <section class="panel">
      <h2>Sicherung einspielen</h2>
      <p>Spielt Einrichtungen und Kontrollen aus einer Sicherungsdatei ein. Vorhandene Einträge mit gleicher ID werden überschrieben. Benutzerkonten werden nicht übernommen.</p>
      <input type="file" id="s-datei" accept="application/json,.json">
      <button class="btn" type="button" id="s-import" style="margin-top:.6rem">Sicherung einspielen</button>
    </section>`;

  $("#s-export").addEventListener("click", (ev) => mitSperre(ev.currentTarget, async () => {
    const daten = await store.exportAlles();
    const blob = new Blob([JSON.stringify(daten, null, 2)], { type: "application/json" });
    exporter.herunterladen(blob, `Reinigungskontrolle_Sicherung_${heute()}.json`);
  }));

  $("#s-import").addEventListener("click", (ev) => mitSperre(ev.currentTarget, async () => {
    const datei = $("#s-datei").files[0];
    if (!datei) { melde("Bitte zuerst eine Sicherungsdatei auswählen.", true); return; }
    if (!confirm("Sicherung jetzt einspielen? Einträge mit gleicher ID werden überschrieben.")) return;
    const anzahl = await store.importAlles(JSON.parse(await datei.text()));
    einrichtungen = await store.listEinrichtungen();
    melde(`${anzahl} Einträge eingespielt.`);
  }));
}
