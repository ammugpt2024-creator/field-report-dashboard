import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  FolderKanban,
  HardHat,
  Search,
  Send,
  Users
} from "lucide-react";
import { supabase } from "../services/supabase";
import { MODULE_NAMES } from "../config/branding";
import { DAILY_LOG_STATUS } from "../services/dailyLogService";
import { createDailyLogPdfSignedUrl } from "../services/dailyLogPdfService";
import { WEEK_DAYS, approveTimeCard, formatTimeCardStatus, getRowTotal, rejectTimeCard, TIME_CARD_STATUS } from "../services/timeCardService";
import { regenerateTimeCardPdf } from "../services/timeCardPdfService";
import { fetchTimesheetQueue, syncTimesheet } from "../services/timesheetSyncService";

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

function TimesheetReviewTable({ timesheets, onApprove, onReject, highlightedTimesheet = "" }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
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
            return (
            <Fragment key={card.id}>
              <tr
                className={`border-t border-slate-200 ${isHighlighted ? "bg-amber-50" : ""}`}
                ref={isHighlighted ? (node) => node?.scrollIntoView({ behavior: "smooth", block: "center" }) : undefined}
              >
                <td className="px-3 py-3 font-bold text-slate-950">{timesheetNumber}</td>
                <td className="px-3 py-3 font-semibold">{card.technicianName || card.technician_name}</td>
                <td className="px-3 py-3 font-semibold">{(card.projectRows || []).map((row) => row.projectName || row.project_name).filter(Boolean).join(", ") || card.projectName || "-"}</td>
                <td className="px-3 py-3 font-semibold">{card.weekStartDate || card.week_start_date} - {card.weekEndDate || card.week_end_date}</td>
                <td className="px-3 py-3 font-bold">{card.totalRegularHours || card.total_regular_hours || "0.00"}</td>
                <td className="px-3 py-3 font-bold">{card.totalOvertimeHours || card.total_overtime_hours || "0.00"}</td>
                <td className="px-3 py-3 font-bold">{card.totalHours || card.total_hours || "0.00"}</td>
                <td className="px-3 py-3 font-bold">{formatTimeCardStatus(card.status)}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onApprove(card)} className="min-h-9 rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white">Approve</button>
                    <button type="button" onClick={() => onReject(card)} className="min-h-9 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">Reject</button>
                  </div>
                </td>
              </tr>
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
            </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
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
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${chipClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ManagerDashboard() {
  const navigate = useNavigate();
  // Approval emails deep-link to a specific timesheet via ?timesheet=TS-….
  const highlightedTimesheet = new URLSearchParams(window.location.search).get("timesheet") || "";
  const [projects, setProjects] = useState([]);
  const [dailyLogs, setDailyLogs] = useState([]);
  const [timeCards, setTimeCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logFilter, setLogFilter] = useState("pending");
  const [logSearch, setLogSearch] = useState("");
  const [logsCollapsed, setLogsCollapsed] = useState(false);
  const [timesheetsCollapsed, setTimesheetsCollapsed] = useState(false);

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

  const describedLogs = useMemo(() => (
    dailyLogs
      .map(describeDailyLogRow)
      .map((log) => ({ ...log, bucket: logStatusBucket(log.status) }))
      .filter((log) => log.bucket)
      .sort((a, b) => b.agingHours - a.agingHours)
  ), [dailyLogs]);

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

  const filteredLogs = useMemo(() => {
    const term = logSearch.trim().toLowerCase();
    return describedLogs
      .filter((log) => logFilter === "all" || log.bucket === logFilter)
      .filter((log) => !term || [log.number, log.projectName, log.technician, log.logDate].some((value) => String(value).toLowerCase().includes(term)));
  }, [describedLogs, logFilter, logSearch]);

  const pendingDailyLogs = useMemo(() => describedLogs.filter((log) => log.bucket === "pending"), [describedLogs]);

  const approvedDailyLogsToday = useMemo(() => (
    dailyLogs.filter((row) => String(row.status || "").toLowerCase() === DAILY_LOG_STATUS.APPROVED && isToday(row.updated_at))
  ), [dailyLogs]);

  const delayedReviews = pendingDailyLogs.filter((log) => log.agingHours >= 12);
  const submissionsToday = dailyLogs.filter((row) => isToday(row.submitted_at)).length;
  const submittedTimesheets = timeCards.filter((card) => [TIME_CARD_STATUS.SUBMITTED, TIME_CARD_STATUS.PENDING_REVIEW].includes(card.status));

  const timesheetCounts = useMemo(() => {
    const countByStatuses = (statuses) => timeCards.filter((card) => statuses.includes(card.status)).length;
    return {
      pending: countByStatuses([TIME_CARD_STATUS.SUBMITTED, TIME_CARD_STATUS.PENDING_REVIEW]),
      approved: countByStatuses([TIME_CARD_STATUS.APPROVED, TIME_CARD_STATUS.COMPLETED]),
      rejected: countByStatuses([TIME_CARD_STATUS.REJECTED, TIME_CARD_STATUS.RETURNED])
    };
  }, [timeCards]);

  async function refreshTimeCards() {
    setTimeCards(await fetchTimesheetQueue());
  }

  function approveTimesheet(card) {
    const approved = approveTimeCard(card, "Manager");
    refreshTimeCards();
    // Regenerate the stored PDF so it carries the approval date and reviewer,
    // then sync the PDF storage path back to the shared record.
    regenerateTimeCardPdf(approved)
      .then((withPdf) => syncTimesheet(withPdf))
      .catch((err) => console.warn("Approved timesheet PDF could not be regenerated:", err));
  }

  function rejectTimesheet(card) {
    const comments = window.prompt("Reject comments are required.");
    if (!comments || !comments.trim()) return;
    rejectTimeCard(card, comments.trim());
    refreshTimeCards();
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
    { label: "Delayed Reviews", value: delayedReviews.length, icon: AlertTriangle, chipClass: "bg-rose-50 text-rose-700" },
    { label: "Submitted Today", value: submissionsToday, icon: Send, chipClass: "bg-emerald-50 text-emerald-700" },
    { label: "Approved Today", value: approvedDailyLogsToday.length, icon: ClipboardCheck, chipClass: "bg-emerald-50 text-emerald-700" },
    { label: "Active Projects", value: projects.length, icon: FolderKanban, chipClass: "bg-indigo-50 text-indigo-700" }
  ];

  const managerActions = [
    { label: `Open ${MODULE_NAMES.validationCenter}`, icon: ClipboardCheck, onClick: () => navigate("/qc/dashboard") },
    { label: "My Timesheet", icon: CalendarDays, onClick: () => navigate("/timesheets") },
    { label: `Open ${MODULE_NAMES.projectHub}`, icon: FolderKanban, onClick: () => navigate("/project/1") },
    { label: "Assign Reviewers", icon: Users, onClick: () => navigate("/qc/dashboard") },
    { label: "Monitor Teams", icon: BarChart3, onClick: () => navigate("/manager/dashboard?view=teams") },
    { label: "Open Digital Deliverables", icon: FileText, onClick: () => navigate("/project/1/field-reports/concrete-test-log") }
  ];

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-5">
        <section className="overflow-hidden rounded-3xl border border-slate-200 shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Project Operations Overview</p>
                <h1 className="mt-1 text-3xl font-bold text-white sm:text-4xl">{MODULE_NAMES.commandCenter}</h1>
                <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <CalendarDays className="h-4 w-4" /> {today}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {pendingDailyLogs.length > 0 && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300">
                    <Clock className="h-3.5 w-3.5" />
                    {pendingDailyLogs.length} daily {pendingDailyLogs.length === 1 ? "log" : "logs"} awaiting your review
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => navigate("/qc/dashboard")}
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-500"
                >
                  Open {MODULE_NAMES.validationCenter}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.label} {...kpi} />
          ))}
        </section>

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
              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-1.5 rounded-2xl bg-slate-100 p-1.5">
                  {LOG_FILTERS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLogFilter(key)}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${
                        logFilter === key ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"
                      }`}
                    >
                      {label}
                      <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        logFilter === key ? "bg-blue-50 text-blue-700" : "bg-slate-200 text-slate-600"
                      }`}>
                        {logCounts[key]}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="relative w-full lg:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={logSearch}
                    onChange={(event) => setLogSearch(event.target.value)}
                    placeholder="Search log #, project, technician..."
                    className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
                  {error}
                </div>
              )}

              <div className="mt-4 space-y-3">
                {filteredLogs.map((log) => (
                  <article key={log.rowId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words text-sm font-bold text-slate-950">{log.number}</p>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${logStatusPill(log.bucket).className}`}>
                            {logStatusPill(log.bucket).label}
                          </span>
                          {log.bucket === "pending" && (
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${agingTone(log.agingHours)}`}>
                              <Clock className="h-3 w-3" /> {agingLabel(log.agingHours)}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-600">{log.projectName}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                            <HardHat className="h-3.5 w-3.5" /> {log.technician}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                            <CalendarDays className="h-3.5 w-3.5" /> {log.logDate}{log.shift ? ` • ${log.shift}` : ""}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                            {log.activityCount} {log.activityCount === 1 ? "activity" : "activities"} • {log.reportCount} {log.reportCount === 1 ? "report" : "reports"}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {log.bucket === "pending" && (
                          <button
                            type="button"
                            onClick={() => archiveDailyLog(log)}
                            title="Remove a stale submission from the review queue"
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                          >
                            <Archive className="h-4 w-4" /> Archive
                          </button>
                        )}
                        {log.bucket === "archived" && (
                          <button
                            type="button"
                            onClick={() => restoreDailyLog(log)}
                            title="Return this submission to the pending review queue"
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                          >
                            <Archive className="h-4 w-4" /> Restore
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openDailyLogPdf(log)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
                        >
                          <Eye className="h-4 w-4" /> View PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/manager/daily-log-review/${log.clientLogId || log.rowId}`)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-bold text-white hover:bg-blue-600"
                        >
                          <ClipboardCheck className="h-4 w-4" /> {log.bucket === "pending" ? "Review" : "Open"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {!loading && filteredLogs.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
                    <p className="text-sm font-bold text-slate-700">
                      {logSearch.trim()
                        ? "No daily logs match your search."
                        : logFilter === "pending"
                          ? "No daily logs are waiting for review."
                          : `No ${logFilter === "all" ? "" : logFilter + " "}daily logs yet.`}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">New technician submissions will appear here automatically.</p>
                  </div>
                )}
              </div>
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
                submittedTimesheets.length === 0 ? (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-700">No weekly timesheets are pending review.</p>
                      <p className="text-xs font-semibold text-slate-500">Submitted timesheets will appear here for approval.</p>
                    </div>
                  </div>
                ) : (
                  <TimesheetReviewTable
                    timesheets={submittedTimesheets}
                    onApprove={approveTimesheet}
                    onReject={rejectTimesheet}
                    highlightedTimesheet={highlightedTimesheet}
                  />
                )
              )}
            </section>
          </div>

          <div className="space-y-5">
          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <BarChart3 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Review Summary</h2>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {logCounts.active} active {logCounts.active === 1 ? "submission" : "submissions"}
                  {logCounts.archived ? ` • ${logCounts.archived} archived` : ""}
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
                  <SummaryLegendRow color="#f59e0b" label="Pending" count={logCounts.pending} onClick={() => setLogFilter("pending")} />
                  <SummaryLegendRow color="#10b981" label="Approved" count={logCounts.approved} onClick={() => setLogFilter("approved")} />
                  <SummaryLegendRow color="#f43f5e" label="Returned" count={logCounts.returned} onClick={() => setLogFilter("returned")} />
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
          </aside>

          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Operational Controls</h2>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">{projects.length} active {projects.length === 1 ? "project" : "projects"}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {managerActions.map(({ label, icon: Icon, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-bold text-slate-800 hover:border-blue-200 hover:bg-blue-50/50"
                >
                  <Icon className="h-4 w-4 text-blue-700" />
                  {label}
                </button>
              ))}
            </div>
          </aside>
          </div>
        </section>

      </div>
    </div>
  );
}

export default ManagerDashboard;
