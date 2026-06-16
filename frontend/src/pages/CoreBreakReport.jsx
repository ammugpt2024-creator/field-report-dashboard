import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FlaskConical, Plus, Save, Send, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  CORE_BREAK_STATUS,
  averageCorrectedStrength,
  computeCoreSpecimen,
  createCoreBreakReport,
  createCoreSpecimenRow,
  formatCoreBreakStatus,
  getCoreBreak,
  saveCoreBreak
} from "../services/coreBreakService";
import { openCoreBreakPdf } from "../services/coreBreakPdfService";

const inputClass = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";

function LabelInput({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input className={`${inputClass} mt-1`} {...props} />
    </label>
  );
}

function Computed({ label, value, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-900 [&_span]:text-slate-400",
    blue: "border-blue-200 bg-blue-50 text-blue-900 [&_span]:text-blue-500",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800 [&_span]:text-emerald-600"
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{label}</span>
      <p className="mt-1 text-sm font-bold">{value || "-"}</p>
    </div>
  );
}

function CoreBreakReport() {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const { profile } = useAuth();
  const [report, setReport] = useState(null);

  useEffect(() => {
    const existing = reportId && reportId !== "new" ? getCoreBreak(reportId) : null;
    setReport(existing || createCoreBreakReport({ technicianName: profile?.full_name || "" }));
  }, [reportId, profile?.full_name]);

  if (!report) return null;

  function persist(next) {
    const saved = saveCoreBreak(next);
    setReport(saved);
    return saved;
  }

  function updateReport(patch) {
    persist({ ...report, ...patch });
  }

  function addCore() {
    const nextNo = (report.specimens || []).length + 1;
    updateReport({ specimens: [...(report.specimens || []), createCoreSpecimenRow({ sampleNo: `Core-${nextNo}` })] });
  }

  function updateCore(rowId, patch) {
    updateReport({
      specimens: (report.specimens || []).map((row) =>
        row.id === rowId ? computeCoreSpecimen({ ...row, ...patch }) : row
      )
    });
  }

  function deleteCore(rowId) {
    updateReport({ specimens: (report.specimens || []).filter((row) => row.id !== rowId) });
  }

  const canSubmit = Boolean((report.specimens || []).length > 0);
  const avgCorrected = averageCorrectedStrength(report.specimens || []);

  function submitReport() {
    if (!canSubmit) return;
    persist({ ...report, status: CORE_BREAK_STATUS.SUBMITTED, submittedAt: new Date().toISOString() });
    navigate("/technician/lab/core-break");
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1280px] space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-5 sm:px-7">
            <button type="button" onClick={() => navigate("/technician/lab/core-break")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Core Break Reports
            </button>
            <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Concrete · Laboratory · ASTM C42</p>
                <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Concrete Core Break Report</h1>
                <p className="mt-1 text-xs font-semibold text-slate-400">{report.reportNumber}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
                  {formatCoreBreakStatus(report.status)}
                </span>
                <button type="button" onClick={() => persist(report)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-700 px-4 text-sm font-bold text-white hover:bg-slate-900"><Save className="h-4 w-4" /> Save</button>
                <button type="button" onClick={() => openCoreBreakPdf(report)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-700 px-4 text-sm font-bold text-white hover:bg-slate-900"><Download className="h-4 w-4" /> PDF</button>
                <button type="button" onClick={submitReport} disabled={!canSubmit} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"><Send className="h-4 w-4" /> Submit</button>
              </div>
            </div>
          </div>
        </section>

        {/* Report info */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-950">Report Information</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <LabelInput label="Project Name" value={report.projectName || ""} onChange={(e) => updateReport({ projectName: e.target.value })} />
            <LabelInput label="Project Number" value={report.projectNumber || ""} onChange={(e) => updateReport({ projectNumber: e.target.value })} />
            <LabelInput label="Set Number" value={report.setNumber || ""} onChange={(e) => updateReport({ setNumber: e.target.value })} />
            <LabelInput label="Required Compressive Strength" value={report.requiredStrength || ""} onChange={(e) => updateReport({ requiredStrength: e.target.value })} placeholder="e.g. 4000 Psi" />
            <LabelInput label="Diameter of Cores" value={report.diameterOfCores || ""} onChange={(e) => updateReport({ diameterOfCores: e.target.value })} />
            <LabelInput label="Condition of Cores" value={report.conditionOfCores || ""} onChange={(e) => updateReport({ conditionOfCores: e.target.value })} />
            <LabelInput label="Direction of Loading" value={report.directionOfLoading || ""} onChange={(e) => updateReport({ directionOfLoading: e.target.value })} />
            <LabelInput label="Placement Location" value={report.placementLocation || ""} onChange={(e) => updateReport({ placementLocation: e.target.value })} />
            <LabelInput label="Panel Shot On" type="date" value={report.panelShotOn || ""} onChange={(e) => updateReport({ panelShotOn: e.target.value })} />
            <LabelInput label="Date Cored" value={report.dateCored || ""} onChange={(e) => updateReport({ dateCored: e.target.value })} placeholder="e.g. Cored on 6-25-2025" />
            <LabelInput label="Date Tested" type="date" value={report.dateTested || ""} onChange={(e) => updateReport({ dateTested: e.target.value })} />
            <LabelInput label="Tested By" value={report.testedBy || ""} onChange={(e) => updateReport({ testedBy: e.target.value })} />
            <LabelInput label="Prepared By" value={report.preparedBy || ""} onChange={(e) => updateReport({ preparedBy: e.target.value })} />
          </div>
          <h3 className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Target Compressive Strength</h3>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <LabelInput label="3 Day" value={report.target3Day || ""} onChange={(e) => updateReport({ target3Day: e.target.value })} placeholder="e.g. 2500 Psi" />
            <LabelInput label="7 Day" value={report.target7Day || ""} onChange={(e) => updateReport({ target7Day: e.target.value })} placeholder="e.g. 3500 Psi" />
            <LabelInput label="28 Day" value={report.target28Day || ""} onChange={(e) => updateReport({ target28Day: e.target.value })} placeholder="e.g. 4000 Psi" />
          </div>
        </section>

        {/* Core results */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FlaskConical className="h-4 w-4" /></span>
              <h2 className="text-base font-bold text-slate-950">Compressive Strength of Concrete Cores</h2>
            </div>
            <div className="flex items-center gap-2">
              {avgCorrected && (
                <span className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">Avg. Corrected: {avgCorrected} psi</span>
              )}
              <button type="button" onClick={addCore} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> Add Core</button>
            </div>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-400">Area = π/4 × Diam² · Strength = Load ÷ Area · L/D Ratio = Uncapped Length ÷ Diam · Corrected = Strength × Correction Factor · Unit Weight = Weight × 1728 ÷ (Area × Uncapped Length)</p>

          <div className="mt-4 space-y-3">
            {(report.specimens || []).map((row, index) => (
              <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">{row.sampleNo || `Core-${index + 1}`}</h3>
                  <button type="button" onClick={() => deleteCore(row.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-bold text-rose-700"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  <LabelInput label="Sample No." value={row.sampleNo || ""} onChange={(e) => updateCore(row.id, { sampleNo: e.target.value })} />
                  <LabelInput label="Length Uncapped (in.)" type="number" step="0.001" value={row.lengthUncapped || ""} onChange={(e) => updateCore(row.id, { lengthUncapped: e.target.value })} />
                  <LabelInput label="Length Capped (in.)" type="number" step="0.001" value={row.lengthCapped || ""} onChange={(e) => updateCore(row.id, { lengthCapped: e.target.value })} />
                  <LabelInput label="Core Diam. (in.)" type="number" step="0.001" value={row.coreDiameter || ""} onChange={(e) => updateCore(row.id, { coreDiameter: e.target.value })} />
                  <LabelInput label="Load (lbs.)" type="number" value={row.load || ""} onChange={(e) => updateCore(row.id, { load: e.target.value })} />
                  <LabelInput label="Weight Before Capping (lb)" type="number" step="0.01" value={row.weightBeforeCapping || ""} onChange={(e) => updateCore(row.id, { weightBeforeCapping: e.target.value })} />
                  <LabelInput label="Age (Days)" type="number" value={row.ageDays || ""} onChange={(e) => updateCore(row.id, { ageDays: e.target.value })} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                  <Computed label="Area (sq.in.)" value={row.area} />
                  <Computed label="Strength (psi)" value={row.compressiveStrength} tone="blue" />
                  <Computed label="L/D Ratio" value={row.ldRatio} />
                  <Computed label="Correction Factor" value={row.correctionFactor || row.correctionNote} />
                  <Computed label="Corrected (psi)" value={row.correctedStrength} tone="emerald" />
                  <Computed label="Unit Weight (pcf)" value={row.unitWeight} />
                </div>
              </div>
            ))}
            {!(report.specimens || []).length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <p className="text-sm font-semibold text-slate-600">No cores added yet. Add a core to record break results.</p>
                <button type="button" onClick={addCore} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500"><Plus className="h-4 w-4" /> Add Core</button>
              </div>
            )}
          </div>
        </section>

        {/* Remarks */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Remarks</span>
            <textarea value={report.remarks || ""} onChange={(e) => updateReport({ remarks: e.target.value })} rows={3} className={`${inputClass} mt-1 py-2 leading-6`} placeholder="Coring notes, anomalies, capping method…" />
          </label>
        </section>
      </div>
    </div>
  );
}

export default CoreBreakReport;
