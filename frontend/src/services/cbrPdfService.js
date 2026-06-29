import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";
import { computeCbrResults, CBR_CONDITIONS, CBR_METHODS, PEN_POINTS } from "./cbrService";

const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;
const NAVY = [15, 23, 42];
const ACCENT = [189, 93, 58];
const SLATE = [71, 85, 105];
const MUTED = [100, 116, 139];
const LINE = [203, 213, 225];
const GRID = [238, 242, 247];
const PAGE_MARGIN = 40;
const SPEC_RGB = [[29, 78, 216], [189, 93, 58], [15, 118, 110]];

const pv = (v) => (v == null || v === "" ? "" : String(v));
const f = (v, d) => (v == null || v === "" || Number.isNaN(Number(v)) ? "" : Number(v).toFixed(d));

function niceCeil(v) {
  if (!v || v <= 0) return 500;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function loadPenetrationCurve(doc, specimens, labels, x0, y0, w, h) {
  const xMax = 0.5;
  let maxUL = 0;
  specimens.forEach((s) => s._r.corrected.forEach((p) => { if (p.unitLoad != null && p.unitLoad > maxUL) maxUL = p.unitLoad; }));
  const yMax = niceCeil(maxUL * 1.05);
  const toX = (pen) => x0 + (pen / xMax) * w;
  const toY = (ul) => y0 + h - (Math.max(0, Math.min(yMax, ul)) / yMax) * h;
  doc.setDrawColor(...GRID); doc.setLineWidth(0.3);
  [0, 0.1, 0.2, 0.3, 0.4, 0.5].forEach((x) => doc.line(toX(x), y0, toX(x), y0 + h));
  const yStep = yMax / 5;
  for (let i = 0; i <= 5; i += 1) { const yy = y0 + h - (i / 5) * h; doc.line(x0, yy, x0 + w, yy); }
  doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.3); doc.setLineDashPattern([1.5, 1.5], 0);
  [0.1, 0.2].forEach((x) => doc.line(toX(x), y0, toX(x), y0 + h)); doc.setLineDashPattern([], 0);
  specimens.forEach((s, si) => {
    const pts = s._r.corrected.filter((p) => p.unitLoad != null).map((p) => [toX(p.pen), toY(p.unitLoad)]);
    doc.setDrawColor(...SPEC_RGB[si]); doc.setLineWidth(1.4);
    for (let i = 1; i < pts.length; i += 1) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    doc.setFillColor(...SPEC_RGB[si]);
    if (s._r.ul01 != null) doc.circle(toX(0.1), toY(s._r.ul01), 1.5, "F");
    if (s._r.ul02 != null) doc.circle(toX(0.2), toY(s._r.ul02), 1.5, "F");
  });
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.8); doc.rect(x0, y0, w, h);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...MUTED);
  [0, 0.1, 0.2, 0.3, 0.4, 0.5].forEach((x) => doc.text(x.toFixed(1), toX(x), y0 + h + 10, { align: "center" }));
  for (let i = 0; i <= 5; i += 1) { const val = (yMax / 5) * i; doc.text(String(Math.round(val)), x0 - 4, toY(val) + 2.5, { align: "right" }); }
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text("Penetration (in)", x0 + w / 2, y0 + h + 22, { align: "center" });
  doc.text("Stress (psi)", x0 - 28, y0 + h / 2, { align: "center", angle: 90 });
  if (specimens.length > 1) {
    doc.setFontSize(7);
    specimens.forEach((s, si) => {
      doc.setDrawColor(...SPEC_RGB[si]); doc.setLineWidth(2); doc.line(x0 + 8 + si * 70, y0 + 8, x0 + 18 + si * 70, y0 + 8);
      doc.setTextColor(...SLATE); doc.setFont("helvetica", "bold"); doc.text(labels[si], x0 + 21 + si * 70, y0 + 10);
    });
  }
}

function cbrDensityPlot(doc, densityPoints, targetDensity, designCBR, x0, y0, w, h) {
  const dens = densityPoints.map((p) => p.density).concat(targetDensity != null ? [targetDensity] : []);
  const cbrs = densityPoints.map((p) => p.cbr).concat(designCBR != null ? [designCBR] : []);
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.8); doc.rect(x0, y0, w, h);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text("Dry Density (pcf)", x0 + w / 2, y0 + h + 22, { align: "center" });
  doc.text("CBR (%)", x0 - 28, y0 + h / 2, { align: "center", angle: 90 });
  if (!dens.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text("Insufficient data", x0 + w / 2, y0 + h / 2, { align: "center" }); return; }
  const dMin = Math.min(...dens), dMax = Math.max(...dens), pad = (dMax - dMin) * 0.15 || 2;
  const xMin = dMin - pad, xMax = dMax + pad, yMax = niceCeil(Math.max(...cbrs, 1) * 1.1);
  const toX = (d) => x0 + ((d - xMin) / (xMax - xMin)) * w;
  const toY = (c) => y0 + h - (Math.max(0, Math.min(yMax, c)) / yMax) * h;
  doc.setDrawColor(...GRID); doc.setLineWidth(0.3);
  for (let i = 0; i <= 5; i += 1) { const yy = y0 + h - (i / 5) * h; doc.line(x0, yy, x0 + w, yy); }
  const sorted = [...densityPoints].sort((a, b) => a.density - b.density);
  doc.setDrawColor(29, 78, 216); doc.setLineWidth(1.4);
  for (let i = 1; i < sorted.length; i += 1) doc.line(toX(sorted[i - 1].density), toY(sorted[i - 1].cbr), toX(sorted[i].density), toY(sorted[i].cbr));
  doc.setFillColor(29, 78, 216); sorted.forEach((p) => doc.circle(toX(p.density), toY(p.cbr), 1.7, "F"));
  if (targetDensity != null) {
    doc.setDrawColor(...ACCENT); doc.setLineWidth(0.8); doc.setLineDashPattern([2, 1.5], 0);
    doc.line(toX(targetDensity), y0, toX(targetDensity), y0 + h);
    if (designCBR != null) { doc.line(x0, toY(designCBR), toX(targetDensity), toY(designCBR)); doc.setLineDashPattern([], 0); doc.setFillColor(...ACCENT); doc.circle(toX(targetDensity), toY(designCBR), 2, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...ACCENT); doc.text(`Design ${designCBR.toFixed(1)}`, toX(targetDensity) + 4, toY(designCBR) - 3); }
    doc.setLineDashPattern([], 0);
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...MUTED);
  [xMin, (xMin + xMax) / 2, xMax].forEach((d) => doc.text(d.toFixed(1), toX(d), y0 + h + 10, { align: "center" }));
  for (let i = 0; i <= 5; i += 1) { const val = (yMax / 5) * i; doc.text(String(Math.round(val)), x0 - 4, toY(val) + 2.5, { align: "right" }); }
}

export function generateCbrPdfBlob(report) {
  const res = report._res || computeCbrResults(report);
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const cw = pageWidth - PAGE_MARGIN * 2;
  const soaked = report.condition === "soaked";
  const isThree = report.method === "three";
  const condLabel = CBR_CONDITIONS.find((c) => c.value === report.condition)?.label || report.condition;
  const methLabel = CBR_METHODS.find((m) => m.value === report.method)?.label || report.method;
  const labels = res.specimens.map((s, i) => (isThree ? `${s.blows || "?"} blows` : "Specimen"));

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...NAVY);
  doc.text("California Bearing Ratio Test Report", pageWidth / 2, 40, { align: "center" });
  doc.setFontSize(9.5); doc.text(`${report.standard} · ${condLabel} · ${methLabel}`, pageWidth / 2, 54, { align: "center" });

  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...SLATE);
  let y = 72;
  [["Client", report.clientName], ["Project", `${report.projectName || ""}${report.projectNumber ? ` (${report.projectNumber})` : ""}`], ["Sample", report.sampleNumber], ["Design CBR", res.designCBR != null ? `${res.designCBR.toFixed(1)} %` : "—"]]
    .forEach(([k, v], i) => { doc.setFont("helvetica", "bold"); doc.text(`${k}:`, PAGE_MARGIN + (i % 2) * (cw / 2), y + Math.floor(i / 2) * 14); doc.setFont("helvetica", "normal"); doc.text(pv(v) || "-", PAGE_MARGIN + (i % 2) * (cw / 2) + 80, y + Math.floor(i / 2) * 14); });
  y += 34;

  // Specimen summary
  const sumHead = ["Point", "Blows", "Dry Dens (pcf)", "Moist %", "CBR 0.1″", "CBR 0.2″", "Governing"];
  if (soaked) sumHead.push("Swell %");
  autoTable(doc, {
    startY: y, margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [sumHead],
    body: res.specimens.map((s, i) => {
      const r = s._r;
      const row = [isThree ? `P${i + 1}` : "—", pv(s.blows), f(r.dryDensity, 1), f(r.moisture, 1), r.cbr01 != null ? r.cbr01.toFixed(1) : "", r.cbr02 != null ? r.cbr02.toFixed(1) : "", r.governing != null ? `${r.governing.toFixed(1)} (@${r.governingAt}″)` : ""];
      if (soaked) row.push(r.swell != null ? r.swell.toFixed(2) : "");
      return row;
    }),
    theme: "grid", styles: { font: "helvetica", fontSize: 8, cellPadding: 3, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, halign: "center" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 }
  });
  y = doc.lastAutoTable.finalY + 12;

  // Penetration / load table (load per specimen)
  const penHead = ["Pen (in)", ...res.specimens.map((s, i) => `Load ${isThree ? `P${i + 1}` : ""}`.trim())];
  autoTable(doc, {
    startY: y, margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [penHead],
    body: PEN_POINTS.map((pen, j) => [pen.toFixed(3), ...res.specimens.map((s) => pv(s.penetrations?.[j]?.load))]),
    theme: "grid", styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2.5, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, halign: "center" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 }, columnStyles: { 0: { fontStyle: "bold" } }
  });
  y = doc.lastAutoTable.finalY + 14;

  // Load–penetration plot
  if (y > doc.internal.pageSize.getHeight() - 230) { doc.addPage("letter", "portrait"); y = 60; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text("Load – Penetration", pageWidth / 2, y, { align: "center" });
  loadPenetrationCurve(doc, res.specimens, labels, PAGE_MARGIN + 34, y + 12, cw - 44, 190);
  y += 240;

  // CBR–density plot (3-point)
  if (isThree) {
    if (y > doc.internal.pageSize.getHeight() - 230) { doc.addPage("letter", "portrait"); y = 60; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text("CBR vs Dry Density", pageWidth / 2, y, { align: "center" });
    cbrDensityPlot(doc, res.densityPoints, res.targetDensity, res.designCBR, PAGE_MARGIN + 34, y + 12, cw - 44, 190);
    y += 230;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`Design CBR at ${pv(report.targetCompaction)}% of max dry density${res.targetDensity != null ? ` (${res.targetDensity.toFixed(1)} pcf)` : ""}.`, pageWidth / 2, y, { align: "center" });
  }

  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p); const hh = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(PAGE_MARGIN, hh - 26, pageWidth - PAGE_MARGIN, hh - 26);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`Report No. ${pv(report.reportNumber) || "-"} · ${report.standard} · Confidential laboratory test record`, PAGE_MARGIN, hh - 14);
    doc.text(`Page ${p} of ${pages}`, pageWidth - PAGE_MARGIN, hh - 14, { align: "right" });
  }
  return doc.output("blob");
}

export function openCbrPdf(report, { download = false } = {}) {
  const blob = generateCbrPdfBlob(report);
  const url = URL.createObjectURL(blob);
  const fileName = `${report.reportNumber || "CBR-Report"}.pdf`;
  if (download) { const a = document.createElement("a"); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); }
  else window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
