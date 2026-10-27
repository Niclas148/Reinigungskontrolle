// Gemeinsame Hilfsfunktionen für alle Ansichten.

export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const heute = () => new Date().toLocaleDateString("sv-SE"); // JJJJ-MM-TT, lokale Zeit
export const fmtDatum = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
export const wochentag = (iso) => new Date(iso + "T12:00").toLocaleDateString("de-DE", { weekday: "long" });
export const fmtZeit = (iso) => (iso ? new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "");
export const TYPEN = ["Grundschule", "Kita"];
export const TYP_PLURAL = { Grundschule: "Grundschulen", Kita: "Kitas" };

// Bereiche, die bei einem Mangel angekreuzt werden können.
export const BEREICHE = {
  Grundschule: ["Toiletten", "Klassenräume", "Flure & Treppen", "Turnhalle", "Müll / Abfallbehälter", "Sonstiges"],
  Kita: ["Toiletten / Wickelraum", "Gruppenräume", "Flure & Garderobe", "Küche / Essensraum", "Müll / Abfallbehälter", "Sonstiges"]
};
export const bereicheFuer = (typ) => BEREICHE[typ] || BEREICHE.Grundschule;

let meldungTimer;
export function melde(text, fehler = false) {
  const m = $("#meldung");
  m.textContent = text;
  m.classList.toggle("fehler-meldung", fehler);
  m.classList.add("sichtbar");
  clearTimeout(meldungTimer);
  meldungTimer = setTimeout(() => m.classList.remove("sichtbar"), fehler ? 6000 : 3000);
}

export async function mitSperre(button, fn) {
  if (button) button.disabled = true;
  try { await fn(); } catch (e) { console.error(e); melde(e.message || "Speichern fehlgeschlagen.", true); }
  finally { if (button) button.disabled = false; }
}

/**
 * Fasst Erstmeldung und Nachträge einer Kontrolle zusammen.
 * Ein Mangel aus einem Nachtrag macht die ganze Kontrolle zum Mangel.
 */
export function zusammenfassen(k) {
  const n = k.nachtraege || [];
  const mangelNachtraege = n.filter((x) => x.mangel);
  return {
    status: k.status === "mangel" || mangelNachtraege.length ? "mangel" : "ok",
    nichtGeputzt: !!k.nichtGeputzt || mangelNachtraege.some((x) => x.nichtGeputzt),
    nichtSauber: !!k.nichtSauber || mangelNachtraege.some((x) => x.nichtSauber),
    bereiche: [...new Set([...(k.bereiche || []), ...mangelNachtraege.flatMap((x) => x.bereiche || [])])],
    bemerkung: k.bemerkung || "",
    nachtraege: n
  };
}

export const artText = (z) => [z.nichtGeputzt && "nicht geputzt", z.nichtSauber && "nicht sauber"].filter(Boolean).join(", ");

export function nachtragText(n, mitName = true) {
  const teile = [];
  if (n.mangel) teile.push(`Mangel nachgemeldet: ${[n.nichtGeputzt && "nicht geputzt", n.nichtSauber && "nicht sauber"].filter(Boolean).join(", ")}${n.bereiche?.length ? " (" + n.bereiche.join(", ") + ")" : ""}`);
  if (n.text) teile.push(n.text);
  return `${fmtZeit(n.zeit)} Uhr${mitName ? ", " + n.vonName : ""}: ${teile.join(" – ")}`;
}

/** Status, Bereiche, Bemerkung und Nachträge einer Kontrolle als HTML. */
export function detailsHtml(k) {
  if (!k) return `<p class="status-zeile"><span class="badge offen">Noch nicht kontrolliert</span></p>`;
  const z = zusammenfassen(k);
  const kopf = z.status === "ok"
    ? `<p class="status-zeile ok"><span class="badge ok">In Ordnung</span> erfasst ${fmtZeit(k.erfasstAm)} Uhr von ${esc(k.erfasstVonName)}</p>`
    : `<p class="status-zeile mangel"><span class="badge mangel">Mangel</span> ${esc(artText(z))}, erfasst ${fmtZeit(k.erfasstAm)} Uhr von ${esc(k.erfasstVonName)}</p>`;
  return `${kopf}
    ${z.bereiche.length ? `<p class="bereich-liste">${z.bereiche.map((b) => `<span class="chip">${esc(b)}</span>`).join("")}</p>` : ""}
    ${z.bemerkung ? `<p class="status-zeile">„${esc(z.bemerkung)}“</p>` : ""}
    ${z.nachtraege.length ? `<ul class="nachtraege">${z.nachtraege.map((n) => `<li>${esc(nachtragText(n))}</li>`).join("")}</ul>` : ""}`;
}

/** Checkboxen für Art des Mangels und Bereiche (für Erstmeldung und Nachtrag). */
export function mangelFelderHtml(typ, praefix) {
  return `
    <fieldset class="gruppe"><legend>Was ist nicht in Ordnung?</legend>
      <label class="check"><input type="checkbox" name="nichtGeputzt"> Es wurde nicht geputzt</label>
      <label class="check"><input type="checkbox" name="nichtSauber"> Es ist nicht sauber</label>
    </fieldset>
    <fieldset class="gruppe"><legend>Wo?</legend>
      <div class="bereich-raster">${bereicheFuer(typ).map((b, i) => `
        <label class="check"><input type="checkbox" name="bereich" value="${esc(b)}" id="${praefix}-b${i}"> ${esc(b)}</label>`).join("")}
      </div>
    </fieldset>`;
}

/** Liest die Mangel-Felder aus; wirft eine verständliche Meldung, wenn etwas fehlt. */
export function leseMangelFelder(form) {
  const nichtGeputzt = $("[name=nichtGeputzt]", form).checked;
  const nichtSauber = $("[name=nichtSauber]", form).checked;
  const bereiche = [...form.querySelectorAll("[name=bereich]:checked")].map((x) => x.value);
  if (!nichtGeputzt && !nichtSauber) throw new Error("Bitte ankreuzen, was nicht in Ordnung ist.");
  if (!bereiche.length) throw new Error("Bitte mindestens einen Bereich ankreuzen.");
  return { nichtGeputzt, nichtSauber, bereiche };
}
