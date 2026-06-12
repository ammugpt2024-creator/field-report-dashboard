import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "./supabase.js";
import { saveTimeCard, WEEK_DAYS, getRowTotal } from "./timeCardService.js";
import { getStorageConfigError, logStorageStep } from "./storageDiagnosticsService.js";

const TIME_CARD_PDF_BUCKET = "timesheet-pdfs";
const COMPANY_NAME = "Dulles Engineering, Inc.";

// Session-only cache of generated PDFs. Data URLs are too large for localStorage
// (a handful of timesheets exceeds the quota), so the durable copy lives in
// Supabase storage and this map only bridges the gap until upload completes.
const pdfDataUrlCache = new Map();
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

const DAY_LABELS = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };

function hoursText(value) {
  return (Number(value) || 0).toFixed(2);
}

export function generateTimeCardPdfBlob(card) {
  const doc = new JsPDFConstructor({ orientation: "landscape", unit: "pt", format: "letter" });
  const margin = 36;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = 34;
  const timesheetNumber = getTimesheetNumber(card);
  const generatedAt = card.pdfGeneratedAt || card.pdf_generated_at || new Date().toISOString();
  const projectRows = Array.isArray(card.projectRows) ? card.projectRows : [];
  const dailyTotals = card.dailyTotals || {};
  const comments = card.timesheetComments || card.timesheet_comments || card.comments || "";
  const weekStart = card.weekStartDate || card.week_start_date || card.date;
  const weekEnd = card.weekEndDate || card.week_end_date;
  const totalRegular = card.totalRegularHours || card.total_regular_hours || "0.00";
  const totalOvertime = card.totalOvertimeHours || card.total_overtime_hours || "0.00";
  const totalHours = card.totalHours || card.total_hours || "0.00";
  const company = card.companyName || card.company_name || COMPANY_NAME;
  // Approval details only belong on the post-approval version of the document;
  // the technician's submitted copy shows just the employee certification.
  const isApproved = ["approved", "completed"].includes(String(card.status || "").toLowerCase());

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text("Weekly Timesheet", margin, y + 20);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${pdfValue(card.technicianName || card.technician_name)} | Week Ending ${formatDate(weekEnd)}`, margin, y + 38);
  doc.setFont("helvetica", "bold");
  doc.text(normalizeStatus(card.status), pageWidth - margin, y + 20, { align: "right" });
  y += 62;

  addSectionHeader(doc, "Timesheet Summary", margin, y, contentWidth);
  y += 30;
  const columnGap = 10;
  const columnWidth = (contentWidth - columnGap * 3) / 4;
  const summaryRows = [
    [
      ["Timesheet Number", timesheetNumber],
      ["Employee", card.technicianName || card.technician_name],
      ["Company", company],
      ["Status", normalizeStatus(card.status)]
    ],
    [
      ["Week Start", formatDate(weekStart)],
      ["Week End", formatDate(weekEnd)],
      ["Submitted", formatDateTime(card.submittedAt || card.submitted_at)],
      ...(isApproved ? [["Approved", formatDateTime(card.approvedAt || card.approved_at)]] : [["", ""]])
    ],
    (card.overtimeExempt || card.overtime_exempt)
      ? [
          ["Regular Hours", `${pdfValue(totalRegular)} Hours`],
          ["Overtime", "Exempt (Office)"],
          ["Total Hours", `${pdfValue(totalHours)} Hours`],
          ["", ""]
        ]
      : [
          ["Regular Hours (first 40)", `${pdfValue(totalRegular)} Hours`],
          ["Overtime Hours (40+)", `${pdfValue(totalOvertime)} Hours`],
          ["Total Hours", `${pdfValue(totalHours)} Hours`],
          ["", ""]
        ]
  ];
  summaryRows.forEach((row) => {
    row.forEach(([label, value], index) => {
      if (!label) return;
      addInfoBox(doc, label, value, margin + index * (columnWidth + columnGap), y, columnWidth);
    });
    y += 50;
  });

  y += 6;
  addSectionHeader(doc, "Weekly Hours", margin, y, contentWidth);
  y += 28;
  const dayColWidth = 56;
  const totalColWidth = 64;
  const projectColWidth = contentWidth - dayColWidth * WEEK_DAYS.length - totalColWidth;
  const dayColumnStyles = WEEK_DAYS.reduce((styles, _day, index) => ({
    ...styles,
    [index + 1]: { cellWidth: dayColWidth, halign: "center" }
  }), {});
  autoTable(doc, {
    startY: y,
    head: [["Project", ...WEEK_DAYS.map((day) => DAY_LABELS[day]), "Total"]],
    body: [
      ...projectRows.map((row) => [
        `${row.projectName || row.project_name || "-"}${(row.projectNumber || row.project_number) ? ` (#${row.projectNumber || row.project_number})` : ""}`,
        ...WEEK_DAYS.map((day) => hoursText(row.hours?.[day])),
        hoursText(getRowTotal(row))
      ]),
      ["Daily Total", ...WEEK_DAYS.map((day) => hoursText(dailyTotals[day])), hoursText(totalHours)]
    ],
    theme: "grid",
    margin: { left: margin, right: margin, bottom: 34 },
    tableWidth: contentWidth,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
      lineColor: [203, 213, 225],
      lineWidth: 0.35,
      textColor: [15, 23, 42],
      valign: "middle"
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center"
    },
    columnStyles: {
      0: { cellWidth: projectColWidth, halign: "left", fontStyle: "bold" },
      ...dayColumnStyles,
      [WEEK_DAYS.length + 1]: { cellWidth: totalColWidth, halign: "right", fontStyle: "bold" }
    },
    didParseCell: (data) => {
      if (data.row.index === projectRows.length && data.section === "body") {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = "bold";
      }
    }
  });
  y = (doc.lastAutoTable?.finalY || y) + 16;

  if (String(comments).trim()) {
    addSectionHeader(doc, "Weekly Comments", margin, y, contentWidth);
    y += 26;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    const commentLines = doc.splitTextToSize(String(comments), contentWidth - 20);
    const commentsHeight = Math.max(40, commentLines.length * 12 + 16);
    doc.roundedRect(margin, y, contentWidth, commentsHeight, 5, 5, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(commentLines, margin + 10, y + 16);
    y += commentsHeight + 16;
  }

  // Timesheet approval is an electronic decision, not a wet signature — show
  // who approved and when. The section only appears on the post-approval
  // version of the document.
  if (isApproved) {
    const approvalComments = card.reviewComments || card.review_comments || card.managerComment || "";
    const approvalBlockHeight = String(approvalComments).trim() ? 140 : 86;
    if (y + approvalBlockHeight > doc.internal.pageSize.getHeight() - 24) {
      doc.addPage();
      y = 34;
    }
    addSectionHeader(doc, "Approval", margin, y, contentWidth);
    y += 32;
    addInfoBox(doc, "Approved By", card.reviewedBy || card.reviewed_by || "Manager", margin, y, columnWidth);
    addInfoBox(doc, "Approval Date", formatDateTime(card.reviewedAt || card.reviewed_at || card.approvedAt || card.approved_at), margin + columnWidth + columnGap, y, columnWidth);
    if (String(approvalComments).trim()) {
      y += 54;
      addInfoBox(doc, "Review Comments", approvalComments, margin, y, contentWidth);
    }
  }

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
    pdfDataUrlCache.set(pendingCard.id, pdfDataUrl);
    const cachedCard = saveTimeCard({
      ...pendingCard,
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
  const cachedDataUrl = card.pdfDataUrl || pdfDataUrlCache.get(card.id);
  if (!storagePath && cachedDataUrl) {
    logPdfStep(download ? "PDF downloaded from browser cache" : "PDF opened from browser cache", { timesheetId: card.id });
    return openDataUrl(cachedDataUrl, { download, fileName });
  }
  if (!storagePath) throw new Error(card.pdfGenerationFailureReason || "PDF is still being generated. Please try again in a few seconds.");

  const { data, error } = await supabase.storage
    .from(TIME_CARD_PDF_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) {
    const storageError = getStorageConfigError(TIME_CARD_PDF_BUCKET, error);
    logPdfStep("Signed URL failed", { timesheetId: card.id, storagePath, bucket: TIME_CARD_PDF_BUCKET, reason: storageError.message });
    if (cachedDataUrl) return openDataUrl(cachedDataUrl, { download, fileName });
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
