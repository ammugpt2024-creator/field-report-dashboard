// Grout Compressive Strength Test Report (ASTM C109 / C1107) — grout cube breaks.
// Self-contained lab report stored in localStorage; manual entry (no concrete-log link).

const STORAGE_KEY = "qcore:lab-grout-cube-breaks";

export const GROUT_CUBE_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved"
};

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

// Pull the first number out of a spec string like "5000 psi".
export function parsePsi(value) {
  const match = String(value || "").match(/\d[\d,]*(\.\d+)?/);
  return match ? Number(match[0].replace(/,/g, "")) : null;
}

// Compute the derived columns for one specimen row:
//   radius   = diameter / 2 (when a diameter is entered)
//   area     = π · radius²        (circular bearing area, per the source form)
//   strength = load / area        (rounded to the nearest 10 psi, per ASTM C109)
//   percent  = strength / specified minimum strength × 100
export function computeGroutSpecimen(row, { specifiedStrengthPsi } = {}) {
  const diameter = Number(row.diameter);
  const radius = Number.isFinite(diameter) && diameter > 0
    ? diameter / 2
    : Number(row.radius);
  const area = Number.isFinite(radius) && radius > 0 ? Math.PI * radius * radius : null;
  const load = Number(row.load);
  const strength = area && Number.isFinite(load) && load > 0 ? load / area : null;
  const required = Number(specifiedStrengthPsi);
  const percent = strength !== null && Number.isFinite(required) && required > 0
    ? (strength / required) * 100
    : null;
  return {
    ...row,
    radius: Number.isFinite(radius) && radius > 0 ? radius.toFixed(2) : "",
    area: area === null ? "" : area.toFixed(2),
    compressiveStrength: strength === null ? "" : String(Math.round(strength / 10) * 10),
    percentDesignStrength: percent === null ? "" : String(Math.round(percent))
  };
}

export function createGroutSpecimenRow(seed = {}) {
  return computeGroutSpecimen({
    id: crypto.randomUUID(),
    specimenNumber: seed.specimenNumber || "",
    testDate: seed.testDate || "",
    ageDays: seed.ageDays || "",
    diameter: seed.diameter || "",
    radius: "",
    load: "",
    area: "",
    compressiveStrength: "",
    percentDesignStrength: ""
  }, {});
}

export function getGroutCubeBreaks() {
  return readAll();
}

export function getGroutCubeBreak(id) {
  return readAll().find((row) => String(row.id) === String(id)) || null;
}

export function saveGroutCubeBreak(report) {
  const rows = readAll();
  const specifiedStrengthPsi = report.specifiedStrengthPsi || parsePsi(report.specifiedStrength);
  const next = {
    ...report,
    specifiedStrengthPsi,
    specimens: (report.specimens || []).map((row) => computeGroutSpecimen(row, { specifiedStrengthPsi })),
    updatedAt: new Date().toISOString()
  };
  const index = rows.findIndex((row) => String(row.id) === String(next.id));
  if (index >= 0) rows[index] = next; else rows.unshift(next);
  writeAll(rows);
  return next;
}

export function deleteGroutCubeBreak(id) {
  writeAll(readAll().filter((row) => String(row.id) !== String(id)));
}

export function createGroutCubeReport(seed = {}) {
  const year = new Date().getFullYear();
  return {
    id: crypto.randomUUID(),
    reportNumber: `GCB-${year}-${String(Date.now()).slice(-6)}`,
    status: GROUT_CUBE_STATUS.DRAFT,
    // Header
    client: "",
    projectName: "",
    attention: "",
    setNumber: "",
    projectNumber: "",
    // Sampling
    dateSampled: "",
    sampledBy: seed.technicianName || "",
    timeBatched: "",
    timeSampled: "",
    timePlaced: "",
    truckNumber: "",
    ticketNumber: "",
    location: "",
    mixDesignation: "",
    manufacturer: "",
    specifiedStrength: "",
    specifiedStrengthPsi: "",
    specimensMolded: "",
    // Field measurements
    airTemp: "",
    mixTemp: "",
    waterPerBag: "",
    fluiditySec: "",
    specificGravity: "",
    // Results
    specimens: [],
    remarks: "",
    technicianName: seed.technicianName || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function formatGroutCubeStatus(status) {
  return {
    [GROUT_CUBE_STATUS.DRAFT]: "Draft",
    [GROUT_CUBE_STATUS.SUBMITTED]: "Submitted",
    [GROUT_CUBE_STATUS.APPROVED]: "Approved"
  }[status] || "Draft";
}
