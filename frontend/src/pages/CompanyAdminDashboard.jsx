import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Building2, CreditCard, FileText, FolderKanban, Plus, Upload, Users, Wrench, X
} from "lucide-react";
import { supabase } from "../services/supabase";
import {
  getMyCompanyContext,
  inviteMember,
  insertCompanyRow,
  listCompanyRows,
  setMemberRole,
  setMemberStatus,
  updateCompanyProfile,
  updateCompanyRow
} from "../services/tenantService";
import { companyStoragePath, preloadCompanyBranding } from "../services/brandingService";
import KeyValueList from "../components/mobile/KeyValueList";

const COMPANY_ROLES = [
  "company_admin", "project_manager", "deputy_project_manager",
  "technician", "inspector", "lab_technician", "viewer"
];
const CLIENT_TYPES = ["owner", "general_contractor", "agency", "utility", "developer", "other"];

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
  const [clients, setClients] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [labReports, setLabReports] = useState([]);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState(null);
  const [newClient, setNewClient] = useState(null);
  const [newEquipment, setNewEquipment] = useState(null);
  const [newProject, setNewProject] = useState(null);
  const [profileDraft, setProfileDraft] = useState(null);

  async function refresh() {
    try {
      const ctx = await getMyCompanyContext();
      setContext(ctx);
      const [projectRows, clientRows, equipmentRows, labRows] = await Promise.all([
        supabase.from("projects").select("*").order("project_name").then((r) => r.data || []),
        listCompanyRows("clients"),
        listCompanyRows("equipment"),
        listCompanyRows("lab_reports")
      ]);
      setProjects(projectRows);
      setClients(clientRows);
      setEquipment(equipmentRows);
      setLabReports(labRows);
    } catch (err) {
      setError(err.message || "Company data could not be loaded.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    refresh();
  }, []);

  const company = context.company;

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

  async function submitInvite(event) {
    event.preventDefault();
    await inviteMember(company.id, invite);
    setInvite(null);
    await refresh();
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
    const { error: insertError } = await supabase.from("projects").insert(newProject);
    if (insertError) {
      setError(insertError.message);
      return;
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
            action={<SmallButton onClick={() => setInvite({ email: "", fullName: "", role: "technician" })}><Plus className="h-3.5 w-3.5" />Invite</SmallButton>}
          >
            <div className="-my-1 divide-y divide-slate-100">
              {context.roster.map((member) => (
                <div key={member.id} className="flex flex-wrap items-center gap-3 py-3">
                  <InitialAvatar name={member.full_name || member.invited_email} color={company.brand_color || "#1d4ed8"} className="h-9 w-9 text-sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-900">{member.full_name || member.invited_email || "—"}</p>
                      <RowStatus status={member.status} />
                    </div>
                    <p className="truncate text-xs font-medium text-slate-400">{member.invited_email}</p>
                  </div>
                  <select
                    value={member.role}
                    onChange={(event) => setMemberRole(member, event.target.value).then(refresh)}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold capitalize text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    {COMPANY_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                  </select>
                  <SmallButton onClick={() => setMemberStatus(member, member.status === "disabled" ? "active" : "disabled").then(refresh)} className={member.status === "disabled" ? "" : "border-rose-200 text-rose-700 hover:bg-rose-50"}>
                    {member.status === "disabled" ? "Enable" : "Disable"}
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
            action={<SmallButton onClick={() => setNewProject({ project_name: "", project_number: "", client_name: "", project_location: "", status: "Active" })}><Plus className="h-3.5 w-3.5" />Add</SmallButton>}
          >
            <div className="-my-1 divide-y divide-slate-100">
              {projects.map((project) => (
                <div key={project.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{project.project_name}</p>
                    <p className="truncate text-xs font-medium text-slate-400">#{project.project_number} · {project.client_name} · {project.project_location}</p>
                  </div>
                  <RowStatus status={String(project.status || "active").toLowerCase()} />
                </div>
              ))}
              {!projects.length && <p className="py-3 text-sm font-semibold text-slate-500">No projects yet.</p>}
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
            <form onSubmit={submitInvite} className="w-full max-w-lg rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6">
              <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Invite Employee</h3>
                <button type="button" onClick={() => setInvite(null)} className="rounded-full border border-slate-200 p-2"><X className="h-4 w-4" /></button></div>
              <div className="mt-3 space-y-3">
                <label className="block"><span className="text-xs font-bold uppercase text-slate-500">Email *</span>
                  <input type="email" required value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" /></label>
                <label className="block"><span className="text-xs font-bold uppercase text-slate-500">Full Name</span>
                  <input value={invite.fullName} onChange={(event) => setInvite({ ...invite, fullName: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" /></label>
                <label className="block"><span className="text-xs font-bold uppercase text-slate-500">Role</span>
                  <select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold">
                    {COMPANY_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                  </select></label>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setInvite(null)} className="min-h-11 rounded-xl border border-slate-300 text-sm font-bold text-slate-700">Cancel</button>
                <button type="submit" className="min-h-11 rounded-xl bg-blue-700 text-sm font-bold text-white">Send Invite</button>
              </div>
            </form>
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
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewProject(null)} className="min-h-11 rounded-xl border border-slate-300 text-sm font-bold text-slate-700">Cancel</button>
                <button type="submit" className="min-h-11 rounded-xl bg-blue-700 text-sm font-bold text-white">Add Project</button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}
