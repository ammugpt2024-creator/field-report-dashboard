import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import SignatureModal from '../components/SignatureModal';
import { generateConcreteTestLogPdf } from '../services/pdfGenerator';
import { uploadReportPdf, uploadSignature } from '../services/storageService';
import { setReportStatus } from '../services/reportService';
import { ChevronLeft, ExternalLink } from 'lucide-react';

const REPORT_STATUS = {
  SUBMITTED_FOR_REVIEW: 'SUBMITTED_FOR_REVIEW',
  UNDER_QA_REVIEW: 'UNDER_QA_REVIEW',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
  FINALIZED: 'FINALIZED'
};

const REPORT_STATUS_LABELS = {
  SUBMITTED_FOR_REVIEW: 'Submitted For QA Review',
  UNDER_QA_REVIEW: 'Under QA Review',
  REJECTED: 'Rejected',
  APPROVED: 'Approved',
  FINALIZED: 'Approved'
};

function normalizeReportStatus(value) {
  if (!value) return null;
  const normalized = String(value).toUpperCase().trim();
  if (Object.values(REPORT_STATUS).includes(normalized)) return normalized;
  if (normalized === 'PENDING_QC_APPROVAL' || normalized === 'SUBMITTED' || normalized === 'QC_REVIEW') return REPORT_STATUS.UNDER_QA_REVIEW;
  if (normalized === 'APPROVED' || normalized === 'QC_APPROVED' || normalized === 'FINALIZED') return REPORT_STATUS.APPROVED;
  if (normalized === 'REJECTED' || normalized === 'CHANGES_REQUESTED' || normalized === 'QC_REJECTED') return REPORT_STATUS.REJECTED;
  return null;
}

export default function ConcreteTestLogDetails() {
  const { projectId, reportId } = useParams();
  const navigate = useNavigate();

  const { role } = useAuth();
  const [report, setReport] = useState(null);
  const [specifications, setSpecifications] = useState(null);
  const [rows, setRows] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState('approve');
  const [approvalComment, setApprovalComment] = useState('');
  const [qcSignature, setQcSignature] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    async function fetchReport() {
      setLoading(true);
      setError('');
      try {
        const { data: reportData, error: reportError } = await supabase
          .from('concrete_test_logs')
          .select('*')
          .eq('id', reportId)
          .single();

        if (reportError || !reportData) {
          throw reportError || new Error('Report not found');
        }

        const { data: specificationsData, error: specificationsError } = await supabase
          .from('concrete_specifications')
          .select('*')
          .eq('log_id', reportId)
          .maybeSingle();

        if (specificationsError) {
          throw specificationsError;
        }

        const { data: rowsData, error: rowsError } = await supabase
          .from('concrete_delivery_testing_records')
          .select('*')
          .eq('log_id', reportId)
          .order('id', { ascending: true });

        if (rowsError) {
          throw rowsError;
        }

        const { data: attachmentsData, error: attachmentsError } = await supabase
          .from('concrete_attachments')
          .select('*')
          .eq('log_id', reportId)
          .order('id', { ascending: true });

        if (attachmentsError) {
          throw attachmentsError;
        }

        setReport(reportData);
        setSpecifications(specificationsData || null);
        setRows(rowsData || []);
        setAttachments(attachmentsData || []);
      } catch (err) {
        console.error('Fetch report details failed', err);
        setError(err?.message || 'Unable to load report details');
      } finally {
        setLoading(false);
      }
    }

    fetchReport();
  }, [reportId]);

  const reportStatus = normalizeReportStatus(report?.status);
  const reportPdfUrl = report?.final_pdf_url || report?.pdf_url;
  const canApprove = (role === 'qc_approver' || role === 'admin') && [
    REPORT_STATUS.SUBMITTED_FOR_REVIEW,
    REPORT_STATUS.UNDER_QA_REVIEW
  ].includes(reportStatus);

  function mapReportToForm(reportData) {
    return {
      projectName: reportData.project_name,
      projectNumber: reportData.project_number,
      dateSampled: reportData.date_sampled,
      weather: reportData.weather,
      minTemp: reportData.min_temp,
      maxTemp: reportData.max_temp,
      location: reportData.location,
      batchPlant: reportData.batch_plant,
      gc: reportData.gc,
      qcRep: reportData.qc_rep,
      dataLogger: reportData.data_logger,
      subContractor: reportData.sub_contractor,
      totalQuantityPlaced: reportData.total_quantity_placed,
      dfrNumber: reportData.dfr_number || specifications?.dfr_number,
      timeIn: reportData.time_in,
      timeOut: reportData.time_out,
      airContentSpec: specifications?.air_content || reportData.air_content_spec,
      unitWeightSpec: specifications?.unit_weight || reportData.unit_weight_spec,
      slumpSpec: specifications?.slump || reportData.slump_spec,
      jRingSpec: specifications?.j_ring || reportData.j_ring_spec,
      spreadSpec: specifications?.spread || reportData.spread_spec,
      strengthSpec: specifications?.speed_of_stress || reportData.strength_spec,
      mixNoSpec: specifications?.mix_no || reportData.mix_no_spec
    };
  }

  function mapRowsForPdf(savedRows) {
    return savedRows.map((row) => ({
      testNo: row.test_number,
      ticketNo: row.ticket_number,
      truckNo: row.truck_number,
      cubicYards: row.cubic_yards,
      totalPlaced: row.total_placed_qty,
      timeBatched: row.time_batched,
      arrivalTime: row.arrival_time,
      timeSampled: row.time_tested,
      startPlacement: row.placement,
      finishUnload: row.finish_unload,
      actualMinutes: row.actual_minutes,
      waterAdded: row.water_added_gal,
      airTemp: row.air_temp_f,
      concreteTemp: row.concrete_temp_f,
      slump: row.slump_in,
      airContent: row.air_content_percent,
      unitWeight: row.unit_weight_lbs_ft3,
      jRing: row.j_ring_in,
      spread: row.spread_in,
      setNo: row.set_number,
      labCylinders: row.lab_cylinders,
      fieldCylinders: row.field_cylinders,
      comments: row.comments,
      status: row.row_status || 'Open'
    }));
  }

  async function handleApproveDecision() {
    if (!report) return;
    if (!qcSignature) {
      alert('QC signature is required before approving or rejecting.');
      return;
    }

    setProcessing(true);
    try {
      const form = mapReportToForm(report);
      const pdfBlob = await generateConcreteTestLogPdf({
        form,
        rows: mapRowsForPdf(rows),
        signatures: {
          technician: report.technician_signature_url,
          qcApproval: qcSignature
        },
        attachments: attachments.reduce((acc, item) => {
          const rowId = item.row_id || 'report';
          if (!acc[rowId]) acc[rowId] = [];
          acc[rowId].push({ name: item.file_name, url: item.file_url });
          return acc;
        }, {})
      });

      const pdfUrl = await uploadReportPdf(projectId, report.id, pdfBlob);
      const status = approvalAction === 'approve' ? REPORT_STATUS.APPROVED : REPORT_STATUS.REJECTED;
      const options = {
        pdfUrl,
        finalPdfUrl: approvalAction === 'approve' ? pdfUrl : undefined,
        approvedAt: approvalAction === 'approve' ? new Date().toISOString() : null,
        approvedBy: approvalAction === 'approve' ? role : null,
        rejectedAt: approvalAction !== 'approve' ? new Date().toISOString() : null,
        rejectedBy: approvalAction !== 'approve' ? role : null,
        rejectionReason: approvalAction !== 'approve' ? approvalComment : null
      };

      await setReportStatus(report.id, status, options);
      await uploadSignature(projectId, report.id, qcSignature, 'qc');

      setReport((prev) => prev ? { ...prev, status, pdf_url: pdfUrl, final_pdf_url: pdfUrl } : prev);
      setApprovalModalOpen(false);
      alert(`Report ${approvalAction === 'approve' ? 'approved' : approvalAction === 'reject' ? 'rejected' : 'marked for changes'}.`);
    } catch (err) {
      console.error('Approval flow failed', err);
      alert('Unable to complete QC approval.');
    } finally {
      setProcessing(false);
    }
  }

  function openApprovalModal(action) {
    setApprovalAction(action);
    setApprovalModalOpen(true);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-700">
        Loading report details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-4xl rounded-3xl border border-red-200 bg-red-50 p-8 text-red-700">
          <h1 className="text-2xl font-semibold">Unable to load report</h1>
          <p className="mt-4 text-sm">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-6 rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl bg-slate-950 p-8 text-white shadow-lg">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <button
                onClick={() => navigate(`/project/${projectId}/field-reports`)}
                className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white"
              >
                <ChevronLeft className="w-5 h-5" /> Back to Field Reports
              </button>
              <h1 className="text-4xl font-semibold">Concrete Test Log Report</h1>
              <p className="mt-2 max-w-2xl text-slate-300">
                Review the submitted concrete test log, download the generated PDF, and inspect the saved delivery records.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {reportPdfUrl && (
                <a
                  href={reportPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Open PDF
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              {canApprove && (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => openApprovalModal('approve')}
                    disabled={processing}
                    className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => openApprovalModal('reject')}
                    disabled={processing}
                    className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-700"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => openApprovalModal('request_changes')}
                    disabled={processing}
                    className="rounded-2xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-700"
                  >
                    Request Changes
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {canApprove && (
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">QC Approval Notes</h2>
                <p className="text-sm text-slate-500">Add any feedback before the signature confirmation.</p>
              </div>
            </div>
            <textarea
              value={approvalComment}
              onChange={(event) => setApprovalComment(event.target.value)}
              placeholder="Describe the review findings, requested changes, or approval notes..."
              className="mt-4 min-h-[120px] w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900"
            />
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Report summary</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-700">
              <div>
                <dt className="font-semibold text-slate-900">DFR Number</dt>
                <dd>{report.dfr_number || specifications?.dfr_number || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Status</dt>
                <dd className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  reportStatus === REPORT_STATUS.APPROVED || reportStatus === REPORT_STATUS.FINALIZED
                    ? 'bg-emerald-100 text-emerald-800'
                    : reportStatus === REPORT_STATUS.SUBMITTED_FOR_REVIEW || reportStatus === REPORT_STATUS.UNDER_QA_REVIEW
                    ? 'bg-sky-100 text-sky-800'
                    : reportStatus === REPORT_STATUS.REJECTED
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {REPORT_STATUS_LABELS[reportStatus] || report.status || 'Draft'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Sample date</dt>
                <dd>{report.date_sampled || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Project</dt>
                <dd>{report.project_name || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Location</dt>
                <dd>{report.location || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Technician</dt>
                <dd>{report.data_logger || '—'}</dd>
              </div>
              {report.rejection_reason ? (
                <div className="border-l-4 border-rose-300 bg-rose-50 p-4">
                  <dt className="font-semibold text-rose-800">Rejection Notes</dt>
                  <dd className="mt-1 text-sm text-rose-700">{report.rejection_reason}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm xl:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900">Concrete specifications</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Air Content', specifications?.air_content ?? report.air_content_spec],
                ['Unit Weight', specifications?.unit_weight ?? report.unit_weight_spec],
                ['Slump', specifications?.slump ?? report.slump_spec],
                ['J-Ring', specifications?.j_ring ?? report.j_ring_spec],
                ['Spread', specifications?.spread ?? report.spread_spec],
                ['Strength', specifications?.speed_of_stress ?? report.strength_spec],
                ['Mix No.', specifications?.mix_no ?? report.mix_no_spec],
              ].map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-slate-200 p-4">
                  <p className="text-sm uppercase tracking-[0.12em] text-slate-500">{label}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{value || '—'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Delivery & testing records</h2>
              <p className="text-sm text-slate-500">Saved truck ticket rows and field test metrics.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-sm text-left">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-3">Test #</th>
                  <th className="px-3 py-3">Ticket #</th>
                  <th className="px-3 py-3">Truck #</th>
                  <th className="px-3 py-3">CY</th>
                  <th className="px-3 py-3">Slump</th>
                  <th className="px-3 py-3">Air %</th>
                  <th className="px-3 py-3">Temp</th>
                  <th className="px-3 py-3">Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3">{row.test_number || '—'}</td>
                      <td className="px-3 py-3">{row.ticket_number || '—'}</td>
                      <td className="px-3 py-3">{row.truck_number || '—'}</td>
                      <td className="px-3 py-3">{row.cubic_yards || '—'}</td>
                      <td className="px-3 py-3">{row.slump_in || '—'}</td>
                      <td className="px-3 py-3">{row.air_content_percent || '—'}</td>
                      <td className="px-3 py-3">{row.concrete_temp_f || '—'}</td>
                      <td className="px-3 py-3">{row.comments || '—'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-6 text-slate-500" colSpan={8}>
                      No row records saved for this log.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Uploaded attachments</h2>
          {attachments.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachment.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-3xl border border-slate-200 p-4 transition hover:border-slate-300 hover:shadow-sm"
                >
                  <p className="font-semibold text-slate-900 truncate">{attachment.file_name}</p>
                  <p className="text-sm text-slate-500 mt-1">{attachment.content_type}</p>
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-slate-500">No attachments uploaded for this report.</p>
          )}
        </div>
      </div>

      <SignatureModal
        open={approvalModalOpen}
        title={
          approvalAction === 'approve'
            ? 'QC Approval Signature'
            : approvalAction === 'reject'
            ? 'Reject Report'
            : 'Request Changes'
        }
        description={
          approvalAction === 'approve'
            ? 'Please sign to approve and finalize the report.'
            : approvalAction === 'reject'
            ? 'Sign to reject this report and notify the technician of the issue.'
            : 'Sign to request changes and return the report to the technician for revision.'
        }
        value={qcSignature}
        onSave={setQcSignature}
        onClear={() => setQcSignature('')}
        onClose={() => setApprovalModalOpen(false)}
        onConfirm={handleApproveDecision}
      />
    </div>
  );
}
