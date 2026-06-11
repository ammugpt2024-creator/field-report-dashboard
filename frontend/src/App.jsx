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
import ProjectWorkspace from "./pages/ProjectWorkspace";
import FieldReports from "./pages/FieldReports";
import LabReports from "./pages/LabReports";
import ConcreteTestLog from "./pages/ConcreteTestLog";
import ConcreteTestLogDetails from "./pages/ConcreteTestLogDetails";
import QCReviewDashboard from "./pages/QCReviewDashboard";
import Reports from "./pages/Reports";
import DailyLogReview from "./pages/DailyLogReview";

function App() {

  const {
    session,
    role,
    loading
  } = useAuth();

  if (loading) {

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

  function RoleHome() {
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

  const MANAGER_ROLES = ["project_manager", "manager", "qc_manager", "admin"];
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
