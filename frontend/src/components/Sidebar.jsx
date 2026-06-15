import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Building2,
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
  ]
};

function getNavKey(role) {
  const normalizedRole = String(role || "").toLowerCase();
  if (normalizedRole === ROLES.ADMIN) return "admin";
  if (normalizedRole === ROLES.QC_MANAGER || normalizedRole === "project_manager" || normalizedRole === "manager") return "manager";
  if (isQcRole(normalizedRole)) return "qc";
  if (normalizedRole === ROLES.TECHNICIAN) return "technician";
  if (normalizedRole === ROLES.CLIENT || normalizedRole === "client_viewer") return "client";
  return "client";
}

function Sidebar() {
  const { role } = useAuth();
  const location = useLocation();
  const navItems = navByRole[getNavKey(role)] || navByRole.client;

  return (
    <aside className="hidden h-full w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-3 py-4 lg:block">
      <nav className="space-y-1">
        {navItems.map(({ label, path, icon: Icon, nested, section }) => {
          if (section) {
            return (
              <p key={section} className="px-3 pt-4 pb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400 first:pt-0">
                {section}
              </p>
            );
          }
          const basePath = path.split("?")[0];
          const active = location.pathname === basePath && (!path.includes("?") || `${location.pathname}${location.search}` === path);
          return (
            <NavLink
              key={path}
              to={path}
              className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2 text-sm font-bold transition ${
                active
                  ? "bg-blue-50 text-blue-800"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              } ${nested ? "ml-4 min-h-10 border-l border-slate-200 pl-4 text-xs" : ""}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}

export default Sidebar;
