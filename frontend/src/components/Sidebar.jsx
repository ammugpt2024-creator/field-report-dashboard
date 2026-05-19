import { Link } from "react-router-dom";

function Sidebar() {
  return (
    <div className="w-64 bg-gray-900 text-white p-6">

      <h1 className="text-2xl font-bold mb-10">
        Dashboard
      </h1>

      <nav className="flex flex-col gap-4">

        <Link
          to="/"
          className="hover:bg-gray-700 p-3 rounded"
        >
          Home
        </Link>

        <Link
          to="/reports/1"
          className="hover:bg-gray-700 p-3 rounded"
        >
          Reports
        </Link>

        <Link
          to="/lab-reports/1"
          className="hover:bg-gray-700 p-3 rounded"
        >
          Lab Reports
        </Link>

      </nav>

    </div>
  );
}

export default Sidebar;