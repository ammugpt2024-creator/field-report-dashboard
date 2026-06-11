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

const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function readTimeCards() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeTimeCards(cards) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

function minutesFromTime(value) {
  if (!value) return null;
  const [hours, minutes] = String(value).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
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

export function calculateTimesheetEntryDuration(entry = {}) {
  const start = minutesFromTime(entry.timeIn || entry.time_in);
  let end = minutesFromTime(entry.timeOut || entry.time_out);
  const breakValue = Math.max(0, Number(entry.breakMinutes ?? entry.break_minutes) || 0);
  const manualRegular = Number(entry.regularHours ?? entry.regular_hours);
  const manualOvertime = Number(entry.overtimeHours ?? entry.overtime_hours);
  const manualTotal = Number(entry.totalHours ?? entry.total_hours);
  if (Number.isFinite(manualRegular) || Number.isFinite(manualOvertime)) {
    const regular = Math.max(0, Number.isFinite(manualRegular) ? manualRegular : Math.min(manualTotal || 0, 8));
    const overtime = Math.max(0, Number.isFinite(manualOvertime) ? manualOvertime : Math.max((manualTotal || 0) - regular, 0));
    const total = regular + overtime;
    return {
      regularHours: regular.toFixed(2),
      regular_hours: regular.toFixed(2),
      overtimeHours: overtime.toFixed(2),
      overtime_hours: overtime.toFixed(2),
      totalHours: total.toFixed(2),
      total_hours: total.toFixed(2),
      validationError: total > 24 ? "Daily hours cannot exceed 24." : "",
      validationWarning: ""
    };
  }
  if (start === null || end === null) {
    if (Number.isFinite(manualTotal)) {
      const regular = Math.max(0, Number.isFinite(manualRegular) ? manualRegular : Math.min(manualTotal || 0, 8));
      const overtime = Math.max(0, Number.isFinite(manualOvertime) ? manualOvertime : Math.max((manualTotal || 0) - regular, 0));
      const total = Number.isFinite(manualTotal) ? manualTotal : regular + overtime;
      return {
        regularHours: regular.toFixed(2),
        regular_hours: regular.toFixed(2),
        overtimeHours: overtime.toFixed(2),
        overtime_hours: overtime.toFixed(2),
        totalHours: total.toFixed(2),
        total_hours: total.toFixed(2),
        validationError: "",
        validationWarning: ""
      };
    }
    return {
      regularHours: "0.00",
      overtimeHours: "0.00",
      totalHours: "0.00",
      validationError: "",
      validationWarning: ""
    };
  }
  if (end <= start) end += 24 * 60;
  const shiftMinutes = end - start;
  const workMinutes = shiftMinutes - breakValue;
  let validationError = "";
  let validationWarning = "";
  if (breakValue > shiftMinutes) validationError = "Break time cannot exceed shift duration.";
  if (workMinutes <= 0) validationError = "Please check time in, time out, and break.";
  if (workMinutes > 24 * 60) validationError = "Daily hours cannot exceed 24.";
  const total = Math.max(0, workMinutes / 60);
  const regular = Math.min(total, 8);
  const overtime = Math.max(total - 8, 0);
  return {
    regularHours: regular.toFixed(2),
    regular_hours: regular.toFixed(2),
    overtimeHours: overtime.toFixed(2),
    overtime_hours: overtime.toFixed(2),
    totalHours: total.toFixed(2),
    total_hours: total.toFixed(2),
    validationError,
    validationWarning
  };
}

export function createWeeklyEntries({
  weekStartDate,
  projectId = "",
  projectName = "",
  dailyLogs = []
} = {}) {
  const start = toDateInputValue(getMonday(weekStartDate));
  return WEEK_DAYS.map((dayName, index) => {
    const workDate = addDays(start, index);
    const sourceLog = dailyLogs.find((log) => {
      const logDate = log.date || log.reportDate || log.report_date;
      return logDate === workDate;
    });
    const entry = {
      id: crypto.randomUUID(),
      workDate,
      work_date: workDate,
      dayName,
      day_name: dayName,
      projectId: sourceLog?.projectId || sourceLog?.project_id || projectId,
      project_id: sourceLog?.projectId || sourceLog?.project_id || projectId,
      projectName: sourceLog?.projectName || sourceLog?.project_name || projectName,
      project_name: sourceLog?.projectName || sourceLog?.project_name || projectName,
      costCode: sourceLog?.costCode || sourceLog?.cost_code || "",
      cost_code: sourceLog?.costCode || sourceLog?.cost_code || "",
      workDescription: sourceLog?.notes || sourceLog?.comments || sourceLog?.workDescription || sourceLog?.work_description || "",
      work_description: sourceLog?.notes || sourceLog?.comments || sourceLog?.workDescription || sourceLog?.work_description || "",
      timeIn: sourceLog?.timeIn || sourceLog?.time_in || "",
      time_in: sourceLog?.timeIn || sourceLog?.time_in || "",
      timeOut: sourceLog?.timeOut || sourceLog?.time_out || "",
      time_out: sourceLog?.timeOut || sourceLog?.time_out || "",
      breakMinutes: sourceLog?.breakMinutes ?? sourceLog?.break_minutes ?? 30,
      break_minutes: sourceLog?.breakMinutes ?? sourceLog?.break_minutes ?? 30,
      sourceDfrId: sourceLog?.id || "",
      source_dfr_id: sourceLog?.id || "",
      sourceDfrNumber: sourceLog?.dfrNumber || sourceLog?.dfr_number || sourceLog?.dailyLogNumber || sourceLog?.daily_log_number || "",
      source_dfr_number: sourceLog?.dfrNumber || sourceLog?.dfr_number || sourceLog?.dailyLogNumber || sourceLog?.daily_log_number || "",
      notes: ""
    };
    return { ...entry, ...calculateTimesheetEntryDuration(entry) };
  });
}

function normalizeWeeklyEntries(card) {
  const weekStartDate = toDateInputValue(getMonday(card.weekStartDate || card.week_start_date || card.date));
  const existingEntries = Array.isArray(card.entries) ? card.entries : [];
  if (!existingEntries.length && (card.timeIn || card.timeOut || card.workDescription)) {
    const entries = createWeeklyEntries({
      weekStartDate,
      projectId: card.projectId || card.project_id,
      projectName: card.projectName || card.project_name
    });
    const dateIndex = Math.max(0, Math.min(6, Math.round((parseLocalDate(card.date) - parseLocalDate(weekStartDate)) / 86400000)));
    entries[dateIndex] = {
      ...entries[dateIndex],
      workDate: card.date || entries[dateIndex].workDate,
      work_date: card.date || entries[dateIndex].work_date,
      projectId: card.projectId || card.project_id,
      project_id: card.projectId || card.project_id,
      projectName: card.projectName || card.project_name,
      project_name: card.projectName || card.project_name,
      timeIn: card.timeIn || card.time_in || "",
      time_in: card.timeIn || card.time_in || "",
      timeOut: card.timeOut || card.time_out || "",
      time_out: card.timeOut || card.time_out || "",
      breakMinutes: card.breakMinutes ?? card.break_minutes ?? 30,
      break_minutes: card.breakMinutes ?? card.break_minutes ?? 30,
      workDescription: card.workDescription || card.work_description || "",
      work_description: card.workDescription || card.work_description || ""
    };
    return entries.map((entry) => ({ ...entry, ...calculateTimesheetEntryDuration(entry) }));
  }
  if (!existingEntries.length) return [];
  const generated = createWeeklyEntries({
    weekStartDate,
    projectId: card.projectId || card.project_id,
    projectName: card.projectName || card.project_name
  });
  return generated.map((defaultEntry, index) => {
    const entry = existingEntries[index] || {};
    const merged = {
      ...defaultEntry,
      ...entry,
      id: entry.id || defaultEntry.id,
      dayName: entry.dayName || entry.day_name || defaultEntry.dayName,
      day_name: entry.dayName || entry.day_name || defaultEntry.day_name,
      workDate: entry.workDate || entry.work_date || defaultEntry.workDate,
      work_date: entry.workDate || entry.work_date || defaultEntry.work_date,
      projectId: entry.projectId || entry.project_id || card.projectId || card.project_id || defaultEntry.projectId,
      project_id: entry.projectId || entry.project_id || card.projectId || card.project_id || defaultEntry.project_id,
      projectName: entry.projectName || entry.project_name || card.projectName || card.project_name || defaultEntry.projectName,
      project_name: entry.projectName || entry.project_name || card.projectName || card.project_name || defaultEntry.project_name,
      costCode: entry.costCode || entry.cost_code || "",
      cost_code: entry.costCode || entry.cost_code || "",
      workDescription: entry.workDescription || entry.work_description || "",
      work_description: entry.workDescription || entry.work_description || "",
      timeIn: entry.timeIn || entry.time_in || "",
      time_in: entry.timeIn || entry.time_in || "",
      timeOut: entry.timeOut || entry.time_out || "",
      time_out: entry.timeOut || entry.time_out || "",
      breakMinutes: entry.breakMinutes ?? entry.break_minutes ?? 30,
      break_minutes: entry.breakMinutes ?? entry.break_minutes ?? 30,
      sourceDfrId: entry.sourceDfrId || entry.source_dfr_id || "",
      source_dfr_id: entry.sourceDfrId || entry.source_dfr_id || "",
      sourceDfrNumber: entry.sourceDfrNumber || entry.source_dfr_number || "",
      source_dfr_number: entry.sourceDfrNumber || entry.source_dfr_number || ""
    };
    return { ...merged, ...calculateTimesheetEntryDuration(merged) };
  });
}

function calculateWeeklyTotals(entries = []) {
  return entries.reduce((totals, entry) => ({
    regular: totals.regular + (Number(entry.regularHours || entry.regular_hours) || 0),
    overtime: totals.overtime + (Number(entry.overtimeHours || entry.overtime_hours) || 0),
    total: totals.total + (Number(entry.totalHours || entry.total_hours) || 0)
  }), { regular: 0, overtime: 0, total: 0 });
}

export function calculateTimesheetDuration({ timeIn, timeOut, breakMinutes }) {
  const start = minutesFromTime(timeIn);
  let end = minutesFromTime(timeOut);
  const breakValue = Math.max(0, Number(breakMinutes) || 0);
  if (start === null || end === null) {
    return {
      totalHours: "",
      shiftMinutes: 0,
      workMinutes: 0,
      isOvernightShift: false,
      validationError: "",
      validationWarning: ""
    };
  }

  const isOvernightShift = end <= start;
  if (isOvernightShift) end += 24 * 60;

  const shiftMinutes = end - start;
  const workMinutes = shiftMinutes - breakValue;
  let validationError = "";
  let validationWarning = "";

  if (breakValue > shiftMinutes) {
    validationError = "Break time cannot exceed total shift duration.";
  } else if (workMinutes <= 0) {
    validationError = "Please check Time In, Time Out, and Break.";
  } else if (workMinutes > 24 * 60) {
    validationWarning = "Timesheet exceeds 24 hours. Please verify.";
  }

  return {
    totalHours: workMinutes > 0 ? (workMinutes / 60).toFixed(2) : "0.00",
    shiftMinutes,
    workMinutes,
    isOvernightShift,
    validationError,
    validationWarning
  };
}

export function calculateTotalHours(card) {
  if (Array.isArray(card?.entries)) return calculateWeeklyTotals(normalizeWeeklyEntries(card)).total.toFixed(2);
  return calculateTimesheetDuration(card).totalHours;
}

export function createTimeCard({
  projectName = "DC Water Potomac Tunnel",
  projectId = 1,
  projectNumber = "",
  projectLocation = "",
  companyId = "",
  technicianName = "Field Technician",
  dailyLogs = []
} = {}) {
  const now = new Date();
  const weekStartDate = toDateInputValue(getMonday(now));
  const weekEndDate = addDays(weekStartDate, 6);
  const timesheetNumber = generateTimesheetNumber(weekStartDate);
  const entries = dailyLogs.length ? createWeeklyEntries({ weekStartDate, projectId, projectName, dailyLogs }) : [];
  return {
    id: crypto.randomUUID(),
    timesheetNumber,
    timesheet_number: timesheetNumber,
    date: weekStartDate,
    weekStartDate,
    week_start_date: weekStartDate,
    weekEndDate,
    week_end_date: weekEndDate,
    projectId,
    projectName,
    projectNumber,
    projectLocation,
    companyId,
    technicianName,
    entries,
    totalRegularHours: "0.00",
    total_regular_hours: "0.00",
    totalOvertimeHours: "0.00",
    total_overtime_hours: "0.00",
    totalHours: "0.00",
    isOvernightShift: false,
    validationError: "",
    validationWarning: "",
    workDescription: "",
    status: TIME_CARD_STATUS.DRAFT,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    submittedAt: "",
    signedAt: "",
    signed_at: "",
    technicianSignature: "",
    technician_signature: "",
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
  };
}

export function getTimeCards() {
  return readTimeCards();
}

export function saveTimeCard(card) {
  const numberedCard = withTimesheetNumber(card);
  const entries = normalizeWeeklyEntries(numberedCard);
  const totals = calculateWeeklyTotals(entries);
  const weekStartDate = toDateInputValue(getMonday(numberedCard.weekStartDate || numberedCard.week_start_date || numberedCard.date));
  const weekEndDate = addDays(weekStartDate, 6);
  const validationError = entries.find((entry) => entry.validationError)?.validationError || "";
  const validationWarning = entries.find((entry) => entry.validationWarning)?.validationWarning || "";
  const weeklyTotal = totals.total.toFixed(2);
  const nextCard = {
    ...numberedCard,
    date: weekStartDate,
    weekStartDate,
    week_start_date: weekStartDate,
    weekEndDate,
    week_end_date: weekEndDate,
    entries,
    totalRegularHours: totals.regular.toFixed(2),
    total_regular_hours: totals.regular.toFixed(2),
    totalOvertimeHours: totals.overtime.toFixed(2),
    total_overtime_hours: totals.overtime.toFixed(2),
    totalHours: weeklyTotal,
    total_hours: weeklyTotal,
    validationError: validationError || (Number(weeklyTotal) > 168 ? "Weekly hours cannot exceed 168." : ""),
    validationWarning,
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
    status: TIME_CARD_STATUS.REJECTED,
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
    [TIME_CARD_STATUS.REJECTED]: "Rejected",
    [TIME_CARD_STATUS.RETURNED]: "Rejected",
    [TIME_CARD_STATUS.COMPLETED]: "Completed"
  };
  return labels[status] || "Draft";
}
