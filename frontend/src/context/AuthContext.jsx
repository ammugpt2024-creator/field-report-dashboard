/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState
} from "react";

import { supabase } from "../services/supabase";

const AuthContext = createContext();

const ROLE_LABELS = {
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

  const loadProfile = useCallback(async (currentSession) => {
    if (!currentSession?.user?.id) {
      setProfile(null);
      setRole("viewer");
      setCompanyName("");
      setProfileUserId(null);
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
  }, []);

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
