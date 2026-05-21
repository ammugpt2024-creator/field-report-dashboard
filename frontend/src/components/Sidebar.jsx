import { Link } from "react-router-dom";

function Sidebar() {

  return (

    <div className="sidebar">

      <h1>
        QCore
      </h1>

      <div className="sidebar-nav">

        <Link to="/">
          Projects
        </Link>

      </div>

    </div>

  );
}

export default Sidebar;