// Pay periods run in fixed cycles (14 days by default) from a start date the
// company sets, so an approved timesheet can name the period it belongs to
// and payroll can batch a run without working the dates out by hand.
import { localDateString, toLocalDateString } from "./dates";

const DAY_MS = 86400000;

function parseLocalDate(value) {
  const text = toLocalDateString(value);
  return text ? new Date(`${text}T00:00:00`) : new Date(NaN);
}

// The period containing `date`, counted in whole cycles from `startDate`.
// Returns null when the company has not set a start date, so callers can leave
// the period out rather than inventing one.
export function payrollPeriodFor(date, startDate, periodDays = 14) {
  const day = parseLocalDate(date);
  const anchor = parseLocalDate(startDate);
  const length = Number(periodDays) > 0 ? Math.floor(Number(periodDays)) : 14;
  if (Number.isNaN(day.getTime()) || Number.isNaN(anchor.getTime())) return null;

  // Whole cycles between the anchor and the day, rounding down even for dates
  // before the anchor, so periods tile the calendar in both directions.
  const elapsedDays = Math.round((day - anchor) / DAY_MS);
  const index = Math.floor(elapsedDays / length);

  const start = new Date(anchor);
  start.setDate(start.getDate() + index * length);
  const end = new Date(start);
  end.setDate(end.getDate() + length - 1);

  return { start: localDateString(start), end: localDateString(end), index, length };
}

// "Sep 07 – Sep 20, 2026" for an email or a report header.
export function formatPayrollPeriod(period) {
  if (!period) return "";
  const start = parseLocalDate(period.start);
  const end = parseLocalDate(period.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const short = (d) => d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
  return `${short(start)} – ${short(end)}, ${end.getFullYear()}`;
}
