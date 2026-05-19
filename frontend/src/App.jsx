import { Routes, Route } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import LabReports from "./pages/LabReports";
import Login from "./pages/Login";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/reports/:projectId" element={<Reports />} />
      <Route path="/lab-reports/:projectId" element={<LabReports />} />
      <Route path="/login" element={<Login />} />
    </Routes>
  );
}

export default App;