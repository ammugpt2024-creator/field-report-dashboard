import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Edit2,
  Eye,
  Flag,
  FlaskConical,
  FolderKanban,
  HardHat,
  Plus,
  RotateCcw,
  Search,
  Send,
  Users,
  XCircle
} from "lucide-react";
import { supabase } from "../services/supabase";
import { useAuth } from "../context/AuthContext";
import { isUnscoped, meetsLevel } from "../utils/moduleAccess";
import { MODULE_NAMES } from "../config/branding";
import { sendTimesheetDecisionEmail } from "../services/notificationService";
import { logAuditEvent } from "../services/auditLogService";
import { createDailyLog, DAILY_LOG_STATUS, saveDailyLog } from "../services/dailyLogService";
import { createDailyLogPdfSignedUrl } from "../services/dailyLogPdfService";
import { WEEK_DAYS, approveTimeCard, formatTimeCardStatus, getRowTotal, rejectTimeCard, TIME_CARD_STATUS } from "../services/timeCardService";
import { generateTimeCardPdfBlob, regenerateTimeCardPdf } from "../services/timeCardPdfService";
import { fetchTimesheetQueue, syncTimesheet } from "../services/timesheetSyncService";
import { CYLINDER_BREAK_STATUS, approveLabReport, getSubmittedLabReports, returnLabReport } from "../services/labCylinderService";
import { openCylinderBreakPdf as openLabPdf } from "../services/cylinderBreakPdfService";
import MobileRecordCard from "../components/mobile/MobileRecordCard";

const DAY_LABELS = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };
const fmtHours = (value) => (Number(value) || 0).toFixed(2);

function isToday(value) {
  if (!value) return false;
  return new Date(value).toDateString() === new Date().toDateString();
}

function hoursSince(value) {
  if (!value) return 0;
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 36e5);
}

function agingLabel(hours) {
  if (hours < 1) return "<1h ago";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h ago`;
}

function agingTone(hours) {
  if (hours >= 24) return "border-rose-200 bg-rose-50 text-rose-700";
  if (hours >= 12) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function parseDailyLogPayload(row) {
  const raw = row?.payload;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function describeDailyLogRow(row) {
  const payload = parseDailyLogPayload(row);
  const activities = Array.isArray(payload.activities) ? payload.activities : [];
  const projectNumber = payload.projectNumber || payload.project_number || row.project_id || "";
  const datePart = String(row.log_date || payload.date || "").replace(/-/g, "") || "DATE";
  const explicitNumber = payload.logNumber || payload.log_number;
  return {
    rowId: row.id,
    clientLogId: row.client_log_id || payload.id || "",
    number: explicitNumber && !/^[0-9a-f]{8}-/i.test(String(explicitNumber)) ? explicitNumber : `DL-${projectNumber}-${datePart}`,
    projectName: payload.projectName || payload.project_name || "Project",
    technician: payload.technicianName || payload.technician_name || "Technician",
    logDate: row.log_date || payload.date || "",
    shift: row.shift || payload.shift || "",
    status: String(row.status || "").toLowerCase(),
    submittedAt: row.submitted_at || "",
    agingHours: hoursSince(row.submitted_at || row.updated_at),
    activityCount: activities.length,
    reportCount: activities.reduce((sum, activity) => sum + (activity.concreteReports?.length || activity.reports?.length || 0), 0),
    pdfStoragePath: row.pdf_storage_path || "",
    pdfUrl: row.pdf_url || ""
  };
}

const LOG_FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "returned", label: "Returned" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" }
];

function logStatusBucket(status) {
  if (status === DAILY_LOG_STATUS.APPROVED) return "approved";
  if (status === DAILY_LOG_STATUS.RETURNED) return "returned";
  if (status === "archived") return "archived";
  if ([DAILY_LOG_STATUS.SUBMITTED, DAILY_LOG_STATUS.PENDING_MANAGER_REVIEW].includes(status)) return "pending";
  return "";
}

function logStatusPill(bucket) {
  if (bucket === "approved") return { label: "Approved", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (bucket === "returned") return { label: "Returned", className: "border-rose-200 bg-rose-50 text-rose-700" };
  if (bucket === "archived") return { label: "Archived", className: "border-slate-200 bg-slate-100 text-slate-600" };
  return { label: "Pending Review", className: "border-amber-200 bg-amber-50 text-amber-700" };
}

const TIMESHEET_FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" }
];

function timesheetStatusBucket(status) {
  if ([TIME_CARD_STATUS.SUBMITTED, TIME_CARD_STATUS.PENDING_REVIEW].includes(status)) return "pending";
  if ([TIME_CARD_STATUS.APPROVED, TIME_CARD_STATUS.COMPLETED].includes(status)) return "approved";
  if ([TIME_CARD_STATUS.REJECTED, TIME_CARD_STATUS.RETURNED].includes(status)) return "rejected";
  return "";
}

// ─── Lab Report review helpers ────────────────────────────────────────────────

const LAB_FILTERS = [
  { key: "pending",  label: "Pending"  },
  { key: "approved", label: "Approved" },
  { key: "returned", label: "Returned" },
  { key: "all",      label: "All"      }
];

function labStatusBucket(status) {
  if (status === CYLINDER_BREAK_STATUS.SUBMITTED) return "pending";
  if (status === CYLINDER_BREAK_STATUS.APPROVED)  return "approved";
  if (status === CYLINDER_BREAK_STATUS.RETURNED)  return "returned";
  return "";
}

function labStatusPill(bucket) {
  if (bucket === "approved") return { label: "Approved", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (bucket === "returned") return { label: "Returned",  className: "border-rose-200 bg-rose-50 text-rose-700" };
  return { label: "Pending Review", className: "border-amber-200 bg-amber-50 text-amber-700" };
}

function labPassFail(report) {
  const breaks = report.breaks || [];
  if (!breaks.length) return { label: "—", className: "text-slate-400" };
  const fails = breaks.filter((b) => b.result === "FAIL").length;
  const passes = breaks.filter((b) => b.result === "PASS").length;
  if (fails > 0) return { label: `${fails} FAIL`, className: "font-bold text-rose-700" };
  if (passes > 0) return { label: `${passes} PASS`, className: "font-bold text-emerald-700" };
  return { label: "Pending", className: "text-slate-400" };
}

function timesheetStatusPill(bucket) {
  if (bucket === "approved") return { label: "Approved", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (bucket === "rejected") return { label: "Rejected", className: "border-rose-200 bg-rose-50 text-rose-700" };
  return { label: "Pending Review", className: "border-amber-200 bg-amber-50 text-amber-700" };
}

// Status tabs + name/project/date filters shared by both review queues.
function QueueFilters({ filters, active, counts, onFilter, search, onSearch, searchPlaceholder, projectOptions, project, onProject, date, onDate, dateLabel }) {
  const hasRefinement = Boolean(search.trim()) || project !== "all" || Boolean(date);
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-slate-100 p-1.5">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilter(key)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${
              active === key ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"
            }`}
          >
            {label}
            <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              active === key ? "bg-blue-50 text-blue-700" : "bg-slate-200 text-slate-600"
            }`}>
              {counts[key] ?? 0}
            </span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[1fr_240px_200px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
          />
        </div>
        <select
          value={project}
          onChange={(event) => onProject(event.target.value)}
          className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
        >
          <option value="all">All projects</option>
          {projectOptions.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(event) => onDate(event.target.value)}
          title={dateLabel}
          aria-label={dateLabel}
          className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
        />
        {hasRefinement && (
          <button
            type="button"
            onClick={() => { onSearch(""); onProject("all"); onDate(""); }}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

const PAGE_SIZE = 10;

function Paginator({ page, total, onPage, noun }) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(total, page * PAGE_SIZE);
  const windowStart = Math.max(1, Math.min(page - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => windowStart + index);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs font-semibold text-slate-500">Showing {start}-{end} of {total} {noun}</p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Prev
        </button>
        {pages.map((number) => (
          <button
            key={number}
            type="button"
            onClick={() => onPage(number)}
            className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl px-2 text-xs font-bold transition ${
              number === page ? "bg-blue-700 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {number}
          </button>
        ))}
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function TimesheetReviewTable({ timesheets, onApprove, onReject, highlightedTimesheet = "" }) {
  // Details collapsed by default — with many technicians submitting, the
  // per-project hour grids would otherwise stack into a wall. The deep-linked
  // timesheet (from an approval email) starts expanded.
  const [expandedId, setExpandedId] = useState(highlightedTimesheet || null);
  return (
    <>
    <div className="mt-4 space-y-2 md:hidden">
      {timesheets.map((card) => {
        const timesheetNumber = card.timesheetNumber || card.timesheet_number || "";
        const isHighlighted = Boolean(highlightedTimesheet) && (timesheetNumber === highlightedTimesheet || String(card.id) === highlightedTimesheet);
        const isExpanded = expandedId === String(card.id) || expandedId === timesheetNumber;
        const bucket = timesheetStatusBucket(card.status);
        const pill = timesheetStatusPill(bucket);
        return (
          <article key={card.id} className={`rounded-2xl border p-3 ${isHighlighted ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-bold text-slate-950">{timesheetNumber}</p>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${pill.className}`}>{pill.label}</span>
            </div>
            <dl className="mt-2">
              {[
                ["Employee", card.technicianName || card.technician_name],
                ["Project", (card.projectRows || []).map((row) => row.projectName || row.project_name).filter(Boolean).join(", ") || card.projectName || "-"],
                ["Week", `${card.weekStartDate || card.week_start_date} - ${card.weekEndDate || card.week_end_date}`],
                ["Regular / OT", `${card.totalRegularHours || card.total_regular_hours || "0.00"} / ${card.totalOvertimeHours || card.total_overtime_hours || "0.00"}`],
                ["Total Hours", card.totalHours || card.total_hours || "0.00"]
              ].map(([label, value]) => (
                <div key={label} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
                  <dt className="shrink-0 text-[12px] font-semibold text-slate-500">{label}</dt>
                  <dd className="min-w-0 break-words text-right text-[13px] font-bold text-slate-900">{value || "-"}</dd>
                </div>
              ))}
            </dl>
            {isExpanded && (
              <div className="mt-2 space-y-2">
                {(card.projectRows || []).map((row) => (
                  <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <p className="truncate text-[13px] font-bold text-slate-900">{row.projectName || row.project_name || "-"}</p>
                    <div className="mt-1.5 grid grid-cols-4 gap-1">
                      {WEEK_DAYS.map((day) => (
                        <div key={day} className="rounded-lg bg-white px-1 py-1 text-center">
                          <p className="text-[10px] font-bold text-slate-400">{DAY_LABELS[day]}</p>
                          <p className="text-[12px] font-bold text-slate-900">{fmtHours(row.hours?.[day])}</p>
                        </div>
                      ))}
                      <div className="rounded-lg bg-slate-950 px-1 py-1 text-center">
                        <p className="text-[10px] font-bold text-slate-400">Total</p>
                        <p className="text-[12px] font-bold text-white">{fmtHours(getRowTotal(row))}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : String(card.id))}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                {isExpanded ? "Hide Hours" : "View Hours"}
              </button>
              {bucket === "pending" && (
                <>
                  <button type="button" onClick={() => onApprove(card)} className="min-h-11 flex-1 rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white">Approve</button>
                  <button type="button" onClick={() => onReject(card)} className="min-h-11 flex-1 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">Reject</button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
    <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
      <table className="min-w-[980px] w-full border-collapse text-left text-sm">
        <thead className="bg-slate-950 text-xs font-bold uppercase tracking-[0.08em] text-white">
          <tr>
            {["Timesheet", "Employee", "Project", "Week Period", "Regular", "OT", "Total", "Status", "Actions"].map((header) => (
              <th key={header} className="px-3 py-3">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timesheets.map((card) => {
            const timesheetNumber = card.timesheetNumber || card.timesheet_number || "";
            const isHighlighted = Boolean(highlightedTimesheet) && (timesheetNumber === highlightedTimesheet || String(card.id) === highlightedTimesheet);
            const isExpanded = expandedId === String(card.id) || expandedId === timesheetNumber;
            const bucket = timesheetStatusBucket(card.status);
            const pill = timesheetStatusPill(bucket);
            return (
            <Fragment key={card.id}>
              <tr
                className={`border-t border-slate-200 ${isHighlighted ? "bg-amber-50" : ""}`}
                ref={isHighlighted ? (node) => node?.scrollIntoView({ behavior: "smooth", block: "center" }) : undefined}
              >
                <td className="px-3 py-3 font-bold text-slate-950">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : String(card.id))}
                    className="inline-flex items-center gap-1.5 text-left hover:text-blue-700"
                    title={isExpanded ? "Hide hours breakdown" : "Show hours breakdown"}
                  >
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                    {timesheetNumber}
                  </button>
                </td>
                <td className="px-3 py-3 font-semibold">{card.technicianName || card.technician_name}</td>
                <td className="px-3 py-3 font-semibold">{(card.projectRows || []).map((row) => row.projectName || row.project_name).filter(Boolean).join(", ") || card.projectName || "-"}</td>
                <td className="px-3 py-3 font-semibold">{card.weekStartDate || card.week_start_date} - {card.weekEndDate || card.week_end_date}</td>
                <td className="px-3 py-3 font-bold">{card.totalRegularHours || card.total_regular_hours || "0.00"}</td>
                <td className="px-3 py-3 font-bold">{card.totalOvertimeHours || card.total_overtime_hours || "0.00"}</td>
                <td className="px-3 py-3 font-bold">{card.totalHours || card.total_hours || "0.00"}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${pill.className}`} title={formatTimeCardStatus(card.status)}>
                    {pill.label}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : String(card.id))}
                      className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      {isExpanded ? "Hide Hours" : "View Hours"}
                    </button>
                    {bucket === "pending" && (
                      <>
                        <button type="button" onClick={() => onApprove(card)} className="min-h-9 rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white">Approve</button>
                        <button type="button" onClick={() => onReject(card)} className="min-h-9 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">Reject</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
              {isExpanded && (
              <tr className="border-t border-slate-100 bg-slate-50">
                <td colSpan={9} className="px-3 py-3">
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="min-w-[680px] w-full border-collapse text-left text-xs">
                      <thead className="bg-slate-100 font-bold uppercase tracking-[0.08em] text-slate-600">
                        <tr>
                          <th className="px-3 py-2">Project</th>
                          {WEEK_DAYS.map((day) => (
                            <th key={day} className="px-2 py-2 text-center">{DAY_LABELS[day]}</th>
                          ))}
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(card.projectRows || []).map((row) => (
                          <tr key={row.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-bold text-slate-950">{row.projectName || row.project_name || "-"}</td>
                            {WEEK_DAYS.map((day) => (
                              <td key={day} className="px-2 py-2 text-center font-semibold">{fmtHours(row.hours?.[day])}</td>
                            ))}
                            <td className="px-3 py-2 text-right font-bold">{fmtHours(getRowTotal(row))}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td className="px-3 py-2 font-bold text-slate-950">Daily Total</td>
                          {WEEK_DAYS.map((day) => (
                            <td key={day} className="px-2 py-2 text-center font-bold">{fmtHours((card.dailyTotals || {})[day])}</td>
                          ))}
                          <td className="px-3 py-2 text-right font-bold">{card.totalHours || card.total_hours || "0.00"}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </td>
              </tr>
              )}
            </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

function DonutChart({ segments, size = 88, stroke = 14 }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        {total > 0 && segments.filter((segment) => segment.value > 0).map((segment) => {
          const dash = (segment.value / total) * circumference;
          const circle = (
            <circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return circle;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-slate-950">{total}</span>
        <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Total</span>
      </div>
    </div>
  );
}

function SummaryLegendRow({ color, label, count, onClick }) {
  const content = (
    <div className="flex w-full items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> {label}
      </span>
      <span className="text-sm font-bold text-slate-950">{count}</span>
    </div>
  );
  if (!onClick) {
    return <div className="rounded-xl px-2.5 py-1.5">{content}</div>;
  }
  return (
    <button type="button" onClick={onClick} className="block w-full rounded-xl px-2.5 py-1.5 text-left hover:bg-slate-50">
      {content}
    </button>
  );
}

function KpiCard({ label, value, icon: Icon, chipClass }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${chipClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function ComingSoonView({ title, description, icon: Icon }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
        <Icon className="h-8 w-8" />
      </span>
      <h2 className="mt-5 text-2xl font-bold text-slate-950">{title}</h2>
      <p className="mt-2 max-w-md text-sm font-semibold text-slate-500">{description}</p>
      <span className="mt-6 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-bold text-amber-700">
        Coming Soon
      </span>
    </div>
  );
}

function ManagerDashboard() {
  const navigate = useNavigate();
  // Approval emails deep-link to a specific timesheet via ?timesheet=TS-….
  const params = new URLSearchParams(window.location.search);
  const highlightedTimesheet = params.get("timesheet") || "";
  const currentView = params.get("view") || "";
  // main's access gating (companyRole / isPlatformAdmin / modulePermissions) must
  // survive alongside the session Roopa's daily-log creation needs.
  const { profile, companyRole, isPlatformAdmin, modulePermissions, session } = useAuth();
  const [projects, setProjects] = useState([]);
  const [dailyLogs, setDailyLogs] = useState([]);
  const [timeCards, setTimeCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logFilter, setLogFilter] = useState("pending");
  const [logSearch, setLogSearch] = useState("");
  const [logProject, setLogProject] = useState("all");
  const [logDate, setLogDate] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [logsCollapsed, setLogsCollapsed] = useState(false);
  const [tsFilter, setTsFilter] = useState("pending");
  const [tsSearch, setTsSearch] = useState("");
  const [tsProject, setTsProject] = useState("all");
  const [tsDate, setTsDate] = useState("");
  const [tsPage, setTsPage] = useState(1);
  const [timesheetsCollapsed, setTimesheetsCollapsed] = useState(false);
  const [labReports, setLabReports] = useState(() => getSubmittedLabReports());
  const [labFilter, setLabFilter] = useState("pending");
  const [labSearch, setLabSearch] = useState("");
  const [labProject, setLabProject] = useState("all");
  const [labDate, setLabDate] = useState("");
  const [labPage, setLabPage] = useState(1);
  const [labCollapsed, setLabCollapsed] = useState(false);
  const [labReturnModal, setLabReturnModal] = useState(null); // { report }
  const [labReturnComment, setLabReturnComment] = useState("");

  const FLAG_KEY = "qcore:manager-flags";
  const [flagged, setFlagged] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FLAG_KEY) || "[]")); } catch { return new Set(); }
  });
  function toggleFlag(id) {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(String(id))) next.delete(String(id)); else next.add(String(id));
      localStorage.setItem(FLAG_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  useEffect(() => {
    async function loadWorkspace() {
      setLoading(true);
      setError("");
      try {
        const [projectsResponse, dailyLogsResponse] = await Promise.all([
          supabase.from("projects").select("*").order("created_at", { ascending: false }),
          supabase.from("daily_logs").select("*").order("submitted_at", { ascending: false, nullsFirst: false })
        ]);

        if (projectsResponse.error) throw projectsResponse.error;
        if (dailyLogsResponse.error) {
          console.warn("Daily logs could not be loaded for the manager dashboard.", dailyLogsResponse.error);
        }

        setProjects(projectsResponse.data || []);
        setDailyLogs(dailyLogsResponse.data || []);
        // The review queue comes from the shared timesheets table so submissions
        // made on any technician's device are visible here.
        setTimeCards(await fetchTimesheetQueue());
      } catch (err) {
        console.error("Manager dashboard failed", err);
        setError(err.message || "Unable to load manager dashboard.");
      } finally {
        setLoading(false);
      }
    }

    loadWorkspace();
  }, []);

  // Visibility follows the access level the admin granted: approve+ on a
  // project's Daily Logs = oversight (see all on that project); otherwise the
  // viewer sees only logs routed to them or that they submitted.
  const myId = profile?.id;
  const canSeeLog = (log) =>
    isUnscoped(companyRole, isPlatformAdmin) ||
    meetsLevel(modulePermissions?.[String(log.project_id)]?.daily_logs, "approve") ||
    log.reviewer_user_id === myId ||
    log.technician_id === myId;
  const describedLogs = useMemo(() => (
    dailyLogs
      .filter(canSeeLog)
      .map(describeDailyLogRow)
      .map((log) => ({ ...log, bucket: logStatusBucket(log.status) }))
      .filter((log) => log.bucket)
      // Most recent first: newest log date, then most recent submission.
      .sort((a, b) => String(b.logDate).localeCompare(String(a.logDate)) || a.agingHours - b.agingHours)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [dailyLogs, companyRole, isPlatformAdmin, modulePermissions, myId]);

  const logCounts = useMemo(() => {
    const pending = describedLogs.filter((log) => log.bucket === "pending").length;
    const approved = describedLogs.filter((log) => log.bucket === "approved").length;
    const returned = describedLogs.filter((log) => log.bucket === "returned").length;
    const archived = describedLogs.filter((log) => log.bucket === "archived").length;
    return {
      pending,
      approved,
      returned,
      archived,
      active: pending + approved + returned,
      all: describedLogs.length
    };
  }, [describedLogs]);

  const logProjectOptions = useMemo(() => (
    Array.from(new Set(describedLogs.map((log) => log.projectName).filter(Boolean))).sort()
  ), [describedLogs]);

  const filteredLogs = useMemo(() => {
    const term = logSearch.trim().toLowerCase();
    return describedLogs
      .filter((log) => logFilter === "all" || log.bucket === logFilter)
      .filter((log) => logProject === "all" || log.projectName === logProject)
      .filter((log) => !logDate || log.logDate === logDate)
      .filter((log) => !term || [log.number, log.projectName, log.technician, log.logDate].some((value) => String(value).toLowerCase().includes(term)));
  }, [describedLogs, logFilter, logSearch, logProject, logDate]);

  // Changing any filter snaps back to page 1; the clamp below covers shrinking lists.
  const logFilterHandlers = {
    onFilter: (value) => { setLogFilter(value); setLogPage(1); },
    onSearch: (value) => { setLogSearch(value); setLogPage(1); },
    onProject: (value) => { setLogProject(value); setLogPage(1); },
    onDate: (value) => { setLogDate(value); setLogPage(1); }
  };
  const logPageSafe = Math.min(logPage, Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE)));
  const pagedLogs = filteredLogs.slice((logPageSafe - 1) * PAGE_SIZE, logPageSafe * PAGE_SIZE);

  const pendingDailyLogs = useMemo(() => describedLogs.filter((log) => log.bucket === "pending"), [describedLogs]);

  const approvedDailyLogsToday = useMemo(() => (
    dailyLogs.filter((row) => String(row.status || "").toLowerCase() === DAILY_LOG_STATUS.APPROVED && isToday(row.updated_at))
  ), [dailyLogs]);

  const delayedReviews = pendingDailyLogs.filter((log) => log.agingHours >= 12);
  // The "today" KPIs span both domains: daily logs and timesheets.
  const submissionsToday =
    dailyLogs.filter((row) => isToday(row.submitted_at)).length +
    timeCards.filter((card) => isToday(card.submittedAt || card.submitted_at)).length;
  const timesheetsApprovedToday = timeCards.filter((card) =>
    timesheetStatusBucket(card.status) === "approved" &&
    isToday(card.reviewedAt || card.reviewed_at || card.approvedAt || card.approved_at)
  ).length;
  const submittedTimesheets = timeCards.filter((card) => [TIME_CARD_STATUS.SUBMITTED, TIME_CARD_STATUS.PENDING_REVIEW].includes(card.status));

  const timesheetCounts = useMemo(() => {
    const countByStatuses = (statuses) => timeCards.filter((card) => statuses.includes(card.status)).length;
    const pending = countByStatuses([TIME_CARD_STATUS.SUBMITTED, TIME_CARD_STATUS.PENDING_REVIEW]);
    const approved = countByStatuses([TIME_CARD_STATUS.APPROVED, TIME_CARD_STATUS.COMPLETED]);
    const rejected = countByStatuses([TIME_CARD_STATUS.REJECTED, TIME_CARD_STATUS.RETURNED]);
    return { pending, approved, rejected, all: pending + approved + rejected };
  }, [timeCards]);

  const timesheetProjectOptions = useMemo(() => {
    const names = new Set();
    timeCards.forEach((card) => (card.projectRows || []).forEach((row) => {
      const name = row.projectName || row.project_name;
      if (name) names.add(name);
    }));
    return Array.from(names).sort();
  }, [timeCards]);

  const filteredTimesheets = useMemo(() => {
    const term = tsSearch.trim().toLowerCase();
    return timeCards
      .filter((card) => timesheetStatusBucket(card.status))
      .filter((card) => tsFilter === "all" || timesheetStatusBucket(card.status) === tsFilter)
      .filter((card) => tsProject === "all" || (card.projectRows || []).some((row) => (row.projectName || row.project_name) === tsProject))
      .filter((card) => {
        if (!tsDate) return true;
        const start = card.weekStartDate || card.week_start_date || "";
        const end = card.weekEndDate || card.week_end_date || "";
        return start && end && tsDate >= start && tsDate <= end;
      })
      .filter((card) => {
        if (!term) return true;
        const haystack = [
          card.timesheetNumber || card.timesheet_number,
          card.technicianName || card.technician_name,
          ...(card.projectRows || []).map((row) => row.projectName || row.project_name)
        ];
        return haystack.some((value) => String(value || "").toLowerCase().includes(term));
      })
      // Most recent week first.
      .sort((a, b) => String(b.weekStartDate || b.week_start_date || "").localeCompare(String(a.weekStartDate || a.week_start_date || "")));
  }, [timeCards, tsFilter, tsSearch, tsProject, tsDate]);

  const tsFilterHandlers = {
    onFilter: (value) => { setTsFilter(value); setTsPage(1); },
    onSearch: (value) => { setTsSearch(value); setTsPage(1); },
    onProject: (value) => { setTsProject(value); setTsPage(1); },
    onDate: (value) => { setTsDate(value); setTsPage(1); }
  };
  const tsPageSafe = Math.min(tsPage, Math.max(1, Math.ceil(filteredTimesheets.length / PAGE_SIZE)));
  const pagedTimesheets = filteredTimesheets.slice((tsPageSafe - 1) * PAGE_SIZE, tsPageSafe * PAGE_SIZE);

  const labCounts = useMemo(() => {
    const pending = labReports.filter((r) => labStatusBucket(r.status) === "pending").length;
    const approved = labReports.filter((r) => labStatusBucket(r.status) === "approved").length;
    const returned = labReports.filter((r) => labStatusBucket(r.status) === "returned").length;
    return { pending, approved, returned, all: labReports.length };
  }, [labReports]);

  const labProjectOptions = useMemo(() => (
    Array.from(new Set(labReports.map((r) => r.projectName).filter(Boolean))).sort()
  ), [labReports]);

  const filteredLabReports = useMemo(() => {
    const term = labSearch.trim().toLowerCase();
    return labReports
      .filter((r) => labFilter === "all" || labStatusBucket(r.status) === labFilter)
      .filter((r) => labProject === "all" || r.projectName === labProject)
      .filter((r) => !labDate || String(r.castDate || "").slice(0, 10) === labDate)
      .filter((r) => {
        if (!term) return true;
        return [r.reportNumber, r.setNumber, r.projectName, r.technicianName, r.dfrNumber].some((v) => String(v || "").toLowerCase().includes(term));
      })
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }, [labReports, labFilter, labSearch, labProject, labDate]);

  const labFilterHandlers = {
    onFilter: (value) => { setLabFilter(value); setLabPage(1); },
    onSearch: (value) => { setLabSearch(value); setLabPage(1); },
    onProject: (value) => { setLabProject(value); setLabPage(1); },
    onDate: (value) => { setLabDate(value); setLabPage(1); }
  };
  const labPageSafe = Math.min(labPage, Math.max(1, Math.ceil(filteredLabReports.length / PAGE_SIZE)));
  const pagedLabReports = filteredLabReports.slice((labPageSafe - 1) * PAGE_SIZE, labPageSafe * PAGE_SIZE);

  function handleLabApprove(report) {
    const reviewerName = profile?.full_name || "Manager";
    approveLabReport(report.id, { reviewerName });
    setLabReports(getSubmittedLabReports());
  }

  function handleLabOpenReturn(report) {
    setLabReturnModal({ report });
    setLabReturnComment("");
  }

  function handleLabReturnConfirm() {
    if (!labReturnModal) return;
    const reviewerName = profile?.full_name || "Manager";
    returnLabReport(labReturnModal.report.id, { reviewerName, comments: labReturnComment.trim() });
    setLabReports(getSubmittedLabReports());
    setLabReturnModal(null);
    setLabReturnComment("");
  }

  async function refreshTimeCards() {
    setTimeCards(await fetchTimesheetQueue());
  }

  async function approveTimesheet(card) {
    const reviewerName = profile?.full_name || "Manager";
    const approved = approveTimeCard(card, reviewerName);
    logAuditEvent({
      action: "timesheet_approved",
      entityType: "timesheet",
      entityId: card.id,
      newValue: { reviewer: reviewerName, totalHours: card.totalHours || card.total_hours }
    });
    // Wait for the shared record before refetching so the row lands on the
    // Approved tab instead of briefly reappearing as pending.
    await syncTimesheet(approved);
    await refreshTimeCards();
    // Regenerate the stored PDF so it carries the approval date and reviewer,
    // sync the storage path back, then notify the employee with the PDF attached.
    try {
      const withPdf = await regenerateTimeCardPdf(approved);
      await syncTimesheet(withPdf);
      let pdfBlob = null;
      try {
        pdfBlob = generateTimeCardPdfBlob(withPdf);
      } catch (err) {
        console.warn("Approved timesheet PDF could not be attached to the email:", err);
      }
      await sendTimesheetDecisionEmail(withPdf, { decision: "approved", reviewerName, pdfBlob });
    } catch (err) {
      console.warn("Approved timesheet PDF could not be regenerated:", err);
      sendTimesheetDecisionEmail(approved, { decision: "approved", reviewerName })
        .catch((emailErr) => console.warn("Timesheet approval email could not be sent:", emailErr));
    }
  }

  async function rejectTimesheet(card) {
    const comments = window.prompt("Reject comments are required.");
    if (!comments || !comments.trim()) return;
    const reviewerName = profile?.full_name || "Manager";
    const rejected = rejectTimeCard(card, comments.trim());
    logAuditEvent({
      action: "timesheet_rejected",
      entityType: "timesheet",
      entityId: card.id,
      newValue: { reviewer: reviewerName, comments: comments.trim() }
    });
    await syncTimesheet(rejected);
    await refreshTimeCards();
    sendTimesheetDecisionEmail(rejected, { decision: "rejected", reviewerName, comments: comments.trim() })
      .catch((err) => console.warn("Timesheet rejection email could not be sent:", err));
  }

  async function archiveDailyLog(log) {
    const confirmed = window.confirm(
      `Archive ${log.number}?\n\nIt will be removed from the review queue. Use this for stale submissions that are no longer available for review — the record stays in the database.`
    );
    if (!confirmed) return;
    const { error } = await supabase
      .from("daily_logs")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", log.rowId);
    if (error) {
      console.error("Daily log archive failed", error);
      window.alert("The daily log could not be archived. Please try again.");
      return;
    }
    setDailyLogs((current) => current.map((row) => (row.id === log.rowId ? { ...row, status: "archived" } : row)));
  }

  async function restoreDailyLog(log) {
    const { error } = await supabase
      .from("daily_logs")
      .update({ status: DAILY_LOG_STATUS.SUBMITTED, updated_at: new Date().toISOString() })
      .eq("id", log.rowId);
    if (error) {
      console.error("Daily log restore failed", error);
      window.alert("The daily log could not be restored. Please try again.");
      return;
    }
    setDailyLogs((current) => current.map((row) => (row.id === log.rowId ? { ...row, status: DAILY_LOG_STATUS.SUBMITTED } : row)));
  }

  function openDailyLogDetails(log) {
    navigate(`/manager/daily-log-review/${log.clientLogId || log.rowId}`);
  }

  async function openDailyLogPdf(log) {
    try {
      if (log.pdfStoragePath) {
        const url = await createDailyLogPdfSignedUrl(log.pdfStoragePath);
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      if (log.pdfUrl) {
        window.open(log.pdfUrl, "_blank", "noopener,noreferrer");
        return;
      }
      window.alert("The PDF for this daily log is not available yet.");
    } catch (err) {
      console.error("Unable to open daily log PDF", err);
      window.alert("Unable to open the PDF right now. Please try again.");
    }
  }

  const kpis = [
    { label: "Daily Logs To Review", value: pendingDailyLogs.length, icon: ClipboardList, chipClass: "bg-blue-50 text-blue-700" },
    { label: "Timesheets To Review", value: submittedTimesheets.length, icon: CalendarDays, chipClass: "bg-blue-50 text-blue-700" },
    { label: "Lab Reports To Review", value: labCounts.pending, icon: FlaskConical, chipClass: "bg-blue-50 text-blue-700" },
    { label: "Delayed Reviews", value: delayedReviews.length, icon: AlertTriangle, chipClass: "bg-rose-50 text-rose-700" },
    { label: "Submitted Today", value: submissionsToday, icon: Send, chipClass: "bg-emerald-50 text-emerald-700" },
    { label: "Active Projects", value: projects.length, icon: FolderKanban, chipClass: "bg-indigo-50 text-indigo-700" }
  ];

  const failedLabReports = useMemo(
    () => labReports.filter((r) => r.breaks && r.breaks.some((b) => b.result === "FAIL")),
    [labReports]
  );

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();

  if (currentView === "teams") {
    return <ComingSoonView title="Teams" description="Manage technician assignments, monitor field team capacity, and track personnel across all active projects." icon={Users} />;
  }
  if (currentView === "analytics") {
    return <ComingSoonView title="Project Insights" description="Analytics dashboards covering submission rates, approval timelines, lab performance, and project health across all operations." icon={BarChart3} />;
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-50 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-5 sm:space-y-6">
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {greeting}{profile?.full_name ? `, ${profile.full_name}` : ""}
            </h1>
            <p className="mt-0.5 text-[13px] font-medium text-slate-500">
              {pendingDailyLogs.length > 0
                ? `${pendingDailyLogs.length} daily ${pendingDailyLogs.length === 1 ? "log" : "logs"} awaiting your review`
                : "No reviews pending"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingDailyLogs.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
                <Clock className="h-3.5 w-3.5" /> {pendingDailyLogs.length} pending
              </span>
            )}
            <button
              type="button"
              onClick={() => navigate("/qc/dashboard")}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Open {MODULE_NAMES.validationCenter}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-6">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.label} {...kpi} />
          ))}
        </section>

        {failedLabReports.length > 0 && (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
            <div className="flex flex-wrap items-start gap-4">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <XCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-rose-800">
                  {failedLabReports.length} Lab {failedLabReports.length === 1 ? "Report" : "Reports"} with Failed Cylinder Breaks
                </p>
                <p className="mt-0.5 text-xs font-semibold text-rose-600">
                  The following reports contain compressive strength results below the specified design strength and require immediate attention.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {failedLabReports.map((r) => (
                    <span key={r.id} className="inline-flex items-center rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-bold text-rose-700">
                      {r.reportNumber || r.id.slice(0, 8)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <button
                type="button"
                onClick={() => setLogsCollapsed((value) => !value)}
                className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <ClipboardList className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold text-slate-950">Daily Log Reviews</h2>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {logCounts.pending} pending • signed PDF attached to each submission email
                    </p>
                  </div>
                </div>
                <span className="flex items-center gap-3">
                  {loading && <span className="text-sm font-semibold text-slate-500">Loading...</span>}
                  <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${logsCollapsed ? "-rotate-90" : ""}`} />
                </span>
              </button>

              {!logsCollapsed && (
              <>
              <QueueFilters
                filters={LOG_FILTERS}
                active={logFilter}
                counts={logCounts}
                onFilter={logFilterHandlers.onFilter}
                search={logSearch}
                onSearch={logFilterHandlers.onSearch}
                searchPlaceholder="Search log #, technician name..."
                projectOptions={logProjectOptions}
                project={logProject}
                onProject={logFilterHandlers.onProject}
                date={logDate}
                onDate={logFilterHandlers.onDate}
                dateLabel="Filter by log date"
              />

              {error && (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
                  {error}
                </div>
              )}

              {filteredLogs.length > 0 && (
                <div className="mt-4 space-y-2 md:hidden">
                  {pagedLogs.map((log) => (
                    <MobileRecordCard
                      key={log.rowId}
                      title={(
                        <button type="button" onClick={() => openDailyLogDetails(log)} title="Open the full daily log" className="font-bold text-slate-950 underline-offset-2 hover:text-blue-700 hover:underline">
                          {log.number}
                        </button>
                      )}
                      status={(
                        <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${logStatusPill(log.bucket).className}`}>
                          {logStatusPill(log.bucket).label}
                        </span>
                      )}
                      fields={[
                        ["Project", log.projectName],
                        ["Technician", log.technician],
                        ["Date", `${log.logDate}${log.shift ? ` • ${log.shift}` : ""}`],
                        ["Contents", `${log.activityCount} ${log.activityCount === 1 ? "activity" : "activities"} • ${log.reportCount} ${log.reportCount === 1 ? "report" : "reports"}`],
                        ["Submitted", agingLabel(log.agingHours)]
                      ]}
                      actions={(
                        <>
                          {log.bucket === "pending" && (
                            <button type="button" onClick={() => archiveDailyLog(log)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500">
                              <Archive className="h-3.5 w-3.5" /> Archive
                            </button>
                          )}
                          {log.bucket === "archived" && (
                            <button type="button" onClick={() => restoreDailyLog(log)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500">
                              <Archive className="h-3.5 w-3.5" /> Restore
                            </button>
                          )}
                          <button type="button" onClick={() => openDailyLogPdf(log)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800">
                            <Eye className="h-3.5 w-3.5" /> View PDF
                          </button>
                          {log.bucket === "pending" && (
                            <button type="button" onClick={() => openDailyLogDetails(log)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-3 text-xs font-bold text-white">
                              <ClipboardCheck className="h-3.5 w-3.5" /> Review
                            </button>
                          )}
                        </>
                      )}
                    />
                  ))}
                </div>
              )}
              {filteredLogs.length > 0 && (
                <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
                  <table className="min-w-[1080px] w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-950 text-xs font-bold uppercase tracking-[0.08em] text-white">
                      <tr>
                        {["Log #", "Project", "Technician", "Date", "Contents", "Status", "Submitted", "Actions"].map((header) => (
                          <th key={header} className="px-3 py-3">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedLogs.map((log) => (
                        <tr key={log.rowId} className={`border-t border-slate-200 ${flagged.has(String(log.rowId)) ? "bg-amber-50" : ""}`}>
                          <td className="px-3 py-3 font-bold text-slate-950">
                            <button type="button" onClick={() => openDailyLogDetails(log)} title="Open the full daily log" className="font-bold underline-offset-2 hover:text-blue-700 hover:underline">
                              {log.number}
                            </button>
                          </td>
                          <td className="px-3 py-3 font-semibold">{log.projectName}</td>
                          <td className="px-3 py-3 font-semibold">
                            <span className="inline-flex items-center gap-1.5">
                              <HardHat className="h-3.5 w-3.5 text-slate-400" /> {log.technician}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-semibold whitespace-nowrap">{log.logDate}{log.shift ? ` • ${log.shift}` : ""}</td>
                          <td className="px-3 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">
                            {log.activityCount} {log.activityCount === 1 ? "activity" : "activities"} • {log.reportCount} {log.reportCount === 1 ? "report" : "reports"}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${logStatusPill(log.bucket).className}`}>
                              {logStatusPill(log.bucket).label}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {log.bucket === "pending" ? (
                              <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${agingTone(log.agingHours)}`}>
                                <Clock className="h-3 w-3" /> {agingLabel(log.agingHours)}
                              </span>
                            ) : (
                              <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{agingLabel(log.agingHours)}</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {log.bucket === "pending" && (
                                <button
                                  type="button"
                                  onClick={() => archiveDailyLog(log)}
                                  title="Remove a stale submission from the review queue"
                                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                                >
                                  <Archive className="h-3.5 w-3.5" /> Archive
                                </button>
                              )}
                              {log.bucket === "archived" && (
                                <button
                                  type="button"
                                  onClick={() => restoreDailyLog(log)}
                                  title="Return this submission to the pending review queue"
                                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                                >
                                  <Archive className="h-3.5 w-3.5" /> Restore
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleFlag(log.rowId)}
                                title={flagged.has(String(log.rowId)) ? "Remove flag" : "Flag for attention"}
                                className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold ${flagged.has(String(log.rowId)) ? "border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200" : "border-slate-200 bg-white text-slate-500 hover:bg-amber-50 hover:text-amber-600"}`}
                              >
                                <Flag className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openDailyLogPdf(log)}
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
                              >
                                <Eye className="h-3.5 w-3.5" /> View PDF
                              </button>
                              {/* Only a pending log has something to act on. A decided
                                  one is locked, and View PDF already shows it; its full
                                  record opens from the log number. */}
                              {log.bucket === "pending" && (
                                <button
                                  type="button"
                                  onClick={() => openDailyLogDetails(log)}
                                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-blue-700 px-3 text-xs font-bold text-white hover:bg-blue-800"
                                >
                                  <ClipboardCheck className="h-3.5 w-3.5" /> Review
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!loading && filteredLogs.length === 0 && (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
                  <p className="text-sm font-bold text-slate-700">
                    {logSearch.trim() || logProject !== "all" || logDate
                      ? "No daily logs match your filters."
                      : logFilter === "pending"
                        ? "No daily logs are waiting for review."
                        : `No ${logFilter === "all" ? "" : logFilter + " "}daily logs yet.`}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">New technician submissions will appear here automatically.</p>
                </div>
              )}
              <Paginator page={logPageSafe} total={filteredLogs.length} onPage={setLogPage} noun="daily logs" />
              </>
              )}
            </div>

            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <button
                type="button"
                onClick={() => setTimesheetsCollapsed((value) => !value)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <CalendarDays className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold text-slate-950">Weekly Timesheets</h2>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">{submittedTimesheets.length} pending manager review</p>
                  </div>
                </div>
                <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${timesheetsCollapsed ? "-rotate-90" : ""}`} />
              </button>
              {!timesheetsCollapsed && (
                <>
                  <QueueFilters
                    filters={TIMESHEET_FILTERS}
                    active={tsFilter}
                    counts={timesheetCounts}
                    onFilter={tsFilterHandlers.onFilter}
                    search={tsSearch}
                    onSearch={tsFilterHandlers.onSearch}
                    searchPlaceholder="Search timesheet #, employee name..."
                    projectOptions={timesheetProjectOptions}
                    project={tsProject}
                    onProject={tsFilterHandlers.onProject}
                    date={tsDate}
                    onDate={tsFilterHandlers.onDate}
                    dateLabel="Show the week containing this date"
                  />
                  {filteredTimesheets.length === 0 ? (
                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
                        <CalendarDays className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-700">
                          {tsSearch.trim() || tsProject !== "all" || tsDate
                            ? "No timesheets match your filters."
                            : tsFilter === "pending"
                              ? "No weekly timesheets are pending review."
                              : `No ${tsFilter === "all" ? "" : tsFilter + " "}timesheets yet.`}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">Submitted timesheets will appear here for approval.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <TimesheetReviewTable
                        timesheets={pagedTimesheets}
                        onApprove={approveTimesheet}
                        onReject={rejectTimesheet}
                        highlightedTimesheet={highlightedTimesheet}
                      />
                      <Paginator page={tsPageSafe} total={filteredTimesheets.length} onPage={setTsPage} noun="timesheets" />
                    </>
                  )}
                </>
              )}
            </section>

            {/* ── Lab Reports Review Queue ── */}
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <button
                type="button"
                onClick={() => setLabCollapsed((v) => !v)}
                className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <FlaskConical className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold text-slate-950">Lab Reports</h2>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {labCounts.pending} pending review • cylinder break compressive strength reports
                    </p>
                  </div>
                </div>
                <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${labCollapsed ? "-rotate-90" : ""}`} />
              </button>

              {!labCollapsed && (
                <>
                  <QueueFilters
                    filters={LAB_FILTERS}
                    active={labFilter}
                    counts={labCounts}
                    onFilter={labFilterHandlers.onFilter}
                    search={labSearch}
                    onSearch={labFilterHandlers.onSearch}
                    searchPlaceholder="Search report #, set number, project, technician…"
                    projectOptions={labProjectOptions}
                    project={labProject}
                    onProject={labFilterHandlers.onProject}
                    date={labDate}
                    onDate={labFilterHandlers.onDate}
                    dateLabel="Filter by cast date"
                  />

                  {filteredLabReports.length === 0 ? (
                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
                        <FlaskConical className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-700">
                          {labSearch.trim() || labProject !== "all" || labDate
                            ? "No lab reports match your filters."
                            : labFilter === "pending"
                              ? "No lab reports are pending review."
                              : `No ${labFilter === "all" ? "" : labFilter + " "}lab reports yet.`}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">Submitted cylinder break reports will appear here for approval.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Mobile cards */}
                      <div className="mt-4 space-y-2 md:hidden">
                        {pagedLabReports.map((report) => {
                          const bucket = labStatusBucket(report.status);
                          const pill = labStatusPill(bucket);
                          const pf = labPassFail(report);
                          return (
                            <MobileRecordCard
                              key={report.id}
                              title={report.reportNumber || "—"}
                              status={(
                                <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${pill.className}`}>
                                  {pill.label}
                                </span>
                              )}
                              fields={[
                                ["Project", report.projectName || "No project"],
                                ["Set / DFR", [report.setNumber && `Set ${report.setNumber}`, report.dfrNumber].filter(Boolean).join(" · ") || "—"],
                                ["Technician", report.technicianName || "—"],
                                ["Cast Date", report.castDate || "—"],
                                ["Results", `${pf.label} · ${(report.breaks || []).length} cyl.`]
                              ]}
                              actions={(
                                <>
                                  <button type="button" onClick={() => openLabPdf(report)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50">
                                    <Eye className="h-3.5 w-3.5" /> View PDF
                                  </button>
                                  {bucket === "pending" && (
                                    <>
                                      <button type="button" onClick={() => handleLabApprove(report)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-600">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                                      </button>
                                      <button type="button" onClick={() => handleLabOpenReturn(report)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:bg-rose-50">
                                        <RotateCcw className="h-3.5 w-3.5" /> Return
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            />
                          );
                        })}
                      </div>

                      {/* Desktop table */}
                      <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
                        <table className="min-w-[960px] w-full border-collapse text-left text-sm">
                          <thead className="bg-slate-950 text-xs font-bold uppercase tracking-[0.08em] text-white">
                            <tr>
                              {["Report #", "Project", "Set / DFR", "Technician", "Cast Date", "Results", "Status", "Actions"].map((h) => (
                                <th key={h} className="px-3 py-3">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pagedLabReports.map((report) => {
                              const bucket = labStatusBucket(report.status);
                              const pill = labStatusPill(bucket);
                              const pf = labPassFail(report);
                              return (
                                <tr key={report.id} className={`border-t border-slate-200 ${flagged.has(String(report.id)) ? "bg-amber-50" : ""}`}>
                                  <td className="px-3 py-3 font-bold text-slate-950 whitespace-nowrap">{report.reportNumber || "—"}</td>
                                  <td className="max-w-[180px] px-3 py-3">
                                    <p className="truncate font-semibold text-slate-900">{report.projectName || <span className="italic font-normal text-slate-400">No project</span>}</p>
                                  </td>
                                  <td className="px-3 py-3 whitespace-nowrap font-semibold text-slate-700">
                                    {report.setNumber && <span>Set {report.setNumber}</span>}
                                    {report.dfrNumber && <span className="text-slate-400"> · {report.dfrNumber}</span>}
                                    {!report.setNumber && !report.dfrNumber && <span className="italic font-normal text-slate-400">—</span>}
                                  </td>
                                  <td className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1.5">
                                      <HardHat className="h-3.5 w-3.5 text-slate-400" /> {report.technicianName || "—"}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 font-semibold whitespace-nowrap text-slate-700">{report.castDate || "—"}</td>
                                  <td className="px-3 py-3 whitespace-nowrap">
                                    <span className={`text-sm font-bold ${pf.className}`}>{pf.label}</span>
                                    <span className="ml-1.5 text-xs font-semibold text-slate-400">{(report.breaks || []).length} cyl.</span>
                                  </td>
                                  <td className="px-3 py-3">
                                    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${pill.className}`}>{pill.label}</span>
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleFlag(report.id)}
                                        title={flagged.has(String(report.id)) ? "Remove flag" : "Flag for attention"}
                                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold ${flagged.has(String(report.id)) ? "border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200" : "border-slate-200 bg-white text-slate-500 hover:bg-amber-50 hover:text-amber-600"}`}
                                      >
                                        <Flag className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => navigate(`/lab-reports/${report.id}/edit`)}
                                        className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
                                      >
                                        <Edit2 className="h-3.5 w-3.5" /> Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openLabPdf(report)}
                                        className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
                                      >
                                        <Eye className="h-3.5 w-3.5" /> View PDF
                                      </button>
                                      {bucket === "pending" && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => handleLabApprove(report)}
                                            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                                          >
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleLabOpenReturn(report)}
                                            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:bg-rose-50"
                                          >
                                            <RotateCcw className="h-3.5 w-3.5" /> Return
                                          </button>
                                        </>
                                      )}
                                      {bucket === "approved" && (
                                        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
                                          <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                                        </span>
                                      )}
                                      {bucket === "returned" && (
                                        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700">
                                          <RotateCcw className="h-3.5 w-3.5" /> Returned
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <Paginator page={labPageSafe} total={filteredLabReports.length} onPage={setLabPage} noun="reports" />
                    </>
                  )}
                </>
              )}
            </section>
          </div>

          <div className="flex flex-col gap-5">
          <aside className="order-2 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:order-1">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <BarChart3 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Review Summary</h2>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {logCounts.pending + timesheetCounts.pending + labCounts.pending} pending across all queues
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Daily Logs</p>
              <div className="mt-2 flex items-center gap-3">
                <DonutChart
                  segments={[
                    { label: "Pending", value: logCounts.pending, color: "#f59e0b" },
                    { label: "Approved", value: logCounts.approved, color: "#10b981" },
                    { label: "Returned", value: logCounts.returned, color: "#f43f5e" }
                  ]}
                />
                <div className="min-w-0 flex-1">
                  <SummaryLegendRow color="#f59e0b" label="Pending" count={logCounts.pending} onClick={() => logFilterHandlers.onFilter("pending")} />
                  <SummaryLegendRow color="#10b981" label="Approved" count={logCounts.approved} onClick={() => logFilterHandlers.onFilter("approved")} />
                  <SummaryLegendRow color="#f43f5e" label="Returned" count={logCounts.returned} onClick={() => logFilterHandlers.onFilter("returned")} />
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between rounded-xl bg-slate-950 px-3 py-2">
                <span className="text-[11px] font-bold text-slate-300">Cleared rate</span>
                <span className="text-sm font-bold text-white">
                  {logCounts.active ? Math.round((logCounts.approved / logCounts.active) * 100) : 0}%
                </span>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Weekly Timesheets</p>
              <div className="mt-2 flex items-center gap-3">
                <DonutChart
                  segments={[
                    { label: "Pending", value: timesheetCounts.pending, color: "#f59e0b" },
                    { label: "Approved", value: timesheetCounts.approved, color: "#10b981" },
                    { label: "Rejected", value: timesheetCounts.rejected, color: "#f43f5e" }
                  ]}
                />
                <div className="min-w-0 flex-1">
                  <SummaryLegendRow color="#f59e0b" label="Pending" count={timesheetCounts.pending} />
                  <SummaryLegendRow color="#10b981" label="Approved" count={timesheetCounts.approved} />
                  <SummaryLegendRow color="#f43f5e" label="Rejected" count={timesheetCounts.rejected} />
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between rounded-xl bg-slate-950 px-3 py-2">
                <span className="text-[11px] font-bold text-slate-300">Approval rate</span>
                <span className="text-sm font-bold text-white">
                  {(timesheetCounts.pending + timesheetCounts.approved + timesheetCounts.rejected)
                    ? Math.round((timesheetCounts.approved / (timesheetCounts.pending + timesheetCounts.approved + timesheetCounts.rejected)) * 100)
                    : 0}%
                </span>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Lab Reports</p>
              <div className="mt-2 flex items-center gap-3">
                <DonutChart
                  segments={[
                    { label: "Pending", value: labCounts.pending, color: "#f59e0b" },
                    { label: "Approved", value: labCounts.approved, color: "#10b981" },
                    { label: "Returned", value: labCounts.returned, color: "#f43f5e" }
                  ]}
                />
                <div className="min-w-0 flex-1">
                  <SummaryLegendRow color="#f59e0b" label="Pending" count={labCounts.pending} onClick={() => labFilterHandlers.onFilter("pending")} />
                  <SummaryLegendRow color="#10b981" label="Approved" count={labCounts.approved} onClick={() => labFilterHandlers.onFilter("approved")} />
                  <SummaryLegendRow color="#f43f5e" label="Returned" count={labCounts.returned} onClick={() => labFilterHandlers.onFilter("returned")} />
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between rounded-xl bg-slate-950 px-3 py-2">
                <span className="text-[11px] font-bold text-slate-300">Approval rate</span>
                <span className="text-sm font-bold text-white">
                  {labCounts.all ? Math.round((labCounts.approved / labCounts.all) * 100) : 0}%
                </span>
              </div>
            </div>

            {/* PM Quick Actions */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">PM Actions</p>
              <div className="mt-2.5 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    const newLog = saveDailyLog(createDailyLog({
                      technicianName: profile?.full_name || "Manager",
                      userId: session?.user?.id || null,
                    }));
                    navigate(`/technician/daily-log/${newLog.id}`);
                  }}
                  className="flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 text-left text-xs font-bold text-slate-800 hover:border-blue-200 hover:bg-blue-50/50"
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                  Create Daily Log
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/timesheets")}
                  className="flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 text-left text-xs font-bold text-slate-800 hover:border-blue-200 hover:bg-blue-50/50"
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
                    <CalendarDays className="h-3.5 w-3.5" />
                  </span>
                  My Timesheet
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/project/1/lab-reports/create`)}
                  className="flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 text-left text-xs font-bold text-slate-800 hover:border-blue-200 hover:bg-blue-50/50"
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                    <FlaskConical className="h-3.5 w-3.5" />
                  </span>
                  Create Lab Report
                </button>
              </div>
            </div>
          </aside>

          </div>
        </section>

      </div>

      {/* Return-for-corrections modal */}
      {labReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
                  <RotateCcw className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-950">Return for Corrections</h3>
                  <p className="text-xs font-semibold text-slate-500">{labReturnModal.report.reportNumber}</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Comments for technician <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={labReturnComment}
                onChange={(e) => setLabReturnComment(e.target.value)}
                rows={4}
                placeholder="Describe what needs to be corrected or clarified…"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setLabReturnModal(null)}
                className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLabReturnConfirm}
                disabled={!labReturnComment.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-2xl bg-rose-600 px-5 text-sm font-bold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" /> Return Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerDashboard;
