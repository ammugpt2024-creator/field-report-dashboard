// Washed Particle Size / Gradation Test Report (ASTM D422).
// Self-contained lab report stored in localStorage. Input = retained weight per
// sieve + total soil weight; cumulative retained and % passing are derived.

const STORAGE_KEY = "qcore:lab-gradation";

export const GRADATION_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved"
};

// Standard US sieve set with opening size in millimetres (coarse → fine).
export const STANDARD_SIEVES = [
  { label: "1 in.", mm: 25.4 },
  { label: "3/4 in.", mm: 19.0 },
  { label: "3/8 in.", mm: 9.5 },
  { label: "# 4", mm: 4.75 },
  { label: "# 10", mm: 2.0 },
  { label: "# 20", mm: 0.85 },
  { label: "# 40", mm: 0.425 },
  { label: "# 60", mm: 0.25 },
  { label: "# 100", mm: 0.15 },
  { label: "# 140", mm: 0.106 },
  { label: "# 200", mm: 0.075 }
];

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

// Derive cumulative retained weight and % passing for each sieve row.
//   cumulative retained = running sum of individual retained weights
//   % passing           = (total soil − cumulative retained) / total soil × 100
export function computeGradationRows(sieves, totalSoilWeight) {
  const total = Number(totalSoilWeight);
  const hasTotal = Number.isFinite(total) && total > 0;
  let cum = 0;
  return (sieves || []).map((s) => {
    const r = Number(s.retained);
    const ret = Number.isFinite(r) && r >= 0 ? r : 0;
    cum += ret;
    const passing = hasTotal ? ((total - cum) / total) * 100 : null;
    return {
      ...s,
      cumulativeRetained: cum,
      percentPassing: passing
    };
  });
}

export function getGradationReports() {
  return readAll();
}

export function getGradationReport(id) {
  return readAll().find((row) => String(row.id) === String(id)) || null;
}

export function saveGradationReport(report) {
  const rows = readAll();
  const next = { ...report, updatedAt: new Date().toISOString() };
  const index = rows.findIndex((row) => String(row.id) === String(next.id));
  if (index >= 0) rows[index] = next; else rows.unshift(next);
  writeAll(rows);
  return next;
}

export function deleteGradationReport(id) {
  writeAll(readAll().filter((row) => String(row.id) !== String(id)));
}

export function createGradationReport(seed = {}) {
  const year = new Date().getFullYear();
  return {
    id: crypto.randomUUID(),
    reportNumber: `GRD-${year}-${String(Date.now()).slice(-6)}`,
    status: GRADATION_STATUS.DRAFT,
    projectName: "",
    projectNumber: "",
    boringNumber: "",
    date: "",
    totalSoilWeight: "",
    // Per-sieve retained weight (g). mm/label are fixed to the standard set.
    sieves: STANDARD_SIEVES.map((s) => ({ ...s, retained: "" })),
    remarks: "",
    technicianName: seed.technicianName || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function formatGradationStatus(status) {
  return {
    [GRADATION_STATUS.DRAFT]: "Draft",
    [GRADATION_STATUS.SUBMITTED]: "Submitted",
    [GRADATION_STATUS.APPROVED]: "Approved"
  }[status] || "Draft";
}
