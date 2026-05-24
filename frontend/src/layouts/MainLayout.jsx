import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

function MainLayout({ children }) {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100">
      <Navbar />
      <div className="flex w-full max-w-full overflow-x-hidden">
        <Sidebar />
        <main className="min-h-[calc(100vh-73px)] min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-0">
          {children}
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
