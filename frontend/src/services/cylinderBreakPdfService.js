import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";

const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;

const COMPANY_NAME = "Dulles Engineering, Inc.";
const COMPANY_TAGLINE = "Construction Materials Testing & Inspection";
const NAVY = [15, 23, 42];
const SLATE = [71, 85, 105];
const MUTED = [100, 116, 139];
const LINE = [203, 213, 225];
const GREEN = [21, 110, 86];
const RED = [163, 45, 45];
const PAGE_MARGIN = 40;

function pdfValue(value) {
  return value == null || value === "" ? "-" : String(value);
}

function formatPdfDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return pdfValue(value);
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
}

function drawLetterhead(doc, report) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(COMPANY_NAME, PAGE_MARGIN, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(COMPANY_TAGLINE, PAGE_MARGIN, 64);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.text(`Report No.  ${pdfValue(report.reportNumber)}`, pageWidth - PAGE_MARGIN, 50, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(`Issued  ${formatPdfDateTime(new Date())}`, pageWidth - PAGE_MARGIN, 64, { align: "right" });

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.2);
  doc.line(PAGE_MARGIN, 76, pageWidth - PAGE_MARGIN, 76);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text("CONCRETE CYLINDER COMPRESSIVE STRENGTH REPORT", pageWidth / 2, 98, { align: "center" });
  return 116;
}

function sectionBar(doc, title, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN * 2, 18, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), PAGE_MARGIN + 8, y + 12.5);
  return y + 18;
}

function infoGrid(doc, pairs, startY) {
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const [l1, v1] = pairs[i];
    const [l2, v2] = pairs[i + 1] || ["", ""];
    rows.push([l1.toUpperCase(), pdfValue(v1), (l2 || "").toUpperCase(), pairs[i + 1] ? pdfValue(v2) : ""]);
  }
  autoTable(doc, {
    startY,
    body: rows,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 4, right: 6, bottom: 4, left: 6 }, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, valign: "middle" },
    columnStyles: {
      0: { cellWidth: 130, fontStyle: "bold", fontSize: 7.5, textColor: MUTED, fillColor: [248, 250, 252] },
      1: { cellWidth: "auto", fontStyle: "bold" },
      2: { cellWidth: 130, fontStyle: "bold", fontSize: 7.5, textColor: MUTED, fillColor: [248, 250, 252] },
      3: { cellWidth: "auto", fontStyle: "bold" }
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
  });
  return doc.lastAutoTable.finalY;
}

export function generateCylinderBreakPdfBlob(report) {
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = drawLetterhead(doc, report) + 6;

  // Source / sample information (pulled from the concrete test log via set number)
  y = sectionBar(doc, "Sample Source", y) + 2;
  y = infoGrid(doc, [
    ["Set Number", report.setNumber],
    ["DFR No.", report.dfrNumber],
    ["Project", report.projectName],
    ["Project Number", report.projectNumber],
    ["Truck No.", report.truckNumber],
    ["Ticket No.", report.ticketNumber],
    ["Mix Design", report.mixDesign],
    ["Date Cast", report.castDate],
    ["Specified Strength", report.specifiedStrength],
    ["Lab Cylinders", report.labCylinders],
    ["Break Pattern", report.breakPattern],
    ["Tested By", report.technicianName]
  ], y) + 14;

  // Break results table
  y = sectionBar(doc, "Compressive Strength Results", y) + 2;
  const breaks = report.breaks || [];
  autoTable(doc, {
    startY: y,
    head: [["#", "Type", "Break", "Age (d)", "Area (in²)", "Load (lbf)", "Dry Dens.", "Strength (psi)", "Fracture", "Result"]],
    body: breaks.length ? breaks.map((row, index) => [
      index + 1,
      pdfValue(row.cylinderType),
      pdfValue(row.breakDate),
      pdfValue(row.ageDays),
      pdfValue(row.areaIn2),
      pdfValue(row.maxLoadLbf),
      pdfValue(row.dryDensity),
      pdfValue(row.strengthPsi),
      pdfValue(row.fractureType).replace(/^Type \d+ - /, ""),
      pdfValue(row.result)
    ]) : [[{ content: "No cylinder breaks recorded.", colSpan: 10, styles: { halign: "center", textColor: MUTED, fontStyle: "italic" } }]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, valign: "middle", halign: "center" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5, halign: "center" },
    columnStyles: { 0: { halign: "left" }, 7: { fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 9) {
        const text = String(data.cell.raw || "").toLowerCase();
        if (text.includes("pass")) { data.cell.styles.textColor = GREEN; data.cell.styles.fontStyle = "bold"; }
        else if (text.includes("fail")) { data.cell.styles.textColor = RED; data.cell.styles.fontStyle = "bold"; }
      }
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
  });
  y = doc.lastAutoTable.finalY + 14;

  if (String(report.remarks || "").trim()) {
    y = sectionBar(doc, "Remarks", y) + 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    const lines = doc.splitTextToSize(String(report.remarks), pageWidth - PAGE_MARGIN * 2 - 8);
    doc.text(lines, PAGE_MARGIN + 4, y + 4);
    y += lines.length * 12 + 14;
  }

  // Signature block
  if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = 60; }
  const colWidth = (pageWidth - PAGE_MARGIN * 2 - 30) / 2;
  const sigLineY = y + 40;
  [["Tested By", PAGE_MARGIN], ["Reviewed By (QA/QC)", PAGE_MARGIN + colWidth + 30]].forEach(([label, x]) => {
    doc.setDrawColor(...SLATE);
    doc.setLineWidth(0.6);
    doc.line(x, sigLineY, x + colWidth, sigLineY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, sigLineY + 12);
    doc.setFont("helvetica", "normal");
    doc.text("Date: ______________________", x, sigLineY + 26);
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(PAGE_MARGIN, h - 34, pageWidth - PAGE_MARGIN, h - 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`${COMPANY_NAME} · Confidential laboratory test record`, PAGE_MARGIN, h - 22);
    doc.text(`Generated ${formatPdfDateTime(new Date())}`, PAGE_MARGIN, h - 12);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, h - 12, { align: "right" });
  }

  return doc.output("blob");
}

export function openCylinderBreakPdf(report, { download = false } = {}) {
  const blob = generateCylinderBreakPdfBlob(report);
  const url = URL.createObjectURL(blob);
  const fileName = `${report.reportNumber || "Cylinder-Break"}.pdf`;
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
