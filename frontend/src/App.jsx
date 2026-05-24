import {
  Routes,
  Route,
  Navigate
} from "react-router-dom";

import { useAuth } from "./context/AuthContext";

import MainLayout from "./layouts/MainLayout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ProjectWorkspace from "./pages/ProjectWorkspace";
import FieldReports from "./pages/FieldReports";
import LabReports from "./pages/LabReports";
import ConcreteTestLog from "./pages/ConcreteTestLog";
import ConcreteTestLogDetails from "./pages/ConcreteTestLogDetails";
import QCReviewDashboard from "./pages/QCReviewDashboard";
import Reports from "./pages/Reports";

function App() {

  const {
    session,
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

  return (

    <MainLayout>

      <Routes>

        <Route
          path="/"
          element={<Dashboard />}
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
