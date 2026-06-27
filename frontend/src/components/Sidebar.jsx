import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  FileClock,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShieldCheck,
  Users,
  Workflow
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { isQcRole, ROLES } from "../utils/permissions";
import { canAccessModule } from "../utils/moduleAccess";
import { MODULE_NAMES } from "../config/branding";
import { FIELD_ENGINEER_NAV } from "../modules/field-engineer/fieldEngineerConfig";

const navByRole = {
  technician: FIELD_ENGINEER_NAV,
  qc: [
    { label: MODULE_NAMES.validationCenter, path: "/qc/dashboard", icon: ClipboardCheck },
    { label: "Under Review", path: "/qc/dashboard?status=under_review", icon: ShieldCheck },
    { label: "Overdue", path: "/qc/dashboard?status=overdue", icon: FileClock },
    { label: "Approved", path: "/qc/dashboard?status=approved", icon: FileCheck2 },
    { label: "Rejected", path: "/qc/dashboard?status=rejected", icon: ListChecks },
    { label: MODULE_NAMES.activityStream, path: "/qc/dashboard?panel=notifications", icon: Bell }
  ],
  manager: [
    { label: MODULE_NAMES.commandCenter, path: "/manager/dashboard", icon: LayoutDashboard },
    { label: MODULE_NAMES.projectHub, path: "/project/1", icon: FolderKanban },
    { label: "Teams", path: "/manager/dashboard?view=teams", icon: Users },
    { label: "Workflow Monitoring", path: "/qc/dashboard", icon: Workflow },
    { label: MODULE_NAMES.projectInsights, path: "/manager/dashboard?view=analytics", icon: BarChart3 }
  ],
  admin: [
    { label: MODULE_NAMES.platformAdministration, path: "/admin/dashboard", icon: LayoutDashboard },
    { label: "Organizations", path: "/admin/dashboard?module=organizations", icon: Building2 },
    { label: MODULE_NAMES.accessControl, path: "/admin/dashboard?module=users", icon: Users },
    { label: MODULE_NAMES.projectHub, path: "/admin/dashboard?module=projects", icon: FolderKanban },
    { label: "Workflow Engine", path: "/admin/dashboard?module=workflow", icon: Workflow },
    { label: "Templates", path: "/admin/dashboard?module=templates", icon: FileText },
    { label: "Audit Logs", path: "/admin/dashboard?module=audit", icon: ListChecks },
    { label: MODULE_NAMES.workspaceConfiguration, path: "/admin/dashboard?module=settings", icon: Settings }
  ],
  client: [
    { label: MODULE_NAMES.commandCenter, path: "/client/dashboard", icon: LayoutDashboard },
    { label: MODULE_NAMES.digitalDeliverables, path: "/client/dashboard?view=approved", icon: FileCheck2 },
    { label: "Project Summaries", path: "/client/dashboard?view=projects", icon: FolderKanban },
    { label: MODULE_NAMES.activityStream, path: "/client/dashboard?view=notifications", icon: Bell }
  ],
  platform_admin: [
    { label: "Platform Dashboard", path: "/platform-admin", icon: LayoutDashboard },
    { label: "Companies", path: "/platform-admin?section=companies", icon: Building2 },
    { label: "Subscriptions", path: "/platform-admin?section=subscriptions", icon: FileText },
    { label: "Usage", path: "/platform-admin?section=usage", icon: BarChart3 },
    { label: "Support Access", path: "/platform-admin?section=support", icon: ShieldCheck },
    { label: "Audit Logs", path: "/platform-admin?section=audit", icon: ListChecks },
    { label: "Settings", path: "/platform-admin?section=settings", icon: Settings }
  ],
  company_admin: [
    { label: "Company Dashboard", path: "/company-admin", icon: LayoutDashboard },
    { label: "Projects", path: "/company-admin?section=projects", icon: FolderKanban },
    { label: "Employees", path: "/company-admin?section=employees", icon: Users },
    { label: "Roles & Permissions", path: "/company-admin?section=roles", icon: ShieldCheck },
    { label: "Clients", path: "/company-admin?section=clients", icon: Building2 },
    { label: "Reports", path: "/manager/dashboard", icon: FileCheck2 },
    { label: "Timesheets", path: "/timesheets", icon: FileClock },
    { label: "Lab Reports", path: "/company-admin?section=lab-reports", icon: FileText },
    { label: "Equipment", path: "/company-admin?section=equipment", icon: Workflow },
    { label: "Billing", path: "/company-admin?section=billing", icon: BarChart3 },
    { label: "Company Settings", path: "/company-admin?section=settings", icon: Settings }
  ]
};

function getNavKey(role, { isPlatformAdmin = false, companyRole = "" } = {}) {
  const normalizedRole = String(role || "").toLowerCase();
  if (normalizedRole === ROLES.PLATFORM_ADMIN || isPlatformAdmin) return "platform_admin";
  if (normalizedRole === ROLES.COMPANY_ADMIN) return "company_admin";
  // Company admins without a legacy operational role (fresh SaaS invitees
  // have no profiles row) get the company menu, not the viewer fallback.
  if (companyRole === "company_admin" && ["viewer", "client", ""].includes(normalizedRole)) {
    return "company_admin";
  }
  if (normalizedRole === ROLES.ADMIN) return "admin";
  if (
    normalizedRole === ROLES.QC_MANAGER ||
    normalizedRole === "project_manager" ||
    normalizedRole === "deputy_project_manager" ||
    normalizedRole === "manager"
  ) {
    // Legacy managers who also administer the company get the company menu.
    return companyRole === "company_admin" ? "company_admin" : "manager";
  }
  if (isQcRole(normalizedRole) || normalizedRole === "inspector") return "qc";
  if (normalizedRole === ROLES.TECHNICIAN || normalizedRole === "lab_technician") return "technician";
  if (normalizedRole === ROLES.CLIENT || normalizedRole === "client_viewer") return "client";
  return "client";
}

// Split a flat nav list (with {section} markers) into an ungrouped lead block
// plus titled groups.
function toGroups(navItems) {
  const groups = [];
  let current = { section: null, items: [] };
  navItems.forEach((item) => {
    if (item.section) {
      if (current.items.length || current.section) groups.push(current);
      current = { section: item.section, items: [] };
    } else {
      current.items.push(item);
    }
  });
  if (current.items.length || current.section) groups.push(current);
  return groups;
}

function Sidebar() {
  const { role, isPlatformAdmin, companyRole, modulePermissions } = useAuth();
  const location = useLocation();
  const rawNav = navByRole[getNavKey(role, { isPlatformAdmin, companyRole })] || navByRole.client;
  // Hide nav entries for modules the user has no access to on any project
  // (section headers carry a module too, so an empty group disappears cleanly).
  const navItems = rawNav.filter((item) =>
    !item.module || canAccessModule(modulePermissions, companyRole, isPlatformAdmin, item.module, "view"));
  const groups = toGroups(navItems);
  const [collapsed, setCollapsed] = useState(() => new Set());

  function isActive(path) {
    const basePath = path.split("?")[0];
    return location.pathname === basePath && (!path.includes("?") || `${location.pathname}${location.search}` === path);
  }

  function NavRow({ label, path, icon: Icon, nested }) {
    const active = isActive(path);
    return (
      <NavLink
        to={path}
        className={`flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition ${
          active
            ? "bg-accent-50 text-accent-800"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        } ${nested ? "ml-3 border-l border-slate-200 pl-3" : ""}`}
      >
        <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-accent-700" : "text-slate-400"}`} />
        <span className="truncate">{label}</span>
      </NavLink>
    );
  }

  return (
    <aside className="hidden h-full w-[220px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-2.5 py-3 lg:block">
      <nav className="space-y-0.5">
        {groups.map((group, gi) => {
          if (!group.section) {
            // Lead block (e.g. Dashboard) — no header.
            return group.items.map((item) => <NavRow key={item.path} {...item} />);
          }
          const isOpen = !collapsed.has(group.section);
          return (
            <div key={group.section} className="pt-2">
              <button
                type="button"
                onClick={() => setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(group.section)) next.delete(group.section); else next.add(group.section);
                  return next;
                })}
                className="flex w-full items-center justify-between px-2.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 transition hover:text-slate-600"
              >
                {group.section}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
              </button>
              {isOpen && (
                <div className="space-y-0.5">
                  {group.items.map((item) => <NavRow key={item.path} {...item} />)}
                </div>
              )}
              {gi < groups.length - 1 && <div className="mx-2.5 mt-2 border-b border-slate-100" />}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

export default Sidebar;
