import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FlaskConical, Plus, Save, Send, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  GROUT_CUBE_STATUS,
  computeGroutSpecimen,
  createGroutCubeReport,
  createGroutSpecimenRow,
  formatGroutCubeStatus,
  getGroutCubeBreak,
  parsePsi,
  saveGroutCubeBreak
} from "../services/groutCubeService";
import { openGroutCubePdf } from "../services/groutCubePdfService";

const inputClass = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";

function LabelInput({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input className={`${inputClass} mt-1`} {...props} />
    </label>
  );
}

function GroutCubeBreakReport() {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const { profile } = useAuth();
  const [report, setReport] = useState(null);

  useEffect(() => {
    const existing = reportId && reportId !== "new" ? getGroutCubeBreak(reportId) : null;
    setReport(existing || createGroutCubeReport({ technicianName: profile?.full_name || "" }));
  }, [reportId, profile?.full_name]);

  const specifiedStrengthPsi = useMemo(
    () => report?.specifiedStrengthPsi || parsePsi(report?.specifiedStrength) || "",
    [report?.specifiedStrengthPsi, report?.specifiedStrength]
  );

  if (!report) return null;

  function persist(next) {
    const saved = saveGroutCubeBreak(next);
    setReport(saved);
    return saved;
  }

  function updateReport(patch) {
    persist({ ...report, ...patch });
  }

  function addSpecimen() {
    const nextNo = (report.specimens || []).length + 1;
    updateReport({ specimens: [...(report.specimens || []), createGroutSpecimenRow({ specimenNumber: String(nextNo) })] });
  }

  function updateSpecimen(rowId, patch) {
    updateReport({
      specimens: (report.specimens || []).map((row) =>
        row.id === rowId ? computeGroutSpecimen({ ...row, ...patch }, { specifiedStrengthPsi }) : row
      )
    });
  }

  function deleteSpecimen(rowId) {
    updateReport({ specimens: (report.specimens || []).filter((row) => row.id !== rowId) });
  }

  const canSubmit = Boolean(report.projectName && (report.specimens || []).length > 0);

  function submitReport() {
    if (!canSubmit) return;
    persist({ ...report, status: GROUT_CUBE_STATUS.SUBMITTED, submittedAt: new Date().toISOString() });
    navigate("/technician/lab/grout-cube-break");
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1200px] space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-5 sm:px-7">
            <button type="button" onClick={() => navigate("/technician/lab/grout-cube-break")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Grout Cube Break Reports
            </button>
            <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Grout · Laboratory · ASTM C109/C1107</p>
                <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Grout Cube Break Report</h1>
                <p className="mt-1 text-xs font-semibold text-slate-400">{report.reportNumber}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
                  {formatGroutCubeStatus(report.status)}
                </span>
                <button type="button" onClick={() => persist(report)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-700 px-4 text-sm font-bold text-white hover:bg-slate-900"><Save className="h-4 w-4" /> Save</button>
                <button type="button" onClick={() => openGroutCubePdf(report)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-700 px-4 text-sm font-bold text-white hover:bg-slate-900"><Download className="h-4 w-4" /> PDF</button>
                <button type="button" onClick={submitReport} disabled={!canSubmit} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"><Send className="h-4 w-4" /> Submit</button>
              </div>
            </div>
          </div>
        </section>

        {/* Report header */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-950">Report Header</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <LabelInput label="Client" value={report.client || ""} onChange={(e) => updateReport({ client: e.target.value })} />
            <LabelInput label="Set Number" value={report.setNumber || ""} onChange={(e) => updateReport({ setNumber: e.target.value })} placeholder="e.g. G-012" />
            <LabelInput label="Project Number" value={report.projectNumber || ""} onChange={(e) => updateReport({ projectNumber: e.target.value })} placeholder="e.g. 200100" />
            <LabelInput label="Project" value={report.projectName || ""} onChange={(e) => updateReport({ projectName: e.target.value })} />
            <LabelInput label="Attention" value={report.attention || ""} onChange={(e) => updateReport({ attention: e.target.value })} placeholder="e.g. Mr. John Doe" />
          </div>
        </section>

        {/* Sampling information */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-950">Sampling Information</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <LabelInput label="Date Sampled" type="date" value={report.dateSampled || ""} onChange={(e) => updateReport({ dateSampled: e.target.value })} />
            <LabelInput label="Sampled By" value={report.sampledBy || ""} onChange={(e) => updateReport({ sampledBy: e.target.value })} />
            <LabelInput label="Time Batched" value={report.timeBatched || ""} onChange={(e) => updateReport({ timeBatched: e.target.value })} placeholder="e.g. 4:25 PM" />
            <LabelInput label="Time Sampled" value={report.timeSampled || ""} onChange={(e) => updateReport({ timeSampled: e.target.value })} placeholder="e.g. 4:30 PM" />
            <LabelInput label="Time Placed" value={report.timePlaced || ""} onChange={(e) => updateReport({ timePlaced: e.target.value })} placeholder="e.g. 4:32 PM" />
            <LabelInput label="Truck No." value={report.truckNumber || ""} onChange={(e) => updateReport({ truckNumber: e.target.value })} placeholder="N/A" />
            <LabelInput label="Ticket No." value={report.ticketNumber || ""} onChange={(e) => updateReport({ ticketNumber: e.target.value })} placeholder="N/A" />
            <LabelInput label="Location" value={report.location || ""} onChange={(e) => updateReport({ location: e.target.value })} />
            <LabelInput label="Mix Designation" value={report.mixDesignation || ""} onChange={(e) => updateReport({ mixDesignation: e.target.value })} />
            <LabelInput label="Manufacturer" value={report.manufacturer || ""} onChange={(e) => updateReport({ manufacturer: e.target.value })} />
            <LabelInput label="Specified Min. Strength (psi)" type="number" value={specifiedStrengthPsi} onChange={(e) => updateReport({ specifiedStrengthPsi: e.target.value })} placeholder="5000" />
            <LabelInput label="No., Size & Type Molded" value={report.specimensMolded || ""} onChange={(e) => updateReport({ specimensMolded: e.target.value })} placeholder='e.g. 6, 2"X2" Cubes' />
          </div>
        </section>

        {/* Field measurements */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-950">Field Measurements</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <LabelInput label="Air Temp (°F)" value={report.airTemp || ""} onChange={(e) => updateReport({ airTemp: e.target.value })} placeholder="N/A" />
            <LabelInput label="Mix Temp (°F)" value={report.mixTemp || ""} onChange={(e) => updateReport({ mixTemp: e.target.value })} placeholder="N/A" />
            <LabelInput label="Water (L/Bag)" value={report.waterPerBag || ""} onChange={(e) => updateReport({ waterPerBag: e.target.value })} placeholder="N/A" />
            <LabelInput label="Fluidity (Sec)" value={report.fluiditySec || ""} onChange={(e) => updateReport({ fluiditySec: e.target.value })} placeholder="N/A" />
            <LabelInput label="Specific Gravity (g/cm³)" value={report.specificGravity || ""} onChange={(e) => updateReport({ specificGravity: e.target.value })} placeholder="N/A" />
          </div>
        </section>

        {/* Compressive strength results */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FlaskConical className="h-4 w-4" /></span>
              <h2 className="text-base font-bold text-slate-950">Compressive Strength Test Results</h2>
            </div>
            <button type="button" onClick={addSpecimen} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> Add Specimen</button>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-400">Compressive Strength = Load ÷ Area · Area = π × Radius² · Percent of Design = Strength ÷ Specified Min × 100</p>

          <div className="mt-4 space-y-3">
            {(report.specimens || []).map((row, index) => (
              <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Specimen {row.specimenNumber || index + 1}</h3>
                  <button type="button" onClick={() => deleteSpecimen(row.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-bold text-rose-700"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                  <LabelInput label="Specimen No." value={row.specimenNumber || ""} onChange={(e) => updateSpecimen(row.id, { specimenNumber: e.target.value })} />
                  <LabelInput label="Test Date" type="date" value={row.testDate || ""} onChange={(e) => updateSpecimen(row.id, { testDate: e.target.value })} />
                  <LabelInput label="Age (Days)" type="number" value={row.ageDays || ""} onChange={(e) => updateSpecimen(row.id, { ageDays: e.target.value })} />
                  <LabelInput label="Diameter (in.)" type="number" step="0.01" value={row.diameter || ""} onChange={(e) => updateSpecimen(row.id, { diameter: e.target.value })} />
                  <LabelInput label="Load (lbs.)" type="number" value={row.load || ""} onChange={(e) => updateSpecimen(row.id, { load: e.target.value })} />
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Radius (in.)</span>
                    <p className="mt-1 text-sm font-bold text-slate-900">{row.radius || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Area (sq. in.)</span>
                    <p className="mt-1 text-sm font-bold text-slate-900">{row.area || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-500">Strength (psi)</span>
                    <p className="mt-1 text-sm font-bold text-blue-900">{row.compressiveStrength || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-600">% of Design</span>
                    <p className="mt-1 text-sm font-bold text-emerald-800">{row.percentDesignStrength ? `${row.percentDesignStrength}%` : "-"}</p>
                  </div>
                </div>
              </div>
            ))}
            {!(report.specimens || []).length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <p className="text-sm font-semibold text-slate-600">No specimens added yet. Add a specimen to record break results.</p>
                <button type="button" onClick={addSpecimen} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500"><Plus className="h-4 w-4" /> Add Specimen</button>
              </div>
            )}
          </div>
        </section>

        {/* Remarks */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Remarks</span>
            <textarea value={report.remarks || ""} onChange={(e) => updateReport({ remarks: e.target.value })} rows={3} className={`${inputClass} mt-1 py-2 leading-6`} placeholder="Curing conditions, anomalies, retest notes…" />
          </label>
        </section>
      </div>
    </div>
  );
}

export default GroutCubeBreakReport;
