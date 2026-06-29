import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FlaskConical, Save, Send } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  GRADATION_STATUS,
  computeGradationRows,
  createGradationReport,
  formatGradationStatus,
  getGradationReport,
  saveGradationReport
} from "../services/gradationService";
import { openGradationPdf } from "../services/gradationPdfService";

const inputClass = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";

function LabelInput({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input className={`${inputClass} mt-1`} {...props} />
    </label>
  );
}

function fmt(value, digits) {
  return value === null || value === undefined || value === "" || Number.isNaN(Number(value))
    ? "-"
    : Number(value).toFixed(digits);
}

// Live particle-size-distribution curve: % passing (y) vs grain size in mm
// (x, log scale, coarse left → fine right).
function GradationCurveChart({ rows }) {
  const W = 640, H = 430;
  const ml = 52, mr = 18, mt = 28, mb = 52;
  const gw = W - ml - mr, gh = H - mt - mb;
  const logMax = 2;   // 100 mm
  const logMin = -3;  // 0.001 mm

  const toX = (mm) => ml + (logMax - Math.log10(mm)) / (logMax - logMin) * gw;
  const toY = (p) => mt + gh - (p / 100) * gh;

  const decades = [100, 10, 1, 0.1, 0.01, 0.001];
  // Minor log gridlines (2..9 within each decade).
  const minors = [];
  for (let d = logMax - 1; d >= logMin; d -= 1) {
    for (let k = 2; k <= 9; k += 1) minors.push(k * Math.pow(10, d));
  }
  const yTicks = [];
  for (let p = 0; p <= 100; p += 10) yTicks.push(p);

  // Reference sieve markers shown at the top (matches the standard report).
  const refs = [
    { label: "3\"", mm: 76.2 },
    { label: "3/4\"", mm: 19.0 },
    { label: "No. 4", mm: 4.75 },
    { label: "No. 40", mm: 0.425 },
    { label: "No. 200", mm: 0.075 }
  ];

  const pts = (rows || [])
    .filter((r) => r.percentPassing !== null && r.percentPassing !== undefined && Number.isFinite(Number(r.percentPassing)))
    .map((r) => ({ x: toX(r.mm), y: toY(Math.max(0, Math.min(100, Number(r.percentPassing)))), mm: r.mm, p: Number(r.percentPassing) }));
  const path = pts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-center text-sm font-bold text-slate-900">Particle Size Analysis</p>
      <p className="mb-1 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">U.S. Standard Sieve Sizes</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" style={{ border: "1px solid #cbd5e1", borderRadius: "12px", background: "white" }}>
        {/* minor vertical gridlines */}
        {minors.map((mm, i) => (
          <line key={`mn-${i}`} x1={toX(mm)} y1={mt} x2={toX(mm)} y2={mt + gh} stroke="#eef2f7" strokeWidth="0.5" />
        ))}
        {/* decade vertical gridlines */}
        {decades.map((mm) => (
          <line key={`dc-${mm}`} x1={toX(mm)} y1={mt} x2={toX(mm)} y2={mt + gh} stroke="#cbd5e1" strokeWidth="0.8" />
        ))}
        {/* horizontal gridlines */}
        {yTicks.map((p) => (
          <line key={`y-${p}`} x1={ml} y1={toY(p)} x2={ml + gw} y2={toY(p)} stroke="#e2e8f0" strokeWidth="0.6" />
        ))}

        {/* reference sieve markers (dashed) + labels */}
        {refs.map((r) => (
          <g key={r.label}>
            <line x1={toX(r.mm)} y1={mt} x2={toX(r.mm)} y2={mt + gh} stroke="#94a3b8" strokeWidth="0.7" strokeDasharray="3 3" />
            <text x={toX(r.mm)} y={mt - 6} textAnchor="middle" fontSize="8.5" fontWeight="bold" fill="#475569">{r.label}</text>
          </g>
        ))}

        {/* curve */}
        {path && <path d={path} fill="none" stroke="#1c2f4a" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((pt, i) => (
          <circle key={`p-${i}`} cx={pt.x} cy={pt.y} r="2.6" fill="#bd5d3a" stroke="#7c2d12" strokeWidth="0.6" />
        ))}

        {/* axis frame */}
        <rect x={ml} y={mt} width={gw} height={gh} fill="none" stroke="#0f172a" strokeWidth="1" />

        {/* x labels */}
        {decades.map((mm) => (
          <text key={`xl-${mm}`} x={toX(mm)} y={mt + gh + 14} textAnchor="middle" fontSize="8" fill="#475569">{mm >= 1 ? mm.toFixed(0) : mm.toString()}</text>
        ))}
        {/* y labels */}
        {yTicks.map((p) => (
          <text key={`yl-${p}`} x={ml - 5} y={toY(p) + 3} textAnchor="end" fontSize="8" fill="#475569">{p}</text>
        ))}

        {/* axis titles */}
        <text x={ml + gw / 2} y={H - 6} textAnchor="middle" fontSize="9.5" fontWeight="bold" fill="#0f172a">Grain Size (mm)</text>
        <text x={12} y={mt + gh / 2} textAnchor="middle" fontSize="9.5" fontWeight="bold" fill="#0f172a" transform={`rotate(-90, 12, ${mt + gh / 2})`}>Percent Finer by Weight</text>
      </svg>
    </div>
  );
}

function GradationReport() {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const { profile } = useAuth();
  const [report, setReport] = useState(null);

  useEffect(() => {
    const existing = reportId && reportId !== "new" ? getGradationReport(reportId) : null;
    setReport(existing || createGradationReport({ technicianName: profile?.full_name || "" }));
  }, [reportId, profile?.full_name]);

  if (!report) return null;

  const rows = computeGradationRows(report.sieves, report.totalSoilWeight);

  function persist(next) {
    const saved = saveGradationReport(next);
    setReport(saved);
    return saved;
  }

  function updateReport(patch) {
    persist({ ...report, ...patch });
  }

  function updateSieve(index, retained) {
    const sieves = report.sieves.map((s, i) => (i === index ? { ...s, retained } : s));
    persist({ ...report, sieves });
  }

  const canSubmit = Boolean(report.totalSoilWeight && report.sieves.some((s) => String(s.retained || "").trim()));

  function submitReport() {
    if (!canSubmit) return;
    persist({ ...report, status: GRADATION_STATUS.SUBMITTED, submittedAt: new Date().toISOString() });
    navigate("/technician/lab/gradation");
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1280px] space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 py-6 sm:px-7">
            <button type="button" onClick={() => navigate("/technician/lab/gradation")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-300 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Gradation Reports
            </button>
            <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-300">Soil · Laboratory · ASTM D422</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">Washed Particle Size / Gradation Test</h1>
                <p className="mt-1 text-xs font-semibold text-slate-300">{report.reportNumber}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
                  {formatGradationStatus(report.status)}
                </span>
                <button type="button" onClick={() => persist(report)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"><Save className="h-4 w-4" /> Save</button>
                <button type="button" onClick={() => openGradationPdf({ ...report, sieves: rows })} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"><Download className="h-4 w-4" /> PDF</button>
                <button type="button" onClick={submitReport} disabled={!canSubmit} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-accent-500 px-4 text-sm font-bold text-white shadow-lg shadow-accent-950/30 transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"><Send className="h-4 w-4" /> Submit</button>
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
            <LabelInput label="Boring Number" value={report.boringNumber || ""} onChange={(e) => updateReport({ boringNumber: e.target.value })} placeholder="e.g. DC-04 @ 0.0'-2.0'" />
            <LabelInput label="Date" type="date" value={report.date || ""} onChange={(e) => updateReport({ date: e.target.value })} />
            <LabelInput label="Total Wt. of Soil (g)" type="number" step="0.01" value={report.totalSoilWeight || ""} onChange={(e) => updateReport({ totalSoilWeight: e.target.value })} placeholder="e.g. 43.37" />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Sieve table */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FlaskConical className="h-4 w-4" /></span>
              <h2 className="text-base font-bold text-slate-950">Sieve Data</h2>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-400">Enter the weight retained on each sieve · Cumulative &amp; % Passing update live</p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-navy-900 text-white">
                  <tr>
                    <th className="border-r border-navy-800 px-2 py-2 font-bold">Sieve Size</th>
                    <th className="border-r border-navy-800 px-2 py-2 font-bold">Wt. Retained Each Sieve (g)</th>
                    <th className="border-r border-navy-800 px-2 py-2 font-bold">Cumulative Wt. Retained (g)</th>
                    <th className="px-2 py-2 font-bold">Cumulative % Passing</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.label} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="border-r border-t border-slate-200 px-2 py-1.5 font-bold text-slate-800">{row.label}</td>
                      <td className="border-r border-t border-slate-200 px-1.5 py-1">
                        <input
                          type="number"
                          step="0.01"
                          value={report.sieves[index]?.retained ?? ""}
                          onChange={(e) => updateSieve(index, e.target.value)}
                          className="min-h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                          placeholder="0.0"
                        />
                      </td>
                      <td className="border-r border-t border-slate-200 px-2 py-1.5 font-semibold text-slate-700">{fmt(row.cumulativeRetained, 2)}</td>
                      <td className="border-t border-slate-200 px-2 py-1.5 font-bold text-blue-800">{fmt(row.percentPassing, 1)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100">
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-bold text-slate-900">Wt. of Soil, g</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-bold text-slate-900" colSpan={3}>{fmt(report.totalSoilWeight, 2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Live curve */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <GradationCurveChart rows={rows} />
          </section>
        </div>

        {/* Remarks */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Remarks</span>
            <textarea value={report.remarks || ""} onChange={(e) => updateReport({ remarks: e.target.value })} rows={3} className={`${inputClass} mt-1 py-2 leading-6`} placeholder="Soil classification, wash loss, observations…" />
          </label>
        </section>
      </div>
    </div>
  );
}

export default GradationReport;
