import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { BarChart3, Building2, ListChecks, Plus, ShieldCheck, X } from "lucide-react";
import {
  createCompany,
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
  return (
    <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS_TONES[status] || STATUS_TONES.trial}`}>
      {status}
    </span>
  );
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
  const [detailCompany, setDetailCompany] = useState(null);

  async function refresh() {
    try {
      const rows = await listCompanies();
      setCompanies(rows);
      const usagePairs = await Promise.all(rows.map(async (c) => [c.id, await getCompanyUsage(c.id)]));
      setUsageById(Object.fromEntries(usagePairs));
      setAuditLogs(await fetchAuditLogs({ limit: 50 }));
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
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-4 sm:space-y-5">

        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Platform Administration</h1>
              <p className="mt-0.5 text-[13px] font-medium text-slate-500">QCore SaaS — companies, subscriptions, and usage</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-600 sm:px-4"
            >
              <Plus className="h-4 w-4" />
              <span className="sm:hidden">New Company</span>
              <span className="hidden sm:inline">Create Company</span>
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-slate-200">
            {[
              ["Companies", totals.companies],
              ["Active", totals.active],
              ["Trial", totals.trial],
              ["Suspended", totals.suspended]
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-2.5 sm:block sm:border-b-0 sm:py-3">
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="text-xl font-semibold text-slate-900 sm:mt-1 sm:text-2xl">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</p>}

        {(section === "companies" || section === "subscriptions" || section === "usage" || section === "support" || section === "settings") && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
              <Building2 className="h-5 w-5 text-blue-700" /> Companies
            </h2>
            <div className="mt-3 space-y-3">
              {companies.map((company) => {
                const usage = usageById[company.id] || {};
                const subscription = company.company_subscriptions?.[0] || {};
                const support = activeSupportFor(company.id);
                return (
                  <article key={company.id} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: company.brand_color || "#1d4ed8" }} />
                      <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-950">{company.company_name}</p>
                      <StatusPill status={company.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] font-semibold text-slate-600 sm:grid-cols-4">
                      <p>Users <span className="font-bold text-slate-900">{usage.users ?? "–"}</span></p>
                      <p>Projects <span className="font-bold text-slate-900">{usage.projects ?? "–"}</span></p>
                      <p>Reports <span className="font-bold text-slate-900">{(usage.daily_reports ?? 0) + (usage.field_test_reports ?? 0) + (usage.lab_reports ?? 0)}</span></p>
                      <p>Files <span className="font-bold text-slate-900">{usage.storage_objects ?? "–"}</span></p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-600">
                      <span>Billing: <span className={`font-bold ${subscription.billing_status === "past_due" ? "text-rose-700" : "text-emerald-700"}`}>{subscription.billing_status || "—"}</span></span>
                      <label className="ml-auto inline-flex items-center gap-1.5">
                        Plan
                        <select
                          value={subscription.plan || "trial"}
                          onChange={(event) => changePlan(company, event.target.value)}
                          className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px] font-semibold text-slate-900"
                        >
                          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setDetailCompany(company)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700">
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSupport(company)}
                        className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-bold ${support ? "bg-amber-100 text-amber-800" : "border border-slate-200 bg-white text-slate-700"}`}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {support ? "End Support Access" : "Support Access"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(company)}
                        className={`min-h-9 rounded-lg px-3 text-xs font-bold ${company.status === "suspended" ? "bg-emerald-700 text-white" : "border border-rose-200 bg-white text-rose-700"}`}
                      >
                        {company.status === "suspended" ? "Activate" : "Suspend"}
                      </button>
                    </div>
                  </article>
                );
              })}
              {!companies.length && (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
                  No companies yet. Create the first customer company.
                </p>
              )}
            </div>
          </section>
        )}

        {(section === "audit" || section === "companies") && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-950 sm:text-lg">
              <ListChecks className="h-5 w-5 text-blue-700" /> Audit Logs
            </h2>
            <div className="mt-3 divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex min-w-0 items-baseline justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-slate-900">{log.action}</p>
                    <p className="truncate text-xs font-semibold text-slate-500">{log.entity_type || ""} {log.entity_id ? `· ${String(log.entity_id).slice(0, 12)}` : ""}</p>
                  </div>
                  <p className="shrink-0 whitespace-nowrap text-xs font-semibold text-slate-400">{new Date(log.created_at).toLocaleString()}</p>
                </div>
              ))}
              {!auditLogs.length && <p className="py-3 text-sm font-semibold text-slate-500">No audit events yet.</p>}
            </div>
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
