// Auswertung für die Leitung: Filter, Kennzahlen, Diagramme, Export.
import * as store from "./datastore.js";
import * as exporter from "./export.js";
import { $, esc, heute, fmtDatum, fmtZeit, TYPEN, TYP_PLURAL, melde, mitSperre, zusammenfassen, artText, nachtragText } from "./hilfen.js";
import { arbeitstage, kw, kwSchluessel, kwText, kwZeitraum, kwSpanne, tageZwischen } from "./kalender.js";

const CHARTJS = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
const FARBE = { ok: "#2E7D4F", mangel: "#B3261E", offen: "#9AA4B1", blau: "#1F3A5F" };

let letzte = null;
let diagramme = [];

const iso = (d) => d.toLocaleDateString("sv-SE");
function vorlage(name) {
  const h = new Date();
  const { jahr, woche } = kw(iso(h));
  if (name === "woche") return kwZeitraum(jahr, woche);
  if (name === "vorwoche") { const v = new Date(h); v.setDate(h.getDate() - 7); const k = kw(iso(v)); return kwZeitraum(k.jahr, k.woche); }
  if (name === "monat") return { von: iso(new Date(h.getFullYear(), h.getMonth(), 1)), bis: iso(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
  if (name === "vormonat") return { von: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), bis: iso(new Date(h.getFullYear(), h.getMonth(), 0)) };
  if (name === "jahr") return { von: `${h.getFullYear()}-01-01`, bis: `${h.getFullYear()}-12-31` };
}

function kwAuswahl() {
  const optionen = [];
  const d = new Date();
  for (let i = 0; i < 30; i++) {
    const { jahr, woche } = kw(iso(d));
    const z = kwZeitraum(jahr, woche);
    optionen.push(`<option value="${z.von}|${z.bis}">KW ${String(woche).padStart(2, "0")}/${jahr} (${fmtDatum(z.von).slice(0, 6)}–${fmtDatum(z.bis).slice(0, 6)})</option>`);
    d.setDate(d.getDate() - 7);
  }
  return optionen.join("");
}

export function tabAuswertung(inhalt, { einrichtungen, ich }) {
  const start = vorlage("monat");
  inhalt.onclick = null;
  inhalt.innerHTML = `
    <h1>Auswertung</h1>
    <form class="panel" id="a-form">
      <div class="vorlagen" role="group" aria-label="Zeitraum schnell wählen">
        <button type="button" class="btn btn-klein" data-vorlage="woche">Diese Woche</button>
        <button type="button" class="btn btn-klein" data-vorlage="vorwoche">Letzte Woche</button>
        <button type="button" class="btn btn-klein" data-vorlage="monat">Dieser Monat</button>
        <button type="button" class="btn btn-klein" data-vorlage="vormonat">Letzter Monat</button>
        <button type="button" class="btn btn-klein" data-vorlage="jahr">Dieses Jahr</button>
      </div>
      <div class="raster">
        <div><label for="a-kw">Kalenderwoche</label>
          <select id="a-kw"><option value="">– wählen –</option>${kwAuswahl()}</select></div>
        <div><label for="a-von">Von</label><input type="date" id="a-von" value="${start.von}" required></div>
        <div><label for="a-bis">Bis</label><input type="date" id="a-bis" value="${start.bis}" required></div>
      </div>
      <fieldset class="einr-wahl">
        <legend>Einrichtungen</legend>
        <div class="vorlagen">
          <button type="button" class="btn btn-klein" data-wahl="alle">Alle</button>
          ${TYPEN.map((t) => `<button type="button" class="btn btn-klein" data-wahl="${t}">Nur ${TYP_PLURAL[t]}</button>`).join("")}
          <button type="button" class="btn btn-klein" data-wahl="keine">Keine</button>
        </div>
        <div class="einr-spalten">
          ${TYPEN.map((t) => {
            const liste = einrichtungen.filter((e) => e.typ === t);
            if (!liste.length) return "";
            return `<div><p class="einr-gruppe">${TYP_PLURAL[t]}</p>${liste.map((e) => `
              <label class="check"><input type="checkbox" name="einr" value="${esc(e.id)}" data-typ="${t}" ${e.aktiv !== false ? "checked" : ""}> ${esc(e.name)}${e.aktiv === false ? ' <span class="hinweis">(inaktiv)</span>' : ""}</label>`).join("")}</div>`;
          }).join("")}
        </div>
      </fieldset>
      <label class="check" style="margin-top:.8rem"><input type="checkbox" id="a-nur-maengel"> In den Einzelkontrollen nur Mängel aufführen</label>
      <button class="btn btn-primaer" type="submit" style="margin-top:.6rem">Auswertung anzeigen</button>
    </form>
    <div id="a-ergebnis"></div>`;

  const form = $("#a-form");
  const haken = () => [...form.querySelectorAll("[name=einr]")];
  form.addEventListener("click", (ev) => {
    const w = ev.target.closest("[data-wahl]");
    if (w) {
      const wahl = w.dataset.wahl;
      haken().forEach((h) => { h.checked = wahl === "alle" ? true : wahl === "keine" ? false : h.dataset.typ === wahl; });
      if (wahl !== "keine") form.requestSubmit();
      return;
    }
    const b = ev.target.closest("[data-vorlage]");
    if (!b) return;
    const z = vorlage(b.dataset.vorlage);
    $("#a-von").value = z.von; $("#a-bis").value = z.bis; $("#a-kw").value = "";
    form.requestSubmit();
  });
  $("#a-kw").addEventListener("change", (ev) => {
    if (!ev.target.value) return;
    const [von, bis] = ev.target.value.split("|");
    $("#a-von").value = von; $("#a-bis").value = bis;
    form.requestSubmit();
  });
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await mitSperre(ev.submitter, () => berechne(einrichtungen, ich));
  });
  form.requestSubmit();
}

async function berechne(einrichtungen, ich) {
  const von = $("#a-von").value, bis = $("#a-bis").value;
  if (von > bis) throw new Error("„Von“ liegt nach „Bis“.");
  const nurMaengel = $("#a-nur-maengel").checked;
  const gewaehlt = new Set([...document.querySelectorAll("#a-form [name=einr]:checked")].map((h) => h.value));
  if (!gewaehlt.size) throw new Error("Bitte mindestens eine Einrichtung auswählen.");

  const relevant = einrichtungen.filter((e) => gewaehlt.has(e.id));
  const ids = new Set(relevant.map((e) => e.id));
  const kontrollen = (await store.kontrollenZeitraum(von, bis))
    .filter((k) => ids.has(k.einrichtungId))
    .map((k) => ({ ...k, z: zusammenfassen(k) }))
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.einrichtungName.localeCompare(b.einrichtungName, "de"));

  // Je Einrichtung: Soll = Arbeitstage (ohne Wochenende, Feiertage, bei Grundschulen ohne Ferien)
  // Zukünftige Tage zählen nicht als "ohne Eintrag"
  const sollBis = bis < heute() ? bis : heute();
  const sollJe = Object.fromEntries(relevant.map((e) => [e.id, new Set(von <= sollBis ? arbeitstage(von, sollBis, e.typ) : [])]));
  const uebersicht = relevant.map((e) => {
    const ks = kontrollen.filter((k) => k.einrichtungId === e.id);
    const tage = new Set(ks.map((k) => k.datum));
    const soll = sollJe[e.id];
    return {
      id: e.id, name: e.name, typ: e.typ,
      soll: soll.size,
      kontrollen: ks.length,
      ok: ks.filter((k) => k.z.status === "ok").length,
      mangel: ks.filter((k) => k.z.status === "mangel").length,
      ohneEintrag: [...soll].filter((t) => !tage.has(t)).length
    };
  });

  // Je Kalenderwoche
  const wochen = new Map();
  for (const t of tageZwischen(von, bis)) {
    const s = kwSchluessel(t);
    if (!wochen.has(s)) wochen.set(s, { kw: kwText(t), von: t, bis: t, soll: 0, kontrollen: 0, ok: 0, mangel: 0, ohneEintrag: 0 });
    const w = wochen.get(s);
    w.bis = t;
    for (const e of relevant) {
      if (!sollJe[e.id].has(t)) continue;
      w.soll++;
      if (!kontrollen.some((k) => k.einrichtungId === e.id && k.datum === t)) w.ohneEintrag++;
    }
  }
  for (const k of kontrollen) {
    const w = wochen.get(kwSchluessel(k.datum));
    w.kontrollen++;
    k.z.status === "mangel" ? w.mangel++ : w.ok++;
  }
  const nachKw = [...wochen.values()];

  // Mängel nach Bereich
  const bereiche = {};
  for (const k of kontrollen) if (k.z.status === "mangel") for (const b of k.z.bereiche) bereiche[b] = (bereiche[b] || 0) + 1;
  const nachBereich = Object.entries(bereiche).sort((a, b) => b[1] - a[1]).map(([bereich, anzahl]) => ({ bereich, anzahl }));

  const einzel = (nurMaengel ? kontrollen.filter((k) => k.z.status === "mangel") : kontrollen).map((k) => ({
    kw: kwText(k.datum), datum: k.datum, einrichtungName: k.einrichtungName, einrichtungTyp: k.einrichtungTyp,
    status: k.z.status, art: artText(k.z), bereiche: k.z.bereiche.join(", "), bemerkung: k.z.bemerkung,
    nachtraege: k.z.nachtraege.map(nachtragText).join(" | "), erfasstVon: k.erfasstVonName || "", uhrzeit: fmtZeit(k.erfasstAm)
  }));

  const aktive = einrichtungen.filter((e) => e.aktiv !== false);
  const alleVon = (liste) => liste.length && liste.every((e) => gewaehlt.has(e.id)) && relevant.length === liste.length;
  let auswahl;
  if (alleVon(aktive)) auswahl = "alle Einrichtungen";
  else if (TYPEN.some((t) => alleVon(aktive.filter((e) => e.typ === t)))) auswahl = "alle " + TYP_PLURAL[relevant[0].typ];
  else if (relevant.length <= 3) auswahl = relevant.map((e) => e.name).join(", ");
  else auswahl = `${relevant.length} ausgewählte Einrichtungen`;
  const filterTeile = [auswahl];
  if (nurMaengel) filterTeile.push("Einzelkontrollen nur Mängel");
  letzte = { von, bis, kwSpanne: kwSpanne(von, bis), filterText: filterTeile.join(", "), erstelltVon: ich.name, uebersicht, nachKw, nachBereich, einzel };

  const s = uebersicht.reduce((a, z) => ({ soll: a.soll + z.soll, k: a.k + z.kontrollen, m: a.m + z.mangel, o: a.o + z.ohneEintrag }), { soll: 0, k: 0, m: 0, o: 0 });
  const quote = s.k ? Math.round((s.m / s.k) * 100) : 0;

  $("#a-ergebnis").innerHTML = `
    <div class="export-leiste">
      <button class="btn btn-primaer" type="button" data-export="pdf">PDF herunterladen</button>
      <button class="btn" type="button" data-export="xlsx">Excel herunterladen</button>
      <button class="btn" type="button" data-export="mail">Per Mail senden</button>
    </div>
    <p class="kw">${esc(letzte.kwSpanne)} · ${fmtDatum(von)} bis ${fmtDatum(bis)}</p>
    <div class="zaehler">
      <span><strong>${s.k}</strong>Kontrollen</span>
      <span class="z-mangel"><strong>${s.m}</strong>mit Mangel (${quote} %)</span>
      <span class="z-offen"><strong>${s.o}</strong>von ${s.soll} Arbeitstagen ohne Eintrag</span>
    </div>
    <p class="hinweis">Wochenenden, Feiertage und bei Grundschulen die saarländischen Schulferien zählen nicht als Arbeitstage. Einträge an solchen Tagen werden trotzdem aufgeführt.</p>

    <div class="diagramme">
      ${relevant.length > 1 ? `<figure class="panel"><figcaption>Kontrollen je Einrichtung</figcaption><div class="d-box"><canvas id="d-einr"></canvas></div></figure>` : ""}
      <figure class="panel"><figcaption>Verlauf nach Kalenderwoche</figcaption><div class="d-box"><canvas id="d-kw"></canvas></div></figure>
      <figure class="panel"><figcaption>Mängel nach Bereich</figcaption><div class="d-box">${nachBereich.length ? `<canvas id="d-bereich"></canvas>` : `<p class="leer">Keine Mängel im Zeitraum.</p>`}</div></figure>
    </div>

    <h2>Übersicht je Einrichtung</h2>
    ${relevant.length > 1 ? `<p class="hinweis">Auf einen Namen klicken, um nur diese Einrichtung auszuwerten.</p>` : ""}
    <div class="tabelle-wrap"><table>
      <thead><tr><th>Einrichtung</th><th>Art</th><th class="zahl">Arbeitstage</th><th class="zahl">Kontrollen</th><th class="zahl">In Ordnung</th><th class="zahl">Mängel</th><th class="zahl">Ohne Eintrag</th></tr></thead>
      <tbody>${uebersicht.map((z) => `<tr class="${z.mangel ? "zeile-mangel" : ""}">
        <td>${relevant.length > 1 ? `<button type="button" class="link" data-nur="${esc(z.id)}" title="Nur diese Einrichtung auswerten">${esc(z.name)}</button>` : esc(z.name)}</td><td>${esc(z.typ)}</td><td class="zahl">${z.soll}</td><td class="zahl">${z.kontrollen}</td><td class="zahl">${z.ok}</td>
        <td class="zahl">${z.mangel}</td><td class="zahl">${z.ohneEintrag}</td></tr>`).join("")}</tbody>
    </table></div>

    <h2 style="margin-top:1.6rem">Übersicht nach Kalenderwoche</h2>
    <div class="tabelle-wrap"><table>
      <thead><tr><th>KW</th><th>Zeitraum</th><th class="zahl">Soll</th><th class="zahl">Kontrollen</th><th class="zahl">In Ordnung</th><th class="zahl">Mängel</th><th class="zahl">Ohne Eintrag</th></tr></thead>
      <tbody>${nachKw.map((w) => `<tr class="${w.mangel ? "zeile-mangel" : ""}">
        <td>${esc(w.kw)}</td><td>${fmtDatum(w.von)} – ${fmtDatum(w.bis)}</td><td class="zahl">${w.soll}</td><td class="zahl">${w.kontrollen}</td>
        <td class="zahl">${w.ok}</td><td class="zahl">${w.mangel}</td><td class="zahl">${w.ohneEintrag}</td></tr>`).join("")}</tbody>
    </table></div>

    <h2 style="margin-top:1.6rem">Einzelkontrollen</h2>
    ${einzel.length ? `<div class="tabelle-wrap"><table>
      <thead><tr><th>KW</th><th>Datum</th><th>Einrichtung</th><th>Status</th><th>Bereiche</th><th>Bemerkung / Nachträge</th><th>Erfasst von</th></tr></thead>
      <tbody>${einzel.map((k) => `<tr class="${k.status === "mangel" ? "zeile-mangel" : ""}">
        <td>${esc(k.kw)}</td><td>${fmtDatum(k.datum)}</td><td>${esc(k.einrichtungName)}</td>
        <td><span class="badge ${k.status}">${k.status === "mangel" ? "Mangel" : "In Ordnung"}</span>${k.art ? `<br><span class="hinweis">${esc(k.art)}</span>` : ""}</td>
        <td>${esc(k.bereiche)}</td>
        <td>${esc(k.bemerkung)}${k.nachtraege ? `<div class="hinweis">Nachtrag: ${esc(k.nachtraege)}</div>` : ""}</td>
        <td>${esc(k.erfasstVon)} ${esc(k.uhrzeit)}</td></tr>`).join("")}</tbody>
    </table></div>` : `<p class="leer">Keine Einträge für diese Auswahl.</p>`}`;

  await zeichneDiagramme(letzte);

  $("#a-ergebnis").onclick = async (ev) => {
    const nur = ev.target.closest("[data-nur]");
    if (nur) {
      document.querySelectorAll("#a-form [name=einr]").forEach((h) => { h.checked = h.value === nur.dataset.nur; });
      $("#a-form").requestSubmit();
      $("#a-form").scrollIntoView({ behavior: "smooth" });
      return;
    }
    const btn = ev.target.closest("[data-export]");
    if (!btn) return;
    const a = { ...letzte, diagramme: diagrammBilder() };
    await mitSperre(btn, async () => {
      if (btn.dataset.export === "pdf") exporter.herunterladen(await exporter.erstellePdf(a), exporter.dateiname(a, "pdf"));
      else if (btn.dataset.export === "xlsx") exporter.herunterladen(await exporter.erstelleExcel(a), exporter.dateiname(a, "xlsx"));
      else if ((await exporter.perMail(a)) === "mailto") melde("PDF und Excel wurden heruntergeladen. Bitte im Mailprogramm anhängen.");
    });
  };
}

// Jedes Diagramm wird über eine Fabrik-Funktion erzeugt, damit es für den
// PDF-Export noch einmal in hoher Auflösung gezeichnet werden kann.
let vorlagen = [];

function diagrammVorlagen(a) {
  const basis = { maintainAspectRatio: false, animation: false, plugins: { legend: { position: "bottom" } } };
  const v = [];
  if (a.uebersicht.length > 1) v.push({
    titel: "Kontrollen je Einrichtung", canvas: "#d-einr", hoehe: Math.max(260, a.uebersicht.length * 38 + 90),
    config: () => ({
      type: "bar",
      data: {
        labels: a.uebersicht.map((z) => z.name),
        datasets: [
          { label: "In Ordnung", data: a.uebersicht.map((z) => z.ok), backgroundColor: FARBE.ok },
          { label: "Mangel", data: a.uebersicht.map((z) => z.mangel), backgroundColor: FARBE.mangel },
          { label: "Ohne Eintrag", data: a.uebersicht.map((z) => z.ohneEintrag), backgroundColor: FARBE.offen }
        ]
      },
      options: { ...basis, indexAxis: "y", scales: { x: { stacked: true, grace: "5%", ticks: { precision: 0 } }, y: { stacked: true } } }
    })
  });
  v.push({
    titel: "Verlauf nach Kalenderwoche", canvas: "#d-kw", hoehe: 320,
    config: () => ({
      type: "bar",
      data: {
        labels: a.nachKw.map((w) => w.kw),
        datasets: [
          { label: "In Ordnung", data: a.nachKw.map((w) => w.ok), backgroundColor: FARBE.ok },
          { label: "Mangel", data: a.nachKw.map((w) => w.mangel), backgroundColor: FARBE.mangel },
          { label: "Ohne Eintrag", data: a.nachKw.map((w) => w.ohneEintrag), backgroundColor: FARBE.offen }
        ]
      },
      options: { ...basis, scales: { x: { stacked: true }, y: { stacked: true, grace: "8%", ticks: { precision: 0 } } } }
    })
  });
  if (a.nachBereich.length) v.push({
    titel: "Mängel nach Bereich", canvas: "#d-bereich", hoehe: 320,
    config: () => ({
      type: "bar",
      data: { labels: a.nachBereich.map((b) => b.bereich), datasets: [{ label: "Mängel", data: a.nachBereich.map((b) => b.anzahl), backgroundColor: FARBE.mangel }] },
      options: { ...basis, plugins: { legend: { display: false } }, scales: { y: { grace: "8%", ticks: { precision: 0 } } } }
    })
  });
  return v;
}

async function zeichneDiagramme(a) {
  diagramme.forEach((d) => d.destroy());
  diagramme = [];
  vorlagen = [];
  try { await exporter.ladeSkript(CHARTJS); }
  catch { document.querySelectorAll(".d-box").forEach((b) => (b.innerHTML = `<p class="leer">Diagramme konnten nicht geladen werden.</p>`)); return; }
  const Chart = window.Chart;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = "#3A4555";
  vorlagen = diagrammVorlagen(a);
  for (const v of vorlagen) {
    const c = $(v.canvas);
    if (!c) continue;
    c.parentElement.style.height = v.hoehe + "px";
    const cfg = v.config();
    cfg.options.responsive = true;
    diagramme.push(new Chart(c, cfg));
  }
}

/** Zeichnet jedes Diagramm unsichtbar in fester Größe und dreifacher Auflösung (scharf im PDF). */
function diagrammBilder() {
  const Chart = window.Chart;
  if (!Chart || !vorlagen.length) return [];
  const ablage = document.createElement("div");
  ablage.style.cssText = "position:fixed;left:-10000px;top:0;";
  document.body.appendChild(ablage);
  const breite = 760;
  const bilder = vorlagen.map((v) => {
    const hoehe = Math.min(v.hoehe, 520);
    const canvas = document.createElement("canvas");
    canvas.style.width = breite + "px";
    canvas.style.height = hoehe + "px";
    canvas.width = breite; canvas.height = hoehe;
    ablage.appendChild(canvas);
    const cfg = v.config();
    cfg.options.responsive = false;
    cfg.options.devicePixelRatio = 3;
    const ch = new Chart(canvas, cfg);
    const bild = ch.toBase64Image("image/png", 1);
    ch.destroy();
    return { titel: v.titel, bild, breite, hoehe };
  });
  ablage.remove();
  return bilder;
}
