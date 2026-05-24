import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { FolderKanban, Home, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { supabase } from "../services/supabase";
import { useAuth } from "../context/AuthContext";

function Navbar() {

  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const {
    session,
    profile,
    roleLabel,
    companyName
  } = useAuth();

  const displayName =
    profile?.full_name ||
    session?.user?.email?.split("@")?.[0] ||
    "Technician";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
  const projectId = location.pathname.match(/\/project\/([^/]+)/)?.[1];
  const mobileLinks = [
    { label: "Project Home", icon: Home, path: projectId ? `/project/${projectId}` : "/" },
    ...(projectId ? [{ label: "Report Dashboard", icon: FolderKanban, path: `/project/${projectId}/field-reports/concrete-test-log` }] : []),
    ...(projectId ? [{ label: "QC Review Queue", icon: ShieldCheck, path: `/project/${projectId}/qc-review-dashboard` }] : [])
  ];

  function handleNavigate(path) {
    navigate(path);
    setMobileMenuOpen(false);
    setProfileOpen(false);
  }

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
            QCore
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
            Quality Control Management Platform
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

        {/* ROLE BADGE */}

        <div className="
          hidden
          rounded-2xl
          bg-slate-100
          px-4
          py-2
          border
          border-slate-200
          md:block
        ">

          <p className="
            text-xs
            uppercase
            tracking-wide
            text-slate-500
            mb-1
          ">
            Assigned Role
          </p>

          <p className="
            text-sm
            font-semibold
            text-slate-800
          ">
            {roleLabel || "Loading..."}
          </p>

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
          type="button"
          onClick={() => setProfileOpen((previous) => !previous)}
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
          <div className="
            absolute
            right-0
            top-14
            z-50
            w-[calc(100vw-2rem)]
            max-w-80
            rounded-3xl
            border
            border-slate-200
            bg-white
            p-4
            text-sm
            shadow-xl
            shadow-slate-950/10
          ">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-700 font-bold text-white">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-950">{displayName}</p>
                <p className="truncate text-xs text-slate-500">{session?.user?.email || "No email available"}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-slate-700">
              <div className="flex justify-between gap-3">
                <span className="font-medium text-slate-500">Role</span>
                <span className="font-semibold text-slate-950">{roleLabel || "Viewer"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="font-medium text-slate-500">Company</span>
                <span className="truncate font-semibold text-slate-950">{companyName || "Dulles Engineering"}</span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="
            hidden
            rounded-2xl
            bg-slate-900
            px-5
            py-2.5
            text-sm
            font-semibold
            text-white
            transition
            hover:bg-slate-800
            active:scale-95
            sm:inline-flex
          "
        >
          Logout
        </button>

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
                <p className="text-xl font-bold text-slate-950">QCore</p>
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

            <nav className="mt-5 space-y-2">
              {mobileLinks.map(({ label, icon: Icon, path }) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => handleNavigate(path)}
                  className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"
                >
                  <Icon className="h-5 w-5 text-slate-500" />
                  {label}
                </button>
              ))}
            </nav>

            <div className="mt-auto border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white"
              >
                <LogOut className="h-5 w-5" />
                Logout
              </button>
            </div>
          </aside>
        </div>
      )}

    </header>

  );
}

export default Navbar;
