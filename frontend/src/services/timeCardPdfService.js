import jsPdfModule from "jspdf";
import { supabase } from "./supabase.js";
import { saveTimeCard } from "./timeCardService.js";
import { getStorageConfigError, logStorageStep } from "./storageDiagnosticsService.js";

const TIME_CARD_PDF_BUCKET = "timesheet-pdfs";
const SIGNED_URL_TTL_SECONDS = 60 * 10;
const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;

function logPdfStep(step, detail = {}) {
  console.info(`[Timesheet PDF] ${step}`, detail);
}

function safePathSegment(value, fallback = "unassigned") {
  return String(value || fallback).replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function pdfValue(value) {
  return value == null || value === "" ? "-" : String(value);
}

function getTimesheetNumber(card) {
  return card.timesheetNumber || card.timesheet_number || `TS-${String(card.id || "").slice(0, 8).toUpperCase()}`;
}

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return pdfValue(value);
  return parsed.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return pdfValue(value);
  return parsed.toLocaleString(undefined, { month: "short", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatTime(value) {
  if (!value) return "-";
  const [hours, minutes] = String(value).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return pdfValue(value);
  const parsed = new Date();
  parsed.setHours(hours, minutes, 0, 0);
  return parsed.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function normalizeStatus(value) {
  return pdfValue(value).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function addSectionHeader(doc, title, x, y, width) {
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(x, y, width, 20, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), x + 10, y + 13);
}

function addInfoBox(doc, label, value, x, y, width, height = 42) {
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, width, height, 5, 5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(label.toUpperCase(), x + 10, y + 13);
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const lines = doc.splitTextToSize(pdfValue(value), width - 20);
  doc.text(lines.slice(0, 2), x + 10, y + 29);
}

function getSignature(card) {
  return card.technicianSignature || card.technician_signature || card.signatureDataUrl || card.signature_data_url || "";
}

function getImageFormat(dataUrl) {
  if (String(dataUrl).includes("image/jpeg") || String(dataUrl).includes("image/jpg")) return "JPEG";
  return "PNG";
}

function getStoragePath(card) {
  return [
    safePathSegment(card.companyId || card.organizationId || "company"),
    safePathSegment(card.projectId || "project"),
    safePathSegment(card.id || "time-card"),
    "timesheet.pdf"
  ].join("/");
}

function getFileName(card) {
  return `${safePathSegment(getTimesheetNumber(card))}.pdf`;
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
    pdfWindow.document.write(`<iframe title="Timesheet PDF" src="${dataUrl}" style="border:0;height:100vh;width:100vw"></iframe>`);
    pdfWindow.document.close();
  } else {
    window.open(dataUrl, "_blank", "noopener,noreferrer");
  }
  return dataUrl;
}

export function generateTimeCardPdfBlob(card) {
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter" });
  const margin = 36;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = 34;
  const timesheetNumber = getTimesheetNumber(card);
  const generatedAt = card.pdfGeneratedAt || card.pdf_generated_at || new Date().toISOString();
  const signedAt = card.signedAt || card.signed_at || card.submittedAt || card.submitted_at;
  const signature = getSignature(card);

  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, y, contentWidth, 72, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(`Timesheet ${timesheetNumber}`, margin + 18, y + 28);
  doc.setFontSize(10);
  doc.text(pdfValue(card.projectName), margin + 18, y + 48);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(pageWidth - margin - 122, y + 20, 104, 24, 12, 12, "F");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(normalizeStatus(card.status), pageWidth - margin - 100, y + 36);
  y += 94;

  addSectionHeader(doc, "Timesheet Summary", margin, y, contentWidth);
  y += 30;
  const columnGap = 10;
  const columnWidth = (contentWidth - columnGap * 2) / 3;
  const summaryRows = [
    [
      ["Timesheet Number", timesheetNumber],
      ["Employee", card.technicianName || card.technician_name],
      ["Project", card.projectName]
    ],
    [
      ["Date", formatDate(card.date)],
      ["Shift", card.shift],
      ["Project Number", card.projectNumber || card.project_number]
    ],
    [
      ["Time In", formatTime(card.timeIn || card.time_in)],
      ["Time Out", formatTime(card.timeOut || card.time_out)],
      ["Break", `${pdfValue(card.breakMinutes ?? card.break_minutes ?? 0)} Minutes`]
    ],
    [
      ["Total Hours", `${pdfValue(card.totalHours || card.total_hours)} Hours`],
      ["Submitted", formatDateTime(card.submittedAt || card.submitted_at)],
      ["Approved", formatDateTime(card.approvedAt || card.approved_at)]
    ]
  ];
  summaryRows.forEach((row) => {
    row.forEach(([label, value], index) => {
      addInfoBox(doc, label, value, margin + index * (columnWidth + columnGap), y, columnWidth);
    });
    y += 50;
  });

  y += 6;
  addSectionHeader(doc, "Work Performed", margin, y, contentWidth);
  y += 30;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  const workLines = doc.splitTextToSize(pdfValue(card.workDescription || card.work_description), contentWidth - 24);
  const workHeight = Math.max(64, Math.min(130, workLines.length * 13 + 24));
  doc.roundedRect(margin, y, contentWidth, workHeight, 5, 5, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(workLines, margin + 12, y + 20);
  y += workHeight + 20;

  addSectionHeader(doc, "Technician Signature", margin, y, contentWidth);
  y += 32;
  const signatureBoxWidth = contentWidth * 0.56;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, y, signatureBoxWidth, 72, 5, 5, "FD");
  if (signature) {
    try {
      doc.addImage(signature, getImageFormat(signature), margin + 12, y + 12, signatureBoxWidth - 24, 42);
    } catch {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("Signature image could not be embedded.", margin + 12, y + 34);
    }
  }
  doc.setDrawColor(148, 163, 184);
  doc.line(margin + 12, y + 58, margin + signatureBoxWidth - 12, y + 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("TECHNICIAN SIGNATURE", margin + 12, y + 68);
  addInfoBox(doc, "Date Signed", formatDateTime(signedAt), margin + signatureBoxWidth + 12, y, contentWidth - signatureBoxWidth - 12, 72);

  y = doc.internal.pageSize.getHeight() - 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated ${formatDateTime(generatedAt)}`, margin, y);

  return doc.output("blob");
}

export async function regenerateTimeCardPdf(card) {
  logPdfStep("PDF generation started", { timesheetId: card.id, projectId: card.projectId });
  const pendingCard = saveTimeCard({
    ...card,
    pdfGenerationStatus: "pending",
    pdf_generation_status: "pending",
    pdfGenerationFailureReason: "",
    pdf_generation_failure_reason: "",
    pdfGenerationError: ""
  });

  try {
    const pdfBlob = generateTimeCardPdfBlob(pendingCard);
    logPdfStep("PDF generated", { timesheetId: pendingCard.id, size: pdfBlob.size });
    const pdfDataUrl = await blobToDataUrl(pdfBlob);
    const cachedCard = saveTimeCard({
      ...pendingCard,
      pdfDataUrl,
      pdfStorageMode: "browser-cache"
    });
    const storagePath = getStoragePath(pendingCard);
    logStorageStep("Storage upload started", {
      bucket: TIME_CARD_PDF_BUCKET,
      path: storagePath,
      size: pdfBlob.size
    });
    const { error } = await supabase.storage.from(TIME_CARD_PDF_BUCKET).upload(storagePath, pdfBlob, {
      contentType: "application/pdf",
      upsert: true
    });
    if (error) {
      const storageError = getStorageConfigError(TIME_CARD_PDF_BUCKET, error);
      logStorageStep("Storage upload failed", {
        bucket: TIME_CARD_PDF_BUCKET,
        path: storagePath,
        reason: storageError.message,
        originalReason: error.message
      });
      logPdfStep("PDF upload failed", { timesheetId: pendingCard.id, storagePath, reason: storageError.message });
      return saveTimeCard({
        ...cachedCard,
        pdfGenerationStatus: "failed",
        pdf_generation_status: "failed",
        pdfGenerationFailureReason: storageError.message,
        pdf_generation_failure_reason: storageError.message,
        pdfGenerationError: storageError.message
      });
    }
    logStorageStep("Storage upload completed", {
      bucket: TIME_CARD_PDF_BUCKET,
      path: storagePath
    });
    logPdfStep("PDF uploaded", { timesheetId: pendingCard.id, storagePath });

    const generatedCard = saveTimeCard({
      ...cachedCard,
      pdfStoragePath: storagePath,
      pdf_storage_path: storagePath,
      pdfGeneratedAt: new Date().toISOString(),
      pdf_generated_at: new Date().toISOString(),
      pdfGenerationStatus: "generated",
      pdf_generation_status: "generated",
      pdfGenerationFailureReason: "",
      pdf_generation_failure_reason: "",
      pdfGenerationError: "",
      pdfStorageMode: "supabase"
    });
    logPdfStep("Database updated", { timesheetId: generatedCard.id, storagePath, status: "generated" });
    return generatedCard;
  } catch (error) {
    const failureReason = error.message || "pdf renderer error";
    console.error("Timesheet PDF generation failed", error);
    logPdfStep("PDF generation failed", { timesheetId: pendingCard.id, reason: failureReason });
    const failedCard = saveTimeCard({
      ...pendingCard,
      pdfGenerationStatus: "failed",
      pdf_generation_status: "failed",
      pdfGenerationFailureReason: failureReason,
      pdf_generation_failure_reason: failureReason,
      pdfGenerationError: failureReason
    });
    logPdfStep("Database updated", { timesheetId: failedCard.id, status: "failed", reason: failureReason });
    return failedCard;
  }
}

export async function openTimeCardPdf(card, { download = false } = {}) {
  const storagePath = card.pdfStoragePath || card.pdf_storage_path;
  const fileName = getFileName(card);
  if (!storagePath && card.pdfDataUrl) {
    logPdfStep(download ? "PDF downloaded from browser cache" : "PDF opened from browser cache", { timesheetId: card.id });
    return openDataUrl(card.pdfDataUrl, { download, fileName });
  }
  if (!storagePath) throw new Error(card.pdfGenerationFailureReason || "PDF is still being generated. Please try again in a few seconds.");

  const { data, error } = await supabase.storage
    .from(TIME_CARD_PDF_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) {
    const storageError = getStorageConfigError(TIME_CARD_PDF_BUCKET, error);
    logPdfStep("Signed URL failed", { timesheetId: card.id, storagePath, bucket: TIME_CARD_PDF_BUCKET, reason: storageError.message });
    if (card.pdfDataUrl) return openDataUrl(card.pdfDataUrl, { download, fileName });
    throw storageError;
  }
  logPdfStep("Signed URL created", { timesheetId: card.id, storagePath });

  if (download) {
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return data.signedUrl;
  }

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  return data.signedUrl;
}
