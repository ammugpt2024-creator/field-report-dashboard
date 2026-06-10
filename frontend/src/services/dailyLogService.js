const STORAGE_KEY = "imqcore:field-execution-logs";

export const DAILY_LOG_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  SUBMITTED: "pending_manager_review",
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
  const recalledAt = log.recalledAt || log.recalled_at;
  if (isDraftLikeDailyLog(log) && recalledAt) {
    return log;
  }

  const submittedEvidence = log.submittedAt ||
    log.submitted_at ||
    log.pdfGeneratedAt ||
    log.pdf_generated_at ||
    log.pdfStoragePath ||
    log.pdf_storage_path ||
    log.pdfDataUrl ||
    log.pdf_data_url;

  if (!isDraftLikeDailyLog(log) || !submittedEvidence) return log;

  return {
    ...log,
    status: DAILY_LOG_STATUS.SUBMITTED,
    submittedAt: log.submittedAt || log.submitted_at || log.pdfGeneratedAt || log.pdf_generated_at || log.updatedAt || new Date().toISOString(),
    submitted_at: log.submitted_at || log.submittedAt || log.pdf_generated_at || log.pdfGeneratedAt || log.updatedAt || new Date().toISOString()
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

export function createDailyLog({
  projectLabel = "DC Water Potomac Tunnel",
  technicianName = "Ammu",
  defaultProjectId = 1,
  companyId = null,
  companyName = "",
  userId = null
} = {}) {
  const today = new Date();
  return {
    id: crypto.randomUUID(),
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
    activities: [
      createActivity({
        title: "General Work Log",
        type: "General Work Log",
        location: "",
        concreteReports: []
      })
    ],
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

function writeLogs(logs) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.map(sanitizeDailyLogForBrowserStorage)));
}

function sanitizeAttachmentForStorage(attachment = {}) {
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
  return saveDailyLog({
    ...log,
    status: DAILY_LOG_STATUS.SUBMITTED,
    submittedAt: new Date().toISOString(),
    syncStatus: "Pending sync"
  });
}

export function approveDailyLog(log, reviewerName = "Manager") {
  return saveDailyLog({
    ...log,
    status: DAILY_LOG_STATUS.APPROVED,
    approvedAt: new Date().toISOString(),
    approvedBy: reviewerName,
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
    [DAILY_LOG_STATUS.SUBMITTED]: "Pending Manager Review",
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
