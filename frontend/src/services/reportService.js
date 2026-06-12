import { supabase } from './supabase';
import { logStatusChange } from './auditService';

export async function setReportStatus(reportId, status, options = {}) {
  const { data: currentReport } = await supabase
    .from('concrete_test_logs')
    .select('status')
    .eq('id', reportId)
    .single();

  const fromStatus = currentReport?.status || null;

  const payload = {
    status
  };

  if (options.finalPdfUrl !== undefined) payload.final_pdf_url = options.finalPdfUrl;
  if (options.pdfUrl !== undefined) payload.pdf_url = options.pdfUrl;
  if (options.approvedAt !== undefined) payload.approved_at = options.approvedAt;
  if (options.approvedBy !== undefined) payload.approved_by = options.approvedBy;
  if (options.reviewedAt !== undefined) payload.reviewed_at = options.reviewedAt;
  if (options.reviewedBy !== undefined) payload.reviewed_by = options.reviewedBy;
  if (options.reviewedByName !== undefined) payload.reviewed_by_name = options.reviewedByName;
  if (options.qcSignatureUrl !== undefined) payload.qc_signature_url = options.qcSignatureUrl;
  if (options.qcSignatureStoragePath !== undefined) payload.qc_signature_storage_path = options.qcSignatureStoragePath;
  if (options.rejectedAt !== undefined) payload.rejected_at = options.rejectedAt;
  if (options.rejectedBy !== undefined) payload.rejected_by = options.rejectedBy;
  if (options.rejectionReason !== undefined) payload.rejection_reason = options.rejectionReason;
  if (options.revisionCount !== undefined) payload.revision_count = options.revisionCount;
  if (options.revisionNo !== undefined) payload.revision_no = options.revisionNo;
  if (options.isLocked !== undefined) payload.is_locked = options.isLocked;
  if (options.qcAssignedTo !== undefined) payload.qc_assigned_to = options.qcAssignedTo;
  if (options.submittedAt !== undefined) payload.submitted_at = options.submittedAt;
  if (options.submittedBy !== undefined) payload.submitted_by = options.submittedBy;
  if (options.submittedByName !== undefined) payload.submitted_by_name = options.submittedByName;
  if (options.submittedByEmail !== undefined) payload.submitted_by_email = options.submittedByEmail;

  // Use a fallback strategy similar to the frontend to handle missing columns gracefully
  let nextPayload = { ...payload };
  let result = { data: null, error: null };
  
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error } = await supabase
      .from('concrete_test_logs')
      .update(nextPayload)
      .eq('id', reportId)
      .select()
      .single();
    
    if (!error) {
      result = { data, error };
      break;
    }
    
    const missingColumn = 
      error.message?.match(/Could not find the '([^']+)' column/)?.[1] ||
      error.message?.match(/column "([^"]+)"/)?.[1];
      
    if (missingColumn && missingColumn in nextPayload) {
      delete nextPayload[missingColumn];
      continue;
    }
    
    result = { data, error };
    break;
  }

  if (result.error) throw result.error;

  if (fromStatus !== status && options.userId) {
    await logStatusChange({
      reportId,
      fromStatus,
      toStatus: status,
      userId: options.userId,
      userRole: options.userRole,
      userName: options.userName,
      comments: options.comments,
      metadata: options.metadata || {}
    }).catch((err) => console.error('Failed to log status change:', err));
  }

  return result.data;
}
