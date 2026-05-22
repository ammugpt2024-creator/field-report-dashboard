import { supabase } from './supabase';

export async function saveConcreteTestLog({ projectId, reportId, form, status, metadata = {} }) {
  const payload = {
    project_id: Number(projectId),
    project_name: form.projectName,
    project_number: form.projectNumber,
    date_sampled: form.dateSampled,
    weather: form.weather,
    min_temp: form.minTemp,
    max_temp: form.maxTemp,
    location: form.location,
    batch_plant: form.batchPlant,
    gc: form.gc,
    qc_rep: form.qcRep,
    data_logger: form.dataLogger,
    sub_contractor: form.subContractor,
    dfr_number: form.dfrNumber,
    time_in: form.timeIn,
    time_out: form.timeOut,
    total_quantity_placed: form.totalQuantityPlaced,
    air_content_spec: form.airContentSpec,
    unit_weight_spec: form.unitWeightSpec,
    slump_spec: form.slumpSpec,
    j_ring_spec: form.jRingSpec,
    spread_spec: form.spreadSpec,
    strength_spec: form.strengthSpec,
    mix_no_spec: form.mixNoSpec,
    status,
    final_pdf_url: form.finalPdfUrl || null,
    submitted_at: metadata.submittedAt || null,
    submitted_by: metadata.submittedBy || null,
    approved_at: metadata.approvedAt || null,
    approved_by: metadata.approvedBy || null,
    rejected_at: metadata.rejectedAt || null,
    rejected_by: metadata.rejectedBy || null,
    rejection_reason: metadata.rejectionReason || null,
    revision_no: metadata.revisionNo || 1
  };

  if (reportId) {
    const { data, error } = await supabase
      .from('concrete_test_logs')
      .update(payload)
      .eq('id', reportId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('concrete_test_logs')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveConcreteTestLogRows(reportId, rows) {
  const filteredRows = rows.filter((row) => row.testNo || row.ticketNo || row.truckNo);
  if (!reportId) {
    throw new Error('Report ID required to save rows');
  }

  const { error: deleteError } = await supabase
    .from('concrete_test_log_rows')
    .delete()
    .eq('log_id', reportId);
  if (deleteError) throw deleteError;

  const payload = filteredRows.map((row) => ({
    log_id: reportId,
    test_no: row.testNo,
    ticket_no: row.ticketNo,
    truck_no: row.truckNo,
    cubic_yards: row.cubicYards,
    total_placed: row.totalPlaced,
    time_batched: row.timeBatched,
    arrival_time: row.arrivalTime,
    time_sampled: row.timeSampled,
    start_placement: row.startPlacement,
    finish_unload: row.finishUnload,
    actual_minutes: row.actualMinutes,
    water_added: row.waterAdded,
    air_temp: row.airTemp,
    concrete_temp: row.concreteTemp,
    slump: row.slump,
    air_content: row.airContent,
    unit_weight: row.unitWeight,
    j_ring: row.jRing,
    spread: row.spread,
    set_no: row.setNo,
    lab_cylinders: row.labCylinders,
    field_cylinders: row.fieldCylinders,
    comments: row.comments
  }));

  if (payload.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('concrete_test_log_rows')
    .insert(payload);
  if (error) throw error;
  return data;
}

export async function saveRowAttachmentMetadata(reportId, attachments) {
  if (!reportId || attachments.length === 0) {
    return [];
  }

  const payload = attachments.map((attachment) => ({
    log_id: reportId,
    row_id: attachment.rowId,
    file_name: attachment.name,
    file_url: attachment.url,
    content_type: attachment.mimeType
  }));

  const { data, error } = await supabase
    .from('concrete_test_log_attachments')
    .insert(payload);
  if (error) throw error;
  return data;
}

export async function setReportStatus(reportId, status, options = {}) {
  const payload = {
    status
  };

  if (options.finalPdfUrl !== undefined) payload.final_pdf_url = options.finalPdfUrl;
  if (options.pdfUrl !== undefined) payload.pdf_url = options.pdfUrl;
  if (options.approvedAt !== undefined) payload.approved_at = options.approvedAt;
  if (options.approvedBy !== undefined) payload.approved_by = options.approvedBy;
  if (options.rejectedAt !== undefined) payload.rejected_at = options.rejectedAt;
  if (options.rejectedBy !== undefined) payload.rejected_by = options.rejectedBy;
  if (options.rejectionReason !== undefined) payload.rejection_reason = options.rejectionReason;

  const { data, error } = await supabase
    .from('concrete_test_logs')
    .update(payload)
    .eq('id', reportId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
