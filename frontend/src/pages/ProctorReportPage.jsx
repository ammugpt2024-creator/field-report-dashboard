import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Plus, Save, Send, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  PROCTOR_METHODS,
  PROCTOR_STATUS,
  addProctorPoint,
  applyMethodPreset,
  classifySoil,
  computeAtterberg,
  computeProctorResults,
  computeSievePassing,
  createProctorReport,
  evalPoly,
  formatProctorStatus,
  getProctorReport,
  saveProctorReport,
  zavDensity
} from "../services/proctorService";
import { openProctorPdf } from "../services/proctorPdfService";

const inputClass = "min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Stat({ label, value, unit, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800"
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-70">{label}</p>
      <p className="mt-0.5 text-lg font-bold">{value || "-"}{value && unit ? <span className="ml-1 text-xs font-semibold opacity-70">{unit}</span> : null}</p>
    </div>
  );
}

// Live moisture-density curve: proctor curve, corrected curve, ZAV line, peaks.
function MoistureDensityChart({ results, gs }) {
  const W = 560, H = 440, ml = 50, mr = 16, mt = 16, mb = 46;
  const gw = W - ml - mr, gh = H - mt - mb;
  const xMin = 0, xMax = 25, yMin = 100, yMax = 175;
  const toX = (w) => ml + (w - xMin) / (xMax - xMin) * gw;
  const toY = (d) => mt + gh - (d - yMin) / (yMax - yMin) * gh;
  const clampY = (d) => Math.max(yMin, Math.min(yMax, d));

  const samplePoly = (fit, range) => {
    if (!fit || !range) return "";
    const [a, b] = range;
    let path = "";
    const N = 60;
    for (let i = 0; i <= N; i += 1) {
      const x = a + (b - a) * (i / N);
      const y = evalPoly(fit, x);
      if (y == null || y < yMin - 20 || y > yMax + 20) { path += ""; continue; }
      path += `${i === 0 ? "M" : "L"} ${toX(x).toFixed(1)} ${toY(clampY(y)).toFixed(1)} `;
    }
    return path.trim();
  };
  // ZAV line
  let zav = "";
  for (let i = 0; i <= 50; i += 1) {
    const x = xMin + (xMax - xMin) * (i / 50);
    const y = zavDensity(x, gs);
    if (y == null) continue;
    if (y > yMax + 30 || y < yMin) { zav += ""; continue; }
    zav += `${zav ? "L" : "M"} ${toX(x).toFixed(1)} ${toY(clampY(y)).toFixed(1)} `;
  }

  const xTicks = []; for (let x = 0; x <= 25; x += 5) xTicks.push(x);
  const yTicks = []; for (let y = 100; y <= 175; y += 5) yTicks.push(y);
  const finePath = samplePoly(results.fit, results.fineRange);
  const corrPath = samplePoly(results.corrFit, results.corrRange);

  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-center text-sm font-bold text-slate-900">Moisture-Density Curves</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[360px]" style={{ border: "1px solid #cbd5e1", borderRadius: "12px", background: "white" }}>
        {xTicks.map((x) => <line key={`gx${x}`} x1={toX(x)} y1={mt} x2={toX(x)} y2={mt + gh} stroke="#eef2f7" strokeWidth="0.6" />)}
        {yTicks.map((y) => <line key={`gy${y}`} x1={ml} y1={toY(y)} x2={ml + gw} y2={toY(y)} stroke="#eef2f7" strokeWidth="0.6" />)}

        {zav && <path d={zav} fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" />}
        {corrPath && <path d={corrPath} fill="none" stroke="#bd5d3a" strokeWidth="2.2" strokeLinejoin="round" />}
        {finePath && <path d={finePath} fill="none" stroke="#1c2f4a" strokeWidth="2.4" strokeLinejoin="round" />}

        {/* corrected points (triangles) */}
        {results.corrPoints.map((p, i) => (
          <path key={`cp${i}`} d={`M ${toX(p.x)} ${toY(clampY(p.y)) - 3.5} L ${toX(p.x) + 3.2} ${toY(clampY(p.y)) + 2.6} L ${toX(p.x) - 3.2} ${toY(clampY(p.y)) + 2.6} Z`} fill="#bd5d3a" />
        ))}
        {/* fine points (dots) */}
        {results.finePoints.map((p, i) => (
          <circle key={`fp${i}`} cx={toX(p.x)} cy={toY(clampY(p.y))} r="3" fill="#1c2f4a" />
        ))}
        {/* peaks */}
        {results.omc != null && results.mdd != null && (
          <circle cx={toX(results.omc)} cy={toY(clampY(results.mdd))} r="4.5" fill="none" stroke="#1c2f4a" strokeWidth="1.6" />
        )}
        {results.correctedOmc != null && results.correctedMdd != null && (
          <circle cx={toX(results.correctedOmc)} cy={toY(clampY(results.correctedMdd))} r="4.5" fill="none" stroke="#bd5d3a" strokeWidth="1.6" />
        )}

        <rect x={ml} y={mt} width={gw} height={gh} fill="none" stroke="#0f172a" strokeWidth="1" />
        {xTicks.map((x) => <text key={`xt${x}`} x={toX(x)} y={mt + gh + 14} textAnchor="middle" fontSize="8" fill="#475569">{x.toFixed(1)}</text>)}
        {yTicks.filter((_, i) => i % 1 === 0).map((y) => <text key={`yt${y}`} x={ml - 5} y={toY(y) + 3} textAnchor="end" fontSize="8" fill="#475569">{y}</text>)}
        <text x={ml + gw / 2} y={H - 6} textAnchor="middle" fontSize="9.5" fontWeight="bold" fill="#0f172a">Moisture Content, %</text>
        <text x={12} y={mt + gh / 2} textAnchor="middle" fontSize="9.5" fontWeight="bold" fill="#0f172a" transform={`rotate(-90, 12, ${mt + gh / 2})`}>Dry Unit Weight, pcf</text>
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-600">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-navy-800" /> Proctor curve</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-accent-500" /> Corrected curve</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-0 w-4 border-t border-dashed border-slate-400" /> Zero air voids (Gs {gs || "—"})</span>
      </div>
    </div>
  );
}

function ProctorReportPage() {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const { profile } = useAuth();
  const [report, setReport] = useState(null);

  useEffect(() => {
    const existing = reportId && reportId !== "new" ? getProctorReport(reportId) : null;
    setReport(existing || createProctorReport({ technicianName: profile?.full_name || "" }));
  }, [reportId, profile?.full_name]);

  if (!report) return null;

  const results = computeProctorResults(report);
  const sieveRows = computeSievePassing(report.sieves, report.sieveTotalWeight);
  const att = computeAtterberg(report.atterberg);
  const cls = classifySoil({ sieveRows, ll: att.ll, pi: att.pi, organic: report.organic });

  function persist(next) { const saved = saveProctorReport(next); setReport(saved); return saved; }
  function update(patch) { persist({ ...report, ...patch }); }
  function updatePoint(i, patch) {
    update({ points: report.points.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
  }
  function updateSieve(i, retained) {
    update({ sieves: report.sieves.map((s, idx) => (idx === i ? { ...s, retained } : s)) });
  }
  function updateAtt(patch) { update({ atterberg: { ...report.atterberg, ...patch } }); }
  function updateLl(i, patch) { updateAtt({ llTrials: report.atterberg.llTrials.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) }); }
  function updatePl(i, patch) { updateAtt({ plTrials: report.atterberg.plTrials.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) }); }

  const canSubmit = Boolean(report.points.some((p) => String(p.wtSoilMold || "").trim()));
  function submitReport() {
    if (!canSubmit) return;
    persist({ ...report, status: PROCTOR_STATUS.SUBMITTED, submittedAt: new Date().toISOString() });
    navigate("/technician/lab/proctor");
  }

  const cp = results.computedPoints;

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1320px] space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 py-6 sm:px-7">
            <button type="button" onClick={() => navigate("/technician/lab/proctor")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-300 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Proctor Reports
            </button>
            <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-300">Soil · Laboratory · {report.methodId}</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">Moisture-Density (Proctor)</h1>
                <p className="mt-1 text-xs font-semibold text-slate-300">{report.reportNumber}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">{formatProctorStatus(report.status)}</span>
                <button type="button" onClick={() => persist(report)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"><Save className="h-4 w-4" /> Save</button>
                <button type="button" onClick={() => openProctorPdf({ ...report, _results: results, _sieveRows: sieveRows, _att: att, _cls: cls })} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"><Download className="h-4 w-4" /> PDF</button>
                <button type="button" onClick={submitReport} disabled={!canSubmit} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-accent-500 px-4 text-sm font-bold text-white shadow-lg shadow-accent-950/30 transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"><Send className="h-4 w-4" /> Submit</button>
              </div>
            </div>
          </div>
        </section>

        {/* Report info */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-950">Report Information</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Project Name"><input className={inputClass} value={report.projectName || ""} onChange={(e) => update({ projectName: e.target.value })} /></Field>
            <Field label="Project Number"><input className={inputClass} value={report.projectNumber || ""} onChange={(e) => update({ projectNumber: e.target.value })} /></Field>
            <Field label="Boring / Sample No."><input className={inputClass} value={report.boringNumber || ""} onChange={(e) => update({ boringNumber: e.target.value })} placeholder="e.g. S-1 @ 0.0'-2.0'" /></Field>
            <Field label="Date"><input type="date" className={inputClass} value={report.date || ""} onChange={(e) => update({ date: e.target.value })} /></Field>
          </div>
        </section>

        {/* Method & test parameters */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-950">Test Method &amp; Parameters</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Test Method">
              <select className={inputClass} value={report.methodId} onChange={(e) => persist(applyMethodPreset(report, e.target.value))}>
                {PROCTOR_METHODS.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
              </select>
            </Field>
            <Field label="Mold Weight (g)"><input type="number" className={inputClass} value={report.moldWt || ""} onChange={(e) => update({ moldWt: e.target.value })} placeholder="e.g. 6510" /></Field>
            <Field label="Mold Correction Factor"><input type="number" step="0.00001" className={inputClass} value={report.moldFactor || ""} onChange={(e) => update({ moldFactor: e.target.value })} /></Field>
            <Field label="Mold Size (in)"><input type="number" className={inputClass} value={report.moldIn || ""} onChange={(e) => update({ moldIn: e.target.value })} /></Field>
            <Field label="Hammer Wt (lb)"><input type="number" className={inputClass} value={report.hammerLb || ""} onChange={(e) => update({ hammerLb: e.target.value })} /></Field>
            <Field label="Hammer Drop (in)"><input type="number" className={inputClass} value={report.dropIn || ""} onChange={(e) => update({ dropIn: e.target.value })} /></Field>
            <Field label="No. Layers"><input type="number" className={inputClass} value={report.layers || ""} onChange={(e) => update({ layers: e.target.value })} /></Field>
            <Field label="Blows / Layer"><input type="number" className={inputClass} value={report.blows || ""} onChange={(e) => update({ blows: e.target.value })} /></Field>
            <Field label="Sieve Used for Correction"><input className={inputClass} value={report.sieveUsed || ""} onChange={(e) => update({ sieveUsed: e.target.value })} /></Field>
            <Field label="Gs Retained Material"><input type="number" step="0.01" className={inputClass} value={report.gs || ""} onChange={(e) => update({ gs: e.target.value })} placeholder="e.g. 2.95" /></Field>
            <Field label="Retained for Correction (%)"><input type="number" step="0.1" className={inputClass} value={report.percentRetained || ""} onChange={(e) => update({ percentRetained: e.target.value })} placeholder="e.g. 20.4" /></Field>
            <Field label="+4 OMC (%)"><input type="number" step="0.1" className={inputClass} value={report.oversizeMoisture || ""} onChange={(e) => update({ oversizeMoisture: e.target.value })} placeholder="e.g. 2.5" /></Field>
          </div>
          {results.hasOversize && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">{report.percentRetained}% retained on {report.sieveUsed} exceeds 5% — oversize (ASTM D4718) correction applied.</p>}
        </section>

        {/* Proctor points + results + chart */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-950">Compaction Points</h2>
            <button type="button" onClick={() => persist(addProctorPoint(report))} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> Add Point</button>
          </div>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[860px] border-collapse text-left text-xs">
              <thead className="bg-navy-900 text-white">
                <tr>
                  {["#", "Wt Soil+Mold (g)", "Wt Soil (g)", "Wet Density (pcf)", "Tare (g)", "Wet (g)", "Dry (g)", "Moisture (%)", "Dry Density (pcf)", "TMC (%)", "TDD (pcf)", ""].map((h) => (
                    <th key={h} className="border-r border-navy-800 px-2 py-2 font-bold last:border-r-0 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.points.map((p, i) => (
                  <tr key={p.id} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                    <td className="border-t border-slate-200 px-2 py-1 font-bold text-slate-700">{i + 1}</td>
                    <td className="border-t border-slate-200 px-1 py-1"><input type="number" className="min-h-8 w-24 rounded-md border border-slate-300 px-1.5 text-xs font-semibold outline-none focus:border-blue-700" value={p.wtSoilMold || ""} onChange={(e) => updatePoint(i, { wtSoilMold: e.target.value })} /></td>
                    <td className="border-t border-slate-200 px-2 py-1 font-semibold text-slate-500">{cp[i]?.wetSoil || "-"}</td>
                    <td className="border-t border-slate-200 px-2 py-1 font-bold text-slate-800">{cp[i]?.wetDensity || "-"}</td>
                    <td className="border-t border-slate-200 px-1 py-1"><input type="number" step="0.01" className="min-h-8 w-16 rounded-md border border-slate-300 px-1.5 text-xs font-semibold outline-none focus:border-blue-700" value={p.tare || ""} onChange={(e) => updatePoint(i, { tare: e.target.value })} /></td>
                    <td className="border-t border-slate-200 px-1 py-1"><input type="number" step="0.01" className="min-h-8 w-20 rounded-md border border-slate-300 px-1.5 text-xs font-semibold outline-none focus:border-blue-700" value={p.wet || ""} onChange={(e) => updatePoint(i, { wet: e.target.value })} /></td>
                    <td className="border-t border-slate-200 px-1 py-1"><input type="number" step="0.01" className="min-h-8 w-20 rounded-md border border-slate-300 px-1.5 text-xs font-semibold outline-none focus:border-blue-700" value={p.dry || ""} onChange={(e) => updatePoint(i, { dry: e.target.value })} /></td>
                    <td className="border-t border-slate-200 px-2 py-1 font-bold text-blue-800">{cp[i]?.moisture || "-"}</td>
                    <td className="border-t border-slate-200 px-2 py-1 font-bold text-navy-800">{cp[i]?.dryDensity || "-"}</td>
                    <td className="border-t border-slate-200 px-2 py-1 font-semibold text-amber-700">{cp[i]?.tmc || "-"}</td>
                    <td className="border-t border-slate-200 px-2 py-1 font-semibold text-amber-700">{cp[i]?.tdd || "-"}</td>
                    <td className="border-t border-slate-200 px-1 py-1">{report.points.length > 1 && <button type="button" onClick={() => update({ points: report.points.filter((_, idx) => idx !== i) })} className="text-rose-600 hover:text-rose-800"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
            <MoistureDensityChart results={results} gs={report.gs} />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Max Dry Density" value={results.mdd != null ? results.mdd.toFixed(1) : ""} unit="pcf" tone="blue" />
                <Stat label="Optimum Moisture" value={results.omc != null ? results.omc.toFixed(1) : ""} unit="%" tone="blue" />
                <Stat label="Corrected MDD" value={results.correctedMdd != null ? results.correctedMdd.toFixed(1) : ""} unit="pcf" tone="emerald" />
                <Stat label="Corrected OMC" value={results.correctedOmc != null ? results.correctedOmc.toFixed(1) : ""} unit="%" tone="emerald" />
              </div>
              <Field label="Natural Moisture (%)"><input type="number" step="0.1" className={inputClass} value={report.naturalMoisture || ""} onChange={(e) => update({ naturalMoisture: e.target.value })} placeholder="e.g. 5.1" /></Field>
            </div>
          </div>
        </section>

        {/* Sieve analysis */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-950">Sieve Analysis</h2>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">Total Sample Wt (g)
              <input type="number" step="0.01" className="min-h-8 w-28 rounded-md border border-slate-300 px-2 text-xs font-semibold outline-none focus:border-blue-700" value={report.sieveTotalWeight || ""} onChange={(e) => update({ sieveTotalWeight: e.target.value })} />
            </label>
          </div>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-navy-900 text-white"><tr>
                <th className="border-r border-navy-800 px-2 py-2 font-bold">Sieve</th>
                <th className="border-r border-navy-800 px-2 py-2 font-bold">Wt Retained (g)</th>
                <th className="border-r border-navy-800 px-2 py-2 font-bold">Cumulative Retained (g)</th>
                <th className="px-2 py-2 font-bold">% Passing</th>
              </tr></thead>
              <tbody>
                {sieveRows.map((row, i) => (
                  <tr key={row.label} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                    <td className="border-r border-t border-slate-200 px-2 py-1 font-bold text-slate-800">{row.label}</td>
                    <td className="border-r border-t border-slate-200 px-1 py-1"><input type="number" step="0.01" className="min-h-8 w-24 rounded-md border border-slate-300 px-1.5 text-xs font-semibold outline-none focus:border-blue-700" value={report.sieves[i]?.retained ?? ""} onChange={(e) => updateSieve(i, e.target.value)} placeholder="0.0" /></td>
                    <td className="border-r border-t border-slate-200 px-2 py-1 font-semibold text-slate-600">{row.cumulativeRetained.toFixed(2)}</td>
                    <td className="border-t border-slate-200 px-2 py-1 font-bold text-blue-800">{row.percentPassing != null ? row.percentPassing.toFixed(1) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Atterberg limits */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-950">Atterberg Limits</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><input type="checkbox" checked={report.atterberg.nonPlastic} onChange={(e) => updateAtt({ nonPlastic: e.target.checked })} /> Non-Plastic (NP)</label>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">LL trial to use
                <select className="min-h-8 rounded-md border border-slate-300 px-2 text-xs font-semibold" value={report.atterberg.llTrialToUse} onChange={(e) => updateAtt({ llTrialToUse: e.target.value })}><option value="A">A</option><option value="B">B</option></select>
              </label>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Liquid Limit</p>
              <div className="mt-2 space-y-2">
                {report.atterberg.llTrials.map((t, i) => (
                  <div key={t.id} className="grid grid-cols-5 gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="col-span-5 text-[11px] font-bold text-slate-500">Trial {i === 0 ? "A" : "B"} · MC {att.llTrials[i]?.moisture != null ? att.llTrials[i].moisture.toFixed(1) : "-"}% · Corr LL {att.llTrials[i]?.corrected != null ? att.llTrials[i].corrected.toFixed(0) : "-"}</div>
                    <input type="number" className="min-h-8 rounded-md border border-slate-300 px-1.5 text-xs font-semibold" placeholder="Blows" value={t.blows || ""} onChange={(e) => updateLl(i, { blows: e.target.value })} />
                    <input type="number" step="0.01" className="min-h-8 rounded-md border border-slate-300 px-1.5 text-xs font-semibold" placeholder="Tare+Wet" value={t.tareWet || ""} onChange={(e) => updateLl(i, { tareWet: e.target.value })} />
                    <input type="number" step="0.01" className="min-h-8 rounded-md border border-slate-300 px-1.5 text-xs font-semibold" placeholder="Tare+Dry" value={t.tareDry || ""} onChange={(e) => updateLl(i, { tareDry: e.target.value })} />
                    <input type="number" step="0.01" className="min-h-8 rounded-md border border-slate-300 px-1.5 text-xs font-semibold" placeholder="Tare" value={t.tare || ""} onChange={(e) => updateLl(i, { tare: e.target.value })} />
                    <div />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Plastic Limit</p>
              <div className="mt-2 space-y-2">
                {report.atterberg.plTrials.map((t, i) => (
                  <div key={t.id} className="grid grid-cols-4 gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="col-span-4 text-[11px] font-bold text-slate-500">Trial {i === 0 ? "A" : "B"} · PL {att.plTrials[i]?.moisture != null ? att.plTrials[i].moisture.toFixed(0) : "-"}</div>
                    <input type="number" step="0.01" className="min-h-8 rounded-md border border-slate-300 px-1.5 text-xs font-semibold" placeholder="Tare+Wet" value={t.tareWet || ""} onChange={(e) => updatePl(i, { tareWet: e.target.value })} />
                    <input type="number" step="0.01" className="min-h-8 rounded-md border border-slate-300 px-1.5 text-xs font-semibold" placeholder="Tare+Dry" value={t.tareDry || ""} onChange={(e) => updatePl(i, { tareDry: e.target.value })} />
                    <input type="number" step="0.01" className="min-h-8 rounded-md border border-slate-300 px-1.5 text-xs font-semibold" placeholder="Tare" value={t.tare || ""} onChange={(e) => updatePl(i, { tare: e.target.value })} />
                    <div />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Liquid Limit" value={att.ll != null ? String(att.ll) : (att.nonPlastic ? "NP" : "")} />
            <Stat label="Plastic Limit" value={att.pl != null ? String(att.pl) : (att.nonPlastic ? "NP" : "")} />
            <Stat label="Plasticity Index" value={att.pi != null ? String(att.pi) : ""} />
          </div>
        </section>

        {/* Soil classification */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-950">Soil Classification</h2>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><input type="checkbox" checked={report.organic} onChange={(e) => update({ organic: e.target.checked })} /> Organic</label>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="% Finer No. 200" value={cls.finesPct != null ? cls.finesPct.toFixed(1) : ""} unit="%" />
            <Stat label="Suggested USCS" value={cls.uscs} tone="blue" />
            <Stat label="Suggested AASHTO" value={cls.aashto} tone="blue" />
            <Field label="Custom Classification (override)"><input className={inputClass} value={report.customClassification || ""} onChange={(e) => update({ customClassification: e.target.value })} placeholder="optional" /></Field>
          </div>
        </section>

        {/* Remarks */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Remarks</span>
            <textarea value={report.remarks || ""} onChange={(e) => update({ remarks: e.target.value })} rows={3} className={`${inputClass} mt-1 min-h-20 py-2 leading-6`} placeholder="Curve notes, classification basis, observations…" />
          </label>
        </section>
      </div>
    </div>
  );
}

export default ProctorReportPage;
