import TimesheetWorkspace from "../modules/timesheets/TimesheetWorkspace";

// Role-neutral timesheets page: every employee (technician, manager, QC,
// admin) files their weekly timesheet here; approvals route to each
// project's manager.
export default function TimesheetsPage() {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <TimesheetWorkspace />
      </div>
    </div>
  );
}
