import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { supabase } from "./supabase.js";
import { saveDailyLog } from "./dailyLogService.js";
import { getStorageConfigError, logStorageStep } from "./storageDiagnosticsService.js";

const DAILY_LOG_PDF_BUCKET = "daily-log-pdfs";
const SIGNED_URL_TTL_SECONDS = 60 * 10;
const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;
const PAGE_MARGIN = 42;
const PAGE_BOTTOM_MARGIN = 40;
const LOCAL_PDF_CACHE_LIMIT_BYTES = 2_500_000;
const COMPANY_NAME = "Dulles Engineering, Inc.";
const COMPANY_LOGO_URL = "https://img1.wsimg.com/isteam/ip/5d283b38-0950-4c46-838b-44766d9a75d2/DULLES%20ENGINEERING_new%20logo.png/%3A/rs%3Dh%3A78%2Ccg%3Atrue%2Cm/qt%3Dq%3A95";
const PDF_COLORS = {
  navy: [15, 23, 42],
  blue: [37, 99, 235],
  green: [4, 120, 87],
  amber: [180, 83, 9],
  red: [185, 28, 28],
  slate: [71, 85, 105],
  muted: [100, 116, 139],
  line: [226, 232, 240],
  soft: [248, 250, 252],
  paleBlue: [239, 246, 255],
  white: [255, 255, 255]
};

function pdfValue(value) {
  return value == null || value === "" ? "-" : String(value);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return pdfValue(value);
  return date.toLocaleString();
}

function getPageWidth(doc) {
  return doc.internal.pageSize.getWidth();
}

function getPageHeight(doc) {
  return doc.internal.pageSize.getHeight();
}

function getContentWidth(doc) {
  return getPageWidth(doc) - PAGE_MARGIN * 2;
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function formatStatus(value) {
  const key = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  const labels = {
    draft: "Draft",
    in_progress: "In Progress",
    ready_for_review: "Ready for Review",
    submitted: "Submitted",
    pending: "Pending",
    pending_review: "Pending Review",
    pending_manager_review: "Pending Manager Review",
    approved: "Approved",
    completed: "Completed",
    returned: "Returned",
    pass: "Pass",
    passed: "Pass",
    fail: "Fail",
    failed: "Fail",
    retest: "Retest",
    yes: "Required",
    no: "No"
  };
  return labels[key] || titleCase(value) || "-";
}

function getProjectName(log) {
  return log.projectName || log.project_name || log.project?.name || "Project";
}

function getProjectNumber(log) {
  return log.projectNumber || log.project_number || log.project?.project_number || log.project?.number || "-";
}

function getDailyReportNumber(log) {
  const explicitNumber = log.logNumber || log.log_number || log.reportNumber || log.report_number || log.dailyLogNumber || log.daily_log_number;
  if (explicitNumber && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(explicitNumber))) return explicitNumber;
  const projectPart = safePathSegment(getProjectNumber(log), "PROJECT").toUpperCase();
  const datePart = safePathSegment(log.date || log.reportDate || log.report_date, "DATE").replace(/-/g, "");
  return `DL-${projectPart}-${datePart}`;
}

function getLogDate(log) {
  return log.date || log.reportDate || log.report_date || "-";
}

function getTechnicianName(log) {
  return log.technicianName || log.technician_name || log.fieldEngineerName || log.field_engineer_name || "Technician";
}

function getProjectLocation(log) {
  return log.projectLocation || log.project_location || log.location || log.project?.location || "-";
}

function getActivityName(activity, index) {
  return activity.activityName || activity.activity_name || activity.title || activity.name || `Activity ${index + 1}`;
}

function getActivityType(activity) {
  return formatStatus(activity.type || activity.activityType || activity.activity_type || "General Work Log");
}

function getAttachmentStoragePath(attachment = {}) {
  return attachment.storagePath ||
    attachment.storage_path ||
    attachment.filePath ||
    attachment.file_path ||
    attachment.objectPath ||
    attachment.object_path ||
    attachment.path ||
    "";
}

function normalizeOwnerId(value) {
  return value == null || value === "" ? "" : String(value);
}

function normalizeOwnerName(value) {
  return String(value || "").trim().toLowerCase();
}

function recordMatchesLogCompany(record, log) {
  const expectedIds = [log?.companyId, log?.company_id, log?.organizationId, log?.organization_id]
    .filter(Boolean)
    .map(String);
  const expectedNames = [log?.companyName, log?.company_name, log?.organizationName, log?.organization_name]
    .map(normalizeOwnerName)
    .filter(Boolean);

  if (!expectedIds.length && !expectedNames.length) return true;

  const recordIds = [record?.companyId, record?.company_id, record?.organizationId, record?.organization_id]
    .filter(Boolean)
    .map(String);
  const recordNames = [record?.companyName, record?.company_name, record?.organizationName, record?.organization_name]
    .map(normalizeOwnerName)
    .filter(Boolean);

  if (recordIds.length) return recordIds.some((id) => expectedIds.includes(id));
  if (recordNames.length) return recordNames.some((name) => expectedNames.includes(name));

  const storagePath = getAttachmentStoragePath(record);
  return storagePath && expectedIds.length ? expectedIds.some((id) => storagePath.includes(id)) : true;
}

function recordMatchesLogTechnician(record, log) {
  const expectedIds = [
    log?.userId,
    log?.user_id,
    log?.technicianId,
    log?.technician_id,
    log?.createdBy,
    log?.created_by
  ].filter(Boolean).map(String);
  const expectedNames = [
    log?.technicianName,
    log?.technician_name,
    log?.createdByName,
    log?.created_by_name
  ].map(normalizeOwnerName).filter(Boolean);

  if (!expectedIds.length && !expectedNames.length) return true;

  const recordIds = [
    record?.userId,
    record?.user_id,
    record?.technicianId,
    record?.technician_id,
    record?.uploadedById,
    record?.uploaded_by_id,
    record?.createdBy,
    record?.created_by
  ].filter(Boolean).map(String);
  const recordNames = [
    record?.uploadedBy,
    record?.uploaded_by,
    record?.technicianName,
    record?.technician_name,
    record?.createdByName,
    record?.created_by_name
  ].map(normalizeOwnerName).filter(Boolean);

  if (recordIds.length) return recordIds.some((id) => expectedIds.includes(id));
  if (recordNames.length) return recordNames.some((name) => expectedNames.includes(name));
  return true;
}

function recordBelongsToLogOwner(record, log) {
  return recordMatchesLogCompany(record, log) && recordMatchesLogTechnician(record, log);
}

function attachmentMatchesOwner(attachment, ownerKeys, ownerId) {
  const expectedId = normalizeOwnerId(ownerId);
  if (!expectedId) return true;

  const explicitId = ownerKeys
    .map((key) => normalizeOwnerId(attachment?.[key]))
    .find(Boolean);

  if (explicitId) return explicitId === expectedId;

  const storagePath = getAttachmentStoragePath(attachment);
  return storagePath ? storagePath.includes(expectedId) : true;
}

function attachmentBelongsToDailyLog(attachment, log) {
  return attachmentMatchesOwner(attachment, ["dailyLogId", "daily_log_id"], log?.id);
}

function attachmentBelongsToActivity(attachment, activity) {
  return attachmentMatchesOwner(attachment, ["activityId", "activity_id"], activity?.id);
}

function attachmentBelongsToReport(attachment, report) {
  return attachmentMatchesOwner(attachment, ["reportId", "report_id", "concreteReportId", "concrete_report_id"], report?.id || report?.linkedReportId || report?.linked_report_id);
}

function recordBelongsToDailyLog(record, log) {
  return attachmentMatchesOwner(record, ["dailyLogId", "daily_log_id"], log?.id);
}

function recordBelongsToActivity(record, activity) {
  return attachmentMatchesOwner(record, ["activityId", "activity_id"], activity?.id);
}

function getActivityAttachments(activity, log) {
  const attachments = Array.isArray(activity?.attachments) ? activity.attachments : [];
  const photos = Array.isArray(activity?.photos) ? activity.photos : [];
  return [...attachments, ...photos]
    .filter((attachment) => recordBelongsToLogOwner(attachment, log))
    .filter((attachment) => attachmentBelongsToDailyLog(attachment, log))
    .filter((attachment) => attachmentBelongsToActivity(attachment, activity));
}

function getReportAttachments(report, activity, log) {
  return (Array.isArray(report?.attachments) ? report.attachments : [])
    .filter((attachment) => recordBelongsToLogOwner(attachment, log))
    .filter((attachment) => attachmentBelongsToDailyLog(attachment, log))
    .filter((attachment) => attachmentBelongsToActivity(attachment, activity))
    .filter((attachment) => attachmentBelongsToReport(attachment, report));
}

function isPhotoAttachment(attachment) {
  const type = `${attachment?.attachmentType || attachment?.attachment_type || ""} ${getAttachmentType(attachment)}`.toLowerCase();
  return type.includes("photo") || type.includes("image/");
}

function getAllReports(log) {
  return (log.activities || []).flatMap((activity) => getScopedActivityReports(activity, log));
}

function getAllAttachments(log) {
  return (log.activities || []).flatMap((activity) => {
    const reportAttachments = getScopedActivityReports(activity, log).flatMap((report) => getReportAttachments(report, activity, log));
    return [...getActivityAttachments(activity, log), ...reportAttachments];
  });
}

function getWeatherText(log) {
  const condition = pdfValue(log.weatherCondition || log.weather);
  const min = log.minTemperature || log.min_temperature;
  const max = log.maxTemperature || log.max_temperature;
  const tempText = [min ? `Min ${min}°F` : "", max ? `Max ${max}°F` : ""].filter(Boolean).join(" / ");
  return tempText ? `${condition} (${tempText})` : condition;
}

function getReportSpecificationValue(report, keys) {
  const specs = report?.specifications || {};
  for (const key of keys) {
    const value = specs[key] ?? report?.[key];
    if (value != null && value !== "") return value;
  }
  return "";
}

function getDullesLogoDataUrl() {
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 120;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#1b75bb";
  context.lineWidth = 10;
  context.beginPath();
  context.moveTo(20, 96);
  context.lineTo(72, 20);
  context.lineTo(124, 96);
  context.stroke();
  context.strokeStyle = "#111827";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(72, 22);
  context.lineTo(72, 98);
  context.moveTo(46, 98);
  context.lineTo(98, 98);
  context.stroke();
  context.fillStyle = "#1b75bb";
  context.font = "700 25px Arial";
  context.fillText("DULLES", 145, 48);
  context.fillStyle = "#111827";
  context.font = "700 25px Arial";
  context.fillText("ENGINEERING", 145, 80);
  return canvas.toDataURL("image/png");
}

function getActivityReports(activity) {
  const concreteReports = Array.isArray(activity?.concreteReports) ? activity.concreteReports : [];
  const legacyReports = Array.isArray(activity?.reports) ? activity.reports : [];
  const reports = [...concreteReports, ...legacyReports];
  const seen = new Set();
  return reports.filter((report) => {
    const key = report?.linkedReportId ||
      report?.linked_report_id ||
      report?.reportId ||
      report?.report_id ||
      report?.id ||
      report?.dfrNumber ||
      report?.dfr_number ||
      report?.reportNumber ||
      report?.report_number;
    const normalizedKey = key ? String(key) : "";
    if (!normalizedKey) return true;
    if (seen.has(normalizedKey)) return false;
    seen.add(normalizedKey);
    return true;
  });
}

function getScopedActivityReports(activity, log) {
  return getActivityReports(activity)
    .filter((report) => recordBelongsToLogOwner(report, log))
    .filter((report) => recordBelongsToDailyLog(report, log))
    .filter((report) => recordBelongsToActivity(report, activity));
}

function getLinkedReportId(report) {
  const reportId = report?.linkedReportId || report?.linked_report_id || report?.reportId || report?.report_id || report?.id;
  return /^\d+$/.test(String(reportId || "")) ? String(reportId) : "";
}

function getReportDfrNumber(report) {
  const specs = report?.specifications || {};
  return specs.dfr_number || report?.dfrNumber || report?.dfr_number || report?.reportNumber || report?.report_number || "Concrete Report";
}

function getReportRecords(report) {
  if (Array.isArray(report?.deliveryRecords) && report.deliveryRecords.length) return report.deliveryRecords;
  if (Array.isArray(report?.testRecords) && report.testRecords.length) return report.testRecords;
  return [];
}

function getAttachmentFileName(attachment) {
  return attachment?.fileName || attachment?.file_name || attachment?.name || "Attachment";
}

function getAttachmentType(attachment) {
  return attachment?.fileType || attachment?.file_type || attachment?.type || attachment?.mimeType || attachment?.mime_type || "";
}

function getAttachmentSource(attachment) {
  return attachment?.dataUrl ||
    attachment?.data_url ||
    attachment?.url ||
    attachment?.downloadUrl ||
    attachment?.download_url ||
    attachment?.fileUrl ||
    attachment?.file_url ||
    attachment?.signedUrl ||
    attachment?.signed_url ||
    attachment?.previewUrl ||
    attachment?.objectUrl ||
    "";
}

function isRenderableImageAttachment(attachment) {
  const source = getAttachmentSource(attachment);
  const type = getAttachmentType(attachment).toLowerCase();
  return source.startsWith("data:image/") || type.startsWith("image/");
}

function isPdfAttachment(attachment) {
  return getAttachmentType(attachment).toLowerCase() === "application/pdf" || /\.pdf$/i.test(getAttachmentFileName(attachment));
}

function getImageFormat(source, attachment) {
  const type = `${source};${getAttachmentType(attachment)}`.toLowerCase();
  if (type.includes("png")) return "PNG";
  if (type.includes("webp")) return "WEBP";
  return "JPEG";
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

async function sourceToDataUrl(source) {
  if (!source) return "";
  if (source.startsWith("data:")) return source;
  try {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    return blobToDataUrl(await response.blob());
  } catch (error) {
    console.warn("[Daily Log PDF] Unable to resolve attachment source", error);
    return "";
  }
}

async function sourceToArrayBuffer(source) {
  if (!source) return null;
  try {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    return await response.arrayBuffer();
  } catch (error) {
    console.warn("[Daily Log PDF] Unable to load PDF attachment", error);
    return null;
  }
}

function getPdfRenderScale(page) {
  const viewport = page.getViewport({ scale: 1 });
  const targetWidth = viewport.width > viewport.height ? 1200 : 950;
  const rawScale = targetWidth / Math.max(viewport.width, 1);
  const maxPixels = 1_800_000;
  const pixelScale = Math.sqrt(maxPixels / Math.max(viewport.width * viewport.height, 1));
  return Math.max(0.85, Math.min(rawScale, pixelScale, 1.6));
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
    pdfWindow.document.write(`<iframe title="Daily Log PDF" src="${dataUrl}" style="border:0;height:100vh;width:100vw"></iframe>`);
    pdfWindow.document.close();
  } else {
    window.open(dataUrl, "_blank", "noopener,noreferrer");
  }
  return dataUrl;
}

function compressImageDataUrl(source, { maxWidth = 1400, maxHeight = 1800, quality = 0.74 } = {}) {
  if (!source?.startsWith("data:image/")) return Promise.resolve(source || "");
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(source);
          return;
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(source);
      }
    };
    image.onerror = () => resolve(source);
    image.src = source;
  });
}

async function hydrateConcreteReportForPdf(report) {
  const linkedReportId = getLinkedReportId(report);
  if (!linkedReportId) return report;

  const [specResponse, rowsResponse] = await Promise.all([
    supabase
      .from("concrete_specifications")
      .select("*")
      .eq("log_id", linkedReportId)
      .maybeSingle(),
    supabase
      .from("concrete_delivery_testing_records")
      .select("*")
      .eq("log_id", linkedReportId)
      .order("id", { ascending: true })
  ]);

  if (specResponse.error && specResponse.error.code !== "PGRST116") {
    console.warn("[Daily Log PDF] Unable to hydrate Concrete Report specifications", specResponse.error);
  }
  if (rowsResponse.error) {
    console.warn("[Daily Log PDF] Unable to hydrate Concrete Report records", rowsResponse.error);
  }

  return {
    ...report,
    specifications: {
      ...(report.specifications || {}),
      ...(specResponse.data || {})
    },
    deliveryRecords: Array.isArray(rowsResponse.data) && rowsResponse.data.length
      ? rowsResponse.data.map((row, index) => ({
          ...row,
          test_number: row.test_number || String(index + 1)
        }))
      : report.deliveryRecords || report.testRecords || []
  };
}

async function hydrateDailyLogForPdf(log) {
  const activities = await Promise.all((log.activities || []).map(async (activity) => {
    const concreteReports = await Promise.all((activity.concreteReports || []).map(hydrateConcreteReportForPdf));
    const legacyReports = await Promise.all((activity.reports || []).map(hydrateConcreteReportForPdf));
    return {
      ...activity,
      concreteReports,
      reports: legacyReports
    };
  }));
  return { ...log, activities };
}

function safePathSegment(value, fallback = "unassigned") {
  return String(value || fallback).replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function getPdfStoragePath(log) {
  return [
    safePathSegment(log.companyId || log.organizationId || "company"),
    safePathSegment(log.projectId || log.project_id || "project"),
    safePathSegment(log.id || "daily-log"),
    "daily-log.pdf"
  ].join("/");
}

function getPdfFileName(log) {
  return `Daily-Field-Log-${safePathSegment(log.projectNumber || log.projectId)}-${safePathSegment(log.date)}-${safePathSegment(log.id)}.pdf`;
}

function setReportFont(doc, weight = "regular", size = 10, color = PDF_COLORS.navy) {
  const style = weight === "semibold" || weight === "medium" ? "bold" : "normal";
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function ensurePage(doc, y, minSpace = 54) {
  if (y + minSpace < getPageHeight(doc) - PAGE_BOTTOM_MARGIN) return y;
  doc.addPage();
  return PAGE_MARGIN;
}

function sectionHeader(doc, title, y, options = {}) {
  y = ensurePage(doc, y, options.minSpace || 42);
  setReportFont(doc, "semibold", 13, PDF_COLORS.navy);
  doc.text(title.toUpperCase(), PAGE_MARGIN, y);
  doc.setDrawColor(...PDF_COLORS.navy);
  doc.setLineWidth(1.2);
  doc.line(PAGE_MARGIN, y + 6, getPageWidth(doc) - PAGE_MARGIN, y + 6);
  doc.setLineWidth(0.2);
  return y + 22;
}

function addPageFooters(doc, log) {
  const pageCount = doc.getNumberOfPages();
  const projectName = getProjectName(log);
  const reportNumber = getDailyReportNumber(log);
  const generatedDate = formatDateTime(log.pdfGeneratedAt || log.pdf_generated_at || new Date().toISOString());

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    const pageWidth = getPageWidth(doc);
    const pageHeight = getPageHeight(doc);
    doc.setDrawColor(...PDF_COLORS.line);
    doc.line(PAGE_MARGIN, pageHeight - 24, pageWidth - PAGE_MARGIN, pageHeight - 24);
    setReportFont(doc, "regular", 7.5, PDF_COLORS.slate);
    doc.text(projectName, PAGE_MARGIN, pageHeight - 12);
    doc.text(reportNumber, pageWidth / 2, pageHeight - 12, { align: "center" });
    doc.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 12, { align: "right" });
    doc.setFontSize(6.5);
    doc.text(`Generated ${generatedDate}`, pageWidth - PAGE_MARGIN, pageHeight - 4, { align: "right" });
  }
}

function drawFieldGrid(doc, rows, y, columns = 4) {
  const gap = 0;
  const cellWidth = (getContentWidth(doc) - gap * (columns - 1)) / columns;
  const cellHeight = 32;
  for (let start = 0; start < rows.length; start += columns) {
    y = ensurePage(doc, y, cellHeight + 8);
    const chunk = rows.slice(start, start + columns);
    chunk.forEach((row, index) => {
      const x = PAGE_MARGIN + index * (cellWidth + gap);
      doc.setDrawColor(...PDF_COLORS.line);
      doc.setFillColor(...((start / columns) % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.soft));
      doc.rect(x, y, cellWidth, cellHeight, "FD");
      setReportFont(doc, "medium", 9, PDF_COLORS.slate);
      doc.text(String(row.label || "").toUpperCase(), x + 7, y + 11);
      setReportFont(doc, "regular", 10, PDF_COLORS.navy);
      doc.text(doc.splitTextToSize(pdfValue(row.value), cellWidth - 14), x + 7, y + 24);
    });
    if (chunk.length < columns) {
      for (let index = chunk.length; index < columns; index += 1) {
        const x = PAGE_MARGIN + index * (cellWidth + gap);
        doc.setDrawColor(...PDF_COLORS.line);
        doc.setFillColor(...((start / columns) % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.soft));
        doc.rect(x, y, cellWidth, cellHeight, "FD");
      }
    }
    y += cellHeight;
  }
  return y + 10;
}

function drawEngineeringTable(doc, rows, y, columns = 2) {
  const cellWidth = getContentWidth(doc) / columns;
  const rowHeight = 25;
  for (let index = 0; index < rows.length; index += 1) {
    if (index % columns === 0) y = ensurePage(doc, y, rowHeight + 10);
    const x = PAGE_MARGIN + (index % columns) * cellWidth;
    doc.setDrawColor(...PDF_COLORS.line);
    doc.setFillColor(...(Math.floor(index / columns) % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.soft));
    doc.rect(x, y, cellWidth, rowHeight, "FD");
    setReportFont(doc, "medium", 9, PDF_COLORS.slate);
    doc.text(String(rows[index].label || "").toUpperCase(), x + 7, y + 10);
    setReportFont(doc, "regular", 10, PDF_COLORS.navy);
    doc.text(doc.splitTextToSize(pdfValue(rows[index].value), cellWidth - 14), x + 7, y + 21);
    if (index % columns === columns - 1 || index === rows.length - 1) y += rowHeight;
  }
  return y + 10;
}

function getRecordField(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value != null && value !== "") return value;
  }
  return "";
}

function formatStrengthRequired(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (value === true || normalized === "yes" || normalized === "required" || normalized === "true") return "Required";
  return "No";
}

function renderRecordsTable(doc, records = [], y) {
  if (!records.length) return y;
  y = ensurePage(doc, y, 64);
  setReportFont(doc, "semibold", 11, PDF_COLORS.navy);
  doc.text("Material Delivery & Field Test Results", PAGE_MARGIN, y);
  setReportFont(doc, "regular", 8.5, PDF_COLORS.slate);
  doc.text(`${records.length} records`, getPageWidth(doc) - PAGE_MARGIN, y, { align: "right" });
  y += 12;

  const tableGroups = [{
    title: "Delivery Tracking",
    columns: [
      { header: "Test #", keys: ["test_number", "testNumber"] },
      { header: "Ticket #", keys: ["ticket_number", "ticketNumber"] },
      { header: "Truck #", keys: ["truck_number", "truckNumber"] },
      { header: "CY", keys: ["cubic_yards", "cubicYards"] },
      { header: "Batch", keys: ["batch_time", "time_batched", "timeBatched"] },
      { header: "Arrival", keys: ["arrival_time", "arrivalTime"] },
      { header: "Tested", keys: ["testing_time", "time_tested", "timeTested"] },
      { header: "Finish", keys: ["finish_unload_time", "finishUnload"] },
      { header: "Minutes", keys: ["actual_minutes", "actualMinutes"] },
      { header: "Result", keys: ["record_result", "row_status", "status"] }
    ]
  }, {
    title: "Field Test Results & Strength Verification",
    columns: [
      { header: "Test #", keys: ["test_number", "testNumber"] },
      { header: "Water", keys: ["water_added_gal", "waterAdded"] },
      { header: "Air °F", keys: ["air_temp_f", "airTemp"] },
      { header: "Conc °F", keys: ["concrete_temp_f", "concreteTemp"] },
      { header: "Slump", keys: ["slump_in", "slump"] },
      { header: "Air %", keys: ["air_content_percent", "airContent"] },
      { header: "Unit Wt", keys: ["unit_weight_lbs_ft3", "unitWeight"] },
      { header: "Spread", keys: ["spread_in", "spread"] },
      { header: "J-Ring", keys: ["j_ring_in", "jRing"] },
      { header: "Strength", keys: ["strength_verification_required", "strengthVerificationRequired"] },
      { header: "Set #", keys: ["set_number", "setNumber"] },
      { header: "Lab", keys: ["lab_samples", "labSamples"] },
      { header: "Field", keys: ["field_samples", "fieldSamples"] },
      { header: "Comments", keys: ["inspector_notes", "comments", "notes"] }
    ]
  }];

  tableGroups.forEach((group) => {
    y = ensurePage(doc, y, 72);
    setReportFont(doc, "medium", 9, PDF_COLORS.slate);
    doc.text(group.title.toUpperCase(), PAGE_MARGIN, y);
    y += 8;
    const body = records.map((record, index) => group.columns.map((column) => {
      if (column.header === "Test #") return pdfValue(getRecordField(record, column.keys) || index + 1);
      if (column.header === "Result") return formatStatus(getRecordField(record, column.keys));
      if (column.header === "Strength") return formatStrengthRequired(getRecordField(record, column.keys));
      return pdfValue(getRecordField(record, column.keys));
    }));

    autoTable(doc, {
      startY: y,
      head: [group.columns.map((column) => column.header)],
      body,
      theme: "grid",
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_MARGIN, bottom: PAGE_BOTTOM_MARGIN + 16 },
      tableWidth: getContentWidth(doc),
      showHead: "everyPage",
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: 4,
        overflow: "linebreak",
        valign: "middle",
        lineColor: PDF_COLORS.line,
        lineWidth: 0.4,
        textColor: PDF_COLORS.navy,
        minCellHeight: 18
      },
      headStyles: {
        fillColor: PDF_COLORS.navy,
        textColor: PDF_COLORS.white,
        fontStyle: "bold",
        fontSize: 8.5,
        halign: "center"
      },
      alternateRowStyles: {
        fillColor: PDF_COLORS.soft
      }
    });
    y = (doc.lastAutoTable?.finalY || y) + 12;
  });

  return y + 2;
}

function addImageToPdf(doc, source, attachment, x, y, maxWidth, maxHeight) {
  if (!source?.startsWith("data:image/")) return 0;
  try {
    const props = doc.getImageProperties(source);
    const ratio = Math.min(maxWidth / props.width, maxHeight / props.height);
    const width = props.width * ratio;
    const height = props.height * ratio;
    doc.addImage(source, getImageFormat(source, attachment), x, y, width, height);
    return height;
  } catch (error) {
    console.warn("[Daily Log PDF] Unable to embed attachment image", error);
    return 0;
  }
}

async function renderPdfAttachment(doc, attachment, y) {
  const source = getAttachmentSource(attachment);
  const arrayBuffer = await sourceToArrayBuffer(source);
  if (!arrayBuffer) {
    y = ensurePage(doc, y, 22);
    setReportFont(doc, "regular", 9, PDF_COLORS.slate);
    doc.text(`PDF attachment unavailable: ${getAttachmentFileName(attachment)}`, PAGE_MARGIN, y);
    return y + 14;
  }

  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const pdf = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;

    setReportFont(doc, "medium", 9, PDF_COLORS.slate);
    doc.text(`Attached PDF: ${getAttachmentFileName(attachment)}`, PAGE_MARGIN, y);
    y += 12;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: getPdfRenderScale(page) });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas rendering is not available.");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;

      const pageImage = canvas.toDataURL("image/jpeg", 0.72);
      const ratio = Math.min(getContentWidth(doc) / canvas.width, (getPageHeight(doc) - PAGE_MARGIN * 2) / canvas.height);
      const width = canvas.width * ratio;
      const height = canvas.height * ratio;
      y = ensurePage(doc, y, height + 22);
      const x = PAGE_MARGIN + (getContentWidth(doc) - width) / 2;
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(255, 255, 255);
      doc.rect(x - 4, y - 4, width + 8, height + 8, "FD");
      doc.addImage(pageImage, "JPEG", x, y, width, height, undefined, "FAST");
      y += height + 14;
    }
  } catch (error) {
    console.warn("[Daily Log PDF] Unable to render PDF attachment", error);
    y = ensurePage(doc, y, 22);
    setReportFont(doc, "regular", 9, PDF_COLORS.slate);
    doc.text(`PDF attachment could not be rendered: ${getAttachmentFileName(attachment)}`, PAGE_MARGIN, y);
    y += 14;
  }
  return y;
}

async function renderPhotoGallery(doc, photos, y) {
  if (!photos.length) return y;
  setReportFont(doc, "semibold", 11, PDF_COLORS.navy);
  y = ensurePage(doc, y, 44);
  doc.text("Photos", PAGE_MARGIN, y);
  y += 10;
  const gap = 14;
  const columns = 2;
  const imageWidth = (getContentWidth(doc) - gap) / columns;
  const maxImageHeight = 170;

  for (let index = 0; index < photos.length; index += columns) {
    const row = photos.slice(index, index + columns);
    y = ensurePage(doc, y, maxImageHeight + 34);
    let rowHeight = 0;
    const rendered = [];
    for (const [rowIndex, attachment] of row.entries()) {
      const source = await compressImageDataUrl(await sourceToDataUrl(getAttachmentSource(attachment)), {
        maxWidth: 1300,
        maxHeight: 1000,
        quality: 0.72
      });
      if (!source.startsWith("data:image/")) continue;
      const props = doc.getImageProperties(source);
      const ratio = Math.min(imageWidth / props.width, maxImageHeight / props.height);
      const width = props.width * ratio;
      const height = props.height * ratio;
      rowHeight = Math.max(rowHeight, height);
      rendered.push({ attachment, source, width, height, x: PAGE_MARGIN + rowIndex * (imageWidth + gap) });
    }
    for (const item of rendered) {
      doc.setDrawColor(...PDF_COLORS.line);
      doc.rect(item.x, y, imageWidth, rowHeight + 30, "S");
      doc.addImage(item.source, "JPEG", item.x + (imageWidth - item.width) / 2, y + 5, item.width, item.height, undefined, "FAST");
      setReportFont(doc, "medium", 8.5, PDF_COLORS.slate);
      const caption = `${getAttachmentFileName(item.attachment)}${item.attachment?.createdAt || item.attachment?.created_at || item.attachment?.uploadedAt || item.attachment?.uploaded_at ? ` • ${formatDateTime(item.attachment.createdAt || item.attachment.created_at || item.attachment.uploadedAt || item.attachment.uploaded_at)}` : ""}`;
      doc.text(doc.splitTextToSize(caption, imageWidth - 10), item.x + 5, y + rowHeight + 18);
    }
    y += rowHeight + 38;
  }
  return y;
}

async function renderAttachments(doc, attachments = [], y, title = "Attachments") {
  const validAttachments = attachments.filter((attachment) => {
    const source = getAttachmentSource(attachment);
    return Boolean(source);
  });
  if (!validAttachments.length) return y;

  y = sectionHeader(doc, title, y);
  const photos = validAttachments.filter(isRenderableImageAttachment);
  const pdfs = validAttachments.filter((attachment) => !isRenderableImageAttachment(attachment) && isPdfAttachment(attachment));
  const otherFiles = validAttachments.filter((attachment) => !isRenderableImageAttachment(attachment) && !isPdfAttachment(attachment));

  y = await renderPhotoGallery(doc, photos, y);

  for (const attachment of pdfs) {
    y = await renderPdfAttachment(doc, attachment, y);
  }

  if (otherFiles.length) {
    y = ensurePage(doc, y, 36);
    setReportFont(doc, "semibold", 11, PDF_COLORS.navy);
    doc.text("Supporting Documents", PAGE_MARGIN, y);
    y += 10;
    y = drawEngineeringTable(doc, otherFiles.map((attachment) => ({
      label: getAttachmentType(attachment) || "Document",
      value: getAttachmentFileName(attachment)
    })), y, 1);
  }
  return y + 2;
}

async function renderSignatureImage(doc, source, x, y, width, height) {
  const dataUrl = await sourceToDataUrl(source);
  if (!dataUrl?.startsWith("data:image/")) return false;
  const renderedHeight = addImageToPdf(doc, dataUrl, { fileType: "image/png" }, x, y, width, height);
  return renderedHeight > 0;
}

async function renderSignatures(doc, log, y) {
  y = sectionHeader(doc, "APPROVAL", y);
  const boxGap = 12;
  const hasQcApproval = Boolean(
    log.approvedAt ||
    log.approved_at ||
    log.qcSignature ||
    log.qc_signature ||
    log.qcSignatureUrl ||
    log.qc_signature_url ||
    log.projectManagerSignature ||
    log.project_manager_signature
  );
  const boxWidth = (getContentWidth(doc) - boxGap) / 2;
  const boxHeight = 94;
  y = ensurePage(doc, y, boxHeight + 10);

  const signatures = [{
    title: "Submitted By",
    name: log.technicianName || log.technician_name || "Technician",
    dateLabel: "Submitted",
    date: formatDateTime(log.submittedAt || log.submitted_at),
    image: log.technicianSignature || log.technician_signature || log.technicianSignatureUrl || log.technician_signature_url
  }, {
    title: "Reviewed / Approved By",
    name: hasQcApproval ? (log.approvedBy || log.approved_by || log.reviewedBy || log.reviewed_by || "Project Manager / QC") : "Pending Review",
    dateLabel: hasQcApproval ? "Approved" : "Status",
    date: hasQcApproval ? formatDateTime(log.approvedAt || log.approved_at) : "Pending Review",
    image: hasQcApproval ? (log.qcSignature || log.qc_signature || log.qcSignatureUrl || log.qc_signature_url || log.projectManagerSignature || log.project_manager_signature) : ""
  }];

  for (const [index, signature] of signatures.entries()) {
    const x = PAGE_MARGIN + index * (boxWidth + boxGap);
    doc.setDrawColor(...PDF_COLORS.line);
    doc.setFillColor(...PDF_COLORS.white);
    doc.rect(x, y, boxWidth, boxHeight, "FD");
    setReportFont(doc, "medium", 9, PDF_COLORS.slate);
    doc.text(signature.title.toUpperCase(), x + 10, y + 15);
    const hasImage = await renderSignatureImage(doc, signature.image, x + 10, y + 22, boxWidth - 20, 34);
    if (!hasImage) {
      doc.setDrawColor(...PDF_COLORS.line);
      doc.line(x + 10, y + 52, x + boxWidth - 10, y + 52);
    }
    setReportFont(doc, "semibold", 10, PDF_COLORS.navy);
    doc.text(pdfValue(signature.name), x + 10, y + 68);
    setReportFont(doc, "regular", 9, PDF_COLORS.slate);
    doc.text(`${signature.dateLabel}: ${signature.date}`, x + 10, y + 82);
  }

  return y + boxHeight + 6;
}

async function renderTitleBlock(doc, log, y) {
  const width = getContentWidth(doc);
  const height = 96;
  const logoSource = await sourceToDataUrl(log.companyLogoUrl || log.company_logo_url || COMPANY_LOGO_URL) || getDullesLogoDataUrl();

  doc.setDrawColor(...PDF_COLORS.navy);
  doc.setFillColor(...PDF_COLORS.white);
  doc.rect(PAGE_MARGIN, y, width, height, "FD");
  doc.setFillColor(...PDF_COLORS.navy);
  doc.rect(PAGE_MARGIN, y, width, 12, "F");
  if (logoSource?.startsWith("data:image/")) {
    addImageToPdf(doc, logoSource, { fileType: "image/png" }, PAGE_MARGIN + 12, y + 24, 90, 42);
  } else {
    doc.setFillColor(...PDF_COLORS.paleBlue);
    doc.rect(PAGE_MARGIN + 12, y + 24, 58, 38, "F");
    setReportFont(doc, "semibold", 14, PDF_COLORS.blue);
    doc.text("DE", PAGE_MARGIN + 28, y + 40);
  }

  setReportFont(doc, "semibold", 24, PDF_COLORS.navy);
  doc.text("DAILY FIELD REPORT", PAGE_MARGIN + 118, y + 36);
  setReportFont(doc, "regular", 10, PDF_COLORS.slate);
  doc.text(COMPANY_NAME, PAGE_MARGIN + 118, y + 54);
  doc.text(getProjectName(log), PAGE_MARGIN + 118, y + 70);

  const status = formatStatus(log.status || "submitted");
  setReportFont(doc, "medium", 9, PDF_COLORS.slate);
  doc.text("REPORT NUMBER", PAGE_MARGIN + width - 144, y + 34);
  setReportFont(doc, "semibold", 11, PDF_COLORS.navy);
  doc.text(getDailyReportNumber(log), PAGE_MARGIN + width - 14, y + 34, { align: "right" });
  setReportFont(doc, "medium", 9, PDF_COLORS.slate);
  doc.text("STATUS", PAGE_MARGIN + width - 144, y + 54);
  setReportFont(doc, "semibold", 11, PDF_COLORS.navy);
  doc.text(status, PAGE_MARGIN + width - 14, y + 54, { align: "right" });

  return y + height + 18;
}

function renderProjectInformation(doc, log, y) {
  y = sectionHeader(doc, "PROJECT INFORMATION", y);
  return drawFieldGrid(doc, [
    { label: "Project", value: getProjectName(log) },
    { label: "Project Number", value: getProjectNumber(log) },
    { label: "Location", value: getProjectLocation(log) },
    { label: "Date", value: getLogDate(log) },
    { label: "Shift", value: log.shift },
    { label: "Technician", value: getTechnicianName(log) },
    { label: "Report Number", value: getDailyReportNumber(log) },
    { label: "Status", value: formatStatus(log.status) }
  ], y, 4);
}

function renderExecutiveSummary(doc, log, y) {
  const activities = log.activities || [];
  const attachments = getAllAttachments(log);
  y = sectionHeader(doc, "EXECUTIVE SUMMARY", y);
  return drawEngineeringTable(doc, [
    { label: "Activities Completed", value: activities.length },
    { label: "Reports Attached", value: getAllReports(log).length },
    { label: "Photos Attached", value: attachments.filter(isPhotoAttachment).length },
    { label: "Weather", value: getWeatherText(log) },
    { label: "Overall Status", value: formatStatus(log.status) },
    { label: "Submitted Date", value: formatDateTime(log.submittedAt || log.submitted_at) }
  ], y, 3);
}

function renderWeather(doc, log, y) {
  y = sectionHeader(doc, "WEATHER", y);
  return drawFieldGrid(doc, [
    { label: "Weather Condition", value: log.weatherCondition || log.weather },
    { label: "Min Temp", value: log.minTemperature || log.min_temperature ? `${log.minTemperature || log.min_temperature}°F` : "" },
    { label: "Max Temp", value: log.maxTemperature || log.max_temperature ? `${log.maxTemperature || log.max_temperature}°F` : "" },
    { label: "Captured Time", value: formatDateTime(log.weatherCapturedAt || log.weather_captured_at) }
  ], y, 4);
}

function renderDescriptionBox(doc, text, y, options = {}) {
  const title = options.title || "Description";
  const content = text || options.emptyText || "No description recorded.";
  const width = getContentWidth(doc);
  setReportFont(doc, "regular", 10, PDF_COLORS.navy);
  const lines = doc.splitTextToSize(content, width - 20);
  const height = Math.max(40, lines.length * 12 + 24);
  y = ensurePage(doc, y, height + 8);
  doc.setDrawColor(...PDF_COLORS.line);
  doc.setFillColor(...PDF_COLORS.white);
  doc.rect(PAGE_MARGIN, y, width, height, "FD");
  setReportFont(doc, "medium", 9, PDF_COLORS.slate);
  doc.text(title.toUpperCase(), PAGE_MARGIN + 10, y + 13);
  setReportFont(doc, "regular", 10, PDF_COLORS.navy);
  doc.text(lines, PAGE_MARGIN + 10, y + 27);
  return y + height + 10;
}

async function renderConcreteReport(doc, report, reportIndex, y, activity, log) {
  y = ensurePage(doc, y, 86);
  setReportFont(doc, "semibold", 13, PDF_COLORS.navy);
  doc.text(`Attached Report ${reportIndex + 1}: Concrete Test Log`, PAGE_MARGIN, y);
  setReportFont(doc, "regular", 9, PDF_COLORS.slate);
  doc.text(`DFR: ${pdfValue(getReportDfrNumber(report))}  |  Status: ${formatStatus(report.status || report.reportStatus || "submitted")}`, PAGE_MARGIN, y + 15);
  y += 28;

  setReportFont(doc, "semibold", 11, PDF_COLORS.navy);
  doc.text("Concrete Specifications", PAGE_MARGIN, y);
  y += 10;
  y = drawEngineeringTable(doc, [
    { label: "Mix Number", value: getReportSpecificationValue(report, ["mix_number", "mix_no", "mixNumber", "mixNo"]) },
    { label: "Specified Strength", value: getReportSpecificationValue(report, ["speed_of_stress_psi", "speed_of_stress", "strength_spec", "specified_strength_psi", "specified_strength", "specifiedStrength"]) },
    { label: "Slump Requirement", value: getReportSpecificationValue(report, ["slump_in", "slump", "slumpIn"]) },
    { label: "Air Content Requirement", value: getReportSpecificationValue(report, ["air_content_percent", "air_content", "airContent", "airContentPercent"]) },
    { label: "Unit Weight", value: getReportSpecificationValue(report, ["unit_weight_lbs_ft3", "unit_weight", "unitWeight", "unitWeightLbsFt3"]) },
    { label: "Material Temperature", value: getReportSpecificationValue(report, ["concrete_temp_f", "concrete_temp", "material_temp_f", "materialTemp", "concreteTemperature"]) },
    { label: "Spread", value: getReportSpecificationValue(report, ["spread_in", "spread", "spreadIn"]) },
    { label: "J-Ring", value: getReportSpecificationValue(report, ["j_ring_in", "j_ring", "jRing", "jRingIn"]) },
    { label: "DFR Number", value: getReportDfrNumber(report) },
    { label: "Comments", value: getReportSpecificationValue(report, ["comments", "notes"]) || "No comments recorded." }
  ], y, 2);

  y = renderRecordsTable(doc, getReportRecords(report), y);
  y = await renderAttachments(doc, getReportAttachments(report, activity, log), y, "Concrete Report Attachments");
  return y + 4;
}

async function renderActivities(doc, log, y) {
  y = sectionHeader(doc, "ACTIVITIES", y);
  for (const [index, activity] of (log.activities || []).entries()) {
    const reports = getScopedActivityReports(activity, log);
    const attachments = getActivityAttachments(activity, log);
    y = ensurePage(doc, y, 86);
    setReportFont(doc, "medium", 9, PDF_COLORS.blue);
    doc.text(`ACTIVITY ${index + 1}`, PAGE_MARGIN, y);
    setReportFont(doc, "semibold", 13, PDF_COLORS.navy);
    doc.text(doc.splitTextToSize(getActivityName(activity, index), getContentWidth(doc)), PAGE_MARGIN, y + 16);
    setReportFont(doc, "regular", 9, PDF_COLORS.slate);
    doc.text(`Location: ${pdfValue(activity.location)}  |  Status: ${formatStatus(activity.status || "in_progress")}  |  Type: ${getActivityType(activity)}`, PAGE_MARGIN, y + 31);
    y += 44;

    y = renderDescriptionBox(doc, activity.description, y, { emptyText: "No description recorded." });

    for (const [reportIndex, report] of reports.entries()) {
      y = await renderConcreteReport(doc, report, reportIndex, y, activity, log);
    }

    y = await renderAttachments(doc, attachments, y, "Activity Photos & Attachments");
    y += 10;
  }
  return y;
}

function renderComments(doc, log, y) {
  y = sectionHeader(doc, "COMMENTS", y);
  return renderDescriptionBox(doc, log.notes || log.comments, y, {
    title: "Daily Log Comments",
    emptyText: "No comments recorded."
  });
}

export async function generateDailyLogPdfBlob(log) {
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter", compress: true });
  let y = PAGE_MARGIN;

  y = await renderTitleBlock(doc, log, y);
  y = renderProjectInformation(doc, log, y);
  y = renderExecutiveSummary(doc, log, y);
  y = renderWeather(doc, log, y);
  y = await renderActivities(doc, log, y);
  y = renderComments(doc, log, y);
  await renderSignatures(doc, log, y);
  addPageFooters(doc, log);

  return doc.output("blob");
}

export async function uploadDailyLogPdf(log, pdfBlob) {
  const storagePath = getPdfStoragePath(log);
  logStorageStep("Storage upload started", {
    bucket: DAILY_LOG_PDF_BUCKET,
    path: storagePath,
    size: pdfBlob.size
  });
  const { error } = await supabase.storage.from(DAILY_LOG_PDF_BUCKET).upload(storagePath, pdfBlob, {
    contentType: "application/pdf",
    upsert: true
  });
  if (error) {
    const storageError = getStorageConfigError(DAILY_LOG_PDF_BUCKET, error);
    logStorageStep("Storage upload failed", {
      bucket: DAILY_LOG_PDF_BUCKET,
      path: storagePath,
      reason: storageError.message,
      originalReason: error.message
    });
    throw storageError;
  }
  logStorageStep("Storage upload completed", {
    bucket: DAILY_LOG_PDF_BUCKET,
    path: storagePath
  });
  return storagePath;
}

export async function createDailyLogPdfSignedUrl(storagePath) {
  if (!storagePath) throw new Error("PDF is still being generated. Please try again in a few seconds.");
  const { data, error } = await supabase.storage
    .from(DAILY_LOG_PDF_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) throw getStorageConfigError(DAILY_LOG_PDF_BUCKET, error);
  logStorageStep("Signed URL created", {
    bucket: DAILY_LOG_PDF_BUCKET,
    path: storagePath
  });
  return data.signedUrl;
}

export async function regenerateDailyLogPdf(log) {
  const pendingLog = saveDailyLog({
    ...log,
    pdfGenerationStatus: "pending",
    pdf_generation_status: "pending",
    pdfGenerationFailureReason: "",
    pdf_generation_failure_reason: "",
    pdfGenerationError: ""
  });

  try {
    const hydratedLog = await hydrateDailyLogForPdf(pendingLog);
    const pdfBlob = await generateDailyLogPdfBlob(hydratedLog);
    console.info("[Daily Log PDF] PDF generated", { dailyLogId: pendingLog.id, size: pdfBlob.size });
    const pdfDataUrl = pdfBlob.size <= LOCAL_PDF_CACHE_LIMIT_BYTES ? await blobToDataUrl(pdfBlob) : "";
    let storagePath = "";
    try {
      storagePath = await uploadDailyLogPdf(pendingLog, pdfBlob);
    } catch (storageError) {
      if (pdfDataUrl) {
        console.warn("[Daily Log PDF] Storage upload failed; using browser cache fallback", storageError);
        return saveDailyLog({
          ...pendingLog,
          pdfDataUrl,
          pdf_data_url: pdfDataUrl,
          pdfStoragePath: "",
          pdf_storage_path: "",
          pdfGeneratedAt: new Date().toISOString(),
          pdf_generated_at: new Date().toISOString(),
          pdfGenerationStatus: "generated",
          pdf_generation_status: "generated",
          pdfGenerationFailureReason: "",
          pdf_generation_failure_reason: "",
          pdfGenerationError: "",
          pdfStorageMode: "browser-cache",
          pdf_storage_mode: "browser-cache"
        });
      }
      throw storageError;
    }
    return saveDailyLog({
      ...pendingLog,
      pdfStoragePath: storagePath,
      pdf_storage_path: storagePath,
      pdfDataUrl: "",
      pdf_data_url: "",
      pdfGeneratedAt: new Date().toISOString(),
      pdf_generated_at: new Date().toISOString(),
      pdfGenerationStatus: "generated",
      pdf_generation_status: "generated",
      pdfGenerationFailureReason: "",
      pdf_generation_failure_reason: "",
      pdfGenerationError: "",
      pdfStorageMode: "supabase",
      pdf_storage_mode: "supabase"
    });
  } catch (error) {
    console.error("Daily Log PDF generation failed", error);
    return saveDailyLog({
      ...pendingLog,
      pdfGenerationStatus: "failed",
      pdf_generation_status: "failed",
      pdfGenerationFailureReason: error.message || "PDF storage configuration issue. Please contact administrator.",
      pdf_generation_failure_reason: error.message || "PDF storage configuration issue. Please contact administrator.",
      pdfGenerationError: error.message || "PDF storage configuration issue. Please contact administrator."
    });
  }
}

export async function openDailyLogPdf(log, { download = false } = {}) {
  const storagePath = log.pdfStoragePath || log.pdf_storage_path;
  const fileName = getPdfFileName(log);
  if (!storagePath && (log.pdfDataUrl || log.pdf_data_url)) {
    return openDataUrl(log.pdfDataUrl || log.pdf_data_url, { download, fileName });
  }
  const signedUrl = await createDailyLogPdfSignedUrl(storagePath);
  if (download) {
    const link = document.createElement("a");
    link.href = signedUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return signedUrl;
  }
  window.open(signedUrl, "_blank", "noopener,noreferrer");
  return signedUrl;
}
