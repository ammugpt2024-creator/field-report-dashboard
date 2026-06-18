// Moisture-Density Relations of Soils (Proctor) — multi-method lab report.
// Supports ASTM D698 / D1557, AASHTO T99 / T180, and VTM-1; method selection
// presets the test parameters. Self-contained, stored in localStorage.

const STORAGE_KEY = "qcore:lab-proctor";
const GAMMA_W = 62.4; // unit weight of water, pcf

export const PROCTOR_STATUS = { DRAFT: "draft", SUBMITTED: "submitted", APPROVED: "approved" };

// Per-(standard, method) presets. Only mold size + control sieve affect the math;
// hammer / drop / layers / blows are recorded values defining the compactive effort.
export const PROCTOR_METHODS = [
  { id: "ASTM D698 A", standard: "ASTM D698", effort: "Standard", method: "A", moldIn: 4, sieve: "No. 4", blows: 25, layers: 3, hammerLb: 5.5, dropIn: 12 },
  { id: "ASTM D698 B", standard: "ASTM D698", effort: "Standard", method: "B", moldIn: 4, sieve: "3/8 in", blows: 25, layers: 3, hammerLb: 5.5, dropIn: 12 },
  { id: "ASTM D698 C", standard: "ASTM D698", effort: "Standard", method: "C", moldIn: 6, sieve: "3/4 in", blows: 56, layers: 3, hammerLb: 5.5, dropIn: 12 },
  { id: "ASTM D1557 A", standard: "ASTM D1557", effort: "Modified", method: "A", moldIn: 4, sieve: "No. 4", blows: 25, layers: 5, hammerLb: 10, dropIn: 18 },
  { id: "ASTM D1557 B", standard: "ASTM D1557", effort: "Modified", method: "B", moldIn: 4, sieve: "3/8 in", blows: 25, layers: 5, hammerLb: 10, dropIn: 18 },
  { id: "ASTM D1557 C", standard: "ASTM D1557", effort: "Modified", method: "C", moldIn: 6, sieve: "3/4 in", blows: 56, layers: 5, hammerLb: 10, dropIn: 18 },
  { id: "AASHTO T99 A", standard: "AASHTO T99", effort: "Standard", method: "A", moldIn: 4, sieve: "No. 4", blows: 25, layers: 3, hammerLb: 5.5, dropIn: 12 },
  { id: "AASHTO T99 B", standard: "AASHTO T99", effort: "Standard", method: "B", moldIn: 6, sieve: "No. 4", blows: 56, layers: 3, hammerLb: 5.5, dropIn: 12 },
  { id: "AASHTO T99 C", standard: "AASHTO T99", effort: "Standard", method: "C", moldIn: 4, sieve: "3/4 in", blows: 25, layers: 3, hammerLb: 5.5, dropIn: 12 },
  { id: "AASHTO T99 D", standard: "AASHTO T99", effort: "Standard", method: "D", moldIn: 6, sieve: "3/4 in", blows: 56, layers: 3, hammerLb: 5.5, dropIn: 12 },
  { id: "AASHTO T180 A", standard: "AASHTO T180", effort: "Modified", method: "A", moldIn: 4, sieve: "No. 4", blows: 25, layers: 5, hammerLb: 10, dropIn: 18 },
  { id: "AASHTO T180 B", standard: "AASHTO T180", effort: "Modified", method: "B", moldIn: 6, sieve: "No. 4", blows: 56, layers: 5, hammerLb: 10, dropIn: 18 },
  { id: "AASHTO T180 C", standard: "AASHTO T180", effort: "Modified", method: "C", moldIn: 4, sieve: "3/4 in", blows: 25, layers: 5, hammerLb: 10, dropIn: 18 },
  { id: "AASHTO T180 D", standard: "AASHTO T180", effort: "Modified", method: "D", moldIn: 6, sieve: "3/4 in", blows: 56, layers: 5, hammerLb: 10, dropIn: 18 },
  { id: "VTM-1", standard: "VTM-1", effort: "Modified", method: "", moldIn: 6, sieve: "3/4 in", blows: 56, layers: 5, hammerLb: 10, dropIn: 18 }
];

export function getMethod(id) {
  return PROCTOR_METHODS.find((m) => m.id === id) || PROCTOR_METHODS[5];
}

// Default mold factor (pcf per gram of wet soil) from nominal mold volume.
// 6" mold = 0.075 ft³ -> 0.02940 ; 4" mold = 0.03333 ft³ -> 0.06614
export function defaultMoldFactor(moldIn) {
  return Number(moldIn) === 6 ? 0.0294 : 0.06614;
}

// Standard sieve set with opening size (mm) for gradation + classification.
export const PROCTOR_SIEVES = [
  { label: "3 in.", mm: 75 }, { label: "2 in.", mm: 50 }, { label: "1.5 in.", mm: 37.5 },
  { label: "1 in.", mm: 25 }, { label: "3/4 in.", mm: 19 }, { label: "3/8 in.", mm: 9.5 },
  { label: "No. 4", mm: 4.75 }, { label: "No. 10", mm: 2.0 }, { label: "No. 20", mm: 0.85 },
  { label: "No. 40", mm: 0.425 }, { label: "No. 60", mm: 0.25 }, { label: "No. 100", mm: 0.15 },
  { label: "No. 200", mm: 0.075 }
];

const num = (v) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

// ── Proctor points ──────────────────────────────────────────────────────────
// Per point: wet soil = (wtSoilMold - moldWt); wet density = wet soil × mold factor;
// moisture = (wet - dry)/(dry - tare)×100 ; dry density = wet density / (1+MC/100).
// Oversize (ASTM D4718): TMC = MC·Pf + oversizeMoisture·Pc ; TDD via D4718.
export function computeProctorPoint(point, ctx) {
  const moldWt = num(ctx.moldWt);
  const factor = num(ctx.moldFactor);
  const Pc = num(ctx.percentRetained) != null ? num(ctx.percentRetained) / 100 : 0;
  const Pf = 1 - Pc;
  const Gm = num(ctx.gs);
  const wOver = num(ctx.oversizeMoisture) != null ? num(ctx.oversizeMoisture) : 0;

  const wtSoilMold = num(point.wtSoilMold);
  const tare = num(point.tare);
  const wet = num(point.wet);
  const dry = num(point.dry);

  const wetSoil = wtSoilMold != null && moldWt != null ? wtSoilMold - moldWt : null;
  const wetDensity = wetSoil != null && factor != null && wetSoil > 0 ? wetSoil * factor : null;
  const moisture = wet != null && dry != null && tare != null && dry - tare > 0 ? ((wet - dry) / (dry - tare)) * 100 : null;
  const dryDensity = wetDensity != null && moisture != null ? wetDensity / (1 + moisture / 100) : null;

  let tmc = null, tdd = null;
  if (moisture != null) tmc = moisture * Pf + wOver * Pc;
  if (dryDensity != null && Gm != null && Gm > 0) {
    const denom = dryDensity * Pc + Gm * GAMMA_W * Pf;
    if (denom > 0) tdd = (dryDensity * Gm * GAMMA_W) / denom;
  }

  return {
    ...point,
    wetSoil: wetSoil != null ? wetSoil : "",
    wetDensity: wetDensity != null ? wetDensity.toFixed(1) : "",
    moisture: moisture != null ? moisture.toFixed(1) : "",
    dryDensity: dryDensity != null ? dryDensity.toFixed(1) : "",
    tmc: tmc != null ? tmc.toFixed(1) : "",
    tdd: tdd != null ? tdd.toFixed(1) : ""
  };
}

// General least-squares polynomial fit. Returns coefficients [c0, c1, …, cd]
// for y = c0 + c1·x + … + cd·x^d (or null if too few points / singular).
export function polyFit(pts, degree) {
  const p = pts.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
  if (p.length < degree + 1) return null;
  const d = degree;
  const A = Array.from({ length: d + 1 }, () => new Array(d + 1).fill(0));
  const b = new Array(d + 1).fill(0);
  for (const { x, y } of p) {
    const xp = [1];
    for (let k = 1; k <= 2 * d; k += 1) xp[k] = xp[k - 1] * x;
    for (let i = 0; i <= d; i += 1) {
      for (let j = 0; j <= d; j += 1) A[i][j] += xp[i + j];
      b[i] += xp[i] * y;
    }
  }
  const M = A.map((row, i) => [...row, b[i]]);
  const n = d + 1;
  for (let i = 0; i < n; i += 1) {
    let piv = i;
    for (let r = i + 1; r < n; r += 1) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    if (Math.abs(M[piv][i]) < 1e-12) return null;
    [M[i], M[piv]] = [M[piv], M[i]];
    for (let r = 0; r < n; r += 1) {
      if (r === i) continue;
      const f = M[r][i] / M[i][i];
      for (let c = i; c <= n; c += 1) M[r][c] -= f * M[i][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function evalPoly(coeffs, x) {
  if (!coeffs) return null;
  let y = 0;
  for (let i = coeffs.length - 1; i >= 0; i -= 1) y = y * x + coeffs[i];
  return y;
}

// Peak (max dry density) of the fitted curve within the tested moisture range.
export function polyPeak(coeffs, xmin, xmax) {
  if (!coeffs || !(xmax > xmin)) return null;
  const N = 600;
  let best = null;
  for (let i = 0; i <= N; i += 1) {
    const x = xmin + (xmax - xmin) * (i / N);
    const y = evalPoly(coeffs, x);
    if (best === null || y > best.y) best = { x, y };
  }
  return best;
}

// Match the reference workbook: order-3 polynomial when ≥4 points, order-2 for 3.
export function curveDegree(n) { return n >= 4 ? 3 : (n === 3 ? 2 : null); }

// Zero-air-voids dry density at moisture w (%) for a given Gs.
export function zavDensity(w, gs) {
  const G = Number(gs);
  if (!Number.isFinite(G) || G <= 0) return null;
  return (G * GAMMA_W) / (1 + (w / 100) * G);
}

// MDD/OMC (from fine curve peak) and corrected MDD/OMC (correct the peak per D4718).
export function computeProctorResults(report) {
  const ctx = report;
  const computed = (report.points || []).map((pt) => computeProctorPoint(pt, ctx));
  const finePts = computed
    .map((pt) => ({ x: num(pt.moisture), y: num(pt.dryDensity) }))
    .filter((q) => q.x != null && q.y != null);
  const fineXs = finePts.map((p) => p.x);
  const fineRange = fineXs.length ? [Math.min(...fineXs), Math.max(...fineXs)] : null;
  const fit = polyFit(finePts, curveDegree(finePts.length));
  const peak = fit && fineRange ? polyPeak(fit, fineRange[0], fineRange[1]) : null;

  const Pc = num(report.percentRetained) != null ? num(report.percentRetained) / 100 : 0;
  const Pf = 1 - Pc;
  const Gm = num(report.gs);
  const wOver = num(report.oversizeMoisture) != null ? num(report.oversizeMoisture) : 0;

  let mdd = null, omc = null, correctedMdd = null, correctedOmc = null;
  if (peak) {
    mdd = peak.y; omc = peak.x;
    if (Gm != null && Gm > 0 && Pc > 0) {
      const denom = mdd * Pc + Gm * GAMMA_W * Pf;
      if (denom > 0) correctedMdd = (mdd * Gm * GAMMA_W) / denom;
      correctedOmc = omc * Pf + wOver * Pc;
    }
  }
  // Corrected curve fit through the per-point (TMC, TDD) values.
  const corrPts = computed
    .map((pt) => ({ x: num(pt.tmc), y: num(pt.tdd) }))
    .filter((q) => q.x != null && q.y != null);
  const corrXs = corrPts.map((p) => p.x);
  const corrRange = corrXs.length ? [Math.min(...corrXs), Math.max(...corrXs)] : null;
  const corrFit = polyFit(corrPts, curveDegree(corrPts.length));

  return {
    computedPoints: computed,
    finePoints: finePts,
    corrPoints: corrPts,
    fit, fineRange,
    corrFit, corrRange,
    mdd, omc,
    correctedMdd, correctedOmc,
    hasOversize: Pc > 0.05
  };
}

// ── Sieve / gradation ───────────────────────────────────────────────────────
export function computeSievePassing(sieves, totalWeight) {
  const total = num(totalWeight);
  let cum = 0;
  return (sieves || []).map((s) => {
    const r = num(s.retained);
    const ret = r != null && r >= 0 ? r : 0;
    cum += ret;
    const passing = total != null && total > 0 ? ((total - cum) / total) * 100 : null;
    return { ...s, cumulativeRetained: cum, percentPassing: passing };
  });
}

// Interpolate the grain size (mm) at a target % passing on a log scale.
function sizeAtPassing(rows, target) {
  const pts = rows.filter((r) => r.percentPassing != null).map((r) => ({ mm: r.mm, p: r.percentPassing }));
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i], b = pts[i + 1];
    if ((a.p >= target && b.p <= target) || (a.p <= target && b.p >= target)) {
      if (a.p === b.p) return a.mm;
      const t = (target - a.p) / (b.p - a.p);
      const logMm = Math.log10(a.mm) + t * (Math.log10(b.mm) - Math.log10(a.mm));
      return Math.pow(10, logMm);
    }
  }
  return null;
}

function passingAt(rows, label) {
  const row = rows.find((r) => r.label === label);
  return row && row.percentPassing != null ? row.percentPassing : null;
}

// ── Atterberg limits ────────────────────────────────────────────────────────
const canMoisture = (t) => {
  const wet = num(t.tareWet), dry = num(t.tareDry), tare = num(t.tare);
  return wet != null && dry != null && tare != null && dry - tare > 0 ? ((wet - dry) / (dry - tare)) * 100 : null;
};
// One-point LL correction factor k = (N/25)^0.121
const llFactor = (blows) => {
  const N = num(blows);
  return N != null && N > 0 ? Math.pow(N / 25, 0.121) : null;
};

export function computeAtterberg(att = {}) {
  const llTrials = (att.llTrials || []).map((t) => {
    const m = canMoisture(t);
    const k = llFactor(t.blows);
    return { ...t, moisture: m, corrected: m != null && k != null ? m * k : null, factor: k };
  });
  const plTrials = (att.plTrials || []).map((t) => ({ ...t, moisture: canMoisture(t) }));

  const useIdx = att.llTrialToUse === "B" ? 1 : att.llTrialToUse === "A" ? 0 : (llTrials.length - 1);
  const chosen = llTrials[useIdx];
  const ll = chosen && chosen.corrected != null ? Math.round(chosen.corrected) : null;
  const plVals = plTrials.map((t) => t.moisture).filter((v) => v != null);
  const pl = plVals.length ? Math.round(plVals.reduce((a, b) => a + b, 0) / plVals.length) : null;
  const pi = ll != null && pl != null ? ll - pl : null;
  const nonPlastic = att.nonPlastic === true;
  return {
    llTrials, plTrials,
    ll: nonPlastic ? null : ll,
    pl: nonPlastic ? null : pl,
    pi: nonPlastic ? 0 : pi,
    nonPlastic
  };
}

// ── Soil classification (USCS D2487 + AASHTO M145) ──────────────────────────
export function classifySoil({ sieveRows, ll, pi, organic }) {
  const fines = passingAt(sieveRows, "No. 200");
  const p4 = passingAt(sieveRows, "No. 4");
  const p10 = passingAt(sieveRows, "No. 10");
  const p40 = passingAt(sieveRows, "No. 40");
  const result = { uscs: "", aashto: "", gravelPct: null, sandPct: null, finesPct: fines };
  if (fines == null) return result;

  const PI = pi == null ? null : Number(pi);
  const LL = ll == null ? null : Number(ll);
  const aLine = LL != null ? 0.73 * (LL - 20) : null; // PI = 0.73(LL-20)
  const aboveA = PI != null && aLine != null ? PI >= aLine : null;

  // ---- USCS ----
  if (fines >= 50) {
    // Fine-grained
    if (organic) {
      result.uscs = LL != null && LL >= 50 ? "OH" : "OL";
    } else if (LL == null || PI == null) {
      result.uscs = "ML/CL";
    } else if (LL < 50) {
      if (PI < 4 || aboveA === false) result.uscs = "ML";
      else if (PI > 7 && aboveA) result.uscs = "CL";
      else result.uscs = "CL-ML";
    } else {
      result.uscs = aboveA ? "CH" : "MH";
    }
  } else {
    // Coarse-grained
    const gravel = p4 != null ? 100 - p4 : null;        // retained on No.4
    const sand = p4 != null ? p4 - fines : null;         // passing No.4, retained No.200
    result.gravelPct = gravel; result.sandPct = sand;
    const isGravel = gravel != null && sand != null ? gravel >= sand : (p4 != null ? p4 < 50 : true);
    const G = isGravel ? "G" : "S";

    // Gradation (W/P) from Cu/Cc when computable.
    const d10 = sizeAtPassing(sieveRows, 10), d30 = sizeAtPassing(sieveRows, 30), d60 = sizeAtPassing(sieveRows, 60);
    let grad = "";
    if (d10 && d30 && d60) {
      const Cu = d60 / d10, Cc = (d30 * d30) / (d10 * d60);
      if (isGravel) grad = Cu >= 4 && Cc >= 1 && Cc <= 3 ? "W" : "P";
      else grad = Cu >= 6 && Cc >= 1 && Cc <= 3 ? "W" : "P";
    } else {
      grad = "P"; // insufficient gradation -> assume poorly graded (overridable)
    }
    // Fines symbol (C/M) from plasticity.
    let finesSym = "";
    if (PI != null && aboveA != null) {
      if (PI < 4 || aboveA === false) finesSym = "M";
      else if (PI > 7 && aboveA) finesSym = "C";
      else finesSym = "C-M";
    }

    if (fines < 5) {
      result.uscs = `${G}${grad}`;
    } else if (fines > 12) {
      result.uscs = finesSym ? `${G}${finesSym.replace("C-M", "C-M")}` : `${G}M`;
    } else {
      // 5–12% fines: dual symbol, e.g. GP-GC
      const second = finesSym === "M" ? "M" : finesSym === "C" ? "C" : "C";
      result.uscs = `${G}${grad}-${G}${second}`;
    }
  }

  // ---- AASHTO M145 ----
  if (fines != null) {
    const F = fines, LLv = LL == null ? 0 : LL, PIv = PI == null ? 0 : PI;
    if (F <= 35) {
      // Granular
      if ((p10 == null || p10 <= 50) && (p40 == null || p40 <= 30) && F <= 15 && PIv <= 6) result.aashto = "A-1-a";
      else if ((p40 == null || p40 <= 50) && F <= 25 && PIv <= 6) result.aashto = "A-1-b";
      else if ((p40 != null && p40 >= 51) && F <= 10 && (PI == null || PI === 0)) result.aashto = "A-3";
      else {
        // A-2 subgroup
        if (LLv <= 40 && PIv <= 10) result.aashto = "A-2-4";
        else if (LLv >= 41 && PIv <= 10) result.aashto = "A-2-5";
        else if (LLv <= 40 && PIv >= 11) result.aashto = "A-2-6";
        else result.aashto = "A-2-7";
      }
    } else {
      // Silt-clay
      if (LLv <= 40 && PIv <= 10) result.aashto = "A-4";
      else if (LLv >= 41 && PIv <= 10) result.aashto = "A-5";
      else if (LLv <= 40 && PIv >= 11) result.aashto = "A-6";
      else result.aashto = PIv <= LLv - 30 ? "A-7-5" : "A-7-6";
    }
    // Group index
    const gi = Math.max(0, Math.round((F - 35) * (0.2 + 0.005 * (LLv - 40)) + 0.01 * (F - 15) * (PIv - 10)));
    if (result.aashto && F > 35) result.aashto += ` (${gi})`;
    else if (result.aashto && /A-2-6|A-2-7/.test(result.aashto)) result.aashto += ` (${Math.max(0, Math.round(0.01 * (F - 15) * (PIv - 10)))})`;
    else if (result.aashto) result.aashto += " (0)";
  }
  return result;
}

// ── CRUD ────────────────────────────────────────────────────────────────────
function readAll() { try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function writeAll(rows) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); }

export function getProctorReports() { return readAll(); }
export function getProctorReport(id) { return readAll().find((r) => String(r.id) === String(id)) || null; }
export function saveProctorReport(report) {
  const rows = readAll();
  const next = { ...report, updatedAt: new Date().toISOString() };
  const i = rows.findIndex((r) => String(r.id) === String(next.id));
  if (i >= 0) rows[i] = next; else rows.unshift(next);
  writeAll(rows);
  return next;
}
export function deleteProctorReport(id) { writeAll(readAll().filter((r) => String(r.id) !== String(id))); }

function blankPoint(n) {
  return { id: crypto.randomUUID(), no: n, wtSoilMold: "", tare: "", wet: "", dry: "" };
}

export function createProctorReport(seed = {}) {
  const year = new Date().getFullYear();
  const m = getMethod("ASTM D1557 C");
  return {
    id: crypto.randomUUID(),
    reportNumber: `PRC-${year}-${String(Date.now()).slice(-6)}`,
    status: PROCTOR_STATUS.DRAFT,
    projectName: "", projectNumber: "", boringNumber: "", sampleType: "Bulk", date: "",
    // Method + test parameters (preset, editable)
    methodId: m.id,
    moldWt: "", moldFactor: String(defaultMoldFactor(m.moldIn)),
    hammerLb: String(m.hammerLb), dropIn: String(m.dropIn), layers: String(m.layers), blows: String(m.blows), moldIn: String(m.moldIn),
    sieveUsed: m.sieve, gs: "", percentRetained: "", oversizeMoisture: "",
    naturalMoisture: "",
    points: [blankPoint(1), blankPoint(2), blankPoint(3), blankPoint(4)],
    // Sieve analysis
    sieveTotalWeight: "",
    sieves: PROCTOR_SIEVES.map((s) => ({ ...s, retained: "" })),
    // Atterberg
    atterberg: {
      llTrials: [{ id: crypto.randomUUID(), blows: "", tareWet: "", tareDry: "", tare: "" }, { id: crypto.randomUUID(), blows: "", tareWet: "", tareDry: "", tare: "" }],
      plTrials: [{ id: crypto.randomUUID(), tareWet: "", tareDry: "", tare: "" }, { id: crypto.randomUUID(), tareWet: "", tareDry: "", tare: "" }],
      llTrialToUse: "B",
      nonPlastic: false
    },
    organic: false,
    customClassification: "",
    remarks: "",
    technicianName: seed.technicianName || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function applyMethodPreset(report, methodId) {
  const m = getMethod(methodId);
  return {
    ...report,
    methodId,
    moldIn: String(m.moldIn),
    moldFactor: String(defaultMoldFactor(m.moldIn)),
    hammerLb: String(m.hammerLb), dropIn: String(m.dropIn), layers: String(m.layers), blows: String(m.blows),
    sieveUsed: m.sieve
  };
}

export function addProctorPoint(report) {
  const points = [...(report.points || []), blankPoint((report.points || []).length + 1)];
  return { ...report, points };
}

export function formatProctorStatus(status) {
  return { [PROCTOR_STATUS.DRAFT]: "Draft", [PROCTOR_STATUS.SUBMITTED]: "Submitted", [PROCTOR_STATUS.APPROVED]: "Approved" }[status] || "Draft";
}
