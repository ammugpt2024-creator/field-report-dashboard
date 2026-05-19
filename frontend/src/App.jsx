import { Routes, Route } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import LabReports from "./pages/LabReports";
import Login from "./pages/Login";

import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";

import "./App.css";

function App() {
  return (
    <div className="app-container">

      <Sidebar />

      <div className="main-content">

        <Navbar />

        <Routes>

          <Route
            path="/"
            element={<Dashboard />}
          />

          <Route
            path="/reports/:projectId"
            element={<Reports />}
          />

          <Route
            path="/lab-reports/:projectId"
            element={<LabReports />}
          />

          <Route
            path="/login"
            element={<Login />}
          />

        </Routes>

      </div>

    </div>
  );
}

export default App;