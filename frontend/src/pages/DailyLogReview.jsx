import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, MessageSquareWarning } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  approveDailyLog,
  formatActivityStatus,
  formatLogStatus,
  getDailyLogById,
  requestDailyLogRevision
} from "../services/dailyLogService";

function Section({ kicker, title, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">{kicker}</p>
      <h2 className="mt-2 text-xl font-bold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Value({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <dt className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-slate-900">{value || "-"}</dd>
    </div>
  );
}

function sanitizeSummaryHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}

function ConcreteReportPreview({ report }) {
  const attachments = report.attachments || [];
  const photos = attachments.filter((attachment) => attachment.attachmentType === "photo");
  const files = attachments.filter((attachment) => attachment.attachmentType === "file");

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Concrete Report</p>
          <h4 className="mt-1 text-base font-bold text-slate-950">{report.dfrNumber || "Draft Concrete Report"}</h4>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">{report.status || "Draft"}</span>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Value label="Placement Location" value={report.placementLocation} />
        <Value label="Mix Number" value={report.mixNumber} />
        <Value label="Ticket Number" value={report.ticketNumber} />
        <Value label="Truck Number" value={report.truckNumber} />
        <Value label="Cubic Yards" value={report.cubicYards} />
        <Value label="Slump" value={report.slump} />
        <Value label="Air Content" value={report.airContent} />
        <Value label="Concrete Temperature" value={report.concreteTemperature} />
        <Value label="Notes" value={report.notes} />
      </dl>
      {report.strengthVerificationRequired && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">Strength Verification</p>
          <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <Value label="Set Number" value={report.setNumber} />
            <Value label="Lab Samples" value={report.labSamples} />
            <Value label="Field Samples" value={report.fieldSamples} />
            <Value label="Record Result" value={report.recordResult} />
            <Value label="Inspector Notes" value={report.inspectorNotes} />
          </dl>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Photos & Attachments</p>
          {photos.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.map((attachment) => (
                <div key={attachment.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {attachment.previewUrl ? (
                    <img src={attachment.previewUrl} alt="" className="h-28 w-full object-cover" />
                  ) : (
                    <div className="flex h-28 items-center justify-center text-xs font-bold text-slate-400">Photo</div>
                  )}
                  <p className="truncate px-3 py-2 text-xs font-bold text-slate-700">{attachment.fileName}</p>
                </div>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((attachment) => (
                <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="min-w-0 truncate text-sm font-bold text-slate-800">{attachment.fileName}</p>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">{attachment.fileType || "Attachment"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function getActivityAttachments(activity) {
  const reports = activity.concreteReports || activity.reports || [];
  return [
    ...(activity.photos || []).map((attachment) => ({ ...attachment, attachmentType: "photo" })),
    ...(activity.attachments || []).map((attachment) => ({ ...attachment, attachmentType: attachment.attachmentType || "file" })),
    ...reports.flatMap((report) => report.attachments || [])
  ];
}

function WeatherReview({ log }) {
  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
      <Value label="Temperature" value={log.temperature ? `${log.temperature}°F` : ""} />
      <Value label="Humidity" value={log.humidity ? `${log.humidity}%` : ""} />
      <Value label="Wind" value={log.windSpeed ? `${log.windSpeed} mph` : ""} />
      <Value label="Rain Chance" value={log.rainProbability ? `${log.rainProbability}%` : ""} />
      <Value label="Condition" value={log.weatherOverride || log.weatherCondition || log.weather} />
    </dl>
  );
}

export default function DailyLogReview() {
  const { logId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [log, setLog] = useState(() => getDailyLogById(logId));
  const [revisionComment, setRevisionComment] = useState("");
  const reviewerName = profile?.full_name || "Manager";

  const totals = useMemo(() => {
    const activities = log?.activities || [];
    return {
      activities: activities.length,
      reports: activities.reduce((sum, activity) => sum + (activity.concreteReports || activity.reports || []).length, 0),
      photos: activities.reduce((sum, activity) => sum + getActivityAttachments(activity).filter((attachment) => attachment.attachmentType === "photo").length, 0),
      files: activities.reduce((sum, activity) => sum + getActivityAttachments(activity).filter((attachment) => attachment.attachmentType === "file").length, 0)
    };
  }, [log]);

  function approveLog() {
    if (!log) return;
    setLog(approveDailyLog(log, reviewerName));
  }

  function requestRevision() {
    if (!log) return;
    setLog(requestDailyLogRevision(log, revisionComment, reviewerName));
    setRevisionComment("");
  }

  if (!log) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-950">Daily Log not found</h1>
          <button type="button" onClick={() => navigate("/manager/dashboard")} className="mt-4 min-h-11 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white">Back to Manager Dashboard</button>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1400px] space-y-5">
        <section className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm sm:p-7">
          <button type="button" onClick={() => navigate(-1)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-bold text-white">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.28em] text-slate-300">Manager Review</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Daily Field Log Review</h1>
          <p className="mt-2 text-sm font-semibold text-slate-300">{log.projectName} - {log.date} - {formatLogStatus(log.status)}</p>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Value label="Activities" value={totals.activities} />
          <Value label="Reports" value={totals.reports} />
          <Value label="Photos" value={totals.photos} />
          <Value label="Files" value={totals.files} />
        </section>

        <Section kicker="Daily Summary" title="Daily Summary">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Summary</p>
            {log.dailySummary ? (
              <div
                className="prose prose-slate mt-2 max-w-none text-sm font-semibold leading-6 text-slate-700"
                dangerouslySetInnerHTML={{ __html: sanitizeSummaryHtml(log.dailySummary) }}
              />
            ) : (
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">No daily summary entered.</p>
            )}
          </div>
        </Section>

        <Section kicker="Weather" title="Weather Conditions">
          <WeatherReview log={log} />
          {log.weatherCapturedAt && <p className="mt-3 text-sm font-semibold text-slate-500">Captured {new Date(log.weatherCapturedAt).toLocaleString()}</p>}
          {log.weatherOverrideReason && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Override reason: {log.weatherOverrideReason}</p>}
        </Section>

        <Section kicker="Site Conditions" title="Site Conditions Narrative">
          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              {log.siteConditions ? (
                <div
                  className="prose prose-slate max-w-none text-sm font-semibold leading-6 text-slate-700"
                  dangerouslySetInnerHTML={{ __html: sanitizeSummaryHtml(log.siteConditions) }}
                />
              ) : (
                <p className="text-sm font-semibold leading-6 text-slate-700">No site conditions entered.</p>
              )}
            </div>
          </div>
        </Section>

        <Section kicker="Activities" title="Activity Package">
          <div className="space-y-4">
            {log.activities.map((activity, index) => {
              const reports = activity.concreteReports || activity.reports || [];
              return (
                <article key={activity.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Activity {index + 1}</p>
                      <h3 className="mt-1 text-xl font-bold text-slate-950">{activity.title}</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-600">{activity.type} - {activity.location || "Location pending"}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">{formatActivityStatus(activity.status)}</span>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm font-semibold leading-6 text-slate-700">{activity.description || "No description entered."}</p>
                  <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Value label="Crew" value={activity.crewSize} />
                    <Value label="Equipment" value={activity.equipmentUsed} />
                    <Value label="Material" value={activity.materialUsed} />
                  </dl>
                  <div className="mt-4 space-y-3">
                    {reports.map((report) => <ConcreteReportPreview key={report.id} report={report} />)}
                    {!reports.length && <p className="rounded-2xl bg-white p-4 text-sm font-semibold text-slate-500">No report attached to this activity.</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </Section>

        <Section kicker="Manager Actions" title="Approval Decision">
          <textarea
            value={revisionComment}
            onChange={(event) => setRevisionComment(event.target.value)}
            rows={4}
            placeholder="Add manager comments or revision instructions."
            className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
          />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button type="button" onClick={approveLog} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 text-sm font-bold text-white">
              <CheckCircle2 className="h-4 w-4" />
              Approve Daily Log
            </button>
            <button type="button" onClick={requestRevision} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-900">
              <MessageSquareWarning className="h-4 w-4" />
              Request Revision
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
