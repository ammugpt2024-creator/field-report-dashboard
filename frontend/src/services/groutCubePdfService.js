import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";

const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;

const NAVY = [15, 23, 42];
const SLATE = [71, 85, 105];
const MUTED = [100, 116, 139];
const LINE = [203, 213, 225];
const PAGE_MARGIN = 40;

function pdfValue(value) {
  return value == null || value === "" ? "" : String(value);
}

function naValue(value) {
  return value == null || value === "" ? "N/A" : String(value);
}

function formatPdfDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
}

// One labelled value drawn as "Label: value" with an underline under the value.
function labelledValue(doc, label, value, x, y, valueX, lineEndX) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.text(pdfValue(value), valueX, y);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.5);
  doc.line(valueX, y + 3, lineEndX, y + 3);
}

export function generateGroutCubePdfBlob(report) {
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const right = pageWidth - PAGE_MARGIN;
  const mid = pageWidth / 2 + 30;

  // ── Title ──────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text("GROUT COMPRESSIVE STRENGTH TEST REPORT (ASTM  C109/C1107)", pageWidth / 2, 44, { align: "center" });

  // ── Header block (client / set / project / attention) ───────────────────────
  let y = 70;
  labelledValue(doc, "Client:", report.client, PAGE_MARGIN, y, PAGE_MARGIN + 70, mid - 20);
  labelledValue(doc, "Set Number:", report.setNumber, mid, y, mid + 90, right);
  y += 18;
  labelledValue(doc, "Project:", report.projectName, PAGE_MARGIN, y, PAGE_MARGIN + 70, mid - 20);
  labelledValue(doc, "Project Number:", report.projectNumber, mid, y, mid + 90, right);
  y += 18;
  labelledValue(doc, "Attention:", report.attention, PAGE_MARGIN, y, PAGE_MARGIN + 70, mid - 20);

  // separator
  y += 14;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.8);
  doc.line(PAGE_MARGIN, y, right, y);
  y += 22;

  // ── Sampling info ───────────────────────────────────────────────────────────
  labelledValue(doc, "Date Sampled:", report.dateSampled, PAGE_MARGIN, y, PAGE_MARGIN + 80, mid - 20);
  // Time row (Batched / Sampled / Placed)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text("Time:", mid, y);
  doc.text("Batched", mid + 36, y);
  doc.setFont("helvetica", "normal");
  doc.text(pdfValue(report.timeBatched), mid + 84, y);
  doc.setFont("helvetica", "bold");
  doc.text("Sampled", mid + 130, y);
  doc.setFont("helvetica", "normal");
  doc.text(pdfValue(report.timeSampled), mid + 176, y);
  y += 18;

  labelledValue(doc, "Sampled By:", report.sampledBy, PAGE_MARGIN, y, PAGE_MARGIN + 80, mid - 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text("Placed", mid + 36, y);
  doc.setFont("helvetica", "normal");
  doc.text(pdfValue(report.timePlaced), mid + 84, y);
  y += 18;

  labelledValue(doc, "Truck No.:", report.truckNumber, mid, y, mid + 60, mid + 130);
  labelledValue(doc, "Ticket No.:", report.ticketNumber, mid + 140, y, mid + 200, right);
  y += 22;

  labelledValue(doc, "Location:", report.location, PAGE_MARGIN, y, PAGE_MARGIN + 60, right);
  y += 20;
  labelledValue(doc, "Mix Designation:", report.mixDesignation, PAGE_MARGIN, y, PAGE_MARGIN + 100, right);
  y += 18;
  labelledValue(doc, "Manufacturer:", report.manufacturer, PAGE_MARGIN, y, PAGE_MARGIN + 100, right);
  y += 22;
  labelledValue(doc, "Specified Minimum Compressive Strength:", report.specifiedStrengthPsi || report.specifiedStrength, PAGE_MARGIN, y, PAGE_MARGIN + 230, PAGE_MARGIN + 320);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("psi", PAGE_MARGIN + 326, y);
  y += 18;
  labelledValue(doc, "Number, Size and Type of Specimens Molded:", report.specimensMolded, PAGE_MARGIN, y, PAGE_MARGIN + 250, right);
  y += 24;

  // ── Field measurements ──────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text("Field", PAGE_MARGIN + 150, y);
  doc.text("Measurement", PAGE_MARGIN + 135, y + 11);
  y += 20;
  const fieldRows = [
    ["Air Temp (°F)", report.airTemp],
    ["Mix Temp (°F)", report.mixTemp],
    ["Water(L/Bag)", report.waterPerBag],
    ["Fluidity (Sec)", report.fluiditySec],
    ["Specific Gravity (g/cm3)", report.specificGravity]
  ];
  fieldRows.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(label, PAGE_MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.text(naValue(value), PAGE_MARGIN + 150, y, { align: "center" });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(PAGE_MARGIN + 110, y + 3, PAGE_MARGIN + 190, y + 3);
    y += 16;
  });
  y += 8;

  // ── Results table ───────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text("COMPRESSIVE STRENGTH TEST RESULTS", pageWidth / 2, y, { align: "center" });
  y += 10;

  const specimens = report.specimens || [];
  autoTable(doc, {
    startY: y,
    head: [[
      "Specimen\nNumber", "Test\nDate", "Age\n(Days)", "Length\n(in.)", "Width\n(in.)",
      "Load\n(lbs.)", "Area\n(sq. in.)", "Compressive\nStrength (psi)", "Percent of\nDesign Strength (%)"
    ]],
    body: specimens.length ? specimens.map((row, index) => [
      pdfValue(row.specimenNumber) || index + 1,
      pdfValue(row.testDate),
      pdfValue(row.ageDays),
      pdfValue(row.length),
      pdfValue(row.width),
      pdfValue(row.load),
      pdfValue(row.area),
      pdfValue(row.compressiveStrength),
      pdfValue(row.percentDesignStrength)
    ]) : [[{ content: "No specimens recorded.", colSpan: 9, styles: { halign: "center", textColor: MUTED, fontStyle: "italic" } }]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, valign: "middle", halign: "center", minCellHeight: 18 },
    headStyles: { fillColor: [255, 255, 255], textColor: NAVY, fontStyle: "bold", fontSize: 7.5, halign: "center", lineColor: SLATE, lineWidth: 0.5 },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
  });
  y = doc.lastAutoTable.finalY + 18;

  // ── Remarks ─────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text("Remarks:", PAGE_MARGIN, y);
  if (String(report.remarks || "").trim()) {
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(String(report.remarks), pageWidth - PAGE_MARGIN * 2 - 60);
    doc.text(lines, PAGE_MARGIN + 56, y);
    y += Math.max(lines.length * 11, 11);
  }
  y += 22;

  // ── Notes ───────────────────────────────────────────────────────────────────
  if (y > doc.internal.pageSize.getHeight() - 110) { doc.addPage(); y = 60; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  doc.text("Notes:  (Unless stated otherwise)", PAGE_MARGIN, y);
  y += 14;
  const notes = [
    "1.  Specimen dimensions are within ASTM tolerance.",
    "2.  Cube specimens were molded, cured, prepared, and tested in general accordance with ASTM C-109/C-1107.",
    "3.  <<< Denotes low compressive strength.",
    "4.  N/A - Not Available."
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  notes.forEach((note) => {
    doc.text(note, PAGE_MARGIN, y);
    y += 12;
  });

  // ── Footer ──────────────────────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(PAGE_MARGIN, h - 30, right, h - 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Report No. ${pdfValue(report.reportNumber) || "-"} · Confidential laboratory test record`, PAGE_MARGIN, h - 18);
    doc.text(`Generated ${formatPdfDateTime(new Date())}`, PAGE_MARGIN, h - 9);
    doc.text(`Page ${page} of ${pageCount}`, right, h - 9, { align: "right" });
  }

  return doc.output("blob");
}

export function openGroutCubePdf(report, { download = false } = {}) {
  const blob = generateGroutCubePdfBlob(report);
  const url = URL.createObjectURL(blob);
  const fileName = `${report.reportNumber || "Grout-Cube-Break"}.pdf`;
  if (download) {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return url;
}
