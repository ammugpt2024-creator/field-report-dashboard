import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, MessageSquareWarning } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import SignatureModal from "../components/SignatureModal";
import DailyLogSummaryView from "../components/daily-log/DailyLogSummaryView";
import {
  approveDailyLog,
  fetchDailyLogFromSupabase,
  formatLogStatus,
  getDailyLogById,
  requestDailyLogRevision,
  updateDailyLogPdfMetadataInSupabase,
  updateDailyLogReviewInSupabase
} from "../services/dailyLogService";
import { createDailyLogPdfSignedUrl, openDailyLogPdf, regenerateDailyLogPdf } from "../services/dailyLogPdfService";
import { logAuditEvent } from "../services/auditLogService";
import { sendDailyLogApprovalEmail } from "../services/notificationService";

function Section({ kicker, title, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">{kicker}</p>
      <h2 className="mt-2 text-xl font-bold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function DailyLogReview() {
  const { logId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [log, setLog] = useState(() => getDailyLogById(logId));
  const [loadingLog, setLoadingLog] = useState(() => !getDailyLogById(logId));
  const [savingDecision, setSavingDecision] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [qcSignatureDraft, setQcSignatureDraft] = useState("");
  const [revisionComment, setRevisionComment] = useState("");
  const reviewerName = profile?.full_name || "Manager";

  useEffect(() => {
    let active = true;
    // The reviewer's device usually has no local copy of the technician's
    // log — load it from the database instead.
    if (log) return undefined;
    fetchDailyLogFromSupabase(logId)
      .then((remoteLog) => {
        if (!active) return;
        if (remoteLog) setLog(remoteLog);
        setLoadingLog(false);
      })
      .catch((error) => {
        console.error("Daily log review load failed", error);
        if (active) setLoadingLog(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logId]);

  async function persistDecision(nextLog) {
    setLog(nextLog);
    setSavingDecision(true);
    try {
      await updateDailyLogReviewInSupabase(nextLog);
      logAuditEvent({
        action: "report_returned",
        entityType: "daily_report",
        entityId: nextLog.id,
        newValue: { status: nextLog.status }
      });
      navigate("/manager/dashboard");
    } catch (error) {
      window.alert(error.message || "The review decision could not be saved to the server. Please try again.");
    } finally {
      setSavingDecision(false);
    }
  }

  function approveLog() {
    if (!log || savingDecision) return;
    setSignatureModalOpen(true);
  }

  async function approveWithSignature(signature) {
    if (!log || savingDecision) return false;
    setSavingDecision(true);
    try {
      const approved = approveDailyLog(log, reviewerName, signature);
      setLog(approved);
      await updateDailyLogReviewInSupabase(approved);
      logAuditEvent({
        action: "report_approved",
        entityType: "daily_report",
        entityId: approved.id,
        newValue: { status: approved.status, approvedBy: reviewerName }
      });

      // Regenerate the PDF so it carries the QC reviewer signature and the
      // approval date, replacing the stored copy at the same path.
      let approvedPdfLog = approved;
      try {
        const withPdf = await regenerateDailyLogPdf(approved);
        approvedPdfLog = withPdf;
        setLog(withPdf);
        await updateDailyLogPdfMetadataInSupabase(approved, withPdf);
      } catch (pdfError) {
        console.error("Approved PDF regeneration failed", pdfError);
        window.alert("The log was approved, but the PDF could not be refreshed with the reviewer signature. Use Regenerate PDF to retry.");
      }

      // Notify the technician who submitted the log, attaching the
      // countersigned PDF.
      try {
        let pdfBlob = null;
        let pdfUrl = "";
        const storagePath = approvedPdfLog.pdfStoragePath || approvedPdfLog.pdf_storage_path;
        const cachedDataUrl = approvedPdfLog.pdfDataUrl || approvedPdfLog.pdf_data_url;
        if (storagePath) {
          pdfUrl = await createDailyLogPdfSignedUrl(storagePath);
          pdfBlob = await fetch(pdfUrl).then((response) => (response.ok ? response.blob() : null)).catch(() => null);
        } else if (cachedDataUrl) {
          pdfBlob = await fetch(cachedDataUrl).then((response) => response.blob()).catch(() => null);
        }
        const technicianUserId = approvedPdfLog.technicianUserId ||
          approvedPdfLog.submittedBy || approvedPdfLog.submitted_by ||
          approvedPdfLog.userId || approvedPdfLog.user_id ||
          approvedPdfLog.technicianId || approvedPdfLog.technician_id || "";
        await sendDailyLogApprovalEmail(approvedPdfLog, {
          reviewerName,
          recipientUserId: technicianUserId,
          pdfBlob,
          pdfUrl
        });
      } catch (emailError) {
        console.warn("Technician approval notification could not be sent", emailError);
      }

      setSignatureModalOpen(false);
      navigate("/manager/dashboard");
      return true;
    } catch (error) {
      window.alert(error.message || "The review decision could not be saved to the server. Please try again.");
      return false;
    } finally {
      setSavingDecision(false);
    }
  }

  function requestRevision() {
    if (!log || savingDecision) return;
    persistDecision(requestDailyLogRevision(log, revisionComment, reviewerName));
    setRevisionComment("");
  }

  if (loadingLog) {
    return (
      <div className="bg-slate-100 p-6">
        <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-950">Loading Daily Log...</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">Fetching the submitted log from the server.</p>
        </section>
      </div>
    );
  }

  if (!log) {
    return (
      <div className="bg-slate-100 p-6">
        <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-950">Daily Log not found</h1>
          <button type="button" onClick={() => navigate("/manager/dashboard")} className="mt-4 min-h-11 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white">Back to Manager Dashboard</button>
        </section>
      </div>
    );
  }

  const normalizedStatus = String(log.status || "").toLowerCase();
  const isPendingDecision = ["submitted", "pending_manager_review"].includes(normalizedStatus);

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 px-4 py-5 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1400px] space-y-5">
        <section className="overflow-hidden rounded-3xl border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-5 text-white shadow-sm sm:p-7">
          <button type="button" onClick={() => navigate(-1)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-bold text-white">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.28em] text-slate-300">Manager Review</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Daily Field Log Review</h1>
          <p className="mt-2 text-sm font-semibold text-slate-300">{log.projectName} - {log.date} - {formatLogStatus(log.status)}</p>
        </section>

        {/* Render the exact same view the technician sees on the submitted
            report page — PDF actions, activities, reports, and rendered
            attachments — with the approval decision below it. */}
        <DailyLogSummaryView
          log={log}
          onViewPdf={() => openDailyLogPdf(log).catch((error) => window.alert(error.message || "Unable to open the PDF right now."))}
          onDownloadPdf={() => openDailyLogPdf(log, { download: true }).catch((error) => window.alert(error.message || "Unable to download the PDF right now."))}
          onRegeneratePdf={async (logToRegenerate) => {
            const withPdf = await regenerateDailyLogPdf(logToRegenerate);
            setLog(withPdf);
            try {
              await updateDailyLogPdfMetadataInSupabase(logToRegenerate, withPdf);
            } catch (error) {
              console.warn("Daily log PDF metadata update failed", error);
            }
            return withPdf;
          }}
        />

        {isPendingDecision ? (
          <Section kicker="Manager Actions" title="Approval Decision">
            <textarea
              value={revisionComment}
              onChange={(event) => setRevisionComment(event.target.value)}
              rows={4}
              placeholder="Add manager comments or revision instructions."
              className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
            />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={approveLog}
                disabled={savingDecision}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
              >
                <CheckCircle2 className="h-4 w-4" />
                {savingDecision ? "Saving..." : "Approve Daily Log"}
              </button>
              <button
                type="button"
                onClick={requestRevision}
                disabled={savingDecision}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <MessageSquareWarning className="h-4 w-4" />
                Request Revision
              </button>
            </div>
          </Section>
        ) : (
          <Section kicker="Manager Actions" title="Review Complete">
            <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              This daily log is <span className="font-bold">{formatLogStatus(log.status)}</span>
              {log.approvedBy || log.approved_by ? ` by ${log.approvedBy || log.approved_by}` : ""}
              {log.approvedAt || log.approved_at ? ` on ${new Date(log.approvedAt || log.approved_at).toLocaleString()}` : ""}.
              No further action is required.
            </p>
          </Section>
        )}
      </div>
      <SignatureModal
        open={signatureModalOpen}
        title="QC Reviewer Signature"
        description="Sign once to approve this Daily Field Log. Your signature and the approval date are added to the final PDF."
        value={qcSignatureDraft}
        onSave={setQcSignatureDraft}
        onClear={() => setQcSignatureDraft("")}
        disabled={savingDecision}
        onClose={() => {
          if (!savingDecision) setSignatureModalOpen(false);
        }}
        onConfirm={async (confirmedSignature) => {
          const signatureToUse = confirmedSignature || qcSignatureDraft;
          if (!signatureToUse) {
            window.alert("Please sign before approving the Daily Log.");
            return false;
          }
          setQcSignatureDraft(signatureToUse);
          return approveWithSignature(signatureToUse);
        }}
        autoConfirmOnSave
        signatureActionLabel={savingDecision ? "Approving..." : "Sign & Approve Daily Log"}
      />
    </div>
  );
}
