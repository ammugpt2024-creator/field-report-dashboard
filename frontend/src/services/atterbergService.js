// Atterberg Limits (Liquid Limit, Plastic Limit, Plasticity Index) — ASTM D4318.
// Liquid limit by multipoint flow-curve or one-point method; plasticity chart
// classification (CL/ML/CH/MH, OL/OH). Self-contained, stored in localStorage.

const STORAGE_KEY = "qcore:lab-atterberg";

export const ATTERBERG_STATUS = { DRAFT: "draft", SUBMITTED: "submitted", APPROVED: "approved" };

const num = (v) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

// Moisture content of a can: (tare+wet − tare+dry) / (tare+dry − tare) × 100.
function canMoisture(t) {
  const wet = num(t.tareWet), dry = num(t.tareDry), tare = num(t.tare);
  return wet != null && dry != null && tare != null && dry - tare > 0 ? ((wet - dry) / (dry - tare)) * 100 : null;
}

// Least-squares line y = m·x + b.
function lineFit(pts) {
  const p = pts.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
  if (p.length < 2) return null;
  const n = p.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const { x, y } of p) { sx += x; sy += y; sxy += x * y; sxx += x * x; }
  const d = n * sxx - sx * sx;
  if (Math.abs(d) < 1e-12) return null;
  const m = (n * sxy - sx * sy) / d;
  const b = (sy - m * sx) / n;
  return { m, b };
}

// Plasticity-chart classification (fine-grained).
export function plasticityClass({ ll, pi, organic }) {
  if (ll == null || pi == null) return "";
  const aLine = 0.73 * (ll - 20);
  const aboveA = pi >= aLine;
  if (organic) return ll >= 50 ? "OH" : "OL";
  if (ll < 50) {
    if (pi < 4 || !aboveA) return "ML";
    if (pi > 7 && aboveA) return "CL";
    return "CL-ML";
  }
  return aboveA ? "CH" : "MH";
}

export function computeAtterberg(report = {}) {
  const llMethod = report.llMethod || "multipoint";
  const llTrials = (report.llTrials || []).map((t) => {
    const moisture = canMoisture(t);
    const k = num(t.blows) != null && num(t.blows) > 0 ? Math.pow(num(t.blows) / 25, 0.121) : null;
    return { ...t, moisture, corrected: moisture != null && k != null ? moisture * k : null, factor: k };
  });
  const plTrials = (report.plTrials || []).map((t) => ({ ...t, moisture: canMoisture(t) }));

  let ll = null, flowFit = null, flowIndex = null;
  if (!report.nonPlastic) {
    if (llMethod === "onepoint") {
      const useIdx = report.llTrialToUse === "B" ? 1 : report.llTrialToUse === "A" ? 0 : (llTrials.length - 1);
      const chosen = llTrials[useIdx];
      if (chosen && chosen.corrected != null) ll = Math.round(chosen.corrected);
    } else {
      // Multipoint flow curve: moisture vs log10(blows); LL = moisture at 25 blows.
      const pts = llTrials
        .filter((t) => num(t.blows) != null && num(t.blows) > 0 && t.moisture != null)
        .map((t) => ({ x: Math.log10(num(t.blows)), y: t.moisture }));
      flowFit = lineFit(pts);
      if (flowFit) {
        ll = Math.round(flowFit.m * Math.log10(25) + flowFit.b);
        flowIndex = -flowFit.m; // flow index = -slope (per decade)
      }
    }
  }

  const plVals = plTrials.map((t) => t.moisture).filter((v) => v != null);
  const pl = report.nonPlastic ? null : (plVals.length ? Math.round(plVals.reduce((a, b) => a + b, 0) / plVals.length) : null);
  const pi = report.nonPlastic ? 0 : (ll != null && pl != null ? ll - pl : null);

  const classification = report.nonPlastic ? "ML" : plasticityClass({ ll, pi, organic: report.organic });
  // U-line check: PI should not exceed 0.9(LL−8).
  const uLineOk = ll != null && pi != null ? pi <= 0.9 * (ll - 8) + 0.5 : null;

  return { llMethod, llTrials, plTrials, ll, pl, pi, flowFit, flowIndex, classification, uLineOk, nonPlastic: !!report.nonPlastic };
}

function readAll() { try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function writeAll(rows) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); }

export function getAtterbergReports() { return readAll(); }
export function getAtterbergReport(id) { return readAll().find((r) => String(r.id) === String(id)) || null; }
export function saveAtterbergReport(report) {
  const rows = readAll();
  const next = { ...report, updatedAt: new Date().toISOString() };
  const i = rows.findIndex((r) => String(r.id) === String(next.id));
  if (i >= 0) rows[i] = next; else rows.unshift(next);
  writeAll(rows);
  return next;
}
export function deleteAtterbergReport(id) { writeAll(readAll().filter((r) => String(r.id) !== String(id))); }

const llTrial = () => ({ id: crypto.randomUUID(), blows: "", tareWet: "", tareDry: "", tare: "" });
const plTrial = () => ({ id: crypto.randomUUID(), tareWet: "", tareDry: "", tare: "" });

export function createAtterbergReport(seed = {}) {
  const year = new Date().getFullYear();
  return {
    id: crypto.randomUUID(),
    reportNumber: `ATT-${year}-${String(Date.now()).slice(-6)}`,
    status: ATTERBERG_STATUS.DRAFT,
    projectName: "", projectNumber: "", boringNumber: "", sampleType: "Bulk", date: "",
    naturalMoisture: "",
    llMethod: "multipoint",
    llTrialToUse: "B",
    llTrials: [llTrial(), llTrial(), llTrial()],
    plTrials: [plTrial(), plTrial()],
    nonPlastic: false,
    organic: false,
    customClassification: "",
    remarks: "",
    technicianName: seed.technicianName || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function addLlTrial(report) { return { ...report, llTrials: [...(report.llTrials || []), llTrial()] }; }
export function addPlTrial(report) { return { ...report, plTrials: [...(report.plTrials || []), plTrial()] }; }

export function formatAtterbergStatus(status) {
  return { [ATTERBERG_STATUS.DRAFT]: "Draft", [ATTERBERG_STATUS.SUBMITTED]: "Submitted", [ATTERBERG_STATUS.APPROVED]: "Approved" }[status] || "Draft";
}
