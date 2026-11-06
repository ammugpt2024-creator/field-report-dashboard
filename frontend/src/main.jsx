import ReactDOM from "react-dom/client";

import { BrowserRouter } from "react-router-dom";

import App from "./App";

import { AuthProvider } from "./context/AuthContext";
import { installGlobalErrorReporting } from "./services/errorReportingService";

import "./index.css";
import "./App.css";

// Crashes and unhandled promise failures are recorded where an admin can see
// them, instead of only in the console of whoever hit them.
installGlobalErrorReporting();

ReactDOM.createRoot(
  document.getElementById("root")
).render(

  <BrowserRouter>

    <AuthProvider>

      <App />

    </AuthProvider>

  </BrowserRouter>

);