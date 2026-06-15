import { supabase } from "./supabase";

const STORAGE_KEY = "qcore:lab-cylinder-breaks";

export const CYLINDER_BREAK_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved"
};

export const FRACTURE_TYPES = ["Type 1 - Cone", "Type 2 - Cone & Split", "Type 3 - Cone & Shear", "Type 4 - Shear", "Type 5 - Columnar", "Type 6 - Other"];

// Standard cylinder sizes. The first number is the diameter (in), which drives
// the cross-sectional area used for the strength calculation.
export const CYLINDER_TYPES = [
  { label: '6 x 12 in', diameter: 6 },
  { label: '4 x 8 in', diameter: 4 },
  { label: '3 x 6 in', diameter: 3 }
];

const CYLINDER_TYPE_DIAMETER = CYLINDER_TYPES.reduce((map, type) => ({ ...map, [type.label]: type.diameter }), {});

// Standard concrete break ages (days). Picking one auto-fills the break date
// from the cast date so a set can be broken across multiple test dates.
export const BREAK_AGES = [1, 2, 3, 7, 14, 28, 56];

// Parse a break schedule like "7x1, 28x2" / "7×1" / "7:1" / "1 day x 1" into
// [{ age, count }]. Each comma-separated segment yields an age and a count from
// the first two numbers found.
export function parseBreakPattern(text) {
  return String(text || "")
    .split(/[,;\n]+/)
    .map((segment) => {
      const nums = segment.match(/\d+/g);
      if (!nums || !nums.length) return null;
      const age = Number(nums[0]);
      const count = nums.length > 1 ? Number(nums[1]) : 1;
      if (!Number.isFinite(age) || age <= 0 || !Number.isFinite(count) || count <= 0) return null;
      return { age, count };
    })
    .filter(Boolean);
}

export function describeBreakPattern(text) {
  const entries = parseBreakPattern(text);
  if (!entries.length) return "";
  return entries.map(({ age, count }) => `${age}-day × ${count}`).join(", ");
}

function addDaysIso(dateStr, days) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
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

// Pull the first number out of a spec string like "4000 psi @ 28 days".
export function parsePsi(value) {
  const match = String(value || "").match(/\d[\d,]*(\.\d+)?/);
  return match ? Number(match[0].replace(/,/g, "")) : null;
}

function diameterToArea(diameterIn) {
  const d = Number(diameterIn);
  if (!Number.isFinite(d) || d <= 0) return null;
  return (Math.PI / 4) * d * d;
}

function daysBetween(castDate, breakDate) {
  if (!castDate || !breakDate) return "";
  const a = new Date(`${castDate}T00:00:00`);
  const b = new Date(`${breakDate}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
  const diff = Math.round((b - a) / 86400000);
  return diff >= 0 ? String(diff) : "";
}

// Compute area, strength, age and pass/fail for one break row.
export function computeBreakRow(row, { specifiedStrengthPsi } = {}) {
  // Cylinder type drives the diameter; fall back to any manual diameter.
  const diameter = CYLINDER_TYPE_DIAMETER[row.cylinderType] ?? Number(row.diameterIn);
  const area = diameterToArea(diameter);
  const load = Number(row.maxLoadLbf);
  const strength = area && Number.isFinite(load) && load > 0 ? load / area : null;
  // A chosen test age sets the break date from the cast date; otherwise age is
  // derived from the actual cast/break dates entered.
  const breakDate = row.testAge && row.castDate ? addDaysIso(row.castDate, row.testAge) : row.breakDate;
  const age = row.testAge ? String(row.testAge) : (row.ageDays || daysBetween(row.castDate, breakDate));
  const required = Number(specifiedStrengthPsi);
  let result = "";
  if (strength !== null && Number.isFinite(required) && required > 0) {
    result = strength >= required ? "PASS" : "FAIL";
  }
  return {
    ...row,
    diameterIn: diameter ? String(diameter) : row.diameterIn,
    breakDate,
    ageDays: age,
    areaIn2: area === null ? "" : area.toFixed(3),
    strengthPsi: strength === null ? "" : Math.round(strength).toString(),
    result: row.resultOverridden ? (row.result || result) : result
  };
}

// Look up by cast date — returns every delivery (truck) cast that day so the
// technician can pick the specific set/truck.
export async function lookupConcreteByCastDate(castDate) {
  const clean = String(castDate || "").trim();
  if (!clean) return [];
  // Match on the captured cast date, or the log creation date when date_sampled
  // was never filled.
  const { data: logs, error: logError } = await supabase
    .from("concrete_test_logs")
    .select("id,project_name,project_number,dfr_number,date_sampled,strength_spec,mix_no_spec,created_at")
    .or(`date_sampled.eq.${clean},created_at.gte.${clean}T00:00:00,created_at.lte.${clean}T23:59:59`);
  const matchingLogs = (logs || []).filter((log) =>
    log.date_sampled === clean || String(log.created_at || "").slice(0, 10) === clean
  );
  if (logError || !matchingLogs.length) return [];
  const logIds = matchingLogs.map((log) => log.id);
  const [{ data: records }, { data: specsRows }] = await Promise.all([
    supabase
      .from("concrete_delivery_testing_records")
      .select("*")
      .in("log_id", logIds)
      .not("set_number", "is", null),
    supabase
      .from("concrete_specifications")
      .select("log_id,speed_of_stress,mix_no")
      .in("log_id", logIds)
  ]);
  const logById = matchingLogs.reduce((map, log) => ({ ...map, [log.id]: log }), {});
  const specsByLog = (specsRows || []).reduce((map, row) => ({ ...map, [row.log_id]: row }), {});
  return (records || []).map((record) => {
    const log = logById[record.log_id] || {};
    const specs = specsByLog[record.log_id] || {};
    const specifiedStrength = specs.speed_of_stress || log.strength_spec || "";
    return {
      setNumber: record.set_number,
      logId: record.log_id,
      projectName: log.project_name || "",
      projectNumber: log.project_number || "",
      dfrNumber: log.dfr_number || "",
      castDate: log.date_sampled || (log.created_at ? String(log.created_at).slice(0, 10) : clean),
      mixDesign: record.mix_design || specs.mix_no || log.mix_no_spec || "",
      specifiedStrength,
      specifiedStrengthPsi: parsePsi(specifiedStrength) || "",
      labCylinders: record.lab_cylinders || "",
      truckNumber: record.truck_number || "",
      ticketNumber: record.ticket_number || "",
      cubicYards: record.cubic_yards || "",
      placementLocation: record.placement_location || "",
      breakPattern: record.break_pattern || "",
      fieldDryDensity: record.unit_weight_lbs_ft3 || ""
    };
  });
}

// Look up a cast set in the concrete test logs and return prefill header data.
export async function lookupConcreteSet(setNumber) {
  const clean = String(setNumber || "").trim();
  if (!clean) return null;

  // Select all columns so an environment missing the optional break_pattern
  // column does not fail the whole query.
  const { data: records, error: recordError } = await supabase
    .from("concrete_delivery_testing_records")
    .select("*")
    .eq("set_number", clean)
    .limit(1);
  if (recordError) {
    console.warn("Set number lookup failed.", recordError);
    throw new Error("Unable to look up that set number. Please try again.");
  }
  const record = (records || [])[0];
  if (!record) return { notFound: true };

  let log = null;
  let specs = null;
  if (record.log_id) {
    const { data: logRow } = await supabase
      .from("concrete_test_logs")
      .select("id,project_name,project_number,dfr_number,date_sampled,strength_spec,mix_no_spec,created_at")
      .eq("id", record.log_id)
      .maybeSingle();
    log = logRow || null;
    // Specified strength & mix live in the separate specifications table.
    const { data: specRow } = await supabase
      .from("concrete_specifications")
      .select("speed_of_stress,mix_no")
      .eq("log_id", record.log_id)
      .maybeSingle();
    specs = specRow || null;
  }

  const specifiedStrength = specs?.speed_of_stress || log?.strength_spec || "";
  const castDate = log?.date_sampled || (log?.created_at ? String(log.created_at).slice(0, 10) : "");

  return {
    setNumber: clean,
    logId: record.log_id || null,
    projectName: log?.project_name || "",
    projectNumber: log?.project_number || "",
    dfrNumber: log?.dfr_number || "",
    castDate,
    mixDesign: record.mix_design || specs?.mix_no || log?.mix_no_spec || "",
    specifiedStrength,
    specifiedStrengthPsi: parsePsi(specifiedStrength) || "",
    labCylinders: record.lab_cylinders || "",
    fieldCylinders: record.field_cylinders || "",
    placementLocation: record.placement_location || "",
    breakPattern: record.break_pattern || "",
    // The specific truck / delivery the cylinders were cast from.
    truckNumber: record.truck_number || "",
    ticketNumber: record.ticket_number || "",
    cubicYards: record.cubic_yards || "",
    fieldDryDensity: record.unit_weight_lbs_ft3 || ""
  };
}

export function getCylinderBreaks() {
  return readAll();
}

export function getCylinderBreak(id) {
  return readAll().find((row) => String(row.id) === String(id)) || null;
}

export function saveCylinderBreak(report) {
  const rows = readAll();
  const specifiedStrengthPsi = report.specifiedStrengthPsi || parsePsi(report.specifiedStrength);
  const next = {
    ...report,
    specifiedStrengthPsi,
    breaks: (report.breaks || []).map((row) => computeBreakRow(row, { specifiedStrengthPsi })),
    updatedAt: new Date().toISOString()
  };
  const index = rows.findIndex((row) => String(row.id) === String(next.id));
  if (index >= 0) rows[index] = next; else rows.unshift(next);
  writeAll(rows);
  return next;
}

export function deleteCylinderBreak(id) {
  writeAll(readAll().filter((row) => String(row.id) !== String(id)));
}

export function createBreakRow(seed = {}) {
  const cylinderType = seed.cylinderType || CYLINDER_TYPES[0].label;
  return computeBreakRow({
    id: crypto.randomUUID(),
    cylinderId: "",
    cylinderType,
    castDate: seed.castDate || "",
    testAge: seed.testAge ? String(seed.testAge) : "",
    breakDate: "",
    ageDays: "",
    diameterIn: String(CYLINDER_TYPE_DIAMETER[cylinderType] || 6),
    maxLoadLbf: "",
    areaIn2: "",
    strengthPsi: "",
    dryDensity: seed.fieldDryDensity || "",
    fractureType: "",
    result: "",
    resultOverridden: false
  }, {});
}

// Build the cylinder break rows from a break pattern: one row per cylinder, each
// pre-aged to its scheduled break day with the break date derived from cast date.
export function generateBreaksFromPattern(pattern, { castDate = "", cylinderType } = {}) {
  const entries = parseBreakPattern(pattern);
  const rows = [];
  entries.forEach(({ age, count }) => {
    for (let i = 0; i < count; i += 1) {
      rows.push(createBreakRow({ castDate, cylinderType, testAge: age }));
    }
  });
  return rows;
}

export function createCylinderBreakReport(seed = {}) {
  const year = new Date().getFullYear();
  return {
    id: crypto.randomUUID(),
    reportNumber: `CB-${year}-${String(Date.now()).slice(-6)}`,
    status: CYLINDER_BREAK_STATUS.DRAFT,
    setNumber: "",
    logId: null,
    projectName: "",
    projectNumber: "",
    dfrNumber: "",
    castDate: "",
    mixDesign: "",
    specifiedStrength: "",
    specifiedStrengthPsi: "",
    labCylinders: "",
    truckNumber: "",
    ticketNumber: "",
    cubicYards: "",
    placementLocation: "",
    breakPattern: "",
    defaultCylinderType: CYLINDER_TYPES[0].label,
    technicianName: seed.technicianName || "",
    breaks: [],
    remarks: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function formatCylinderBreakStatus(status) {
  return {
    [CYLINDER_BREAK_STATUS.DRAFT]: "Draft",
    [CYLINDER_BREAK_STATUS.SUBMITTED]: "Submitted",
    [CYLINDER_BREAK_STATUS.APPROVED]: "Approved"
  }[status] || "Draft";
}
