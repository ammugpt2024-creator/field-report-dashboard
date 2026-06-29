import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";
import { computeGradationRows } from "./gradationService";

const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;

const NAVY = [15, 23, 42];
const ACCENT = [189, 93, 58];
const SLATE = [71, 85, 105];
const MUTED = [100, 116, 139];
const LINE = [203, 213, 225];
const GRID = [226, 232, 240];
const PAGE_MARGIN = 40;

function pdfValue(value) {
  return value == null || value === "" ? "" : String(value);
}
function fmt(v, d) {
  return v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? "" : Number(v).toFixed(d);
}
function formatPdfDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
}

// Draw the particle-size-distribution curve (log x = grain size mm, y = % passing).
function drawGradationCurve(doc, rows, x0, y0, w, h) {
  const logMax = 2, logMin = -3;
  const toX = (mm) => x0 + (logMax - Math.log10(mm)) / (logMax - logMin) * w;
  const toY = (p) => y0 + h - (p / 100) * h;
  const decades = [100, 10, 1, 0.1, 0.01, 0.001];

  // minor gridlines
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.2);
  for (let d = logMax - 1; d >= logMin; d -= 1) {
    for (let k = 2; k <= 9; k += 1) {
      const mm = k * Math.pow(10, d);
      doc.line(toX(mm), y0, toX(mm), y0 + h);
    }
  }
  // decade gridlines
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.5);
  decades.forEach((mm) => doc.line(toX(mm), y0, toX(mm), y0 + h));
  // horizontal gridlines + y labels
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  for (let p = 0; p <= 100; p += 10) {
    doc.setDrawColor(...GRID);
    doc.line(x0, toY(p), x0 + w, toY(p));
    doc.text(String(p), x0 - 6, toY(p) + 2.5, { align: "right" });
  }
  // reference sieve markers
  const refs = [
    { label: "3\"", mm: 76.2 }, { label: "3/4\"", mm: 19.0 }, { label: "No. 4", mm: 4.75 },
    { label: "No. 40", mm: 0.425 }, { label: "No. 200", mm: 0.075 }
  ];
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);
  refs.forEach((r) => doc.line(toX(r.mm), y0, toX(r.mm), y0 + h));
  doc.setLineDashPattern([], 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...SLATE);
  refs.forEach((r) => doc.text(r.label, toX(r.mm), y0 - 3, { align: "center" }));

  // x labels
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  decades.forEach((mm) => doc.text(mm >= 1 ? mm.toFixed(0) : String(mm), toX(mm), y0 + h + 10, { align: "center" }));

  // frame
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.8);
  doc.rect(x0, y0, w, h);

  // curve
  const pts = (rows || [])
    .filter((r) => r.percentPassing !== null && r.percentPassing !== undefined && Number.isFinite(Number(r.percentPassing)))
    .map((r) => [toX(r.mm), toY(Math.max(0, Math.min(100, Number(r.percentPassing))))]);
  if (pts.length > 1) {
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(1.6);
    for (let i = 1; i < pts.length; i += 1) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
  doc.setFillColor(...ACCENT);
  pts.forEach(([px, py]) => doc.circle(px, py, 1.6, "F"));

  // axis titles
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  doc.text("Grain Size (mm)", x0 + w / 2, y0 + h + 22, { align: "center" });
}

export function generateGradationPdfBlob(report) {
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const cw = pageWidth - PAGE_MARGIN * 2;
  const rows = (report.sieves || []).some((s) => "percentPassing" in s)
    ? report.sieves
    : computeGradationRows(report.sieves, report.totalSoilWeight);

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text("Washed Particle Size/Gradation Test Report", pageWidth / 2, 44, { align: "center" });
  doc.setFontSize(10);
  doc.text("ASTM D422", pageWidth / 2, 58, { align: "center" });

  // Boring number
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text("Boring Number:", PAGE_MARGIN, 78);
  doc.setFont("helvetica", "normal");
  doc.text(pdfValue(report.boringNumber), PAGE_MARGIN + 90, 78);
  if (report.projectName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text(`${report.projectName}${report.projectNumber ? `  ·  ${report.projectNumber}` : ""}`, pageWidth - PAGE_MARGIN, 78, { align: "right" });
  }

  // Table
  autoTable(doc, {
    startY: 90,
    head: [["Sieve Size", "Cumulative\nWt. Retained (g)", "Wt. Retained\nEach Sieve (g)", "Cumulative\n% Passing"]],
    body: [
      ...rows.map((r) => [r.label, fmt(r.cumulativeRetained, 2), fmt(r.retained, 1), fmt(r.percentPassing, 1)]),
      [{ content: "Wt. of Soil, g", styles: { fontStyle: "bold" } }, { content: fmt(report.totalSoilWeight, 2), colSpan: 3, styles: { fontStyle: "bold", halign: "center" } }]
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 4, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, halign: "center", valign: "middle" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, halign: "center" },
    columnStyles: { 0: { fontStyle: "bold", halign: "left" }, 3: { fontStyle: "bold" } },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    tableWidth: cw
  });
  let y = doc.lastAutoTable.finalY + 26;

  // Curve
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Particle Size Analysis", pageWidth / 2, y, { align: "center" });
  doc.setFontSize(8.5);
  doc.text("U.S. Standard Sieve Sizes", pageWidth / 2, y + 12, { align: "center" });

  const chartX = PAGE_MARGIN + 24;
  const chartY = y + 26;
  const chartW = cw - 30;
  const chartH = 230;
  drawGradationCurve(doc, rows, chartX, chartY, chartW, chartH);

  // Rotated y-axis title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  doc.text("Percent Finer by Weight", chartX - 34, chartY + chartH / 2, { align: "center", angle: 90 });

  y = chartY + chartH + 34;

  // Remarks
  if (String(report.remarks || "").trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text("Remarks:", PAGE_MARGIN, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(String(report.remarks), cw - 60);
    doc.text(lines, PAGE_MARGIN + 56, y);
  }

  // Footer
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.5);
  doc.line(PAGE_MARGIN, h - 26, pageWidth - PAGE_MARGIN, h - 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`Report No. ${pdfValue(report.reportNumber) || "-"} · ASTM D422 · Confidential laboratory test record`, PAGE_MARGIN, h - 14);
  doc.text(`Generated ${formatPdfDateTime(new Date())}`, PAGE_MARGIN, h - 6);

  return doc.output("blob");
}

export function openGradationPdf(report, { download = false } = {}) {
  const blob = generateGradationPdfBlob(report);
  const url = URL.createObjectURL(blob);
  const fileName = `${report.reportNumber || "Gradation-Report"}.pdf`;
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
