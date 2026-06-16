import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FlaskConical, Plus, Save, Send, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  ASPHALT_BSG_STATUS,
  celsiusToFahrenheit,
  computeAsphaltGravitySpecimen,
  createAsphaltGravityReport,
  createAsphaltGravitySpecimenRow,
  formatAsphaltGravityStatus,
  getAsphaltGravityReport,
  saveAsphaltGravityReport
} from "../services/asphaltGravityService";
import { openAsphaltGravityPdf } from "../services/asphaltGravityPdfService";

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
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800 [&_span]:text-emerald-600",
    amber: "border-amber-200 bg-amber-50 text-amber-800 [&_span]:text-amber-600"
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{label}</span>
      <p className="mt-1 text-sm font-bold">{value || "-"}</p>
    </div>
  );
}

function AsphaltGravityReport() {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const { profile } = useAuth();
  const [report, setReport] = useState(null);

  useEffect(() => {
    const existing = reportId && reportId !== "new" ? getAsphaltGravityReport(reportId) : null;
    setReport(existing || createAsphaltGravityReport({ technicianName: profile?.full_name || "" }));
  }, [reportId, profile?.full_name]);

  if (!report) return null;

  function persist(next) {
    const saved = saveAsphaltGravityReport(next);
    setReport(saved);
    return saved;
  }

  function updateReport(patch) {
    persist({ ...report, ...patch });
  }

  // Editing the Celsius temperature recomputes Fahrenheit automatically.
  function updateTemperatureC(value) {
    updateReport({ temperatureC: value, temperatureF: celsiusToFahrenheit(value) });
  }

  function addCore() {
    const nextNo = (report.specimens || []).length + 1;
    updateReport({ specimens: [...(report.specimens || []), createAsphaltGravitySpecimenRow({ sampleId: `S-${nextNo}` })] });
  }

  function updateCore(rowId, patch) {
    updateReport({
      specimens: (report.specimens || []).map((row) =>
        row.id === rowId ? computeAsphaltGravitySpecimen({ ...row, ...patch }) : row
      )
    });
  }

  function deleteCore(rowId) {
    updateReport({ specimens: (report.specimens || []).filter((row) => row.id !== rowId) });
  }

  const canSubmit = Boolean((report.specimens || []).length > 0);

  function submitReport() {
    if (!canSubmit) return;
    persist({ ...report, status: ASPHALT_BSG_STATUS.SUBMITTED, submittedAt: new Date().toISOString() });
    navigate("/technician/lab/asphalt-bsg");
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1280px] space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-5 sm:px-7">
            <button type="button" onClick={() => navigate("/technician/lab/asphalt-bsg")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Bulk Specific Gravity Reports
            </button>
            <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Asphalt · Laboratory · AASHTO T-166 / ASTM D2726</p>
                <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Bulk Specific Gravity &amp; Density</h1>
                <p className="mt-1 text-xs font-semibold text-slate-400">{report.reportNumber}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
                  {formatAsphaltGravityStatus(report.status)}
                </span>
                <button type="button" onClick={() => persist(report)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-700 px-4 text-sm font-bold text-white hover:bg-slate-900"><Save className="h-4 w-4" /> Save</button>
                <button type="button" onClick={() => openAsphaltGravityPdf(report)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-700 px-4 text-sm font-bold text-white hover:bg-slate-900"><Download className="h-4 w-4" /> PDF</button>
                <button type="button" onClick={submitReport} disabled={!canSubmit} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"><Send className="h-4 w-4" /> Submit</button>
              </div>
            </div>
          </div>
        </section>

        {/* Report info */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-950">Report Information</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <LabelInput label="Project Name" value={report.projectName || ""} onChange={(e) => updateReport({ projectName: e.target.value })} />
            <LabelInput label="Project Number" value={report.projectNumber || ""} onChange={(e) => updateReport({ projectNumber: e.target.value })} />
            <LabelInput label="Set Number" value={report.setNumber || ""} onChange={(e) => updateReport({ setNumber: e.target.value })} />
            <LabelInput label="Temperature of H₂O (°C)" type="number" step="0.1" value={report.temperatureC || ""} onChange={(e) => updateTemperatureC(e.target.value)} placeholder="e.g. 16.5" />
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Temperature of H₂O (°F)</span>
              <p className="mt-1 text-sm font-bold text-slate-900">{report.temperatureF || "-"}</p>
            </div>
          </div>
        </section>

        {/* Core results */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FlaskConical className="h-4 w-4" /></span>
              <h2 className="text-base font-bold text-slate-950">Compacted Asphalt Cores</h2>
            </div>
            <button type="button" onClick={addCore} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> Add Core</button>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-400">Gs = In Air ÷ (SSD − In Water) · Core Density = Gs × 62.4 · % Compaction = Core Density ÷ Plant Unit Weight × 100 · Air Voids = 100 − % Compaction</p>

          <div className="mt-4 space-y-3">
            {(report.specimens || []).map((row, index) => (
              <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">{row.sampleId || `Sample ${index + 1}`}</h3>
                  <button type="button" onClick={() => deleteCore(row.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-bold text-rose-700"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  <LabelInput label="Sample ID" value={row.sampleId || ""} onChange={(e) => updateCore(row.id, { sampleId: e.target.value })} />
                  <LabelInput label="Sample Date" value={row.sampleDate || ""} onChange={(e) => updateCore(row.id, { sampleDate: e.target.value })} placeholder="e.g. 11-Mar" />
                  <LabelInput label="Location" value={row.location || ""} onChange={(e) => updateCore(row.id, { location: e.target.value })} placeholder="e.g. Station 73+70 on Radial Road" />
                  <LabelInput label="Core Thickness (in)" type="number" step="0.01" value={row.coreThickness || ""} onChange={(e) => updateCore(row.id, { coreThickness: e.target.value })} />
                  <LabelInput label="Weight In Air (g)" type="number" step="0.01" value={row.weightInAir || ""} onChange={(e) => updateCore(row.id, { weightInAir: e.target.value })} />
                  <LabelInput label="Sat. Surface Dry (g)" type="number" step="0.01" value={row.weightSSD || ""} onChange={(e) => updateCore(row.id, { weightSSD: e.target.value })} />
                  <LabelInput label="Weight In Water (g)" type="number" step="0.01" value={row.weightInWater || ""} onChange={(e) => updateCore(row.id, { weightInWater: e.target.value })} />
                  <LabelInput label="Plant Compacted Unit Weight (pcf)" type="number" step="0.01" value={row.plantUnitWeight || ""} onChange={(e) => updateCore(row.id, { plantUnitWeight: e.target.value })} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Computed label="Bulk Sp. Gravity (Gs)" value={row.bulkSpecificGravity} tone="blue" />
                  <Computed label="Core Density (pcf)" value={row.coreDensity} />
                  <Computed label="Percent Compaction (%)" value={row.percentCompaction} tone="emerald" />
                  <Computed label="Air Voids (%)" value={row.airVoids} tone="amber" />
                </div>
              </div>
            ))}
            {!(report.specimens || []).length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <p className="text-sm font-semibold text-slate-600">No cores added yet. Add a core to record results.</p>
                <button type="button" onClick={addCore} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500"><Plus className="h-4 w-4" /> Add Core</button>
              </div>
            )}
          </div>
        </section>

        {/* Notes */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Notes</span>
            <textarea value={report.notes || ""} onChange={(e) => updateReport({ notes: e.target.value })} rows={4} className={`${inputClass} mt-1 py-2 leading-6`} placeholder="Mix approvals, producer, testing notes…" />
          </label>
        </section>
      </div>
    </div>
  );
}

export default AsphaltGravityReport;
