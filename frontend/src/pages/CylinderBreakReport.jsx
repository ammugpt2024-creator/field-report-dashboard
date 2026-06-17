import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FlaskConical, Link2, Plus, Save, Search, Send, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  BREAK_AGES,
  CYLINDER_BREAK_STATUS,
  CYLINDER_TYPES,
  FRACTURE_TYPES,
  computeBreakRow,
  createBreakRow,
  createCylinderBreakReport,
  describeBreakPattern,
  formatCylinderBreakStatus,
  generateBreaksFromPattern,
  getCylinderBreak,
  lookupConcreteByCastDate,
  lookupConcreteSet,
  parseBreakPattern,
  parsePsi,
  saveCylinderBreak
} from "../services/labCylinderService";
import { openCylinderBreakPdf } from "../services/cylinderBreakPdfService";

const inputClass = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";

function resultTone(result) {
  const r = String(result || "").toLowerCase();
  if (r === "pass") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (r === "fail") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-500 border-slate-200";
}

function CylinderBreakReport() {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const { profile } = useAuth();
  const [report, setReport] = useState(null);
  const [lookupMode, setLookupMode] = useState("set"); // "set" | "date"
  const [setNumberInput, setSetNumberInput] = useState("");
  const [castDateInput, setCastDateInput] = useState("");
  const [castDateMatches, setCastDateMatches] = useState([]);
  const [lookupState, setLookupState] = useState({ loading: false, message: "" });

  useEffect(() => {
    const existing = reportId ? getCylinderBreak(reportId) : null;
    if (existing) {
      setReport(existing);
      setSetNumberInput(existing.setNumber || "");
    } else {
      setReport(createCylinderBreakReport({ technicianName: profile?.full_name || "" }));
    }
  }, [reportId, profile?.full_name]);

  const specifiedStrengthPsi = useMemo(
    () => report?.specifiedStrengthPsi || parsePsi(report?.specifiedStrength) || "",
    [report?.specifiedStrengthPsi, report?.specifiedStrength]
  );

  if (!report) return null;

  function persist(next) {
    const saved = saveCylinderBreak(next);
    setReport(saved);
    return saved;
  }

  function updateReport(patch) {
    persist({ ...report, ...patch, status: report.status === CYLINDER_BREAK_STATUS.APPROVED ? report.status : report.status });
  }

  function applyLink(result) {
    persist({
      ...report,
      setNumber: result.setNumber,
      logId: result.logId,
      projectName: result.projectName,
      projectNumber: result.projectNumber,
      dfrNumber: result.dfrNumber,
      castDate: result.castDate,
      mixDesign: result.mixDesign,
      specifiedStrength: result.specifiedStrength,
      specifiedStrengthPsi: result.specifiedStrengthPsi,
      labCylinders: result.labCylinders,
      truckNumber: result.truckNumber,
      ticketNumber: result.ticketNumber,
      cubicYards: result.cubicYards,
      placementLocation: result.placementLocation,
      breakPattern: result.breakPattern || report.breakPattern || "",
      breaks: (report.breaks || []).map((row) => ({ ...row, castDate: row.castDate || result.castDate }))
    });
    setSetNumberInput(result.setNumber || "");
    setCastDateMatches([]);
    setLookupState({ loading: false, message: "linked" });
  }

  async function handleLookup() {
    const value = setNumberInput.trim();
    if (!value) return;
    setLookupState({ loading: true, message: "" });
    setCastDateMatches([]);
    try {
      const result = await lookupConcreteSet(value);
      if (!result || result.notFound) {
        setLookupState({ loading: false, message: `No concrete test log found for set number "${value}".` });
        updateReport({ setNumber: value });
        return;
      }
      applyLink(result);
    } catch (error) {
      setLookupState({ loading: false, message: error.message || "Lookup failed." });
    }
  }

  async function handleCastDateLookup() {
    const value = castDateInput.trim();
    if (!value) return;
    setLookupState({ loading: true, message: "" });
    setCastDateMatches([]);
    try {
      const matches = await lookupConcreteByCastDate(value);
      if (!matches.length) {
        setLookupState({ loading: false, message: `No concrete deliveries found cast on ${value}.` });
        return;
      }
      if (matches.length === 1) {
        applyLink(matches[0]);
        return;
      }
      setCastDateMatches(matches);
      setLookupState({ loading: false, message: "" });
    } catch (error) {
      setLookupState({ loading: false, message: error.message || "Lookup failed." });
    }
  }

  const defaultCylinderType = report.defaultCylinderType || CYLINDER_TYPES[0].label;

  function addBreak() {
    updateReport({ breaks: [...(report.breaks || []), createBreakRow({ castDate: report.castDate, cylinderType: defaultCylinderType })] });
  }

  function generateFromPattern() {
    const rows = generateBreaksFromPattern(report.breakPattern, { castDate: report.castDate, cylinderType: defaultCylinderType });
    if (!rows.length) return;
    // Append the scheduled cylinders to whatever is already there.
    updateReport({ breaks: [...(report.breaks || []), ...rows] });
  }

  // Cast date and cylinder type are shared across the whole set — editing them
  // here updates every cylinder and recomputes break dates, areas and strengths.
  function updateDefaults(patch) {
    const next = { ...report, ...patch };
    const castDate = "castDate" in patch ? patch.castDate : report.castDate;
    const cylinderType = patch.defaultCylinderType || defaultCylinderType;
    next.breaks = (report.breaks || []).map((row) =>
      computeBreakRow({ ...row, castDate, cylinderType }, { specifiedStrengthPsi })
    );
    persist(next);
  }

  function updateBreak(rowId, patch) {
    updateReport({
      breaks: (report.breaks || []).map((row) =>
        row.id === rowId ? computeBreakRow({ ...row, ...patch }, { specifiedStrengthPsi }) : row
      )
    });
  }

  function deleteBreak(rowId) {
    updateReport({ breaks: (report.breaks || []).filter((row) => row.id !== rowId) });
  }

  // Unique break dates for the "generate PDF by break date" option.
  const breakDates = Array.from(new Set((report.breaks || []).map((row) => row.breakDate).filter(Boolean))).sort();

  // Break schedule pulled from the concrete log (e.g. "7x1, 28x2").
  const patternEntries = parseBreakPattern(report.breakPattern);
  const patternCount = patternEntries.reduce((sum, entry) => sum + entry.count, 0);
  const patternSummary = describeBreakPattern(report.breakPattern);

  function exportPdf(breakDate = "") {
    const scoped = breakDate
      ? { ...report, breaks: (report.breaks || []).filter((row) => row.breakDate === breakDate) }
      : report;
    openCylinderBreakPdf(scoped);
  }

  const canSubmit = Boolean(report.setNumber && (report.breaks || []).length > 0 && report.projectName);

  function submitReport() {
    if (!canSubmit) return;
    persist({ ...report, status: CYLINDER_BREAK_STATUS.SUBMITTED, submittedAt: new Date().toISOString() });
    navigate("/technician/lab/cylinder-break");
  }

  const isLinked = Boolean(report.logId || report.projectName);

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1200px] space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 py-5 sm:px-7">
            <button type="button" onClick={() => navigate("/technician/lab/cylinder-break")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Cylinder Break Reports
            </button>
            <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Concrete · Laboratory</p>
                <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Cylinder Break Report</h1>
                <p className="mt-1 text-xs font-semibold text-slate-400">{report.reportNumber}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
                  {formatCylinderBreakStatus(report.status)}
                </span>
                <button type="button" onClick={() => persist(report)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-700 px-4 text-sm font-bold text-white hover:bg-slate-900"><Save className="h-4 w-4" /> Save</button>
                <button type="button" onClick={() => exportPdf()} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-700 px-4 text-sm font-bold text-white hover:bg-slate-900"><Download className="h-4 w-4" /> PDF</button>
                <button type="button" onClick={submitReport} disabled={!canSubmit} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-accent-500 px-4 text-sm font-bold text-white hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"><Send className="h-4 w-4" /> Submit</button>
              </div>
            </div>
          </div>
        </section>

        {/* Set number lookup */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Link2 className="h-4 w-4" /></span>
            <h2 className="text-base font-bold text-slate-950">Link to Concrete Test Log</h2>
          </div>
          <p className="mt-1.5 text-sm font-medium text-slate-500">Pull project, truck, mix, cast date, and specified strength from the concrete test log — by set number or cast date.</p>

          <div className="mt-3 inline-flex rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => setLookupMode("set")} className={`min-h-8 rounded-lg px-3 text-xs font-bold ${lookupMode === "set" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}>By Set Number</button>
            <button type="button" onClick={() => setLookupMode("date")} className={`min-h-8 rounded-lg px-3 text-xs font-bold ${lookupMode === "date" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}>By Cast Date</button>
          </div>

          {lookupMode === "set" ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={setNumberInput}
                  onChange={(event) => setSetNumberInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") handleLookup(); }}
                  placeholder="e.g. S-200100-014"
                  className={`${inputClass} pl-9`}
                />
              </div>
              <button type="button" onClick={handleLookup} disabled={lookupState.loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60">
                {lookupState.loading ? "Looking up…" : "Look up set"}
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="date"
                value={castDateInput}
                onChange={(event) => setCastDateInput(event.target.value)}
                className={`${inputClass} flex-1`}
              />
              <button type="button" onClick={handleCastDateLookup} disabled={lookupState.loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60">
                {lookupState.loading ? "Looking up…" : "Find deliveries"}
              </button>
            </div>
          )}

          {lookupState.message && lookupState.message !== "linked" && (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{lookupState.message}</p>
          )}

          {castDateMatches.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{castDateMatches.length} deliveries cast on {castDateInput} — pick the truck</p>
              {castDateMatches.map((match) => (
                <button
                  key={match.setNumber}
                  type="button"
                  onClick={() => applyLink(match)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50/40"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">Set {match.setNumber} · Truck {match.truckNumber || "-"}</p>
                    <p className="text-xs font-medium text-slate-500">{match.projectName} · Mix {match.mixDesign || "-"} · Ticket {match.ticketNumber || "-"}</p>
                  </div>
                  <span className="text-sm font-bold text-blue-700" aria-hidden="true">Select →</span>
                </button>
              ))}
            </div>
          )}
          {isLinked && (
            <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 sm:grid-cols-3">
              {[
                ["Project", report.projectName],
                ["Project Number", report.projectNumber],
                ["DFR No.", report.dfrNumber],
                ["Truck No.", report.truckNumber],
                ["Ticket No.", report.ticketNumber],
                ["Cubic Yards", report.cubicYards],
                ["Mix Design", report.mixDesign],
                ["Date Cast", report.castDate],
                ["Lab Cylinders", report.labCylinders],
                ["Break Pattern", patternSummary || report.breakPattern]
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">{label}</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">{value || "-"}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Shared defaults for the whole set — entered once, applied to every cylinder */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Specified Strength (psi)</span>
              <input type="number" value={specifiedStrengthPsi} onChange={(event) => updateReport({ specifiedStrengthPsi: event.target.value })} className={`${inputClass} mt-1`} placeholder="4000" />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Cast Date (all cylinders)</span>
              <input type="date" value={report.castDate || ""} onChange={(event) => updateDefaults({ castDate: event.target.value })} className={`${inputClass} mt-1`} />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Cylinder Type (all)</span>
              <select value={defaultCylinderType} onChange={(event) => updateDefaults({ defaultCylinderType: event.target.value })} className={`${inputClass} mt-1`}>
                {CYLINDER_TYPES.map((type) => <option key={type.label} value={type.label}>{type.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Tested By</span>
              <input value={report.technicianName || ""} onChange={(event) => updateReport({ technicianName: event.target.value })} className={`${inputClass} mt-1`} />
            </label>
          </div>
        </section>

        {/* Break results */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FlaskConical className="h-4 w-4" /></span>
              <h2 className="text-base font-bold text-slate-950">Compressive Strength Results</h2>
            </div>
            <div className="flex items-center gap-2">
              {breakDates.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(event) => { if (event.target.value) { exportPdf(event.target.value); event.target.value = ""; } }}
                  className="min-h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700"
                  title="Generate a PDF for a specific break date"
                >
                  <option value="">PDF by break date…</option>
                  {breakDates.map((date) => <option key={date} value={date}>{date}</option>)}
                </select>
              )}
              {patternCount > 0 && (
                <button type="button" onClick={generateFromPattern} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-500" title={`Break pattern: ${patternSummary}`}>
                  <Plus className="h-4 w-4" /> Generate {patternCount} from pattern
                </button>
              )}
              <button type="button" onClick={addBreak} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> Add Cylinder</button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {(report.breaks || []).map((row, index) => (
              <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Cylinder {index + 1}</h3>
                  <button type="button" onClick={() => deleteBreak(row.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-bold text-rose-700"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Test Age</span>
                    <select value={row.testAge || ""} onChange={(event) => updateBreak(row.id, { testAge: event.target.value })} className={`${inputClass} mt-1`}>
                      <option value="">Custom date</option>
                      {BREAK_AGES.map((age) => <option key={age} value={age}>{age}-day</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Break Date{row.ageDays ? ` · ${row.ageDays}-day` : ""}</span>
                    <input type="date" value={row.breakDate || ""} disabled={Boolean(row.testAge)} onChange={(event) => updateBreak(row.id, { breakDate: event.target.value })} className={`${inputClass} mt-1 disabled:bg-slate-100 disabled:text-slate-500`} />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Max Load (lbf)</span>
                    <input type="number" value={row.maxLoadLbf || ""} onChange={(event) => updateBreak(row.id, { maxLoadLbf: event.target.value })} className={`${inputClass} mt-1`} />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Dry Density (lbs/ft³)</span>
                    <input type="number" value={row.dryDensity || ""} onChange={(event) => updateBreak(row.id, { dryDensity: event.target.value })} className={`${inputClass} mt-1`} placeholder="optional" />
                  </label>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Strength (psi)</span>
                    <p className="mt-1 text-sm font-bold text-slate-900">{row.strengthPsi || "-"}</p>
                  </div>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Break / Fracture Type</span>
                    <select value={row.fractureType || ""} onChange={(event) => updateBreak(row.id, { fractureType: event.target.value })} className={`${inputClass} mt-1`}>
                      <option value="">Select</option>
                      {FRACTURE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <div className={`flex flex-col justify-center rounded-xl border px-3 py-2 ${resultTone(row.result)}`}>
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-80">Result</span>
                    <p className="mt-0.5 text-lg font-bold">{row.result || "-"}</p>
                  </div>
                </div>
              </div>
            ))}
            {!(report.breaks || []).length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <p className="text-sm font-semibold text-slate-600">
                  {patternCount > 0
                    ? `This set's break pattern is ${patternSummary}. Generate the ${patternCount} scheduled cylinders, or add them manually.`
                    : "No cylinders added yet. Look up a set number, then add cylinders to record break results."}
                </p>
                {patternCount > 0 && (
                  <button type="button" onClick={generateFromPattern} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500">
                    <Plus className="h-4 w-4" /> Generate {patternCount} cylinders from pattern
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Remarks */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Remarks</span>
            <textarea value={report.remarks || ""} onChange={(event) => updateReport({ remarks: event.target.value })} rows={3} className={`${inputClass} mt-1 py-2 leading-6`} placeholder="Curing conditions, capping method, anomalies, retest notes…" />
          </label>
        </section>
      </div>
    </div>
  );
}

export default CylinderBreakReport;
