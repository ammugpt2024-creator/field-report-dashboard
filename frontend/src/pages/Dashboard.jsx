import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  FolderKanban,
  FileText,
  FlaskConical,
  AlertTriangle
} from "lucide-react";

import ReportsTable from "../components/ReportsTable";
import PieChartCard from "../components/PieChartCard";
import ActivityChart from "../components/ActivityChart";
import StatCard from "../components/StatCard";

import { supabase } from "../services/supabase";

function Dashboard() {

  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // COUNTS

  const [fieldReportsCount, setFieldReportsCount] = useState(0);
  const [labReportsCount, setLabReportsCount] = useState(0);
  const [openIssuesCount, setOpenIssuesCount] = useState(0);

  useEffect(() => {

    fetchDashboardData();

  }, []);

  async function fetchDashboardData() {

    try {

      setLoading(true);

      // FETCH PROJECTS

      const {
        data: projectsData,
        error: projectsError
      } = await supabase
        .from("projects")
        .select("*");

      if (projectsError) {

        console.log(
          "Error fetching projects:",
          projectsError
        );

      } else {

        setProjects(projectsData || []);
      }

      // FETCH FIELD REPORTS

      const {
        data: fieldReports,
        error: fieldError
      } = await supabase
        .from("reports")
        .select("*")
        .eq("type", "field");

      if (fieldError) {

        console.log(
          "Error fetching field reports:",
          fieldError
        );

      } else {

        setFieldReportsCount(
          fieldReports?.length || 0
        );
      }

      // FETCH LAB REPORTS

      const {
        data: labReports,
        error: labError
      } = await supabase
        .from("reports")
        .select("*")
        .eq("type", "lab");

      if (labError) {

        console.log(
          "Error fetching lab reports:",
          labError
        );

      } else {

        setLabReportsCount(
          labReports?.length || 0
        );
      }

      // FETCH OPEN ISSUES

      const {
        data: issues,
        error: issuesError
      } = await supabase
        .from("issues")
        .select("*")
        .eq("status", "open");

      if (issuesError) {

        console.log(
          "Error fetching issues:",
          issuesError
        );

      } else {

        setOpenIssuesCount(
          issues?.length || 0
        );
      }

    } catch (err) {

      console.log(
        "Unexpected error:",
        err
      );

    } finally {

      setLoading(false);
    }
  }

  // SEARCH FILTER

  const filteredProjects = projects.filter(
    (project) =>
      project?.name
        ?.toLowerCase()
        .includes(search.toLowerCase())
  );

  return (

    <div className="dashboard-content">

      {/* HEADER */}

      <div className="dashboard-header">

        <div className="dashboard-header-left">

          <h1>
            Field Report Dashboard
          </h1>

          <p className="dashboard-subtitle">
            Manage field reports,
            lab reports,
            and inspection files
          </p>

        </div>

        {/* SEARCH */}

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

      {/* LOADING */}

      {loading ? (

        <div className="empty-message">
          Loading dashboard...
        </div>

      ) : (

        <>

          {/* KPI CARDS */}

          <div className="stats-grid">

            <StatCard
              title="Active Projects"
              value={projects.length}
              color="blue"
              icon={
                <FolderKanban size={24} />
              }
            />

            <StatCard
              title="Field Reports"
              value={fieldReportsCount}
              color="green"
              icon={
                <FileText size={24} />
              }
            />

            <StatCard
              title="Lab Reports"
              value={labReportsCount}
              color="purple"
              icon={
                <FlaskConical size={24} />
              }
            />

            <StatCard
              title="Open Issues"
              value={openIssuesCount}
              color="orange"
              icon={
                <AlertTriangle size={24} />
              }
            />

          </div>

          {/* PROJECT GRID */}

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

                </div>

                <h2>
                  {project.name}
                </h2>

                <p>
                  {project.description}
                </p>

                <button
                  className="open-btn"
                  onClick={() =>
                    navigate(
                      `/reports/${project.id}`
                    )
                  }
                >
                  Open Project
                </button>

              </div>

            ))}

          </div>

          {/* EMPTY STATE */}

          {filteredProjects.length === 0 && (

            <div className="empty-message">
              No projects found
            </div>

          )}

          {/* CHARTS */}

          <div className="charts-grid">

            <PieChartCard />

            <ActivityChart />

          </div>

          {/* REPORT TABLE */}

          <ReportsTable />

        </>

      )}

    </div>
  );
}

export default Dashboard;