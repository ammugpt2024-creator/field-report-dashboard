import {
  Routes,
  Route,
  Navigate
} from "react-router-dom";

import { useAuth } from "./context/AuthContext";
import { getRoleHomeRoute } from "./utils/navigation";

import MainLayout from "./layouts/MainLayout";

import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import ClientDashboard from "./pages/ClientDashboard";
import ManagerDashboard from "./pages/ManagerDashboard";
import TechnicianDashboard from "./pages/TechnicianDashboard";
import TimesheetsPage from "./pages/TimesheetsPage";
import ProjectWorkspace from "./pages/ProjectWorkspace";
import FieldReports from "./pages/FieldReports";
import LabReports from "./pages/LabReports";
import ConcreteTestLog from "./pages/ConcreteTestLog";
import ConcreteTestLogDetails from "./pages/ConcreteTestLogDetails";
import QCReviewDashboard from "./pages/QCReviewDashboard";
import Reports from "./pages/Reports";
import DailyLogReview from "./pages/DailyLogReview";
import PlatformAdminDashboard from "./pages/PlatformAdminDashboard";
import CompanyAdminDashboard from "./pages/CompanyAdminDashboard";
import AcceptInvite from "./pages/AcceptInvite";

function App() {

  const {
    session,
    role,
    loading,
    profileReady,
    isPlatformAdmin,
    companyRole
  } = useAuth();

  // profileReady guards the fresh-login race: the session exists before the
  // profile row loads, and routing on the placeholder role would send
  // managers to the viewer fallback.
  if (loading || !profileReady) {

    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100">
        <div className="bg-white p-10 rounded-2xl shadow-xl">
          <h1 className="text-3xl font-bold text-slate-900">
            Loading Application
          </h1>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  // Invitation / password-recovery links sign the user in with a one-time
  // token; send them to the set-password screen before anything else.
  const authFlow = sessionStorage.getItem("qcore-auth-flow");
  if (authFlow || window.location.pathname === "/welcome") {
    sessionStorage.removeItem("qcore-auth-flow");
    if (window.location.pathname !== "/welcome") {
      window.history.replaceState(null, "", "/welcome");
    }
    return <AcceptInvite />;
  }

  function RoleHome() {
    // Platform ownership and company-admin membership outrank the legacy
    // profile role when deciding the landing page.
    if (isPlatformAdmin) {
      return <Navigate to="/platform-admin" replace />;
    }
    const normalized = String(role || "").toLowerCase();
    if (companyRole === "company_admin" && ["viewer", "client", "company_admin"].includes(normalized)) {
      return <Navigate to="/company-admin" replace />;
    }
    return <Navigate to={getRoleHomeRoute(role)} replace />;
  }

  // Role-gate a route: users outside the allowed roles are sent to their own home.
  function RequireRole({ roles, children }) {
    const normalizedRole = String(role || "").toLowerCase();
    if (!roles.includes(normalizedRole)) {
      return <Navigate to={getRoleHomeRoute(role)} replace />;
    }
    return children;
  }

  const MANAGER_ROLES = ["project_manager", "deputy_project_manager", "manager", "qc_manager", "admin", "company_admin"];

  // Platform admin area: platform_admins membership (or the role) only.
  function RequirePlatformAdmin({ children }) {
    if (!isPlatformAdmin && String(role).toLowerCase() !== "platform_admin") {
      return <Navigate to={getRoleHomeRoute(role)} replace />;
    }
    return children;
  }

  // Company admin area: the company_users role, the profile role, or legacy
  // admin-equivalents (qc_manager/admin run today's single company).
  function RequireCompanyAdmin({ children }) {
    const normalized = String(role || "").toLowerCase();
    const allowed = companyRole === "company_admin" ||
      ["company_admin", "admin", "qc_manager"].includes(normalized);
    if (!allowed) {
      return <Navigate to={getRoleHomeRoute(role)} replace />;
    }
    return children;
  }
  const QC_ROLES = ["qc", "qc_approver", "qc_manager", "project_manager", "manager", "admin"];

  function ProfileRoute() {
    if (String(role || "").toLowerCase() === "technician") {
      return <Navigate to="/technician/dashboard?view=profile" replace />;
    }
    return <RoleHome />;
  }

  return (

    <MainLayout>

      <Routes>

        <Route
          path="/"
          element={<RoleHome />}
        />

        <Route
          path="/technician/dashboard"
          element={<TechnicianDashboard />}
        />

        {/* Timesheets are universal — managers and admins file their own too. */}
        <Route
          path="/timesheets"
          element={<TimesheetsPage />}
        />

        <Route
          path="/technician/activity-history"
          element={<TechnicianDashboard />}
        />

        <Route
          path="/technician/daily-log/:logId"
          element={<TechnicianDashboard />}
        />

        <Route
          path="/technician/daily-log/:logId/submitted"
          element={<TechnicianDashboard />}
        />

        <Route
          path="/technician/daily-log/:logId/activity/:activityId/concrete-report/:reportId"
          element={<ConcreteTestLog />}
        />

        <Route
          path="/technician/daily-log/:logId/activity/:activityId/compaction-report/:reportId"
          element={<TechnicianDashboard />}
        />

        <Route
          path="/profile"
          element={<ProfileRoute />}
        />

        <Route
          path="/qc/dashboard"
          element={<RequireRole roles={QC_ROLES}><QCReviewDashboard /></RequireRole>}
        />

        <Route
          path="/platform-admin"
          element={<RequirePlatformAdmin><PlatformAdminDashboard /></RequirePlatformAdmin>}
        />

        <Route
          path="/company-admin"
          element={<RequireCompanyAdmin><CompanyAdminDashboard /></RequireCompanyAdmin>}
        />

        <Route
          path="/manager/dashboard"
          element={<RequireRole roles={MANAGER_ROLES}><ManagerDashboard /></RequireRole>}
        />

        <Route
          path="/manager/daily-log-review/:logId"
          element={<RequireRole roles={MANAGER_ROLES}><DailyLogReview /></RequireRole>}
        />

        <Route
          path="/admin/dashboard"
          element={<RequireRole roles={["admin"]}><AdminDashboard /></RequireRole>}
        />

        <Route
          path="/client/dashboard"
          element={<RequireRole roles={["client", "admin"]}><ClientDashboard /></RequireRole>}
        />

        <Route
          path="/project/:projectId"
          element={<ProjectWorkspace />}
        />

        <Route
          path="/project/:projectId/field-reports"
          element={<FieldReports />}
        />

        <Route
          path="/project/:projectId/lab-reports"
          element={<LabReports />}
        />

        <Route
          path="/project/:projectId/concrete-test-log/create"
          element={<ConcreteTestLog />}
        />

        <Route
          path="/project/:projectId/field-reports/concrete-test-log/create"
          element={<ConcreteTestLog />}
        />

        <Route
          path="/project/:projectId/field-reports/concrete-test-log/:reportId/edit"
          element={<ConcreteTestLog />}
        />

        <Route
          path="/project/:projectId/field-reports/concrete-test-log"
          element={<Reports />}
        />

        <Route
          path="/project/:projectId/field-reports/concrete-test-log/:reportId"
          element={<ConcreteTestLogDetails />}
        />

        <Route
          path="/project/:projectId/qc-review-dashboard"
          element={<QCReviewDashboard />}
        />

        <Route
          path="/qc/review/:reportId"
          element={<ConcreteTestLogDetails />}
        />

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />

      </Routes>

    </MainLayout>
  );
}

export default App;
