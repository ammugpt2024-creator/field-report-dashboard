import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Eye, FileCheck2, FolderKanban, Search } from "lucide-react";
import { supabase } from "../services/supabase";
import StatusBadge from "../components/StatusBadge";
import { REPORT_STATUS, normalizeReportStatus } from "../workflow/workflowEngine";
import { MODULE_NAMES } from "../config/branding";

function getPdfUrl(report) {
  return report?.final_pdf_url || report?.pdf_url || report?.generated_pdf_url || "";
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function ClientDashboard() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadReports() {
      setLoading(true);
      setError("");
      try {
        const { data, error: fetchError } = await supabase
          .from("concrete_test_logs")
          .select("*")
          .in("status", [REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED])
          .order("approved_at", { ascending: false, nullsFirst: false });

        if (fetchError) throw fetchError;
        setReports(data || []);
      } catch (err) {
        console.error("Client dashboard failed", err);
        setError(err.message || "Unable to load approved reports.");
      } finally {
        setLoading(false);
      }
    }

    loadReports();
  }, []);

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reports
      .map((report) => ({ ...report, normalizedStatus: normalizeReportStatus(report.status), pdfUrl: getPdfUrl(report) }))
      .filter((report) => {
        if (!term) return true;
        return [report.dfr_number, report.project_name, report.project_number, report.submitted_by_name, report.technician_name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      });
  }, [reports, search]);

  const projectCount = new Set(filteredReports.map((report) => report.project_id).filter(Boolean)).size;

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-5 sm:space-y-7">
        <section className="overflow-hidden rounded-3xl border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-5 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-300">Client Visibility Portal</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{MODULE_NAMES.digitalDeliverables}</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-300 sm:text-base">
            Read-only access to approved digital deliverables, project summaries, and final downloadable records.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "Approved Deliverables", value: filteredReports.length, icon: FileCheck2, tone: "bg-emerald-50 text-emerald-900" },
            { label: "Active Project Operations", value: projectCount, icon: FolderKanban, tone: "bg-blue-50 text-blue-900" },
            { label: "Read Only Access", value: "On", icon: Eye, tone: "bg-slate-50 text-slate-900" }
          ].map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className={`rounded-3xl p-5 shadow-sm ${tone}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold">{label}</p>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-3xl font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">{MODULE_NAMES.recordsVault}</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">Final compliance documents</h2>
            </div>
            <label className="flex h-11 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 lg:max-w-md">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search DFR or project"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none"
              />
            </label>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
              {error}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-3">
            {filteredReports.map((report) => (
              <article key={report.id} className="grid grid-cols-1 gap-4 rounded-3xl border border-slate-100 bg-slate-50 p-4 lg:grid-cols-[1fr_180px_160px_260px] lg:items-center">
                <div className="min-w-0">
                  <p className="break-words font-bold text-slate-950">{report.dfr_number || `DFR-${report.id}`}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{report.project_name || report.project_number || "Project"}</p>
                </div>
                <p className="text-sm font-semibold text-slate-700">{formatDate(report.approved_at || report.updated_at)}</p>
                <StatusBadge status={report.status} />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/project/${report.project_id || 1}/field-reports/concrete-test-log/${report.id}`)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </button>
                  <a
                    href={report.pdfUrl || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold ${
                      report.pdfUrl ? "bg-blue-600 text-white" : "pointer-events-none bg-slate-200 text-slate-400"
                    }`}
                  >
                    <Download className="h-4 w-4" />
                    PDF
                  </a>
                </div>
              </article>
            ))}
          </div>

          {!loading && filteredReports.length === 0 && (
            <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-lg font-bold text-slate-950">No approved deliverables found.</p>
              <p className="mt-2 text-sm font-medium text-slate-500">Approved deliverables will appear here automatically.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default ClientDashboard;
