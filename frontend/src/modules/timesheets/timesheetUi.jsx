// Timesheet workspace components — extracted from FieldEngineerWorkspace so
// timesheets are a standalone, role-neutral module (every employee files one;
// approval routes to their project manager). Shared by the technician
// workspace and the /timesheets route.
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Plus,
  RotateCcw,
  Save,
  Send,
  X
} from "lucide-react";
import { generateTimeCardPdfBlob, regenerateTimeCardPdf } from "../../services/timeCardPdfService";
import {
  WEEK_DAYS,
  findFiledCardForWeek,
  formatTimeCardStatus,
  getTimeCards,
  saveTimeCard,
  submitTimeCard,
  addProjectRow,
  removeProjectRow,
  setRowProject,
  setRowHours,
  getRowTotal,
  TIME_CARD_STATUS
} from "../../services/timeCardService";
import { resolveFallbackManager, resolveManagerForProject, sendTimesheetApprovalEmail } from "../../services/notificationService";
import { formatDateTime } from "../field-engineer/fieldEngineerData";

function formatShortDate(value) {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
}

function getTimesheetNumber(card) {
  return card?.timesheetNumber || card?.timesheet_number || `TS-${String(card?.id || "").slice(0, 8).toUpperCase()}`;
}

function getRegularAndOvertimeHours(totalHours) {
  const total = Math.max(0, Number(totalHours) || 0);
  const regular = Math.min(total, 8);
  const overtime = Math.max(total - 8, 0);
  return {
    regular: regular.toFixed(2),
    overtime: overtime.toFixed(2)
  };
}

function TimeCardListRow({ card, activeTab, onOpen, onDelete, onRecall, onDownloadPdf }) {
  const pdfStatus = card.pdfGenerationStatus || card.pdf_generation_status || (card.pdfStoragePath || card.pdf_storage_path ? "generated" : "pending");
  const canDownloadPdf = pdfStatus === "generated";
  const projectNames = (card.projectRows || []).map((row) => row.projectName || row.project_name).filter(Boolean);
  const projectSummary = projectNames.length
    ? (projectNames.length > 1 ? `${projectNames[0]} +${projectNames.length - 1} more` : projectNames[0])
    : (card.projectName || "");
  const weekStart = card.weekStartDate || card.week_start_date || card.date;
  const weekEnd = card.weekEndDate || card.week_end_date;
  const weekPeriod = `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`;
  const statusDate = {
    draft: card.updatedAt,
    submitted: card.submittedAt,
    returned: card.returnedAt || card.updatedAt,
    approved: card.approvedAt || card.submittedAt || card.updatedAt
  }[activeTab];
  const primaryLabel = {
    draft: "Continue",
    submitted: "View",
    returned: "Edit & Resubmit",
    approved: "View"
  }[activeTab] || "View";

  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50/70"
    >
      {/* Phone: labeled card. Desktop: original columns. */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[15px] font-semibold text-slate-900">{getTimesheetNumber(card)}</p>
          <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${getTimesheetStatusPillClass(card.status)}`}>
            {formatTimeCardStatus(card.status)}
          </span>
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-slate-700" title={projectSummary}>{projectSummary || "Assignment"}</p>
        <p className="mt-0.5 text-[13px] font-medium text-slate-500">{weekPeriod}</p>
        <p className="mt-1 text-[13px] font-semibold text-slate-700">
          {card.totalRegularHours || card.total_regular_hours || "0.00"} reg · {card.totalOvertimeHours || card.total_overtime_hours || "0.00"} OT ·{" "}
          <span className="font-bold text-slate-900">{card.totalHours || card.total_hours || "0.00"} total</span>
        </p>
        {statusDate && <p className="mt-0.5 text-[12px] font-medium text-slate-400">{formatDateTime(statusDate)}</p>}
      </div>
      <div className="hidden gap-3 lg:grid lg:grid-cols-[140px_minmax(0,1fr)_190px_60px_60px_70px_130px_140px_200px] lg:items-center">
        <p className="text-[15px] font-semibold text-slate-900">{getTimesheetNumber(card)}</p>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900" title={projectSummary}>{projectSummary || "Assignment"}</p>
        </div>
        <p className="whitespace-nowrap text-sm font-medium text-slate-700">{weekPeriod}</p>
        <p className="text-sm font-semibold text-slate-900 lg:text-right">{card.totalRegularHours || card.total_regular_hours || "0.00"}</p>
        <p className="text-sm font-semibold text-slate-900 lg:text-right">{card.totalOvertimeHours || card.total_overtime_hours || "0.00"}</p>
        <p className="text-sm font-bold text-slate-900 lg:text-right">{card.totalHours || card.total_hours || "0.00"}</p>
        <p className="lg:pl-4">
          <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${getTimesheetStatusPillClass(card.status)}`}>
            {formatTimeCardStatus(card.status)}
          </span>
        </p>
        <p className="whitespace-nowrap text-[13px] font-medium text-slate-500">{statusDate ? formatDateTime(statusDate) : "-"}</p>

        <div className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap lg:justify-end" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={onOpen} className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white transition hover:bg-slate-800">
            {primaryLabel}
          </button>
          {activeTab === "draft" && (
            <button type="button" onClick={onDelete} className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-[13px] font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50">
              Delete
            </button>
          )}
          {activeTab === "submitted" && (
            <button type="button" onClick={onRecall} className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-[13px] font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">
              Recall
            </button>
          )}
          {activeTab === "approved" && (
            <button type="button" onClick={onDownloadPdf} disabled={!canDownloadPdf} className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-[13px] font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
              Download PDF
            </button>
          )}
        </div>
      </div>
      {activeTab === "returned" && (card.managerComment || card.correctionNotes) && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-900">
          <span className="font-bold">Correction notes:</span> {card.managerComment || card.correctionNotes}
        </div>
      )}
    </article>
  );
}

function formatWeekRange(weekStartDate, weekEndDate) {
  return `${formatShortDate(weekStartDate).replace(/, \d{4}$/, "")} - ${formatShortDate(weekEndDate)}`;
}

function WeekNavigator({ weekStartDate, weekEndDate, onNavigate, onJumpToDate, variant = "light" }) {
  const weekPickerRef = useRef(null);
  const weekStart = weekStartDate ? new Date(`${weekStartDate}T00:00:00`) : null;
  const currentMonday = new Date();
  currentMonday.setHours(0, 0, 0, 0);
  currentMonday.setDate(currentMonday.getDate() + (currentMonday.getDay() === 0 ? -6 : 1 - currentMonday.getDay()));
  // Timesheets cannot be logged ahead of time, so navigation stops at the current week.
  const nextDisabled = !weekStart || Number.isNaN(weekStart.getTime()) || weekStart >= currentMonday;
  const todayValue = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  function openWeekPicker() {
    const input = weekPickerRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  }
  const isDark = variant === "dark";
  const arrowClass = isDark
    ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-600 bg-slate-800/80 text-slate-200 shadow-sm transition hover:border-slate-500 hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:border-slate-600 disabled:hover:bg-slate-800/80 disabled:hover:text-slate-200"
    : "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:bg-white disabled:hover:text-slate-600";
  return (
    <div className={`flex items-center gap-2 ${isDark ? "rounded-xl border border-slate-700 bg-slate-800/60 px-2 py-1.5" : ""}`}>
      <button type="button" onClick={() => onNavigate(-1)} aria-label="Previous week" title="Previous week" className={arrowClass}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      {onJumpToDate ? (
        <span className="relative inline-flex">
          <button
            type="button"
            onClick={openWeekPicker}
            title="Pick a date to jump to its week"
            className={`inline-flex min-w-[176px] items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold transition ${isDark ? "text-white hover:bg-slate-700/60" : "text-slate-900 hover:bg-slate-100"}`}
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
            {formatWeekRange(weekStartDate, weekEndDate)}
          </button>
          <input
            ref={weekPickerRef}
            type="date"
            value={weekStartDate || ""}
            max={todayValue}
            onChange={(event) => event.target.value && onJumpToDate(event.target.value)}
            aria-label="Jump to week containing date"
            tabIndex={-1}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        </span>
      ) : (
        <span className={`inline-flex min-w-[176px] items-center justify-center gap-2 text-sm font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
          <CalendarDays className={`h-4 w-4 shrink-0 ${isDark ? "text-slate-400" : "text-slate-400"}`} />
          {formatWeekRange(weekStartDate, weekEndDate)}
        </span>
      )}
      <button type="button" onClick={() => onNavigate(1)} disabled={nextDisabled} aria-label="Next week" title={nextDisabled ? "Future weeks are not available" : "Next week"} className={arrowClass}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function formatHours(value) {
  return (Number(value) || 0).toFixed(2);
}

function isEmptyProjectRow(row) {
  return !String(row.projectId || row.project_id || row.projectName || row.project_name || "").trim() && getRowTotal(row) === 0;
}

const TIMESHEET_DAY_COLUMNS = WEEK_DAYS;
const TIMESHEET_DAY_LABELS = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun"
};

const TIMESHEET_WEEKEND_DAYS = new Set(["Saturday", "Sunday"]);

const TIMESHEET_STATUS_BADGE_CLASS = {
  [TIME_CARD_STATUS.DRAFT]: "border-slate-200 bg-slate-100 text-slate-700",
  [TIME_CARD_STATUS.SUBMITTED]: "border-amber-200 bg-amber-50 text-amber-800",
  [TIME_CARD_STATUS.PENDING_REVIEW]: "border-amber-200 bg-amber-50 text-amber-800",
  [TIME_CARD_STATUS.APPROVED]: "border-emerald-200 bg-emerald-50 text-emerald-800",
  [TIME_CARD_STATUS.COMPLETED]: "border-emerald-200 bg-emerald-50 text-emerald-800",
  [TIME_CARD_STATUS.REJECTED]: "border-rose-200 bg-rose-50 text-rose-800",
  [TIME_CARD_STATUS.RETURNED]: "border-rose-200 bg-rose-50 text-rose-800"
};

function getTimesheetStatusBadgeClass(status) {
  return TIMESHEET_STATUS_BADGE_CLASS[status] || "border-slate-200 bg-slate-100 text-slate-700";
}

// Soft rounded pill colors for the warm timesheet editor theme.
const TIMESHEET_STATUS_PILL_CLASS = {
  [TIME_CARD_STATUS.DRAFT]: "bg-amber-100 text-amber-900",
  [TIME_CARD_STATUS.SUBMITTED]: "bg-blue-100 text-blue-900",
  [TIME_CARD_STATUS.PENDING_REVIEW]: "bg-blue-100 text-blue-900",
  [TIME_CARD_STATUS.APPROVED]: "bg-emerald-100 text-emerald-900",
  [TIME_CARD_STATUS.COMPLETED]: "bg-emerald-100 text-emerald-900",
  [TIME_CARD_STATUS.REJECTED]: "bg-rose-100 text-rose-900",
  [TIME_CARD_STATUS.RETURNED]: "bg-rose-100 text-rose-900"
};

function getTimesheetStatusPillClass(status) {
  return TIMESHEET_STATUS_PILL_CLASS[status] || "bg-slate-100 text-slate-700";
}

function timesheetDayDate(weekStartDate, dayIndex) {
  if (!weekStartDate) return null;
  const parsed = new Date(`${weekStartDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setDate(parsed.getDate() + dayIndex);
  return parsed;
}

// Hours cannot be logged ahead of time, so days after today stay locked.
function isFutureTimesheetDay(dayDate) {
  if (!dayDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dayDate > today;
}

function lastSavedLabel(savedAt) {
  const diffMinutes = Math.floor((Date.now() - savedAt.getTime()) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  return `at ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

// Resolve the approving manager for each project row (project record first,
// org-level fallback second) and group rows by manager — shared by the editor
// and the read-only view so both show the same routing the emails use.
function useTimesheetApprovers(projectRows) {
  const [projectManagers, setProjectManagers] = useState({});
  const projectIdsKey = projectRows.map((row) => String(row.projectId || row.project_id || "")).filter(Boolean).sort().join(",");

  useEffect(() => {
    let cancelled = false;
    async function loadManagers() {
      const ids = projectIdsKey ? projectIdsKey.split(",") : [];
      const managerMap = {};
      let fallback = null;
      for (const projectId of ids) {
        let manager;
        try {
          manager = await resolveManagerForProject(projectId);
        } catch {
          manager = null;
        }
        if (!manager) {
          if (!fallback) {
            try {
              fallback = await resolveFallbackManager();
            } catch {
              fallback = null;
            }
          }
          manager = fallback;
        }
        managerMap[projectId] = manager;
      }
      if (!cancelled) setProjectManagers(managerMap);
    }
    loadManagers();
    return () => { cancelled = true; };
  }, [projectIdsKey]);

  const byManager = new Map();
  projectRows.forEach((row) => {
    const projectId = String(row.projectId || row.project_id || "");
    const projectName = row.projectName || row.project_name;
    if (!projectId || !projectName) return;
    const manager = projectManagers[projectId];
    const key = manager?.email || "unassigned";
    if (!byManager.has(key)) byManager.set(key, { manager, projects: [] });
    byManager.get(key).projects.push({
      name: projectName,
      number: row.projectNumber || row.project_number || ""
    });
  });
  return { approvers: Array.from(byManager.values()), managerByProject: projectManagers };
}

function TimeCardEditor({ card, onChange, onSubmit, onNavigateWeek, onJumpToDate, assignedProjects = [] }) {
  const isReturned = [TIME_CARD_STATUS.RETURNED, TIME_CARD_STATUS.REJECTED].includes(card.status);
  const isDraft = card.status === TIME_CARD_STATUS.DRAFT;
  const canEditHours = isDraft || isReturned;
  // Local buffer so a cell can hold an in-progress value like "8." while typing decimals.
  const [hourDrafts, setHourDrafts] = useState({});
  const [lastSaved, setLastSaved] = useState(null);
  const [futureHoursCleared, setFutureHoursCleared] = useState(false);
  const projectRows = Array.isArray(card.projectRows) ? card.projectRows : [];
  const { managerByProject } = useTimesheetApprovers(projectRows);
  const dailyTotals = card.dailyTotals || {};
  const weekStartDate = card.weekStartDate || card.week_start_date || card.date || "";
  const weekEndDate = card.weekEndDate || card.week_end_date || "";
  const dayDates = TIMESHEET_DAY_COLUMNS.map((_, dayIndex) => timesheetDayDate(weekStartDate, dayIndex));
  const todayKey = new Date().toDateString();
  const totalRegular = card.totalRegularHours || card.total_regular_hours || "0.00";
  const totalOvertime = card.totalOvertimeHours || card.total_overtime_hours || "0.00";
  const totalHours = card.totalHours || card.total_hours || "0.00";
  const comments = card.timesheetComments || card.timesheet_comments || card.comments || "";
  const weeklyLimitWarning = Number(totalHours) > 168 ? "Weekly hours cannot exceed 168." : "";

  useEffect(() => {
    setHourDrafts({});
    setLastSaved(null);
    setFutureHoursCleared(false);
  }, [card.id]);

  function persistCard(nextCard) {
    onChange(saveTimeCard(nextCard));
    setLastSaved({ at: new Date(), label: "just now" });
  }

  // Hours saved on future days (entered before the future-date lock) would silently
  // count toward totals while their cells render as locked "–". Clear them so the
  // grid and the totals always agree.
  useEffect(() => {
    if (!canEditHours) return;
    const futureDays = TIMESHEET_DAY_COLUMNS.filter((_, dayIndex) => isFutureTimesheetDay(dayDates[dayIndex]));
    if (!futureDays.length) return;
    const rows = Array.isArray(card.projectRows) ? card.projectRows : [];
    if (!rows.some((row) => futureDays.some((day) => Number(row.hours?.[day]) > 0))) return;
    const clearedRows = rows.map((row) => ({
      ...row,
      hours: { ...row.hours, ...futureDays.reduce((map, day) => ({ ...map, [day]: 0 }), {}) }
    }));
    persistCard({ ...card, projectRows: clearedRows });
    setFutureHoursCleared(true);
  }, [card.id]);

  useEffect(() => {
    if (!canEditHours) return undefined;
    const autosaveId = window.setInterval(() => {
      onChange(saveTimeCard(card));
      setLastSaved({ at: new Date(), label: "just now" });
    }, 30000);
    return () => window.clearInterval(autosaveId);
  }, [card, canEditHours, onChange]);

  // Keep the "Last saved … ago" label current between saves.
  useEffect(() => {
    if (!lastSaved?.at) return undefined;
    const tickerId = window.setInterval(() => {
      setLastSaved((current) => (current ? { ...current, label: lastSavedLabel(current.at) } : current));
    }, 30000);
    return () => window.clearInterval(tickerId);
  }, [lastSaved?.at]);

  function handleAddProject() {
    // Pre-select the first assigned project not already on the card; fall back to a blank row.
    const used = new Set(projectRows.map((row) => String(row.projectId || row.project_id || "")));
    const nextProject = assignedProjects.find((project) => !used.has(String(project.id))) || {};
    persistCard(addProjectRow(card, {
      projectId: nextProject.id || "",
      projectName: nextProject.name || "",
      projectNumber: nextProject.number || String(nextProject.id || ""),
      overtimeExempt: Boolean(nextProject.overtimeExempt)
    }));
  }

  function handleRemoveProject(rowId) {
    persistCard(removeProjectRow(card, rowId));
  }

  function handleProjectChange(rowId, projectId) {
    const project = assignedProjects.find((item) => String(item.id) === String(projectId)) || {};
    persistCard(setRowProject(card, rowId, {
      projectId: project.id ?? projectId,
      projectName: project.name ?? "",
      projectNumber: project.number ?? String(project.id ?? projectId ?? ""),
      overtimeExempt: Boolean(project.overtimeExempt)
    }));
  }

  // Dropdown options per row; include the row's existing project so legacy rows still render.
  function projectOptionsFor(row) {
    const options = assignedProjects.map((project) => ({ id: String(project.id), name: project.name, number: project.number }));
    const currentId = String(row.projectId || row.project_id || "");
    if (currentId && !options.some((option) => option.id === currentId)) {
      options.unshift({ id: currentId, name: row.projectName || row.project_name || "Project", number: row.projectNumber || row.project_number || "" });
    }
    return options;
  }

  function handleHoursChange(rowId, day, value) {
    if (isFutureTimesheetDay(dayDates[TIMESHEET_DAY_COLUMNS.indexOf(day)])) return;
    if (!/^\d{0,2}(\.\d{0,2})?$/.test(value)) return;
    if (Number(value) > 24) return;
    setHourDrafts((drafts) => ({ ...drafts, [`${rowId}:${day}`]: value }));
    persistCard(setRowHours(card, rowId, day, value === "" ? 0 : Number(value)));
  }

  function handleHoursBlur(rowId, day) {
    setHourDrafts((drafts) => {
      const next = { ...drafts };
      delete next[`${rowId}:${day}`];
      return next;
    });
  }

  function hourCellValue(row, day) {
    const draftKey = `${row.id}:${day}`;
    if (draftKey in hourDrafts) return hourDrafts[draftKey];
    const stored = Number(row.hours?.[day]) || 0;
    return stored === 0 ? "" : String(stored);
  }

  function updateComments(value) {
    persistCard({
      ...card,
      comments: value,
      timesheetComments: value,
      timesheet_comments: value
    });
  }

  async function submitCard() {
    // Backstop against duplicate filings: if another timesheet for this same
    // week is already with the manager (or approved), refuse to submit this one.
    const duplicateForWeek = findFiledCardForWeek(card);
    if (duplicateForWeek) {
      window.alert(`Timesheet ${getTimesheetNumber(duplicateForWeek)} for this week has already been ${duplicateForWeek.status === TIME_CARD_STATUS.APPROVED || duplicateForWeek.status === TIME_CARD_STATUS.COMPLETED ? "approved" : "submitted"}. You cannot submit a second timesheet for the same week.`);
      return;
    }
    // Drop rows with no project and no hours so a leftover blank row never reaches the manager.
    const submittableRows = (card.projectRows || []).filter((row) => !isEmptyProjectRow(row));
    const recalculated = saveTimeCard({
      ...card,
      projectRows: submittableRows
    });
    onSubmit(recalculated);
    if (recalculated.validationError || Number(recalculated.totalHours || 0) <= 0) return;
    const submitted = submitTimeCard(recalculated);
    onSubmit(submitted);
    const withPdf = await regenerateTimeCardPdf(submitted);
    onSubmit(withPdf);
    let pdfBlob = null;
    try {
      pdfBlob = generateTimeCardPdfBlob(withPdf);
    } catch (err) {
      console.warn("Timesheet PDF could not be attached to the approval email:", err);
    }
    const pdfFileName = `${withPdf.timesheetNumber || withPdf.timesheet_number || withPdf.id}.pdf`;
    sendTimesheetApprovalEmail(withPdf, { pdfBlob, pdfFileName }).catch((err) =>
      console.warn("Approval email could not be sent:", err)
    );
    if ((withPdf.pdfGenerationStatus || withPdf.pdf_generation_status) === "failed") {
      [60000, 300000, 900000].forEach((delay) => {
        window.setTimeout(async () => {
          const latestCard = getTimeCards().find((item) => item.id === withPdf.id) || withPdf;
          if ((latestCard.pdfGenerationStatus || latestCard.pdf_generation_status) === "generated") return;
          const retriedCard = await regenerateTimeCardPdf(latestCard);
          onSubmit(retriedCard);
        }, delay);
      });
    }
  }

  // Rows that are fully empty (no project, no hours) are stripped on submit, so they
  // never block it. Only rows holding hours without a project keep the button locked.
  const unnamedRowsWithHours = projectRows.filter((row) => !String(row.projectId || row.project_id || row.projectName || row.project_name || "").trim() && getRowTotal(row) > 0);
  const canSubmit = Boolean(Number(totalHours) > 0 && !unnamedRowsWithHours.length && !weeklyLimitWarning && !card.validationError && (isDraft || isReturned));
  const submitHint = !canSubmit && (isDraft || isReturned)
    ? (Number(totalHours) <= 0
        ? "Enter hours before submitting."
        : unnamedRowsWithHours.length
          ? "Select a project for every row with hours before submitting."
          : "")
    : "";

  return (
    <section className="w-full rounded-2xl border border-slate-200 bg-white px-6 py-6 sm:px-8">

      {/* ── Header ── */}
      <header>
        <p className="text-[13px] font-medium text-slate-500">
          Timesheets <span aria-hidden="true">›</span> <span className="font-semibold text-slate-700">{getTimesheetNumber(card)}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900">Weekly timesheet</h1>
          <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${getTimesheetStatusPillClass(card.status)}`}>
            {formatTimeCardStatus(card.status)}
          </span>
          {onNavigateWeek && (
            <div className="ml-auto">
              <WeekNavigator weekStartDate={weekStartDate} weekEndDate={weekEndDate} onNavigate={onNavigateWeek} onJumpToDate={onJumpToDate} />
            </div>
          )}
        </div>
        <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-2 border-b border-slate-200 pb-5">
          <div>
            <dt className="text-[13px] font-medium text-slate-500">Employee</dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-slate-900">{card.technicianName || card.technician_name || "-"}</dd>
          </div>
          <div>
            <dt className="text-[13px] font-medium text-slate-500">Role</dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-slate-900">{card.technicianRole || card.technician_role || "Field Engineer"}</dd>
          </div>
        </dl>
      </header>

      {isReturned && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-bold text-amber-900">Returned for correction</p>
          <p className="mt-0.5 text-sm leading-6 text-amber-800">
            {card.managerComment || "Manager comments and correction notes will appear here. Update the timesheet and resubmit when complete."}
          </p>
        </div>
      )}

      {futureHoursCleared && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-600">
          Hours logged on future dates were cleared — time can only be recorded for today or earlier.
        </div>
      )}

      {/* ── Hours by project ── */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Hours by project</h2>
        {canEditHours && (
          <button
            type="button"
            onClick={handleAddProject}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" /> Add project
          </button>
        )}
      </div>

      {projectRows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
          <p className="text-sm font-semibold text-slate-600">No projects added for this week.</p>
          {canEditHours && (
            <button type="button" onClick={handleAddProject} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
              <Plus className="h-4 w-4" /> Add project
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop grid — borderless, pill inputs */}
          <div className="mt-4 hidden overflow-x-auto lg:block">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[26%]" />
                {TIMESHEET_DAY_COLUMNS.map((dayName) => (
                  <col key={dayName} className="w-[9%]" />
                ))}
                <col className="w-[11%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50">
                  <th className="rounded-l-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Project</th>
                  {TIMESHEET_DAY_COLUMNS.map((dayName, dayIndex) => {
                    const dayDate = dayDates[dayIndex];
                    const isToday = Boolean(dayDate) && dayDate.toDateString() === todayKey;
                    const isMuted = TIMESHEET_WEEKEND_DAYS.has(dayName) || isFutureTimesheetDay(dayDate);
                    return (
                      <th key={dayName} className="border-l border-slate-200/70 px-0.5 py-2 text-center align-middle">
                        <div className={`mx-auto w-12 rounded-lg py-1 text-xs font-bold leading-tight ${isToday ? "border border-blue-200 bg-blue-50 text-blue-800" : isMuted ? "text-slate-400" : "text-slate-800"}`}>
                          {TIMESHEET_DAY_LABELS[dayName]}
                          <span className={`block text-[11px] font-semibold ${isToday ? "text-blue-600" : isMuted ? "text-slate-400" : "text-slate-500"}`}>{dayDate ? dayDate.getDate() : " "}</span>
                        </div>
                      </th>
                    );
                  })}
                  <th className="rounded-r-xl border-l border-slate-200/70 px-3 py-2 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Total</th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((row) => (
                  <tr key={row.id} className="group border-t border-slate-200">
                    <td className="px-2 py-3 align-middle">
                      {canEditHours ? (
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <div className="relative min-w-0 flex-1">
                              <select
                                value={String(row.projectId || row.project_id || "")}
                                onChange={(event) => handleProjectChange(row.id, event.target.value)}
                                title={row.projectName || row.project_name || "Select project"}
                                className="h-11 w-full appearance-none overflow-hidden text-ellipsis whitespace-nowrap rounded-xl border border-slate-300 bg-white pl-3 pr-8 text-[15px] font-semibold text-slate-900 outline-none transition hover:border-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                              >
                                <option value="">Select project…</option>
                                {projectOptionsFor(row).map((option) => (
                                  <option key={option.id} value={option.id}>{option.name}{option.number ? ` (#${option.number})` : ""}</option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            </div>
                            <button type="button" onClick={() => handleRemoveProject(row.id)} className="shrink-0 rounded-lg p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-rose-600 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100" aria-label="Remove project">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          {managerByProject[String(row.projectId || row.project_id || "")] && (
                            <p className="mt-1 pl-1 text-xs font-medium text-slate-400" title={managerByProject[String(row.projectId || row.project_id || "")]?.email || ""}>
                              Approver: <span className="text-slate-600">{managerByProject[String(row.projectId || row.project_id || "")]?.name}</span>
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-slate-900" title={row.projectName || row.project_name || ""}>
                            {row.projectName || row.project_name || <span className="font-medium text-slate-400">No project</span>}
                          </p>
                          <p className="text-[13px] font-medium text-slate-500">
                            {(row.projectNumber || row.project_number) ? `#${row.projectNumber || row.project_number}` : ""}
                            {managerByProject[String(row.projectId || row.project_id || "")] ? `${(row.projectNumber || row.project_number) ? " · " : ""}Approver: ${managerByProject[String(row.projectId || row.project_id || "")]?.name}` : ""}
                          </p>
                        </div>
                      )}
                    </td>
                    {TIMESHEET_DAY_COLUMNS.map((dayName, dayIndex) => {
                      const dayDate = dayDates[dayIndex];
                      const isFutureDay = isFutureTimesheetDay(dayDate);
                      const isToday = Boolean(dayDate) && dayDate.toDateString() === todayKey;
                      return (
                        <td key={dayName} className={`border-l border-slate-100 px-0.5 py-2 text-center align-middle ${isToday ? "bg-blue-50/70" : ""}`}>
                          {canEditHours ? (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={isFutureDay ? "" : hourCellValue(row, dayName)}
                              placeholder={isFutureDay ? "–" : ""}
                              disabled={isFutureDay}
                              title={isFutureDay ? "Hours cannot be logged for future dates" : undefined}
                              onChange={(event) => handleHoursChange(row.id, dayName, event.target.value)}
                              onBlur={() => handleHoursBlur(row.id, dayName)}
                              className={`mx-auto h-10 w-14 rounded-lg border text-center text-sm font-semibold outline-none transition ${isFutureDay ? "cursor-not-allowed border-dashed border-slate-300 bg-slate-50/60 text-slate-400 placeholder:text-slate-400" : isToday ? "border-blue-300 bg-white text-slate-900 shadow-sm focus:border-blue-700 focus:ring-2 focus:ring-blue-100" : "border-slate-400 bg-white text-slate-900 shadow-sm hover:border-blue-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-100"}`}
                            />
                          ) : (
                            <span className="text-sm font-semibold text-slate-900">{formatHours(row.hours?.[dayName])}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-3 text-right align-middle text-[15px] font-bold text-slate-900">{formatHours(getRowTotal(row))}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="rounded-l-xl px-3 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Daily total</td>
                  {TIMESHEET_DAY_COLUMNS.map((dayName, dayIndex) => {
                    const muted = (TIMESHEET_WEEKEND_DAYS.has(dayName) || isFutureTimesheetDay(dayDates[dayIndex])) && !Number(dailyTotals[dayName]);
                    return (
                      <td key={dayName} className={`border-l border-slate-200/70 px-0.5 py-2.5 text-center text-sm font-bold ${muted ? "text-slate-400" : "text-slate-900"}`}>
                        {formatHours(dailyTotals[dayName])}
                      </td>
                    );
                  })}
                  <td className="rounded-r-xl border-l border-slate-200/70 px-3 py-2.5 text-right text-sm font-bold text-slate-950">{totalHours}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile: project pickers, then stacked day cards */}
          {canEditHours && (
            <div className="mt-4 space-y-2 lg:hidden">
              {projectRows.map((row) => (
                <div key={row.id} className="flex items-center gap-1.5">
                  <div className="relative min-w-0 flex-1">
                    <select
                      value={String(row.projectId || row.project_id || "")}
                      onChange={(event) => handleProjectChange(row.id, event.target.value)}
                      title={row.projectName || row.project_name || "Select project"}
                      className="h-11 w-full appearance-none overflow-hidden text-ellipsis whitespace-nowrap rounded-xl border border-slate-300 bg-white pl-3 pr-8 text-[15px] font-semibold text-slate-900 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">Select project…</option>
                      {projectOptionsFor(row).map((option) => (
                        <option key={option.id} value={option.id}>{option.name}{option.number ? ` (#${option.number})` : ""}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                  <button type="button" onClick={() => handleRemoveProject(row.id)} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600" aria-label="Remove project">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 space-y-2.5 lg:hidden">
            {TIMESHEET_DAY_COLUMNS.map((dayName, dayIndex) => {
              const dayDate = dayDates[dayIndex];
              const isFutureDay = isFutureTimesheetDay(dayDate);
              const isToday = Boolean(dayDate) && dayDate.toDateString() === todayKey;
              return (
                <div key={dayName} className={`rounded-2xl border ${isToday ? "border-blue-200 bg-blue-50/60" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className={`text-sm font-semibold ${isFutureDay ? "text-slate-400" : isToday ? "text-blue-900" : "text-slate-900"}`}>
                      {dayName}{dayDate ? ` ${dayDate.getDate()}` : ""}
                    </span>
                    <span className={`text-sm font-bold ${isFutureDay ? "text-slate-400" : "text-slate-900"}`}>{isFutureDay ? "–" : `${formatHours(dailyTotals[dayName])} hrs`}</span>
                  </div>
                  {!isFutureDay && (
                    <div className="space-y-2 px-4 pb-3">
                      {projectRows.map((row) => (
                        <label key={row.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-600">{row.projectName || row.project_name || "No project"}</span>
                          <input type="text" inputMode="decimal" value={hourCellValue(row, dayName)} placeholder="" disabled={!canEditHours} onChange={(event) => handleHoursChange(row.id, dayName, event.target.value)} onBlur={() => handleHoursBlur(row.id, dayName)} className="h-10 w-20 rounded-xl border border-slate-300 px-2 text-center text-[15px] font-semibold text-slate-900 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50" />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Summary bar ── */}
      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5">
        <p className="flex items-baseline gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Regular</span>
          <span className="text-base font-bold text-slate-950">{totalRegular}</span>
        </p>
        <p className="flex items-baseline gap-2">
          <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${Number(totalOvertime) > 0 ? "text-amber-700" : "text-slate-500"}`}>Overtime</span>
          {(card.overtimeExempt || card.overtime_exempt) ? (
            <span className="text-[13px] font-semibold text-slate-400" title="Office-based employees are overtime exempt; all hours are recorded as regular time.">Exempt</span>
          ) : (
            <span className={`text-base font-bold ${Number(totalOvertime) > 0 ? "text-amber-800" : "text-slate-950"}`}>{totalOvertime}</span>
          )}
        </p>
        <p className="ml-auto flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-300">Total hours</span>
          <span className="text-base font-bold text-white">{totalHours}</span>
        </p>
      </div>

      {/* ── Weekly comments ── */}
      <label className="mt-6 block">
        <span className="text-base font-semibold text-slate-800">
          Weekly comments <span className="font-medium text-slate-400">(optional)</span>
        </span>
        <textarea
          value={comments}
          disabled={!canEditHours}
          placeholder="Add notes for your manager…"
          onBlur={() => persistCard(card)}
          onChange={(event) => updateComments(event.target.value)}
          rows={3}
          className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] font-normal text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
      </label>

      {/* Validation messages */}
      {card.validationError && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{card.validationError}</p>}
      {weeklyLimitWarning && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{weeklyLimitWarning}</p>}
      {!card.validationError && card.validationWarning && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">{card.validationWarning}</p>}

      {/* ── Action footer ── */}
      <div className="sticky bottom-0 z-10 -mx-6 mt-6 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-end sm:border-t sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-4 sm:backdrop-blur-0">
        {lastSaved && (
          <p className="text-center text-sm font-medium text-slate-400 sm:mr-auto sm:text-left">
            Last saved {lastSaved.label}
          </p>
        )}
        {submitHint && (
          <p className="self-center text-center text-xs font-semibold text-amber-700 sm:text-right">
            {submitHint}
          </p>
        )}
        <button
          type="button"
          onClick={() => persistCard(card)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
        >
          <Save className="h-4 w-4" /> {isReturned ? "Save" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={submitCard}
          disabled={!canSubmit}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-700"
        >
          <Send className="h-4 w-4" /> {isReturned ? "Resubmit" : "Submit for approval"}
        </button>
      </div>

    </section>
  );
}

function TimeCardReadOnlyView({ card, onRecall, onViewPdf, onDownloadPdf, onNavigateWeek, onJumpToDate }) {
  const isSubmitted = card.status === TIME_CARD_STATUS.SUBMITTED;
  const isApproved = card.status === TIME_CARD_STATUS.APPROVED;
  const isCompleted = card.status === TIME_CARD_STATUS.COMPLETED;
  const pdfStatus = card.pdfGenerationStatus || card.pdf_generation_status || (card.pdfStoragePath || card.pdf_storage_path ? "generated" : "pending");
  const canUsePdf = pdfStatus === "generated";
  const timesheetNumber = getTimesheetNumber(card);
  const submittedAt = card.submittedAt || card.submitted_at;
  const canRecall = isSubmitted;
  const projectRows = Array.isArray(card.projectRows) ? card.projectRows : [];
  const { managerByProject } = useTimesheetApprovers(projectRows);
  const dailyTotals = card.dailyTotals || {};
  const comments = card.timesheetComments || card.timesheet_comments || card.comments || "";
  const weekStart = card.weekStartDate || card.week_start_date || card.date;
  const weekEnd = card.weekEndDate || card.week_end_date;
  const totalRegular = card.totalRegularHours || card.total_regular_hours || "0.00";
  const totalOvertime = card.totalOvertimeHours || card.total_overtime_hours || "0.00";
  const totalHours = card.totalHours || card.total_hours || "0.00";
  const managerName = card.reviewedBy || card.reviewed_by || card.managerName || card.manager_name || "Project Manager";
  const reviewComments = card.reviewComments || card.review_comments || card.managerComment || "";
  const approvedAt = card.approvedAt || card.approved_at;
  const weeklyWarnings = [
    !(card.overtimeExempt || card.overtime_exempt) && Number(totalOvertime) > 0 ? "Weekly hours exceed 40. Overtime hours apply." : null,
    Number(totalHours) > 60 ? "Total weekly hours exceed the default company threshold of 60 hours." : null
  ].filter(Boolean);
  return (
    <section className="w-full rounded-2xl border border-slate-200 bg-white px-6 py-6 sm:px-8">

      {/* ── Header ── */}
      <header>
        <p className="text-[13px] font-medium text-slate-500">
          Timesheets <span aria-hidden="true">›</span> <span className="font-semibold text-slate-700">{timesheetNumber}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900">Weekly timesheet</h1>
          <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${getTimesheetStatusPillClass(card.status)}`}>
            {formatTimeCardStatus(card.status)}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {onNavigateWeek ? (
              <WeekNavigator weekStartDate={weekStart} weekEndDate={weekEnd} onNavigate={onNavigateWeek} onJumpToDate={onJumpToDate} />
            ) : (
              <p className="text-sm font-semibold text-slate-900">{formatWeekRange(weekStart, weekEnd)}</p>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <dl className="flex flex-wrap gap-x-10 gap-y-2">
            <div>
              <dt className="text-[13px] font-medium text-slate-500">Employee</dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-slate-900">{card.technicianName || card.technician_name || "-"}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-medium text-slate-500">Submitted</dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-slate-900">{submittedAt ? formatDateTime(submittedAt) : "-"}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            {canUsePdf && (
              <button type="button" onClick={onViewPdf} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
                <FileText className="h-4 w-4" /> View PDF
              </button>
            )}
            <details className="relative">
              <summary className="inline-flex h-10 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">Actions</summary>
              <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                <button type="button" onClick={onDownloadPdf || onViewPdf} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100">
                  <Download className="h-4 w-4" /> Download PDF
                </button>
                <button type="button" onClick={() => window.print()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100">
                  <FileText className="h-4 w-4" /> Print
                </button>
                {canRecall && (
                  <button type="button" onClick={onRecall} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100">
                    <RotateCcw className="h-4 w-4" /> Recall timesheet
                  </button>
                )}
              </div>
            </details>
          </div>
        </div>
      </header>

      {(isSubmitted || isApproved || isCompleted) && pdfStatus === "pending" && (
        <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
          PDF is still being generated. Please try again in a few seconds.
        </p>
      )}
      {(isSubmitted || isApproved || isCompleted) && pdfStatus === "failed" && (
        <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          Unable to generate the timesheet PDF. Please contact support.
          {(card.pdfGenerationFailureReason || card.pdf_generation_failure_reason || card.pdfGenerationError) && (
            <span className="mt-1 block text-[13px] font-medium">
              Reason: {card.pdfGenerationFailureReason || card.pdf_generation_failure_reason || card.pdfGenerationError}
            </span>
          )}
        </p>
      )}

      {(isApproved || isCompleted) && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="text-sm font-bold text-emerald-900">Approval details</p>
          <dl className="mt-2 flex flex-wrap gap-x-10 gap-y-2">
            <div>
              <dt className="text-[13px] font-medium text-emerald-700">Approved</dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-emerald-950">{approvedAt ? formatDateTime(approvedAt) : "-"}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-medium text-emerald-700">Approver</dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-emerald-950">{managerName}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-medium text-emerald-700">Comments</dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-emerald-950">{reviewComments || "-"}</dd>
            </div>
          </dl>
        </div>
      )}

      {weeklyWarnings.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {weeklyWarnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      {/* ── Hours by project (read-only) ── */}
      <h2 className="mt-6 text-xl font-bold tracking-tight text-slate-900">Hours by project</h2>

      <div className="mt-4 space-y-2 md:hidden">
        {projectRows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="truncate text-sm font-bold text-slate-900" title={row.projectName || row.project_name || ""}>{row.projectName || row.project_name || "-"}</p>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {TIMESHEET_DAY_COLUMNS.map((dayName) => (
                <div key={dayName} className="rounded-lg bg-slate-50 px-1 py-1 text-center">
                  <p className="text-[10px] font-bold text-slate-400">{TIMESHEET_DAY_LABELS[dayName]}</p>
                  <p className="text-[12px] font-bold text-slate-900">{formatHours(row.hours?.[dayName])}</p>
                </div>
              ))}
              <div className="rounded-lg bg-slate-950 px-1 py-1 text-center">
                <p className="text-[10px] font-bold text-slate-400">Total</p>
                <p className="text-[12px] font-bold text-white">{formatHours(getRowTotal(row))}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[26%]" />
            {TIMESHEET_DAY_COLUMNS.map((dayName) => (
              <col key={dayName} className="w-[9%]" />
            ))}
            <col className="w-[11%]" />
          </colgroup>
          <thead>
            <tr>
              <th className="px-2 pb-2 text-left text-[15px] font-medium text-slate-500">Project</th>
              {TIMESHEET_DAY_COLUMNS.map((dayName) => (
                <th key={dayName} className="px-1 pb-2 text-center text-[15px] font-medium text-slate-500">{TIMESHEET_DAY_LABELS[dayName]}</th>
              ))}
              <th className="px-2 pb-2 text-right text-[15px] font-medium text-slate-500">Total</th>
            </tr>
          </thead>
          <tbody>
            {projectRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="px-2 py-3">
                  <p className="truncate text-[15px] font-semibold text-slate-900" title={row.projectName || row.project_name || ""}>{row.projectName || row.project_name || "-"}</p>
                  <p className="text-[13px] font-medium text-slate-500">
                    {(row.projectNumber || row.project_number) ? `#${row.projectNumber || row.project_number}` : ""}
                    {managerByProject[String(row.projectId || row.project_id || "")] ? `${(row.projectNumber || row.project_number) ? " · " : ""}Approver: ${managerByProject[String(row.projectId || row.project_id || "")]?.name}` : ""}
                  </p>
                </td>
                {TIMESHEET_DAY_COLUMNS.map((dayName) => (
                  <td key={dayName} className="px-1 py-3 text-center text-[15px] font-medium text-slate-900">{formatHours(row.hours?.[dayName])}</td>
                ))}
                <td className="px-2 py-3 text-right text-[15px] font-bold text-slate-900">{formatHours(getRowTotal(row))}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-100">
              <td className="rounded-l-xl px-2 py-3 text-sm font-semibold text-slate-600">Daily total</td>
              {TIMESHEET_DAY_COLUMNS.map((dayName) => (
                <td key={dayName} className="px-1 py-3 text-center text-[15px] font-semibold text-slate-900">{formatHours(dailyTotals[dayName])}</td>
              ))}
              <td className="rounded-r-xl px-2 py-3 text-right text-[15px] font-bold text-slate-900">{totalHours}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Summary bar ── */}
      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5">
        <p className="flex items-baseline gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Regular</span>
          <span className="text-base font-bold text-slate-950">{totalRegular}</span>
        </p>
        <p className="flex items-baseline gap-2">
          <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${Number(totalOvertime) > 0 ? "text-amber-700" : "text-slate-500"}`}>Overtime</span>
          {(card.overtimeExempt || card.overtime_exempt) ? (
            <span className="text-[13px] font-semibold text-slate-400" title="Office-based employees are overtime exempt; all hours are recorded as regular time.">Exempt</span>
          ) : (
            <span className={`text-base font-bold ${Number(totalOvertime) > 0 ? "text-amber-800" : "text-slate-950"}`}>{totalOvertime}</span>
          )}
        </p>
        <p className="ml-auto flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-300">Total hours</span>
          <span className="text-base font-bold text-white">{totalHours}</span>
        </p>
      </div>

      {String(comments).trim() && (
        <div className="mt-6">
          <p className="text-base font-semibold text-slate-800">Weekly comments</p>
          <p className="mt-2 whitespace-pre-line rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-normal leading-6 text-slate-900">{comments}</p>
        </div>
      )}
    </section>
  );
}

const TIME_CARD_TABS = [
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Submitted" },
  { id: "returned", label: "Returned" },
  { id: "approved", label: "Approved" }
];

function TimeCardsPage({
  timeCardCollections,
  initialTab = "draft",
  onCreateTimeCard,
  onOpenTimeCard,
  onDeleteTimeCard,
  onRecallTimeCard,
  onDownloadTimeCardPdf
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchTerm, setSearchTerm] = useState("");
  const cardsByTab = {
    draft: timeCardCollections.draftTimeCards,
    submitted: timeCardCollections.submittedTimeCards,
    returned: timeCardCollections.returnedTimeCards,
    approved: timeCardCollections.approvedTimeCards
  };
  const tabCounts = {
    draft: timeCardCollections.draftTimeCards.length,
    submitted: timeCardCollections.submittedTimeCards.length,
    returned: timeCardCollections.returnedTimeCards.length,
    approved: timeCardCollections.approvedTimeCards.length
  };
  const getSortDate = (card) => {
    if (activeTab === "submitted") return card.submittedAt || card.updatedAt || card.date;
    if (activeTab === "returned") return card.returnedAt || card.updatedAt || card.date;
    if (activeTab === "approved") return card.approvedAt || card.submittedAt || card.updatedAt || card.date;
    return card.updatedAt || card.date;
  };
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const cards = [...(cardsByTab[activeTab] || [])]
    .filter((card) => {
      if (!normalizedSearch) return true;
      const projectNumber = card.projectNumber || card.project_number || "";
      return [card.projectName, projectNumber, card.date].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
    })
    .sort((a, b) => new Date(getSortDate(b) || 0) - new Date(getSortDate(a) || 0));
  const label = TIME_CARD_TABS.find((tab) => tab.id === activeTab)?.label || "Draft";

  return (
    <section className="w-full rounded-2xl border border-slate-200 bg-white px-6 py-6 sm:px-8">

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900">Timesheets</h1>
          <p className="mt-1 text-[13px] font-medium text-slate-500">Track labor records by status.</p>
        </div>
        <button
          type="button"
          onClick={onCreateTimeCard}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white transition hover:bg-blue-600"
        >
          <Plus className="h-4 w-4" /> Open current timesheet
        </button>
      </div>

      {/* Status tabs */}
      <div className="mt-5 flex flex-wrap gap-1.5 border-b border-slate-200 pb-px">
        {TIME_CARD_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative -mb-px inline-flex h-10 items-center gap-2 rounded-t-lg border-b-2 px-4 text-sm font-semibold transition ${isActive ? "border-blue-700 text-slate-900" : "border-transparent text-slate-500 hover:bg-slate-100/70 hover:text-slate-800"}`}
            >
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${isActive ? "bg-blue-700/10 text-[#a84f30]" : "bg-slate-100 text-slate-500"}`}>
                {tabCounts[tab.id] || 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="mt-4">
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search project, project number, or date…"
          className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 sm:max-w-md"
        />
      </div>

      {/* Column headers (desktop) */}
      {cards.length > 0 && (
        <div className="mt-5 hidden grid-cols-[140px_minmax(0,1fr)_190px_60px_60px_70px_130px_140px_200px] items-center gap-3 px-4 pb-2 text-[13px] font-medium text-slate-500 lg:grid">
          <span>Timesheet</span>
          <span>Project</span>
          <span>Week period</span>
          <span className="text-right">Reg</span>
          <span className="text-right">OT</span>
          <span className="text-right">Total</span>
          <span className="pl-4">Status</span>
          <span>{ {draft: "Last modified", submitted: "Submitted", returned: "Returned", approved: "Approved"}[activeTab] || "Date" }</span>
          <span aria-hidden="true"> </span>
        </div>
      )}

      {/* Rows */}
      <div className={`space-y-2 ${cards.length > 0 ? "" : "mt-5"}`}>
        {cards.map((card) => (
          <TimeCardListRow
            key={card.id}
            card={card}
            activeTab={activeTab}
            onOpen={() => onOpenTimeCard(card)}
            onDelete={() => onDeleteTimeCard(card)}
            onRecall={() => onRecallTimeCard(card)}
            onDownloadPdf={() => onDownloadTimeCardPdf(card)}
          />
        ))}
      </div>

      {!cards.length && (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center">
          <p className="text-base font-semibold text-slate-700">No {label.toLowerCase()} timesheets</p>
          <p className="mx-auto mt-1 max-w-md text-sm font-medium text-slate-500">
            Use Open current timesheet to create or reopen the weekly draft for the selected project and week.
          </p>
        </div>
      )}
    </section>
  );
}

export {
  TIME_CARD_TABS,
  TimeCardEditor,
  TimeCardListRow,
  TimeCardReadOnlyView,
  TimeCardsPage,
  WeekNavigator,
  formatWeekRange,
  getRegularAndOvertimeHours,
  getTimesheetNumber,
  getTimesheetStatusBadgeClass,
  getTimesheetStatusPillClass
};
