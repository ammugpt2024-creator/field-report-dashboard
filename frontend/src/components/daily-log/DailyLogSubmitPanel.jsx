import { ClipboardList, FileText, Info, Save, Send } from "lucide-react";
import { formatLogStatus } from "../../services/dailyLogService";

function statusPillClass(statusLabel) {
  const normalized = String(statusLabel || "").toLowerCase();
  if (normalized.includes("approved") || normalized.includes("complete")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (normalized.includes("submit") || normalized.includes("review")) {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }
  if (normalized.includes("return")) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default function DailyLogSubmitPanel({ log, canSubmit, onSaveDraft, onSubmit }) {
  const totalReports = log.activities.reduce((sum, activity) => sum + (activity.concreteReports?.length || activity.reports?.length || 0), 0);
  const statusLabel = formatLogStatus(log.status);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Send className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-950">Review &amp; Submit</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">
              Submitting sends this Daily Field Log to the QC Manager for review. Everything stays editable while it is in draft.
            </p>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <button
            type="button"
            onClick={onSaveDraft}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            <Save className="h-4 w-4" />
            Save Draft
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            <Send className="h-4 w-4" />
            Submit Daily Log
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Status</p>
            <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.08em] ${statusPillClass(statusLabel)}`}>
              {statusLabel}
            </span>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Activities</p>
            <p className="mt-1.5 flex items-center gap-2 text-sm font-bold text-slate-950">
              <ClipboardList className="h-4 w-4 text-slate-400" />
              {log.activities.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Reports</p>
            <p className="mt-1.5 flex items-center gap-2 text-sm font-bold text-slate-950">
              <FileText className="h-4 w-4 text-slate-400" />
              {totalReports}
            </p>
          </div>
        </div>

        {!canSubmit && (
          <p className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Add at least one activity with a name, location, and description — and complete any attached reports — to enable submission.
          </p>
        )}
      </div>
    </section>
  );
}
