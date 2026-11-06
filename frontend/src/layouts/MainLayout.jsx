import { useEffect } from "react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { validateRequiredStorageBuckets } from "../services/storageDiagnosticsService";
import { useAuth } from "../context/AuthContext";
import { useIdleSignOut } from "../hooks/useIdleSignOut";

// Warns before an idle session ends, so nobody loses a half-written report to
// a silent timeout.
function IdleWarning({ secondsLeft, onStay }) {
  if (secondsLeft === null) return null;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div
        role="alertdialog"
        aria-live="assertive"
        className="flex w-full max-w-md flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg"
      >
        <p className="min-w-0 flex-1 text-sm font-semibold text-amber-900">
          You will be signed out in {minutes}:{seconds} because this device has been idle.
        </p>
        <button
          type="button"
          onClick={onStay}
          className="min-h-11 shrink-0 rounded-xl bg-amber-900 px-4 text-sm font-bold text-white hover:bg-amber-950"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}

function MainLayout({ children }) {
  const { session } = useAuth();
  const { secondsLeft, staySignedIn } = useIdleSignOut({ enabled: Boolean(session) });

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
      <IdleWarning secondsLeft={secondsLeft} onStay={staySignedIn} />
    </div>
  );
}

export default MainLayout;
