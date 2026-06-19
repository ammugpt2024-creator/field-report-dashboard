import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../services/supabase";
import { useAuth } from "../context/AuthContext";
import FieldEngineerWorkspace from "../modules/field-engineer/FieldEngineerWorkspace";
import {
  enrichFieldReports,
  getCurrentProjectLabel,
  getDefaultProjectId
} from "../modules/field-engineer/fieldEngineerData";

function TechnicianDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logId, activityId, reportId } = useParams();
  const { session, profile, companyName } = useAuth();
  const [reports, setReports] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProjects() {
      const { data, error: projectsError } = await supabase
        .from("projects")
        .select("*")
        .order("project_name", { ascending: true });
      if (projectsError) {
        console.warn("Unable to load projects for assignment list.", projectsError);
        return;
      }
      setProjects(data || []);
    }
    loadProjects();
  }, []);

  useEffect(() => {
    async function loadReports() {
      setLoading(true);
      setError("");
      try {
        const { data, error: fetchError } = await supabase
          .from("concrete_test_logs")
          .select("*")
          .order("updated_at", { ascending: false });

        if (fetchError) throw fetchError;

        const userId = session?.user?.id;
        const userName = profile?.full_name;
        const visibleReports = (data || []).filter((report) => {
          if (!userId && !userName) return true;
          return (
            report.submitted_by === userId ||
            report.created_by === userId ||
            report.submitted_by_name === userName ||
            report.technician_name === userName ||
            report.data_logger === userName
          );
        });

        setReports(visibleReports);
      } catch (err) {
        console.error("Field engineer workspace failed", err);
        setError(err.message || "Unable to load field engineer workspace.");
      } finally {
        setLoading(false);
      }
    }

    loadReports();
  }, [profile?.full_name, session?.user?.id]);

  const enrichedReports = useMemo(() => enrichFieldReports(reports), [reports]);
  // The default project is the technician's assigned one: prefer a project they
  // have reports on, else the first active project they can see (RLS already
  // scopes this to their assignments). Never a hardcoded fallback.
  const firstActiveProject = useMemo(
    () => projects.find((p) => String(p.status || "Active").toLowerCase() === "active") || projects[0] || null,
    [projects]
  );
  const defaultProjectId = getDefaultProjectId(enrichedReports) || firstActiveProject?.id || null;
  const projectLabel = getCurrentProjectLabel(enrichedReports)
    || firstActiveProject?.project_name || firstActiveProject?.name || "";
  const assignedProjects = useMemo(() => {
    const map = new Map();
    // Active projects from the projects table are the source of truth.
    projects
      .filter((project) => String(project.status || "Active").toLowerCase() === "active")
      .forEach((project) => {
        map.set(String(project.id), {
          id: project.id,
          name: project.project_name || project.name || `Project ${project.id}`,
          number: project.project_number || String(project.id),
          location: project.project_location || project.location || "",
          overtimeExempt: Boolean(project.overtime_exempt)
        });
      });
    // Keep any project the technician has reported on, even if no longer active.
    enrichedReports.forEach((report) => {
      const id = report.project_id || defaultProjectId;
      const name = report.project_name || report.projectLabel || projectLabel;
      if (!id || !name || map.has(String(id))) return;
      map.set(String(id), {
        id,
        name,
        number: report.project_number || String(id),
        location: report.project_location || report.location || ""
      });
    });
    if (!map.size && defaultProjectId && projectLabel) {
      map.set(String(defaultProjectId), {
        id: defaultProjectId,
        name: projectLabel,
        number: String(defaultProjectId),
        location: ""
      });
    }
    return Array.from(map.values());
  }, [defaultProjectId, enrichedReports, projectLabel, projects]);
  const routeView = location.pathname === "/technician/activity-history"
    ? "activity-history"
    : location.pathname.includes("/asphalt-report/")
      ? "asphalt-report"
    : location.pathname.includes("/compaction-report/")
      ? "compaction-report"
    : location.pathname.includes("/infiltration-report/")
      ? "infiltration-report"
    : location.pathname.includes("/proctor-report/")
      ? "proctor-report"
    : location.pathname.includes("/samples-report/")
      ? "samples-report"
    : location.pathname.includes("/concrete-report/")
      ? "concrete-report"
      : null;
  const view = routeView || (logId ? "create-daily-log" : new URLSearchParams(location.search).get("view") || "command-center");

  return (
    <FieldEngineerWorkspace
      view={view}
      profile={profile}
      defaultProjectId={defaultProjectId}
      projectLabel={projectLabel}
      assignedProjects={assignedProjects}
      companyName={companyName}
      userId={session?.user?.id}
      loading={loading}
      error={error}
      navigate={navigate}
      activeDailyLogId={logId}
      activeActivityId={activityId}
      activeReportId={reportId || new URLSearchParams(location.search).get("reportId") || ""}
    />
  );
}

export default TechnicianDashboard;
