import { Send } from "lucide-react";
import { formatLogStatus } from "../../services/dailyLogService";

export default function DailyLogSubmitPanel({ log, canSubmit, onSaveDraft, onSubmit }) {
  const totalReports = log.activities.reduce((sum, activity) => sum + (activity.concreteReports?.length || activity.reports?.length || 0), 0);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Submission Summary</p>
      <h2 className="mt-2 text-xl font-bold text-slate-950">Submit Daily Log Once</h2>
      <p className="mt-2 text-sm font-semibold text-slate-600">
        Activities and attached Concrete Reports stay in draft until the entire Daily Field Log is submitted for QC Manager Review.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Status</p>
          <p className="mt-2 text-sm font-bold text-slate-950">{formatLogStatus(log.status)}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Activities</p>
          <p className="mt-2 text-sm font-bold text-slate-950">{log.activities.length}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Concrete Reports</p>
          <p className="mt-2 text-sm font-bold text-slate-950">{totalReports}</p>
        </div>
      </div>
      <div className="mt-4 hidden gap-3 lg:flex">
        <button type="button" onClick={onSaveDraft} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">
          Save Draft
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white"
        >
          <Send className="h-4 w-4" />
          Submit Daily Log
        </button>
      </div>
    </section>
  );
}
