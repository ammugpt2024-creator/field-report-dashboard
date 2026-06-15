import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "./supabase.js";

const CONCRETE_REPORT_PDF_BUCKET = "concrete-report-pdfs";
const SIGNED_URL_TTL_SECONDS = 60 * 10;
const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;

const COMPANY_NAME = "Dulles Engineering, Inc.";
const COMPANY_TAGLINE = "Construction Materials Testing & Inspection";
const NAVY = [15, 23, 42];
const SLATE = [71, 85, 105];
const MUTED = [100, 116, 139];
const LINE = [203, 213, 225];
const PAGE_MARGIN = 40;

function safePathSegment(value, fallback = "unassigned") {
  return String(value || fallback).replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function pdfValue(value) {
  return value == null || value === "" ? "-" : String(value);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Unable to cache generated PDF."));
    reader.readAsDataURL(blob);
  });
}

function openDataUrl(dataUrl, { download, fileName }) {
  if (download) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return dataUrl;
  }
  const pdfWindow = window.open("", "_blank", "noopener,noreferrer");
  if (pdfWindow) {
    pdfWindow.document.write(`<iframe title="Concrete Report PDF" src="${dataUrl}" style="border:0;height:100vh;width:100vw"></iframe>`);
    pdfWindow.document.close();
  } else {
    window.open(dataUrl, "_blank", "noopener,noreferrer");
  }
  return dataUrl;
}

function getStoragePath(log, activity, report) {
  return [
    safePathSegment(log.companyId || log.organizationId || "company"),
    safePathSegment(log.projectId || "project"),
    safePathSegment(log.id || "daily-log"),
    safePathSegment(activity.id || "activity"),
    safePathSegment(report.id || "concrete-report"),
    "concrete-report.pdf"
  ].join("/");
}

function formatPdfDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return pdfValue(value);
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
}

// Letterhead band: company identity left, report number/date right, title bar.
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
  doc.text("CONCRETE FIELD TEST REPORT", pageWidth / 2, 98, { align: "center" });
  return 116;
}

// Section header bar.
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

// Two label/value pairs per row, rendered as a clean bordered grid.
function infoGrid(doc, pairs, startY) {
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const [l1, v1] = pairs[i];
    const [l2, v2] = pairs[i + 1] || ["", ""];
    rows.push([l1.toUpperCase(), pdfValue(v1), l2.toUpperCase(), v2 === "" && !pairs[i + 1] ? "" : pdfValue(v2)]);
  }
  autoTable(doc, {
    startY,
    body: rows,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 4, right: 6, bottom: 4, left: 6 }, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, valign: "middle" },
    columnStyles: {
      0: { cellWidth: 120, fontStyle: "bold", fontSize: 7.5, textColor: MUTED, fillColor: [248, 250, 252] },
      1: { cellWidth: "auto", fontStyle: "bold" },
      2: { cellWidth: 120, fontStyle: "bold", fontSize: 7.5, textColor: MUTED, fillColor: [248, 250, 252] },
      3: { cellWidth: "auto", fontStyle: "bold" }
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
  });
  return doc.lastAutoTable.finalY;
}

export function generateConcreteReportPdfBlob(log, activity, report) {
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const attachments = report.attachments || [];
  const photos = attachments.filter((attachment) => attachment.attachmentType === "photo");
  const files = attachments.filter((attachment) => attachment.attachmentType !== "photo");

  let y = drawLetterhead(doc, report) + 6;

  // Project information
  y = sectionBar(doc, "Project Information", y) + 2;
  y = infoGrid(doc, [
    ["Project", log.projectName],
    ["Project Number", log.projectNumber],
    ["Activity", activity.title],
    ["Location", activity.location],
    ["Technician", report.technicianName || log.technicianName],
    ["Date Sampled", report.dateSampled],
    ["Time Sampled", report.timeSampled],
    ["Weather", report.weatherCondition || log.weatherCondition || log.weather],
    ["Temperature", report.temperature || log.temperature || log.maxTemperature]
  ], y) + 14;

  // Specifications
  y = sectionBar(doc, "Specifications", y) + 2;
  y = infoGrid(doc, [
    ["Mix Design No.", report.mixDesignNumber],
    ["Batch Plant / Supplier", report.batchPlantSupplier],
    ["Slump / Spread Range", report.slumpSpreadRange],
    ["Air Content Range", report.airContentRange],
    ["Temperature Range", report.temperatureRange],
    ["Unit Weight", report.unitWeight]
  ], y) + 14;

  // Test records — a true tabular layout
  y = sectionBar(doc, "Test Records", y) + 2;
  const records = report.testRecords || [];
  autoTable(doc, {
    startY: y,
    head: [["#", "Placement Location", "Ticket / Truck", "CY", "Slump", "Air %", "Temp", "Unit Wt."]],
    body: records.length ? records.map((record, index) => [
      index + 1,
      pdfValue(record.placementLocation || report.placementLocation),
      `${pdfValue(record.ticketNumber)} / ${pdfValue(record.truckNumber)}`,
      pdfValue(record.cubicYards),
      pdfValue(record.slump),
      pdfValue(record.airContent),
      pdfValue(record.concreteTemperature),
      pdfValue(record.unitWeight)
    ]) : [[{ content: "No test records entered.", colSpan: 8, styles: { halign: "center", textColor: MUTED, fontStyle: "italic" } }]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, lineColor: LINE, lineWidth: 0.5, textColor: NAVY, valign: "middle" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, halign: "center" },
    columnStyles: {
      0: { cellWidth: 24, halign: "center" },
      3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "center" }, 6: { halign: "center" }, 7: { halign: "center" }
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
  });
  y = doc.lastAutoTable.finalY + 14;

  // Strength verification
  y = sectionBar(doc, "Strength Verification", y) + 2;
  y = infoGrid(doc, report.strengthVerificationRequired ? [
    ["Set Number", report.setNumber],
    ["Lab Cylinders", report.labCylinders || report.labSamples],
    ["Field Cylinders", report.fieldCylinders || report.fieldSamples],
    ["Cylinder IDs", report.cylinderIds],
    ["Break Ages", report.breakAges],
    ["Comments", report.strengthComments]
  ] : [["Strength Verification Required", "No"]], y) + 14;

  // Attachments
  y = sectionBar(doc, "Photos & Attachments", y) + 2;
  y = infoGrid(doc, [
    ["Photos", String(photos.length)],
    ["Attachments", files.map((file) => file.fileName).join(", ") || "None"]
  ], y) + 22;

  // Signature block
  if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = 60; }
  const colWidth = (pageWidth - PAGE_MARGIN * 2 - 30) / 2;
  const sigLineY = y + 36;
  [["Technician", PAGE_MARGIN], ["Reviewed By (QA/QC)", PAGE_MARGIN + colWidth + 30]].forEach(([label, x]) => {
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

  // Footer with page numbers, generated timestamp and confidentiality line, on every page.
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
    doc.text(`${COMPANY_NAME} · Confidential field testing record`, PAGE_MARGIN, h - 22);
    doc.text(`Generated ${formatPdfDateTime(new Date())}`, PAGE_MARGIN, h - 12);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, h - 12, { align: "right" });
  }

  return doc.output("blob");
}

export async function generateAndUploadConcreteReportPdf(log, activity, report) {
  console.info("[Concrete Report PDF] PDF generation started", { dailyLogId: log.id, activityId: activity.id, reportId: report.id });
  const pdfBlob = generateConcreteReportPdfBlob(log, activity, report);
  console.info("[Concrete Report PDF] PDF generated", { reportId: report.id, size: pdfBlob.size });
  const pdfDataUrl = await blobToDataUrl(pdfBlob);
  const storagePath = getStoragePath(log, activity, report);
  console.info("[Concrete Report PDF] Storage upload started", { bucket: CONCRETE_REPORT_PDF_BUCKET, storagePath, size: pdfBlob.size });
  const { error } = await supabase.storage.from(CONCRETE_REPORT_PDF_BUCKET).upload(storagePath, pdfBlob, {
    contentType: "application/pdf",
    upsert: true
  });
  if (error) {
    console.warn("[Concrete Report PDF] Storage upload failed", { bucket: CONCRETE_REPORT_PDF_BUCKET, storagePath, error });
    return {
      pdfStoragePath: "",
      pdf_storage_path: "",
      pdfDataUrl,
      pdfStorageMode: "browser-cache",
      pdfGeneratedAt: new Date().toISOString(),
      pdf_generated_at: new Date().toISOString(),
      pdfGenerationStatus: "generated",
      pdf_generation_status: "generated",
      pdfGenerationFailureReason: "",
      pdf_generation_failure_reason: ""
    };
  }
  console.info("[Concrete Report PDF] Storage upload completed", { bucket: CONCRETE_REPORT_PDF_BUCKET, storagePath });
  return {
    pdfStoragePath: storagePath,
    pdf_storage_path: storagePath,
    pdfGeneratedAt: new Date().toISOString(),
    pdf_generated_at: new Date().toISOString(),
    pdfGenerationStatus: "generated",
    pdf_generation_status: "generated",
    pdfGenerationFailureReason: "",
    pdf_generation_failure_reason: "",
    pdfDataUrl,
    pdfStorageMode: "supabase"
  };
}

export async function openConcreteReportPdf(report, { download = false, fileName = "Concrete-Report.pdf" } = {}) {
  const pdfUrl = await getConcreteReportPdfPreviewUrl(report, { download, fileName });
  if (!pdfUrl) throw new Error(report.pdfGenerationFailureReason || report.pdf_generation_failure_reason || "PDF is still being generated. Please try again in a few seconds.");
  if (download) {
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } else if (report.pdfDataUrl && pdfUrl === report.pdfDataUrl) {
    openDataUrl(pdfUrl, { download, fileName });
  } else {
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  }
  return pdfUrl;
}

export async function getConcreteReportPdfPreviewUrl(report, { download = false, fileName = "Concrete-Report.pdf" } = {}) {
  const directUrl =
    report?.finalPdfUrl ||
    report?.final_pdf_url ||
    report?.pdfUrl ||
    report?.pdf_url ||
    report?.generatedPdfUrl ||
    report?.generated_pdf_url ||
    "";
  if (directUrl) return directUrl;

  const storagePath = report.pdfStoragePath || report.pdf_storage_path;
  if (!storagePath && report.pdfDataUrl) {
    return report.pdfDataUrl;
  }
  if (!storagePath) return "";

  const { data, error } = await supabase.storage
    .from(CONCRETE_REPORT_PDF_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, download ? { download: fileName } : undefined);
  if (error || !data?.signedUrl) {
    if (report.pdfDataUrl) return report.pdfDataUrl;
    throw new Error(error?.message || "Unable to open Concrete Report PDF.");
  }
  return data.signedUrl;
}
