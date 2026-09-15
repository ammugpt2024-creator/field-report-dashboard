import { localDateString } from "../utils/dates";
const STORAGE_KEY = "qcore:field-reports";

export const FIELD_REPORT_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
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

export function getFieldReports(projectId) {
  const all = readAll();
  return projectId ? all.filter((r) => String(r.projectId) === String(projectId)) : all;
}

export function getFieldReport(id) {
  return readAll().find((r) => String(r.id) === String(id)) || null;
}

export function saveFieldReport(report) {
  const rows = readAll();
  const next = { ...report, updatedAt: new Date().toISOString() };
  const idx = rows.findIndex((r) => String(r.id) === String(next.id));
  if (idx >= 0) rows[idx] = next; else rows.unshift(next);
  writeAll(rows);
  return next;
}

export function createFieldReport(seed = {}) {
  const year = new Date().getFullYear();
  return {
    id: crypto.randomUUID(),
    reportNumber: `FR-${year}-${String(Date.now()).slice(-4)}`,
    status: FIELD_REPORT_STATUS.DRAFT,
    projectId: seed.projectId || "",
    date: localDateString(),
    shift: "day",
    inspectorName: seed.inspectorName || "",
    weatherCondition: "",
    temperature: "",
    workersOnSite: "",
    activitiesPerformed: "",
    equipmentUsed: "",
    materialsDelivered: "",
    safetyObservations: "",
    remarks: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
