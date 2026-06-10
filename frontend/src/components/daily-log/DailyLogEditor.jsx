import { useEffect, useState } from "react";
import { Edit, Plus, Save, Send } from "lucide-react";
import ActivityReportSelector from "../reports/ActivityReportSelector";
import ConcreteReportInlineContent from "../reports/ConcreteReportInlineContent";
import BottomActionBar from "../mobile/BottomActionBar";
import SignatureModal from "../SignatureModal";
import PhotosAttachmentsSection, { isAllowedDailyLogAttachment } from "./PhotosAttachmentsSection";
import WeatherConditionsCard from "./WeatherConditionsCard";
import { supabase } from "../../services/supabase";
import {
  createConcreteReport,
  createActivity,
  DAILY_LOG_STATUS,
  getDailyLogById,
  saveDailyLog,
  submitDailyLog
} from "../../services/dailyLogService";
import { regenerateDailyLogPdf } from "../../services/dailyLogPdfService";
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

const requiredConcreteSpecFields = [
  ["mixDesignNumber", "Mix Design Number"],
  ["batchPlantSupplier", "Batch Plant / Supplier"],
  ["slumpSpreadRange", "Slump / Spread Range"],
  ["airContentRange", "Air Content Range"],
  ["temperatureRange", "Temperature Range"]
];

function hasConcreteSpecErrors(report) {
  return requiredConcreteSpecFields.some(([key]) => !String(report?.[key] || "").trim());
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

export default function DailyLogEditor({ log, onChange, onSubmitted, onCreateConcreteReport, onOpenConcreteReport }) {
  const [lastAutosavedAt, setLastAutosavedAt] = useState("");
  const [reportPickerActivityId, setReportPickerActivityId] = useState("");
  const [reportSectionError, setReportSectionError] = useState("");
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [technicianSignatureDraft, setTechnicianSignatureDraft] = useState(log.technicianSignature || log.technician_signature || "");
  const activitiesComplete = log.activities.length > 0 && log.activities.every((activity) => (
    String(activity.title || "").trim() &&
    String(activity.location || "").trim() &&
    String(activity.description || "").trim()
  ));
  const reportsComplete = log.activities.every((activity) => (
    getActivityAttachedReports(activity).every((report) => String(report.status || "").toLowerCase() === "completed")
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

  function updateLog(patch, { persist = true } = {}) {
    const nextLog = { ...log, ...patch, updatedAt: new Date().toISOString() };
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
      title: `Activity ${log.activities.length + 1}`,
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

  async function removeConcreteReport(activityId, reportId) {
    if (!window.confirm("Are you sure you want to delete this report?")) return;

    const activity = (log.activities || []).find((item) => item.id === activityId);
    const targetReport = (activity?.concreteReports || []).find((report) => report.id === reportId);
    const targetKeys = new Set(getReportIdentityKeys(targetReport || { id: reportId }));
    const linkedReportId = targetReport?.linkedReportId || targetReport?.linked_report_id;
    const dfrNumber = String(targetReport?.dfrNumber || targetReport?.dfr_number || targetReport?.reportNumber || "").trim();

    try {
      if (linkedReportId) {
        const { error } = await supabase
          .from("concrete_test_logs")
          .update({ daily_log_id: null, activity_id: null, source_report_id: null })
          .eq("id", linkedReportId);
        if (error) throw error;
      } else if (dfrNumber) {
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

  function updateConcreteReport(activityId, reportId, patch) {
    updateLog({
      activities: log.activities.map((activity) => {
        if (activity.id !== activityId) return activity;
        return {
          ...activity,
          concreteReports: (activity.concreteReports || []).map((report) => (
            report.id === reportId ? { ...report, ...patch, updatedAt: new Date().toISOString() } : report
          )),
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

    const currentLog = getDailyLogById(log.id) || log;
    updateLog({
      ...currentLog,
      activities: (currentLog.activities || []).map((activity) => (
        activity.id === activityId
          ? {
              ...activity,
              attachments: [...(activity.attachments || []), ...attachmentsToSave],
              updatedAt: new Date().toISOString()
            }
          : activity
      ))
    });
  }

  function removeActivityAttachment(activityId, attachmentId) {
    const currentLog = getDailyLogById(log.id) || log;
    updateLog({
      ...currentLog,
      activities: (currentLog.activities || []).map((activity) => (
        activity.id === activityId
          ? {
              ...activity,
              attachments: (activity.attachments || []).filter((attachment) => attachment.id !== attachmentId),
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

  function addReportAttachments(activityId, reportId, files, attachmentType) {
    const validAttachments = files
      .filter((file) => isAllowedDailyLogAttachment(file, attachmentType))
      .map((file) => createAttachmentRecord(file, attachmentType, {
        ...ownershipContext,
        projectId: log.projectId,
        dailyLogId: log.id,
        activityId,
        reportId
      }));

    if (validAttachments.length !== files.length) {
      window.alert("Some files were skipped. Only photos, PDF, DOC, DOCX, XLS, and XLSX files up to 25 MB are allowed.");
    }

    if (validAttachments.length === 0) return;

    updateLog({
      activities: log.activities.map((activity) => {
        if (activity.id !== activityId) return activity;
        return {
          ...activity,
          concreteReports: (activity.concreteReports || []).map((report) => (
            report.id === reportId
              ? { ...report, attachments: [...(report.attachments || []), ...validAttachments], updatedAt: new Date().toISOString() }
              : report
          )),
          updatedAt: new Date().toISOString()
        };
      })
    });
  }

  function removeReportAttachment(activityId, reportId, attachmentId) {
    updateLog({
      activities: log.activities.map((activity) => {
        if (activity.id !== activityId) return activity;
        return {
          ...activity,
          concreteReports: (activity.concreteReports || []).map((report) => (
            report.id === reportId
              ? { ...report, attachments: (report.attachments || []).filter((attachment) => attachment.id !== attachmentId), updatedAt: new Date().toISOString() }
              : report
          )),
          updatedAt: new Date().toISOString()
        };
      })
    });
  }

  function retryReportAttachment(activityId, reportId, attachmentId) {
    updateLog({
      activities: log.activities.map((activity) => {
        if (activity.id !== activityId) return activity;
        return {
          ...activity,
          concreteReports: (activity.concreteReports || []).map((report) => (
            report.id === reportId
              ? {
                  ...report,
                  attachments: (report.attachments || []).map((attachment) => (
                    attachment.id === attachmentId
                      ? { ...attachment, uploadStatus: "pending_sync", uploadProgress: 100 }
                      : attachment
                  )),
                  updatedAt: new Date().toISOString()
                }
              : report
          )),
          updatedAt: new Date().toISOString()
        };
      })
    });
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

  function findExistingTechnicianSignature() {
    const directSignature = log.technicianSignature || log.technician_signature || technicianSignatureDraft;
    if (directSignature) return directSignature;
    return "";
  }

  async function submitLogWithSignature(signature) {
    const logToSubmit = {
      ...log,
      technicianSignature: signature,
      technician_signature: signature
    };
    const submitted = submitDailyLog(logToSubmit);
    onChange(submitted);
    onSubmitted?.(submitted);
    try {
      const withPdf = await regenerateDailyLogPdf(submitted);
      onChange(withPdf);
      onSubmitted?.(withPdf);
    } catch (error) {
      console.warn("Daily Log PDF generation failed after submission", error);
    }
  }

  async function submitLog(signatureOverride = "") {
    setAttemptedSubmit(true);
    if (!activitiesComplete) {
      window.alert("Complete activity name, location, and description for every activity before submitting the Daily Log.");
      return;
    }
    if (!reportsComplete) {
      window.alert("Concrete Report must be completed before Daily Log submission.");
      return;
    }
    const explicitSignature = typeof signatureOverride === "string" ? signatureOverride : "";
    const signature = explicitSignature || findExistingTechnicianSignature();
    if (!signature) {
      setSignatureModalOpen(true);
      return;
    }
    await submitLogWithSignature(signature);
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

      const attachedReports = (log.activities || []).flatMap((activity) => activity.concreteReports || activity.reports || []);
      const attachedLinkedIds = new Set(attachedReports.flatMap((report) => (
        [report.linkedReportId, report.linked_report_id].filter(Boolean).map(String)
      )));
      const attachedDfrNumbers = new Set(attachedReports.map((report) => (
        String(report.dfrNumber || report.dfr_number || report.reportNumber || "").trim()
      )).filter(Boolean));

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
            !attachedDfrNumbers.has(dfrNumber);
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

      if (!dbReports.length) return;

      updateLog({
        activities: (log.activities || []).map((activity, index) => {
          const reportsForActivity = dbReports.filter((report) => (
            report.activityId ? String(report.activityId) === String(activity.id) : index === 0
          ));
          if (!reportsForActivity.length) return activity;
          return {
            ...activity,
            concreteReports: dedupeReports([...(activity.concreteReports || []), ...reportsForActivity]),
            updatedAt: new Date().toISOString()
          };
        })
      });
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
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold text-slate-950 sm:text-3xl">Daily Field Log</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Autosave every 30 seconds {lastAutosavedAt ? `- last saved ${lastAutosavedAt}` : ""}
            </p>
          </div>
          <div className="hidden gap-3 lg:flex">
            <button type="button" onClick={saveDraft} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">
              <Save className="h-4 w-4" /> Save Draft
            </button>
            <button type="button" onClick={submitLog} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white">
              <Send className="h-4 w-4" /> Submit Daily Log
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-950">Project Summary</h2>
            <span className="hidden text-xs font-bold uppercase tracking-[0.14em] text-slate-400 sm:inline">Field Operations</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold text-slate-950">Activities</h2>
        </div>

        <div className="mt-5 space-y-4">
          {log.activities.map((activity) => {
            const concreteReports = dedupeReports(activity.concreteReports || []);
            const reportCount = getActivityAttachedReports(activity).length;
            const titleMissing = attemptedSubmit && !String(activity.title || "").trim();
            const locationMissing = attemptedSubmit && !String(activity.location || "").trim();
            const descriptionMissing = attemptedSubmit && !String(activity.description || "").trim();
            return (
              <article key={activity.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
                        rows={6}
                        className={`${inputClass(descriptionMissing)} min-h-40 py-3 leading-6`}
                        placeholder="Document work performed, observations, issues, delays, and field notes."
                      />
                    </Field>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-bold text-slate-700">Reports Attached: {reportCount}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => deleteActivity(activity)} className="min-h-10 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">Delete</button>
                  </div>
                </div>
                {concreteReports.map((report) => {
                  const reportStatus = String(report.status || "").toLowerCase();
                  const isCompleted = reportStatus === "completed";
                  visibleReportOrdinal += 1;
                  const reportLabel = `Report ${visibleReportOrdinal}`;

                  return (
                    <div key={report.id} className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{reportLabel}</p>
                          <h3 className="mt-1 text-base font-bold text-slate-950">Concrete Report</h3>
                          <p className="mt-1 text-sm font-semibold text-slate-600">
                            {report.status || "Draft"} • Updated {report.updatedAt ? new Date(report.updatedAt).toLocaleString() : "-"}
                          </p>
                          {report.reportNumber && <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{report.reportNumber}</p>}
                          {attemptedSubmit && reportStatus !== "completed" && (
                            <p className="mt-2 text-sm font-bold text-rose-700">Concrete Report must be completed before Daily Log submission.</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenConcreteReport?.(log, activity.id, report.id, { mode: "edit" })}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white"
                          >
                            <Edit className="h-4 w-4" />
                            Edit Report
                          </button>
                          <button type="button" onClick={() => removeConcreteReport(activity.id, report.id)} className="min-h-10 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">Delete Report</button>
                        </div>
                      </div>
                      {isCompleted && <ConcreteReportInlineContent report={report} reportLabel={reportLabel} />}
                    </div>
                  );
                })}
                {reportCount === 0 && (
                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-slate-600">Attach one report to this activity.</p>
                    <button
                      type="button"
                      onClick={() => setReportPickerActivityId(reportPickerActivityId === activity.id ? "" : activity.id)}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800"
                    >
                      <Plus className="h-4 w-4" />
                      Add Report
                    </button>
                  </div>
                )}
                {reportPickerActivityId === activity.id && (
                  <div className="mt-3">
                    <ActivityReportSelector onAddConcreteReport={() => addConcreteReport(activity.id)} />
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
              </article>
            );
          })}
          <button
            type="button"
            onClick={addActivity}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 text-sm font-bold text-white sm:w-auto"
          >
            <Plus className="h-4 w-4" /> Add Activity
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-xl font-bold text-slate-950">Comments</h2>
          <textarea
            value={log.notes || ""}
            onChange={(event) => updateLog({ notes: event.target.value })}
            rows={8}
            placeholder="Document issues, delays, safety observations, site conditions, follow-up items, and other daily comments."
            className={`${inputClass()} mt-4 min-h-44 py-3 leading-6`}
          />
      </section>

      <div className="mt-4 space-y-4">
        <DailyLogSubmitPanel log={log} canSubmit={canSubmit} onSaveDraft={saveDraft} onSubmit={submitLog} />
      </div>

      <BottomActionBar
        secondaryLabel="Save Draft"
        primaryLabel="Submit Log"
        onSecondary={saveDraft}
        onPrimary={submitLog}
        disabled={false}
      />
      <SignatureModal
        open={signatureModalOpen}
        title="Technician Signature"
        description="Sign once to submit the full Daily Field Log for QC manager review."
        value={technicianSignatureDraft}
        onSave={setTechnicianSignatureDraft}
        onClear={() => setTechnicianSignatureDraft("")}
        onClose={() => setSignatureModalOpen(false)}
        onConfirm={(confirmedSignature) => {
          const signatureToSubmit = confirmedSignature || technicianSignatureDraft;
          if (!signatureToSubmit) {
            window.alert("Please sign before submitting the Daily Log.");
            return;
          }
          setTechnicianSignatureDraft(signatureToSubmit);
          setSignatureModalOpen(false);
          submitLog(signatureToSubmit);
        }}
        signatureActionLabel="Save Technician Signature"
      />
    </div>
  );
}
