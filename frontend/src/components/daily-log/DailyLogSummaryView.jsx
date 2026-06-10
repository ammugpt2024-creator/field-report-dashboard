import { Download, Edit, Eye, RotateCcw } from "lucide-react";
import { DAILY_LOG_STATUS, formatLogStatus } from "../../services/dailyLogService";
import { formatDateTime } from "../../modules/field-engineer/fieldEngineerData";
import { AttachmentRenderer } from "./PhotosAttachmentsSection";
import ConcreteReportInlineContent from "../reports/ConcreteReportInlineContent";

function Value({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
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

function recordBelongsToLogOwner(record, log) {
  return recordMatchesLogCompany(record, log) && recordMatchesLogTechnician(record, log);
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

  const explicitId = ownerKeys
    .map((key) => normalizeId(attachment?.[key]))
    .find(Boolean);

  if (explicitId) return explicitId === expectedId;

  const storagePath = attachmentStoragePath(attachment);
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

function getActivityAttachments(activity, log) {
  const attachments = Array.isArray(activity?.attachments) ? activity.attachments : [];
  const photos = Array.isArray(activity?.photos) ? activity.photos : [];
  return [...attachments, ...photos]
    .filter((attachment) => recordBelongsToLogOwner(attachment, log))
    .filter((attachment) => attachmentBelongsToDailyLog(attachment, log))
    .filter((attachment) => attachmentBelongsToActivity(attachment, activity))
    .filter(hasSubmittedAttachmentSource);
}

function isPhotoAttachment(attachment) {
  const fileName = attachment.fileName || attachment.file_name || attachment.name || "";
  const fileType = attachment.fileType || attachment.file_type || attachment.mimeType || attachment.mime_type || "";
  return attachment.attachmentType === "photo" || attachment.attachment_type === "photo" || fileType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(fileName);
}

function isFileAttachment(attachment) {
  return !isPhotoAttachment(attachment);
}

function AttachmentList({ attachments }) {
  const renderableAttachments = attachments.filter(hasSubmittedAttachmentSource);

  if (!renderableAttachments.length) {
    return <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No photos or attachments added.</p>;
  }

  return (
    <div className="space-y-3">
      {renderableAttachments.map((attachment) => (
        <AttachmentRenderer key={attachment.id} attachment={attachment} />
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

function ConcreteReportSummary({ report, reportIndex = 0, activity, log }) {
  const attachments = getReportAttachments(report)
    .filter((attachment) => recordBelongsToLogOwner(attachment, log))
    .filter((attachment) => attachmentBelongsToDailyLog(attachment, log))
    .filter((attachment) => attachmentBelongsToActivity(attachment, activity))
    .filter((attachment) => attachmentBelongsToReport(attachment, report))
    .filter(hasSubmittedAttachmentSource);
  const reportStatus = String(report.status || "").toLowerCase();
  const logStatus = String(log?.status || "").toLowerCase();
  const finalReportStatuses = ["completed", "submitted", "approved", "finalized"];
  const submittedLogStatuses = [DAILY_LOG_STATUS.SUBMITTED, DAILY_LOG_STATUS.APPROVED, DAILY_LOG_STATUS.RETURNED].map((status) => String(status).toLowerCase());
  const shouldShowReportContent = finalReportStatuses.includes(reportStatus) || submittedLogStatuses.includes(logStatus);
  const reportLabel = `Report ${reportIndex + 1}`;

  return (
    <article className="rounded-2xl border border-blue-100 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{reportLabel}</p>
          <h4 className="mt-1 text-base font-bold text-slate-950">Concrete Report</h4>
        </div>
        <span className="w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{report.status || "Draft"}</span>
      </div>
      {shouldShowReportContent && <ConcreteReportInlineContent report={report} reportLabel={reportLabel} />}
      {attachments.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
      .filter(hasSubmittedAttachmentSource)
  ));
  const photosCount = activityAttachments.filter(isPhotoAttachment).length + reportAttachments.filter(isPhotoAttachment).length;
  const filesCount = activityAttachments.filter(isFileAttachment).length + reportAttachments.filter(isFileAttachment).length;

  return (
    <article className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
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
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
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
  const banner = statusBanner(log);
  const isReturned = log.status === DAILY_LOG_STATUS.RETURNED;
  const isDraft = log.status === DAILY_LOG_STATUS.DRAFT;
  const isApproved = log.status === DAILY_LOG_STATUS.APPROVED;
  const pdfStatus = log.pdfGenerationStatus || log.pdf_generation_status || (log.pdfStoragePath || log.pdf_storage_path ? "generated" : "pending");
  const canHavePdf = log.status === DAILY_LOG_STATUS.SUBMITTED || isApproved || (isReturned && (log.pdfStoragePath || log.pdf_storage_path));
  const hasCachedPdf = Boolean(log.pdfDataUrl || log.pdf_data_url);
  const canUsePdf = canHavePdf && (pdfStatus === "generated" || hasCachedPdf);
  const canRegeneratePdf = canHavePdf && pdfStatus === "failed";

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
              <button type="button" onClick={onRegeneratePdf} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-800">
                <RotateCcw className="h-4 w-4" /> Regenerate PDF
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
            {(log.pdfGenerationFailureReason || log.pdf_generation_failure_reason || log.pdfGenerationError) && (
              <span className="mt-1 block text-xs font-semibold">
                Reason: {log.pdfGenerationFailureReason || log.pdf_generation_failure_reason || log.pdfGenerationError}
              </span>
            )}
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-bold text-slate-950">Daily Log Summary</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Value label="Daily Log Number" value={log.logNumber || log.id} />
          <Value label="Project" value={log.projectName} />
          <Value label="Date" value={log.date} />
          <Value label="Shift" value={log.shift} />
          <Value label="Technician" value={log.technicianName} />
          <Value label="Status" value={formatLogStatus(log.status)} />
          <Value label="Submitted Date" value={log.submittedAt ? formatDateTime(log.submittedAt) : ""} />
        </dl>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-bold text-slate-950">Project Details</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Value label="Project Name" value={log.projectName} />
          <Value label="Project Number" value={log.projectNumber} />
          <Value label="Project Location" value={log.projectLocation} />
        </dl>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-bold text-slate-950">Weather</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Value label="Min Temperature" value={log.minTemperature ? `${log.minTemperature}°F` : ""} />
          <Value label="Max Temperature" value={log.maxTemperature ? `${log.maxTemperature}°F` : ""} />
        </dl>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-bold text-slate-950">Activities</h2>
        <div className="mt-4 space-y-4">
          {(log.activities || []).map((activity, index) => (
            <ActivitySummaryCard key={activity.id} activity={activity} index={index} log={log} />
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
