import { supabase } from "./supabase";

// Mirrors timesheet cards into the Supabase `timesheets` table so managers can
// review and approve from any browser/device. localStorage remains the
// technician's working copy; this table is the shared source of truth for
// anything past draft.
//
// Required table (run once in the Supabase SQL editor):
//
//   create table if not exists timesheets (
//     id text primary key,
//     timesheet_number text,
//     technician_name text,
//     week_start_date date,
//     week_end_date date,
//     status text default 'submitted',
//     total_regular_hours numeric default 0,
//     total_overtime_hours numeric default 0,
//     total_hours numeric default 0,
//     payload jsonb not null,
//     submitted_at timestamptz,
//     reviewed_by text,
//     reviewed_at timestamptz,
//     manager_comment text,
//     created_at timestamptz default now(),
//     updated_at timestamptz default now()
//   );
//   alter table timesheets enable row level security;
//   create policy "timesheets_open" on timesheets for all using (true) with check (true);

function toNullableDate(value) {
  return value ? value : null;
}

function toRow(card) {
  // PDF data URLs are several MB; the durable PDF lives in Supabase storage.
  // eslint-disable-next-line no-unused-vars
  const { pdfDataUrl, pdf_data_url, ...payload } = card;
  return {
    id: String(card.id),
    timesheet_number: card.timesheetNumber || card.timesheet_number || null,
    technician_name: card.technicianName || card.technician_name || null,
    week_start_date: toNullableDate(card.weekStartDate || card.week_start_date),
    week_end_date: toNullableDate(card.weekEndDate || card.week_end_date),
    status: card.status || "draft",
    total_regular_hours: Number(card.totalRegularHours || card.total_regular_hours || 0),
    total_overtime_hours: Number(card.totalOvertimeHours || card.total_overtime_hours || 0),
    total_hours: Number(card.totalHours || card.total_hours || 0),
    payload,
    submitted_at: toNullableDate(card.submittedAt || card.submitted_at),
    reviewed_by: card.reviewedBy || card.reviewed_by || null,
    reviewed_at: toNullableDate(card.reviewedAt || card.reviewed_at),
    manager_comment: card.managerComment || card.reviewComments || card.review_comments || null,
    updated_at: new Date().toISOString()
  };
}

function rowToCard(row) {
  return {
    ...(row.payload || {}),
    id: row.id,
    status: row.status,
    reviewedBy: row.reviewed_by || row.payload?.reviewedBy || "",
    reviewed_by: row.reviewed_by || row.payload?.reviewed_by || "",
    reviewedAt: row.reviewed_at || row.payload?.reviewedAt || "",
    reviewed_at: row.reviewed_at || row.payload?.reviewed_at || "",
    managerComment: row.manager_comment || row.payload?.managerComment || ""
  };
}

// Fire-and-forget mirror of a card's latest state. Never blocks the UI flow.
export function syncTimesheet(card) {
  if (!card?.id) return Promise.resolve(null);
  return supabase
    .from("timesheets")
    .upsert(toRow(card), { onConflict: "id" })
    .then(({ error }) => {
      if (error) console.warn("Timesheet could not be synced to Supabase. Has the timesheets table been created?", error);
      return error ? null : card;
    });
}

// Manager review queue — every reviewed or reviewable timesheet from every
// technician/browser. Approved and rejected rows stay visible so the manager
// dashboard's Approved/Rejected tabs have history; only drafts are excluded.
export async function fetchTimesheetQueue(statuses = ["submitted", "pending_review", "approved", "completed", "rejected", "returned"]) {
  const { data, error } = await supabase
    .from("timesheets")
    .select("*")
    .in("status", statuses)
    .order("submitted_at", { ascending: false });
  if (error) {
    console.warn("Timesheet queue could not be loaded from Supabase.", error);
    return [];
  }
  return (data || []).map(rowToCard);
}

// All of one technician's synced timesheets — used to restore the local list
// when the technician signs in on a new browser or device.
export async function fetchTimesheetsForTechnician(technicianName) {
  if (!technicianName) return [];
  const { data, error } = await supabase
    .from("timesheets")
    .select("*")
    .eq("technician_name", technicianName)
    .order("submitted_at", { ascending: false });
  if (error) {
    console.warn("Technician timesheets could not be loaded from Supabase.", error);
    return [];
  }
  return (data || []).map(rowToCard);
}

// Status updates for the technician's local cards (approvals/returns made on
// the manager's machine).
export async function fetchTimesheetStatusUpdates(ids) {
  if (!ids?.length) return [];
  const { data, error } = await supabase
    .from("timesheets")
    .select("id,status,reviewed_by,reviewed_at,manager_comment")
    .in("id", ids.map(String));
  if (error) {
    console.warn("Timesheet status updates could not be loaded.", error);
    return [];
  }
  return data || [];
}
