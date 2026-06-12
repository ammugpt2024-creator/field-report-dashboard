import { useEffect, useMemo, useState } from "react";
import { Download, Edit, Eye, FileText, Image as ImageIcon, RotateCcw } from "lucide-react";
import { DAILY_LOG_STATUS, formatLogStatus } from "../../services/dailyLogService";
import { supabase } from "../../services/supabase";
import { formatDateTime } from "../../modules/field-engineer/fieldEngineerData";
import { AttachmentRenderer, formatFileSize } from "./PhotosAttachmentsSection";
import ConcreteReportInlineContent from "../reports/ConcreteReportInlineContent";
import CompactionReportInlineContent from "../reports/CompactionReportInlineContent";

const DAILY_LOG_ATTACHMENT_BUCKET = "daily-log-attachments";

function getDisplayLogNumber(log = {}) {
  const explicit = log.logNumber || log.log_number || log.reportNumber || log.report_number;
  if (explicit && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(explicit))) return explicit;
  const projectPart = String(log.projectNumber || log.project_number || "PROJECT").replace(/[^a-zA-Z0-9_.-]/g, "_");
  const datePart = String(log.date || "").replace(/-/g, "") || "DATE";
  return `DL-${projectPart}-${datePart}`;
}

function Value({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2.5 sm:px-4 sm:py-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-900">{value || "-"}</p>
    </div>
  );
}

function statusBanner(log) {
  if (log.status === DAILY_LOG_STATUS.APPROVED) {
    return {
      title: "Approved",
      detail: `${log.approvedBy || "Manager"}${log.approvedAt ? ` - ${formatDateTime(log.approvedAt)}` : ""}`,
      className: "border-emerald-200 bg-emerald-50 text-emerald-900"
    };
  }
  if (log.status === DAILY_LOG_STATUS.RETURNED) {
    return {
      title: "Returned For Correction",
      detail: "Manager comments require technician updates.",
      className: "border-amber-200 bg-amber-50 text-amber-900"
    };
  }
  if (log.status === DAILY_LOG_STATUS.SUBMITTED) {
    return {
      title: "Submitted",
      detail: "Pending Manager Review",
      className: "border-purple-200 bg-purple-50 text-purple-900"
    };
  }
  return {
    title: "Draft",
    detail: "Continue editing before submission.",
    className: "border-blue-200 bg-blue-50 text-blue-900"
  };
}

function getReportAttachments(report) {
  return report.attachments || [];
}

function attachmentStoragePath(attachment = {}) {
  return attachment.storagePath ||
    attachment.storage_path ||
    attachment.filePath ||
    attachment.file_path ||
    attachment.objectPath ||
    attachment.object_path ||
    attachment.path ||
    "";
}

function attachmentIdentity(attachment = {}) {
  // Storage path is the canonical identity of an uploaded file — the same
  // attachment can appear with different record ids (local cache vs DB row).
  const storagePath = attachmentStoragePath(attachment);
  if (storagePath) return `path:${storagePath}`;

  const explicitId = attachment.id || attachment.attachmentId || attachment.attachment_id;
  if (explicitId) return `id:${explicitId}`;

  const fileName = attachment.fileName || attachment.file_name || attachment.name || "";
  const createdAt = attachment.createdAt || attachment.created_at || attachment.uploadedAt || attachment.uploaded_at || "";
  return `file:${fileName}:${createdAt}`;
}

function uniqueAttachments(attachments) {
  const seen = new Set();
  return attachments.filter((attachment) => {
    const key = attachmentIdentity(attachment);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeAttachmentRow(row = {}) {
  const fileName = row.fileName || row.file_name || row.name || "Attachment";
  const fileType = row.fileType || row.file_type || row.mimeType || row.mime_type || "";
  const attachmentType = row.attachmentType ||
    row.attachment_type ||
    (fileType.startsWith("image/") ? "photo" : "file");
  const storagePath = row.storagePath || row.storage_path || "";
  const storageBucket = row.storageBucket ||
    row.storage_bucket ||
    row.bucket ||
    row.bucketName ||
    row.bucket_name ||
    DAILY_LOG_ATTACHMENT_BUCKET;

  return {
    ...row,
    id: row.id || row.attachmentId || row.attachment_id || storagePath || `${fileName}-${row.created_at || row.createdAt || ""}`,
    companyId: row.companyId || row.company_id,
    company_id: row.company_id || row.companyId,
    projectId: row.projectId || row.project_id,
    project_id: row.project_id || row.projectId,
    dailyLogId: row.dailyLogId || row.daily_log_id,
    daily_log_id: row.daily_log_id || row.dailyLogId,
    activityId: row.activityId || row.activity_id,
    activity_id: row.activity_id || row.activityId,
    reportId: row.reportId || row.report_id,
    report_id: row.report_id || row.reportId,
    userId: row.userId || row.user_id || row.uploaded_by,
    user_id: row.user_id || row.userId || row.uploaded_by,
    technicianId: row.technicianId || row.technician_id || row.uploaded_by,
    technician_id: row.technician_id || row.technicianId || row.uploaded_by,
    uploadedById: row.uploadedById || row.uploaded_by_id || row.uploaded_by,
    uploaded_by_id: row.uploaded_by_id || row.uploadedById || row.uploaded_by,
    fileName,
    file_name: fileName,
    fileType,
    file_type: fileType,
    fileSize: row.fileSize || row.file_size || row.size || 0,
    file_size: row.file_size || row.fileSize || row.size || 0,
    attachmentType,
    attachment_type: attachmentType,
    storagePath,
    storage_path: storagePath,
    storageBucket,
    storage_bucket: storageBucket,
    uploadedAt: row.uploadedAt || row.uploaded_at || row.createdAt || row.created_at,
    uploaded_at: row.uploaded_at || row.uploadedAt || row.created_at || row.createdAt,
    createdAt: row.createdAt || row.created_at,
    created_at: row.created_at || row.createdAt,
    uploadStatus: row.uploadStatus || row.upload_status || "uploaded",
    upload_status: row.upload_status || row.uploadStatus || "uploaded",
    uploaded: row.uploaded ?? true
  };
}

function normalizeId(value) {
  return value == null || value === "" ? "" : String(value);
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function recordMatchesLogCompany(record, log) {
  const expectedIds = [log?.companyId, log?.organizationId].filter(Boolean).map(String);
  const expectedNames = [log?.companyName, log?.organizationName].map(normalizeName).filter(Boolean);
  if (!expectedIds.length && !expectedNames.length) return true;

  const recordIds = [record?.companyId, record?.company_id, record?.organizationId, record?.organization_id].filter(Boolean).map(String);
  const recordNames = [record?.companyName, record?.company_name, record?.organizationName, record?.organization_name].map(normalizeName).filter(Boolean);
  if (recordIds.length) return recordIds.some((id) => expectedIds.includes(id));
  if (recordNames.length) return recordNames.some((name) => expectedNames.includes(name));

  const storagePath = attachmentStoragePath(record);
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
  ].map(normalizeName).filter(Boolean);

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
  ].map(normalizeName).filter(Boolean);

  if (recordIds.length) return recordIds.some((id) => expectedIds.includes(id));
  if (recordNames.length) return recordNames.some((name) => expectedNames.includes(name));
  return true;
}

function storagePathBelongsToDailyLog(record, log) {
  const dailyLogId = normalizeId(log?.id);
  const storagePath = attachmentStoragePath(record);
  return Boolean(dailyLogId && storagePath && storagePath.includes(dailyLogId));
}

function attachmentHasDailyLogEvidence(attachment, log) {
  const dailyLogId = normalizeId(log?.id);
  const explicitDailyLogId = normalizeId(attachment?.dailyLogId || attachment?.daily_log_id);
  const storagePath = attachmentStoragePath(attachment);

  if (!dailyLogId) return false;
  if (explicitDailyLogId) return explicitDailyLogId === dailyLogId;
  return Boolean(storagePath && storagePath.includes(dailyLogId));
}

function attachmentBelongsToKnownLogActivity(attachment, log) {
  const explicitActivityId = normalizeId(attachment?.activityId || attachment?.activity_id);
  if (!explicitActivityId) return false;

  return (Array.isArray(log?.activities) ? log.activities : [])
    .some((activity) => normalizeId(activity?.id) === explicitActivityId);
}

function attachmentBelongsToSubmittedLogScope(attachment, log) {
  return attachmentHasDailyLogEvidence(attachment, log) || attachmentBelongsToKnownLogActivity(attachment, log);
}

function recordBelongsToLogOwner(record, log) {
  if (!recordMatchesLogCompany(record, log)) return false;

  // Submitted attachments persisted in Supabase are scoped by storage path:
  // company/{companyId}/{dailyLogId}/{activityId}/file. If that path contains
  // the current daily log id, it is stronger ownership evidence than optional
  // technician/uploaded_by metadata that can vary between clients.
  if (storagePathBelongsToDailyLog(record, log)) return true;

  return recordMatchesLogTechnician(record, log);
}

function recordBelongsToSubmittedLog(record, log) {
  return recordBelongsToLogOwner(record, log) || attachmentBelongsToKnownLogActivity(record, log);
}

function recordBelongsToDailyLog(record, log) {
  return attachmentMatchesOwner(record, ["dailyLogId", "daily_log_id"], log?.id);
}

function recordBelongsToActivity(record, activity) {
  return attachmentMatchesOwner(record, ["activityId", "activity_id"], activity?.id);
}

function attachmentMatchesOwner(attachment, ownerKeys, ownerId) {
  const expectedId = normalizeId(ownerId);
  if (!expectedId) return true;

  const storagePath = attachmentStoragePath(attachment);
  if (storagePath && storagePath.includes(expectedId)) return true;

  const explicitId = ownerKeys
    .map((key) => normalizeId(attachment?.[key]))
    .find(Boolean);

  if (explicitId) return explicitId === expectedId;

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

function hasSubmittedAttachmentSource(attachment) {
  const durableUrl = attachment.dataUrl ||
    attachment.data_url ||
    attachment.url ||
    attachment.publicUrl ||
    attachment.public_url ||
    attachment.signedUrl ||
    attachment.signed_url ||
    attachment.downloadUrl ||
    attachment.download_url ||
    attachment.fileUrl ||
    attachment.file_url;
  const previewUrl = attachment.previewUrl || attachment.preview_url || attachment.objectUrl || attachment.object_url || "";
  const storagePath = attachmentStoragePath(attachment);

  if (durableUrl) return true;
  if (storagePath) return true;
  return Boolean(previewUrl && !String(previewUrl).startsWith("blob:"));
}

function hasSubmittedAttachmentRecord(attachment = {}) {
  const fileName = attachment.fileName || attachment.file_name || attachment.name || "";
  const fileType = attachment.fileType || attachment.file_type || attachment.mimeType || attachment.mime_type || "";
  const attachmentType = attachment.attachmentType || attachment.attachment_type || "";
  const explicitId = attachment.id || attachment.attachmentId || attachment.attachment_id;

  return Boolean(
    explicitId ||
    fileName ||
    fileType ||
    attachmentType ||
    attachmentStoragePath(attachment) ||
    hasSubmittedAttachmentSource(attachment)
  );
}

function getLogLevelActivityAttachments(log, activity) {
  const expectedActivityId = normalizeId(activity?.id);
  if (!expectedActivityId) return [];

  const logAttachments = Array.isArray(log?.attachments) ? log.attachments : [];
  const logPhotos = Array.isArray(log?.photos) ? log.photos : [];
  const activityCount = Array.isArray(log?.activities) ? log.activities.length : 0;

  return [...logAttachments, ...logPhotos].filter((attachment) => {
    const explicitActivityId = normalizeId(attachment?.activityId || attachment?.activity_id);
    if (explicitActivityId) return explicitActivityId === expectedActivityId;

    const storagePath = attachmentStoragePath(attachment);
    if (storagePath) return storagePath.includes(expectedActivityId);

    return activityCount === 1 && attachmentBelongsToDailyLog(attachment, log);
  });
}

function attachmentBelongsToActivityScope(attachment, activity, log) {
  if (attachmentBelongsToActivity(attachment, activity)) return true;

  const activities = Array.isArray(log?.activities) ? log.activities : [];
  if (activities.length !== 1) return false;

  const explicitActivityId = normalizeId(attachment?.activityId || attachment?.activity_id);
  if (explicitActivityId) return false;

  const dailyLogId = normalizeId(log?.id);
  const storagePath = attachmentStoragePath(attachment);
  if (storagePath && dailyLogId && !storagePath.includes(dailyLogId)) return false;

  return attachmentBelongsToDailyLog(attachment, log);
}

function directActivityAttachmentBelongsToCurrentScope(attachment, activity, log) {
  const dailyLogId = normalizeId(log?.id);
  const activityId = normalizeId(activity?.id);
  const explicitDailyLogId = normalizeId(attachment?.dailyLogId || attachment?.daily_log_id);
  const explicitActivityId = normalizeId(attachment?.activityId || attachment?.activity_id);
  const storagePath = attachmentStoragePath(attachment);

  if (explicitDailyLogId && dailyLogId && explicitDailyLogId !== dailyLogId) return false;
  if (explicitActivityId && activityId && explicitActivityId !== activityId) return false;
  if (storagePath && dailyLogId && !storagePath.includes(dailyLogId)) return false;

  return true;
}

function getActivityAttachments(activity, log) {
  const attachments = Array.isArray(activity?.attachments) ? activity.attachments : [];
  const photos = Array.isArray(activity?.photos) ? activity.photos : [];
  const directActivityAttachments = uniqueAttachments([...attachments, ...photos])
    .filter((attachment) => directActivityAttachmentBelongsToCurrentScope(attachment, activity, log))
    .filter(hasSubmittedAttachmentRecord);

  const logLevelAttachments = getLogLevelActivityAttachments(log, activity)
    .filter((attachment) => recordBelongsToSubmittedLog(attachment, log))
    .filter((attachment) => attachmentBelongsToSubmittedLogScope(attachment, log))
    .filter((attachment) => attachmentBelongsToActivityScope(attachment, activity, log))
    .filter(hasSubmittedAttachmentRecord);

  return uniqueAttachments([...directActivityAttachments, ...logLevelAttachments]);
}

async function readSubmittedAttachmentRows(queryFactory, sourceLabel) {
  let { data, error } = await queryFactory(true);

  if (error && String(error.message || "").toLowerCase().includes("deleted_at")) {
    ({ data, error } = await queryFactory(false));
  }

  if (error) {
    console.warn(`Unable to load submitted daily log attachments by ${sourceLabel}`, error);
    return [];
  }
  return data || [];
}

async function fetchSubmittedLogAttachments(log) {
  const dailyLogId = normalizeId(log?.id);
  const activityIds = uniqueAttachments(
    (Array.isArray(log?.activities) ? log.activities : [])
      .map((activity) => ({ id: normalizeId(activity?.id) }))
      .filter((activity) => activity.id)
  ).map((activity) => activity.id);

  if (!dailyLogId) return [];

  const rowSets = await Promise.all([
    readSubmittedAttachmentRows(
      (withDeletedFilter) => {
        const query = supabase
          .from("daily_log_attachments")
          .select("*")
          .eq("daily_log_id", dailyLogId);

        return withDeletedFilter ? query.is("deleted_at", null) : query;
      },
      "daily log id"
    ),
    readSubmittedAttachmentRows(
      (withDeletedFilter) => {
        const query = supabase
          .from("daily_log_attachments")
          .select("*")
          .ilike("storage_path", `%${dailyLogId}%`);

        return withDeletedFilter ? query.is("deleted_at", null) : query;
      },
      "storage path"
    ),
    ...activityIds.map((activityId) => (
      readSubmittedAttachmentRows(
        (withDeletedFilter) => {
          const query = supabase
            .from("daily_log_attachments")
            .select("*")
            .eq("activity_id", activityId);

          return withDeletedFilter ? query.is("deleted_at", null) : query;
        },
        `activity id ${activityId}`
      )
    ))
  ]);

  return uniqueAttachments(rowSets.flat().map(normalizeAttachmentRow))
    .filter((attachment) => recordBelongsToSubmittedLog(attachment, log))
    .filter((attachment) => attachmentBelongsToSubmittedLogScope(attachment, log))
    .filter(hasSubmittedAttachmentRecord);
}

function isPhotoAttachment(attachment) {
  const fileName = attachment.fileName || attachment.file_name || attachment.name || "";
  const fileType = attachment.fileType || attachment.file_type || attachment.mimeType || attachment.mime_type || "";
  return attachment.attachmentType === "photo" || attachment.attachment_type === "photo" || fileType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(fileName);
}

function isFileAttachment(attachment) {
  return !isPhotoAttachment(attachment);
}

function AttachmentMetadataFallback({ attachment }) {
  const fileName = attachment.fileName || attachment.file_name || attachment.name || "Attachment";
  const fileType = attachment.fileType || attachment.file_type || attachment.mimeType || attachment.mime_type || "";
  const uploadedAt = attachment.uploadedAt || attachment.uploaded_at || attachment.createdAt || attachment.created_at;
  const fileSize = attachment.fileSize || attachment.file_size || attachment.size || 0;
  const details = [
    fileType || (isPhotoAttachment(attachment) ? "Photo" : "File"),
    fileSize ? formatFileSize(fileSize) : "",
    uploadedAt ? formatDateTime(uploadedAt) : ""
  ].filter(Boolean).join(" • ");
  const Icon = isPhotoAttachment(attachment) ? ImageIcon : FileText;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="break-words text-sm font-bold text-slate-950">{fileName}</p>
        {details && <p className="mt-1 text-xs font-semibold text-slate-500">{details}</p>}
        <p className="mt-2 text-xs font-semibold text-amber-700">
          Attachment saved. Inline preview is unavailable for this file.
        </p>
      </div>
    </div>
  );
}

function AttachmentList({ attachments }) {
  const visibleAttachments = attachments.filter(hasSubmittedAttachmentRecord);

  if (!visibleAttachments.length) {
    return <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No photos or attachments added.</p>;
  }

  return (
    <div className="space-y-3">
      {visibleAttachments.map((attachment) => (
        hasSubmittedAttachmentSource(attachment)
          ? <AttachmentRenderer key={attachment.id} attachment={attachment} />
          : <AttachmentMetadataFallback key={attachment.id} attachment={attachment} />
      ))}
    </div>
  );
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

function isCompactionReport(report = {}) {
  const type = String(report.type || report.reportType || report.report_type || "").toLowerCase();
  return type.includes("compaction") || type.includes("density") || type.includes("nuclear");
}

function getCompactionReportStats(report = {}) {
  const records = Array.isArray(report.testRecords) ? report.testRecords : [];
  return records.reduce((stats, record) => {
    const result = String(record.densityResult || record.density_result || "").toLowerCase();
    if (result === "pass") stats.passCount += 1;
    if (result === "fail") stats.failCount += 1;
    if (result === "retest") stats.retestCount += 1;
    return stats;
  }, { testCount: records.length, passCount: 0, failCount: 0, retestCount: 0 });
}

function ConcreteReportSummary({ report, reportIndex = 0, activity, log }) {
  const attachments = getReportAttachments(report)
    .filter((attachment) => recordBelongsToLogOwner(attachment, log))
    .filter((attachment) => attachmentBelongsToDailyLog(attachment, log))
    .filter((attachment) => attachmentBelongsToActivity(attachment, activity))
    .filter((attachment) => attachmentBelongsToReport(attachment, report))
    .filter(hasSubmittedAttachmentRecord);
  const reportStatus = String(report.status || "").toLowerCase();
  const logStatus = String(log?.status || "").toLowerCase();
  const finalReportStatuses = ["completed", "submitted", "approved", "finalized"];
  const submittedLogStatuses = [DAILY_LOG_STATUS.SUBMITTED, DAILY_LOG_STATUS.APPROVED, DAILY_LOG_STATUS.RETURNED].map((status) => String(status).toLowerCase());
  const shouldShowReportContent = finalReportStatuses.includes(reportStatus) || submittedLogStatuses.includes(logStatus);
  const reportLabel = `Report ${reportIndex + 1}`;
  const compaction = isCompactionReport(report);
  const compactionStats = compaction ? getCompactionReportStats(report) : null;
  const pdfUrl = report.pdfUrl || report.pdf_url || report.finalPdfUrl || report.final_pdf_url || report.pdfPublicUrl || report.pdf_public_url || "";
  const pdfAvailable = Boolean(pdfUrl || report.pdfStoragePath || report.pdf_storage_path);

  return (
    <article className="rounded-2xl border border-blue-100 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{reportLabel}</p>
          <h4 className="mt-1 text-base font-bold text-slate-950">{compaction ? "Compaction Report" : "Concrete Report"}</h4>
        </div>
        <span className="w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{report.status || "Draft"}</span>
      </div>
      {compaction && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Value label="Report Type" value="Compaction Report" />
            <Value label="Report Number" value={report.reportNumber || report.report_number} />
            <Value label="Material Type" value={report.materialType || report.material_type} />
            <Value label="Material Name" value={report.materialName || report.material_name} />
            <Value label="Test Count" value={compactionStats.testCount} />
            <Value label="Pass Count" value={compactionStats.passCount} />
            <Value label="Fail Count" value={compactionStats.failCount} />
            <Value label="Retest Count" value={compactionStats.retestCount} />
            <Value label="Photo Count" value={(report.attachments || []).filter((attachment) => String(attachment.attachmentType || attachment.attachment_type || attachment.fileType || attachment.file_type || "").includes("photo") || String(attachment.fileType || attachment.file_type || "").startsWith("image/")).length} />
            <Value label="Attachment Count" value={(report.attachments || []).filter((attachment) => !(String(attachment.attachmentType || attachment.attachment_type || attachment.fileType || attachment.file_type || "").includes("photo") || String(attachment.fileType || attachment.file_type || "").startsWith("image/"))).length} />
            <Value label="PDF Available" value={pdfAvailable ? "Yes" : "No"} />
          </div>
          {pdfUrl && (
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-xl bg-slate-950 px-3 text-xs font-bold text-white">View PDF</a>
              <a href={pdfUrl} download className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800">Download PDF</a>
            </div>
          )}
        </>
      )}
      {shouldShowReportContent && (
        compaction
          ? <CompactionReportInlineContent report={report} reportLabel={reportLabel} />
          : <ConcreteReportInlineContent report={report} reportLabel={reportLabel} />
      )}
      {attachments.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <h4 className="text-base font-bold text-slate-950">Photos & Attachments</h4>
          <div className="mt-3">
            <AttachmentList attachments={attachments} />
          </div>
        </div>
      )}
    </article>
  );
}

function ActivitySummaryCard({ activity, index, log }) {
  const reports = getScopedActivityReports(activity, log);
  const activityAttachments = getActivityAttachments(activity, log);
  const reportAttachments = reports.flatMap((report) => (
    (report.attachments || [])
      .filter((attachment) => recordBelongsToLogOwner(attachment, log))
      .filter((attachment) => attachmentBelongsToDailyLog(attachment, log))
      .filter((attachment) => attachmentBelongsToActivity(attachment, activity))
      .filter((attachment) => attachmentBelongsToReport(attachment, report))
      .filter(hasSubmittedAttachmentRecord)
  ));
  const photosCount = activityAttachments.filter(isPhotoAttachment).length + reportAttachments.filter(isPhotoAttachment).length;
  const filesCount = activityAttachments.filter(isFileAttachment).length + reportAttachments.filter(isFileAttachment).length;

  return (
    <article className="rounded-3xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Activity {index + 1}</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">{activity.title || "Activity"}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-600">{activity.location || "Location pending"}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-600">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{reports.length} reports</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{photosCount} photos</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{filesCount} files</span>
        </div>
      </div>
      <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm font-semibold leading-6 text-slate-700">
        {activity.description || "No description entered."}
      </p>
      <div className="mt-4 space-y-3">
        {reports.map((report, reportIndex) => (
          <ConcreteReportSummary
            key={report.id}
            report={report}
            reportIndex={reportIndex}
            activity={activity}
            log={log}
          />
        ))}
        {!reports.length && <p className="rounded-2xl bg-white p-4 text-sm font-semibold text-slate-500">No report attached.</p>}
      </div>
      {activityAttachments.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
          <h4 className="text-base font-bold text-slate-950">Photos & Attachments</h4>
          <div className="mt-3">
            <AttachmentList attachments={activityAttachments} />
          </div>
        </div>
      )}
    </article>
  );
}

export default function DailyLogSummaryView({ log, onEdit, onViewPdf, onDownloadPdf, onRegeneratePdf }) {
  const [submittedAttachments, setSubmittedAttachments] = useState([]);
  const [isRegeneratingPdf, setIsRegeneratingPdf] = useState(false);
  const activityIdsKey = (log.activities || []).map((activity) => normalizeId(activity?.id)).join("|");
  const hydratedLog = useMemo(() => ({
    ...log,
    attachments: uniqueAttachments([
      ...(Array.isArray(log.attachments) ? log.attachments : []),
      ...submittedAttachments
    ])
  }), [log, submittedAttachments]);

  useEffect(() => {
    let isCurrent = true;

    setSubmittedAttachments([]);
    fetchSubmittedLogAttachments(log).then((attachments) => {
      if (isCurrent) setSubmittedAttachments(attachments);
    });

    return () => {
      isCurrent = false;
    };
  }, [log?.id, log?.updatedAt, log?.submittedAt, activityIdsKey]);

  const banner = statusBanner(hydratedLog);
  const isReturned = hydratedLog.status === DAILY_LOG_STATUS.RETURNED;
  const isDraft = hydratedLog.status === DAILY_LOG_STATUS.DRAFT;
  const isApproved = hydratedLog.status === DAILY_LOG_STATUS.APPROVED;
  const pdfStatus = hydratedLog.pdfGenerationStatus || hydratedLog.pdf_generation_status || (hydratedLog.pdfStoragePath || hydratedLog.pdf_storage_path ? "generated" : "pending");
  const canHavePdf = hydratedLog.status === DAILY_LOG_STATUS.SUBMITTED || isApproved || (isReturned && (hydratedLog.pdfStoragePath || hydratedLog.pdf_storage_path));
  const hasCachedPdf = Boolean(hydratedLog.pdfDataUrl || hydratedLog.pdf_data_url);
  const canUsePdf = canHavePdf && (pdfStatus === "generated" || hasCachedPdf);
  const canRegeneratePdf = canHavePdf && pdfStatus !== "pending" && Boolean(onRegeneratePdf);

  async function handleRegeneratePdf() {
    if (!onRegeneratePdf || isRegeneratingPdf) return;
    setIsRegeneratingPdf(true);
    try {
      await onRegeneratePdf(hydratedLog);
    } finally {
      setIsRegeneratingPdf(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className={`rounded-3xl border p-4 shadow-sm sm:p-5 ${banner.className}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-75">Daily Log Status</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{banner.title}</h1>
            <p className="mt-1 text-sm font-bold">{banner.detail}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(isDraft || isReturned) && (
              <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white">
                <Edit className="h-4 w-4" />
                {isReturned ? "Edit & Resubmit" : "Continue Editing"}
              </button>
            )}
            {isReturned && (
              <span className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-amber-200 bg-white/60 px-4 text-sm font-bold">
                <RotateCcw className="h-4 w-4" />
                Required Corrections
              </span>
            )}
            {canUsePdf && (
              <>
                <button type="button" onClick={onViewPdf} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">
                  <Eye className="h-4 w-4" /> View PDF
                </button>
                <button type="button" onClick={onDownloadPdf} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white">
                  <Download className="h-4 w-4" /> Download PDF
                </button>
              </>
            )}
            {canRegeneratePdf && (
              <button
                type="button"
                onClick={handleRegeneratePdf}
                disabled={isRegeneratingPdf}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw className={`h-4 w-4 ${isRegeneratingPdf ? "animate-spin" : ""}`} />
                {isRegeneratingPdf ? "Regenerating..." : "Regenerate PDF"}
              </button>
            )}
          </div>
        </div>
        {canHavePdf && pdfStatus === "pending" && (
          <p className="mt-4 rounded-2xl border border-blue-200 bg-white/70 p-3 text-sm font-bold">
            PDF is still being generated. Please try again in a few seconds.
          </p>
        )}
        {canHavePdf && pdfStatus === "failed" && (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
            PDF storage configuration issue. Please contact administrator.
            {(hydratedLog.pdfGenerationFailureReason || hydratedLog.pdf_generation_failure_reason || hydratedLog.pdfGenerationError) && (
              <span className="mt-1 block text-xs font-semibold">
                Reason: {hydratedLog.pdfGenerationFailureReason || hydratedLog.pdf_generation_failure_reason || hydratedLog.pdfGenerationError}
              </span>
            )}
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-bold text-slate-950">Daily Log Summary</h2>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <Value label="Daily Log Number" value={getDisplayLogNumber(log)} />
          <Value label="Date" value={log.date} />
          <Value label="Shift" value={log.shift} />
          <Value label="Technician" value={log.technicianName} />
          <Value label="Status" value={formatLogStatus(log.status)} />
          <Value label="Submitted" value={log.submittedAt ? formatDateTime(log.submittedAt) : ""} />
          <Value
            label="Weather"
            value={[
              log.weatherCondition || log.weatherOverride || "",
              log.minTemperature || log.maxTemperature
                ? `Min ${log.minTemperature || "--"}°F / Max ${log.maxTemperature || "--"}°F`
                : ""
            ].filter(Boolean).join(" • ")}
          />
          <Value
            label="Activities / Reports"
            value={`${(hydratedLog.activities || []).length} / ${(hydratedLog.activities || []).reduce((sum, activity) => sum + (activity.concreteReports?.length || activity.reports?.length || 0), 0)}`}
          />
        </dl>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-bold text-slate-950">Project Details</h2>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
          <Value label="Project Name" value={log.projectName} />
          <Value label="Project Number" value={log.projectNumber} />
          <Value label="Project Location" value={log.projectLocation} />
          <Value label="General Contractor" value={log.generalContractor || log.general_contractor || "Not on file"} />
          <Value label="GC Representative" value={log.gcRepresentative || log.gc_representative || "Not on file"} />
          <Value label="Technician" value={log.technicianName} />
        </dl>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-bold text-slate-950">Activities</h2>
        <div className="mt-4 space-y-4">
          {(hydratedLog.activities || []).map((activity, index) => (
            <ActivitySummaryCard key={activity.id} activity={activity} index={index} log={hydratedLog} />
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-bold text-slate-950">Comments</h2>
        <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
          {log.notes || "No comments entered."}
        </p>
        {isReturned && log.managerComments?.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-950">Manager Comments</p>
            <div className="mt-3 space-y-2">
              {log.managerComments.map((comment) => (
                <p key={comment.id} className="rounded-xl bg-white/70 p-3 text-sm font-semibold text-amber-950">
                  {comment.comment}
                </p>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
