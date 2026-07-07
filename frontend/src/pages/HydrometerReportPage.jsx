import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Plus, Save, Send, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  HYDROMETER_STATUS,
  addHydrometerReading,
  computeHydrometerResults,
  createHydrometerReport,
  formatHydrometerStatus,
  getHydrometerReport,
  saveHydrometerReport
} from "../services/hydrometerService";
import { openHydrometerPdf } from "../services/hydrometerPdfService";

const inputClass = "min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";
const cellClass = "min-h-8 w-full rounded-md border border-slate-300 px-1.5 text-xs font-semibold outline-none focus:border-blue-700";

function Field({ label, children }) {
  return (<label className="block"><span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</span><div className="mt-1">{children}</div></label>);
}
function Stat({ label, value, tone = "slate" }) {
  const tones = { slate: "border-slate-200 bg-slate-50 text-slate-900", blue: "border-blue-200 bg-blue-50 text-blue-900", emerald: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  return (<div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}><p className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-70">{label}</p><p className="mt-0.5 text-lg font-bold">{value || "-"}</p></div>);
}
const f = (v, d) => (v == null || v === "" || Number.isNaN(Number(v)) ? "-" : Number(v).toFixed(d));

// Combined particle-size distribution curve (sieve + hydrometer), log x.
function GradationCurve({ curve }) {
  const W = 560, H = 380, ml = 50, mr = 16, mt = 26, mb = 46, gw = W - ml - mr, gh = H - mt - mb;
  const toX = (mm) => ml + (2 - Math.log10(mm)) / 5 * gw;  // 100 mm .. 0.001 mm
  const toY = (p) => mt + gh - (Math.max(0, Math.min(100, p)) / 100) * gh;
  const decades = [100, 10, 1, 0.1, 0.01, 0.001];
  const minors = []; for (let d = 1; d >= -3; d -= 1) for (let k = 2; k <= 9; k += 1) minors.push(k * Math.pow(10, d));
  const refs = [{ l: "3\"", mm: 76.2 }, { l: "3/4\"", mm: 19 }, { l: "No.4", mm: 4.75 }, { l: "No.40", mm: 0.425 }, { l: "No.200", mm: 0.075 }];
  const pts = (curve || []).map((c) => ({ x: toX(c.mm), y: toY(c.pct) }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const yT = []; for (let p = 0; p <= 100; p += 10) yT.push(p);
  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-center text-sm font-bold text-slate-900">Particle Size Analysis</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[360px]" style={{ border: "1px solid #cbd5e1", borderRadius: "10px", background: "white" }}>
        {minors.map((mm, i) => <line key={`m${i}`} x1={toX(mm)} y1={mt} x2={toX(mm)} y2={mt + gh} stroke="#eef2f7" strokeWidth="0.5" />)}
        {decades.map((mm) => <line key={`d${mm}`} x1={toX(mm)} y1={mt} x2={toX(mm)} y2={mt + gh} stroke="#cbd5e1" strokeWidth="0.7" />)}
        {yT.map((p) => <line key={`y${p}`} x1={ml} y1={toY(p)} x2={ml + gw} y2={toY(p)} stroke="#eef2f7" strokeWidth="0.6" />)}
        {refs.map((r) => <g key={r.l}><line x1={toX(r.mm)} y1={mt} x2={toX(r.mm)} y2={mt + gh} stroke="#94a3b8" strokeWidth="0.6" strokeDasharray="3 3" /><text x={toX(r.mm)} y={mt - 5} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#475569">{r.l}</text></g>)}
        {path && <path d={path} fill="none" stroke="#1c2f4a" strokeWidth="2.4" strokeLinejoin="round" />}
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.4" fill="#bd5d3a" />)}
        <rect x={ml} y={mt} width={gw} height={gh} fill="none" stroke="#0f172a" strokeWidth="1" />
        {decades.map((mm) => <text key={`xl${mm}`} x={toX(mm)} y={mt + gh + 13} textAnchor="middle" fontSize="8" fill="#475569">{mm >= 1 ? mm.toFixed(0) : mm}</text>)}
        {yT.map((p) => <text key={`yl${p}`} x={ml - 5} y={toY(p) + 3} textAnchor="end" fontSize="8" fill="#475569">{p}</text>)}
        <text x={ml + gw / 2} y={H - 5} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a">Grain Size (mm)</text>
        <text x={12} y={mt + gh / 2} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a" transform={`rotate(-90,12,${mt + gh / 2})`}>Percent Finer by Weight</text>
      </svg>
    </div>
  );
}

const CLASS_FILL = {
  "sand": "#fef3c7", "loamy sand": "#fde68a", "sandy loam": "#fed7aa", "loam": "#d9f99d",
  "silt loam": "#bbf7d0", "silt": "#a7f3d0", "sandy clay loam": "#fecaca", "clay loam": "#c7d2fe",
  "silty clay loam": "#bfdbfe", "sandy clay": "#fca5a5", "silty clay": "#93c5fd", "clay": "#a5b4fc"
};
// Canonical USDA texture-class polygons; each vertex is [sand%, clay%].
const TEXTURE_POLYS = [
  { name: "clay", v: [[0, 100], [0, 60], [20, 40], [45, 40], [45, 55]] },
  { name: "silty clay", v: [[0, 60], [0, 40], [20, 40]] },
  { name: "sandy clay", v: [[45, 55], [45, 35], [65, 35]] },
  { name: "clay loam", v: [[20, 40], [45, 40], [45, 27], [20, 27]] },
  { name: "silty clay loam", v: [[0, 40], [20, 40], [20, 27], [0, 27]] },
  { name: "sandy clay loam", v: [[45, 35], [45, 27], [52, 20], [80, 20], [65, 35]] },
  { name: "loam", v: [[23, 27], [45, 27], [52, 20], [52, 7], [43, 7]] },
  { name: "silt loam", v: [[0, 27], [23, 27], [50, 0], [20, 0], [8, 12], [0, 12]] },
  { name: "sandy loam", v: [[43, 7], [52, 7], [52, 20], [80, 20], [85, 15], [70, 0], [50, 0]] },
  { name: "loamy sand", v: [[70, 0], [85, 15], [90, 10], [85, 0]] },
  { name: "sand", v: [[85, 0], [90, 10], [100, 0]] },
  { name: "silt", v: [[0, 12], [8, 12], [20, 0], [0, 0]] }
];

// Label anchors: [text-lines, sand%, clay%].
const TEXTURE_LABELS = [
  [["clay"], 30, 58], [["silty", "clay"], 10, 47], [["sandy", "clay"], 52, 42],
  [["clay loam"], 32, 33], [["silty clay", "loam"], 9, 33], [["sandy clay", "loam"], 60, 25],
  [["loam"], 41, 15], [["silt loam"], 18, 9], [["sandy loam"], 63, 8],
  [["loamy", "sand"], 80, 6], [["sand"], 91, 3], [["silt"], 7, 5]
];

// USDA soil-texture triangle (ternary). Sand bottom-left, silt bottom-right, clay apex.
function TextureTriangle({ sand, silt, clay, texture }) {
  const W = 470, H = 430, pad = 54, size = W - pad * 2, hgt = size * Math.sqrt(3) / 2;
  const ox = pad, oy = pad + hgt;  // bottom-left (sand corner) origin
  const pt = (sa, cl) => { const si = 100 - sa - cl; return [ox + (si / 100 + 0.5 * cl / 100) * size, oy - (cl / 100) * hgt]; };
  const poly = (v) => `M ${v.map(([s, c]) => pt(s, c).join(" ")).join(" L ")} Z`;
  const ticks = [10, 20, 30, 40, 50, 60, 70, 80, 90];
  const has = sand != null && clay != null && silt != null;
  const P = has ? pt(sand, clay) : null;
  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-center text-sm font-bold text-slate-900">USDA Soil Texture</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[340px]" style={{ border: "1px solid #cbd5e1", borderRadius: "10px", background: "white" }}>
        {TEXTURE_POLYS.map((r) => <path key={`f${r.name}`} d={poly(r.v)} fill={CLASS_FILL[r.name] || "#f1f5f9"} fillOpacity={r.name === texture ? 0.85 : 0.38} stroke="none" />)}
        {ticks.map((v) => <line key={`gc${v}`} x1={pt(100 - v, v)[0]} y1={pt(100 - v, v)[1]} x2={pt(0, v)[0]} y2={pt(0, v)[1]} stroke="#cbd5e1" strokeWidth="0.4" />)}
        {ticks.map((v) => <line key={`gs${v}`} x1={pt(v, 0)[0]} y1={pt(v, 0)[1]} x2={pt(v, 100 - v)[0]} y2={pt(v, 100 - v)[1]} stroke="#cbd5e1" strokeWidth="0.4" />)}
        {ticks.map((v) => <line key={`gi${v}`} x1={pt(100 - v, 0)[0]} y1={pt(100 - v, 0)[1]} x2={pt(0, 100 - v)[0]} y2={pt(0, 100 - v)[1]} stroke="#cbd5e1" strokeWidth="0.4" />)}
        {TEXTURE_POLYS.map((r) => <path key={`b${r.name}`} d={poly(r.v)} fill="none" stroke="#475569" strokeWidth="0.8" />)}
        <polygon points={[pt(100, 0), pt(0, 0), pt(0, 100)].map((c) => c.join(",")).join(" ")} fill="none" stroke="#0f172a" strokeWidth="1.4" />
        {ticks.map((v) => { const [x, y] = pt(v, 0); return <text key={`ns${v}`} x={x} y={y + 11} textAnchor="middle" fontSize="6" fill="#64748b">{v}</text>; })}
        {ticks.map((v) => { const [x, y] = pt(100 - v, v); return <text key={`nc${v}`} x={x - 7} y={y + 2.4} textAnchor="end" fontSize="6" fill="#64748b">{v}</text>; })}
        {ticks.map((v) => { const [x, y] = pt(0, 100 - v); return <text key={`ni${v}`} x={x + 7} y={y + 2.4} textAnchor="start" fontSize="6" fill="#64748b">{v}</text>; })}
        {TEXTURE_LABELS.map(([lines, s, c]) => { const [x, y] = pt(s, c); return <text key={lines.join()} x={x} y={y - (lines.length - 1) * 3.2} textAnchor="middle" fontSize="6.4" fontWeight="bold" fill="#1e293b">{lines.map((ln, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : 6.6}>{ln}</tspan>)}</text>; })}
        {P && <g>
          <line x1={P[0]} y1={P[1]} x2={pt(100 - clay, clay)[0]} y2={pt(100 - clay, clay)[1]} stroke="#1d4ed8" strokeWidth="1" />
          <line x1={P[0]} y1={P[1]} x2={pt(0, 100 - silt)[0]} y2={pt(0, 100 - silt)[1]} stroke="#1d4ed8" strokeWidth="1" />
          <line x1={P[0]} y1={P[1]} x2={pt(sand, 0)[0]} y2={pt(sand, 0)[1]} stroke="#1d4ed8" strokeWidth="1" />
          <circle cx={P[0]} cy={P[1]} r="3.4" fill="#bd5d3a" stroke="#7c2d12" strokeWidth="1" />
          <text x={pt(100 - clay, clay)[0] - 9} y={pt(100 - clay, clay)[1] + 2.4} textAnchor="end" fontSize="7" fontWeight="bold" fill="#1d4ed8">{Number(clay).toFixed(1)}</text>
          <text x={pt(0, 100 - silt)[0] + 9} y={pt(0, 100 - silt)[1] + 2.4} textAnchor="start" fontSize="7" fontWeight="bold" fill="#1d4ed8">{Number(silt).toFixed(1)}</text>
          <text x={pt(sand, 0)[0]} y={pt(sand, 0)[1] + 20} textAnchor="middle" fontSize="7" fontWeight="bold" fill="#1d4ed8">{Number(sand).toFixed(1)}</text>
        </g>}
        <text x={ox + size / 2} y={oy + 32} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a">← percent sand</text>
        <text x={ox - 16} y={oy - hgt / 2} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a" transform={`rotate(-60, ${ox - 16}, ${oy - hgt / 2})`}>percent clay →</text>
        <text x={ox + size + 16} y={oy - hgt / 2} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a" transform={`rotate(60, ${ox + size + 16}, ${oy - hgt / 2})`}>percent silt →</text>
      </svg>
      {texture && <p className="mt-1 text-center text-sm font-bold text-emerald-700">Classification: {texture}</p>}
    </div>
  );
}

function HydrometerReportPage() {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const { profile } = useAuth();
  const [report, setReport] = useState(null);

  useEffect(() => {
    const existing = reportId && reportId !== "new" ? getHydrometerReport(reportId) : null;
    setReport(existing || createHydrometerReport({ technicianName: profile?.full_name || "" }));
  }, [reportId, profile?.full_name]);
  if (!report) return null;
  const res = computeHydrometerResults(report);

  function persist(next) { const saved = saveHydrometerReport(next); setReport(saved); return saved; }
  function update(patch) { persist({ ...report, ...patch }); }
  function updateSieve(i, retained) { update({ sieves: report.sieves.map((s, idx) => (idx === i ? { ...s, retained } : s)) }); }
  function updateReading(i, patch) { update({ readings: report.readings.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }); }

  const canSubmit = Boolean(report.sieves.some((s) => String(s.retained || "").trim()) || report.readings.some((r) => String(r.reading || "").trim()));
  function submitReport() { if (!canSubmit) return; persist({ ...report, status: HYDROMETER_STATUS.SUBMITTED, submittedAt: new Date().toISOString() }); navigate("/technician/lab/hydrometer"); }

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1320px] space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 py-6 sm:px-7">
            <button type="button" onClick={() => navigate("/technician/lab/hydrometer")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-300 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Hydrometer Reports</button>
            <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-300">Soil · Laboratory · ASTM D422</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">Sieve &amp; Hydrometer Analysis</h1>
                <p className="mt-1 text-xs font-semibold text-slate-300">{report.reportNumber}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">{formatHydrometerStatus(report.status)}</span>
                <button type="button" onClick={() => persist(report)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"><Save className="h-4 w-4" /> Save</button>
                <button type="button" onClick={() => openHydrometerPdf({ ...report, _res: res })} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"><Download className="h-4 w-4" /> PDF</button>
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
            <Field label="Sample Number"><input className={inputClass} value={report.sampleNumber || ""} onChange={(e) => update({ sampleNumber: e.target.value })} placeholder="e.g. P-1 (Depth-60 in.)" /></Field>
            <Field label="Total Sample Wt (g)"><input type="number" step="0.01" className={inputClass} value={report.totalWeight || ""} onChange={(e) => update({ totalWeight: e.target.value })} placeholder="e.g. 229.41" /></Field>
            <Field label="USDA Classification"><input className={`${inputClass} bg-slate-50`} readOnly value={report.customClassification || res.texture || "—"} /></Field>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Sieve analysis */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-bold text-slate-950">Sieve Analysis</h2>
            <p className="mt-1 text-xs font-semibold text-slate-400">Weight retained per sieve · % passing updates live</p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-navy-900 text-white"><tr>{["Particle Size", "Unit", "Wt Retained (g)", "Cum. Retained (g)", "% Passing"].map((h) => <th key={h} className="border-r border-navy-800 px-2 py-2 font-bold last:border-r-0">{h}</th>)}</tr></thead>
                <tbody>
                  {res.sieveRows.map((row, i) => (
                    <tr key={row.label} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                      <td className="border-r border-t border-slate-200 px-2 py-1 font-bold text-slate-800">{row.label}</td>
                      <td className="border-r border-t border-slate-200 px-2 py-1 text-slate-500">{row.unit}</td>
                      <td className="border-r border-t border-slate-200 px-1 py-1"><input type="number" step="0.01" className={`${cellClass} w-20`} value={report.sieves[i]?.retained ?? ""} onChange={(e) => updateSieve(i, e.target.value)} placeholder="0.0" /></td>
                      <td className="border-r border-t border-slate-200 px-2 py-1 font-semibold text-slate-600">{row.cumulativeRetained.toFixed(2)}</td>
                      <td className="border-t border-slate-200 px-2 py-1 font-bold text-blue-800">{f(row.percentPassing, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Hydrometer */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-950">Hydrometer Data</h2>
              <button type="button" onClick={() => persist(addHydrometerReading(report))} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-slate-950 px-2.5 text-[11px] font-bold text-white"><Plus className="h-3 w-3" /> Reading</button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="Sub-Sample Wt (g)"><input type="number" step="0.01" className={inputClass} value={report.subSampleWt || ""} onChange={(e) => update({ subSampleWt: e.target.value })} /></Field>
              <Field label="Composite Corr."><input type="number" step="0.01" className={inputClass} value={report.compositeCorrection || ""} onChange={(e) => update({ compositeCorrection: e.target.value })} placeholder="e.g. 3" /></Field>
              <Field label="Gs Correction (a)"><input type="number" step="0.001" className={inputClass} value={report.gsCorrection || ""} onChange={(e) => update({ gsCorrection: e.target.value })} /></Field>
              <Field label="K Factor"><input type="number" step="0.00001" className={inputClass} value={report.kFactor || ""} onChange={(e) => update({ kFactor: e.target.value })} /></Field>
            </div>
            <p className="mt-1 text-[11px] font-semibold text-slate-400">% passing No. 10 = {f(res.passingNo10, 1)} (auto from sieve) · D = K·√(L/T)</p>
            <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-navy-900 text-white"><tr>{["T (min)", "Temp °C", "Reading R", "Depth L", "Corr. R", "Diam (mm)", "% Finer", ""].map((h) => <th key={h} className="border-r border-navy-800 px-1.5 py-1.5 font-bold last:border-r-0">{h}</th>)}</tr></thead>
                <tbody>
                  {res.hydroRows.map((row, i) => (
                    <tr key={report.readings[i]?.id || i} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                      <td className="border-t border-slate-200 px-1 py-1"><input type="number" step="0.1" className={`${cellClass} w-14`} value={report.readings[i]?.time ?? ""} onChange={(e) => updateReading(i, { time: e.target.value })} /></td>
                      <td className="border-t border-slate-200 px-1 py-1"><input type="number" step="0.1" className={`${cellClass} w-12`} value={report.readings[i]?.temp ?? ""} onChange={(e) => updateReading(i, { temp: e.target.value })} /></td>
                      <td className="border-t border-slate-200 px-1 py-1"><input type="number" step="0.1" className={`${cellClass} w-14`} value={report.readings[i]?.reading ?? ""} onChange={(e) => updateReading(i, { reading: e.target.value })} /></td>
                      <td className="border-t border-slate-200 px-1 py-1"><input type="number" step="0.1" className={`${cellClass} w-14`} value={report.readings[i]?.depth ?? ""} onChange={(e) => updateReading(i, { depth: e.target.value })} /></td>
                      <td className="border-t border-slate-200 px-1.5 py-1 font-semibold text-slate-500">{f(row.correctedReading, 1)}</td>
                      <td className="border-t border-slate-200 px-1.5 py-1 font-bold text-slate-800">{f(row.diameter, 4)}</td>
                      <td className="border-t border-slate-200 px-1.5 py-1 font-bold text-blue-800">{f(row.percentFiner, 1)}</td>
                      <td className="border-t border-slate-200 px-1 py-1">{report.readings.length > 1 && <button type="button" onClick={() => update({ readings: report.readings.filter((_, idx) => idx !== i) })} className="text-rose-600"><Trash2 className="h-3 w-3" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Live plots */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <GradationCurve curve={res.curve} />
            <TextureTriangle sand={res.sand} silt={res.silt} clay={res.clay} texture={report.customClassification || res.texture} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="% Sand (> No. 200)" value={f(res.sand, 1)} />
            <Stat label="% Silt" value={f(res.silt, 1)} />
            <Stat label="% Clay (< 0.002 mm)" value={f(res.clay, 1)} />
            <Stat label="USDA Texture" value={report.customClassification || res.texture} tone="emerald" />
          </div>
        </section>

        {/* Override + remarks */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Custom Classification (override)"><input className={inputClass} value={report.customClassification || ""} onChange={(e) => update({ customClassification: e.target.value })} placeholder={`Suggested: ${res.texture || "—"}`} /></Field>
            <label className="block"><span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Notes</span><textarea value={report.remarks || ""} onChange={(e) => update({ remarks: e.target.value })} rows={2} className={`${inputClass} mt-1 min-h-16 py-2 leading-6`} /></label>
          </div>
        </section>
      </div>
    </div>
  );
}

export default HydrometerReportPage;
