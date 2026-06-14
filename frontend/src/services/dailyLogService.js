import { supabase } from "./supabase.js";

const STORAGE_KEY = "imqcore:field-execution-logs";

// Persists attachment metadata so any device (and the QC reviewer) can load
// it from the database — local records in the log JSON are only a cache.
export async function persistDailyLogAttachmentRecord(attachment = {}) {
  try {
    const storagePath = attachment.storagePath || attachment.storage_path || "";
    if (!storagePath) return null;
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || null;
    const fileType = attachment.fileType || attachment.file_type || "application/octet-stream";
    const attachmentType = String(attachment.attachmentType || attachment.attachment_type || "").toLowerCase() === "photo" || fileType.startsWith("image/")
      ? "photo"
      : "file";

    const { error } = await supabase.from("daily_log_attachments").upsert({
      file_name: attachment.fileName || attachment.file_name || "Attachment",
      file_type: fileType,
      file_size: Number(attachment.fileSize || attachment.file_size || 0) || 0,
      storage_path: storagePath,
      storage_bucket: attachment.storageBucket || attachment.storage_bucket || "daily-log-attachments",
      attachment_type: attachmentType,
      local_daily_log_id: String(attachment.dailyLogId || attachment.daily_log_id || "") || null,
      local_activity_id: String(attachment.activityId || attachment.activity_id || "") || null,
      local_report_id: String(attachment.reportId || attachment.report_id || "") || null,
      uploaded_by: userId,
      deleted_at: null
    }, { onConflict: "storage_path" });

    if (error) console.warn("Daily log attachment record could not be saved to the database.", error);
    return error ? null : storagePath;
  } catch (error) {
    console.warn("Daily log attachment record persistence failed.", error);
    return null;
  }
}

export async function softDeleteDailyLogAttachmentRecord(attachment = {}) {
  try {
    const storagePath = attachment.storagePath || attachment.storage_path || "";
    if (!storagePath) return;
    const { error } = await supabase
      .from("daily_log_attachments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("storage_path", storagePath);
    if (error) console.warn("Daily log attachment record could not be soft-deleted.", error);
  } catch (error) {
    console.warn("Daily log attachment soft delete failed.", error);
  }
}

export const DAILY_LOG_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  SUBMITTED: "submitted",
  PENDING_MANAGER_REVIEW: "pending_manager_review",
  RETURNED: "returned_corrections",
  APPROVED: "approved"
};

export const ACTIVITY_STATUS = {
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  COMPLETE: "complete",
  ISSUE: "issue"
};

export const CONCRETE_REPORT_TYPE = "Concrete Report";

const NON_DRAFT_DAILY_LOG_STATUSES = [
  DAILY_LOG_STATUS.SUBMITTED,
  DAILY_LOG_STATUS.RETURNED,
  DAILY_LOG_STATUS.APPROVED
];

const DRAFT_LIKE_DAILY_LOG_STATUSES = [
  DAILY_LOG_STATUS.DRAFT,
  DAILY_LOG_STATUS.ACTIVE
];

function isNonDraftDailyLog(log) {
  return NON_DRAFT_DAILY_LOG_STATUSES.includes(log?.status);
}

function isDraftLikeDailyLog(log) {
  return !log?.status || DRAFT_LIKE_DAILY_LOG_STATUSES.includes(log.status);
}

function isUnsafeStatusDowngrade(nextLog, existingLog, options = {}) {
  if (options.allowStatusDowngrade || !existingLog) return false;
  return isNonDraftDailyLog(existingLog) && isDraftLikeDailyLog(nextLog);
}

function normalizeDailyLogFromStorage(log = {}) {
  const status = log.status === DAILY_LOG_STATUS.PENDING_MANAGER_REVIEW
    ? DAILY_LOG_STATUS.SUBMITTED
    : log.status;
  const normalizedLog = status === log.status ? log : { ...log, status };
  const recalledAt = log.recalledAt || log.recalled_at;
  if (isDraftLikeDailyLog(normalizedLog) && recalledAt) {
    return normalizedLog;
  }

  const submittedEvidence = normalizedLog.submittedAt ||
    normalizedLog.submitted_at ||
    normalizedLog.pdfGeneratedAt ||
    normalizedLog.pdf_generated_at ||
    normalizedLog.pdfStoragePath ||
    normalizedLog.pdf_storage_path ||
    normalizedLog.pdfDataUrl ||
    normalizedLog.pdf_data_url;

  if (!isDraftLikeDailyLog(normalizedLog) || !submittedEvidence) return normalizedLog;

  return {
    ...normalizedLog,
    status: DAILY_LOG_STATUS.SUBMITTED,
    submittedAt: normalizedLog.submittedAt || normalizedLog.submitted_at || normalizedLog.pdfGeneratedAt || normalizedLog.pdf_generated_at || normalizedLog.updatedAt || new Date().toISOString(),
    submitted_at: normalizedLog.submitted_at || normalizedLog.submittedAt || normalizedLog.pdf_generated_at || normalizedLog.pdfGeneratedAt || normalizedLog.updatedAt || new Date().toISOString()
  };
}

export const ACTIVITY_TYPES = [
  "General Work Log",
  "Concrete Placement",
  "Material Testing",
  "Inspection",
  "Safety Observation",
  "Delay / Issue",
  "Site Observation",
  "Custom Activity"
];

export function createConcreteReport(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    type: CONCRETE_REPORT_TYPE,
    status: "Draft",
    reportNumber: "",
    mixDesignNumber: "",
    batchPlantSupplier: "",
    slumpSpreadRange: "",
    airContentRange: "",
    temperatureRange: "",
    unitWeight: "",
    dfrNumber: "",
    placementLocation: "",
    mixNumber: "",
    ticketNumber: "",
    truckNumber: "",
    cubicYards: "",
    slump: "",
    airContent: "",
    concreteTemperature: "",
    strengthVerificationRequired: false,
    labCylinders: "",
    fieldCylinders: "",
    cylinders: "",
    notes: "",
    testRecords: [],
    attachments: [],
    pdfStoragePath: "",
    pdfGeneratedAt: "",
    pdfGenerationStatus: "pending",
    pdfGenerationFailureReason: "",
    linkedReportId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

export function createActivity(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    type: "General Work Log",
    title: "General Work Log",
    description: "",
    location: "",
    startTime: "",
    endTime: "",
    crewSize: "",
    equipmentUsed: "",
    materialUsed: "",
    status: ACTIVITY_STATUS.IN_PROGRESS,
    notes: "",
    photos: [],
    attachments: [],
    concreteReports: [],
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function normalizeComparable(value) {
  return String(value || "").trim().toLowerCase();
}

export function filterDailyLogsForAccess(logs, access = {}) {
  const companyId = access.companyId ?? access.organizationId ?? null;
  const companyName = normalizeComparable(access.companyName);
  const projectId = access.projectId ?? access.defaultProjectId ?? null;
  const projectName = normalizeComparable(access.projectName || access.projectLabel);
  const userId = access.userId || access.technicianId || null;
  const userName = normalizeComparable(access.userName || access.technicianName);

  return (logs || []).filter((log) => {
    const logCompanyId = log.companyId ?? log.organizationId ?? null;
    const logCompanyName = normalizeComparable(log.companyName || log.organizationName);
    const companyMatches = (
      !companyId && !companyName
    ) || (
      logCompanyId != null ? String(logCompanyId) === String(companyId) : true
    ) && (
      logCompanyName ? logCompanyName === companyName || !companyName : true
    );

    const logProjectId = log.projectId ?? log.project_id ?? null;
    const logProjectName = normalizeComparable(log.projectName || log.project_name);
    const hasProjectIds = logProjectId != null && projectId != null;
    const hasProjectNames = Boolean(logProjectName && projectName);
    const projectIdMatches = hasProjectIds && String(logProjectId) === String(projectId);
    const projectNameMatches = hasProjectNames && logProjectName === projectName;
    const projectMatches = hasProjectIds && hasProjectNames
      ? projectIdMatches && projectNameMatches
      : projectIdMatches || projectNameMatches;

    const assignedUserIds = Array.isArray(log.assignedUserIds) ? log.assignedUserIds.map(String) : [];
    const assignedUserNames = Array.isArray(log.assignedUserNames) ? log.assignedUserNames.map(normalizeComparable) : [];
    const ownerIds = [
      log.userId,
      log.user_id,
      log.technicianId,
      log.technician_id,
      log.createdBy,
      log.created_by
    ].filter(Boolean).map(String);
    const ownerNames = [
      log.technicianName,
      log.technician_name,
      log.createdByName,
      log.created_by_name
    ].map(normalizeComparable).filter(Boolean);
    const hasOwnershipData = ownerIds.length > 0 || ownerNames.length > 0 || assignedUserIds.length > 0 || assignedUserNames.length > 0;
    const userMatches = !hasOwnershipData || (
      userId && (ownerIds.includes(String(userId)) || assignedUserIds.includes(String(userId)))
    ) || (
      userName && (ownerNames.includes(userName) || assignedUserNames.includes(userName))
    );

    return companyMatches && projectMatches && userMatches;
  });
}

function getProjectInitials(projectName) {
  return (projectName || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join("")
    .slice(0, 6);
}

function getNextDfrNumber(projectId, projectName) {
  const counterKey = `dfrCounter:${projectId}`;
  let counter = parseInt(window.localStorage.getItem(counterKey) || "0", 10);
  counter += 1;
  window.localStorage.setItem(counterKey, String(counter));
  const initials = getProjectInitials(projectName);
  return `${initials}DFR${counter}`;
}

export function createDailyLog({
  projectLabel = "DC Water Potomac Tunnel",
  technicianName = "Ammu",
  defaultProjectId = 1,
  companyId = null,
  companyName = "",
  userId = null
} = {}) {
  const today = new Date();
  const dfrNumber = getNextDfrNumber(defaultProjectId, projectLabel);
  return {
    id: crypto.randomUUID(),
    dfrNumber,
    logNumber: dfrNumber,
    companyId,
    companyName,
    userId,
    technicianId: userId,
    assignedUserIds: userId ? [userId] : [],
    assignedUserNames: technicianName ? [technicianName] : [],
    projectId: defaultProjectId,
    projectNumber: String(defaultProjectId || "200100"),
    projectName: projectLabel,
    projectLocation: "Washington, DC",
    date: today.toISOString().slice(0, 10),
    shift: "Day Shift",
    weather: "Auto-captured weather pending",
    temperature: "",
    minTemperature: "",
    maxTemperature: "",
    humidity: "",
    windSpeed: "",
    rainProbability: "",
    weatherCondition: "",
    weatherCapturedAt: "",
    weatherOverride: "",
    weatherOverrideReason: "",
    weatherSource: "",
    weatherError: "",
    mixDesignNumber: "",
    batchPlant: "",
    supplier: "",
    testingRequirements: "",
    slumpRange: "",
    spreadRange: "",
    airContentRange: "",
    temperatureRange: "",
    unitWeight: "",
    supervisor: "",
    technicianName,
    dailySummary: "",
    aiSummaryType: "",
    aiSummaryUpdatedAt: "",
    siteConditions: "",
    notes: "",
    status: DAILY_LOG_STATUS.DRAFT,
    syncStatus: "Offline saved",
    lastSyncedAt: "",
    managerComments: [],
    // Activities start empty — the technician adds them explicitly, and reports
    // and attachments live inside each added activity.
    activities: [],
    createdAt: today.toISOString(),
    updatedAt: today.toISOString(),
    submittedAt: ""
  };
}

function readLogs() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]").map(normalizeDailyLogFromStorage);
  } catch {
    return [];
  }
}

function isQuotaExceededError(error) {
  return error?.name === "QuotaExceededError" ||
    error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error?.code === 22 ||
    error?.code === 1014;
}

function stripCachedPdfData(log = {}) {
  if (!log.pdfDataUrl && !log.pdf_data_url) return log;
  return { ...log, pdfDataUrl: "", pdf_data_url: "" };
}

function stripSignatureData(log = {}) {
  if (!log.technicianSignature && !log.technician_signature) return log;
  return { ...log, technicianSignature: "", technician_signature: "" };
}

function writeLogs(logs) {
  const sanitized = logs.map(sanitizeDailyLogForBrowserStorage);
  // Cached PDF data URLs (up to ~2.5MB per log) can blow past the localStorage
  // quota; submitted PDFs live in Supabase Storage, so the cache is shed first.
  const attempts = [
    () => sanitized,
    () => sanitized.map(stripCachedPdfData),
    () => sanitized.map((log) => stripSignatureData(stripCachedPdfData(log)))
  ];
  let lastError;
  for (const buildAttempt of attempts) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buildAttempt()));
      return;
    } catch (error) {
      if (!isQuotaExceededError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function toNullableBigInt(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  return Number(normalized);
}

async function getCurrentSupabaseUser() {
  // Prefer the locally cached session: auth.getUser() makes a network round
  // trip on every call and is a known stall point during submission.
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user?.id) return sessionData.session.user;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user || null;
}

function getDailyLogDate(log = {}) {
  return log.date || log.log_date || log.reportDate || log.report_date || new Date().toISOString().slice(0, 10);
}

function getWeatherSummary(log = {}) {
  return log.weatherSummary ||
    log.weather_summary ||
    log.weatherCondition ||
    log.weather_condition ||
    log.weather ||
    "";
}

// The jsonb payload column must stay small: cached PDF data URLs add megabytes
// to every upsert and can push the request past the submission timeout.
function sanitizeDailyLogForSupabasePayload(log = {}) {
  return stripCachedPdfData(sanitizeDailyLogForBrowserStorage(log));
}

function buildSupabaseDailyLogPayload(log = {}, userId, patch = {}) {
  return {
    client_log_id: String(log.id),
    organization_id: toNullableBigInt(log.organizationId || log.organization_id || log.companyId || log.company_id),
    project_id: toNullableBigInt(log.projectId || log.project_id),
    technician_id: userId || log.technicianId || log.technician_id || log.userId || log.user_id || null,
    log_date: getDailyLogDate(log),
    shift: log.shift || "",
    weather_summary: getWeatherSummary(log),
    supervisor_name: log.supervisor || log.supervisorName || log.supervisor_name || "",
    payload: sanitizeDailyLogForSupabasePayload(log),
    updated_at: new Date().toISOString(),
    ...patch
  };
}

export async function saveDailyLogSignatureToSupabase(log, signatureDataUrl) {
  if (!signatureDataUrl) {
    throw new Error("Signature could not be saved. Please try again.");
  }

  const user = await getCurrentSupabaseUser();
  if (!user?.id) {
    throw new Error("Signature could not be saved. Please try again.");
  }

  const { data, error } = await supabase
    .from("daily_log_signatures")
    .insert({
      client_daily_log_id: String(log.id),
      signed_by: user.id,
      signature_data_url: signatureDataUrl
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    if (error) console.error("Daily Log signature insert failed", error);
    throw new Error("Signature could not be saved. Please try again.");
  }

  return { id: data.id, userId: user.id };
}

export async function submitDailyLogToSupabase(log, { signatureId, submittedAt, submittedBy } = {}) {
  const user = submittedBy ? { id: submittedBy } : await getCurrentSupabaseUser();
  if (!user?.id) {
    throw new Error("Daily Log submission failed. Please try again.");
  }

  const clientLogId = String(log.id);
  const submissionPatch = {
    status: DAILY_LOG_STATUS.SUBMITTED,
    submitted_at: submittedAt || new Date().toISOString(),
    submitted_by: user.id,
    signature_id: signatureId || null
  };
  const payload = buildSupabaseDailyLogPayload(log, user.id, submissionPatch);

  // Look for an existing row first so we can UPDATE it — avoids depending on
  // a unique index for ON CONFLICT resolution (the index may not exist on all
  // environments). INSERT for new logs, UPDATE for re-submissions.
  const { data: existing } = await supabase
    .from("daily_logs")
    .select("id")
    .eq("client_log_id", clientLogId)
    .maybeSingle();

  let data, error;
  if (existing?.id) {
    ({ data, error } = await supabase
      .from("daily_logs")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("id,status,submitted_at,submitted_by,signature_id,pdf_url,pdf_storage_path")
      .single());
  } else {
    ({ data, error } = await supabase
      .from("daily_logs")
      .insert(payload)
      .select("id,status,submitted_at,submitted_by,signature_id,pdf_url,pdf_storage_path")
      .single());
  }

  if (error) {
    console.error("Daily Log submission failed", { code: error.code, message: error.message, details: error.details });
    throw new Error(`Daily Log submission failed: ${error.message || "Unknown database error"}`);
  }
  if (data?.status !== DAILY_LOG_STATUS.SUBMITTED) {
    console.error("Daily Log submission returned unexpected status", data?.status);
    throw new Error("Daily Log submission failed. Please try again.");
  }

  if (signatureId && data?.id) {
    await supabase
      .from("daily_log_signatures")
      .update({ daily_log_id: data.id })
      .eq("id", signatureId);
  }

  return data;
}

export async function updateDailyLogPdfMetadataInSupabase(log, pdfPatch = {}) {
  const payload = {
    pdf_url: pdfPatch.pdfUrl || pdfPatch.pdf_url || pdfPatch.finalPdfUrl || pdfPatch.final_pdf_url || "",
    pdf_storage_path: pdfPatch.pdfStoragePath || pdfPatch.pdf_storage_path || "",
    pdf_generated_at: pdfPatch.pdfGeneratedAt || pdfPatch.pdf_generated_at || new Date().toISOString(),
    pdf_generated: true,
    pdf_generation_status: pdfPatch.pdfGenerationStatus || pdfPatch.pdf_generation_status || "generated",
    pdf_generation_failure_reason: pdfPatch.pdfGenerationFailureReason || pdfPatch.pdf_generation_failure_reason || "",
    payload: sanitizeDailyLogForSupabasePayload({ ...log, ...pdfPatch }),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("daily_logs")
    .update(payload)
    .eq("client_log_id", String(log.id));

  if (error) throw error;
}

function sanitizeAttachmentForStorage(attachment = {}) {
  /* eslint-disable no-unused-vars -- destructured only to omit from storage */
  const {
    dataUrl,
    data_url,
    previewUrl,
    preview_url,
    objectUrl,
    object_url,
    file,
    blob,
    ...rest
  } = attachment;
  /* eslint-enable no-unused-vars */

  return {
    ...rest,
    dataUrl: "",
    data_url: "",
    previewUrl: "",
    preview_url: "",
    objectUrl: "",
    object_url: ""
  };
}

function sanitizeConcreteReportForStorage(report = {}) {
  return {
    ...report,
    attachments: (report.attachments || []).map(sanitizeAttachmentForStorage)
  };
}

function sanitizeActivityForStorage(activity = {}) {
  return {
    ...activity,
    photos: (activity.photos || []).map(sanitizeAttachmentForStorage),
    attachments: (activity.attachments || []).map(sanitizeAttachmentForStorage),
    concreteReports: (activity.concreteReports || []).map(sanitizeConcreteReportForStorage),
    reports: (activity.reports || []).map(sanitizeConcreteReportForStorage)
  };
}

function sanitizeDailyLogForBrowserStorage(log = {}) {
  return {
    ...log,
    activities: (log.activities || []).map(sanitizeActivityForStorage)
  };
}

function reportIdentityKeys(report) {
  const keys = [report.id, report.linkedReportId, report.linked_report_id]
    .filter(Boolean)
    .map((value) => `id:${String(value)}`);
  const dfrNumber = String(report.dfrNumber || report.dfr_number || "").trim().toLowerCase();
  if (dfrNumber) keys.push(`dfr:${dfrNumber}`);
  return keys;
}

function dedupeConcreteReports(reports = []) {
  const byKey = new Map();
  const deduped = [];

  reports.forEach((report) => {
    const keys = reportIdentityKeys(report);
    const existingIndex = keys.map((key) => byKey.get(key)).find((index) => index !== undefined);
    if (existingIndex === undefined) {
      const nextIndex = deduped.length;
      deduped.push(report);
      keys.forEach((key) => byKey.set(key, nextIndex));
      return;
    }

    deduped[existingIndex] = {
      ...deduped[existingIndex],
      ...report,
      createdDate: deduped[existingIndex].createdDate || report.createdDate,
      createdAt: deduped[existingIndex].createdAt || report.createdAt
    };
    reportIdentityKeys(deduped[existingIndex]).forEach((key) => byKey.set(key, existingIndex));
  });

  return deduped;
}

function attachmentIdentityKey(attachment = {}) {
  if (attachment.id) return `id:${attachment.id}`;
  const storagePath = attachment.storagePath || attachment.storage_path || attachment.filePath || attachment.file_path || attachment.objectPath || attachment.object_path || attachment.path;
  if (storagePath) return `path:${storagePath}`;
  const fileName = attachment.fileName || attachment.file_name || attachment.name || "";
  const createdAt = attachment.createdAt || attachment.created_at || attachment.uploadedAt || attachment.uploaded_at || "";
  return `file:${fileName}:${createdAt}`;
}

function mergeAttachmentLists(...attachmentGroups) {
  const merged = [];
  const seen = new Set();

  attachmentGroups.flat().filter(Boolean).forEach((attachment) => {
    const key = attachmentIdentityKey(attachment);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    merged.push(attachment);
  });

  return merged;
}

function mergeConcreteReportsForSave(nextActivity, existingActivity) {
  const nextReports = nextActivity.concreteReports || nextActivity.reports || [];
  const existingReports = existingActivity?.concreteReports || existingActivity?.reports || [];
  const deletedReportIds = new Set((nextActivity._deletedConcreteReportIds || []).map(String));
  const deletedAttachmentIds = new Set((nextActivity._deletedAttachmentIds || []).map(String));
  const reportKeys = (report) => reportIdentityKeys(report).map((key) => key.replace(/^id:/, ""));
  const nextReportKeys = new Set(nextReports.flatMap(reportKeys));
  const preservedReports = existingReports.filter((report) => (
    !reportKeys(report).some((key) => deletedReportIds.has(key) || nextReportKeys.has(key))
  ));
  const preservedAttachments = (existingActivity?.attachments || []).filter((attachment) => (
    !deletedAttachmentIds.has(String(attachment.id || ""))
  ));
  const preservedPhotos = (existingActivity?.photos || []).filter((photo) => (
    !deletedAttachmentIds.has(String(photo.id || ""))
  ));

  // eslint-disable-next-line no-unused-vars
  const { _deletedConcreteReportIds, _deletedAttachmentIds, ...cleanActivity } = nextActivity;
  return {
    ...cleanActivity,
    attachments: mergeAttachmentLists(preservedAttachments, cleanActivity.attachments || []),
    photos: mergeAttachmentLists(preservedPhotos, cleanActivity.photos || []),
    concreteReports: dedupeConcreteReports([...nextReports, ...preservedReports])
  };
}

function mergeDailyLogForSave(nextLog, existingLog) {
  if (!existingLog) return nextLog;
  const existingActivitiesById = new Map((existingLog.activities || []).map((activity) => [activity.id, activity]));
  return {
    ...nextLog,
    activities: (nextLog.activities || []).map((activity) => mergeConcreteReportsForSave(activity, existingActivitiesById.get(activity.id)))
  };
}

export function getDailyLogs() {
  return readLogs();
}

export function saveDailyLog(log, options = {}) {
  const logs = readLogs();
  const existingIndex = logs.findIndex((item) => item.id === log.id);
  if (existingIndex >= 0 && isUnsafeStatusDowngrade(log, logs[existingIndex], options)) {
    return logs[existingIndex];
  }
  const nextLog = mergeDailyLogForSave({ ...log, updatedAt: new Date().toISOString() }, existingIndex >= 0 ? logs[existingIndex] : null);
  if (existingIndex >= 0) {
    logs[existingIndex] = nextLog;
  } else {
    logs.unshift(nextLog);
  }
  writeLogs(logs);
  return nextLog;
}

export function deleteDailyLog(logId) {
  const logs = readLogs().filter((log) => log.id !== logId);
  writeLogs(logs);
  return logs;
}

export function getDailyLogById(logId) {
  return readLogs().find((log) => log.id === logId) || null;
}

export function attachConcreteReportToActivity(logId, activityId, reportSummary) {
  const logs = readLogs();
  const nextLogs = logs.map((log) => {
    if (log.id !== logId) return log;
    return {
      ...log,
      updatedAt: new Date().toISOString(),
      activities: log.activities.map((activity) => {
        if (activity.id !== activityId) return activity;
        const existingReports = activity.concreteReports || activity.reports || [];
        const nextReport = {
          id: reportSummary.id || crypto.randomUUID(),
          type: CONCRETE_REPORT_TYPE,
          status: reportSummary.status || "Draft",
          dfrNumber: reportSummary.dfrNumber || "",
          placementLocation: reportSummary.placementLocation || activity.location || "",
          mixNumber: reportSummary.mixNumber || "",
          ticketNumber: reportSummary.ticketNumber || "",
          truckNumber: reportSummary.truckNumber || "",
          cubicYards: reportSummary.cubicYards || "",
          slump: reportSummary.slump || "",
          airContent: reportSummary.airContent || "",
          concreteTemperature: reportSummary.concreteTemperature || "",
          strengthVerificationRequired: Boolean(reportSummary.strengthVerificationRequired),
          setNumber: reportSummary.setNumber || "",
          labSamples: reportSummary.labSamples || "",
          fieldSamples: reportSummary.fieldSamples || "",
          recordResult: reportSummary.recordResult || "",
          inspectorNotes: reportSummary.inspectorNotes || "",
          cylinders: reportSummary.cylinders || "",
          notes: reportSummary.notes || "",
          specifications: reportSummary.specifications || {},
          deliveryRecords: reportSummary.deliveryRecords || reportSummary.testRecords || [],
          testRecords: reportSummary.testRecords || reportSummary.deliveryRecords || [],
          summary: reportSummary.summary || {},
          pdfUrl: reportSummary.pdfUrl || reportSummary.pdf_url || "",
          pdf_url: reportSummary.pdfUrl || reportSummary.pdf_url || "",
          pdfStoragePath: reportSummary.pdfStoragePath || reportSummary.pdf_storage_path || "",
          pdf_storage_path: reportSummary.pdfStoragePath || reportSummary.pdf_storage_path || "",
          pdfFileName: reportSummary.pdfFileName || reportSummary.pdf_file_name || "",
          pdf_file_name: reportSummary.pdfFileName || reportSummary.pdf_file_name || "",
          pdfGeneratedAt: reportSummary.pdfGeneratedAt || reportSummary.pdf_generated_at || "",
          pdf_generated_at: reportSummary.pdfGeneratedAt || reportSummary.pdf_generated_at || "",
          pdfGenerationStatus: reportSummary.pdfGenerationStatus || reportSummary.pdf_generation_status || "pending",
          pdf_generation_status: reportSummary.pdfGenerationStatus || reportSummary.pdf_generation_status || "pending",
          linkedReportId: reportSummary.linkedReportId || null,
          createdDate: reportSummary.createdDate || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const matchesReport = (report) => {
          const existingKeys = reportIdentityKeys(report);
          const nextKeys = reportIdentityKeys(nextReport);
          return existingKeys.some((key) => nextKeys.includes(key));
        };
        const exists = existingReports.some(matchesReport);
        return {
          ...activity,
          concreteReports: dedupeConcreteReports(
            exists
              ? existingReports.map((report) => matchesReport(report) ? { ...report, ...nextReport } : report)
              : existingReports.length
                ? existingReports
                : [nextReport]
          )
        };
      })
    };
  });
  writeLogs(nextLogs);
  return nextLogs.find((log) => log.id === logId) || null;
}

export function submitDailyLog(log) {
  const submittedAt = new Date().toISOString();
  return saveDailyLog({
    ...log,
    status: DAILY_LOG_STATUS.SUBMITTED,
    submittedAt,
    submitted_at: submittedAt,
    syncStatus: "Pending sync"
  });
}

// Mirrors the technician's daily logs from the database into localStorage:
// restores logs submitted from another device and merges review decisions
// (approve / return) made on the manager's machine into the local copies.
// Local drafts are never overwritten. Returns true when anything changed.
export async function syncDailyLogsFromSupabase({ userId } = {}) {
  try {
    const technicianId = userId || (await getCurrentSupabaseUser())?.id;
    if (!technicianId) return false;

    const { data, error } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("technician_id", technicianId);
    if (error || !Array.isArray(data)) {
      if (error) console.warn("Daily log sync from the database failed.", error);
      return false;
    }

    let changed = false;
    const logs = readLogs();
    const byClientId = new Map(logs.map((log) => [String(log.id), log]));

    for (const row of data) {
      const clientId = String(row.client_log_id || "");
      const rowStatus = String(row.status || "").toLowerCase();
      // Archived rows are manager-side housekeeping; drafts have no remote truth.
      if (!clientId || !rowStatus || rowStatus === "archived" || rowStatus === DAILY_LOG_STATUS.DRAFT) continue;

      let payload = row.payload || {};
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          payload = {};
        }
      }

      const local = byClientId.get(clientId);
      if (!local) {
        // Restore a log that was submitted from another device or browser.
        changed = true;
        byClientId.set(clientId, {
          ...payload,
          id: clientId,
          status: rowStatus,
          supabaseDailyLogId: row.id,
          supabase_daily_log_id: row.id,
          submittedAt: row.submitted_at || payload.submittedAt || payload.submitted_at || "",
          submitted_at: row.submitted_at || payload.submitted_at || payload.submittedAt || "",
          pdfStoragePath: row.pdf_storage_path || payload.pdfStoragePath || payload.pdf_storage_path || "",
          pdf_storage_path: row.pdf_storage_path || payload.pdf_storage_path || payload.pdfStoragePath || "",
          pdfUrl: row.pdf_url || payload.pdfUrl || payload.pdf_url || "",
          pdf_url: row.pdf_url || payload.pdf_url || payload.pdfUrl || ""
        });
        continue;
      }

      // Merge review decisions into local copies that are still waiting on the
      // manager; recalled/edited drafts keep local truth.
      const localStatus = String(local.status || "").toLowerCase();
      const isReviewDecision = [DAILY_LOG_STATUS.APPROVED, DAILY_LOG_STATUS.RETURNED].includes(rowStatus);
      const localAwaitingReview = [DAILY_LOG_STATUS.SUBMITTED, DAILY_LOG_STATUS.PENDING_MANAGER_REVIEW].includes(localStatus);
      if (rowStatus !== localStatus && isReviewDecision && localAwaitingReview) {
        changed = true;
        byClientId.set(clientId, {
          ...local,
          status: rowStatus,
          approvedBy: payload.approvedBy || payload.approved_by || local.approvedBy || "",
          approved_by: payload.approved_by || payload.approvedBy || local.approved_by || "",
          approvedAt: payload.approvedAt || row.approved_at || local.approvedAt || "",
          approved_at: payload.approved_at || row.approved_at || local.approved_at || "",
          returnedAt: payload.returnedAt || row.returned_at || local.returnedAt || "",
          returned_at: payload.returned_at || row.returned_at || local.returned_at || "",
          managerComments: Array.isArray(payload.managerComments) && payload.managerComments.length
            ? payload.managerComments
            : (local.managerComments || []),
          qcSignature: payload.qcSignature || payload.qc_signature || local.qcSignature || "",
          qc_signature: payload.qc_signature || payload.qcSignature || local.qc_signature || "",
          pdfStoragePath: row.pdf_storage_path || local.pdfStoragePath || local.pdf_storage_path || "",
          pdf_storage_path: row.pdf_storage_path || local.pdf_storage_path || local.pdfStoragePath || "",
          supabaseDailyLogId: row.id,
          supabase_daily_log_id: row.id,
          syncStatus: "Synced"
        });
      }
    }

    if (changed) writeLogs(Array.from(byClientId.values()));
    return changed;
  } catch (error) {
    console.warn("Daily log sync failed.", error);
    return false;
  }
}

// Loads a submitted daily log from the database (for reviewers on devices that
// don't hold the technician's local copy). Accepts the local client uuid or
// the numeric daily_logs id.
export async function fetchDailyLogFromSupabase(logId) {
  const idString = String(logId || "").trim();
  if (!idString) return null;

  let query = supabase.from("daily_logs").select("*");
  query = /^\d+$/.test(idString) ? query.eq("id", Number(idString)) : query.eq("client_log_id", idString);
  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    if (error) console.warn("Daily log could not be loaded from the database.", error);
    return null;
  }

  let payload = data.payload || {};
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }

  return {
    ...payload,
    id: payload.id || data.client_log_id || idString,
    status: data.status || payload.status,
    submittedAt: data.submitted_at || payload.submittedAt || payload.submitted_at || "",
    submitted_at: data.submitted_at || payload.submitted_at || payload.submittedAt || "",
    supabaseDailyLogId: data.id,
    supabase_daily_log_id: data.id,
    technicianUserId: data.technician_id || payload.submittedBy || payload.submitted_by || payload.userId || payload.user_id || "",
    pdfStoragePath: data.pdf_storage_path || payload.pdfStoragePath || payload.pdf_storage_path || "",
    pdf_storage_path: data.pdf_storage_path || payload.pdf_storage_path || payload.pdfStoragePath || "",
    pdfUrl: data.pdf_url || payload.pdfUrl || payload.pdf_url || "",
    pdf_url: data.pdf_url || payload.pdf_url || payload.pdfUrl || ""
  };
}

// Persists a review decision (approve / return for corrections) to the
// database so it is visible across devices, not just in this browser.
export async function updateDailyLogReviewInSupabase(log) {
  const patch = {
    status: log.status,
    payload: sanitizeDailyLogForSupabasePayload(log),
    updated_at: new Date().toISOString()
  };

  const numericId = log.supabaseDailyLogId || log.supabase_daily_log_id;
  let query = supabase.from("daily_logs").update(patch);
  query = numericId ? query.eq("id", numericId) : query.eq("client_log_id", String(log.id));
  const { error } = await query;
  if (error) {
    console.error("Daily log review update failed", error);
    throw new Error("The review decision could not be saved to the server. Please try again.");
  }
}

export function approveDailyLog(log, reviewerName = "Manager", qcSignature = "") {
  const approvedAt = new Date().toISOString();
  const signature = qcSignature || log.qcSignature || log.qc_signature || "";
  return saveDailyLog({
    ...log,
    status: DAILY_LOG_STATUS.APPROVED,
    approvedAt,
    approved_at: approvedAt,
    approvedBy: reviewerName,
    approved_by: reviewerName,
    qcSignature: signature,
    qc_signature: signature,
    syncStatus: "Synced"
  });
}

export function requestDailyLogRevision(log, comment, reviewerName = "Manager") {
  const reviewComment = {
    id: crypto.randomUUID(),
    author: reviewerName,
    comment: comment || "Revision requested.",
    createdAt: new Date().toISOString()
  };

  return saveDailyLog({
    ...log,
    status: DAILY_LOG_STATUS.RETURNED,
    managerComments: [...(log.managerComments || []), reviewComment],
    returnedAt: new Date().toISOString(),
    syncStatus: "Pending sync"
  });
}

export function duplicateActivity(activity) {
  return createActivity({
    type: activity.type || "General Work Log",
    description: activity.description,
    location: activity.location,
    title: `${activity.title || "Activity"} Copy`,
    status: ACTIVITY_STATUS.NOT_STARTED,
    concreteReports: [],
    photos: [],
    attachments: []
  });
}

export function getDailyLogCollections(logs) {
  return {
    activeLogs: logs.filter((log) => [DAILY_LOG_STATUS.ACTIVE, DAILY_LOG_STATUS.DRAFT].includes(log.status)),
    draftLogs: logs.filter((log) => log.status === DAILY_LOG_STATUS.DRAFT),
    submittedLogs: logs.filter((log) => log.status === DAILY_LOG_STATUS.SUBMITTED),
    returnedLogs: logs.filter((log) => log.status === DAILY_LOG_STATUS.RETURNED),
    approvedLogs: logs.filter((log) => log.status === DAILY_LOG_STATUS.APPROVED)
  };
}

export function formatLogStatus(status) {
  const labels = {
    [DAILY_LOG_STATUS.DRAFT]: "Draft",
    [DAILY_LOG_STATUS.ACTIVE]: "Active Execution",
    [DAILY_LOG_STATUS.SUBMITTED]: "Submitted",
    [DAILY_LOG_STATUS.PENDING_MANAGER_REVIEW]: "Submitted",
    [DAILY_LOG_STATUS.RETURNED]: "Returned Corrections",
    [DAILY_LOG_STATUS.APPROVED]: "Approved"
  };
  return labels[status] || "Draft";
}

export function formatActivityStatus(status) {
  const labels = {
    [ACTIVITY_STATUS.NOT_STARTED]: "Not Started",
    [ACTIVITY_STATUS.IN_PROGRESS]: "In Progress",
    [ACTIVITY_STATUS.COMPLETE]: "Complete",
    [ACTIVITY_STATUS.ISSUE]: "Issue"
  };
  return labels[status] || "Not Started";
}
