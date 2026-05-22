import { supabase } from './supabase';

const PDF_BUCKET = 'report-pdfs';
const ATTACHMENT_BUCKET = 'report-attachments';
const SIGNATURE_BUCKET = 'signatures';

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const contentType = meta.match(/data:(.*);base64/)?.[1] || 'image/png';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: contentType });
}

export async function uploadReportPdf(projectId, reportId, pdfBlob) {
  const path = `project-${projectId}/report-${reportId}/final-report.pdf`;
  const { error } = await supabase.storage.from(PDF_BUCKET).upload(path, pdfBlob, {
    contentType: 'application/pdf',
    upsert: true
  });
  if (error) {
    throw error;
  }
  const { data: signedData, error: signedError } = await supabase.storage
    .from(PDF_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 30);
  if (!signedError && signedData?.signedUrl) return signedData.signedUrl;

  const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadRowAttachments(projectId, reportId, rowId, files) {
  const uploaded = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const path = `project-${projectId}/report-${reportId}/truck-${rowId}-${safeName}`;
    const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: true
    });
    if (error) {
      throw error;
    }
    const { data } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path);
    uploaded.push({ rowId, name: file.name, url: data.publicUrl, mimeType: file.type || 'application/octet-stream' });
  }
  return uploaded;
}

export async function uploadSignature(projectId, reportId, signatureDataUrl, type) {
  const blob = dataUrlToBlob(signatureDataUrl);
  const safeType = type === 'qc' ? 'qc-signature' : 'technician-signature';
  const path = `project-${projectId}/report-${reportId}/${safeType}.png`;
  const { error } = await supabase.storage.from(SIGNATURE_BUCKET).upload(path, blob, {
    contentType: blob.type,
    upsert: true
  });
  if (error) {
    throw error;
  }
  const { data } = supabase.storage.from(SIGNATURE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
