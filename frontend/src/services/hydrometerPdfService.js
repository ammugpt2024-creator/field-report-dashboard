import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";
import { computeHydrometerResults, usdaTexture } from "./hydrometerService";

const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;
const NAVY = [15, 23, 42];
const ACCENT = [189, 93, 58];
const SLATE = [71, 85, 105];
const MUTED = [100, 116, 139];
const LINE = [203, 213, 225];
const GRID = [238, 242, 247];
const PAGE_MARGIN = 40;

const pv = (v) => (v == null || v === "" ? "" : String(v));
const f = (v, d) => (v == null || v === "" || Number.isNaN(Number(v)) ? "" : Number(v).toFixed(d));

const CLASS_FILL = {
  "sand": [254, 243, 199], "loamy sand": [253, 230, 138], "sandy loam": [254, 215, 170], "loam": [217, 249, 157],
  "silt loam": [187, 247, 208], "silt": [167, 243, 208], "sandy clay loam": [254, 202, 202], "clay loam": [199, 210, 254],
  "silty clay loam": [191, 219, 254], "sandy clay": [252, 165, 165], "silty clay": [147, 197, 253], "clay": [165, 180, 252]
};
const REGION_LABELS = [
  ["sand", 92, 3], ["loamy sand", 82, 8], ["sandy loam", 62, 11], ["loam", 40, 15], ["silt loam", 21, 13],
  ["silt", 6, 5], ["sandy clay loam", 57, 27], ["clay loam", 33, 33], ["silty clay loam", 10, 33],
  ["sandy clay", 50, 42], ["silty clay", 13, 47], ["clay", 25, 62]
];

function gradationCurve(doc, curve, x0, y0, w, h) {
  const toX = (mm) => x0 + (2 - Math.log10(mm)) / 5 * w;
  const toY = (p) => y0 + h - (Math.max(0, Math.min(100, p)) / 100) * h;
  const decades = [100, 10, 1, 0.1, 0.01, 0.001];
  doc.setDrawColor(...GRID); doc.setLineWidth(0.2);
  for (let d = 1; d >= -3; d -= 1) for (let k = 2; k <= 9; k += 1) { const mm = k * Math.pow(10, d); doc.line(toX(mm), y0, toX(mm), y0 + h); }
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); decades.forEach((mm) => doc.line(toX(mm), y0, toX(mm), y0 + h));
  doc.setFontSize(7); doc.setTextColor(...MUTED);
  for (let p = 0; p <= 100; p += 10) { doc.setDrawColor(...GRID); doc.line(x0, toY(p), x0 + w, toY(p)); doc.text(String(p), x0 - 5, toY(p) + 2.5, { align: "right" }); }
  const refs = [{ l: "3\"", mm: 76.2 }, { l: "3/4\"", mm: 19 }, { l: "No.4", mm: 4.75 }, { l: "No.40", mm: 0.425 }, { l: "No.200", mm: 0.075 }];
  doc.setLineDashPattern([1.5, 1.5], 0); doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.4);
  refs.forEach((r) => doc.line(toX(r.mm), y0, toX(r.mm), y0 + h)); doc.setLineDashPattern([], 0);
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...SLATE);
  refs.forEach((r) => doc.text(r.l, toX(r.mm), y0 - 3, { align: "center" }));
  doc.setFont("helvetica", "normal"); doc.setTextColor(...MUTED);
  decades.forEach((mm) => doc.text(mm >= 1 ? mm.toFixed(0) : String(mm), toX(mm), y0 + h + 10, { align: "center" }));
  const pts = (curve || []).map((c) => [toX(c.mm), toY(c.pct)]);
  if (pts.length > 1) { doc.setDrawColor(...NAVY); doc.setLineWidth(1.6); for (let i = 1; i < pts.length; i += 1) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); }
  doc.setFillColor(...ACCENT); pts.forEach(([px, py]) => doc.circle(px, py, 1.3, "F"));
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.8); doc.rect(x0, y0, w, h);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
  doc.text("Grain Size (mm)", x0 + w / 2, y0 + h + 22, { align: "center" });
  doc.text("Percent Finer by Weight", x0 - 30, y0 + h / 2, { align: "center", angle: 90 });
}

function textureTriangle(doc, sand, clay, x0, oy, size) {
  const hgt = size * Math.sqrt(3) / 2;
  const pt = (sa, cl) => { const si = 100 - sa - cl; return [x0 + (si / 100 + 0.5 * cl / 100) * size, oy - (cl / 100) * hgt]; };
  const N = 22;
  for (let a = 0; a < N; a += 1) for (let b = 0; b < N - a; b += 1) {
    const cells = [[[a, b], [a + 1, b], [a, b + 1]]];
    if (a + b < N - 1) cells.push([[a + 1, b], [a, b + 1], [a + 1, b + 1]]);
    for (const tri of cells) {
      const verts = tri.map(([i, j]) => { const sa = (i / N) * 100, cl = ((N - i - j) / N) * 100; return pt(sa, cl); });
      const cen = tri.reduce((acc, [i, j]) => { acc.sa += (i / N) * 100; acc.cl += ((N - i - j) / N) * 100; return acc; }, { sa: 0, cl: 0 });
      const cls = usdaTexture(cen.sa / 3, 100 - cen.sa / 3 - cen.cl / 3, cen.cl / 3);
      const fill = CLASS_FILL[cls] || [241, 245, 249];
      doc.setFillColor(...fill);
      doc.triangle(verts[0][0], verts[0][1], verts[1][0], verts[1][1], verts[2][0], verts[2][1], "F");
    }
  }
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.4);
  for (let v = 10; v <= 90; v += 10) {
    let p1 = pt(100 - v, v), p2 = pt(0, v); doc.line(p1[0], p1[1], p2[0], p2[1]);
    p1 = pt(v, 0); p2 = pt(v, 100 - v); doc.line(p1[0], p1[1], p2[0], p2[1]);
    p1 = pt(100 - v, 0); p2 = pt(0, v); doc.line(p1[0], p1[1], p2[0], p2[1]);
  }
  const c = [pt(100, 0), pt(0, 0), pt(0, 100)];
  doc.setDrawColor(...NAVY); doc.setLineWidth(1); doc.line(c[0][0], c[0][1], c[1][0], c[1][1]); doc.line(c[1][0], c[1][1], c[2][0], c[2][1]); doc.line(c[2][0], c[2][1], c[0][0], c[0][1]);
  doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(51, 65, 85);
  REGION_LABELS.forEach(([name, sa, cl]) => { const [x, y] = pt(sa, cl); doc.text(name, x, y, { align: "center" }); });
  if (sand != null && clay != null) { const [x, y] = pt(sand, clay); doc.setFillColor(...ACCENT); doc.circle(x, y, 2.6, "F"); }
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text("percent sand", x0 + size / 2, oy + 16, { align: "center" });
}

export function generateHydrometerPdfBlob(report) {
  const res = report._res || computeHydrometerResults(report);
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const cw = pageWidth - PAGE_MARGIN * 2;

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...NAVY);
  doc.text("Sieve Analysis Test Report", pageWidth / 2, 40, { align: "center" });
  doc.setFontSize(9.5); doc.text("Hydrometer / Sieve · ASTM D422", pageWidth / 2, 54, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...SLATE);
  let y = 72;
  [["Client", report.clientName], ["Project", `${report.projectName || ""}${report.projectNumber ? ` (${report.projectNumber})` : ""}`], ["Sample", report.sampleNumber], ["USDA Classification", report.customClassification || res.texture]]
    .forEach(([k, v], i) => { doc.setFont("helvetica", "bold"); doc.text(`${k}:`, PAGE_MARGIN + (i % 2) * (cw / 2), y + Math.floor(i / 2) * 14); doc.setFont("helvetica", "normal"); doc.text(pv(v) || "-", PAGE_MARGIN + (i % 2) * (cw / 2) + 90, y + Math.floor(i / 2) * 14); });
  y += 34;

  autoTable(doc, {
    startY: y, margin: { left: PAGE_MARGIN, right: pageWidth / 2 + 6 },
    head: [["Sieve", "Unit", "% Pass"]],
    body: res.sieveRows.map((r) => [r.label, r.unit, r.percentPassing != null ? r.percentPassing.toFixed(1) : ""]),
    theme: "grid", styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2.5, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, halign: "center" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 }, columnStyles: { 0: { halign: "left", fontStyle: "bold" } }
  });
  const leftEnd = doc.lastAutoTable.finalY;
  autoTable(doc, {
    startY: y, margin: { left: pageWidth / 2 + 6, right: PAGE_MARGIN },
    head: [["T", "R", "L", "Diam", "% Finer"]],
    body: res.hydroRows.map((h) => [pv(h.time), pv(h.reading), pv(h.depth), f(h.diameter, 4), f(h.percentFiner, 1)]),
    theme: "grid", styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2.5, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, halign: "center" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 }
  });
  y = Math.max(leftEnd, doc.lastAutoTable.finalY) + 10;

  doc.setFillColor(240, 246, 252); doc.setDrawColor(...LINE); doc.roundedRect(PAGE_MARGIN, y, cw, 26, 3, 3, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...NAVY);
  doc.text(`Sand ${f(res.sand, 1)}%   ·   Silt ${f(res.silt, 1)}%   ·   Clay ${f(res.clay, 1)}%`, PAGE_MARGIN + 12, y + 17);
  doc.setTextColor(...ACCENT); doc.text(`USDA: ${report.customClassification || res.texture || "—"}`, pageWidth - PAGE_MARGIN - 12, y + 17, { align: "right" });
  y += 38;

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text("Particle Size Analysis", pageWidth / 2, y, { align: "center" });
  gradationCurve(doc, res.curve, PAGE_MARGIN + 28, y + 12, cw - 36, 200);
  y += 250;

  // Texture triangle (new page if low)
  if (y > doc.internal.pageSize.getHeight() - 240) { doc.addPage("letter", "portrait"); y = 60; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text("USDA Soil Texture", pageWidth / 2, y, { align: "center" });
  const triSize = 280;
  textureTriangle(doc, res.sand, res.clay, (pageWidth - triSize) / 2, y + 20 + triSize * Math.sqrt(3) / 2, triSize);

  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p); const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(PAGE_MARGIN, h - 26, pageWidth - PAGE_MARGIN, h - 26);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`Report No. ${pv(report.reportNumber) || "-"} · ASTM D422 · Confidential laboratory test record`, PAGE_MARGIN, h - 14);
    doc.text(`Page ${p} of ${pages}`, pageWidth - PAGE_MARGIN, h - 14, { align: "right" });
  }
  return doc.output("blob");
}

export function openHydrometerPdf(report, { download = false } = {}) {
  const blob = generateHydrometerPdfBlob(report);
  const url = URL.createObjectURL(blob);
  const fileName = `${report.reportNumber || "Hydrometer-Report"}.pdf`;
  if (download) { const a = document.createElement("a"); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); }
  else window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return url;
}
