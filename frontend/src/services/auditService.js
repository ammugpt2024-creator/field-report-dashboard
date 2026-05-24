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
  userName,
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

export async function addReportComment({
  reportId,
  userId,
  userRole,
  userName,
  comment,
  commentType = 'general',
  isInternal = false
}) {
  try {
    const { data, error } = await supabase
      .from('report_comments')
      .insert({
        report_id: reportId,
        user_id: userId,
        user_role: userRole,
        user_name: userName,
        comment,
        comment_type: commentType,
        is_internal: isInternal
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to add report comment:', error);
    throw error;
  }
}

export async function logActivity({
  reportId,
  action,
  entityType = null,
  entityId = null,
  userId,
  userRole,
  userName,
  ipAddress = null,
  userAgent = null,
  changes = {}
}) {
  try {
    const { data, error } = await supabase
      .from('report_activity_log')
      .insert({
        report_id: reportId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        user_id: userId,
        user_role: userRole,
        user_name: userName,
        ip_address: ipAddress,
        user_agent: userAgent,
        changes
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to log activity:', error);
    throw error;
  }
}

export async function getReportStatusHistory(reportId) {
  try {
    const { data, error } = await supabase
      .from('report_status_history')
      .select('*')
      .eq('report_id', reportId)
      .order('changed_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to fetch status history:', error);
    throw error;
  }
}

export async function getReportComments(reportId, includeInternal = false) {
  try {
    let query = supabase
      .from('report_comments')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: false });

    if (!includeInternal) {
      query = query.eq('is_internal', false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to fetch report comments:', error);
    throw error;
  }
}

export async function getReportActivityLog(reportId, limit = 50) {
  try {
    const { data, error } = await supabase
      .from('report_activity_log')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to fetch activity log:', error);
    throw error;
  }
}
