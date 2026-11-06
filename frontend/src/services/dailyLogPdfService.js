import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";
import interRegularUrl from "../assets/fonts/Inter-Regular.ttf?url";
import interSemiBoldUrl from "../assets/fonts/Inter-SemiBold.ttf?url";
import { supabase } from "./supabase.js";
import { fetchDailyLogFromSupabase, saveDailyLog } from "./dailyLogService.js";
import { getStorageConfigError, logStorageStep } from "./storageDiagnosticsService.js";

import { getCompanyBranding } from "./brandingService";
import { renderVdotChecklistToDoc } from "./vdotChecklistPdfService";
import { isVdotChecklistReport } from "../configs/vdotChecklists";
import { reserveTab } from "../utils/openInNewTab.js";
import { BRAND } from "../config/branding.js";

// Branding resolves from the caller's company (multi-tenant); these getters
// fall back to the historic defaults inside brandingService.
const COMPANY_LOGO_URL = { get current() { return getCompanyBranding().logoUrl; } };
const REPORT_FONT_FAMILY = "Inter";

// Bump whenever the daily log PDF's layout or content changes. Logs whose
// stored PDF was drawn by an older layout are rebuilt the next time someone
// with regenerate rights opens them (DailyLogSummaryView). Version 2: correct
// log date, Comments section, named signatures at the end, no activity status.
// Version 3: compaction reports list each material with its specs, and tie
// every test result to its material.
// Version 4: comments the reviewer left when approving are printed.
// Version 5: an attached PDF that cannot be embedded gets a notice instead of
// a blank page.
// Version 6: QCore report design -- page header in the company brand colour
// with a document-control block, numbered sections, summary panel, photo log.
export const DAILY_LOG_PDF_LAYOUT_VERSION = 6;
let reportFontsRegistered = false;
const PDF_COLORS = {
  navy: [16, 24, 40],
  ink: [31, 41, 55],
  labelBg: [244, 246, 249],
  rule: [209, 214, 222],
  zebra: [250, 251, 252],
  blue: [37, 99, 235],
  green: [4, 120, 87],
  amber: [180, 83, 9],
  red: [185, 28, 28],
  slate: [71, 85, 105],
  muted: [102, 112, 133],
  line: [178, 190, 206],
  soft: [242, 244, 247],
  paleBlue: [239, 246, 255],
  white: [255, 255, 255]
};
const DAILY_LOG_PDF_BUCKET = "daily-log-pdfs";
const SIGNED_URL_TTL_SECONDS = 60 * 10;
const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;
const PAGE_MARGIN = 40;
// Where content starts on a page. The daily log reserves room for the company
// letterhead drawn on every page (LETTERHEAD_CONTENT_TOP) while it generates;
// the standalone Proctor/Samples PDFs and form-style pages use FORM_PAGE_TOP.
const FORM_PAGE_TOP = 36;
const LETTERHEAD_CONTENT_TOP = 96;
let PAGE_TOP_MARGIN = FORM_PAGE_TOP;
const PAGE_BOTTOM_MARGIN = 42;
// Pages drawn in the layout of a paper form (VDOT checklists, Proctor curves)
// position their own content from the top, so they get no letterhead.
let _pagesWithoutLetterhead = new Set();
// Photos are numbered through the whole report: "Photo 1", "Photo 2", ...
let _photoCounter = 0;
const LOCAL_PDF_CACHE_LIMIT_BYTES = 2_500_000;
function pdfValue(value) {
  return value == null || value === "" ? "N/A" : String(value);
}

// "2026-09-10" is a calendar date, not an instant. new Date() reads it as
// midnight UTC, which in every US timezone is the previous evening, so each
// daily log printed the day before it happened. Format those from their parts.
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function formatDateOnly(value) {
  if (!value) return "N/A";
  const dateOnly = DATE_ONLY_PATTERN.exec(String(value).trim());
  if (dateOnly) return `${dateOnly[2]}/${dateOnly[3]}/${dateOnly[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return pdfValue(value);
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  });
}

function formatTimeOnly(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return pdfValue(value);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDateTime(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return pdfValue(value);
  return `${formatDateOnly(value)} ${formatTimeOnly(value)}`;
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

function getRemainingPageHeight(doc, y) {
  return getPageHeight(doc) - PAGE_BOTTOM_MARGIN - y;
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
  const explicitNumber = log.dfrNumber || log.dfr_number || log.logNumber || log.log_number || log.reportNumber || log.report_number || log.dailyLogNumber || log.daily_log_number;
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

  // "company"/"organization" are storage-path placeholders used when the log
  // had no company id at upload time — they are not real identifiers.
  const recordIds = [record?.companyId, record?.company_id, record?.organizationId, record?.organization_id]
    .filter(Boolean)
    .map(String)
    .filter((id) => id !== "company" && id !== "organization");
  const recordNames = [record?.companyName, record?.company_name, record?.organizationName, record?.organization_name]
    .map(normalizeOwnerName)
    .filter(Boolean);

  // Only compare dimensions both sides actually have; an id on one side and a
  // name on the other is not evidence of a mismatch.
  if (expectedIds.length && recordIds.length) return recordIds.some((id) => expectedIds.includes(id));
  if (expectedNames.length && recordNames.length) return recordNames.some((name) => expectedNames.includes(name));

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

  // Compare ids with ids and names with names — never reject because one side
  // only carries the other dimension.
  if (expectedIds.length && recordIds.length) return recordIds.some((id) => expectedIds.includes(id));
  if (expectedNames.length && recordNames.length) return recordNames.some((name) => expectedNames.includes(name));
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

function getWeatherText(log) {
  // Mirror the Weather Summary card on the daily log screen: auto-captured
  // condition first, then manual override, plus single-reading temperature fallback.
  const condition = pdfValue(
    log.weatherCondition || log.weather_condition || log.weatherOverride || log.weather_override || log.weather
  );
  const min = log.minTemperature || log.min_temperature || log.temperature;
  const max = log.maxTemperature || log.max_temperature || log.temperature;
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

function getRecordSignature(record) {
  return CONSOLIDATED_CONCRETE_RECORD_COLUMNS
    .map((column) => String(getRecordField(record, column.keys) ?? "").trim().toLowerCase())
    .join("|");
}

function dedupeReportRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = getRecordSignature(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function recordHasMeaningfulContent(record) {
  return CONSOLIDATED_CONCRETE_RECORD_COLUMNS.some((column) => {
    // Test # is auto-assigned and Strength defaults to a boolean, so neither
    // proves the technician actually entered data for the row.
    if (column.label === "Test #" || column.label === "Strength") return false;
    const value = getRecordField(record, column.keys);
    return value != null && String(value).trim() !== "";
  });
}

function getReportRecords(report) {
  const records = Array.isArray(report?.deliveryRecords) && report.deliveryRecords.length
    ? report.deliveryRecords
    : Array.isArray(report?.testRecords) && report.testRecords.length
      ? report.testRecords
      : [];
  return dedupeReportRecords(records.filter(recordHasMeaningfulContent));
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
  const fileName = getAttachmentFileName(attachment);
  return source.startsWith("data:image/") || type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(fileName);
}

function isPdfAttachment(attachment) {
  return getAttachmentType(attachment).toLowerCase() === "application/pdf" || /\.pdf$/i.test(getAttachmentFileName(attachment));
}

function isDocxAttachment(attachment) {
  const type = getAttachmentType(attachment).toLowerCase();
  return type.includes("officedocument.wordprocessingml") || /\.docx$/i.test(getAttachmentFileName(attachment));
}

const ATTACHMENT_BUCKET_ATTEMPTS = ["daily-log-attachments", "report-attachments"];

// Attachments synced through Supabase only carry a storage path — resolve the
// actual content the same way the web summary view does: recorded bucket first,
// then the known daily-log/report buckets.
async function resolveAttachmentSource(attachment) {
  const existing = getAttachmentSource(attachment);
  if (existing.startsWith("data:")) return existing;

  const storagePath = getAttachmentStoragePath(attachment);
  if (storagePath) {
    const buckets = [
      attachment?.storageBucket || attachment?.storage_bucket || attachment?.bucketName || attachment?.bucket_name || attachment?.bucket,
      ...ATTACHMENT_BUCKET_ATTEMPTS
    ].filter(Boolean).filter((bucket, index, all) => all.indexOf(bucket) === index);

    for (const bucket of buckets) {
      try {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
        if (!error && data?.signedUrl) return data.signedUrl;
      } catch (error) {
        console.warn("[Daily Log PDF] Unable to sign attachment URL", { bucket, storagePath, error });
      }
    }
  }
  return existing;
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

  // A data: URL cannot be opened as a tab's address in Chrome, and an iframe
  // of one is refused on iOS. A blob: URL works in both.
  const [header, base64 = ""] = String(dataUrl).split(",");
  const mime = header.match(/^data:([^;]+)/)?.[1] || "application/pdf";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  reserveTab().show(blobUrl);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  return blobUrl;
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

  // Match the submitted-report web view: when the daily log already stores the
  // delivery records, use them as-is instead of refetching (the DB table can
  // contain duplicate rows from repeated saves).
  if (Array.isArray(report?.deliveryRecords) && report.deliveryRecords.length > 1) {
    return report;
  }

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

function getProjectColumnValue(project, keys) {
  for (const key of keys) {
    const value = project?.[key];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

// Derive project fields (GC, GC representative, number, location) from the
// projects table — same source the Concrete Test Log report uses — so the PDF
// never shows "Not recorded" for data the project already has on file.
async function hydrateProjectInfoForPdf(log) {
  const projectId = log.projectId || log.project_id;
  if (!projectId) return log;
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();
    if (error || !data) {
      if (error) console.warn("[Daily Log PDF] Unable to hydrate project information", error);
      return log;
    }

    const projectNumber = getProjectColumnValue(data, ["project_number", "number"]) || getProjectNumber(log);
    const projectName = getProjectColumnValue(data, ["project_name", "name"]) || getProjectName(log);
    const generalContractor = getProjectColumnValue(data, ["gc", "general_contractor", "client_name"]) ||
      log.generalContractor || log.general_contractor || "";
    const gcRepresentative = getProjectColumnValue(data, ["gc_rep", "gc_representative", "client_representative"]) ||
      log.gcRepresentative || log.gc_representative || "";
    const projectLocation = getProjectColumnValue(data, ["location", "project_location"]) || getProjectLocation(log);

    return {
      ...log,
      projectNumber,
      project_number: projectNumber,
      projectName,
      project_name: projectName,
      generalContractor,
      general_contractor: generalContractor,
      gcRepresentative,
      gc_representative: gcRepresentative,
      projectLocation,
      project_location: projectLocation
    };
  } catch (error) {
    console.warn("[Daily Log PDF] Project information hydration failed", error);
    return log;
  }
}

async function fetchDailyLogAttachmentRowsForPdf(log) {
  const localLogId = String(log?.id || "");
  const numericLogId = log?.supabaseDailyLogId || log?.supabase_daily_log_id || "";

  const runQuery = async (buildQuery) => {
    try {
      const withFilter = await buildQuery(true);
      if (!withFilter.error) return withFilter.data || [];
      const withoutFilter = await buildQuery(false);
      return withoutFilter.error ? [] : (withoutFilter.data || []);
    } catch (error) {
      console.warn("[Daily Log PDF] Unable to load attachment rows", error);
      return [];
    }
  };

  const queries = [];
  if (localLogId) {
    queries.push(runQuery((withDeletedFilter) => {
      const query = supabase.from("daily_log_attachments").select("*").eq("local_daily_log_id", localLogId);
      return withDeletedFilter ? query.is("deleted_at", null) : query;
    }));
    // Storage paths embed the local uuid ids, so this matches regardless of
    // how the DB row's id columns map to the local log.
    queries.push(runQuery((withDeletedFilter) => {
      const query = supabase.from("daily_log_attachments").select("*").ilike("storage_path", `%${localLogId}%`);
      return withDeletedFilter ? query.is("deleted_at", null) : query;
    }));
  }
  if (numericLogId) {
    queries.push(runQuery((withDeletedFilter) => {
      const query = supabase.from("daily_log_attachments").select("*").eq("daily_log_id", numericLogId);
      return withDeletedFilter ? query.is("deleted_at", null) : query;
    }));
  }
  if (!queries.length) return [];

  const rowSets = await Promise.all(queries);
  const seen = new Set();
  return rowSets.flat().filter((row) => {
    const key = String(row?.storage_path || row?.id || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeAttachmentRowForPdf(row = {}) {
  const fileName = row.file_name || row.fileName || "Attachment";
  const fileType = row.file_type || row.fileType || "";
  const storagePath = row.storage_path || row.storagePath || "";
  const attachmentType = row.attachment_type || row.attachmentType || (fileType.startsWith("image/") ? "photo" : "file");
  const storageBucket = row.storage_bucket || row.storageBucket || "daily-log-attachments";
  // The DB rows key daily_log_id/activity_id with numeric ids while the app
  // works with local uuids, so ownership keys are intentionally omitted —
  // activity scoping relies on the uuids embedded in storage_path.
  return {
    id: row.id || storagePath || fileName,
    fileName,
    file_name: fileName,
    fileType,
    file_type: fileType,
    fileSize: row.file_size || row.fileSize || 0,
    file_size: row.file_size || row.fileSize || 0,
    attachmentType,
    attachment_type: attachmentType,
    storagePath,
    storage_path: storagePath,
    storageBucket,
    storage_bucket: storageBucket,
    createdAt: row.created_at || row.createdAt || row.uploaded_at || row.uploadedAt || ""
  };
}

// The submitted-report web view loads attachments from the daily_log_attachments
// table; mirror that here so the PDF renders them even when the local log copy
// is missing the records.
async function hydrateAttachmentsForPdf(log) {
  const rows = (await fetchDailyLogAttachmentRowsForPdf(log)).map(normalizeAttachmentRowForPdf);
  if (!rows.length) return log;
  const keyOf = (attachment) => String(getAttachmentStoragePath(attachment) || attachment?.id || "");

  return {
    ...log,
    activities: (log.activities || []).map((activity) => {
      const activityId = String(activity?.id || "");
      if (!activityId) return activity;
      const existing = Array.isArray(activity.attachments) ? activity.attachments : [];
      const seen = new Set(existing.map(keyOf).filter(Boolean));
      const matched = rows.filter((row) => row.storagePath.includes(activityId) && !seen.has(keyOf(row)));
      return matched.length ? { ...activity, attachments: [...existing, ...matched] } : activity;
    })
  };
}

async function hydrateDailyLogForPdf(log) {
  const logWithProject = await hydrateProjectInfoForPdf(log);
  const logWithAttachments = await hydrateAttachmentsForPdf(logWithProject);
  const activities = await Promise.all((logWithAttachments.activities || []).map(async (activity) => {
    const concreteReports = await Promise.all((activity.concreteReports || []).map(hydrateConcreteReportForPdf));
    const legacyReports = await Promise.all((activity.reports || []).map((report) => {
      const type = String(report.type || report.reportType || report.report_type || "").toLowerCase();
      if (type.includes("concrete")) return hydrateConcreteReportForPdf(report);
      return Promise.resolve(report);
    }));
    return {
      ...activity,
      concreteReports,
      reports: legacyReports
    };
  }));
  return { ...logWithAttachments, activities };
}

function safePathSegment(value, fallback = "unassigned") {
  return String(value || fallback).replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function getTechnicianInitials(log) {
  const name = log.technicianName || log.technician_name || log.userName || log.user_name || log.submittedByName || log.submitted_by_name || "";
  if (!name) return "";
  return name.trim().split(/\s+/).map((w) => w[0] || "").join("").toUpperCase().slice(0, 4);
}

function getPdfStoragePath(log) {
  const initials = getTechnicianInitials(log);
  const fileName = initials ? `daily-log-${initials}.pdf` : "daily-log.pdf";
  return [
    safePathSegment(log.companyId || log.organizationId || "company"),
    safePathSegment(log.projectId || log.project_id || "project"),
    safePathSegment(log.id || "daily-log"),
    fileName
  ].join("/");
}

function getPdfFileName(log) {
  const initials = getTechnicianInitials(log);
  const suffix = initials ? `-${initials}` : "";
  return `Daily-Field-Log-${safePathSegment(log.projectNumber || log.projectId)}-${safePathSegment(log.date)}-${safePathSegment(log.id)}${suffix}.pdf`;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

// Font bytes are fetched once per page load; registration happens on every
// document. Fonts belong to a jsPDF instance, not to the module: the old
// early-return on a module-wide flag registered Inter on the first PDF only,
// while every later PDF still asked for Inter because the flag said it was
// there. jsPDF then had no metrics for it and failed measuring text with
// "Cannot read properties of undefined (reading 'widths')".
let reportFontData = null;

async function loadReportFontData() {
  if (reportFontData) return reportFontData;
  const [regularResponse, boldResponse] = await Promise.all([
    fetch(interRegularUrl),
    fetch(interSemiBoldUrl)
  ]);
  if (!regularResponse.ok || !boldResponse.ok) throw new Error("Unable to load report font assets.");
  reportFontData = {
    regular: arrayBufferToBase64(await regularResponse.arrayBuffer()),
    bold: arrayBufferToBase64(await boldResponse.arrayBuffer())
  };
  return reportFontData;
}

async function registerReportFonts(doc) {
  try {
    const { regular, bold } = await loadReportFontData();
    doc.addFileToVFS("Inter-Regular.ttf", regular);
    doc.addFont("Inter-Regular.ttf", REPORT_FONT_FAMILY, "normal");
    doc.addFileToVFS("Inter-SemiBold.ttf", bold);
    doc.addFont("Inter-SemiBold.ttf", REPORT_FONT_FAMILY, "bold");
    reportFontsRegistered = true;
  } catch (error) {
    // Describe THIS document: if embedding failed, it must draw in Helvetica
    // even when an earlier document managed to embed Inter.
    reportFontsRegistered = false;
    console.warn("[Daily Log PDF] Unable to embed report font; falling back to built-in sans font.", error);
  }
}

function setReportFont(doc, weight = "regular", size = 10, color = PDF_COLORS.navy) {
  const style = weight === "semibold" || weight === "medium" ? "bold" : "normal";
  doc.setFont(reportFontsRegistered ? REPORT_FONT_FAMILY : "helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function ensurePage(doc, y, minSpace = 54) {
  if (getRemainingPageHeight(doc, y) >= minSpace) return y;
  doc.addPage();
  return PAGE_TOP_MARGIN;
}

function getRecordField(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value != null && value !== "") return value;
  }
  return "";
}

const CONSOLIDATED_CONCRETE_RECORD_COLUMNS = [
  { label: "Test #", keys: ["test_number", "testNumber"], width: 20 },
  { label: "Ticket #", keys: ["ticket_number", "ticketNumber"], width: 31 },
  { label: "Truck #", keys: ["truck_number", "truckNumber"], width: 31 },
  { label: "CY", keys: ["cubic_yards", "cubicYards"], width: 19 },
  { label: "Batch", keys: ["batch_time", "time_batched", "timeBatched"], width: 28 },
  { label: "Arrival", keys: ["arrival_time", "arrivalTime"], width: 28 },
  { label: "Tested", keys: ["testing_time", "time_tested", "timeTested"], width: 28 },
  { label: "Finish", keys: ["finish_unload_time", "finish_unload", "finishUnload"], width: 28 },
  { label: "Min", keys: ["actual_minutes", "actualMinutes"], width: 21 },
  { label: "Result", keys: ["record_result", "row_status", "recordResult", "status"], width: 32 },
  { label: "Water", keys: ["water_added_gal", "waterAdded"], width: 25 },
  { label: "Air °F", keys: ["air_temp_f", "airTempF", "airTemp"], width: 24 },
  { label: "Conc °F", keys: ["concrete_temp_f", "concreteTempF", "concreteTemp"], width: 27 },
  { label: "Slump", keys: ["slump_in", "slump"], width: 23 },
  { label: "Air %", keys: ["air_content_percent", "airContent"], width: 23 },
  { label: "Unit Wt", keys: ["unit_weight_lbs_ft3", "unitWeight"], width: 29 },
  { label: "Spread", keys: ["spread_in", "spread"], width: 25 },
  { label: "J-Ring", keys: ["j_ring_in", "jRing"], width: 25 },
  { label: "Strength", keys: ["strength_verification_required", "strengthVerificationRequired"], width: 32 },
  { label: "Set #", keys: ["set_number", "setNumber"], width: 28 },
  { label: "Lab", keys: ["lab_cylinders", "lab_samples", "labSamples"], width: 20 },
  { label: "Field", keys: ["field_cylinders", "field_samples", "fieldSamples"], width: 22 },
  { label: "Comments", keys: ["inspector_notes", "comments", "notes"], width: 52, align: "left" }
];

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

// Reset at the start of each generateDailyLogPdfBlob call.
// Each entry records the 1-based page number of the jsPDF placeholder page
// so pdf-lib can replace it with the real PDF pages at the exact position.
let _pdfMergeQueue = [];

async function renderPdfAttachment(doc, attachment, y) {
  const fileName = getAttachmentFileName(attachment);
  const source = await resolveAttachmentSource(attachment);
  const arrayBuffer = await sourceToArrayBuffer(source);

  if (!arrayBuffer) {
    y = ensurePage(doc, y, 22);
    setReportFont(doc, "regular", 8.5, [185, 28, 28]);
    doc.text(`PDF attachment unavailable: ${fileName}`, PAGE_MARGIN, y);
    return y + 14;
  }

  // Make sure the file will actually embed before giving it a page. One that
  // pdf-lib cannot read used to leave a near-blank page reading only
  // "Attached PDF: <name>" in the middle of the report.
  let embeddable = false;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const probe = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    embeddable = probe.getPageCount() > 0;
  } catch (error) {
    console.warn(`[Daily Log PDF] Attached PDF cannot be embedded: ${fileName}`, error);
  }
  if (!embeddable) {
    return renderReferenceTextBox(
      doc,
      "Attached PDF not embedded",
      `${fileName} could not be embedded in this report. It remains attached to the daily log in QCore.`,
      y
    );
  }

  // If ensurePage already moved us to the top of a fresh page, use that page
  // as the placeholder; otherwise add a new one.  This avoids a blank page
  // between the activity content and the attachment.
  if (y > PAGE_TOP_MARGIN + 4) {
    doc.addPage("letter", "portrait");
  }
  const placeholderPage = doc.internal.getNumberOfPages(); // 1-based
  // Replaced by the attachment's own pages when it merges. Only seen if the
  // merge still fails, so it has to read as a deliberate notice, not a stray
  // label on a blank page.
  const noticeY = renderReferenceSectionBar(doc, `Attachment \u2014 ${fileName}`, PAGE_TOP_MARGIN, { afterGap: 10 });
  renderReferenceTextBox(doc, "Attached PDF not embedded", `${fileName} could not be embedded in this report. It remains attached to the daily log in QCore.`, noticeY);
  _pdfMergeQueue.push({ pageNumber: placeholderPage, fileName, arrayBuffer });

  // Return y beyond the page height so the next ensurePage() opens a fresh page
  return doc.internal.pageSize.getHeight() + 1;
}

async function mergePdfAttachments(mainBlob, queue) {
  if (!queue.length) return mainBlob;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const mainDoc = await PDFDocument.load(await mainBlob.arrayBuffer());

    // Process highest page number first so earlier insertions don't shift
    // the 0-based indices of pages still waiting to be processed.
    const sorted = [...queue].sort((a, b) => b.pageNumber - a.pageNumber);

    for (const { pageNumber, fileName, arrayBuffer } of sorted) {
      const idx = pageNumber - 1; // pdf-lib uses 0-based indices
      try {
        const attachedDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const copied = await mainDoc.copyPages(attachedDoc, attachedDoc.getPageIndices());
        // Remove the placeholder page
        mainDoc.removePage(idx);
        // Insert the real pages at the same position in original order
        for (let i = 0; i < copied.length; i++) {
          mainDoc.insertPage(idx + i, copied[i]);
        }
      } catch (err) {
        console.warn(`[Daily Log PDF] Could not merge attachment: ${fileName}`, err);
      }
    }

    const merged = await mainDoc.save();
    return new Blob([merged], { type: "application/pdf" });
  } catch (err) {
    console.warn("[Daily Log PDF] pdf-lib merge failed, returning unmerged PDF", err);
    return mainBlob;
  }
}

async function renderSignatureImage(doc, source, x, y, width, height) {
  const dataUrl = await sourceToDataUrl(source);
  if (!dataUrl?.startsWith("data:image/")) return false;
  const renderedHeight = addImageToPdf(doc, dataUrl, { fileType: "image/png" }, x, y, width, height);
  return renderedHeight > 0;
}

function getAttachmentCategory(attachment = {}) {
  const raw = [
    attachment.category,
    attachment.attachmentCategory,
    attachment.attachment_category,
    attachment.type,
    attachment.attachmentType,
    attachment.attachment_type,
    getAttachmentFileName(attachment)
  ].join(" ").toLowerCase();
  if (raw.includes("ticket")) return "Tickets";
  if (raw.includes("delivery") || raw.includes("slip")) return "Delivery Slips";
  if (raw.includes("test")) return "Test Images";
  if (isPhotoAttachment(attachment)) return "Photos";
  if (isPdfAttachment(attachment) || raw.includes("doc") || raw.includes("xls")) return "Other Reports";
  return "Other Reports";
}

function renderAttachmentCard(doc, attachment, x, y, width, height) {
  doc.setDrawColor(...PDF_COLORS.rule);
  doc.setFillColor(...PDF_COLORS.labelBg);
  doc.rect(x, y, width, height, "FD");
  setReportFont(doc, "semibold", 9, PDF_COLORS.navy);
  doc.text(doc.splitTextToSize(getAttachmentFileName(attachment), width - 18), x + 9, y + 15);
  setReportFont(doc, "regular", 8, PDF_COLORS.slate);
  const meta = [
    getAttachmentCategory(attachment),
    attachment.pageCount || attachment.page_count ? `${attachment.pageCount || attachment.page_count} pages` : "",
    attachment.createdAt || attachment.created_at || attachment.uploadedAt || attachment.uploaded_at
      ? formatDateTime(attachment.createdAt || attachment.created_at || attachment.uploadedAt || attachment.uploaded_at)
      : ""
  ].filter(Boolean).join(" • ");
  doc.text(doc.splitTextToSize(meta || "Attachment", width - 18), x + 9, y + height - 12);
}

// Accent colour for the header bar, section chips, table headers and figure
// labels: the company's own brand colour, so each company's reports carry its
// identity. Set per document in generateDailyLogPdfBlob.
const DEFAULT_ACCENT = [29, 78, 216];
let _accent = DEFAULT_ACCENT;

function hexToRgb(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixColor(color, target, amount) {
  return color.map((channel, index) => Math.round(channel + (target[index] - channel) * amount));
}

function colorLuminance([r, g, b]) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// The accent as text on white: a light brand colour is deepened to stay legible.
function accentText() {
  return colorLuminance(_accent) > 0.55 ? mixColor(_accent, [0, 0, 0], 0.45) : _accent;
}

function accentTint() {
  return mixColor(_accent, [255, 255, 255], 0.9);
}

function textOnAccent() {
  return colorLuminance(_accent) > 0.6 ? PDF_COLORS.ink : PDF_COLORS.white;
}

// Footer: who issued the report on the left, how and when it was generated on
// the right. Page numbers live in the header's document-control block; pages
// drawn as paper forms have no header, so theirs go here.
function PdfFooter(doc, log, letterhead = {}) {
  const pageCount = doc.getNumberOfPages();
  const generatedAt = formatDateTime(log.pdfGeneratedAt || log.pdf_generated_at || new Date().toISOString());
  const issuer = [letterhead.name, letterhead.address, letterhead.phone ? `Tel ${letterhead.phone}` : ""]
    .filter(Boolean)
    .join("  ·  ");

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    const pageWidth = getPageWidth(doc);
    const pageHeight = getPageHeight(doc);
    doc.setDrawColor(...PDF_COLORS.rule);
    doc.setLineWidth(0.5);
    doc.line(PAGE_MARGIN, pageHeight - 28, pageWidth - PAGE_MARGIN, pageHeight - 28);
    setReportFont(doc, "regular", 7, PDF_COLORS.muted);
    const generated = [
      _pagesWithoutLetterhead.has(pageNumber) ? `Page ${pageNumber} of ${pageCount}` : "",
      `Generated with ${BRAND.name}  ·  ${generatedAt}`
    ].filter(Boolean).join("  ·  ");
    doc.text(generated, pageWidth - PAGE_MARGIN, pageHeight - 16, { align: "right" });
    if (issuer) {
      const room = getContentWidth(doc) - doc.getTextWidth(generated) - 24;
      doc.text(doc.splitTextToSize(issuer, Math.max(room, 80))[0], PAGE_MARGIN, pageHeight - 16);
    }
  }
}

// Company identity for the page header: its own logo, or its name when no logo
// was uploaded. Never another company's logo.
async function loadLetterhead(log) {
  const branding = getCompanyBranding();
  const logo = await sourceToDataUrl(log.companyLogoUrl || log.company_logo_url || COMPANY_LOGO_URL.current);
  return {
    logo: logo?.startsWith("data:image/") ? logo : "",
    name: log.companyName || log.company_name || (branding.hasCompany ? branding.name : ""),
    address: branding.address || "",
    phone: branding.phone || ""
  };
}

// Page header: a brand-colour bar beside the company's logo, and on the right a
// document-control block identifying the report on every page.
function drawPageHeader(doc, letterhead, logoSize, meta, pageNumber, pageCount) {
  const top = 28;
  const height = 52;
  const right = getPageWidth(doc) - PAGE_MARGIN;

  doc.setFillColor(..._accent);
  doc.rect(PAGE_MARGIN, top, 3.5, height, "F");
  const identityX = PAGE_MARGIN + 13;
  if (logoSize) {
    doc.addImage(letterhead.logo, getImageFormat(letterhead.logo), identityX, top + (height - logoSize.height) / 2, logoSize.width, logoSize.height, "company-logo", "FAST");
  } else if (letterhead.name) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text(doc.splitTextToSize(letterhead.name, 240)[0], identityX, top + height / 2 + 4.5);
  }

  const blockWidth = 236;
  const cellWidth = blockWidth / 2;
  const cellHeight = height / 2;
  const blockX = right - blockWidth;
  const cells = [
    ["Report No.", meta.reportNumber],
    ["Date", meta.date],
    ["Project No.", meta.projectNumber],
    ["Page", `${pageNumber} of ${pageCount}`]
  ];
  cells.forEach(([label, value], index) => {
    const cellX = blockX + (index % 2) * cellWidth;
    const cellY = top + Math.floor(index / 2) * cellHeight;
    doc.setDrawColor(...PDF_COLORS.rule);
    doc.setLineWidth(0.5);
    doc.rect(cellX, cellY, cellWidth, cellHeight, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(label.toUpperCase(), cellX + 7, cellY + 9, { charSpace: 0.3 });
    const text = String(pdfValue(value));
    let size = 9;
    doc.setFontSize(size);
    while (doc.getTextWidth(text) > cellWidth - 14 && size > 6) {
      size -= 0.5;
      doc.setFontSize(size);
    }
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text(doc.splitTextToSize(text, cellWidth - 14)[0] || "", cellX + 7, cellY + 20.5);
  });
  doc.setDrawColor(..._accent);
  doc.setLineWidth(2);
  doc.line(blockX, top, right, top);
  doc.setLineWidth(0.5);
}

function renderPageHeaders(doc, letterhead, meta) {
  let logoSize = null;
  if (letterhead.logo) {
    try {
      const props = doc.getImageProperties(letterhead.logo);
      const ratio = Math.min(160 / props.width, 40 / props.height);
      logoSize = { width: props.width * ratio, height: props.height * ratio };
    } catch (error) {
      console.warn("[Daily Log PDF] Unable to embed company logo", error);
    }
  }
  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    if (_pagesWithoutLetterhead.has(pageNumber)) continue;
    doc.setPage(pageNumber);
    drawPageHeader(doc, letterhead, logoSize, meta, pageNumber, pageCount);
  }
}

function getConcreteReports(log) {
  return (log.activities || []).flatMap((activity) => (
    getScopedActivityReports(activity, log).map((report) => ({ report, activity }))
  ));
}

function sentenceCase(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Table header rows take a tint of the company's accent colour.
function getDarkTableHeadStyles(fontSize = 9) {
  return {
    fillColor: accentTint(),
    textColor: accentText(),
    fontStyle: "bold",
    fontSize,
    lineColor: PDF_COLORS.rule,
    lineWidth: 0.5
  };
}

const DAILY_LOG_CONCRETE_RECORD_COLUMNS = [
  { header: "Test #", width: 25 },
  { header: "Ticket #", width: 36 },
  { header: "Truck #", width: 36 },
  { header: "CY", width: 22 },
  { header: "Batch", width: 34 },
  { header: "Arrival", width: 34 },
  { header: "Tested", width: 34 },
  { header: "Finish", width: 34 },
  { header: "Min", width: 26 },
  { header: "Result", width: 38 },
  { header: "Water", width: 32 },
  { header: "Air Temp", width: 34 },
  { header: "Conc Temp", width: 38 },
  { header: "Slump", width: 30 },
  { header: "Air %", width: 28 },
  { header: "Unit Wt", width: 34 },
  { header: "Spread", width: 34 },
  { header: "J-Ring", width: 32 },
  { header: "Set #", width: 42 },
  { header: "Lab", width: 28 },
  { header: "Field", width: 30 },
  { header: "Comments", width: 58, align: "left" }
];

function getDailyLogConcreteColumnStyles(doc, records = []) {
  const fontFamily = reportFontsRegistered ? REPORT_FONT_FAMILY : "helvetica";
  const fontSize = 5.8;
  const cellPadding = 5.5; // left + right padding plus grid line slack
  const maxCellWidth = 64; // values longer than this wrap rather than starving other columns
  const rows = getDailyLogConcreteRecordRows(records);

  // Size each column to its widest single-line value (or longest header word),
  // so real values like CY and Set # never wrap mid-number.
  const widths = DAILY_LOG_CONCRETE_RECORD_COLUMNS.map((column, index) => {
    doc.setFont(fontFamily, "bold");
    doc.setFontSize(fontSize);
    const headerMin = Math.max(...String(column.header).split(/\s+/).map((word) => doc.getTextWidth(word)));
    doc.setFont(fontFamily, "normal");
    const bodyMax = Math.max(0, ...rows.map((row) => doc.getTextWidth(String(row[index] ?? ""))));
    return Math.min(Math.max(headerMin, bodyMax) + cellPadding, maxCellWidth);
  });

  const contentWidth = getContentWidth(doc);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  if (totalWidth < contentWidth) {
    widths[widths.length - 1] += contentWidth - totalWidth;
  } else {
    // Over-width: reclaim space only from wide text columns (which wrap
    // gracefully), so snug-fitting value columns like CY and Set # never wrap.
    const wrapFloor = 34;
    const flexible = widths.map((width) => Math.max(0, width - wrapFloor));
    const flexTotal = flexible.reduce((sum, width) => sum + width, 0);
    const deficit = totalWidth - contentWidth;
    if (flexTotal >= deficit) {
      for (let index = 0; index < widths.length; index += 1) {
        widths[index] -= flexible[index] * (deficit / flexTotal);
      }
    } else {
      const scale = contentWidth / totalWidth;
      for (let index = 0; index < widths.length; index += 1) widths[index] *= scale;
    }
  }

  return DAILY_LOG_CONCRETE_RECORD_COLUMNS.reduce((styles, column, index) => {
    styles[index] = {
      cellWidth: widths[index],
      halign: column.align || "center"
    };
    return styles;
  }, {});
}

function getDailyLogConcreteRecordRows(records) {
  return records.map((record, index) => [
    getRecordField(record, ["test_number", "testNumber"]) || index + 1,
    getRecordValue(record, ["ticket_number", "ticketNumber"]),
    getRecordValue(record, ["truck_number", "truckNumber"]),
    getRecordValue(record, ["cubic_yards", "cubicYards"]),
    getRecordValue(record, ["batch_time", "time_batched", "timeBatched"]),
    getRecordValue(record, ["arrival_time", "arrivalTime"]),
    getRecordValue(record, ["testing_time", "time_tested", "timeTested"]),
    getRecordValue(record, ["finish_unload_time", "finish_unload", "finishUnload"]),
    getRecordValue(record, ["actual_minutes", "actualMinutes"]),
    formatStatus(getRecordField(record, ["record_result", "row_status", "recordResult", "status"])),
    getRecordValue(record, ["water_added_gal", "waterAdded"]),
    getRecordValue(record, ["air_temp_f", "airTempF", "airTemp"]),
    getRecordValue(record, ["concrete_temp_f", "concreteTempF", "concreteTemp"]),
    getRecordValue(record, ["slump_in", "slump"]),
    getRecordValue(record, ["air_content_percent", "airContent"]),
    getRecordValue(record, ["unit_weight_lbs_ft3", "unitWeight"]),
    getRecordValue(record, ["spread_in", "spread"]),
    getRecordValue(record, ["j_ring_in", "jRing"]),
    getRecordValue(record, ["set_number", "setNumber"]),
    getRecordValue(record, ["lab_cylinders", "lab_samples", "labSamples"]),
    getRecordValue(record, ["field_cylinders", "field_samples", "fieldSamples"]),
    getRecordValue(record, ["inspector_notes", "comments", "notes"])
  ]);
}

function getRecordValue(record, keys) {
  return pdfValue(getRecordField(record, keys));
}

// Report title on page one: the title with its status pill, the project
// beneath. Number, date and page are in the header's control block.
function renderReferenceDailyLogHeader(doc, log, y) {
  const title = "Daily Field Report";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(title, PAGE_MARGIN, y + 16);
  const titleWidth = doc.getTextWidth(title);

  const status = formatStatus(log.status || "Draft").toUpperCase();
  doc.setFontSize(6.8);
  const pillWidth = doc.getTextWidth(status) + 14;
  const pillX = PAGE_MARGIN + titleWidth + 10;
  doc.setFillColor(...accentTint());
  doc.roundedRect(pillX, y + 5, pillWidth, 13, 6.5, 6.5, "F");
  doc.setTextColor(...accentText());
  doc.text(status, pillX + pillWidth / 2, y + 13.8, { align: "center", charSpace: 0.3 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...PDF_COLORS.slate);
  doc.text(doc.splitTextToSize(getProjectName(log), getContentWidth(doc))[0], PAGE_MARGIN, y + 32);
  return y + 48;
}

// Project particulars in a tinted panel: labels stacked above their values in
// three columns; a long value may span two.
function renderSummaryPanel(doc, rows, y) {
  const width = getContentWidth(doc);
  const pad = 12;
  const columnGap = 16;
  const columnWidth = (width - pad * 2 - columnGap * 2) / 3;
  const lineHeight = 11.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const laidOut = rows.map((row) => {
    let column = 0;
    const cells = row.map((cell) => {
      const span = cell.span || 1;
      const cellWidth = columnWidth * span + columnGap * (span - 1);
      const laid = {
        ...cell,
        x: PAGE_MARGIN + pad + column * (columnWidth + columnGap),
        lines: doc.splitTextToSize(pdfValue(cell.value), cellWidth).slice(0, 3)
      };
      column += span;
      return laid;
    });
    return { cells, height: 13 + Math.max(...cells.map((cell) => cell.lines.length)) * lineHeight + 7 };
  });
  const panelHeight = pad + laidOut.reduce((sum, row) => sum + row.height, 0) + pad - 7;
  y = ensurePage(doc, y, panelHeight + 10);

  doc.setFillColor(...PDF_COLORS.labelBg);
  doc.rect(PAGE_MARGIN, y, width, panelHeight, "F");
  let rowY = y + pad;
  for (const row of laidOut) {
    for (const cell of row.cells) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.6);
      doc.setTextColor(...PDF_COLORS.muted);
      doc.text(String(cell.label).toUpperCase(), cell.x, rowY + 6, { charSpace: 0.3 });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...PDF_COLORS.ink);
      doc.text(cell.lines, cell.x, rowY + 17.5, { lineHeightFactor: lineHeight / 9 });
    }
    rowY += row.height;
  }
  return y + panelHeight + 18;
}

// Section heading. Top-level sections carry a number in an accent chip
// (1 Project Summary, 2 Field Activities, ...); headings inside them get a
// short accent underline running into a hairline.
function renderReferenceSectionBar(doc, title, y, options = {}) {
  y = ensurePage(doc, y, 46);
  const right = PAGE_MARGIN + getContentWidth(doc);
  const drawRightText = (baseline) => {
    if (!options.rightText) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(String(options.rightText), right, baseline, { align: "right" });
  };

  if (options.number != null) {
    const chip = 16;
    doc.setFillColor(..._accent);
    doc.rect(PAGE_MARGIN, y, chip, chip, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...textOnAccent());
    doc.text(String(options.number), PAGE_MARGIN + chip / 2, y + 11.2, { align: "center" });
    doc.setFontSize(11.5);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text(String(title), PAGE_MARGIN + chip + 8, y + 12);
    drawRightText(y + 12);
    return y + chip + (options.afterGap ?? 12);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(doc.splitTextToSize(String(title), getContentWidth(doc) - 120)[0], PAGE_MARGIN, y + 10);
  drawRightText(y + 10);
  doc.setDrawColor(...PDF_COLORS.rule);
  doc.setLineWidth(0.5);
  doc.line(PAGE_MARGIN + 28, y + 15, right, y + 15);
  doc.setDrawColor(..._accent);
  doc.setLineWidth(1.6);
  doc.line(PAGE_MARGIN, y + 15, PAGE_MARGIN + 28, y + 15);
  doc.setLineWidth(0.5);
  return y + 15 + (options.afterGap ?? 12);
}

// One labelled value as a flat tinted tile; tiles sit in a grid with narrow
// white gutters.
function renderReferenceFieldCard(doc, item, x, y, width, height) {
  const label = String(item.label || "").toUpperCase();
  const value = pdfValue(item.value);
  doc.setFillColor(...PDF_COLORS.labelBg);
  doc.rect(x, y, width, height, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.6);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(doc.splitTextToSize(label, width - 16)[0] || "", x + 8, y + 11, { charSpace: 0.3 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.ink);
  const valueLines = doc.splitTextToSize(value, width - 16);
  doc.text(valueLines.slice(0, 2), x + 8, y + 23.5, { lineHeightFactor: 1.15 });
}

// Sub-heading inside a report block: small accent capitals.
function renderReferenceSubTitle(doc, title, y, options = {}) {
  y = ensurePage(doc, y, options.minSpace || 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  doc.setTextColor(...accentText());
  doc.text(String(title).toUpperCase(), PAGE_MARGIN, y + 8, { charSpace: 0.5 });
  if (options.rightText) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(String(options.rightText), PAGE_MARGIN + getContentWidth(doc), y + 8, { align: "right" });
  }
  return y + 8 + (options.afterGap ?? 8);
}

function renderReferenceCardGrid(doc, items, y, options = {}) {
  const columns = options.columns || 3;
  const gap = 3;
  const cardHeight = options.cardHeight || 36;
  const cardWidth = (getContentWidth(doc) - gap * (columns - 1)) / columns;
  for (let start = 0; start < items.length; start += columns) {
    y = ensurePage(doc, y, cardHeight + 4);
    items.slice(start, start + columns).forEach((item, index) => {
      renderReferenceFieldCard(doc, item, PAGE_MARGIN + index * (cardWidth + gap), y, cardWidth, cardHeight);
    });
    y += cardHeight + gap;
  }
  return y - gap + (options.afterGap ?? 12);
}

// A labelled block of running text (work performed, remarks, notices). The
// text flows onto the next page instead of being drawn past the page end.
function renderReferenceTextBox(doc, label, text, y, options = {}) {
  const width = getContentWidth(doc);
  const fontSize = 9.5;
  const lineHeight = fontSize * 1.42;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(String(text || "N/A"), width);
  y = ensurePage(doc, y, 22 + lineHeight * Math.min(lines.length, 3));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(String(label).toUpperCase(), PAGE_MARGIN, y + 8, { charSpace: 0.4 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...PDF_COLORS.ink);
  const pageBottom = getPageHeight(doc) - PAGE_BOTTOM_MARGIN;
  let baseline = y + 21;
  for (const line of lines) {
    if (baseline > pageBottom) {
      doc.addPage("letter", "portrait");
      baseline = PAGE_TOP_MARGIN + 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize);
      doc.setTextColor(...PDF_COLORS.ink);
    }
    doc.text(line, PAGE_MARGIN, baseline);
    baseline += lineHeight;
  }
  return baseline - lineHeight + 6 + (options.afterGap ?? 12);
}

function getInspectionRequirementItems(report) {
  return [
    { label: "Air Content (%)", keys: ["air_content_percent", "air_content", "airContent", "airContentPercent"] },
    { label: "Unit Weight (lbs/ft³)", keys: ["unit_weight_lbs_ft3", "unit_weight", "unitWeight", "unitWeightLbsFt3"] },
    { label: "Spread (in)", keys: ["spread_in", "spread", "spreadIn"] },
    { label: "Slump (in)", keys: ["slump_in", "slump", "slumpIn"] },
    { label: "Material Temp (°F)", keys: ["concrete_temp_f", "concrete_temp", "material_temp_f", "materialTemp", "concreteTemperature"] },
    { label: "Mix No.", keys: ["mix_number", "mix_no", "mixNumber", "mixNo"] },
    { label: "Batch Plant", keys: ["batch_plant", "batchPlant", "batch_plant_supplier", "batchPlantSupplier"] },
    { label: "J-Ring (in)", keys: ["j_ring_in", "j_ring", "jRing", "jRingIn"] },
    { label: "Specified Strength (PSI)", keys: ["speed_of_stress_psi", "speed_of_stress", "strength_spec", "specified_strength_psi", "specified_strength", "specifiedStrength"] },
    { label: "DFR Number", value: getReportDfrNumber(report) },
    { label: "Comments", keys: ["comments", "notes"] }
  ].map((item) => ({
    label: item.label,
    value: item.value ?? pdfValue(getReportSpecificationValue(report, item.keys))
  }));
}

function renderReferenceRecordsTable(doc, records, y) {
  y = ensurePage(doc, y, 110);
  y = renderReferenceSubTitle(doc, "Material Delivery & Verification Records", y, {
    rightText: `${records.length} record${records.length === 1 ? "" : "s"}`
  });

  autoTable(doc, {
    startY: y,
    head: [DAILY_LOG_CONCRETE_RECORD_COLUMNS.map((column) => column.header)],
    body: getDailyLogConcreteRecordRows(records),
    theme: "grid",
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_TOP_MARGIN, bottom: PAGE_BOTTOM_MARGIN + 16 },
    tableWidth: getContentWidth(doc),
    showHead: "everyPage",
    styles: {
      font: reportFontsRegistered ? REPORT_FONT_FAMILY : "helvetica",
      fontSize: 5.8,
      cellPadding: { top: 3.5, right: 2.2, bottom: 3.5, left: 2.2 },
      lineColor: PDF_COLORS.line,
      lineWidth: 0.35,
      textColor: PDF_COLORS.navy,
      minCellHeight: 16,
      overflow: "linebreak",
      valign: "middle"
    },
    headStyles: getDarkTableHeadStyles(5.8),
    columnStyles: getDailyLogConcreteColumnStyles(doc, records)
  });
  return (doc.lastAutoTable?.finalY || y) + 14;
}

function renderReferenceComplianceSummary(doc, records, y) {
  const resultOf = (record) => formatStatus(getRecordField(record, ["record_result", "row_status", "recordResult", "status"])).toLowerCase();
  const passed = records.filter((record) => resultOf(record).includes("pass")).length;
  const failed = records.filter((record) => resultOf(record).includes("fail")).length;
  const retests = records.filter((record) => resultOf(record).includes("retest")).length;
  const totalCy = records.reduce((sum, record) => sum + (Number(getRecordField(record, ["cubic_yards", "cubicYards"])) || 0), 0);
  y = renderReferenceSubTitle(doc, "Compliance Summary", y, { minSpace: 60 });
  return renderReferenceCardGrid(doc, [
    { label: "Total Records", value: records.length },
    { label: "Total CY", value: totalCy.toFixed(1) },
    { label: "Passed", value: passed },
    { label: "Failed", value: failed },
    { label: "Retests", value: retests }
  ], y, { columns: 5, cardHeight: 34, afterGap: 10 });
}

// Photo log: each photo in a ruled frame with a caption strip along its foot,
// "Fig. N" and the file name on the left, when it was taken on the right.
// Figures are numbered through the whole report.
async function renderReferencePhotoGrid(doc, photos, y) {
  const gap = 12;
  const columns = 2;
  const stripHeight = 20;

  for (let index = 0; index < photos.length; index += columns) {
    const row = photos.slice(index, index + columns);
    // A section's only photo gets the full content width, like the web summary
    // view, height-capped so it reads as a figure rather than a full page. An
    // odd last photo keeps the grid's size so the figures stay uniform.
    const isSingle = photos.length === 1;
    const frameWidth = isSingle ? getContentWidth(doc) : (getContentWidth(doc) - gap) / columns;
    const frameHeight = isSingle ? 310 : 260;
    const imageHeight = frameHeight - stripHeight;
    const rendered = [];
    for (const [rowIndex, attachment] of row.entries()) {
      const x = PAGE_MARGIN + rowIndex * (frameWidth + gap);
      let source = await sourceToDataUrl(await resolveAttachmentSource(attachment));
      if (source?.startsWith("data:image/")) {
        source = await compressImageDataUrl(source, { maxWidth: 1400, maxHeight: 1400, quality: 0.74 });
        try {
          const props = doc.getImageProperties(source);
          const ratio = Math.min((frameWidth - 8) / props.width, (imageHeight - 8) / props.height, 2);
          rendered.push({ attachment, source, x, width: props.width * ratio, height: props.height * ratio });
          continue;
        } catch (error) {
          console.warn("[Daily Log PDF] Unable to measure attachment image", error);
        }
      }
      rendered.push({ attachment, source: "", x, width: 0, height: 0 });
    }

    y = ensurePage(doc, y, frameHeight + 4);

    for (const item of rendered) {
      _photoCounter += 1;
      doc.setFillColor(...PDF_COLORS.white);
      doc.rect(item.x, y, frameWidth, frameHeight, "F");
      if (item.source) {
        doc.addImage(item.source, getImageFormat(item.source, item.attachment), item.x + (frameWidth - item.width) / 2, y + (imageHeight - item.height) / 2, item.width, item.height, undefined, "FAST");
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...PDF_COLORS.muted);
        doc.text("Image unavailable", item.x + frameWidth / 2, y + imageHeight / 2, { align: "center" });
      }

      const stripY = y + imageHeight;
      doc.setFillColor(...PDF_COLORS.labelBg);
      doc.rect(item.x, stripY, frameWidth, stripHeight, "F");
      doc.setDrawColor(...PDF_COLORS.rule);
      doc.setLineWidth(0.5);
      doc.rect(item.x, y, frameWidth, frameHeight, "S");

      const figure = `Fig. ${_photoCounter}`;
      const uploadedAt = item.attachment?.createdAt || item.attachment?.created_at || item.attachment?.uploadedAt || item.attachment?.uploaded_at;
      const taken = uploadedAt ? formatDateTime(uploadedAt) : "";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.8);
      doc.setTextColor(...accentText());
      doc.text(figure, item.x + 8, stripY + 13);
      const nameX = item.x + 8 + doc.getTextWidth(figure) + 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      const takenWidth = taken ? doc.getTextWidth(taken) + 10 : 0;
      doc.setTextColor(...PDF_COLORS.muted);
      if (taken) doc.text(taken, item.x + frameWidth - 8, stripY + 13, { align: "right" });
      doc.setFontSize(7.8);
      doc.setTextColor(...PDF_COLORS.ink);
      const nameRoom = item.x + frameWidth - 8 - takenWidth - nameX;
      doc.text(doc.splitTextToSize(getAttachmentFileName(item.attachment), Math.max(nameRoom, 30))[0] || "", nameX, stripY + 13);
    }
    y += frameHeight + gap;
  }
  return y;
}

async function renderReferenceDocxAttachment(doc, attachment, y) {
  const fileName = getAttachmentFileName(attachment);
  try {
    const source = await resolveAttachmentSource(attachment);
    const arrayBuffer = await sourceToArrayBuffer(source);
    if (!arrayBuffer) throw new Error("Document content unavailable.");
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = String(result?.value || "").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) throw new Error("Document has no extractable text.");

    y = ensurePage(doc, y, 48);
    setReportFont(doc, "medium", 9, PDF_COLORS.slate);
    doc.text(`Attached Document: ${fileName}`, PAGE_MARGIN, y);
    y += 12;
    setReportFont(doc, "regular", 9, PDF_COLORS.navy);
    const lines = doc.splitTextToSize(text.slice(0, 30000), getContentWidth(doc) - 16);
    for (const line of lines) {
      y = ensurePage(doc, y, 16);
      doc.text(line, PAGE_MARGIN + 8, y);
      y += 11.5;
    }
    return y + 10;
  } catch (error) {
    console.warn("[Daily Log PDF] Unable to render document attachment", error);
    y = ensurePage(doc, y, 22);
    setReportFont(doc, "regular", 9, PDF_COLORS.slate);
    doc.text(`Document attachment could not be rendered: ${fileName}`, PAGE_MARGIN, y);
    return y + 14;
  }
}

async function renderReferenceAttachmentContent(doc, attachments, y, title) {
  const valid = (attachments || []).filter((attachment) => Boolean(getAttachmentSource(attachment)) || Boolean(getAttachmentStoragePath(attachment)) || Boolean(getAttachmentFileName(attachment)));
  if (!valid.length) return y;

  const photos = valid.filter(isRenderableImageAttachment);
  const pdfs = valid.filter((attachment) => !isRenderableImageAttachment(attachment) && isPdfAttachment(attachment));
  const docs = valid.filter((attachment) => !isRenderableImageAttachment(attachment) && !isPdfAttachment(attachment) && isDocxAttachment(attachment));
  const otherFiles = valid.filter((attachment) => !isRenderableImageAttachment(attachment) && !isPdfAttachment(attachment) && !isDocxAttachment(attachment));

  // Keep the section bar on the same page as its first content block: a lone
  // photo frame (~330pt), a photo pair row (~280pt), or a document card row.
  // Attached PDFs are merged in as whole pages, so they can never share a page
  // with the bar; reserving room for "an attached-PDF page" only pushed the bar
  // onto a page of its own, followed by the attachment on the next. The bar now
  // stays at the end of the activity with the attached files named under it.
  const firstBlockSpace = photos.length
    ? (photos.length === 1 ? 370 : 320)
    : pdfs.length
      ? 40 + pdfs.length * 14
      : 130;
  y = ensurePage(doc, y, firstBlockSpace);
  y = renderReferenceSectionBar(doc, title, y, { afterGap: 10, rightText: `${valid.length} item${valid.length === 1 ? "" : "s"}` });

  if (photos.length) {
    y = await renderReferencePhotoGrid(doc, photos, y);
  }

  if (pdfs.length) {
    // Name what the following pages are before they start.
    for (const attachment of pdfs) {
      y = ensurePage(doc, y, 16);
      setReportFont(doc, "regular", 9, PDF_COLORS.slate);
      doc.text(`\u2022  ${getAttachmentFileName(attachment)}`, PAGE_MARGIN + 4, y + 9);
      y += 14;
    }
    y += 4;
  }

  for (const attachment of pdfs) {
    // renderPdfAttachment starts its own page for a PDF that will embed, and
    // writes a notice in place for one that will not.
    y = await renderPdfAttachment(doc, attachment, y);
  }

  for (const attachment of docs) {
    y = await renderReferenceDocxAttachment(doc, attachment, y);
  }

  if (otherFiles.length) {
    y = renderReferenceSubTitle(doc, "Other Files", y);
    const gap = 10;
    const cardWidth = (getContentWidth(doc) - gap) / 2;
    const cardHeight = 42;
    for (let index = 0; index < otherFiles.length; index += 2) {
      y = ensurePage(doc, y, cardHeight + 8);
      otherFiles.slice(index, index + 2).forEach((attachment, rowIndex) => {
        renderAttachmentCard(doc, attachment, PAGE_MARGIN + rowIndex * (cardWidth + gap), y, cardWidth, cardHeight);
      });
      y += cardHeight + gap;
    }
  }
  return y + 6;
}

function getReportKind(report) {
  const type = String(report.type || report.reportType || report.report_type || "").toLowerCase();
  const num = String(report.reportNumber || report.report_number || "").trim();
  if (isVdotChecklistReport(report)) return "vdot";
  if (type.includes("asphalt") || num.startsWith("ACR-")) return "asphalt";
  if (num.startsWith("CDR-") || (!num.startsWith("ACR-") && (type.includes("compaction") || type.includes("density") || type.includes("nuclear")))) return "compaction";
  if (type.includes("infiltration") || num.startsWith("SIR-")) return "infiltration";
  if (type.includes("proctor") || num.startsWith("OPP-")) return "proctor";
  if (type.includes("sample")) return "samples";
  return "concrete";
}

async function renderReferenceAsphaltReportBlock(doc, report, reportIndex, y, activity, log) {
  const logDate = log.date || log.logDate || log.log_date || "";
  const calibrationDueDate = report.calibrationDueDate || report.calibration_due_date || "";
  const isOutOfCalibration = Boolean(calibrationDueDate && logDate && calibrationDueDate < logDate);

  y = ensurePage(doc, y, 160);
  y = renderReferenceSectionBar(doc, `Asphalt Compaction Report ${reportIndex + 1}`, y, {
    afterGap: 10,
    rightText: formatStatus(report.status || "Draft")
  });

  y = renderReferenceCardGrid(doc, [
    { label: "Serial Number", value: pdfValue(report.serialNumber) },
    { label: "Gauge Model", value: pdfValue(report.gaugeModel) },
    { label: "Calibration Due Date", value: isOutOfCalibration ? `${calibrationDueDate} ⚠ OUT OF CALIBRATION` : pdfValue(calibrationDueDate) },
    { label: "Gauge Standardized", value: pdfValue(report.standardizedGauge) },
    { label: "Standard Count Density", value: pdfValue(report.standardDensity) },
    { label: "Standard Count Moisture", value: pdfValue(report.standardMoisture) }
  ], y, { columns: 3, afterGap: isOutOfCalibration ? 6 : 10 });

  if (isOutOfCalibration) {
    y = ensurePage(doc, y, 24);
    doc.setFillColor(...[254, 226, 226]);
    doc.roundedRect(PAGE_MARGIN, y, getContentWidth(doc), 18, 3, 3, "F");
    setReportFont(doc, "bold", 8.5, [185, 28, 28]);
    doc.text(`⚠ OUT OF CALIBRATION — Calibration expired before report date (${logDate}).`, PAGE_MARGIN + 6, y + 11);
    y += 24;
  }

  const materialGroups = Array.isArray(report.materialGroups) ? report.materialGroups : [];
  if (!materialGroups.length) {
    y = renderReferenceTextBox(doc, "Test Data", "No material groups or test records recorded.", y);
  }

  for (const [gi, group] of materialGroups.entries()) {
    y = ensurePage(doc, y, 80);
    y = renderReferenceSubTitle(doc, `Material ${gi + 1} — Mix ID: ${pdfValue(group.mixId)}`, y, { rightText: `${(group.testRecords || []).length} test(s)` });
    y = renderReferenceCardGrid(doc, [
      { label: "Marshall Value (pcf)", value: pdfValue(group.marshallValue) },
      { label: "Required Compaction (%)", value: pdfValue(group.requiredCompaction) }
    ], y, { columns: 3, afterGap: 8 });

    const records = Array.isArray(group.testRecords) ? group.testRecords : [];
    if (records.length) {
      y = ensurePage(doc, y, 80);
      const fontFamily = reportFontsRegistered ? REPORT_FONT_FAMILY : "helvetica";
      autoTable(doc, {
        startY: y,
        head: [["Test #", "Location", "Field Density (pcf)", "Compaction %", "Result"]],
        body: records.map((r) => [
          pdfValue(r.testNo),
          pdfValue(r.location),
          pdfValue(r.fieldDensity),
          r.compactionPercent ? `${r.compactionPercent}%` : "N/A",
          pdfValue(r.result)
        ]),
        theme: "grid",
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_TOP_MARGIN, bottom: PAGE_BOTTOM_MARGIN + 16 },
        tableWidth: getContentWidth(doc),
        showHead: "everyPage",
        styles: { font: fontFamily, fontSize: 8, textColor: PDF_COLORS.navy, cellPadding: 5, valign: "middle" },
        headStyles: getDarkTableHeadStyles(8),
        bodyStyles: { fillColor: PDF_COLORS.white },
        alternateRowStyles: { fillColor: PDF_COLORS.zebra },
        didParseCell(data) {
          if (data.section === "body") {
            if (data.column.index === 4) {
              const val = String(data.cell.raw || "").toUpperCase();
              if (val === "PASS") data.cell.styles.textColor = [4, 120, 87];
              else if (val === "FAIL") data.cell.styles.textColor = [185, 28, 28];
            }
            if (data.column.index === 3) {
              const pct = parseFloat(String(data.cell.raw || "").replace("%", ""));
              if (!Number.isNaN(pct) && pct > 102) {
                data.cell.styles.textColor = [146, 64, 14];
                data.cell.styles.fontStyle = "bold";
              }
            }
          }
        }
      });
      y = doc.lastAutoTable.finalY + 10;
    } else {
      y = renderReferenceTextBox(doc, "Test Records", "No test records for this material.", y);
    }
  }

  if (report.coresTaken) {
    const coreItems = [{ label: "Cores Taken", value: pdfValue(report.coresTaken) }];
    if (report.coresTaken === "Yes") {
      coreItems.push({ label: "Number of Cores", value: pdfValue(report.coreCount) });
      coreItems.push({ label: "Core Locations", value: pdfValue(report.coreLocations) });
    }
    y = renderReferenceCardGrid(doc, coreItems, y, { columns: 3, afterGap: 8 });
    if (report.coreNotes) {
      y = renderReferenceTextBox(doc, "Core Notes", report.coreNotes, y);
    }
  }

  y = await renderReferenceAttachmentContent(doc, getReportAttachments(report, activity, log), y, `Asphalt Report ${reportIndex + 1} Attachments`);
  return y + 6;
}

// A compaction report can test several materials, each judged against its own
// specs. materialGroups holds those specs; the flat testRecords carry each
// test's material and the values the app computed for it (moistureContent,
// moistureRange, densityResult). The PDF used to print only the report-level
// summary -- "Multiple", the names joined, and a required density that is blank
// whenever there is more than one group -- so nothing tied a result to the
// material it was judged against.
function getCompactionMaterialGroups(report) {
  const groups = Array.isArray(report.materialGroups) ? report.materialGroups.filter(Boolean) : [];
  if (groups.length) return groups;
  // Reports saved before material groups existed: one implicit group.
  return [{
    id: "",
    materialType: report.materialType || report.material_type || "",
    materialName: report.materialName || report.material_name || "",
    maximumDryDensity: report.maximumDryDensity || report.maximum_dry_density || "",
    percentOptimumMoisture: report.percentOptimumMoisture || report.percent_optimum_moisture || "",
    correctedMaximumDryDensity: report.correctedMaximumDryDensity || report.corrected_maximum_dry_density || "",
    correctedOptimumMoisture: report.correctedOptimumMoisture || report.corrected_optimum_moisture || "",
    percentMinimumDensityRequired: report.percentMinimumDensityRequired || report.percent_minimum_density_required || ""
  }];
}

function getCompactionRecords(report, groups) {
  const flat = Array.isArray(report.testRecords) ? report.testRecords : [];
  if (flat.length) return flat;
  return groups.flatMap((group) => (group.testRecords || []).map((record) => ({
    ...record,
    materialGroupId: group.id,
    materialType: group.materialType || group.material_type || "",
    materialName: group.materialName || group.material_name || ""
  })));
}

function compactionMaterialLabel(type, name) {
  const materialType = String(type || "").trim();
  const materialName = String(name || "").trim();
  if (materialType && materialName) return `${materialType} \u00b7 ${materialName}`;
  return materialType || materialName || "N/A";
}

function renderReferenceSubheading(doc, text, y) {
  setReportFont(doc, "semibold", 8.5, PDF_COLORS.slate);
  doc.text(String(text).toUpperCase(), PAGE_MARGIN, y + 8, { charSpace: 0.4 });
  return y + 14;
}

const COMPACTION_RESULT_COLORS = { PASS: PDF_COLORS.green, FAIL: PDF_COLORS.red, RETEST: PDF_COLORS.amber };

async function renderReferenceNuclearCompactionReportBlock(doc, report, reportIndex, y, activity, log) {
  const logDate = log.date || log.logDate || log.log_date || "";
  const calibrationDueDate = report.calibrationDueDate || report.calibration_due_date || "";
  const isOutOfCalibration = Boolean(calibrationDueDate && logDate && calibrationDueDate < logDate);
  const groups = getCompactionMaterialGroups(report);
  const records = getCompactionRecords(report, groups);
  const fontFamily = reportFontsRegistered ? REPORT_FONT_FAMILY : "helvetica";
  const tableOptions = {
    theme: "grid",
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_TOP_MARGIN, bottom: PAGE_BOTTOM_MARGIN + 16 },
    tableWidth: getContentWidth(doc),
    showHead: "everyPage",
    styles: { font: fontFamily, fontSize: 8, textColor: PDF_COLORS.navy, cellPadding: 5, valign: "middle" },
    headStyles: getDarkTableHeadStyles(8),
    bodyStyles: { fillColor: PDF_COLORS.white },
    alternateRowStyles: { fillColor: PDF_COLORS.zebra }
  };

  y = ensurePage(doc, y, 160);
  y = renderReferenceSectionBar(doc, `Nuclear Density Report ${reportIndex + 1}`, y, {
    afterGap: 10,
    rightText: formatStatus(report.status || "Draft")
  });

  // Gauge details. Material specs moved to their own table below, one row per
  // material, instead of a single summary card that could only say "Multiple".
  y = renderReferenceCardGrid(doc, [
    { label: "Serial Number", value: pdfValue(report.serialNumber || report.serial_number) },
    { label: "Gauge Model", value: pdfValue(report.gaugeModel || report.gauge_model) },
    { label: "Calibration Due Date", value: calibrationDueDate ? `${formatDateOnly(calibrationDueDate)}${isOutOfCalibration ? " \u26a0 OUT OF CALIBRATION" : ""}` : "N/A" },
    { label: "Gauge Standardized", value: pdfValue(report.standardizedGauge || report.standardized_gauge) },
    { label: "Standard Count Density", value: pdfValue(report.standardDensity || report.standard_density) },
    { label: "Standard Count Moisture", value: pdfValue(report.standardMoisture || report.standard_moisture) }
  ], y, { columns: 3, afterGap: isOutOfCalibration ? 6 : 10 });

  if (isOutOfCalibration) {
    y = ensurePage(doc, y, 24);
    doc.setFillColor(...[254, 226, 226]);
    doc.roundedRect(PAGE_MARGIN, y, getContentWidth(doc), 18, 3, 3, "F");
    setReportFont(doc, "bold", 8.5, [185, 28, 28]);
    doc.text(`\u26a0 OUT OF CALIBRATION \u2014 Calibration expired before report date (${formatDateOnly(logDate)}).`, PAGE_MARGIN + 6, y + 11);
    y += 24;
  }

  // Materials: the specs each result was judged against.
  y = ensurePage(doc, y, 70);
  y = renderReferenceSubheading(doc, groups.length > 1 ? `Materials (${groups.length})` : "Material", y);
  autoTable(doc, {
    ...tableOptions,
    startY: y,
    head: [["Material", "Corrected Max. Dry Density (pcf)", "Corrected Optimum Moisture (%)", "Moisture Range (%)", "Min. Density Required (%)"]],
    body: groups.map((group) => {
      // The app computes each group's moisture range onto its records; print
      // that rather than re-deriving it, so the PDF cannot disagree with it.
      const sample = records.find((record) => groups.length === 1 || record.materialGroupId === group.id) || {};
      const range = sample.moistureRange || sample.moisture_range;
      return [
        compactionMaterialLabel(group.materialType || group.material_type, group.materialName || group.material_name),
        pdfValue(group.correctedMaximumDryDensity || group.corrected_maximum_dry_density || group.maximumDryDensity || group.maximum_dry_density),
        pdfValue(group.correctedOptimumMoisture || group.corrected_optimum_moisture || group.percentOptimumMoisture || group.percent_optimum_moisture),
        range && range !== "-" ? range : "N/A",
        pdfValue(group.percentMinimumDensityRequired || group.percent_minimum_density_required)
      ];
    })
  });
  y = doc.lastAutoTable.finalY + 12;

  if (records.length) {
    y = ensurePage(doc, y, 80);
    y = renderReferenceSubheading(doc, "Test Results", y);
    autoTable(doc, {
      ...tableOptions,
      startY: y,
      head: [["Test #", "Location", "Material", "Wet Density", "Dry Density", "Moisture (%)", "% Dry Density", "Result"]],
      body: records.map((r) => [
        pdfValue(r.testNo || r.test_no),
        pdfValue(r.location),
        compactionMaterialLabel(r.materialType || r.material_type, r.materialName || r.material_name),
        pdfValue(r.wetDensity || r.wet_density),
        pdfValue(r.dryDensity || r.dry_density),
        pdfValue(r.moistureContent || r.moisture_content),
        pdfValue(r.percentDryDensity || r.percent_dry_density),
        pdfValue(r.densityResult || r.density_result)
      ]),
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index !== 7) return;
        const color = COMPACTION_RESULT_COLORS[String(data.cell.raw || "").toUpperCase()];
        if (color) {
          data.cell.styles.textColor = color;
          data.cell.styles.fontStyle = "bold";
        }
      }
    });
    y = doc.lastAutoTable.finalY + 10;
  } else {
    y = renderReferenceTextBox(doc, "Test Records", "No test records recorded for this report.", y);
  }

  y = await renderReferenceAttachmentContent(doc, getReportAttachments(report, activity, log), y, `Nuclear Density Report ${reportIndex + 1} Attachments`);
  return y + 6;
}

async function renderReferenceInfiltrationReportBlock(doc, report, reportIndex, y, activity, log) {
  y = ensurePage(doc, y, 160);
  y = renderReferenceSectionBar(doc, `Surface Infiltration Rate Report ${reportIndex + 1}`, y, {
    afterGap: 10,
    rightText: formatStatus(report.status || "Draft")
  });

  y = renderReferenceCardGrid(doc, [
    { label: "Project Name", value: pdfValue(report.projectName || report.project_name) },
    { label: "Project Number", value: pdfValue(report.projectNumber || report.project_number) },
    { label: "Date", value: pdfValue(report.date) },
    { label: "Client", value: pdfValue(report.client) },
    { label: "Location", value: pdfValue(report.location) },
    { label: "Test Standard", value: "ASTM C1781" }
  ], y, { columns: 3, afterGap: 10 });

  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  if (records.length) {
    y = ensurePage(doc, y, 80);
    const fontFamily = reportFontsRegistered ? REPORT_FONT_FAMILY : "helvetica";
    autoTable(doc, {
      startY: y,
      head: [["Test #", "Location", "Weight (g)", "Diameter (mm)", "Time (s)", "IR (mm/hr)"]],
      body: records.map((r, i) => [
        pdfValue(r.testNo || r.test_no || i + 1),
        pdfValue(r.location),
        pdfValue(r.weightInfiltratedWater),
        pdfValue(r.insideDiameter),
        pdfValue(r.timeInfiltration),
        String(r.infiltrationRate || "").trim() || "—"
      ]),
      theme: "grid",
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_TOP_MARGIN, bottom: PAGE_BOTTOM_MARGIN + 16 },
      tableWidth: getContentWidth(doc),
      showHead: "everyPage",
      styles: { font: fontFamily, fontSize: 8, textColor: PDF_COLORS.navy, cellPadding: 5, valign: "middle" },
      headStyles: getDarkTableHeadStyles(8),
      bodyStyles: { fillColor: PDF_COLORS.white },
      alternateRowStyles: { fillColor: PDF_COLORS.zebra },
      didParseCell: ({ cell, column }) => {
        if (column.index === 5 && cell.section === "body") {
          const val = String(cell.raw || "").trim();
          if (val && val !== "—") {
            cell.styles.textColor = [5, 122, 85];
            cell.styles.fontStyle = "bold";
          }
        }
      }
    });
    y = doc.lastAutoTable.finalY + 10;

    y = ensurePage(doc, y, 28);
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(PAGE_MARGIN, y, getContentWidth(doc), 18, 3, 3, "F");
    setReportFont(doc, "regular", 7.5, [30, 64, 175]);
    doc.text("Formula: IR = (126,870 × W) / (D² × T)  |  W = Weight infiltrated water (g) · D = Inside diameter of ring (mm) · T = Time elapsed (s)", PAGE_MARGIN + 6, y + 11);
    y += 24;
  } else {
    y = renderReferenceTextBox(doc, "Test Records", "No test records recorded for this report.", y);
  }

  y = await renderReferenceAttachmentContent(doc, getReportAttachments(report, activity, log), y, `Surface Infiltration Report ${reportIndex + 1} Attachments`);
  return y + 6;
}

// VTM-12 Set "C" moisture-density curve parameters (mirrors FieldEngineerWorkspace.jsx)
const VTM12_CURVES_PDF = {
  A: { maxDryDensity: 141.8, optimumMoisture: 6.1 },
  B: { maxDryDensity: 139.1, optimumMoisture: 6.7 },
  C: { maxDryDensity: 136.3, optimumMoisture: 7.4 },
  D: { maxDryDensity: 134.1, optimumMoisture: 8.0 },
  E: { maxDryDensity: 132.0, optimumMoisture: 8.5 },
  F: { maxDryDensity: 129.3, optimumMoisture: 9.2 },
  G: { maxDryDensity: 126.6, optimumMoisture: 10.0 },
  H: { maxDryDensity: 124.2, optimumMoisture: 10.7 },
  I: { maxDryDensity: 121.7, optimumMoisture: 11.4 },
  J: { maxDryDensity: 119.3, optimumMoisture: 12.2 },
  K: { maxDryDensity: 117.0, optimumMoisture: 13.0 },
  L: { maxDryDensity: 114.6, optimumMoisture: 14.1 },
  M: { maxDryDensity: 112.0, optimumMoisture: 15.2 },
  N: { maxDryDensity: 109.6, optimumMoisture: 16.4 },
  O: { maxDryDensity: 107.1, optimumMoisture: 17.6 },
  P: { maxDryDensity: 104.7, optimumMoisture: 19.2 },
  Q: { maxDryDensity: 102.4, optimumMoisture: 20.3 },
  R: { maxDryDensity: 99.9,  optimumMoisture: 21.5 },
  S: { maxDryDensity: 97.4,  optimumMoisture: 22.7 },
  T: { maxDryDensity: 94.6,  optimumMoisture: 24.4 },
  U: { maxDryDensity: 92.1,  optimumMoisture: 25.8 },
  V: { maxDryDensity: 89.9,  optimumMoisture: 27.4 },
  W: { maxDryDensity: 87.5,  optimumMoisture: 29.5 },
  X: { maxDryDensity: 85.0,  optimumMoisture: 30.5 },
  Y: { maxDryDensity: 83.0,  optimumMoisture: 31.5 },
  Z: { maxDryDensity: 81.1,  optimumMoisture: 32.5 }
};

// Draws Figure 1 (VTM-12 moisture-density curves) on the current PDF page.
// All 26 curves are rendered with solid black lines; the selected curve(s) for
// this report are drawn with a heavier stroke so they stand out.
function renderProctorCurvesPage(doc, report) {
  const fontFamily = reportFontsRegistered ? REPORT_FONT_FAMILY : "helvetica";
  const pageW = getPageWidth(doc);
  const pageH = getPageHeight(doc);

  // ── Title ──────────────────────────────────────────────────────────────────
  let ty = FORM_PAGE_TOP + 8;
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.navy);
  doc.text("FIGURE 1 — TYPICAL MOISTURE-DENSITY CURVES, SET \"C\"", pageW / 2, ty, { align: "center" });
  ty += 9;
  doc.setFont(fontFamily, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text("VTM-12 / AASHTO T 272 · TL-125A · VDOT Special Provision", pageW / 2, ty, { align: "center" });
  ty += 5;

  // ── Graph area ────────────────────────────────────────────────────────────
  const yAxisLabelWidth = 20;  // space reserved for Y-axis tick labels
  const xAxisLabelHeight = 18; // space reserved below graph for X-axis labels + title
  const gx = PAGE_MARGIN + yAxisLabelWidth;
  const gy = ty + 8;
  const gw = pageW - PAGE_MARGIN - gx - 4;
  const gh = pageH - PAGE_BOTTOM_MARGIN - gy - xAxisLabelHeight;

  // Axis data ranges
  const moistMin = 2,  moistMax = 36;
  const densMin  = 78, densMax  = 146;

  function toX(moist) { return gx + (moist - moistMin) / (moistMax - moistMin) * gw; }
  function toY(dens)  { return gy + (1 - (dens - densMin) / (densMax - densMin)) * gh; }

  // White fill
  doc.setFillColor(255, 255, 255);
  doc.rect(gx, gy, gw, gh, "F");

  // ── Grid lines ─────────────────────────────────────────────────────────────
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.25);
  for (let m = 4; m <= 34; m += 2) {
    const x = toX(m);
    doc.line(x, gy, x, gy + gh);
  }
  for (let d = 80; d <= 144; d += 4) {
    const y = toY(d);
    doc.line(gx, y, gx + gw, y);
  }

  // ── Graph border ───────────────────────────────────────────────────────────
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.7);
  doc.rect(gx, gy, gw, gh);

  // ── Y-axis labels ──────────────────────────────────────────────────────────
  doc.setFont(fontFamily, "normal");
  doc.setFontSize(6);
  doc.setTextColor(0, 0, 0);
  for (let d = 80; d <= 144; d += 4) {
    const y = toY(d);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(gx - 3, y, gx, y);
    doc.text(String(d), gx - 4, y + 2, { align: "right" });
  }

  // ── X-axis labels ──────────────────────────────────────────────────────────
  for (let m = 4; m <= 34; m += 2) {
    const x = toX(m);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(x, gy + gh, x, gy + gh + 3);
    doc.setFont(fontFamily, "normal");
    doc.setFontSize(6);
    doc.setTextColor(0, 0, 0);
    doc.text(String(m), x, gy + gh + 8, { align: "center" });
  }

  // ── Axis titles ────────────────────────────────────────────────────────────
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  // X-axis title
  doc.text("MOISTURE CONTENT (%)", gx + gw / 2, gy + gh + 16, { align: "center" });
  // Y-axis title (rotated 90°)
  doc.text("DRY DENSITY (lb/ft³)", gx - yAxisLabelWidth + 2, gy + gh / 2, { angle: 90, align: "center" });

  // ── Determine which curves are selected in this report ────────────────────
  const selectedCurves = new Set(
    (report.testRecords || []).map((r) => r.selectedCurve).filter(Boolean)
  );

  // Parabolic curve model: D(w) = MDD − k·(w − OMC)²
  // k = 0.0048 × MDD gives ≈10 % density drop at OMC ± 5 %, matching VTM-12 curves.
  const K_FACTOR = 0.0048;
  const CURVE_PTS = 60;
  const HALF_WIDTH = 7; // moisture half-span of each parabola (%)

  function drawCurve(mdd, omc, lineWidth) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(lineWidth);
    const k = K_FACTOR * mdd;
    let prev = null;
    for (let i = 0; i <= CURVE_PTS; i++) {
      const w = (omc - HALF_WIDTH) + (HALF_WIDTH * 2) * i / CURVE_PTS;
      const d = mdd - k * (w - omc) * (w - omc);
      if (w < moistMin || w > moistMax || d < densMin || d > densMax) {
        prev = null;
        continue;
      }
      const px = toX(w);
      const py = toY(d);
      if (prev) doc.line(prev[0], prev[1], px, py);
      prev = [px, py];
    }
  }

  // First pass — all non-selected curves (thin solid black, 0.5 pt)
  Object.entries(VTM12_CURVES_PDF).forEach(([letter, { maxDryDensity: mdd, optimumMoisture: omc }]) => {
    if (selectedCurves.has(letter)) return;
    drawCurve(mdd, omc, 0.5);
    // Small letter label just above the peak
    if (omc >= moistMin && omc <= moistMax && mdd >= densMin && mdd <= densMax) {
      doc.setFont(fontFamily, "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(0, 0, 0);
      doc.text(letter, toX(omc), toY(mdd) - 2, { align: "center" });
    }
  });

  // Second pass — selected curves (heavy solid black, 2 pt)
  selectedCurves.forEach((letter) => {
    const entry = VTM12_CURVES_PDF[letter];
    if (!entry) return;
    const { maxDryDensity: mdd, optimumMoisture: omc } = entry;
    drawCurve(mdd, omc, 2);
    if (omc >= moistMin && omc <= moistMax && mdd >= densMin && mdd <= densMax) {
      doc.setFont(fontFamily, "bold");
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(letter, toX(omc), toY(mdd) - 4, { align: "center" });
    }
  });

  // ── Test point markers ─────────────────────────────────────────────────────
  (report.testRecords || []).forEach((r, idx) => {
    const mc = parseFloat(r.moistureContent);
    const fd = parseFloat(r.fieldDryDensity);
    if (isNaN(mc) || isNaN(fd)) return;
    if (mc < moistMin || mc > moistMax || fd < densMin || fd > densMax) return;
    const px = toX(mc);
    const py = toY(fd);
    doc.setFillColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    // Draw an X marker
    const s = 3;
    doc.line(px - s, py - s, px + s, py + s);
    doc.line(px + s, py - s, px - s, py + s);
    // Label
    doc.setFont(fontFamily, "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`T${r.testNo || idx + 1}`, px + s + 2, py + 2);
  });

  // ── Legend / note ─────────────────────────────────────────────────────────
  const noteY = gy + gh + xAxisLabelHeight + 4;
  doc.setFont(fontFamily, "normal");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.muted);
  const selLabel = selectedCurves.size > 0
    ? `Selected curve(s): ${[...selectedCurves].join(", ")} — drawn with heavy line. `
    : "";
  doc.text(
    `${selLabel}× markers show field test point (moisture content vs. field dry density). All 26 VTM-12 Set "C" curves shown.`,
    PAGE_MARGIN, noteY
  );
  return noteY + 10;
}

async function renderReferenceProctorReportBlock(doc, report, reportIndex, y, activity, log) {
  y = ensurePage(doc, y, 160);
  y = renderReferenceSectionBar(doc, `One-Point Proctor Report ${reportIndex + 1}`, y, {
    afterGap: 10,
    rightText: formatStatus(report.status || "Draft")
  });

  y = renderReferenceCardGrid(doc, [
    { label: "Project Name", value: pdfValue(report.projectName || report.project_name) },
    { label: "Project Number", value: pdfValue(report.projectNumber || report.project_number) },
    { label: "Date", value: pdfValue(report.date) },
    { label: "Client", value: pdfValue(report.client) },
    { label: "Test Standard", value: "AASHTO T 272 / VTM-12" },
    { label: "Curve Set", value: "Set \"C\" (A–Z)" }
  ], y, { columns: 3, afterGap: 10 });

  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  const hasOversized = records.some((r) => r.hasOversizedCorrection);
  if (records.length) {
    y = ensurePage(doc, y, 80);
    const fontFamily = reportFontsRegistered ? REPORT_FONT_FAMILY : "helvetica";
    // Columns match TL-125A rows A–L
    const baseHead = [
      "Test #", "Location",
      "A\nMold+Soil (lb)", "B\nMold Wt (lb)", "D\nWet Density\n(lb/ft³)",
      "F\nMoisture (%)", "Curve",
      "G\nMDD (lb/ft³)", "H\nOMC (%)",
      "I\nField Density\n(lb/ft³)",
      "L\n% Comp.", "Result"
    ];
    const oversizedHead = hasOversized ? ["J\nNo.4 (%)", "K\nCorr MDD\n(lb/ft³)"] : [];
    // Column index of "Result" depends on whether oversized columns are appended
    const resultColIndex = baseHead.length - 1;
    const compColIndex = resultColIndex - 1;
    autoTable(doc, {
      startY: y,
      head: [[...baseHead, ...oversizedHead]],
      body: records.map((r, i) => {
        const pct = String(r.percentCompaction || "").trim();
        const result = String(r.compactionResult || "").trim();
        const base = [
          pdfValue(r.testNo || r.test_no || i + 1),
          pdfValue(r.location),
          pdfValue(r.moldAndSoilWeight),
          pdfValue(r.moldWeight),
          pdfValue(r.wetDensity),
          pdfValue(r.moistureContent),
          pdfValue(r.selectedCurve),
          pdfValue(r.maxDryDensityFromCurve),
          pdfValue(r.optimumMoistureFromCurve),
          pdfValue(r.fieldDryDensity),
          pct ? `${pct}%` : "—",
          result || "—"
        ];
        const oversized = hasOversized ? [
          pdfValue(r.percentPlusNo4),
          pdfValue(r.correctedMaxDryDensity)
        ] : [];
        return [...base, ...oversized];
      }),
      theme: "grid",
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_TOP_MARGIN, bottom: PAGE_BOTTOM_MARGIN + 16 },
      tableWidth: getContentWidth(doc),
      showHead: "everyPage",
      styles: { font: fontFamily, fontSize: 7, textColor: PDF_COLORS.navy, cellPadding: 3, valign: "middle" },
      headStyles: getDarkTableHeadStyles(7),
      bodyStyles: { fillColor: PDF_COLORS.white },
      alternateRowStyles: { fillColor: PDF_COLORS.zebra },
      didParseCell: ({ cell, column }) => {
        if (cell.section === "body") {
          if (column.index === resultColIndex) {
            const val = String(cell.raw || "").trim();
            if (val === "PASS") {
              cell.styles.textColor = [5, 122, 85];
              cell.styles.fontStyle = "bold";
            } else if (val === "FAIL") {
              cell.styles.textColor = [185, 28, 28];
              cell.styles.fontStyle = "bold";
            }
          }
          if (column.index === compColIndex) {
            cell.styles.fontStyle = "bold";
          }
        }
      }
    });
    y = doc.lastAutoTable.finalY + 10;

    y = ensurePage(doc, y, 28);
    doc.setFillColor(236, 253, 245);
    doc.roundedRect(PAGE_MARGIN, y, getContentWidth(doc), 18, 3, 3, "F");
    setReportFont(doc, "regular", 7, [5, 122, 85]);
    doc.text("C = A−B · D = C×30 · L = I/G×100  |  G from VTM-12 Fig. 1 · K (corrected MDD) applied when J ≥ 10% retained on No. 4  |  AASHTO T 272 / VTM-12 / TL-125A", PAGE_MARGIN + 6, y + 11);
    y += 24;
  } else {
    y = renderReferenceTextBox(doc, "Test Records", "No test records recorded for this report.", y);
  }

  // Figure 1: moisture-density curves on a dedicated page (mirrors TL-125A page 2)
  doc.addPage("letter", "portrait");
  _pagesWithoutLetterhead.add(doc.getNumberOfPages());
  y = renderProctorCurvesPage(doc, report);
  // Attachments start on a new page only when there are attachments to render;
  // ensurePage will handle the page break if there isn't enough room.
  y = await renderReferenceAttachmentContent(doc, getReportAttachments(report, activity, log), y, `One-Point Proctor Report ${reportIndex + 1} Attachments`);
  return y + 6;
}

async function renderReferenceSamplesReportBlock(doc, report, reportIndex, y, activity, log) {
  y = ensurePage(doc, y, 140);
  y = renderReferenceSectionBar(doc, `Samples Collection Report ${reportIndex + 1}`, y, {
    afterGap: 10,
    rightText: formatStatus(report.status || "Draft")
  });

  y = renderReferenceCardGrid(doc, [
    { label: "Project Name", value: pdfValue(report.projectName || report.project_name) },
    { label: "Project Number", value: pdfValue(report.projectNumber || report.project_number) },
    { label: "Sample Type", value: pdfValue(report.sampleType) },
    { label: "Cast Date", value: pdfValue(report.castDate || report.cast_date) },
    { label: "Samples / Specimens", value: pdfValue(report.specimenCount || report.specimen_count) },
    { label: "Date Collected", value: pdfValue(report.date) }
  ], y, { columns: 3, afterGap: 10 });

  y = renderReferenceTextBox(doc, "Comments", sentenceCase(report.comments || "No comments recorded."), y);

  y = await renderReferenceAttachmentContent(doc, getReportAttachments(report, activity, log), y, `Samples Collection Report ${reportIndex + 1} Attachments`);
  return y + 6;
}

async function renderReferenceVdotChecklistBlock(doc, report, reportIndex, y, activity, log) {
  // The checklist is drawn in the layout of the VDOT paper form, so it starts on
  // its own page rather than squeezing under the activity summary.
  // Its pages are laid out from the top like the paper form, so they carry
  // no letterhead.
  doc.addPage("letter", "portrait");
  const firstChecklistPage = doc.getNumberOfPages();
  y = renderVdotChecklistToDoc(doc, report, FORM_PAGE_TOP);
  for (let page = firstChecklistPage; page <= doc.getNumberOfPages(); page += 1) _pagesWithoutLetterhead.add(page);
  y = await renderReferenceAttachmentContent(doc, getReportAttachments(report, activity, log), y, `Report ${reportIndex + 1} Attachments`);
  return y + 6;
}

async function renderReferenceConcreteReportBlock(doc, report, reportIndex, y, activity, log) {
  y = ensurePage(doc, y, 160);
  y = renderReferenceSectionBar(doc, `Concrete Report ${reportIndex + 1} — ${getReportDfrNumber(report)}`, y, {
    afterGap: 10,
    rightText: formatStatus(report.status || report.reportStatus || "Draft")
  });

  y = renderReferenceSubTitle(doc, "Inspection Requirements", y);
  y = renderReferenceCardGrid(doc, getInspectionRequirementItems(report), y, { columns: 3, afterGap: 10 });

  const records = getReportRecords(report);
  if (records.length) {
    y = renderReferenceRecordsTable(doc, records, y);
    y = renderReferenceComplianceSummary(doc, records, y);
  } else {
    y = renderReferenceTextBox(doc, "Test Records", "No delivery or testing records recorded for this report.", y);
  }

  y = await renderReferenceAttachmentContent(doc, getReportAttachments(report, activity, log), y, `Concrete Report ${reportIndex + 1} Attachments`);
  return y + 6;
}

async function renderReferenceActivityDetails(doc, log, y) {
  const activities = log.activities || [];
  if (!activities.length) return y;

  y = ensurePage(doc, y, 180);
  y = renderReferenceSectionBar(doc, "Field Activities", y, {
    number: 2,
    afterGap: 12,
    rightText: `${activities.length} ${activities.length === 1 ? "activity" : "activities"}`
  });

  for (const [index, activity] of activities.entries()) {
    // Later activities start on a fresh page so each one's reports and
    // attachments stay together. The first follows Project Information
    // directly: breaking before it left most of page one blank.
    if (index > 0) {
      doc.addPage("letter", "portrait");
      y = PAGE_TOP_MARGIN;
    } else {
      y = ensurePage(doc, y, 140);
    }

    const reports = getScopedActivityReports(activity, log);
    const attachments = getActivityAttachments(activity, log);
    const photoCount = attachments.filter(isRenderableImageAttachment).length;
    const fileCount = attachments.length - photoCount;
    const counts = `${reports.length} report${reports.length === 1 ? "" : "s"}  ·  ${photoCount} photo${photoCount === 1 ? "" : "s"}  ·  ${fileCount} file${fileCount === 1 ? "" : "s"}`;

    // Each activity opens with a tinted band: "Activity 1 of 2" and its
    // counts above the activity name, an accent stripe down the left.
    const width = getContentWidth(doc);
    const right = PAGE_MARGIN + width;
    const bandHeight = 38;
    doc.setFillColor(...PDF_COLORS.labelBg);
    doc.rect(PAGE_MARGIN, y, width, bandHeight, "F");
    doc.setFillColor(..._accent);
    doc.rect(PAGE_MARGIN, y, 3, bandHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...accentText());
    doc.text(`ACTIVITY ${index + 1} OF ${activities.length}`, PAGE_MARGIN + 12, y + 13, { charSpace: 0.4 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(counts, right - 10, y + 13, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text(doc.splitTextToSize(getActivityName(activity, index), width - 24)[0], PAGE_MARGIN + 12, y + 28.5);
    y += bandHeight + 14;

    // Where and what kind of work, as label/value pairs. No Status: every
    // activity is created "in_progress" and nothing in the editor ever
    // changes it, so it read "In Progress" on every activity of every report,
    // approved ones included. It was a default, not a fact.
    let pairX = PAGE_MARGIN;
    for (const [label, value] of [["Location", activity.location || "N/A"], ["Type", getActivityType(activity)]]) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.2);
      doc.setTextColor(...PDF_COLORS.slate);
      doc.text(`${label}:`, pairX, y);
      pairX += doc.getTextWidth(`${label}:`) + 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...PDF_COLORS.ink);
      const text = doc.splitTextToSize(String(value), Math.max(right - pairX - 130, 80))[0] || "";
      doc.text(text, pairX, y);
      pairX += doc.getTextWidth(text) + 22;
    }
    y += 16;

    y = renderReferenceTextBox(doc, "Work Performed", sentenceCase(activity.description || "No description recorded."), y);

    if (!reports.length) {
      y = renderReferenceTextBox(
        doc,
        "Reports",
        attachments.length
          ? "No report was selected for this activity. Refer to the activity attachments below for supporting documentation."
          : "No report was selected for this activity.",
        y
      );
    }

    for (const [reportIndex, report] of reports.entries()) {
      const kind = getReportKind(report);
      if (kind === "vdot") {
        y = await renderReferenceVdotChecklistBlock(doc, report, reportIndex, y, activity, log);
      } else if (kind === "asphalt") {
        y = await renderReferenceAsphaltReportBlock(doc, report, reportIndex, y, activity, log);
      } else if (kind === "compaction") {
        y = await renderReferenceNuclearCompactionReportBlock(doc, report, reportIndex, y, activity, log);
      } else if (kind === "infiltration") {
        y = await renderReferenceInfiltrationReportBlock(doc, report, reportIndex, y, activity, log);
      } else if (kind === "proctor") {
        y = await renderReferenceProctorReportBlock(doc, report, reportIndex, y, activity, log);
      } else if (kind === "samples") {
        y = await renderReferenceSamplesReportBlock(doc, report, reportIndex, y, activity, log);
      } else {
        y = await renderReferenceConcreteReportBlock(doc, report, reportIndex, y, activity, log);
      }
    }

    y = await renderReferenceAttachmentContent(doc, attachments, y, `Activity ${String(index + 1).padStart(2, "0")} Attachments`);
  }
  return y;
}

// Section 3, Remarks: the technician's notes for the day -- delays, safety
// observations, site conditions -- followed by any notes the reviewer wrote
// while approving.
function renderReferenceComments(doc, log, y) {
  const notes = String(log.notes || "").trim();
  y = ensurePage(doc, y + 6, 80);
  y = renderReferenceSectionBar(doc, "Remarks", y, { number: 3, afterGap: 12 });
  return renderReferenceTextBox(doc, "Issues, delays, and site notes", notes || "No comments recorded.", y);
}

// Notes the reviewer wrote while approving, printed with the report they
// approved. Comments from returns are left out: they were requests the
// technician has since addressed, and the review history stays in the app.
function renderReferenceReviewerComments(doc, log, y) {
  const notes = (Array.isArray(log.managerComments) ? log.managerComments : [])
    .filter((comment) => comment?.kind === "approval" && String(comment.comment || "").trim());
  for (const note of notes) {
    const byline = [note.author, note.createdAt ? formatDateOnly(note.createdAt) : ""].filter(Boolean).join(" · ");
    y = renderReferenceTextBox(doc, byline ? `Reviewer note — ${byline}` : "Reviewer note", String(note.comment).trim(), y);
  }
  return y;
}

// Section 4, Sign-off: a box each for who prepared the report and who
// reviewed it, with the signature, name, role and date.
async function renderReferenceSignatures(doc, log, y) {
  y = ensurePage(doc, y, 132);
  y += 6;
  y = renderReferenceSectionBar(doc, "Sign-off", y, { number: 4, afterGap: 12 });
  const gap = 14;
  const boxWidth = (getContentWidth(doc) - gap) / 2;
  const boxHeight = 92;
  const submittedAt = log.submittedAt || log.submitted_at;
  const approvedAt = log.approvedAt || log.approved_at;
  const blocks = [
    {
      label: "Prepared by",
      role: "Technician",
      image: log.technicianSignature || log.technician_signature || log.technicianSignatureUrl || log.technician_signature_url,
      name: getTechnicianName(log),
      detail: submittedAt ? `Submitted ${formatDateOnly(submittedAt)}` : "Not yet submitted"
    },
    {
      label: "Reviewed by",
      role: "QA Reviewer",
      image: log.qcSignature || log.qc_signature || log.qcSignatureUrl || log.qc_signature_url,
      name: log.approvedBy || log.approved_by || "",
      detail: approvedAt ? `Approved ${formatDateOnly(approvedAt)}` : "Pending review"
    }
  ];
  for (const [index, block] of blocks.entries()) {
    const x = PAGE_MARGIN + index * (boxWidth + gap);
    doc.setDrawColor(...PDF_COLORS.rule);
    doc.setLineWidth(0.5);
    doc.rect(x, y, boxWidth, boxHeight, "S");
    doc.setDrawColor(..._accent);
    doc.setLineWidth(2);
    doc.line(x, y, x + boxWidth, y);
    doc.setLineWidth(0.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...accentText());
    doc.text(block.label.toUpperCase(), x + 10, y + 14, { charSpace: 0.4 });
    await renderSignatureImage(doc, block.image, x + 10, y + 20, boxWidth - 20, 32);
    doc.setDrawColor(...PDF_COLORS.rule);
    doc.line(x + 10, y + 58, x + boxWidth - 10, y + 58);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text(block.name || "—", x + 10, y + 72);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(`${block.role}  ·  ${block.detail}`, x + 10, y + 84);
  }
  return y + boxHeight + 10;
}
// Fully hydrated generation (project info, DB attachment rows, concrete report
// records) — guarantees the blob matches what regenerateDailyLogPdf produces.
// Used as the email-attachment fallback when the stored PDF cannot be fetched.
export async function generateHydratedDailyLogPdfBlob(log) {
  return generateDailyLogPdfBlob(await hydrateDailyLogForPdf(log));
}

export async function generateDailyLogPdfBlob(log) {
  _pdfMergeQueue = [];
  _pagesWithoutLetterhead = new Set();
  _photoCounter = 0;

  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter", compress: true });
  await registerReportFonts(doc);
  const letterhead = await loadLetterhead(log);

  // Every page keeps the top band free for the page header, drawn once the
  // page count is known. Accent and margin are restored afterwards for the
  // standalone PDFs.
  _accent = hexToRgb(log.brandColor || log.brand_color || getCompanyBranding().brandColor) || DEFAULT_ACCENT;
  PAGE_TOP_MARGIN = LETTERHEAD_CONTENT_TOP;
  try {
    let y = PAGE_TOP_MARGIN;
    y = renderReferenceDailyLogHeader(doc, log, y);
    y = renderReferenceSectionBar(doc, "Project Summary", y, { number: 1, afterGap: 10 });
    y = renderSummaryPanel(doc, [
      [{ label: "Project", value: getProjectName(log), span: 2 }, { label: "Project No.", value: getProjectNumber(log) }],
      [{ label: "Location", value: getProjectLocation(log), span: 2 }, { label: "Report Date", value: formatDateOnly(getLogDate(log)) }],
      [
        { label: "General Contractor", value: log.generalContractor || log.general_contractor || log.project?.general_contractor || "Not recorded" },
        { label: "GC Representative", value: log.gcRepresentative || log.gc_representative || "Not recorded" },
        { label: "Shift", value: log.shift || log.shift_name || "Not recorded" }
      ],
      [{ label: "Technician", value: getTechnicianName(log) }, { label: "Weather", value: getWeatherText(log), span: 2 }]
    ], y);
    y = await renderReferenceActivityDetails(doc, log, y);
    y = renderReferenceComments(doc, log, y);
    y = renderReferenceReviewerComments(doc, log, y);
    // Sign-off last: it attests the work recorded above it.
    await renderReferenceSignatures(doc, log, y);
    renderPageHeaders(doc, letterhead, {
      reportNumber: getDailyReportNumber(log),
      date: formatDateOnly(getLogDate(log)),
      projectNumber: getProjectNumber(log)
    });
    PdfFooter(doc, log, letterhead);
  } finally {
    PAGE_TOP_MARGIN = FORM_PAGE_TOP;
    _accent = DEFAULT_ACCENT;
  }

  const mainBlob = doc.output("blob");
  return mergePdfAttachments(mainBlob, _pdfMergeQueue);
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
    cacheControl: "0",
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

const LOCKED_DAILY_LOG_STATUSES = ["submitted", "pending_manager_review", "approved"];

// A submitted or approved log can no longer be edited by its technician, and
// the server holds the reviewer's decision on it -- status, comments,
// signature, approval date. A device's saved copy can lag behind: the
// technician's is refreshed only by the background sync, and the reviewer's
// was captured when the review page opened. Draw locked logs from the server's
// copy. Returned logs and drafts stay with the device, which may hold edits
// not yet submitted.
async function withServerReviewState(log) {
  if (!LOCKED_DAILY_LOG_STATUSES.includes(String(log?.status || "").toLowerCase())) return log;
  try {
    const serverLog = await fetchDailyLogFromSupabase(log.supabaseDailyLogId || log.supabase_daily_log_id || log.id);
    return serverLog ? { ...log, ...serverLog } : log;
  } catch (error) {
    console.warn("[Daily Log PDF] Could not load the server copy; drawing from this device's copy", error);
    return log;
  }
}

function reviewStateKey(log = {}) {
  return [
    String(log.status || "").toLowerCase(),
    log.approvedAt || log.approved_at || "",
    log.returnedAt || log.returned_at || "",
    (Array.isArray(log.managerComments) ? log.managerComments : []).length
  ].join("|");
}

const pendingPdfState = {
  pdfGenerationStatus: "pending",
  pdf_generation_status: "pending",
  pdfGenerationFailureReason: "",
  pdf_generation_failure_reason: "",
  pdfGenerationError: ""
};

export async function regenerateDailyLogPdf(log) {
  let pendingLog = saveDailyLog({ ...(await withServerReviewState(log)), ...pendingPdfState });

  try {
    let pdfBlob = await generateDailyLogPdfBlob(await hydrateDailyLogForPdf(pendingLog));
    // A reviewer can approve or return the log while this runs. The PDF is
    // stored at one path for everyone, so a copy drawn before the decision
    // would replace the decided report. Draw it again from the decision.
    const latest = await withServerReviewState(pendingLog);
    if (reviewStateKey(latest) !== reviewStateKey(pendingLog)) {
      pendingLog = saveDailyLog({ ...latest, ...pendingPdfState });
      pdfBlob = await generateDailyLogPdfBlob(await hydrateDailyLogForPdf(pendingLog));
    }
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
          pdf_storage_mode: "browser-cache",
          pdfLayoutVersion: DAILY_LOG_PDF_LAYOUT_VERSION
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
      pdf_storage_mode: "supabase",
      pdfLayoutVersion: DAILY_LOG_PDF_LAYOUT_VERSION
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
  // Claim the tab now, while the tap still counts. Fetching the signed URL
  // first loses the gesture, and phones then block the window with no error.
  const tab = download ? null : reserveTab();
  try {
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
    tab.show(signedUrl);
    return signedUrl;
  } catch (error) {
    tab?.close();
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone One-Point Proctor PDF (TL-125A / VTM-12 format)
// Page 1: vertical A–L data table; Page 2: Figure 1 moisture-density curves
// ─────────────────────────────────────────────────────────────────────────────

const PROCTOR_ROW_DEFS = [
  { letter: "",  key: "location",                label: "Location / Station",                         section: "info" },
  { letter: "",  key: "materialDescription",     label: "Material Description",                       section: "info" },
  { letter: "",  key: "moistureMethod",          label: "Moisture Test Method",                       section: "info" },
  { letter: "A", key: "moldAndSoilWeight",       label: "Weight of Mold + Wet Soil (lb)",             section: "mold" },
  { letter: "B", key: "moldWeight",              label: "Weight of Mold (lb)",                        section: "mold" },
  { letter: "C", key: "wetSoilWeight",           label: "Wet Soil Weight  =  A − B  (lb)",       section: "mold", computed: true },
  { letter: "D", key: "wetDensity",              label: "Wet Density  =  C × 30  (lb/ft³)", section: "mold", computed: true },
  { letter: "E", key: "speedyDialReading",       label: "“Speedy” Dial Reading",             section: "moist" },
  { letter: "F", key: "moistureContent",         label: "Moisture Content (%)",                       section: "moist" },
  { letter: "",  key: "selectedCurve",           label: "Selected Curve from Fig. 1",                 section: "curve" },
  { letter: "G", key: "maxDryDensityFromCurve",  label: "Maximum Dry Density from Fig. 1 (lb/ft³)", section: "curve", computed: true },
  { letter: "H", key: "optimumMoistureFromCurve",label: "Optimum Moisture Content from Fig. 1 (%)",   section: "curve", computed: true },
  { letter: "I", key: "fieldDryDensity",         label: "Field Dry Density from TL-125 (lb/ft³)", section: "field" },
  { letter: "",  key: "requiredCompaction",      label: "Required Compaction (%)",                    section: "field" },
  { letter: "J", key: "percentPlusNo4",          label: "No. 4 (+4.75 mm) Material (%)",              section: "oversized" },
  { letter: "",  key: "bulkSpecificGravity",     label: "Bulk Specific Gravity of +No. 4 Material",   section: "oversized" },
  { letter: "K", key: "correctedMaxDryDensity",  label: "Corrected Maximum Dry Density (lb/ft³)", section: "oversized", computed: true },
  { letter: "",  key: "correctedOptimumMoisture",label: "Corrected Optimum Moisture (%)",              section: "oversized", computed: true },
  { letter: "L", key: "percentCompaction",       label: "% Compaction  =  I ÷ (G or K) × 100", section: "result", computed: true },
  { letter: "",  key: "compactionResult",        label: "Result",                                     section: "result" },
];

const SECTION_BG = {
  info:      [255, 255, 255],
  mold:      [248, 250, 252],
  moist:     [239, 246, 255],
  curve:     [235, 245, 255],
  field:     [240, 253, 244],
  oversized: [255, 251, 235],
  result:    [236, 253, 245],
};

export async function generateProctorStandalonePdf(report, { download = true } = {}) {
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter", compress: true });
  await registerReportFonts(doc);
  const fontFamily = reportFontsRegistered ? REPORT_FONT_FAMILY : "helvetica";
  const pageW = getPageWidth(doc);
  const cw = getContentWidth(doc);

  // ── Page 1: Data form ──────────────────────────────────────────────────────
  let y = PAGE_TOP_MARGIN;

  // Header bar
  doc.setFillColor(...PDF_COLORS.navy);
  doc.roundedRect(PAGE_MARGIN, y, cw, 54, 4, 4, "F");
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PDF_COLORS.white);
  doc.text("ONE-POINT PROCTOR COMPACTION TEST", PAGE_MARGIN + 14, y + 20);
  doc.setFont(fontFamily, "normal");
  doc.setFontSize(8.5);
  doc.text("VTM-12  ·  AASHTO T 272  ·  TL-125A  ·  Standard Method A of T 99", PAGE_MARGIN + 14, y + 35);
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(9.5);
  doc.text(pdfValue(report.projectNumber || report.project_number || ""), pageW - PAGE_MARGIN - 10, y + 28, { align: "right" });
  y += 66;

  // Report meta grid
  y = renderReferenceCardGrid(doc, [
    { label: "Project Name",   value: pdfValue(report.projectName || report.project_name) },
    { label: "Project Number", value: pdfValue(report.projectNumber || report.project_number) },
    { label: "Date",           value: pdfValue(report.date) },
    { label: "Client",         value: pdfValue(report.client) },
    { label: "Location",       value: pdfValue(report.projectLocation || report.location || "") },
    { label: "Test Standard",  value: "AASHTO T 272 / VTM-12" },
  ], y, { columns: 3, afterGap: 14 });

  // Vertical A–L data table
  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  const testHeaders = records.length > 0
    ? records.map((r, i) => `Test ${r.testNo || i + 1}`)
    : ["Test 1"];

  const head = [["", "Description", ...testHeaders]];
  const body = PROCTOR_ROW_DEFS.map((def) => {
    const vals = records.length > 0
      ? records.map((r) => {
          const v = r[def.key];
          return (v === null || v === undefined || String(v).trim() === "") ? "—" : String(v);
        })
      : ["—"];
    return [def.letter, def.label, ...vals];
  });

  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: "grid",
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_TOP_MARGIN, bottom: PAGE_BOTTOM_MARGIN + 16 },
    tableWidth: cw,
    showHead: "everyPage",
    columnStyles: {
      0: { cellWidth: 18, halign: "center", fontStyle: "bold", fontSize: 9 },
      1: { cellWidth: "auto" },
    },
    styles: {
      font: fontFamily, fontSize: 8, textColor: PDF_COLORS.navy,
      cellPadding: { top: 4, bottom: 4, left: 7, right: 7 }, valign: "middle"
    },
    headStyles: getDarkTableHeadStyles(8),
    bodyStyles: { fillColor: PDF_COLORS.white },
    didParseCell: ({ cell, column, row, section }) => {
      if (section !== "body") return;
      const def = PROCTOR_ROW_DEFS[row.index];
      if (!def) return;
      const bg = SECTION_BG[def.section] || PDF_COLORS.white;
      cell.styles.fillColor = def.computed ? [242, 247, 255] : bg;
      if (column.index === 0 && def.letter) {
        cell.styles.fillColor = PDF_COLORS.navy;
        cell.styles.textColor = PDF_COLORS.white;
        cell.styles.fontSize = 9;
        cell.styles.fontStyle = "bold";
      }
      if (def.key === "compactionResult") {
        const val = String(cell.raw || "").trim();
        if (val === "PASS") { cell.styles.textColor = [5, 122, 85]; cell.styles.fontStyle = "bold"; }
        else if (val === "FAIL") { cell.styles.textColor = [185, 28, 28]; cell.styles.fontStyle = "bold"; }
      }
      if (def.letter === "L") cell.styles.fontStyle = "bold";
    }
  });

  y = doc.lastAutoTable.finalY + 20;

  // Signature line
  y = ensurePage(doc, y, 60);
  doc.setDrawColor(...PDF_COLORS.line);
  doc.setLineWidth(0.5);
  const half = (cw - 16) / 2;
  doc.line(PAGE_MARGIN, y + 38, PAGE_MARGIN + half, y + 38);
  doc.line(PAGE_MARGIN + half + 16, y + 38, PAGE_MARGIN + cw, y + 38);
  setReportFont(doc, "regular", 8, PDF_COLORS.muted);
  doc.text("Technician Signature", PAGE_MARGIN, y + 48);
  doc.text("Date", PAGE_MARGIN + half + 16, y + 48);

  // ── Page 2: Figure 1 ──────────────────────────────────────────────────────
  doc.addPage("letter", "portrait");
  renderProctorCurvesPage(doc, report);

  // ── Output ────────────────────────────────────────────────────────────────
  const fileName = `${report.projectNumber || report.project_number || "Proctor-Report"}.pdf`;
  if (download) {
    doc.save(fileName);
    return null;
  }
  return doc.output("blob");
}

export async function generateSamplesStandalonePdf(report, { download = true } = {}) {
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter", compress: true });
  await registerReportFonts(doc);
  const fontFamily = reportFontsRegistered ? REPORT_FONT_FAMILY : "helvetica";
  const pageW = getPageWidth(doc);
  const cw = getContentWidth(doc);

  let y = PAGE_TOP_MARGIN;

  // Header bar
  doc.setFillColor(...PDF_COLORS.navy);
  doc.roundedRect(PAGE_MARGIN, y, cw, 54, 4, 4, "F");
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PDF_COLORS.white);
  doc.text("SAMPLES COLLECTION REPORT", PAGE_MARGIN + 14, y + 20);
  doc.setFont(fontFamily, "normal");
  doc.setFontSize(8.5);
  doc.text("Field Sampling Record", PAGE_MARGIN + 14, y + 35);
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(9.5);
  doc.text(pdfValue(report.projectNumber || report.project_number || ""), pageW - PAGE_MARGIN - 10, y + 28, { align: "right" });
  y += 66;

  // Report meta grid
  y = renderReferenceCardGrid(doc, [
    { label: "Project Name",        value: pdfValue(report.projectName || report.project_name) },
    { label: "Project Number",      value: pdfValue(report.projectNumber || report.project_number) },
    { label: "Sample Type",         value: pdfValue(report.sampleType) },
    { label: "Cast Date",           value: pdfValue(report.castDate || report.cast_date) },
    { label: "Samples / Specimens", value: pdfValue(report.specimenCount || report.specimen_count) },
    { label: "Date Collected",      value: pdfValue(report.date) },
  ], y, { columns: 3, afterGap: 14 });

  // Comments
  y = renderReferenceTextBox(doc, "Comments", sentenceCase(report.comments || "No comments recorded."), y);

  // Signature line
  y = ensurePage(doc, y, 60);
  doc.setDrawColor(...PDF_COLORS.line);
  doc.setLineWidth(0.5);
  const half = (cw - 16) / 2;
  doc.line(PAGE_MARGIN, y + 38, PAGE_MARGIN + half, y + 38);
  doc.line(PAGE_MARGIN + half + 16, y + 38, PAGE_MARGIN + cw, y + 38);
  setReportFont(doc, "regular", 8, PDF_COLORS.muted);
  doc.text("Technician Signature", PAGE_MARGIN, y + 48);
  doc.text("Date", PAGE_MARGIN + half + 16, y + 48);

  const fileName = `${report.projectNumber || report.project_number || "Samples-Collection-Report"}.pdf`;
  if (download) {
    doc.save(fileName);
    return null;
  }
  return doc.output("blob");
}
