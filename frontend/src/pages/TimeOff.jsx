import { useEffect, useMemo, useState } from "react";
import { Plus, X, Loader2, CalendarClock } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  PTO_TYPES, ptoTypeLabel, PTO_STATUS_TONES,
  listPtoPolicies, listMyPtoRequests, createPtoRequest, cancelPtoRequest, computeBalances
} from "../services/ptoService";

// Count business days (Mon–Fri) inclusive between two ISO dates.
function businessDays(start, end) {
  if (!start || !end) return 0;
  const a = new Date(start), b = new Date(end);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  let n = 0;
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) n += 1;
  }
  return n;
}

export default function TimeOff() {
  const { profile } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [pol, reqs] = await Promise.all([listPtoPolicies(), listMyPtoRequests()]);
      setPolicies(pol);
      setRequests(reqs);
    } catch (err) {
      setError(err.message || "Time off could not be loaded.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const balances = useMemo(() => computeBalances(policies, requests), [policies, requests]);

  function openForm() {
    const today = new Date().toISOString().slice(0, 10);
    setForm({ pto_type: "vacation", start_date: today, end_date: today, hours: 8, reason: "", busy: false, err: "" });
  }

  // Keep hours in step with the date range until the user edits hours.
  function setDates(patch) {
    setForm((f) => {
      const next = { ...f, ...patch };
      if (!f._hoursTouched) next.hours = businessDays(next.start_date, next.end_date) * 8;
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.start_date || !form.end_date || new Date(form.end_date) < new Date(form.start_date)) {
      setForm((f) => ({ ...f, err: "Choose a valid date range." })); return;
    }
    if (!(Number(form.hours) > 0)) { setForm((f) => ({ ...f, err: "Enter the number of hours." })); return; }
    setForm((f) => ({ ...f, busy: true, err: "" }));
    try {
      await createPtoRequest({ pto_type: form.pto_type, start_date: form.start_date, end_date: form.end_date, hours: form.hours, reason: form.reason });
      setForm(null);
      await load();
    } catch (err) {
      setForm((f) => ({ ...f, busy: false, err: err.message || "Could not submit the request." }));
    }
  }

  async function cancel(req) {
    if (!window.confirm("Cancel this time-off request?")) return;
    try { await cancelPtoRequest(req); await load(); } catch (err) { window.alert(err.message); }
  }

  const exceedsBalance = form && form.pto_type !== "unpaid" && Number(form.hours) > (balances[form.pto_type]?.available || 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{profile?.full_name || "My"}</p>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Time Off</h1>
        </div>
        <button type="button" onClick={openForm} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800">
          <Plus className="h-4 w-4" /> Request time off
        </button>
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}

      {/* Balances */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PTO_TYPES.filter((t) => t.value !== "unpaid").map((t) => {
          const b = balances[t.value] || { allotment: 0, used: 0, pending: 0, available: 0 };
          return (
            <div key={t.value} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">{t.label}</p>
              <p className="text-2xl font-bold leading-tight text-slate-900">{b.available}<span className="text-sm font-medium text-slate-400"> / {b.allotment} h</span></p>
              <p className="text-[11px] font-medium text-slate-400">{b.used} used{b.pending ? ` · ${b.pending} pending` : ""}</p>
            </div>
          );
        })}
      </div>

      {/* My requests */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-5 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">My requests</h2>
        {loading ? (
          <p className="flex items-center gap-2 px-5 py-6 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>
        ) : requests.length ? (
          <div className="divide-y divide-slate-100">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">{ptoTypeLabel(r.pto_type)} · {r.hours} h</p>
                  <p className="truncate text-xs font-medium text-slate-400">{r.start_date} → {r.end_date}{r.reason ? ` · ${r.reason}` : ""}{r.reviewer_comment ? ` · Note: ${r.reviewer_comment}` : ""}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${PTO_STATUS_TONES[r.status] || PTO_STATUS_TONES.cancelled}`}>{r.status}</span>
                {r.status === "pending" && (
                  <button type="button" onClick={() => cancel(r)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">No time-off requests yet.</p>
        )}
      </section>

      {/* Request modal */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
          <form onSubmit={submit} className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-blue-700" /><h3 className="text-lg font-bold text-slate-900">Request time off</h3></div>
              <button type="button" onClick={() => setForm(null)} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block"><span className="text-xs font-semibold text-slate-600">Type</span>
                <select value={form.pto_type} onChange={(e) => setForm({ ...form, pto_type: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold">
                  {PTO_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="text-xs font-semibold text-slate-600">Start</span>
                  <input type="date" value={form.start_date} onChange={(e) => setDates({ start_date: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" /></label>
                <label className="block"><span className="text-xs font-semibold text-slate-600">End</span>
                  <input type="date" value={form.end_date} onChange={(e) => setDates({ end_date: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" /></label>
              </div>
              <label className="block"><span className="text-xs font-semibold text-slate-600">Hours</span>
                <input type="number" min="0" step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value, _hoursTouched: true })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" /></label>
              {form.pto_type !== "unpaid" && (
                <p className={`text-xs font-medium ${exceedsBalance ? "text-amber-600" : "text-slate-400"}`}>
                  {balances[form.pto_type]?.available || 0} h available{exceedsBalance ? " — this request exceeds your balance." : "."}
                </p>
              )}
              <label className="block"><span className="text-xs font-semibold text-slate-600">Reason (optional)</span>
                <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Family trip" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" /></label>
              {form.err && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{form.err}</p>}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm(null)} className="min-h-11 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={form.busy} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60">
                {form.busy ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</> : "Submit request"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
