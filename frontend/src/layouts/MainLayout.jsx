import Navbar from "../components/Navbar";

function MainLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <Navbar />
      <main className="min-h-[calc(100vh-64px)] overflow-x-hidden overflow-y-auto p-0">
        {children}
      </main>
    </div>
  );
}

export default MainLayout;
