import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Gauge,
  Send,
  Users
} from "lucide-react";
import { supabase } from "../services/supabase";
import StatusBadge from "../components/StatusBadge";
import { REPORT_STATUS, normalizeReportStatus } from "../workflow/workflowEngine";
import { MODULE_NAMES } from "../config/branding";

function isToday(value) {
  if (!value) return false;
  return new Date(value).toDateString() === new Date().toDateString();
}

function hoursSince(value) {
  if (!value) return 0;
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 36e5);
}

function ManagerDashboard() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadWorkspace() {
      setLoading(true);
      setError("");
      try {
        const [reportsResponse, projectsResponse] = await Promise.all([
          supabase.from("concrete_test_logs").select("*").order("updated_at", { ascending: false }),
          supabase.from("projects").select("*").order("created_at", { ascending: false })
        ]);

        if (reportsResponse.error) throw reportsResponse.error;
        if (projectsResponse.error) throw projectsResponse.error;

        setReports(reportsResponse.data || []);
        setProjects(projectsResponse.data || []);
      } catch (err) {
        console.error("Manager dashboard failed", err);
        setError(err.message || "Unable to load manager dashboard.");
      } finally {
        setLoading(false);
      }
    }

    loadWorkspace();
  }, []);

  const enrichedReports = useMemo(() => reports.map((report) => ({
    ...report,
    normalizedStatus: normalizeReportStatus(report.status),
    agingHours: hoursSince(report.submitted_at || report.updated_at || report.created_at)
  })), [reports]);

  const pendingApprovals = enrichedReports.filter((report) =>
    [REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.UNDER_REVIEW, REPORT_STATUS.RESUBMITTED].includes(report.normalizedStatus)
  );
  const delayedReviews = pendingApprovals.filter((report) => report.agingHours >= 12);
  const dailySubmissions = enrichedReports.filter((report) => isToday(report.submitted_at || report.created_at));
  const rejectedReports = enrichedReports.filter((report) =>
    [REPORT_STATUS.REJECTED, REPORT_STATUS.REVISION_REQUIRED].includes(report.normalizedStatus)
  );

  const kpis = [
    { label: "Active Project Operations", value: projects.length || new Set(enrichedReports.map((report) => report.project_id).filter(Boolean)).size, icon: FolderKanban, tone: "bg-slate-50 text-slate-900" },
    { label: "Pending Approvals", value: pendingApprovals.length, icon: ClipboardCheck, tone: "bg-blue-50 text-blue-900" },
    { label: "Delayed Reviews", value: delayedReviews.length, icon: AlertTriangle, tone: "bg-rose-50 text-rose-900" },
    { label: "Daily Submissions", value: dailySubmissions.length, icon: Send, tone: "bg-emerald-50 text-emerald-900" },
    { label: "Team Productivity", value: `${Math.max(0, enrichedReports.length)}`, icon: Gauge, tone: "bg-indigo-50 text-indigo-900" },
    { label: "Quality Incidents", value: rejectedReports.length, icon: AlertTriangle, tone: "bg-amber-50 text-amber-900" }
  ];

  const bottlenecks = [...pendingApprovals]
    .sort((a, b) => b.agingHours - a.agingHours)
    .slice(0, 6);

  const managerActions = [
    { label: `Open ${MODULE_NAMES.projectHub}`, icon: FolderKanban, onClick: () => navigate("/project/1") },
    { label: "Assign Reviewers", icon: Users, onClick: () => navigate("/qc/dashboard") },
    { label: "Reassign Work", icon: ClipboardCheck, onClick: () => navigate("/qc/dashboard") },
    { label: "Monitor Teams", icon: BarChart3, onClick: () => navigate("/manager/dashboard?view=teams") },
    { label: "Open Digital Deliverables", icon: FileText, onClick: () => navigate("/project/1/field-reports/concrete-test-log") }
  ];

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-5 sm:space-y-7">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Project Operations Overview</p>
          <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-950 sm:text-4xl">{MODULE_NAMES.commandCenter}</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-slate-600 sm:text-base">
                Monitor project health, validation bottlenecks, team workload, and compliance risk across the operation.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/qc/dashboard")}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              Open {MODULE_NAMES.validationCenter}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {kpis.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className={`rounded-3xl p-5 shadow-sm ${tone}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold">{label}</p>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-3xl font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Workflow Bottlenecks</p>
                <h2 className="mt-2 text-xl font-bold text-slate-950">Reviews needing management attention</h2>
              </div>
              {loading && <p className="text-sm font-semibold text-slate-500">Loading...</p>}
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
                {error}
              </div>
            )}

            <div className="mt-5 space-y-3">
              {bottlenecks.map((report) => (
                <article key={report.id} className="grid grid-cols-1 gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-4 lg:grid-cols-[1fr_180px_160px_140px] lg:items-center">
                  <div className="min-w-0">
                    <p className="break-words font-bold text-slate-950">{report.dfr_number || `DFR-${report.id}`}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">{report.project_name || report.project_number || "Project"}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{report.submitted_by_name || report.technician_name || report.data_logger || "Unassigned"}</p>
                  <StatusBadge status={report.status} />
                  <button
                    type="button"
                    onClick={() => navigate(`/qc/review/${report.id}`)}
                    className="min-h-11 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white"
                  >
                    Review
                  </button>
                </article>
              ))}
              {!loading && bottlenecks.length === 0 && (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <p className="text-lg font-bold text-slate-950">No workflow bottlenecks right now.</p>
                  <p className="mt-2 text-sm font-medium text-slate-500">Queue health is clear.</p>
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Manager Actions</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">Operational controls</h2>
            <div className="mt-5 space-y-3">
              {managerActions.map(({ label, icon: Icon, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-50"
                >
                  <Icon className="h-5 w-5 text-slate-500" />
                  {label}
                </button>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

export default ManagerDashboard;
