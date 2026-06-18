import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, BarChart3, Building2, CreditCard, FileStack, FolderKanban,
  HardDrive, ListChecks, ShieldCheck, Users
} from "lucide-react";
import { getCompanyById, getCompanyUsage } from "../services/tenantService";
import { fetchAuditLogs } from "../services/auditLogService";

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
  ["audit", "Audit Logs", ListChecks]
];

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
  const [company, setCompany] = useState(null);
  const [usage, setUsage] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");

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

  const subscription = company?.company_subscriptions?.[0] || {};
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
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricTile icon={Users} label="Users" value={usage.users ?? "–"} />
              <MetricTile icon={FolderKanban} label="Projects" value={usage.projects ?? "–"} />
              <MetricTile icon={FileStack} label="Reports" value={reports} />
              <MetricTile icon={HardDrive} label="Files" value={usage.storage_objects ?? "–"} />
            </div>
            <p className="text-xs font-semibold text-slate-400">
              Seat, storage (GB), and project limits with progress bars arrive with subscription enforcement (Phase 2). Counts above come from the guarded platform usage function.
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
    </div>
  );
}
