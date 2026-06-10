import { useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  FileText,
  Pencil,
  MapPin,
  Paperclip,
  Trash2
} from "lucide-react";
import {
  ACTIVITY_STATUS,
  formatActivityStatus
} from "../../services/dailyLogService";
import ActivityPhotoUploader from "./ActivityPhotoUploader";
import ActivityReportSelector from "../reports/ActivityReportSelector";

function statusClass(status) {
  if (status === ACTIVITY_STATUS.COMPLETE) return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === ACTIVITY_STATUS.ISSUE) return "bg-rose-50 text-rose-800 border-rose-200";
  if (status === ACTIVITY_STATUS.IN_PROGRESS) return "bg-blue-50 text-blue-800 border-blue-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function ActivityCard({
  activity,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
  onAddConcreteReport,
  onViewConcreteReport,
  onEditConcreteReport,
  onRemoveConcreteReport
}) {
  const timeRange = `${activity.startTime || "--:--"} - ${activity.endTime || "Open"}`;
  const concreteReports = activity.concreteReports || activity.reports || [];
  const photos = activity.photos || [];
  const attachments = activity.attachments || [];
  const [showReportPicker, setShowReportPicker] = useState(false);

  function handleAddConcreteReport() {
    setShowReportPicker(false);
    onAddConcreteReport(activity.id);
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-3 p-4 text-left sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(activity.status)}`}>
                {formatActivityStatus(activity.status)}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                {timeRange}
              </span>
            </div>
            <h3 className="mt-3 break-words text-lg font-bold text-slate-950">{activity.title}</h3>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-600">
              <MapPin className="h-4 w-4 shrink-0" />
              {activity.location || "Location pending"}
            </p>
          </div>
          {expanded ? <ChevronUp className="h-5 w-5 shrink-0 text-slate-500" /> : <ChevronDown className="h-5 w-5 shrink-0 text-slate-500" />}
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs font-bold text-slate-600 sm:grid-cols-3">
          <span className="inline-flex items-center gap-1 rounded-xl bg-slate-50 px-2 py-2"><Camera className="h-4 w-4" /> {photos.length} photos</span>
          <span className="inline-flex items-center gap-1 rounded-xl bg-slate-50 px-2 py-2"><FileText className="h-4 w-4" /> {concreteReports.length} reports</span>
          <span className="inline-flex items-center gap-1 rounded-xl bg-slate-50 px-2 py-2"><Paperclip className="h-4 w-4" /> {attachments.length} files</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Description</p>
              <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{activity.description || "No description entered."}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Details</p>
              <dl className="mt-2 space-y-2 text-sm font-semibold text-slate-700">
                <div className="flex justify-between gap-3"><dt>Crew</dt><dd>{activity.crewSize || "-"}</dd></div>
                <div className="flex justify-between gap-3"><dt>Equipment</dt><dd>{activity.equipmentUsed || "-"}</dd></div>
                <div className="flex justify-between gap-3"><dt>Material</dt><dd>{activity.materialUsed || "-"}</dd></div>
              </dl>
            </div>
          </div>

          {(concreteReports.length > 0 || showReportPicker) && (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              {showReportPicker && (
                <ActivityReportSelector onAddConcreteReport={handleAddConcreteReport} />
              )}
              {!showReportPicker && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-950">Reports</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">Optional supporting records attached to this activity.</p>
                  </div>
                  <button type="button" onClick={() => setShowReportPicker(true)} className="min-h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">
                    Add Report
                  </button>
                </div>
              )}
            <div className="mt-3 space-y-3">
              {concreteReports.map((report) => (
                <article key={report.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Concrete Report</p>
                      <h4 className="mt-1 text-base font-bold text-slate-950">{report.dfrNumber || "Draft Concrete Report"}</h4>
                      <p className="mt-1 text-sm font-semibold text-slate-600">{report.placementLocation || activity.location || "Placement location pending"}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">{report.status || "Draft"}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-1 gap-2 text-sm font-semibold text-slate-700 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-xs uppercase tracking-[0.14em] text-slate-400">Mix Number</dt><dd>{report.mixNumber || "-"}</dd></div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-xs uppercase tracking-[0.14em] text-slate-400">Ticket Number</dt><dd>{report.ticketNumber || "-"}</dd></div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-xs uppercase tracking-[0.14em] text-slate-400">Truck Number</dt><dd>{report.truckNumber || "-"}</dd></div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-xs uppercase tracking-[0.14em] text-slate-400">Cubic Yards</dt><dd>{report.cubicYards || "-"}</dd></div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-xs uppercase tracking-[0.14em] text-slate-400">Created Date</dt><dd>{report.createdDate ? new Date(report.createdDate).toLocaleDateString() : "-"}</dd></div>
                  </dl>
                  {report.strengthVerificationRequired && (
                    <dl className="mt-3 grid grid-cols-1 gap-2 text-sm font-semibold text-slate-700 sm:grid-cols-3">
                      <div className="rounded-xl bg-amber-50 px-3 py-2"><dt className="text-xs uppercase tracking-[0.14em] text-amber-700">Set Number</dt><dd>{report.setNumber || "-"}</dd></div>
                      <div className="rounded-xl bg-amber-50 px-3 py-2"><dt className="text-xs uppercase tracking-[0.14em] text-amber-700">Lab Samples</dt><dd>{report.labSamples || "-"}</dd></div>
                      <div className="rounded-xl bg-amber-50 px-3 py-2"><dt className="text-xs uppercase tracking-[0.14em] text-amber-700">Field Samples</dt><dd>{report.fieldSamples || "-"}</dd></div>
                    </dl>
                  )}
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button type="button" onClick={() => onViewConcreteReport(report)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800">
                      <Eye className="h-4 w-4" /> View Report
                    </button>
                    <button type="button" onClick={() => onEditConcreteReport(report)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800">
                      <Pencil className="h-4 w-4" /> Edit Report
                    </button>
                    <button type="button" onClick={() => onRemoveConcreteReport(activity.id, report.id)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-3 text-sm font-bold text-rose-700">
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  </div>
                </article>
              ))}
              {!concreteReports.length && <p className="text-sm font-semibold text-slate-500">No Concrete Report attached yet.</p>}
            </div>
          </div>
          )}

          <div className="mt-4">
            <ActivityPhotoUploader photos={photos} attachments={attachments} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button type="button" onClick={() => onEdit(activity)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Edit Activity</button>
            <button type="button" onClick={() => setShowReportPicker(true)} className="min-h-11 rounded-2xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-800">Add Report</button>
            <button type="button" onClick={onDuplicate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">
              <Copy className="h-4 w-4" /> Duplicate
            </button>
            <button type="button" onClick={() => onDelete(activity)} className="min-h-11 rounded-2xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700">Delete Activity</button>
          </div>
        </div>
      )}
    </article>
  );
}
