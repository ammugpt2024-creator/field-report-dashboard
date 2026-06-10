import { Cloud, CloudOff } from "lucide-react";

export default function FieldSyncStatus({ pending = 0, lastSyncedAt = "" }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Field Sync Center</p>
      <h2 className="mt-2 text-xl font-bold text-slate-950">Offline Sync Status</h2>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4 text-emerald-900">
          <span className="flex items-center gap-2 text-sm font-bold"><Cloud className="h-5 w-5" /> Offline saved</span>
          <span className="text-sm font-semibold">Ready</span>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 text-slate-700">
          <span className="flex items-center gap-2 text-sm font-bold"><CloudOff className="h-5 w-5" /> Pending sync</span>
          <span className="text-sm font-semibold">{pending}</span>
        </div>
        <p className="text-sm font-semibold text-slate-500">Last synced: {lastSyncedAt || "Not synced yet"}</p>
      </div>
    </section>
  );
}
