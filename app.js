import * as store from "./datastore.js";
import * as exporter from "./export.js";

// ---------- Hilfsfunktionen ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const heute = () => new Date().toLocaleDateString("sv-SE"); // JJJJ-MM-TT, lokale Zeit
const fmtDatum = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
const wochentag = (iso) => new Date(iso + "T12:00").toLocaleDateString("de-DE", { weekday: "long" });
const fmtZeit = (iso) => (iso ? new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "");
const TYPEN = ["Grundschule", "Kita"];
const TYP_PLURAL = { Grundschule: "Grundschulen", Kita: "Kitas" };

const inhalt = $("#inhalt");
const tabs = $("#tabs");
let ich = null;
let einrichtungen = [];

let meldungTimer;
function melde(text, fehler = false) {
  const m = $("#meldung");
  m.textContent = text;
  m.classList.toggle("fehler-meldung", fehler);
  m.classList.add("sichtbar");
  clearTimeout(meldungTimer);
  meldungTimer = setTimeout(() => m.classList.remove("sichtbar"), fehler ? 6000 : 3000);
}

async function mitSperre(button, fn) {
  button.disabled = true;
  try { await fn(); } catch (e) { console.error(e); melde(e.message || "Speichern fehlgeschlagen.", true); }
  finally { button.disabled = false; }
}

const aktiveEinrichtungen = () => einrichtungen.filter((e) => e.aktiv !== false);

function statusZeile(k) {
  if (!k) return `<p class="status-zeile"><span class="badge offen">Noch nicht kontrolliert</span></p>`;
  if (k.status === "ok") {
    return `<p class="status-zeile ok"><span class="badge ok">In Ordnung</span> erfasst ${fmtZeit(k.erfasstAm)} Uhr von ${esc(k.erfasstVonName)}</p>`;
  }
  const punkte = [k.nichtGeputzt && "nicht geputzt", k.nichtSauber && "nicht sauber"].filter(Boolean).join(", ");
  return `<p class="status-zeile mangel"><span class="badge mangel">Mangel</span> ${esc(punkte)}, erfasst ${fmtZeit(k.erfasstAm)} Uhr von ${esc(k.erfasstVonName)}</p>
    ${k.bemerkung ? `<p class="status-zeile">„${esc(k.bemerkung)}“</p>` : ""}`;
}

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
  if (profil.rolle === "leitung") zeigeLeitung("heute");
  else { tabs.hidden = true; zeigeHausmeister(); }
});

$("#btn-abmelden").addEventListener("click", () => store.logout());
$("#btn-passwort").addEventListener("click", zeigePasswortDialog);

// ---------- Login ----------
function zeigeLogin(hinweis = "") {
  $("#kopf").hidden = true;
  tabs.hidden = true;
  inhalt.innerHTML = `
    <form class="login panel" id="login-form">
      <h1>Reinigungskontrolle</h1>
      <p class="untertitel">Grundschulen und Kitas der Kreisstadt Merzig</p>
      <div class="feld"><label for="l-name">Benutzername</label>
        <input type="text" id="l-name" autocomplete="username" autocapitalize="none" required></div>
      <div class="feld"><label for="l-pw">Passwort</label>
        <input type="password" id="l-pw" autocomplete="current-password" required></div>
      <p class="fehler" id="l-fehler">${esc(hinweis)}</p>
      <button class="btn btn-primaer" type="submit" style="width:100%">Anmelden</button>
    </form>`;
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
      <div class="feld"><label for="pw1">Neues Passwort</label><input type="password" id="pw1" minlength="6" autocomplete="new-password" required></div>
      <div class="feld"><label for="pw2">Wiederholen</label><input type="password" id="pw2" minlength="6" autocomplete="new-password" required></div>
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
    if (p1 !== p2) { $("#pw-fehler", d).textContent = "Die Passwörter stimmen nicht überein."; return; }
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
  inhalt.innerHTML = `<p class="laden">Wird geladen …</p>`;
  let kontrollen;
  try { kontrollen = await store.kontrollenAm(datum); }
  catch (e) { console.error(e); inhalt.innerHTML = `<p class="fehler">Kontrollen konnten nicht geladen werden.</p>`; return; }
  const nachEinrichtung = Object.fromEntries(kontrollen.map((k) => [k.einrichtungId, k]));
  const erledigt = meine.filter((e) => nachEinrichtung[e.id]).length;

  if (!meine.length) {
    inhalt.innerHTML = `<p class="leer">Dir sind noch keine Einrichtungen zugeordnet. Bitte an die Leitung wenden.</p>`;
    return;
  }

  inhalt.innerHTML = `
    <section class="tageskopf">
      <h1>${wochentag(datum)}, ${fmtDatum(datum)}</h1>
      <p>${erledigt} von ${meine.length} Einrichtungen kontrolliert</p>
      <div class="fortschritt"><span style="width:${Math.round((erledigt / meine.length) * 100)}%"></span></div>
    </section>
    ${TYPEN.map((typ) => {
      const liste = meine.filter((e) => e.typ === typ);
      if (!liste.length) return "";
      return `<h2 class="gruppe-titel">${TYP_PLURAL[typ]}</h2>` + liste.map((e) => karteHausmeister(e, nachEinrichtung[e.id])).join("");
    }).join("")}`;

  inhalt.onclick = async (ev) => {
    const btn = ev.target.closest("button[data-aktion]");
    if (!btn) return;
    const karte = btn.closest(".einrichtung");
    const e = einrichtungen.find((x) => x.id === karte.dataset.id);
    const form = $(".mangel-form", karte);
    const aktion = btn.dataset.aktion;

    if (aktion === "ok") {
      await mitSperre(btn, async () => {
        await speichere(datum, e, { status: "ok", nichtGeputzt: false, nichtSauber: false, bemerkung: "" });
        melde(`${e.name}: als sauber gespeichert.`);
        zeigeHausmeister();
      });
    } else if (aktion === "mangel-oeffnen") {
      const offen = form.hidden;
      form.hidden = !offen;
      btn.setAttribute("aria-pressed", String(offen));
      if (offen) $("input", form).focus();
    } else if (aktion === "mangel-speichern") {
      const nichtGeputzt = $("[name=nichtGeputzt]", form).checked;
      const nichtSauber = $("[name=nichtSauber]", form).checked;
      if (!nichtGeputzt && !nichtSauber) { melde("Bitte ankreuzen, was nicht in Ordnung ist.", true); return; }
      await mitSperre(btn, async () => {
        await speichere(datum, e, { status: "mangel", nichtGeputzt, nichtSauber, bemerkung: $("textarea", form).value.trim() });
        melde(`${e.name}: Mangel gespeichert.`);
        zeigeHausmeister();
      });
    } else if (aktion === "abbrechen") {
      form.hidden = true;
      $("[data-aktion=mangel-oeffnen]", karte).setAttribute("aria-pressed", "false");
    }
  };
}

function karteHausmeister(e, k) {
  const vorbelegt = k?.status === "mangel";
  return `
  <article class="einrichtung" data-id="${esc(e.id)}" data-status="${k ? k.status : "offen"}">
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
    ${statusZeile(k)}
    <div class="mangel-form" hidden>
      <label class="check"><input type="checkbox" name="nichtGeputzt" ${vorbelegt && k.nichtGeputzt ? "checked" : ""}> Es wurde nicht geputzt</label>
      <label class="check"><input type="checkbox" name="nichtSauber" ${vorbelegt && k.nichtSauber ? "checked" : ""}> Es ist nicht sauber</label>
      <div class="feld" style="margin-top:.6rem">
        <label for="b-${esc(e.id)}">Bemerkung <span class="hinweis">(freiwillig)</span></label>
        <textarea id="b-${esc(e.id)}" maxlength="500" placeholder="z. B. Toiletten im Erdgeschoss, Mülleimer voll">${vorbelegt ? esc(k.bemerkung) : ""}</textarea>
      </div>
      <div class="aktionen">
        <button type="button" class="btn btn-primaer" data-aktion="mangel-speichern">Mangel speichern</button>
        <button type="button" class="btn" data-aktion="abbrechen">Abbrechen</button>
      </div>
    </div>
  </article>`;
}

function speichere(datum, e, werte) {
  return store.saveKontrolle({
    datum,
    einrichtungId: e.id,
    einrichtungName: e.name,
    einrichtungTyp: e.typ,
    erfasstVonName: ich.name,
    ...werte
  });
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
  inhalt.innerHTML = `<p class="laden">Wird geladen …</p>`;
  ({ heute: tabHeute, auswertung: tabAuswertung, einrichtungen: tabEinrichtungen, benutzer: tabBenutzer, sicherung: tabSicherung })[tab]();
}

// ---------- Tagesübersicht ----------
async function tabHeute(datum = heute()) {
  const kontrollen = await store.kontrollenAm(datum);
  const nach = Object.fromEntries(kontrollen.map((k) => [k.einrichtungId, k]));
  const liste = aktiveEinrichtungen();
  const ok = liste.filter((e) => nach[e.id]?.status === "ok").length;
  const mangel = liste.filter((e) => nach[e.id]?.status === "mangel").length;
  const offen = liste.length - ok - mangel;

  inhalt.innerHTML = `
    <div class="raster" style="margin-bottom:1rem">
      <div><label for="t-datum">Tag</label><input type="date" id="t-datum" value="${datum}"></div>
    </div>
    <h1>${wochentag(datum)}, ${fmtDatum(datum)}</h1>
    <div class="zaehler">
      <span><strong>${ok}</strong>in Ordnung</span>
      <span style="color:var(--mangel)"><strong>${mangel}</strong>mit Mangel</span>
      <span style="color:var(--offen)"><strong>${offen}</strong>noch offen</span>
    </div>
    ${liste.length ? "" : `<p class="leer">Noch keine Einrichtungen angelegt. Unter „Einrichtungen“ hinzufügen.</p>`}
    ${TYPEN.map((typ) => {
      const l = liste.filter((e) => e.typ === typ);
      if (!l.length) return "";
      return `<h2 class="gruppe-titel">${TYP_PLURAL[typ]}</h2>` + l.map((e) => `
        <article class="einrichtung" data-status="${nach[e.id] ? nach[e.id].status : "offen"}">
          <div class="einrichtung-name">${esc(e.name)}</div>
          ${statusZeile(nach[e.id])}
        </article>`).join("");
    }).join("")}`;
  $("#t-datum").addEventListener("change", (ev) => ev.target.value && tabHeute(ev.target.value));
}

// ---------- Auswertung ----------
function werktage(von, bis) {
  const tage = [];
  for (let d = new Date(von + "T12:00"); d <= new Date(bis + "T12:00"); d.setDate(d.getDate() + 1)) {
    const wt = d.getDay();
    if (wt !== 0 && wt !== 6) tage.push(d.toLocaleDateString("sv-SE"));
  }
  return tage;
}

let letzteAuswertung = null;

function tabAuswertung() {
  const jetzt = new Date();
  const monatsanfang = new Date(jetzt.getFullYear(), jetzt.getMonth(), 1).toLocaleDateString("sv-SE");
  inhalt.innerHTML = `
    <h1>Auswertung</h1>
    <form class="panel" id="a-form">
      <div class="raster">
        <div><label for="a-von">Von</label><input type="date" id="a-von" value="${monatsanfang}" required></div>
        <div><label for="a-bis">Bis</label><input type="date" id="a-bis" value="${heute()}" required></div>
        <div><label for="a-typ">Art</label>
          <select id="a-typ"><option value="">Alle</option>${TYPEN.map((t) => `<option>${t}</option>`).join("")}</select></div>
        <div><label for="a-einr">Einrichtung</label>
          <select id="a-einr"><option value="">Alle</option>${einrichtungen.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("")}</select></div>
      </div>
      <label class="check" style="margin-top:.8rem"><input type="checkbox" id="a-nur-maengel"> In den Einzelkontrollen nur Mängel aufführen</label>
      <button class="btn btn-primaer" type="submit" style="margin-top:.6rem">Auswertung anzeigen</button>
    </form>
    <div id="a-ergebnis"></div>`;
  $("#a-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter;
    await mitSperre(btn, berechneAuswertung);
  });
}

async function berechneAuswertung() {
  const von = $("#a-von").value, bis = $("#a-bis").value;
  if (von > bis) { melde("„Von“ liegt nach „Bis“.", true); return; }
  const typ = $("#a-typ").value, einrId = $("#a-einr").value, nurMaengel = $("#a-nur-maengel").checked;

  const alle = await store.kontrollenZeitraum(von, bis);
  const relevant = einrichtungen.filter((e) =>
    (einrId ? e.id === einrId : e.aktiv !== false) && (!typ || e.typ === typ));
  const ids = new Set(relevant.map((e) => e.id));
  const gefiltert = alle.filter((k) => ids.has(k.einrichtungId))
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.einrichtungName.localeCompare(b.einrichtungName, "de"));
  const wt = werktage(von, bis);

  const uebersicht = relevant.map((e) => {
    const ks = gefiltert.filter((k) => k.einrichtungId === e.id);
    const tageMitEintrag = new Set(ks.map((k) => k.datum));
    return {
      name: e.name, typ: e.typ,
      kontrollen: ks.length,
      ok: ks.filter((k) => k.status === "ok").length,
      mangel: ks.filter((k) => k.status === "mangel").length,
      ohneEintrag: wt.filter((t) => !tageMitEintrag.has(t)).length
    };
  });
  const einzel = nurMaengel ? gefiltert.filter((k) => k.status === "mangel") : gefiltert;

  const filterTeile = [typ ? TYP_PLURAL[typ] : "alle Einrichtungen"];
  if (einrId) filterTeile[0] = relevant[0]?.name || "eine Einrichtung";
  if (nurMaengel) filterTeile.push("Einzelkontrollen nur Mängel");
  letzteAuswertung = { von, bis, filterText: filterTeile.join(", "), erstelltVon: ich.name, uebersicht, einzel };

  const summe = uebersicht.reduce((s, z) => ({ k: s.k + z.kontrollen, m: s.m + z.mangel, o: s.o + z.ohneEintrag }), { k: 0, m: 0, o: 0 });

  $("#a-ergebnis").innerHTML = `
    <div class="export-leiste">
      <button class="btn btn-primaer" type="button" data-export="pdf">PDF herunterladen</button>
      <button class="btn" type="button" data-export="xlsx">Excel herunterladen</button>
      <button class="btn" type="button" data-export="mail">Per Mail senden</button>
    </div>
    <div class="zaehler">
      <span><strong>${summe.k}</strong>Kontrollen</span>
      <span style="color:var(--mangel)"><strong>${summe.m}</strong>mit Mangel</span>
      <span style="color:var(--offen)"><strong>${summe.o}</strong>Werktage ohne Eintrag</span>
    </div>
    <h2>Übersicht je Einrichtung</h2>
    <div class="tabelle-wrap"><table>
      <thead><tr><th>Einrichtung</th><th>Art</th><th class="zahl">Kontrollen</th><th class="zahl">In Ordnung</th><th class="zahl">Mängel</th><th class="zahl">Werktage ohne Eintrag</th></tr></thead>
      <tbody>${uebersicht.map((z) => `<tr class="${z.mangel ? "zeile-mangel" : ""}">
        <td>${esc(z.name)}</td><td>${esc(z.typ)}</td><td class="zahl">${z.kontrollen}</td><td class="zahl">${z.ok}</td>
        <td class="zahl">${z.mangel}</td><td class="zahl">${z.ohneEintrag}</td></tr>`).join("")}</tbody>
    </table></div>
    <h2 style="margin-top:1.6rem">Einzelkontrollen</h2>
    ${einzel.length ? `<div class="tabelle-wrap"><table>
      <thead><tr><th>Datum</th><th>Einrichtung</th><th>Status</th><th>Nicht geputzt</th><th>Nicht sauber</th><th>Bemerkung</th><th>Erfasst von</th></tr></thead>
      <tbody>${einzel.map((k) => `<tr class="${k.status === "mangel" ? "zeile-mangel" : ""}">
        <td>${fmtDatum(k.datum)}</td><td>${esc(k.einrichtungName)}</td>
        <td><span class="badge ${k.status}">${k.status === "mangel" ? "Mangel" : "In Ordnung"}</span></td>
        <td>${k.nichtGeputzt ? "ja" : "–"}</td><td>${k.nichtSauber ? "ja" : "–"}</td>
        <td>${esc(k.bemerkung)}</td><td>${esc(k.erfasstVonName)} ${fmtZeit(k.erfasstAm)}</td></tr>`).join("")}</tbody>
    </table></div>` : `<p class="leer">Keine Einträge für diese Auswahl.</p>`}`;

  $("#a-ergebnis").onclick = async (ev) => {
    const btn = ev.target.closest("[data-export]");
    if (!btn) return;
    const a = letzteAuswertung;
    await mitSperre(btn, async () => {
      if (btn.dataset.export === "pdf") exporter.herunterladen(await exporter.erstellePdf(a), exporter.dateiname(a, "pdf"));
      else if (btn.dataset.export === "xlsx") exporter.herunterladen(await exporter.erstelleExcel(a), exporter.dateiname(a, "xlsx"));
      else {
        const art = await exporter.perMail(a);
        if (art === "mailto") melde("PDF und Excel wurden heruntergeladen. Bitte im Mailprogramm anhängen.");
      }
    });
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
async function tabBenutzer() {
  const benutzer = await store.listBenutzer();
  const einrCheckboxen = (ausgewaehlt = []) => aktiveEinrichtungen().map((e) => `
    <label class="check"><input type="checkbox" name="einr" value="${esc(e.id)}" ${ausgewaehlt.includes(e.id) ? "checked" : ""}> ${esc(e.name)}</label>`).join("")
    || `<p class="hinweis">Erst Einrichtungen anlegen.</p>`;

  inhalt.innerHTML = `
    <h1>Benutzer</h1>
    ${benutzer.map((b) => `
      <details class="panel" data-uid="${esc(b.uid)}">
        <summary><strong>${esc(b.name)}</strong> <span class="hinweis">${esc(b.benutzername || "")}, ${b.rolle === "leitung" ? "Leitung" : "Hausmeister"}${b.aktiv === false ? ", deaktiviert" : ""}</span></summary>
        <div style="margin-top:1rem">
          ${b.rolle === "hausmeister" ? `
            <p><strong>Zuständig für</strong> <span class="hinweis">(nichts angekreuzt = alle Einrichtungen)</span></p>
            ${einrCheckboxen(b.einrichtungen || [])}` : ""}
          <label class="check"><input type="checkbox" name="aktiv" ${b.aktiv !== false ? "checked" : ""} ${b.uid === ich.uid ? "disabled" : ""}> Konto aktiv</label>
          <button type="button" class="btn btn-primaer" data-aktion="benutzer-speichern" style="margin-top:.6rem">Änderungen speichern</button>
        </div>
      </details>`).join("")}

    <form class="panel" id="b-neu">
      <h2>Benutzer anlegen</h2>
      <div class="raster">
        <div><label for="b-name">Name</label><input type="text" id="b-name" placeholder="Vor- und Nachname" required></div>
        <div><label for="b-login">Benutzername</label><input type="text" id="b-login" autocapitalize="none" pattern="[A-Za-z0-9._\\-]+" placeholder="z. B. h.mueller" required></div>
        <div><label for="b-pw">Startpasswort</label><input type="text" id="b-pw" minlength="6" required></div>
        <div><label for="b-rolle">Rolle</label><select id="b-rolle"><option value="hausmeister">Hausmeister</option><option value="leitung">Leitung</option></select></div>
      </div>
      <div id="b-einr-wahl" style="margin-top:1rem">
        <p><strong>Zuständig für</strong> <span class="hinweis">(nichts angekreuzt = alle Einrichtungen)</span></p>
        ${einrCheckboxen()}
      </div>
      <button class="btn btn-primaer" type="submit" style="margin-top:.6rem">Benutzer anlegen</button>
    </form>
    <p class="hinweis">Passwort vergessen: Der Benutzer kann es nach der Anmeldung selbst ändern. Ein vergessenes Passwort wird in der Firebase Console unter Authentication zurückgesetzt.</p>`;

  $("#b-rolle").addEventListener("change", (ev) => { $("#b-einr-wahl").hidden = ev.target.value !== "hausmeister"; });

  inhalt.onclick = async (ev) => {
    const btn = ev.target.closest("[data-aktion=benutzer-speichern]");
    if (!btn) return;
    const box = btn.closest("details");
    const daten = { aktiv: $("[name=aktiv]", box).checked };
    const haken = [...box.querySelectorAll("[name=einr]")];
    if (haken.length) daten.einrichtungen = haken.filter((h) => h.checked).map((h) => h.value);
    await mitSperre(btn, async () => {
      await store.updateBenutzer(box.dataset.uid, daten);
      melde("Benutzer gespeichert.");
    });
  };

  $("#b-neu").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const rolle = $("#b-rolle").value;
    await mitSperre(ev.submitter, async () => {
      await store.createBenutzer({
        name: $("#b-name").value.trim(),
        benutzername: $("#b-login").value.trim(),
        passwort: $("#b-pw").value,
        rolle,
        einrichtungen: rolle === "hausmeister" ? [...$("#b-einr-wahl").querySelectorAll("[name=einr]:checked")].map((h) => h.value) : []
      });
      melde("Benutzer angelegt.");
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
