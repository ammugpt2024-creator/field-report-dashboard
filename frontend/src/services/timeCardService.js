const STORAGE_KEY = "imqcore:technician-time-cards";

export const TIME_CARD_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  RETURNED: "returned",
  COMPLETED: "completed"
};

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
  const timesheetNumber = card.timesheetNumber || card.timesheet_number || generateTimesheetNumber(card.date);
  return {
    ...card,
    timesheetNumber,
    timesheet_number: timesheetNumber
  };
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
  return calculateTimesheetDuration(card).totalHours;
}

export function createTimeCard({
  projectName = "DC Water Potomac Tunnel",
  projectId = 1,
  projectNumber = "",
  projectLocation = "",
  companyId = "",
  technicianName = "Field Technician"
} = {}) {
  const now = new Date();
  const timesheetNumber = generateTimesheetNumber(now.toISOString().slice(0, 10));
  return {
    id: crypto.randomUUID(),
    timesheetNumber,
    timesheet_number: timesheetNumber,
    date: now.toISOString().slice(0, 10),
    projectId,
    projectName,
    projectNumber,
    projectLocation,
    companyId,
    technicianName,
    shift: "Day Shift",
    timeIn: "",
    timeOut: "",
    breakMinutes: "30",
    totalHours: "",
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
  const duration = calculateTimesheetDuration(card);
  const numberedCard = withTimesheetNumber(card);
  const nextCard = {
    ...numberedCard,
    totalHours: duration.totalHours,
    total_hours: duration.totalHours,
    isOvernightShift: duration.isOvernightShift,
    is_overnight_shift: duration.isOvernightShift,
    validationError: duration.validationError,
    validationWarning: duration.validationWarning,
    time_in: numberedCard.timeIn,
    time_out: numberedCard.timeOut,
    break_minutes: Number(numberedCard.breakMinutes) || 0,
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

export function getTimeCardCollections(cards) {
  return {
    draftTimeCards: cards.filter((card) => card.status === TIME_CARD_STATUS.DRAFT),
    submittedTimeCards: cards.filter((card) => card.status === TIME_CARD_STATUS.SUBMITTED),
    approvedTimeCards: cards.filter((card) => card.status === TIME_CARD_STATUS.APPROVED),
    completedTimeCards: cards.filter((card) => card.status === TIME_CARD_STATUS.COMPLETED),
    returnedTimeCards: cards.filter((card) => card.status === TIME_CARD_STATUS.RETURNED),
    openTimeCards: cards.filter((card) => [TIME_CARD_STATUS.DRAFT, TIME_CARD_STATUS.RETURNED].includes(card.status))
  };
}

export function formatTimeCardStatus(status) {
  const labels = {
    [TIME_CARD_STATUS.DRAFT]: "Draft",
    [TIME_CARD_STATUS.SUBMITTED]: "Submitted",
    [TIME_CARD_STATUS.APPROVED]: "Approved",
    [TIME_CARD_STATUS.RETURNED]: "Returned",
    [TIME_CARD_STATUS.COMPLETED]: "Completed"
  };
  return labels[status] || "Draft";
}
