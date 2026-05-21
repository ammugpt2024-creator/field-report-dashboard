import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../services/supabase";
import { useAuth } from "../context/AuthContext";

function Navbar() {

  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);

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

    <div className="
      px-6
      py-4
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

      <div className="flex items-center gap-4">

        {/* COMPANY / APP */}

        <div>

          <h2 className="
            text-2xl
            font-bold
            text-slate-900
            leading-none
          ">
            QCore
          </h2>

          <p className="
            text-xs
            text-slate-500
            tracking-wide
            uppercase
            mt-1
          ">
            Quality Control Management Platform
          </p>

          {companyName && (
            <p className="
              text-sm
              text-slate-600
              mt-1
              font-medium
            ">
              {companyName}
            </p>
          )}

        </div>

        {/* ROLE BADGE */}

        <div className="
          rounded-2xl
          bg-slate-100
          px-4
          py-2
          border
          border-slate-200
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

      <div className="relative flex items-center gap-3">

        <button
          type="button"
          onClick={() => setProfileOpen((previous) => !previous)}
          className="
            inline-flex
            items-center
            gap-3
            rounded-2xl
            border
            border-slate-200
            bg-white
            px-3
            py-2
            text-left
            transition
            hover:bg-slate-50
          "
        >
          <span className="
            flex
            h-9
            w-9
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
          <span className="block">
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
            right-24
            top-14
            z-50
            w-80
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
          "
        >
          Logout
        </button>

      </div>

    </div>

  );
}

export default Navbar;
