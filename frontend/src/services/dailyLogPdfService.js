import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import interRegularUrl from "../assets/fonts/Inter-Regular.ttf?url";
import interSemiBoldUrl from "../assets/fonts/Inter-SemiBold.ttf?url";
import { supabase } from "./supabase.js";
import { saveDailyLog } from "./dailyLogService.js";
import { getStorageConfigError, logStorageStep } from "./storageDiagnosticsService.js";

const DAILY_LOG_PDF_BUCKET = "daily-log-pdfs";
const SIGNED_URL_TTL_SECONDS = 60 * 10;
const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;
const PAGE_MARGIN = 40;
const PAGE_TOP_MARGIN = 36;
const PAGE_BOTTOM_MARGIN = 42;
const LOCAL_PDF_CACHE_LIMIT_BYTES = 2_500_000;
const COMPANY_NAME = "Dulles Engineering, Inc.";
const COMPANY_LOGO_URL = "https://img1.wsimg.com/isteam/ip/5d283b38-0950-4c46-838b-44766d9a75d2/DULLES%20ENGINEERING_new%20logo.png/%3A/rs%3Dh%3A78%2Ccg%3Atrue%2Cm/qt%3Dq%3A95";
const REPORT_FONT_FAMILY = "Inter";
let reportFontsRegistered = false;
const PDF_COLORS = {
  navy: [16, 24, 40],
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

const TABLE_STYLES = {
  fontSize: 9,
  cellPadding: { top: 6, right: 8, bottom: 6, left: 8 },
  lineColor: PDF_COLORS.line,
  lineWidth: 0.35,
  textColor: PDF_COLORS.navy,
  minCellHeight: 24,
  valign: "middle"
};

const TABLE_HEAD_STYLES = {
  fillColor: PDF_COLORS.soft,
  textColor: PDF_COLORS.navy,
  fontStyle: "bold",
  fontSize: 10
};

function pdfValue(value) {
  return value == null || value === "" ? "N/A" : String(value);
}

function formatDateOnly(value) {
  if (!value) return "N/A";
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
    const legacyReports = await Promise.all((activity.reports || []).map(hydrateConcreteReportForPdf));
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

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function registerReportFonts(doc) {
  if (reportFontsRegistered) return;
  try {
    const [regularResponse, boldResponse] = await Promise.all([
      fetch(interRegularUrl),
      fetch(interSemiBoldUrl)
    ]);
    if (!regularResponse.ok || !boldResponse.ok) throw new Error("Unable to load report font assets.");
    doc.addFileToVFS("Inter-Regular.ttf", arrayBufferToBase64(await regularResponse.arrayBuffer()));
    doc.addFont("Inter-Regular.ttf", REPORT_FONT_FAMILY, "normal");
    doc.addFileToVFS("Inter-SemiBold.ttf", arrayBufferToBase64(await boldResponse.arrayBuffer()));
    doc.addFont("Inter-SemiBold.ttf", REPORT_FONT_FAMILY, "bold");
    reportFontsRegistered = true;
  } catch (error) {
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

function getConsolidatedConcreteRecordRows(records) {
  return records.map((record, index) => CONSOLIDATED_CONCRETE_RECORD_COLUMNS.map((column) => {
    if (column.label === "Test #") return pdfValue(getRecordField(record, column.keys) || index + 1);
    if (column.label === "Result") return formatStatus(getRecordField(record, column.keys));
    if (column.label === "Strength") return formatStrengthRequired(getRecordField(record, column.keys));
    return pdfValue(getRecordField(record, column.keys));
  }));
}

function getConsolidatedConcreteColumnStyles(doc) {
  const totalBaseWidth = CONSOLIDATED_CONCRETE_RECORD_COLUMNS.reduce((sum, column) => sum + column.width, 0);
  const scale = getContentWidth(doc) / totalBaseWidth;
  return CONSOLIDATED_CONCRETE_RECORD_COLUMNS.reduce((styles, column, index) => {
    styles[index] = {
      cellWidth: column.width * scale,
      halign: column.align || "center"
    };
    return styles;
  }, {});
}

function ensureConcreteLandscapePage(doc, y) {
  if (getPageWidth(doc) > getPageHeight(doc)) return y;
  doc.addPage("letter", "landscape");
  return PAGE_TOP_MARGIN;
}

function renderRecordsTable(doc, records = [], y) {
  if (!records.length) return y;
  y = ensureConcreteLandscapePage(doc, y);
  y = ensurePage(doc, y, 64);
  setReportFont(doc, "semibold", 11, PDF_COLORS.navy);
  doc.text("Material Delivery & Verification Records", PAGE_MARGIN, y);
  setReportFont(doc, "regular", 8.5, PDF_COLORS.slate);
  doc.text(`${records.length} records`, getPageWidth(doc) - PAGE_MARGIN, y, { align: "right" });
  y += 12;

  autoTable(doc, {
    startY: y,
    head: [CONSOLIDATED_CONCRETE_RECORD_COLUMNS.map((column) => column.label)],
    body: getConsolidatedConcreteRecordRows(records),
    theme: "grid",
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_TOP_MARGIN, bottom: PAGE_BOTTOM_MARGIN + 16 },
    tableWidth: getContentWidth(doc),
    showHead: "everyPage",
    styles: {
      font: "helvetica",
      fontSize: 5.6,
      cellPadding: { top: 2.2, right: 1.4, bottom: 2.2, left: 1.4 },
      overflow: "linebreak",
      valign: "middle",
      halign: "center",
      lineColor: PDF_COLORS.line,
      lineWidth: 0.55,
      textColor: PDF_COLORS.navy,
      minCellHeight: 13
    },
    headStyles: {
      fillColor: PDF_COLORS.navy,
      textColor: PDF_COLORS.white,
      fontStyle: "bold",
      fontSize: 5.5,
      halign: "center",
      minCellHeight: 17
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.soft
    },
    columnStyles: getConsolidatedConcreteColumnStyles(doc),
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const header = CONSOLIDATED_CONCRETE_RECORD_COLUMNS[data.column.index]?.label;
      const value = String(data.cell.raw || "").toLowerCase();
      if (header === "Result") {
        if (value.includes("pass")) {
          data.cell.styles.textColor = PDF_COLORS.green;
          data.cell.styles.fontStyle = "bold";
        } else if (value.includes("fail")) {
          data.cell.styles.textColor = PDF_COLORS.red;
          data.cell.styles.fontStyle = "bold";
        } else if (value.includes("retest") || value.includes("pending") || value.includes("review")) {
          data.cell.styles.textColor = PDF_COLORS.amber;
          data.cell.styles.fontStyle = "bold";
        }
      }
    }
  });

  return (doc.lastAutoTable?.finalY || y) + 14;
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
  const source = await resolveAttachmentSource(attachment);
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
      // Cap attached pages at roughly two-thirds of the printable height so they
      // read as embedded figures instead of consuming a full page each.
      const maxAttachedPageHeight = 440;
      const ratio = Math.min(getContentWidth(doc) / canvas.width, maxAttachedPageHeight / canvas.height);
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
  return AttachedReportBlock(doc, report, reportIndex, y, activity, log);
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

function statusColor(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("approved") || normalized.includes("complete")) return PDF_COLORS.green;
  if (normalized.includes("return") || normalized.includes("fail")) return PDF_COLORS.red;
  if (normalized.includes("pending") || normalized.includes("review") || normalized.includes("retest")) return PDF_COLORS.amber;
  if (normalized.includes("draft")) return PDF_COLORS.blue;
  return PDF_COLORS.slate;
}

function drawBadge(doc, text, x, y, options = {}) {
  const color = options.color || statusColor(text);
  const paddingX = options.paddingX || 7;
  const height = options.height || 15;
  setReportFont(doc, "semibold", options.fontSize || 7.5, color);
  const width = Math.max(options.minWidth || 0, doc.getTextWidth(String(text)) + paddingX * 2);
  doc.setDrawColor(...color);
  doc.setFillColor(...PDF_COLORS.white);
  doc.roundedRect(x, y, width, height, height / 2, height / 2, "S");
  doc.text(String(text), x + width / 2, y + height - 5, { align: "center" });
  return width;
}

async function PdfHeader(doc, log, y) {
  const pageWidth = getPageWidth(doc);
  const width = getContentWidth(doc);
  const leftWidth = 122;
  const rightWidth = 128;
  const centerWidth = width - leftWidth - rightWidth - 26;
  setReportFont(doc, "medium", 10, PDF_COLORS.slate);
  const projectLines = doc.splitTextToSize(getProjectName(log), centerWidth);
  setReportFont(doc, "semibold", 9.5, PDF_COLORS.navy);
  const reportNumberLines = doc.splitTextToSize(getDailyReportNumber(log), rightWidth);
  const rightZoneHeight = 58 + reportNumberLines.length * 11;
  const headerHeight = Math.max(94, 58 + projectLines.length * 13, rightZoneHeight);
  const logoSource = await sourceToDataUrl(log.companyLogoUrl || log.company_logo_url || COMPANY_LOGO_URL) || getDullesLogoDataUrl();

  y = ensurePage(doc, y, headerHeight + 10);
  doc.setFillColor(...PDF_COLORS.navy);
  doc.rect(0, 0, pageWidth, 10, "F");
  doc.setDrawColor(...PDF_COLORS.line);
  doc.setFillColor(...PDF_COLORS.white);
  doc.rect(PAGE_MARGIN, y, width, headerHeight, "FD");

  if (logoSource?.startsWith("data:image/")) {
    addImageToPdf(doc, logoSource, { fileType: "image/png" }, PAGE_MARGIN + 10, y + 15, 74, 34);
  } else {
    doc.setFillColor(...PDF_COLORS.paleBlue);
    doc.roundedRect(PAGE_MARGIN + 10, y + 15, 48, 34, 4, 4, "F");
    setReportFont(doc, "semibold", 13, PDF_COLORS.blue);
    doc.text("DE", PAGE_MARGIN + 26, y + 36);
  }
  setReportFont(doc, "semibold", 8.5, PDF_COLORS.navy);
  doc.text(COMPANY_NAME, PAGE_MARGIN + 10, y + 61);

  const centerX = PAGE_MARGIN + leftWidth + 13;
  setReportFont(doc, "semibold", 24, PDF_COLORS.navy);
  doc.text("DAILY FIELD REPORT", centerX, y + 30);
  setReportFont(doc, "medium", 10, PDF_COLORS.slate);
  doc.text(projectLines, centerX, y + 48);

  const rightX = PAGE_MARGIN + width - rightWidth;
  setReportFont(doc, "medium", 7.5, PDF_COLORS.muted);
  doc.text("REPORT NUMBER", rightX, y + 22);
  setReportFont(doc, "semibold", 9.5, PDF_COLORS.navy);
  doc.text(reportNumberLines, rightX, y + 34);
  const dateLabelY = y + 36 + reportNumberLines.length * 11;
  setReportFont(doc, "medium", 7.5, PDF_COLORS.muted);
  doc.text("DATE", rightX, dateLabelY);
  setReportFont(doc, "semibold", 9.5, PDF_COLORS.navy);
  doc.text(formatDateOnly(getLogDate(log)), rightX, dateLabelY + 12);
  drawBadge(doc, formatStatus(log.status || "Pending Manager Review"), rightX, dateLabelY + 20, { minWidth: 84 });

  return y + headerHeight + 14;
}

function SectionTitle(doc, title, y, options = {}) {
  y = ensurePage(doc, y, options.minSpace || 36);
  setReportFont(doc, "semibold", options.size || 13, PDF_COLORS.navy);
  doc.text(String(title).toUpperCase(), PAGE_MARGIN, y);
  doc.setDrawColor(...PDF_COLORS.navy);
  doc.setLineWidth(0.8);
  doc.line(PAGE_MARGIN, y + 6, getPageWidth(doc) - PAGE_MARGIN, y + 6);
  doc.setLineWidth(0.2);
  return y + 18;
}

function InfoGrid(doc, items, y, options = {}) {
  const columns = options.columns || 4;
  const gap = options.gap ?? 8;
  const cellWidth = (getContentWidth(doc) - gap * (columns - 1)) / columns;

  for (let start = 0; start < items.length; start += columns) {
    const row = items.slice(start, start + columns);
    const heights = row.map((item) => {
      setReportFont(doc, "regular", options.valueSize || 9.5, PDF_COLORS.navy);
      const lines = doc.splitTextToSize(pdfValue(item.value), cellWidth - 18);
      return Math.max(options.minHeight || 38, 20 + lines.length * 11);
    });
    const rowHeight = Math.max(...heights, options.minHeight || 38);
    y = ensurePage(doc, y, rowHeight + 6);
    row.forEach((item, index) => {
      const x = PAGE_MARGIN + index * (cellWidth + gap);
      doc.setDrawColor(...PDF_COLORS.line);
      doc.setFillColor(...PDF_COLORS.soft);
      doc.roundedRect(x, y, cellWidth, rowHeight, 3, 3, "FD");
      setReportFont(doc, "medium", options.labelSize || 7.6, PDF_COLORS.muted);
      doc.text(String(item.label || "").toUpperCase(), x + 8, y + 12);
      setReportFont(doc, "regular", options.valueSize || 9.5, PDF_COLORS.navy);
      doc.text(doc.splitTextToSize(pdfValue(item.value), cellWidth - 18), x + 8, y + 25);
    });
    y += rowHeight + gap;
  }

  return y + 3;
}

function SummaryCards(doc, items, y) {
  return InfoGrid(doc, items, y, {
    columns: 3,
    gap: 8,
    minHeight: 44,
    labelSize: 7.5,
    valueSize: 10
  });
}

function ProfessionalTable(doc, { title, columns, rows }, y, options = {}) {
  y = ensurePage(doc, y, options.minSpace || 70);
  if (title) {
    setReportFont(doc, "semibold", options.titleSize || 10.5, PDF_COLORS.navy);
    doc.text(title, PAGE_MARGIN, y);
    y += 9;
  }

  autoTable(doc, {
    startY: y,
    head: [columns],
    body: rows.length ? rows : [columns.map(() => "N/A")],
    theme: "grid",
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_TOP_MARGIN, bottom: PAGE_BOTTOM_MARGIN + 16 },
    tableWidth: getContentWidth(doc),
    showHead: "everyPage",
    pageBreak: options.pageBreak || "auto",
    rowPageBreak: "avoid",
    styles: {
      font: "helvetica",
      fontSize: options.fontSize || 8.3,
      cellPadding: options.cellPadding || 4,
      overflow: "linebreak",
      valign: "middle",
      lineColor: PDF_COLORS.line,
      lineWidth: 0.35,
      textColor: PDF_COLORS.navy,
      minCellHeight: 17
    },
    headStyles: {
      fillColor: PDF_COLORS.navy,
      textColor: PDF_COLORS.white,
      fontStyle: "bold",
      fontSize: options.headFontSize || 8.2,
      halign: "center",
      valign: "middle"
    },
    alternateRowStyles: { fillColor: PDF_COLORS.soft },
    columnStyles: options.columnStyles || {},
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const header = columns[data.column.index];
      const value = String(data.cell.raw || "").toLowerCase();
      if (header === "Result") {
        if (value.includes("pass")) {
          data.cell.styles.textColor = PDF_COLORS.green;
          data.cell.styles.fontStyle = "bold";
        } else if (value.includes("fail")) {
          data.cell.styles.textColor = PDF_COLORS.red;
          data.cell.styles.fontStyle = "bold";
        } else if (value.includes("retest") || value.includes("pending")) {
          data.cell.styles.textColor = PDF_COLORS.amber;
          data.cell.styles.fontStyle = "bold";
        }
      }
    }
  });

  return doc.lastAutoTable.finalY + 12;
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
  doc.setDrawColor(...PDF_COLORS.line);
  doc.setFillColor(...PDF_COLORS.soft);
  doc.roundedRect(x, y, width, height, 4, 4, "FD");
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

async function AttachmentGallery(doc, attachments = [], y, title = "Attachments") {
  if (!attachments.length) return y;
  y = SectionTitle(doc, title, y, { minSpace: 42, size: 12 });

  const photos = attachments.filter(isRenderableImageAttachment);
  const documents = attachments.filter((attachment) => !isRenderableImageAttachment(attachment));

  setReportFont(doc, "semibold", 9.5, PDF_COLORS.navy);
  doc.text("Photos", PAGE_MARGIN, y);
  y += 10;

  if (!photos.length) {
    y = InfoGrid(doc, [{ label: "Photos", value: "No photos attached" }], y, { columns: 1, minHeight: 30 });
  } else {
    const gap = 10;
    const boxWidth = (getContentWidth(doc) - gap) / 2;
    const maxImageHeight = 112;
    for (let index = 0; index < photos.length; index += 2) {
      const row = photos.slice(index, index + 2);
      y = ensurePage(doc, y, maxImageHeight + 38);
      const rendered = [];
      for (const [rowIndex, attachment] of row.entries()) {
        const x = PAGE_MARGIN + rowIndex * (boxWidth + gap);
        let source = getAttachmentSource(attachment);
        try {
          source = await sourceToDataUrl(source);
          if (source?.startsWith("data:image/")) {
            source = await compressImageDataUrl(source, { maxDimension: 1200, quality: 0.78 });
            const props = doc.getImageProperties(source);
            const ratio = Math.min((boxWidth - 12) / props.width, maxImageHeight / props.height);
            rendered.push({ attachment, source, x, width: props.width * ratio, height: props.height * ratio });
          } else {
            rendered.push({ attachment, source: "", x, width: 0, height: 0 });
          }
        } catch {
          rendered.push({ attachment, source: "", x, width: 0, height: 0 });
        }
      }

      for (const item of rendered) {
        doc.setDrawColor(...PDF_COLORS.line);
        doc.setFillColor(...PDF_COLORS.white);
        doc.roundedRect(item.x, y, boxWidth, maxImageHeight + 30, 4, 4, "FD");
        if (item.source) {
          doc.addImage(item.source, getImageFormat(item.source, item.attachment), item.x + (boxWidth - item.width) / 2, y + 6, item.width, item.height, undefined, "FAST");
        } else {
          setReportFont(doc, "regular", 8.5, PDF_COLORS.slate);
          doc.text("Image unavailable", item.x + 8, y + 22);
        }
        setReportFont(doc, "regular", 7.5, PDF_COLORS.slate);
        const caption = [
          getAttachmentFileName(item.attachment),
          item.attachment?.createdAt || item.attachment?.created_at || item.attachment?.uploadedAt || item.attachment?.uploaded_at
            ? formatDateTime(item.attachment.createdAt || item.attachment.created_at || item.attachment.uploadedAt || item.attachment.uploaded_at)
            : ""
        ].filter(Boolean).join(" • ");
        doc.text(doc.splitTextToSize(caption, boxWidth - 16), item.x + 8, y + maxImageHeight + 17);
      }
      y += maxImageHeight + 40;
    }
  }

  if (documents.length) {
    setReportFont(doc, "semibold", 9.5, PDF_COLORS.navy);
    doc.text("Documents", PAGE_MARGIN, y);
    y += 10;
    const gap = 8;
    const cardWidth = (getContentWidth(doc) - gap) / 2;
    const cardHeight = 42;
    for (let index = 0; index < documents.length; index += 2) {
      y = ensurePage(doc, y, cardHeight + 8);
      documents.slice(index, index + 2).forEach((attachment, rowIndex) => {
        renderAttachmentCard(doc, attachment, PAGE_MARGIN + rowIndex * (cardWidth + gap), y, cardWidth, cardHeight);
      });
      y += cardHeight + gap;
    }
  }

  return y + 4;
}

function getSpecSummaryItems(report) {
  return [
    ["Strength", getReportSpecificationValue(report, ["speed_of_stress_psi", "speed_of_stress", "strength_spec", "specified_strength_psi", "specified_strength", "specifiedStrength"])],
    ["Slump", getReportSpecificationValue(report, ["slump_in", "slump", "slumpIn"])],
    ["Air Content", getReportSpecificationValue(report, ["air_content_percent", "air_content", "airContent", "airContentPercent"])],
    ["Unit Weight", getReportSpecificationValue(report, ["unit_weight_lbs_ft3", "unit_weight", "unitWeight", "unitWeightLbsFt3"])],
    ["Material Temp", getReportSpecificationValue(report, ["concrete_temp_f", "concrete_temp", "material_temp_f", "materialTemp", "concreteTemperature"])],
    ["Spread", getReportSpecificationValue(report, ["spread_in", "spread", "spreadIn"])],
    ["J-Ring", getReportSpecificationValue(report, ["j_ring_in", "j_ring", "jRing", "jRingIn"])],
    ["Mix No.", getReportSpecificationValue(report, ["mix_number", "mix_no", "mixNumber", "mixNo"])],
    ["Comments", getReportSpecificationValue(report, ["comments", "notes"])]
  ].map(([label, value]) => ({ label, value: pdfValue(value) }));
}

function getSpecificationSummaryHeight(doc, items, columns = 3) {
  const gap = 8;
  const cellWidth = (getContentWidth(doc) - gap * (columns - 1)) / columns;
  let height = 22;
  for (let start = 0; start < items.length; start += columns) {
    const row = items.slice(start, start + columns);
    const rowHeight = Math.max(...row.map((item) => {
      setReportFont(doc, "regular", 9, PDF_COLORS.navy);
      const valueLines = doc.splitTextToSize(String(item.value), cellWidth - 16);
      return Math.max(30, 17 + valueLines.length * 10);
    }));
    height += rowHeight + gap;
  }
  return height + 6;
}

function renderSpecificationSummary(doc, report, y) {
  const items = getSpecSummaryItems(report);
  const columns = 3;
  const gap = 0;
  const sectionHeight = Math.max(92, getSpecificationSummaryHeight(doc, items, columns));
  y = ensurePage(doc, y, Math.max(105, sectionHeight));

  setReportFont(doc, "semibold", 10.5, PDF_COLORS.navy);
  doc.text("Specification Summary", PAGE_MARGIN, y);
  y += 11;

  const cellWidth = (getContentWidth(doc) - gap * (columns - 1)) / columns;
  for (let start = 0; start < items.length; start += columns) {
    const row = items.slice(start, start + columns);
    const rowHeight = Math.max(...row.map((item) => {
      setReportFont(doc, "regular", 9, PDF_COLORS.navy);
      const valueLines = doc.splitTextToSize(String(item.value), cellWidth - 16);
      return Math.max(30, 17 + valueLines.length * 10);
    }));

    row.forEach((item, index) => {
      const x = PAGE_MARGIN + index * (cellWidth + gap);
      doc.setDrawColor(...PDF_COLORS.line);
      doc.setFillColor(...PDF_COLORS.white);
      doc.setFillColor(...(Math.floor(start / columns) % 2 === 0 ? PDF_COLORS.soft : PDF_COLORS.white));
      doc.rect(x, y, cellWidth, rowHeight, "FD");
      setReportFont(doc, "medium", 7.4, PDF_COLORS.muted);
      doc.text(String(item.label).toUpperCase(), x + 7, y + 10);
      setReportFont(doc, "regular", 9, PDF_COLORS.navy);
      doc.text(doc.splitTextToSize(String(item.value), cellWidth - 16), x + 7, y + 22);
    });
    y += rowHeight + gap;
  }

  return y + 4;
}

async function AttachedReportBlock(doc, report, reportIndex, y, activity, log) {
  y = ensurePage(doc, y, 250);
  doc.setDrawColor(...PDF_COLORS.line);
  doc.line(PAGE_MARGIN, y, getPageWidth(doc) - PAGE_MARGIN, y);
  y += 12;

  setReportFont(doc, "semibold", 12.5, PDF_COLORS.navy);
  doc.text(`CONCRETE TEST LOG - ${pdfValue(getReportDfrNumber(report))}`, PAGE_MARGIN, y);
  y += 14;
  setReportFont(doc, "regular", 9, PDF_COLORS.slate);
  doc.text(
    `Report Type: ${pdfValue(report.reportType || report.report_type || "Concrete Test Log")}  |  Status: ${formatStatus(report.status || report.reportStatus || "Submitted")}`,
    PAGE_MARGIN,
    y
  );
  y += 16;

  y = renderSpecificationSummary(doc, report, y);

  const records = getReportRecords(report);
  if (records.length) {
    y = ensureConcreteLandscapePage(doc, y);
    y = ensurePage(doc, y, 130);
    y = ProfessionalTable(doc, {
      title: "Material Delivery & Verification Records",
      columns: CONSOLIDATED_CONCRETE_RECORD_COLUMNS.map((column) => column.label),
      rows: getConsolidatedConcreteRecordRows(records)
    }, y, {
      minSpace: 90,
      fontSize: 5.6,
      headFontSize: 5.5,
      cellPadding: { top: 2.2, right: 1.4, bottom: 2.2, left: 1.4 },
      columnStyles: getConsolidatedConcreteColumnStyles(doc)
    });
  } else {
    y = InfoGrid(doc, [{ label: "Test Results Summary", value: "No delivery records recorded." }], y, { columns: 1, minHeight: 34 });
  }

  y = await AttachmentGallery(doc, getReportAttachments(report, activity, log), y, "Concrete Report Attachments");
  return y + 8;
}

async function ActivityCard(doc, activity, index, y, log) {
  const reports = getScopedActivityReports(activity, log);
  const attachments = getActivityAttachments(activity, log);
  y = ensurePage(doc, y, 90);

  setReportFont(doc, "semibold", 11.5, PDF_COLORS.navy);
  doc.text(`Activity ${index + 1}: ${getActivityName(activity, index)}`, PAGE_MARGIN, y);
  y += 12;
  setReportFont(doc, "regular", 8.5, PDF_COLORS.slate);
  doc.text(
    `Location: ${pdfValue(activity.location)}  |  Status: ${formatStatus(activity.status || "in_progress")}  |  Type: ${getActivityType(activity)}`,
    PAGE_MARGIN,
    y
  );
  y += 11;

  const description = activity.description || "No description recorded.";
  const width = getContentWidth(doc);
  const descriptionLines = doc.splitTextToSize(`Description: ${description}`, width);
  y = ensurePage(doc, y, Math.min(90, 12 + descriptionLines.length * 10));
  if (descriptionLines.length <= 3) {
    setReportFont(doc, "regular", 9, PDF_COLORS.navy);
    doc.text(descriptionLines, PAGE_MARGIN, y);
    y += descriptionLines.length * 10 + 10;
  } else {
    const boxHeight = Math.max(42, 18 + descriptionLines.length * 10);
    y = ensurePage(doc, y, boxHeight + 10);
    doc.setDrawColor(...PDF_COLORS.line);
    doc.setFillColor(...PDF_COLORS.white);
    doc.rect(PAGE_MARGIN, y, width, boxHeight, "S");
    setReportFont(doc, "regular", 9, PDF_COLORS.navy);
    doc.text(descriptionLines, PAGE_MARGIN + 8, y + 14);
    y += boxHeight + 10;
  }

  for (const [reportIndex, report] of reports.entries()) {
    y = await AttachedReportBlock(doc, report, reportIndex, y, activity, log);
  }
  y = await AttachmentGallery(doc, attachments, y, "Activity Attachments");
  return y + 12;
}

async function renderProfessionalActivities(doc, log, y) {
  y = SectionTitle(doc, "Activities", y, { minSpace: 90 });
  const activities = log.activities || [];
  if (!activities.length) {
    return InfoGrid(doc, [{ label: "Activities", value: "No activities recorded." }], y, { columns: 1, minHeight: 34 });
  }
  for (const [index, activity] of activities.entries()) {
    y = await ActivityCard(doc, activity, index, y, log);
  }
  return y;
}

function renderProfessionalComments(doc, log, y) {
  y = renderDocumentSectionTitle(doc, "Comments", y, { minSpace: 90 });
  const text = log.notes || log.comments || "No comments recorded.";
  return reportParagraph(doc, sentenceCase(text), PAGE_MARGIN, y, getContentWidth(doc), { size: 10 }) + 24;
}

async function ApprovalBlock(doc, log, y) {
  y = SectionTitle(doc, "Approval", y, { minSpace: 160 });
  const gap = 12;
  const boxWidth = (getContentWidth(doc) - gap) / 2;
  const boxHeight = 94;
  y = ensurePage(doc, y, boxHeight + 8);
  const submitted = {
    title: "Submitted By",
    name: getTechnicianName(log),
    date: formatDateTime(log.submittedAt || log.submitted_at),
    image: log.technicianSignature || log.technician_signature || log.technicianSignatureUrl || log.technician_signature_url
  };
  const approved = Boolean(log.approvedAt || log.approved_at || log.qcSignature || log.qc_signature || log.qcSignatureUrl || log.qc_signature_url);
  const reviewer = {
    title: "Reviewed / Approved By",
    name: approved ? (log.approvedBy || log.approved_by || "Project Manager / QC") : "Pending Review",
    date: approved ? formatDateTime(log.approvedAt || log.approved_at) : "Pending Review",
    image: approved ? (log.qcSignature || log.qc_signature || log.qcSignatureUrl || log.qc_signature_url) : ""
  };

  for (const [index, entry] of [submitted, reviewer].entries()) {
    const x = PAGE_MARGIN + index * (boxWidth + gap);
    doc.setDrawColor(...PDF_COLORS.line);
    doc.setFillColor(...PDF_COLORS.soft);
    doc.roundedRect(x, y, boxWidth, boxHeight, 4, 4, "FD");
    setReportFont(doc, "medium", 8.2, PDF_COLORS.muted);
    doc.text(entry.title.toUpperCase(), x + 10, y + 15);
    const hasSignature = await renderSignatureImage(doc, entry.image, x + 10, y + 22, boxWidth - 20, 30);
    if (!hasSignature) {
      doc.setDrawColor(...PDF_COLORS.line);
      doc.line(x + 10, y + 50, x + boxWidth - 10, y + 50);
    }
    setReportFont(doc, "semibold", 10, PDF_COLORS.navy);
    doc.text(doc.splitTextToSize(pdfValue(entry.name), boxWidth - 20), x + 10, y + 66);
    setReportFont(doc, "regular", 8.8, PDF_COLORS.slate);
    doc.text(doc.splitTextToSize(entry.date, boxWidth - 20), x + 10, y + 82);
  }
  return y + boxHeight + 8;
}

function PdfFooter(doc, log) {
  const pageCount = doc.getNumberOfPages();
  const reportNumber = getDailyReportNumber(log);
  const projectName = doc.splitTextToSize(getProjectName(log), 230)[0];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    const pageWidth = getPageWidth(doc);
    const pageHeight = getPageHeight(doc);
    doc.setDrawColor(...PDF_COLORS.line);
    doc.line(PAGE_MARGIN, pageHeight - 24, pageWidth - PAGE_MARGIN, pageHeight - 24);
    setReportFont(doc, "regular", 8, PDF_COLORS.muted);
    doc.text(projectName, PAGE_MARGIN, pageHeight - 12);
    doc.text(reportNumber, pageWidth / 2, pageHeight - 12, { align: "center" });
    doc.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 12, { align: "right" });
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

function reportParagraph(doc, text, x, y, width, options = {}) {
  setReportFont(doc, options.weight || "regular", options.size || 10, options.color || PDF_COLORS.navy);
  const lines = doc.splitTextToSize(text, width);
  const lineHeightFactor = options.lineHeightFactor || 1.4;
  doc.text(lines, x, y, { lineHeightFactor });
  return y + lines.length * (options.size || 10) * lineHeightFactor;
}

function drawRule(doc, y, color = PDF_COLORS.line) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.6);
  doc.line(PAGE_MARGIN, y, getPageWidth(doc) - PAGE_MARGIN, y);
  doc.setLineWidth(0.2);
}

function renderDocumentSectionTitle(doc, title, y, options = {}) {
  y = ensurePage(doc, y, options.minSpace || 80);
  setReportFont(doc, "semibold", options.size || 14, PDF_COLORS.navy);
  doc.text(String(title).toUpperCase(), PAGE_MARGIN, y);
  drawRule(doc, y + 7);
  return y + 24;
}

function renderLabelValue(doc, label, value, x, y, width, options = {}) {
  setReportFont(doc, "semibold", options.labelSize || 8.5, PDF_COLORS.muted);
  doc.text(String(label).toUpperCase(), x, y);
  setReportFont(doc, "regular", options.valueSize || 10, PDF_COLORS.navy);
  const lines = doc.splitTextToSize(pdfValue(value), width);
  doc.text(lines, x, y + 13, { lineHeightFactor: 1.4 });
  return y + 13 + lines.length * (options.valueSize || 10) * 1.4;
}

function renderMetadataRows(doc, rows, y, options = {}) {
  const columns = options.columns || 2;
  const gap = 20;
  const cellWidth = (getContentWidth(doc) - gap * (columns - 1)) / columns;
  let cursor = y;
  for (let start = 0; start < rows.length; start += columns) {
    const row = rows.slice(start, start + columns);
    const rowHeight = Math.max(...row.map((item) => {
      setReportFont(doc, "regular", 10, PDF_COLORS.navy);
      return 22 + doc.splitTextToSize(pdfValue(item.value), cellWidth).length * 10;
    }));
    cursor = ensurePage(doc, cursor, rowHeight + 8);
    row.forEach((item, index) => {
      renderLabelValue(doc, item.label, item.value, PAGE_MARGIN + index * (cellWidth + gap), cursor, cellWidth);
    });
    cursor += rowHeight + 8;
  }
  return cursor;
}

function renderCompactGrid(doc, items, y, options = {}) {
  const columns = options.columns || 3;
  const gap = options.gap ?? 0;
  const cellWidth = (getContentWidth(doc) - gap * (columns - 1)) / columns;
  const rowHeight = options.rowHeight || 26;
  const labelWidth = options.labelWidth || Math.min(72, cellWidth * 0.38);
  const rows = Math.ceil(items.length / columns);
  y = ensurePage(doc, y, rows * rowHeight + 4);
  const showBorders = options.borders === true;

  for (let start = 0; start < items.length; start += columns) {
    const rowIndex = Math.floor(start / columns);
    const row = items.slice(start, start + columns);
    row.forEach((item, index) => {
      const x = PAGE_MARGIN + index * (cellWidth + gap);
      if (showBorders) {
        doc.setDrawColor(...PDF_COLORS.line);
        doc.setFillColor(...(rowIndex % 2 === 0 ? PDF_COLORS.soft : PDF_COLORS.white));
        doc.rect(x, y, cellWidth, rowHeight, "FD");
      }
      setReportFont(doc, "semibold", options.labelSize || 7.8, PDF_COLORS.muted);
      doc.text(`${String(item.label || "").toUpperCase()}:`, x + (showBorders ? 6 : 0), y + 15);
      setReportFont(doc, "regular", options.valueSize || 8.8, PDF_COLORS.navy);
      doc.text(doc.splitTextToSize(pdfValue(item.value), cellWidth - labelWidth - 10), x + labelWidth, y + 15);
    });
    y += rowHeight;
  }
  return y + (options.afterGap ?? 12);
}

function renderCompactSectionTitle(doc, title, y, options = {}) {
  y = ensurePage(doc, y, options.minSpace || 50);
  setReportFont(doc, "semibold", options.size || 12, PDF_COLORS.navy);
  doc.text(String(title), PAGE_MARGIN, y);
  drawRule(doc, y + 6);
  return y + 20;
}

async function renderEngineeringTitleBlock(doc, log, y) {
  const logoSource = await sourceToDataUrl(log.companyLogoUrl || log.company_logo_url || COMPANY_LOGO_URL) || getDullesLogoDataUrl();
  const headerHeight = 76;
  y = ensurePage(doc, y, 145);
  doc.setDrawColor(...PDF_COLORS.line);
  doc.setFillColor(...PDF_COLORS.white);
  doc.rect(PAGE_MARGIN, y, getContentWidth(doc), headerHeight, "S");

  if (logoSource?.startsWith("data:image/")) {
    addImageToPdf(doc, logoSource, { fileType: "image/png" }, PAGE_MARGIN + 10, y + 10, 76, 30);
  }
  setReportFont(doc, "regular", 8.5, PDF_COLORS.muted);
  doc.text(COMPANY_NAME, PAGE_MARGIN + 10, y + 52);

  setReportFont(doc, "semibold", 24, PDF_COLORS.navy);
  doc.text("DAILY FIELD REPORT", getPageWidth(doc) / 2, y + 24, { align: "center" });
  setReportFont(doc, "regular", 10, PDF_COLORS.navy);
  doc.text(getProjectName(log), getPageWidth(doc) / 2, y + 42, { align: "center" });
  setReportFont(doc, "regular", 8.2, PDF_COLORS.muted);
  doc.text(`Generated: ${formatDateTime(log.pdfGeneratedAt || log.pdf_generated_at || new Date().toISOString())}`, getPageWidth(doc) - PAGE_MARGIN - 10, y + 62, { align: "right" });

  return renderCompactGrid(doc, [
    { label: "Project Name", value: getProjectName(log) },
    { label: "Project No.", value: getProjectNumber(log) },
    { label: "Date", value: formatDateOnly(getLogDate(log)) },
    { label: "Technician", value: getTechnicianName(log) },
    { label: "Shift", value: log.shift || log.shift_name || "N/A" },
    { label: "Status", value: formatStatus(log.status || "Pending Manager Review") },
    { label: "Report No.", value: getDailyReportNumber(log) }
  ], y + headerHeight + 12, { columns: 3, rowHeight: 22, labelWidth: 68, afterGap: 14 });
}

function getExecutiveSummaryText(log) {
  const activities = log.activities || [];
  const reports = getConcreteReports(log);
  const weather = log.weatherCondition || log.weather || "Not recorded";
  const activitySentence = activities.length === 1
    ? "One activity was completed during the reporting period."
    : `${activities.length} activities were completed during the reporting period.`;
  const reportSentence = reports.length === 1
    ? "One concrete test log was submitted."
    : `${reports.length} concrete test logs were submitted.`;
  return [
    activitySentence,
    reportSentence,
    `Weather conditions were ${String(weather).toLowerCase()}.`,
    `Report is ${formatStatus(log.status || "Pending Manager Review").toLowerCase()}.`
  ].join(" ");
}

function renderExecutiveNarrative(doc, log, y) {
  const reports = getConcreteReports(log);
  const attachments = getAllAttachments(log);
  y = renderCompactSectionTitle(doc, "Executive Summary", y, { minSpace: 94 });
  y = reportParagraph(doc, getExecutiveSummaryText(log), PAGE_MARGIN, y, getContentWidth(doc), { size: 9.2 }) + 8;
  return renderCompactGrid(doc, [
    { label: "Activities", value: (log.activities || []).length },
    { label: "Reports", value: reports.length },
    { label: "Photos", value: attachments.filter(isPhotoAttachment).length },
    { label: "Weather", value: log.weatherCondition || log.weather || "N/A" },
    { label: "Status", value: formatStatus(log.status || "Pending Manager Review") }
  ], y, { columns: 5, rowHeight: 23, labelWidth: 50, labelSize: 7.2, valueSize: 8.2, afterGap: 14 });
}

function renderActivitiesNarrative(doc, log, y) {
  const activities = log.activities || [];
  y = renderCompactSectionTitle(doc, "Activities", y, { minSpace: 78 });
  if (!activities.length) {
    return reportParagraph(doc, "No activities were recorded for this reporting period.", PAGE_MARGIN, y, getContentWidth(doc), { size: 9.2 }) + 14;
  }

  activities.forEach((activity, index) => {
    const descriptionLines = doc.splitTextToSize(sentenceCase(activity.description || "Documents work performed."), getContentWidth(doc) - 72);
    const blockHeight = 50 + descriptionLines.length * 10;
    y = ensurePage(doc, y, blockHeight);
    setReportFont(doc, "semibold", 10.5, PDF_COLORS.navy);
    doc.text(`Activity ${String(index + 1).padStart(2, "0")}: ${getActivityName(activity, index)}`, PAGE_MARGIN, y);
    y += 12;
    y = renderCompactGrid(doc, [
      { label: "Location", value: activity.location || "N/A" },
      { label: "Status", value: formatStatus(activity.status || "In Progress") },
      { label: "Type", value: getActivityType(activity) }
    ], y, { columns: 3, rowHeight: 23, labelWidth: 58, afterGap: 6 });
    setReportFont(doc, "semibold", 8.2, PDF_COLORS.muted);
    doc.text("DESCRIPTION:", PAGE_MARGIN, y + 8);
    setReportFont(doc, "regular", 9, PDF_COLORS.navy);
    doc.text(descriptionLines, PAGE_MARGIN + 72, y + 8, { lineHeightFactor: 1.35 });
    y += Math.max(18, descriptionLines.length * 10) + 12;
  });
  return y;
}

function getReportResult(report) {
  const records = getReportRecords(report);
  const statuses = records.map((record) => formatStatus(getRecordField(record, ["record_result", "row_status", "recordResult", "status"]))).filter(Boolean);
  if (!statuses.length) return formatStatus(report.status || report.reportStatus || "Submitted");
  if (statuses.some((status) => status.toLowerCase().includes("fail"))) return "Fail";
  if (statuses.some((status) => status.toLowerCase().includes("retest"))) return "Retest";
  if (statuses.every((status) => status.toLowerCase().includes("pass"))) return "Pass";
  return statuses[0];
}

function getDarkTableHeadStyles(fontSize = 9) {
  return {
    fillColor: PDF_COLORS.navy,
    textColor: PDF_COLORS.white,
    fontStyle: "bold",
    fontSize
  };
}

function renderConcreteSummaries(doc, log, y) {
  const reports = getConcreteReports(log);
  y = renderReferenceSectionBar(doc, "Concrete Test Log Summary", y, { afterGap: 10 });
  if (!reports.length) {
    return reportParagraph(doc, "No concrete test logs were submitted with this daily field report.", PAGE_MARGIN, y, getContentWidth(doc), { size: 9.2 }) + 14;
  }

  y = ensurePage(doc, y, 34 + reports.length * 18);
  autoTable(doc, {
    startY: y,
    head: [["DFR No.", "Mix No.", "Strength", "Slump", "Air %", "Unit Wt", "Result"]],
    body: reports.map(({ report }) => [
      getReportDfrNumber(report),
      pdfValue(getReportSpecificationValue(report, ["mix_number", "mix_no", "mixNumber", "mixNo"])),
      pdfValue(getReportSpecificationValue(report, ["speed_of_stress_psi", "speed_of_stress", "strength_spec", "specified_strength_psi", "specified_strength", "specifiedStrength"])),
      pdfValue(getReportSpecificationValue(report, ["slump_in", "slump", "slumpIn"])),
      pdfValue(getReportSpecificationValue(report, ["air_content_percent", "air_content", "airContent", "airContentPercent"])),
      pdfValue(getReportSpecificationValue(report, ["unit_weight_lbs_ft3", "unit_weight", "unitWeight", "unitWeightLbsFt3"])),
      getReportResult(report)
    ]),
    theme: "grid",
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_TOP_MARGIN, bottom: PAGE_BOTTOM_MARGIN + 16 },
    tableWidth: getContentWidth(doc),
    styles: {
      font: reportFontsRegistered ? REPORT_FONT_FAMILY : "helvetica",
      fontSize: 8.4,
      cellPadding: { top: 5, right: 7, bottom: 5, left: 7 },
      lineColor: PDF_COLORS.line,
      lineWidth: 0.35,
      textColor: PDF_COLORS.navy,
      minCellHeight: 21,
      valign: "middle"
    },
    headStyles: getDarkTableHeadStyles(8.6),
    alternateRowStyles: { fillColor: PDF_COLORS.white }
  });
  return (doc.lastAutoTable?.finalY || y) + 12;
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

function inlineFields(fields) {
  return fields.map(({ label, value }) => `${label} ${pdfValue(value)}`).join(" | ");
}

function getTestRecordHeight(doc, record) {
  const width = getContentWidth(doc) - 20;
  const rows = getTestRecordRows(record);
  setReportFont(doc, "regular", 8.4, PDF_COLORS.navy);
  return 34 + rows.reduce((sum, row) => {
    const lines = doc.splitTextToSize(`${row.label}: ${row.value}`, width - 80);
    return sum + Math.max(17, lines.length * 9.5 + 6);
  }, 0);
}

function getTestRecordRows(record) {
  return [{
    label: "Delivery",
    value: inlineFields([
      { label: "Ticket", value: getRecordValue(record, ["ticket_number", "ticketNumber"]) },
      { label: "Truck", value: getRecordValue(record, ["truck_number", "truckNumber"]) },
      { label: "CY", value: getRecordValue(record, ["cubic_yards", "cubicYards"]) },
      { label: "Batch", value: getRecordValue(record, ["batch_time", "time_batched", "timeBatched"]) },
      { label: "Arrival", value: getRecordValue(record, ["arrival_time", "arrivalTime"]) },
      { label: "Tested", value: getRecordValue(record, ["testing_time", "time_tested", "timeTested"]) },
      { label: "Finish", value: getRecordValue(record, ["finish_unload_time", "finish_unload", "finishUnload"]) },
      { label: "Minutes", value: getRecordValue(record, ["actual_minutes", "actualMinutes"]) }
    ])
  }, {
    label: "Fresh Concrete",
    value: inlineFields([
      { label: "Water Added", value: getRecordValue(record, ["water_added_gal", "waterAdded"]) },
      { label: "Air Temp", value: getRecordValue(record, ["air_temp_f", "airTempF", "airTemp"]) },
      { label: "Concrete Temp", value: getRecordValue(record, ["concrete_temp_f", "concreteTempF", "concreteTemp"]) },
      { label: "Slump", value: getRecordValue(record, ["slump_in", "slump"]) },
      { label: "Air", value: getRecordValue(record, ["air_content_percent", "airContent"]) },
      { label: "Unit Wt", value: getRecordValue(record, ["unit_weight_lbs_ft3", "unitWeight"]) },
      { label: "Spread", value: getRecordValue(record, ["spread_in", "spread"]) },
      { label: "J-Ring", value: getRecordValue(record, ["j_ring_in", "jRing"]) }
    ])
  }, {
    label: "Strength / Cylinders",
    value: inlineFields([
      { label: formatStrengthRequired(getRecordField(record, ["strength_verification_required", "strengthVerificationRequired"])), value: "" },
      { label: "Set", value: getRecordValue(record, ["set_number", "setNumber"]) },
      { label: "Lab", value: getRecordValue(record, ["lab_cylinders", "lab_samples", "labSamples"]) },
      { label: "Field", value: getRecordValue(record, ["field_cylinders", "field_samples", "fieldSamples"]) }
    ])
  }, {
    label: "Result",
    value: formatStatus(getRecordField(record, ["record_result", "row_status", "recordResult", "status"]))
  }, {
    label: "Comments",
    value: getRecordValue(record, ["inspector_notes", "comments", "notes"])
  }];
}

function renderTestRecordBlock(doc, record, index, y) {
  const blockHeight = getTestRecordHeight(doc, record);
  y = ensurePage(doc, y, blockHeight);
  const x = PAGE_MARGIN;
  const width = getContentWidth(doc);
  doc.setDrawColor(...PDF_COLORS.line);
  doc.setFillColor(...PDF_COLORS.white);
  doc.rect(x, y, width, blockHeight, "FD");
  doc.setFillColor(...PDF_COLORS.soft);
  doc.rect(x, y, width, 24, "F");
  setReportFont(doc, "semibold", 10, PDF_COLORS.navy);
  doc.text(`TEST RECORD ${index + 1}`, x + 8, y + 15);

  let rowY = y + 32;
  getTestRecordRows(record).forEach((row) => {
    setReportFont(doc, "semibold", 8.2, PDF_COLORS.muted);
    doc.text(`${row.label}:`, x + 8, rowY);
    setReportFont(doc, "regular", 8.4, PDF_COLORS.navy);
    const lines = doc.splitTextToSize(row.value, width - 94);
    doc.text(lines, x + 88, rowY, { lineHeightFactor: 1.35 });
    rowY += Math.max(17, lines.length * 9.5 + 6);
  });
  return y + blockHeight + 12;
}

function renderConcreteAppendix(doc, log, y) {
  const reports = getConcreteReports(log);
  if (!reports.length) return y;
  doc.addPage("letter", "portrait");
  y = PAGE_TOP_MARGIN;
  setReportFont(doc, "semibold", 14, PDF_COLORS.navy);
  doc.text("APPENDIX A - CONCRETE TEST LOG", PAGE_MARGIN, y);
  drawRule(doc, y + 8, PDF_COLORS.navy);
  y += 28;

  reports.forEach(({ report }, reportIndex) => {
    y = ensurePage(doc, y, 185);
    setReportFont(doc, "semibold", 13, PDF_COLORS.navy);
    doc.text(`${reportIndex + 1}. ${getReportDfrNumber(report)}`, PAGE_MARGIN, y);
    y += 18;
    y = renderSpecificationSummary(doc, report, y);
    const records = getReportRecords(report);
    if (!records.length) {
      y = reportParagraph(doc, "No test records were recorded for this concrete test log.", PAGE_MARGIN, y, getContentWidth(doc)) + 18;
    } else {
      records.forEach((record, recordIndex) => {
        y = renderTestRecordBlock(doc, record, recordIndex, y);
      });
    }
    y += 6;
  });
  return y;
}

async function renderEngineeringApproval(doc, log, y) {
  y = renderCompactSectionTitle(doc, "Approval", y, { minSpace: 92 });
  const gap = 28;
  const columnWidth = (getContentWidth(doc) - gap) / 2;
  const entries = [
    {
      title: "Submitted By",
      name: getTechnicianName(log),
      date: formatDateTime(log.submittedAt || log.submitted_at),
      image: log.technicianSignature || log.technician_signature || log.technicianSignatureUrl || log.technician_signature_url
    },
    {
      title: "Reviewed By",
      name: log.approvedBy || log.approved_by || "Pending Review",
      date: log.approvedAt || log.approved_at ? formatDateTime(log.approvedAt || log.approved_at) : "Pending Review",
      image: log.qcSignature || log.qc_signature || log.qcSignatureUrl || log.qc_signature_url
    }
  ];

  for (const [index, entry] of entries.entries()) {
    const x = PAGE_MARGIN + index * (columnWidth + gap);
    setReportFont(doc, "semibold", 10, PDF_COLORS.navy);
    doc.text(entry.title, x, y);
    const hasSignature = await renderSignatureImage(doc, entry.image, x, y + 12, columnWidth, 24);
    if (!hasSignature) {
      doc.setDrawColor(...PDF_COLORS.line);
      doc.line(x, y + 35, x + columnWidth, y + 35);
    }
    renderLabelValue(doc, "Name", entry.name, x, y + 50, columnWidth, { labelSize: 7.8, valueSize: 8.8 });
    renderLabelValue(doc, "Date", entry.date, x, y + 80, columnWidth, { labelSize: 7.8, valueSize: 8.8 });
  }

  return renderLabelValue(doc, "Status", formatStatus(log.status || "Pending Manager Review"), PAGE_MARGIN, y + 112, getContentWidth(doc), { labelSize: 7.8, valueSize: 9 }) + 10;
}

async function renderReferenceDailyLogHeader(doc, log, y) {
  const logoSource = await sourceToDataUrl(log.companyLogoUrl || log.company_logo_url || COMPANY_LOGO_URL) || getDullesLogoDataUrl();
  const pageWidth = getPageWidth(doc);
  const headerX = PAGE_MARGIN;
  const headerWidth = getContentWidth(doc);
  const headerHeight = 96;
  const statusText = formatStatus(log.status || "Draft");
  const headerMuted = [203, 213, 225];
  const headerSoft = [226, 232, 240];
  const setHeaderFont = (color, size, style = "normal") => {
    doc.setTextColor(...color);
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
  };
  y = ensurePage(doc, y, headerHeight + 18);

  doc.setFillColor(...PDF_COLORS.navy);
  doc.roundedRect(headerX, y, headerWidth, headerHeight, 12, 12, "F");

  const logoX = headerX + 14;
  const logoY = y + 14;
  const logoBoxSize = 58;
  doc.setFillColor(...PDF_COLORS.white);
  doc.roundedRect(logoX, logoY, logoBoxSize, logoBoxSize, 9, 9, "F");
  const logoRendered = logoSource?.startsWith("data:image/")
    ? addImageToPdf(doc, logoSource, { fileType: "image/png" }, logoX + 7, logoY + 15, logoBoxSize - 14, 28)
    : false;
  if (!logoRendered) {
    setHeaderFont(PDF_COLORS.navy, 16, "bold");
    doc.text("DE", logoX + logoBoxSize / 2, logoY + 36, { align: "center" });
  }

  setHeaderFont(PDF_COLORS.white, 8.5, "bold");
  doc.text(`Technician: ${getTechnicianName(log)}`, logoX, y + 79);
  setHeaderFont(headerSoft, 8, "bold");
  doc.text(`Generated: ${formatDateTime(log.pdfGeneratedAt || log.pdf_generated_at || new Date().toISOString())}`, logoX, y + 91);

  setHeaderFont(PDF_COLORS.white, 20, "bold");
  doc.text("Daily Log", pageWidth / 2, y + 31, { align: "center" });
  setHeaderFont(headerMuted, 10, "bold");
  doc.text(getProjectName(log), pageWidth / 2, y + 48, { align: "center" });
  setHeaderFont(headerSoft, 8, "normal");
  doc.text(`DFR: ${getDailyReportNumber(log)}`, pageWidth / 2, y + 68, { align: "center" });
  doc.text(`Date: ${formatDateOnly(getLogDate(log))}`, pageWidth / 2, y + 81, { align: "center" });

  setHeaderFont(PDF_COLORS.navy, 7.4, "bold");
  const badgeText = statusText.toUpperCase();
  const pillWidth = Math.max(78, doc.getTextWidth(badgeText) + 14);
  const pillHeight = 18;
  const pillX = headerX + headerWidth - pillWidth - 14;
  const pillY = y + 66;
  doc.setFillColor(...PDF_COLORS.soft);
  doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 7, 7, "F");
  setHeaderFont(PDF_COLORS.navy, 7.4, "bold");
  doc.text(badgeText, pillX + pillWidth / 2, pillY + 12, { align: "center" });

  return y + headerHeight + 18;
}

function renderReferenceSectionBar(doc, title, y, options = {}) {
  const barHeight = options.height || 20;
  y = ensurePage(doc, y, barHeight + 22);
  doc.setFillColor(...PDF_COLORS.navy);
  doc.roundedRect(PAGE_MARGIN, y, getContentWidth(doc), barHeight, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(options.size || 9.2);
  doc.setTextColor(...PDF_COLORS.white);
  doc.text(String(title).toUpperCase(), PAGE_MARGIN + 10, y + 13.5);
  if (options.rightText) {
    doc.setFontSize(7.4);
    doc.setTextColor(203, 213, 225);
    doc.text(String(options.rightText).toUpperCase(), PAGE_MARGIN + getContentWidth(doc) - 10, y + 13.5, { align: "right" });
  }
  return y + barHeight + (options.afterGap ?? 12);
}

function renderReferenceFieldCard(doc, item, x, y, width, height) {
  const label = String(item.label || "").toUpperCase();
  const value = pdfValue(item.value);
  doc.setFillColor(...PDF_COLORS.soft);
  doc.setDrawColor(205, 216, 228);
  doc.roundedRect(x, y, width, height, 6, 6, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  doc.setTextColor(50, 74, 104);
  doc.text(label, x + 10, y + 12, { charSpace: 0.5 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.4);
  doc.setTextColor(...PDF_COLORS.navy);
  const valueLines = doc.splitTextToSize(value, width - 20);
  doc.text(valueLines.slice(0, 2), x + 10, y + 26, { lineHeightFactor: 1.15 });
}

function renderReferenceSection(doc, title, items, y, options = {}) {
  const columns = options.columns || 2;
  const gapX = options.gapX ?? 10;
  const gapY = options.gapY ?? 8;
  const cardHeight = options.cardHeight || 36;
  const rows = Math.ceil(items.length / columns);
  const sectionHeight = 20 + 12 + rows * cardHeight + Math.max(rows - 1, 0) * gapY + 14;
  y = ensurePage(doc, y, Math.max(options.minSpace || 86, sectionHeight));
  y = renderReferenceSectionBar(doc, title, y);

  const cardWidth = (getContentWidth(doc) - gapX * (columns - 1)) / columns;
  items.forEach((item, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = PAGE_MARGIN + column * (cardWidth + gapX);
    const cardY = y + row * (cardHeight + gapY);
    renderReferenceFieldCard(doc, item, x, cardY, cardWidth, cardHeight);
  });

  return y + rows * cardHeight + Math.max(rows - 1, 0) * gapY + (options.afterGap ?? 14);
}

function renderReferenceExecutiveSummary(doc, log, y) {
  y = ensurePage(doc, y, 68);
  y = renderReferenceSectionBar(doc, "Executive Summary", y, { afterGap: 8 });
  const text = getExecutiveSummaryText(log);
  const lines = doc.splitTextToSize(text, getContentWidth(doc) - 22);
  const boxHeight = Math.max(34, lines.length * 9 * 1.35 + 18);
  doc.setFillColor(...PDF_COLORS.white);
  doc.setDrawColor(205, 216, 228);
  doc.roundedRect(PAGE_MARGIN, y, getContentWidth(doc), boxHeight, 4, 4, "S");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.navy);
  doc.text(lines, PAGE_MARGIN + 11, y + 15, { lineHeightFactor: 1.35 });
  return y + boxHeight + 14;
}

function renderReferenceActivities(doc, log, y) {
  const activities = log.activities || [];
  y = ensurePage(doc, y, 60);
  y = renderReferenceSectionBar(doc, "Activities", y, { afterGap: 8 });
  if (!activities.length) {
    return reportParagraph(doc, "No activities recorded.", PAGE_MARGIN, y + 8, getContentWidth(doc), { size: 10 }) + 12;
  }
  autoTable(doc, {
    startY: y,
    head: [["Activity", "Location", "Status", "Type", "Work Performed"]],
    body: activities.map((activity, index) => [
      `${String(index + 1).padStart(2, "0")} - ${getActivityName(activity, index)}`,
      pdfValue(activity.location),
      formatStatus(activity.status || "In Progress"),
      getActivityType(activity),
      sentenceCase(activity.description || "Documents work performed.")
    ]),
    theme: "grid",
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_TOP_MARGIN, bottom: PAGE_BOTTOM_MARGIN + 16 },
    tableWidth: getContentWidth(doc),
    styles: {
      font: reportFontsRegistered ? REPORT_FONT_FAMILY : "helvetica",
      fontSize: 8.4,
      cellPadding: { top: 5, right: 7, bottom: 5, left: 7 },
      lineColor: PDF_COLORS.line,
      lineWidth: 0.35,
      textColor: PDF_COLORS.navy,
      minCellHeight: 21,
      valign: "middle"
    },
    headStyles: getDarkTableHeadStyles(8.6),
    columnStyles: { 0: { cellWidth: 92 }, 1: { cellWidth: 72 }, 2: { cellWidth: 68 }, 3: { cellWidth: 86 } }
  });
  return (doc.lastAutoTable?.finalY || y) + 12;
}

function renderReferenceSubTitle(doc, title, y, options = {}) {
  // Sub-section headings share the same navy bar treatment as the main section headings.
  return renderReferenceSectionBar(doc, title, y, {
    height: 18,
    size: 8.6,
    afterGap: options.afterGap ?? 10,
    rightText: options.rightText
  });
}

function renderReferenceCardGrid(doc, items, y, options = {}) {
  const columns = options.columns || 3;
  const gapX = options.gapX ?? 10;
  const gapY = options.gapY ?? 8;
  const cardHeight = options.cardHeight || 36;
  const cardWidth = (getContentWidth(doc) - gapX * (columns - 1)) / columns;
  for (let start = 0; start < items.length; start += columns) {
    y = ensurePage(doc, y, cardHeight + gapY);
    items.slice(start, start + columns).forEach((item, index) => {
      renderReferenceFieldCard(doc, item, PAGE_MARGIN + index * (cardWidth + gapX), y, cardWidth, cardHeight);
    });
    y += cardHeight + gapY;
  }
  return y + (options.afterGap ?? 6);
}

function renderReferenceTextBox(doc, label, text, y, options = {}) {
  const width = getContentWidth(doc);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(String(text || "N/A"), width - 22);
  const boxHeight = Math.max(40, lines.length * 9 * 1.35 + 28);
  y = ensurePage(doc, y, boxHeight + 8);
  doc.setFillColor(...PDF_COLORS.white);
  doc.setDrawColor(205, 216, 228);
  doc.roundedRect(PAGE_MARGIN, y, width, boxHeight, 6, 6, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.setTextColor(50, 74, 104);
  doc.text(String(label).toUpperCase(), PAGE_MARGIN + 10, y + 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.navy);
  doc.text(lines, PAGE_MARGIN + 10, y + 27, { lineHeightFactor: 1.35 });
  return y + boxHeight + (options.afterGap ?? 12);
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

async function renderReferencePhotoGrid(doc, photos, y) {
  const gap = 10;
  const columns = 2;

  for (let index = 0; index < photos.length; index += columns) {
    const row = photos.slice(index, index + columns);
    // A lone photo in a row gets the full content width, like the web summary
    // view, but height-capped so it reads as a figure rather than a full page.
    const isSingle = row.length === 1;
    const frameWidth = isSingle ? getContentWidth(doc) : (getContentWidth(doc) - gap) / columns;
    const maxImageHeight = isSingle ? 240 : 170;
    const rendered = [];
    for (const [rowIndex, attachment] of row.entries()) {
      const x = PAGE_MARGIN + rowIndex * (frameWidth + gap);
      let source = await sourceToDataUrl(await resolveAttachmentSource(attachment));
      if (source?.startsWith("data:image/")) {
        source = await compressImageDataUrl(source, { maxWidth: 1400, maxHeight: 1400, quality: 0.74 });
        try {
          const props = doc.getImageProperties(source);
          const ratio = Math.min((frameWidth - 12) / props.width, maxImageHeight / props.height, 2);
          rendered.push({ attachment, source, x, width: props.width * ratio, height: props.height * ratio });
          continue;
        } catch (error) {
          console.warn("[Daily Log PDF] Unable to measure attachment image", error);
        }
      }
      rendered.push({ attachment, source: "", x, width: 0, height: 0 });
    }

    const rowImageHeight = Math.max(...rendered.map((item) => item.height), 60);
    const frameHeight = rowImageHeight + 30;
    y = ensurePage(doc, y, frameHeight + 10);

    for (const item of rendered) {
      doc.setDrawColor(205, 216, 228);
      doc.setFillColor(...PDF_COLORS.white);
      doc.roundedRect(item.x, y, frameWidth, frameHeight, 6, 6, "FD");
      if (item.source) {
        doc.addImage(item.source, getImageFormat(item.source, item.attachment), item.x + (frameWidth - item.width) / 2, y + 6, item.width, item.height, undefined, "FAST");
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...PDF_COLORS.muted);
        doc.text("Image unavailable", item.x + 10, y + 24);
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...PDF_COLORS.muted);
      const uploadedAt = item.attachment?.createdAt || item.attachment?.created_at || item.attachment?.uploadedAt || item.attachment?.uploaded_at;
      const caption = [getAttachmentFileName(item.attachment), uploadedAt ? formatDateTime(uploadedAt) : ""].filter(Boolean).join(" • ");
      doc.text(doc.splitTextToSize(caption, frameWidth - 20)[0] || "", item.x + 10, y + rowImageHeight + 20);
    }
    y += frameHeight + 12;
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
  // photo frame (~280pt), a photo pair row (~240pt), an attached-PDF page
  // (up to ~480pt), or a document card row.
  const firstBlockSpace = photos.length
    ? (photos.length === 1 ? 320 : 280)
    : pdfs.length
      ? 500
      : 130;
  y = ensurePage(doc, y, firstBlockSpace);
  y = renderReferenceSectionBar(doc, title, y, { afterGap: 10, rightText: `${valid.length} item${valid.length === 1 ? "" : "s"}` });

  if (photos.length) {
    y = await renderReferencePhotoGrid(doc, photos, y);
  }

  for (const attachment of pdfs) {
    // Keep the "Attached PDF" label with at least its first rendered page.
    y = ensurePage(doc, y, 500);
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

  for (const [index, activity] of activities.entries()) {
    // Each activity starts on a fresh page so its reports and attachments stay together
    // and the next activity never interleaves with the previous one's content.
    doc.addPage("letter", "portrait");
    y = PAGE_TOP_MARGIN;

    const reports = getScopedActivityReports(activity, log);
    const attachments = getActivityAttachments(activity, log);
    const photoCount = attachments.filter(isRenderableImageAttachment).length;
    const fileCount = attachments.length - photoCount;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.2);
    const barTitle = doc.splitTextToSize(
      `Activity ${String(index + 1).padStart(2, "0")} — ${getActivityName(activity, index)}`,
      getContentWidth(doc) - 160
    )[0];
    y = renderReferenceSectionBar(doc, barTitle, y, {
      afterGap: 10,
      rightText: `${reports.length} report${reports.length === 1 ? "" : "s"} • ${photoCount} photo${photoCount === 1 ? "" : "s"} • ${fileCount} file${fileCount === 1 ? "" : "s"}`
    });

    y = renderReferenceCardGrid(doc, [
      { label: "Location", value: activity.location || "N/A" },
      { label: "Status", value: formatStatus(activity.status || "In Progress") },
      { label: "Type", value: getActivityType(activity) }
    ], y, { columns: 3, afterGap: 8 });

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
      y = await renderReferenceConcreteReportBlock(doc, report, reportIndex, y, activity, log);
    }

    y = await renderReferenceAttachmentContent(doc, attachments, y, `Activity ${String(index + 1).padStart(2, "0")} Attachments`);
  }
  return y;
}

function renderReferenceQaqcSummary(doc, log, y) {
  const reports = getConcreteReports(log).map(({ report }) => report);
  const records = reports.flatMap(getReportRecords);
  const totalCy = records.reduce((sum, record) => sum + (Number(getRecordField(record, ["cubic_yards", "cubicYards"])) || 0), 0);
  const totalCylinders = records.reduce((sum, record) => (
    sum + (Number(getRecordField(record, ["lab_cylinders", "lab_samples", "labSamples"])) || 0) + (Number(getRecordField(record, ["field_cylinders", "field_samples", "fieldSamples"])) || 0)
  ), 0);
  const passed = records.filter((record) => formatStatus(getRecordField(record, ["record_result", "row_status", "recordResult", "status"])).toLowerCase().includes("pass")).length;
  const failed = records.filter((record) => formatStatus(getRecordField(record, ["record_result", "row_status", "recordResult", "status"])).toLowerCase().includes("fail")).length;
  y = renderReferenceSection(doc, "QA/QC Summary", [
    { label: "Total Records", value: records.length },
    { label: "Total Cubic Yards", value: totalCy.toFixed(1) },
    { label: "Total Cylinders", value: totalCylinders },
    { label: "Passed Tests", value: passed },
    { label: "Failed Tests", value: failed },
    { label: "Pending Review", value: Math.max(records.length - passed - failed, 0) }
  ], y, { columns: 3, minSpace: 86 });
  return y;
}

async function renderReferenceSignatures(doc, log, y) {
  y = ensurePage(doc, y, 130);
  y += 6;
  y = renderReferenceSectionBar(doc, "Signatures", y, { afterGap: 16 });
  const width = getContentWidth(doc);
  const columns = [PAGE_MARGIN, PAGE_MARGIN + width * 0.34, PAGE_MARGIN + width * 0.68];
  const labels = ["Technician Signature", "QA Reviewer Signature", "Date Approved"];
  labels.forEach((label, index) => {
    setReportFont(doc, "medium", 8, PDF_COLORS.muted);
    doc.text(label.toUpperCase(), columns[index], y, { charSpace: 0.4 });
    doc.setDrawColor(...PDF_COLORS.line);
    doc.line(columns[index], y + 40, columns[index] + width * 0.28, y + 40);
  });
  await renderSignatureImage(doc, log.technicianSignature || log.technician_signature || log.technicianSignatureUrl || log.technician_signature_url, columns[0], y + 8, width * 0.28, 28);
  await renderSignatureImage(doc, log.qcSignature || log.qc_signature || log.qcSignatureUrl || log.qc_signature_url, columns[1], y + 8, width * 0.28, 28);
  setReportFont(doc, "regular", 10, PDF_COLORS.navy);
  doc.text(log.approvedAt || log.approved_at ? formatDateOnly(log.approvedAt || log.approved_at) : "", columns[2], y + 32);
  return y + 56;
}
// Fully hydrated generation (project info, DB attachment rows, concrete report
// records) — guarantees the blob matches what regenerateDailyLogPdf produces.
// Used as the email-attachment fallback when the stored PDF cannot be fetched.
export async function generateHydratedDailyLogPdfBlob(log) {
  return generateDailyLogPdfBlob(await hydrateDailyLogForPdf(log));
}

export async function generateDailyLogPdfBlob(log) {
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter", compress: true });
  await registerReportFonts(doc);
  let y = PAGE_TOP_MARGIN;

  y = await renderReferenceDailyLogHeader(doc, log, y);
  y = renderReferenceSection(doc, "Project Information", [
    { label: "Project Number", value: getProjectNumber(log) },
    { label: "Project Name", value: getProjectName(log) },
    { label: "General Contractor", value: log.generalContractor || log.general_contractor || log.project?.general_contractor || "Not recorded" },
    { label: "GC Representative", value: log.gcRepresentative || log.gc_representative || "Not recorded" },
    { label: "Project Location", value: getProjectLocation(log) },
    { label: "Technician Name", value: getTechnicianName(log) },
    { label: "Weather", value: getWeatherText(log) },
    { label: "Shift", value: log.shift || log.shift_name || "Not recorded" }
  ], y, { columns: 2, cardHeight: 38, minSpace: 128 });
  // Front matter: reviewers see the QA/QC totals and sign-off block first;
  // per-activity details and attachments follow as the supporting record.
  y = renderReferenceQaqcSummary(doc, log, y);
  y = await renderReferenceSignatures(doc, log, y);
  await renderReferenceActivityDetails(doc, log, y);
  PdfFooter(doc, log);

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
