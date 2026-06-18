// California Bearing Ratio (CBR) — ASTM D1883 / AASHTO T 193.
// Handles soaked / unsoaked and single-point / 3-point (density-bracketed
// design CBR). Load–penetration with automatic zero correction, swell, and
// design CBR by interpolation. Self-contained, stored in localStorage.

const STORAGE_KEY = "qcore:lab-cbr";

export const CBR_STATUS = { DRAFT: "draft", SUBMITTED: "submitted", APPROVED: "approved" };
export const CBR_STANDARDS = ["ASTM D1883", "AASHTO T 193"];
export const CBR_CONDITIONS = [
  { value: "soaked", label: "Soaked (4-day)" },
  { value: "unsoaked", label: "Unsoaked" }
];
export const CBR_METHODS = [
  { value: "single", label: "Single-point" },
  { value: "three", label: "3-point (design CBR)" }
];

export const PISTON_AREA = 3; // in²
export const PEN_POINTS = [0.025, 0.05, 0.075, 0.1, 0.125, 0.15, 0.175, 0.2, 0.3, 0.4, 0.5];
// Standard unit loads on crushed stone (psi) at the given penetration (in).
export const STD_LOADS = [
  { pen: 0.1, psi: 1000 }, { pen: 0.2, psi: 1500 }, { pen: 0.3, psi: 1900 },
  { pen: 0.4, psi: 2300 }, { pen: 0.5, psi: 2600 }
];

const num = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

// Linear-interpolate unit load (psi) at a given penetration (in).
function interpLoad(pts, x) {
  const p = pts.filter((q) => q.pen != null && q.unitLoad != null);
  if (p.length < 2) return null;
  if (x <= p[0].pen) {
    const A = p[0], B = p[1];
    if (B.pen === A.pen) return A.unitLoad;
    return A.unitLoad + (x - A.pen) / (B.pen - A.pen) * (B.unitLoad - A.unitLoad);
  }
  for (let i = 0; i < p.length - 1; i += 1) {
    const A = p[i], B = p[i + 1];
    if (x >= A.pen && x <= B.pen) {
      if (B.pen === A.pen) return A.unitLoad;
      return A.unitLoad + (x - A.pen) / (B.pen - A.pen) * (B.unitLoad - A.unitLoad);
    }
  }
  return null; // beyond the measured range
}

// Automatic zero correction (ASTM D1883 §): when the curve is concave up at the
// start, the tangent at the steepest initial slope is projected to the load
// axis; its penetration intercept becomes the corrected origin.
function autoZero(pts) {
  const p = pts.filter((q) => q.pen != null && q.unitLoad != null).sort((a, b) => a.pen - b.pen);
  if (p.length < 2) return 0;
  let best = 0, mMax = 0;
  for (let i = 0; i < p.length - 1; i += 1) {
    if (p[i].pen > 0.2) break;
    const dy = p[i + 1].unitLoad - p[i].unitLoad, dx = p[i + 1].pen - p[i].pen;
    if (dx > 0) {
      const s = dy / dx;
      if (s > mMax) { mMax = s; best = p[i].pen - p[i].unitLoad / s; }
    }
  }
  return best > 0 ? best : 0;
}

export function computeSpecimen(spec, ctx) {
  const area = num(ctx?.pistonArea) || PISTON_AREA;
  const pts = (spec.penetrations || [])
    .map((r) => { const pen = num(r.pen), load = num(r.load); return { pen, load, unitLoad: load != null ? load / area : null }; })
    .filter((r) => r.pen != null).sort((a, b) => a.pen - b.pen);

  const manual = num(spec.zeroCorrection);
  const offset = manual != null ? manual : autoZero(pts);
  const ul = (target) => interpLoad(pts, target + offset);
  const ul01 = ul(0.1), ul02 = ul(0.2);
  const cbr01 = ul01 != null ? (ul01 / 1000) * 100 : null;
  const cbr02 = ul02 != null ? (ul02 / 1500) * 100 : null;

  // 0.1" governs unless 0.2" gives a higher value (then the test is flagged
  // for a re-run and the 0.2" value is reported).
  let governing = null, governingAt = null, rerun = false;
  if (cbr01 != null || cbr02 != null) {
    if (cbr01 != null && cbr02 != null && cbr02 > cbr01) { governing = cbr02; governingAt = 0.2; rerun = true; }
    else { governing = cbr01 != null ? cbr01 : cbr02; governingAt = cbr01 != null ? 0.1 : 0.2; }
  }

  const H0 = num(ctx?.specimenHeight);
  const si = num(spec.swellInitial), sf = num(spec.swellFinal);
  const swell = (H0 != null && H0 > 0 && si != null && sf != null) ? ((sf - si) / H0) * 100 : null;

  // Curve shifted to the corrected origin, prefixed with (0, 0).
  const corrected = [{ pen: 0, unitLoad: 0 }, ...pts.map((r) => ({ pen: r.pen - offset, unitLoad: r.unitLoad })).filter((r) => r.pen > 1e-9 && r.unitLoad != null)];

  return {
    pts, corrected, offset, autoOffset: autoZero(pts),
    ul01, ul02, cbr01, cbr02, governing, governingAt, rerun,
    dryDensity: num(spec.dryDensity), moisture: num(spec.moisture), swell
  };
}

export function computeCbrResults(report) {
  const ctx = { pistonArea: report.pistonArea, specimenHeight: report.specimenHeight };
  const count = report.method === "three" ? 3 : 1;
  const specimens = (report.specimens || []).slice(0, count).map((s) => ({ ...s, _r: computeSpecimen(s, ctx) }));

  let designCBR = null, targetDensity = null, densityPoints = [];
  if (report.method === "three") {
    const mdd = num(report.maxDryDensity), tc = num(report.targetCompaction);
    targetDensity = (mdd != null && tc != null) ? (mdd * tc) / 100 : null;
    densityPoints = specimens
      .map((s) => ({ density: s._r.dryDensity, cbr: s._r.governing }))
      .filter((p) => p.density != null && p.cbr != null)
      .sort((a, b) => a.density - b.density);
    if (targetDensity != null && densityPoints.length >= 2) {
      const p = densityPoints;
      if (targetDensity <= p[0].density) designCBR = p[0].cbr;
      else if (targetDensity >= p[p.length - 1].density) designCBR = p[p.length - 1].cbr;
      else for (let i = 0; i < p.length - 1; i += 1) {
        const A = p[i], B = p[i + 1];
        if (targetDensity >= A.density && targetDensity <= B.density) { designCBR = A.cbr + (targetDensity - A.density) / (B.density - A.density) * (B.cbr - A.cbr); break; }
      }
    } else if (densityPoints.length === 1) designCBR = densityPoints[0].cbr;
  } else {
    designCBR = specimens[0]?._r.governing ?? null;
  }

  return { specimens, designCBR, targetDensity, densityPoints };
}

function readAll() { try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function writeAll(rows) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); }

export function getCbrReports() { return readAll(); }
export function getCbrReport(id) { return readAll().find((r) => String(r.id) === String(id)) || null; }
export function saveCbrReport(report) {
  const rows = readAll();
  const next = { ...report, updatedAt: new Date().toISOString() };
  const i = rows.findIndex((r) => String(r.id) === String(next.id));
  if (i >= 0) rows[i] = next; else rows.unshift(next);
  writeAll(rows);
  return next;
}
export function deleteCbrReport(id) { writeAll(readAll().filter((r) => String(r.id) !== String(id))); }

function blankSpecimen(blows) {
  return {
    id: crypto.randomUUID(),
    blows: blows != null ? String(blows) : "",
    dryDensity: "", moisture: "", zeroCorrection: "",
    swellInitial: "", swellFinal: "",
    penetrations: PEN_POINTS.map((pen) => ({ pen, load: "" }))
  };
}

export function createCbrReport(seed = {}) {
  const year = new Date().getFullYear();
  return {
    id: crypto.randomUUID(),
    reportNumber: `CBR-${year}-${String(Date.now()).slice(-6)}`,
    status: CBR_STATUS.DRAFT,
    clientName: "", projectName: "", projectNumber: "", reportDate: "", sampleNumber: "",
    standard: "ASTM D1883", condition: "soaked", method: "single",
    pistonArea: String(PISTON_AREA), specimenHeight: "4.584",
    maxDryDensity: "", targetCompaction: "95",
    specimens: [blankSpecimen(56), blankSpecimen(25), blankSpecimen(10)],
    remarks: "", technicianName: seed.technicianName || "",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}

export function formatCbrStatus(status) {
  return { [CBR_STATUS.DRAFT]: "Draft", [CBR_STATUS.SUBMITTED]: "Submitted", [CBR_STATUS.APPROVED]: "Approved" }[status] || "Draft";
}
