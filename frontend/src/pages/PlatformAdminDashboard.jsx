import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  BarChart3, Building2, CheckCircle2, Clock, FileStack, FolderKanban,
  HardDrive, ListChecks, Minus, PauseCircle, Plus, ShieldCheck, Trash2, Users, X
} from "lucide-react";
import {
  createCompany,
  deleteCompany,
  endSupportSession,
  getCompanyUsage,
  listCompanies,
  setCompanyStatus,
  setSubscriptionPlan,
  startSupportSession
} from "../services/tenantService";
import { fetchAuditLogs } from "../services/auditLogService";
import { supabase } from "../services/supabase";
import KeyValueList from "../components/mobile/KeyValueList";

const PLANS = ["trial", "starter", "professional", "enterprise"];
const STATUS_TONES = {
  trial: "border-amber-200 bg-amber-50 text-amber-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  suspended: "border-rose-200 bg-rose-50 text-rose-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600"
};

const EMPTY_FORM = {
  companyName: "", legalName: "", primaryContactName: "", primaryContactEmail: "",
  phone: "", address: "", plan: "trial", brandColor: "#1d4ed8", status: "trial"
};

function StatusPill({ status }) {
  const dotTone = {
    trial: "bg-amber-500", active: "bg-emerald-500", suspended: "bg-rose-500", cancelled: "bg-slate-400"
  }[status] || "bg-amber-500";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${STATUS_TONES[status] || STATUS_TONES.trial}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} />
      {status}
    </span>
  );
}

// KPI summary card with a tinted icon chip.
function StatCard({ icon: Icon, label, value, tone }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600"
  };
  return (
    <div className="flex items-center gap-3.5 px-5 py-4">
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.slate}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-2xl font-bold leading-tight text-slate-900">{value}</p>
      </div>
    </div>
  );
}

// Compact metric tile used in the company card cluster.
function MetricTile({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0 leading-tight">
        <p className="text-base font-bold text-slate-900">{value}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
    </div>
  );
}

// Color-codes an audit action by its verb for quick scanning.
function auditTone(action = "") {
  if (/(deleted|suspend|removed|cancel)/i.test(action)) return "bg-rose-400";
  if (/(created|invite|added|claimed|activ)/i.test(action)) return "bg-emerald-400";
  if (/(support|access)/i.test(action)) return "bg-amber-400";
  return "bg-slate-300";
}

export default function PlatformAdminDashboard() {
  const location = useLocation();
  const section = new URLSearchParams(location.search).get("section") || "companies";
  const [companies, setCompanies] = useState([]);
  const [usageById, setUsageById] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);
  const [supportSessions, setSupportSessions] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The audit trail is the compliance record but rarely the daily focus —
  // collapsed by default, expand on demand via the +/- control.
  const [auditOpen, setAuditOpen] = useState(false);
  const [detailCompany, setDetailCompany] = useState(null);

  async function refresh() {
    try {
      const rows = await listCompanies();
      setCompanies(rows);
      const usagePairs = await Promise.all(rows.map(async (c) => [c.id, await getCompanyUsage(c.id)]));
      setUsageById(Object.fromEntries(usagePairs));
      const logs = await fetchAuditLogs({ limit: 50 });
      setAuditLogs(logs);
      const { data: sessions } = await supabase
        .from("platform_support_sessions")
        .select("*")
        .is("ended_at", null);
      setSupportSessions(sessions || []);
    } catch (err) {
      setError(err.message || "Platform data could not be loaded.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    refresh();
  }, []);

  const totals = useMemo(() => ({
    companies: companies.length,
    active: companies.filter((c) => c.status === "active").length,
    trial: companies.filter((c) => c.status === "trial").length,
    suspended: companies.filter((c) => c.status === "suspended").length
  }), [companies]);

  async function submitCreate(event) {
    event.preventDefault();
    if (!form.companyName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await createCompany(form);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setError(err.message || "Company could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(company) {
    const next = company.status === "suspended" ? "active" : "suspended";
    if (!window.confirm(`${next === "suspended" ? "Suspend" : "Activate"} ${company.company_name}?`)) return;
    await setCompanyStatus(company, next);
    await refresh();
  }

  async function changePlan(company, plan) {
    await setSubscriptionPlan(company.id, plan);
    await refresh();
  }

  function activeSupportFor(companyId) {
    return supportSessions.find((s) => s.company_id === companyId);
  }

  async function removeCompany(company) {
    if (company.status === "active") {
      window.alert("This company is active. Suspend or cancel it first, then delete.");
      return;
    }
    const typed = window.prompt(
      `PERMANENTLY delete ${company.company_name}?\n\nFull clean sweep: every project, daily log, field test report, timesheet, uploaded file, and user account belonging to this company will be destroyed. This cannot be undone.\n\nType the company name to confirm:`
    );
    if (typed !== company.company_name) {
      if (typed !== null) window.alert("Name did not match — nothing was deleted.");
      return;
    }
    try {
      const counts = await deleteCompany(company);
      await refresh();
      window.alert(
        `${company.company_name} deleted.\n\nRemoved: ${counts.projects ?? 0} projects, ${counts.daily_reports ?? 0} daily logs, ${counts.field_test_reports ?? 0} field test reports, ${counts.timesheets ?? 0} timesheets, ${counts.storage_files ?? 0} files, ${counts.auth_users ?? 0} user accounts.`
      );
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function toggleSupport(company) {
    const existing = activeSupportFor(company.id);
    if (existing) {
      await endSupportSession(existing);
    } else {
      const reason = window.prompt(`Read-only support access to ${company.company_name} — reason (audited):`);
      if (!reason || !reason.trim()) return;
      await startSupportSession(company.id, reason.trim());
    }
    await refresh();
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-50 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-4 sm:space-y-6">

        <section className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Platform Administration</h1>
            <p className="mt-1 text-[13px] font-medium text-slate-500">QCore SaaS — companies, subscriptions, and usage</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:px-4"
          >
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">Create Company</span>
          </button>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[
            ["Companies", totals.companies, Building2, "slate"],
            ["Active", totals.active, CheckCircle2, "emerald"],
            ["Trial", totals.trial, Clock, "amber"],
            ["Suspended", totals.suspended, PauseCircle, "rose"]
          ].map(([label, value, icon, tone]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <StatCard icon={icon} label={label} value={value} tone={tone} />
            </div>
          ))}
        </section>

        {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</p>}

        {(section === "companies" || section === "subscriptions" || section === "usage" || section === "support" || section === "settings") && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                <Building2 className="h-4 w-4 text-slate-400" /> Companies
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">{companies.length}</span>
              </h2>
            </div>
            <div className="space-y-4">
              {companies.map((company) => {
                const usage = usageById[company.id] || {};
                const subscription = company.company_subscriptions?.[0] || {};
                const support = activeSupportFor(company.id);
                const brand = company.brand_color || "#1d4ed8";
                const reports = (usage.daily_reports ?? 0) + (usage.field_test_reports ?? 0) + (usage.lab_reports ?? 0);
                return (
                  <article key={company.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
                    {/* Header: brand avatar, name, plan/billing, status */}
                    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
                      <span
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white shadow-sm"
                        style={{ background: brand }}
                      >
                        {(company.company_name || "?").charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold text-slate-900">{company.company_name}</p>
                        <p className="mt-0.5 truncate text-[13px] font-medium text-slate-500">
                          <span className="capitalize">{subscription.plan || "trial"}</span> plan
                          <span className="mx-1.5 text-slate-300">·</span>
                          Billing <span className={`font-semibold ${subscription.billing_status === "past_due" ? "text-rose-600" : "text-emerald-600"}`}>{subscription.billing_status || "current"}</span>
                        </p>
                      </div>
                      <StatusPill status={company.status} />
                    </div>

                    {/* Metric tile cluster — contained, doesn't stretch edge-to-edge */}
                    <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-4">
                      <MetricTile icon={Users} label="Users" value={usage.users ?? "–"} />
                      <MetricTile icon={FolderKanban} label="Projects" value={usage.projects ?? "–"} />
                      <MetricTile icon={FileStack} label="Reports" value={reports} />
                      <MetricTile icon={HardDrive} label="Files" value={usage.storage_objects ?? "–"} />
                    </div>

                    {/* Action bar */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                      <button type="button" onClick={() => setDetailCompany(company)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSupport(company)}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition ${support ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {support ? "End Support" : "Support Access"}
                      </button>

                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                          Plan
                          <select
                            value={subscription.plan || "trial"}
                            onChange={(event) => changePlan(company, event.target.value)}
                            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px] font-semibold text-slate-900 capitalize outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          >
                            {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => toggleStatus(company)}
                          className={`min-h-9 rounded-lg px-3 text-xs font-bold transition ${company.status === "suspended" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"}`}
                        >
                          {company.status === "suspended" ? "Activate" : "Suspend"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCompany(company)}
                          disabled={company.status === "active"}
                          title={company.status === "active" ? "Suspend or cancel first, then delete" : "Permanently delete the company and ALL of its records and files"}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
              {!companies.length && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                  <Building2 className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-500">No companies yet. Create the first customer company.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {(section === "audit" || section === "companies") && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setAuditOpen((value) => !value)}
              aria-expanded={auditOpen}
              title={auditOpen ? "Collapse audit logs" : "Expand audit logs"}
              className={`flex w-full items-center gap-2 px-5 py-4 text-left text-sm font-bold uppercase tracking-wide text-slate-500 ${auditOpen ? "border-b border-slate-100" : ""}`}
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-50">
                {auditOpen ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </span>
              <ListChecks className="h-4 w-4 text-slate-400" /> Audit Logs
              {auditLogs.length > 0 && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-slate-600">{auditLogs.length}</span>
              )}
            </button>
            {auditOpen && (
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
              {!auditLogs.length && <p className="px-5 py-4 text-sm font-semibold text-slate-500">No audit events yet.</p>}
            </div>
            )}
          </section>
        )}

        {detailCompany && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
            <div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-950">{detailCompany.company_name}</h3>
                <button type="button" onClick={() => setDetailCompany(null)} className="rounded-full border border-slate-200 p-2 text-slate-600"><X className="h-4 w-4" /></button>
              </div>
              <p className="mt-1 text-xs font-semibold text-amber-700">Read-only company metadata. Tenant report data requires audited support access.</p>
              <KeyValueList className="mt-3" columns={1} items={[
                ["Legal Name", detailCompany.legal_name],
                ["Primary Contact", detailCompany.primary_contact_name],
                ["Contact Email", detailCompany.primary_contact_email],
                ["Phone", detailCompany.phone],
                ["Address", detailCompany.address],
                ["Status", detailCompany.status],
                ["Brand Color", detailCompany.brand_color],
                ["Created", new Date(detailCompany.created_at).toLocaleDateString()]
              ]} />
            </div>
          </div>
        )}

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
            <form onSubmit={submitCreate} className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-950">Create Company</h3>
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-full border border-slate-200 p-2 text-slate-600"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ["companyName", "Company Name *"],
                  ["legalName", "Legal Name"],
                  ["primaryContactName", "Primary Contact Name"],
                  ["primaryContactEmail", "Primary Contact Email"],
                  ["phone", "Phone"],
                  ["address", "Address"]
                ].map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
                    <input
                      type={key === "primaryContactEmail" ? "email" : "text"}
                      value={form[key]}
                      onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                      required={key === "companyName"}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Subscription Plan</span>
                    <select value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold">
                      {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</span>
                    <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold">
                      {["trial", "active", "suspended", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                </div>
                <label className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Branding Color</span>
                  <input type="color" value={form.brandColor} onChange={(event) => setForm({ ...form, brandColor: event.target.value })} className="h-9 w-14 rounded border border-slate-300" />
                </label>
                <p className="text-xs font-semibold text-slate-500">
                  On create: company record, settings, subscription, per-company storage prefix, and a Company Admin invitation for the primary contact.
                </p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setShowCreate(false)} className="min-h-11 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700">Cancel</button>
                <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-blue-700 text-sm font-bold text-white disabled:opacity-50">
                  {busy ? "Creating..." : "Create Company"}
                </button>
              </div>
            </form>
          </div>
        )}

        <p className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <BarChart3 className="h-4 w-4" /> Platform admins see company metadata and usage only — tenant report data stays isolated per company.
        </p>
      </div>
    </div>
  );
}
