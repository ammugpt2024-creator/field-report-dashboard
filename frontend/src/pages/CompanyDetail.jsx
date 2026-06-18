import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, BarChart3, Building2, CreditCard, FileStack, FolderKanban,
  HardDrive, Lock, ListChecks, ShieldCheck, Users, X
} from "lucide-react";
import {
  getCompanyById, getCompanyUsage,
  requestSupportAccess, listSupportSessions, endSupportSession, getSupportRecord,
  SUPPORT_SCOPES, supportScopeLabel
} from "../services/tenantService";
import { fetchAuditLogs } from "../services/auditLogService";
import { planLimits, formatLimit, usageTone, utilization } from "../config/planLimits";

const SUPPORT_STATUS_TONES = {
  requested: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  denied: "bg-rose-50 text-rose-700",
  ended: "bg-slate-100 text-slate-500",
  expired: "bg-slate-100 text-slate-500"
};

const STATUS_TONES = {
  trial: "border-amber-200 bg-amber-50 text-amber-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  suspended: "border-rose-200 bg-rose-50 text-rose-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600"
};

const TABS = [
  ["overview", "Overview", Building2],
  ["usage", "Usage", BarChart3],
  ["billing", "Billing", CreditCard],
  ["support", "Support", ShieldCheck],
  ["audit", "Audit Logs", ListChecks]
];

// An approved grant that hasn't ended or expired.
function isActiveGrant(s) {
  return s.status === "approved" && !s.ended_at && (!s.expires_at || new Date(s.expires_at) > new Date());
}

function auditTone(action = "") {
  if (/(deleted|suspend|removed|cancel)/i.test(action)) return "bg-rose-400";
  if (/(created|invite|added|claimed|activ)/i.test(action)) return "bg-emerald-400";
  if (/(support|access)/i.test(action)) return "bg-amber-400";
  return "bg-slate-300";
}

function MetricTile({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-tight text-slate-900">{value}</p>
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
    </div>
  );
}

function UsageBar({ label, used, limit }) {
  const tone = usageTone(used, limit);
  const frac = utilization(used, limit);
  const bar = { ok: "bg-emerald-500", warn: "bg-amber-500", over: "bg-rose-500", unlimited: "bg-slate-300" }[tone];
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs font-semibold">
        <span className="text-slate-500">{label}</span>
        <span className={tone === "over" ? "text-rose-600" : "text-slate-700"}>{used ?? 0} <span className="text-slate-400">/ {formatLimit(limit)}</span></span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${bar}`} style={{ width: limit == null ? "8%" : `${Math.max(frac * 100, used ? 4 : 0)}%` }} />
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="border-b border-slate-100 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value || "—"}</p>
    </div>
  );
}

export default function CompanyDetail() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [company, setCompany] = useState(null);
  const [usage, setUsage] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);
  const [tab, setTab] = useState(searchParams.get("tab") === "support" ? "support" : "overview");
  const [error, setError] = useState("");

  // Support access state.
  const [sessions, setSessions] = useState([]);
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState(SUPPORT_SCOPES[0].value);
  const [requesting, setRequesting] = useState(false);
  const [viewer, setViewer] = useState(null); // { label, data } | { loading } | { error }

  async function refreshSessions() {
    setSessions(await listSupportSessions(companyId));
  }

  async function submitRequest() {
    if (!reason.trim()) { window.alert("Add a short reason (e.g. the customer's ticket reference)."); return; }
    setRequesting(true);
    try {
      await requestSupportAccess(companyId, scope, reason.trim());
      setReason("");
      await refreshSessions();
    } catch (err) { window.alert(err.message); }
    setRequesting(false);
  }

  async function endGrant(session) {
    if (!window.confirm("End this support session now?")) return;
    try { await endSupportSession(session); await refreshSessions(); }
    catch (err) { window.alert(err.message); }
  }

  async function openReport(session, resource) {
    setViewer({ loading: true, label: resource.label });
    try {
      const data = await getSupportRecord(session.id, resource.id);
      setViewer({ label: resource.label, data });
    } catch (err) {
      setViewer({ label: resource.label, error: err.message });
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [companyRow, usageData, logs] = await Promise.all([
          getCompanyById(companyId),
          getCompanyUsage(companyId),
          fetchAuditLogs({ companyId, limit: 100 })
        ]);
        if (!active) return;
        if (!companyRow) { setError("Company not found."); return; }
        setCompany(companyRow);
        setUsage(usageData || {});
        setAuditLogs(logs);
      } catch (err) {
        if (active) setError(err.message || "Company could not be loaded.");
      }
    })();
    return () => { active = false; };
  }, [companyId]);

  useEffect(() => {
    if (tab !== "support") return;
    let active = true;
    listSupportSessions(companyId).then((rows) => { if (active) setSessions(rows); });
    return () => { active = false; };
  }, [tab, companyId]);

  const subscription = company?.company_subscriptions?.[0] || {};
  const limits = planLimits(subscription.plan || "trial");
  const reports = useMemo(
    () => (usage.daily_reports ?? 0) + (usage.field_test_reports ?? 0) + (usage.lab_reports ?? 0),
    [usage]
  );

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-sm font-semibold text-slate-600">
        {error}
        <button type="button" onClick={() => navigate("/platform-admin")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700">Back to companies</button>
      </div>
    );
  }
  if (!company) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm font-semibold text-slate-500">Loading company…</div>;
  }

  const brand = company.brand_color || "#1d4ed8";

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-50 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1200px] space-y-5">

        <button type="button" onClick={() => navigate("/platform-admin")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Companies
        </button>

        <section className="flex flex-wrap items-center gap-3.5">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white shadow-sm" style={{ background: brand }}>
            {(company.company_name || "?").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{company.company_name}</h1>
            <p className="mt-0.5 truncate text-[13px] font-medium text-slate-500">
              <span className="capitalize">{subscription.plan || "trial"}</span> plan
              <span className="mx-1.5 text-slate-300">·</span>
              Created {new Date(company.created_at).toLocaleDateString()}
            </p>
          </div>
          <span className={`ml-auto inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${STATUS_TONES[company.status] || STATUS_TONES.trial}`}>
            {company.status}
          </span>
        </section>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm scrollbar-hidden">
          {TABS.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-bold transition ${tab === key ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricTile icon={Users} label="Users" value={usage.users ?? "–"} />
              <MetricTile icon={FolderKanban} label="Projects" value={usage.projects ?? "–"} />
              <MetricTile icon={FileStack} label="Reports" value={reports} />
              <MetricTile icon={HardDrive} label="Files" value={usage.storage_objects ?? "–"} />
            </div>
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <h2 className="border-b border-slate-100 px-5 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">Company Information</h2>
              <div className="grid grid-cols-1 gap-x-8 px-5 py-2 sm:grid-cols-2">
                <Field label="Legal Name" value={company.legal_name} />
                <Field label="Primary Contact" value={company.primary_contact_name} />
                <Field label="Contact Email" value={company.primary_contact_email} />
                <Field label="Phone" value={company.phone} />
                <Field label="Address" value={company.address} />
                <Field label="Status" value={company.status} />
              </div>
            </section>
            <p className="flex items-center gap-2 text-xs font-semibold text-amber-700">
              <ShieldCheck className="h-4 w-4 shrink-0" /> User, project, and report records stay isolated per tenant. Detailed lists require an audited support-access session, started from the company list.
            </p>
          </div>
        )}

        {tab === "usage" && (
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">
                <BarChart3 className="h-4 w-4 text-slate-400" /> Usage vs. <span className="capitalize">{limits.label}</span> Plan
              </h2>
              <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
                <UsageBar label="Users" used={usage.users} limit={limits.users} />
                <UsageBar label="Projects" used={usage.projects} limit={limits.projects} />
                <UsageBar label="Reports" used={reports} limit={limits.reports} />
                <UsageBar label="Files" used={usage.storage_objects} limit={null} />
              </div>
            </section>
            <p className="text-xs font-semibold text-slate-400">
              Limits are informational (Phase 2) — usage is shown against the plan's caps but actions are not blocked. Storage shows file count; GB tracking arrives with byte-level usage.
            </p>
          </div>
        )}

        {tab === "billing" && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">Subscription</h2>
            <div className="grid grid-cols-1 gap-x-8 px-5 py-2 sm:grid-cols-2">
              <Field label="Plan" value={<span className="capitalize">{subscription.plan || "trial"}</span>} />
              <Field label="Billing Status" value={subscription.billing_status || "current"} />
              <Field label="Seats" value={subscription.seats} />
              <Field label="Period End" value={subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—"} />
            </div>
            <p className="px-5 pb-4 pt-1 text-xs font-semibold text-slate-400">Plan changes are made from the company list. Invoice history and revenue tracking are planned.</p>
          </section>
        )}

        {tab === "support" && (
          <div className="space-y-4">
            {/* Request access */}
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">
                <ShieldCheck className="h-4 w-4 text-slate-400" /> Request Support Access
              </h2>
              <div className="space-y-3 px-5 py-4">
                <p className="text-[13px] font-medium text-slate-500">
                  Request read-only access to a report type to investigate an issue. The company admin is emailed and must approve and choose exactly which reports to share; sensitive data stays masked.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]">
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Report type</span>
                    <select
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
                    >
                      {SUPPORT_SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Reason</span>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      placeholder="e.g. customer ticket #1234 — report won't open"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={submitRequest}
                  disabled={requesting}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" /> {requesting ? "Requesting…" : `Request ${supportScopeLabel(scope)} access`}
                </button>
              </div>
            </section>

            {/* My sessions */}
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <h2 className="border-b border-slate-100 px-5 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">Access Requests</h2>
              <div className="divide-y divide-slate-100">
                {sessions.map((s) => {
                  const active = isActiveGrant(s);
                  const resources = Array.isArray(s.approved_resources) ? s.approved_resources : [];
                  return (
                    <div key={s.id} className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${SUPPORT_STATUS_TONES[s.status] || "bg-slate-100 text-slate-500"}`}>
                          {s.status}
                        </span>
                        <span className="text-[13px] font-semibold text-slate-700">{supportScopeLabel(s.requested_scope)}</span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-400">{s.reason}</span>
                        {active && s.expires_at && (
                          <span className="shrink-0 text-xs font-semibold text-emerald-600">expires {new Date(s.expires_at).toLocaleString()}</span>
                        )}
                        {active && (
                          <button type="button" onClick={() => endGrant(s)} className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50">End</button>
                        )}
                      </div>
                      {s.status === "approved" && !active && (
                        <p className="mt-1 text-xs font-semibold text-slate-400">This grant has ended or expired.</p>
                      )}
                      {active && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {resources.length === 0 && <p className="text-xs font-semibold text-slate-400">No reports were shared.</p>}
                          {resources.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => openReport(s, r)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                            >
                              <FileStack className="h-3.5 w-3.5" /> {r.label}
                            </button>
                          ))}
                          {!s.unmask && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400"><Lock className="h-3 w-3" /> names &amp; signatures masked</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!sessions.length && <p className="px-5 py-4 text-sm font-semibold text-slate-500">No support requests yet.</p>}
              </div>
            </section>
          </div>
        )}

        {tab === "audit" && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">Company Audit Trail</h2>
            <div className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex min-w-0 items-center gap-3 px-5 py-3">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${auditTone(log.action)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-slate-800">{log.action.replace(/_/g, " ")}</p>
                    <p className="truncate text-xs font-medium text-slate-400">{log.entity_type || ""} {log.entity_id ? `· ${String(log.entity_id).slice(0, 12)}` : ""}</p>
                  </div>
                  <p className="shrink-0 whitespace-nowrap text-xs font-semibold text-slate-400">{new Date(log.created_at).toLocaleString()}</p>
                </div>
              ))}
              {!auditLogs.length && <p className="px-5 py-4 text-sm font-semibold text-slate-500">No audit events for this company yet.</p>}
            </div>
          </section>
        )}

      </div>

      {viewer && <SupportLogViewer viewer={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

// Read-only, masked rendering of a daily log a company approved for support.
// Generic masked renderer for non-daily-log records (field test / lab reports).
function SupportRecordFields({ d }) {
  const LABELS = {
    dfr_number: "DFR #", report_type: "Report type", status: "Status", date_sampled: "Date sampled",
    location: "Location", weather: "Weather", batch_plant: "Batch plant", time_in: "Time in",
    time_out: "Time out", total_quantity_placed: "Quantity placed", technician: "Technician",
    submitted_by: "Submitted by", general_contractor: "General contractor", sub_contractor: "Subcontractor",
    signatures_on_file: "Signatures", report_number: "Report #", sample_id: "Sample ID",
    test_type: "Test type", specimen_date: "Specimen date", break_date: "Break date"
  };
  const skip = new Set(["scope", "id", "title", "specs", "result"]);
  const scalars = Object.entries(d).filter(([k, v]) =>
    !skip.has(k) && v != null && v !== "" && typeof v !== "object");
  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
        {scalars.map(([k, v]) => <Field key={k} label={LABELS[k] || k.replace(/_/g, " ")} value={String(v)} />)}
      </div>
      {d.specs && Object.values(d.specs).some(Boolean) && (
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Specifications</p>
          <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
            {Object.entries(d.specs).filter(([, v]) => v).map(([k, v]) => <Field key={k} label={k.replace(/_/g, " ")} value={String(v)} />)}
          </div>
        </div>
      )}
      {d.result && (
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Result</p>
          <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-700">{JSON.stringify(d.result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function SupportLogViewer({ viewer, onClose }) {
  const d = viewer.data;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-slate-950">{viewer.label}</h3>
            <p className="flex items-center gap-1 text-xs font-semibold text-amber-700"><Lock className="h-3 w-3" /> Read-only support view — sensitive data masked</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full border border-slate-200 p-2 text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        {viewer.loading && <p className="py-8 text-center text-sm font-semibold text-slate-500">Loading…</p>}
        {viewer.error && <p className="py-8 text-center text-sm font-semibold text-rose-700">{viewer.error}</p>}

        {d && d.scope !== "daily_log" && <SupportRecordFields d={d} />}

        {d && d.scope === "daily_log" && (
          <div className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
              <Field label="Date" value={d.log_date} />
              <Field label="Shift" value={d.shift} />
              <Field label="Status" value={d.status} />
              <Field label="Technician" value={d.technician} />
              <Field label="Supervisor" value={d.supervisor_name} />
              <Field label="Signatures on file" value={String(d.signatures_on_file ?? 0)} />
            </div>
            {d.weather && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Weather</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700">
                  {d.weather.condition || d.weather.summary || "—"}
                  {d.weather.temperature != null ? ` · ${d.weather.temperature}°` : ""}
                  {d.weather.humidity != null ? ` · ${d.weather.humidity}% RH` : ""}
                </p>
              </div>
            )}
            {d.site_conditions && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Site Conditions</p>
                <p className="mt-0.5 text-sm font-medium text-slate-700">{d.site_conditions}</p>
              </div>
            )}
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Activities ({(d.activities || []).length})</p>
              <div className="space-y-2">
                {(d.activities || []).map((a, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-sm font-bold text-slate-900">{a.title || a.activity_type || "Activity"}</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {[a.activity_type, a.location, a.start_time && a.end_time ? `${a.start_time}–${a.end_time}` : null, a.crew_size ? `crew ${a.crew_size}` : null].filter(Boolean).join(" · ")}
                    </p>
                    {a.description && <p className="mt-1 text-[13px] text-slate-700">{a.description}</p>}
                    {a.notes && <p className="mt-1 text-[13px] italic text-slate-500">{a.notes}</p>}
                    {(a.equipment_used || a.material_used) && (
                      <p className="mt-1 text-xs font-medium text-slate-400">
                        {a.equipment_used ? `Equipment: ${a.equipment_used}` : ""}{a.equipment_used && a.material_used ? " · " : ""}{a.material_used ? `Material: ${a.material_used}` : ""}
                      </p>
                    )}
                  </div>
                ))}
                {!(d.activities || []).length && <p className="text-sm font-semibold text-slate-400">No activities recorded.</p>}
              </div>
            </div>
            {(d.attachments || []).length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Attachments ({d.attachments.length})</p>
                <ul className="space-y-1">
                  {d.attachments.map((f, i) => (
                    <li key={i} className="text-[13px] font-medium text-slate-600">{f.file_name} <span className="text-slate-400">({f.attachment_type || f.file_type})</span></li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] font-semibold text-slate-400">File contents are not shared in support view.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
