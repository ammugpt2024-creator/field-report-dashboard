import { useEffect, useState } from "react";

import { useParams } from "react-router-dom";

import { supabase } from "../services/supabase";

function ProjectDetails() {

  const { id } = useParams();

  const [project, setProject] = useState(null);

  useEffect(() => {
    fetchProject();
  }, []);

  async function fetchProject() {

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.log(error);
    } else {
      setProject(data);
    }
  }

  if (!project) {
    return (
      <div className="dashboard-content">
        Loading...
      </div>
    );
  }

  return (

    <div className="dashboard-content">

      <h1>
        {project.project_name}
      </h1>

      <p className="dashboard-subtitle">
        {project.project_number}
      </p>

      <div className="card-grid">

        <div className="project-card">

          <h2>
            Field Reports
          </h2>

          <p>
            Daily field inspections,
            QA/QC observations,
            site activities,
            safety notes,
            manpower logs.
          </p>

          <button className="open-btn">
            Open Field Reports
          </button>

        </div>

        <div className="project-card">

          <h2>
            Lab Reports
          </h2>

          <p>
            Concrete testing,
            cylinder breaks,
            soil compaction,
            asphalt testing,
            density reports.
          </p>

          <button className="open-btn">
            Open Lab Reports
          </button>

        </div>

      </div>

    </div>

  );
}

export default ProjectDetails;

export default ProjectDetails;