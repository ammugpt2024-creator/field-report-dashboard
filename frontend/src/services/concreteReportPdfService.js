import jsPdfModule from "jspdf";
import { supabase } from "./supabase.js";

const CONCRETE_REPORT_PDF_BUCKET = "concrete-report-pdfs";
const SIGNED_URL_TTL_SECONDS = 60 * 10;
const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;

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

function addSectionTitle(doc, title, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 36, y);
  return y + 16;
}

function addRows(doc, rows, y) {
  rows.forEach(([label, value]) => {
    if (y > 720) {
      doc.addPage();
      y = 42;
    }
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(36, y, 540, 32, 4, 4, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), 48, y + 12);
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(pdfValue(value), 500), 48, y + 26);
    y += 40;
  });
  return y;
}

export function generateConcreteReportPdfBlob(log, activity, report) {
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter" });
  let y = 42;
  const attachments = report.attachments || [];
  const photos = attachments.filter((attachment) => attachment.attachmentType === "photo");
  const files = attachments.filter((attachment) => attachment.attachmentType !== "photo");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("Concrete Report", 36, y);
  y += 22;
  y += 8;

  y = addSectionTitle(doc, "Project Information", y);
  y = addRows(doc, [
    ["Project", log.projectName],
    ["Project Number", log.projectNumber],
    ["Activity", activity.title],
    ["Location", activity.location],
    ["Technician", report.technicianName || log.technicianName],
    ["Date Sampled", report.dateSampled],
    ["Time Sampled", report.timeSampled],
    ["Weather", report.weatherCondition || log.weatherCondition || log.weather],
    ["Temperature", report.temperature || log.temperature || log.maxTemperature]
  ], y);

  y += 8;
  y = addSectionTitle(doc, "Specifications", y);
  y = addRows(doc, [
    ["Mix Design Number", report.mixDesignNumber],
    ["Batch Plant / Supplier", report.batchPlantSupplier],
    ["Slump / Spread Range", report.slumpSpreadRange],
    ["Air Content Range", report.airContentRange],
    ["Temperature Range", report.temperatureRange],
    ["Unit Weight", report.unitWeight]
  ], y);

  y += 8;
  y = addSectionTitle(doc, "Test Records", y);
  (report.testRecords || []).forEach((record, index) => {
    y = addRows(doc, [
      [`Record ${index + 1}`, record.placementLocation || report.placementLocation],
      ["Ticket / Truck", `${pdfValue(record.ticketNumber)} / ${pdfValue(record.truckNumber)}`],
      ["Cubic Yards", record.cubicYards],
      ["Times", `Batched ${pdfValue(record.timeBatched)} | Arrival ${pdfValue(record.arrivalTime)} | Tested ${pdfValue(record.timeTested)}`],
      ["Slump / Air / Temp", `${pdfValue(record.slump)} / ${pdfValue(record.airContent)} / ${pdfValue(record.concreteTemperature)}`],
      ["Water Added / Unit Weight", `${pdfValue(record.waterAdded)} / ${pdfValue(record.unitWeight)}`],
      ["Comments", record.comments]
    ], y);
  });
  if (!(report.testRecords || []).length) y = addRows(doc, [["Test Records", "No test records entered."]], y);

  y += 8;
  y = addSectionTitle(doc, "Strength Verification", y);
  y = addRows(doc, report.strengthVerificationRequired ? [
    ["Set Number", report.setNumber],
    ["Lab Cylinders", report.labCylinders || report.labSamples],
    ["Field Cylinders", report.fieldCylinders || report.fieldSamples],
    ["Cylinder IDs", report.cylinderIds],
    ["Break Ages", report.breakAges],
    ["Comments", report.strengthComments]
  ] : [["Strength Verification Required", "No"]], y);

  y += 8;
  y = addSectionTitle(doc, "Photos & Attachments", y);
  y = addRows(doc, [
    ["Photos", photos.length],
    ["Attachments", files.map((file) => file.fileName).join(", ") || "None"]
  ], y);

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
