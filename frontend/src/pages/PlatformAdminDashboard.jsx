import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, Building2, CheckCircle2, ChevronDown, ChevronUp, Clock, CreditCard,
  Eye, ListChecks, MoreVertical, PauseCircle, Plus, Search, ShieldCheck, Trash2,
  Users, X
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
import { PLAN_LIMITS, PLAN_ORDER, planLimits, formatLimit, usageTone, utilization } from "../config/planLimits";

const PLANS = ["trial", "starter", "professional", "enterprise"];
const STATUSES = ["active", "trial", "suspended", "cancelled"];
const PAGE_SIZE = 10;
const STATUS_TONES = {
  trial: "border-amber-200 bg-amber-50 text-amber-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  suspended: "border-rose-200 bg-rose-50 text-rose-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600"
};
const STATUS_DOTS = {
  trial: "bg-amber-500", active: "bg-emerald-500", suspended: "bg-rose-500", cancelled: "bg-slate-400"
};

const EMPTY_FORM = {
  companyName: "", legalName: "", primaryContactName: "", primaryContactEmail: "",
  phone: "", address: "", plan: "trial", brandColor: "#1d4ed8", status: "trial"
};

function StatusPill({ status }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${STATUS_TONES[status] || STATUS_TONES.trial}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOTS[status] || STATUS_DOTS.trial}`} />
      {status}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    violet: "bg-violet-50 text-violet-600"
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.slate}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="text-xl font-bold leading-tight text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function auditTone(action = "") {
  if (/(deleted|suspend|removed|cancel)/i.test(action)) return "bg-rose-400";
  if (/(created|invite|added|claimed|activ)/i.test(action)) return "bg-emerald-400";
  if (/(support|access)/i.test(action)) return "bg-amber-400";
  return "bg-slate-300";
}

// Single labelled usage meter: used vs. plan limit, color-coded by headroom.
function UsageBar({ label, used, limit }) {
  const tone = usageTone(used, limit);
  const frac = utilization(used, limit);
  const bar = { ok: "bg-emerald-500", warn: "bg-amber-500", over: "bg-rose-500", unlimited: "bg-slate-300" }[tone];
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs font-semibold">
        <span className="text-slate-500">{label}</span>
        <span className={tone === "over" ? "text-rose-600" : "text-slate-700"}>
          {used ?? 0} <span className="text-slate-400">/ {formatLimit(limit)}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${bar}`} style={{ width: limit == null ? "8%" : `${Math.max(frac * 100, used ? 4 : 0)}%` }} />
      </div>
    </div>
  );
}

// Per-company usage panel (used in the Usage section).
function CompanyUsagePanel({ row }) {
  const { company, plan, users, projects, reports, files } = row;
  const limits = planLimits(plan);
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm" style={{ background: company.brand_color || "#1d4ed8" }}>
          {(company.company_name || "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{company.company_name}</p>
          <p className="text-xs font-semibold capitalize text-slate-400">{limits.label} plan</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UsageBar label="Users" used={users} limit={limits.users} />
        <UsageBar label="Projects" used={projects} limit={limits.projects} />
        <UsageBar label="Reports" used={reports} limit={limits.reports} />
        <UsageBar label="Files" used={files} limit={null} />
      </div>
    </article>
  );
}

// Sortable column header.
function SortHeader({ label, sortKey, active, dir, onSort, align = "left", className = "" }) {
  return (
    <th className={`px-4 py-3 text-${align} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide transition hover:text-slate-700 ${active ? "text-slate-700" : "text-slate-400"}`}
      >
        {label}
        {active && (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}

export default function PlatformAdminDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const section = new URLSearchParams(location.search).get("section") || "companies";
  const [companies, setCompanies] = useState([]);
  const [usageById, setUsageById] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);
  const [supportSessions, setSupportSessions] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);

  // Table controls.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [sortKey, setSortKey] = useState("company");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [menuFor, setMenuFor] = useState(null);

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

  // Per-company enriched rows (usage merged in for sort/filter/display).
  const rows = useMemo(() => companies.map((company) => {
    const usage = usageById[company.id] || {};
    const subscription = company.company_subscriptions?.[0] || {};
    return {
      company,
      subscription,
      plan: subscription.plan || "trial",
      users: usage.users ?? 0,
      projects: usage.projects ?? 0,
      reports: (usage.daily_reports ?? 0) + (usage.field_test_reports ?? 0) + (usage.lab_reports ?? 0),
      files: usage.storage_objects ?? 0
    };
  }), [companies, usageById]);

  const totals = useMemo(() => ({
    companies: companies.length,
    active: companies.filter((c) => c.status === "active").length,
    trial: companies.filter((c) => c.status === "trial").length,
    suspended: companies.filter((c) => c.status === "suspended").length,
    users: rows.reduce((sum, r) => sum + r.users, 0),
    projects: rows.reduce((sum, r) => sum + r.projects, 0),
    reports: rows.reduce((sum, r) => sum + r.reports, 0),
    subscriptions: rows.filter((r) => r.company.status === "active" && r.plan !== "trial").length
  }), [companies, rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = rows.filter((r) => {
      if (statusFilter !== "all" && r.company.status !== statusFilter) return false;
      if (planFilter !== "all" && r.plan !== planFilter) return false;
      if (q) {
        const hay = `${r.company.company_name} ${r.company.primary_contact_email || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const factor = sortDir === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      let av; let bv;
      if (sortKey === "company") { av = a.company.company_name?.toLowerCase() || ""; bv = b.company.company_name?.toLowerCase() || ""; }
      else if (sortKey === "plan" || sortKey === "status") { av = (sortKey === "plan" ? a.plan : a.company.status) || ""; bv = (sortKey === "plan" ? b.plan : b.company.status) || ""; }
      else { av = a[sortKey]; bv = b[sortKey]; }
      if (av < bv) return -1 * factor;
      if (av > bv) return 1 * factor;
      return 0;
    });
    return result;
  }, [rows, search, statusFilter, planFilter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function onSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "company" || key === "plan" || key === "status" ? "asc" : "desc"); }
  }
  function resetPage(setter) {
    return (value) => { setter(value); setPage(1); };
  }

  async function submitCreate(event) {
    event.preventDefault();
    if (!form.companyName.trim()) return;
    setBusy(true);
    try {
      await createCompany(form);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
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

        {/* KPI row */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard icon={Building2} label="Companies" value={totals.companies} tone="slate" />
          <StatCard icon={CheckCircle2} label="Active" value={totals.active} tone="emerald" />
          <StatCard icon={Clock} label="Trial" value={totals.trial} tone="amber" />
          <StatCard icon={PauseCircle} label="Suspended" value={totals.suspended} tone="rose" />
          <StatCard icon={Users} label="Total Users" value={totals.users} tone="blue" />
          <StatCard icon={ListChecks} label="Total Projects" value={totals.projects} tone="violet" />
          <StatCard icon={BarChart3} label="Total Reports" value={totals.reports} tone="slate" />
          <StatCard icon={CreditCard} label="Active Subscriptions" value={totals.subscriptions} tone="emerald" />
        </section>

        {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</p>}

        {(section === "companies") && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                <Building2 className="h-4 w-4 text-slate-400" /> Companies
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-slate-600">{filtered.length}</span>
              </h2>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => resetPage(setSearch)(e.target.value)}
                    placeholder="Search company or contact…"
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-[13px] font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-60"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => resetPage(setStatusFilter)(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px] font-semibold capitalize text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="all">All statuses</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                  value={planFilter}
                  onChange={(e) => resetPage(setPlanFilter)(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px] font-semibold capitalize text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="all">All plans</option>
                  {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <SortHeader label="Company" sortKey="company" active={sortKey === "company"} dir={sortDir} onSort={onSort} />
                    <SortHeader label="Plan" sortKey="plan" active={sortKey === "plan"} dir={sortDir} onSort={onSort} />
                    <SortHeader label="Users" sortKey="users" active={sortKey === "users"} dir={sortDir} onSort={onSort} align="right" />
                    <SortHeader label="Projects" sortKey="projects" active={sortKey === "projects"} dir={sortDir} onSort={onSort} align="right" />
                    <SortHeader label="Reports" sortKey="reports" active={sortKey === "reports"} dir={sortDir} onSort={onSort} align="right" />
                    <SortHeader label="Files" sortKey="files" active={sortKey === "files"} dir={sortDir} onSort={onSort} align="right" />
                    <SortHeader label="Status" sortKey="status" active={sortKey === "status"} dir={sortDir} onSort={onSort} />
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(({ company, plan, users, projects, reports, files }) => {
                    const support = activeSupportFor(company.id);
                    return (
                      <tr key={company.id} className="border-b border-slate-50 transition hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => navigate(`/platform-admin/company/${company.id}`)} className="flex items-center gap-3 text-left">
                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm" style={{ background: company.brand_color || "#1d4ed8" }}>
                              {(company.company_name || "?").charAt(0).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-bold text-slate-900 hover:text-blue-700">{company.company_name}</span>
                              <span className="block truncate text-xs font-medium text-slate-400">{company.primary_contact_email || "—"}</span>
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={plan}
                            onChange={(e) => changePlan(company, e.target.value)}
                            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold capitalize text-slate-900 outline-none focus:border-blue-500"
                          >
                            {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">{users}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">{projects}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">{reports}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">{files}</td>
                        <td className="px-4 py-3"><StatusPill status={company.status} /></td>
                        <td className="px-4 py-3">
                          <div className="relative flex justify-end">
                            <button
                              type="button"
                              onClick={() => setMenuFor(menuFor === company.id ? null : company.id)}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-slate-500 transition hover:bg-slate-50 ${support ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white"}`}
                              title="Actions"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {menuFor === company.id && (
                              <>
                                <button type="button" aria-label="Close menu" onClick={() => setMenuFor(null)} className="fixed inset-0 z-30 cursor-default" />
                                <div className="absolute right-0 top-9 z-40 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                                  <RowAction icon={Eye} label="View details" onClick={() => { setMenuFor(null); navigate(`/platform-admin/company/${company.id}`); }} />
                                  <RowAction icon={ShieldCheck} label={support ? "End support access" : "Support access"} onClick={() => { setMenuFor(null); toggleSupport(company); }} />
                                  <RowAction
                                    icon={company.status === "suspended" ? CheckCircle2 : PauseCircle}
                                    label={company.status === "suspended" ? "Activate" : "Suspend"}
                                    onClick={() => { setMenuFor(null); toggleStatus(company); }}
                                  />
                                  <div className="my-1 border-t border-slate-100" />
                                  <RowAction
                                    icon={Trash2}
                                    label="Delete company"
                                    danger
                                    disabled={company.status === "active"}
                                    title={company.status === "active" ? "Suspend or cancel first" : "Full clean-sweep delete"}
                                    onClick={() => { setMenuFor(null); removeCompany(company); }}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!paged.length && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center">
                        <Building2 className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-2 text-sm font-semibold text-slate-500">{rows.length ? "No companies match your filters." : "No companies yet. Create the first customer company."}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-slate-100 lg:hidden">
              {paged.map(({ company, plan, users, projects, reports, files }) => {
                const support = activeSupportFor(company.id);
                return (
                  <div key={company.id} className="p-4">
                    <button type="button" onClick={() => navigate(`/platform-admin/company/${company.id}`)} className="flex w-full items-center gap-3 text-left">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white shadow-sm" style={{ background: company.brand_color || "#1d4ed8" }}>
                        {(company.company_name || "?").charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-slate-900">{company.company_name}</span>
                        <span className="block truncate text-xs font-medium text-slate-400 capitalize">{plan} plan</span>
                      </span>
                      <StatusPill status={company.status} />
                    </button>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                      {[["Users", users], ["Projects", projects], ["Reports", reports], ["Files", files]].map(([l, v]) => (
                        <div key={l} className="rounded-lg border border-slate-200/80 bg-slate-50 py-2">
                          <p className="text-sm font-bold text-slate-900">{v}</p>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{l}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <select value={plan} onChange={(e) => changePlan(company, e.target.value)} className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold capitalize text-slate-900">
                        {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button type="button" onClick={() => toggleSupport(company)} className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-bold ${support ? "bg-amber-100 text-amber-800" : "border border-slate-200 bg-white text-slate-700"}`}>
                        <ShieldCheck className="h-3.5 w-3.5" />{support ? "End" : "Support"}
                      </button>
                      <button type="button" onClick={() => toggleStatus(company)} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${company.status === "suspended" ? "bg-emerald-600 text-white" : "border border-rose-200 bg-white text-rose-700"}`}>
                        {company.status === "suspended" ? "Activate" : "Suspend"}
                      </button>
                      <button type="button" onClick={() => removeCompany(company)} disabled={company.status === "active"} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white disabled:bg-rose-300">
                        <Trash2 className="h-3.5 w-3.5" />Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              {!paged.length && (
                <div className="p-10 text-center">
                  <Building2 className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-500">{rows.length ? "No companies match your filters." : "No companies yet."}</p>
                </div>
              )}
            </div>

            {/* Pagination */}
            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-5">
                <p className="text-xs font-semibold text-slate-500">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-40">Prev</button>
                  <span className="px-2 text-xs font-bold text-slate-500">Page {safePage} / {pageCount}</span>
                  <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Subscriptions */}
        {section === "subscriptions" && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">
              <CreditCard className="h-4 w-4 text-slate-400" /> Subscriptions
            </h2>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 text-left">Company</th>
                    <th className="px-4 py-3 text-left">Plan</th>
                    <th className="px-4 py-3 text-left">Billing</th>
                    <th className="px-4 py-3 text-right">Seats</th>
                    <th className="px-4 py-3 text-right">User Cap</th>
                    <th className="px-4 py-3 text-right">Project Cap</th>
                    <th className="px-4 py-3 text-left">Renews</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ company, subscription, plan }) => {
                    const limits = planLimits(plan);
                    return (
                      <tr key={company.id} className="border-b border-slate-50 hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-bold text-slate-900">{company.company_name}</td>
                        <td className="px-4 py-3">
                          <select value={plan} onChange={(e) => changePlan(company, e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold capitalize text-slate-900 outline-none focus:border-blue-500">
                            {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3"><span className={`text-xs font-bold ${subscription.billing_status === "past_due" ? "text-rose-600" : "text-emerald-600"}`}>{subscription.billing_status || "current"}</span></td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">{subscription.seats ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">{formatLimit(limits.users)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">{formatLimit(limits.projects)}</td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-500">{subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-slate-100 lg:hidden">
              {rows.map(({ company, subscription, plan }) => {
                const limits = planLimits(plan);
                return (
                  <div key={company.id} className="px-4 py-3">
                    <p className="font-bold text-slate-900">{company.company_name}</p>
                    <p className="mt-0.5 text-xs font-semibold capitalize text-slate-400">{limits.label} · {subscription.billing_status || "current"} · caps {formatLimit(limits.users)} users / {formatLimit(limits.projects)} projects</p>
                    <select value={plan} onChange={(e) => changePlan(company, e.target.value)} className="mt-2 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold capitalize text-slate-900">
                      {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Usage analytics */}
        {section === "usage" && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              <BarChart3 className="h-4 w-4 text-slate-400" /> Usage vs. Plan Limits
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {rows.map((row) => <CompanyUsagePanel key={row.company.id} row={row} />)}
            </div>
            <p className="text-xs font-semibold text-slate-400">
              Limits are informational (Phase 2) — usage is shown against each plan's caps but actions are not yet blocked. Storage is shown as file count; GB tracking arrives with byte-level usage.
            </p>
          </section>
        )}

        {/* Support access */}
        {section === "support" && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">
              <ShieldCheck className="h-4 w-4 text-slate-400" /> Support Access
              {supportSessions.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-amber-800">{supportSessions.length} active</span>}
            </h2>
            <div className="divide-y divide-slate-100">
              {companies.map((company) => {
                const support = activeSupportFor(company.id);
                return (
                  <div key={company.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{company.company_name}</p>
                      <p className="truncate text-xs font-medium text-slate-400">
                        {support ? `Active session — ${support.reason || "no reason given"}` : "No active support session"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSupport(company)}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition ${support ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {support ? "End Access" : "Start Access"}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="px-5 py-3 text-xs font-semibold text-amber-700">Support access is read-only and fully audited. Tenant record data is never exposed without an active session.</p>
          </section>
        )}

        {/* Settings — plan limit reference matrix */}
        {section === "settings" && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">
              <CreditCard className="h-4 w-4 text-slate-400" /> Plan Limits
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 text-left">Plan</th>
                    <th className="px-4 py-3 text-right">Users</th>
                    <th className="px-4 py-3 text-right">Projects</th>
                    <th className="px-4 py-3 text-right">Reports</th>
                    <th className="px-4 py-3 text-right">Storage</th>
                    <th className="px-4 py-3 text-left">Features</th>
                  </tr>
                </thead>
                <tbody>
                  {PLAN_ORDER.map((key) => {
                    const p = PLAN_LIMITS[key];
                    return (
                      <tr key={key} className="border-b border-slate-50">
                        <td className="px-4 py-3 font-bold capitalize text-slate-900">{p.label}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatLimit(p.users)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatLimit(p.projects)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatLimit(p.reports)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{p.storageGb == null ? "∞" : `${p.storageGb} GB`}</td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-500">{p.features.length ? p.features.join(", ") : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-3 text-xs font-semibold text-slate-400">∞ = unlimited. These caps drive the Usage meters. Editable per-company limits and enforcement are planned.</p>
          </section>
        )}

        {(section === "audit" || section === "companies") && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setAuditOpen((value) => !value)}
              aria-expanded={auditOpen || section === "audit"}
              disabled={section === "audit"}
              title={auditOpen ? "Collapse audit logs" : "Expand audit logs"}
              className={`flex w-full items-center gap-2 px-5 py-4 text-left text-sm font-bold uppercase tracking-wide text-slate-500 ${(auditOpen || section === "audit") ? "border-b border-slate-100" : ""}`}
            >
              <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 ${section === "audit" ? "invisible" : ""}`}>
                {auditOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </span>
              <ListChecks className="h-4 w-4 text-slate-400" /> Audit Logs
              {auditLogs.length > 0 && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-slate-600">{auditLogs.length}</span>
              )}
            </button>
            {(auditOpen || section === "audit") && (
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
                    <select value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold capitalize">
                      {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</span>
                    <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold capitalize">
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
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

function RowAction({ icon: Icon, label, onClick, danger, disabled, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${danger ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50"}`}
    >
      <Icon className="h-4 w-4 shrink-0" /> {label}
    </button>
  );
}
