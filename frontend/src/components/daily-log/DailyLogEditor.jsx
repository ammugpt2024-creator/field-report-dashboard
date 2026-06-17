import { useEffect, useState } from "react";
import { Camera, ClipboardList, Edit, FileText, HardHat, MessageSquare, Paperclip, Plus, Save, Send, Trash2 } from "lucide-react";
import ActivityReportSelector from "../reports/ActivityReportSelector";
import ConcreteReportInlineContent from "../reports/ConcreteReportInlineContent";
import CompactionReportInlineContent from "../reports/CompactionReportInlineContent";
import AsphaltCompactionReportInlineContent from "../reports/AsphaltCompactionReportInlineContent";
import SurfaceInfiltrationReportInlineContent from "../reports/SurfaceInfiltrationReportInlineContent";
import ProctorReportInlineContent from "../reports/ProctorReportInlineContent";
import SamplesCollectionReportInlineContent from "../reports/SamplesCollectionReportInlineContent";
import BottomActionBar from "../mobile/BottomActionBar";
import SignatureModal from "../SignatureModal";
import PhotosAttachmentsSection, { isAllowedDailyLogAttachment } from "./PhotosAttachmentsSection";
import WeatherConditionsCard from "./WeatherConditionsCard";
import { supabase } from "../../services/supabase";
import {
  createActivity,
  DAILY_LOG_STATUS,
  getDailyLogById,
  persistDailyLogAttachmentRecord,
  saveDailyLog,
  softDeleteDailyLogAttachmentRecord,
  saveDailyLogSignatureToSupabase,
  submitDailyLog,
  submitDailyLogToSupabase,
  updateDailyLogPdfMetadataInSupabase
} from "../../services/dailyLogService";
import { createDailyLogPdfSignedUrl, generateHydratedDailyLogPdfBlob, regenerateDailyLogPdf } from "../../services/dailyLogPdfService";
import { sendDailyLogReviewEmail } from "../../services/notificationService";
import DailyLogSubmitPanel from "./DailyLogSubmitPanel";

const PROJECT_OPTIONS = [
  {
    id: 1,
    projectNumber: "200100",
    projectName: "DC Water Potomac Tunnel",
    projectLocation: "Washington, DC"
  }
];

const DAILY_LOG_ATTACHMENT_BUCKET = "daily-log-attachments";
const DAILY_LOG_ATTACHMENT_FALLBACK_BUCKET = "report-attachments";

function formatUploadFailure(error) {
  const message = String(error?.message || error || "Upload failed");
  const status = error?.statusCode || error?.status || "";
  if (/bucket not found|bucket does not exist|not found/i.test(message)) {
    return "Daily Log attachment storage is not configured in Supabase. Please apply the storage bucket migration.";
  }
  if (/row-level security|permission|unauthorized|jwt|not authenticated/i.test(message)) {
    return "Supabase rejected the upload permissions for this session. Please sign in again or update the daily-log-attachments storage policy.";
  }
  if (/mime|content type|not allowed/i.test(message)) {
    return "This file type is not allowed by the daily-log-attachments bucket.";
  }
  return status ? `${message} (${status})` : message;
}

function Field({ label, children, error }) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      {children}
      {error && <span className="mt-2 block text-xs font-bold text-rose-700">{error}</span>}
    </label>
  );
}

function inputClass(error = false) {
  return `min-h-11 w-full rounded-2xl border bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-4 ${
    error ? "border-rose-300 focus:border-rose-600 focus:ring-rose-100" : "border-slate-200 focus:border-blue-700 focus:ring-blue-100"
  }`;
}

function summaryValueClass() {
  return "mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-950";
}

function SummaryField({ label, children }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function ensureSubmittedDailyLogView() {
  window.setTimeout(() => {
    const path = window.location.pathname;
    if (!path.includes("/technician/daily-log/")) return;
    // Router navigation from onSubmitted normally lands here already; a hard
    // reload would kill the deferred PDF generation, so it stays a fallback.
    if (path.endsWith("/submitted")) return;
    const currentLogId = path.match(/\/technician\/daily-log\/([^/]+)/)?.[1];
    window.location.assign(currentLogId ? `/technician/daily-log/${currentLogId}/submitted` : "/technician/dashboard?view=submitted-logs");
  }, 200);
}

function withSubmissionTimeout(promise, message, timeoutMs = 15000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function getReportIdentityKeys(report) {
  const keys = [report.id, report.linkedReportId, report.linked_report_id]
    .filter(Boolean)
    .map((value) => `id:${String(value)}`);
  const dfrNumber = String(report.dfrNumber || report.dfr_number || "").trim().toLowerCase();
  if (dfrNumber) keys.push(`dfr:${dfrNumber}`);
  return keys;
}

function dedupeReports(reports = []) {
  const byKey = new Map();
  const deduped = [];

  reports.forEach((report) => {
    const keys = getReportIdentityKeys(report);
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
    getReportIdentityKeys(deduped[existingIndex]).forEach((key) => byKey.set(key, existingIndex));
  });

  return deduped;
}

function getActivityAttachedReports(activity) {
  return dedupeReports([...(activity?.concreteReports || []), ...(activity?.reports || [])]);
}

const concreteRecordContentKeys = [
  "ticketNumber", "ticket_number",
  "truckNumber", "truck_number",
  "cubicYards", "cubic_yards",
  "timeBatched", "batch_time", "time_batched",
  "arrivalTime", "arrival_time",
  "timeTested", "testing_time", "time_tested",
  "finishUnload", "finish_unload_time", "finish_unload",
  "actualMinutes", "actual_minutes",
  "recordResult", "record_result", "row_status",
  "waterAdded", "water_added_gal",
  "airTemp", "airTempF", "air_temp_f",
  "concreteTemp", "concreteTempF", "concrete_temp_f",
  "slump", "slump_in",
  "airContent", "air_content_percent",
  "unitWeight", "unit_weight_lbs_ft3",
  "spread", "spread_in",
  "jRing", "j_ring_in",
  "setNumber", "set_number",
  "labSamples", "lab_cylinders", "lab_samples",
  "fieldSamples", "field_cylinders", "field_samples",
  "inspectorNotes", "comments", "notes"
];

function concreteRecordHasContent(record = {}) {
  return concreteRecordContentKeys.some((key) => {
    const value = record[key];
    return value !== null && value !== undefined && String(value).trim() !== "";
  });
}

function hasConcreteReportContent(report = {}) {
  const specifications = report.specifications || {};
  const allRecords = Array.isArray(report.deliveryRecords)
    ? report.deliveryRecords
    : Array.isArray(report.testRecords)
      ? report.testRecords
      : [];
  // An empty truck-ticket row added by default does not make the report submit-ready.
  const records = allRecords.filter(concreteRecordHasContent);
  const specificationKeys = [
    "airContent",
    "airContentPercent",
    "air_content_percent",
    "unitWeight",
    "unitWeightLbsFt3",
    "unit_weight_lbs_ft3",
    "spread",
    "spreadIn",
    "spread_in",
    "slump",
    "slumpIn",
    "slump_in",
    "concreteTemperature",
    "materialTemp",
    "materialTempF",
    "concrete_temp_f",
    "mixNumber",
    "mixNo",
    "mix_number",
    "jRing",
    "jRingIn",
    "j_ring_in",
    "specifiedStrength",
    "specifiedStrengthPsi",
    "specified_strength_psi"
  ];

  return (
    records.length > 0 ||
    specificationKeys.some((key) => {
      const value = report[key] ?? specifications[key];
      return value !== null && value !== undefined && String(value).trim() !== "";
    })
  );
}

function isConcreteReportSubmitReady(report = {}) {
  const reportStatus = String(report.status || "").toLowerCase();
  return ["completed", "submitted", "approved", "finalized"].includes(reportStatus) || hasConcreteReportContent(report);
}

function getReportNumberPrefix(report = {}) {
  return String(report.reportNumber || report.report_number || report.dfrNumber || report.dfr_number || "").trim();
}

function isAsphaltReport(report = {}) {
  const type = String(report.type || report.reportType || report.report_type || "").toLowerCase();
  if (type.includes("asphalt")) return true;
  return getReportNumberPrefix(report).startsWith("ACR-");
}

function isCompactionReport(report = {}) {
  const type = String(report.type || report.reportType || report.report_type || "").toLowerCase();
  if (type.includes("asphalt") || getReportNumberPrefix(report).startsWith("ACR-")) return false;
  if (type.includes("compaction") || type.includes("density") || type.includes("nuclear")) return true;
  return getReportNumberPrefix(report).startsWith("CDR-");
}

function isInfiltrationReport(report = {}) {
  const type = String(report.type || report.reportType || report.report_type || "").toLowerCase();
  if (type.includes("infiltration")) return true;
  return getReportNumberPrefix(report).startsWith("SIR-");
}

function hasInfiltrationReportContent(report = {}) {
  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  return Boolean(
    records.length ||
    String(report.reportNumber || report.report_number || "").trim() ||
    String(report.status || "").trim()
  );
}

function hasAsphaltReportContent(report = {}) {
  const groups = Array.isArray(report.materialGroups) ? report.materialGroups : [];
  return Boolean(
    groups.length ||
    String(report.reportNumber || report.report_number || "").trim() ||
    String(report.status || "").trim()
  );
}

function isAsphaltReportSubmitReady(report = {}) {
  const reportStatus = String(report.status || "").toLowerCase();
  if (["completed", "submitted", "approved", "finalized"].includes(reportStatus)) return true;
  const groups = Array.isArray(report.materialGroups) ? report.materialGroups : [];
  return groups.some(g => (g.testRecords || []).length > 0);
}

function isCompactionReportSubmitReady(report = {}) {
  const reportStatus = String(report.status || "").toLowerCase();
  if (["completed", "submitted", "approved", "finalized"].includes(reportStatus)) return true;
  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  return Boolean(
    String(report.serialNumber || report.serial_number || "").trim() &&
    String(report.gaugeModel || report.gauge_model || "").trim() &&
    String(report.calibrationDueDate || report.calibration_due_date || "").trim() &&
    String(report.standardizedGauge || report.standardized_gauge || "").toLowerCase() === "yes" &&
    String(report.materialType || report.material_type || "").trim() &&
    records.length > 0
  );
}

function hasCompactionReportContent(report = {}) {
  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  return Boolean(
    records.length ||
    String(report.reportNumber || report.report_number || "").trim() ||
    String(report.status || "").trim() ||
    String(report.materialType || report.material_type || "").trim() ||
    String(report.materialName || report.material_name || "").trim() ||
    String(report.maximumDryDensity || report.maximum_dry_density || "").trim() ||
    String(report.correctedMaximumDryDensity || report.corrected_maximum_dry_density || "").trim() ||
    String(report.percentMinimumDensityRequired || report.percent_minimum_density_required || "").trim()
  );
}

function isInfiltrationReportSubmitReady(report = {}) {
  const reportStatus = String(report.status || "").toLowerCase();
  if (["completed", "submitted", "approved", "finalized"].includes(reportStatus)) return true;
  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  return records.some(r => String(r.infiltrationRate || "").trim() !== "");
}

function isProctorReport(report = {}) {
  const type = String(report.type || report.reportType || report.report_type || "").toLowerCase();
  if (type.includes("proctor")) return true;
  return getReportNumberPrefix(report).startsWith("OPP-");
}

function hasProctorReportContent(report = {}) {
  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  return Boolean(records.length || String(report.reportNumber || report.report_number || "").trim());
}

function isProctorReportSubmitReady(report = {}) {
  const reportStatus = String(report.status || "").toLowerCase();
  if (["completed", "submitted", "approved", "finalized"].includes(reportStatus)) return true;
  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  return records.some(r => String(r.percentCompaction || "").trim() !== "");
}

function isSamplesReport(report = {}) {
  const type = String(report.type || report.reportType || report.report_type || "").toLowerCase();
  return type.includes("sample");
}

function hasSamplesReportContent(report = {}) {
  return Boolean(
    String(report.sampleType || "").trim() ||
    String(report.castDate || report.cast_date || "").trim() ||
    String(report.specimenCount || report.specimen_count || "").trim() ||
    String(report.comments || "").trim()
  );
}

function isSamplesReportSubmitReady(report = {}) {
  const reportStatus = String(report.status || "").toLowerCase();
  if (["completed", "submitted", "approved", "finalized"].includes(reportStatus)) return true;
  return Boolean(
    String(report.sampleType || "").trim() &&
    String(report.castDate || report.cast_date || "").trim() &&
    String(report.specimenCount || report.specimen_count || "").trim()
  );
}

function isAttachedReportSubmitReady(report = {}) {
  if (isAsphaltReport(report)) return isAsphaltReportSubmitReady(report);
  if (isCompactionReport(report)) return isCompactionReportSubmitReady(report);
  if (isInfiltrationReport(report)) return isInfiltrationReportSubmitReady(report);
  if (isProctorReport(report)) return isProctorReportSubmitReady(report);
  if (isSamplesReport(report)) return isSamplesReportSubmitReady(report);
  return isConcreteReportSubmitReady(report);
}

function createAttachmentRecord(file, attachmentType, context) {
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const companyId = context.companyId || "company";
  const organizationId = context.organizationId || companyId;
  const projectId = context.projectId || "project";
  const dailyLogId = context.dailyLogId || "daily-log";
  const activityId = context.activityId || "activity";
  const userId = context.userId || context.technicianId || "";
  const technicianId = context.technicianId || context.userId || "";
  const reportFolder = context.reportId ? `report_${context.reportId}/` : "";
  const storagePath = `${companyId}/${projectId}/${dailyLogId}/${activityId}/${reportFolder}${Date.now()}-${safeName}`;

  return {
    id: crypto.randomUUID(),
    companyId,
    company_id: companyId,
    organizationId,
    organization_id: organizationId,
    projectId,
    project_id: projectId,
    dailyLogId,
    daily_log_id: dailyLogId,
    activityId,
    activity_id: activityId,
    reportId: context.reportId || null,
    report_id: context.reportId || null,
    userId,
    user_id: userId,
    technicianId,
    technician_id: technicianId,
    fileName: file.name,
    fileType: file.type || "application/octet-stream",
    fileSize: file.size,
    storagePath,
    storage_path: storagePath,
    attachmentType,
    uploadedBy: context.uploadedBy || "",
    uploadedById: userId,
    uploaded_by_id: userId,
    uploadStatus: "pending_sync",
    uploadProgress: 100,
    dataUrl: "",
    objectUrl: "",
    previewUrl: "",
    createdAt: new Date().toISOString()
  };
}

function getAttachmentIdentityKey(attachment = {}) {
  // Storage path first: the same uploaded file can carry different record ids
  // (local cache vs database row).
  const storagePath = attachment.storagePath || attachment.storage_path || attachment.filePath || attachment.file_path || attachment.objectPath || attachment.object_path || attachment.path;
  if (storagePath) return `path:${storagePath}`;
  if (attachment.id) return `id:${attachment.id}`;
  const fileName = attachment.fileName || attachment.file_name || attachment.name || "";
  const createdAt = attachment.createdAt || attachment.created_at || attachment.uploadedAt || attachment.uploaded_at || "";
  return `file:${fileName}:${createdAt}`;
}

function mergeActivityAttachments(...attachmentGroups) {
  const merged = [];
  const seen = new Set();

  attachmentGroups.flat().filter(Boolean).forEach((attachment) => {
    const key = getAttachmentIdentityKey(attachment);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    merged.push(attachment);
  });

  return merged;
}

async function uploadDailyLogAttachment(file, attachment) {
  const bucketAttempts = [DAILY_LOG_ATTACHMENT_BUCKET, DAILY_LOG_ATTACHMENT_FALLBACK_BUCKET];
  const errors = [];
  let uploadedBucket = "";

  for (const bucketName of bucketAttempts) {
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(attachment.storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: true
      });

    if (!error) {
      uploadedBucket = bucketName;
      break;
    }

    errors.push({ bucketName, error });
  }

  if (!uploadedBucket) {
    const firstError = errors[0]?.error || new Error("Upload failed");
    firstError.message = `${firstError.message || "Upload failed"}${errors.length > 1 ? `; fallback also failed: ${errors[1].error?.message || "Upload failed"}` : ""}`;
    throw firstError;
  }

  return {
    ...attachment,
    storageBucket: uploadedBucket,
    storage_bucket: uploadedBucket,
    dataUrl: "",
    previewUrl: "",
    objectUrl: "",
    uploadStatus: "uploaded",
    uploaded: true,
    uploadedAt: new Date().toISOString()
  };
}

async function createUploadReadyAttachment(file, attachmentType, context) {
  const attachment = createAttachmentRecord(file, attachmentType, context);
  return {
    file,
    attachment: {
      ...attachment,
      dataUrl: "",
      previewUrl: "",
      objectUrl: "",
      uploadStatus: "uploading",
      uploaded: false
    }
  };
}

export default function DailyLogEditor({ log, onChange, onSubmitted, onCreateConcreteReport, onOpenConcreteReport, onCreateCompactionReport, onOpenCompactionReport, onCreateAsphaltReport, onOpenAsphaltReport, onCreateInfiltrationReport, onOpenInfiltrationReport, onCreateProctorReport, onOpenProctorReport, onCreateSamplesReport, onOpenSamplesReport }) {
  const [lastAutosavedAt, setLastAutosavedAt] = useState("");
  const [reportPickerActivityId, setReportPickerActivityId] = useState("");
  const [reportSectionError, setReportSectionError] = useState("");
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [technicianSignatureDraft, setTechnicianSignatureDraft] = useState(log.technicianSignature || log.technician_signature || "");
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const activitiesComplete = log.activities.length > 0 && log.activities.every((activity) => (
    String(activity.title || "").trim() &&
    String(activity.location || "").trim() &&
    String(activity.description || "").trim()
  ));
  const reportsComplete = log.activities.every((activity) => (
    getActivityAttachedReports(activity).every((report) => isAttachedReportSubmitReady(report))
  ));
  const canSubmit = activitiesComplete && reportsComplete;
  const attachedReportCount = log.activities.reduce((sum, activity) => sum + getActivityAttachedReports(activity).length, 0);
  const ownershipContext = {
    companyId: log.companyId || log.company_id || log.organizationId || log.organization_id,
    organizationId: log.organizationId || log.organization_id || log.companyId || log.company_id,
    userId: log.userId || log.user_id || log.technicianId || log.technician_id || log.createdBy || log.created_by,
    technicianId: log.technicianId || log.technician_id || log.userId || log.user_id || log.createdBy || log.created_by,
    uploadedBy: log.technicianName || log.technician_name || log.createdByName || log.created_by_name || ""
  };

  useEffect(() => {
    function refreshFromStorage() {
      const latest = getDailyLogById(log.id);
      if (!latest || latest.updatedAt === log.updatedAt) return;
      onChange(latest);
    }

    window.addEventListener("focus", refreshFromStorage);
    window.addEventListener("storage", refreshFromStorage);
    document.addEventListener("visibilitychange", refreshFromStorage);
    return () => {
      window.removeEventListener("focus", refreshFromStorage);
      window.removeEventListener("storage", refreshFromStorage);
      document.removeEventListener("visibilitychange", refreshFromStorage);
    };
  }, [log.id, log.updatedAt, onChange]);

  useEffect(() => {
    let active = true;

    // Derive project number, location, GC, and GC representative from the
    // projects table — same source the Concrete Test Log and the PDF use.
    async function deriveProjectInfo() {
      const projectId = log.projectId || log.project_id;
      if (!projectId) return;
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .maybeSingle();
        if (!active || error || !data) return;
        const fromColumns = (keys) => {
          for (const key of keys) {
            const value = data?.[key];
            if (value != null && String(value).trim() !== "") return String(value).trim();
          }
          return "";
        };
        const derived = {
          projectNumber: fromColumns(["project_number", "number"]) || log.projectNumber || "",
          projectName: fromColumns(["project_name", "name"]) || log.projectName || "",
          projectLocation: fromColumns(["location", "project_location"]) || log.projectLocation || "",
          generalContractor: fromColumns(["gc", "general_contractor", "client_name"]) || log.generalContractor || "",
          gcRepresentative: fromColumns(["gc_rep", "gc_representative", "client_representative"]) || log.gcRepresentative || ""
        };
        const changed = Object.entries(derived).some(([key, value]) => String(log[key] || "") !== String(value || ""));
        if (changed) updateLog(derived);
      } catch (error) {
        console.warn("Unable to derive project information for the Daily Log", error);
      }
    }

    deriveProjectInfo();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.projectId, log.project_id]);

  function updateLog(patch, { persist = true } = {}) {
    // Merge onto the freshest persisted copy, not this closure's render-time
    // log — concurrent async effects (project derive, weather capture) would
    // otherwise clobber each other's fields with stale snapshots.
    const baseline = getDailyLogById(log.id) || log;
    const nextLog = { ...baseline, ...patch, updatedAt: new Date().toISOString() };
    if (persist) {
      const saved = saveDailyLog(nextLog);
      onChange(saved);
      setLastAutosavedAt(new Date().toLocaleTimeString());
      return saved;
    }
    onChange(nextLog);
    return nextLog;
  }

  function selectProject(projectId) {
    const selectedProject = PROJECT_OPTIONS.find((project) => String(project.id) === String(projectId));
    if (!selectedProject) return;
    updateLog({
      projectId: selectedProject.id,
      projectNumber: selectedProject.projectNumber,
      projectName: selectedProject.projectName,
      projectLocation: selectedProject.projectLocation
    });
  }

  function updateActivityField(activityId, patch) {
    updateLog({
      activities: log.activities.map((activity) => (
        activity.id === activityId ? { ...activity, ...patch, updatedAt: new Date().toISOString() } : activity
      ))
    });
  }

  function addActivity() {
    const nextActivity = createActivity({
      title: "",
      type: "General Work Log",
      location: ""
    });
    updateLog({ activities: [...log.activities, nextActivity] });
  }

  function addConcreteReport(activityId) {
    try {
      setReportSectionError("");
      const activity = (log.activities || []).find((item) => item.id === activityId);
      if (getActivityAttachedReports(activity).length >= 1) {
        setReportSectionError("Only one report can be attached to each activity.");
        setReportPickerActivityId("");
        return;
      }
      const createdReport = onCreateConcreteReport?.(log, activityId);
      if (!createdReport) {
        setReportSectionError("Unable to load report section. Please try again.");
        return;
      }
      setReportPickerActivityId("");
    } catch (error) {
      console.error("Concrete report section failed", error);
      setReportSectionError("Unable to load report section. Please try again.");
    }
  }

  function addCompactionReport(activityId) {
    try {
      setReportSectionError("");
      const activity = (log.activities || []).find((item) => item.id === activityId);
      if (getActivityAttachedReports(activity).length >= 1) {
        setReportSectionError("Only one report can be attached to each activity.");
        setReportPickerActivityId("");
        return;
      }
      const createdReport = onCreateCompactionReport?.(log, activityId);
      if (!createdReport) {
        setReportSectionError("Unable to load report section. Please try again.");
        return;
      }
      setReportPickerActivityId("");
    } catch (error) {
      console.error("Compaction report section failed", error);
      setReportSectionError("Unable to load report section. Please try again.");
    }
  }

  function addAsphaltReport(activityId) {
    try {
      setReportSectionError("");
      const activity = (log.activities || []).find((item) => item.id === activityId);
      if (getActivityAttachedReports(activity).length >= 1) {
        setReportSectionError("Only one report can be attached to each activity.");
        setReportPickerActivityId("");
        return;
      }
      const createdReport = onCreateAsphaltReport?.(log, activityId);
      if (!createdReport) {
        setReportSectionError("Unable to load report section. Please try again.");
        return;
      }
      setReportPickerActivityId("");
    } catch (error) {
      console.error("Asphalt report section failed", error);
      setReportSectionError("Unable to load report section. Please try again.");
    }
  }

  function addInfiltrationReport(activityId) {
    try {
      setReportSectionError("");
      const activity = (log.activities || []).find((item) => item.id === activityId);
      if (getActivityAttachedReports(activity).length >= 1) {
        setReportSectionError("Only one report can be attached to each activity.");
        setReportPickerActivityId("");
        return;
      }
      const createdReport = onCreateInfiltrationReport?.(log, activityId);
      if (!createdReport) {
        setReportSectionError("Unable to load report section. Please try again.");
        return;
      }
      setReportPickerActivityId("");
    } catch (error) {
      console.error("Infiltration report section failed", error);
      setReportSectionError("Unable to load report section. Please try again.");
    }
  }

  function addProctorReport(activityId) {
    try {
      setReportSectionError("");
      const activity = (log.activities || []).find((item) => item.id === activityId);
      if (getActivityAttachedReports(activity).length >= 1) {
        setReportSectionError("Only one report can be attached to each activity.");
        setReportPickerActivityId("");
        return;
      }
      const createdReport = onCreateProctorReport?.(log, activityId);
      if (!createdReport) {
        setReportSectionError("Unable to load report section. Please try again.");
        return;
      }
      setReportPickerActivityId("");
    } catch (error) {
      console.error("Proctor report section failed", error);
      setReportSectionError("Unable to load report section. Please try again.");
    }
  }

  function addSamplesReport(activityId) {
    try {
      setReportSectionError("");
      const activity = (log.activities || []).find((item) => item.id === activityId);
      if (getActivityAttachedReports(activity).length >= 1) {
        setReportSectionError("Only one report can be attached to each activity.");
        setReportPickerActivityId("");
        return;
      }
      const createdReport = onCreateSamplesReport?.(log, activityId);
      if (!createdReport) {
        setReportSectionError("Unable to load report section. Please try again.");
        return;
      }
      setReportPickerActivityId("");
    } catch (error) {
      console.error("Samples collection report section failed", error);
      setReportSectionError("Unable to load report section. Please try again.");
    }
  }

  async function removeConcreteReport(activityId, reportId) {
    if (!window.confirm("Are you sure you want to delete this report?")) return;

    const activity = (log.activities || []).find((item) => item.id === activityId);
    const targetReport = getActivityAttachedReports(activity).find((report) => report.id === reportId);
    const isCompactionTarget = isCompactionReport(targetReport);
    const targetKeys = new Set(getReportIdentityKeys(targetReport || { id: reportId }));
    const linkedReportId = targetReport?.linkedReportId || targetReport?.linked_report_id;
    const dfrNumber = String(targetReport?.dfrNumber || targetReport?.dfr_number || targetReport?.reportNumber || "").trim();

    try {
      if (!isCompactionTarget && linkedReportId) {
        const { error } = await supabase
          .from("concrete_test_logs")
          .update({ daily_log_id: null, activity_id: null, source_report_id: null })
          .eq("id", linkedReportId);
        if (error) throw error;
      } else if (!isCompactionTarget && dfrNumber) {
        const { error } = await supabase
          .from("concrete_test_logs")
          .update({ daily_log_id: null, activity_id: null, source_report_id: null })
          .eq("daily_log_id", String(log.id))
          .eq("dfr_number", dfrNumber);
        if (error) throw error;
      }
    } catch (error) {
      console.error("Unable to delete linked Concrete Report", error);
      window.alert("Unable to delete this Concrete Report. Please try again.");
      return;
    }

    updateLog({
      activities: log.activities.map((activity) => {
        const nextReports = dedupeReports(activity.concreteReports || []).filter((report) => {
          const reportKeys = getReportIdentityKeys(report);
          const sameIdentity = reportKeys.some((key) => targetKeys.has(key));
          const sameDfr = dfrNumber && String(report.dfrNumber || report.dfr_number || report.reportNumber || "").trim() === dfrNumber;
          return !sameIdentity && !sameDfr;
        });
        if (nextReports.length === (activity.concreteReports || []).length && activity.id !== activityId) return activity;
        return {
          ...activity,
          concreteReports: nextReports,
          reports: (activity.reports || []).filter((report) => report.id !== reportId),
          _deletedConcreteReportIds: activity.id === activityId
            ? [...(activity._deletedConcreteReportIds || []), reportId, linkedReportId].filter(Boolean)
            : activity._deletedConcreteReportIds,
          _deletedConcreteReportDfrNumbers: activity.id === activityId
            ? [...(activity._deletedConcreteReportDfrNumbers || []), dfrNumber].filter(Boolean)
            : activity._deletedConcreteReportDfrNumbers,
          updatedAt: new Date().toISOString()
        };
      })
    });
  }

  async function addActivityAttachments(activityId, files, attachmentType) {
    const selectedFiles = Array.from(files || []);
    const validFiles = selectedFiles.filter((file) => isAllowedDailyLogAttachment(file, attachmentType));
    const validAttachmentPairs = await Promise.all(
      validFiles.map((file) => createUploadReadyAttachment(file, attachmentType, {
        ...ownershipContext,
        projectId: log.projectId,
        dailyLogId: log.id,
        activityId
      }))
    );
    const validAttachments = validAttachmentPairs.map((item) => item.attachment);

    if (validAttachments.length !== selectedFiles.length) {
      window.alert("Some files were skipped. Only photos, PDF, DOC, DOCX, XLS, and XLSX files up to 25 MB are allowed.");
    }

    if (!validAttachments.length) return;

    const uploadResults = await Promise.all(
      validAttachmentPairs.map(async ({ file, attachment }) => {
        try {
          return { attachment: await uploadDailyLogAttachment(file, attachment), error: null };
        } catch (error) {
          console.error("Unable to upload daily log attachment", error);
          return { attachment: null, error };
        }
      })
    );
    const attachmentsToSave = uploadResults.map((result) => result.attachment).filter(Boolean);
    const failedCount = validAttachmentPairs.length - attachmentsToSave.length;
    if (failedCount > 0) {
      const failedReason = formatUploadFailure(uploadResults.find((result) => result.error)?.error || "Upload failed");
      window.alert(`${failedCount} attachment${failedCount === 1 ? "" : "s"} could not be uploaded. ${failedReason}`);
    }

    if (!attachmentsToSave.length) return;

    // Record metadata in the database (best-effort) so other devices and the
    // QC reviewer can load these attachments without this browser's cache.
    attachmentsToSave.forEach((attachment) => {
      persistDailyLogAttachmentRecord(attachment);
    });

    const currentLog = getDailyLogById(log.id) || log;
    const currentStateActivity = (log.activities || []).find((activity) => activity.id === activityId);
    updateLog({
      ...currentLog,
      activities: (currentLog.activities || []).map((activity) => (
        activity.id === activityId
          ? {
              ...activity,
              attachments: mergeActivityAttachments(
                activity.attachments || [],
                currentStateActivity?.attachments || [],
                attachmentsToSave
              ),
              updatedAt: new Date().toISOString()
            }
          : activity
      ))
    });
  }

  function removeActivityAttachment(activityId, attachmentId) {
    const currentLog = getDailyLogById(log.id) || log;
    const removedAttachment = (currentLog.activities || [])
      .find((activity) => activity.id === activityId)
      ?.attachments?.find((attachment) => attachment.id === attachmentId);
    if (removedAttachment) softDeleteDailyLogAttachmentRecord(removedAttachment);
    updateLog({
      ...currentLog,
      activities: (currentLog.activities || []).map((activity) => (
        activity.id === activityId
          ? {
              ...activity,
              attachments: (activity.attachments || []).filter((attachment) => attachment.id !== attachmentId),
              _deletedAttachmentIds: [
                ...(activity._deletedAttachmentIds || []),
                attachmentId
              ],
              updatedAt: new Date().toISOString()
            }
          : activity
      ))
    });
  }

  function retryActivityAttachment(activityId, attachmentId) {
    const currentLog = getDailyLogById(log.id) || log;
    updateLog({
      ...currentLog,
      activities: (currentLog.activities || []).map((activity) => (
        activity.id === activityId
          ? {
              ...activity,
              attachments: (activity.attachments || []).map((attachment) => (
                attachment.id === attachmentId
                  ? { ...attachment, uploadStatus: "pending_sync", uploadProgress: 100 }
                  : attachment
              )),
              updatedAt: new Date().toISOString()
            }
          : activity
      ))
    });
  }

  function previewAttachment(attachment) {
    const previewUrl = attachment.objectUrl || attachment.previewUrl || attachment.url || "";
    if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer");
  }

  function deleteActivity(activityToDelete) {
    if (!window.confirm("Delete Activity?\n\nThis action cannot be undone.")) return;
    updateLog({
      activities: log.activities.filter((activity) => activity.id !== activityToDelete.id)
    });
  }

  function updateWeatherConditions(patch) {
    updateLog(patch);
  }

  function saveDraft() {
    const saved = saveDailyLog(log);
    onChange(saved);
    setLastAutosavedAt(new Date().toLocaleTimeString());
  }

  async function submitLogWithSignature(signature) {
    if (!signature) {
      window.alert("Please sign before submitting the Daily Log.");
      return false;
    }
    if (isSubmittingLog) return false;
    setIsSubmittingLog(true);
    const latestLog = getDailyLogById(log.id) || log;

    try {
      let signatureRecord;
      try {
        signatureRecord = await withSubmissionTimeout(
          saveDailyLogSignatureToSupabase(latestLog, signature),
          "Signature save timed out. Please try again."
        );
      } catch (error) {
        console.error("Daily Log signature save failed", error);
        window.alert("Signature could not be saved. Please try again.");
        return false;
      }

      const submittedAt = new Date().toISOString();
      const logToSubmit = {
        ...latestLog,
        technicianSignature: signature,
        technician_signature: signature,
        signatureId: signatureRecord.id,
        signature_id: signatureRecord.id,
        submittedBy: signatureRecord.userId,
        submitted_by: signatureRecord.userId,
        submittedAt,
        submitted_at: submittedAt
      };

      let persistedSubmission;
      try {
        persistedSubmission = await withSubmissionTimeout(
          submitDailyLogToSupabase(logToSubmit, {
            signatureId: signatureRecord.id,
            submittedAt,
            submittedBy: signatureRecord.userId
          }),
          "Daily Log status update timed out. Please try again."
        );
      } catch (error) {
        console.error("Daily Log status update failed", error);
        window.alert(`${error?.message || "Daily Log submission failed."}\n\nYour signature was saved. Please try again.`);
        return false;
      }

      let persistedSubmitted;
      try {
        const submitted = submitDailyLog({
          ...logToSubmit,
          supabaseDailyLogId: persistedSubmission.id,
          supabase_daily_log_id: persistedSubmission.id
        });
        persistedSubmitted = getDailyLogById(submitted.id) || submitted;
        onChange(persistedSubmitted);
        onSubmitted?.(persistedSubmitted);
      } catch (error) {
        console.error("Daily Log local save failed after submission", error);
        window.alert("Daily Log was submitted, but it could not be saved on this device. Please refresh the page.");
        return false;
      }

      setSignatureModalOpen(false);
      ensureSubmittedDailyLogView();

      window.setTimeout(() => {
        regenerateDailyLogPdf(persistedSubmitted)
          .then(async (withPdf) => {
            onChange(withPdf);
            try {
              await withSubmissionTimeout(
                updateDailyLogPdfMetadataInSupabase(persistedSubmitted, withPdf),
                "Daily Log PDF metadata update timed out."
              );
            } catch (error) {
              console.warn("Daily Log PDF metadata update failed", error);
            }

            // Email the QC manager for approval with the signed PDF attached
            // (the PDF already renders activity reports and attachment content).
            try {
              let pdfBlob = null;
              let pdfUrl = "";
              const storagePath = withPdf.pdfStoragePath || withPdf.pdf_storage_path;
              const cachedDataUrl = withPdf.pdfDataUrl || withPdf.pdf_data_url;
              if (storagePath) {
                pdfUrl = await createDailyLogPdfSignedUrl(storagePath);
                pdfBlob = await fetch(pdfUrl).then((response) => (response.ok ? response.blob() : null)).catch(() => null);
              } else if (cachedDataUrl) {
                pdfBlob = await fetch(cachedDataUrl).then((response) => response.blob()).catch(() => null);
              }
              if (!pdfBlob) {
                // The review email must carry the PDF — regenerate it in memory
                // (fully hydrated, attachments rendered) if the stored copy
                // could not be fetched.
                pdfBlob = await generateHydratedDailyLogPdfBlob(withPdf).catch((error) => {
                  console.warn("Daily Log PDF in-memory regeneration for email failed", error);
                  return null;
                });
              }
              await sendDailyLogReviewEmail(withPdf, { pdfBlob, pdfUrl });
            } catch (error) {
              console.warn("Daily Log QC review email could not be sent", error);
            }
          })
          .catch((error) => {
            console.warn("Daily Log PDF generation failed after submission", error);
            window.alert("Daily Log submitted successfully. PDF generation failed. Please click Regenerate PDF.");
          });
      }, 0);
      return true;
    } finally {
      setIsSubmittingLog(false);
    }
  }

  async function submitLog(signatureOverride = "") {
    if (isSubmittingLog) return;
    setAttemptedSubmit(true);
    if (!String(log.projectId || log.project_id || log.projectName || log.project_name || "").trim()) {
      window.alert("Select a project before submitting the Daily Log.");
      return;
    }
    if (!String(log.date || log.log_date || "").trim()) {
      window.alert("Select a date before submitting the Daily Log.");
      return;
    }
    if (!String(log.shift || "").trim()) {
      window.alert("Select a shift before submitting the Daily Log.");
      return;
    }
    if (!log.activities.length) {
      window.alert("Add at least one activity before submitting the Daily Log.");
      return;
    }
    if (!activitiesComplete) {
      window.alert("Complete activity name, location, and description for every activity before submitting the Daily Log.");
      return;
    }
    if (!reportsComplete) {
      window.alert("Attached reports must be completed before Daily Log submission.");
      return;
    }
    const explicitSignature = typeof signatureOverride === "string" ? signatureOverride : "";
    if (!explicitSignature) {
      setSignatureModalOpen(true);
      return;
    }
    await submitLogWithSignature(explicitSignature);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (![DAILY_LOG_STATUS.DRAFT, DAILY_LOG_STATUS.ACTIVE].includes(log.status)) return;
      saveDailyLog(log);
      setLastAutosavedAt(new Date().toLocaleTimeString());
    }, 30000);
    return () => window.clearInterval(timer);
  }, [log]);

  useEffect(() => {
    let active = true;

    async function fetchDbConcreteReports() {
      if (!log.id || !log.projectId || !(log.activities || []).length) return;

      const attachedReports = (log.activities || []).flatMap((activity) => [
        ...(activity.concreteReports || []),
        ...(activity.reports || [])
      ]);
      const attachedLinkedIds = new Set(attachedReports.flatMap((report) => (
        [report.linkedReportId, report.linked_report_id].filter(Boolean).map(String)
      )));
      const attachedDfrNumbers = new Set(attachedReports.map((report) => (
        String(report.dfrNumber || report.dfr_number || report.reportNumber || "").trim()
      )).filter(Boolean));

      // Build deleted-report blocklists from every activity so re-deleted records never come back.
      const deletedLinkedIds = new Set(
        (log.activities || []).flatMap((a) => (a._deletedConcreteReportIds || []).map(String))
      );
      const deletedDfrNumbers = new Set(
        (log.activities || []).flatMap((a) =>
          (a._deletedConcreteReportDfrNumbers || []).map((s) => String(s).trim())
        )
      );

      let response = await supabase
        .from("concrete_test_logs")
        .select("id,dfr_number,status,daily_log_id,activity_id,source_report_id,created_at,updated_at")
        .eq("daily_log_id", String(log.id))
        .order("id", { ascending: true });

      const missingLinkColumns = response.error?.code === "42703" || String(response.error?.message || "").includes("does not exist");

      if (missingLinkColumns) {
        console.warn("Concrete report daily log linkage columns are unavailable; skipping DB report hydration to avoid cross-user report leakage.");
        return;
      }

      const { data, error } = response;

      if (!active || error || !Array.isArray(data)) return;

      const dbReports = data
        .filter((report) => {
          const status = String(report.status || "").toLowerCase();
          const dfrNumber = String(report.dfr_number || "").trim();
          return ["generated", "completed"].includes(status) &&
            !attachedLinkedIds.has(String(report.id)) &&
            !attachedDfrNumbers.has(dfrNumber) &&
            !deletedLinkedIds.has(String(report.id)) &&
            !deletedDfrNumbers.has(dfrNumber);
        })
        .map((report) => ({
          id: report.source_report_id || `concrete-report-${report.id}`,
          type: "Concrete Report",
          status: "Completed",
          companyId: ownershipContext.companyId,
          company_id: ownershipContext.companyId,
          organizationId: ownershipContext.organizationId,
          organization_id: ownershipContext.organizationId,
          userId: ownershipContext.userId,
          user_id: ownershipContext.userId,
          technicianId: ownershipContext.technicianId,
          technician_id: ownershipContext.technicianId,
          dfrNumber: report.dfr_number || "",
          linkedReportId: report.id,
          sourceReportId: report.source_report_id || "",
          dailyLogId: report.daily_log_id || log.id,
          daily_log_id: report.daily_log_id || log.id,
          activityId: report.activity_id || "",
          activity_id: report.activity_id || "",
          specifications: {},
          deliveryRecords: [],
          testRecords: [],
          summary: {},
          createdDate: report.created_at || new Date().toISOString(),
          updatedAt: report.updated_at || report.created_at || new Date().toISOString()
        }));

      // Read the freshest persisted activities to avoid overwriting reports added
      // after this effect's closure was captured (e.g. a proctor report just saved).
      const freshLog = getDailyLogById(log.id) || log;

      let needsUpdate = false;
      const nextActivities = (freshLog.activities || []).map((activity, index) => {
        // If this activity already has a non-concrete report (proctor, compaction, asphalt,
        // infiltration) stored in activity.reports, never inject a concrete stub.
        // Also evict any previously-injected empty stubs (no DFR, no specs, no records)
        // so they don't ghost alongside the real report.  Real concrete reports — which
        // always have at least a dfrNumber — are left untouched.
        if ((activity.reports || []).length > 0) {
          // Non-concrete activities (proctor, compaction, asphalt, infiltration) store
          // their report in activity.reports. activity.concreteReports must be empty for
          // these activities — anything there is a stale concrete stub from a prior DB
          // sync. Wipe it unconditionally so it can never ghost in the UI.
          if ((activity.concreteReports || []).length > 0) {
            needsUpdate = true;
            return { ...activity, concreteReports: [], updatedAt: new Date().toISOString() };
          }
          return activity;
        }

        const reportsForActivity = dbReports.filter((report) => (
          report.activityId ? String(report.activityId) === String(activity.id) : index === 0
        ));
        if (!reportsForActivity.length) return activity;
        needsUpdate = true;
        return {
          ...activity,
          concreteReports: dedupeReports([...(activity.concreteReports || []), ...reportsForActivity]),
          updatedAt: new Date().toISOString()
        };
      });

      if (needsUpdate) updateLog({ activities: nextActivities });
    }

    fetchDbConcreteReports().catch((error) => {
      console.error("Unable to fetch Concrete Reports from DB", error);
    });

    return () => {
      active = false;
    };
  }, [attachedReportCount, log.createdAt, log.id, log.projectId]);

  let visibleReportOrdinal = 0;

  return (
    <div className="pb-24 lg:pb-0">
      {/* Sticky header — stays pinned while activities scroll */}
      <div className="sticky top-0 z-20 overflow-hidden rounded-3xl border border-slate-700 border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-4 py-3 shadow-lg sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Field Operations</p>
            <h1 className="mt-0.5 truncate text-xl font-bold text-white sm:text-2xl">
              Daily Field Log
              {log.projectName ? <span className="ml-2 text-base font-semibold text-slate-300">· {log.projectName}</span> : null}
            </h1>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
              {log.date || "No date"} · {String(log.shift || "Day Shift")}
              {lastAutosavedAt ? ` · saved ${lastAutosavedAt}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
              {String(log.status || "draft").replace(/_/g, " ")}
            </span>
            <button type="button" onClick={saveDraft} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-transparent px-3 text-xs font-bold text-white hover:bg-slate-800">
              <Save className="h-3.5 w-3.5" /> Save Draft
            </button>
            <button
              type="button"
              onClick={submitLog}
              disabled={!canSubmit}
              title={canSubmit ? "" : "Add at least one completed activity to submit."}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              <Send className="h-3.5 w-3.5" /> Submit
            </button>
          </div>
        </div>
      </div>

      <section className="mt-2 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <ClipboardList className="h-4 w-4" />
              </span>
              <h2 className="text-base font-bold text-slate-950">Project Summary</h2>
            </div>
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 sm:inline">Derived from project record</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryField label="Project Name">
              <select
                value={log.projectId || ""}
                onChange={(event) => selectProject(event.target.value)}
                className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
              >
              {PROJECT_OPTIONS.map((project) => (
                <option key={project.id} value={project.id}>{project.projectName}</option>
              ))}
              </select>
            </SummaryField>
            <SummaryField label="Project Number">
              <div className={summaryValueClass()}>{log.projectNumber || "-"}</div>
            </SummaryField>
            <SummaryField label="General Contractor">
              <div className={summaryValueClass()}>{log.generalContractor || "Not on file"}</div>
            </SummaryField>
            <SummaryField label="GC Representative">
              <div className={summaryValueClass()}>{log.gcRepresentative || "Not on file"}</div>
            </SummaryField>
            <SummaryField label="Location">
              <div className={summaryValueClass()}>{log.projectLocation || "-"}</div>
            </SummaryField>
            <SummaryField label="Date">
              <input
                type="date"
                value={log.date}
                onChange={(event) => updateLog({ date: event.target.value })}
                className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
              />
            </SummaryField>
            <SummaryField label="Shift">
              <select
                value={log.shift}
                onChange={(event) => updateLog({ shift: event.target.value })}
                className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
              >
                <option>Day Shift</option>
                <option>Night Shift</option>
                <option>Swing Shift</option>
              </select>
            </SummaryField>
            <SummaryField label="Technician">
              <div className={summaryValueClass()}>{log.technicianName || "-"}</div>
            </SummaryField>
          </div>
        </div>
      </section>

      <section className="mt-4">
        <WeatherConditionsCard log={log} onUpdate={updateWeatherConditions} />
      </section>

      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <HardHat className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-950">Activities</h2>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                {log.activities.length} {log.activities.length === 1 ? "activity" : "activities"} recorded
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {log.activities.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center sm:flex-row sm:gap-4 sm:px-5 sm:text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-700">No activities yet</p>
                <p className="text-xs font-semibold text-slate-500">
                  Add an activity to document the work performed. Reports, photos, and files are attached inside each activity.
                </p>
              </div>
              <button
                type="button"
                onClick={addActivity}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-bold text-white hover:bg-blue-600"
              >
                <Plus className="h-4 w-4" /> Add Activity
              </button>
            </div>
          )}
          {log.activities.map((activity, activityIndex) => {
            // Non-concrete activities store their report in activity.reports. Using
            // getActivityAttachedReports would merge in any stale concrete stubs that
            // haven't been cleaned from activity.concreteReports yet, causing them to
            // render as "Concrete Report" alongside the real report.
            const concreteReports = (activity.reports || []).length > 0
              ? [...(activity.reports || [])]
              : getActivityAttachedReports(activity);
            const reportCount = concreteReports.length;
            const titleMissing = attemptedSubmit && !String(activity.title || "").trim();
            const locationMissing = attemptedSubmit && !String(activity.location || "").trim();
            const descriptionMissing = attemptedSubmit && !String(activity.description || "").trim();
            const attachmentList = activity.attachments || [];
            const photoCount = attachmentList.filter((attachment) => String(attachment.attachmentType || attachment.attachment_type || "").toLowerCase().includes("photo")).length;
            const fileCount = attachmentList.length - photoCount;
            return (
              <article key={activity.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-bold text-white">
                      {String(activityIndex + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Activity {activityIndex + 1}</p>
                      <p className="truncate text-sm font-bold text-slate-950">{activity.title || "Untitled activity"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      <FileText className="h-3.5 w-3.5" /> {reportCount} {reportCount === 1 ? "report" : "reports"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      <Camera className="h-3.5 w-3.5" /> {photoCount} {photoCount === 1 ? "photo" : "photos"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      <Paperclip className="h-3.5 w-3.5" /> {fileCount} {fileCount === 1 ? "file" : "files"}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteActivity(activity)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                      aria-label="Delete activity"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
                <div className="p-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Activity Name *" error={titleMissing ? "Activity Name is required." : ""}>
                    <input
                      value={activity.title || ""}
                      onChange={(event) => updateActivityField(activity.id, { title: event.target.value })}
                      className={inputClass(titleMissing)}
                      placeholder="Concrete Placement"
                    />
                  </Field>
                  <Field label="Location *" error={locationMissing ? "Location is required." : ""}>
                    <input
                      value={activity.location || ""}
                      onChange={(event) => updateActivityField(activity.id, { location: event.target.value })}
                      className={inputClass(locationMissing)}
                      placeholder="Tunnel A"
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Description *" error={descriptionMissing ? "Description is required." : ""}>
                      <textarea
                        value={activity.description || ""}
                        onChange={(event) => updateActivityField(activity.id, { description: event.target.value })}
                        rows={4}
                        className={`${inputClass(descriptionMissing)} min-h-28 max-w-full resize-y py-3 leading-6`}
                        placeholder="Document work performed, observations, issues, delays, and field notes."
                      />
                    </Field>
                  </div>
                </div>
                {concreteReports.map((report) => {
                  const asphalt = isAsphaltReport(report);
                  const compaction = !asphalt && isCompactionReport(report);
                  const infiltration = !asphalt && !compaction && isInfiltrationReport(report);
                  const proctor = !asphalt && !compaction && !infiltration && isProctorReport(report);
                  const samples = !asphalt && !compaction && !infiltration && !proctor && isSamplesReport(report);
                  const shouldShowReportContent = asphalt
                    ? hasAsphaltReportContent(report)
                    : compaction
                      ? hasCompactionReportContent(report)
                      : infiltration
                        ? hasInfiltrationReportContent(report)
                        : proctor
                          ? hasProctorReportContent(report)
                          : samples
                            ? hasSamplesReportContent(report)
                            : isAttachedReportSubmitReady(report);
                  visibleReportOrdinal += 1;
                  const reportLabel = `Report ${visibleReportOrdinal}`;
                  const displayReportType = asphalt
                    ? "Asphalt Compaction Report"
                    : compaction
                      ? "Compaction Report"
                      : infiltration
                        ? "Surface Infiltration Rate Report"
                        : proctor
                          ? "One-Point Proctor Report"
                          : samples
                            ? "Samples Collection Report"
                            : "Concrete Report";

                  return (
                    <div key={report.id} className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{reportLabel}</p>
                          <h3 className="mt-1 text-base font-bold text-slate-950">{displayReportType}</h3>
                          <p className="mt-1 text-sm font-semibold text-slate-600">
                            {report.status || "Draft"} • Updated {report.updatedAt ? new Date(report.updatedAt).toLocaleString() : "-"}
                          </p>
                          {attemptedSubmit && !isAttachedReportSubmitReady(report) && (
                            <p className="mt-2 text-sm font-bold text-rose-700">{displayReportType} must be completed before Daily Log submission.</p>
                          )}
                        </div>
                      <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => (
                              asphalt
                                ? onOpenAsphaltReport?.(log, activity.id, report.id, { mode: "edit" })
                                : compaction
                                  ? onOpenCompactionReport?.(log, activity.id, report.id, { mode: "edit" })
                                  : infiltration
                                    ? onOpenInfiltrationReport?.(log, activity.id, report.id, { mode: "edit" })
                                    : proctor
                                      ? onOpenProctorReport?.(log, activity.id, report.id, { mode: "edit" })
                                      : samples
                                        ? onOpenSamplesReport?.(log, activity.id, report.id, { mode: "edit" })
                                        : onOpenConcreteReport?.(log, activity.id, report.id, { mode: "edit" })
                            )}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white"
                          >
                            <Edit className="h-4 w-4" />
                            Edit Report
                          </button>
                          <button type="button" onClick={() => removeConcreteReport(activity.id, report.id)} className="min-h-10 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">Delete Report</button>
                        </div>
                      </div>
                      {shouldShowReportContent && (
                        asphalt
                          ? <AsphaltCompactionReportInlineContent report={report} reportLabel={reportLabel} />
                          : compaction
                            ? <CompactionReportInlineContent report={report} reportLabel={reportLabel} />
                            : infiltration
                              ? <SurfaceInfiltrationReportInlineContent report={report} reportLabel={reportLabel} />
                              : proctor
                                ? <ProctorReportInlineContent report={report} reportLabel={reportLabel} />
                                : samples
                                  ? <SamplesCollectionReportInlineContent report={report} reportLabel={reportLabel} />
                                  : <ConcreteReportInlineContent report={report} reportLabel={reportLabel} />
                      )}
                    </div>
                  );
                })}
                {reportCount === 0 && (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
                          <FileText className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900">No report attached</p>
                          <p className="text-xs font-semibold text-slate-500">Attach a Concrete or Compaction report to document testing for this activity.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReportPickerActivityId(reportPickerActivityId === activity.id ? "" : activity.id)}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-bold text-white hover:bg-blue-600"
                      >
                        <Plus className="h-4 w-4" />
                        Add Report
                      </button>
                    </div>
                  </div>
                )}
                {reportPickerActivityId === activity.id && (
                  <div className="mt-3">
                    <ActivityReportSelector
                      onAddConcreteReport={() => addConcreteReport(activity.id)}
                      onAddCompactionReport={() => addCompactionReport(activity.id)}
                      onAddAsphaltReport={() => addAsphaltReport(activity.id)}
                      onAddInfiltrationReport={() => addInfiltrationReport(activity.id)}
                      onAddProctorReport={() => addProctorReport(activity.id)}
                      onAddSamplesReport={() => addSamplesReport(activity.id)}
                    />
                  </div>
                )}
                {reportSectionError && reportPickerActivityId === activity.id && (
                  <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
                    {reportSectionError}
                  </p>
                )}
                <PhotosAttachmentsSection
                  attachments={activity.attachments || []}
                  onAddFiles={(files, attachmentType) => addActivityAttachments(activity.id, files, attachmentType)}
                  onRemove={(attachmentId) => removeActivityAttachment(activity.id, attachmentId)}
                  onRetry={(attachmentId) => retryActivityAttachment(activity.id, attachmentId)}
                  onPreview={previewAttachment}
                />
                </div>
              </article>
            );
          })}
          {log.activities.length > 0 && (
            <button
              type="button"
              onClick={addActivity}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-300 bg-blue-50/50 text-sm font-bold text-blue-700 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" /> Add Another Activity
            </button>
          )}
        </div>
      </section>

      {log.activities.length > 0 && (
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <MessageSquare className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-950">Comments</h2>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">Issues, delays, safety observations, and follow-up items for this reporting period.</p>
            </div>
          </div>
          <textarea
            value={log.notes || ""}
            onChange={(event) => updateLog({ notes: event.target.value })}
            rows={5}
            placeholder="Document issues, delays, safety observations, site conditions, follow-up items, and other daily comments."
            className={`${inputClass()} mt-4 min-h-32 max-w-full resize-y py-3 leading-6`}
          />
      </section>
      )}

      <div className="mt-4 space-y-4">
        <DailyLogSubmitPanel log={log} canSubmit={canSubmit} onSaveDraft={saveDraft} onSubmit={submitLog} />
      </div>

      <BottomActionBar
        secondaryLabel="Save Draft"
        primaryLabel="Submit Log"
        onSecondary={saveDraft}
        onPrimary={submitLog}
        disabled={!canSubmit}
      />
      <SignatureModal
        open={signatureModalOpen}
        title="Technician Signature"
        description="Sign once to submit the full Daily Field Log for QC manager review."
        value={technicianSignatureDraft}
        onSave={setTechnicianSignatureDraft}
        onClear={() => setTechnicianSignatureDraft("")}
        disabled={isSubmittingLog}
        onClose={() => {
          if (!isSubmittingLog) setSignatureModalOpen(false);
        }}
        onConfirm={async (confirmedSignature) => {
          const signatureToSubmit = confirmedSignature || technicianSignatureDraft;
          if (!signatureToSubmit) {
            window.alert("Please sign before submitting the Daily Log.");
            return;
          }
          setTechnicianSignatureDraft(signatureToSubmit);
          return submitLogWithSignature(signatureToSubmit);
        }}
        autoConfirmOnSave
        signatureActionLabel={isSubmittingLog ? "Submitting Daily Log..." : "Sign & Submit Daily Log"}
      />
    </div>
  );
}
