import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Building2, CreditCard, FileText, FolderKanban, Lock, Plus, ShieldCheck, Upload, Users, Wrench, X,
  Mail, Check, Loader2, UserPlus, AtSign, Settings2, Trash2, FolderPlus
} from "lucide-react";
import { supabase } from "../services/supabase";
import {
  getMyCompanyContext,
  inviteMember,
  resendInvite,
  insertCompanyRow,
  listCompanyRows,
  setMemberStatus,
  updateMemberDetails,
  removeMember,
  listProjectAssignments,
  assignUserToProject,
  updateAssignmentPermissions,
  removeProjectAssignment,
  updateProject,
  deleteProject,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  updateCompanyProfile,
  updateCompanyRow,
  listSupportRequests,
  approveSupportRequest,
  denySupportRequest,
  endSupportSession,
  listCompanyReports,
  supportScopeLabel
} from "../services/tenantService";
import { companyStoragePath, preloadCompanyBranding } from "../services/brandingService";
import KeyValueList from "../components/mobile/KeyValueList";

const COMPANY_ROLES = [
  "company_admin", "project_manager", "deputy_project_manager",
  "technician", "inspector", "lab_technician", "viewer"
];
// Friendly labels + one-line "what they can do" copy for the invite flow, so the
// admin picks a role by meaning instead of a raw enum value.
const ROLE_CATALOG = {
  company_admin: { label: "Company Admin", blurb: "Full control — billing, team, projects, and every report." },
  project_manager: { label: "Project Manager", blurb: "Runs projects, assigns teams, and approves reports." },
  deputy_project_manager: { label: "Deputy Project Manager", blurb: "Supports PMs and manages assigned projects." },
  technician: { label: "Technician", blurb: "Creates field daily logs and concrete test reports." },
  inspector: { label: "Inspector", blurb: "Inspects sites and documents field conditions." },
  lab_technician: { label: "Lab Technician", blurb: "Creates and manages laboratory reports." },
  viewer: { label: "Viewer", blurb: "Read-only access to assigned projects and reports." }
};
const roleLabel = (r) => ROLE_CATALOG[r]?.label || r.replace(/_/g, " ");
// What each assigned person can do on a project. The admin picks one per person.
const ACCESS_LEVELS = [
  { value: "full", label: "Full access", hint: "Manage project & team, create, approve, view all" },
  { value: "review_approve", label: "Review & Approve", hint: "View all reports + approve / return" },
  { value: "create_edit", label: "Create & Edit", hint: "Create / edit own logs & reports, submit" },
  { value: "view_only", label: "View only", hint: "Read-only access to this project" }
];
const CLIENT_TYPES = ["owner", "general_contractor", "agency", "utility", "developer", "other"];

// The modules a role/assignment can grant access to, and the access ladder per
// module. Used by the Roles editor and (next) per-project assignment overrides.
const MODULES = [
  { key: "daily_logs", label: "Daily Logs", icon: FileText },
  { key: "timesheets", label: "Timesheets", icon: FileText },
  { key: "field_test_reports", label: "Field Test Reports", icon: FileText },
  { key: "lab_reports", label: "Lab Reports", icon: FileText }
];
const MODULE_LEVELS = [
  { value: "none", label: "None" },
  { value: "view", label: "View" },
  { value: "create_edit", label: "Create & Edit" },
  { value: "approve", label: "Approve" },
  { value: "manage", label: "Manage" }
];
const moduleLevelLabel = (v) => MODULE_LEVELS.find((l) => l.value === v)?.label || "None";
const LEVEL_ORDER = ["none", "view", "create_edit", "approve", "manage"];
// A member only truly counts as active once they've claimed their invite (have a
// linked account). Until then they're "invited" regardless of the status column.
const displayStatus = (member) => (member.user_id ? member.status : "invited");

// A permissions object covering every module (missing modules default to none).
function fullPerms(partial = {}) {
  return MODULES.reduce((acc, m) => ({ ...acc, [m.key]: partial[m.key] || "none" }), {});
}
// Map a legacy single access level to a uniform per-module permissions object.
function permsFromAccessLevel(level) {
  const lvl = { full: "manage", review_approve: "approve", create_edit: "create_edit", view_only: "view" }[level] || "view";
  return MODULES.reduce((acc, m) => ({ ...acc, [m.key]: lvl }), {});
}
// Short "Daily Logs: Create & Edit · …" summary, omitting None modules.
function summarizePerms(perms = {}) {
  const parts = MODULES.filter((m) => (perms[m.key] || "none") !== "none")
    .map((m) => `${m.label}: ${moduleLevelLabel(perms[m.key])}`);
  return parts.length ? parts.join(" · ") : "No module access";
}
// Legacy single access_level mirror, derived from the highest module level, so
// older code/paths that still read access_level keep working.
function headlineAccessLevel(perms = {}) {
  const max = Object.values(perms).reduce((a, b) => (LEVEL_ORDER.indexOf(b) > LEVEL_ORDER.indexOf(a) ? b : a), "none");
  return { manage: "full", approve: "review_approve", create_edit: "create_edit", view: "view_only", none: "view_only" }[max];
}

// Compact per-module level grid, used wherever an assignment's access is edited.
function ModulePermsGrid({ permissions, onChange, disabled }) {
  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {MODULES.map((m) => (
        <div key={m.key} className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-sm font-semibold text-slate-700">{m.label}</span>
          <select
            disabled={disabled}
            value={permissions[m.key] || "none"}
            onChange={(e) => onChange({ ...permissions, [m.key]: e.target.value })}
            className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold disabled:opacity-50"
          >
            {MODULE_LEVELS.map((lvl) => <option key={lvl.value} value={lvl.value}>{lvl.label}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

// Role-template dropdown that, on pick, returns the template's permissions.
function RoleTemplatePicker({ roles, value, onPick, label = "Start from preset" }) {
  return (
    <label className="block"><span className="text-xs font-semibold text-slate-600">{label}</span>
      <select
        value={value || ""}
        onChange={(e) => {
          const role = roles.find((r) => r.id === e.target.value);
          onPick(e.target.value, role ? fullPerms(role.permissions) : null);
        }}
        className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold"
      >
        <option value="">Custom…</option>
        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </label>
  );
}

// Section panel with a header band (icon + uppercase label + count badge) to
// match the Platform Admin console.
function SectionCard({ icon: Icon, title, count, action, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          <Icon className="h-4 w-4 shrink-0 text-slate-400" /> <span className="truncate">{title}</span>
          {count != null && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-slate-600">{count}</span>
          )}
        </h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function SmallButton({ children, ...props }) {
  return (
    <button type="button" {...props} className={`inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 ${props.className || ""}`}>
      {children}
    </button>
  );
}

// KPI summary card with a tinted icon chip (shared visual with the platform console).
function StatCard({ icon: Icon, label, value, tone }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600"
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3.5 px-5 py-4">
        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.slate}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="text-2xl font-bold leading-tight text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

// Initial-letter avatar, sized via the className passed in.
function InitialAvatar({ name, color = "#1d4ed8", className = "" }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-sm ${className}`} style={{ background: color }}>
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

const ROW_STATUS_TONES = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  invited: "border-amber-200 bg-amber-50 text-amber-700",
  disabled: "border-slate-200 bg-slate-100 text-slate-500",
  inactive: "border-slate-200 bg-slate-100 text-slate-500"
};

function RowStatus({ status }) {
  const dot = {
    active: "bg-emerald-500", invited: "bg-amber-500", disabled: "bg-slate-400", inactive: "bg-slate-400"
  }[status] || "bg-slate-400";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${ROW_STATUS_TONES[status] || ROW_STATUS_TONES.inactive}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

export default function CompanyAdminDashboard() {
  const location = useLocation();
  const section = new URLSearchParams(location.search).get("section") || "overview";
  const [context, setContext] = useState({ company: null, subscription: null, settings: null, roster: [] });
  const [projects, setProjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [manageMember, setManageMember] = useState(null);
  const [manageProject, setManageProject] = useState(null);
  const [editRole, setEditRole] = useState(null);
  const [clients, setClients] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [labReports, setLabReports] = useState([]);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState(null);
  const [inviteUi, setInviteUi] = useState({ busy: false, error: "", sentEmail: "" });
  const [resendingId, setResendingId] = useState("");
  const [newClient, setNewClient] = useState(null);
  const [newEquipment, setNewEquipment] = useState(null);
  const [newProject, setNewProject] = useState(null);
  const [profileDraft, setProfileDraft] = useState(null);
  const [supportRequests, setSupportRequests] = useState([]);
  const [approveFor, setApproveFor] = useState(null); // session being approved

  async function refresh() {
    try {
      const ctx = await getMyCompanyContext();
      setContext(ctx);
      const [projectRows, clientRows, equipmentRows, labRows, supportRows, assignmentRows, roleRows] = await Promise.all([
        supabase.from("projects").select("*").order("project_name").then((r) => r.data || []),
        listCompanyRows("clients"),
        listCompanyRows("equipment"),
        listCompanyRows("lab_reports"),
        listSupportRequests(),
        listProjectAssignments(),
        listRoles()
      ]);
      setProjects(projectRows);
      setAssignments(assignmentRows);
      setRoles(roleRows);
      setClients(clientRows);
      setEquipment(equipmentRows);
      setLabReports(labRows);
      setSupportRequests(supportRows);
    } catch (err) {
      setError(err.message || "Company data could not be loaded.");
    }
  }

  async function denyRequest(session) {
    try { await denySupportRequest(session.id); await refresh(); }
    catch (err) { window.alert(err.message); }
  }

  async function endGrant(session) {
    if (!window.confirm("End this support session now? The platform admin will lose access immediately.")) return;
    try { await endSupportSession(session); await refresh(); }
    catch (err) { window.alert(err.message); }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    refresh();
  }, []);

  const company = context.company;
  // Only people with a linked account (claimed invite) can be assigned to a
  // project — project_assignments.user_id and projects.project_manager_id both
  // point at real users, not pending invite rows.
  const assignableMembers = context.roster.filter((m) => m.user_id && m.status !== "disabled");
  const pmCandidates = assignableMembers.filter((m) => ["company_admin", "project_manager"].includes(m.role));
  const dpmCandidates = assignableMembers.filter((m) => ["company_admin", "project_manager", "deputy_project_manager"].includes(m.role));
  const techCandidates = assignableMembers.filter((m) => ["technician", "inspector", "lab_technician"].includes(m.role));
  const memberLabel = (m) => `${m.full_name || m.invited_email}${m.role ? ` · ${m.role.replace(/_/g, " ")}` : ""}`;

  async function saveProfile(event) {
    event.preventDefault();
    await updateCompanyProfile(company.id, profileDraft, {
      company_name: company.company_name,
      brand_color: company.brand_color
    });
    setProfileDraft(null);
    await preloadCompanyBranding();
    await refresh();
  }

  async function uploadLogo(file) {
    if (!file || !company) return;
    const path = companyStoragePath(company.id, "logos", `logo-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`);
    const { error: uploadError } = await supabase.storage.from("company-files").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setError(`Logo upload failed: ${uploadError.message}`);
      return;
    }
    await updateCompanyProfile(company.id, { logo_storage_path: path }, { logo_storage_path: company.logo_storage_path });
    await preloadCompanyBranding();
    await refresh();
  }

  function openInvite() {
    setInviteUi({ busy: false, error: "", sentEmail: "" });
    setInvite({ email: "", fullName: "", role: "technician" });
  }

  function openRoleEditor(role) {
    setEditRole(role || {
      name: "",
      description: "",
      permissions: MODULES.reduce((acc, m) => ({ ...acc, [m.key]: "none" }), {})
    });
  }

  async function saveRole(draft) {
    if (draft.id) await updateRole(company.id, draft.id, draft);
    else await createRole(company.id, draft);
    setEditRole(null);
    await refresh();
  }

  async function removeRoleFn(role) {
    if (!window.confirm(`Delete the "${role.name}" role template?`)) return;
    try { await deleteRole(company.id, role.id); await refresh(); }
    catch (err) { window.alert(err.message); }
  }

  async function handleResend(member) {
    setResendingId(member.id);
    try {
      const delivery = await resendInvite(company.id, member);
      window.alert(delivery.ok
        ? `A fresh invitation was sent to ${member.invited_email}.`
        : `Could not resend: ${delivery.error || "delivery failed"}`);
    } catch (err) {
      window.alert(err.message || "Could not resend the invitation.");
    } finally {
      setResendingId("");
    }
  }

  async function submitInvite(event) {
    event.preventDefault();
    const email = invite.email.trim().toLowerCase();
    // Guard against re-inviting someone already on the roster.
    if (context.roster.some((m) => (m.invited_email || "").toLowerCase() === email)) {
      setInviteUi({ busy: false, error: "That email is already on your team.", sentEmail: "" });
      return;
    }
    setInviteUi({ busy: true, error: "", sentEmail: "" });
    try {
      const result = await inviteMember(company.id, { ...invite, email });
      await refresh();
      if (result.emailSent === false) {
        // The roster row was created, but the email itself failed to send.
        setInviteUi({ busy: false, error: `Added to the team, but the email didn't send: ${result.emailError || "delivery failed"}. They can still sign in once their account is set up.`, sentEmail: "" });
        return;
      }
      // Keep the modal open on a success screen so the admin can invite another.
      setInviteUi({ busy: false, error: "", sentEmail: email });
    } catch (err) {
      setInviteUi({ busy: false, error: err.message || "The invitation could not be sent.", sentEmail: "" });
    }
  }

  async function submitClient(event) {
    event.preventDefault();
    await insertCompanyRow("clients", company.id, newClient, "client_created");
    setNewClient(null);
    await refresh();
  }

  async function submitEquipment(event) {
    event.preventDefault();
    await insertCompanyRow("equipment", company.id, newEquipment, "equipment_created");
    setNewEquipment(null);
    await refresh();
  }

  async function submitProject(event) {
    event.preventDefault();
    // Pull the team selections out of the form state — they live on separate
    // tables (projects.project_manager_* + project_assignments), not on projects' columns.
    const { _pmUserId, _pmAccess, _dpmUserId, _dpmAccess, _technicianIds, _technicianAccess, ...projectFields } = newProject;
    const pm = assignableMembers.find((m) => m.user_id === _pmUserId);
    const payload = {
      ...projectFields,
      project_manager_id: pm?.user_id || null,
      project_manager_name: pm?.full_name || null,
      project_manager_email: pm?.invited_email || null
    };

    const { data: created, error: insertError } = await supabase
      .from("projects")
      .insert(payload)
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }

    // Build the assignment roster: PM, DPM, and each technician, de-duplicated by
    // user. Each carries the access level the admin chose for them.
    const assignmentMap = new Map();
    if (_pmUserId) assignmentMap.set(_pmUserId, { role: "project_manager", access: _pmAccess || "full" });
    if (_dpmUserId) assignmentMap.set(_dpmUserId, { role: "deputy_project_manager", access: _dpmAccess || "full" });
    (_technicianIds || []).forEach((uid) => {
      if (!assignmentMap.has(uid)) assignmentMap.set(uid, { role: "technician", access: (_technicianAccess && _technicianAccess[uid]) || "create_edit" });
    });
    const assignments = Array.from(assignmentMap, ([user_id, v]) => ({
      project_id: created.id,
      user_id,
      assignment_role: v.role,
      access_level: v.access,
      // Store per-module permissions too (uniform from the chosen access level);
      // the admin can fine-tune them per module later in Manage Project.
      permissions: permsFromAccessLevel(v.access)
    }));
    if (assignments.length) {
      const { error: assignError } = await supabase.from("project_assignments").insert(assignments);
      if (assignError) {
        setError(`Project created, but team assignment failed: ${assignError.message}`);
        await refresh();
        return;
      }
    }

    setNewProject(null);
    await refresh();
  }

  if (!company) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm font-semibold text-slate-600">
        {error || "Loading company..."}
      </div>
    );
  }

  const showAll = section === "overview";

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-50 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-4 sm:space-y-6">

        <section className="flex items-center gap-3.5">
          <InitialAvatar name={company.company_name} color={company.brand_color || "#1d4ed8"} className="h-12 w-12 text-lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{company.company_name}</h1>
            <p className="mt-0.5 truncate text-[13px] font-medium text-slate-500">
              Company Administration
              <span className="mx-1.5 text-slate-300">·</span>
              <span className="capitalize">{context.subscription?.plan || "trial"}</span> plan
              <span className="mx-1.5 text-slate-300">·</span>
              <span className="capitalize">{company.status}</span>
            </p>
          </div>
        </section>

        {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</p>}

        {showAll && (
          <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard icon={Users} label="Employees" value={context.roster.length} tone="blue" />
            <StatCard icon={FolderKanban} label="Projects" value={projects.length} tone="emerald" />
            <StatCard icon={Building2} label="Clients" value={clients.length} tone="amber" />
            <StatCard icon={Wrench} label="Equipment" value={equipment.length} tone="slate" />
          </section>
        )}

        {(() => {
          const pending = supportRequests.filter((s) => s.status === "requested");
          const active = supportRequests.filter((s) => s.status === "approved" && !s.ended_at && (!s.expires_at || new Date(s.expires_at) > new Date()));
          if (!showAll || (!pending.length && !active.length)) return null;
          return (
            <section className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${pending.length ? "border-amber-300" : "border-slate-200"}`}>
              <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">
                <ShieldCheck className="h-4 w-4 text-slate-400" /> Support Access
                {pending.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-amber-800">{pending.length} awaiting approval</span>}
              </h2>
              <div className="divide-y divide-slate-100">
                {pending.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900">QCore Support requests access to your <span className="text-blue-700">{s.requested_scope === "daily_log" ? "Daily Logs" : s.requested_scope}</span></p>
                      <p className="truncate text-xs font-medium text-slate-500">Reason: {s.reason || "—"} · requested {new Date(s.requested_at).toLocaleString()}</p>
                    </div>
                    <button type="button" onClick={() => setApproveFor(s)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700">Review &amp; Approve</button>
                    <button type="button" onClick={() => denyRequest(s)} className="inline-flex min-h-9 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:bg-rose-50">Deny</button>
                  </div>
                ))}
                {active.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900">Active grant — {s.requested_scope === "daily_log" ? "Daily Logs" : s.requested_scope} <span className="text-xs font-semibold text-slate-400">({(s.approved_resources || []).length} report{(s.approved_resources || []).length === 1 ? "" : "s"} shared{s.unmask ? ", names visible" : ", masked"})</span></p>
                      <p className="text-xs font-semibold text-emerald-600">Expires {s.expires_at ? new Date(s.expires_at).toLocaleString() : "—"}</p>
                    </div>
                    <button type="button" onClick={() => endGrant(s)} className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">Revoke now</button>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {(showAll || section === "settings") && (
          <SectionCard
            icon={Building2}
            title="Company Profile & Branding"
            action={<SmallButton onClick={() => setProfileDraft({ company_name: company.company_name, legal_name: company.legal_name || "", phone: company.phone || "", address: company.address || "", brand_color: company.brand_color || "#1d4ed8" })}>Edit</SmallButton>}
          >
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <KeyValueList columns={2} items={[
                  ["Legal Name", company.legal_name],
                  ["Contact", company.primary_contact_name],
                  ["Email", company.primary_contact_email],
                  ["Phone", company.phone],
                  ["Address", company.address],
                  ["Brand Color", company.brand_color]
                ]} />
              </div>
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">
                <Upload className="h-4 w-4" /> Upload Logo
                <input type="file" accept="image/*" className="hidden" onChange={(event) => uploadLogo(event.target.files?.[0])} />
              </label>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-400">Reports and PDFs use this logo and company name.</p>
          </SectionCard>
        )}

        {(showAll || section === "employees") && (
          <SectionCard
            icon={Users}
            title="Employees"
            count={context.roster.length}
            action={<SmallButton onClick={openInvite}><UserPlus className="h-3.5 w-3.5" />Invite</SmallButton>}
          >
            <div className="-my-1 divide-y divide-slate-100">
              {context.roster.map((member) => (
                <div key={member.id} className="flex flex-wrap items-center gap-3 py-3">
                  <InitialAvatar name={member.full_name || member.invited_email} color={company.brand_color || "#1d4ed8"} className="h-9 w-9 text-sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-900">{member.full_name || member.invited_email || "—"}</p>
                      <RowStatus status={displayStatus(member)} />
                    </div>
                    <p className="truncate text-xs font-medium text-slate-400">
                      {roleLabel(member.role)} · {member.invited_email}
                      {member.user_id ? ` · ${assignments.filter((a) => a.user_id === member.user_id).length} project(s)` : ""}
                    </p>
                  </div>
                  {!member.user_id && (
                    <SmallButton onClick={() => handleResend(member)} disabled={resendingId === member.id} className="border-blue-200 text-blue-700 hover:bg-blue-50">
                      {resendingId === member.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending…</> : <><Mail className="h-3.5 w-3.5" />Resend</>}
                    </SmallButton>
                  )}
                  <SmallButton onClick={() => setManageMember(member)} className="border-slate-300 text-slate-700">
                    <Settings2 className="h-3.5 w-3.5" />Manage
                  </SmallButton>
                </div>
              ))}
              {!context.roster.length && <p className="py-3 text-sm font-semibold text-slate-500">No employees yet — invite your first team member.</p>}
            </div>
          </SectionCard>
        )}

        {(showAll || section === "projects") && (
          <SectionCard
            icon={FolderKanban}
            title="Projects"
            count={projects.length}
            action={<SmallButton onClick={() => setNewProject({ project_name: "", project_number: "", client_name: "", project_location: "", status: "Active", _pmUserId: "", _pmAccess: "full", _dpmUserId: "", _dpmAccess: "full", _technicianIds: [], _technicianAccess: {} })}><Plus className="h-3.5 w-3.5" />Add</SmallButton>}
          >
            <div className="-my-1 divide-y divide-slate-100">
              {projects.map((project) => (
                <div key={project.id} className="flex items-center justify-between gap-3 py-3">
                  <button type="button" onClick={() => setManageProject(project)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-bold text-slate-900 hover:text-blue-700">{project.project_name}</p>
                    <p className="truncate text-xs font-medium text-slate-400">
                      #{project.project_number} · {project.client_name} · {project.project_location} · {assignments.filter((a) => a.project_id === project.id).length} on team
                    </p>
                    {project.project_manager_name && <p className="truncate text-xs font-semibold text-blue-700">PM: {project.project_manager_name}</p>}
                  </button>
                  <RowStatus status={String(project.status || "active").toLowerCase()} />
                  <SmallButton onClick={() => setManageProject(project)} className="border-slate-300 text-slate-700"><Settings2 className="h-3.5 w-3.5" />Manage</SmallButton>
                </div>
              ))}
              {!projects.length && <p className="py-3 text-sm font-semibold text-slate-500">No projects yet.</p>}
            </div>
          </SectionCard>
        )}

        {(showAll || section === "roles") && (
          <SectionCard
            icon={ShieldCheck}
            title="Roles & Permissions"
            count={roles.length}
            action={<SmallButton onClick={() => openRoleEditor(null)}><Plus className="h-3.5 w-3.5" />New role</SmallButton>}
          >
            <p className="mb-2 text-xs font-medium text-slate-400">Reusable templates that set what each module a person can access. Apply them when assigning people to a project (and override per project there).</p>
            <div className="-my-1 divide-y divide-slate-100">
              {roles.map((role) => (
                <div key={role.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-900">{role.name}</p>
                      {role.is_system && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Default</span>}
                    </div>
                    <p className="truncate text-xs font-medium text-slate-400">
                      {MODULES.map((m) => `${m.label}: ${moduleLevelLabel(role.permissions?.[m.key] || "none")}`).join(" · ")}
                    </p>
                  </div>
                  <SmallButton onClick={() => openRoleEditor(role)} className="border-slate-300 text-slate-700"><Settings2 className="h-3.5 w-3.5" />Edit</SmallButton>
                  {!role.is_system && (
                    <button type="button" onClick={() => removeRoleFn(role)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete role"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
              {!roles.length && <p className="py-3 text-sm font-semibold text-slate-500">No role templates yet.</p>}
            </div>
          </SectionCard>
        )}

        {(showAll || section === "clients") && (
          <SectionCard
            icon={Building2}
            title="Clients & Contractors"
            count={clients.length}
            action={<SmallButton onClick={() => setNewClient({ client_name: "", client_type: "owner", contact_name: "", contact_email: "" })}><Plus className="h-3.5 w-3.5" />Add</SmallButton>}
          >
            <div className="-my-1 divide-y divide-slate-100">
              {clients.map((client) => (
                <div key={client.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold capitalize text-slate-900">{client.client_name}</p>
                    <p className="truncate text-xs font-medium text-slate-400">{client.client_type.replace(/_/g, " ")} · {client.contact_name || "—"} {client.contact_email ? `· ${client.contact_email}` : ""}</p>
                  </div>
                  <SmallButton onClick={() => updateCompanyRow("clients", company.id, client.id, { status: client.status === "active" ? "inactive" : "active" }, "client_updated").then(refresh)}>
                    {client.status === "active" ? "Deactivate" : "Activate"}
                  </SmallButton>
                </div>
              ))}
              {!clients.length && <p className="py-3 text-sm font-semibold text-slate-500">No clients yet — owners, GCs, agencies, utilities, and developers live here.</p>}
            </div>
          </SectionCard>
        )}

        {(showAll || section === "equipment") && (
          <SectionCard
            icon={Wrench}
            title="Equipment & Calibration"
            count={equipment.length}
            action={<SmallButton onClick={() => setNewEquipment({ equipment_name: "", equipment_type: "", serial_number: "", model: "" })}><Plus className="h-3.5 w-3.5" />Add</SmallButton>}
          >
            <div className="-my-1 divide-y divide-slate-100">
              {equipment.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{item.equipment_name}</p>
                    <p className="truncate text-xs font-medium text-slate-400">{item.equipment_type || "—"} · SN {item.serial_number || "—"} · {item.model || ""}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">{item.status.replace(/_/g, " ")}</span>
                </div>
              ))}
              {!equipment.length && <p className="py-3 text-sm font-semibold text-slate-500">No equipment recorded yet.</p>}
            </div>
          </SectionCard>
        )}

        {(showAll || section === "lab-reports") && (
          <SectionCard icon={FileText} title="Lab Reports" count={labReports.length}>
            <div className="-my-1 divide-y divide-slate-100">
              {labReports.map((report) => (
                <div key={report.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{report.report_number || report.sample_id || report.id.slice(0, 8)}</p>
                    <p className="truncate text-xs font-medium text-slate-400">{report.test_type || "—"} · {report.status}</p>
                  </div>
                </div>
              ))}
              {!labReports.length && <p className="py-3 text-sm font-semibold text-slate-500">Lab reports created by lab technicians appear here.</p>}
            </div>
          </SectionCard>
        )}

        {(showAll || section === "billing") && (
          <SectionCard icon={CreditCard} title="Billing">
            <KeyValueList columns={2} items={[
              ["Plan", context.subscription?.plan],
              ["Billing Status", context.subscription?.billing_status],
              ["Seats", context.subscription?.seats],
              ["Period End", context.subscription?.current_period_end]
            ]} />
            <p className="mt-2 text-xs font-semibold text-slate-400">Plan changes are managed by the QCore platform team.</p>
          </SectionCard>
        )}

        {/* ── Modals ── */}
        {profileDraft && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
            <form onSubmit={saveProfile} className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6">
              <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Edit Company Profile</h3>
                <button type="button" onClick={() => setProfileDraft(null)} className="rounded-full border border-slate-200 p-2"><X className="h-4 w-4" /></button></div>
              <div className="mt-3 space-y-3">
                {[["company_name", "Company Name"], ["legal_name", "Legal Name"], ["phone", "Phone"], ["address", "Address"]].map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
                    <input value={profileDraft[key]} onChange={(event) => setProfileDraft({ ...profileDraft, [key]: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" />
                  </label>
                ))}
                <label className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Branding Color</span>
                  <input type="color" value={profileDraft.brand_color} onChange={(event) => setProfileDraft({ ...profileDraft, brand_color: event.target.value })} className="h-9 w-14 rounded border border-slate-300" />
                </label>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setProfileDraft(null)} className="min-h-11 rounded-xl border border-slate-300 text-sm font-bold text-slate-700">Cancel</button>
                <button type="submit" className="min-h-11 rounded-xl bg-blue-700 text-sm font-bold text-white">Save</button>
              </div>
            </form>
          </div>
        )}

        {invite && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
            <div className="w-full max-w-lg rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><UserPlus className="h-5 w-5" /></div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Invite a team member</h3>
                    <p className="text-xs font-medium text-slate-500">They'll get an email to set a password and join {company.company_name || "your company"}.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setInvite(null)} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button>
              </div>

              {inviteUi.sentEmail ? (
                /* Success screen */
                <div className="p-6 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-6 w-6" /></div>
                  <p className="mt-3 text-base font-bold text-slate-900">Invitation sent</p>
                  <p className="mt-1 text-sm font-medium text-slate-500">We emailed <span className="font-semibold text-slate-700">{inviteUi.sentEmail}</span>. They'll show as <span className="font-semibold text-amber-600">Invited</span> until they accept and sign in.</p>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button type="button" onClick={openInvite} className="min-h-11 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">Invite another</button>
                    <button type="button" onClick={() => setInvite(null)} className="min-h-11 rounded-xl bg-blue-700 text-sm font-bold text-white">Done</button>
                  </div>
                </div>
              ) : (
                /* Form */
                <form onSubmit={submitInvite} className="p-5">
                  <div className="space-y-4">
                    <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Full name</span>
                      <input value={invite.fullName} onChange={(event) => setInvite({ ...invite, fullName: event.target.value })} placeholder="Jane Doe" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>

                    <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Work email *</span>
                      <div className="relative mt-1">
                        <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input type="email" required value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="jane@company.com" className="min-h-11 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                      </div></label>

                    <div className="block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Role</span>
                      <select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                        {COMPANY_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                      </select>
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-slate-500">
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {ROLE_CATALOG[invite.role]?.blurb}
                      </p>
                    </div>

                    <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs font-medium text-slate-500">
                      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <span>An invitation email is sent automatically. The role decides their company-wide permissions; project-level access is set when you assign them to a project.</span>
                    </div>

                    {inviteUi.error && (
                      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{inviteUi.error}</p>
                    )}
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setInvite(null)} className="min-h-11 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
                    <button type="submit" disabled={inviteUi.busy} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60">
                      {inviteUi.busy ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><Mail className="h-4 w-4" />Send invite</>}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {newClient && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
            <form onSubmit={submitClient} className="w-full max-w-lg rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6">
              <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Add Client</h3>
                <button type="button" onClick={() => setNewClient(null)} className="rounded-full border border-slate-200 p-2"><X className="h-4 w-4" /></button></div>
              <div className="mt-3 space-y-3">
                <label className="block"><span className="text-xs font-bold uppercase text-slate-500">Client Name *</span>
                  <input required value={newClient.client_name} onChange={(event) => setNewClient({ ...newClient, client_name: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" /></label>
                <label className="block"><span className="text-xs font-bold uppercase text-slate-500">Type</span>
                  <select value={newClient.client_type} onChange={(event) => setNewClient({ ...newClient, client_type: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold">
                    {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select></label>
                <label className="block"><span className="text-xs font-bold uppercase text-slate-500">Contact Name</span>
                  <input value={newClient.contact_name} onChange={(event) => setNewClient({ ...newClient, contact_name: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" /></label>
                <label className="block"><span className="text-xs font-bold uppercase text-slate-500">Contact Email</span>
                  <input type="email" value={newClient.contact_email} onChange={(event) => setNewClient({ ...newClient, contact_email: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" /></label>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewClient(null)} className="min-h-11 rounded-xl border border-slate-300 text-sm font-bold text-slate-700">Cancel</button>
                <button type="submit" className="min-h-11 rounded-xl bg-blue-700 text-sm font-bold text-white">Add Client</button>
              </div>
            </form>
          </div>
        )}

        {newEquipment && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
            <form onSubmit={submitEquipment} className="w-full max-w-lg rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6">
              <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Add Equipment</h3>
                <button type="button" onClick={() => setNewEquipment(null)} className="rounded-full border border-slate-200 p-2"><X className="h-4 w-4" /></button></div>
              <div className="mt-3 space-y-3">
                {[["equipment_name", "Equipment Name *"], ["equipment_type", "Type"], ["serial_number", "Serial Number"], ["model", "Model"]].map(([key, label]) => (
                  <label key={key} className="block"><span className="text-xs font-bold uppercase text-slate-500">{label}</span>
                    <input required={key === "equipment_name"} value={newEquipment[key]} onChange={(event) => setNewEquipment({ ...newEquipment, [key]: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" /></label>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewEquipment(null)} className="min-h-11 rounded-xl border border-slate-300 text-sm font-bold text-slate-700">Cancel</button>
                <button type="submit" className="min-h-11 rounded-xl bg-blue-700 text-sm font-bold text-white">Add Equipment</button>
              </div>
            </form>
          </div>
        )}

        {newProject && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
            <form onSubmit={submitProject} className="w-full max-w-lg rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6">
              <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Add Project</h3>
                <button type="button" onClick={() => setNewProject(null)} className="rounded-full border border-slate-200 p-2"><X className="h-4 w-4" /></button></div>
              <div className="mt-3 space-y-3">
                {[["project_name", "Project Name *"], ["project_number", "Project Number *"], ["client_name", "Client *"], ["project_location", "Location"]].map(([key, label]) => (
                  <label key={key} className="block"><span className="text-xs font-bold uppercase text-slate-500">{label}</span>
                    <input required={label.includes("*")} value={newProject[key]} onChange={(event) => setNewProject({ ...newProject, [key]: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" /></label>
                ))}

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Project Team</p>
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                    <label className="block"><span className="text-xs font-semibold text-slate-600">Project Manager</span>
                      <select value={newProject._pmUserId} onChange={(event) => setNewProject({ ...newProject, _pmUserId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold">
                        <option value="">— Unassigned —</option>
                        {pmCandidates.map((m) => <option key={m.user_id} value={m.user_id}>{memberLabel(m)}</option>)}
                      </select></label>
                    <label className="block"><span className="text-xs font-semibold text-slate-600">Access</span>
                      <select disabled={!newProject._pmUserId} value={newProject._pmAccess} onChange={(event) => setNewProject({ ...newProject, _pmAccess: event.target.value })} className="mt-1 min-h-11 rounded-xl border border-slate-300 bg-white px-2 text-sm font-semibold disabled:opacity-40">
                        {ACCESS_LEVELS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                      </select></label>
                  </div>
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                    <label className="block"><span className="text-xs font-semibold text-slate-600">Deputy Project Manager</span>
                      <select value={newProject._dpmUserId} onChange={(event) => setNewProject({ ...newProject, _dpmUserId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold">
                        <option value="">— Unassigned —</option>
                        {dpmCandidates.map((m) => <option key={m.user_id} value={m.user_id}>{memberLabel(m)}</option>)}
                      </select></label>
                    <label className="block"><span className="text-xs font-semibold text-slate-600">Access</span>
                      <select disabled={!newProject._dpmUserId} value={newProject._dpmAccess} onChange={(event) => setNewProject({ ...newProject, _dpmAccess: event.target.value })} className="mt-1 min-h-11 rounded-xl border border-slate-300 bg-white px-2 text-sm font-semibold disabled:opacity-40">
                        {ACCESS_LEVELS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                      </select></label>
                  </div>
                  <div className="mt-2">
                    <span className="text-xs font-semibold text-slate-600">Technicians & Inspectors</span>
                    <div className="mt-1 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                      {techCandidates.length ? techCandidates.map((m) => {
                        const checked = newProject._technicianIds.includes(m.user_id);
                        return (
                          <div key={m.user_id} className="flex items-center gap-2 rounded-lg px-1 py-1">
                            <label className="flex flex-1 items-center gap-2 text-sm font-semibold text-slate-700">
                              <input type="checkbox" checked={checked} onChange={(event) => setNewProject({
                                ...newProject,
                                _technicianIds: event.target.checked
                                  ? [...newProject._technicianIds, m.user_id]
                                  : newProject._technicianIds.filter((id) => id !== m.user_id),
                                _technicianAccess: event.target.checked
                                  ? { ...newProject._technicianAccess, [m.user_id]: newProject._technicianAccess[m.user_id] || "create_edit" }
                                  : Object.fromEntries(Object.entries(newProject._technicianAccess).filter(([id]) => id !== m.user_id))
                              })} className="h-4 w-4 rounded border-slate-300" />
                              {memberLabel(m)}
                            </label>
                            {checked && (
                              <select value={newProject._technicianAccess[m.user_id] || "create_edit"} onChange={(event) => setNewProject({
                                ...newProject,
                                _technicianAccess: { ...newProject._technicianAccess, [m.user_id]: event.target.value }
                              })} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold">
                                {ACCESS_LEVELS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                              </select>
                            )}
                          </div>
                        );
                      }) : <p className="px-1 py-1 text-xs font-medium text-slate-400">No technicians on the roster yet — invite them first.</p>}
                    </div>
                  </div>
                  {!assignableMembers.length && <p className="mt-2 text-xs font-medium text-amber-600">Team members appear here once they've accepted their invite and signed in.</p>}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewProject(null)} className="min-h-11 rounded-xl border border-slate-300 text-sm font-bold text-slate-700">Cancel</button>
                <button type="submit" className="min-h-11 rounded-xl bg-blue-700 text-sm font-bold text-white">Add Project</button>
              </div>
            </form>
          </div>
        )}

        {approveFor && (
          <SupportApproveModal
            session={approveFor}
            onClose={() => setApproveFor(null)}
            onApproved={async () => { setApproveFor(null); await refresh(); }}
          />
        )}

        {manageMember && (
          <ManageMemberModal
            member={context.roster.find((m) => m.id === manageMember.id) || manageMember}
            company={company}
            projects={projects}
            roles={roles}
            assignments={assignments.filter((a) => a.user_id === manageMember.user_id)}
            onClose={() => setManageMember(null)}
            onChanged={refresh}
            onRemoved={() => { setManageMember(null); refresh(); }}
          />
        )}

        {editRole && (
          <RoleEditorModal
            role={editRole}
            onClose={() => setEditRole(null)}
            onSave={saveRole}
          />
        )}

        {manageProject && (
          <ManageProjectModal
            project={projects.find((p) => p.id === manageProject.id) || manageProject}
            company={company}
            roster={context.roster}
            roles={roles}
            assignments={assignments.filter((a) => a.project_id === manageProject.id)}
            onClose={() => setManageProject(null)}
            onChanged={refresh}
            onRemoved={() => { setManageProject(null); refresh(); }}
          />
        )}

      </div>
    </div>
  );
}

// Create / edit a reusable role template: a name + a per-module access level.
function RoleEditorModal({ role, onClose, onSave }) {
  const [name, setName] = useState(role.name || "");
  const [description, setDescription] = useState(role.description || "");
  const [permissions, setPermissions] = useState(() =>
    MODULES.reduce((acc, m) => ({ ...acc, [m.key]: role.permissions?.[m.key] || "none" }), {}));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) { setError("Give the role a name."); return; }
    setBusy(true); setError("");
    try { await onSave({ ...role, name: name.trim(), description, permissions }); }
    catch (err) { setError(err.message || "Could not save the role."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
      <form onSubmit={submit} className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{role.id ? "Edit role" : "New role"}</h3>
              <p className="text-xs font-medium text-slate-500">Set what this role can do in each module.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
          <label className="block"><span className="text-xs font-semibold text-slate-600">Role name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior Technician" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="mt-3 block"><span className="text-xs font-semibold text-slate-600">Description</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role is for" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>

          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Module access</p>
          <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {MODULES.map((m) => (
              <div key={m.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-sm font-semibold text-slate-700">{m.label}</span>
                <select value={permissions[m.key]} onChange={(e) => setPermissions({ ...permissions, [m.key]: e.target.value })} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold">
                  {MODULE_LEVELS.map((lvl) => <option key={lvl.value} value={lvl.value}>{lvl.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={busy} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : "Save role"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Manage an existing project: edit its details, manage the team (PM / DPM /
// technicians with per-person access), archive, or delete it.
function ManageProjectModal({ project, company, roster, roles, assignments, onClose, onChanged, onRemoved }) {
  const [fields, setFields] = useState({
    project_name: project.project_name || "",
    project_number: project.project_number || "",
    client_name: project.client_name || "",
    project_location: project.project_location || "",
    status: project.status || "Active"
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("technician");
  const [addRoleId, setAddRoleId] = useState("");
  const [addPerms, setAddPerms] = useState(() => fullPerms());
  const [editingId, setEditingId] = useState("");

  const memberById = (uid) => roster.find((m) => m.user_id === uid);
  const assignedUserIds = new Set(assignments.map((a) => a.user_id));
  const availableMembers = roster.filter((m) => m.user_id && m.status !== "disabled" && !assignedUserIds.has(m.user_id));
  const isArchived = String(fields.status).toLowerCase() !== "active";

  async function run(fn) {
    setBusy(true); setError("");
    try { await fn(); await onChanged(); }
    catch (err) { setError(err.message || "Something went wrong."); }
    finally { setBusy(false); }
  }

  async function saveDetails() { await run(() => updateProject(project, fields)); }

  async function toggleArchive() {
    const next = isArchived ? "Active" : "Inactive";
    setFields((f) => ({ ...f, status: next }));
    await run(() => updateProject(project, { status: next }));
  }

  async function addToTeam() {
    if (!addUserId) return;
    await run(async () => {
      await assignUserToProject(company.id, project.id, addUserId, addRole, headlineAccessLevel(addPerms), addPerms);
      // Keep the denormalized PM on the project in sync for reports/PDFs.
      if (addRole === "project_manager") {
        const m = memberById(addUserId);
        await updateProject(project, { project_manager_id: addUserId, project_manager_name: m?.full_name || null, project_manager_email: m?.invited_email || null });
      }
    });
    setAddUserId(""); setAddRoleId(""); setAddPerms(fullPerms());
  }

  async function removeFromTeam(a) {
    await run(async () => {
      await removeProjectAssignment(company.id, a.id);
      if (a.assignment_role === "project_manager" && project.project_manager_id === a.user_id) {
        await updateProject(project, { project_manager_id: null, project_manager_name: null, project_manager_email: null });
      }
    });
  }

  async function remove() {
    if (!window.confirm(`Delete "${project.project_name}"? This can't be undone.`)) return;
    setBusy(true); setError("");
    try { await deleteProject(project); onRemoved(); }
    catch (err) { setError(err.message || "Could not delete this project."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><FolderKanban className="h-5 w-5" /></div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{project.project_name}</h3>
              <p className="text-xs font-medium text-slate-500">#{project.project_number} · <span className="capitalize">{fields.status}</span></p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}

          {/* Details */}
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Details</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[["project_name", "Project Name"], ["project_number", "Project Number"], ["client_name", "Client"], ["project_location", "Location"]].map(([key, label]) => (
              <label key={key} className="block"><span className="text-xs font-semibold text-slate-600">{label}</span>
                <input value={fields[key]} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
            ))}
          </div>
          <button type="button" onClick={saveDetails} disabled={busy} className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-blue-700 px-3 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-60">Save details</button>

          {/* Team */}
          <p className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-500">Team</p>
          <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {assignments.length ? assignments.map((a) => {
              const m = memberById(a.user_id);
              const perms = fullPerms(a.permissions);
              const open = editingId === a.id;
              return (
                <div key={a.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{m?.full_name || m?.invited_email || "Member"}</p>
                      <p className="truncate text-xs font-medium text-slate-400">{roleLabel(a.assignment_role)} · {summarizePerms(perms)}</p>
                    </div>
                    <SmallButton onClick={() => setEditingId(open ? "" : a.id)} className="border-slate-300 text-slate-700">{open ? "Close" : "Access"}</SmallButton>
                    <button type="button" disabled={busy} onClick={() => removeFromTeam(a)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove from team"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {open && (
                    <div className="mt-2">
                      <ModulePermsGrid permissions={perms} disabled={busy} onChange={(next) => run(() => updateAssignmentPermissions(company.id, a.id, next))} />
                    </div>
                  )}
                </div>
              );
            }) : <p className="px-3 py-2.5 text-xs font-medium text-slate-400">No one on the team yet.</p>}
          </div>

          {/* Add to team */}
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
            <label className="col-span-2 block"><span className="text-xs font-semibold text-slate-600">Add person</span>
              <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold">
                <option value="">Select a team member…</option>
                {availableMembers.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.invited_email} · {roleLabel(m.role)}</option>)}
              </select></label>
            <label className="block"><span className="text-xs font-semibold text-slate-600">On project as</span>
              <select value={addRole} onChange={(e) => setAddRole(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold">
                {["project_manager", "deputy_project_manager", "technician", "inspector"].map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select></label>
            <div className="block"><RoleTemplatePicker roles={roles} value={addRoleId} onPick={(id, perms) => { setAddRoleId(id); if (perms) setAddPerms(perms); }} /></div>
            <div className="col-span-2">
              <span className="text-xs font-semibold text-slate-600">Module access (override per project)</span>
              <div className="mt-1"><ModulePermsGrid permissions={addPerms} onChange={setAddPerms} /></div>
            </div>
            <div className="col-span-2"><SmallButton onClick={addToTeam} disabled={busy || !addUserId} className="border-blue-200 text-blue-700 hover:bg-blue-50"><FolderPlus className="h-3.5 w-3.5" />Add to team</SmallButton></div>
          </div>
          {!availableMembers.length && <p className="mt-2 text-xs font-medium text-slate-400">Everyone on your roster is already on this team (or hasn't accepted their invite yet).</p>}

          {/* Danger zone */}
          <p className="mt-6 text-xs font-bold uppercase tracking-wide text-rose-500">Archive / Delete</p>
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
              <span className="text-xs font-medium text-slate-600">{isArchived ? "Reactivate this project." : "Archive — hide from active lists, keep all records."}</span>
              <SmallButton onClick={toggleArchive} disabled={busy}>{isArchived ? "Reactivate" : "Archive"}</SmallButton>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
              <span className="text-xs font-medium text-rose-700">Permanently delete (only if it has no reports).</span>
              <SmallButton onClick={remove} disabled={busy} className="border-rose-300 text-rose-700 hover:bg-rose-100"><Trash2 className="h-3.5 w-3.5" />Delete</SmallButton>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} className="min-h-11 w-full rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">Done</button>
        </div>
      </div>
    </div>
  );
}

// Full employee management: edit name/role, enable/disable, remove from the
// company, and manage which projects they're on (with per-project access).
function ManageMemberModal({ member, company, projects, roles, assignments, onClose, onChanged, onRemoved }) {
  const [name, setName] = useState(member.full_name || "");
  const [role, setRole] = useState(member.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addProjectId, setAddProjectId] = useState("");
  const [addRoleId, setAddRoleId] = useState("");
  const [addPerms, setAddPerms] = useState(() => fullPerms());
  const [editingId, setEditingId] = useState("");

  const assignedProjectIds = new Set(assignments.map((a) => a.project_id));
  const availableProjects = projects.filter((p) => !assignedProjectIds.has(p.id));

  function deriveAssignmentRole(r) {
    if (["company_admin", "project_manager"].includes(r)) return "project_manager";
    if (r === "deputy_project_manager") return "deputy_project_manager";
    return "technician";
  }

  async function run(fn) {
    setBusy(true); setError("");
    try { await fn(); await onChanged(); }
    catch (err) { setError(err.message || "Something went wrong."); }
    finally { setBusy(false); }
  }

  async function saveDetails() {
    await run(() => updateMemberDetails(member, { full_name: name, role }));
  }
  async function toggleStatus() {
    await run(() => setMemberStatus(member, member.status === "disabled" ? "active" : "disabled"));
  }
  async function remove() {
    if (!window.confirm(`Remove ${member.full_name || member.invited_email} from ${company.company_name}? They'll lose access and all their project assignments.`)) return;
    setBusy(true); setError("");
    try { await removeMember(member); onRemoved(); }
    catch (err) { setError(err.message || "Could not remove this member."); setBusy(false); }
  }
  async function addAssignment() {
    if (!addProjectId) return;
    await run(() => assignUserToProject(company.id, Number(addProjectId), member.user_id, deriveAssignmentRole(role), headlineAccessLevel(addPerms), addPerms));
    setAddProjectId(""); setAddRoleId(""); setAddPerms(fullPerms());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <InitialAvatar name={member.full_name || member.invited_email} color={company.brand_color || "#1d4ed8"} className="h-10 w-10 text-sm" />
            <div>
              <h3 className="text-lg font-bold text-slate-900">{member.full_name || member.invited_email}</h3>
              <p className="text-xs font-medium text-slate-500">{member.invited_email} · <span className="capitalize">{displayStatus(member)}</span></p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}

          {/* Details */}
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Details</p>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <label className="block"><span className="text-xs font-semibold text-slate-600">Full name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
            <label className="block"><span className="text-xs font-semibold text-slate-600">Company role</span>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 min-h-11 rounded-xl border border-slate-300 bg-white px-2 text-sm font-semibold">
                {COMPANY_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select></label>
          </div>
          <p className="mt-1.5 text-xs font-medium text-slate-400">Their job across the company (decides which app they sign in to). Per-project module access is set separately below.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={saveDetails} disabled={busy} className="inline-flex min-h-9 items-center rounded-lg bg-blue-700 px-3 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-60">Save details</button>
            <SmallButton onClick={toggleStatus} disabled={busy} className={member.status === "disabled" ? "" : "border-amber-200 text-amber-700 hover:bg-amber-50"}>
              {member.status === "disabled" ? "Enable" : "Disable"}
            </SmallButton>
          </div>

          {/* Project assignments */}
          <p className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-500">Project access</p>
          {!member.user_id ? (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2.5">
              <span className="text-xs font-medium text-amber-700">{member.full_name || "They"} haven't accepted the invite yet, so they have no account to assign. Project access unlocks once they sign in.</span>
              <SmallButton onClick={() => run(() => resendInvite(company.id, member))} disabled={busy} className="shrink-0 border-amber-200 text-amber-700 hover:bg-amber-100"><Mail className="h-3.5 w-3.5" />Resend</SmallButton>
            </div>
          ) : (
            <>
              <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {assignments.length ? assignments.map((a) => {
                  const perms = fullPerms(a.permissions);
                  const open = editingId === a.id;
                  return (
                    <div key={a.id} className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900">{a.projects?.project_name || `Project #${a.project_id}`}</p>
                          <p className="truncate text-xs font-medium text-slate-400">{summarizePerms(perms)}</p>
                        </div>
                        <SmallButton onClick={() => setEditingId(open ? "" : a.id)} className="border-slate-300 text-slate-700">{open ? "Close" : "Access"}</SmallButton>
                        <button type="button" disabled={busy} onClick={() => run(() => removeProjectAssignment(company.id, a.id))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove from project"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      {open && (
                        <div className="mt-2">
                          <ModulePermsGrid permissions={perms} disabled={busy} onChange={(next) => run(() => updateAssignmentPermissions(company.id, a.id, next))} />
                        </div>
                      )}
                    </div>
                  );
                }) : <p className="px-3 py-2.5 text-xs font-medium text-slate-400">Not assigned to any projects yet.</p>}
              </div>

              {/* Add to a project */}
              <div className="mt-3 rounded-xl bg-slate-50 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Add to another project</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block"><span className="text-xs font-semibold text-slate-600">Project</span>
                    <select value={addProjectId} onChange={(e) => setAddProjectId(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold">
                      <option value="">Select a project…</option>
                      {availableProjects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                    </select></label>
                  <div className="block"><RoleTemplatePicker roles={roles} value={addRoleId} onPick={(id, perms) => { setAddRoleId(id); if (perms) setAddPerms(perms); }} /></div>
                </div>
                <div className="mt-2"><span className="text-xs font-semibold text-slate-600">Module access (override per project)</span>
                  <div className="mt-1"><ModulePermsGrid permissions={addPerms} onChange={setAddPerms} /></div>
                </div>
                <div className="mt-2"><SmallButton onClick={addAssignment} disabled={busy || !addProjectId} className="border-blue-200 text-blue-700 hover:bg-blue-50"><FolderPlus className="h-3.5 w-3.5" />Add</SmallButton></div>
              </div>
            </>
          )}

          {/* Danger zone */}
          <p className="mt-6 text-xs font-bold uppercase tracking-wide text-rose-500">Remove</p>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
            <span className="text-xs font-medium text-rose-700">Remove this person from {company.company_name}.</span>
            <SmallButton onClick={remove} disabled={busy} className="border-rose-300 text-rose-700 hover:bg-rose-100"><Trash2 className="h-3.5 w-3.5" />Remove</SmallButton>
          </div>
        </div>

        <div className="border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} className="min-h-11 w-full rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">Done</button>
        </div>
      </div>
    </div>
  );
}

// Company admin approves a support request: pick exactly which daily logs to
// share, for how long, and whether to also reveal names.
function SupportApproveModal({ session, onClose, onApproved }) {
  const scopeLabel = supportScopeLabel(session.requested_scope);
  const [records, setRecords] = useState(null);
  const [selected, setSelected] = useState({});
  const [duration, setDuration] = useState(24);
  const [unmask, setUnmask] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCompanyReports(session.requested_scope).then(setRecords);
  }, [session.requested_scope]);

  function toggle(rec) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[rec.id]) delete next[rec.id];
      else next[rec.id] = rec.label;
      return next;
    });
  }

  async function approve() {
    const resources = Object.entries(selected).map(([id, label]) => ({ id: String(id), label }));
    if (!resources.length) { window.alert(`Select at least one ${scopeLabel.toLowerCase()} record to share.`); return; }
    setBusy(true);
    try {
      await approveSupportRequest(session.id, resources, Number(duration), unmask);
      await onApproved();
    } catch (err) { window.alert(err.message); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-950">Approve Support Access</h3>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-[13px] font-medium text-slate-500">Choose exactly which <span className="font-semibold text-slate-700">{scopeLabel}</span> to share. Only these will be visible to support, read-only, until the access expires.</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">Reason given: {session.reason || "—"}</p>

          <p className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{scopeLabel} to share</p>
          <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {records === null && <p className="px-2 py-3 text-sm font-semibold text-slate-400">Loading…</p>}
            {records && !records.length && <p className="px-2 py-3 text-sm font-semibold text-slate-400">No {scopeLabel.toLowerCase()} found.</p>}
            {records && records.map((rec) => (
              <label key={rec.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                <input type="checkbox" checked={!!selected[rec.id]} onChange={() => toggle(rec)} className="h-4 w-4 rounded border-slate-300" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-800">{rec.label}</span>
                  {rec.sub && <span className="block truncate text-xs font-medium text-slate-400">{rec.sub}</span>}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Access expires after</span>
              <select value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-2 text-sm font-semibold">
                <option value={1}>1 hour</option>
                <option value={24}>24 hours</option>
                <option value={168}>7 days</option>
              </select>
            </label>
            <label className="flex cursor-pointer items-end gap-2 pb-1.5">
              <input type="checkbox" checked={unmask} onChange={(e) => setUnmask(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              <span className="text-[13px] font-semibold text-slate-700">Also reveal names</span>
            </label>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <Lock className="h-3 w-3" /> {unmask ? "Names will be visible. Signatures and file contents stay hidden." : "Names, signatures, and file contents stay masked."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700">Cancel</button>
          <button type="button" onClick={approve} disabled={busy} className="min-h-11 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? "Approving…" : "Approve access"}
          </button>
        </div>
      </div>
    </div>
  );
}
