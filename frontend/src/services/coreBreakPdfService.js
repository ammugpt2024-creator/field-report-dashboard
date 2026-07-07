import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";
import { CORE_CORRECTION_FACTORS, averageCorrectedStrength } from "./coreBreakService";

const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;

const NAVY = [15, 23, 42];
const SLATE = [71, 85, 105];
const MUTED = [100, 116, 139];
const LINE = [203, 213, 225];
const PAGE_MARGIN = 36;

function pdfValue(value) {
  return value == null || value === "" ? "" : String(value);
}

function formatPdfDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
}

// "Label - value" with an underline beneath the value (left info column).
function infoLine(doc, label, value, x, y, valueX, lineEndX) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(label, x, y);
  doc.setFont("helvetica", "bold");
  const lines = doc.splitTextToSize(pdfValue(value), lineEndX - valueX);
  doc.text(lines, valueX, y);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.5);
  doc.line(valueX, y + 3, lineEndX, y + 3);
  return y + Math.max(lines.length * 11, 11) + 11;
}

export function generateCoreBreakPdfBlob(report) {
  const doc = new JsPDFConstructor({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const right = pageWidth - PAGE_MARGIN;

  // ── Title ──────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text("COMPRESSIVE STRENGTH OF CONCRETE CORES", pageWidth / 2, 40, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.text("ASTM C 42", pageWidth / 2, 54, { align: "center" });

  // ── Results table ───────────────────────────────────────────────────────────
  const specimens = report.specimens || [];
  let y = 66;
  autoTable(doc, {
    startY: y,
    head: [[
      "Sample\nNo.", "Length\nUncapped\n(in.)", "Length\nCapped\n(in.)", "Core\nDiam.\n(in.)", "Area\n(sq.in.)",
      "Load\n(lbs.)", "Compressive\nStrength (psi)", "Length\nDiameter\nRatio", "Correction\nFactor",
      "Corrected\nCompressive\nStrength (psi)", "Weight of the\nSpecimen\nBefore Capping\n(lb)", "Unit Weight\n(pcf)", "Age of the\nCores\n(Days)"
    ]],
    body: specimens.length ? specimens.map((row, index) => [
      pdfValue(row.sampleNo) || `Core-${index + 1}`,
      pdfValue(row.lengthUncapped),
      pdfValue(row.lengthCapped),
      pdfValue(row.coreDiameter),
      pdfValue(row.area),
      pdfValue(row.load),
      pdfValue(row.compressiveStrength),
      pdfValue(row.ldRatio),
      pdfValue(row.correctionFactor) || pdfValue(row.correctionNote),
      pdfValue(row.correctedStrength),
      pdfValue(row.weightBeforeCapping),
      pdfValue(row.unitWeight),
      pdfValue(row.ageDays)
    ]) : [[{ content: "No cores recorded.", colSpan: 13, styles: { halign: "center", textColor: MUTED, fontStyle: "italic" } }]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 3, lineColor: SLATE, lineWidth: 0.5, textColor: NAVY, valign: "middle", halign: "center", minCellHeight: 16 },
    headStyles: { fillColor: [255, 255, 255], textColor: NAVY, fontStyle: "bold", fontSize: 7, halign: "center", lineColor: SLATE, lineWidth: 0.5 },
    columnStyles: { 6: { fontStyle: "bold" }, 9: { fontStyle: "bold" } },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
  });
  y = doc.lastAutoTable.finalY;

  // Average corrected strength callout
  const avg = averageCorrectedStrength(specimens);
  if (avg) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY);
    doc.text(`Avg. of Corrected Compressive Strength:  ${avg} psi`, right, y + 14, { align: "right" });
  }
  y += 30;

  // ── Lower section: info column (left) + correction-factor table (right) ──────
  const leftX = PAGE_MARGIN;
  const valueX = PAGE_MARGIN + 150;
  const leftEnd = pageWidth * 0.5 - 10;
  let infoY = y + 6;
  infoY = infoLine(doc, "Required Compressive Strength -", report.requiredStrength, leftX, infoY, valueX, leftEnd);
  infoY = infoLine(doc, "Diameter of Cores -", report.diameterOfCores, leftX, infoY, valueX, leftEnd);
  infoY = infoLine(doc, "Condition of Cores -", report.conditionOfCores, leftX, infoY, valueX, leftEnd);
  infoY = infoLine(doc, "Direction of Loading -", report.directionOfLoading, leftX, infoY, valueX, leftEnd);
  infoY = infoLine(doc, "Placement Location -", report.placementLocation, leftX, infoY, valueX, leftEnd);
  infoY = infoLine(doc, "Panel Shot on -", report.panelShotOn, leftX, infoY, valueX, leftEnd);
  infoY = infoLine(doc, "Date Cored -", report.dateCored, leftX, infoY, valueX, leftEnd);
  infoY = infoLine(doc, "Date Tested -", report.dateTested, leftX, infoY, valueX, leftEnd);
  infoY = infoLine(doc, "Tested By -", report.testedBy, leftX, infoY, valueX, leftEnd);
  infoY = infoLine(doc, "Prepared By -", report.preparedBy, leftX, infoY, valueX, leftEnd);

  // Correction factor reference table (right)
  const cfX = pageWidth * 0.55;
  const half = CORE_CORRECTION_FACTORS.length / 2;
  const colA = [{ ratio: "< 1.00", factor: "Do Not Test" }, ...CORE_CORRECTION_FACTORS.slice(0, Math.ceil(half) - 1).map((b) => ({ ratio: `${b.min.toFixed(2)} to ${b.max.toFixed(2)}`, factor: b.factor.toFixed(2) }))];
  const colB = CORE_CORRECTION_FACTORS.slice(Math.ceil(half) - 1).map((b) => ({ ratio: `${b.min.toFixed(2)} to ${b.max.toFixed(2)}`, factor: b.factor.toFixed(2) }));
  const cfBody = [];
  for (let i = 0; i < Math.max(colA.length, colB.length); i += 1) {
    cfBody.push([colA[i]?.ratio || "", colA[i]?.factor || "", colB[i]?.ratio || "", colB[i]?.factor || ""]);
  }
  autoTable(doc, {
    startY: y,
    margin: { left: cfX, right: PAGE_MARGIN },
    head: [[{ content: "CONCRETE CORE CORRECTION FACTOR", colSpan: 4, styles: { halign: "center" } }], ["L/D RATIO", "FACTOR", "L/D RATIO", "FACTOR"]],
    body: cfBody,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7, cellPadding: 2.5, lineColor: SLATE, lineWidth: 0.5, textColor: NAVY, halign: "center" },
    headStyles: { fillColor: [255, 255, 255], textColor: NAVY, fontStyle: "bold", fontSize: 7, lineColor: SLATE, lineWidth: 0.5 }
  });

  // Target compressive strength box (below correction table)
  let tY = doc.lastAutoTable.finalY + 16;
  if (report.target3Day || report.target7Day || report.target28Day) {
    autoTable(doc, {
      startY: tY,
      margin: { left: cfX + 30, right: PAGE_MARGIN + 30 },
      head: [[{ content: "Target Compressive Strength", styles: { halign: "center" } }]],
      body: [
        [`3 Day - ${pdfValue(report.target3Day) || "-"}`],
        [`7 Day - ${pdfValue(report.target7Day) || "-"}`],
        [`28 Day - ${pdfValue(report.target28Day) || "-"}`]
      ],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 3, lineColor: SLATE, lineWidth: 0.5, textColor: NAVY, halign: "center" },
      headStyles: { fillColor: [255, 255, 255], textColor: NAVY, fontStyle: "bold", fontSize: 8, lineColor: SLATE, lineWidth: 0.5 }
    });
    tY = doc.lastAutoTable.finalY;
  }

  // Remarks
  let bottomY = Math.max(infoY, tY) + 6;
  if (String(report.remarks || "").trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text("Remarks:", PAGE_MARGIN, bottomY);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(String(report.remarks), pageWidth - PAGE_MARGIN * 2 - 60);
    doc.text(lines, PAGE_MARGIN + 56, bottomY);
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(PAGE_MARGIN, h - 26, right, h - 26);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Report No. ${pdfValue(report.reportNumber) || "-"} · Confidential laboratory test record`, PAGE_MARGIN, h - 14);
    doc.text(`Generated ${formatPdfDateTime(new Date())}`, PAGE_MARGIN, h - 6);
    doc.text(`Page ${page} of ${pageCount}`, right, h - 6, { align: "right" });
  }

  return doc.output("blob");
}

export function openCoreBreakPdf(report, { download = false } = {}) {
  const blob = generateCoreBreakPdfBlob(report);
  const url = URL.createObjectURL(blob);
  const fileName = `${report.reportNumber || "Core-Break"}.pdf`;
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
