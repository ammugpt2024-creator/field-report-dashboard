import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Save, Send } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  CBR_STATUS,
  CBR_STANDARDS,
  CBR_CONDITIONS,
  CBR_METHODS,
  computeCbrResults,
  createCbrReport,
  formatCbrStatus,
  getCbrReport,
  saveCbrReport
} from "../services/cbrService";
import { openCbrPdf } from "../services/cbrPdfService";

const inputClass = "min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";
const cellClass = "min-h-8 w-full rounded-md border border-slate-300 px-1.5 text-xs font-semibold outline-none focus:border-blue-700";
const SPEC_COLORS = ["#1d4ed8", "#bd5d3a", "#0f766e"];

function Field({ label, children }) {
  return (<label className="block"><span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</span><div className="mt-1">{children}</div></label>);
}
function Stat({ label, value, tone = "slate" }) {
  const tones = { slate: "border-slate-200 bg-slate-50 text-slate-900", blue: "border-blue-200 bg-blue-50 text-blue-900", emerald: "border-emerald-200 bg-emerald-50 text-emerald-800", accent: "border-accent-200 bg-accent-50 text-accent-800" };
  return (<div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}><p className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-70">{label}</p><p className="mt-0.5 text-lg font-bold">{value || "-"}</p></div>);
}
const f = (v, d) => (v == null || v === "" || Number.isNaN(Number(v)) ? "-" : Number(v).toFixed(d));

function niceCeil(v) {
  if (!v || v <= 0) return 500;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

// Load–penetration (stress vs corrected penetration) for every specimen.
function LoadPenetrationCurve({ specimens, labels }) {
  const W = 560, H = 360, ml = 56, mr = 16, mt = 18, mb = 44, gw = W - ml - mr, gh = H - mt - mb;
  const xMax = 0.5;
  let maxUL = 0;
  specimens.forEach((s) => s._r.corrected.forEach((p) => { if (p.unitLoad != null && p.unitLoad > maxUL) maxUL = p.unitLoad; }));
  const yMax = niceCeil(maxUL * 1.05);
  const toX = (pen) => ml + (pen / xMax) * gw;
  const toY = (ul) => mt + gh - (Math.max(0, Math.min(yMax, ul)) / yMax) * gh;
  const xT = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
  const yStep = yMax / 5, yT = [0, 1, 2, 3, 4, 5].map((i) => i * yStep);
  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-center text-sm font-bold text-slate-900">Load – Penetration</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[360px]" style={{ border: "1px solid #cbd5e1", borderRadius: "10px", background: "white" }}>
        {yT.map((p) => <line key={`y${p}`} x1={ml} y1={toY(p)} x2={ml + gw} y2={toY(p)} stroke="#eef2f7" strokeWidth="0.7" />)}
        {xT.map((x) => <line key={`x${x}`} x1={toX(x)} y1={mt} x2={toX(x)} y2={mt + gh} stroke="#eef2f7" strokeWidth="0.7" />)}
        {[0.1, 0.2].map((x) => <line key={`r${x}`} x1={toX(x)} y1={mt} x2={toX(x)} y2={mt + gh} stroke="#94a3b8" strokeWidth="0.7" strokeDasharray="3 3" />)}
        {specimens.map((s, si) => {
          const pts = s._r.corrected.filter((p) => p.unitLoad != null).map((p) => `${toX(p.pen).toFixed(1)},${toY(p.unitLoad).toFixed(1)}`).join(" ");
          return <g key={si}>
            {pts && <polyline points={pts} fill="none" stroke={SPEC_COLORS[si]} strokeWidth="2" strokeLinejoin="round" />}
            {s._r.ul01 != null && <circle cx={toX(0.1)} cy={toY(s._r.ul01)} r="3" fill={SPEC_COLORS[si]} />}
            {s._r.ul02 != null && <circle cx={toX(0.2)} cy={toY(s._r.ul02)} r="3" fill={SPEC_COLORS[si]} />}
          </g>;
        })}
        <rect x={ml} y={mt} width={gw} height={gh} fill="none" stroke="#0f172a" strokeWidth="1" />
        {xT.map((x) => <text key={`xl${x}`} x={toX(x)} y={mt + gh + 13} textAnchor="middle" fontSize="8" fill="#475569">{x.toFixed(x < 0.1 ? 3 : 1)}</text>)}
        {yT.map((p) => <text key={`yl${p}`} x={ml - 5} y={toY(p) + 3} textAnchor="end" fontSize="8" fill="#475569">{Math.round(p)}</text>)}
        <text x={ml + gw / 2} y={H - 5} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a">Penetration (in)</text>
        <text x={14} y={mt + gh / 2} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a" transform={`rotate(-90,14,${mt + gh / 2})`}>Stress (psi)</text>
        {specimens.length > 1 && specimens.map((s, si) => (
          <g key={`lg${si}`}>
            <line x1={ml + 10 + si * 96} y1={mt + 8} x2={ml + 26 + si * 96} y2={mt + 8} stroke={SPEC_COLORS[si]} strokeWidth="2.5" />
            <text x={ml + 30 + si * 96} y={mt + 11} fontSize="8" fontWeight="bold" fill="#334155">{labels[si]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// CBR vs dry density (3-point) with the design read-out at the target density.
function CbrDensityPlot({ densityPoints, targetDensity, designCBR }) {
  const W = 560, H = 360, ml = 56, mr = 16, mt = 18, mb = 44, gw = W - ml - mr, gh = H - mt - mb;
  const dens = densityPoints.map((p) => p.density).concat(targetDensity != null ? [targetDensity] : []);
  const cbrs = densityPoints.map((p) => p.cbr).concat(designCBR != null ? [designCBR] : []);
  if (dens.length < 1) return <div className="flex h-[200px] items-center justify-center text-sm font-semibold text-slate-400">Enter dry density &amp; loads for each point</div>;
  const dMin = Math.min(...dens), dMax = Math.max(...dens);
  const pad = (dMax - dMin) * 0.15 || 2;
  const xMin = dMin - pad, xMax = dMax + pad;
  const yMax = niceCeil(Math.max(...cbrs, 1) * 1.1);
  const toX = (d) => ml + ((d - xMin) / (xMax - xMin)) * gw;
  const toY = (c) => mt + gh - (Math.max(0, Math.min(yMax, c)) / yMax) * gh;
  const yStep = yMax / 5, yT = [0, 1, 2, 3, 4, 5].map((i) => i * yStep);
  const sorted = [...densityPoints].sort((a, b) => a.density - b.density);
  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-center text-sm font-bold text-slate-900">CBR vs Dry Density</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[360px]" style={{ border: "1px solid #cbd5e1", borderRadius: "10px", background: "white" }}>
        {yT.map((c) => <line key={`y${c}`} x1={ml} y1={toY(c)} x2={ml + gw} y2={toY(c)} stroke="#eef2f7" strokeWidth="0.7" />)}
        <polyline points={sorted.map((p) => `${toX(p.density).toFixed(1)},${toY(p.cbr).toFixed(1)}`).join(" ")} fill="none" stroke="#1d4ed8" strokeWidth="2" />
        {sorted.map((p, i) => <circle key={i} cx={toX(p.density)} cy={toY(p.cbr)} r="3.4" fill="#1d4ed8" />)}
        {targetDensity != null && <line x1={toX(targetDensity)} y1={mt} x2={toX(targetDensity)} y2={mt + gh} stroke="#bd5d3a" strokeWidth="1.2" strokeDasharray="4 3" />}
        {targetDensity != null && designCBR != null && <>
          <line x1={ml} y1={toY(designCBR)} x2={toX(targetDensity)} y2={toY(designCBR)} stroke="#bd5d3a" strokeWidth="1.2" strokeDasharray="4 3" />
          <circle cx={toX(targetDensity)} cy={toY(designCBR)} r="4" fill="#bd5d3a" stroke="#7c2d12" strokeWidth="1" />
          <text x={toX(targetDensity) + 6} y={toY(designCBR) - 5} fontSize="8.5" fontWeight="bold" fill="#bd5d3a">Design CBR {designCBR.toFixed(1)}</text>
        </>}
        <rect x={ml} y={mt} width={gw} height={gh} fill="none" stroke="#0f172a" strokeWidth="1" />
        {[xMin, (xMin + xMax) / 2, xMax].map((d, i) => <text key={`xl${i}`} x={toX(d)} y={mt + gh + 13} textAnchor="middle" fontSize="8" fill="#475569">{d.toFixed(1)}</text>)}
        {targetDensity != null && <text x={toX(targetDensity)} y={mt + gh + 24} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#bd5d3a">target {targetDensity.toFixed(1)}</text>}
        {yT.map((c) => <text key={`yl${c}`} x={ml - 5} y={toY(c) + 3} textAnchor="end" fontSize="8" fill="#475569">{Math.round(c)}</text>)}
        <text x={ml + gw / 2} y={H - 5} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a">Dry Density (pcf)</text>
        <text x={14} y={mt + gh / 2} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a" transform={`rotate(-90,14,${mt + gh / 2})`}>CBR (%)</text>
      </svg>
    </div>
  );
}

function SpecimenCard({ spec, r, index, label, color, condition, soakHint, onSpec, onPen }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />
        <h3 className="text-sm font-bold text-slate-950">{label}</h3>
        {r.rerun && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">0.2&quot; governs — re-run advised</span>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Blows / layer"><input type="number" className={inputClass} value={spec.blows || ""} onChange={(e) => onSpec(index, { blows: e.target.value })} /></Field>
        <Field label="Dry Density (pcf)"><input type="number" step="0.1" className={inputClass} value={spec.dryDensity || ""} onChange={(e) => onSpec(index, { dryDensity: e.target.value })} placeholder="e.g. 118.0" /></Field>
        <Field label="Moisture (%)"><input type="number" step="0.1" className={inputClass} value={spec.moisture || ""} onChange={(e) => onSpec(index, { moisture: e.target.value })} /></Field>
        <Field label="Zero Corr. (in)"><input type="number" step="0.001" className={inputClass} value={spec.zeroCorrection || ""} onChange={(e) => onSpec(index, { zeroCorrection: e.target.value })} placeholder={`auto ${r.autoOffset.toFixed(3)}`} /></Field>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-navy-900 text-white"><tr>{["Penetration (in)", "Load (lbf)", "Stress (psi)"].map((h) => <th key={h} className="border-r border-navy-800 px-2 py-1.5 font-bold last:border-r-0">{h}</th>)}</tr></thead>
            <tbody>
              {spec.penetrations.map((row, j) => (
                <tr key={j} className={j % 2 ? "bg-slate-50" : "bg-white"}>
                  <td className="border-r border-t border-slate-200 px-2 py-1 font-bold text-slate-800">{row.pen.toFixed(3)}</td>
                  <td className="border-r border-t border-slate-200 px-1 py-1"><input type="number" step="1" className={`${cellClass} w-24`} value={row.load ?? ""} onChange={(e) => onPen(index, j, e.target.value)} placeholder="0" /></td>
                  <td className="border-t border-slate-200 px-2 py-1 font-semibold text-slate-600">{row.load !== "" && row.load != null && !Number.isNaN(Number(row.load)) ? (Number(row.load) / 3).toFixed(0) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="CBR @ 0.1″" value={r.cbr01 != null ? `${r.cbr01.toFixed(1)}%` : "-"} tone={r.governingAt === 0.1 ? "blue" : "slate"} />
            <Stat label="CBR @ 0.2″" value={r.cbr02 != null ? `${r.cbr02.toFixed(1)}%` : "-"} tone={r.governingAt === 0.2 ? "blue" : "slate"} />
          </div>
          <Stat label="Governing CBR" value={r.governing != null ? `${r.governing.toFixed(1)}%  (@ ${r.governingAt}″)` : "-"} tone="emerald" />
          {condition === "soaked" && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Swell (soaked)</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="Initial dial (in)"><input type="number" step="0.001" className={inputClass} value={spec.swellInitial || ""} onChange={(e) => onSpec(index, { swellInitial: e.target.value })} /></Field>
                <Field label="Final dial (in)"><input type="number" step="0.001" className={inputClass} value={spec.swellFinal || ""} onChange={(e) => onSpec(index, { swellFinal: e.target.value })} /></Field>
              </div>
              <p className="mt-2 text-sm font-bold text-slate-900">Swell = {r.swell != null ? `${r.swell.toFixed(2)}%` : "-"} <span className="font-semibold text-slate-400">{soakHint}</span></p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CbrReportPage() {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const { profile } = useAuth();
  const [report, setReport] = useState(null);

  useEffect(() => {
    const existing = reportId && reportId !== "new" ? getCbrReport(reportId) : null;
    setReport(existing || createCbrReport({ technicianName: profile?.full_name || "" }));
  }, [reportId, profile?.full_name]);
  if (!report) return null;
  const res = computeCbrResults(report);

  function persist(next) { const saved = saveCbrReport(next); setReport(saved); return saved; }
  function update(patch) { persist({ ...report, ...patch }); }
  function updateSpec(i, patch) { update({ specimens: report.specimens.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }); }
  function updatePen(i, j, load) { update({ specimens: report.specimens.map((s, idx) => (idx === i ? { ...s, penetrations: s.penetrations.map((p, k) => (k === j ? { ...p, load } : p)) } : s)) }); }

  const isThree = report.method === "three";
  const labels = res.specimens.map((s, i) => (isThree ? `${s.blows || "?"} blows` : "Specimen"));
  const canSubmit = res.specimens.some((s) => s.penetrations.some((p) => String(p.load || "").trim()));
  function submitReport() { if (!canSubmit) return; persist({ ...report, status: CBR_STATUS.SUBMITTED, submittedAt: new Date().toISOString() }); navigate("/technician/lab/cbr"); }

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1320px] space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 py-6 sm:px-7">
            <button type="button" onClick={() => navigate("/technician/lab/cbr")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-300 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> CBR Reports</button>
            <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-300">Soil · Laboratory · {report.standard}</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">California Bearing Ratio</h1>
                <p className="mt-1 text-xs font-semibold text-slate-300">{report.reportNumber}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">{formatCbrStatus(report.status)}</span>
                <button type="button" onClick={() => persist(report)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"><Save className="h-4 w-4" /> Save</button>
                <button type="button" onClick={() => openCbrPdf({ ...report, _res: res })} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"><Download className="h-4 w-4" /> PDF</button>
                <button type="button" onClick={submitReport} disabled={!canSubmit} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-accent-500 px-4 text-sm font-bold text-white shadow-lg shadow-accent-950/30 transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"><Send className="h-4 w-4" /> Submit</button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-950">Report Information</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Client Name"><input className={inputClass} value={report.clientName || ""} onChange={(e) => update({ clientName: e.target.value })} /></Field>
            <Field label="Project Name"><input className={inputClass} value={report.projectName || ""} onChange={(e) => update({ projectName: e.target.value })} /></Field>
            <Field label="Project Number"><input className={inputClass} value={report.projectNumber || ""} onChange={(e) => update({ projectNumber: e.target.value })} /></Field>
            <Field label="Report Date"><input type="date" className={inputClass} value={report.reportDate || ""} onChange={(e) => update({ reportDate: e.target.value })} /></Field>
            <Field label="Sample Number"><input className={inputClass} value={report.sampleNumber || ""} onChange={(e) => update({ sampleNumber: e.target.value })} placeholder="e.g. B-1 (S-2)" /></Field>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Standard"><select className={inputClass} value={report.standard} onChange={(e) => update({ standard: e.target.value })}>{CBR_STANDARDS.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
            <Field label="Condition"><select className={inputClass} value={report.condition} onChange={(e) => update({ condition: e.target.value })}>{CBR_CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
            <Field label="Method"><select className={inputClass} value={report.method} onChange={(e) => update({ method: e.target.value })}>{CBR_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Piston Area (in²)"><input type="number" step="0.01" className={inputClass} value={report.pistonArea || ""} onChange={(e) => update({ pistonArea: e.target.value })} /></Field>
            <Field label="Specimen Height (in)"><input type="number" step="0.001" className={inputClass} value={report.specimenHeight || ""} onChange={(e) => update({ specimenHeight: e.target.value })} /></Field>
            {isThree && <Field label="Max Dry Density (pcf)"><input type="number" step="0.1" className={inputClass} value={report.maxDryDensity || ""} onChange={(e) => update({ maxDryDensity: e.target.value })} placeholder="from Proctor" /></Field>}
            {isThree && <Field label="Target Compaction (%)"><input type="number" step="0.5" className={inputClass} value={report.targetCompaction || ""} onChange={(e) => update({ targetCompaction: e.target.value })} /></Field>}
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-400">Standard loads: 1000 psi @ 0.1″, 1500 psi @ 0.2″. CBR = corrected stress ÷ standard × 100.</p>
        </section>

        {res.specimens.map((s, i) => (
          <SpecimenCard key={s.id} spec={report.specimens[i]} r={s._r} index={i} label={isThree ? `Point ${i + 1} — ${s.blows || "?"} blows/layer` : "Specimen"} color={SPEC_COLORS[i]} condition={report.condition} soakHint={report.condition === "soaked" ? `over ${report.specimenHeight || "?"}″ height` : ""} onSpec={updateSpec} onPen={updatePen} />
        ))}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className={`grid grid-cols-1 gap-4 ${isThree ? "lg:grid-cols-2" : ""}`}>
            <LoadPenetrationCurve specimens={res.specimens} labels={labels} />
            {isThree && <CbrDensityPlot densityPoints={res.densityPoints} targetDensity={res.targetDensity} designCBR={res.designCBR} />}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Design CBR" value={res.designCBR != null ? `${res.designCBR.toFixed(1)}%` : "-"} tone="accent" />
            <Stat label="Condition" value={CBR_CONDITIONS.find((c) => c.value === report.condition)?.label} />
            <Stat label="Method" value={CBR_METHODS.find((m) => m.value === report.method)?.label} />
            <Stat label="Standard" value={report.standard} tone="emerald" />
          </div>
          {isThree && <p className="mt-2 text-[11px] font-semibold text-slate-400">Design CBR read from the CBR–density curve at {report.targetCompaction || "?"}% of max dry density{res.targetDensity != null ? ` (${res.targetDensity.toFixed(1)} pcf)` : ""}.</p>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="block"><span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Notes</span><textarea value={report.remarks || ""} onChange={(e) => update({ remarks: e.target.value })} rows={2} className={`${inputClass} mt-1 min-h-16 py-2 leading-6`} /></label>
        </section>
      </div>
    </div>
  );
}

export default CbrReportPage;
