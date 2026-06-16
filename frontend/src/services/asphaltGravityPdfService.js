import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";

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

export function generateAsphaltGravityPdfBlob(report) {
  const doc = new JsPDFConstructor({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const right = pageWidth - PAGE_MARGIN;

  // ── Title ──────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text("BULK SPECIFIC GRAVITY AND DENSITY OF COMPACTED BITUMINOUS MIXTURES", pageWidth / 2, 38, { align: "center" });
  doc.setFontSize(9);
  doc.text("AASHTO T-166, ASTM D2726", pageWidth / 2, 52, { align: "center" });

  // ── Results table ───────────────────────────────────────────────────────────
  const specimens = report.specimens || [];
  autoTable(doc, {
    startY: 64,
    head: [[
      "Sample", "Core Identification\nLocation", "Core\nThickness\n(in)",
      "Core Weight (g)\nIn Air", "Saturated\nSurface Dry", "In Water",
      "Bulk\nSpecific\nGravity (Gs)", "Core\nDensity\n(pcf)", "Plant\nCompacted\nUnit Weight (pcf)",
      "Percent\nCompaction\n(%)", "Air Voids\n(%)"
    ]],
    body: specimens.length ? specimens.map((row, index) => [
      `${pdfValue(row.sampleId) || `S-${index + 1}`}${row.sampleDate ? `\n${row.sampleDate}` : ""}`,
      pdfValue(row.location),
      pdfValue(row.coreThickness),
      pdfValue(row.weightInAir),
      pdfValue(row.weightSSD),
      pdfValue(row.weightInWater),
      pdfValue(row.bulkSpecificGravity),
      pdfValue(row.coreDensity),
      pdfValue(row.plantUnitWeight),
      pdfValue(row.percentCompaction),
      pdfValue(row.airVoids)
    ]) : [[{ content: "No cores recorded.", colSpan: 11, styles: { halign: "center", textColor: MUTED, fontStyle: "italic" } }]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, lineColor: SLATE, lineWidth: 0.5, textColor: NAVY, valign: "middle", halign: "center", minCellHeight: 22 },
    headStyles: { fillColor: [255, 255, 255], textColor: NAVY, fontStyle: "bold", fontSize: 7.5, halign: "center", lineColor: SLATE, lineWidth: 0.5 },
    columnStyles: { 1: { halign: "left", cellWidth: 150 }, 6: { fontStyle: "bold" }, 9: { fontStyle: "bold" }, 10: { fontStyle: "bold" } },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
  });
  let y = doc.lastAutoTable.finalY + 18;

  // ── Water temperature ───────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  const tempX = PAGE_MARGIN + 150;
  doc.text("Temperature of H2O, C:", tempX, y);
  doc.text("Temperature of H2O, F:", tempX, y + 16);
  doc.setFont("helvetica", "normal");
  doc.text(pdfValue(report.temperatureC), tempX + 120, y);
  doc.text(pdfValue(report.temperatureF), tempX + 120, y + 16);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.5);
  doc.line(tempX + 116, y + 3, tempX + 180, y + 3);
  doc.line(tempX + 116, y + 19, tempX + 180, y + 19);
  y += 40;

  // ── Notes ───────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text("Notes:", PAGE_MARGIN, y);
  y += 14;
  if (String(report.notes || "").trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    String(report.notes).split("\n").forEach((line) => {
      const wrapped = doc.splitTextToSize(line, pageWidth - PAGE_MARGIN * 2);
      doc.text(wrapped, PAGE_MARGIN, y);
      y += wrapped.length * 12;
    });
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

export function openAsphaltGravityPdf(report, { download = false } = {}) {
  const blob = generateAsphaltGravityPdfBlob(report);
  const url = URL.createObjectURL(blob);
  const fileName = `${report.reportNumber || "Asphalt-BSG"}.pdf`;
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
