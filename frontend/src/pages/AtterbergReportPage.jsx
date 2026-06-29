import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Plus, Save, Send, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  ATTERBERG_STATUS,
  addLlTrial,
  addPlTrial,
  computeAtterberg,
  createAtterbergReport,
  formatAtterbergStatus,
  getAtterbergReport,
  saveAtterbergReport
} from "../services/atterbergService";
import { openAtterbergPdf } from "../services/atterbergPdfService";

const inputClass = "min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";
const cellClass = "min-h-8 w-full rounded-md border border-slate-300 px-1.5 text-xs font-semibold outline-none focus:border-blue-700";

function Field({ label, children }) {
  return (<label className="block"><span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</span><div className="mt-1">{children}</div></label>);
}
function Stat({ label, value, tone = "slate" }) {
  const tones = { slate: "border-slate-200 bg-slate-50 text-slate-900", blue: "border-blue-200 bg-blue-50 text-blue-900", emerald: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  return (<div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}><p className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-70">{label}</p><p className="mt-0.5 text-lg font-bold">{value || "-"}</p></div>);
}

// Flow curve: moisture vs blows (log x); LL read at 25 blows.
function FlowCurveChart({ att }) {
  const W = 360, H = 260, ml = 40, mr = 14, mt = 14, mb = 38;
  const gw = W - ml - mr, gh = H - mt - mb;
  const ticks = [10, 15, 20, 25, 30, 40, 60];
  const toX = (n) => ml + (Math.log10(n) - Math.log10(10)) / (Math.log10(60) - Math.log10(10)) * gw;
  const pts = att.llTrials.filter((t) => Number(t.blows) > 0 && t.moisture != null).map((t) => ({ n: Number(t.blows), w: t.moisture }));
  const ws = [...pts.map((p) => p.w), att.ll].filter((v) => v != null);
  const yMin = ws.length ? Math.floor(Math.min(...ws) - 2) : 15;
  const yMax = ws.length ? Math.ceil(Math.max(...ws) + 2) : 40;
  const toY = (w) => mt + gh - (w - yMin) / (yMax - yMin || 1) * gh;
  const fit = att.flowFit;
  let line = "";
  if (fit && pts.length) {
    const ns = pts.map((p) => p.n);
    const x1 = Math.min(...ns, 25), x2 = Math.max(...ns, 25);
    line = `M ${toX(x1)} ${toY(fit.m * Math.log10(x1) + fit.b)} L ${toX(x2)} ${toY(fit.m * Math.log10(x2) + fit.b)}`;
  }
  const yTicks = []; for (let y = yMin; y <= yMax; y += Math.max(1, Math.round((yMax - yMin) / 6))) yTicks.push(y);
  return (
    <div>
      <p className="mb-1 text-center text-xs font-bold text-slate-900">Flow Curve (Liquid Limit)</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ border: "1px solid #cbd5e1", borderRadius: "10px", background: "white" }}>
        {ticks.map((n) => <line key={n} x1={toX(n)} y1={mt} x2={toX(n)} y2={mt + gh} stroke="#eef2f7" strokeWidth="0.6" />)}
        {yTicks.map((y) => <line key={y} x1={ml} y1={toY(y)} x2={ml + gw} y2={toY(y)} stroke="#eef2f7" strokeWidth="0.6" />)}
        <line x1={toX(25)} y1={mt} x2={toX(25)} y2={mt + gh} stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="3 3" />
        {att.ll != null && att.ll >= yMin && att.ll <= yMax && <line x1={ml} y1={toY(att.ll)} x2={ml + gw} y2={toY(att.ll)} stroke="#bd5d3a" strokeWidth="0.8" strokeDasharray="3 3" />}
        {line && <path d={line} fill="none" stroke="#1c2f4a" strokeWidth="2" />}
        {pts.map((p, i) => <circle key={i} cx={toX(p.n)} cy={toY(p.w)} r="3" fill="#1c2f4a" />)}
        {att.ll != null && <circle cx={toX(25)} cy={toY(att.ll)} r="4" fill="none" stroke="#bd5d3a" strokeWidth="1.6" />}
        <rect x={ml} y={mt} width={gw} height={gh} fill="none" stroke="#0f172a" strokeWidth="1" />
        {ticks.map((n) => <text key={n} x={toX(n)} y={mt + gh + 12} textAnchor="middle" fontSize="7.5" fill="#475569">{n}</text>)}
        {yTicks.map((y) => <text key={y} x={ml - 4} y={toY(y) + 2.5} textAnchor="end" fontSize="7.5" fill="#475569">{y}</text>)}
        <text x={ml + gw / 2} y={H - 4} textAnchor="middle" fontSize="8.5" fontWeight="bold" fill="#0f172a">Number of Blows (log)</text>
        <text x={10} y={mt + gh / 2} textAnchor="middle" fontSize="8.5" fontWeight="bold" fill="#0f172a" transform={`rotate(-90,10,${mt + gh / 2})`}>Moisture, %</text>
      </svg>
    </div>
  );
}

// Plasticity chart: LL (x) vs PI (y) with A-line, U-line, sample point.
function PlasticityChart({ ll, pi }) {
  const W = 360, H = 260, ml = 38, mr = 14, mt = 14, mb = 38;
  const gw = W - ml - mr, gh = H - mt - mb;
  const xMax = 100, yMax = 60;
  const toX = (x) => ml + (x / xMax) * gw;
  const toY = (y) => mt + gh - (y / yMax) * gh;
  const clip = (x, y) => `${toX(Math.min(x, xMax))} ${toY(Math.min(y, yMax))}`;
  // A-line PI=0.73(LL-20) from (20,0); U-line PI=0.9(LL-8) from (8,0)
  const aEndLL = 20 + yMax / 0.73; const aLine = `M ${toX(20)} ${toY(0)} L ${clip(Math.min(aEndLL, xMax), Math.min(0.73 * (xMax - 20), yMax))}`;
  const uEndLL = 8 + yMax / 0.9; const uLine = `M ${toX(8)} ${toY(0)} L ${clip(Math.min(uEndLL, xMax), Math.min(0.9 * (xMax - 8), yMax))}`;
  const xTicks = [0, 20, 40, 50, 60, 80, 100]; const yTicks = [0, 10, 20, 30, 40, 50, 60];
  const hasPt = ll != null && pi != null;
  return (
    <div>
      <p className="mb-1 text-center text-xs font-bold text-slate-900">Plasticity Chart</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ border: "1px solid #cbd5e1", borderRadius: "10px", background: "white" }}>
        {xTicks.map((x) => <line key={x} x1={toX(x)} y1={mt} x2={toX(x)} y2={mt + gh} stroke="#eef2f7" strokeWidth="0.6" />)}
        {yTicks.map((y) => <line key={y} x1={ml} y1={toY(y)} x2={ml + gw} y2={toY(y)} stroke="#eef2f7" strokeWidth="0.6" />)}
        <line x1={toX(50)} y1={mt} x2={toX(50)} y2={mt + gh} stroke="#cbd5e1" strokeWidth="0.8" />
        <path d={uLine} fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2" />
        <path d={aLine} fill="none" stroke="#1c2f4a" strokeWidth="1.4" />
        <text x={toX(70)} y={toY(40)} fontSize="9" fontWeight="bold" fill="#475569">CH</text>
        <text x={toX(75)} y={toY(18)} fontSize="9" fontWeight="bold" fill="#475569">MH</text>
        <text x={toX(30)} y={toY(20)} fontSize="9" fontWeight="bold" fill="#475569">CL</text>
        <text x={toX(38)} y={toY(6)} fontSize="9" fontWeight="bold" fill="#475569">ML</text>
        <text x={toX(7)} y={toY(48)} fontSize="6.5" fill="#94a3b8">U-line</text>
        <text x={toX(33)} y={toY(52)} fontSize="6.5" fill="#1c2f4a">A-line</text>
        {hasPt && ll <= xMax && pi <= yMax && <circle cx={toX(ll)} cy={toY(pi)} r="4.5" fill="#bd5d3a" stroke="#7c2d12" strokeWidth="1" />}
        <rect x={ml} y={mt} width={gw} height={gh} fill="none" stroke="#0f172a" strokeWidth="1" />
        {xTicks.map((x) => <text key={x} x={toX(x)} y={mt + gh + 12} textAnchor="middle" fontSize="7.5" fill="#475569">{x}</text>)}
        {yTicks.map((y) => <text key={y} x={ml - 4} y={toY(y) + 2.5} textAnchor="end" fontSize="7.5" fill="#475569">{y}</text>)}
        <text x={ml + gw / 2} y={H - 4} textAnchor="middle" fontSize="8.5" fontWeight="bold" fill="#0f172a">Liquid Limit (LL)</text>
        <text x={10} y={mt + gh / 2} textAnchor="middle" fontSize="8.5" fontWeight="bold" fill="#0f172a" transform={`rotate(-90,10,${mt + gh / 2})`}>Plasticity Index (PI)</text>
      </svg>
    </div>
  );
}

function AtterbergReportPage() {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const { profile } = useAuth();
  const [report, setReport] = useState(null);

  useEffect(() => {
    const existing = reportId && reportId !== "new" ? getAtterbergReport(reportId) : null;
    setReport(existing || createAtterbergReport({ technicianName: profile?.full_name || "" }));
  }, [reportId, profile?.full_name]);

  if (!report) return null;
  const att = computeAtterberg(report);

  function persist(next) { const saved = saveAtterbergReport(next); setReport(saved); return saved; }
  function update(patch) { persist({ ...report, ...patch }); }
  function updateLl(i, patch) { update({ llTrials: report.llTrials.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) }); }
  function updatePl(i, patch) { update({ plTrials: report.plTrials.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) }); }

  const canSubmit = Boolean(report.llTrials.some((t) => String(t.tareWet || "").trim()) || report.nonPlastic);
  function submitReport() {
    if (!canSubmit) return;
    persist({ ...report, status: ATTERBERG_STATUS.SUBMITTED, submittedAt: new Date().toISOString() });
    navigate("/technician/lab/atterberg");
  }
  const isMulti = (report.llMethod || "multipoint") === "multipoint";

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1280px] space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 py-6 sm:px-7">
            <button type="button" onClick={() => navigate("/technician/lab/atterberg")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-300 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Atterberg Reports</button>
            <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-300">Soil · Laboratory · ASTM D4318</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">Atterberg Limits</h1>
                <p className="mt-1 text-xs font-semibold text-slate-300">{report.reportNumber}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">{formatAtterbergStatus(report.status)}</span>
                <button type="button" onClick={() => persist(report)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"><Save className="h-4 w-4" /> Save</button>
                <button type="button" onClick={() => openAtterbergPdf({ ...report, _att: att })} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"><Download className="h-4 w-4" /> PDF</button>
                <button type="button" onClick={submitReport} disabled={!canSubmit} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-accent-500 px-4 text-sm font-bold text-white shadow-lg shadow-accent-950/30 transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"><Send className="h-4 w-4" /> Submit</button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-950">Report Information</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Project Name"><input className={inputClass} value={report.projectName || ""} onChange={(e) => update({ projectName: e.target.value })} /></Field>
            <Field label="Project Number"><input className={inputClass} value={report.projectNumber || ""} onChange={(e) => update({ projectNumber: e.target.value })} /></Field>
            <Field label="Boring / Sample No."><input className={inputClass} value={report.boringNumber || ""} onChange={(e) => update({ boringNumber: e.target.value })} placeholder="e.g. S-1 @ 0.0'-2.0'" /></Field>
            <Field label="Natural Moisture (%)"><input type="number" step="0.1" className={inputClass} value={report.naturalMoisture || ""} onChange={(e) => update({ naturalMoisture: e.target.value })} /></Field>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-950">Liquid &amp; Plastic Limits</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">LL Method
                <select className="min-h-8 rounded-md border border-slate-300 px-2 text-xs font-semibold" value={report.llMethod} onChange={(e) => update({ llMethod: e.target.value })}>
                  <option value="multipoint">Multipoint (flow curve)</option>
                  <option value="onepoint">One-Point</option>
                </select>
              </label>
              {!isMulti && (
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">Trial to use
                  <select className="min-h-8 rounded-md border border-slate-300 px-2 text-xs font-semibold" value={report.llTrialToUse} onChange={(e) => update({ llTrialToUse: e.target.value })}>
                    {report.llTrials.map((_, i) => <option key={i} value={i === 0 ? "A" : i === 1 ? "B" : String(i)}>{i === 0 ? "A" : i === 1 ? "B" : `T${i + 1}`}</option>)}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><input type="checkbox" checked={report.nonPlastic} onChange={(e) => update({ nonPlastic: e.target.checked })} /> Non-Plastic (NP)</label>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Liquid Limit trials */}
            <div>
              <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Liquid Limit Trials</p>
                <button type="button" onClick={() => persist(addLlTrial(report))} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-bold text-white"><Plus className="h-3 w-3" /> Trial</button></div>
              <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead className="bg-navy-900 text-white"><tr>{["Trial", "Blows", "Tare+Wet", "Tare+Dry", "Tare", "MC %", isMulti ? "" : "Corr LL", ""].map((h, i) => <th key={i} className="border-r border-navy-800 px-1.5 py-1.5 font-bold last:border-r-0">{h}</th>)}</tr></thead>
                  <tbody>
                    {report.llTrials.map((t, i) => (
                      <tr key={t.id} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                        <td className="border-t border-slate-200 px-1.5 py-1 font-bold text-slate-700">{i === 0 ? "A" : i === 1 ? "B" : `T${i + 1}`}</td>
                        <td className="border-t border-slate-200 px-1 py-1"><input type="number" className={`${cellClass} w-14`} value={t.blows || ""} onChange={(e) => updateLl(i, { blows: e.target.value })} /></td>
                        <td className="border-t border-slate-200 px-1 py-1"><input type="number" step="0.01" className={`${cellClass} w-16`} value={t.tareWet || ""} onChange={(e) => updateLl(i, { tareWet: e.target.value })} /></td>
                        <td className="border-t border-slate-200 px-1 py-1"><input type="number" step="0.01" className={`${cellClass} w-16`} value={t.tareDry || ""} onChange={(e) => updateLl(i, { tareDry: e.target.value })} /></td>
                        <td className="border-t border-slate-200 px-1 py-1"><input type="number" step="0.01" className={`${cellClass} w-14`} value={t.tare || ""} onChange={(e) => updateLl(i, { tare: e.target.value })} /></td>
                        <td className="border-t border-slate-200 px-1.5 py-1 font-bold text-blue-800">{att.llTrials[i]?.moisture != null ? att.llTrials[i].moisture.toFixed(1) : "-"}</td>
                        <td className="border-t border-slate-200 px-1.5 py-1 font-semibold text-slate-600">{isMulti ? "" : (att.llTrials[i]?.corrected != null ? att.llTrials[i].corrected.toFixed(0) : "-")}</td>
                        <td className="border-t border-slate-200 px-1 py-1">{report.llTrials.length > 1 && <button type="button" onClick={() => update({ llTrials: report.llTrials.filter((_, idx) => idx !== i) })} className="text-rose-600"><Trash2 className="h-3 w-3" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Plastic Limit trials */}
            <div>
              <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Plastic Limit Trials</p>
                <button type="button" onClick={() => persist(addPlTrial(report))} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-bold text-white"><Plus className="h-3 w-3" /> Trial</button></div>
              <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead className="bg-navy-900 text-white"><tr>{["Trial", "Tare+Wet", "Tare+Dry", "Tare", "PL %", ""].map((h, i) => <th key={i} className="border-r border-navy-800 px-1.5 py-1.5 font-bold last:border-r-0">{h}</th>)}</tr></thead>
                  <tbody>
                    {report.plTrials.map((t, i) => (
                      <tr key={t.id} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                        <td className="border-t border-slate-200 px-1.5 py-1 font-bold text-slate-700">{i === 0 ? "A" : i === 1 ? "B" : `T${i + 1}`}</td>
                        <td className="border-t border-slate-200 px-1 py-1"><input type="number" step="0.01" className={`${cellClass} w-16`} value={t.tareWet || ""} onChange={(e) => updatePl(i, { tareWet: e.target.value })} /></td>
                        <td className="border-t border-slate-200 px-1 py-1"><input type="number" step="0.01" className={`${cellClass} w-16`} value={t.tareDry || ""} onChange={(e) => updatePl(i, { tareDry: e.target.value })} /></td>
                        <td className="border-t border-slate-200 px-1 py-1"><input type="number" step="0.01" className={`${cellClass} w-14`} value={t.tare || ""} onChange={(e) => updatePl(i, { tare: e.target.value })} /></td>
                        <td className="border-t border-slate-200 px-1.5 py-1 font-bold text-blue-800">{att.plTrials[i]?.moisture != null ? att.plTrials[i].moisture.toFixed(1) : "-"}</td>
                        <td className="border-t border-slate-200 px-1 py-1">{report.plTrials.length > 1 && <button type="button" onClick={() => update({ plTrials: report.plTrials.filter((_, idx) => idx !== i) })} className="text-rose-600"><Trash2 className="h-3 w-3" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Liquid Limit" value={att.ll != null ? String(att.ll) : (att.nonPlastic ? "NP" : "")} tone="blue" />
            <Stat label="Plastic Limit" value={att.pl != null ? String(att.pl) : (att.nonPlastic ? "NP" : "")} tone="blue" />
            <Stat label="Plasticity Index" value={att.pi != null ? String(att.pi) : ""} tone="blue" />
            <Stat label="Classification" value={report.customClassification || att.classification} tone="emerald" />
          </div>
          {att.uLineOk === false && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">Result plots above the U-line — recheck the data.</p>}
        </section>

        {/* Charts */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {isMulti && <FlowCurveChart att={att} />}
            <PlasticityChart ll={att.ll} pi={att.pi} />
          </div>
        </section>

        {/* Classification + remarks */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-950">Classification &amp; Notes</h2>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><input type="checkbox" checked={report.organic} onChange={(e) => update({ organic: e.target.checked })} /> Organic</label>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Custom Classification (override)"><input className={inputClass} value={report.customClassification || ""} onChange={(e) => update({ customClassification: e.target.value })} placeholder={`Suggested: ${att.classification || "—"}`} /></Field>
            <Field label="Flow Index">{<input className={`${inputClass} bg-slate-50`} readOnly value={att.flowIndex != null ? att.flowIndex.toFixed(2) : "—"} />}</Field>
          </div>
          <label className="mt-3 block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Remarks</span>
            <textarea value={report.remarks || ""} onChange={(e) => update({ remarks: e.target.value })} rows={3} className={`${inputClass} mt-1 min-h-20 py-2 leading-6`} placeholder="Sample condition, prep notes…" />
          </label>
        </section>
      </div>
    </div>
  );
}

export default AtterbergReportPage;
