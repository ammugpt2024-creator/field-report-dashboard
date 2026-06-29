import { useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  Building2,
  FileText,
  FolderKanban,
  ListChecks,
  Settings,
  ShieldCheck,
  Users,
  Workflow
} from "lucide-react";
import { MODULE_NAMES } from "../config/branding";

const modules = [
  { label: "Organizations", description: "Manage company accounts, clients, and operating units.", icon: Building2, path: "/admin/dashboard?module=organizations" },
  { label: MODULE_NAMES.projectHub, description: "Create projects, configure metadata, and assign teams.", icon: FolderKanban, path: "/admin/dashboard?module=projects" },
  { label: MODULE_NAMES.accessControl, description: "Manage user roles, access, and profile assignments.", icon: Users, path: "/admin/dashboard?module=users" },
  { label: "Teams", description: "Group field engineers, quality reviewers, operations managers, and client viewers.", icon: ShieldCheck, path: "/admin/dashboard?module=teams" },
  { label: "Workflow Settings", description: "Configure statuses, SLA thresholds, and review rules.", icon: Workflow, path: "/admin/dashboard?module=workflow" },
  { label: "Deliverable Templates", description: "Maintain digital deliverable layouts, PDF sections, and required fields.", icon: FileText, path: "/admin/dashboard?module=templates" },
  { label: MODULE_NAMES.activityStream, description: "Control email alerts, escalations, and reminder policies.", icon: Bell, path: "/admin/dashboard?module=notifications" },
  { label: "Audit Logs", description: "Review traceability for creation, edits, submissions, and approvals.", icon: ListChecks, path: "/admin/dashboard?module=audit" },
  { label: "System Health", description: "Monitor storage, email functions, integrations, and service status.", icon: Activity, path: "/admin/dashboard?module=health" },
  { label: "Settings", description: "Manage platform-level configuration from the GUI.", icon: Settings, path: "/admin/dashboard?module=settings" }
];

function AdminDashboard() {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-5 sm:space-y-7">
        <section className="overflow-hidden rounded-3xl border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-5 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-300">System Operations Control Center</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{MODULE_NAMES.platformAdministration}</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-300 sm:text-base">
            Manage the platform from a governed GUI: organizations, users, workflows, templates, activity streams, and audit controls.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Active Modules", value: modules.length, tone: "bg-slate-50 text-slate-900" },
            { label: "Workflow Engine", value: "On", tone: "bg-emerald-50 text-emerald-900" },
            { label: "Notifications", value: "Ready", tone: "bg-blue-50 text-blue-900" },
            { label: "Auditability", value: "Enabled", tone: "bg-indigo-50 text-indigo-900" },
            { label: "System Health", value: "Normal", tone: "bg-amber-50 text-amber-900" }
          ].map(({ label, value, tone }) => (
            <div key={label} className={`rounded-3xl p-5 shadow-sm ${tone}`}>
              <p className="text-sm font-bold">{label}</p>
              <p className="mt-4 text-3xl font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Organization Modules</p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">Platform governance</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map(({ label, description, icon: Icon, path }) => (
              <button
                key={label}
                type="button"
                onClick={() => navigate(path)}
                className="min-h-[140px] rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="rounded-2xl bg-slate-100 p-3 text-slate-800">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">GUI</span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-950">{label}</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{description}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default AdminDashboard;
