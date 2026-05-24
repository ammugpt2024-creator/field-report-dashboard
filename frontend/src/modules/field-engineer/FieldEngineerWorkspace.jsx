import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardList,
  Cloud,
  CloudOff,
  Copy,
  FileClock,
  FileText,
  MapPin,
  Plus,
  RotateCcw,
  Send,
  Upload
} from "lucide-react";
import StatusBadge from "../../components/StatusBadge";
import ReportActions from "../../components/ReportActions";
import { MODULE_NAMES } from "../../config/branding";
import { ACTION_IDS, REPORT_STATUS } from "../../workflow/workflowEngine";
import {
  ACTIVITY_EXAMPLES,
  EMPTY_ASSIGNMENTS,
  INSPECTION_TEMPLATES,
  SITE_RECORD_TYPES,
  UPLOAD_OPTIONS
} from "./fieldEngineerConfig";
import { formatDateTime, getGreeting } from "./fieldEngineerData";

function priorityTone(priority) {
  if (priority === "High") return "border-rose-200 bg-rose-50 text-rose-800";
  if (priority === "Elevated") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function sectionTitle(kicker, title, description) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">{kicker}</p>
      <h2 className="mt-2 text-xl font-bold text-slate-950 sm:text-2xl">{title}</h2>
      {description && <p className="mt-2 max-w-3xl text-sm font-medium text-slate-600">{description}</p>}
    </div>
  );
}

function EnterpriseCard({ children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

function KpiCard({ label, value, icon: Icon, tone }) {
  return (
    <EnterpriseCard className="min-h-[128px]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-slate-600">{label}</p>
        <span className={`rounded-2xl p-2 ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-5 text-4xl font-semibold text-slate-950">{value}</p>
    </EnterpriseCard>
  );
}

function ActionButton({ label, icon: Icon, onClick, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold shadow-sm transition ${
        primary
          ? "bg-slate-950 text-white hover:bg-slate-800"
          : "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

function WorkCard({ report, role, actions, onAction, onDiscardDraft, discardingId, compact = false }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${priorityTone(report.priority)}`}>
              {report.priority}
            </span>
            <StatusBadge status={report.status} />
          </div>
          <h3 className="mt-3 break-words text-lg font-bold text-slate-950">{report.inspectionType}</h3>
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-600">
            <MapPin className="h-4 w-4 shrink-0" />
            {report.projectLabel}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Last Updated</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{formatDateTime(report.updated_at || report.created_at)}</p>
        </div>
      </div>

      {!compact && (
        <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-600">
          {report.dfr_number || `Draft ${report.id}`} is available for field execution, validation tracking, or revision follow-up.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <ReportActions
          role={role}
          status={report.status}
          pdfUrl={report.pdfUrl}
          isMobile
          allowedActions={actions}
          onAction={(actionId) => onAction(actionId, report)}
        />
        {[REPORT_STATUS.DRAFT, REPORT_STATUS.GENERATED].includes(report.normalizedStatus) && onDiscardDraft && (
          <button
            type="button"
            onClick={() => onDiscardDraft(report)}
            disabled={discardingId === report.id}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {discardingId === report.id ? "Discarding..." : "Discard Draft"}
          </button>
        )}
      </div>
    </article>
  );
}

function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <p className="text-lg font-bold text-slate-950">{title}</p>
      <p className="mt-2 text-sm font-medium text-slate-600">{description}</p>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function TodayAssignments({ reports, navigate, defaultProjectId }) {
  const items = reports.length
    ? reports.slice(0, 5).map((report) => ({
        id: report.id,
        inspectionType: report.inspectionType,
        project: report.projectLabel,
        dueTime: formatDateTime(report.updated_at || report.created_at),
        priority: report.priority,
        status: report.normalizedStatus === REPORT_STATUS.DRAFT ? "Ready To Continue" : "In Workflow",
        report
      }))
    : EMPTY_ASSIGNMENTS;

  return (
    <EnterpriseCard>
      {sectionTitle("Today", "Today's Assignments", "Task cards are optimized for field use and future mobile conversion.")}
      <div className="mt-4 grid grid-cols-1 gap-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${priorityTone(item.priority)}`}>{item.priority}</span>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{item.status}</span>
                </div>
                <h3 className="mt-3 break-words text-base font-bold text-slate-950">{item.inspectionType}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-600">{item.project} - Due {item.dueTime}</p>
              </div>
              <button
                type="button"
                onClick={() => navigate(item.report ? `/project/${item.report.project_id || defaultProjectId}/field-reports/concrete-test-log/${item.report.id}/edit` : "/technician/dashboard?view=create-inspection")}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white"
              >
                {item.report ? "Continue" : "Start Work"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </EnterpriseCard>
  );
}

function PendingCorrections({ revisions, navigate, defaultProjectId }) {
  return (
    <EnterpriseCard>
      {sectionTitle("Corrections", "Pending Corrections", "Quality reviewer comments that require field engineer action.")}
      <div className="mt-4 space-y-3">
        {revisions.length ? revisions.slice(0, 4).map((report) => (
          <article key={report.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-950">{report.dfr_number || report.inspectionType}</p>
            <p className="mt-2 text-sm font-medium text-amber-900">
              {report.reviewer_comments || report.qc_comments || report.rejection_reason || "Quality reviewer requested corrections before approval."}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
                Requested {formatDateTime(report.rejected_at || report.reviewed_at || report.updated_at)}
              </span>
              <button
                type="button"
                onClick={() => navigate(`/project/${report.project_id || defaultProjectId}/field-reports/concrete-test-log/${report.id}/edit`)}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-amber-900 px-4 py-2 text-sm font-bold text-white"
              >
                Correct & Resubmit
              </button>
            </div>
          </article>
        )) : (
          <EmptyState title="No corrections pending" description="Returned reports will appear here with reviewer comments and revision history." />
        )}
      </div>
    </EnterpriseCard>
  );
}

function WeatherAndSync() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <EnterpriseCard>
        {sectionTitle("Weather", "Site Conditions", "Weather context for inspections and material placement.")}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {[
            ["Temperature", "72F"],
            ["Humidity", "58%"],
            ["Wind", "9 mph"],
            ["Rain Chance", "18%"]
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
            </div>
          ))}
        </div>
      </EnterpriseCard>

      <EnterpriseCard>
        {sectionTitle("Sync", "Offline & Upload Status", "Designed for offline field capture and delayed connectivity.")}
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4 text-emerald-900">
            <span className="flex items-center gap-2 text-sm font-bold"><Cloud className="h-5 w-5" /> Online sync active</span>
            <span className="text-sm font-semibold">Now</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 text-slate-700">
            <span className="flex items-center gap-2 text-sm font-bold"><CloudOff className="h-5 w-5" /> Pending uploads</span>
            <span className="text-sm font-semibold">0</span>
          </div>
          <p className="text-sm font-medium text-slate-500">Last sync: {formatDateTime(new Date())}</p>
        </div>
      </EnterpriseCard>
    </div>
  );
}

function ActivityTimeline({ compact = false }) {
  return (
    <EnterpriseCard>
      {sectionTitle("Timeline", compact ? "Recent Activity" : "Activity Stream", "System events for approvals, assignments, revisions, submissions, and uploads.")}
      <div className="mt-5 space-y-4">
        {ACTIVITY_EXAMPLES.map((item) => (
          <div key={`${item.label}-${item.time}`} className="flex gap-3">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-blue-600" />
            <div className="min-w-0 border-b border-slate-100 pb-4 last:border-b-0">
              <p className="text-sm font-bold text-slate-950">{item.label}</p>
              <p className="mt-1 text-sm font-medium text-slate-600">{item.detail}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{item.time}</p>
            </div>
          </div>
        ))}
      </div>
    </EnterpriseCard>
  );
}

function CommandCenterView({ profile, projectLabel, collections, navigate, defaultProjectId }) {
  const displayName = profile?.full_name?.split(" ")?.[0] || "Field Engineer";
  const kpis = [
    { label: "Tasks Due Today", value: collections.assignedWork.length, icon: CheckCircle2, tone: "bg-blue-50 text-blue-800" },
    { label: "Draft Reports", value: collections.draftReports.length, icon: FileClock, tone: "bg-slate-100 text-slate-800" },
    { label: "Pending Revisions", value: collections.revisionReports.length, icon: RotateCcw, tone: "bg-amber-50 text-amber-800" },
    { label: "Submitted Today", value: collections.submittedToday.length, icon: Send, tone: "bg-emerald-50 text-emerald-800" }
  ];

  return (
    <>
      <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.26em] text-slate-400">{MODULE_NAMES.commandCenter}</p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{getGreeting()}, {displayName}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-300">
          <MapPin className="h-4 w-4" />
          Project: {projectLabel}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => <KpiCard key={item.label} {...item} />)}
      </section>

      <EnterpriseCard>
        {sectionTitle("Quick Actions", "Field execution shortcuts")}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ActionButton label="+ New Inspection" icon={Plus} primary onClick={() => navigate("/technician/dashboard?view=create-inspection")} />
          <ActionButton label="Continue Draft" icon={FileClock} onClick={() => navigate("/technician/dashboard?view=work-in-progress")} />
          <ActionButton label="Upload Photos" icon={Camera} onClick={() => navigate("/technician/dashboard?view=upload-center")} />
          <ActionButton label="View Assigned Work" icon={ClipboardList} onClick={() => navigate("/technician/dashboard?view=assigned-work")} />
        </div>
      </EnterpriseCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <TodayAssignments reports={collections.assignedWork} navigate={navigate} defaultProjectId={defaultProjectId} />
        <PendingCorrections revisions={collections.revisionReports} navigate={navigate} defaultProjectId={defaultProjectId} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ActivityTimeline compact />
        <WeatherAndSync />
      </div>
    </>
  );
}

function FieldOperationsOverview({ navigate, defaultProjectId, collections }) {
  const modules = [
    { label: "Assigned Work", value: collections.assignedWork.length, description: "Assigned inspections, pending reports, due tasks, and priorities.", path: "assigned-work" },
    { label: "Create Inspection Record", value: INSPECTION_TEMPLATES.length, description: "Launch role-based templates with dynamic forms.", path: "create-inspection" },
    { label: "Active Tasks", value: collections.activeTasks.length, description: "Pending signatures, attachments, validations, and submissions.", path: "active-tasks" },
    { label: "Work In Progress", value: collections.draftReports.length, description: "Auto-saved drafts, offline sync, and duplicate-ready records.", path: "work-in-progress" },
    { label: "Revisions", value: collections.revisionReports.length, description: "Returned records with reviewer comments and highlighted issues.", path: "revisions" },
    { label: "Upload Center", value: "5", description: "Camera, PDF, markup, attachments, and voice notes.", path: "upload-center" }
  ];

  return (
    <>
      <EnterpriseCard>
        {sectionTitle(MODULE_NAMES.fieldOps, "Technician execution workspace", "Start work, continue records, resolve validation issues, and upload evidence without leaving the field workflow.")}
      </EnterpriseCard>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => navigate(`/technician/dashboard?view=${item.path}`)}
            className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-950">{item.label}</h3>
              <span className="rounded-2xl bg-blue-50 px-3 py-1 text-sm font-bold text-blue-800">{item.value}</span>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-600">{item.description}</p>
          </button>
        ))}
      </section>
      <button
        type="button"
        onClick={() => navigate("/technician/dashboard?view=create-inspection")}
        className="fixed bottom-5 right-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-white shadow-xl shadow-blue-900/20 lg:hidden"
        aria-label="Create Inspection Record"
      >
        <Plus className="h-6 w-6" />
      </button>
    </>
  );
}

function CreateInspectionView({ navigate, defaultProjectId }) {
  function openTemplate(template) {
    if (!template.enabled) return;
    if (template.routeType === "concrete") {
      navigate(`/project/${defaultProjectId}/field-reports/concrete-test-log/create`);
    }
  }

  return (
    <>
      <EnterpriseCard>
        {sectionTitle("Create", "Create Inspection Record", "Only workflows that are implemented today are clickable. Upcoming templates are visible but disabled.")}
      </EnterpriseCard>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {INSPECTION_TEMPLATES.map(({ label, description, icon: Icon, ...template }) => {
          const enabled = Boolean(template.enabled);
          return (
          <button
            key={label}
            type="button"
            disabled={!enabled}
            onClick={() => openTemplate(template)}
            className={`rounded-2xl border p-5 text-left shadow-sm ${
              enabled
                ? "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"
                : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
            }`}
            aria-disabled={!enabled}
          >
            <div className="flex items-start justify-between gap-3">
              <span className={`inline-flex rounded-2xl p-3 ${enabled ? "bg-slate-950 text-white" : "bg-slate-200 text-slate-500"}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${enabled ? "bg-emerald-50 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                {enabled ? "Available" : "Coming soon"}
              </span>
            </div>
            <h3 className={`mt-4 text-lg font-bold ${enabled ? "text-slate-950" : "text-slate-500"}`}>{label}</h3>
            <p className="mt-2 text-sm font-medium text-slate-600">{description}</p>
          </button>
        );
        })}
      </section>
    </>
  );
}

function WorkListView({ title, kicker, description, reports, role, getActions, onAction, onDiscardDraft, discardingId, empty, defaultProjectId, navigate }) {
  return (
    <>
      <EnterpriseCard>{sectionTitle(kicker, title, description)}</EnterpriseCard>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {reports.map((report) => (
          <WorkCard
            key={report.id}
            report={report}
            role={role}
            actions={getActions(report)}
            onAction={onAction}
            onDiscardDraft={onDiscardDraft}
            discardingId={discardingId}
          />
        ))}
      </section>
      {!reports.length && (
        <EmptyState
          title={empty.title}
          description={empty.description}
          actionLabel={empty.actionLabel}
          onAction={() => navigate("/technician/dashboard?view=create-inspection")}
        />
      )}
    </>
  );
}

function ActiveTasksView({ tasks, navigate, defaultProjectId }) {
  return (
    <>
      <EnterpriseCard>{sectionTitle("Tasks", "Active Tasks", "Pending signatures, missing attachments, failed validations, overdue inspections, and pending submissions.")}</EnterpriseCard>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {tasks.map(({ type, report, severity }, index) => (
          <article key={`${type}-${report.id}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${priorityTone(severity)}`}>{severity}</span>
              <StatusBadge status={report.status} />
            </div>
            <h3 className="mt-3 text-lg font-bold text-slate-950">{type}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-600">{report.inspectionType} - {report.projectLabel}</p>
            <button
              type="button"
              onClick={() => navigate(`/project/${report.project_id || defaultProjectId}/field-reports/concrete-test-log/${report.id}/edit`)}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white"
            >
              Resolve Task
            </button>
          </article>
        ))}
      </section>
      {!tasks.length && <EmptyState title="No active task exceptions" description="Missing signatures, validation issues, overdue inspections, and pending uploads will appear here." />}
    </>
  );
}

function UploadCenterView() {
  return (
    <>
      <EnterpriseCard>{sectionTitle("Evidence", "Upload Center", "Centralized capture for camera uploads, PDFs, markup, attachments, and voice notes.")}</EnterpriseCard>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {UPLOAD_OPTIONS.map(({ label, description, icon: Icon }) => (
          <button key={label} type="button" className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:bg-slate-50">
            <Icon className="h-6 w-6 text-blue-700" />
            <h3 className="mt-4 text-lg font-bold text-slate-950">{label}</h3>
            <p className="mt-2 text-sm font-medium text-slate-600">{description}</p>
          </button>
        ))}
      </section>
    </>
  );
}

function SiteRecordsView({ approvedReports }) {
  return (
    <>
      <EnterpriseCard>{sectionTitle("Read Only", "Site Records", "Approved reports, mix designs, material specs, submittals, and previous inspections for field reference.")}</EnterpriseCard>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {SITE_RECORD_TYPES.map((label) => (
          <EnterpriseCard key={label}>
            <FileText className="h-6 w-6 text-blue-700" />
            <h3 className="mt-4 text-lg font-bold text-slate-950">{label}</h3>
            <p className="mt-2 text-sm font-medium text-slate-600">{label === "Approved Reports" ? `${approvedReports.length} records available` : "Reference library ready for project-level documents."}</p>
          </EnterpriseCard>
        ))}
      </section>
    </>
  );
}

export default function FieldEngineerWorkspace({
  view,
  profile,
  role,
  collections,
  defaultProjectId,
  projectLabel,
  loading,
  error,
  discardingId,
  navigate,
  getActions,
  onAction,
  onDiscardDraft
}) {
  const assignedReports = collections.assignedWork;
  const currentView = view || "command-center";

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-4 sm:space-y-5">
        {loading && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">Loading field engineer workspace...</div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{error}</div>
        )}

        {currentView === "command-center" && (
          <CommandCenterView profile={profile} projectLabel={projectLabel} collections={collections} navigate={navigate} defaultProjectId={defaultProjectId} />
        )}

        {currentView === "field-operations" && (
          <FieldOperationsOverview navigate={navigate} defaultProjectId={defaultProjectId} collections={collections} />
        )}

        {currentView === "assigned-work" && (
          <WorkListView
            title="Assigned Work"
            kicker={MODULE_NAMES.fieldOps}
            description="Assigned inspections, pending reports, due tasks, and priority indicators."
            reports={assignedReports}
            role={role}
            getActions={getActions}
            onAction={onAction}
            onDiscardDraft={onDiscardDraft}
            discardingId={discardingId}
            defaultProjectId={defaultProjectId}
            navigate={navigate}
            empty={{ title: "No assigned work yet", description: "New assignments and pending inspections will appear here.", actionLabel: "Create Inspection Record" }}
          />
        )}

        {currentView === "create-inspection" && <CreateInspectionView navigate={navigate} defaultProjectId={defaultProjectId} />}

        {currentView === "active-tasks" && <ActiveTasksView tasks={collections.activeTasks} navigate={navigate} defaultProjectId={defaultProjectId} />}

        {currentView === "work-in-progress" && (
          <WorkListView
            title="Work In Progress"
            kicker="Auto-saved Drafts"
            description="Continue editing, sync offline work, or duplicate a previous record."
            reports={collections.draftReports}
            role={role}
            getActions={getActions}
            onAction={onAction}
            onDiscardDraft={onDiscardDraft}
            discardingId={discardingId}
            defaultProjectId={defaultProjectId}
            navigate={navigate}
            empty={{ title: "No work in progress", description: "Auto-saved inspections and offline records will appear here.", actionLabel: "Create Inspection Record" }}
          />
        )}

        {currentView === "revisions" && (
          <WorkListView
            title="Revisions"
            kicker="Quality Reviewer Returns"
            description="Review comments, resolve highlighted issues, and resubmit corrected records."
            reports={collections.revisionReports}
            role={role}
            getActions={getActions}
            onAction={onAction}
            defaultProjectId={defaultProjectId}
            navigate={navigate}
            empty={{ title: "No revisions pending", description: "Returned reports with reviewer comments will appear here." }}
          />
        )}

        {currentView === "upload-center" && <UploadCenterView />}

        {currentView === "site-records" && <SiteRecordsView approvedReports={collections.approvedReports} />}

        {currentView === "activity-stream" && <ActivityTimeline />}
      </div>
    </div>
  );
}
