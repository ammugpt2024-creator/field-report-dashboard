// Sieve + Hydrometer Particle-Size Analysis (ASTM D422) with USDA texture
// classification. Combined gradation curve (sieve coarse + hydrometer fines) and
// the soil-texture triangle. Self-contained, stored in localStorage.

const STORAGE_KEY = "qcore:lab-hydrometer";

export const HYDROMETER_STATUS = { DRAFT: "draft", SUBMITTED: "submitted", APPROVED: "approved" };

const num = (v) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

// Coarse + fine sieve set (matches the reference workbook).
export const HYDRO_SIEVES = [
  { label: "25.0", mm: 25.0, unit: "mm" },
  { label: "19.0", mm: 19.0, unit: "mm" },
  { label: "9.5", mm: 9.5, unit: "mm" },
  { label: "4.8", mm: 4.8, unit: "mm" },
  { label: "2.0", mm: 2.0, unit: "mm" },      // No. 10
  { label: "850", mm: 0.85, unit: "um" },     // No. 20
  { label: "425", mm: 0.425, unit: "um" },    // No. 40
  { label: "250", mm: 0.25, unit: "um" },     // No. 60
  { label: "150", mm: 0.15, unit: "um" },     // No. 100
  { label: "75", mm: 0.075, unit: "um" }      // No. 200
];

// Sieve cumulative retained + % passing (run on the full sample).
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

// Per hydrometer reading:
//   corrected reading Rc = R − composite correction
//   grain diameter D = K·√(L/T)               (Stokes' law)
//   % finer (of total) = %passing No.10 × Rc × a / Ws
export function computeHydrometerRows(readings, ctx) {
  const Cc = num(ctx.compositeCorrection) || 0;
  const K = num(ctx.kFactor);
  const a = num(ctx.gsCorrection) != null ? num(ctx.gsCorrection) : 1;
  const Ws = num(ctx.subSampleWt);
  const pNo10 = num(ctx.passingNo10);
  return (readings || []).map((row) => {
    const T = num(row.time), R = num(row.reading), L = num(row.depth);
    const rc = R != null ? R - Cc : null;
    const diameter = K != null && L != null && T != null && T > 0 && L > 0 ? K * Math.sqrt(L / T) : null;
    const percentFiner = rc != null && Ws != null && Ws > 0 && pNo10 != null ? (pNo10 * rc * a) / Ws : null;
    return { ...row, correctedReading: rc, diameter, percentFiner };
  });
}

// Interpolate % finer at a target grain size (mm) on a log scale.
function finerAtSize(points, targetMm) {
  const p = points.filter((q) => q.mm != null && q.pct != null).sort((x, y) => y.mm - x.mm);
  for (let i = 0; i < p.length - 1; i += 1) {
    const A = p[i], B = p[i + 1];
    if ((A.mm >= targetMm && B.mm <= targetMm) || (A.mm <= targetMm && B.mm >= targetMm)) {
      if (A.mm === B.mm) return A.pct;
      const t = (Math.log10(targetMm) - Math.log10(A.mm)) / (Math.log10(B.mm) - Math.log10(A.mm));
      return A.pct + t * (B.pct - A.pct);
    }
  }
  if (p.length && targetMm < p[p.length - 1].mm) return p[p.length - 1].pct; // below finest -> flat
  return null;
}

// USDA soil-texture classification from sand/silt/clay (%).
export function usdaTexture(sand, silt, clay) {
  if ([sand, silt, clay].some((v) => v == null || Number.isNaN(v))) return "";
  const s = sand, si = silt, c = clay;
  if (si + 1.5 * c < 15) return "sand";
  if (si + 1.5 * c >= 15 && si + 2 * c < 30) return "loamy sand";
  if ((c >= 7 && c < 20 && s > 52 && si + 2 * c >= 30) || (c < 7 && si < 50 && si + 2 * c >= 30)) return "sandy loam";
  if (c >= 7 && c < 27 && si >= 28 && si < 50 && s <= 52) return "loam";
  if ((si >= 50 && c >= 12 && c < 27) || (si >= 50 && si < 80 && c < 12)) return "silt loam";
  if (si >= 80 && c < 12) return "silt";
  if (c >= 20 && c < 35 && si < 28 && s > 45) return "sandy clay loam";
  if (c >= 27 && c < 40 && s > 20 && s <= 45) return "clay loam";
  if (c >= 27 && c < 40 && s <= 20) return "silty clay loam";
  if (c >= 35 && s > 45) return "sandy clay";
  if (c >= 40 && si >= 40) return "silty clay";
  if (c >= 40 && s <= 45 && si < 40) return "clay";
  return "loam";
}

export function computeHydrometerResults(report) {
  const sieveRows = computeSievePassing(report.sieves, report.totalWeight);
  const passingNo10 = (() => { const r = sieveRows.find((x) => Math.abs(x.mm - 2.0) < 1e-6); return r ? r.percentPassing : null; })();
  const passingNo200 = (() => { const r = sieveRows.find((x) => Math.abs(x.mm - 0.075) < 1e-6); return r ? r.percentPassing : null; })();
  const hydroRows = computeHydrometerRows(report.readings, { ...report, passingNo10 });

  // Combined curve points (coarse sieve + hydrometer fines).
  const curve = [
    ...sieveRows.filter((s) => s.percentPassing != null).map((s) => ({ mm: s.mm, pct: s.percentPassing })),
    ...hydroRows.filter((h) => h.diameter != null && h.percentFiner != null).map((h) => ({ mm: h.diameter, pct: h.percentFiner }))
  ].sort((a, b) => b.mm - a.mm);

  // USDA fractions (sand/silt boundary = No. 200 = 0.075 mm; clay < 0.002 mm).
  let sand = null, silt = null, clay = null;
  if (passingNo200 != null) {
    sand = 100 - passingNo200;
    clay = finerAtSize(curve, 0.002);
    if (clay != null) { clay = Math.max(0, clay); silt = Math.max(0, passingNo200 - clay); }
  }
  const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
  sand = round1(sand); silt = round1(silt); clay = round1(clay);
  const texture = (sand != null && silt != null && clay != null) ? usdaTexture(sand, silt, clay) : "";

  return { sieveRows, hydroRows, curve, passingNo10, passingNo200, sand, silt, clay, texture };
}

function readAll() { try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function writeAll(rows) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); }

export function getHydrometerReports() { return readAll(); }
export function getHydrometerReport(id) { return readAll().find((r) => String(r.id) === String(id)) || null; }
export function saveHydrometerReport(report) {
  const rows = readAll();
  const next = { ...report, updatedAt: new Date().toISOString() };
  const i = rows.findIndex((r) => String(r.id) === String(next.id));
  if (i >= 0) rows[i] = next; else rows.unshift(next);
  writeAll(rows);
  return next;
}
export function deleteHydrometerReport(id) { writeAll(readAll().filter((r) => String(r.id) !== String(id))); }

const reading = (time) => ({ id: crypto.randomUUID(), time: time != null ? String(time) : "", temp: "", reading: "", depth: "" });

export function createHydrometerReport(seed = {}) {
  const year = new Date().getFullYear();
  return {
    id: crypto.randomUUID(),
    reportNumber: `HYD-${year}-${String(Date.now()).slice(-6)}`,
    status: HYDROMETER_STATUS.DRAFT,
    clientName: "", projectName: "", projectNumber: "", reportDate: "", sampleNumber: "",
    totalWeight: "",
    sieves: HYDRO_SIEVES.map((s) => ({ ...s, retained: "" })),
    // Hydrometer parameters
    subSampleWt: "50",
    compositeCorrection: "",
    gsCorrection: "1.00",
    kFactor: "0.01348",
    readings: [0.5, 1, 2, 5, 15, 30, 60, 250, 1440].map((t) => reading(t)),
    customClassification: "",
    remarks: "",
    technicianName: seed.technicianName || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function addHydrometerReading(report) { return { ...report, readings: [...(report.readings || []), reading()] }; }

export function formatHydrometerStatus(status) {
  return { [HYDROMETER_STATUS.DRAFT]: "Draft", [HYDROMETER_STATUS.SUBMITTED]: "Submitted", [HYDROMETER_STATUS.APPROVED]: "Approved" }[status] || "Draft";
}
