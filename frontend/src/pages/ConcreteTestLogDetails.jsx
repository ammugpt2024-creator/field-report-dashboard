import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import SignatureModal from '../components/SignatureModal';
import PdfViewer from '../components/PdfViewer';
import StatusBadge from '../components/StatusBadge';
import ReportActions from '../components/ReportActions';
import { getSignatureStoragePath, uploadReportPdf, uploadSignature } from '../services/storageService';
import { setReportStatus } from '../services/reportService';
import { ChevronLeft, CircleAlert, ExternalLink, FolderKanban } from 'lucide-react';
import { canReviewReports } from '../utils/permissions';
import { addReviewHistory } from '../services/auditService';
import {
  buildApprovalEmail,
  buildRejectionEmail,
  queueAndSendNotification
} from '../services/notificationService';
import {
  REPORT_STATUS,
  normalizeReportStatus,
  ACTION_IDS
} from '../workflow/workflowEngine';
import { MODULE_NAMES, WORKFLOW_LABELS } from '../config/branding';

const REVIEWABLE_STATUSES = [
  REPORT_STATUS.SUBMITTED_FOR_QC,
  REPORT_STATUS.RESUBMITTED,
  REPORT_STATUS.UNDER_REVIEW
];

const REVIEW_COMMENT_ACTIONS = new Set([
  REPORT_STATUS.REVISION_REQUIRED,
  REPORT_STATUS.REJECTED,
  REPORT_STATUS.APPROVED
]);

const QC_MARKABLE_FIELDS = [
  { key: 'cubic_yards', label: 'CY', getValue: (row) => row.cubic_yards },
  { key: 'slump_in', label: 'Slump', getValue: (row) => row.slump_in },
  { key: 'air_content_percent', label: 'Air %', getValue: (row) => row.air_content_percent },
  { key: 'concrete_temp_f', label: 'Temp', getValue: (row) => row.concrete_temp_f },
  { key: 'comments', label: 'Comments', getValue: (row) => row.comments }
];

export default function ConcreteTestLogDetails() {
  const { projectId, reportId } = useParams();
  const navigate = useNavigate();

  const { role, session, profile } = useAuth();
  const [report, setReport] = useState(null);
  const [specifications, setSpecifications] = useState(null);
  const [rows, setRows] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [reviewHistory, setReviewHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState('approve');
  const [approvalComment, setApprovalComment] = useState('');
  const [qcSignature, setQcSignature] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [markedIssues, setMarkedIssues] = useState([]);
  const [approvedPdfRefreshStatus, setApprovedPdfRefreshStatus] = useState('');

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

        const { data: reviewHistoryData, error: reviewHistoryError } = await supabase
          .from('report_review_history')
          .select('*')
          .eq('report_id', reportId)
          .order('performed_at', { ascending: false });

        if (reviewHistoryError) {
          console.warn('Review history is not available yet.', reviewHistoryError);
        }

        setReport(reportData);
        setSpecifications(specificationsData || null);
        setRows(rowsData || []);
        setAttachments(attachmentsData || []);
        setReviewHistory(reviewHistoryData || []);
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
  const effectiveProjectId = projectId || report?.project_id;
  const reviewerName = profile?.full_name || profile?.email || session?.user?.email || role || WORKFLOW_LABELS.validationReviewer;
  const canApprove = canReviewReports(role) && REVIEWABLE_STATUSES.includes(reportStatus);
  const getIssueKey = (row, fieldKey) => `${row.id || row.test_number || 'row'}:${fieldKey}`;
  const isIssueMarked = (row, fieldKey) => markedIssues.some((issue) => issue.key === getIssueKey(row, fieldKey));
  const formatMarkedIssue = (issue) => `- Test #${issue.testNumber || 'N/A'} ${issue.label}: ${issue.value || '—'}`;
  const markedIssueRemarks = markedIssues.length > 0
    ? `Marked faulty values:\n${markedIssues.map(formatMarkedIssue).join('\n')}`
    : '';
  const visibleReviewComments = [
    ...(report?.rejection_reason
      ? [{
          id: 'current-rejection',
          action: REPORT_STATUS.REVISION_REQUIRED,
          remarks: report.rejection_reason,
          performed_by_name: report.reviewed_by_name || WORKFLOW_LABELS.validationReviewer,
          performed_at: report.rejected_at || report.reviewed_at || report.updated_at
        }]
      : []),
    ...reviewHistory.filter((item) => (
      REVIEW_COMMENT_ACTIONS.has(normalizeReportStatus(item.action)) &&
      String(item.remarks || '').trim()
    ))
  ].filter((comment, index, comments) => {
    const key = `${normalizeReportStatus(comment.action)}:${String(comment.remarks || '').trim()}`;
    return comments.findIndex((item) => (
      `${normalizeReportStatus(item.action)}:${String(item.remarks || '').trim()}` === key
    )) === index;
  });

  function toggleMarkedIssue(row, field) {
    if (!canApprove) return;
    const value = field.getValue(row);
    const key = getIssueKey(row, field.key);
    setMarkedIssues((currentIssues) => {
      if (currentIssues.some((issue) => issue.key === key)) {
        return currentIssues.filter((issue) => issue.key !== key);
      }

      return [
        ...currentIssues,
        {
          key,
          field: field.key,
          label: field.label,
          value: value == null || value === '' ? '—' : String(value),
          testNumber: row.test_number
        }
      ];
    });
  }

  function renderReviewValue(row, field) {
    const value = field.getValue(row);
    const displayValue = value == null || value === '' ? '—' : value;
    const marked = isIssueMarked(row, field.key);

    if (!canApprove) {
      return (
        <span className={marked ? 'inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 font-semibold text-rose-700' : ''}>
          {marked && <CircleAlert className="h-3.5 w-3.5" />}
          {displayValue}
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={() => toggleMarkedIssue(row, field)}
        title={marked ? 'Remove faulty value mark' : 'Mark this value as faulty'}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-left font-semibold transition sm:max-w-[180px] ${
          marked
            ? 'border-rose-200 bg-rose-50 text-rose-700 ring-2 ring-rose-100'
            : 'border-transparent text-slate-700 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800'
        }`}
      >
        {marked && <CircleAlert className="h-3.5 w-3.5 shrink-0" />}
        <span className={field.key === 'comments' ? 'truncate' : ''}>{displayValue}</span>
      </button>
    );
  }

  useEffect(() => {
    async function markUnderReview() {
      if (
        !report?.id ||
        !canReviewReports(role) ||
        ![REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.RESUBMITTED].includes(reportStatus)
      ) return;

      const reviewedAt = new Date().toISOString();
      const nextReport = await setReportStatus(report.id, REPORT_STATUS.UNDER_REVIEW, {
        reviewedAt,
        reviewedBy: session?.user?.id || null,
        reviewedByName: reviewerName,
        isLocked: true,
        userId: session?.user?.id,
        userRole: role,
        userName: reviewerName,
        comments: 'Record opened by validation reviewer.',
        metadata: { action: 'UNDER_REVIEW' }
      });

      await addReviewHistory({
        reportId: report.id,
        action: REPORT_STATUS.UNDER_REVIEW,
        remarks: 'Record opened by validation reviewer.',
        performedBy: session?.user?.id,
        performedByName: reviewerName,
        performedByRole: role
      });

      setReport((previous) => previous ? { ...previous, ...nextReport } : previous);
    }

    markUnderReview().catch((err) => {
      console.error('Unable to mark record under validation review', err);
    });
  }, [report?.id, reportStatus, role, session?.user?.id, reviewerName]);

  async function getStoredQcSignatureUrl() {
    if (report?.qc_signature_url) return report.qc_signature_url;
    if (!effectiveProjectId || !report?.id) return '';

    const path = report?.qc_signature_storage_path || getSignatureStoragePath(effectiveProjectId, report.id, 'qc');
    const { data: signedData, error: signedError } = await supabase.storage
      .from('signatures')
      .createSignedUrl(path, 60 * 60 * 24 * 30);
    if (!signedError && signedData?.signedUrl) return signedData.signedUrl;

    return supabase.storage.from('signatures').getPublicUrl(path).data?.publicUrl || '';
  }

  async function getStoredTechnicianSignatureUrl() {
    if (report?.technician_signature_url) return report.technician_signature_url;
    if (report?.technician_signature_storage_path) {
      const { data: signedData, error: signedError } = await supabase.storage
        .from('signatures')
        .createSignedUrl(report.technician_signature_storage_path, 60 * 60 * 24 * 30);
      if (!signedError && signedData?.signedUrl) return signedData.signedUrl;
      return supabase.storage.from('signatures').getPublicUrl(report.technician_signature_storage_path).data?.publicUrl || '';
    }
    return '';
  }

  async function getOriginalSubmittedPdfUrl() {
    if (report?.pdf_storage_path) {
      const { data: signedData, error: signedError } = await supabase.storage
        .from('report-pdfs')
        .createSignedUrl(report.pdf_storage_path, 60 * 60 * 24 * 30);
      if (!signedError && signedData?.signedUrl) return signedData.signedUrl;
      return supabase.storage.from('report-pdfs').getPublicUrl(report.pdf_storage_path).data?.publicUrl || '';
    }

    return report?.pdf_url || report?.final_pdf_url || '';
  }

  async function sourceToBytes(source) {
    if (!source) return null;
    if (String(source).startsWith('data:')) {
      const response = await fetch(source);
      return new Uint8Array(await response.arrayBuffer());
    }

    const response = await fetch(source);
    if (!response.ok) throw new Error(`Unable to load approval asset: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async function sourceToCleanSignatureBytes(source) {
    if (!source) return null;
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Unable to load approval asset: ${response.status}`);
    const blob = await response.blob();
    if (!blob.type?.startsWith('image/')) return new Uint8Array(await blob.arrayBuffer());

    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
    const cleanedDataUrl = await removeGeneratedSignatureCaption(dataUrl);
    const cleanedResponse = await fetch(cleanedDataUrl);
    return new Uint8Array(await cleanedResponse.arrayBuffer());
  }

  async function removeGeneratedSignatureCaption(dataUrl) {
    if (!dataUrl?.startsWith?.('data:image/')) return dataUrl || '';

    try {
      const image = await new Promise((resolve) => {
        const nextImage = new window.Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => resolve(null);
        nextImage.src = dataUrl;
      });
      if (!image?.width || !image?.height) return dataUrl;

      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);

      const sampleY = Math.floor(image.height * 0.69);
      const band = context.getImageData(0, Math.max(0, sampleY - 4), image.width, 9).data;
      let nonWhitePixels = 0;
      for (let index = 0; index < band.length; index += 4) {
        const red = band[index];
        const green = band[index + 1];
        const blue = band[index + 2];
        if (red < 252 || green < 252 || blue < 252) nonWhitePixels += 1;
      }

      if (nonWhitePixels <= image.width * 0.08) return dataUrl;

      const croppedHeight = Math.floor(image.height * 0.64);
      const cleanedCanvas = document.createElement('canvas');
      cleanedCanvas.width = image.width;
      cleanedCanvas.height = croppedHeight;
      const cleanedContext = cleanedCanvas.getContext('2d');
      cleanedContext.fillStyle = '#ffffff';
      cleanedContext.fillRect(0, 0, cleanedCanvas.width, cleanedCanvas.height);
      cleanedContext.drawImage(canvas, 0, 0, image.width, croppedHeight, 0, 0, image.width, croppedHeight);
      return cleanedCanvas.toDataURL('image/png');
    } catch {
      return dataUrl;
    }
  }

  function formatApprovalDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  }

  async function findSignaturePlacement(pdfBytes, fallbackPageIndex) {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfBytes),
        disableWorker: true
      });
      const pdf = await loadingTask.promise;

      for (let pageNumber = pdf.numPages; pageNumber >= 1; pageNumber -= 1) {
        const pdfPage = await pdf.getPage(pageNumber);
        const textContent = await pdfPage.getTextContent();
        const qaLabel = textContent.items.find((item) => {
          const label = String(item.str || '').toUpperCase();
          return label.includes('QUALITY REVIEWER SIGNATURE') || label.includes('QA REVIEWER SIGNATURE');
        });
        const dateLabel = textContent.items.find((item) => (
          String(item.str || '').toUpperCase().includes('DATE APPROVED')
        ));

        if (qaLabel && dateLabel) {
          return {
            pageIndex: pageNumber - 1
          };
        }
      }
    } catch (error) {
      console.warn('Unable to locate signature page; falling back to final page stamping.', error);
    }

    return { pageIndex: fallbackPageIndex };
  }

  async function findAttachmentOnlyPageIndexes(pdfBytes) {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfBytes),
        disableWorker: true
      });
      const pdf = await loadingTask.promise;
      const pageIndexes = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const pdfPage = await pdf.getPage(pageNumber);
        const textContent = await pdfPage.getTextContent();
        const pageText = textContent.items
          .map((item) => String(item.str || '').trim())
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toUpperCase();

        if (pageText === 'ATTACHMENTS') pageIndexes.push(pageNumber - 1);
      }

      return pageIndexes;
    } catch (error) {
      console.warn('Unable to inspect attachment pages for cleanup.', error);
      return [];
    }
  }

  async function stampApprovalOnSubmittedPdf(
    basePdfUrl,
    qcSignatureUrl,
    approvedAtOverride = report?.approved_at,
    statusLabel = 'APPROVED',
    reviewerNameOverride = reviewerName,
    technicianSignatureUrl = ''
  ) {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdfBytes = await sourceToBytes(basePdfUrl);
    const pdfDocument = await PDFDocument.load(pdfBytes);
    const attachmentOnlyPageIndexes = await findAttachmentOnlyPageIndexes(pdfBytes);
    attachmentOnlyPageIndexes
      .sort((a, b) => b - a)
      .forEach((pageIndex) => {
        if (pageIndex > 0 && pageIndex < pdfDocument.getPageCount() - 1) {
          pdfDocument.removePage(pageIndex);
        }
      });

    const cleanedPdfBytes = attachmentOnlyPageIndexes.length > 0 ? await pdfDocument.save() : pdfBytes;
    const signaturePlacement = await findSignaturePlacement(cleanedPdfBytes, pdfDocument.getPageCount() - 1);
    const pages = pdfDocument.getPages();
    const page = pages[signaturePlacement.pageIndex] || pages[pages.length - 1];
    const firstPage = pages[0];
    const { width, height } = page.getSize();
    const { width: firstPageWidth, height: firstPageHeight } = firstPage.getSize();
    const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDocument.embedFont(StandardFonts.HelveticaBold);
    let signatureBytes = null;
    if (qcSignatureUrl) {
      try {
        signatureBytes = await sourceToBytes(qcSignatureUrl);
      } catch (signatureError) {
        console.warn('Unable to load validation signature image for PDF stamp.', signatureError);
      }
    }
    let signatureImage = null;
    let technicianSignatureImage = null;

    if (signatureBytes) {
      try {
        signatureImage = await pdfDocument.embedPng(signatureBytes);
      } catch {
        signatureImage = await pdfDocument.embedJpg(signatureBytes);
      }
    }

    if (technicianSignatureUrl) {
      try {
        const technicianSignatureBytes = await sourceToCleanSignatureBytes(technicianSignatureUrl);
        if (technicianSignatureBytes) {
          try {
            technicianSignatureImage = await pdfDocument.embedPng(technicianSignatureBytes);
          } catch {
            technicianSignatureImage = await pdfDocument.embedJpg(technicianSignatureBytes);
          }
        }
      } catch (technicianSignatureError) {
        console.warn('Unable to load field engineer signature image for PDF cleanup.', technicianSignatureError);
      }
    }

    const marginLeft = 40;
    const gap = 10;
    const columnWidth = (width - marginLeft * 2 - gap * 2) / 3;
    const qcX = Number.isFinite(signaturePlacement.qcX) ? signaturePlacement.qcX : marginLeft + columnWidth + gap;
    const dateX = Number.isFinite(signaturePlacement.dateX) ? signaturePlacement.dateX : marginLeft + (columnWidth + gap) * 2;
    const technicianX = marginLeft;
    const signatureLineY = Number.isFinite(signaturePlacement.signatureLineY) ? signaturePlacement.signatureLineY : height - 170;
    const signatureY = signatureLineY + 4;
    const reviewerNameY = signatureLineY - 34;
    const dateValueY = signatureLineY + 22;
    const approvalDate = formatApprovalDate(approvedAtOverride);
    const approvalReviewerName = reviewerNameOverride || report?.reviewed_by_name || WORKFLOW_LABELS.validationReviewer;

    const statusText = String(statusLabel || 'APPROVED').toUpperCase();
    const statusBadgeWidth = Math.max(64, boldFont.widthOfTextAtSize(statusText, 8) + 18);
    const statusBadgeHeight = 20;
    const headerRightX = firstPageWidth - 40;
    const originalBadgeX = firstPageWidth - 172;
    const originalBadgeY = firstPageHeight - 132;
    const statusBadgeX = headerRightX - statusBadgeWidth - 12;
    const statusBadgeY = firstPageHeight - 123;
    const isApprovedStatus = statusText === 'APPROVED';
    const badgeFill = isApprovedStatus ? rgb(0.86, 0.98, 0.91) : rgb(1, 0.95, 0.82);
    const badgeText = isApprovedStatus ? rgb(0.02, 0.44, 0.26) : rgb(0.57, 0.23, 0.02);

    // Replace the submitted review badge on the cover page with the final approval status.
    firstPage.drawRectangle({
      x: originalBadgeX,
      y: originalBadgeY,
      width: headerRightX - originalBadgeX,
      height: 36,
      color: rgb(0.06, 0.09, 0.16)
    });
    firstPage.drawRectangle({
      x: statusBadgeX,
      y: statusBadgeY,
      width: statusBadgeWidth,
      height: statusBadgeHeight,
      color: badgeFill
    });
    firstPage.drawText(statusText, {
      x: statusBadgeX + (statusBadgeWidth - boldFont.widthOfTextAtSize(statusText, 8)) / 2,
      y: statusBadgeY + 6,
      size: 8,
      font: boldFont,
      color: badgeText
    });

    if (isApprovedStatus) {
      // Fill only the blank approval fields that already exist in the submitted PDF.
      if (technicianSignatureImage) {
        page.drawRectangle({
          x: technicianX,
          y: signatureLineY + 2,
          width: columnWidth,
          height: 58,
          color: rgb(1, 1, 1)
        });
      }
      page.drawRectangle({
        x: qcX,
        y: reviewerNameY - 4,
        width: columnWidth,
        height: 18,
        color: rgb(1, 1, 1)
      });
      page.drawRectangle({
        x: dateX,
        y: signatureLineY + 4,
        width: columnWidth,
        height: 38,
        color: rgb(1, 1, 1)
      });
    }

    if (isApprovedStatus && technicianSignatureImage) {
      const technicianDims = technicianSignatureImage.scale(1);
      const maxWidth = columnWidth - 14;
      const maxHeight = 34;
      const scale = Math.min(maxWidth / technicianDims.width, maxHeight / technicianDims.height);
      page.drawImage(technicianSignatureImage, {
        x: technicianX + 7,
        y: signatureY,
        width: technicianDims.width * scale,
        height: technicianDims.height * scale
      });
    }

    if (isApprovedStatus && signatureImage) {
      const imageDims = signatureImage.scale(1);
      const maxWidth = columnWidth - 14;
      const maxHeight = 34;
      const scale = Math.min(maxWidth / imageDims.width, maxHeight / imageDims.height);
      page.drawImage(signatureImage, {
        x: qcX + 7,
        y: signatureY,
        width: imageDims.width * scale,
        height: imageDims.height * scale
      });
    }

    if (isApprovedStatus) {
      page.drawText(approvalReviewerName, {
        x: qcX,
        y: reviewerNameY,
        size: 9,
        font,
        color: rgb(0.06, 0.09, 0.16)
      });
      page.drawText(approvalDate || '-', {
        x: dateX,
        y: dateValueY,
        size: 9,
        font,
        color: rgb(0.06, 0.09, 0.16)
      });
    }

    return new Blob([await pdfDocument.save()], { type: 'application/pdf' });
  }

  async function regenerateApprovedPdfSnapshot({ force = false } = {}) {
    if (!report?.id || ![REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(reportStatus)) return;
    const refreshKey = `qcore-approved-pdf-refresh-v19-${report.id}-${report.approved_at || 'no-date'}-${report.reviewed_by_name || 'reviewer'}`;
    if (!force && window.sessionStorage.getItem(refreshKey)) return;

    try {
      if (force) setApprovedPdfRefreshStatus('Refreshing approved PDF...');
      const qcSignatureUrl = await getStoredQcSignatureUrl();
      if (!qcSignatureUrl && !report.approved_at) return;
      const technicianSignatureUrl = await getStoredTechnicianSignatureUrl();
      const originalPdfUrl = await getOriginalSubmittedPdfUrl();
      if (!originalPdfUrl) throw new Error('Original submitted PDF is not available.');
      const pdfBlob = await stampApprovalOnSubmittedPdf(
        originalPdfUrl,
        qcSignatureUrl,
        report.approved_at,
        'APPROVED',
        report.reviewed_by_name || reviewerName,
        technicianSignatureUrl
      );

      const refreshedPdfUrl = await uploadReportPdf(effectiveProjectId, report.id, pdfBlob);
      await setReportStatus(report.id, reportStatus, {
        pdfUrl: refreshedPdfUrl,
        finalPdfUrl: refreshedPdfUrl
      });
      window.sessionStorage.setItem(refreshKey, 'true');
      setReport((previous) => previous
        ? { ...previous, pdf_url: refreshedPdfUrl, final_pdf_url: refreshedPdfUrl }
        : previous);
      if (force) setApprovedPdfRefreshStatus('Approved deliverable refreshed with validation signature and approval date.');
    } catch (error) {
      console.error('Unable to refresh approved PDF snapshot', error);
      if (force) setApprovedPdfRefreshStatus(`Unable to refresh approved PDF: ${error?.message || 'Unknown error'}`);
    }
  }

  useEffect(() => {
    if (!report?.id || loading || rows.length === 0) return;
    regenerateApprovedPdfSnapshot();
  }, [report?.id, loading, rows.length, attachments.length, reportStatus]);

  const handleReportAction = (actionId) => {
    switch (actionId) {
      case ACTION_IDS.APPROVE:
        openApprovalModal('approve');
        break;
      case ACTION_IDS.REQUEST_REVISION:
        handleApproveDecision('', 'request_changes');
        break;
      case ACTION_IDS.REJECT:
        handleApproveDecision('', 'reject');
        break;
      case ACTION_IDS.REVIEW:
        // Already on the review page
        break;
      case ACTION_IDS.REVISE_REPORT:
      case ACTION_IDS.CONTINUE_DRAFT:
        navigate(`/project/${effectiveProjectId}/field-reports/concrete-test-log/${reportId}/edit`);
        break;
      case ACTION_IDS.PDF_PREVIEW:
      case ACTION_IDS.PDF_SUBMITTED:
      case ACTION_IDS.PDF_APPROVED:
        setShowPdfViewer(true);
        break;
      default:
        console.log('Action not handled in details:', actionId);
    }
  };

  async function handleApproveDecision(signatureOverride = '', actionOverride = approvalAction) {
    if (!report) return;
    const decisionAction = actionOverride || approvalAction;
    const activeSignature = signatureOverride || qcSignature;
    if (decisionAction === 'approve' && !activeSignature) {
      alert('Validation signature is required before approval.');
      return;
    }
    const decisionRemarks = [
      approvalComment.trim(),
      decisionAction !== 'approve' ? markedIssueRemarks : ''
    ].filter(Boolean).join('\n\n');

    if (decisionAction !== 'approve' && !decisionRemarks.trim()) {
      alert('Reviewer remarks or marked faulty values are required when rejecting or requesting revision.');
      return;
    }

    setProcessing(true);
    try {
      let pdfUrl = reportPdfUrl;
      let qcSignatureUrl = '';
      let qcSignatureStoragePath = '';
      const now = new Date().toISOString();
      if (decisionAction === 'approve') {
        try {
          qcSignatureUrl = await uploadSignature(effectiveProjectId, report.id, activeSignature, 'qc');
          qcSignatureStoragePath = getSignatureStoragePath(effectiveProjectId, report.id, 'qc');
        } catch (signatureError) {
          console.warn('Validation signature upload failed; approval will continue with audit metadata only.', signatureError);
        }

        try {
          const technicianSignatureUrl = await getStoredTechnicianSignatureUrl();
          const originalPdfUrl = await getOriginalSubmittedPdfUrl();
          if (!originalPdfUrl) throw new Error('Original submitted PDF is not available.');
          const pdfBlob = await stampApprovalOnSubmittedPdf(
            originalPdfUrl,
            activeSignature || qcSignatureUrl,
            now,
            'APPROVED',
            reviewerName,
            technicianSignatureUrl
          );
          pdfUrl = await uploadReportPdf(effectiveProjectId, report.id, pdfBlob);
        } catch (pdfError) {
          console.warn('Approved PDF stamping failed; preserving submitted review PDF.', pdfError);
          throw new Error(`Final approved PDF could not be generated: ${pdfError?.message || 'Unknown PDF error'}`);
        }
      } else {
        try {
          const originalPdfUrl = await getOriginalSubmittedPdfUrl();
          if (originalPdfUrl) {
            const technicianSignatureUrl = await getStoredTechnicianSignatureUrl();
            const pdfBlob = await stampApprovalOnSubmittedPdf(
              originalPdfUrl,
              '',
              now,
              'REVISION REQUIRED',
              reviewerName,
              technicianSignatureUrl
            );
            pdfUrl = await uploadReportPdf(effectiveProjectId, report.id, pdfBlob);
          }
        } catch (pdfError) {
          console.warn('Revision PDF status stamping failed; preserving submitted review PDF.', pdfError);
        }
      }

      const status = decisionAction === 'approve' ? REPORT_STATUS.APPROVED : REPORT_STATUS.REVISION_REQUIRED;
      const options = {
        pdfUrl,
        finalPdfUrl: decisionAction === 'approve' ? pdfUrl : undefined,
        approvedAt: decisionAction === 'approve' ? now : null,
        approvedBy: decisionAction === 'approve' ? session?.user?.id || null : null,
        reviewedAt: now,
        reviewedBy: session?.user?.id || null,
        reviewedByName: reviewerName,
        qcSignatureUrl: qcSignatureUrl || null,
        qcSignatureStoragePath: qcSignatureStoragePath || null,
        rejectedAt: decisionAction !== 'approve' ? now : null,
        rejectedBy: decisionAction !== 'approve' ? session?.user?.id || null : null,
        rejectionReason: decisionAction !== 'approve' ? decisionRemarks : null,
        revisionCount: decisionAction !== 'approve' ? Number(report.revision_count || 0) + 1 : report.revision_count,
        isLocked: decisionAction === 'approve',
        userId: session?.user?.id,
        userRole: role,
        userName: reviewerName,
        comments: decisionRemarks || approvalComment,
        metadata: { action: decisionAction, qcSignatureUrl }
      };

      const updatedReport = await setReportStatus(report.id, status, options);
      await addReviewHistory({
        reportId: report.id,
        action: decisionAction === 'approve' ? REPORT_STATUS.APPROVED : REPORT_STATUS.REVISION_REQUIRED,
        remarks: decisionRemarks,
        performedBy: session?.user?.id,
        performedByName: reviewerName,
        performedByRole: role
      });

      const recipientEmail = report.submitted_by_email || report.technician_email || '';
      if (recipientEmail) {
        const reviewUrl = `${window.location.origin}/project/${effectiveProjectId}/field-reports/concrete-test-log/${report.id}`;
        const emailReport = { ...report, ...updatedReport, review_url: reviewUrl };
        const email = decisionAction === 'approve'
          ? buildApprovalEmail({ report: emailReport, reviewerName })
          : buildRejectionEmail({ report: emailReport, reviewerName, remarks: decisionRemarks });

        await queueAndSendNotification({
          reportId: report.id,
          recipientEmail,
          subject: email.subject,
          html: email.html,
          notificationType: decisionAction === 'approve' ? 'approval' : 'revision_required'
        });
      }

      setReport((prev) => prev ? { ...prev, ...(updatedReport || {}), status, pdf_url: pdfUrl, final_pdf_url: decisionAction === 'approve' ? pdfUrl : prev.final_pdf_url } : prev);
      setApprovalModalOpen(false);
      setApprovalComment('');
      setMarkedIssues([]);
      setQcSignature('');
      navigate(`/project/${effectiveProjectId}/field-reports/concrete-test-log`, {
        replace: true,
        state: {
          reviewCompleted: true,
          reviewStatus: status,
          dfrNumber: updatedReport?.dfr_number || report.dfr_number
        }
      });
    } catch (err) {
      console.error('Approval flow failed', err);
      alert(`Unable to complete validation approval: ${err?.message || 'Unknown error'}`);
    } finally {
      setProcessing(false);
    }
  }

  function openApprovalModal(action) {
    setApprovalAction(action);
    setApprovalModalOpen(true);
  }

  function getSignatureActionLabel() {
    if (approvalAction === 'approve') return processing ? 'Approving...' : 'Sign & Approve';
    if (approvalAction === 'reject') return processing ? 'Rejecting...' : 'Sign & Reject';
    return processing ? 'Returning...' : 'Sign & Request Revision';
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-slate-100 text-slate-700">
        Loading report details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-100 p-6">
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
    <div className="w-full max-w-full overflow-x-hidden bg-slate-100 pb-44 md:pb-32">
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 sm:space-y-6">
        <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-lg sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <button
                onClick={() => navigate(effectiveProjectId ? `/project/${effectiveProjectId}/field-reports/concrete-test-log` : -1)}
                className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-2xl px-1 text-sm font-semibold text-slate-200 hover:text-white sm:mb-4"
              >
                <ChevronLeft className="w-5 h-5" /> Back to Validation Center
              </button>
              {effectiveProjectId && (
                <button
                  type="button"
                  onClick={() => navigate(`/project/${effectiveProjectId}`)}
                  className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15 sm:mb-4 sm:ml-4"
                >
                  <FolderKanban className="h-4 w-4" />
                  {MODULE_NAMES.projectHub}
                </button>
              )}
              <h1 className="break-words text-2xl font-semibold sm:text-4xl">Validation Review: {report.dfr_number || 'Field Operations Record'}</h1>
              <p className="mt-2 max-w-2xl text-slate-300">
                Perform professional validation of the submitted assurance record and generated digital deliverable.
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
              {reportPdfUrl && (
                <button
                  type="button"
                  onClick={() => setShowPdfViewer(true)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow-sm sm:w-auto lg:hidden"
                >
                  View PDF
                </button>
              )}
              <ReportActions 
                role={role}
                status={report.status}
                pdfUrl={reportPdfUrl}
                onAction={handleReportAction}
                allowedActions={
                  canApprove
                    ? []
                    : [REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(reportStatus)
                    ? [ACTION_IDS.DOWNLOAD_FINAL]
                    : null
                }
              />
            </div>
          </div>
          {approvedPdfRefreshStatus && (
            <p className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white">
              {approvedPdfRefreshStatus}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
          {/* LEFT PANE: DATA & METRICS */}
          <div className="space-y-6">
            <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900 border-b border-slate-100 pb-3">Report summary</h2>
              <dl className="mt-4 grid grid-cols-1 gap-4 text-sm text-slate-700 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-slate-400 font-bold">DFR Number</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{report.dfr_number || specifications?.dfr_number || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-slate-400 font-bold">Status</dt>
                  <dd className="mt-1"><StatusBadge status={reportStatus} /></dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-slate-400 font-bold">Sample date</dt>
                  <dd className="mt-1 font-medium">{report.date_sampled || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-slate-400 font-bold">Project</dt>
                  <dd className="mt-1 font-medium">{report.project_name || '—'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wider text-slate-400 font-bold">Field Engineer</dt>
                  <dd className="mt-1 font-medium">{report.data_logger || '—'}</dd>
                </div>
                {(reportStatus === REPORT_STATUS.APPROVED || reportStatus === REPORT_STATUS.FINALIZED) && (
                  <div className="sm:col-span-2 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-emerald-600 font-bold">Approved By</dt>
                      <dd className="mt-1 text-emerald-900 font-bold">{report.reviewed_by_name || WORKFLOW_LABELS.validationReviewer}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-emerald-600 font-bold">Approved On</dt>
                      <dd className="mt-1 text-emerald-900 font-medium">{report.approved_at ? new Date(report.approved_at).toLocaleString() : '—'}</dd>
                    </div>
                  </div>
                )}
              </dl>
            </div>

            {visibleReviewComments.length > 0 && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
                <div className="border-b border-amber-200 pb-3">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Validation Review</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-950">Validation Comments</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {visibleReviewComments.map((comment) => (
                    <div key={comment.id || `${comment.action}-${comment.performed_at}`} className="rounded-2xl bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                          {String(comment.action || 'Review Comment').replaceAll('_', ' ')}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          {comment.performed_at ? new Date(comment.performed_at).toLocaleString() : 'Date not recorded'}
                        </p>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {comment.performed_by_name || WORKFLOW_LABELS.validationReviewer}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {comment.remarks}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-lg font-semibold text-slate-900">Delivery & testing records</h2>
                {canApprove && (
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    Select any questionable value to flag it for field engineer revision. Flagged values are added to the validation comments.
                  </p>
                )}
              </div>
              <div className="mt-4 hidden lg:block">
                <table className="w-full table-auto text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2 py-3 font-bold uppercase tracking-wider">Test #</th>
                      <th className="px-2 py-3 font-bold uppercase tracking-wider">CY</th>
                      <th className="px-2 py-3 font-bold uppercase tracking-wider">Slump</th>
                      <th className="px-2 py-3 font-bold uppercase tracking-wider">Air %</th>
                      <th className="px-2 py-3 font-bold uppercase tracking-wider">Temp</th>
                      <th className="px-2 py-3 font-bold uppercase tracking-wider">Comments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.length > 0 ? (
                      rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="px-2 py-3 font-semibold text-slate-900">{row.test_number || '—'}</td>
                          {QC_MARKABLE_FIELDS.map((field) => (
                            <td
                              key={`${row.id}-${field.key}`}
                              className={`px-2 py-3 ${field.key === 'comments' ? 'max-w-full sm:max-w-[180px]' : ''}`}
                            >
                              {renderReviewValue(row, field)}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-2 py-6 text-slate-500 text-center" colSpan={6}>
                          No row records saved.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 space-y-3 lg:hidden">
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <p className="text-sm font-bold text-slate-950">Test #{row.test_number || '—'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {QC_MARKABLE_FIELDS.map((field) => (
                          <div key={`${row.id}-${field.key}`} className={field.key === 'comments' ? 'col-span-2' : ''}>
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{field.label}</p>
                            <div className="mt-1">{renderReviewValue(row, field)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
                    No row records saved.
                  </div>
                )}
              </div>
              {canApprove && markedIssues.length > 0 && (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-rose-800">
                    <CircleAlert className="h-4 w-4" />
                    Marked Faulty Values
                  </div>
                  <ul className="mt-3 space-y-2 text-sm font-semibold text-rose-800">
                    {markedIssues.map((issue) => (
                      <li key={issue.key}>{formatMarkedIssue(issue)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 border-b border-slate-100 pb-3">{MODULE_NAMES.evidenceCenter}</h2>
              {attachments.length > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-slate-100 p-4 transition hover:bg-slate-50"
                    >
                      <p className="font-semibold text-slate-900 truncate text-sm">{attachment.file_name}</p>
                      <p className="text-xs text-slate-400 mt-1">{attachment.content_type}</p>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">No attachments uploaded.</p>
              )}
            </div>
          </div>

          {/* RIGHT PANE: PDF ARTIFACT */}
          <div className="hidden lg:sticky lg:top-32 lg:block lg:h-[calc(100vh-160px)]">
            {reportPdfUrl ? (
              <PdfViewer
                url={reportPdfUrl}
                fileName={`Validation_Review_${report.dfr_number || report.id}.pdf`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full bg-white rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                  <ExternalLink className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">No PDF artifact generated</h3>
                <p className="mt-2 text-slate-500 max-w-xs mx-auto">
                  A digital deliverable must be generated by the field engineer before final validation can be completed.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* QC ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 border-t border-slate-200 shadow-2xl backdrop-blur-md px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col items-stretch gap-3 md:flex-row md:items-center md:gap-6">
          <div className="flex-1 w-full">
            {canApprove ? (
              <div className="relative group">
                <textarea
                  value={approvalComment}
                  onChange={(event) => setApprovalComment(event.target.value)}
                  placeholder="Enter review remarks, findings, or requested changes..."
                  className="h-20 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-100 md:h-16"
                />
                <div className="absolute right-3 bottom-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest group-focus-within:text-blue-500">Review Remarks</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <StatusBadge status={reportStatus} className="scale-110" />
                <p className="text-sm font-semibold text-slate-600">
                  {reportStatus === REPORT_STATUS.APPROVED || reportStatus === REPORT_STATUS.FINALIZED
                    ? 'This report has been approved and is now immutable.'
                    : 'Awaiting field engineer submission for review.'}
                </p>
              </div>
            )}
          </div>
          <div className="flex w-full items-center gap-3 md:w-auto">
            {canApprove && (
              <ReportActions 
                role={role}
                status={report.status}
                pdfUrl={reportPdfUrl}
                onAction={handleReportAction}
                className="w-full md:w-auto"
                allowedActions={[
                  ACTION_IDS.APPROVE,
                  ACTION_IDS.REQUEST_REVISION,
                  ACTION_IDS.REJECT
                ]}
              />
            )}
          </div>
        </div>
      </div>

      <SignatureModal
        open={approvalModalOpen}
        title={
          approvalAction === 'approve'
            ? 'Validation Approval Signature'
            : approvalAction === 'reject'
            ? 'Reject Report'
            : 'Request Changes'
        }
        description={
          approvalAction === 'approve'
            ? 'Please sign to approve and finalize the report.'
            : approvalAction === 'reject'
            ? 'Sign to reject this report and notify the field engineer of the issue.'
            : 'Sign to request changes and return the report to the field engineer for revision.'
        }
        disabled={processing}
        value={qcSignature}
        onSave={setQcSignature}
        onClear={() => setQcSignature('')}
        onClose={() => setApprovalModalOpen(false)}
        onConfirm={handleApproveDecision}
        autoConfirmOnSave
        signatureActionLabel={getSignatureActionLabel()}
      />

      {showPdfViewer && reportPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="relative h-[92vh] w-full max-w-6xl">
            <button
              onClick={() => setShowPdfViewer(false)}
              className="absolute -top-12 right-0 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 backdrop-blur"
            >
              Close Viewer
            </button>
            <PdfViewer
              url={reportPdfUrl}
              fileName={`Material_Assurance_${report.dfr_number || report.id}.pdf`}
              onClose={() => setShowPdfViewer(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
