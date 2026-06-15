import { useEffect } from "react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { validateRequiredStorageBuckets } from "../services/storageDiagnosticsService";

function MainLayout({ children }) {
  useEffect(() => {
    validateRequiredStorageBuckets();
  }, []);

  return (
    <div className="flex h-screen w-full flex-col bg-slate-100" style={{ overflowX: "clip" }}>
      <Navbar />
      <div className="flex min-h-0 flex-1" style={{ overflowX: "clip" }}>
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto p-0">
          {children}
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
