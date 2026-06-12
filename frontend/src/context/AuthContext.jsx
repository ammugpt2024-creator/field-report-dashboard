/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState
} from "react";

import { supabase } from "../services/supabase";
import { preloadCompanyBranding } from "../services/brandingService";

const AuthContext = createContext();

const ROLE_LABELS = {
  platform_admin: "Platform Admin",
  company_admin: "Company Admin",
  deputy_project_manager: "Deputy Project Manager",
  inspector: "Inspector",
  lab_technician: "Lab Technician",
  technician: "Field Engineer",
  qc: "Quality Reviewer",
  qc_approver: "Quality Reviewer",
  qc_manager: "Operations Manager",
  // Manager roles must be recognized here — unknown roles normalize to
  // "viewer", which would strand managers on the project explorer.
  project_manager: "Project Manager",
  manager: "Project Manager",
  admin: "Organization Admin",
  client: "Client Viewer",
  viewer: "Viewer"
};

const AUTH_TIMEOUT_MS = 5000;

function normalizeRole(role) {
  return ROLE_LABELS[role] ? role : "viewer";
}

function withTimeout(promise, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, AUTH_TIMEOUT_MS);
    })
  ]);
}

export function AuthProvider({ children }) {

  const [session, setSession] = useState(null);

  const [profile, setProfile] = useState(null);

  const [role, setRole] = useState("viewer");

  const [companyName, setCompanyName] = useState("");

  const [loading, setLoading] = useState(true);

  // Which user the loaded profile belongs to. On a fresh sign-in the session
  // arrives before the profile row, and routing on the placeholder "viewer"
  // role would strand managers on the wrong home page.
  const [profileUserId, setProfileUserId] = useState(null);

  // Multi-tenant context: the caller's company membership (SaaS role), the
  // company record itself (branding), and platform ownership.
  const [company, setCompany] = useState(null);
  const [companyRole, setCompanyRole] = useState("");
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const loadTenantContext = useCallback(async (userId) => {
    if (!userId) {
      setCompany(null);
      setCompanyRole("");
      setIsPlatformAdmin(false);
      return;
    }
    try {
      // First sign-in after a Company Admin / employee invitation: attach this
      // account to its pending roster row before resolving membership.
      await supabase.rpc("claim_company_invite").catch(() => {});
      const [membershipRes, platformRes] = await Promise.all([
        supabase.from("company_users").select("company_id, role, status").eq("user_id", userId).eq("status", "active").maybeSingle(),
        supabase.from("platform_admins").select("user_id, status").eq("user_id", userId).eq("status", "active").maybeSingle()
      ]);
      setCompanyRole(membershipRes.data?.role || "");
      setIsPlatformAdmin(Boolean(platformRes.data));
      if (membershipRes.data?.company_id) {
        const { data: companyRow } = await supabase
          .from("companies")
          .select("*")
          .eq("id", membershipRes.data.company_id)
          .maybeSingle();
        setCompany(companyRow || null);
      } else {
        setCompany(null);
      }
    } catch (error) {
      console.warn("Tenant context could not be loaded.", error);
    }
  }, []);

  const loadProfile = useCallback(async (currentSession) => {
    if (!currentSession?.user?.id) {
      setProfile(null);
      setRole("viewer");
      setCompanyName("");
      setProfileUserId(null);
      setCompany(null);
      setCompanyRole("");
      setIsPlatformAdmin(false);
      return;
    }

    const {
      data,
      error
    } = await withTimeout(
      supabase
        .from("profiles")
        .select("*")
        .eq("id", currentSession.user.id)
        .maybeSingle(),
      "Profile lookup timed out"
    );

    if (error) {
      console.log("Profile Error:", error);
      setProfile(null);
      setRole("viewer");
      setCompanyName("");
      setProfileUserId(currentSession.user.id);
      return;
    }

    const resolvedProfile = data || null;
    const resolvedRole = normalizeRole(resolvedProfile?.role);

    setProfile(resolvedProfile);
    setRole(resolvedRole);
    setCompanyName(resolvedProfile?.company_name || "");
    setProfileUserId(currentSession.user.id);
    loadTenantContext(currentSession.user.id);
    preloadCompanyBranding();
  }, [loadTenantContext]);

  useEffect(() => {

    async function initializeAuth() {
      try {
        const {
          data,
          error
        } = await withTimeout(
          supabase.auth.getSession(),
          "Session lookup timed out"
        );

        if (error) {
          console.log(error);
          return;
        }

        const currentSession = data?.session || null;
        setSession(currentSession);
        await loadProfile(currentSession);
      } catch (err) {
        console.log("Auth Init Error:", err);
      } finally {
        setLoading(false);
      }
    }

    initializeAuth();

    const {
      data: listener
    } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession || null);
        loadProfile(currentSession).catch((err) => {
          console.log("Profile Load Error:", err);
        });
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };

  }, [loadProfile]);

  return (

    <AuthContext.Provider
      value={{
        session,
        profile,
        role,
        roleLabel: ROLE_LABELS[role] || "Viewer",
        profileReady: !session?.user?.id || profileUserId === session.user.id,
        company,
        companyId: company?.id || profile?.company_id || null,
        companyRole,
        isPlatformAdmin,
        companyName,
        loading
      }}
    >

      {children}

    </AuthContext.Provider>
  );
}

export function useAuth() {

  return useContext(AuthContext);

}
