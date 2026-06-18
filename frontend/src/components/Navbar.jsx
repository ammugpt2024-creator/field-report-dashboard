import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  FileClock,
  FolderKanban,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
  X
} from "lucide-react";
import { supabase } from "../services/supabase";
import { useAuth } from "../context/AuthContext";
import { getRoleHomeRoute } from "../utils/navigation";
import { isQcRole, ROLES } from "../utils/permissions";
import { BRAND, MODULE_NAMES } from "../config/branding";
import { getCompanyBranding } from "../services/brandingService";
import { FIELD_ENGINEER_NAV } from "../modules/field-engineer/fieldEngineerConfig";
import { LogoMark } from "./Logo";

function Navbar() {

  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  const {
    session,
    profile,
    roleLabel,
    companyName,
    role,
    companyRole,
    isPlatformAdmin
  } = useAuth();

  // Company branding (logo + name), from the cache AuthContext preloads.
  const [branding, setBranding] = useState(getCompanyBranding());
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBranding(getCompanyBranding());
    setLogoFailed(false);
  }, [companyName]);
  const companyDisplay = companyName || branding.name || "Company";
  const companyInitials = (companyDisplay || "C")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "C";

  const displayName =
    profile?.full_name ||
    session?.user?.email?.split("@")?.[0] ||
    "Field Engineer";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
  const normalizedRole = String(role || "").toLowerCase();

  const mobileLinks = (() => {
    if (normalizedRole === ROLES.TECHNICIAN) return FIELD_ENGINEER_NAV;
    if (normalizedRole === ROLES.ADMIN) {
      return [
        { label: MODULE_NAMES.platformAdministration, icon: LayoutDashboard, path: "/admin/dashboard" },
        { label: "Organizations", icon: Building2, path: "/admin/dashboard?module=organizations" },
        { label: "Users", icon: Users, path: "/admin/dashboard?module=users" },
        { label: "Workflow Engine", icon: Workflow, path: "/admin/dashboard?module=workflow" },
        { label: "Audit Logs", icon: ClipboardCheck, path: "/admin/dashboard?module=audit" }
      ];
    }
    if (normalizedRole === ROLES.QC_MANAGER || normalizedRole === "project_manager" || normalizedRole === "manager") {
      return [
        { label: MODULE_NAMES.commandCenter, icon: LayoutDashboard, path: "/manager/dashboard" },
        { label: MODULE_NAMES.validationCenter, icon: ShieldCheck, path: "/qc/dashboard" },
        { label: MODULE_NAMES.projectHub, icon: FolderKanban, path: "/project/1" },
        { label: "Teams", icon: Users, path: "/manager/dashboard?view=teams" },
        { label: "Analytics", icon: BarChart3, path: "/manager/dashboard?view=analytics" }
      ];
    }
    if (isQcRole(normalizedRole)) {
      return [
        { label: MODULE_NAMES.validationCenter, icon: ShieldCheck, path: "/qc/dashboard" },
        { label: "Under Review", icon: ClipboardCheck, path: "/qc/dashboard?status=under_review" },
        { label: "Overdue", icon: FileClock, path: "/qc/dashboard?status=overdue" },
        { label: "Approved", icon: FileCheck2, path: "/qc/dashboard?status=approved" },
        { label: "Notifications", icon: Bell, path: "/qc/dashboard?panel=notifications" }
      ];
    }
    return [
      { label: "Client Command Center", icon: Home, path: getRoleHomeRoute(role) },
      { label: "Approved Deliverables", icon: FileCheck2, path: "/client/dashboard?view=approved" },
      { label: "Project Summaries", icon: FolderKanban, path: "/client/dashboard?view=projects" }
    ];
  })();

  function handleNavigate(path) {
    navigate(path);
    setMobileMenuOpen(false);
    setProfileOpen(false);
    setCompanyOpen(false);
  }

  const notificationsPath = normalizedRole === ROLES.TECHNICIAN
    ? "/technician/dashboard?view=notifications"
    : `${getRoleHomeRoute(role)}?view=notifications`;
  const profilePath = normalizedRole === ROLES.TECHNICIAN ? "/technician/dashboard?view=profile" : "/profile";

  // Where the company switcher's management links point (admins only).
  const canManageCompany = companyRole === "company_admin" || ["admin", "qc_manager"].includes(normalizedRole) || isPlatformAdmin;

  useEffect(() => {
    if (!profileOpen && !companyOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") { setProfileOpen(false); setCompanyOpen(false); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [profileOpen, companyOpen]);

  async function handleLogout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) { console.error("Logout Error:", error.message); return; }
      localStorage.clear();
      sessionStorage.clear();
      navigate("/login", { replace: true });
      window.location.reload();
    } catch (err) {
      console.error("Logout Failed:", err);
    }
  }

  const CompanyChipInner = (
    <>
      <span className="inline-flex h-7 items-center justify-center overflow-hidden rounded-md bg-white px-1 ring-1 ring-slate-200">
        {branding.logoUrl && !logoFailed ? (
          <img src={branding.logoUrl} alt={companyDisplay} onError={() => setLogoFailed(true)} className="h-5 w-auto max-w-[96px] object-contain" />
        ) : (
          <span className="flex h-5 w-5 items-center justify-center rounded bg-navy-900 text-[10px] font-bold text-white">{companyInitials}</span>
        )}
      </span>
      <span className="hidden max-w-[140px] truncate text-sm font-semibold text-slate-700 lg:block">{companyDisplay}</span>
      <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
    </>
  );

  return (

    <header className="sticky top-0 z-40 w-full max-w-full overflow-visible border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
      <div className="flex items-center justify-between gap-3 sm:gap-4">

        {/* LEFT — platform mark */}
        <button
          type="button"
          onClick={() => handleNavigate(getRoleHomeRoute(role))}
          className="flex shrink-0 items-center gap-1 rounded-lg px-1 py-1 transition hover:bg-slate-50"
          style={{ maxWidth: 220 }}
        >
          <LogoMark tone="dark" className="h-8 w-8 sm:h-9 sm:w-9" />
          <span className="-ml-0.5 text-xl font-bold tracking-tight text-navy-900 sm:text-2xl">Core</span>
        </button>

        {/* CENTER — search */}
        <div className="hidden min-w-0 flex-1 justify-center px-2 md:flex">
          <div className="relative w-full max-w-[400px]" style={{ width: 320 }}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects, reports, logs…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 hover:bg-slate-100 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {/* RIGHT — utilities */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">

          <button
            type="button"
            onClick={() => handleNavigate(notificationsPath)}
            aria-label="Notifications"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Bell className="h-5 w-5" />
          </button>

          <button
            type="button"
            aria-label="Help"
            className="hidden h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 sm:inline-flex"
          >
            <HelpCircle className="h-5 w-5" />
          </button>

          <div className="hidden h-6 w-px bg-slate-200 sm:block" />

          {/* Company switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setCompanyOpen((v) => !v); setProfileOpen(false); }}
              aria-expanded={companyOpen}
              aria-haspopup="menu"
              title={companyDisplay}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 transition hover:bg-slate-50"
            >
              {CompanyChipInner}
            </button>
            {companyOpen && (
              <>
                <button type="button" aria-label="Close" onClick={() => setCompanyOpen(false)} className="fixed inset-0 z-40 cursor-default" />
                <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-950/10">
                  <p className="px-3 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Current company</p>
                  <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="inline-flex h-8 items-center justify-center overflow-hidden rounded-md bg-white px-1 ring-1 ring-slate-200">
                      {branding.logoUrl && !logoFailed ? (
                        <img src={branding.logoUrl} alt={companyDisplay} className="h-6 w-auto max-w-[96px] object-contain" />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-navy-900 text-xs font-bold text-white">{companyInitials}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{companyDisplay}</span>
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  </div>
                  {canManageCompany && (
                    <nav className="mt-2 space-y-1">
                      <button type="button" role="menuitem" onClick={() => handleNavigate("/company-admin")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100">
                        <Settings className="h-4 w-4 text-slate-400" /> Company Settings
                      </button>
                      <button type="button" role="menuitem" onClick={() => handleNavigate("/company-admin?section=billing")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100">
                        <CreditCard className="h-4 w-4 text-slate-400" /> Subscription
                      </button>
                    </nav>
                  )}
                  <p className="mt-2 border-t border-slate-100 px-3 pb-1 pt-2 text-[11px] font-medium text-slate-400">Multi-company switching coming soon.</p>
                </div>
              </>
            )}
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setProfileOpen((v) => !v); setCompanyOpen(false); }}
              aria-expanded={profileOpen}
              aria-haspopup="menu"
              className="inline-flex items-center gap-2 rounded-xl px-1 py-1 transition hover:bg-slate-100 sm:px-1.5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white">{initials}</span>
              <span className="hidden items-center gap-1 sm:flex">
                <span className="block text-sm font-semibold text-slate-800">{displayName}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </span>
            </button>
            {profileOpen && (
              <>
                <button type="button" aria-label="Close" onClick={() => setProfileOpen(false)} className="fixed inset-0 z-40 cursor-default" />
                <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-950/10">
                  <div className="border-b border-slate-100 px-3 py-2.5">
                    <p className="truncate text-sm font-bold text-slate-950">{displayName}</p>
                    <p className="truncate text-xs font-semibold text-slate-500">{session?.user?.email || "No email"}</p>
                    <p className="mt-1.5 truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">{roleLabel || "Field User"}</p>
                  </div>
                  <nav className="mt-1.5 space-y-1">
                    <button type="button" role="menuitem" onClick={() => handleNavigate(profilePath)} className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100"><Users className="h-4 w-4 text-slate-400" /> Profile</button>
                    <button type="button" role="menuitem" onClick={() => handleNavigate(profilePath)} className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100"><Settings className="h-4 w-4 text-slate-400" /> Preferences</button>
                    <button type="button" role="menuitem" onClick={() => setProfileOpen(false)} className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100"><HelpCircle className="h-4 w-4 text-slate-400" /> Help Center</button>
                    <button type="button" role="menuitem" onClick={handleLogout} className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-bold text-rose-700 hover:bg-rose-50"><LogOut className="h-4 w-4" /> Logout</button>
                  </nav>
                </div>
              </>
            )}
          </div>

          {/* Mobile nav trigger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 md:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation overlay"
          />
          <aside className="absolute right-0 top-0 flex h-full w-[min(88vw,360px)] max-w-full flex-col bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <LogoMark className="h-9 w-9 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl font-bold text-slate-950">{BRAND.name}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">{companyDisplay}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-900"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="mt-5 space-y-1 overflow-y-auto">
              {mobileLinks.map(({ label, icon: Icon, path, section }) => {
                if (section) {
                  return (
                    <p key={section} className="px-4 pt-4 pb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400 first:pt-0">{section}</p>
                  );
                }
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => handleNavigate(path)}
                    className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"
                  >
                    <Icon className="h-5 w-5 text-slate-500" />
                    {label}
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-slate-100 pt-4">
              <button type="button" onClick={handleLogout} className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl px-4 text-left text-sm font-bold text-rose-700 hover:bg-rose-50"><LogOut className="h-4 w-4" /> Logout</button>
            </div>
          </aside>
        </div>
      )}

    </header>

  );
}

export default Navbar;
