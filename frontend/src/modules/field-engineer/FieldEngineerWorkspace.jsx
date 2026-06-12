import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Camera,
  ChevronDown,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  FileText,
  History,
  KeyRound,
  Plus,
  Save,
  Send,
  ShieldCheck
} from "lucide-react";
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
  submitDailyLog,
  syncDailyLogsFromSupabase
} from "../../services/dailyLogService";
import { openDailyLogPdf, regenerateDailyLogPdf } from "../../services/dailyLogPdfService";
import { generateAndUploadConcreteReportPdf, openConcreteReportPdf } from "../../services/concreteReportPdfService";
import { openTimeCardPdf, regenerateTimeCardPdf } from "../../services/timeCardPdfService";
import {
  createTimeCard,
  deleteTimeCard,
  getTimeCardCollections,
  getTimeCards,
  normalizeWeeklyCard,
  saveTimeCard,
  submitTimeCard,
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
      <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">{title}</h2>
      {description && <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">{description}</p>}
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

function StatusTabs({ tabs, activeTab, onChange, counts = {} }) {
  return (
    <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-bold transition ${
              active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            }`}
          >
            {tab.label}{Number.isFinite(counts[tab.id]) ? ` (${counts[tab.id]})` : ""}
          </button>
        );
      })}
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
      className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50/60"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 lg:max-w-[38%]">
          <p className="truncate text-sm font-bold leading-5 text-slate-950">{log.projectName}</p>
          {projectNumber && <p className="mt-0.5 truncate text-xs font-semibold leading-4 text-slate-500">Project #{projectNumber}</p>}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-slate-700">
          <span className="whitespace-nowrap">{displayDate} • {log.shift || "Day Shift"}</span>
          <div className="flex items-center gap-2 whitespace-nowrap" aria-label="Work summary">
            <span className="inline-flex min-h-8 min-w-12 items-center justify-center rounded-full bg-slate-100 px-3 text-sm font-bold text-slate-800">📋 {log.activities.length}</span>
            <span className="inline-flex min-h-8 min-w-12 items-center justify-center rounded-full bg-slate-100 px-3 text-sm font-bold text-slate-800">📄 {reportCount}</span>
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
    <article className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:bg-slate-50/70">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_4fr_2fr_2fr_1fr] md:items-center md:gap-4">
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
    <article className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:bg-slate-50/70">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_4fr_2fr_2fr_1fr] md:items-center md:gap-4">
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


function TechKpiCard({ label, value, icon: Icon, chipClass, onClick }) {
  return (
    <button type="button" onClick={onClick} className="rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${chipClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
    </button>
  );
}

function DashboardOverview({ profile, logCollections, timeCardCollections, onOpenLog, onOpenTimeCard, onCreateLog, onCreateTimeCard, navigate }) {
  const [activityCollapsed, setActivityCollapsed] = useState(false);
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
      <section className="overflow-hidden rounded-3xl border border-slate-200 shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Field Operations</p>
              <h1 className="mt-1 break-words text-2xl font-bold text-white sm:text-3xl">Welcome, {technicianName}</h1>
              <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-400">
                <CalendarDays className="h-4 w-4" /> {todayText}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {actionRequiredItems.length > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {actionRequiredItems.length} {actionRequiredItems.length === 1 ? "item needs" : "items need"} your action
                </span>
              )}
              <button
                type="button"
                onClick={onCreateLog}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" /> Start Daily Log
              </button>
              <button
                type="button"
                onClick={() => navigate("/timesheets")}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-700 px-4 text-sm font-bold text-white hover:bg-slate-900"
              >
                <CalendarDays className="h-4 w-4" /> My Timesheet
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <TechKpiCard label="Draft Logs" value={logCollections.draftLogs.length} icon={FileText} chipClass="bg-slate-100 text-slate-600" onClick={() => navigate("/technician/dashboard?view=daily-logs")} />
        <TechKpiCard label="Submitted Logs" value={logCollections.submittedLogs.length} icon={Send} chipClass="bg-blue-50 text-blue-700" onClick={() => navigate("/technician/dashboard?view=submitted-logs")} />
        <TechKpiCard label="Returned Logs" value={logCollections.returnedLogs.length} icon={AlertTriangle} chipClass="bg-rose-50 text-rose-700" onClick={() => navigate("/technician/dashboard?view=returned-logs")} />
        <TechKpiCard label="Approved Logs" value={logCollections.approvedLogs.length} icon={ClipboardCheck} chipClass="bg-emerald-50 text-emerald-700" onClick={() => navigate("/technician/dashboard?view=approved-logs")} />
        <TechKpiCard label="Timesheets Pending" value={timeCardCollections.submittedTimeCards.length} icon={CalendarDays} chipClass="bg-blue-50 text-blue-700" onClick={() => navigate("/technician/dashboard?view=submitted-time-cards")} />
        <TechKpiCard label="Timesheets Approved" value={timeCardCollections.approvedTimeCards.length} icon={ClipboardCheck} chipClass="bg-emerald-50 text-emerald-700" onClick={() => navigate("/technician/dashboard?view=approved-time-cards")} />
      </section>

      <section className="space-y-5">
        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <ClipboardList className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-950">Action Required</h2>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {actionRequiredItems.length
                    ? `${actionRequiredItems.length} draft or returned ${actionRequiredItems.length === 1 ? "item" : "items"} waiting on you`
                    : "Draft and returned Daily Logs and Timesheets appear here"}
                </p>
              </div>
            </div>
            {actionRequiredItems.length > 0 && (
              <div className="mt-4 hidden rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500 md:grid md:grid-cols-[2fr_4fr_2fr_2fr_1fr] md:gap-4">
                <span>Type</span>
                <span>Project</span>
                <span>Summary</span>
                <span>Last Updated</span>
                <span className="text-right">Action</span>
              </div>
            )}
            <div className="mt-2 space-y-2">
              {actionRequiredItems.map(({ type, id, item }) => (
                type === "log"
                  ? <ActionLogRow key={id} log={item} onOpen={() => onOpenLog(item)} />
                  : <ActionTimeCardRow key={id} card={item} onOpen={() => onOpenTimeCard(item)} />
              ))}
              {!actionRequiredItems.length && (
                <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
                      <ClipboardCheck className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-700">You're all caught up.</p>
                      <p className="text-xs font-semibold text-slate-500">No Daily Logs or Timesheets require action.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onCreateLog}
                    className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-bold text-white hover:bg-blue-600"
                  >
                    <Plus className="h-4 w-4" /> Start Daily Log
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setActivityCollapsed((value) => !value)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <History className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-bold text-slate-950">Recent Activity</h2>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                    {latestActivity.length ? `Last update ${relativeTimeLabel(latestActivity[0].at)}` : "Latest updates across your logs and timesheets"}
                  </p>
                </div>
                <ChevronDown className={`ml-auto h-5 w-5 text-slate-400 transition-transform ${activityCollapsed ? "-rotate-90" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => navigate("/technician/activity-history")}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                View Full History
              </button>
            </div>
            {!activityCollapsed && (
            <div className="mt-2">
              {groupActivityByDay(latestActivity).map((group) => (
                <div key={group.label}>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{group.label}</p>
                  <div className="mt-1 divide-y divide-slate-100">
                    {group.events.map((event) => <ActivityEventRow key={event.id} event={event} />)}
                  </div>
                </div>
              ))}
              {!latestActivity.length && (
                <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-sm font-semibold text-slate-500">No recent activity yet.</p>
              )}
            </div>
            )}
          </div>
        </div>

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
  const reportYear = new Date(log.date || report?.createdAt || Date.now()).getFullYear();
  const reportNumber = report?.reportNumber || `CR-${reportYear}-${String(report?.id || "000124").replace(/\D/g, "").slice(-6).padStart(6, "0")}`;
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
    let pdfPatch = {};
    try {
      pdfPatch = await generateAndUploadConcreteReportPdf(log, activity, { ...report, reportNumber, status: "completed", completedAt });
    } catch (error) {
      pdfPatch = {
        pdfGenerationStatus: "failed",
        pdf_generation_status: "failed",
        pdfGenerationFailureReason: error.message || "PDF storage configuration issue. Please contact administrator.",
        pdf_generation_failure_reason: error.message || "PDF storage configuration issue. Please contact administrator."
      };
    }
    updateReport({ status: "completed", completedAt, reportNumber, ...pdfPatch });
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
        fileName: `${reportNumber}.pdf`
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
            <p className="mt-1 text-base font-bold text-slate-700">{reportNumber}</p>
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
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
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
  const materialType = typeof reportOrMaterialType === "object" && reportOrMaterialType !== null
    ? (reportOrMaterialType.materialType || reportOrMaterialType.material_type || "")
    : reportOrMaterialType;
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

function CompactionReportPage({ log, activityId, reportId, onChange, onBack }) {
  const activity = (log.activities || []).find((item) => item.id === activityId);
  const persistedReport = (activity?.reports || []).find((item) => item.id === reportId);
  const [localReport, setLocalReport] = useState(persistedReport || null);
  const report = localReport || persistedReport;
  const isReadOnly = [DAILY_LOG_STATUS.SUBMITTED, DAILY_LOG_STATUS.APPROVED].includes(log.status);
  const isStandardizationNo = String(report?.standardizedGauge || report?.standardized_gauge || "").toLowerCase() === "no";
  const requiredMissing = [
    ["serialNumber", "Serial Number"],
    ["gaugeModel", "Gauge Model"],
    ["calibrationDueDate", "Calibration Due Date"],
    ["standardizedGauge", "Gauge Standardization"],
    ["standardDensity", "Standard Density"],
    ["standardMoisture", "Standard Moisture"],
    ["materialType", "Material Type"],
    ["materialName", "Material Name"]
  ].filter(([key]) => !String(report?.[key] || "").trim());
  const canComplete = report && requiredMissing.length === 0 && !isStandardizationNo && (report.testRecords || []).length > 0;

  if (!activity || !report) {
    return (
      <section className={cardClass()}>
        <h1 className="text-xl font-bold text-slate-950">Compaction Report Not Found</h1>
        <button type="button" onClick={onBack} className="mt-4 min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold">Back</button>
      </section>
    );
  }

  function saveReport(nextReport) {
    const materialType = nextReport.materialType || nextReport.material_type || "";
    const normalized = {
      ...nextReport,
      testRecords: (nextReport.testRecords || []).map((record) => calculateCompactionRecord(record, { ...nextReport, materialType })),
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
    saveReport({ ...report, ...patch, status: "draft" });
  }

  function addTestRecord() {
    const nextNumber = (report.testRecords || []).length + 1;
    updateReport({
      testRecords: [
        ...(report.testRecords || []),
        calculateCompactionRecord({
          id: crypto.randomUUID(),
          testNo: nextNumber,
          test_no: nextNumber,
          location: activity.location || "",
          stationFt: "",
          station_ft: "",
          referenceToCenterLine: "",
          reference_to_center_line: "",
          elevation: "",
          compactedDepth: "",
          compacted_depth: "",
          methodOfCompaction: "",
          method_of_compaction: "",
          wetDensity: "",
          wet_density: "",
          moistureUnitMass: "",
          moisture_unit_mass: "",
          dryDensity: "",
          dry_density: "",
          moistureContent: "",
          moisture_content: "",
          densityResult: "",
          density_result: "",
          resultOverridden: false,
          result_overridden: false,
          testStatus: "Pending",
          test_status: "Pending",
          remarks: ""
        }, report)
      ]
    });
  }

  function updateTestRecord(recordId, patch) {
    updateReport({
      testRecords: (report.testRecords || []).map((record) => (
        record.id === recordId ? calculateCompactionRecord({ ...record, ...patch }, report) : record
      ))
    });
  }

  function duplicateTestRecord(recordId) {
    const source = (report.testRecords || []).find((record) => record.id === recordId);
    if (!source) return;
    const copy = calculateCompactionRecord({
      ...source,
      id: crypto.randomUUID(),
      testNo: (report.testRecords || []).length + 1,
      test_no: (report.testRecords || []).length + 1
    }, report);
    updateReport({ testRecords: [...(report.testRecords || []), copy] });
  }

  function deleteTestRecord(recordId) {
    updateReport({
      testRecords: (report.testRecords || [])
        .filter((record) => record.id !== recordId)
        .map((record, index) => ({ ...record, testNo: index + 1, test_no: index + 1 }))
    });
  }

  function completeReport() {
    if (!canComplete) return;
    saveReport({ ...report, status: "completed", completedAt: new Date().toISOString() });
    onBack();
  }

  const records = report.testRecords || [];

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
    <div className="space-y-4">
      <section className={cardClass()}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Nuclear Density Report</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950">Compaction Report</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">{report.reportNumber} · {report.projectName}</p>
          </div>
          <span className="w-fit rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-700">{report.status || "Draft"}</span>
        </div>
      </section>

      <section className={cardClass()}>
        <h2 className="text-lg font-bold text-slate-950">Report Header</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ["Report Number", report.reportNumber],
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
        <h2 className="text-lg font-bold text-slate-950">Gauge Information</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Serial Number *"><input value={report.serialNumber || ""} disabled={isReadOnly} onChange={(event) => updateReport({ serialNumber: event.target.value, serial_number: event.target.value })} className={inputClass()} /></Field>
          <Field label="Gauge Model *"><input value={report.gaugeModel || ""} disabled={isReadOnly} onChange={(event) => updateReport({ gaugeModel: event.target.value, gauge_model: event.target.value })} className={inputClass()} /></Field>
          <Field label="Calibration Due Date *"><input type="date" value={report.calibrationDueDate || ""} disabled={isReadOnly} onChange={(event) => updateReport({ calibrationDueDate: event.target.value, calibration_due_date: event.target.value })} className={inputClass()} /></Field>
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
      </section>

      <section className={cardClass()}>
        <h2 className="text-lg font-bold text-slate-950">Material Type</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Material Type *">
            <select value={report.materialType || ""} disabled={isReadOnly} onChange={(event) => updateReport({ materialType: event.target.value, material_type: event.target.value, materialName: "", material_name: "" })} className={inputClass()}>
              <option value="">Select</option>
              <option>Aggregate</option>
              <option>Soil</option>
            </select>
          </Field>
          {report.materialType && (
            <Field label="Material Name *">
              <input value={report.materialName || ""} disabled={isReadOnly} onChange={(event) => updateReport({ materialName: event.target.value, material_name: event.target.value })} className={inputClass()} placeholder={report.materialType === "Aggregate" ? "#57 Stone, CR6, 21A" : "Structural Fill, Clay, Silty Sand"} />
            </Field>
          )}
        </div>
      </section>

      <section className={cardClass()}>
        <h2 className="text-lg font-bold text-slate-950">Specifications</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">Stored once at report level and shared by all test records.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ["E. Maximum Dry Density (lbs/ft3)", "maximumDryDensity", "maximum_dry_density"],
            ["F. Percent Optimum Moisture (%)", "percentOptimumMoisture", "percent_optimum_moisture"],
            ["G. Percent of Plus #4 (4.75 mm) (%)", "percentPassingNo4", "percent_passing_no4"],
            ["H. Corrected Maximum Dry Density (lbs/ft3)", "correctedMaximumDryDensity", "corrected_maximum_dry_density"],
            ["I. Corrected Optimum Moisture (%)", "correctedOptimumMoisture", "corrected_optimum_moisture"],
            ["K. Percent Minimum Density Required (%)", "percentMinimumDensityRequired", "percent_minimum_density_required"]
          ].map(([label, key, snakeKey]) => (
            <Field key={key} label={label}>
              <input
                value={report[key] || report[snakeKey] || ""}
                disabled={isReadOnly}
                onChange={(event) => updateReport({ [key]: event.target.value, [snakeKey]: event.target.value })}
                className={inputClass()}
              />
            </Field>
          ))}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Allowed Moisture Range</p>
            <p className="mt-1 text-sm font-bold text-slate-950">{getCompactionMoistureRange(report)}</p>
          </div>
        </div>
      </section>

      <section className={cardClass()}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-slate-950">Test Records</h2>
          {!isReadOnly && <button type="button" onClick={addTestRecord} className="min-h-10 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white">Add Test Data</button>}
        </div>
        <div className="mt-4 space-y-4">
          {records.map((record) => (
            <div key={record.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-base font-bold text-slate-950">Test No. {record.testNo || record.test_no}</h3>
                {!isReadOnly && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => duplicateTestRecord(record.id)} className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700">Duplicate Test</button>
                    <button type="button" onClick={() => deleteTestRecord(record.id)} className="min-h-9 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">Delete Test</button>
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
                    <input value={record[key] || ""} disabled={isReadOnly} onChange={(event) => updateTestRecord(record.id, { [key]: event.target.value, ...(snakeKey ? { [snakeKey]: event.target.value } : {}) })} className={inputClass()} />
                  </Field>
                ))}

                {recordSectionTitle("Section 2 - Nuclear Test Inputs")}
                {[
                  ["A. Wet Density (lbs/ft3)", "wetDensity", "wet_density"],
                  ["B. Moisture Unit Mass (lbs/ft3)", "moistureUnitMass", "moisture_unit_mass"]
                ].map(([label, key, snakeKey]) => (
                  <Field key={key} label={label}>
                    <input value={record[key] || ""} disabled={isReadOnly} onChange={(event) => updateTestRecord(record.id, { [key]: event.target.value, ...(snakeKey ? { [snakeKey]: event.target.value } : {}) })} className={inputClass()} />
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
                    onChange={(event) => updateTestRecord(record.id, { densityResult: event.target.value, density_result: event.target.value, resultOverridden: true, result_overridden: true })}
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
                    onChange={(event) => updateTestRecord(record.id, { testStatus: event.target.value, test_status: event.target.value })}
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
                      onChange={(event) => updateTestRecord(record.id, { remarks: event.target.value })}
                      rows={4}
                      className={`${inputClass()} py-3 leading-6`}
                      placeholder="Material within specification. Retest required due to moisture. Gauge recalibrated. Soft area observed."
                    />
                  </Field>
                </div>
              </div>
            </div>
          ))}
          {!records.length && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-600">No test records yet. Add test data to begin.</p>}
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

const DAILY_LOG_TABS = [
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Submitted" },
  { id: "returned", label: "Returned" },
  { id: "approved", label: "Approved" }
];

function DailyLogsPage({ logCollections, initialTab = "draft", onOpenLog, onCreateLog, onDuplicateLog, onDeleteLog, onRecallLog, onResubmitLog, onDownloadLogPdf }) {
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            {commandCenterTitle("Daily Logs", "Review Daily Field Logs by status.")}
            <div className="mt-3">
              <StatusTabs tabs={DAILY_LOG_TABS} activeTab={activeTab} onChange={setActiveTab} counts={tabCounts} />
            </div>
          </div>
          <button type="button" onClick={onCreateLog} className="min-h-11 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white">
            + Create Daily Log
          </button>
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
      <section className={cardClass()}>
        {commandCenterTitle("Profile")}
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
  role,
  collections,
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
  discardingId,
  navigate,
  getActions,
  onAction,
  onDiscardDraft
}) {
  const [dailyLogs, setDailyLogs] = useState([]);
  const [activeLog, setActiveLog] = useState(null);
  const [timeCards, setTimeCards] = useState([]);
  const [activeTimeCard, setActiveTimeCard] = useState(null);
  const allowedViews = new Set([
    "command-center",
    "concrete-report",
    "compaction-report",
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

  function duplicateLog(log) {
    const duplicated = saveDailyLog({
      ...log,
      id: crypto.randomUUID(),
      status: DAILY_LOG_STATUS.DRAFT,
      submittedAt: "",
      approvedAt: "",
      returnedAt: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    refreshLogs(duplicated);
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

  async function resubmitLog(log) {
    const resubmitted = submitDailyLog(log);
    refreshLogs(resubmitted);
    try {
      const withPdf = await regenerateDailyLogPdf(resubmitted);
      refreshLogs(withPdf);
    } catch (error) {
      console.warn("Daily Log PDF generation failed after resubmission", error);
    }
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
    const existingCard = getTimeCards()
      .filter((card) => (card.weekStartDate || card.week_start_date || card.date) === weekStart
        && [TIME_CARD_STATUS.DRAFT, TIME_CARD_STATUS.REJECTED, TIME_CARD_STATUS.RETURNED].includes(card.status))
      .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))[0];
    const card = existingCard || saveTimeCard(draftCard);
    refreshTimeCards(card);
    navigate("/technician/dashboard?view=time-card");
  }

  function openTimeCard(card) {
    setActiveTimeCard(card);
    navigate("/technician/dashboard?view=time-card");
  }

  function navigateTimeCardWeek(card, direction) {
    const currentWeekStart = card.weekStartDate || card.week_start_date || card.date;
    const parsed = new Date(`${currentWeekStart}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    parsed.setDate(parsed.getDate() + direction * 7);
    const targetWeekStart = [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, "0"),
      String(parsed.getDate()).padStart(2, "0")
    ].join("-");
    const cardsForWeek = getTimeCards()
      .filter((item) => (item.weekStartDate || item.week_start_date || item.date) === targetWeekStart)
      .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
    const existingCard = cardsForWeek.find((item) =>
      [TIME_CARD_STATUS.DRAFT, TIME_CARD_STATUS.REJECTED, TIME_CARD_STATUS.RETURNED].includes(item.status)
    ) || cardsForWeek[0];
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
    const recalled = saveTimeCard({
      ...card,
      status: TIME_CARD_STATUS.DRAFT,
      submittedAt: "",
      updatedAt: new Date().toISOString()
    });
    refreshTimeCards(recalled);
  }

  async function resubmitTimeCard(card) {
    const submitted = submitTimeCard(card);
    refreshTimeCards(submitted);
    const withPdf = await regenerateTimeCardPdf(submitted);
    refreshTimeCards(withPdf);
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

  async function regenerateTimesheetPdf(card) {
    const withPdf = await regenerateTimeCardPdf(card);
    refreshTimeCards(withPdf);
    if ((withPdf.pdfGenerationStatus || withPdf.pdf_generation_status) === "failed") {
      window.alert("Unable to generate Timesheet PDF. Please click Regenerate PDF or contact support.");
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

  function openReportRoute(reportUrl) {
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (isDesktop) {
      window.open(reportUrl, "_blank", "noopener,noreferrer");
      return;
    }
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
    const reportYear = new Date(log.date || Date.now()).getFullYear();
    const nextSequence = String((activity.concreteReports || []).length + 1).padStart(6, "0");
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
      reportNumber: `CR-${reportYear}-${nextSequence}`,
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
    const reportYear = new Date(log.date || Date.now()).getFullYear();
    const nextSequence = String((activity.reports || []).length + 1).padStart(6, "0");
    const report = {
      id: crypto.randomUUID(),
      type: "Compaction Report",
      reportType: "Compaction Report",
      report_type: "Compaction Report",
      status: "draft",
      reportNumber: `CDR-${reportYear}-${nextSequence}`,
      report_number: `CDR-${reportYear}-${nextSequence}`,
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
  const selectedTimeCard = activeTimeCard
    || existingCurrentTimeCard
    || timeCardCollections.openTimeCards[0]
    || currentTimeCardTemplate;
  const isTimeCardReadOnly = selectedTimeCard && [TIME_CARD_STATUS.SUBMITTED, TIME_CARD_STATUS.PENDING_REVIEW, TIME_CARD_STATUS.APPROVED, TIME_CARD_STATUS.COMPLETED].includes(selectedTimeCard.status);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
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

        {Object.prototype.hasOwnProperty.call(logTabByView, currentView) && (
          <DailyLogsPage
            key={currentView}
            logCollections={logCollections}
            initialTab={logTabByView[currentView]}
            onOpenLog={openLog}
            onCreateLog={createLog}
            onDuplicateLog={duplicateLog}
            onDeleteLog={deleteLog}
            onRecallLog={recallLog}
            onResubmitLog={resubmitLog}
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
              onRegeneratePdf={() => regenerateTimesheetPdf(selectedTimeCard)}
              onNavigateWeek={(direction) => navigateTimeCardWeek(selectedTimeCard, direction)}
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SimplePanel icon={Bell} kicker="Command Center" title="Notifications" description="Manager review, returned correction, upload, and approval events will appear here." />
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
