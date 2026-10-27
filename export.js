// PDF- und Excel-Export der Auswertung. Bibliotheken werden erst beim
// ersten Export nachgeladen, damit die Seite für Hausmeister schnell bleibt.

const LIBS = {
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  autotable: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
  xlsx: "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
};
const geladen = {};
export function ladeSkript(url) {
  if (!geladen[url]) {
    geladen[url] = new Promise((ok, fehler) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = ok;
      s.onerror = () => { delete geladen[url]; fehler(new Error("Bibliothek konnte nicht geladen werden. Internetverbindung prüfen.")); };
      document.head.appendChild(s);
    });
  }
  return geladen[url];
}

const fmtDatum = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
const statusText = (s) => (s === "mangel" ? "Mangel" : "In Ordnung");
const TITEL = "Reinigungskontrolle Grundschulen und Kitas";
const STADT = "Kreisstadt Merzig";

let logoCache;
async function ladeLogo() {
  if (logoCache !== undefined) return logoCache;
  try {
    const antwort = await fetch("logo.png");
    if (!antwort.ok) throw new Error();
    const daten = await new Promise((ok, fehler) => {
      const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fehler;
      antwort.blob().then((b) => r.readAsDataURL(b));
    });
    const bild = await new Promise((ok, fehler) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fehler; i.src = daten; });
    logoCache = { daten, verhaeltnis: bild.naturalWidth / bild.naturalHeight };
  } catch { logoCache = null; }
  return logoCache;
}

export function dateiname(a, endung, praefix = "Reinigungskontrolle") {
  const einr = a.einrichtungsNamen?.length === 1 ? "_" + a.einrichtungsNamen[0].replace(/[^A-Za-zÄÖÜäöüß0-9]+/g, "-") : "";
  return `${praefix}${einr}_${a.von}_bis_${a.bis}.${endung}`;
}

const summe = (a) => a.uebersicht.reduce((s, z) => ({ soll: s.soll + z.soll, k: s.k + z.kontrollen, m: s.m + z.mangel, o: s.o + z.ohneEintrag }), { soll: 0, k: 0, m: 0, o: 0 });

/**
 * a = { von, bis, kwSpanne, filterText, erstelltVon, uebersicht[], nachKw[], nachBereich[], einzel[], diagramme[] }
 */
export async function erstellePdf(a) {
  await ladeSkript(LIBS.jspdf);
  await ladeSkript(LIBS.autotable);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const blau = [31, 58, 95];
  const rot = [179, 38, 30];
  const breite = 297, rand = 14;
  const s = summe(a);

  // Kopf (mit Logo rechts oben, falls logo.png vorhanden)
  const logo = await ladeLogo();
  let kwX = breite - rand;
  if (logo) {
    const h = 16, w = h * logo.verhaeltnis;
    pdf.addImage(logo.daten, "PNG", breite - rand - w, 8, w, h);
    kwX = breite - rand - w - 6;
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(...blau);
  pdf.text(TITEL, rand, 16);
  pdf.setFontSize(11);
  pdf.text(a.kwSpanne, kwX, 16, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(60);
  pdf.text(STADT, rand, 22);
  pdf.text(`Zeitraum: ${fmtDatum(a.von)} bis ${fmtDatum(a.bis)} (${a.kwSpanne})`, rand, 29);
  pdf.text(`Filter: ${a.filterText}`, rand, 34);
  pdf.text(`Erstellt am ${new Date().toLocaleString("de-DE")} von ${a.erstelltVon}`, rand, 39);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(30);
  pdf.text(`${s.k} Kontrollen, davon ${s.m} mit Mangel. ${s.o} von ${s.soll} Arbeitstagen ohne Eintrag.`, rand, 46);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(110);
  pdf.text("Arbeitstage ohne Wochenenden und Feiertage; bei Grundschulen zusätzlich ohne saarländische Schulferien.", rand, 51);

  const zahlRechts = (ab) => ({
    didParseCell: (d) => { if (d.column.index >= ab) d.cell.styles.halign = "right"; }
  });
  const mangelRot = (spalte) => (d) => {
    if (d.section === "body" && d.column.index === spalte && Number(d.cell.raw) > 0) { d.cell.styles.textColor = rot; d.cell.styles.fontStyle = "bold"; }
  };

  pdf.autoTable({
    startY: 55,
    head: [["Einrichtung", "Art", "Arbeitstage", "Kontrollen", "In Ordnung", "Mängel", "Mängelquote", "Ohne Eintrag"]],
    body: a.uebersicht.map((z) => [z.name, z.typ, z.soll, z.kontrollen, z.ok, z.mangel, z.kontrollen ? Math.round((z.mangel / z.kontrollen) * 100) + " %" : "–", z.ohneEintrag]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: blau },
    didParseCell: (d) => { zahlRechts(2).didParseCell(d); mangelRot(5)(d); }
  });

  let y = pdf.lastAutoTable.finalY + 9;
  if (y > 170) { pdf.addPage(); y = 16; }
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(...blau);
  pdf.text("Übersicht nach Kalenderwoche", rand, y);
  pdf.autoTable({
    startY: y + 3,
    head: [["KW", "Zeitraum", "Soll", "Kontrollen", "In Ordnung", "Mängel", "Ohne Eintrag"]],
    body: a.nachKw.map((w) => [w.kw, `${fmtDatum(w.von)} – ${fmtDatum(w.bis)}`, w.soll, w.kontrollen, w.ok, w.mangel, w.ohneEintrag]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: blau },
    didParseCell: (d) => { zahlRechts(2).didParseCell(d); mangelRot(5)(d); }
  });

  // Diagramme: eigene Seite, zwei nebeneinander
  if (a.diagramme?.length) {
    pdf.addPage();
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.setTextColor(...blau);
    pdf.text("Diagramme", rand, 16);
    const anzahl = Math.min(2, a.diagramme.length);
    const spalte = (breite - 2 * rand - 8 * (anzahl - 1)) / anzahl;
    let x = rand, yy = 26, zeilenHoehe = 0, nr = 0;
    for (const d of a.diagramme) {
      const h = Math.min(72, spalte * (d.hoehe / d.breite));
      if (yy + h + 8 > 198) { pdf.addPage(); yy = 16; x = rand; nr = 0; }
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(40);
      pdf.text(d.titel, x, yy);
      pdf.addImage(d.bild, "PNG", x, yy + 3, spalte, h);
      zeilenHoehe = Math.max(zeilenHoehe, h + 10);
      nr++;
      if (nr % anzahl) x += spalte + 8;
      else { x = rand; yy += zeilenHoehe + 4; zeilenHoehe = 0; }
    }
  }

  // Einzelkontrollen
  pdf.addPage();
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(...blau);
  pdf.text("Einzelkontrollen", rand, 16);
  pdf.autoTable({
    startY: 20,
    head: [["KW", "Datum", "Einrichtung", "Status", "Art", "Bereiche", "Bemerkung / Nachträge", "Erfasst von"]],
    body: a.einzel.map((k) => [
      k.kw.replace("KW ", ""), fmtDatum(k.datum), k.einrichtungName, statusText(k.status), k.art, k.bereiche,
      [k.bemerkung, k.nachtraege && "Nachtrag: " + k.nachtraege].filter(Boolean).join("\n"),
      `${k.erfasstVon} ${k.uhrzeit}`
    ]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.6, overflow: "linebreak" },
    headStyles: { fillColor: blau },
    columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 20 }, 2: { cellWidth: 44 }, 3: { cellWidth: 20 }, 4: { cellWidth: 28 }, 5: { cellWidth: 40 }, 6: { cellWidth: "auto" }, 7: { cellWidth: 30 } },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 3 && d.cell.raw === "Mangel") { d.cell.styles.textColor = rot; d.cell.styles.fontStyle = "bold"; }
    }
  });
  if (!a.einzel.length) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.text("Keine Einträge für diese Auswahl.", rand, pdf.lastAutoTable.finalY + 8); }

  // Fußzeile
  const seiten = pdf.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(120);
    pdf.text(`${STADT} – Reinigungskontrolle – ${a.kwSpanne}`, rand, 203);
    pdf.text(`Seite ${i} von ${seiten}`, breite - rand, 203, { align: "right" });
  }
  return pdf.output("blob");
}

export async function erstelleExcel(a) {
  await ladeSkript(LIBS.xlsx);
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const kopf = [
    [`${TITEL} – ${STADT}`],
    [`Zeitraum: ${fmtDatum(a.von)} bis ${fmtDatum(a.bis)} (${a.kwSpanne})`],
    [`Filter: ${a.filterText}`],
    [`Erstellt am ${new Date().toLocaleString("de-DE")} von ${a.erstelltVon}`],
    []
  ];
  const blatt = (zeilen, breiten, mitKopf = true) => {
    const ws = XLSX.utils.aoa_to_sheet(mitKopf ? [...kopf, ...zeilen] : zeilen);
    ws["!cols"] = breiten.map((wch) => ({ wch }));
    const start = mitKopf ? kopf.length : 0;
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: start, c: 0 }, e: { r: start + zeilen.length - 1, c: breiten.length - 1 } }) };
    return ws;
  };

  const ueb = blatt([
    ["Einrichtung", "Art", "Arbeitstage", "Kontrollen", "In Ordnung", "Mängel", "Mängelquote", "Ohne Eintrag"],
    ...a.uebersicht.map((z) => [z.name, z.typ, z.soll, z.kontrollen, z.ok, z.mangel, z.kontrollen ? z.mangel / z.kontrollen : null, z.ohneEintrag])
  ], [40, 14, 12, 11, 11, 9, 12, 13]);
  for (let r = 0; r < a.uebersicht.length; r++) {
    const zelle = ueb[XLSX.utils.encode_cell({ r: kopf.length + 1 + r, c: 6 })];
    if (zelle && typeof zelle.v === "number") zelle.z = "0%";
  }
  XLSX.utils.book_append_sheet(wb, ueb, "Übersicht");

  XLSX.utils.book_append_sheet(wb, blatt([
    ["KW", "Von", "Bis", "Soll", "Kontrollen", "In Ordnung", "Mängel", "Ohne Eintrag"],
    ...a.nachKw.map((w) => [w.kw, fmtDatum(w.von), fmtDatum(w.bis), w.soll, w.kontrollen, w.ok, w.mangel, w.ohneEintrag])
  ], [12, 11, 11, 8, 11, 11, 9, 13]), "Nach KW");

  XLSX.utils.book_append_sheet(wb, blatt([
    ["KW", "Datum", "Einrichtung", "Art der Einrichtung", "Status", "Mangel", "Bereiche", "Bemerkung", "Nachträge", "Erfasst von", "Uhrzeit"],
    ...a.einzel.map((k) => [k.kw, fmtDatum(k.datum), k.einrichtungName, k.einrichtungTyp, statusText(k.status), k.art, k.bereiche, k.bemerkung, k.nachtraege, k.erfasstVon, k.uhrzeit])
  ], [12, 11, 36, 16, 11, 26, 40, 40, 50, 22, 8], false), "Einzelkontrollen");

  XLSX.utils.book_append_sheet(wb, blatt([
    ["Bereich", "Anzahl Mängel"],
    ...a.nachBereich.map((b) => [b.bereich, b.anzahl])
  ], [30, 15]), "Mängel nach Bereich");

  const daten = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([daten], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function herunterladen(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Versand per Mail. Wo der Browser Dateien teilen kann (Handy, Edge/Chrome
 * unter Windows), öffnet sich der Teilen-Dialog mit PDF + Excel im Anhang.
 * Sonst werden beide Dateien heruntergeladen und das Mailprogramm geöffnet.
 * Rückgabe: "geteilt" | "mailto" | "abgebrochen"
 */
export async function perMail(a) {
  const [pdfBlob, xlsxBlob] = await Promise.all([erstellePdf(a), erstelleExcel(a)]);
  const dateien = [
    new File([pdfBlob], dateiname(a, "pdf"), { type: "application/pdf" }),
    new File([xlsxBlob], dateiname(a, "xlsx"), { type: xlsxBlob.type })
  ];
  const betreff = `Reinigungskontrolle ${a.kwSpanne} (${fmtDatum(a.von)} bis ${fmtDatum(a.bis)})`;
  const text = `Hallo,\n\nanbei die Auswertung der Reinigungskontrolle für ${a.kwSpanne} (${fmtDatum(a.von)} bis ${fmtDatum(a.bis)}, ${a.filterText}).\n\nViele Grüße\n${a.erstelltVon}`;

  if (navigator.canShare && navigator.canShare({ files: dateien })) {
    try {
      await navigator.share({ files: dateien, title: betreff, text });
      return "geteilt";
    } catch (e) {
      if (e.name === "AbortError") return "abgebrochen";
    }
  }
  herunterladen(pdfBlob, dateien[0].name);
  herunterladen(xlsxBlob, dateien[1].name);
  window.location.href = `mailto:?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text.replace("anbei", "im Anhang"))}`;
  return "mailto";
}

// ============================================================
// Mängelbericht für externe Dienstleister (z. B. Reinigungsfirma)
// Nur Mängel, keine internen Kennzahlen, keine Mitarbeiternamen.
// ============================================================
const wochentagKurz = (iso) => new Date(iso + "T12:00").toLocaleDateString("de-DE", { weekday: "short" });

export async function erstelleMaengelbericht(a) {
  await ladeSkript(LIBS.jspdf);
  await ladeSkript(LIBS.autotable);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const blau = [31, 58, 95], rot = [179, 38, 30];
  const breite = 210, rand = 16;
  const logo = await ladeLogo();
  if (logo) { const h = 18, w = h * logo.verhaeltnis; pdf.addImage(logo.daten, "PNG", breite - rand - w, 10, w, h); }

  pdf.setFont("helvetica", "bold"); pdf.setFontSize(18); pdf.setTextColor(...blau);
  pdf.text("Mängelbericht Reinigung", rand, 20);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(70);
  pdf.text(`${STADT} – Grundschulen und Kindertagesstätten`, rand, 26);

  const einrText = a.einrichtungsNamen.length <= 4 ? a.einrichtungsNamen.join(", ") : `${a.einrichtungsNamen.length} Einrichtungen (siehe Tabelle)`;
  pdf.autoTable({
    startY: 33,
    theme: "plain",
    body: [
      ["Zeitraum", `${fmtDatum(a.von)} bis ${fmtDatum(a.bis)} (${a.kwSpanne})`],
      ["Einrichtung(en)", einrText],
      ["Erstellt am", new Date().toLocaleString("de-DE")],
      ["Ansprechpartner", `${a.erstelltVon}, ${STADT}`]
    ],
    styles: { font: "helvetica", fontSize: 10, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 } },
    margin: { left: rand, right: rand }
  });

  let y = pdf.lastAutoTable.finalY + 8;
  const tage = new Set(a.maengel.map((m) => m.datum)).size;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(30);
  pdf.text(a.maengel.length
    ? `Im Zeitraum wurden ${a.maengel.length} Mängel an ${tage} Tagen festgestellt.`
    : "Im Zeitraum wurden keine Mängel festgestellt.", rand, y);

  if (a.maengel.length) {
    // Zusammenfassung je Einrichtung
    const jeEinr = {};
    for (const m of a.maengel) {
      const e = (jeEinr[m.einrichtungName] ||= { anzahl: 0, bereiche: {} });
      e.anzahl++;
      for (const b of m.bereiche.split(", ").filter(Boolean)) e.bereiche[b] = (e.bereiche[b] || 0) + 1;
    }
    pdf.autoTable({
      startY: y + 4,
      head: [["Einrichtung", "Mängel", "Häufigste Bereiche"]],
      body: Object.entries(jeEinr).sort((x, z) => z[1].anzahl - x[1].anzahl).map(([name, e]) => [
        name, e.anzahl, Object.entries(e.bereiche).sort((x, z) => z[1] - x[1]).slice(0, 3).map(([b, n]) => `${b} (${n})`).join(", ")
      ]),
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: blau },
      columnStyles: { 1: { halign: "right", cellWidth: 18 } },
      margin: { left: rand, right: rand }
    });

    y = pdf.lastAutoTable.finalY + 10;
    if (y > 250) { pdf.addPage(); y = 20; }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(...blau);
    pdf.text("Festgestellte Mängel im Einzelnen", rand, y);

    const mitEinr = a.einrichtungsNamen.length > 1;
    const kopf = ["Datum", "KW", ...(mitEinr ? ["Einrichtung"] : []), "Festgestellt", "Bereiche", "Bemerkung / Nachträge"];
    pdf.autoTable({
      startY: y + 3,
      head: [kopf],
      body: [...a.maengel].sort((x, z) => x.einrichtungName.localeCompare(z.einrichtungName, "de") || x.datum.localeCompare(z.datum)).map((m) => [
        `${wochentagKurz(m.datum)} ${fmtDatum(m.datum)}\n${m.uhrzeit} Uhr`, m.kw.replace("KW ", ""), ...(mitEinr ? [m.einrichtungName] : []),
        m.art, m.bereiche, [m.bemerkung, m.nachtraege && "Nachtrag " + m.nachtraege].filter(Boolean).join("\n")
      ]),
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: blau },
      columnStyles: mitEinr
        ? { 0: { cellWidth: 24 }, 1: { cellWidth: 14 }, 2: { cellWidth: 34 }, 3: { cellWidth: 24, textColor: rot }, 4: { cellWidth: 30 } }
        : { 0: { cellWidth: 26 }, 1: { cellWidth: 16 }, 2: { cellWidth: 28, textColor: rot }, 3: { cellWidth: 38 } },
      margin: { left: rand, right: rand }
    });
  }

  y = (pdf.lastAutoTable?.finalY || y) + 12;
  if (y > 265) { pdf.addPage(); y = 25; }
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5); pdf.setTextColor(60);
  pdf.text(pdf.splitTextToSize("Wir bitten um Prüfung und Abstellung der aufgeführten Mängel. Bei Rückfragen wenden Sie sich bitte an den oben genannten Ansprechpartner.", breite - 2 * rand), rand, y);

  const seiten = pdf.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(120);
    pdf.text(`${STADT} – Mängelbericht Reinigung – ${a.kwSpanne}`, rand, 289);
    pdf.text(`Seite ${i} von ${seiten}`, breite - rand, 289, { align: "right" });
  }
  return pdf.output("blob");
}

export async function maengelberichtPerMail(a) {
  const blob = await erstelleMaengelbericht(a);
  const datei = new File([blob], dateiname(a, "pdf", "Maengelbericht"), { type: "application/pdf" });
  const einr = a.einrichtungsNamen.length === 1 ? a.einrichtungsNamen[0] : `${a.einrichtungsNamen.length} Einrichtungen`;
  const betreff = `Mängelbericht Reinigung ${einr} – ${a.kwSpanne}`;
  const text = `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie den Mängelbericht zur Reinigung (${einr}) für den Zeitraum ${fmtDatum(a.von)} bis ${fmtDatum(a.bis)}. Wir bitten um Prüfung und Abstellung der aufgeführten Mängel.\n\nMit freundlichen Grüßen\n${a.erstelltVon}\n${STADT}`;
  if (navigator.canShare && navigator.canShare({ files: [datei] })) {
    try { await navigator.share({ files: [datei], title: betreff, text }); return "geteilt"; }
    catch (e) { if (e.name === "AbortError") return "abgebrochen"; }
  }
  herunterladen(blob, datei.name);
  window.location.href = `mailto:?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text.replace("anbei erhalten Sie", "im Anhang erhalten Sie"))}`;
  return "mailto";
}
