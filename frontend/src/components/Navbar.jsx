import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  Building2,
  ClipboardCheck,
  FileCheck2,
  FileClock,
  FileText,
  FolderKanban,
  Home,
  LayoutDashboard,
  Menu,
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
import { FIELD_ENGINEER_NAV } from "../modules/field-engineer/fieldEngineerConfig";

function Navbar() {

  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const profileButtonRef = useRef(null);
  const [profileMenuPosition, setProfileMenuPosition] = useState({ top: 76, right: 16 });

  const {
    session,
    profile,
    roleLabel,
    companyName,
    role
  } = useAuth();

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
  const projectId = location.pathname.match(/\/project\/([^/]+)/)?.[1];
  const normalizedRole = String(role || "").toLowerCase();
  const mobileLinks = (() => {
    if (normalizedRole === ROLES.TECHNICIAN) {
      return FIELD_ENGINEER_NAV;
    }

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
  }

  function openProfileMenu() {
    const rect = profileButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setProfileMenuPosition({
        top: Math.min(rect.bottom + 8, window.innerHeight - 16),
        right: Math.max(16, window.innerWidth - rect.right)
      });
    }
    setProfileOpen((previous) => !previous);
  }

  useEffect(() => {
    if (!profileOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setProfileOpen(false);
    }

    function handleViewportChange() {
      const rect = profileButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setProfileMenuPosition({
        top: Math.min(rect.bottom + 8, window.innerHeight - 16),
        right: Math.max(16, window.innerWidth - rect.right)
      });
    }

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [profileOpen]);

  async function handleLogout() {

    try {

      // logout from Supabase auth

      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Logout Error:", error.message);
        return;
      }

      // clear local storage/session cache if needed

      localStorage.clear();
      sessionStorage.clear();

      // redirect properly

      navigate("/login", { replace: true });

      // hard refresh to clear stale auth state

      window.location.reload();

    } catch (err) {

      console.error("Logout Failed:", err);

    }
  }

  return (

    <header className="
      w-full
      max-w-full
      overflow-x-hidden
      px-4
      py-3
      sm:px-6
      sm:py-4
      bg-white
      border-b
      border-slate-200
      flex
      items-center
      justify-between
      gap-4
      sticky
      top-0
      z-40
    ">

      {/* LEFT SECTION */}

      <div className="flex min-w-0 items-center gap-3 sm:gap-4">

        {/* COMPANY / APP */}

        <div className="min-w-0">

          <h2 className="
            text-xl
            sm:text-2xl
            font-bold
            text-slate-900
            leading-none
          ">
            {BRAND.name}
          </h2>

          <p className="
            hidden
            text-xs
            text-slate-500
            tracking-wide
            uppercase
            mt-1
            sm:block
          ">
            {BRAND.platformDescription}
          </p>

          {companyName && (
            <p className="
              hidden
              text-sm
              text-slate-600
              mt-1
              font-medium
              sm:block
            ">
              {companyName}
            </p>
          )}

        </div>
      </div>

      {/* RIGHT SECTION */}

      <div className="relative flex shrink-0 items-center gap-2 sm:gap-3">

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <button
          ref={profileButtonRef}
          type="button"
          onClick={openProfileMenu}
          aria-expanded={profileOpen}
          aria-haspopup="menu"
          className="
            inline-flex
            items-center
            gap-2
            sm:gap-3
            rounded-2xl
            border
            border-slate-200
            bg-white
            px-2
            sm:px-3
            py-2
            text-left
            transition
            hover:bg-slate-50
          "
        >
          <span className="
            flex
            h-10
            w-10
            items-center
            justify-center
            rounded-full
            bg-blue-700
            text-sm
            font-bold
            text-white
          ">
            {initials}
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-semibold text-slate-900">
              {displayName}
            </span>
            <span className="block text-xs font-medium text-slate-500">
              Profile
            </span>
          </span>
        </button>

        {profileOpen && (
          <div className="fixed inset-0 z-[1000]">
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-transparent"
              onClick={() => setProfileOpen(false)}
              aria-label="Close profile menu"
            />
            <div
              role="menu"
              className="
                fixed
                left-4
                right-4
                max-h-[calc(100vh-6rem)]
                overflow-y-auto
                rounded-2xl
                border
                border-slate-200
                bg-white
                p-2
                text-sm
                shadow-2xl
                shadow-slate-950/20
                sm:left-auto
                sm:w-72
              "
              style={{
                top: `${profileMenuPosition.top}px`,
                right: `${profileMenuPosition.right}px`
              }}
            >
              <div className="border-b border-slate-100 px-3 py-3">
                <p className="truncate text-sm font-bold text-slate-950">{displayName}</p>
                <p className="truncate text-xs font-semibold text-slate-500">{session?.user?.email || "No email available"}</p>
                <p className="mt-2 truncate text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{roleLabel || "Field User"}</p>
                <p className="mt-1 truncate text-xs font-semibold text-slate-600">{companyName || "Dulles Engineering"}</p>
              </div>
              <nav className="mt-2 space-y-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleNavigate(normalizedRole === ROLES.TECHNICIAN ? "/technician/dashboard?view=profile" : "/profile")}
                  className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"
                >
                  My Profile
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleNavigate(normalizedRole === ROLES.TECHNICIAN ? "/technician/dashboard?view=notifications" : `${getRoleHomeRoute(role)}?view=notifications`)}
                  className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"
                >
                  Notifications
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleNavigate(normalizedRole === ROLES.TECHNICIAN ? "/technician/dashboard?view=profile" : "/profile")}
                  className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"
                >
                  Change Password
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-bold text-rose-700 hover:bg-rose-50"
                >
                  Logout
                </button>
              </nav>
            </div>
          </div>
        )}

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
              <div className="min-w-0">
                <p className="text-xl font-bold text-slate-950">{BRAND.name}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{roleLabel || "Field User"}</p>
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
                    <p key={section} className="px-4 pt-4 pb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400 first:pt-0">
                      {section}
                    </p>
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
              <p className="px-4 text-xs font-semibold text-slate-500">Account actions are available from the profile menu.</p>
            </div>
          </aside>
        </div>
      )}

    </header>

  );
}

export default Navbar;
