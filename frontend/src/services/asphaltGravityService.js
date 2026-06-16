// Bulk Specific Gravity and Density of Compacted Bituminous Mixtures
// (AASHTO T-166, ASTM D2726). Self-contained lab report in localStorage.

const STORAGE_KEY = "qcore:lab-asphalt-bsg";

export const ASPHALT_BSG_STATUS = {
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

// Celsius → Fahrenheit, to 1 decimal (blank when no valid input).
export function celsiusToFahrenheit(c) {
  const value = Number(c);
  return Number.isFinite(value) ? (value * 1.8 + 32).toFixed(1) : "";
}

// Compute the derived columns for one core:
//   Gs (bulk sp. gravity) = weight in air / (SSD weight − weight in water)
//   core density (pcf)    = Gs × 62.4
//   % compaction          = core density / plant compacted unit weight × 100
//   air voids (%)         = 100 − % compaction (from the rounded compaction)
export function computeAsphaltGravitySpecimen(row) {
  const inAir = Number(row.weightInAir);
  const ssd = Number(row.weightSSD);
  const inWater = Number(row.weightInWater);
  const plant = Number(row.plantUnitWeight);

  const denom = ssd - inWater;
  const gsb = Number.isFinite(inAir) && inAir > 0 && Number.isFinite(ssd) && Number.isFinite(inWater) && denom > 0
    ? inAir / denom
    : null;
  const coreDensity = gsb !== null ? gsb * 62.4 : null;
  const compaction = coreDensity !== null && Number.isFinite(plant) && plant > 0
    ? (coreDensity / plant) * 100
    : null;
  const compactionRounded = compaction === null ? null : Math.round(compaction * 10) / 10;
  const airVoids = compactionRounded === null ? null : 100 - compactionRounded;

  return {
    ...row,
    bulkSpecificGravity: gsb === null ? "" : gsb.toFixed(2),
    coreDensity: coreDensity === null ? "" : coreDensity.toFixed(2),
    percentCompaction: compaction === null ? "" : compaction.toFixed(1),
    airVoids: airVoids === null ? "" : airVoids.toFixed(1)
  };
}

export function createAsphaltGravitySpecimenRow(seed = {}) {
  return computeAsphaltGravitySpecimen({
    id: crypto.randomUUID(),
    sampleId: seed.sampleId || "",
    sampleDate: "",
    location: "",
    coreThickness: "",
    weightInAir: "",
    weightSSD: "",
    weightInWater: "",
    plantUnitWeight: "",
    bulkSpecificGravity: "",
    coreDensity: "",
    percentCompaction: "",
    airVoids: ""
  });
}

export function getAsphaltGravityReports() {
  return readAll();
}

export function getAsphaltGravityReport(id) {
  return readAll().find((row) => String(row.id) === String(id)) || null;
}

export function saveAsphaltGravityReport(report) {
  const rows = readAll();
  const next = {
    ...report,
    specimens: (report.specimens || []).map((row) => computeAsphaltGravitySpecimen(row)),
    updatedAt: new Date().toISOString()
  };
  const index = rows.findIndex((row) => String(row.id) === String(next.id));
  if (index >= 0) rows[index] = next; else rows.unshift(next);
  writeAll(rows);
  return next;
}

export function deleteAsphaltGravityReport(id) {
  writeAll(readAll().filter((row) => String(row.id) !== String(id)));
}

export function createAsphaltGravityReport(seed = {}) {
  const year = new Date().getFullYear();
  return {
    id: crypto.randomUUID(),
    reportNumber: `ABSG-${year}-${String(Date.now()).slice(-6)}`,
    status: ASPHALT_BSG_STATUS.DRAFT,
    projectName: "",
    projectNumber: "",
    setNumber: "",
    temperatureC: "",
    temperatureF: "",
    notes: "1. \n2. All specimens are laboratory air dried prior to testing.\n3. Tests were performed in general accordance with ASTM D2726 and AASHTO T166.",
    technicianName: seed.technicianName || "",
    specimens: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function formatAsphaltGravityStatus(status) {
  return {
    [ASPHALT_BSG_STATUS.DRAFT]: "Draft",
    [ASPHALT_BSG_STATUS.SUBMITTED]: "Submitted",
    [ASPHALT_BSG_STATUS.APPROVED]: "Approved"
  }[status] || "Draft";
}
