// Compressive Strength of Concrete Cores (ASTM C42) — core break report.
// Self-contained lab report stored in localStorage; manual entry.

const STORAGE_KEY = "qcore:lab-core-breaks";

export const CORE_BREAK_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved"
};

// ASTM C42 length-to-diameter correction factors (banded by L/D ratio).
// Each band is inclusive on both ends; bands are contiguous from 1.00 to 2.10.
export const CORE_CORRECTION_FACTORS = [
  { min: 1.00, max: 1.02, factor: 0.87 },
  { min: 1.03, max: 1.06, factor: 0.88 },
  { min: 1.07, max: 1.10, factor: 0.89 },
  { min: 1.11, max: 1.14, factor: 0.90 },
  { min: 1.15, max: 1.18, factor: 0.91 },
  { min: 1.19, max: 1.22, factor: 0.92 },
  { min: 1.23, max: 1.29, factor: 0.93 },
  { min: 1.30, max: 1.38, factor: 0.94 },
  { min: 1.39, max: 1.46, factor: 0.95 },
  { min: 1.47, max: 1.56, factor: 0.96 },
  { min: 1.57, max: 1.69, factor: 0.97 },
  { min: 1.70, max: 1.81, factor: 0.98 },
  { min: 1.82, max: 1.93, factor: 0.99 },
  { min: 1.94, max: 2.10, factor: 1.00 }
];

// Resolve the correction factor for an L/D ratio. Below 1.00 the core should not
// be tested; at/above 2.10 the factor is 1.00.
export function coreCorrectionFactor(ratio) {
  const r = Number(ratio);
  if (!Number.isFinite(r)) return { factor: null, note: "" };
  if (r < 1.00) return { factor: null, note: "Do Not Test" };
  if (r > 2.10) return { factor: 1.00, note: "" };
  const rounded = Math.round(r * 100) / 100;
  const band = CORE_CORRECTION_FACTORS.find((b) => rounded >= b.min && rounded <= b.max);
  return band ? { factor: band.factor, note: "" } : { factor: 1.00, note: "" };
}

function readAll() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeAll(rows) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function parsePsi(value) {
  const match = String(value || "").match(/\d[\d,]*(\.\d+)?/);
  return match ? Number(match[0].replace(/,/g, "")) : null;
}

const round10 = (n) => String(Math.round(n / 10) * 10);

// Compute the derived columns for one core specimen:
//   area      = π/4 · diameter²                      (rounded to 2 dp, used downstream)
//   strength  = load / area                          (nearest 10 psi)
//   L/D ratio = uncapped length / diameter           (2 dp)
//   factor    = correction factor from the L/D table
//   corrected = strength × factor                    (nearest 10 psi)
//   unit wt   = weight × 1728 / (area × uncapped length)   (pcf)
export function computeCoreSpecimen(row) {
  const dia = Number(row.coreDiameter);
  const lenUncapped = Number(row.lengthUncapped);
  const load = Number(row.load);
  const weight = Number(row.weightBeforeCapping);

  const areaRaw = Number.isFinite(dia) && dia > 0 ? (Math.PI / 4) * dia * dia : null;
  const area = areaRaw === null ? null : Number(areaRaw.toFixed(2));
  const strength = area && Number.isFinite(load) && load > 0 ? load / area : null;
  const ldRatio = Number.isFinite(lenUncapped) && lenUncapped > 0 && Number.isFinite(dia) && dia > 0
    ? lenUncapped / dia
    : null;
  const cf = ldRatio !== null ? coreCorrectionFactor(ldRatio) : { factor: null, note: "" };
  const strengthRounded = strength === null ? null : Math.round(strength / 10) * 10;
  const corrected = strengthRounded !== null && cf.factor != null ? strengthRounded * cf.factor : null;
  const unitWeight = area && Number.isFinite(weight) && weight > 0 && Number.isFinite(lenUncapped) && lenUncapped > 0
    ? (weight * 1728) / (area * lenUncapped)
    : null;

  return {
    ...row,
    area: area === null ? "" : area.toFixed(2),
    compressiveStrength: strength === null ? "" : round10(strength),
    ldRatio: ldRatio === null ? "" : ldRatio.toFixed(2),
    correctionFactor: cf.factor != null ? cf.factor.toFixed(2) : "",
    correctionNote: cf.note || "",
    correctedStrength: corrected === null ? "" : round10(corrected),
    unitWeight: unitWeight === null ? "" : unitWeight.toFixed(2)
  };
}

export function createCoreSpecimenRow(seed = {}) {
  return computeCoreSpecimen({
    id: crypto.randomUUID(),
    sampleNo: seed.sampleNo || "",
    lengthUncapped: "",
    lengthCapped: "",
    coreDiameter: "",
    load: "",
    weightBeforeCapping: "",
    ageDays: seed.ageDays || "",
    area: "",
    compressiveStrength: "",
    ldRatio: "",
    correctionFactor: "",
    correctedStrength: "",
    unitWeight: ""
  });
}

// Average of the corrected compressive strengths across all cores that have one.
export function averageCorrectedStrength(specimens = []) {
  const values = specimens
    .map((s) => Number(s.correctedStrength))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!values.length) return "";
  const avg = values.reduce((sum, n) => sum + n, 0) / values.length;
  return round10(avg);
}

export function getCoreBreaks() {
  return readAll();
}

export function getCoreBreak(id) {
  return readAll().find((row) => String(row.id) === String(id)) || null;
}

export function saveCoreBreak(report) {
  const rows = readAll();
  const next = {
    ...report,
    specimens: (report.specimens || []).map((row) => computeCoreSpecimen(row)),
    updatedAt: new Date().toISOString()
  };
  const index = rows.findIndex((row) => String(row.id) === String(next.id));
  if (index >= 0) rows[index] = next; else rows.unshift(next);
  writeAll(rows);
  return next;
}

export function deleteCoreBreak(id) {
  writeAll(readAll().filter((row) => String(row.id) !== String(id)));
}

export function createCoreBreakReport(seed = {}) {
  const year = new Date().getFullYear();
  return {
    id: crypto.randomUUID(),
    reportNumber: `CCB-${year}-${String(Date.now()).slice(-6)}`,
    status: CORE_BREAK_STATUS.DRAFT,
    // Header / project
    projectName: "",
    projectNumber: "",
    setNumber: "",
    // Report info
    requiredStrength: "",
    diameterOfCores: "As stated above",
    conditionOfCores: "Good",
    directionOfLoading: "Perpendicular",
    placementLocation: "",
    panelShotOn: "",
    dateCored: "",
    dateTested: "",
    testedBy: seed.technicianName || "",
    preparedBy: "",
    // Target compressive strength reference
    target3Day: "",
    target7Day: "",
    target28Day: "",
    // Results
    specimens: [],
    remarks: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function formatCoreBreakStatus(status) {
  return {
    [CORE_BREAK_STATUS.DRAFT]: "Draft",
    [CORE_BREAK_STATUS.SUBMITTED]: "Submitted",
    [CORE_BREAK_STATUS.APPROVED]: "Approved"
  }[status] || "Draft";
}
