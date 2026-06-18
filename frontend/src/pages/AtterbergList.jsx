import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FlaskConical, Plus, Search, Trash2 } from "lucide-react";
import {
  ATTERBERG_STATUS,
  computeAtterberg,
  deleteAtterbergReport,
  formatAtterbergStatus,
  getAtterbergReports
} from "../services/atterbergService";
import { openAtterbergPdf } from "../services/atterbergPdfService";

const TABS = [
  { id: "all", label: "All" },
  { id: ATTERBERG_STATUS.DRAFT, label: "Draft" },
  { id: ATTERBERG_STATUS.SUBMITTED, label: "Submitted" },
  { id: ATTERBERG_STATUS.APPROVED, label: "Approved" }
];

function statusPill(status) {
  if (status === ATTERBERG_STATUS.APPROVED) return "bg-emerald-100 text-emerald-800";
  if (status === ATTERBERG_STATUS.SUBMITTED) return "bg-blue-100 text-blue-800";
  return "bg-amber-100 text-amber-900";
}

function AtterbergList() {
  const navigate = useNavigate();
  const [reports, setReports] = useState(() => getAtterbergReports());
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => ({
    all: reports.length,
    [ATTERBERG_STATUS.DRAFT]: reports.filter((r) => r.status === ATTERBERG_STATUS.DRAFT).length,
    [ATTERBERG_STATUS.SUBMITTED]: reports.filter((r) => r.status === ATTERBERG_STATUS.SUBMITTED).length,
    [ATTERBERG_STATUS.APPROVED]: reports.filter((r) => r.status === ATTERBERG_STATUS.APPROVED).length
  }), [reports]);

  const filtered = reports
    .filter((r) => activeTab === "all" || r.status === activeTab)
    .filter((r) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [r.reportNumber, r.boringNumber, r.projectName, r.projectNumber].some((v) => String(v || "").toLowerCase().includes(q));
    })
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  function removeReport(id) {
    if (!window.confirm("Delete this Atterberg report?")) return;
    deleteAtterbergReport(id);
    setReports(getAtterbergReports());
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1100px] space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 py-6 sm:px-7">
            <button type="button" onClick={() => navigate("/technician/dashboard?view=lab-reports")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-300 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Lab Reports</button>
            <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-300">Soil · Laboratory · ASTM D4318</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">Atterberg Limits Reports</h1>
              </div>
              <button type="button" onClick={() => navigate("/technician/lab/atterberg/new")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-accent-500 px-5 text-sm font-bold text-white shadow-lg shadow-accent-950/30 transition hover:bg-accent-600"><Plus className="h-4 w-4" /> New Report</button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap gap-1.5 rounded-2xl bg-slate-100 p-1.5">
            {TABS.map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${activeTab === tab.id ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}>
                {tab.label}<span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === tab.id ? "bg-blue-50 text-blue-700" : "bg-slate-200 text-slate-600"}`}>{counts[tab.id] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search report no., boring, or project…" className="min-h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100" />
          </div>
          <div className="mt-4 space-y-2">
            {filtered.map((report) => {
              const att = computeAtterberg(report);
              return (
                <article key={report.id} role="button" tabIndex={0}
                  onClick={() => navigate(`/technician/lab/atterberg/${report.id}`)}
                  onKeyDown={(event) => { if (event.key === "Enter") navigate(`/technician/lab/atterberg/${report.id}`); }}
                  className="grid cursor-pointer grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-blue-300 hover:bg-blue-50/30 lg:grid-cols-[150px_minmax(0,1fr)_180px_110px_150px] lg:items-center">
                  <p className="text-[15px] font-bold text-slate-900">{report.reportNumber}</p>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{report.projectName || "No project"}</p>
                    <p className="truncate text-[13px] font-medium text-slate-500">{report.boringNumber || "—"}</p>
                  </div>
                  <p className="text-[13px] font-semibold text-slate-700">LL {att.nonPlastic ? "NP" : (att.ll ?? "-")} · PL {att.nonPlastic ? "NP" : (att.pl ?? "-")} · PI {att.pi ?? "-"} {att.classification ? `· ${report.customClassification || att.classification}` : ""}</p>
                  <p><span className={`inline-flex rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${statusPill(report.status)}`}>{formatAtterbergStatus(report.status)}</span></p>
                  <div className="flex flex-nowrap items-center gap-2 lg:justify-end" onClick={(event) => event.stopPropagation()}>
                    <button type="button" onClick={() => openAtterbergPdf(report)} className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50">PDF</button>
                    <button type="button" onClick={() => removeReport(report.id)} className="inline-flex h-9 items-center justify-center rounded-lg border border-rose-200 bg-white px-2.5 text-[13px] font-semibold text-rose-700 transition hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </article>
              );
            })}
            {!filtered.length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><FlaskConical className="h-6 w-6" /></span>
                <p className="mt-3 text-sm font-semibold text-slate-600">No Atterberg reports yet.</p>
                <button type="button" onClick={() => navigate("/technician/lab/atterberg/new")} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> New Report</button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default AtterbergList;
