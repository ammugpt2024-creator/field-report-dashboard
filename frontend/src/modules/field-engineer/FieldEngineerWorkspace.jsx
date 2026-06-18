import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Camera,
  Calculator,
  ClipboardCheck,
  Download,
  FileText,
  FlaskConical,
  HardHat,
  KeyRound,
  Layers3,
  Minus,
  Plus,
  Save,
  Send,
  Trash2,
  ShieldCheck
} from "lucide-react";
import StatusTabs from "../../components/mobile/StatusTabs";
import DailyLogEditor from "../../components/daily-log/DailyLogEditor";
import DailyLogSummaryView from "../../components/daily-log/DailyLogSummaryView";
import PhotosAttachmentsSection, { isAllowedDailyLogAttachment } from "../../components/daily-log/PhotosAttachmentsSection";
import {
  DAILY_LOG_STATUS,
  createConcreteReport,
  createDailyLog,
  deleteDailyLog,
  filterDailyLogsForAccess,
  getDailyLogCollections,
  getDailyLogs,
  saveDailyLog,
  syncDailyLogsFromSupabase
} from "../../services/dailyLogService";
import { openDailyLogPdf, regenerateDailyLogPdf, generateProctorStandalonePdf, generateSamplesStandalonePdf } from "../../services/dailyLogPdfService";
import { generateAndUploadConcreteReportPdf, openConcreteReportPdf } from "../../services/concreteReportPdfService";
import { openTimeCardPdf } from "../../services/timeCardPdfService";
import {
  createTimeCard,
  deleteTimeCard,
  findFiledCardForWeek,
  getTimeCardCollections,
  getTimeCards,
  getWeekStartFor,
  LOCKED_TIME_CARD_STATUSES,
  normalizeWeeklyCard,
  saveTimeCard,
  TIME_CARD_STATUS
} from "../../services/timeCardService";
import { formatDateTime } from "./fieldEngineerData";
import { fetchTimesheetStatusUpdates, fetchTimesheetsForTechnician } from "../../services/timesheetSyncService";
import {
  TimeCardEditor,
  TimeCardReadOnlyView,
  TimeCardsPage
} from "../timesheets/timesheetUi";

function cardClass(extra = "") {
  return `rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 ${extra}`;
}

function sectionTitle(kicker, title, description) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">{kicker}</p>
      <h2 className="mt-2 text-xl font-bold text-slate-950 sm:text-2xl">{title}</h2>
      {description && <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">{description}</p>}
    </div>
  );
}

function commandCenterTitle(title, description) {
  return (
    <div className="min-w-0">
      <h2 className="text-lg font-bold text-slate-950 sm:text-2xl">{title}</h2>
      {description && <p className="mt-1 hidden max-w-3xl text-sm font-semibold leading-6 text-slate-600 sm:block">{description}</p>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function inputClass() {
  return "min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100";
}



function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <p className="text-lg font-bold text-slate-950">{title}</p>
      <p className="mt-2 text-sm font-semibold text-slate-600">{description}</p>
      {actionLabel && (
        <button type="button" onClick={onAction} className="mt-4 min-h-11 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function DailyLogListRow({ log, activeTab, onOpen, onDelete, onRecall, onDownloadPdf }) {
  const reportCount = log.activities.reduce((sum, activity) => sum + (activity.concreteReports?.length || activity.reports?.length || 0), 0);
  const projectNumber = log.projectNumber || log.project_number || log.projectNo || log.project_no || "";
  const displayDate = log.date
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", year: "numeric" }).format(new Date(`${log.date}T00:00:00`))
    : "-";
  const statusDateLabel = {
    draft: "Modified",
    submitted: "Submitted",
    returned: "Returned",
    approved: "Approved"
  }[activeTab] || "Updated";
  const statusDate = {
    draft: log.updatedAt,
    submitted: log.submittedAt,
    returned: log.returnedAt || log.updatedAt,
    approved: log.approvedAt || log.submittedAt || log.updatedAt
  }[activeTab];
  const primaryLabel = {
    draft: "Continue",
    submitted: "View",
    returned: "Edit & Resubmit",
    approved: "View"
  }[activeTab] || "Open";

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
      className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-50/60 sm:px-4 sm:py-3"
    >
      {/* Phone: one compact row, like the Command Center action list. */}
      <div className="flex items-center gap-3 md:hidden">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          activeTab === "returned" ? "bg-rose-50 text-rose-600"
            : activeTab === "approved" ? "bg-emerald-50 text-emerald-600"
            : activeTab === "submitted" ? "bg-blue-50 text-blue-600"
            : "bg-slate-100 text-slate-500"
        }`}>
          {activeTab === "returned" ? <AlertTriangle className="h-4 w-4" />
            : activeTab === "approved" ? <ClipboardCheck className="h-4 w-4" />
            : activeTab === "submitted" ? <Send className="h-4 w-4" />
            : <FileText className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-950">{log.projectName}</p>
          <p className="truncate text-xs font-semibold text-slate-500">
            {displayDate} · {log.activities.length} act · {reportCount} rpt · {statusDateLabel} {statusDate ? formatDateTime(statusDate) : "-"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          {activeTab === "approved" && (
            <button type="button" onClick={onDownloadPdf} aria-label="Download PDF" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
              <Download className="h-4 w-4" />
            </button>
          )}
          {activeTab === "draft" && (
            <button type="button" onClick={onDelete} aria-label="Delete draft" className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {activeTab === "submitted" && (
            <button type="button" onClick={onRecall} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600">
              Recall
            </button>
          )}
          <button type="button" onClick={onOpen} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white">{primaryLabel === "Edit & Resubmit" ? "Edit" : primaryLabel}</button>
        </div>
      </div>
      <div className="hidden flex-col gap-2 md:flex lg:flex-row lg:items-center lg:justify-between lg:gap-3">
        <div className="min-w-0 lg:max-w-[38%]">
          <p className="truncate text-sm font-bold leading-5 text-slate-950">{log.projectName}</p>
          {projectNumber && <p className="mt-0.5 truncate text-xs font-semibold leading-4 text-slate-500">Project #{projectNumber}</p>}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold text-slate-700 sm:gap-x-4 sm:gap-y-2 sm:text-sm">
          <span className="whitespace-nowrap">{displayDate} • {log.shift || "Day Shift"}</span>
          <div className="flex items-center gap-1.5 whitespace-nowrap sm:gap-2" aria-label="Work summary">
            <span className="inline-flex min-h-7 items-center justify-center rounded-full bg-slate-100 px-2.5 text-[13px] font-bold text-slate-800 sm:min-h-8 sm:min-w-12 sm:px-3 sm:text-sm">📋 {log.activities.length}</span>
            <span className="inline-flex min-h-7 items-center justify-center rounded-full bg-slate-100 px-2.5 text-[13px] font-bold text-slate-800 sm:min-h-8 sm:min-w-12 sm:px-3 sm:text-sm">📄 {reportCount}</span>
          </div>
          <span className="whitespace-nowrap">
            <span className="font-bold text-slate-500">{statusDateLabel}</span>{" "}
            <span>{statusDate ? formatDateTime(statusDate) : "-"}</span>
          </span>
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={onOpen} className="min-h-10 max-w-[120px] rounded-xl bg-slate-950 px-4 text-sm font-bold text-white lg:min-h-9 lg:w-[110px] lg:px-3 lg:text-xs">
            {primaryLabel}
          </button>
          {activeTab === "draft" && (
            <button type="button" onClick={onDelete} className="min-h-10 max-w-[100px] rounded-xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 lg:min-h-9 lg:w-[78px] lg:px-3 lg:text-xs">
              Delete
            </button>
          )}
          {activeTab === "submitted" && (
            <button type="button" onClick={onRecall} className="min-h-10 max-w-[120px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 lg:min-h-9 lg:w-[82px] lg:px-3 lg:text-xs">
              Recall
            </button>
          )}
          {activeTab === "approved" && (
            <button type="button" onClick={onDownloadPdf} className="min-h-10 max-w-[120px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 lg:min-h-9 lg:w-[120px] lg:px-3 lg:text-xs">
              Download PDF
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function ActionLogRow({ log, onOpen }) {
  const isReturned = log.status === DAILY_LOG_STATUS.RETURNED;
  return (
    <article className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:bg-slate-50/70 md:px-4 md:py-3">
      {/* Phone: one compact tappable row — 10+ items must stay scannable. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}
        className="flex cursor-pointer items-center gap-3 md:hidden"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isReturned ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"}`}>
          {isReturned ? <AlertTriangle className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-950">{isReturned ? "Returned Daily Log" : "Draft Daily Log"}</p>
          <p className="truncate text-xs font-semibold text-slate-500">
            {log.projectName} · {log.activities.length} {log.activities.length === 1 ? "activity" : "activities"} · {relativeTimeLabel(log.updatedAt)}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white">
          {isReturned ? "Review" : "Continue"}
        </span>
      </div>
      <div className="hidden gap-2 md:grid md:grid-cols-[2fr_4fr_2fr_2fr_1fr] md:items-center md:gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 md:hidden">Type</p>
          <p className="text-sm font-bold text-slate-950">{isReturned ? "Returned Daily Log" : "Draft Daily Log"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 md:hidden">Project</p>
          <p className="truncate text-sm font-semibold text-slate-800">{log.projectName}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 md:hidden">Summary</p>
          <p className="text-sm font-semibold text-slate-700">📋 {log.activities.length} {log.activities.length === 1 ? "Activity" : "Activities"}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 md:hidden">Last Updated</p>
          <p className="text-sm font-semibold text-slate-600">{formatDateTime(log.updatedAt)}</p>
        </div>
        <button type="button" onClick={onOpen} className="min-h-9 w-full rounded-xl bg-slate-950 px-3 text-xs font-bold text-white md:w-[120px] md:max-w-[120px] md:justify-self-end">
          {isReturned ? "Review" : "Continue"}
        </button>
      </div>
    </article>
  );
}

function activityEventMeta(label = "") {
  const normalized = label.toLowerCase();
  if (normalized.includes("approved")) return { icon: ClipboardCheck, chip: "bg-emerald-50 text-emerald-600" };
  if (normalized.includes("returned")) return { icon: AlertTriangle, chip: "bg-rose-50 text-rose-600" };
  if (normalized.includes("submitted")) return { icon: Send, chip: "bg-blue-50 text-blue-600" };
  if (normalized.includes("photo")) return { icon: Camera, chip: "bg-slate-100 text-slate-500" };
  return { icon: FileText, chip: "bg-slate-100 text-slate-500" };
}

function relativeTimeLabel(value) {
  if (!value) return "";
  const diffMinutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function activityDayLabel(value) {
  if (!value) return "Earlier";
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function groupActivityByDay(events) {
  const groups = [];
  events.forEach((event) => {
    const label = activityDayLabel(event.at);
    const group = groups[groups.length - 1];
    if (group && group.label === label) {
      group.events.push(event);
    } else {
      groups.push({ label, events: [event] });
    }
  });
  return groups;
}

function ActivityEventRow({ event }) {
  const meta = activityEventMeta(event.label);
  const Icon = meta.icon;
  return (
    <article className="flex items-start gap-3 py-2.5">
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.chip}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">{event.label}</p>
        {event.detail && <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{event.detail}</p>}
      </div>
      <p className="shrink-0 pt-1.5 text-xs font-semibold text-slate-400" title={formatDateTime(event.at)}>{relativeTimeLabel(event.at)}</p>
    </article>
  );
}


function ActionTimeCardRow({ card, onOpen }) {
  const isReturned = card.status === TIME_CARD_STATUS.RETURNED;
  return (
    <article className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:bg-slate-50/70 md:px-4 md:py-3">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}
        className="flex cursor-pointer items-center gap-3 md:hidden"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isReturned ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"}`}>
          {isReturned ? <AlertTriangle className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-950">{isReturned ? "Returned Timesheet" : "Draft Timesheet"}</p>
          <p className="truncate text-xs font-semibold text-slate-500">
            {[card.projectName || card.shift, `${card.totalHours || "0.00"} hrs`, relativeTimeLabel(card.updatedAt)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white">
          {isReturned ? "Correct" : "Continue"}
        </span>
      </div>
      <div className="hidden gap-2 md:grid md:grid-cols-[2fr_4fr_2fr_2fr_1fr] md:items-center md:gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 md:hidden">Type</p>
          <p className="text-sm font-bold text-slate-950">{isReturned ? "Returned Timesheet" : "Draft Timesheet"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 md:hidden">Project</p>
          <p className="truncate text-sm font-semibold text-slate-800">{card.projectName || card.shift}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 md:hidden">Summary</p>
          <p className="text-sm font-bold text-slate-950">⏱ {card.totalHours || "0.00"} Hours</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 md:hidden">Last Updated</p>
          <p className="text-sm font-semibold text-slate-600">{formatDateTime(card.updatedAt)}</p>
        </div>
        <button type="button" onClick={onOpen} className="min-h-9 w-full rounded-xl bg-slate-950 px-3 text-xs font-bold text-white md:w-[120px] md:max-w-[120px] md:justify-self-end">
          {isReturned ? "Correct" : "Continue"}
        </button>
      </div>
    </article>
  );
}



function DashboardOverview({ profile, logCollections, timeCardCollections, onOpenLog, onOpenTimeCard, onCreateLog, navigate }) {
  // Collapsed by default — expand on demand via the +/- control.
  const [activityCollapsed, setActivityCollapsed] = useState(true);
  const actionRequiredLogs = [...logCollections.returnedLogs, ...logCollections.draftLogs];
  const actionRequiredTimeCards = [...timeCardCollections.returnedTimeCards, ...timeCardCollections.draftTimeCards];
  const actionRequiredItems = [
    ...logCollections.returnedLogs.map((log) => ({ type: "log", id: `log-${log.id}`, item: log })),
    ...timeCardCollections.returnedTimeCards.map((card) => ({ type: "time-card", id: `time-card-${card.id}`, item: card })),
    ...logCollections.draftLogs.map((log) => ({ type: "log", id: `log-${log.id}`, item: log })),
    ...timeCardCollections.draftTimeCards.map((card) => ({ type: "time-card", id: `time-card-${card.id}`, item: card }))
  ];
  const actionRequiredLogIds = new Set(actionRequiredLogs.map((log) => log.id));
  const actionRequiredTimeCardIds = new Set(actionRequiredTimeCards.map((card) => card.id));
  const allLogs = [
    ...logCollections.returnedLogs,
    ...logCollections.draftLogs,
    ...logCollections.submittedLogs,
    ...logCollections.approvedLogs
  ];
  const allTimeCards = [
    ...timeCardCollections.draftTimeCards,
    ...timeCardCollections.returnedTimeCards,
    ...timeCardCollections.submittedTimeCards,
    ...timeCardCollections.approvedTimeCards
  ];
  const activityEvents = allLogs.filter((log) => !actionRequiredLogIds.has(log.id)).flatMap((log) => {
    const reportCount = (log.activities || []).reduce((sum, activity) => sum + ((activity.concreteReports || activity.reports || []).length), 0);
    return [
      { id: `log-created-${log.id}`, at: log.createdAt, label: "Daily Log Created", detail: log.projectName },
      log.submittedAt ? { id: `log-submitted-${log.id}`, at: log.submittedAt, label: "Daily Log Submitted", detail: log.projectName } : null,
      log.status === DAILY_LOG_STATUS.RETURNED ? { id: `log-returned-${log.id}`, at: log.returnedAt || log.updatedAt, label: "Daily Log Returned", detail: log.projectName } : null,
      log.status === DAILY_LOG_STATUS.APPROVED ? { id: `log-approved-${log.id}`, at: log.approvedAt || log.updatedAt, label: "Daily Log Approved", detail: log.projectName } : null,
      reportCount > 0 ? { id: `report-added-${log.id}`, at: log.updatedAt, label: "Concrete Report Added", detail: `${reportCount} report${reportCount === 1 ? "" : "s"} linked to Daily Log` } : null
    ].filter(Boolean);
  });
  const timeCardEvents = allTimeCards.filter((card) => !actionRequiredTimeCardIds.has(card.id)).flatMap((card) => [
    card.submittedAt ? { id: `time-card-submitted-${card.id}`, at: card.submittedAt, label: "Timesheet Submitted", detail: `${card.date} - ${card.totalHours || "0.00"} hours` } : null,
    card.status === TIME_CARD_STATUS.APPROVED ? { id: `time-card-approved-${card.id}`, at: card.approvedAt || card.updatedAt, label: "Timesheet Approved", detail: `${card.date} - ${card.totalHours || "0.00"} hours` } : null
  ].filter(Boolean));
  const recentActivity = [...activityEvents, ...timeCardEvents]
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .slice(0, 50);
  const latestActivity = recentActivity.slice(0, 5);
  const technicianName = profile?.full_name || profile?.name || "Technician";
  const todayText = new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", year: "numeric" }).format(new Date());

  return (
    <>
      {/* Slim toolbar header — Procore-style, no hero banner */}
      <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Welcome, {technicianName}</h1>
            <p className="mt-0.5 text-[13px] font-medium text-slate-500">
              {todayText}
              {actionRequiredItems.length
                ? ` · ${actionRequiredItems.length} ${actionRequiredItems.length === 1 ? "item needs" : "items need"} your action`
                : " · You're all caught up"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/timesheets")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <CalendarDays className="h-4 w-4" /> My Timesheet
            </button>
            <button
              type="button"
              onClick={onCreateLog}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent-500 px-3 text-sm font-semibold text-white hover:bg-accent-600"
            >
              <Plus className="h-4 w-4" /> Start Daily Log
            </button>
          </div>
        </div>
      </section>

      {/* Metric strip — one card, divided columns; zeros dimmed, alerts colored */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 xl:divide-x xl:divide-slate-200">
          {[
            { label: "Draft logs", value: logCollections.draftLogs.length, view: "daily-logs" },
            { label: "Submitted logs", value: logCollections.submittedLogs.length, view: "submitted-logs", tone: "text-blue-700" },
            { label: "Returned logs", value: logCollections.returnedLogs.length, view: "returned-logs", tone: "text-rose-600" },
            { label: "Approved logs", value: logCollections.approvedLogs.length, view: "approved-logs", tone: "text-emerald-700" },
            { label: "Timesheets pending", value: timeCardCollections.submittedTimeCards.length, view: "submitted-time-cards", tone: "text-blue-700" },
            { label: "Timesheets approved", value: timeCardCollections.approvedTimeCards.length, view: "approved-time-cards", tone: "text-emerald-700" }
          ].map(({ label, value, view, tone }) => (
            <button
              key={label}
              type="button"
              onClick={() => navigate(`/technician/dashboard?view=${view}`)}
              className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-left transition hover:bg-slate-50 sm:block sm:py-3 xl:border-b-0"
            >
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className={`text-xl font-semibold sm:mt-1 sm:text-2xl ${value > 0 ? (tone || "text-slate-900") : "text-slate-300"}`}>{value}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Action required — flat list card with slim header */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            Action required
            <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold ${actionRequiredItems.length ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}>
              {actionRequiredItems.length}
            </span>
          </h2>
        </header>
        <div className="px-5 py-3">
          {actionRequiredItems.length > 0 ? (
            <>
              <div className="hidden rounded-lg bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 md:grid md:grid-cols-[2fr_4fr_2fr_2fr_1fr] md:gap-4">
                <span>Type</span>
                <span>Project</span>
                <span>Summary</span>
                <span>Last Updated</span>
                <span className="text-right">Action</span>
              </div>
              <div className="mt-2 space-y-2">
                {actionRequiredItems.map(({ type, id, item }) => (
                  type === "log"
                    ? <ActionLogRow key={id} log={item} onOpen={() => onOpenLog(item)} />
                    : <ActionTimeCardRow key={id} card={item} onOpen={() => onOpenTimeCard(item)} />
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 py-1">
              <p className="flex items-center gap-2 text-[13px] font-medium text-slate-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                You're all caught up — no Daily Logs or Timesheets need your action.
              </p>
              <button
                type="button"
                onClick={onCreateLog}
                className="text-[13px] font-semibold text-blue-700 hover:text-blue-800"
              >
                Start today's Daily Log →
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Recent activity — flat feed card */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={() => setActivityCollapsed((value) => !value)}
            aria-expanded={!activityCollapsed}
            title={activityCollapsed ? "Expand recent activity" : "Collapse recent activity"}
            className="flex min-w-0 items-center gap-2 text-left"
          >
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-50">
              {activityCollapsed ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
            </span>
            <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
            <span className="text-xs font-medium text-slate-400">
              {latestActivity.length ? `· last update ${relativeTimeLabel(latestActivity[0].at)}` : ""}
            </span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/technician/activity-history")}
            className="text-[13px] font-semibold text-blue-700 hover:text-blue-800"
          >
            View all
          </button>
        </header>
        {!activityCollapsed && (
          <div className="px-5 pb-3 pt-1">
            {groupActivityByDay(latestActivity).map((group) => (
              <div key={group.label}>
                <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{group.label}</p>
                <div className="divide-y divide-slate-100">
                  {group.events.map((event) => <ActivityEventRow key={event.id} event={event} />)}
                </div>
              </div>
            ))}
            {!latestActivity.length && (
              <p className="py-3 text-[13px] font-medium text-slate-500">No recent activity yet.</p>
            )}
          </div>
        )}
      </section>
    </>
  );
}

function buildActivityEvents(logCollections, timeCardCollections) {
  const allLogs = [
    ...logCollections.returnedLogs,
    ...logCollections.draftLogs,
    ...logCollections.submittedLogs,
    ...logCollections.approvedLogs
  ];
  const allTimeCards = [
    ...timeCardCollections.draftTimeCards,
    ...timeCardCollections.returnedTimeCards,
    ...timeCardCollections.submittedTimeCards,
    ...timeCardCollections.approvedTimeCards
  ];
  const activityEvents = allLogs.flatMap((log) => {
    const reportCount = (log.activities || []).reduce((sum, activity) => sum + ((activity.concreteReports || activity.reports || []).length), 0);
    const photoCount = (log.activities || []).reduce((sum, activity) => sum + ((activity.photos || []).length), 0);
    return [
      { id: `log-created-${log.id}`, at: log.createdAt, label: "Daily Log Created", detail: log.projectName },
      log.submittedAt ? { id: `log-submitted-${log.id}`, at: log.submittedAt, label: "Daily Log Submitted", detail: log.projectName } : null,
      log.status === DAILY_LOG_STATUS.RETURNED ? { id: `log-returned-${log.id}`, at: log.returnedAt || log.updatedAt, label: "Manager Returned Daily Log", detail: log.projectName } : null,
      log.status === DAILY_LOG_STATUS.APPROVED ? { id: `log-approved-${log.id}`, at: log.approvedAt || log.updatedAt, label: "Daily Log Approved", detail: log.projectName } : null,
      reportCount > 0 ? { id: `report-added-${log.id}`, at: log.updatedAt, label: "Report Added", detail: `${reportCount} report${reportCount === 1 ? "" : "s"} linked` } : null,
      photoCount > 0 ? { id: `photo-uploaded-${log.id}`, at: log.updatedAt, label: "Photo Uploaded", detail: `${photoCount} photo${photoCount === 1 ? "" : "s"} attached` } : null
    ].filter(Boolean);
  });
  const timeCardEvents = allTimeCards.flatMap((card) => [
    card.submittedAt ? { id: `time-card-submitted-${card.id}`, at: card.submittedAt, label: "Timesheet Submitted", detail: `${card.totalHours || "0.00"} Hours` } : null,
    card.status === TIME_CARD_STATUS.RETURNED ? { id: `time-card-returned-${card.id}`, at: card.returnedAt || card.updatedAt, label: "Timesheet Returned", detail: card.managerComment || card.date } : null,
    card.status === TIME_CARD_STATUS.APPROVED ? { id: `time-card-approved-${card.id}`, at: card.approvedAt || card.updatedAt, label: "Timesheet Approved", detail: `${card.totalHours || "0.00"} Hours` } : null
  ].filter(Boolean));

  return [...activityEvents, ...timeCardEvents].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
}

function ActivityHistoryPage({ logCollections, timeCardCollections }) {
  const events = buildActivityEvents(logCollections, timeCardCollections);

  return (
    <>
      <section className={cardClass()}>
        {commandCenterTitle("Activity History", "Latest Daily Log, Timesheet, report, photo, and manager activity.")}
      </section>
      <section className="space-y-2">
        {events.map((event) => <ActivityEventRow key={event.id} event={event} />)}
        {!events.length && <p className="rounded-xl bg-white p-4 text-sm font-semibold text-slate-500">No activity history yet.</p>}
      </section>
    </>
  );
}

function ConcreteReportPage({ log, activityId, reportId, onChange, onBack }) {
  const [activeStep, setActiveStep] = useState(0);
  const [savedAt, setSavedAt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [finishAttempted, setFinishAttempted] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const fieldRefs = useRef({});
  const activity = (log.activities || []).find((item) => item.id === activityId);
  function normalizeConcreteReportFields(source = {}) {
    const normalizedTestRecords = (source.testRecords || source.test_records || []).map((record) => ({
      ...record,
      placementLocation: record.placementLocation ?? record.placement_location ?? "",
      ticketNumber: record.ticketNumber ?? record.ticket_number ?? "",
      truckNumber: record.truckNumber ?? record.truck_number ?? "",
      cubicYards: record.cubicYards ?? record.cubic_yards ?? "",
      timeBatched: record.timeBatched ?? record.time_batched ?? "",
      arrivalTime: record.arrivalTime ?? record.arrival_time ?? "",
      timeTested: record.timeTested ?? record.time_tested ?? "",
      airContent: record.airContent ?? record.air_content ?? "",
      concreteTemperature: record.concreteTemperature ?? record.concrete_temperature ?? "",
      waterAdded: record.waterAdded ?? record.water_added ?? "",
      unitWeight: record.unitWeight ?? record.unit_weight ?? ""
    }));
    return {
      ...source,
      placementLocation: source.placementLocation ?? source.placement_location ?? "",
      dateSampled: source.dateSampled ?? source.date_sampled ?? "",
      timeSampled: source.timeSampled ?? source.time_sampled ?? "",
      technicianName: source.technicianName ?? source.technician_name ?? "",
      weatherCondition: source.weatherCondition ?? source.weather_condition ?? "",
      mixDesignNumber: source.mixDesignNumber ?? source.mix_design_number ?? "",
      batchPlantSupplier: source.batchPlantSupplier ?? source.batch_plant_supplier ?? source.batch_supplier ?? "",
      slumpSpreadRange: source.slumpSpreadRange ?? source.slump_spread_range ?? "",
      airContentRange: source.airContentRange ?? source.air_content_range ?? "",
      temperatureRange: source.temperatureRange ?? source.temperature_range ?? "",
      unitWeight: source.unitWeight ?? source.unit_weight ?? "",
      strengthVerificationRequired: source.strengthVerificationRequired ?? source.strength_verification_required ?? false,
      setNumber: source.setNumber ?? source.set_number ?? "",
      labCylinders: source.labCylinders ?? source.lab_cylinders ?? source.labSamples ?? "",
      fieldCylinders: source.fieldCylinders ?? source.field_cylinders ?? source.fieldSamples ?? "",
      cylinderIds: source.cylinderIds ?? source.cylinder_ids ?? "",
      breakAges: source.breakAges ?? source.break_ages ?? "",
      strengthComments: source.strengthComments ?? source.strength_comments ?? "",
      testRecords: normalizedTestRecords,
      attachments: source.attachments || source.report_attachments || []
    };
  }

  function prepareConcreteReportForSave(source = {}) {
    const normalized = normalizeConcreteReportFields(source);
    return {
      ...normalized,
      placement_location: normalized.placementLocation,
      date_sampled: normalized.dateSampled,
      time_sampled: normalized.timeSampled,
      technician_name: normalized.technicianName,
      weather_condition: normalized.weatherCondition,
      mix_design_number: normalized.mixDesignNumber,
      batch_plant_supplier: normalized.batchPlantSupplier,
      batch_supplier: normalized.batchPlantSupplier,
      slump_spread_range: normalized.slumpSpreadRange,
      air_content_range: normalized.airContentRange,
      temperature_range: normalized.temperatureRange,
      unit_weight: normalized.unitWeight,
      strength_verification_required: normalized.strengthVerificationRequired,
      set_number: normalized.setNumber,
      lab_cylinders: normalized.labCylinders,
      field_cylinders: normalized.fieldCylinders,
      cylinder_ids: normalized.cylinderIds,
      break_ages: normalized.breakAges,
      strength_comments: normalized.strengthComments,
      test_records: normalized.testRecords.map((record) => ({
        ...record,
        placement_location: record.placementLocation,
        ticket_number: record.ticketNumber,
        truck_number: record.truckNumber,
        cubic_yards: record.cubicYards,
        time_batched: record.timeBatched,
        arrival_time: record.arrivalTime,
        time_tested: record.timeTested,
        air_content: record.airContent,
        concrete_temperature: record.concreteTemperature,
        water_added: record.waterAdded,
        unit_weight: record.unitWeight
      })),
      report_attachments: normalized.attachments
    };
  }

  const persistedReportRaw = (activity?.concreteReports || []).find((item) => item.id === reportId) || (activity?.concreteReports || [])[0];
  const persistedReport = persistedReportRaw ? normalizeConcreteReportFields(persistedReportRaw) : null;
  const [localReport, setLocalReport] = useState(null);
  const report = localReport?.id === persistedReport?.id ? localReport : persistedReport;
  const steps = ["Specifications", "Test Records", "Strength Verification", "Photos & Attachments", "Review"];
  const isReadOnly = [DAILY_LOG_STATUS.SUBMITTED, DAILY_LOG_STATUS.APPROVED].includes(log.status);
  const specMissingFields = [
    ["mixDesignNumber", "Mix Design Number"],
    ["batchPlantSupplier", "Batch Plant / Supplier"],
    ["slumpSpreadRange", "Slump / Spread Range"],
    ["airContentRange", "Air Content Range"],
    ["temperatureRange", "Temperature Range"]
  ].filter(([key]) => !String(report?.[key] || "").trim());
  const strengthMissingFields = report?.strengthVerificationRequired ? [
    ["setNumber", "Set Number"],
    ["labCylinders", "Lab Cylinders"],
    ["fieldCylinders", "Field Cylinders"],
    ["cylinderIds", "Cylinder IDs"]
  ].filter(([key]) => {
    if (key === "labCylinders") return !String(report?.labCylinders || report?.labSamples || "").trim();
    if (key === "fieldCylinders") return !String(report?.fieldCylinders || report?.fieldSamples || "").trim();
    return !String(report?.[key] || "").trim();
  }) : [];
  const requiredSpecMissing = specMissingFields.length > 0;
  const testRecordsComplete = (report?.testRecords || []).length > 0;
  const strengthComplete = strengthMissingFields.length === 0;
  const attachmentCount = (report?.attachments || []).filter((attachment) => attachment.attachmentType !== "photo").length;
  const photoCount = (report?.attachments || []).filter((attachment) => attachment.attachmentType === "photo").length;
  const stepComplete = [
    !requiredSpecMissing,
    testRecordsComplete,
    strengthComplete,
    true,
    !requiredSpecMissing && testRecordsComplete && strengthComplete
  ];
  const missingDetails = {
    Specifications: specMissingFields.map(([, label]) => label),
    "Test Records": testRecordsComplete ? [] : ["At least 1 test record"],
    "Strength Verification": strengthMissingFields.map(([, label]) => label),
    "Photos & Attachments": []
  };
  const completenessItems = [
    ["Specifications", !requiredSpecMissing, report?.mixDesignNumber || report?.batchPlantSupplier || report?.slumpSpreadRange || report?.airContentRange || report?.temperatureRange ? "started" : "not-started"],
    ["Test Records", testRecordsComplete, (report?.testRecords || []).length ? "started" : "not-started"],
    ["Strength Verification", strengthComplete, report?.strengthVerificationRequired ? "started" : "complete"],
    ["Photos & Attachments", true, (report?.attachments || []).length ? "started" : "complete"]
  ];
  const reportReady = completenessItems.every(([, complete]) => complete);
  const statusTone = {
    draft: "border-blue-200 bg-blue-50 text-blue-800",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    returned: "border-amber-200 bg-amber-50 text-amber-800",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-800"
  }[String(report?.status || "draft").toLowerCase()] || "border-slate-200 bg-slate-50 text-slate-700";

  function reviewDisplayValue(value, required = false) {
    const text = String(value ?? "").trim();
    if (text) return text;
    return required ? "Missing Required Data" : "Not Provided";
  }

  function invalidInputClass(key) {
    return `${inputClass()} ${fieldErrors[key] ? "border-rose-300 bg-rose-50 focus:border-rose-600 focus:ring-rose-100" : ""}`;
  }

  function setFieldRef(key, node) {
    if (node) fieldRefs.current[key] = node;
  }

  function focusFirstInvalid(keys = []) {
    const firstKey = keys.find((key) => fieldRefs.current[key]);
    if (!firstKey) return;
    window.setTimeout(() => {
      fieldRefs.current[firstKey]?.scrollIntoView({ behavior: "smooth", block: "center" });
      fieldRefs.current[firstKey]?.focus?.();
    }, 0);
  }

  function applyFieldErrors(missingFields = []) {
    const nextErrors = missingFields.reduce((acc, [key]) => ({ ...acc, [key]: "Required field" }), {});
    setFieldErrors((previous) => ({ ...previous, ...nextErrors }));
    focusFirstInvalid(missingFields.map(([key]) => key));
  }

  function clearFieldError(key) {
    if (!fieldErrors[key]) return;
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  function completenessIcon(complete, started) {
    if (complete) return { icon: "✓", label: "Complete", className: "text-emerald-700" };
    if (started === "not-started") return { icon: "○", label: "Not Started", className: "text-slate-500" };
    return { icon: "⚠", label: "Missing Required Data", className: "text-amber-700" };
  }

  function validateStep(index = activeStep) {
    if (index === 0 && requiredSpecMissing) {
      applyFieldErrors(specMissingFields);
      setValidationMessage("");
      setFinishAttempted(true);
      return false;
    }
    if (index === 1 && !testRecordsComplete) {
      setValidationMessage("Add at least one test record before continuing.");
      return false;
    }
    if (index === 2 && !strengthComplete) {
      applyFieldErrors(strengthMissingFields);
      setValidationMessage("");
      return false;
    }
    setValidationMessage("");
    return true;
  }

  function goToStep(index) {
    if (index <= activeStep) {
      const { savedReport } = getSavedReportById();
      if (savedReport) setLocalReport(savedReport);
      setActiveStep(index);
      setValidationMessage("");
      return;
    }
    if (index === activeStep + 1 && validateStep(activeStep)) {
      const { savedReport } = getSavedReportById();
      if (savedReport) setLocalReport(savedReport);
      setActiveStep(index);
    }
  }

  function nextStep() {
    if (validateStep(activeStep)) {
      const { savedReport } = getSavedReportById();
      if (savedReport) setLocalReport(savedReport);
      setActiveStep(Math.min(steps.length - 1, activeStep + 1));
    }
  }

  function updateReport(patch) {
    if (!activity || !report || isReadOnly) return;
    setIsSaving(true);
    const savedLogs = getDailyLogs();
    const latestLog = savedLogs.find((item) => item.id === log.id) || log;
    const latestActivity = (latestLog.activities || []).find((item) => item.id === activity.id) || activity;
    const latestReport = normalizeConcreteReportFields((latestActivity.concreteReports || []).find((item) => item.id === report.id) || report);
    const nextReport = prepareConcreteReportForSave({ ...latestReport, ...report, ...patch, updatedAt: new Date().toISOString() });
    console.info("[Concrete Report Save] report_id", nextReport.id);
    console.info("[Concrete Report Save] payload", nextReport);
    setLocalReport(nextReport);
    const nextLog = saveDailyLog({
      ...latestLog,
      activities: (latestLog.activities || []).map((item) => (
        item.id === latestActivity.id
          ? {
              ...item,
              concreteReports: (item.concreteReports || []).map((currentReport) => (
                currentReport.id === nextReport.id ? nextReport : currentReport
              )),
              updatedAt: new Date().toISOString()
            }
          : item
      )),
      updatedAt: new Date().toISOString()
    });
    const savedReport = (nextLog.activities || [])
      .find((item) => item.id === latestActivity.id)
      ?.concreteReports?.find((item) => item.id === nextReport.id);
    console.info("[Concrete Report Save] database response", savedReport || null);
    onChange(nextLog);
    setSavedAt(new Date().toLocaleTimeString());
    window.setTimeout(() => setIsSaving(false), 250);
  }

  function saveDraft() {
    updateReport({ status: "draft" });
  }

  async function finishReport() {
    if (!report) return;
    setFinishAttempted(true);
    if (requiredSpecMissing) {
      setActiveStep(0);
      setValidationMessage("Complete all required specification fields before finishing the report.");
      return;
    }
    if (!testRecordsComplete) {
      setActiveStep(1);
      setValidationMessage("Add at least one test record before finishing the report.");
      return;
    }
    if (!strengthComplete) {
      setActiveStep(2);
      setValidationMessage("Complete required strength verification fields before finishing the report.");
      return;
    }
    if (!reportReady) {
      setValidationMessage("Complete required sections before finishing report.");
      return;
    }
    const completedAt = new Date().toISOString();
    let pdfPatch;
    try {
      pdfPatch = await generateAndUploadConcreteReportPdf(log, activity, { ...report, status: "completed", completedAt });
    } catch (error) {
      pdfPatch = {
        pdfGenerationStatus: "failed",
        pdf_generation_status: "failed",
        pdfGenerationFailureReason: error.message || "PDF storage configuration issue. Please contact administrator.",
        pdf_generation_failure_reason: error.message || "PDF storage configuration issue. Please contact administrator."
      };
    }
    updateReport({ status: "completed", completedAt, ...pdfPatch });
    onBack();
  }

  function handleExit() {
    if (!savedAt && !isReadOnly) {
      const shouldExit = window.confirm("Exit without saving this report?");
      if (!shouldExit) return;
    }
    onBack();
  }

  function addTestRecord() {
    const nextRecord = {
      id: crypto.randomUUID(),
      ticketNumber: "",
      truckNumber: "",
      cubicYards: "",
      timeBatched: "",
      arrivalTime: "",
      timeTested: "",
      placementLocation: activity.location || report.placementLocation || "",
      slump: "",
      airContent: "",
      concreteTemperature: "",
      waterAdded: "",
      unitWeight: "",
      comments: ""
    };
    updateReport({ testRecords: [...(report.testRecords || []), nextRecord], status: "draft" });
  }

  function updateTestRecord(recordId, patch) {
    updateReport({
      testRecords: (report.testRecords || []).map((record) => (
        record.id === recordId ? { ...record, ...patch } : record
      )),
      status: "draft"
    });
  }

  function deleteTestRecord(recordId) {
    updateReport({ testRecords: (report.testRecords || []).filter((record) => record.id !== recordId), status: "draft" });
  }

  function copyPreviousRecord(index) {
    const records = report.testRecords || [];
    if (index <= 0 || !records[index - 1]) return;
    const previous = records[index - 1];
    const copy = {
      ...previous,
      id: crypto.randomUUID(),
      comments: previous.comments || ""
    };
    updateReport({ testRecords: [...records.slice(0, index), copy, ...records.slice(index)], status: "draft" });
  }

  function duplicateTestRecord(index) {
    const records = report.testRecords || [];
    if (!records[index]) return;
    const copy = {
      ...records[index],
      id: crypto.randomUUID()
    };
    updateReport({ testRecords: [...records.slice(0, index + 1), copy, ...records.slice(index + 1)], status: "draft" });
  }

  function createReportAttachment(file, attachmentType) {
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const objectUrl = URL.createObjectURL(file);
    return {
      id: crypto.randomUUID(),
      companyId: log.companyId || "company",
      projectId: log.projectId || "project",
      dailyLogId: log.id,
      activityId,
      reportId: report.id,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSize: file.size,
      storagePath: `${log.companyId || "company"}/${log.projectId || "project"}/${log.id}/${activityId}/report_${report.id}/${Date.now()}-${safeName}`,
      attachmentType,
      uploadedBy: log.technicianName || "",
      uploadStatus: "pending_sync",
      uploadProgress: 100,
      objectUrl,
      dataUrl: "",
      previewUrl: file.type?.startsWith("image/") ? objectUrl : "",
      createdAt: new Date().toISOString()
    };
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }

  async function addAttachments(files, attachmentType) {
    if (isReadOnly) return;
    const valid = files.filter((file) => isAllowedDailyLogAttachment(file, attachmentType));
    if (valid.length !== files.length) {
      window.alert("Some files were skipped. Only photos, PDF, DOC, DOCX, XLS, and XLSX files up to 25 MB are allowed.");
    }
    if (!valid.length) return;
    const nextAttachments = await Promise.all(valid.map(async (file) => {
      const attachment = createReportAttachment(file, attachmentType);
      const dataUrl = await readFileAsDataUrl(file);
      return {
        ...attachment,
        dataUrl,
        previewUrl: file.type?.startsWith("image/") ? dataUrl || attachment.previewUrl : attachment.previewUrl
      };
    }));
    updateReport({ attachments: [...(report.attachments || []), ...nextAttachments], status: "draft" });
  }

  function removeAttachment(attachmentId) {
    if (isReadOnly) return;
    updateReport({ attachments: (report.attachments || []).filter((attachment) => attachment.id !== attachmentId), status: "draft" });
  }

  async function viewReportPdf(download = false) {
    try {
      await openConcreteReportPdf(report, {
        download,
        fileName: `${report.dfrNumber || report.dfr_number || "Concrete-Report"}.pdf`
      });
    } catch (error) {
      window.alert(error.message || "PDF is still being generated. Please try again in a few seconds.");
    }
  }

  function getSavedReportById() {
    const savedLog = getDailyLogs().find((item) => item.id === log.id);
    const savedActivity = (savedLog?.activities || []).find((item) => item.id === activityId);
    const rawSavedReport = (savedActivity?.concreteReports || []).find((item) => item.id === reportId);
    const savedReport = rawSavedReport ? normalizeConcreteReportFields(rawSavedReport) : null;
    return { savedLog, savedActivity, savedReport };
  }

  function logReviewPayload(reportToReview = report) {
    if (activeStep !== 4 || !reportToReview) return;
    const attachments = reportToReview.attachments || [];
    console.info("[Concrete Report Review] report_id", reportToReview.id);
    console.info("[Concrete Report Review] report_information payload", {
      placementLocation: reportToReview.placementLocation,
      dateSampled: reportToReview.dateSampled || log.date,
      timeSampled: reportToReview.timeSampled,
      technicianName: reportToReview.technicianName || log.technicianName,
      weatherCondition: reportToReview.weatherCondition || log.weatherCondition || log.weather,
      temperature: reportToReview.temperature || log.temperature || log.maxTemperature || log.minTemperature
    });
    console.info("[Concrete Report Review] specifications payload", {
      mixDesignNumber: reportToReview.mixDesignNumber,
      batchPlantSupplier: reportToReview.batchPlantSupplier,
      slumpSpreadRange: reportToReview.slumpSpreadRange,
      airContentRange: reportToReview.airContentRange,
      temperatureRange: reportToReview.temperatureRange,
      unitWeight: reportToReview.unitWeight
    });
    console.info("[Concrete Report Review] test_records payload", reportToReview.testRecords || []);
    console.info("[Concrete Report Review] strength payload", {
      strengthVerificationRequired: reportToReview.strengthVerificationRequired,
      setNumber: reportToReview.setNumber,
      labCylinders: reportToReview.labCylinders || reportToReview.labSamples,
      fieldCylinders: reportToReview.fieldCylinders || reportToReview.fieldSamples,
      cylinderIds: reportToReview.cylinderIds,
      breakAges: reportToReview.breakAges,
      comments: reportToReview.strengthComments
    });
    console.info("[Concrete Report Review] attachments payload", attachments);
  }

  useEffect(() => {
    setLocalReport(persistedReport || null);
    if (persistedReport) {
      console.info("[Concrete Report Load] report_id", persistedReport.id);
      console.info("[Concrete Report Load] loaded values", {
        placement_location: persistedReport.placementLocation,
        time_sampled: persistedReport.timeSampled,
        mix_design_number: persistedReport.mixDesignNumber,
        batch_supplier: persistedReport.batchPlantSupplier,
        test_records: persistedReport.testRecords,
        strength_verification_required: persistedReport.strengthVerificationRequired,
        attachments: persistedReport.attachments
      });
    }
  }, [persistedReport?.id]);

  useEffect(() => {
    if (activeStep !== 4 || !reportId) return;
    const { savedReport } = getSavedReportById();
    if (savedReport) {
      setLocalReport(savedReport);
      logReviewPayload(savedReport);
      return;
    }
    console.info("[Concrete Report Review] report_id", reportId);
    console.info("[Concrete Report Review] saved report payload not found");
    logReviewPayload(report);
  }, [activeStep, reportId, log.id, activityId]);

  useEffect(() => {
    if (isReadOnly || !activity || !report) return undefined;
    const timer = window.setInterval(() => {
      updateReport({ autosavedAt: new Date().toISOString() });
    }, 30000);
    return () => window.clearInterval(timer);
  }, [isReadOnly, activity?.id, report?.id]);

  if (!activity || !report) {
    return (
      <section className={cardClass()}>
        <button type="button" onClick={onBack} className="mb-4 text-sm font-bold text-blue-700">← Back To Daily Log</button>
        <h2 className="text-xl font-bold text-slate-950">Concrete Report</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">Report context was not found. Return to the Daily Log and add the report again.</p>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-4">
      <section className={cardClass()}>
        <button type="button" onClick={handleExit} className="mb-4 text-sm font-bold text-blue-700">← Back To Daily Log</button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Concrete Report</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">{log.projectName} • {activity.title || "Activity"}</p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${statusTone}`}>Status: {report.status || "draft"}</span>
            {(report.pdfGenerationStatus || report.pdf_generation_status) === "generated" && (
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => viewReportPdf(false)} className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800">View PDF</button>
                <button type="button" onClick={() => viewReportPdf(true)} className="min-h-9 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white">Download PDF</button>
              </div>
            )}
            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
              <span className={`mr-2 ${isSaving ? "text-amber-500" : "text-emerald-600"}`}>●</span> {isSaving ? "Saving..." : savedAt ? `Saved ${savedAt}` : "Saved"}
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-3 sm:hidden">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Step {activeStep + 1} of {steps.length}</p>
          <p className="mt-1 text-lg font-bold text-slate-950">{steps[activeStep]}</p>
        </div>
        <div className="mt-4 hidden gap-2 overflow-x-auto sm:flex">
          {steps.map((step, index) => (
            <button
              key={step}
              type="button"
              onClick={() => goToStep(index)}
              disabled={index > activeStep + 1}
              className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45 ${
                activeStep === index ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              {index < activeStep && stepComplete[index] ? "✓" : activeStep === index ? "●" : "○"} {step}
            </button>
          ))}
        </div>
        {validationMessage && <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{validationMessage}</p>}
      </section>

      {activeStep === 0 && (
        <section className={cardClass()}>
          <h3 className="text-lg font-bold text-slate-950">Specifications</h3>
          {finishAttempted && requiredSpecMissing && <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">Complete all required specification fields before finishing the report.</p>}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Mix Design Number *"><input ref={(node) => setFieldRef("mixDesignNumber", node)} disabled={isReadOnly} value={report.mixDesignNumber || ""} onChange={(event) => { clearFieldError("mixDesignNumber"); updateReport({ mixDesignNumber: event.target.value, status: "draft" }); }} className={invalidInputClass("mixDesignNumber")} placeholder="PRT-MIX-3B" />{fieldErrors.mixDesignNumber && <p className="mt-2 text-xs font-bold text-rose-700">{fieldErrors.mixDesignNumber}</p>}<p className="mt-2 text-xs font-semibold text-slate-500">Example: PRT-MIX-3B</p></Field>
          <Field label="Batch Plant / Supplier *"><input ref={(node) => setFieldRef("batchPlantSupplier", node)} disabled={isReadOnly} value={report.batchPlantSupplier || ""} onChange={(event) => { clearFieldError("batchPlantSupplier"); updateReport({ batchPlantSupplier: event.target.value, status: "draft" }); }} className={invalidInputClass("batchPlantSupplier")} placeholder="ABC Plant / XYZ Concrete" />{fieldErrors.batchPlantSupplier && <p className="mt-2 text-xs font-bold text-rose-700">{fieldErrors.batchPlantSupplier}</p>}<p className="mt-2 text-xs font-semibold text-slate-500">Example: ABC Plant / XYZ Concrete</p></Field>
          <Field label="Slump / Spread Range *"><input ref={(node) => setFieldRef("slumpSpreadRange", node)} disabled={isReadOnly} value={report.slumpSpreadRange || ""} onChange={(event) => { clearFieldError("slumpSpreadRange"); updateReport({ slumpSpreadRange: event.target.value, status: "draft" }); }} className={invalidInputClass("slumpSpreadRange")} placeholder="5-9 in / N/A" />{fieldErrors.slumpSpreadRange && <p className="mt-2 text-xs font-bold text-rose-700">{fieldErrors.slumpSpreadRange}</p>}<p className="mt-2 text-xs font-semibold text-slate-500">Example: 5-9 in / N/A</p></Field>
          <Field label="Air Content Range *"><input ref={(node) => setFieldRef("airContentRange", node)} disabled={isReadOnly} value={report.airContentRange || ""} onChange={(event) => { clearFieldError("airContentRange"); updateReport({ airContentRange: event.target.value, status: "draft" }); }} className={invalidInputClass("airContentRange")} placeholder="3-6 %" />{fieldErrors.airContentRange && <p className="mt-2 text-xs font-bold text-rose-700">{fieldErrors.airContentRange}</p>}<p className="mt-2 text-xs font-semibold text-slate-500">Example: 3-6 %</p></Field>
          <Field label="Temperature Range *"><input ref={(node) => setFieldRef("temperatureRange", node)} disabled={isReadOnly} value={report.temperatureRange || ""} onChange={(event) => { clearFieldError("temperatureRange"); updateReport({ temperatureRange: event.target.value, status: "draft" }); }} className={invalidInputClass("temperatureRange")} placeholder="50°F - 90°F" />{fieldErrors.temperatureRange && <p className="mt-2 text-xs font-bold text-rose-700">{fieldErrors.temperatureRange}</p>}<p className="mt-2 text-xs font-semibold text-slate-500">Example: 50°F - 90°F</p></Field>
          <Field label="Unit Weight (Optional)"><input disabled={isReadOnly} value={report.unitWeight || ""} onChange={(event) => updateReport({ unitWeight: event.target.value, status: "draft" })} className={inputClass()} placeholder="Optional" /></Field>
        </div>
        </section>
      )}

      {activeStep === 1 && (
        <section className={cardClass()}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-bold text-slate-950">Test Records</h3>
            {!isReadOnly && <button type="button" onClick={addTestRecord} className="min-h-10 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white">Add Record</button>}
          </div>
          <div className="mt-4 space-y-4">
            {(report.testRecords || []).map((record, index) => (
              <div key={record.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-bold text-slate-950">Record {index + 1}</h4>
                  {!isReadOnly && (
                    <div className="flex flex-wrap justify-end gap-2">
                      {index > 0 && <button type="button" onClick={() => copyPreviousRecord(index)} className="text-sm font-bold text-blue-700">Copy Previous Record</button>}
                      <button type="button" onClick={() => duplicateTestRecord(index)} className="text-sm font-bold text-blue-700">Duplicate Record</button>
                      <button type="button" onClick={() => deleteTestRecord(record.id)} className="text-sm font-bold text-rose-700">Delete Record</button>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  {[
                    ["placementLocation", "Placement Location"],
                    ["ticketNumber", "Ticket Number"],
                    ["truckNumber", "Truck Number"],
                    ["cubicYards", "Cubic Yards"],
                    ["timeBatched", "Time Batched"],
                    ["arrivalTime", "Arrival Time"],
                    ["timeTested", "Time Tested"],
                    ["slump", "Slump"],
                    ["airContent", "Air Content"],
                    ["concreteTemperature", "Concrete Temperature"],
                    ["waterAdded", "Water Added (Optional)"],
                    ["unitWeight", "Unit Weight (Optional)"]
                  ].map(([key, label]) => (
                    <Field key={key} label={label}><input disabled={isReadOnly} value={record[key] || ""} onChange={(event) => updateTestRecord(record.id, { [key]: event.target.value })} className={inputClass()} /></Field>
                  ))}
                  <div className="md:col-span-3">
                    <Field label="Comments"><textarea disabled={isReadOnly} value={record.comments || ""} onChange={(event) => updateTestRecord(record.id, { comments: event.target.value })} rows={3} className={`${inputClass()} py-3`} /></Field>
                  </div>
                </div>
              </div>
            ))}
            {!(report.testRecords || []).length && <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No test records added yet.</p>}
          </div>
        </section>
      )}

      {activeStep === 2 && (
        <section className={cardClass()}>
          <h3 className="text-lg font-bold text-slate-950">Strength Verification</h3>
          <div className="mt-4 max-w-sm">
            <Field label="Strength Verification Required?">
              <select disabled={isReadOnly} value={report.strengthVerificationRequired ? "yes" : "no"} onChange={(event) => updateReport({ strengthVerificationRequired: event.target.value === "yes", status: "draft" })} className={inputClass()}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </Field>
          </div>
          {report.strengthVerificationRequired && (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                ["setNumber", "Set Number"],
                ["labCylinders", "Lab Cylinders"],
                ["fieldCylinders", "Field Cylinders"],
                ["cylinderIds", "Cylinder IDs"],
                ["breakAges", "Break Ages"]
              ].map(([key, label]) => {
                const value = key === "labCylinders" ? report.labCylinders || report.labSamples || "" : key === "fieldCylinders" ? report.fieldCylinders || report.fieldSamples || "" : report[key] || "";
                return (
                  <Field key={key} label={`${label}${["setNumber", "labCylinders", "fieldCylinders", "cylinderIds"].includes(key) ? " *" : ""}`}>
                    <input ref={(node) => setFieldRef(key, node)} disabled={isReadOnly} value={value} onChange={(event) => { clearFieldError(key); updateReport({ [key]: event.target.value, status: "draft" }); }} className={invalidInputClass(key)} />
                    {fieldErrors[key] && <p className="mt-2 text-xs font-bold text-rose-700">{fieldErrors[key]}</p>}
                  </Field>
                );
              })}
              <div className="md:col-span-2">
                <Field label="Comments"><textarea disabled={isReadOnly} value={report.strengthComments || ""} onChange={(event) => updateReport({ strengthComments: event.target.value, status: "draft" })} rows={4} className={`${inputClass()} py-3`} /></Field>
              </div>
            </div>
          )}
        </section>
      )}

      {activeStep === 3 && (
        <section className={cardClass()}>
          <h3 className="text-lg font-bold text-slate-950">Photos & Attachments</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">Photos: {photoCount}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">Attachments: {attachmentCount}</span>
          </div>
          <PhotosAttachmentsSection
            attachments={report.attachments || []}
            onAddFiles={addAttachments}
            onRemove={removeAttachment}
            onRetry={() => {}}
            onPreview={setPreviewAttachment}
          />
        </section>
      )}

      {activeStep === 4 && (
        <section className={cardClass()}>
          <h3 className="text-lg font-bold text-slate-950">Review</h3>
          <div className={`mt-4 rounded-2xl border p-4 ${reportReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-base font-bold text-slate-950">Report Completeness Check</h4>
                <p className={`mt-1 text-sm font-bold ${reportReady ? "text-emerald-800" : "text-amber-900"}`}>
                  {reportReady ? "Ready For Submission" : "Complete the missing items below before finishing the report."}
                </p>
              </div>
              <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${reportReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                {reportReady ? "Ready" : "Needs Attention"}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {completenessItems.map(([label, complete, started]) => {
                const status = completenessIcon(complete, started);
                return (
                  <div key={label} className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-800">
                    <span className={status.className}>{status.icon}</span> {label}
                    <p className={`mt-1 text-xs font-bold ${status.className}`}>{status.label}</p>
                    {!complete && missingDetails[label]?.length > 0 && (
                      <p className="mt-1 text-xs font-semibold text-slate-600">Missing {missingDetails[label].join(", ")}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {[
            {
              title: "Specifications",
              step: 0,
              rows: [
                ["Mix Design Number", report.mixDesignNumber, true],
                ["Batch Plant / Supplier", report.batchPlantSupplier, true],
                ["Slump / Spread Range", report.slumpSpreadRange, true],
                ["Air Content Range", report.airContentRange, true],
                ["Temperature Range", report.temperatureRange, true],
                ["Unit Weight", report.unitWeight, false]
              ]
            },
            {
              title: "Records & Attachments",
              step: 1,
              rows: [
                ["Test Records", (report.testRecords || []).length, true],
                ["Strength Verification", report.strengthVerificationRequired ? "Yes" : "No", false],
                ["Photos", photoCount, false],
                ["Attachments", attachmentCount, false],
                ["PDF Status", report.pdfGenerationStatus || report.pdf_generation_status || "Pending", false]
              ]
            }
          ].map((section) => (
            <div key={section.title} className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-base font-bold text-slate-950">{section.title}</h4>
                <button type="button" onClick={() => setActiveStep(section.step)} className="text-sm font-bold text-blue-700">Edit Section</button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {section.rows.map(([label, value, required]) => {
                  const displayValue = reviewDisplayValue(value, required);
                  const missing = displayValue === "Missing Required Data";
                  return (
                  <div key={label} className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
                    <p className={`mt-1 text-sm font-bold ${missing ? "text-amber-800" : "text-slate-900"}`}>{displayValue}</p>
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
          {(report.testRecords || []).length > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-base font-bold text-slate-950">Test Record Details</h4>
              <div className="mt-3 space-y-3">
                {(report.testRecords || []).map((record, index) => (
                  <div key={record.id || index} className="rounded-2xl bg-white p-3">
                    <p className="text-sm font-bold text-slate-950">Record {index + 1}</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                      {[
                        ["Placement Location", record.placementLocation, false],
                        ["Ticket Number", record.ticketNumber, false],
                        ["Truck Number", record.truckNumber, false],
                        ["Cubic Yards", record.cubicYards, false],
                        ["Time Batched", record.timeBatched, false],
                        ["Arrival Time", record.arrivalTime, false],
                        ["Time Tested", record.timeTested, false],
                        ["Slump", record.slump, false],
                        ["Air Content", record.airContent, false],
                        ["Concrete Temperature", record.concreteTemperature, false],
                        ["Water Added", record.waterAdded, false],
                        ["Unit Weight", record.unitWeight, false],
                        ["Comments", record.comments, false]
                      ].map(([label, value, required]) => (
                        <div key={label} className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
                          <p className="mt-1 text-sm font-bold text-slate-900">{reviewDisplayValue(value, required)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {report.strengthVerificationRequired && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-base font-bold text-slate-950">Strength Verification Details</h4>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {[
                  ["Set Number", report.setNumber, true],
                  ["Lab Cylinders", report.labCylinders || report.labSamples, true],
                  ["Field Cylinders", report.fieldCylinders || report.fieldSamples, true],
                  ["Cylinder IDs", report.cylinderIds, true],
                  ["Break Ages", report.breakAges, false],
                  ["Comments", report.strengthComments, false]
                ].map(([label, value, required]) => {
                  const displayValue = reviewDisplayValue(value, required);
                  const missing = displayValue === "Missing Required Data";
                  return (
                    <div key={label} className="rounded-2xl bg-white p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
                      <p className={`mt-1 text-sm font-bold ${missing ? "text-amber-800" : "text-slate-900"}`}>{displayValue}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="max-h-[94vh] w-full max-w-4xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-slate-950">{previewAttachment.fileName}</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">{previewAttachment.fileType || "Attachment"}</p>
              </div>
              <button type="button" onClick={() => setPreviewAttachment(null)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800">Close</button>
            </div>
            <div className="max-h-[75vh] overflow-auto bg-slate-50 p-4">
              {previewAttachment.previewUrl || previewAttachment.objectUrl ? (
                previewAttachment.fileType?.includes("pdf") || /\.pdf$/i.test(previewAttachment.fileName || "") ? (
                  <iframe title={previewAttachment.fileName} src={previewAttachment.objectUrl || previewAttachment.previewUrl} className="h-[70vh] w-full rounded-xl border border-slate-200 bg-white" />
                ) : previewAttachment.fileType?.startsWith("image/") || previewAttachment.attachmentType === "photo" ? (
                  <img src={previewAttachment.previewUrl || previewAttachment.objectUrl} alt={previewAttachment.fileName} className="mx-auto max-h-[70vh] max-w-full rounded-xl object-contain" />
                ) : (
                  <p className="rounded-xl bg-white p-4 text-sm font-semibold text-slate-600">Preview is not available for this file type.</p>
                )
              ) : (
                <p className="rounded-xl bg-white p-4 text-sm font-semibold text-slate-600">Preview is not available until the file is synced.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm">
        {!reportReady && activeStep === steps.length - 1 && (
          <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
            Complete required sections before finishing report.
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setActiveStep(Math.max(0, activeStep - 1))} disabled={activeStep === 0} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 disabled:opacity-50">Back</button>
          {!isReadOnly && <button type="button" onClick={saveDraft} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Save Draft</button>}
          {activeStep < steps.length - 1 && <button type="button" onClick={nextStep} className="min-h-11 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white">Next</button>}
          {!isReadOnly && activeStep === steps.length - 1 && (
            <button
              type="button"
              onClick={finishReport}
              disabled={!reportReady}
              className="min-h-11 rounded-2xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              Finish Report
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function calculateAsphaltTestRecord(record = {}, group = {}) {
  const fieldDensity = toFiniteNumber(record.fieldDensity);
  const marshallValue = toFiniteNumber(group.marshallValue);
  const requiredCompaction = toFiniteNumber(group.requiredCompaction);
  const compactionPercent = fieldDensity !== null && marshallValue !== null && marshallValue > 0
    ? (fieldDensity / marshallValue) * 100
    : null;
  const result = compactionPercent !== null && requiredCompaction !== null
    ? (compactionPercent >= requiredCompaction ? "PASS" : "FAIL")
    : "";
  return {
    ...record,
    compactionPercent: compactionPercent === null ? "" : compactionPercent.toFixed(1),
    result,
    exceededLimit: compactionPercent !== null && compactionPercent > 102
  };
}

function calculateInfiltrationRate(record = {}) {
  const weight = toFiniteNumber(record.weightInfiltratedWater);
  const diameter = toFiniteNumber(record.insideDiameter);
  const time = toFiniteNumber(record.timeInfiltration);
  const rate = (weight !== null && diameter !== null && diameter > 0 && time !== null && time > 0)
    ? (126870 * weight) / (diameter * diameter * time)
    : null;
  return { ...record, infiltrationRate: rate === null ? "" : rate.toFixed(2) };
}

function getCompactionRecordMoistureRange(record = {}, materialType = "") {
  const correctedOptimum = toFiniteNumber(record.correctedOptimumMoisture ?? record.corrected_optimum_moisture);
  if (correctedOptimum === null || correctedOptimum <= 0) return null;
  if (String(materialType).toLowerCase() === "aggregate") {
    return { min: correctedOptimum - 2, max: correctedOptimum + 2 };
  }
  return { min: correctedOptimum * 0.8, max: correctedOptimum * 1.2 };
}

function formatCompactionRange(range) {
  return range ? `${range.min.toFixed(1)} - ${range.max.toFixed(1)}` : "-";
}

function calculateCompactionRecord(record = {}, reportOrMaterialType = "") {
  const reportContext = typeof reportOrMaterialType === "object" && reportOrMaterialType !== null ? reportOrMaterialType : {};
  // Each test record can carry its own material type (one row aggregate, another
  // soil); fall back to the report-level default when the record has none.
  const reportMaterialType = typeof reportOrMaterialType === "object" && reportOrMaterialType !== null
    ? (reportOrMaterialType.materialType || reportOrMaterialType.material_type || "")
    : reportOrMaterialType;
  const materialType = record.materialType || record.material_type || reportMaterialType;
  const wetDensity = toFiniteNumber(record.wetDensity ?? record.wet_density);
  const moistureUnitMass = toFiniteNumber(record.moistureUnitMass ?? record.moisture_unit_mass);
  const correctedMaximum = toFiniteNumber(reportContext.correctedMaximumDryDensity ?? reportContext.corrected_maximum_dry_density);
  const requiredDensity = toFiniteNumber(reportContext.percentMinimumDensityRequired ?? reportContext.percent_minimum_density_required);
  const dryDensity = wetDensity !== null && moistureUnitMass !== null ? wetDensity - moistureUnitMass : null;
  const moistureContent = moistureUnitMass !== null && dryDensity !== null && dryDensity > 0
    ? (moistureUnitMass / dryDensity) * 100
    : null;
  const percentDryDensity = dryDensity !== null && correctedMaximum !== null && correctedMaximum > 0
    ? (dryDensity / correctedMaximum) * 100
    : null;
  const moistureRange = getCompactionRecordMoistureRange(reportContext, materialType);
  const moistureOutOfRange = Boolean(moistureRange && moistureContent !== null && (moistureContent < moistureRange.min || moistureContent > moistureRange.max));
  const calculatedDensityResult = percentDryDensity !== null && requiredDensity !== null
    ? (moistureOutOfRange ? "RETEST" : (percentDryDensity >= requiredDensity ? "PASS" : "FAIL"))
    : "";
  const densityResult = record.resultOverridden || record.result_overridden
    ? (record.densityResult || record.density_result || calculatedDensityResult)
    : calculatedDensityResult;
  return {
    ...record,
    dryDensity: dryDensity === null ? "" : dryDensity.toFixed(1),
    dry_density: dryDensity === null ? "" : dryDensity.toFixed(1),
    moistureContent: moistureContent === null ? "" : moistureContent.toFixed(1),
    moisture_content: moistureContent === null ? "" : moistureContent.toFixed(1),
    percentDryDensity: percentDryDensity === null ? "" : percentDryDensity.toFixed(1),
    percent_dry_density: percentDryDensity === null ? "" : percentDryDensity.toFixed(1),
    moistureRange: formatCompactionRange(moistureRange),
    moisture_range: formatCompactionRange(moistureRange),
    moistureOutOfRange,
    moisture_out_of_range: moistureOutOfRange,
    densityResult,
    density_result: densityResult,
    calculatedDensityResult,
    calculated_density_result: calculatedDensityResult
  };
}

function getCompactionMoistureRange(report = {}) {
  const correctedOptimum = Number(report.correctedOptimumMoisture || report.corrected_optimum_moisture || 0);
  if (!Number.isFinite(correctedOptimum) || correctedOptimum <= 0) return "-";
  if (String(report.materialType || report.material_type).toLowerCase() === "aggregate") {
    return `${(correctedOptimum - 2).toFixed(1)} - ${(correctedOptimum + 2).toFixed(1)}`;
  }
  return `${(correctedOptimum * 0.8).toFixed(1)} - ${(correctedOptimum * 1.2).toFixed(1)}`;
}

// Spec fields are proctor-derived, so they belong to a material group (aggregate
// and soil have different proctors), not the whole report.
const COMPACTION_SPEC_FIELDS = [
  ["E. Maximum Dry Density (lbs/ft3)", "maximumDryDensity", "maximum_dry_density"],
  ["F. Percent Optimum Moisture (%)", "percentOptimumMoisture", "percent_optimum_moisture"],
  ["G. Percent of Plus #4 (4.75 mm) (%)", "percentPassingNo4", "percent_passing_no4"],
  ["H. Corrected Maximum Dry Density (lbs/ft3)", "correctedMaximumDryDensity", "corrected_maximum_dry_density"],
  ["I. Corrected Optimum Moisture (%)", "correctedOptimumMoisture", "corrected_optimum_moisture"],
  ["K. Percent Minimum Density Required (%)", "percentMinimumDensityRequired", "percent_minimum_density_required"]
];

function createMaterialGroup(seed = {}) {
  return {
    id: crypto.randomUUID(),
    materialType: "", material_type: "",
    materialName: "", material_name: "",
    maximumDryDensity: "", maximum_dry_density: "",
    percentOptimumMoisture: "", percent_optimum_moisture: "",
    percentPassingNo4: "", percent_passing_no4: "",
    correctedMaximumDryDensity: "", corrected_maximum_dry_density: "",
    correctedOptimumMoisture: "", corrected_optimum_moisture: "",
    percentMinimumDensityRequired: "", percent_minimum_density_required: "",
    testRecords: [],
    ...seed
  };
}

// Material groups are the editor's source of truth. Legacy reports stored a single
// material + specs + flat testRecords; wrap those into one group on first load.
function getReportMaterialGroups(report = {}) {
  if (Array.isArray(report.materialGroups) && report.materialGroups.length) return report.materialGroups;
  const hasLegacyData = (report.materialType || report.material_type)
    || (Array.isArray(report.testRecords) && report.testRecords.length)
    || (report.maximumDryDensity || report.maximum_dry_density);
  if (!hasLegacyData) return [];
  return [createMaterialGroup({
    materialType: report.materialType || "", material_type: report.material_type || "",
    materialName: report.materialName || "", material_name: report.material_name || "",
    maximumDryDensity: report.maximumDryDensity || "", maximum_dry_density: report.maximum_dry_density || "",
    percentOptimumMoisture: report.percentOptimumMoisture || "", percent_optimum_moisture: report.percent_optimum_moisture || "",
    percentPassingNo4: report.percentPassingNo4 || "", percent_passing_no4: report.percent_passing_no4 || "",
    correctedMaximumDryDensity: report.correctedMaximumDryDensity || "", corrected_maximum_dry_density: report.corrected_maximum_dry_density || "",
    correctedOptimumMoisture: report.correctedOptimumMoisture || "", corrected_optimum_moisture: report.corrected_optimum_moisture || "",
    percentMinimumDensityRequired: report.percentMinimumDensityRequired || "", percent_minimum_density_required: report.percent_minimum_density_required || "",
    testRecords: Array.isArray(report.testRecords) ? report.testRecords : []
  })];
}

// Recompute each group's records against its own specs, and flatten all records
// into report.testRecords (annotated with their group's material + specs) so the
// PDF, summary, and inline views keep working unchanged.
function normalizeCompactionGroups(groups = []) {
  const computedGroups = groups.map((group) => ({
    ...group,
    testRecords: (group.testRecords || []).map((record) => calculateCompactionRecord(record, group))
  }));
  let testNo = 0;
  const flatRecords = computedGroups.flatMap((group) =>
    (group.testRecords || []).map((record) => {
      testNo += 1;
      return {
        ...record,
        testNo,
        test_no: testNo,
        materialGroupId: group.id,
        materialType: group.materialType || "", material_type: group.material_type || group.materialType || "",
        materialName: group.materialName || "", material_name: group.material_name || group.materialName || "",
        maximumDryDensity: group.maximumDryDensity || "", maximum_dry_density: group.maximum_dry_density || "",
        correctedMaximumDryDensity: group.correctedMaximumDryDensity || "", corrected_maximum_dry_density: group.corrected_maximum_dry_density || "",
        correctedOptimumMoisture: group.correctedOptimumMoisture || "", corrected_optimum_moisture: group.corrected_optimum_moisture || "",
        percentMinimumDensityRequired: group.percentMinimumDensityRequired || "", percent_minimum_density_required: group.percent_minimum_density_required || ""
      };
    })
  );
  const summaryType = computedGroups.length === 1
    ? (computedGroups[0].materialType || "")
    : (computedGroups.length > 1 ? "Multiple" : "");
  const summaryName = computedGroups.length === 1
    ? (computedGroups[0].materialName || "")
    : computedGroups.map((group) => group.materialName).filter(Boolean).join(", ");
  return { computedGroups, flatRecords, summaryType, summaryName };
}

function CompactionReportPage({ log, activityId, reportId, onChange, onBack }) {
  const activity = (log.activities || []).find((item) => item.id === activityId);
  const persistedReport = (activity?.reports || []).find((item) => item.id === reportId);
  const [localReport, setLocalReport] = useState(persistedReport || null);
  const report = localReport || persistedReport;
  const isReadOnly = [DAILY_LOG_STATUS.SUBMITTED, DAILY_LOG_STATUS.APPROVED].includes(log.status);

  // Start with one material ready so the technician can pick a type and add test
  // data immediately, instead of facing an empty page that requires "Add Material
  // Type" first. Seeded in local state only — persisted once they enter data.
  useEffect(() => {
    const current = localReport || persistedReport;
    if (!isReadOnly && current && getReportMaterialGroups(current).length === 0) {
      setLocalReport({ ...current, materialGroups: [createMaterialGroup()] });
    }
  }, [reportId]);
  const isStandardizationNo = String(report?.standardizedGauge || report?.standardized_gauge || "").toLowerCase() === "no";
  // The gauge is out of calibration if its calibration due date has already passed.
  const calibrationDueValue = report?.calibrationDueDate || report?.calibration_due_date || "";
  const isCalibrationExpired = (() => {
    if (!calibrationDueValue) return false;
    const due = new Date(`${calibrationDueValue}T00:00:00`);
    if (Number.isNaN(due.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  })();
  const requiredMissing = [
    ["serialNumber", "Serial Number"],
    ["gaugeModel", "Gauge Model"],
    ["calibrationDueDate", "Calibration Due Date"],
    ["standardizedGauge", "Gauge Standardization"],
    ["standardDensity", "Standard Density"],
    ["standardMoisture", "Standard Moisture"]
  ].filter(([key]) => !String(report?.[key] || "").trim());
  const materialGroups = report ? getReportMaterialGroups(report) : [];
  // Every material group must name its material and hold at least one test record.
  const groupsIncomplete = materialGroups.filter((group) =>
    !String(group.materialType || group.material_type || "").trim() ||
    !String(group.materialName || group.material_name || "").trim() ||
    !(group.testRecords || []).length
  );
  const totalTestRecords = materialGroups.reduce((sum, group) => sum + (group.testRecords || []).length, 0);
  const canComplete = report && requiredMissing.length === 0 && !isStandardizationNo
    && materialGroups.length > 0 && groupsIncomplete.length === 0 && totalTestRecords > 0;

  if (!activity || !report) {
    return (
      <section className={cardClass()}>
        <h1 className="text-xl font-bold text-slate-950">Compaction Report Not Found</h1>
        <button type="button" onClick={onBack} className="mt-4 min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold">Back</button>
      </section>
    );
  }

  // Persist a set of material groups: recompute each group's records against its
  // own specs, then flatten into report.testRecords for downstream consumers.
  function saveGroups(nextGroups, extraPatch = {}) {
    const { computedGroups, flatRecords, summaryType, summaryName } = normalizeCompactionGroups(nextGroups);
    const normalized = {
      ...report,
      ...extraPatch,
      materialGroups: computedGroups,
      testRecords: flatRecords,
      materialType: summaryType,
      material_type: summaryType,
      materialName: summaryName,
      material_name: summaryName,
      updatedAt: new Date().toISOString()
    };
    setLocalReport(normalized);
    const nextLog = saveDailyLog({
      ...log,
      activities: (log.activities || []).map((item) => (
        item.id === activityId
          ? {
              ...item,
              reports: (item.reports || []).map((currentReport) => (
                currentReport.id === normalized.id ? normalized : currentReport
              )),
              updatedAt: new Date().toISOString()
            }
          : item
      )),
      updatedAt: new Date().toISOString()
    });
    onChange(nextLog);
  }

  function updateReport(patch) {
    if (isReadOnly) return;
    saveGroups(getReportMaterialGroups({ ...report, ...patch }), { ...patch, status: "draft" });
  }

  function persistGroups(nextGroups) {
    if (isReadOnly) return;
    saveGroups(nextGroups, { status: "draft" });
  }

  function addMaterialGroup() {
    persistGroups([...materialGroups, createMaterialGroup()]);
  }

  function updateMaterialGroup(groupId, patch) {
    persistGroups(materialGroups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)));
  }

  function deleteMaterialGroup(groupId) {
    persistGroups(materialGroups.filter((group) => group.id !== groupId));
  }

  function newTestRecord() {
    return {
      id: crypto.randomUUID(),
      location: activity.location || "",
      stationFt: "", station_ft: "",
      referenceToCenterLine: "", reference_to_center_line: "",
      elevation: "",
      compactedDepth: "", compacted_depth: "",
      methodOfCompaction: "", method_of_compaction: "",
      wetDensity: "", wet_density: "",
      moistureUnitMass: "", moisture_unit_mass: "",
      dryDensity: "", dry_density: "",
      moistureContent: "", moisture_content: "",
      densityResult: "", density_result: "",
      resultOverridden: false, result_overridden: false,
      testStatus: "Pending", test_status: "Pending",
      remarks: ""
    };
  }

  function addTestRecord(groupId) {
    persistGroups(materialGroups.map((group) => (
      group.id === groupId ? { ...group, testRecords: [...(group.testRecords || []), newTestRecord()] } : group
    )));
  }

  function updateTestRecord(groupId, recordId, patch) {
    persistGroups(materialGroups.map((group) => (
      group.id === groupId
        ? { ...group, testRecords: (group.testRecords || []).map((record) => (record.id === recordId ? { ...record, ...patch } : record)) }
        : group
    )));
  }

  function duplicateTestRecord(groupId, recordId) {
    persistGroups(materialGroups.map((group) => {
      if (group.id !== groupId) return group;
      const source = (group.testRecords || []).find((record) => record.id === recordId);
      if (!source) return group;
      return { ...group, testRecords: [...(group.testRecords || []), { ...source, id: crypto.randomUUID() }] };
    }));
  }

  function deleteTestRecord(groupId, recordId) {
    persistGroups(materialGroups.map((group) => (
      group.id === groupId
        ? { ...group, testRecords: (group.testRecords || []).filter((record) => record.id !== recordId) }
        : group
    )));
  }

  function completeReport() {
    if (!canComplete) return;
    saveGroups(materialGroups, { status: "completed", completedAt: new Date().toISOString() });
    onBack();
  }

  function recordSectionTitle(title) {
    return <h4 className="border-b border-slate-200 pb-2 text-sm font-bold uppercase tracking-[0.12em] text-slate-700 md:col-span-3">{title}</h4>;
  }

  function calculatedCard(label, value, { danger = false, formula = "" } = {}) {
    return (
      <div className={`rounded-2xl border px-3 py-2 ${danger ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-slate-100"}`}>
        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs font-bold uppercase tracking-[0.14em] ${danger ? "text-rose-700" : "text-slate-500"}`}>{label}</p>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${danger ? "bg-rose-100 text-rose-800" : "bg-slate-200 text-slate-700"}`}>
            <Calculator className="h-3 w-3" /> Calculated
          </span>
        </div>
        <p className="mt-2 text-sm font-bold text-slate-950">{value || "-"}</p>
        {formula && <p className="mt-1 text-xs font-semibold text-slate-500">{formula}</p>}
      </div>
    );
  }

  function resultTone(result) {
    const normalized = String(result || "").toLowerCase();
    if (normalized === "pass") return "border-emerald-300 bg-emerald-50 text-emerald-800";
    if (normalized === "retest") return "border-amber-300 bg-amber-50 text-amber-800";
    if (normalized === "fail") return "border-rose-300 bg-rose-50 text-rose-800";
    return "border-slate-200 bg-white text-slate-950";
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-4">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 py-5 sm:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Nuclear Density Report</p>
              <h1 className="mt-1 break-words text-2xl font-bold text-white sm:text-3xl">Compaction Report</h1>
              <p className="mt-1 text-xs font-semibold text-slate-400">{report.projectName}{report.reportNumber ? ` · ${report.reportNumber}` : ""}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
                {String(report.status || "draft").replace(/_/g, " ")}
              </span>
              <div className="hidden gap-2 lg:flex">
                {!isReadOnly && <button type="button" onClick={() => saveGroups(materialGroups)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-700 bg-transparent px-4 text-sm font-bold text-white hover:bg-slate-900"><Save className="h-4 w-4" /> Save Draft</button>}
                {!isReadOnly && <button type="button" onClick={completeReport} disabled={!canComplete} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"><Send className="h-4 w-4" /> Finish Report</button>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={cardClass()}>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FileText className="h-4 w-4" /></span>
          <h2 className="text-base font-bold text-slate-950">Report Header</h2>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ["Project Name", report.projectName],
            ["Project Number", report.projectNumber],
            ["Section", report.section],
            ["Date", report.date],
            ["Client", report.client]
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
              <p className="mt-1 text-sm font-bold text-slate-950">{value || "-"}</p>
            </div>
          ))}
          <Field label="Test For (Optional)">
            <input value={report.testFor || ""} disabled={isReadOnly} onChange={(event) => updateReport({ testFor: event.target.value, test_for: event.target.value })} className={inputClass()} />
          </Field>
        </div>
      </section>

      <section className={cardClass()}>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ShieldCheck className="h-4 w-4" /></span>
          <h2 className="text-base font-bold text-slate-950">Gauge Information</h2>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Serial Number *"><input value={report.serialNumber || ""} disabled={isReadOnly} onChange={(event) => updateReport({ serialNumber: event.target.value, serial_number: event.target.value })} className={inputClass()} /></Field>
          <Field label="Gauge Model *"><input value={report.gaugeModel || ""} disabled={isReadOnly} onChange={(event) => updateReport({ gaugeModel: event.target.value, gauge_model: event.target.value })} className={inputClass()} /></Field>
          <Field label="Calibration Due Date *">
            <input
              type="date"
              value={report.calibrationDueDate || ""}
              disabled={isReadOnly}
              onChange={(event) => updateReport({ calibrationDueDate: event.target.value, calibration_due_date: event.target.value })}
              className={`${inputClass()}${isCalibrationExpired ? " border-rose-400 bg-rose-50 text-rose-800 focus:border-rose-500 focus:ring-rose-100" : ""}`}
            />
            {isCalibrationExpired && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Out of calibration
              </span>
            )}
          </Field>
          <Field label="Did you standardize the nuclear gauge? *">
            <select value={report.standardizedGauge || ""} disabled={isReadOnly} onChange={(event) => updateReport({ standardizedGauge: event.target.value, standardized_gauge: event.target.value })} className={inputClass()}>
              <option value="">Select</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </Field>
          <Field label="Standard Count Density *"><input type="number" value={report.standardDensity || ""} disabled={isReadOnly} onChange={(event) => updateReport({ standardDensity: event.target.value, standard_density: event.target.value })} className={inputClass()} /></Field>
          <Field label="Standard Count Moisture *"><input type="number" value={report.standardMoisture || ""} disabled={isReadOnly} onChange={(event) => updateReport({ standardMoisture: event.target.value, standard_moisture: event.target.value })} className={inputClass()} /></Field>
          <Field label="SP. GR. of +4 Material (Optional)"><input value={report.specificGravityPlus4 || ""} disabled={isReadOnly} onChange={(event) => updateReport({ specificGravityPlus4: event.target.value, specific_gravity_plus4: event.target.value })} className={inputClass()} /></Field>
        </div>
        {isStandardizationNo && (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
            Nuclear gauge must be standardized before testing.
          </p>
        )}
        {isCalibrationExpired && (
          <p className="mt-3 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Gauge is out of calibration — the calibration due date has passed. Recalibrate before testing.
          </p>
        )}
      </section>

      <section className={cardClass()}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ClipboardCheck className="h-4 w-4" /></span>
              <h2 className="text-base font-bold text-slate-950">Materials &amp; Test Data</h2>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-slate-500">Add a material (e.g. Aggregate), enter its specs and test data, then add another material (e.g. Soil) with its own tests.</p>
          </div>
          {!isReadOnly && <button type="button" onClick={addMaterialGroup} className="min-h-10 shrink-0 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white">Add Material Type</button>}
        </div>

        <div className="mt-4 space-y-5">
          {materialGroups.map((group, groupIndex) => {
            const groupRecords = group.testRecords || [];
            return (
              <div key={group.id} className="rounded-2xl border-2 border-slate-200 bg-white p-4">
                {/* Material header */}
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:max-w-2xl">
                    <Field label={`Material ${groupIndex + 1} - Type *`}>
                      <select
                        value={group.materialType || group.material_type || ""}
                        disabled={isReadOnly}
                        onChange={(event) => updateMaterialGroup(group.id, { materialType: event.target.value, material_type: event.target.value, materialName: "", material_name: "" })}
                        className={inputClass()}
                      >
                        <option value="">Select</option>
                        <option>Aggregate</option>
                        <option>Soil</option>
                      </select>
                    </Field>
                    {(group.materialType || group.material_type) && (
                      <Field label="Material Name *">
                        <input
                          value={group.materialName || group.material_name || ""}
                          disabled={isReadOnly}
                          onChange={(event) => updateMaterialGroup(group.id, { materialName: event.target.value, material_name: event.target.value })}
                          className={inputClass()}
                          placeholder={(group.materialType || group.material_type) === "Aggregate" ? "#57 Stone, CR6, 21A" : "Structural Fill, Clay, Silty Sand"}
                        />
                      </Field>
                    )}
                  </div>
                  {!isReadOnly && (
                    <button type="button" onClick={() => deleteMaterialGroup(group.id)} className="min-h-9 shrink-0 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">Remove Material</button>
                  )}
                </div>

                {/* Specifications for this material */}
                <div className="mt-4">
                  <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-700">Specifications</h3>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {COMPACTION_SPEC_FIELDS.map(([label, key, snakeKey]) => (
                      <Field key={key} label={label}>
                        <input
                          value={group[key] || group[snakeKey] || ""}
                          disabled={isReadOnly}
                          onChange={(event) => updateMaterialGroup(group.id, { [key]: event.target.value, [snakeKey]: event.target.value })}
                          className={inputClass()}
                        />
                      </Field>
                    ))}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Allowed Moisture Range</p>
                      <p className="mt-1 text-sm font-bold text-slate-950">{getCompactionMoistureRange(group)}</p>
                    </div>
                  </div>
                </div>

                {/* Test data for this material */}
                <div className="mt-5 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-700">Test Data ({groupRecords.length})</h3>
                  {!isReadOnly && <button type="button" onClick={() => addTestRecord(group.id)} className="min-h-9 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white">Add Test Data</button>}
                </div>
                <div className="mt-3 space-y-4">
                  {groupRecords.map((record, recordIndex) => (
                    <div key={record.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <h4 className="text-base font-bold text-slate-950">Test No. {recordIndex + 1}</h4>
                        {!isReadOnly && (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => duplicateTestRecord(group.id, record.id)} className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700">Duplicate Test</button>
                            <button type="button" onClick={() => deleteTestRecord(group.id, record.id)} className="min-h-9 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">Delete Test</button>
                          </div>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                        {recordSectionTitle("Section 1 - Location Information")}
                        {[
                          ["Location", "location"],
                          ["Station (ft)", "stationFt", "station_ft"],
                          ["Reference To Center Line", "referenceToCenterLine", "reference_to_center_line"],
                          ["Elevation", "elevation"],
                          ["Compacted Depth (in)", "compactedDepth", "compacted_depth"],
                          ["Method Of Compaction", "methodOfCompaction", "method_of_compaction"]
                        ].map(([label, key, snakeKey]) => (
                          <Field key={key} label={label}>
                            <input value={record[key] || ""} disabled={isReadOnly} onChange={(event) => updateTestRecord(group.id, record.id, { [key]: event.target.value, ...(snakeKey ? { [snakeKey]: event.target.value } : {}) })} className={inputClass()} />
                          </Field>
                        ))}

                        {recordSectionTitle("Section 2 - Nuclear Test Inputs")}
                        {[
                          ["A. Wet Density (lbs/ft3)", "wetDensity", "wet_density"],
                          ["B. Moisture Unit Mass (lbs/ft3)", "moistureUnitMass", "moisture_unit_mass"]
                        ].map(([label, key, snakeKey]) => (
                          <Field key={key} label={label}>
                            <input value={record[key] || ""} disabled={isReadOnly} onChange={(event) => updateTestRecord(group.id, record.id, { [key]: event.target.value, ...(snakeKey ? { [snakeKey]: event.target.value } : {}) })} className={inputClass()} />
                          </Field>
                        ))}

                        {recordSectionTitle("Section 3 - Auto Calculated")}
                        {calculatedCard("C. Dry Density (lbs/ft3)", record.dryDensity || record.dry_density, { formula: "A - B" })}
                        {calculatedCard("D. Moisture Content (%)", record.moistureContent || record.moisture_content, { danger: record.moistureOutOfRange || record.moisture_out_of_range, formula: "(B / C) x 100" })}
                        {calculatedCard("J. Percent Dry Density (%)", record.percentDryDensity || record.percent_dry_density, { formula: "(C / H) x 100" })}

                        {recordSectionTitle("Section 4 - Test Status")}
                        <Field label="Test Result">
                          <select
                            value={record.densityResult || record.density_result || ""}
                            disabled={isReadOnly}
                            onChange={(event) => updateTestRecord(group.id, record.id, { densityResult: event.target.value, density_result: event.target.value, resultOverridden: true, result_overridden: true })}
                            className={inputClass()}
                          >
                            <option value="">Select</option>
                            <option>PASS</option>
                            <option>FAIL</option>
                            <option>RETEST</option>
                          </select>
                        </Field>
                        <Field label="Test Status">
                          <select
                            value={record.testStatus || record.test_status || "Pending"}
                            disabled={isReadOnly}
                            onChange={(event) => updateTestRecord(group.id, record.id, { testStatus: event.target.value, test_status: event.target.value })}
                            className={inputClass()}
                          >
                            <option>Tested</option>
                            <option>Retest Required</option>
                            <option>Pending</option>
                            <option>Approved</option>
                          </select>
                        </Field>
                        <div className={`rounded-2xl border px-4 py-3 ${resultTone(record.densityResult || record.density_result)}`}>
                          <p className="text-xs font-bold uppercase tracking-[0.14em]">Density Result</p>
                          <p className="mt-1 text-2xl font-bold">{record.densityResult || record.density_result || "-"}</p>
                          {(record.resultOverridden || record.result_overridden) && <p className="mt-1 text-xs font-bold">Manual Override</p>}
                        </div>

                        <div className="md:col-span-3">
                          <Field label="Remarks">
                            <textarea
                              value={record.remarks || ""}
                              disabled={isReadOnly}
                              onChange={(event) => updateTestRecord(group.id, record.id, { remarks: event.target.value })}
                              rows={4}
                              className={`${inputClass()} py-3 leading-6`}
                              placeholder="Material within specification. Retest required due to moisture. Gauge recalibrated. Soft area observed."
                            />
                          </Field>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!groupRecords.length && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-600">No test data yet for this material. Add test data to begin.</p>}
                </div>
              </div>
            );
          })}
          {!materialGroups.length && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="text-sm font-semibold text-slate-600">No materials added yet.</p>
              {!isReadOnly && <button type="button" onClick={addMaterialGroup} className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white">Add Material Type</button>}
            </div>
          )}

          {!isReadOnly && materialGroups.length > 0 && (
            <button
              type="button"
              onClick={addMaterialGroup}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
            >
              <Plus className="h-5 w-5" /> Add Another Material Type
            </button>
          )}
        </div>
      </section>

      {(requiredMissing.length > 0 || materialGroups.length === 0 || groupsIncomplete.length > 0) && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          Missing required fields: {[
            ...requiredMissing.map(([, label]) => label),
            ...(materialGroups.length === 0 ? ["Add at least one material with test data"] : []),
            ...(groupsIncomplete.length ? [`Complete material type, name, and at least one test on ${groupsIncomplete.length} material${groupsIncomplete.length > 1 ? "s" : ""}`] : [])
          ].join(", ")}
        </p>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-2xl sm:border">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Back</button>
        {!isReadOnly && <button type="button" onClick={() => saveGroups(materialGroups)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Save Draft</button>}
        {!isReadOnly && <button type="button" onClick={completeReport} disabled={!canComplete} className="min-h-11 rounded-2xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">Finish Report</button>}
      </div>
    </div>
  );
}

function AsphaltCompactionReportPage({ log, activityId, reportId, onChange, onBack }) {
  const activity = (log.activities || []).find((item) => item.id === activityId);
  const persistedReport = (activity?.reports || []).find((item) => item.id === reportId);
  const [localReport, setLocalReport] = useState(persistedReport || null);
  const report = localReport || persistedReport;
  const isReadOnly = [DAILY_LOG_STATUS.SUBMITTED, DAILY_LOG_STATUS.APPROVED].includes(log.status);

  const requiredMissing = [
    ["serialNumber", "Serial Number"],
    ["gaugeModel", "Gauge Model"],
    ["calibrationDueDate", "Calibration Due Date"],
    ["standardizedGauge", "Gauge Standardization"],
    ["standardDensity", "Standard Count Density"],
    ["standardMoisture", "Standard Count Moisture"]
  ].filter(([key]) => !String(report?.[key] || "").trim());

  const materialGroups = report?.materialGroups || [];
  const hasTestData = materialGroups.some((g) => (g.testRecords || []).length > 0);
  const canComplete = report && requiredMissing.length === 0 && hasTestData;

  if (!activity || !report) {
    return (
      <section className={cardClass()}>
        <h1 className="text-xl font-bold text-slate-950">Asphalt Compaction Report Not Found</h1>
        <button type="button" onClick={onBack} className="mt-4 min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold">Back</button>
      </section>
    );
  }

  function saveReport(nextReport) {
    const normalized = { ...nextReport, updatedAt: new Date().toISOString() };
    setLocalReport(normalized);
    const nextLog = saveDailyLog({
      ...log,
      activities: (log.activities || []).map((item) => (
        item.id === activityId
          ? { ...item, reports: (item.reports || []).map((r) => (r.id === normalized.id ? normalized : r)), updatedAt: new Date().toISOString() }
          : item
      )),
      updatedAt: new Date().toISOString()
    });
    onChange(nextLog);
  }

  function updateReport(patch) {
    if (isReadOnly) return;
    saveReport({ ...report, ...patch, status: "draft" });
  }

  function addMaterialGroup() {
    updateReport({
      materialGroups: [
        ...(report.materialGroups || []),
        { id: crypto.randomUUID(), mixId: "", marshallValue: "", requiredCompaction: "", testRecords: [] }
      ]
    });
  }

  function updateMaterialGroup(groupId, patch) {
    updateReport({
      materialGroups: (report.materialGroups || []).map((g) => {
        if (g.id !== groupId) return g;
        const updated = { ...g, ...patch };
        if ("marshallValue" in patch || "requiredCompaction" in patch) {
          updated.testRecords = (updated.testRecords || []).map((r) => calculateAsphaltTestRecord(r, updated));
        }
        return updated;
      })
    });
  }

  function deleteMaterialGroup(groupId) {
    updateReport({ materialGroups: (report.materialGroups || []).filter((g) => g.id !== groupId) });
  }

  function addTestRecord(groupId) {
    const group = (report.materialGroups || []).find((g) => g.id === groupId);
    if (!group) return;
    const nextNumber = (group.testRecords || []).length + 1;
    const newRecord = calculateAsphaltTestRecord({ id: crypto.randomUUID(), testNo: nextNumber, location: "", fieldDensity: "", compactionPercent: "", result: "" }, group);
    updateReport({
      materialGroups: (report.materialGroups || []).map((g) =>
        g.id === groupId ? { ...g, testRecords: [...(g.testRecords || []), newRecord] } : g
      )
    });
  }

  function updateTestRecord(groupId, recordId, patch) {
    updateReport({
      materialGroups: (report.materialGroups || []).map((g) => {
        if (g.id !== groupId) return g;
        return { ...g, testRecords: (g.testRecords || []).map((r) => r.id === recordId ? calculateAsphaltTestRecord({ ...r, ...patch }, g) : r) };
      })
    });
  }

  function deleteTestRecord(groupId, recordId) {
    updateReport({
      materialGroups: (report.materialGroups || []).map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          testRecords: (g.testRecords || [])
            .filter((r) => r.id !== recordId)
            .map((r, i) => ({ ...r, testNo: i + 1 }))
        };
      })
    });
  }

  function completeReport() {
    if (!canComplete) return;
    saveReport({ ...report, status: "completed", completedAt: new Date().toISOString() });
    onBack();
  }

  const outOfCalibration = Boolean(
    report.calibrationDueDate && log.date && report.calibrationDueDate < log.date
  );

  function resultTone(result) {
    if (result === "PASS") return "border-emerald-300 bg-emerald-50 text-emerald-800";
    if (result === "FAIL") return "border-rose-300 bg-rose-50 text-rose-800";
    return "border-slate-200 bg-white text-slate-400";
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-300">Asphalt Compaction Report</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">Compaction Report</h1>
            <p className="mt-1 text-sm font-semibold text-slate-300">{report.projectName}</p>
          </div>
          <span className="w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-white">{report.status || "Draft"}</span>
        </div>
      </section>

      <section className={cardClass()}>
        <h2 className="text-lg font-bold text-slate-950">Gauge Information</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Serial Number *"><input value={report.serialNumber || ""} disabled={isReadOnly} onChange={(e) => updateReport({ serialNumber: e.target.value })} className={inputClass()} /></Field>
          <Field label="Gauge Model *"><input value={report.gaugeModel || ""} disabled={isReadOnly} onChange={(e) => updateReport({ gaugeModel: e.target.value })} className={inputClass()} /></Field>
          <Field label="Calibration Due Date *"><input type="date" value={report.calibrationDueDate || ""} disabled={isReadOnly} onChange={(e) => updateReport({ calibrationDueDate: e.target.value })} className={`${inputClass()} ${outOfCalibration ? "border-rose-400 bg-rose-50" : ""}`} /></Field>
          <Field label="Did you standardize the nuclear gauge? *">
            <select value={report.standardizedGauge || ""} disabled={isReadOnly} onChange={(e) => updateReport({ standardizedGauge: e.target.value })} className={inputClass()}>
              <option value="">Select</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </Field>
          <Field label="Standard Count Density *"><input type="number" value={report.standardDensity || ""} disabled={isReadOnly} onChange={(e) => updateReport({ standardDensity: e.target.value })} className={inputClass()} /></Field>
          <Field label="Standard Count Moisture *"><input type="number" value={report.standardMoisture || ""} disabled={isReadOnly} onChange={(e) => updateReport({ standardMoisture: e.target.value })} className={inputClass()} /></Field>
        </div>
        {outOfCalibration && (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">⚠ OUT OF CALIBRATION — Calibration expired before the report date ({log.date}). Do not use this gauge until recalibrated.</p>
        )}
        {String(report.standardizedGauge || "").toLowerCase() === "no" && (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">Nuclear gauge must be standardized before testing.</p>
        )}
      </section>

      {materialGroups.map((group, groupIndex) => (
        <section key={group.id} className={cardClass()}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold text-slate-950">Material {groupIndex + 1}</h2>
            {!isReadOnly && materialGroups.length > 1 && (
              <button type="button" onClick={() => deleteMaterialGroup(group.id)} className="min-h-9 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">Remove Material</button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Material Mix ID *">
              <input value={group.mixId || ""} disabled={isReadOnly} onChange={(e) => updateMaterialGroup(group.id, { mixId: e.target.value })} className={inputClass()} placeholder="e.g. SM-9.5A, BM-25.0" />
            </Field>
            <Field label="Marshall Value from Plant (pcf) *">
              <input type="number" value={group.marshallValue || ""} disabled={isReadOnly} onChange={(e) => updateMaterialGroup(group.id, { marshallValue: e.target.value })} className={inputClass()} placeholder="e.g. 148.5" />
            </Field>
            <Field label="Required Compaction (%) *">
              <input type="number" value={group.requiredCompaction || ""} disabled={isReadOnly} onChange={(e) => updateMaterialGroup(group.id, { requiredCompaction: e.target.value })} className={inputClass()} placeholder="e.g. 92" />
            </Field>
          </div>

          <div className="mt-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-bold text-slate-950">Test Data</h3>
              {!isReadOnly && (
                <button type="button" onClick={() => addTestRecord(group.id)} className="min-h-9 rounded-xl bg-slate-950 px-3 text-sm font-bold text-white">+ Add Test Data</button>
              )}
            </div>
            <div className="mt-3 space-y-3">
              {(group.testRecords || []).map((record) => (
                <div key={record.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-950">Test No. {record.testNo}</h4>
                    {!isReadOnly && (
                      <button type="button" onClick={() => deleteTestRecord(group.id, record.id)} className="min-h-8 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">Delete</button>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Field label="Test Location *">
                      <input value={record.location || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(group.id, record.id, { location: e.target.value })} className={inputClass()} placeholder="e.g. STA 10+00, Lane 1" />
                    </Field>
                    <Field label="Field Density (pcf) *">
                      <input type="number" value={record.fieldDensity || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(group.id, record.id, { fieldDensity: e.target.value })} className={inputClass()} placeholder="e.g. 138.2" />
                    </Field>
                    <div className={`rounded-2xl border px-3 py-2 ${record.result === "PASS" ? "border-emerald-200 bg-emerald-50" : record.result === "FAIL" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-100"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Compaction %</p>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700">
                          <Calculator className="h-3 w-3" /> Calc
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-bold text-slate-950">{record.compactionPercent ? `${record.compactionPercent}%` : "-"}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Field Density ÷ Marshall × 100</p>
                    </div>
                    <div className={`rounded-2xl border px-4 py-3 md:col-span-3 ${resultTone(record.result)}`}>
                      <p className="text-xs font-bold uppercase tracking-[0.14em]">Result</p>
                      <p className="mt-1 text-2xl font-bold">{record.result || "-"}</p>
                      {group.requiredCompaction && record.compactionPercent && (
                        <p className="mt-1 text-xs font-semibold">Required: {group.requiredCompaction}% · Achieved: {record.compactionPercent}%</p>
                      )}
                      {record.exceededLimit && (
                        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                          ⚠ Exceeded allowed limit (&gt;102%)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!(group.testRecords || []).length && (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-3 text-sm font-semibold text-slate-600">No test data yet. Click &quot;+ Add Test Data&quot; to begin.</p>
              )}
            </div>
          </div>
        </section>
      ))}

      {!isReadOnly && (
        <button type="button" onClick={addMaterialGroup} className="w-full min-h-11 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-sm font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors">
          + Add Different Material
        </button>
      )}

      <section className={cardClass()}>
        <h2 className="text-lg font-bold text-slate-950">Cores</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Were cores taken?">
            <select value={report.coresTaken || ""} disabled={isReadOnly} onChange={(e) => updateReport({ coresTaken: e.target.value })} className={inputClass()}>
              <option value="">Select</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </Field>
          {report.coresTaken === "Yes" && (
            <>
              <Field label="Number of Cores">
                <input type="number" value={report.coreCount || ""} disabled={isReadOnly} onChange={(e) => updateReport({ coreCount: e.target.value })} className={inputClass()} placeholder="e.g. 3" />
              </Field>
              <Field label="Core Locations">
                <input value={report.coreLocations || ""} disabled={isReadOnly} onChange={(e) => updateReport({ coreLocations: e.target.value })} className={inputClass()} placeholder="e.g. STA 10+00, 12+50, 15+00" />
              </Field>
              <div className="md:col-span-3">
                <Field label="Core Notes">
                  <textarea value={report.coreNotes || ""} disabled={isReadOnly} onChange={(e) => updateReport({ coreNotes: e.target.value })} rows={3} className={`${inputClass()} py-3 leading-6`} placeholder="Core results, lab submission, observations..." />
                </Field>
              </div>
            </>
          )}
        </div>
      </section>

      {requiredMissing.length > 0 && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          Missing required fields: {requiredMissing.map(([, label]) => label).join(", ")}
        </p>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-2xl sm:border">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Back</button>
        {!isReadOnly && <button type="button" onClick={() => saveReport(report)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Save Draft</button>}
        {!isReadOnly && <button type="button" onClick={completeReport} disabled={!canComplete} className="min-h-11 rounded-2xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">Finish Report</button>}
      </div>
    </div>
  );
}

function SurfaceInfiltrationReportPage({ log, activityId, reportId, onChange, onBack }) {
  const activity = (log.activities || []).find((item) => item.id === activityId);
  const persistedReport = (activity?.reports || []).find((item) => item.id === reportId);
  const [localReport, setLocalReport] = useState(persistedReport || null);
  const report = localReport || persistedReport;
  const isReadOnly = [DAILY_LOG_STATUS.SUBMITTED, DAILY_LOG_STATUS.APPROVED].includes(log.status);

  const testRecords = report?.testRecords || [];
  const canComplete = report && testRecords.length > 0;

  if (!activity || !report) {
    return (
      <section className={cardClass()}>
        <h1 className="text-xl font-bold text-slate-950">Surface Infiltration Report Not Found</h1>
        <button type="button" onClick={onBack} className="mt-4 min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold">Back</button>
      </section>
    );
  }

  function saveReport(nextReport) {
    const normalized = { ...nextReport, updatedAt: new Date().toISOString() };
    setLocalReport(normalized);
    const nextLog = saveDailyLog({
      ...log,
      activities: (log.activities || []).map((item) => (
        item.id === activityId
          ? { ...item, reports: (item.reports || []).map((r) => (r.id === normalized.id ? normalized : r)), updatedAt: new Date().toISOString() }
          : item
      )),
      updatedAt: new Date().toISOString()
    });
    onChange(nextLog);
  }

  function updateReport(patch) {
    if (isReadOnly) return;
    saveReport({ ...report, ...patch, status: "draft" });
  }

  function addTestRecord() {
    const nextNo = testRecords.length + 1;
    const newRecord = calculateInfiltrationRate({
      id: crypto.randomUUID(), testNo: nextNo,
      identificationNumber: "", location: "", dateOfTest: log.date || "",
      ageOfPavingUnit: "", typeOfPavingUnit: "", thicknessOfPavingUnit: "",
      timePrewetting: "", rainLastEvent: "", weightInfiltratedWater: "",
      insideDiameter: "", timeInfiltration: "", infiltrationRate: ""
    });
    updateReport({ testRecords: [...testRecords, newRecord] });
  }

  function updateTestRecord(recordId, patch) {
    updateReport({
      testRecords: testRecords.map((r) => {
        if (r.id !== recordId) return r;
        const updated = { ...r, ...patch };
        if ("weightInfiltratedWater" in patch || "insideDiameter" in patch || "timeInfiltration" in patch) {
          return calculateInfiltrationRate(updated);
        }
        return updated;
      })
    });
  }

  function deleteTestRecord(recordId) {
    updateReport({ testRecords: testRecords.filter((r) => r.id !== recordId) });
  }

  function completeReport() {
    saveReport({ ...report, status: "completed", completedAt: new Date().toISOString() });
    onBack();
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-4 shadow-sm sm:p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-300">ASTM C1781</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">Surface Infiltration Rate Report</h1>
          <p className="mt-1 text-sm font-semibold text-slate-300">{report.projectName}</p>
        </div>
      </section>

      <section className={cardClass()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950">Test Records</h2>
          <span className="text-xs font-semibold text-slate-500">{testRecords.length} record{testRecords.length !== 1 ? "s" : ""}</span>
        </div>
        <p className="mt-1 text-xs font-semibold text-slate-400">Formula: IR = (126870 × W) ÷ (D² × T)</p>

        <div className="mt-4 space-y-6">
          {testRecords.map((record, index) => (
            <div key={record.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-700">Test {index + 1}</p>
                {!isReadOnly && (
                  <button type="button" onClick={() => deleteTestRecord(record.id)} className="min-h-8 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">Remove</button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Identification Number">
                  <input value={record.identificationNumber || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { identificationNumber: e.target.value })} className={inputClass()} placeholder="e.g. 1C" />
                </Field>
                <Field label="Location" extraClass="md:col-span-2">
                  <input value={record.location || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { location: e.target.value })} className={inputClass()} placeholder="e.g. Rock Creek Trail STA 403+30" />
                </Field>
                <Field label="Date of Test">
                  <input type="date" value={record.dateOfTest || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { dateOfTest: e.target.value })} className={inputClass()} />
                </Field>
                <Field label="Age of Paving Unit (Days)">
                  <input type="number" value={record.ageOfPavingUnit || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { ageOfPavingUnit: e.target.value })} className={inputClass()} placeholder="e.g. 1" />
                </Field>
                <Field label="Type of Paving Unit">
                  <input value={record.typeOfPavingUnit || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { typeOfPavingUnit: e.target.value })} className={inputClass()} placeholder="e.g. Porous Asphalt" />
                </Field>
                <Field label="Thickness of Paving Unit (in)">
                  <input type="number" value={record.thicknessOfPavingUnit || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { thicknessOfPavingUnit: e.target.value })} className={inputClass()} placeholder="e.g. 4.50" />
                </Field>
                <Field label="Time Elapsed During Prewetting (sec)">
                  <input type="number" value={record.timePrewetting || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { timePrewetting: e.target.value })} className={inputClass()} placeholder="e.g. 10" />
                </Field>
                <Field label="Amount of Rain During Last Event (in)">
                  <input value={record.rainLastEvent || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { rainLastEvent: e.target.value })} className={inputClass()} placeholder="N/A or e.g. 0.5" />
                </Field>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-3 md:grid-cols-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700 md:col-span-3">Calculation Inputs</p>
                <Field label="Weight of Infiltrated Water (lb) — W">
                  <input type="number" value={record.weightInfiltratedWater || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { weightInfiltratedWater: e.target.value })} className={inputClass()} placeholder="e.g. 40" />
                </Field>
                <Field label="Inside Diameter of Infiltration Ring (in) — D">
                  <input type="number" value={record.insideDiameter || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { insideDiameter: e.target.value })} className={inputClass()} placeholder="e.g. 11.75" />
                </Field>
                <Field label="Time Elapsed During Infiltration Test (sec) — T">
                  <input type="number" value={record.timeInfiltration || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { timeInfiltration: e.target.value })} className={inputClass()} placeholder="e.g. 71" />
                </Field>
              </div>

              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Infiltration Rate (in/h)</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                    Calculated
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold text-emerald-900">{record.infiltrationRate ? `${record.infiltrationRate} in/h` : "—"}</p>
                <p className="mt-1 text-xs font-semibold text-emerald-600">(126870 × W) ÷ (D² × T)</p>
              </div>
            </div>
          ))}

          {!isReadOnly && (
            <button type="button" onClick={addTestRecord} className="w-full min-h-11 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-sm font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors">
              + Add Test Record
            </button>
          )}
          {!testRecords.length && (
            <p className="text-center text-sm font-semibold text-slate-500">No test records yet. Click &quot;+ Add Test Record&quot; to begin.</p>
          )}
        </div>
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-2xl sm:border">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Back</button>
        {!isReadOnly && <button type="button" onClick={() => saveReport(report)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Save Draft</button>}
        {!isReadOnly && <button type="button" onClick={completeReport} disabled={!canComplete} className="min-h-11 rounded-2xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">Finish Report</button>}
      </div>
    </div>
  );
}

const VTM12_CURVES = {
  A: { maxDryDensity: 141.8, optimumMoisture: 6.1 },
  B: { maxDryDensity: 139.1, optimumMoisture: 6.7 },
  C: { maxDryDensity: 136.3, optimumMoisture: 7.4 },
  D: { maxDryDensity: 134.1, optimumMoisture: 8.0 },
  E: { maxDryDensity: 132.0, optimumMoisture: 8.5 },
  F: { maxDryDensity: 129.3, optimumMoisture: 9.2 },
  G: { maxDryDensity: 126.6, optimumMoisture: 10.0 },
  H: { maxDryDensity: 124.2, optimumMoisture: 10.7 },
  I: { maxDryDensity: 121.7, optimumMoisture: 11.4 },
  J: { maxDryDensity: 119.3, optimumMoisture: 12.2 },
  K: { maxDryDensity: 117.0, optimumMoisture: 13.0 },
  L: { maxDryDensity: 114.6, optimumMoisture: 14.1 },
  M: { maxDryDensity: 112.0, optimumMoisture: 15.2 },
  N: { maxDryDensity: 109.6, optimumMoisture: 16.4 },
  O: { maxDryDensity: 107.1, optimumMoisture: 17.6 },
  P: { maxDryDensity: 104.7, optimumMoisture: 19.2 },
  Q: { maxDryDensity: 102.4, optimumMoisture: 20.3 },
  R: { maxDryDensity: 99.9,  optimumMoisture: 21.5 },
  S: { maxDryDensity: 97.4,  optimumMoisture: 22.7 },
  T: { maxDryDensity: 94.6,  optimumMoisture: 24.4 },
  U: { maxDryDensity: 92.1,  optimumMoisture: 25.8 },
  V: { maxDryDensity: 89.9,  optimumMoisture: 27.4 },
  W: { maxDryDensity: 87.5,  optimumMoisture: 29.5 },
  X: { maxDryDensity: 85.0,  optimumMoisture: 30.5 },
  Y: { maxDryDensity: 83.0,  optimumMoisture: 31.5 },
  Z: { maxDryDensity: 81.1,  optimumMoisture: 32.5 }
};

// SVG chart of VTM-12 Set "C" moisture-density curves (Figure 1).
// All 26 curves are rendered as solid black lines; the selected curve is heavier.
// If field moisture and density are provided, the test point is plotted as an ×.
function ProctorCurvesChart({ selectedCurve, moistureContent, fieldDryDensity, wetDensity, onSelectCurve, isReadOnly }) {
  const [hoverCurve, setHoverCurve] = useState("");
  const W = 560, H = 420;
  const ml = 46, mr = 10, mt = 12, mb = 44;
  const gw = W - ml - mr, gh = H - mt - mb;
  const moistMin = 2, moistMax = 36;
  const densMin = 78, densMax = 146;

  function toX(w) { return ml + (w - moistMin) / (moistMax - moistMin) * gw; }
  function toY(d) { return mt + gh - (d - densMin) / (densMax - densMin) * gh; }

  const K_FACTOR = 0.0048;
  const HALF_SPAN = 7;
  const PTS = 60;

  // Sample one curve as {w, d} points; used for both the drawn path and hit-testing.
  function curveSamples(mdd, omc) {
    const k = K_FACTOR * mdd;
    const pts = [];
    for (let i = 0; i <= PTS; i++) {
      const w = (omc - HALF_SPAN) + HALF_SPAN * 2 * i / PTS;
      const d = mdd - k * (w - omc) * (w - omc);
      pts.push({ w, d });
    }
    return pts;
  }

  function samplesToPath(pts) {
    let path = "";
    let first = true;
    for (const { w, d } of pts) {
      if (w < moistMin || w > moistMax || d < densMin || d > densMax) { first = true; continue; }
      path += `${first ? "M" : "L"} ${toX(w).toFixed(1)} ${toY(d).toFixed(1)} `;
      first = false;
    }
    return path.trim();
  }

  // Precompute each curve's drawn path once.
  const curveList = Object.entries(VTM12_CURVES).map(([letter, c]) => ({
    letter,
    mdd: c.maxDryDensity,
    omc: c.optimumMoisture,
    d: samplesToPath(curveSamples(c.maxDryDensity, c.optimumMoisture))
  })).filter((c) => c.d);

  const mc = parseFloat(moistureContent);
  const fd = parseFloat(fieldDryDensity);
  const wd = parseFloat(wetDensity);
  // One-point molded dry density — the point overlaid on the family of curves to pick
  // the curve. Computed live from wet density (D) and moisture (F): D / (1 + w/100).
  const moldedDry = (!isNaN(wd) && !isNaN(mc) && wd > 0) ? wd / (1 + mc / 100) : NaN;

  const inRange = (w, d) => w >= moistMin && w <= moistMax && d >= densMin && d <= densMax;
  const hasMolded = !isNaN(mc) && !isNaN(moldedDry) && inRange(mc, moldedDry);
  const hasField = !isNaN(mc) && !isNaN(fd) && inRange(mc, fd);

  const canSelect = !isReadOnly && typeof onSelectCurve === "function";

  // Suggested curve = family curve nearest (in plotted pixels) to the one-point test point.
  // Falls back to the field-density point if the molded point isn't available yet.
  const sx = hasMolded ? toX(mc) : (hasField ? toX(mc) : null);
  const sy = hasMolded ? toY(moldedDry) : (hasField ? toY(fd) : null);
  let suggested = "";
  if (sx !== null && sy !== null) {
    let best = Infinity;
    Object.entries(VTM12_CURVES).forEach(([letter, { maxDryDensity: mdd, optimumMoisture: omc }]) => {
      curveSamples(mdd, omc).forEach(({ w, d }) => {
        const dist = (toX(w) - sx) ** 2 + (toY(d) - sy) ** 2;
        if (dist < best) { best = dist; suggested = letter; }
      });
    });
  }
  const showSuggestApply = canSelect && suggested && suggested !== selectedCurve;

  function styleFor(letter) {
    if (letter === selectedCurve) return { stroke: "#000", width: 3, dash: "" };
    if (canSelect && letter === hoverCurve) return { stroke: "#1d4ed8", width: 2.2, dash: "" };
    if (letter === suggested) return { stroke: "#2563eb", width: 1.6, dash: "4 3" };
    return { stroke: "#000", width: 0.75, dash: "" };
  }

  // Draw emphasized curves (suggested / hovered / selected) last so they sit on top.
  const emphasized = [...new Set([suggested, hoverCurve, selectedCurve].filter(Boolean))];
  const baseCurves = curveList.filter((c) => !emphasized.includes(c.letter));
  const topCurves = emphasized.map((l) => curveList.find((c) => c.letter === l)).filter(Boolean);

  const xTicks = [], yTicks = [];
  for (let m = 4; m <= 34; m += 2) xTicks.push(m);
  for (let d = 80; d <= 144; d += 4) yTicks.push(d);

  function renderCurve({ letter, mdd, omc, d }) {
    const s = styleFor(letter);
    const labeled = omc >= moistMin && omc <= moistMax && mdd >= densMin && mdd <= densMax;
    const isEmph = letter === selectedCurve || letter === suggested || (canSelect && letter === hoverCurve);
    return (
      <g key={letter}>
        <path d={d} fill="none" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} />
        {labeled && (
          <text x={toX(omc)} y={toY(mdd) - (isEmph ? 7 : 2)} textAnchor="middle"
            fontSize={isEmph ? 11 : 6} fontWeight="bold" fill={s.stroke}>{letter}</text>
        )}
      </g>
    );
  }

  return (
    <div className="mt-2 md:col-span-3">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600">
        Fig. 1 — Typical Moisture-Density Curves, Set &quot;C&quot; (VTM-12)
        {selectedCurve ? <span className="ml-2 text-blue-900">· Curve {selectedCurve} selected</span> : null}
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-600" /> 1-Pt test point (live)
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
          <span className="text-slate-400">✕</span> Field density
        </span>
        {canSelect && (
          <span className="text-[11px] font-semibold text-slate-500">· Tap any curve to select it.</span>
        )}
        {showSuggestApply && (
          <button type="button" onClick={() => onSelectCurve(suggested)}
            className="inline-flex min-h-8 items-center rounded-xl border border-blue-300 bg-blue-50 px-3 text-[11px] font-bold text-blue-800 hover:bg-blue-100">
            Suggested: Curve {suggested} — tap to apply
          </button>
        )}
        {!hasMolded && (
          <span className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            Enter A &amp; B (mold weights) + F (moisture) to plot the live 1-Pt test point
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[300px]"
        style={{ border: "1px solid #bfdbfe", borderRadius: "12px", background: "white" }}>
        {/* Grid */}
        {xTicks.map((m) => (
          <line key={m} x1={toX(m)} y1={mt} x2={toX(m)} y2={mt + gh} stroke="#e2e8f0" strokeWidth="0.5" />
        ))}
        {yTicks.map((d) => (
          <line key={d} x1={ml} y1={toY(d)} x2={ml + gw} y2={toY(d)} stroke="#e2e8f0" strokeWidth="0.5" />
        ))}

        {/* Base curves — thin solid black (emphasized ones drawn later, on top) */}
        {baseCurves.map(renderCurve)}

        {/* Emphasized curves — suggested (dashed blue), hovered (blue), selected (heavy black) */}
        {topCurves.map(renderCurve)}

        {/* Transparent wide hit-areas so a curve can be tapped/clicked to select it */}
        {canSelect && curveList.map(({ letter, d }) => (
          <path key={`hit-${letter}`} d={d} fill="none" stroke="transparent" strokeWidth="11"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoverCurve(letter)}
            onMouseLeave={() => setHoverCurve((prev) => (prev === letter ? "" : prev))}
            onClick={() => onSelectCurve(letter)}>
            <title>Curve {letter} — MDD {VTM12_CURVES[letter]?.maxDryDensity} lb/ft³, OMC {VTM12_CURVES[letter]?.optimumMoisture}%</title>
          </path>
        ))}

        {/* Field density point — light grey × (kept for reference; matches the PDF) */}
        {hasField && (() => {
          const px = toX(mc), py = toY(fd), s = 4;
          return (
            <g>
              <line x1={px - s} y1={py - s} x2={px + s} y2={py + s} stroke="#94a3b8" strokeWidth="1.8" />
              <line x1={px + s} y1={py - s} x2={px - s} y2={py + s} stroke="#94a3b8" strokeWidth="1.8" />
              <text x={px + s + 3} y={py + 3} fontSize="7.5" fontWeight="bold" fill="#64748b">Field</text>
            </g>
          );
        })()}

        {/* One-point molded test point — live marker used to read the family of curves */}
        {hasMolded && (() => {
          const px = toX(mc), py = toY(moldedDry);
          return (
            <g>
              <circle cx={px} cy={py} r={4.5} fill="#ea580c" stroke="#7c2d12" strokeWidth="1" />
              <text x={px + 7} y={py + 3} fontSize="8.5" fontWeight="bold" fill="#9a3412">1-Pt Test</text>
            </g>
          );
        })()}

        {/* Graph border */}
        <rect x={ml} y={mt} width={gw} height={gh} fill="none" stroke="#000" strokeWidth="1" />

        {/* X-axis tick labels */}
        {xTicks.map((m) => (
          <text key={m} x={toX(m)} y={mt + gh + 14} textAnchor="middle" fontSize="8" fill="#475569">{m}</text>
        ))}

        {/* Y-axis tick labels */}
        {yTicks.map((d) => (
          <text key={d} x={ml - 3} y={toY(d) + 3} textAnchor="end" fontSize="8" fill="#475569">{d}</text>
        ))}

        {/* Axis titles */}
        <text x={ml + gw / 2} y={H - 4} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a">
          MOISTURE CONTENT (%)
        </text>
        <text
          x={10} y={mt + gh / 2}
          textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a"
          transform={`rotate(-90, 10, ${mt + gh / 2})`}
        >
          DRY DENSITY (lb/ft³)
        </text>
      </svg>
      </div>
    </div>
  );
}

function calculateProctorRecord(record = {}) {
  // A. mold+soil weight, B. mold weight → C = A−B → D = C×30 (wet density)
  const moldAndSoil = parseFloat(record.moldAndSoilWeight);
  const mold = parseFloat(record.moldWeight);
  let wetSoilWeight = null;
  let wetDensity = null;
  if (!isNaN(moldAndSoil) && !isNaN(mold) && moldAndSoil > mold) {
    wetSoilWeight = moldAndSoil - mold;
    wetDensity = wetSoilWeight * 30;
  }

  const curve = record.selectedCurve ? VTM12_CURVES[record.selectedCurve] : null;
  const maxDryDensityFromCurve = curve ? curve.maxDryDensity : null;
  const optimumMoistureFromCurve = curve ? curve.optimumMoisture : null;

  let correctedMaxDryDensity = null;
  let correctedOptimumMoisture = null;

  if (record.hasOversizedCorrection && maxDryDensityFromCurve !== null) {
    const Pc = parseFloat(record.percentPlusNo4) / 100;
    const Pf = 1 - Pc;
    const sg = parseFloat(record.bulkSpecificGravity);
    const Wc = parseFloat(record.moistureContentPlusNo4) / 100;
    const Wf = optimumMoistureFromCurve !== null ? optimumMoistureFromCurve / 100 : null;

    if (!isNaN(Pc) && !isNaN(sg) && Pc >= 0.1 && sg > 0) {
      const Df = maxDryDensityFromCurve;
      const Dc = 62.4 * sg;
      const denom = Pc * Df + Pf * Dc;
      if (denom > 0) correctedMaxDryDensity = (Df * Dc) / denom;
    }
    if (!isNaN(Pc) && !isNaN(Wc) && Wf !== null) {
      correctedOptimumMoisture = (Pc * Wc + (1 - Pc) * Wf) * 100;
    }
  }

  const effectiveMDD = correctedMaxDryDensity ?? maxDryDensityFromCurve;
  const fieldDD = parseFloat(record.fieldDryDensity);
  const pctCompaction = effectiveMDD && !isNaN(fieldDD) && fieldDD > 0
    ? (fieldDD / effectiveMDD) * 100 : null;
  const required = parseFloat(record.requiredCompaction);
  const compactionResult = pctCompaction !== null && !isNaN(required)
    ? (pctCompaction >= required ? "PASS" : "FAIL") : "";

  return {
    ...record,
    wetSoilWeight: wetSoilWeight !== null ? wetSoilWeight.toFixed(2) : (record.wetSoilWeight || ""),
    wetDensity: wetDensity !== null ? wetDensity.toFixed(1) : (record.wetDensity || ""),
    maxDryDensityFromCurve: maxDryDensityFromCurve !== null ? String(maxDryDensityFromCurve) : "",
    optimumMoistureFromCurve: optimumMoistureFromCurve !== null ? String(optimumMoistureFromCurve) : "",
    correctedMaxDryDensity: correctedMaxDryDensity !== null ? correctedMaxDryDensity.toFixed(1) : "",
    correctedOptimumMoisture: correctedOptimumMoisture !== null ? correctedOptimumMoisture.toFixed(1) : "",
    percentCompaction: pctCompaction !== null ? pctCompaction.toFixed(1) : "",
    compactionResult
  };
}

function ProctorReportPage({ log, activityId, reportId, onChange, onBack }) {
  const activity = (log.activities || []).find((item) => item.id === activityId);
  const persistedReport = (activity?.reports || []).find((item) => item.id === reportId);
  const [localReport, setLocalReport] = useState(persistedReport || null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const report = localReport || persistedReport;
  const isReadOnly = [DAILY_LOG_STATUS.SUBMITTED, DAILY_LOG_STATUS.APPROVED].includes(log.status);
  const testRecords = report?.testRecords || [];
  const canComplete = testRecords.length > 0;

  async function downloadReportPdf() {
    if (!report) return;
    setPdfGenerating(true);
    try {
      await generateProctorStandalonePdf(report, { download: true });
    } catch (err) {
      window.alert("Could not generate PDF: " + (err.message || "Unknown error"));
    } finally {
      setPdfGenerating(false);
    }
  }

  if (!activity || !report) {
    return (
      <section className={cardClass()}>
        <h1 className="text-xl font-bold text-slate-950">One-Point Proctor Report Not Found</h1>
        <button type="button" onClick={onBack} className="mt-4 min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold">Back</button>
      </section>
    );
  }

  function saveReport(nextReport) {
    const normalized = { ...nextReport, updatedAt: new Date().toISOString() };
    setLocalReport(normalized);
    const nextLog = saveDailyLog({
      ...log,
      activities: (log.activities || []).map((item) =>
        item.id === activityId
          ? { ...item, reports: (item.reports || []).map((r) => (r.id === normalized.id ? normalized : r)), updatedAt: new Date().toISOString() }
          : item
      ),
      updatedAt: new Date().toISOString()
    });
    onChange(nextLog);
  }

  function updateReport(patch) {
    if (isReadOnly) return;
    saveReport({ ...report, ...patch });
  }

  function addTestRecord() {
    const nextNo = testRecords.length + 1;
    const blank = calculateProctorRecord({
      id: crypto.randomUUID(), testNo: nextNo,
      location: "", materialDescription: "", moistureMethod: "Speedy (AASHTO T 217)",
      moldAndSoilWeight: "", moldWeight: "", wetSoilWeight: "", wetDensity: "",
      speedyDialReading: "", moistureContent: "",
      selectedCurve: "", withinFamilyCurves: "yes",
      hasOversizedCorrection: false,
      percentPlusNo4: "", bulkSpecificGravity: "", moistureContentPlusNo4: "",
      fieldDryDensity: "", requiredCompaction: ""
    });
    updateReport({ testRecords: [...testRecords, blank] });
  }

  function updateTestRecord(recordId, patch) {
    updateReport({
      testRecords: testRecords.map((r) => {
        if (r.id !== recordId) return r;
        return calculateProctorRecord({ ...r, ...patch });
      })
    });
  }

  function deleteTestRecord(recordId) {
    updateReport({ testRecords: testRecords.filter((r) => r.id !== recordId) });
  }

  function completeReport() {
    saveReport({ ...report, status: "completed", completedAt: new Date().toISOString() });
    onBack();
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-4 shadow-sm sm:p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-300">VTM-12 · AASHTO T 272</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">One-Point Proctor Report</h1>
          <p className="mt-1 text-sm font-semibold text-slate-300">{report.projectName}</p>
        </div>
      </section>

      <section className={cardClass()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950">Test Records</h2>
          <span className="text-xs font-semibold text-slate-500">{testRecords.length} record{testRecords.length !== 1 ? "s" : ""}</span>
        </div>
        <p className="mt-1 text-xs font-semibold text-slate-400">% Compaction = (Field Dry Density ÷ Max Dry Density) × 100</p>

        <div className="mt-4 space-y-6">
          {testRecords.map((record, index) => (
            <div key={record.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-700">Test {index + 1}</p>
                {!isReadOnly && (
                  <button type="button" onClick={() => deleteTestRecord(record.id)} className="min-h-8 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">Remove</button>
                )}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Location / Station" extraClass="md:col-span-2">
                  <input value={record.location || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { location: e.target.value })} className={inputClass()} placeholder="e.g. STA 12+50 RT" />
                </Field>
                <Field label="Material Description">
                  <input value={record.materialDescription || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { materialDescription: e.target.value })} className={inputClass()} placeholder="e.g. Class I Subgrade" />
                </Field>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                <Field label="A. Weight of Mold + Wet Soil (lb)">
                  <input type="number" step="0.01" value={record.moldAndSoilWeight || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { moldAndSoilWeight: e.target.value })} className={inputClass()} placeholder="e.g. 13.62" />
                </Field>
                <Field label="B. Weight of Mold (lb)">
                  <input type="number" step="0.01" value={record.moldWeight || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { moldWeight: e.target.value })} className={inputClass()} placeholder="e.g. 9.14" />
                </Field>
                <Field label="C. Wet Soil Weight = A−B (lb)">
                  <input readOnly value={record.wetSoilWeight || "—"} className={`${inputClass()} bg-slate-100 font-bold text-slate-600`} />
                </Field>
                <Field label="D. Wet Density = C×30 (lb/ft³)">
                  <input readOnly value={record.wetDensity || "—"} className={`${inputClass()} bg-slate-100 font-bold text-slate-700`} />
                </Field>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label='E. "Speedy" Dial Reading'>
                  <input type="number" value={record.speedyDialReading || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { speedyDialReading: e.target.value })} className={inputClass()} placeholder="e.g. 11" />
                </Field>
                <Field label='F. Moisture Content % (from "Speedy" chart)'>
                  <input type="number" value={record.moistureContent || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { moistureContent: e.target.value })} className={inputClass()} placeholder="e.g. 11.0" />
                </Field>
                <Field label="Moisture Method">
                  <select value={record.moistureMethod || "Speedy (AASHTO T 217)"} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { moistureMethod: e.target.value })} className={inputClass()}>
                    <option value="Speedy (AASHTO T 217)">Speedy (AASHTO T 217)</option>
                    <option value="Hot Plate / Burner (ASTM D4959)">Hot Plate / Burner (ASTM D4959)</option>
                    <option value="Drying Oven (ASTM D4959)">Drying Oven (ASTM D4959)</option>
                  </select>
                </Field>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-3 md:grid-cols-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700 md:col-span-3">Curve Selection — Typical Moisture Density Curves Set &quot;C&quot; (Fig. 1)</p>
                <Field label="Select Curve (A–Z)" extraClass="md:col-span-3 lg:col-span-1">
                  <select value={record.selectedCurve || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { selectedCurve: e.target.value })} className={inputClass()}>
                    <option value="">— Select Curve —</option>
                    {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => (
                      <option key={c} value={c}>{c} — MDD {VTM12_CURVES[c]?.maxDryDensity} lb/ft³, OMC {VTM12_CURVES[c]?.optimumMoisture}%</option>
                    ))}
                  </select>
                </Field>
                <Field label="G. Max Dry Density from Fig. 1 (lb/ft³)">
                  <input readOnly value={record.maxDryDensityFromCurve || "—"} className={`${inputClass()} bg-blue-100 text-blue-900 font-bold`} />
                </Field>
                <Field label="H. Optimum Moisture Content, % from Fig. 1">
                  <input readOnly value={record.optimumMoistureFromCurve || "—"} className={`${inputClass()} bg-blue-100 text-blue-900 font-bold`} />
                </Field>
                <Field label="Point Falls Within Family of Curves?">
                  <select value={record.withinFamilyCurves || "yes"} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { withinFamilyCurves: e.target.value })} className={inputClass()}>
                    <option value="yes">Yes</option>
                    <option value="no">No — Full Proctor Required</option>
                  </select>
                </Field>
                <ProctorCurvesChart
                  selectedCurve={record.selectedCurve}
                  moistureContent={record.moistureContent}
                  fieldDryDensity={record.fieldDryDensity}
                  wetDensity={record.wetDensity}
                  isReadOnly={isReadOnly}
                  onSelectCurve={(letter) => updateTestRecord(record.id, { selectedCurve: letter })}
                />
              </div>

              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">I. Field Density (from TL-125 / Nuclear Gauge)</p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="I. Field Density lb/ft³ (from TL-125)">
                    <input type="number" step="0.1" value={record.fieldDryDensity || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { fieldDryDensity: e.target.value })} className={inputClass()} placeholder="e.g. 120.4" />
                  </Field>
                  <Field label="Required Compaction (%)">
                    <input type="number" value={record.requiredCompaction || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { requiredCompaction: e.target.value })} className={inputClass()} placeholder="e.g. 95" />
                  </Field>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3">
                <div className="flex items-center gap-3">
                  <input type="checkbox" id={`oversized-${record.id}`} checked={!!record.hasOversizedCorrection} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { hasOversizedCorrection: e.target.checked })} className="h-4 w-4 rounded" />
                  <label htmlFor={`oversized-${record.id}`} className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">J. Oversized Particle Correction (≥10% retained on No. 4 / 4.75 mm sieve)</label>
                </div>
                {record.hasOversizedCorrection && (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Field label="J. No.4 (+4.75mm) Material, %">
                      <input type="number" value={record.percentPlusNo4 || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { percentPlusNo4: e.target.value })} className={inputClass()} placeholder="e.g. 36.9" />
                    </Field>
                    <Field label="Bulk Specific Gravity of +No. 4 Material">
                      <input type="number" step="0.01" value={record.bulkSpecificGravity || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { bulkSpecificGravity: e.target.value })} className={inputClass()} placeholder="e.g. 2.65" />
                    </Field>
                    <Field label="OM Content of +No. 4 Material, Wc (%)">
                      <input type="number" step="0.1" value={record.moistureContentPlusNo4 || ""} disabled={isReadOnly} onChange={(e) => updateTestRecord(record.id, { moistureContentPlusNo4: e.target.value })} className={inputClass()} placeholder="e.g. 2.0" />
                    </Field>
                    <Field label="K. Corrected Max Density (lb/ft³)">
                      <input readOnly value={record.correctedMaxDryDensity || "—"} className={`${inputClass()} bg-amber-100 text-amber-900 font-bold`} />
                    </Field>
                    <Field label="Corrected Optimum Moisture (%)">
                      <input readOnly value={record.correctedOptimumMoisture || "—"} className={`${inputClass()} bg-amber-100 text-amber-900 font-bold`} />
                    </Field>
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-2xl border border-emerald-300 bg-emerald-100 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="L. % Compaction (Calculated)">
                    <input readOnly value={record.percentCompaction ? `${record.percentCompaction}%` : "—"} className={`${inputClass()} font-bold ${record.compactionResult === "PASS" ? "bg-emerald-200 text-emerald-900" : record.compactionResult === "FAIL" ? "bg-rose-100 text-rose-800" : "bg-white text-slate-500"}`} />
                  </Field>
                  {record.compactionResult && (
                    <div className={`flex items-center rounded-xl px-4 py-2 text-sm font-bold ${record.compactionResult === "PASS" ? "bg-emerald-200 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>
                      Result: {record.compactionResult}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!isReadOnly && (
            <button type="button" onClick={addTestRecord} className="w-full min-h-11 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-sm font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors">
              + Add Test Record
            </button>
          )}
          {!testRecords.length && (
            <p className="text-center text-sm font-semibold text-slate-500">No test records yet. Click &quot;+ Add Test Record&quot; to begin.</p>
          )}
        </div>
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-2xl sm:border">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Back</button>
        {canComplete && (
          <button
            type="button"
            onClick={downloadReportPdf}
            disabled={pdfGenerating}
            className="min-h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pdfGenerating ? "Generating…" : "Download PDF"}
          </button>
        )}
        {!isReadOnly && <button type="button" onClick={() => saveReport(report)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Save Draft</button>}
        {!isReadOnly && <button type="button" onClick={completeReport} disabled={!canComplete} className="min-h-11 rounded-2xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">Finish Report</button>}
      </div>
    </div>
  );
}

const SAMPLE_TYPE_OPTIONS = [
  "Soil",
  "Concrete cylinders",
  "Grout cubes",
  "Asphalt cores or plugs"
];

function SamplesCollectionReportPage({ log, activityId, reportId, onChange, onBack }) {
  const activity = (log.activities || []).find((item) => item.id === activityId);
  const persistedReport = (activity?.reports || []).find((item) => item.id === reportId);
  const [localReport, setLocalReport] = useState(persistedReport || null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const report = localReport || persistedReport;
  const isReadOnly = [DAILY_LOG_STATUS.SUBMITTED, DAILY_LOG_STATUS.APPROVED].includes(log.status);
  const canComplete = Boolean(
    String(report?.sampleType || "").trim() &&
    String(report?.castDate || "").trim() &&
    String(report?.specimenCount || "").trim()
  );

  async function downloadReportPdf() {
    if (!report) return;
    setPdfGenerating(true);
    try {
      await generateSamplesStandalonePdf(report, { download: true });
    } catch (err) {
      window.alert("Could not generate PDF: " + (err.message || "Unknown error"));
    } finally {
      setPdfGenerating(false);
    }
  }

  if (!activity || !report) {
    return (
      <section className={cardClass()}>
        <h1 className="text-xl font-bold text-slate-950">Samples Collection Report Not Found</h1>
        <button type="button" onClick={onBack} className="mt-4 min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold">Back</button>
      </section>
    );
  }

  function saveReport(nextReport) {
    const normalized = { ...nextReport, updatedAt: new Date().toISOString() };
    setLocalReport(normalized);
    const nextLog = saveDailyLog({
      ...log,
      activities: (log.activities || []).map((item) =>
        item.id === activityId
          ? { ...item, reports: (item.reports || []).map((r) => (r.id === normalized.id ? normalized : r)), updatedAt: new Date().toISOString() }
          : item
      ),
      updatedAt: new Date().toISOString()
    });
    onChange(nextLog);
  }

  function updateReport(patch) {
    if (isReadOnly) return;
    saveReport({ ...report, ...patch });
  }

  function completeReport() {
    saveReport({ ...report, status: "completed", completedAt: new Date().toISOString() });
    onBack();
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-4 shadow-sm sm:p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-300">Field Sampling Record</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">Samples Collection Report</h1>
          <p className="mt-1 text-sm font-semibold text-slate-300">{report.projectName}</p>
        </div>
      </section>

      <section className={cardClass()}>
        <h2 className="text-lg font-bold text-slate-950">Collection Details</h2>
        <p className="mt-1 text-xs font-semibold text-slate-400">Project name is carried over from the daily log.</p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Project Name">
            <input readOnly value={report.projectName || "—"} className={`${inputClass()} bg-slate-100 font-bold text-slate-600`} />
          </Field>
          <Field label="Project Number">
            <input readOnly value={report.projectNumber || report.project_number || "—"} className={`${inputClass()} bg-slate-100 font-bold text-slate-600`} />
          </Field>
          <Field label="Sample Type *">
            <select value={report.sampleType || ""} disabled={isReadOnly} onChange={(e) => updateReport({ sampleType: e.target.value })} className={inputClass()}>
              <option value="">— Select sample type —</option>
              {SAMPLE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </Field>
          <Field label="Cast Date *">
            <input type="date" value={report.castDate || ""} disabled={isReadOnly} onChange={(e) => updateReport({ castDate: e.target.value })} className={inputClass()} />
          </Field>
          <Field label="Samples / Specimens Count *">
            <input type="number" min="0" step="1" value={report.specimenCount || ""} disabled={isReadOnly} onChange={(e) => updateReport({ specimenCount: e.target.value })} className={inputClass()} placeholder="e.g. 4" />
          </Field>
          <Field label="Date Collected">
            <input type="date" value={report.date || ""} disabled={isReadOnly} onChange={(e) => updateReport({ date: e.target.value })} className={inputClass()} />
          </Field>
          <Field label="Comments" extraClass="md:col-span-2">
            <textarea value={report.comments || ""} disabled={isReadOnly} onChange={(e) => updateReport({ comments: e.target.value })} rows={4} className={`${inputClass()} min-h-28 max-w-full resize-y py-3 leading-6`} placeholder="Sample IDs, cure conditions, pickup notes, lab destination, etc." />
          </Field>
        </div>
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-2xl sm:border">
        <button type="button" onClick={onBack} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Back</button>
        {canComplete && (
          <button
            type="button"
            onClick={downloadReportPdf}
            disabled={pdfGenerating}
            className="min-h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pdfGenerating ? "Generating…" : "Download PDF"}
          </button>
        )}
        {!isReadOnly && <button type="button" onClick={() => saveReport(report)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Save Draft</button>}
        {!isReadOnly && <button type="button" onClick={completeReport} disabled={!canComplete} className="min-h-11 rounded-2xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">Finish Report</button>}
      </div>
    </div>
  );
}

const DAILY_LOG_TABS = [
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Submitted" },
  { id: "returned", label: "Returned" },
  { id: "approved", label: "Approved" }
];

// Landing chooser shown when the technician opens Daily Logs: field testing
// records vs lab testing records (cylinder breaks, strength results).
function ReportsHome({ logCollections, navigate }) {
  const fieldCount = (logCollections.draftLogs.length || 0)
    + (logCollections.submittedLogs.length || 0)
    + (logCollections.returnedLogs.length || 0)
    + (logCollections.approvedLogs.length || 0);
  const options = [
    {
      key: "field",
      title: "Field Reports",
      description: "Daily field logs — concrete placement and density/compaction testing recorded on site.",
      meta: `${fieldCount} report${fieldCount === 1 ? "" : "s"}`,
      icon: ClipboardCheck,
      enabled: true,
      onClick: () => navigate("/technician/dashboard?view=daily-logs")
    },
    {
      key: "lab",
      title: "Lab Reports",
      description: "Laboratory testing records — cylinder breaks, strength verification, and material lab results.",
      meta: "Soil · Asphalt · Concrete",
      icon: FlaskConical,
      enabled: true,
      onClick: () => navigate("/technician/dashboard?view=lab-reports")
    }
  ];

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 py-5 sm:px-7">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Field Operations</p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Reports</h1>
        <p className="mt-1 text-xs font-semibold text-slate-400">Choose a reporting category to continue.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 p-5 sm:p-7 md:grid-cols-2">
        {options.map(({ key, title, description, meta, icon: Icon, enabled, onClick }) => (
          <button
            key={key}
            type="button"
            onClick={enabled ? onClick : undefined}
            disabled={!enabled}
            className={`group flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition ${
              enabled
                ? "cursor-pointer border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-sm"
                : "cursor-not-allowed border-dashed border-slate-200 bg-slate-50"
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${enabled ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-400"}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${enabled ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                {meta}
              </span>
            </div>
            <div>
              <h2 className={`text-lg font-bold ${enabled ? "text-slate-950" : "text-slate-500"}`}>{title}</h2>
              <p className="mt-1 text-sm font-medium leading-6 text-slate-500">{description}</p>
            </div>
            {enabled && (
              <span className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-blue-700">
                Open <Plus className="h-4 w-4 rotate-45 opacity-0" />
                <span aria-hidden="true">→</span>
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

// Lab report taxonomy. Editors are not built yet, so each type is listed as a
// catalog entry; statuses make it clear what's available vs upcoming.
const LAB_REPORT_SECTIONS = [
  {
    key: "soil",
    title: "Soil",
    icon: Layers3,
    tone: "amber",
    reports: [
      { label: "Proctor — Standard", description: "Standard Proctor moisture-density (ASTM D698)." },
      { label: "Proctor — Modified", description: "Modified Proctor moisture-density (ASTM D1557)." },
      { label: "Sieve Analysis", description: "Washed particle size distribution / gradation (ASTM D422).", route: "/technician/lab/gradation" },
      { label: "Atterberg Limits", description: "Liquid limit, plastic limit, plasticity index." },
      { label: "Hydrometer Analysis", description: "Fine-grained particle size by sedimentation." },
      { label: "CBR (California Bearing Ratio)", description: "Subgrade strength / bearing ratio." }
    ]
  },
  {
    key: "asphalt",
    title: "Asphalt",
    icon: Layers3,
    tone: "slate",
    reports: [
      { label: "Bulk Specific Gravity", description: "Bulk specific gravity & density of compacted asphalt (AASHTO T-166 / ASTM D2726).", route: "/technician/lab/asphalt-bsg" }
    ]
  },
  {
    key: "concrete",
    title: "Concrete",
    icon: HardHat,
    tone: "blue",
    reports: [
      { label: "Cylinder Break", description: "Compressive strength of concrete cylinders.", route: "/technician/lab/cylinder-break" },
      { label: "Cube Break", description: "Compressive strength of concrete cubes." },
      { label: "Core Break", description: "Compressive strength of drilled cores (ASTM C42).", route: "/technician/lab/core-break" }
    ]
  },
  {
    key: "grout",
    title: "Grout",
    icon: HardHat,
    tone: "blue",
    reports: [
      { label: "Cube Break", description: "Grout compressive strength of 2\"×2\" cubes (ASTM C109/C1107).", route: "/technician/lab/grout-cube-break" }
    ]
  }
];

const LAB_SECTION_TONE = {
  amber: { chip: "bg-amber-50 text-amber-700" },
  slate: { chip: "bg-slate-100 text-slate-600" },
  blue: { chip: "bg-blue-50 text-blue-700" }
};

function LabReportsPage({ navigate }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 py-5 sm:px-7">
        <button type="button" onClick={() => navigate("/technician/dashboard?view=reports-home")} className="text-xs font-bold text-slate-400 hover:text-white">&larr; Reports</button>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Lab Reports</h1>
        <p className="mt-1 text-xs font-semibold text-slate-400">Laboratory testing records by material.</p>
      </div>

      <div className="space-y-6 p-5 sm:p-7">
        {LAB_REPORT_SECTIONS.map(({ key, title, icon: Icon, tone, reports }) => (
          <div key={key}>
            <div className="flex items-center gap-2.5">
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${LAB_SECTION_TONE[tone].chip}`}>
                <Icon className="h-4 w-4" />
              </span>
              <h2 className="text-base font-bold text-slate-950">{title}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{reports.length}</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {reports.map((reportType) => {
                const enabled = Boolean(reportType.route);
                return (
                  <button
                    key={reportType.label}
                    type="button"
                    onClick={enabled ? () => navigate(reportType.route) : undefined}
                    disabled={!enabled}
                    className={`flex h-full flex-col gap-1.5 rounded-2xl border p-4 text-left transition ${
                      enabled
                        ? "cursor-pointer border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-sm"
                        : "cursor-not-allowed border-dashed border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${enabled ? "bg-blue-50 text-blue-700 ring-blue-100" : "bg-white text-slate-400 ring-slate-200"}`}>
                        <FlaskConical className="h-4 w-4" />
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                        {enabled ? "Available" : "Coming soon"}
                      </span>
                    </div>
                    <p className={`mt-1 text-sm font-bold ${enabled ? "text-slate-900" : "text-slate-700"}`}>{reportType.label}</p>
                    <p className="text-xs font-medium leading-5 text-slate-500">{reportType.description}</p>
                    {enabled && <span className="mt-1 text-sm font-bold text-blue-700" aria-hidden="true">Open →</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DailyLogsPage({ logCollections, initialTab = "draft", onOpenLog, onCreateLog, onDeleteLog, onRecallLog, onDownloadLogPdf }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const logsByTab = {
    draft: logCollections.draftLogs,
    submitted: logCollections.submittedLogs,
    returned: logCollections.returnedLogs,
    approved: logCollections.approvedLogs
  };
  const tabCounts = {
    draft: logCollections.draftLogs.length,
    submitted: logCollections.submittedLogs.length,
    returned: logCollections.returnedLogs.length,
    approved: logCollections.approvedLogs.length
  };
  const getSortDate = (log) => {
    if (activeTab === "submitted") return log.submittedAt || log.updatedAt || log.date;
    if (activeTab === "returned") return log.returnedAt || log.updatedAt || log.date;
    if (activeTab === "approved") return log.approvedAt || log.submittedAt || log.updatedAt || log.date;
    return log.updatedAt || log.date;
  };
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const logs = [...(logsByTab[activeTab] || [])]
    .filter((log) => {
      if (!normalizedSearch) return true;
      const projectNumber = log.projectNumber || log.project_number || log.projectNo || log.project_no || "";
      return [log.projectName, projectNumber, log.date].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
    })
    .sort((a, b) => new Date(getSortDate(b) || 0) - new Date(getSortDate(a) || 0));
  const label = DAILY_LOG_TABS.find((tab) => tab.id === activeTab)?.label || "Draft";

  return (
    <>
      <section className={cardClass()}>
        <div className="flex items-center justify-between gap-3">
          {commandCenterTitle("Daily Logs", "Review Daily Field Logs by status.")}
          <button type="button" onClick={onCreateLog} className="min-h-10 shrink-0 rounded-xl bg-slate-950 px-3 text-sm font-bold text-white sm:min-h-11 sm:rounded-2xl sm:px-4">
            <span className="sm:hidden">+ New</span>
            <span className="hidden sm:inline">+ Create Daily Log</span>
          </button>
        </div>
        <div className="mt-3">
          <StatusTabs tabs={DAILY_LOG_TABS} activeTab={activeTab} onChange={setActiveTab} counts={tabCounts} />
        </div>
      </section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search Project, Project #, or Date"
          className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100 sm:max-w-[350px]"
        />
      </div>
      <section className="space-y-2">
        {logs.map((log) => (
          <DailyLogListRow
            key={log.id}
            log={log}
            activeTab={activeTab}
            onOpen={() => onOpenLog(log)}
            onDelete={() => onDeleteLog(log)}
            onRecall={() => onRecallLog(log)}
            onDownloadPdf={() => onDownloadLogPdf(log)}
          />
        ))}
      </section>
      {!logs.length && (
        <EmptyState
          title={`No ${label.toLowerCase()} Daily Logs`}
          description="Daily Logs will appear here as field execution progresses."
          actionLabel={activeTab === "draft" ? "Create Daily Log" : undefined}
          onAction={onCreateLog}
        />
      )}
    </>
  );
}

function SimplePanel({ icon: Icon, kicker, title, description }) {
  return (
    <section className={cardClass()}>
      <Icon className="h-7 w-7 text-blue-700" />
      <div className="mt-4">{sectionTitle(kicker, title, description)}</div>
    </section>
  );
}

function ProfileValue({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-900">{value || "-"}</p>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm font-bold text-slate-800">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
      />
    </label>
  );
}

function CertificationStatus({ status }) {
  const tone = {
    Active: "border-emerald-200 bg-emerald-50 text-emerald-800",
    "Expiring Soon": "border-amber-200 bg-amber-50 text-amber-800",
    Expired: "border-rose-200 bg-rose-50 text-rose-800"
  }[status] || "border-slate-200 bg-slate-50 text-slate-700";
  return <span className={`rounded-full border px-3 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}

function TechnicianProfilePage({ profile, companyName, projectOptions, logCollections, timeCardCollections }) {
  const storageKey = `imqcore:technician-profile:${profile?.id || profile?.email || "local"}`;
  const [draft, setDraft] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  });

  function updateDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function saveProfile() {
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
  }

  function handlePhoto(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => updateDraft({ photoUrl: reader.result });
    reader.readAsDataURL(file);
  }

  const fullName = profile?.full_name || profile?.name || "Field Technician";
  const email = profile?.email || profile?.user_email || "-";
  const roleLabel = profile?.role || "Field Engineer";
  const employeeId = profile?.employee_id || profile?.id || "Pending";
  const certifications = draft.certifications || [
    { name: "ACI Grade I", number: "ACI-1024", issueDate: "2025-01-15", expirationDate: "2027-01-15", status: "Active" },
    { name: "OSHA 10", number: "OSHA-10", issueDate: "2024-04-10", expirationDate: "2027-04-10", status: "Active" },
    { name: "First Aid / CPR", number: "CPR-221", issueDate: "2024-09-01", expirationDate: "2026-09-01", status: "Expiring Soon" }
  ];
  const notificationDefaults = {
    dailyLogReturned: true,
    dailyLogApproved: true,
    timesheetReturned: true,
    timesheetApproved: true,
    managerComments: true,
    systemNotifications: true,
    emailNotifications: true,
    mobileNotifications: false
  };
  const notifications = { ...notificationDefaults, ...(draft.notifications || {}) };
  const activitySummary = [
    { label: "Daily Logs Submitted", value: logCollections.submittedLogs.length + logCollections.approvedLogs.length },
    { label: "Timesheets Submitted", value: timeCardCollections.submittedTimeCards.length + timeCardCollections.approvedTimeCards.length },
    { label: "Returned Records", value: logCollections.returnedLogs.length + timeCardCollections.returnedTimeCards.length },
    { label: "Approved Records", value: logCollections.approvedLogs.length + timeCardCollections.approvedTimeCards.length }
  ];

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-4 shadow-sm sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-300">Command Center</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Profile</h1>
      </section>

      <section className={cardClass()}>
        {commandCenterTitle("Personal Information")}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="rounded-3xl bg-slate-50 p-4 text-center">
            <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-3xl font-bold text-white">
              {draft.photoUrl ? <img src={draft.photoUrl} alt="" className="h-full w-full object-cover" /> : fullName.slice(0, 1)}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800">
                <Camera className="h-4 w-4" /> Take Photo
                <input type="file" accept="image/*" capture="environment" onChange={(event) => handlePhoto(event.target.files?.[0])} className="hidden" />
              </label>
              <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-2xl bg-slate-950 px-3 text-sm font-bold text-white">
                Upload Photo
                <input type="file" accept="image/*" onChange={(event) => handlePhoto(event.target.files?.[0])} className="hidden" />
              </label>
              <button type="button" className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800">
                Crop Photo
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ProfileValue label="Full Name" value={fullName} />
            <ProfileValue label="Employee ID" value={employeeId} />
            <ProfileValue label="Email" value={email} />
            <Field label="Phone Number">
              <input value={draft.phone || profile?.phone || ""} onChange={(event) => updateDraft({ phone: event.target.value })} className={inputClass()} />
            </Field>
            <ProfileValue label="Role" value={roleLabel} />
            <ProfileValue label="Company" value={companyName || profile?.company_name} />
          </div>
        </div>
      </section>

      <section className={cardClass()}>
        {commandCenterTitle("Employment Information")}
        <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ProfileValue label="Job Title" value={profile?.job_title || "Field Inspector"} />
          <ProfileValue label="Assigned Projects" value={projectOptions.length} />
          <ProfileValue label="Manager" value={profile?.manager_name || "Operations Manager"} />
          <ProfileValue label="Hire Date" value={profile?.hire_date || "Pending"} />
          <ProfileValue label="Office Location" value={profile?.office_location || "Field Operations"} />
          <ProfileValue label="Employment Status" value={profile?.employment_status || "Active"} />
        </dl>
      </section>

      <section className={cardClass()}>
        {commandCenterTitle("Certifications")}
        <div className="mt-4 grid grid-cols-1 gap-3">
          {certifications.map((certification) => (
            <article key={`${certification.name}-${certification.number}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-base font-bold text-slate-950">{certification.name}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{certification.number}</p>
                </div>
                <CertificationStatus status={certification.status} />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs font-bold text-slate-600 sm:grid-cols-2">
                <span className="rounded-xl bg-white px-3 py-2">Issued: {certification.issueDate}</span>
                <span className="rounded-xl bg-white px-3 py-2">Expires: {certification.expirationDate}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={cardClass()}>
        {commandCenterTitle("Emergency Contact")}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Contact Name"><input value={draft.emergencyName || ""} onChange={(event) => updateDraft({ emergencyName: event.target.value })} className={inputClass()} /></Field>
          <Field label="Relationship"><input value={draft.emergencyRelationship || ""} onChange={(event) => updateDraft({ emergencyRelationship: event.target.value })} className={inputClass()} /></Field>
          <Field label="Phone Number"><input value={draft.emergencyPhone || ""} onChange={(event) => updateDraft({ emergencyPhone: event.target.value })} className={inputClass()} /></Field>
          <Field label="Alternate Phone"><input value={draft.emergencyAlternatePhone || ""} onChange={(event) => updateDraft({ emergencyAlternatePhone: event.target.value })} className={inputClass()} /></Field>
        </div>
      </section>

      <section className={cardClass()}>
        {commandCenterTitle("Notification Preferences")}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {[
            ["dailyLogReturned", "Daily Log Returned"],
            ["dailyLogApproved", "Daily Log Approved"],
            ["timesheetReturned", "Timesheet Returned"],
            ["timesheetApproved", "Timesheet Approved"],
            ["managerComments", "Manager Comments"],
            ["systemNotifications", "System Notifications"],
            ["emailNotifications", "Email Notifications"],
            ["mobileNotifications", "Mobile Notifications"]
          ].map(([key, label]) => (
            <ToggleRow
              key={key}
              label={label}
              checked={Boolean(notifications[key])}
              onChange={(checked) => updateDraft({ notifications: { ...notifications, [key]: checked } })}
            />
          ))}
        </div>
      </section>

      <section className={cardClass()}>
        {commandCenterTitle("Security")}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800"><KeyRound className="h-4 w-4" /> Change Password</button>
          <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white"><ShieldCheck className="h-4 w-4" /> Enable MFA</button>
          <button type="button" className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">View Active Sessions</button>
        </div>
      </section>

      <section className={cardClass()}>
        {commandCenterTitle("My Activity Summary", "Last 30 days")}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {activitySummary.map((item) => (
            <article key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{item.label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-950">{item.value}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={cardClass()}>
        {commandCenterTitle("My Assigned Projects")}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {projectOptions.map((project) => (
            <article key={project.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-base font-bold text-slate-950">{project.name}</p>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs font-bold text-slate-600 sm:grid-cols-3">
                <span className="rounded-xl bg-white px-3 py-2">Field Inspector</span>
                <span className="rounded-xl bg-white px-3 py-2">Active</span>
                <span className="rounded-xl bg-white px-3 py-2">Start: Pending</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={cardClass()}>
        {commandCenterTitle("My Equipment")}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {["Tablet", "Vehicle", "GPS Unit", "Testing Equipment"].map((asset) => (
            <ProfileValue key={asset} label={asset} value="Not assigned" />
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm">
        <button type="button" onClick={saveProfile} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white sm:w-auto">
          <Save className="h-4 w-4" /> Save Profile
        </button>
      </div>
    </div>
  );
}

export default function FieldEngineerWorkspace({
  view,
  profile,
  defaultProjectId,
  projectLabel,
  assignedProjects = [],
  companyName,
  userId,
  activeDailyLogId,
  activeActivityId,
  activeReportId,
  loading,
  error,
  navigate
}) {
  const [dailyLogs, setDailyLogs] = useState([]);
  const [activeLog, setActiveLog] = useState(null);
  const [timeCards, setTimeCards] = useState([]);
  const [activeTimeCard, setActiveTimeCard] = useState(null);
  const allowedViews = new Set([
    "command-center",
    "concrete-report",
    "compaction-report",
    "asphalt-report",
    "infiltration-report",
    "proctor-report",
    "samples-report",
    "reports-home",
    "lab-reports",
    "daily-logs",
    "create-daily-log",
    "draft-logs",
    "submitted-logs",
    "returned-logs",
    "approved-logs",
    "time-card",
    "time-cards",
    "submitted-time-cards",
    "returned-time-cards",
    "approved-time-cards",
    "activity-history",
    "profile",
    "notifications"
  ]);
  const currentView = allowedViews.has(view) ? view : "command-center";
  const dailyLogAccess = useMemo(() => ({
    companyId: profile?.company_id || profile?.organization_id || null,
    companyName,
    projectId: defaultProjectId,
    projectName: projectLabel,
    userId: userId || profile?.id || null,
    userName: profile?.full_name || "Field Technician"
  }), [companyName, defaultProjectId, profile?.company_id, profile?.full_name, profile?.id, profile?.organization_id, projectLabel, userId]);
  const visibleDailyLogs = useMemo(() => filterDailyLogsForAccess(dailyLogs, dailyLogAccess), [dailyLogAccess, dailyLogs]);
  const logCollections = useMemo(() => getDailyLogCollections(visibleDailyLogs), [visibleDailyLogs]);
  const timeCardCollections = useMemo(() => getTimeCardCollections(timeCards), [timeCards]);
  const projectOptions = useMemo(() => {
    if (assignedProjects.length) return assignedProjects;
    return [{
      id: defaultProjectId,
      name: projectLabel,
      number: String(defaultProjectId || ""),
      location: ""
    }];
  }, [assignedProjects, defaultProjectId, projectLabel]);
  // Office-based employees are overtime-exempt: every hour logs as regular time,
  // so a 9- or 10-hour day never produces OT. Driven by the profile's exempt flag
  // or an office employment type/role.
  const isOfficeEmployee = Boolean(
    profile?.overtime_exempt ||
    String(profile?.employment_type || "").toLowerCase().includes("office") ||
    String(profile?.role || "").toLowerCase().includes("office")
  );

  useEffect(() => {
    const logs = getDailyLogs();
    if (logs.length) {
      setDailyLogs(logs);
      if (activeDailyLogId) {
        const matchedLog = logs.find((log) => log.id === activeDailyLogId);
        if (matchedLog) setActiveLog(matchedLog);
      }
      return;
    }
    const starter = saveDailyLog(createDailyLog({
      projectLabel,
      defaultProjectId,
      technicianName: profile?.full_name || "Field Technician",
      companyId: profile?.company_id || profile?.organization_id || null,
      companyName,
      userId: userId || profile?.id || null
    }));
    setDailyLogs([starter]);
  }, [activeDailyLogId, companyName, defaultProjectId, profile?.company_id, profile?.full_name, profile?.id, profile?.organization_id, projectLabel, userId]);

  useEffect(() => {
    const cards = getTimeCards();
    setTimeCards(cards);
    setActiveTimeCard(cards.find((card) => card.status === TIME_CARD_STATUS.DRAFT || card.status === TIME_CARD_STATUS.RETURNED) || null);

    // Sync with the shared timesheets table: restore any timesheet missing from
    // this browser (new device/profile) and merge approval/return decisions made
    // on the manager's machine into the local copies.
    async function syncFromDatabase() {
      let changed = false;
      const technicianName = profile?.full_name || "";
      if (technicianName) {
        const remoteCards = await fetchTimesheetsForTechnician(technicianName);
        const localIds = new Set(getTimeCards().map((card) => String(card.id)));
        remoteCards.forEach((remoteCard) => {
          if (localIds.has(String(remoteCard.id))) return;
          changed = true;
          saveTimeCard(remoteCard);
        });
      }
      const syncableIds = getTimeCards()
        .filter((card) => card.status !== TIME_CARD_STATUS.DRAFT)
        .map((card) => String(card.id));
      if (syncableIds.length) {
        const updates = await fetchTimesheetStatusUpdates(syncableIds);
        updates.forEach((update) => {
          const local = getTimeCards().find((card) => String(card.id) === String(update.id));
          if (!local || local.status === update.status) return;
          changed = true;
          saveTimeCard({
            ...local,
            status: update.status,
            reviewedBy: update.reviewed_by || local.reviewedBy || "",
            reviewed_by: update.reviewed_by || local.reviewed_by || "",
            reviewedAt: update.reviewed_at || local.reviewedAt || "",
            reviewed_at: update.reviewed_at || local.reviewed_at || "",
            ...(update.status === TIME_CARD_STATUS.APPROVED ? { approvedAt: update.reviewed_at, approved_at: update.reviewed_at } : {}),
            ...(update.status === TIME_CARD_STATUS.RETURNED ? { returnedAt: update.reviewed_at, returned_at: update.reviewed_at, managerComment: update.manager_comment || "", reviewComments: update.manager_comment || "", review_comments: update.manager_comment || "" } : {})
          });
        });
      }
      if (changed) setTimeCards(getTimeCards());
    }
    syncFromDatabase();
  }, []);

  useEffect(() => {
    // Same pattern for daily logs: restore logs submitted from another device
    // and merge approve/return decisions made on the manager's machine.
    async function syncDailyLogsFromDatabase() {
      const changed = await syncDailyLogsFromSupabase({ userId: userId || profile?.id });
      if (changed) setDailyLogs(getDailyLogs());
    }
    syncDailyLogsFromDatabase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentView !== "create-daily-log" && currentView !== "daily-logs") return;
    const logs = getDailyLogs();
    setDailyLogs(logs);
    if (activeDailyLogId) {
      const matchedLog = logs.find((log) => log.id === activeDailyLogId);
      if (matchedLog) setActiveLog(matchedLog);
    }
  }, [activeDailyLogId, currentView]);

  function refreshLogs(nextLog) {
    const logs = getDailyLogs();
    const mergedLogs = nextLog
      ? (logs.some((log) => log.id === nextLog.id)
          ? logs.map((log) => (log.id === nextLog.id ? nextLog : log))
          : [nextLog, ...logs])
      : logs;
    setDailyLogs(mergedLogs);
    if (nextLog) setActiveLog(nextLog);
  }

  function refreshTimeCards(nextCard) {
    const cards = getTimeCards();
    setTimeCards(cards);
    if (nextCard) setActiveTimeCard(nextCard);
  }

  function createLog() {
    const log = saveDailyLog(createDailyLog({
      projectLabel,
      defaultProjectId,
      technicianName: profile?.full_name || "Field Technician",
      companyId: profile?.company_id || profile?.organization_id || null,
      companyName,
      userId: userId || profile?.id || null
    }));
    refreshLogs(log);
    navigate(`/technician/daily-log/${log.id}`);
  }

  function openLog(log) {
    setActiveLog(log);
    navigate(`/technician/daily-log/${log.id}`);
  }

  function deleteLog(log) {
    if (!window.confirm("Delete this draft Daily Log?")) return;
    deleteDailyLog(log.id);
    refreshLogs(null);
  }

  function recallLog(log) {
    const recalledAt = new Date().toISOString();
    const activities = (log.activities || []).map((activity) => ({
      ...activity,
      concreteReports: (activity.concreteReports || []).map((report) => {
        const currentStatus = String(report.status || "").toLowerCase();
        if (!["completed", "submitted", "approved", "finalized"].includes(currentStatus)) return report;
        return {
          ...report,
          status: "draft",
          previousStatus: report.previousStatus || report.status || "",
          recalledAt,
          completedAt: "",
          submittedAt: "",
          completed_at: "",
          submitted_at: "",
          pdfGenerationStatus: report.pdfGenerationStatus || report.pdf_generation_status,
          pdf_generation_status: report.pdf_generation_status || report.pdfGenerationStatus
        };
      }),
      reports: (activity.reports || []).map((report) => {
        const currentStatus = String(report.status || "").toLowerCase();
        if (!["completed", "submitted", "approved", "finalized"].includes(currentStatus)) return report;
        return {
          ...report,
          status: "draft",
          previousStatus: report.previousStatus || report.status || "",
          recalledAt,
          completedAt: "",
          submittedAt: "",
          completed_at: "",
          submitted_at: ""
        };
      })
    }));
    const recalled = saveDailyLog({
      ...log,
      activities,
      status: DAILY_LOG_STATUS.DRAFT,
      submittedAt: "",
      submitted_at: "",
      recalledAt,
      recalled_at: recalledAt,
      updatedAt: recalledAt
    }, { allowStatusDowngrade: true });
    refreshLogs(recalled);
  }

  async function viewLogPdf(log) {
    try {
      await openDailyLogPdf(log, { download: false });
    } catch (error) {
      window.alert(error.message || "PDF is still being generated. Please try again in a few seconds.");
    }
  }

  async function downloadLogPdf(log) {
    try {
      await openDailyLogPdf(log, { download: true });
    } catch (error) {
      window.alert(error.message || "PDF is still being generated. Please try again in a few seconds.");
    }
  }

  async function regenerateLogPdf(log) {
    if (!log) {
      window.alert("Unable to regenerate Daily Log PDF because the Daily Log could not be found.");
      return null;
    }

    try {
      const withPdf = await regenerateDailyLogPdf(log);
      refreshLogs(withPdf);
      if ((withPdf.pdfGenerationStatus || withPdf.pdf_generation_status) === "failed") {
        window.alert(withPdf.pdfGenerationFailureReason || withPdf.pdf_generation_failure_reason || "PDF generation failed. Please regenerate.");
        return withPdf;
      }
      window.alert("Daily Log PDF regenerated. Click View PDF to open the latest version.");
      return withPdf;
    } catch (error) {
      window.alert(error.message || "Unable to regenerate Daily Log PDF. Please try again.");
      throw error;
    }
  }

  function createNewTimeCard() {
    const defaultProject = projectOptions[0] || {};
    const draftCard = createTimeCard({
      projectName: defaultProject.name || projectLabel,
      projectId: defaultProject.id || defaultProjectId,
      projectNumber: defaultProject.number || String(defaultProject.id || defaultProjectId || ""),
      projectLocation: defaultProject.location || "",
      companyId: profile?.company_id || profile?.organization_id || "",
      technicianName: profile?.full_name || "Field Technician"
    });
    // One timesheet per employee per week — reopen the editable card for this week if one exists.
    const weekStart = draftCard.weekStartDate || draftCard.week_start_date || draftCard.date;
    const cardsForWeek = getTimeCards()
      .filter((card) => (card.weekStartDate || card.week_start_date || card.date) === weekStart)
      .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
    const editableCard = cardsForWeek.find((card) =>
      [TIME_CARD_STATUS.DRAFT, TIME_CARD_STATUS.REJECTED, TIME_CARD_STATUS.RETURNED].includes(card.status)
    );
    // Never start a second timesheet for a filed week — open the filed copy read-only instead.
    const lockedCard = cardsForWeek.find((card) => LOCKED_TIME_CARD_STATUSES.includes(card.status));
    const card = editableCard || (lockedCard ? null : saveTimeCard(draftCard));
    refreshTimeCards(card || lockedCard);
    navigate("/technician/dashboard?view=time-card");
  }

  function openTimeCard(card) {
    // A leftover duplicate draft for an already-filed week opens the filed copy instead.
    if (!LOCKED_TIME_CARD_STATUSES.includes(card.status)) {
      const filedCard = findFiledCardForWeek(card);
      if (filedCard) {
        window.alert(`This week already has a ${filedCard.status === TIME_CARD_STATUS.APPROVED || filedCard.status === TIME_CARD_STATUS.COMPLETED ? "approved" : "submitted"} timesheet. Opening it instead — you can delete the duplicate draft from the Drafts tab.`);
        setActiveTimeCard(filedCard);
        navigate("/technician/dashboard?view=time-card");
        return;
      }
    }
    setActiveTimeCard(card);
    navigate("/technician/dashboard?view=time-card");
  }

  function openTimeCardWeek(targetWeekStart) {
    const cardsForWeek = getTimeCards()
      .filter((item) => (item.weekStartDate || item.week_start_date || item.date) === targetWeekStart)
      .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
    // A filed week always opens its filed copy — an editable leftover must not shadow it.
    const existingCard = cardsForWeek.find((item) => LOCKED_TIME_CARD_STATUSES.includes(item.status))
      || cardsForWeek.find((item) =>
        [TIME_CARD_STATUS.DRAFT, TIME_CARD_STATUS.REJECTED, TIME_CARD_STATUS.RETURNED].includes(item.status)
      )
      || cardsForWeek[0];
    if (existingCard) {
      setActiveTimeCard(existingCard);
      return;
    }
    const defaultProject = projectOptions[0] || {};
    // Unsaved template for the target week — persisted only once the technician edits it.
    setActiveTimeCard(normalizeWeeklyCard({
      ...createTimeCard({
        projectName: defaultProject.name || projectLabel,
        projectId: defaultProject.id || defaultProjectId,
        projectNumber: defaultProject.number || String(defaultProject.id || defaultProjectId || ""),
        projectLocation: defaultProject.location || "",
        companyId: profile?.company_id || profile?.organization_id || "",
        technicianName: profile?.full_name || "Field Technician"
      }),
      date: targetWeekStart,
      weekStartDate: targetWeekStart,
      week_start_date: targetWeekStart
    }));
  }

  function navigateTimeCardWeek(card, direction) {
    const currentWeekStart = card.weekStartDate || card.week_start_date || card.date;
    const parsed = new Date(`${currentWeekStart}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    parsed.setDate(parsed.getDate() + direction * 7);
    openTimeCardWeek(getWeekStartFor(parsed));
  }

  // Calendar jump: any picked date opens the timesheet week containing it,
  // clamped to the current week since hours cannot be logged ahead of time.
  function jumpToTimeCardDate(dateValue) {
    if (!dateValue) return;
    const targetWeekStart = getWeekStartFor(dateValue);
    const currentWeekStart = getWeekStartFor(new Date());
    openTimeCardWeek(targetWeekStart > currentWeekStart ? currentWeekStart : targetWeekStart);
  }

  function removeTimeCard(card) {
    if (card.status !== TIME_CARD_STATUS.DRAFT) return;
    if (!window.confirm("Delete this draft Timesheet?")) return;
    deleteTimeCard(card.id);
    const cards = getTimeCards();
    setTimeCards(cards);
    setActiveTimeCard(cards.find((item) => item.status === TIME_CARD_STATUS.DRAFT || item.status === TIME_CARD_STATUS.RETURNED) || null);
    navigate("/technician/dashboard?view=time-cards");
  }

  function recallTimeCard(card) {
    // Only an undecided submission can be recalled — never an approved sheet.
    if (![TIME_CARD_STATUS.SUBMITTED, TIME_CARD_STATUS.PENDING_REVIEW].includes(card.status)) return;
    const recalled = saveTimeCard({
      ...card,
      status: TIME_CARD_STATUS.DRAFT,
      submittedAt: "",
      updatedAt: new Date().toISOString()
    });
    refreshTimeCards(recalled);
  }

  async function viewTimeCardPdf(card) {
    try {
      await openTimeCardPdf(card, { download: false });
    } catch (error) {
      window.alert(error.message || "PDF is still being generated. Please try again in a few seconds.");
    }
  }

  async function downloadTimeCardPdf(card) {
    try {
      await openTimeCardPdf(card, { download: true });
    } catch (error) {
      window.alert(error.message || "PDF is still being generated. Please try again in a few seconds.");
    }
  }

  function getConcreteReportRoute(log, activityId, report) {
    const linkedReportId = report?.linkedReportId || report?.linked_report_id || (/^\d+$/.test(String(report?.id || "")) ? report.id : "");
    const routeReportId = /^\d+$/.test(linkedReportId) ? linkedReportId : "new";
    const query = new URLSearchParams({
      projectId: String(log.projectId || log.project_id || defaultProjectId || ""),
      dailyLogId: String(log.id),
      activityId: String(activityId),
      sourceReportId: String(report?.id || ""),
      returnTo: `/technician/daily-log/${log.id}`
    });
    return `/technician/daily-log/${log.id}/activity/${activityId}/concrete-report/${routeReportId}?${query.toString()}`;
  }

  function getCompactionReportRoute(log, activityId, report) {
    return `/technician/daily-log/${log.id}/activity/${activityId}/compaction-report/${report?.id || "new"}?returnTo=${encodeURIComponent(`/technician/daily-log/${log.id}`)}`;
  }

  function getAsphaltReportRoute(log, activityId, report) {
    return `/technician/daily-log/${log.id}/activity/${activityId}/asphalt-report/${report?.id || "new"}?returnTo=${encodeURIComponent(`/technician/daily-log/${log.id}`)}`;
  }

  function getInfiltrationReportRoute(log, activityId, report) {
    return `/technician/daily-log/${log.id}/activity/${activityId}/infiltration-report/${report?.id || "new"}?returnTo=${encodeURIComponent(`/technician/daily-log/${log.id}`)}`;
  }

  function openReportRoute(reportUrl) {
    navigate(reportUrl);
  }

  function getConcreteReportPdfUrl(report) {
    return report?.finalPdfUrl ||
      report?.final_pdf_url ||
      report?.pdfUrl ||
      report?.pdf_url ||
      report?.generatedPdfUrl ||
      report?.generated_pdf_url ||
      report?.pdfDataUrl ||
      "";
  }

  function isConcreteReportPdfReady(report) {
    const pdfStatus = report?.pdfGenerationStatus || report?.pdf_generation_status;
    return Boolean(getConcreteReportPdfUrl(report)) ||
      pdfStatus === "generated" ||
      report?.status === "Completed" ||
      report?.status === "completed";
  }

  function openPdfUrl(pdfUrl) {
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (isDesktop) {
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.href = pdfUrl;
  }

  function createConcreteReportForActivity(log, activityId) {
    const activity = (log.activities || []).find((item) => item.id === activityId);
    if (!activity) return null;
    const existingActivityReport = [...(activity.concreteReports || []), ...(activity.reports || [])][0];
    if (existingActivityReport) {
      if ((existingActivityReport.type || existingActivityReport.reportType || "") === "Concrete Report" || existingActivityReport.linkedReportId || existingActivityReport.dfrNumber) {
        openReportRoute(getConcreteReportRoute(log, activityId, existingActivityReport));
      } else {
        window.alert("Only one report can be attached to each activity.");
      }
      return existingActivityReport;
    }
    const existingDraftReport = (activity.concreteReports || []).find((report) => {
      const status = String(report.status || "").toLowerCase();
      return !["completed", "submitted", "approved", "finalized"].includes(status) && !report.linkedReportId;
    });
    if (existingDraftReport) {
      openReportRoute(getConcreteReportRoute(log, activityId, existingDraftReport));
      return existingDraftReport;
    }
    const report = createConcreteReport({
      dailyLogId: log.id,
      daily_log_id: log.id,
      activityId,
      activity_id: activityId,
      projectId: log.projectId || defaultProjectId,
      project_id: log.projectId || defaultProjectId,
      technicianId: log.technicianId || log.userId || userId || "",
      technician_id: log.technicianId || log.userId || userId || "",
      technicianName: log.technicianName || profile?.full_name || "",
      status: "draft",
      placementLocation: activity.location || "",
      dateSampled: log.date || "",
      weatherCondition: log.weatherCondition || log.weather || "",
      temperature: log.temperature || log.maxTemperature || log.minTemperature || "",
      mixDesignNumber: log.mixDesignNumber || "",
      batchPlantSupplier: [log.batchPlant, log.supplier].filter(Boolean).join(" / "),
      slumpSpreadRange: [log.slumpRange, log.spreadRange].filter(Boolean).join(" / "),
      airContentRange: log.airContentRange || "",
      temperatureRange: log.temperatureRange || "",
      unitWeight: log.unitWeight || ""
    });
    const nextLog = saveDailyLog({
      ...log,
      activities: log.activities.map((item) => (
        item.id === activityId
          ? {
              ...item,
              concreteReports: [...(item.concreteReports || []), report],
              updatedAt: new Date().toISOString()
            }
          : item
      )),
      updatedAt: new Date().toISOString()
    });
    refreshLogs(nextLog);
    openReportRoute(getConcreteReportRoute(nextLog, activityId, report));
    return report;
  }

  function createCompactionReportForActivity(log, activityId) {
    const activity = (log.activities || []).find((item) => item.id === activityId);
    if (!activity) return null;
    const existingActivityReport = [...(activity.concreteReports || []), ...(activity.reports || [])][0];
    if (existingActivityReport) {
      if (String(existingActivityReport.type || existingActivityReport.reportType || "").toLowerCase().includes("compaction")) {
        openReportRoute(getCompactionReportRoute(log, activityId, existingActivityReport));
      } else {
        window.alert("Only one report can be attached to each activity.");
      }
      return existingActivityReport;
    }
    const report = {
      id: crypto.randomUUID(),
      type: "Compaction Report",
      reportType: "Compaction Report",
      report_type: "Compaction Report",
      status: "draft",
      dailyLogId: log.id,
      daily_log_id: log.id,
      activityId,
      activity_id: activityId,
      projectName: log.projectName || projectLabel,
      project_name: log.projectName || projectLabel,
      projectNumber: log.projectNumber || log.project_number || String(defaultProjectId || ""),
      project_number: log.projectNumber || log.project_number || String(defaultProjectId || ""),
      section: activity.location || "",
      date: log.date || new Date().toISOString().slice(0, 10),
      client: log.client || log.clientName || companyName || "",
      testFor: "",
      test_for: "",
      serialNumber: "",
      serial_number: "",
      gaugeModel: "",
      gauge_model: "",
      calibrationDueDate: "",
      calibration_due_date: "",
      standardizedGauge: "",
      standardized_gauge: "",
      standardDensity: "",
      standard_density: "",
      standardMoisture: "",
      standard_moisture: "",
      specificGravityPlus4: "",
      specific_gravity_plus4: "",
      materialType: "",
      material_type: "",
      materialName: "",
      material_name: "",
      maximumDryDensity: "",
      maximum_dry_density: "",
      percentOptimumMoisture: "",
      percent_optimum_moisture: "",
      percentPassingNo4: "",
      percent_passing_no4: "",
      correctedMaximumDryDensity: "",
      corrected_maximum_dry_density: "",
      correctedOptimumMoisture: "",
      corrected_optimum_moisture: "",
      percentMinimumDensityRequired: "",
      percent_minimum_density_required: "",
      testRecords: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const nextLog = saveDailyLog({
      ...log,
      activities: log.activities.map((item) => (
        item.id === activityId
          ? {
              ...item,
              reports: [...(item.reports || []), report],
              updatedAt: new Date().toISOString()
            }
          : item
      )),
      updatedAt: new Date().toISOString()
    });
    refreshLogs(nextLog);
    openReportRoute(getCompactionReportRoute(nextLog, activityId, report));
    return report;
  }

  function openConcreteReport(log, activityId, reportId, options = {}) {
    if (!log?.id || !activityId || !reportId) return;
    const activity = (log.activities || []).find((item) => item.id === activityId);
    const report = (activity?.concreteReports || []).find((item) => (
      item.id === reportId ||
      String(item.linkedReportId || item.linked_report_id || "") === String(reportId)
    ));
    if (options.mode === "edit") {
      const reportUrl = getConcreteReportRoute(log, activityId, report || { id: reportId });
      const separator = reportUrl.includes("?") ? "&" : "?";
      openReportRoute(`${reportUrl}${separator}mode=edit`);
      return;
    }
    const pdfUrl = getConcreteReportPdfUrl(report);
    if (pdfUrl) {
      openPdfUrl(pdfUrl);
      return;
    }
    if (isConcreteReportPdfReady(report)) {
      window.alert("The submitted Concrete Report PDF is still being generated or could not be found. Please try again in a moment.");
      return;
    }
    openReportRoute(getConcreteReportRoute(log, activityId, report || { id: reportId }));
  }

  function openCompactionReport(log, activityId, reportId) {
    if (!log?.id || !activityId || !reportId) return;
    const activity = (log.activities || []).find((item) => item.id === activityId);
    const report = (activity?.reports || []).find((item) => item.id === reportId);
    openReportRoute(getCompactionReportRoute(log, activityId, report || { id: reportId }));
  }

  function createAsphaltReportForActivity(log, activityId) {
    const activity = (log.activities || []).find((item) => item.id === activityId);
    if (!activity) return null;
    const existingActivityReport = [...(activity.concreteReports || []), ...(activity.reports || [])][0];
    if (existingActivityReport) {
      const type = String(existingActivityReport.type || existingActivityReport.reportType || "").toLowerCase();
      if (type.includes("asphalt")) {
        openReportRoute(getAsphaltReportRoute(log, activityId, existingActivityReport));
      } else {
        window.alert("Only one report can be attached to each activity.");
      }
      return existingActivityReport;
    }
    const report = {
      id: crypto.randomUUID(),
      type: "Asphalt Compaction Report",
      reportType: "Asphalt Compaction Report",
      report_type: "Asphalt Compaction Report",
      status: "draft",
      dailyLogId: log.id,
      daily_log_id: log.id,
      activityId,
      activity_id: activityId,
      projectName: log.projectName || projectLabel,
      project_name: log.projectName || projectLabel,
      projectNumber: log.projectNumber || log.project_number || String(defaultProjectId || ""),
      project_number: log.projectNumber || log.project_number || String(defaultProjectId || ""),
      date: log.date || new Date().toISOString().slice(0, 10),
      client: log.client || log.clientName || companyName || "",
      serialNumber: "",
      gaugeModel: "",
      calibrationDueDate: "",
      standardizedGauge: "",
      standardDensity: "",
      standardMoisture: "",
      materialGroups: [{ id: crypto.randomUUID(), mixId: "", marshallValue: "", requiredCompaction: "", testRecords: [] }],
      coresTaken: "",
      coreCount: "",
      coreLocations: "",
      coreNotes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const nextLog = saveDailyLog({
      ...log,
      activities: log.activities.map((item) => (
        item.id === activityId
          ? { ...item, reports: [...(item.reports || []), report], updatedAt: new Date().toISOString() }
          : item
      )),
      updatedAt: new Date().toISOString()
    });
    refreshLogs(nextLog);
    openReportRoute(getAsphaltReportRoute(nextLog, activityId, report));
    return report;
  }

  function openAsphaltReport(log, activityId, reportId) {
    if (!log?.id || !activityId || !reportId) return;
    const activity = (log.activities || []).find((item) => item.id === activityId);
    const report = (activity?.reports || []).find((item) => item.id === reportId);
    openReportRoute(getAsphaltReportRoute(log, activityId, report || { id: reportId }));
  }

  function createInfiltrationReportForActivity(log, activityId) {
    const activity = (log.activities || []).find((item) => item.id === activityId);
    if (!activity) return null;
    const existing = [...(activity.concreteReports || []), ...(activity.reports || [])][0];
    if (existing) {
      const type = String(existing.type || existing.reportType || "").toLowerCase();
      if (type.includes("infiltration")) {
        openReportRoute(getInfiltrationReportRoute(log, activityId, existing));
      } else {
        window.alert("Only one report can be attached to each activity.");
      }
      return existing;
    }
    const report = {
      id: crypto.randomUUID(),
      type: "Surface Infiltration Report",
      reportType: "Surface Infiltration Report",
      report_type: "Surface Infiltration Report",
      status: "draft",
      dailyLogId: log.id,
      daily_log_id: log.id,
      activityId,
      activity_id: activityId,
      projectName: log.projectName || projectLabel,
      project_name: log.projectName || projectLabel,
      projectNumber: log.projectNumber || log.project_number || String(defaultProjectId || ""),
      project_number: log.projectNumber || log.project_number || String(defaultProjectId || ""),
      date: log.date || new Date().toISOString().slice(0, 10),
      testRecords: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const nextLog = saveDailyLog({
      ...log,
      activities: log.activities.map((item) => (
        item.id === activityId
          ? { ...item, reports: [...(item.reports || []), report], updatedAt: new Date().toISOString() }
          : item
      )),
      updatedAt: new Date().toISOString()
    });
    refreshLogs(nextLog);
    openReportRoute(getInfiltrationReportRoute(nextLog, activityId, report));
    return report;
  }

  function openInfiltrationReport(log, activityId, reportId) {
    if (!log?.id || !activityId || !reportId) return;
    const activity = (log.activities || []).find((item) => item.id === activityId);
    const report = (activity?.reports || []).find((item) => item.id === reportId);
    openReportRoute(getInfiltrationReportRoute(log, activityId, report || { id: reportId }));
  }

  function getProctorReportRoute(log, activityId, report) {
    return `/technician/daily-log/${log.id}/activity/${activityId}/proctor-report/${report?.id || "new"}?returnTo=${encodeURIComponent(`/technician/daily-log/${log.id}`)}`;
  }

  function createProctorReportForActivity(log, activityId) {
    const activity = (log.activities || []).find((item) => item.id === activityId);
    if (!activity) return null;
    const existing = [...(activity.concreteReports || []), ...(activity.reports || [])][0];
    if (existing) {
      const type = String(existing.type || existing.reportType || "").toLowerCase();
      if (type.includes("proctor")) {
        navigate(getProctorReportRoute(log, activityId, existing));
      } else {
        window.alert("Only one report can be attached to each activity.");
      }
      return existing;
    }
    const report = {
      id: crypto.randomUUID(),
      type: "One-Point Proctor Report",
      reportType: "One-Point Proctor Report",
      report_type: "One-Point Proctor Report",
      status: "draft",
      dailyLogId: log.id,
      daily_log_id: log.id,
      activityId,
      activity_id: activityId,
      projectName: log.projectName || projectLabel,
      project_name: log.projectName || projectLabel,
      projectNumber: log.projectNumber || log.project_number || String(defaultProjectId || ""),
      project_number: log.projectNumber || log.project_number || String(defaultProjectId || ""),
      date: log.date || new Date().toISOString().slice(0, 10),
      client: log.client || "",
      testRecords: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const nextLog = saveDailyLog({
      ...log,
      activities: (log.activities || []).map((item) =>
        item.id === activityId
          ? { ...item, reports: [...(item.reports || []), report], updatedAt: new Date().toISOString() }
          : item
      ),
      updatedAt: new Date().toISOString()
    });
    refreshLogs(nextLog);
    navigate(getProctorReportRoute(nextLog, activityId, report));
    return report;
  }

  function openProctorReport(log, activityId, reportId) {
    if (!log?.id || !activityId || !reportId) return;
    const activity = (log.activities || []).find((item) => item.id === activityId);
    const report = (activity?.reports || []).find((item) => item.id === reportId);
    navigate(getProctorReportRoute(log, activityId, report || { id: reportId }));
  }

  function getSamplesReportRoute(log, activityId, report) {
    return `/technician/daily-log/${log.id}/activity/${activityId}/samples-report/${report?.id || "new"}?returnTo=${encodeURIComponent(`/technician/daily-log/${log.id}`)}`;
  }

  function createSamplesReportForActivity(log, activityId) {
    const activity = (log.activities || []).find((item) => item.id === activityId);
    if (!activity) return null;
    const existing = [...(activity.concreteReports || []), ...(activity.reports || [])][0];
    if (existing) {
      const type = String(existing.type || existing.reportType || "").toLowerCase();
      if (type.includes("sample")) {
        navigate(getSamplesReportRoute(log, activityId, existing));
      } else {
        window.alert("Only one report can be attached to each activity.");
      }
      return existing;
    }
    const report = {
      id: crypto.randomUUID(),
      type: "Samples Collection Report",
      reportType: "Samples Collection Report",
      report_type: "Samples Collection Report",
      status: "draft",
      dailyLogId: log.id,
      daily_log_id: log.id,
      activityId,
      activity_id: activityId,
      projectName: log.projectName || projectLabel,
      project_name: log.projectName || projectLabel,
      projectNumber: log.projectNumber || log.project_number || String(defaultProjectId || ""),
      project_number: log.projectNumber || log.project_number || String(defaultProjectId || ""),
      date: log.date || new Date().toISOString().slice(0, 10),
      client: log.client || "",
      sampleType: "",
      castDate: "",
      specimenCount: "",
      comments: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const nextLog = saveDailyLog({
      ...log,
      activities: (log.activities || []).map((item) =>
        item.id === activityId
          ? { ...item, reports: [...(item.reports || []), report], updatedAt: new Date().toISOString() }
          : item
      ),
      updatedAt: new Date().toISOString()
    });
    refreshLogs(nextLog);
    navigate(getSamplesReportRoute(nextLog, activityId, report));
    return report;
  }

  function openSamplesReport(log, activityId, reportId) {
    if (!log?.id || !activityId || !reportId) return;
    const activity = (log.activities || []).find((item) => item.id === activityId);
    const report = (activity?.reports || []).find((item) => item.id === reportId);
    navigate(getSamplesReportRoute(log, activityId, report || { id: reportId }));
  }

  function backToDailyLog(logId = selectedDailyLog?.id) {
    if (!logId) return;
    navigate(`/technician/daily-log/${logId}`);
  }

  const logTabByView = {
    "daily-logs": "draft",
    "draft-logs": "draft",
    "submitted-logs": "submitted",
    "returned-logs": "returned",
    "approved-logs": "approved"
  };
  const timeCardTabByView = {
    "time-cards": "draft",
    "submitted-time-cards": "submitted",
    "returned-time-cards": "returned",
    "approved-time-cards": "approved"
  };
  const selectedDailyLog = activeDailyLogId
    ? (visibleDailyLogs.find((log) => log.id === activeDailyLogId) || (activeLog?.id === activeDailyLogId && filterDailyLogsForAccess([activeLog], dailyLogAccess).length ? activeLog : null))
    : visibleDailyLogs.find((log) => log.id === activeLog?.id) || (activeLog && filterDailyLogsForAccess([activeLog], dailyLogAccess).length
      ? activeLog
      : visibleDailyLogs[0]) || createDailyLog({
          projectLabel,
          defaultProjectId,
          technicianName: profile?.full_name || "Field Technician",
          companyId: profile?.company_id || profile?.organization_id || null,
          companyName,
          userId: userId || profile?.id || null
        });
  const isDailyLogReadOnly = selectedDailyLog && [DAILY_LOG_STATUS.SUBMITTED, DAILY_LOG_STATUS.APPROVED].includes(selectedDailyLog.status);
  const currentTimeCardTemplate = createTimeCard({
      projectName: projectOptions[0]?.name || projectLabel,
      projectId: projectOptions[0]?.id || defaultProjectId,
      projectNumber: projectOptions[0]?.number || String(projectOptions[0]?.id || defaultProjectId || ""),
      projectLocation: projectOptions[0]?.location || "",
      companyId: profile?.company_id || profile?.organization_id || "",
      technicianName: profile?.full_name || "Field Technician"
    });
  const currentTimeCardWeekStart = currentTimeCardTemplate.weekStartDate || currentTimeCardTemplate.week_start_date || currentTimeCardTemplate.date;
  const existingCurrentTimeCard = timeCards
    .filter((card) => (card.weekStartDate || card.week_start_date || card.date) === currentTimeCardWeekStart
      && [TIME_CARD_STATUS.DRAFT, TIME_CARD_STATUS.REJECTED, TIME_CARD_STATUS.RETURNED].includes(card.status))
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))[0];
  // The current week's filed (submitted/approved) timesheet. Without this the
  // fallback below would hand an already-filed week a fresh editable template.
  const filedCurrentTimeCard = timeCards
    .filter((card) => (card.weekStartDate || card.week_start_date || card.date) === currentTimeCardWeekStart
      && LOCKED_TIME_CARD_STATUSES.includes(card.status))
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))[0];
  const selectedTimeCard = activeTimeCard
    || existingCurrentTimeCard
    || filedCurrentTimeCard
    || timeCardCollections.openTimeCards[0]
    || currentTimeCardTemplate;
  const isTimeCardReadOnly = selectedTimeCard && [TIME_CARD_STATUS.SUBMITTED, TIME_CARD_STATUS.PENDING_REVIEW, TIME_CARD_STATUS.APPROVED, TIME_CARD_STATUS.COMPLETED].includes(selectedTimeCard.status);

  return (
    <div className="w-full max-w-full bg-slate-100 px-4 py-5 sm:px-6 lg:p-8" style={{ overflowX: "clip" }}>
      <div className="mx-auto w-full max-w-[1500px] space-y-4 sm:space-y-5">
        {loading && <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">Loading Field Operations Workspace...</div>}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{error}</div>}

        {currentView === "command-center" && (
          <DashboardOverview
            profile={profile}
            logCollections={logCollections}
            timeCardCollections={timeCardCollections}
            onOpenLog={openLog}
            onOpenTimeCard={openTimeCard}
            onCreateLog={createLog}
            onCreateTimeCard={createNewTimeCard}
            navigate={navigate}
          />
        )}

        {currentView === "create-daily-log" && selectedDailyLog && (
          isDailyLogReadOnly ? (
            <DailyLogSummaryView
              log={selectedDailyLog}
              onEdit={() => openLog(selectedDailyLog)}
              onViewPdf={() => viewLogPdf(selectedDailyLog)}
              onDownloadPdf={() => downloadLogPdf(selectedDailyLog)}
              onRegeneratePdf={regenerateLogPdf}
            />
          ) : (
            <DailyLogEditor
              log={selectedDailyLog}
              onChange={refreshLogs}
              onSubmitted={(submittedLog) => {
                refreshLogs(submittedLog);
                if (submittedLog?.status === DAILY_LOG_STATUS.SUBMITTED) {
                  navigate(`/technician/daily-log/${submittedLog.id}/submitted`);
                }
              }}
              onCreateConcreteReport={createConcreteReportForActivity}
              onOpenConcreteReport={openConcreteReport}
              onCreateCompactionReport={createCompactionReportForActivity}
              onOpenCompactionReport={openCompactionReport}
              onCreateAsphaltReport={createAsphaltReportForActivity}
              onOpenAsphaltReport={openAsphaltReport}
              onCreateInfiltrationReport={createInfiltrationReportForActivity}
              onOpenInfiltrationReport={openInfiltrationReport}
              onCreateProctorReport={createProctorReportForActivity}
              onOpenProctorReport={openProctorReport}
              onCreateSamplesReport={createSamplesReportForActivity}
              onOpenSamplesReport={openSamplesReport}
            />
          )
        )}

        {currentView === "concrete-report" && selectedDailyLog && (
          <ConcreteReportPage
            log={selectedDailyLog}
            activityId={activeActivityId}
            reportId={activeReportId}
            onChange={refreshLogs}
            onBack={() => backToDailyLog(selectedDailyLog.id)}
          />
        )}

        {currentView === "compaction-report" && selectedDailyLog && (
          <CompactionReportPage
            log={selectedDailyLog}
            activityId={activeActivityId}
            reportId={activeReportId}
            onChange={refreshLogs}
            onBack={() => backToDailyLog(selectedDailyLog.id)}
          />
        )}

        {currentView === "asphalt-report" && selectedDailyLog && (
          <AsphaltCompactionReportPage
            log={selectedDailyLog}
            activityId={activeActivityId}
            reportId={activeReportId}
            onChange={refreshLogs}
            onBack={() => backToDailyLog(selectedDailyLog.id)}
          />
        )}

        {currentView === "infiltration-report" && selectedDailyLog && (
          <SurfaceInfiltrationReportPage
            log={selectedDailyLog}
            activityId={activeActivityId}
            reportId={activeReportId}
            onChange={refreshLogs}
            onBack={() => backToDailyLog(selectedDailyLog.id)}
          />
        )}

        {currentView === "proctor-report" && selectedDailyLog && (
          <ProctorReportPage
            log={selectedDailyLog}
            activityId={activeActivityId}
            reportId={activeReportId}
            onChange={refreshLogs}
            onBack={() => backToDailyLog(selectedDailyLog.id)}
          />
        )}

        {currentView === "samples-report" && selectedDailyLog && (
          <SamplesCollectionReportPage
            log={selectedDailyLog}
            activityId={activeActivityId}
            reportId={activeReportId}
            onChange={refreshLogs}
            onBack={() => backToDailyLog(selectedDailyLog.id)}
          />
        )}

        {currentView === "reports-home" && (
          <ReportsHome logCollections={logCollections} navigate={navigate} />
        )}

        {currentView === "lab-reports" && (
          <LabReportsPage navigate={navigate} />
        )}

        {Object.prototype.hasOwnProperty.call(logTabByView, currentView) && (
          <DailyLogsPage
            key={currentView}
            logCollections={logCollections}
            initialTab={logTabByView[currentView]}
            onOpenLog={openLog}
            onCreateLog={createLog}
            onDeleteLog={deleteLog}
            onRecallLog={recallLog}
            onDownloadLogPdf={downloadLogPdf}
          />
        )}

        {currentView === "time-card" && (
          isTimeCardReadOnly ? (
            <TimeCardReadOnlyView
              card={selectedTimeCard}
              onRecall={() => recallTimeCard(selectedTimeCard)}
              onViewPdf={() => viewTimeCardPdf(selectedTimeCard)}
              onDownloadPdf={() => downloadTimeCardPdf(selectedTimeCard)}
              onNavigateWeek={(direction) => navigateTimeCardWeek(selectedTimeCard, direction)}
              onJumpToDate={jumpToTimeCardDate}
            />
          ) : (
            <TimeCardEditor
              card={Boolean(selectedTimeCard.overtimeExempt || selectedTimeCard.overtime_exempt) !== isOfficeEmployee
                ? normalizeWeeklyCard({ ...selectedTimeCard, overtimeExempt: isOfficeEmployee, overtime_exempt: isOfficeEmployee })
                : selectedTimeCard}
              onChange={refreshTimeCards}
              onSubmit={refreshTimeCards}
              onDelete={() => removeTimeCard(selectedTimeCard)}
              onCancel={() => navigate("/technician/dashboard?view=time-cards")}
              onNavigateWeek={(direction) => navigateTimeCardWeek(selectedTimeCard, direction)}
              onJumpToDate={jumpToTimeCardDate}
              assignedProjects={projectOptions}
              dailyLogs={visibleDailyLogs || []}
            />
          )
        )}

        {Object.prototype.hasOwnProperty.call(timeCardTabByView, currentView) && (
          <TimeCardsPage
            key={currentView}
            timeCardCollections={timeCardCollections}
            initialTab={timeCardTabByView[currentView]}
            onCreateTimeCard={createNewTimeCard}
            onOpenTimeCard={openTimeCard}
            onDeleteTimeCard={removeTimeCard}
            onRecallTimeCard={recallTimeCard}
            onDownloadTimeCardPdf={downloadTimeCardPdf}
          />
        )}

        {currentView === "notifications" && (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-2xl border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-4 shadow-sm sm:p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-300">Command Center</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Notifications</h1>
            </section>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SimplePanel icon={Bell} kicker="Activity" title="No notifications yet" description="Manager review, returned correction, upload, and approval events will appear here." />
            </div>
          </div>
        )}

        {currentView === "activity-history" && (
          <ActivityHistoryPage logCollections={logCollections} timeCardCollections={timeCardCollections} />
        )}

        {currentView === "profile" && (
          <TechnicianProfilePage
            profile={profile}
            companyName={companyName}
            projectOptions={projectOptions}
            logCollections={logCollections}
            timeCardCollections={timeCardCollections}
          />
        )}

      </div>
    </div>
  );
}
