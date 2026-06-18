import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";
import { computeProctorResults, computeSievePassing, computeAtterberg, classifySoil, evalPoly, zavDensity } from "./proctorService";

const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;
const NAVY = [15, 23, 42];
const ACCENT = [189, 93, 58];
const SLATE = [71, 85, 105];
const MUTED = [100, 116, 139];
const LINE = [203, 213, 225];
const GRID = [238, 242, 247];
const PAGE_MARGIN = 36;

const pv = (v) => (v == null || v === "" ? "" : String(v));
const f1 = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? "" : Number(v).toFixed(1));

function infoGrid(doc, pairs, startY, cols = 4) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const cw = pageWidth - PAGE_MARGIN * 2;
  const colW = cw / cols;
  let y = startY, x = PAGE_MARGIN, count = 0;
  pairs.forEach(([label, value]) => {
    doc.setDrawColor(...LINE); doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, colW - 6, 30, 2, 2, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...MUTED);
    doc.text(String(label).toUpperCase(), x + 6, y + 11);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...NAVY);
    doc.text(doc.splitTextToSize(pv(value) || "-", colW - 14), x + 6, y + 23);
    count += 1; x += colW;
    if (count % cols === 0) { x = PAGE_MARGIN; y += 34; }
  });
  return count % cols === 0 ? y : y + 34;
}

function drawCurve(doc, results, gs, x0, y0, w, h) {
  const xMin = 0, xMax = 25, yMin = 100, yMax = 175;
  const toX = (v) => x0 + (v - xMin) / (xMax - xMin) * w;
  const toY = (v) => y0 + h - (Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin) * h;
  // grid
  doc.setDrawColor(...GRID); doc.setLineWidth(0.3);
  for (let x = 0; x <= 25; x += 5) doc.line(toX(x), y0, toX(x), y0 + h);
  for (let yy = 100; yy <= 175; yy += 5) doc.line(x0, toY(yy), x0 + w, toY(yy));
  doc.setFontSize(7); doc.setTextColor(...MUTED);
  for (let x = 0; x <= 25; x += 5) doc.text(x.toFixed(1), toX(x), y0 + h + 10, { align: "center" });
  for (let yy = 100; yy <= 175; yy += 5) doc.text(String(yy), x0 - 5, toY(yy) + 2.5, { align: "right" });
  // ZAV
  doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.6); doc.setLineDashPattern([2, 2], 0);
  let prev = null;
  for (let i = 0; i <= 50; i += 1) {
    const x = (25 * i) / 50; const y = zavDensity(x, gs);
    if (y == null || y > yMax + 30 || y < yMin) { prev = null; continue; }
    const px = toX(x), py = toY(y); if (prev) doc.line(prev[0], prev[1], px, py); prev = [px, py];
  }
  doc.setLineDashPattern([], 0);
  const drawFit = (fit, range, color, width) => {
    if (!fit || !range) return;
    doc.setDrawColor(...color); doc.setLineWidth(width); let p = null;
    for (let i = 0; i <= 60; i += 1) {
      const x = range[0] + (range[1] - range[0]) * (i / 60); const y = evalPoly(fit, x);
      if (y == null) { p = null; continue; }
      const px = toX(x), py = toY(y); if (p) doc.line(p[0], p[1], px, py); p = [px, py];
    }
  };
  drawFit(results.corrFit, results.corrRange, ACCENT, 1.5);
  drawFit(results.fit, results.fineRange, NAVY, 1.6);
  // points
  doc.setFillColor(...NAVY);
  results.finePoints.forEach((p) => doc.circle(toX(p.x), toY(p.y), 1.4, "F"));
  doc.setFillColor(...ACCENT);
  results.corrPoints.forEach((p) => doc.circle(toX(p.x), toY(p.y), 1.4, "F"));
  // frame + titles
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.8); doc.rect(x0, y0, w, h);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
  doc.text("Moisture Content, %", x0 + w / 2, y0 + h + 22, { align: "center" });
  doc.text("Dry Unit Weight, pcf", x0 - 34, y0 + h / 2, { align: "center", angle: 90 });
}

export function generateProctorPdfBlob(report) {
  const results = report._results || computeProctorResults(report);
  const sieveRows = report._sieveRows || computeSievePassing(report.sieves, report.sieveTotalWeight);
  const att = report._att || computeAtterberg(report.atterberg);
  const cls = report._cls || classifySoil({ sieveRows, ll: att.ll, pi: att.pi, organic: report.organic });

  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const cw = pageWidth - PAGE_MARGIN * 2;

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...NAVY);
  doc.text("Moisture-Density Relations of Soils", pageWidth / 2, 40, { align: "center" });
  doc.setFontSize(9.5); doc.text(report.methodId || "", pageWidth / 2, 54, { align: "center" });
  if (report.boringNumber) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(`Boring / Sample: ${report.boringNumber}`, PAGE_MARGIN, 70);
  }
  if (report.projectName) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...SLATE);
    doc.text(`${report.projectName}${report.projectNumber ? `  ·  ${report.projectNumber}` : ""}`, pageWidth - PAGE_MARGIN, 70, { align: "right" });
  }

  let y = 80;
  y = infoGrid(doc, [
    ["Mold Weight, g", report.moldWt], ["Mold Factor", report.moldFactor], ["Mold Size, in", report.moldIn], ["Gs Retained", report.gs],
    ["Hammer Wt, lb", report.hammerLb], ["Hammer Drop, in", report.dropIn], ["No. Layers", report.layers], ["Blows/Layer", report.blows],
    ["Sieve for Correction", report.sieveUsed], ["Retained for Corr., %", report.percentRetained], ["+4 OMC, %", report.oversizeMoisture], ["Natural Moisture, %", report.naturalMoisture]
  ], y, 4) + 6;

  // Points table
  autoTable(doc, {
    startY: y,
    head: [["#", "Wt Soil+Mold", "Wt Soil", "Wet Dens.", "Tare", "Wet", "Dry", "Moist. %", "Dry Dens.", "TMC %", "TDD"]],
    body: results.computedPoints.map((p, i) => [i + 1, pv(p.wtSoilMold), pv(p.wetSoil), pv(p.wetDensity), pv(p.tare), pv(p.wet), pv(p.dry), pv(p.moisture), pv(p.dryDensity), pv(p.tmc), pv(p.tdd)]),
    theme: "grid", margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }, tableWidth: cw,
    styles: { font: "helvetica", fontSize: 8, cellPadding: 3, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, halign: "center" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
    columnStyles: { 3: { fontStyle: "bold" }, 8: { fontStyle: "bold" } }
  });
  y = doc.lastAutoTable.finalY + 8;

  // Results callout
  doc.setFillColor(240, 246, 252); doc.setDrawColor(...LINE);
  doc.roundedRect(PAGE_MARGIN, y, cw, 26, 3, 3, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...NAVY);
  doc.text(`MDD ${f1(results.mdd)} pcf   ·   OMC ${f1(results.omc)} %`, PAGE_MARGIN + 10, y + 16);
  if (results.correctedMdd != null) {
    doc.setTextColor(...ACCENT);
    doc.text(`Corrected MDD ${f1(results.correctedMdd)} pcf   ·   Corrected OMC ${f1(results.correctedOmc)} %`, pageWidth - PAGE_MARGIN - 10, y + 16, { align: "right" });
  }
  y += 36;

  // Sieve + classification + Atterberg side-by-side
  autoTable(doc, {
    startY: y, margin: { left: PAGE_MARGIN, right: pageWidth / 2 + 6 },
    head: [["Sieve", "% Passing"]],
    body: sieveRows.map((r) => [r.label, r.percentPassing != null ? r.percentPassing.toFixed(1) : ""]),
    theme: "grid", styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2.5, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, halign: "center" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } }
  });
  const sieveEndY = doc.lastAutoTable.finalY;

  autoTable(doc, {
    startY: y, margin: { left: pageWidth / 2 + 6, right: PAGE_MARGIN },
    head: [["Atterberg / Classification", ""]],
    body: [
      ["Liquid Limit (LL)", att.nonPlastic ? "NP" : pv(att.ll)],
      ["Plastic Limit (PL)", att.nonPlastic ? "NP" : pv(att.pl)],
      ["Plasticity Index (PI)", pv(att.pi)],
      ["% Finer No. 200", cls.finesPct != null ? cls.finesPct.toFixed(1) : ""],
      ["USCS Classification", report.customClassification || cls.uscs],
      ["AASHTO Classification", cls.aashto]
    ],
    theme: "grid", styles: { font: "helvetica", fontSize: 8, cellPadding: 3, lineColor: LINE, lineWidth: 0.5, textColor: NAVY },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 }, 1: { fontStyle: "bold", halign: "right" } }
  });
  y = Math.max(sieveEndY, doc.lastAutoTable.finalY) + 10;

  if (String(report.remarks || "").trim()) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...NAVY);
    doc.text("Remarks:", PAGE_MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(String(report.remarks), cw - 56), PAGE_MARGIN + 54, y);
  }

  // Page 2 — curve
  doc.addPage("letter", "portrait");
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...NAVY);
  doc.text("Moisture-Density Curves", pageWidth / 2, 44, { align: "center" });
  drawCurve(doc, results, report.gs, PAGE_MARGIN + 30, 70, cw - 40, 300);
  // legend
  let ly = 400;
  const leg = [["Proctor curve", NAVY], ["Corrected curve", ACCENT]];
  leg.forEach(([label, color], i) => {
    doc.setDrawColor(...color); doc.setLineWidth(2); doc.line(PAGE_MARGIN + 30, ly + i * 16, PAGE_MARGIN + 54, ly + i * 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...NAVY);
    doc.text(label, PAGE_MARGIN + 62, ly + i * 16 + 3);
  });
  doc.setDrawColor(148, 163, 184); doc.setLineDashPattern([2, 2], 0); doc.setLineWidth(0.8);
  doc.line(PAGE_MARGIN + 30, ly + 32, PAGE_MARGIN + 54, ly + 32); doc.setLineDashPattern([], 0);
  doc.text(`Zero air voids (Gs = ${report.gs || "—"})`, PAGE_MARGIN + 62, ly + 35);

  // footer on all pages
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p); const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(PAGE_MARGIN, h - 26, pageWidth - PAGE_MARGIN, h - 26);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`Report No. ${pv(report.reportNumber) || "-"} · ${report.methodId || ""} · Confidential laboratory test record`, PAGE_MARGIN, h - 14);
    doc.text(`Page ${p} of ${pages}`, pageWidth - PAGE_MARGIN, h - 14, { align: "right" });
  }

  return doc.output("blob");
}

export function openProctorPdf(report, { download = false } = {}) {
  const blob = generateProctorPdfBlob(report);
  const url = URL.createObjectURL(blob);
  const fileName = `${report.reportNumber || "Proctor-Report"}.pdf`;
  if (download) {
    const link = document.createElement("a"); link.href = url; link.download = fileName;
    document.body.appendChild(link); link.click(); link.remove();
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return url;
}
