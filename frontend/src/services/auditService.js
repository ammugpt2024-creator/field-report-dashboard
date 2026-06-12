import { supabase } from './supabase';

/**
 * Audit service for tracking all changes to reports
 * Logs status changes, comments, and activity history
 */

export async function logStatusChange({
  reportId,
  fromStatus,
  toStatus,
  userId,
  userRole,
  comments = null,
  metadata = {}
}) {
  try {
    const { data, error } = await supabase
      .from('report_status_history')
      .insert({
        report_id: reportId,
        from_status: fromStatus,
        to_status: toStatus,
        changed_by: userId,
        changed_by_role: userRole,
        comments,
        metadata
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to log status change:', error);
    throw error;
  }
}

export async function addReviewHistory({
  reportId,
  action,
  remarks = null,
  performedBy = null,
  performedByName = null,
  performedByRole = null
}) {
  try {
    const { data, error } = await supabase
      .from('report_review_history')
      .insert({
        report_id: reportId,
        action,
        remarks,
        performed_by: performedBy,
        performed_by_name: performedByName,
        performed_by_role: performedByRole
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.warn('Review history could not be written. Has the QC workflow migration been applied?', error);
    return null;
  }
}
