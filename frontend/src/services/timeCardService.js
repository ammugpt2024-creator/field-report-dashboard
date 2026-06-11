const STORAGE_KEY = "imqcore:technician-time-cards";

export const TIME_CARD_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  RETURNED: "returned",
  COMPLETED: "completed"
};

// Canonical week order for a weekly timesheet (one employee + one week).
export const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// First 40 weekly hours are Regular; everything above 40 is Overtime.
export const REGULAR_HOURS_CAP = 40;
const MAX_WEEKLY_HOURS = 168;
const MAX_DAILY_HOURS = 24;

function readTimeCards() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeTimeCards(cards) {
  // PDF data URLs are several MB each and overflow the localStorage quota fast.
  // They live in the in-memory cache (timeCardPdfService) and Supabase storage,
  // so strip them before persisting.
  const slimCards = cards.map(({ pdfDataUrl, pdf_data_url, ...card }) => card);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slimCards));
}

function getYearFromDate(value) {
  const parsed = value ? new Date(`${value}T00:00:00`) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date().getFullYear() : parsed.getFullYear();
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function parseLocalDate(value) {
  const parsed = value ? new Date(`${value}T00:00:00`) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getMonday(value = new Date()) {
  const date = parseLocalDate(typeof value === "string" ? value : toDateInputValue(value));
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return date;
}

function addDays(value, days) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function generateTimesheetNumber(date) {
  const year = getYearFromDate(date);
  const prefix = `TS-${year}-`;
  const existingCards = readTimeCards();
  const maxSequence = existingCards.reduce((max, card) => {
    const number = card.timesheetNumber || card.timesheet_number || "";
    if (!number.startsWith(prefix)) return max;
    const sequence = Number(number.slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);
  return `${prefix}${String(maxSequence + 1).padStart(6, "0")}`;
}

function withTimesheetNumber(card) {
  const timesheetNumber = card.timesheetNumber || card.timesheet_number || generateTimesheetNumber(card.weekStartDate || card.week_start_date || card.date);
  return {
    ...card,
    timesheetNumber,
    timesheet_number: timesheetNumber
  };
}

function roundHours(value) {
  const number = Number(value) || 0;
  return Math.round(number * 100) / 100;
}

function emptyHours() {
  return WEEK_DAYS.reduce((map, day) => ({ ...map, [day]: 0 }), {});
}

function emptyDayDescriptions() {
  return WEEK_DAYS.reduce((map, day) => ({ ...map, [day]: "" }), {});
}

function normalizeHours(hours = {}) {
  return WEEK_DAYS.reduce((map, day) => {
    const raw = roundHours(hours[day]);
    const clamped = Math.min(Math.max(raw, 0), MAX_DAILY_HOURS);
    return { ...map, [day]: clamped };
  }, {});
}

function normalizeDayDescriptions(descriptions = {}) {
  return WEEK_DAYS.reduce((map, day) => ({ ...map, [day]: String(descriptions[day] ?? "") }), {});
}

export function createProjectRow({ projectId = "", projectName = "", projectNumber = "" } = {}) {
  return {
    id: crypto.randomUUID(),
    projectId,
    project_id: projectId,
    projectName,
    project_name: projectName,
    projectNumber,
    project_number: projectNumber,
    hours: emptyHours()
  };
}

export function getRowTotal(row = {}) {
  return WEEK_DAYS.reduce((total, day) => total + (Number(row.hours?.[day]) || 0), 0);
}

export function calculateDailyTotals(projectRows = []) {
  return WEEK_DAYS.reduce((map, day) => ({
    ...map,
    [day]: roundHours(projectRows.reduce((sum, row) => sum + (Number(row.hours?.[day]) || 0), 0))
  }), {});
}

export function calculateWeeklyTotals(projectRows = []) {
  const total = roundHours(projectRows.reduce((sum, row) => sum + getRowTotal(row), 0));
  const regular = roundHours(Math.min(total, REGULAR_HOURS_CAP));
  const overtime = roundHours(Math.max(total - REGULAR_HOURS_CAP, 0));
  return { total, regular, overtime };
}

// Convert a legacy daily-shaped entries[] array into a single weekly project row.
function migrateLegacyEntries(card) {
  const entries = Array.isArray(card.entries) ? card.entries : [];
  const hours = emptyHours();
  const dayDescriptions = emptyDayDescriptions();
  entries.forEach((entry) => {
    const dayName = entry.dayName || entry.day_name;
    if (!WEEK_DAYS.includes(dayName)) return;
    const total = Number(entry.totalHours ?? entry.total_hours);
    const fallback = (Number(entry.regularHours ?? entry.regular_hours) || 0) + (Number(entry.overtimeHours ?? entry.overtime_hours) || 0);
    hours[dayName] = roundHours(Number.isFinite(total) ? total : fallback);
    const description = entry.workDescription || entry.work_description || "";
    if (description) dayDescriptions[dayName] = description;
  });
  const row = createProjectRow({
    projectId: card.projectId || card.project_id || "",
    projectName: card.projectName || card.project_name || "",
    projectNumber: card.projectNumber || card.project_number || ""
  });
  row.hours = hours;
  const legacyComment = card.workDescription || card.work_description || "";
  if (legacyComment && !Object.values(dayDescriptions).some(Boolean)) {
    dayDescriptions[WEEK_DAYS[0]] = legacyComment;
  }
  return { projectRows: [row], dayDescriptions };
}

// Ensure a card matches the weekly multi-project shape and recompute its totals.
// Handles lazy migration of legacy daily/single-project cards.
export function normalizeWeeklyCard(card = {}) {
  const weekStartDate = toDateInputValue(getMonday(card.weekStartDate || card.week_start_date || card.date));
  const weekEndDate = addDays(weekStartDate, 6);

  let projectRows;
  let dayDescriptions;
  // An array (even empty) means the card is already in the new weekly shape — respect an
  // intentionally empty grid. Migration only runs for legacy cards that lack projectRows.
  if (Array.isArray(card.projectRows)) {
    projectRows = card.projectRows.map((row) => ({
      ...createProjectRow({
        projectId: row.projectId || row.project_id || "",
        projectName: row.projectName || row.project_name || "",
        projectNumber: row.projectNumber || row.project_number || ""
      }),
      id: row.id || crypto.randomUUID(),
      hours: normalizeHours(row.hours)
    }));
    dayDescriptions = normalizeDayDescriptions(card.dayDescriptions);
  } else {
    const migrated = migrateLegacyEntries(card);
    projectRows = migrated.projectRows;
    dayDescriptions = normalizeDayDescriptions(migrated.dayDescriptions);
  }

  const dailyTotals = calculateDailyTotals(projectRows);
  const totals = calculateWeeklyTotals(projectRows);
  const overDailyLimit = WEEK_DAYS.find((day) => dailyTotals[day] > MAX_DAILY_HOURS);
  const validationError = totals.total > MAX_WEEKLY_HOURS
    ? `Weekly hours cannot exceed ${MAX_WEEKLY_HOURS}.`
    : (overDailyLimit ? `${overDailyLimit} hours cannot exceed ${MAX_DAILY_HOURS}.` : "");

  // Strip legacy daily-only fields.
  const {
    entries, timeIn, time_in, timeOut, time_out, breakMinutes, break_minutes,
    isOvernightShift, is_overnight_shift, workDescription, work_description,
    ...rest
  } = card;

  const total = totals.total.toFixed(2);
  return {
    ...rest,
    date: weekStartDate,
    weekStartDate,
    week_start_date: weekStartDate,
    weekEndDate,
    week_end_date: weekEndDate,
    projectRows,
    dayDescriptions,
    dailyTotals,
    totalRegularHours: totals.regular.toFixed(2),
    total_regular_hours: totals.regular.toFixed(2),
    totalOvertimeHours: totals.overtime.toFixed(2),
    total_overtime_hours: totals.overtime.toFixed(2),
    totalHours: total,
    total_hours: total,
    validationError,
    validationWarning: ""
  };
}

export function calculateTotalHours(card) {
  return calculateWeeklyTotals(Array.isArray(card?.projectRows) ? card.projectRows : []).total.toFixed(2);
}

// --- Pure mutation helpers used by the editor (caller persists via saveTimeCard) ---

export function addProjectRow(card, project = {}) {
  const projectRows = [...(card.projectRows || []), createProjectRow(project)];
  return { ...card, projectRows };
}

export function removeProjectRow(card, rowId) {
  const projectRows = (card.projectRows || []).filter((row) => row.id !== rowId);
  return { ...card, projectRows };
}

export function setRowProject(card, rowId, project = {}) {
  const projectRows = (card.projectRows || []).map((row) => (
    row.id === rowId
      ? {
          ...row,
          projectId: project.projectId ?? project.id ?? "",
          project_id: project.projectId ?? project.id ?? "",
          projectName: project.projectName ?? project.name ?? "",
          project_name: project.projectName ?? project.name ?? "",
          projectNumber: project.projectNumber ?? project.number ?? "",
          project_number: project.projectNumber ?? project.number ?? ""
        }
      : row
  ));
  return { ...card, projectRows };
}

export function setRowHours(card, rowId, day, value) {
  const projectRows = (card.projectRows || []).map((row) => (
    row.id === rowId ? { ...row, hours: { ...row.hours, [day]: roundHours(value) } } : row
  ));
  return { ...card, projectRows };
}

export function setDayDescription(card, day, value) {
  return { ...card, dayDescriptions: { ...(card.dayDescriptions || emptyDayDescriptions()), [day]: value } };
}

export function createTimeCard({
  projectName = "",
  projectId = "",
  projectNumber = "",
  projectLocation = "",
  companyId = "",
  technicianName = "Field Technician"
} = {}) {
  const now = new Date();
  const weekStartDate = toDateInputValue(getMonday(now));
  const weekEndDate = addDays(weekStartDate, 6);
  const timesheetNumber = generateTimesheetNumber(weekStartDate);
  return normalizeWeeklyCard({
    id: crypto.randomUUID(),
    timesheetNumber,
    timesheet_number: timesheetNumber,
    date: weekStartDate,
    weekStartDate,
    week_start_date: weekStartDate,
    weekEndDate,
    week_end_date: weekEndDate,
    projectLocation,
    companyId,
    technicianName,
    projectRows: [createProjectRow({ projectId, projectName, projectNumber })],
    dayDescriptions: emptyDayDescriptions(),
    status: TIME_CARD_STATUS.DRAFT,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    submittedAt: "",
    signedAt: "",
    signed_at: "",
    technicianSignature: "",
    technician_signature: "",
    managerSignature: "",
    manager_signature: "",
    approvedAt: "",
    returnedAt: "",
    managerComment: "",
    reviewComments: "",
    review_comments: "",
    comments: "",
    timesheetComments: "",
    timesheet_comments: "",
    pdfStoragePath: "",
    pdfGeneratedAt: "",
    pdfGenerationStatus: "pending",
    pdfGenerationFailureReason: "",
    pdfDataUrl: "",
    pdfStorageMode: ""
  });
}

export function getTimeCards() {
  const raw = readTimeCards();
  let changed = false;
  const normalized = raw.map((card) => {
    const next = normalizeWeeklyCard(card);
    // Detect legacy cards that needed migrating so we can persist the new shape once.
    if (!Array.isArray(card.projectRows) || "entries" in card || "time_in" in card) changed = true;
    return next;
  });
  if (changed) writeTimeCards(normalized);
  return normalized;
}

export function saveTimeCard(card) {
  const nextCard = {
    ...normalizeWeeklyCard(withTimesheetNumber(card)),
    updatedAt: new Date().toISOString()
  };
  const cards = readTimeCards();
  const existingIndex = cards.findIndex((item) => item.id === nextCard.id);
  if (existingIndex >= 0) {
    cards[existingIndex] = nextCard;
  } else {
    cards.unshift(nextCard);
  }
  writeTimeCards(cards);
  return nextCard;
}

export function deleteTimeCard(cardId) {
  writeTimeCards(readTimeCards().filter((card) => card.id !== cardId));
}

export function submitTimeCard(card) {
  const submittedAt = new Date().toISOString();
  const signature = card.technicianSignature || card.technician_signature || "";
  const signedAt = card.signedAt || card.signed_at || (signature ? submittedAt : "");
  return saveTimeCard({
    ...card,
    status: TIME_CARD_STATUS.SUBMITTED,
    submittedAt,
    submitted_at: submittedAt,
    signedAt,
    signed_at: signedAt,
    technicianSignature: signature,
    technician_signature: signature
  });
}

export function recallTimeCard(card) {
  return saveTimeCard({
    ...card,
    status: TIME_CARD_STATUS.DRAFT,
    submittedAt: "",
    submitted_at: ""
  });
}

export function approveTimeCard(card, reviewer = "Manager") {
  const reviewedAt = new Date().toISOString();
  return saveTimeCard({
    ...card,
    status: TIME_CARD_STATUS.APPROVED,
    reviewedBy: reviewer,
    reviewed_by: reviewer,
    reviewedAt,
    reviewed_at: reviewedAt,
    approvedAt: reviewedAt,
    approved_at: reviewedAt,
    reviewComments: "",
    review_comments: ""
  });
}

export function rejectTimeCard(card, comments) {
  const reviewedAt = new Date().toISOString();
  return saveTimeCard({
    ...card,
    status: TIME_CARD_STATUS.RETURNED,
    reviewedAt,
    reviewed_at: reviewedAt,
    returnedAt: reviewedAt,
    returned_at: reviewedAt,
    reviewComments: comments,
    review_comments: comments,
    managerComment: comments
  });
}

export function getTimeCardCollections(cards) {
  return {
    draftTimeCards: cards.filter((card) => card.status === TIME_CARD_STATUS.DRAFT),
    submittedTimeCards: cards.filter((card) => [TIME_CARD_STATUS.SUBMITTED, TIME_CARD_STATUS.PENDING_REVIEW].includes(card.status)),
    approvedTimeCards: cards.filter((card) => card.status === TIME_CARD_STATUS.APPROVED),
    completedTimeCards: cards.filter((card) => card.status === TIME_CARD_STATUS.COMPLETED),
    returnedTimeCards: cards.filter((card) => [TIME_CARD_STATUS.RETURNED, TIME_CARD_STATUS.REJECTED].includes(card.status)),
    openTimeCards: cards.filter((card) => [TIME_CARD_STATUS.DRAFT, TIME_CARD_STATUS.RETURNED, TIME_CARD_STATUS.REJECTED].includes(card.status))
  };
}

export function formatTimeCardStatus(status) {
  const labels = {
    [TIME_CARD_STATUS.DRAFT]: "Draft",
    [TIME_CARD_STATUS.SUBMITTED]: "Submitted",
    [TIME_CARD_STATUS.PENDING_REVIEW]: "Pending Review",
    [TIME_CARD_STATUS.APPROVED]: "Approved",
    [TIME_CARD_STATUS.REJECTED]: "Returned",
    [TIME_CARD_STATUS.RETURNED]: "Returned",
    [TIME_CARD_STATUS.COMPLETED]: "Completed"
  };
  return labels[status] || "Draft";
}
