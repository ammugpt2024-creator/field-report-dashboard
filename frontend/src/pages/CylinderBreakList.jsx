import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FlaskConical, Plus, Search, Trash2 } from "lucide-react";
import {
  CYLINDER_BREAK_STATUS,
  deleteCylinderBreak,
  formatCylinderBreakStatus,
  getCylinderBreaks
} from "../services/labCylinderService";
import { openCylinderBreakPdf } from "../services/cylinderBreakPdfService";

const TABS = [
  { id: "all", label: "All" },
  { id: CYLINDER_BREAK_STATUS.DRAFT, label: "Draft" },
  { id: CYLINDER_BREAK_STATUS.SUBMITTED, label: "Submitted" },
  { id: CYLINDER_BREAK_STATUS.APPROVED, label: "Approved" }
];

function statusPill(status) {
  if (status === CYLINDER_BREAK_STATUS.APPROVED) return "bg-emerald-100 text-emerald-800";
  if (status === CYLINDER_BREAK_STATUS.SUBMITTED) return "bg-blue-100 text-blue-800";
  return "bg-amber-100 text-amber-900";
}

function CylinderBreakList() {
  const navigate = useNavigate();
  const [reports, setReports] = useState(() => getCylinderBreaks());
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => ({
    all: reports.length,
    [CYLINDER_BREAK_STATUS.DRAFT]: reports.filter((r) => r.status === CYLINDER_BREAK_STATUS.DRAFT).length,
    [CYLINDER_BREAK_STATUS.SUBMITTED]: reports.filter((r) => r.status === CYLINDER_BREAK_STATUS.SUBMITTED).length,
    [CYLINDER_BREAK_STATUS.APPROVED]: reports.filter((r) => r.status === CYLINDER_BREAK_STATUS.APPROVED).length
  }), [reports]);

  const filtered = reports
    .filter((r) => activeTab === "all" || r.status === activeTab)
    .filter((r) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [r.reportNumber, r.setNumber, r.projectName, r.dfrNumber].some((v) => String(v || "").toLowerCase().includes(q));
    })
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  function removeReport(id) {
    if (!window.confirm("Delete this cylinder break report?")) return;
    deleteCylinderBreak(id);
    setReports(getCylinderBreaks());
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1100px] space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-5 sm:px-7">
            <button type="button" onClick={() => navigate("/technician/dashboard?view=lab-reports")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Lab Reports
            </button>
            <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Concrete · Laboratory</p>
                <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Cylinder Break Reports</h1>
              </div>
              <button type="button" onClick={() => navigate("/technician/lab/cylinder-break/new")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-500">
                <Plus className="h-4 w-4" /> New Report
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap gap-1.5 rounded-2xl bg-slate-100 p-1.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${activeTab === tab.id ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}
              >
                {tab.label}
                <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === tab.id ? "bg-blue-50 text-blue-700" : "bg-slate-200 text-slate-600"}`}>{counts[tab.id] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search report no., set number, project, or DFR…" className="min-h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100" />
          </div>

          <div className="mt-4 space-y-2">
            {filtered.map((report) => (
              <article
                key={report.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/technician/lab/cylinder-break/${report.id}`)}
                onKeyDown={(event) => { if (event.key === "Enter") navigate(`/technician/lab/cylinder-break/${report.id}`); }}
                className="grid cursor-pointer grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-blue-300 hover:bg-blue-50/30 lg:grid-cols-[150px_minmax(0,1fr)_140px_110px_110px_150px] lg:items-center"
              >
                <p className="text-[15px] font-bold text-slate-900">{report.reportNumber}</p>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{report.projectName || "No project linked"}</p>
                  <p className="truncate text-[13px] font-medium text-slate-500">Set {report.setNumber || "-"}{report.dfrNumber ? ` · ${report.dfrNumber}` : ""}</p>
                </div>
                <p className="text-sm font-semibold text-slate-700">{(report.breaks || []).length} cyl.</p>
                <p><span className={`inline-flex rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${statusPill(report.status)}`}>{formatCylinderBreakStatus(report.status)}</span></p>
                <p className="text-[13px] font-medium text-slate-500">{report.updatedAt ? new Date(report.updatedAt).toLocaleDateString() : "-"}</p>
                <div className="flex flex-nowrap items-center gap-2 lg:justify-end" onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => openCylinderBreakPdf(report)} className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50">PDF</button>
                  <button type="button" onClick={() => removeReport(report.id)} className="inline-flex h-9 items-center justify-center rounded-lg border border-rose-200 bg-white px-2.5 text-[13px] font-semibold text-rose-700 transition hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              </article>
            ))}
            {!filtered.length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><FlaskConical className="h-6 w-6" /></span>
                <p className="mt-3 text-sm font-semibold text-slate-600">No cylinder break reports yet.</p>
                <button type="button" onClick={() => navigate("/technician/lab/cylinder-break/new")} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> New Report</button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default CylinderBreakList;
