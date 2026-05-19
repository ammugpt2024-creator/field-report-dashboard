import { Link } from "react-router-dom";

function Sidebar() {
  return (
    <div className="sidebar">

      <h1>Dashboard</h1>

      <nav>

        <Link to="/">
          Home
        </Link>

        <Link to="/reports/1">
          Reports
        </Link>

        <Link to="/lab-reports/1">
          Lab Reports
        </Link>

      </nav>

    </div>
  );
}

export default Sidebar;