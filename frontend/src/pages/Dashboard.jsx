import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  FolderKanban,
  AlertTriangle,
  Plus,
  X
} from "lucide-react";

import StatCard from "../components/StatCard";
import { supabase } from "../services/supabase";

function Dashboard() {

  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    project_number: "",
    project_name: "",
    client_name: "",
    client_representative: "",
    project_location: "",
    status: "Active"
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      console.log(error);
    } else {
      setProjects(data || []);
    }
  }

  async function createProject() {

    const { error } = await supabase
      .from("projects")
      .insert([formData]);

    if (error) {

      alert(error.message);

    } else {

      setShowModal(false);

      setFormData({
        project_number: "",
        project_name: "",
        client_name: "",
        client_representative: "",
        project_location: "",
        status: "Active"
      });

      fetchProjects();
    }
  }

  const filteredProjects = projects.filter(
    (project) =>
      project.project_name
        ?.toLowerCase()
        .includes(search.toLowerCase())
  );

  return (

    <div className="dashboard-content">

      <div className="dashboard-header">

        <div>

          <h1>
            Projects
          </h1>

          <p className="dashboard-subtitle">
            Manage all QA/QC projects in one place
          </p>

        </div>

        <div className="dashboard-actions">

          <button
            className="create-project-btn"
            onClick={() => setShowModal(true)}
          >
            <Plus size={18} />
            Create Project
          </button>

          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="search-box"
          />

        </div>

      </div>

      <div className="stats-grid">

        <StatCard
          title="Total Projects"
          value={projects.length}
          color="blue"
          icon={<FolderKanban size={24} />}
        />

        <StatCard
          title="Active Projects"
          value={
            projects.filter(
              (project) =>
                project.status === "Active"
            ).length
          }
          color="green"
          icon={<FolderKanban size={24} />}
        />

        <StatCard
          title="Pending Review"
          value={
            projects.filter(
              (project) =>
                project.status === "Pending"
            ).length
          }
          color="orange"
          icon={<AlertTriangle size={24} />}
        />

        <StatCard
          title="Delayed Projects"
          value={
            projects.filter(
              (project) =>
                project.status === "Delayed"
            ).length
          }
          color="red"
          icon={<AlertTriangle size={24} />}
        />

      </div>

      <div className="card-grid">

        {filteredProjects.map((project) => (

          <div
            key={project.id}
            className="project-card"
          >

            <div className="project-top">

              <div className="project-icon">
                📁
              </div>

              <span className="status-badge">
                {project.status}
              </span>

            </div>

            <h2>
              {project.project_name}
            </h2>

            <p className="project-number">
              {project.project_number}
            </p>

            <p>
              <strong>Client:</strong>
              {" "}
              {project.client_name}
            </p>

            <p>
              <strong>Representative:</strong>
              {" "}
              {project.client_representative}
            </p>

            <p>
              <strong>Location:</strong>
              {" "}
              {project.project_location}
            </p>

            <button
              className="open-btn"
              onClick={() =>
                navigate(`/project/${project.id}`)
              }
            >
              Open Project
            </button>

          </div>

        ))}

      </div>

      {filteredProjects.length === 0 && (

        <div className="empty-message">
          No projects found
        </div>

      )}

      {/* MODAL */}

      {showModal && (

        <div className="modal-overlay">

          <div className="modal">

            <div className="modal-header">

              <h2>
                Create Project
              </h2>

              <button
                className="close-btn"
                onClick={() =>
                  setShowModal(false)
                }
              >
                <X size={20} />
              </button>

            </div>

            <input
              type="text"
              placeholder="Project Number"
              className="modal-input"
              value={formData.project_number}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  project_number: e.target.value
                })
              }
            />

            <input
              type="text"
              placeholder="Project Name"
              className="modal-input"
              value={formData.project_name}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  project_name: e.target.value
                })
              }
            />

            <input
              type="text"
              placeholder="Client Name"
              className="modal-input"
              value={formData.client_name}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  client_name: e.target.value
                })
              }
            />

            <input
              type="text"
              placeholder="Client Representative"
              className="modal-input"
              value={formData.client_representative}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  client_representative: e.target.value
                })
              }
            />

            <input
              type="text"
              placeholder="Project Location"
              className="modal-input"
              value={formData.project_location}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  project_location: e.target.value
                })
              }
            />

            <select
              className="modal-input"
              value={formData.status}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  status: e.target.value
                })
              }
            >

              <option>
                Active
              </option>

              <option>
                Pending
              </option>

              <option>
                Delayed
              </option>

            </select>

            <button
              className="save-btn"
              onClick={createProject}
            >
              Save Project
            </button>

          </div>

        </div>

      )}

    </div>
  );
}

export default Dashboard;