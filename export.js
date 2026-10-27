// PDF- und Excel-Export der Auswertung. Bibliotheken werden erst beim
// ersten Export nachgeladen, damit die Seite für Hausmeister schnell bleibt.

const LIBS = {
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  autotable: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
  xlsx: "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
};
const geladen = {};
function ladeSkript(url) {
  if (!geladen[url]) {
    geladen[url] = new Promise((ok, fehler) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = ok;
      s.onerror = () => fehler(new Error("Export-Bibliothek konnte nicht geladen werden."));
      document.head.appendChild(s);
    });
  }
  return geladen[url];
}

const fmtDatum = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
const fmtZeit = (iso) => iso ? new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "";
const jaNein = (b) => (b ? "ja" : "–");
const statusText = (s) => (s === "mangel" ? "Mangel" : "In Ordnung");

export function dateiname(a, endung) {
  return `Reinigungskontrolle_${a.von}_bis_${a.bis}.${endung}`;
}

/**
 * a = { von, bis, filterText, erstelltVon, uebersicht: [...], einzel: [...] }
 * uebersicht-Zeile: { name, typ, kontrollen, ok, mangel, ohneEintrag }
 * einzel-Zeile: Kontrolle aus der Datenbank
 */
export async function erstellePdf(a) {
  await ladeSkript(LIBS.jspdf);
  await ladeSkript(LIBS.autotable);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const blau = [31, 58, 95];
  const rot = [179, 38, 30];

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(...blau);
  pdf.text("Reinigungskontrolle Grundschulen und Kitas", 14, 16);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(60);
  pdf.text("Kreisstadt Merzig", 14, 22);
  pdf.text(`Zeitraum: ${fmtDatum(a.von)} bis ${fmtDatum(a.bis)}`, 14, 29);
  pdf.text(`Filter: ${a.filterText}`, 14, 34);
  pdf.text(`Erstellt am ${new Date().toLocaleString("de-DE")} von ${a.erstelltVon}`, 14, 39);

  const sum = a.uebersicht.reduce((s, z) => ({ k: s.k + z.kontrollen, m: s.m + z.mangel, o: s.o + z.ohneEintrag }), { k: 0, m: 0, o: 0 });
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(30);
  pdf.text(`${sum.k} Kontrollen, davon ${sum.m} mit Mangel. ${sum.o} Werktage ohne Eintrag.`, 14, 46);

  pdf.autoTable({
    startY: 51,
    head: [["Einrichtung", "Art", "Kontrollen", "In Ordnung", "Mängel", "Mängelquote", "Werktage ohne Eintrag"]],
    body: a.uebersicht.map((z) => [
      z.name, z.typ, z.kontrollen, z.ok, z.mangel,
      z.kontrollen ? Math.round((z.mangel / z.kontrollen) * 100) + " %" : "–",
      z.ohneEintrag
    ]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: blau },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    didParseCell: (d) => {
      if (d.section === "head" && d.column.index >= 2) d.cell.styles.halign = "right";
      if (d.section === "body" && d.column.index === 4 && Number(d.cell.raw) > 0) {
        d.cell.styles.textColor = rot; d.cell.styles.fontStyle = "bold";
      }
    }
  });

  let y = pdf.lastAutoTable.finalY + 10;
  if (y > 180) { pdf.addPage(); y = 16; }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(...blau);
  pdf.text("Einzelkontrollen", 14, y);

  pdf.autoTable({
    startY: y + 4,
    head: [["Datum", "Einrichtung", "Status", "Nicht geputzt", "Nicht sauber", "Bemerkung", "Erfasst von", "Uhrzeit"]],
    body: a.einzel.map((k) => [
      fmtDatum(k.datum), k.einrichtungName, statusText(k.status),
      jaNein(k.nichtGeputzt), jaNein(k.nichtSauber), k.bemerkung || "", k.erfasstVonName || "", fmtZeit(k.erfasstAm)
    ]),
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8, overflow: "linebreak" },
    headStyles: { fillColor: blau },
    columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 50 }, 2: { cellWidth: 22 }, 3: { cellWidth: 22 }, 4: { cellWidth: 22 }, 5: { cellWidth: "auto" }, 6: { cellWidth: 32 }, 7: { cellWidth: 16 } },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 2 && d.cell.raw === "Mangel") {
        d.cell.styles.textColor = rot; d.cell.styles.fontStyle = "bold";
      }
    }
  });

  const seiten = pdf.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(`Seite ${i} von ${seiten}`, 283, 203, { align: "right" });
    pdf.text("Kreisstadt Merzig – Reinigungskontrolle", 14, 203);
  }
  return pdf.output("blob");
}

export async function erstelleExcel(a) {
  await ladeSkript(LIBS.xlsx);
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  const kopf = [
    ["Reinigungskontrolle Grundschulen und Kitas – Kreisstadt Merzig"],
    [`Zeitraum: ${fmtDatum(a.von)} bis ${fmtDatum(a.bis)}`],
    [`Filter: ${a.filterText}`],
    [`Erstellt am ${new Date().toLocaleString("de-DE")} von ${a.erstelltVon}`],
    []
  ];
  const ueb = XLSX.utils.aoa_to_sheet([
    ...kopf,
    ["Einrichtung", "Art", "Kontrollen", "In Ordnung", "Mängel", "Mängelquote", "Werktage ohne Eintrag"],
    ...a.uebersicht.map((z) => [z.name, z.typ, z.kontrollen, z.ok, z.mangel, z.kontrollen ? z.mangel / z.kontrollen : null, z.ohneEintrag])
  ]);
  ueb["!cols"] = [{ wch: 40 }, { wch: 14 }, { wch: 11 }, { wch: 11 }, { wch: 9 }, { wch: 12 }, { wch: 22 }];
  const start = kopf.length + 1; // 0-basierte Zeile der ersten Datenzeile (nach Kopfblock + Spaltenüberschrift)
  for (let r = 0; r < a.uebersicht.length; r++) {
    const zelle = ueb[XLSX.utils.encode_cell({ r: start + r, c: 5 })];
    if (zelle && typeof zelle.v === "number") zelle.z = "0%";
  }
  ueb["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: kopf.length, c: 0 }, e: { r: kopf.length + a.uebersicht.length, c: 6 } }) };
  XLSX.utils.book_append_sheet(wb, ueb, "Übersicht");

  const einzel = XLSX.utils.aoa_to_sheet([
    ["Datum", "Einrichtung", "Art", "Status", "Nicht geputzt", "Nicht sauber", "Bemerkung", "Erfasst von", "Uhrzeit"],
    ...a.einzel.map((k) => [
      fmtDatum(k.datum), k.einrichtungName, k.einrichtungTyp, statusText(k.status),
      k.nichtGeputzt ? "ja" : "nein", k.nichtSauber ? "ja" : "nein", k.bemerkung || "", k.erfasstVonName || "", fmtZeit(k.erfasstAm)
    ])
  ]);
  einzel["!cols"] = [{ wch: 11 }, { wch: 40 }, { wch: 14 }, { wch: 11 }, { wch: 13 }, { wch: 12 }, { wch: 50 }, { wch: 22 }, { wch: 8 }];
  einzel["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: a.einzel.length, c: 8 } }) };
  XLSX.utils.book_append_sheet(wb, einzel, "Einzelkontrollen");

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
 * Sonst werden beide Dateien heruntergeladen und das Mailprogramm geöffnet –
 * die Dateien müssen dann selbst angehängt werden.
 * Rückgabe: "geteilt" | "mailto" | "abgebrochen"
 */
export async function perMail(a) {
  const [pdfBlob, xlsxBlob] = await Promise.all([erstellePdf(a), erstelleExcel(a)]);
  const dateien = [
    new File([pdfBlob], dateiname(a, "pdf"), { type: "application/pdf" }),
    new File([xlsxBlob], dateiname(a, "xlsx"), { type: xlsxBlob.type })
  ];
  const betreff = `Reinigungskontrolle ${fmtDatum(a.von)} bis ${fmtDatum(a.bis)}`;
  const text = `Hallo,\n\nanbei die Auswertung der Reinigungskontrolle für den Zeitraum ${fmtDatum(a.von)} bis ${fmtDatum(a.bis)} (${a.filterText}).\n\nViele Grüße\n${a.erstelltVon}`;

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
  const body = text.replace("anbei", "im Anhang");
  window.location.href = `mailto:?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(body)}`;
  return "mailto";
}
