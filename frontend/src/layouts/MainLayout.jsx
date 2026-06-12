import { useEffect } from "react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { validateRequiredStorageBuckets } from "../services/storageDiagnosticsService";

function MainLayout({ children }) {
  useEffect(() => {
    validateRequiredStorageBuckets();
  }, []);

  return (
    <div className="flex min-h-screen w-full max-w-full flex-col overflow-x-hidden bg-slate-100">
      <Navbar />
      <div className="flex w-full max-w-full flex-1 overflow-x-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-0">
          {children}
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
