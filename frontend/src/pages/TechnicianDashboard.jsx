import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../services/supabase";
import { useAuth } from "../context/AuthContext";
import FieldEngineerWorkspace from "../modules/field-engineer/FieldEngineerWorkspace";
import {
  enrichFieldReports,
  getCurrentProjectLabel,
  getDefaultProjectId,
  getFieldEngineerCollections
} from "../modules/field-engineer/fieldEngineerData";
import { ACTION_IDS, REPORT_STATUS } from "../workflow/workflowEngine";

function TechnicianDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logId, activityId, reportId } = useParams();
  const { session, profile, role, companyName } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [discardingId, setDiscardingId] = useState(null);

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
  const collections = useMemo(() => getFieldEngineerCollections(enrichedReports), [enrichedReports]);
  const defaultProjectId = getDefaultProjectId(enrichedReports);
  const projectLabel = getCurrentProjectLabel(enrichedReports);
  const assignedProjects = useMemo(() => {
    const map = new Map();
    enrichedReports.forEach((report) => {
      const id = report.project_id || defaultProjectId;
      const name = report.project_name || report.projectLabel || projectLabel;
      if (!id || !name) return;
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
  }, [defaultProjectId, enrichedReports, projectLabel]);
  const routeView = location.pathname === "/technician/activity-history"
    ? "activity-history"
    : location.pathname.includes("/compaction-report/")
      ? "compaction-report"
    : location.pathname.includes("/concrete-report/")
      ? "concrete-report"
      : null;
  const view = routeView || (logId ? "create-daily-log" : new URLSearchParams(location.search).get("view") || "command-center");

  function getFieldEngineerActions(report) {
    if ([REPORT_STATUS.DRAFT, REPORT_STATUS.GENERATED].includes(report.normalizedStatus)) {
      return [ACTION_IDS.CONTINUE_DRAFT];
    }
    if ([REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.UNDER_REVIEW, REPORT_STATUS.RESUBMITTED].includes(report.normalizedStatus)) {
      return [ACTION_IDS.OPEN_REPORT, ACTION_IDS.TRACK_STATUS, ACTION_IDS.DOWNLOAD];
    }
    if ([REPORT_STATUS.REVISION_REQUIRED, REPORT_STATUS.REJECTED].includes(report.normalizedStatus)) {
      return [ACTION_IDS.REVISE_REPORT];
    }
    return [ACTION_IDS.OPEN_REPORT, ACTION_IDS.DOWNLOAD_FINAL];
  }

  function handleReportAction(actionId, report) {
    const projectId = report.project_id || defaultProjectId;
    const editRoute = `/project/${projectId}/field-reports/concrete-test-log/${report.id}/edit`;
    const viewRoute = `/project/${projectId}/field-reports/concrete-test-log/${report.id}`;

    if ([ACTION_IDS.CONTINUE_DRAFT, ACTION_IDS.REVISE_REPORT, ACTION_IDS.SUBMIT_TO_QC, ACTION_IDS.RESUBMIT_TO_QC].includes(actionId)) {
      navigate(editRoute);
      return;
    }

    navigate(viewRoute);
  }

  async function discardDraft(report) {
    if (![REPORT_STATUS.DRAFT, REPORT_STATUS.GENERATED].includes(report.normalizedStatus)) return;
    const confirmed = window.confirm("Discard this draft? This will delete the saved draft record from the workspace.");
    if (!confirmed) return;

    setDiscardingId(report.id);
    setError("");
    try {
      await supabase.from("concrete_attachments").delete().eq("log_id", report.id);
      await supabase.from("concrete_test_log_attachments").delete().eq("log_id", report.id);
      await supabase.from("concrete_delivery_testing_records").delete().eq("log_id", report.id);
      await supabase.from("concrete_test_log_rows").delete().eq("log_id", report.id);
      await supabase.from("concrete_specifications").delete().eq("log_id", report.id);
      const { error: deleteError } = await supabase
        .from("concrete_test_logs")
        .delete()
        .eq("id", report.id);

      if (deleteError) throw deleteError;
      setReports((currentReports) => currentReports.filter((item) => item.id !== report.id));
      window.sessionStorage.removeItem(`concrete-test-log:${report.project_id || defaultProjectId}`);
      window.sessionStorage.removeItem(`concrete-test-log-dfr:${report.project_id || defaultProjectId}`);
    } catch (err) {
      console.error("Discard draft failed", err);
      setError(err.message || "Unable to discard this draft.");
    } finally {
      setDiscardingId(null);
    }
  }

  return (
    <FieldEngineerWorkspace
      view={view}
      profile={profile}
      role={role}
      collections={collections}
      defaultProjectId={defaultProjectId}
      projectLabel={projectLabel}
      assignedProjects={assignedProjects}
      companyName={companyName}
      userId={session?.user?.id}
      loading={loading}
      error={error}
      discardingId={discardingId}
      navigate={navigate}
      activeDailyLogId={logId}
      activeActivityId={activityId}
      activeReportId={reportId || new URLSearchParams(location.search).get("reportId") || ""}
      getActions={getFieldEngineerActions}
      onAction={handleReportAction}
      onDiscardDraft={discardDraft}
    />
  );
}

export default TechnicianDashboard;
