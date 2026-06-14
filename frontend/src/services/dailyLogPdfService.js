import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";
import interRegularUrl from "../assets/fonts/Inter-Regular.ttf?url";
import interSemiBoldUrl from "../assets/fonts/Inter-SemiBold.ttf?url";
import { supabase } from "./supabase.js";
import { saveDailyLog } from "./dailyLogService.js";
import { getStorageConfigError, logStorageStep } from "./storageDiagnosticsService.js";

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
const DAILY_LOG_PDF_BUCKET = "daily-log-pdfs";
const SIGNED_URL_TTL_SECONDS = 60 * 10;
const JsPDFConstructor = jsPdfModule?.jsPDF || jsPdfModule?.default || jsPdfModule;
const PAGE_MARGIN = 40;
const PAGE_TOP_MARGIN = 36;
const PAGE_BOTTOM_MARGIN = 42;
const LOCAL_PDF_CACHE_LIMIT_BYTES = 2_500_000;
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

// Collected during a single generateDailyLogPdfBlob call; reset at the start
// of each generation so concurrent calls don't mix their attachments.
let _pdfMergeQueue = [];

async function renderPdfAttachment(doc, attachment, y) {
  const fileName = getAttachmentFileName(attachment);
  const source = await resolveAttachmentSource(attachment);
  const arrayBuffer = await sourceToArrayBuffer(source);

  y = ensurePage(doc, y, 36);
  setReportFont(doc, "medium", 9, PDF_COLORS.slate);
  doc.text(`Attached PDF: ${fileName}`, PAGE_MARGIN, y);
  y += 14;

  if (!arrayBuffer) {
    setReportFont(doc, "regular", 8.5, [185, 28, 28]);
    doc.text("(Attachment could not be retrieved.)", PAGE_MARGIN, y);
    return y + 14;
  }

  _pdfMergeQueue.push({ fileName, arrayBuffer });
  setReportFont(doc, "regular", 8.5, PDF_COLORS.slate);
  doc.text(`(Full document appended as page${_pdfMergeQueue.length > 1 ? "s" : ""} at end of report — attachment ${_pdfMergeQueue.length})`, PAGE_MARGIN, y);
  return y + 14;
}

async function mergePdfAttachments(mainBlob, queue) {
  if (!queue.length) return mainBlob;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const mainBytes = await mainBlob.arrayBuffer();
    const mainDoc = await PDFDocument.load(mainBytes);

    for (const { fileName, arrayBuffer } of queue) {
      try {
        const attachedDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const indices = attachedDoc.getPageIndices();
        const copied = await mainDoc.copyPages(attachedDoc, indices);
        copied.forEach((page) => mainDoc.addPage(page));
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

function getDarkTableHeadStyles(fontSize = 9) {
  return {
    fillColor: PDF_COLORS.navy,
    textColor: PDF_COLORS.white,
    fontStyle: "bold",
    fontSize
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

function getReportKind(report) {
  const type = String(report.type || report.reportType || report.report_type || "").toLowerCase();
  if (type.includes("asphalt")) return "asphalt";
  if (type.includes("compaction") || type.includes("density") || type.includes("nuclear")) return "compaction";
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
        headStyles: { fillColor: PDF_COLORS.navy, textColor: PDF_COLORS.white, fontStyle: "bold", fontSize: 8 },
        bodyStyles: { fillColor: PDF_COLORS.white },
        alternateRowStyles: { fillColor: PDF_COLORS.soft },
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

async function renderReferenceNuclearCompactionReportBlock(doc, report, reportIndex, y, activity, log) {
  const logDate = log.date || log.logDate || log.log_date || "";
  const calibrationDueDate = report.calibrationDueDate || report.calibration_due_date || "";
  const isOutOfCalibration = Boolean(calibrationDueDate && logDate && calibrationDueDate < logDate);

  y = ensurePage(doc, y, 160);
  y = renderReferenceSectionBar(doc, `Nuclear Density Report ${reportIndex + 1}`, y, {
    afterGap: 10,
    rightText: formatStatus(report.status || "Draft")
  });

  y = renderReferenceCardGrid(doc, [
    { label: "Serial Number", value: pdfValue(report.serialNumber || report.serial_number) },
    { label: "Gauge Model", value: pdfValue(report.gaugeModel || report.gauge_model) },
    { label: "Calibration Due Date", value: isOutOfCalibration ? `${calibrationDueDate} ⚠ OUT OF CALIBRATION` : pdfValue(calibrationDueDate) },
    { label: "Gauge Standardized", value: pdfValue(report.standardizedGauge || report.standardized_gauge) },
    { label: "Standard Count Density", value: pdfValue(report.standardDensity || report.standard_density) },
    { label: "Standard Count Moisture", value: pdfValue(report.standardMoisture || report.standard_moisture) },
    { label: "Material Type", value: pdfValue(report.materialType || report.material_type) },
    { label: "Material Name", value: pdfValue(report.materialName || report.material_name) },
    { label: "Min. Density Required (%)", value: pdfValue(report.percentMinimumDensityRequired || report.percent_minimum_density_required) }
  ], y, { columns: 3, afterGap: isOutOfCalibration ? 6 : 10 });

  if (isOutOfCalibration) {
    y = ensurePage(doc, y, 24);
    doc.setFillColor(...[254, 226, 226]);
    doc.roundedRect(PAGE_MARGIN, y, getContentWidth(doc), 18, 3, 3, "F");
    setReportFont(doc, "bold", 8.5, [185, 28, 28]);
    doc.text(`⚠ OUT OF CALIBRATION — Calibration expired before report date (${logDate}).`, PAGE_MARGIN + 6, y + 11);
    y += 24;
  }

  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  if (records.length) {
    y = ensurePage(doc, y, 80);
    const fontFamily = reportFontsRegistered ? REPORT_FONT_FAMILY : "helvetica";
    autoTable(doc, {
      startY: y,
      head: [["Test #", "Location", "Wet Density", "Dry Density", "% Dry Density", "Result"]],
      body: records.map((r) => [
        pdfValue(r.testNo || r.test_no),
        pdfValue(r.location),
        pdfValue(r.wetDensity || r.wet_density),
        pdfValue(r.dryDensity || r.dry_density),
        pdfValue(r.percentDryDensity || r.percent_dry_density),
        pdfValue(r.densityResult || r.density_result)
      ]),
      theme: "grid",
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_TOP_MARGIN, bottom: PAGE_BOTTOM_MARGIN + 16 },
      tableWidth: getContentWidth(doc),
      showHead: "everyPage",
      styles: { font: fontFamily, fontSize: 8, textColor: PDF_COLORS.navy, cellPadding: 5, valign: "middle" },
      headStyles: { fillColor: PDF_COLORS.navy, textColor: PDF_COLORS.white, fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fillColor: PDF_COLORS.white },
      alternateRowStyles: { fillColor: PDF_COLORS.soft }
    });
    y = doc.lastAutoTable.finalY + 10;
  } else {
    y = renderReferenceTextBox(doc, "Test Records", "No test records recorded for this report.", y);
  }

  y = await renderReferenceAttachmentContent(doc, getReportAttachments(report, activity, log), y, `Nuclear Density Report ${reportIndex + 1} Attachments`);
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
      const kind = getReportKind(report);
      if (kind === "asphalt") {
        y = await renderReferenceAsphaltReportBlock(doc, report, reportIndex, y, activity, log);
      } else if (kind === "compaction") {
        y = await renderReferenceNuclearCompactionReportBlock(doc, report, reportIndex, y, activity, log);
      } else {
        y = await renderReferenceConcreteReportBlock(doc, report, reportIndex, y, activity, log);
      }
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
  _pdfMergeQueue = [];

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
  y = renderReferenceQaqcSummary(doc, log, y);
  y = await renderReferenceSignatures(doc, log, y);
  await renderReferenceActivityDetails(doc, log, y);
  PdfFooter(doc, log);

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
