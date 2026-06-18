import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";
import { computeAtterberg } from "./atterbergService";

const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;
const NAVY = [15, 23, 42];
const ACCENT = [189, 93, 58];
const SLATE = [71, 85, 105];
const MUTED = [100, 116, 139];
const LINE = [203, 213, 225];
const GRID = [238, 242, 247];
const PAGE_MARGIN = 40;

const pv = (v) => (v == null || v === "" ? "" : String(v));
const f1 = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? "" : Number(v).toFixed(1));

function plasticityChart(doc, ll, pi, x0, y0, w, h) {
  const xMax = 100, yMax = 60;
  const toX = (x) => x0 + (Math.min(x, xMax) / xMax) * w;
  const toY = (y) => y0 + h - (Math.min(y, yMax) / yMax) * h;
  doc.setDrawColor(...GRID); doc.setLineWidth(0.3);
  for (let x = 0; x <= 100; x += 20) doc.line(toX(x), y0, toX(x), y0 + h);
  for (let y = 0; y <= 60; y += 10) doc.line(x0, toY(y), x0 + w, toY(y));
  doc.setDrawColor(...LINE); doc.setLineWidth(0.6); doc.line(toX(50), y0, toX(50), y0 + h);
  // U-line PI=0.9(LL-8)
  doc.setDrawColor(148, 163, 184); doc.setLineDashPattern([2, 2], 0); doc.setLineWidth(0.6);
  doc.line(toX(8), toY(0), toX(Math.min(8 + yMax / 0.9, xMax)), toY(Math.min(0.9 * (xMax - 8), yMax)));
  doc.setLineDashPattern([], 0);
  // A-line PI=0.73(LL-20)
  doc.setDrawColor(...NAVY); doc.setLineWidth(1); doc.line(toX(20), toY(0), toX(Math.min(20 + yMax / 0.73, xMax)), toY(Math.min(0.73 * (xMax - 20), yMax)));
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...SLATE);
  doc.text("CH", toX(70), toY(40)); doc.text("MH", toX(75), toY(18)); doc.text("CL", toX(30), toY(20)); doc.text("ML", toX(38), toY(6));
  if (ll != null && pi != null && ll <= xMax && pi <= yMax) { doc.setFillColor(...ACCENT); doc.circle(toX(ll), toY(pi), 2.4, "F"); }
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.8); doc.rect(x0, y0, w, h);
  doc.setFontSize(7); doc.setTextColor(...MUTED);
  for (let x = 0; x <= 100; x += 20) doc.text(String(x), toX(x), y0 + h + 10, { align: "center" });
  for (let y = 0; y <= 60; y += 10) doc.text(String(y), x0 - 5, toY(y) + 2.5, { align: "right" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
  doc.text("Liquid Limit (LL)", x0 + w / 2, y0 + h + 22, { align: "center" });
  doc.text("Plasticity Index (PI)", x0 - 28, y0 + h / 2, { align: "center", angle: 90 });
}

function flowChart(doc, att, x0, y0, w, h) {
  const pts = att.llTrials.filter((t) => Number(t.blows) > 0 && t.moisture != null).map((t) => ({ n: Number(t.blows), w: t.moisture }));
  const ws = [...pts.map((p) => p.w), att.ll].filter((v) => v != null);
  if (!ws.length) return;
  const yMin = Math.floor(Math.min(...ws) - 2), yMax = Math.ceil(Math.max(...ws) + 2);
  const toX = (n) => x0 + (Math.log10(n) - 1) / (Math.log10(60) - 1) * w;
  const toY = (v) => y0 + h - (v - yMin) / (yMax - yMin || 1) * h;
  const ticks = [10, 15, 20, 25, 30, 40, 60];
  doc.setDrawColor(...GRID); doc.setLineWidth(0.3);
  ticks.forEach((n) => doc.line(toX(n), y0, toX(n), y0 + h));
  const yTicks = []; const step = Math.max(1, Math.round((yMax - yMin) / 6));
  for (let v = yMin; v <= yMax; v += step) { yTicks.push(v); doc.line(x0, toY(v), x0 + w, toY(v)); }
  doc.setDrawColor(148, 163, 184); doc.setLineDashPattern([2, 2], 0); doc.setLineWidth(0.6);
  doc.line(toX(25), y0, toX(25), y0 + h); doc.setLineDashPattern([], 0);
  if (att.flowFit) {
    const ns = pts.map((p) => p.n);
    const xa = Math.min(...ns, 25), xb = Math.max(...ns, 25);
    doc.setDrawColor(...NAVY); doc.setLineWidth(1.4);
    doc.line(toX(xa), toY(att.flowFit.m * Math.log10(xa) + att.flowFit.b), toX(xb), toY(att.flowFit.m * Math.log10(xb) + att.flowFit.b));
  }
  doc.setFillColor(...NAVY); pts.forEach((p) => doc.circle(toX(p.n), toY(p.w), 1.6, "F"));
  if (att.ll != null && att.ll >= yMin && att.ll <= yMax) { doc.setDrawColor(...ACCENT); doc.setLineWidth(1.2); doc.circle(toX(25), toY(att.ll), 2.4, "S"); }
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.8); doc.rect(x0, y0, w, h);
  doc.setFontSize(7); doc.setTextColor(...MUTED);
  ticks.forEach((n) => doc.text(String(n), toX(n), y0 + h + 10, { align: "center" }));
  yTicks.forEach((v) => doc.text(String(v), x0 - 4, toY(v) + 2.5, { align: "right" }));
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
  doc.text("Number of Blows (log)", x0 + w / 2, y0 + h + 22, { align: "center" });
  doc.text("Moisture, %", x0 - 28, y0 + h / 2, { align: "center", angle: 90 });
}

export function generateAtterbergPdfBlob(report) {
  const att = report._att || computeAtterberg(report);
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const cw = pageWidth - PAGE_MARGIN * 2;

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...NAVY);
  doc.text("Atterberg Limits", pageWidth / 2, 44, { align: "center" });
  doc.setFontSize(9.5); doc.text("ASTM D4318", pageWidth / 2, 58, { align: "center" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text(`Boring / Sample: ${pv(report.boringNumber) || "-"}`, PAGE_MARGIN, 76);
  if (report.projectName) { doc.setFont("helvetica", "normal"); doc.setTextColor(...SLATE); doc.text(`${report.projectName}${report.projectNumber ? `  ·  ${report.projectNumber}` : ""}`, pageWidth - PAGE_MARGIN, 76, { align: "right" }); }

  let y = 88;
  // LL trials
  const showCorr = att.llMethod === "onepoint";
  autoTable(doc, {
    startY: y, margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }, tableWidth: cw,
    head: [[`Liquid Limit — ${att.llMethod === "onepoint" ? "One-Point" : "Multipoint"}`, "Blows", "Tare+Wet", "Tare+Dry", "Tare", "MC %", showCorr ? "Corr LL" : "—"]],
    body: att.llTrials.map((t, i) => [i === 0 ? "Trial A" : i === 1 ? "Trial B" : `Trial ${i + 1}`, pv(t.blows), pv(t.tareWet), pv(t.tareDry), pv(t.tare), f1(t.moisture), showCorr ? (t.corrected != null ? t.corrected.toFixed(0) : "") : ""]),
    theme: "grid", styles: { font: "helvetica", fontSize: 8, cellPadding: 3, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, halign: "center" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } }
  });
  y = doc.lastAutoTable.finalY + 8;
  // PL trials
  autoTable(doc, {
    startY: y, margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }, tableWidth: cw,
    head: [["Plastic Limit", "Tare+Wet", "Tare+Dry", "Tare", "PL %"]],
    body: att.plTrials.map((t, i) => [i === 0 ? "Trial A" : i === 1 ? "Trial B" : `Trial ${i + 1}`, pv(t.tareWet), pv(t.tareDry), pv(t.tare), f1(t.moisture)]),
    theme: "grid", styles: { font: "helvetica", fontSize: 8, cellPadding: 3, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, halign: "center" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } }
  });
  y = doc.lastAutoTable.finalY + 10;

  // Results callout
  doc.setFillColor(240, 246, 252); doc.setDrawColor(...LINE); doc.roundedRect(PAGE_MARGIN, y, cw, 26, 3, 3, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...NAVY);
  doc.text(`LL ${att.nonPlastic ? "NP" : pv(att.ll)}   ·   PL ${att.nonPlastic ? "NP" : pv(att.pl)}   ·   PI ${pv(att.pi)}`, PAGE_MARGIN + 12, y + 17);
  doc.setTextColor(...ACCENT);
  doc.text(`Classification: ${report.customClassification || att.classification || "—"}`, pageWidth - PAGE_MARGIN - 12, y + 17, { align: "right" });
  y += 38;

  // Charts
  const chartW = att.llMethod === "onepoint" ? cw * 0.7 : (cw - 16) / 2;
  if (att.llMethod !== "onepoint") {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...NAVY);
    doc.text("Flow Curve", PAGE_MARGIN + chartW / 2, y, { align: "center" });
    flowChart(doc, att, PAGE_MARGIN + 28, y + 8, chartW - 36, 180);
  }
  const px = att.llMethod === "onepoint" ? PAGE_MARGIN + (cw - chartW) / 2 : PAGE_MARGIN + chartW + 16 + 28;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...NAVY);
  doc.text("Plasticity Chart", px + (chartW - 36) / 2, y, { align: "center" });
  plasticityChart(doc, att.ll, att.pi, px, y + 8, chartW - 36, 180);
  y += 220;

  if (String(report.remarks || "").trim()) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...NAVY); doc.text("Remarks:", PAGE_MARGIN, y);
    doc.setFont("helvetica", "normal"); doc.text(doc.splitTextToSize(String(report.remarks), cw - 56), PAGE_MARGIN + 54, y);
  }

  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(PAGE_MARGIN, h - 26, pageWidth - PAGE_MARGIN, h - 26);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text(`Report No. ${pv(report.reportNumber) || "-"} · ASTM D4318 · Confidential laboratory test record`, PAGE_MARGIN, h - 14);

  return doc.output("blob");
}

export function openAtterbergPdf(report, { download = false } = {}) {
  const blob = generateAtterbergPdfBlob(report);
  const url = URL.createObjectURL(blob);
  const fileName = `${report.reportNumber || "Atterberg-Report"}.pdf`;
  if (download) { const a = document.createElement("a"); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); }
  else window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return url;
}
