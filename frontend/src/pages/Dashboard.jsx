import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";

function Dashboard() {

  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {

    setLoading(true);

    const { data, error } = await supabase
      .from("projects")
      .select("*");

    if (error) {

      console.log("Error fetching projects:", error);

    } else {

      setProjects(data || []);
    }

    setLoading(false);
  }

  // SEARCH FILTER

  const filteredProjects = projects.filter((project) =>
    project.name
      ?.toLowerCase()
      .includes(search.toLowerCase())
  );

  return (

    <div className="dashboard-content">

      {/* HEADER */}

      <div className="dashboard-header">

        <div>

          <h1>
            Field Report Dashboard
          </h1>

          <p className="dashboard-subtitle">
            Manage field reports, lab reports, and inspection files
          </p>

        </div>

        {/* SEARCH */}

        <input
          type="text"
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-box"
        />

      </div>

      {/* LOADING */}

      {loading ? (

        <div className="empty-message">
          Loading projects...
        </div>

      ) : (

        <>
          
          {/* PROJECT GRID */}

          <div className="card-grid">

            {filteredProjects.map((project) => (

              <div
                key={project.id}
                onClick={() => navigate(`/reports/${project.id}`)}
                className="project-card"
              >

                <div className="project-top">

                  <div className="project-icon">
                    📁
                  </div>

                </div>

                <h2>
                  {project.name}
                </h2>

                <p>
                  {project.description}
                </p>

                <button className="open-btn">
                  Open Project
                </button>

              </div>

            ))}

          </div>

          {/* EMPTY MESSAGE */}

          {filteredProjects.length === 0 && (

            <div className="empty-message">
              No projects found
            </div>

          )}

        </>

      )}

    </div>
  );
}

export default Dashboard;