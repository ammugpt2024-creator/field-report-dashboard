import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Download,
  FolderKanban,
  Image,
  Loader2,
  Paperclip,
  Plus,
  Save,
  ScanLine,
  Send,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import {
  attachmentTypes,
  createDefaultObject,
  createDefaultSpecifications,
  createDeliveryRecord,
  deliveryRecordFields,
  projectInfoFields,
  specificationFields,
  workflowSections,
  deliveryRecordGroups
} from '../configs/concreteTestLogFields';
import { workflow_validation } from '../configs/concreteTestLogValidation';
import { scanConcreteTicket } from '../services/ticketScanner';
import { getDailyWeatherSummary } from '../services/weatherService';
import { addReviewHistory } from '../services/auditService';
import { buildQcReviewEmail, queueAndSendNotification } from '../services/notificationService';
import DigitalSignaturePad from '../components/SignaturePad';
import StatusBadge from '../components/StatusBadge';
import {
  REPORT_STATUS,
  getStatusBadgeConfig,
  normalizeReportStatus
} from '../workflow/workflowEngine';
import ActionButton from '../components/ActionButton';

const ATTACHMENT_BUCKET = 'concrete-test-attachments';
const PDF_BUCKET = 'report-pdfs';
const SIGNATURE_BUCKET = 'signatures';
const COMPANY_NAME = 'Dulles Engineering, Inc.';
const COMPANY_LOGO_URL = 'https://img1.wsimg.com/isteam/ip/5d283b38-0950-4c46-838b-44766d9a75d2/DULLES%20ENGINEERING_new%20logo.png/%3A/rs%3Dh%3A78%2Ccg%3Atrue%2Cm/qt%3Dq%3A95';
const COMPANY_LOGO_STORAGE_PATH = 'company-assets/dulles-engineering-logo.png';
const RANGE_COMPATIBLE_DB_COLUMNS = new Set([
  'air_content',
  'unit_weight',
  'spread',
  'slump',
  'concrete_temp',
  'j_ring',
  'speed_of_stress',
  'test_number',
  'cubic_yards',
  'actual_minutes',
  'water_added_gal',
  'air_temp_f',
  'concrete_temp_f',
  'slump_in',
  'air_content_percent',
  'unit_weight_lbs_ft3',
  'j_ring_in',
  'spread_in',
  'lab_cylinders',
  'field_cylinders'
]);
const PROJECT_COMPLETION_FIELDS = [
  'project_number',
  'project_name',
  'general_contractor',
  'gc_representative',
  'project_location',
  'technician_name',
  'weather',
  'batch_plant'
];
const SPECIFICATION_COMPLETION_FIELDS = specificationFields
  .filter((field) => !['comments'].includes(field.key))
  .map((field) => field.key);
const DELIVERY_RECORD_COMPLETION_FIELDS = [
  'test_number',
  'ticket_number',
  'truck_number',
  'cubic_yards',
  'time_batched',
  'arrival_time',
  'time_tested',
  'finish_unload',
  'actual_minutes',
  'water_added_gal',
  'air_temp_f',
  'concrete_temp_f',
  'slump_in',
  'air_content_percent',
  'unit_weight_lbs_ft3',
  'j_ring_in',
  'spread_in',
  'set_number',
  'lab_cylinders',
  'field_cylinders'
];

function toNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function toNullableText(value) {
  return value === '' || value === undefined ? null : value;
}

function hasEnteredValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function normalizeFieldValue(value, field) {
  if (field.valueType === 'number') return toNullableNumber(value);
  return toNullableText(value);
}

function buildPayloadFromFields(fields, values) {
  return fields.reduce((payload, field) => {
    payload[field.dbColumn] = normalizeFieldValue(values[field.key], field);
    return payload;
  }, {});
}

function mapPayloadToFields(fields, payload = {}) {
  return fields.reduce((values, field) => {
    values[field.key] = payload[field.dbColumn] ?? payload[field.key] ?? field.defaultValue ?? '';
    return values;
  }, {});
}

function getStatusLabel(value) {
  return getStatusBadgeConfig(value).label;
}

function getStatusTone(value) {
  return getStatusBadgeConfig(value).tone;
}

function isStatusLocked(value) {
  const normalized = normalizeReportStatus(value);
  return ![REPORT_STATUS.DRAFT, REPORT_STATUS.REVISION_REQUIRED].includes(normalized);
}

function getAutoSaveStatus(currentStatus) {
  const normalized = normalizeReportStatus(currentStatus);
  if (normalized === REPORT_STATUS.DRAFT || normalized === REPORT_STATUS.REVISION_REQUIRED) return normalized;
  return normalized;
}

function getReportSessionKey(projectId) {
  return `concrete-test-log:${projectId}:reportId`;
}

function getDfrSessionKey(projectId) {
  return `concrete-test-log:${projectId}:dfrNumber`;
}

async function fetchNextDfrSequence(projectId) {
  try {
    const { count, error } = await supabase
      .from('concrete_test_logs')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', Number(projectId));
    
    if (error) throw error;
    return (count || 0) + 1;
  } catch (err) {
    console.error('Failed to fetch DFR sequence:', err);
    return Math.floor(Math.random() * 1000); // Fallback to random if DB fails
  }
}

async function dfrNumberExists(candidate, projectId, currentReportId = null) {
  if (!candidate) return true;

  try {
    const { data: logMatches, error: logError } = await supabase
      .from('concrete_test_logs')
      .select('id')
      .eq('project_id', Number(projectId))
      .eq('dfr_number', candidate)
      .limit(1);

    if (logError) throw logError;
    if ((logMatches || []).some((item) => String(item.id) !== String(currentReportId || ''))) return true;

    const { data: specMatches, error: specError } = await supabase
      .from('concrete_specifications')
      .select('log_id')
      .eq('dfr_number', candidate)
      .limit(1);

    if (specError) throw specError;
    return (specMatches || []).some((item) => String(item.log_id) !== String(currentReportId || ''));
  } catch (err) {
    console.error('DFR uniqueness check failed:', err);
    return false;
  }
}

async function generateDfrNumber(projectNumber, projectId) {
  const projectCode = String(projectNumber || projectId || 'PROJECT')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6) || 'PRJ';
  
  const sequence = await fetchNextDfrSequence(projectId);
  for (let offset = 0; offset < 500; offset += 1) {
    const paddedSequence = String(sequence + offset).padStart(3, '0');
    const candidate = `DFR-${projectCode}-${paddedSequence}`;
    const exists = await dfrNumberExists(candidate, projectId);
    if (!exists) return candidate;
  }

  return `DFR-${projectCode}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

async function getUsableDfrNumber(existingValue, projectNumber, projectId, currentReportId = null) {
  const existing = String(existingValue || '').trim();
  const looksUsable = existing && existing.length <= 18 && /^DFR-[A-Z0-9]+-[A-Z0-9]+$/i.test(existing) && !existing.includes('[object');
  if (looksUsable) {
    const exists = await dfrNumberExists(existing, projectId, currentReportId);
    if (!exists) return existing;
  }
  return generateDfrNumber(projectNumber, projectId);
}

function toSafeStorageName(value) {
  return String(value || 'user')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'user';
}

function getProjectStorageFolder(projectInfo, projectId) {
  const projectName = toSafeStorageName(projectInfo?.project_name);
  const projectNumber = toSafeStorageName(projectInfo?.project_number);
  const suffix = projectNumber ? `_${projectNumber}` : `_project_${projectId}`;
  return `${projectName || `project_${projectId}`}${suffix}`;
}

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const contentType = meta.match(/data:(.*);base64/)?.[1] || 'image/png';
  const binary = window.atob(base64);
  const array = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    array[index] = binary.charCodeAt(index);
  }
  return new Blob([array], { type: contentType });
}

function getMissingColumnName(error) {
  if (!error?.message) return null;
  return (
    error.message.match(/Could not find the '([^']+)' column/)?.[1] ||
    error.message.match(/column "([^"]+)"/)?.[1] ||
    null
  );
}

function hasInvalidNumericInputError(error) {
  const message = error?.message?.toLowerCase() || '';
  return message.includes('invalid input syntax for type numeric');
}

function sanitizeRangeCompatiblePayload(payload) {
  return Object.entries(payload).reduce((nextPayload, [key, value]) => {
    if (RANGE_COMPATIBLE_DB_COLUMNS.has(key) && value !== null && value !== undefined && value !== '') {
      const numericValue = Number(value);
      nextPayload[key] = Number.isNaN(numericValue) ? null : value;
      return nextPayload;
    }

    nextPayload[key] = value;
    return nextPayload;
  }, {});
}

function isStorageBucketError(error) {
  const message = error?.message?.toLowerCase() || '';
  return message.includes('bucket not found') || message.includes('bucket') || error?.statusCode === '404';
}

async function getStorageAccessUrl(bucket, path) {
  const { data: signedData, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 30);

  if (!signedError && signedData?.signedUrl) return signedData.signedUrl;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || '';
}

function omitPayloadColumn(payload, columnName) {
  const nextPayload = { ...payload };
  delete nextPayload[columnName];
  return nextPayload;
}

async function runMutationWithColumnFallback(payload, mutation) {
  let nextPayload = { ...payload };
  let retriedInvalidNumericPayload = false;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await mutation(nextPayload);
    const missingColumn = getMissingColumnName(response.error);

    if (!missingColumn && hasInvalidNumericInputError(response.error) && !retriedInvalidNumericPayload) {
      const sanitizedPayload = sanitizeRangeCompatiblePayload(nextPayload);
      const changed = Object.keys(sanitizedPayload).some((key) => sanitizedPayload[key] !== nextPayload[key]);
      if (changed) {
        retriedInvalidNumericPayload = true;
        nextPayload = sanitizedPayload;
        continue;
      }
    }

    if (!missingColumn) return response;
    if (!(missingColumn in nextPayload)) return response;

    nextPayload = omitPayloadColumn(nextPayload, missingColumn);
  }

  return mutation(nextPayload);
}

function formatTimestamp(value) {
  if (!value) return 'Not saved yet';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(value);
}

function getProjectValue(projectData, projectColumn) {
  if (!projectColumn) return '';
  const columns = Array.isArray(projectColumn) ? projectColumn : [projectColumn];
  const foundColumn = columns.find((column) => projectData?.[column]);
  return foundColumn ? projectData[foundColumn] : '';
}

function updateProjectInfoField(setProjectInfo, setHasNonFormChanges, key, value) {
  setProjectInfo((previous) => ({ ...previous, [key]: value }));
  setHasNonFormChanges(true);
}

function getSpecificationRules(field) {
  const rules = {};
  const isRequired = workflow_validation.specifications.required.includes(field.key);
  if (isRequired) rules.required = `${field.label} is required.`;
  return rules;
}

function getFieldValidationMessage() {
  return '';
}

function getRecordValidationErrors(record) {
  return deliveryRecordFields.reduce((fieldErrors, field) => {
    const required = workflow_validation.records.requiredFields.includes(field.key);
    const value = record[field.key];

    if (required && (value === '' || value === undefined || value === null)) {
      fieldErrors[field.key] = `${field.label} is required.`;
      return fieldErrors;
    }

    const validationMessage = getFieldValidationMessage(field, value);
    if (validationMessage) fieldErrors[field.key] = validationMessage;

    return fieldErrors;
  }, {});
}

function getSpecificationValidationErrors(specifications) {
  return specificationFields.reduce((validationErrors, field) => {
    const required = workflow_validation.specifications.required.includes(field.key);
    const value = specifications[field.key];

    if (required && (value === '' || value === undefined || value === null)) {
      validationErrors.push(`${field.label} is required.`);
      return validationErrors;
    }

    const validationMessage = getFieldValidationMessage(field, value);
    if (validationMessage) validationErrors.push(validationMessage);

    return validationErrors;
  }, []);
}

function focusFirstInvalidField() {
  const invalidInput = document.querySelector('.field-error input, .field-error textarea');
  if (invalidInput) invalidInput.focus();
}

function getStepCompletion(stepId, projectInfo, specifications, records, attachments) {
  if (stepId === 'project') {
    return PROJECT_COMPLETION_FIELDS.every((key) => hasEnteredValue(projectInfo[key]));
  }

  if (stepId === 'specifications') {
    return SPECIFICATION_COMPLETION_FIELDS.every((key) => hasEnteredValue(specifications[key]));
  }

  if (stepId === 'records') {
    if (records.length < workflow_validation.records.minRecords) return false;
    return records.every((record) => DELIVERY_RECORD_COMPLETION_FIELDS.every((fieldKey) => hasEnteredValue(record[fieldKey])));
  }

  if (stepId === 'attachments') {
    if (!workflow_validation.attachments.required) return true;
    return attachments.some((attachment) => workflow_validation.attachments.requiredCategories.includes(attachment.category));
  }

  if (stepId === 'summary' || stepId === 'pdf') {
    return (
      getStepCompletion('project', projectInfo, specifications, records, attachments) &&
      getStepCompletion('specifications', projectInfo, specifications, records, attachments) &&
      getStepCompletion('records', projectInfo, specifications, records, attachments) &&
      getStepCompletion('attachments', projectInfo, specifications, records, attachments)
    );
  }

  return false;
}

async function validateStep(stepId, {
  projectInfo,
  specifications,
  records,
  attachments,
  setErrors,
  setRecordFieldErrors,
  trigger,
  setError,
  clearErrors
}) {
  const validationErrors = [];
  const recordErrors = {};
  clearErrors();

  if (stepId === 'project') {
    workflow_validation.project.required.forEach((key) => {
      if (!projectInfo[key]) {
        validationErrors.push(`${getFieldLabel(projectInfoFields, key)} is required.`);
      }
    });
  }

  if (stepId === 'specifications') {
    const requiredSpecs = workflow_validation.specifications.required;
    await trigger(specificationFields.map((field) => field.key));
    specificationFields.forEach((field) => {
      const value = specifications[field.key];
      const isRequired = requiredSpecs.includes(field.key);
      if (isRequired && (value === '' || value === undefined || value === null)) {
        const message = `${field.label} is required.`;
        validationErrors.push(message);
        setError(field.key, { type: 'required', message });
        return;
      }

      const validationMessage = getFieldValidationMessage(field, value);
      if (validationMessage) {
        validationErrors.push(validationMessage);
        setError(field.key, { type: 'validate', message: validationMessage });
      }
    });
  }

  if (stepId === 'records') {
    if (records.length < workflow_validation.records.minRecords) {
      validationErrors.push('At least one delivery record is required.');
    }
    records.forEach((record, index) => {
      const fieldErrors = getRecordValidationErrors(record);
      Object.entries(fieldErrors).forEach(([key, message]) => {
        validationErrors.push(`Record #${index + 1}: ${message}`);
        recordErrors[record.id] = {
          ...recordErrors[record.id],
          [key]: message
        };
      });
    });
  }

  if (stepId === 'attachments') {
    if (!workflow_validation.attachments.required) {
      setErrors([]);
      setRecordFieldErrors({});
      return true;
    }
    const validAttachment = attachments.some((attachment) => workflow_validation.attachments.requiredCategories.includes(attachment.category));
    if (!validAttachment) {
      validationErrors.push('Attach at least one ticket upload or scanned ticket before continuing.');
    }
  }

  if (validationErrors.length > 0) {
    setErrors(validationErrors);
    setRecordFieldErrors(recordErrors);
    focusFirstInvalidField();
    return false;
  }

  setErrors([]);
  setRecordFieldErrors({});
  return true;
}

function getRecordStatus(record, reportStatus = REPORT_STATUS.DRAFT) {
  const selectedStatus = String(record.row_status || '').toLowerCase();
  if (selectedStatus === 'passed') {
    return { label: 'PASS', tone: 'emerald', severity: 1, messages: [] };
  }
  if (selectedStatus === 'failed') {
    return { label: 'FAIL', tone: 'red', severity: 2, messages: [] };
  }
  if (selectedStatus === 'retest') {
    return { label: 'RETEST', tone: 'amber', severity: 1, messages: ['Retest record created for updated values.'] };
  }

  const hasAnyRecordData = deliveryRecordFields.some((field) => field.key !== 'test_number' && Boolean(record[field.key]));
  if (!hasAnyRecordData) {
    return { label: 'Pending', tone: 'slate', severity: 0 };
  }

  const normalizedStatus = normalizeReportStatus(reportStatus);
  if ([REPORT_STATUS.DRAFT, REPORT_STATUS.REVISION_REQUIRED].includes(normalizedStatus)) {
    return { label: 'Ready for Review', tone: 'amber', severity: 1, messages: [] };
  }
  if ([REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.UNDER_REVIEW, REPORT_STATUS.RESUBMITTED].includes(normalizedStatus)) {
    return { label: 'QC Review', tone: 'amber', severity: 1, messages: [] };
  }
  if ([REPORT_STATUS.REJECTED, REPORT_STATUS.REVISION_REQUIRED].includes(normalizedStatus)) {
    return { label: 'Revision Required', tone: 'red', severity: 2, messages: [] };
  }

  return { label: 'Passed', tone: 'emerald', severity: 1, messages: [] };
}

function badgeClass(tone) {
  const classes = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-slate-200 bg-slate-100 text-slate-700'
  };
  return classes[tone] || classes.slate;
}

function getFieldLabel(fields, key) {
  return fields.find((field) => field.key === key)?.label || key;
}

const PDF_STYLE = {
  navy: [15, 23, 42],
  blue: [37, 99, 235],
  slate: [71, 85, 105],
  lightSlate: [241, 245, 249],
  border: [203, 213, 225],
  emerald: [5, 150, 105],
  amber: [217, 119, 6],
  red: [220, 38, 38],
  white: [255, 255, 255]
};

function pdfValue(value, fallback = '-') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

const DELIVERY_REVIEW_COLUMNS = [
  { key: 'test_number', label: 'Test #' },
  { key: 'ticket_number', label: 'Ticket #' },
  { key: 'truck_number', label: 'Truck #' },
  { key: 'cubic_yards', label: 'CY' },
  { key: 'time_batched', label: 'Batch' },
  { key: 'arrival_time', label: 'Arrival' },
  { key: 'time_tested', label: 'Tested' },
  { key: 'finish_unload', label: 'Finish' },
  { key: 'actual_minutes', label: 'Min' },
  { key: 'water_added_gal', label: 'Water' },
  { key: 'status', label: 'Status' },
  { key: 'air_temp_f', label: 'Air °F' },
  { key: 'concrete_temp_f', label: 'Conc °F' },
  { key: 'slump_in', label: 'Slump' },
  { key: 'air_content_percent', label: 'Air %' },
  { key: 'unit_weight_lbs_ft3', label: 'Unit Wt' },
  { key: 'spread_in', label: 'Spread' },
  { key: 'j_ring_in', label: 'J-Ring' },
  { key: 'set_number', label: 'Set #' },
  { key: 'lab_cylinders', label: 'Lab' },
  { key: 'field_cylinders', label: 'Field' },
  { key: 'comments', label: 'Comments' }
];

function getDeliveryReviewRows(records, reportStatus = REPORT_STATUS.DRAFT) {
  return records.map((record, index) => {
    const recordStatus = getRecordStatus(record, reportStatus);
    return {
      id: record.id || `${record.test_number || index + 1}-${index}`,
      status: recordStatus,
      values: {
        test_number: pdfValue(record.test_number, String(index + 1)),
        ticket_number: pdfValue(record.ticket_number),
        truck_number: pdfValue(record.truck_number),
        cubic_yards: pdfValue(record.cubic_yards, '0'),
        time_batched: pdfValue(record.time_batched),
        arrival_time: pdfValue(record.arrival_time),
        time_tested: pdfValue(record.time_tested),
        finish_unload: pdfValue(record.finish_unload),
        actual_minutes: pdfValue(record.actual_minutes),
        water_added_gal: pdfValue(record.water_added_gal, '0'),
        status: recordStatus.label,
        air_temp_f: pdfValue(record.air_temp_f),
        concrete_temp_f: pdfValue(record.concrete_temp_f),
        slump_in: pdfValue(record.slump_in),
        air_content_percent: pdfValue(record.air_content_percent),
        unit_weight_lbs_ft3: pdfValue(record.unit_weight_lbs_ft3),
        spread_in: pdfValue(record.spread_in),
        j_ring_in: pdfValue(record.j_ring_in),
        set_number: pdfValue(record.set_number),
        lab_cylinders: pdfValue(record.lab_cylinders, '0'),
        field_cylinders: pdfValue(record.field_cylinders, '0'),
        comments: pdfValue(record.comments)
      }
    };
  });
}

function formatPdfTimestamp(value = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit'
  }).format(value);
}

function getRecordStatusColors(tone) {
  if (tone === 'emerald') return { fill: [220, 252, 231], text: PDF_STYLE.emerald };
  if (tone === 'red') return { fill: [254, 226, 226], text: PDF_STYLE.red };
  if (tone === 'amber') return { fill: [254, 243, 199], text: PDF_STYLE.amber };
  return { fill: PDF_STYLE.lightSlate, text: PDF_STYLE.slate };
}

async function urlToDataUrl(url) {
  if (!url) return null;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type?.startsWith('image/')) return null;
    const nativeDataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

    if (getPdfImageFormat(nativeDataUrl)) return nativeDataUrl;

    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function dataUrlToPdfImageData(dataUrl) {
  if (getPdfImageFormat(dataUrl)) return dataUrl;
  if (!dataUrl?.startsWith('data:image/')) return null;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function getDullesLogoDataUrl() {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 120;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#1b75bb';
  context.lineWidth = 10;
  context.beginPath();
  context.moveTo(20, 96);
  context.lineTo(72, 20);
  context.lineTo(124, 96);
  context.stroke();
  context.strokeStyle = '#111827';
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(72, 22);
  context.lineTo(72, 98);
  context.moveTo(46, 98);
  context.lineTo(98, 98);
  context.stroke();
  context.fillStyle = '#1b75bb';
  context.font = '700 25px Arial';
  context.fillText('DULLES', 145, 48);
  context.fillStyle = '#111827';
  context.font = '700 25px Arial';
  context.fillText('ENGINEERING', 145, 80);
  return canvas.toDataURL('image/png');
}

async function getPdfReadyImageData(url, fallbackDataUrl = '') {
  const imageData = await urlToDataUrl(url);
  if (imageData) return imageData;
  return dataUrlToPdfImageData(fallbackDataUrl);
}

function triggerPdfDownload(pdfBlob, fileName) {
  const downloadUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return downloadUrl;
}

function getPdfImageFormat(dataUrl) {
  if (!dataUrl?.startsWith('data:image/')) return null;
  const base64 = dataUrl.split(',')[1];
  if (!base64) return null;

  try {
    const binary = window.atob(base64.slice(0, 32));
    const bytes = Array.from(binary, (character) => character.charCodeAt(0));
    const isPng =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

    if (isPng) return 'PNG';
    if (isJpeg) return 'JPEG';
  } catch {
    return null;
  }

  return null;
}

function addPdfImageSafely(doc, imageData, x, y, width, height) {
  const imageFormat = getPdfImageFormat(imageData);
  if (!imageData || !imageFormat) return false;

  try {
    doc.addImage(imageData, imageFormat, x, y, width, height);
    return true;
  } catch (error) {
    console.warn('Skipping PDF image with invalid signature', error);
    return false;
  }
}

function getAttachmentAccessText(attachment) {
  if (attachment.url) return attachment.url;
  if (attachment.storagePath) return `${ATTACHMENT_BUCKET}/${attachment.storagePath}`;
  return 'Stored with submitted report';
}

function getAttachmentRecordLabel(attachment, deliveryRecords = []) {
  if (!attachment.deliveryRecordId) return 'Report level';
  const recordIndex = deliveryRecords.findIndex((record) => record.id === attachment.deliveryRecordId);
  if (recordIndex < 0) return 'Delivery record';
  const record = deliveryRecords[recordIndex];
  return `Record #${recordIndex + 1}${record.truck_number ? ` · Truck ${record.truck_number}` : ''}${record.ticket_number ? ` · Ticket ${record.ticket_number}` : ''}`;
}

function isPdfAttachment(attachment) {
  return attachment.type === 'application/pdf' || /\.pdf$/i.test(attachment.name || '');
}

function isTextAttachment(attachment) {
  return attachment.type?.startsWith('text/') || /\.(txt|csv|log|md)$/i.test(attachment.name || '');
}

function isDocxAttachment(attachment) {
  return (
    attachment.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.docx$/i.test(attachment.name || '')
  );
}

async function getAttachmentArrayBuffer(attachment, accessUrl) {
  if (attachment.file) return attachment.file.arrayBuffer();
  if (!accessUrl) return null;
  const response = await fetch(accessUrl);
  if (!response.ok) return null;
  return response.arrayBuffer();
}

async function getAttachmentText(attachment, accessUrl) {
  if (attachment.file) return attachment.file.text();
  if (!accessUrl) return '';
  const response = await fetch(accessUrl);
  if (!response.ok) return '';
  return response.text();
}

function parseTimeToMinutes(value) {
  if (!value || typeof value !== 'string' || !value.includes(':')) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (meridiem === 'PM' && hours < 12) hours += 12;
  return hours * 60 + minutes;
}

function calculateActualMinutes(timeBatched, finishUnload) {
  const batchedMinutes = parseTimeToMinutes(timeBatched);
  const finishMinutes = parseTimeToMinutes(finishUnload);
  if (batchedMinutes === null || finishMinutes === null) return '';
  const sameDayDifference = finishMinutes - batchedMinutes;
  return String(sameDayDifference >= 0 ? sameDayDifference : sameDayDifference + 24 * 60);
}

function toProjectPrefix(projectName) {
  const initials = String(projectName || '')
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/gi, '').charAt(0))
    .join('')
    .toUpperCase();
  return initials || 'PRJ';
}

function generateSetNumber(projectName, recordIndex) {
  const prefix = toProjectPrefix(projectName);
  const sequence = String(recordIndex + 1).padStart(2, '0');
  return `${prefix}-${sequence}`;
}

function generateSetNumberWithOffset(projectName, recordIndex, sequenceOffset = 0) {
  const prefix = toProjectPrefix(projectName);
  const sequence = String(sequenceOffset + recordIndex + 1).padStart(2, '0');
  return `${prefix}-${sequence}`;
}

async function fetchProjectSetNumberOffset(projectId, currentReportId = null) {
  try {
    const { data: logs, error: logsError } = await supabase
      .from('concrete_test_logs')
      .select('id')
      .eq('project_id', Number(projectId));

    if (logsError) throw logsError;
    const logIds = (logs || [])
      .map((item) => item.id)
      .filter((id) => String(id) !== String(currentReportId || ''));
    if (logIds.length === 0) return 0;

    const { count, error: recordsError } = await supabase
      .from('concrete_delivery_testing_records')
      .select('*', { count: 'exact', head: true })
      .in('log_id', logIds);

    if (recordsError) throw recordsError;
    return count || 0;
  } catch (err) {
    console.error('Failed to fetch set number sequence:', err);
    return 0;
  }
}

function enrichDeliveryRecords(records, projectInfo, sequenceOffset = 0) {
  return records.map((record, index) => {
    const calculatedMinutes = calculateActualMinutes(record.time_batched, record.finish_unload);
    return {
      ...record,
      actual_minutes: calculatedMinutes || record.actual_minutes || '',
      set_number: record.set_number || generateSetNumberWithOffset(projectInfo.project_name, index, sequenceOffset)
    };
  });
}

function setPdfText(doc, color = PDF_STYLE.navy, size = 10, style = 'normal') {
  doc.setTextColor(...color);
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
}

function ensurePdfSpace(doc, cursor, neededHeight, margins) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursor.y + neededHeight <= pageHeight - margins.bottom) return cursor;
  doc.addPage();
  return { ...cursor, y: margins.top };
}

function drawStatusBadge(doc, label, tone, x, y, width = 70) {
  const badgeLabel = String(label).toUpperCase();
  const colors = getRecordStatusColors(tone);
  setPdfText(doc, colors.text, 8, 'bold');
  const fittedWidth = Math.max(width, doc.getTextWidth(badgeLabel) + 16);
  const fittedX = x - Math.max(0, fittedWidth - width);
  doc.setFillColor(...colors.fill);
  doc.roundedRect(fittedX, y, fittedWidth, 18, 7, 7, 'F');
  doc.text(badgeLabel, fittedX + fittedWidth / 2, y + 12, { align: 'center' });
}

function drawSectionTitle(doc, title, cursor, margins) {
  cursor = ensurePdfSpace(doc, cursor, 36, margins);
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_STYLE.navy);
  doc.roundedRect(margins.left, cursor.y, pageWidth - margins.left - margins.right, 24, 6, 6, 'F');
  setPdfText(doc, PDF_STYLE.white, 10, 'bold');
  doc.text(title.toUpperCase(), margins.left + 12, cursor.y + 16);
  return { ...cursor, y: cursor.y + 34 };
}

function drawFieldCard(doc, label, value, x, y, width, height = 42) {
  doc.setFillColor(...PDF_STYLE.lightSlate);
  doc.setDrawColor(...PDF_STYLE.border);
  doc.roundedRect(x, y, width, height, 6, 6, 'FD');
  setPdfText(doc, PDF_STYLE.slate, 7, 'bold');
  doc.text(String(label).toUpperCase(), x + 8, y + 13);
  setPdfText(doc, PDF_STYLE.navy, 9, 'bold');
  const valueLines = doc.splitTextToSize(pdfValue(value), width - 16);
  doc.text(valueLines.slice(0, 2), x + 8, y + 27);
}

function renderFieldGrid(doc, fields, cursor, margins, columns = 2) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 10;
  const cardWidth = (pageWidth - margins.left - margins.right - gap * (columns - 1)) / columns;
  const cardHeight = 44;
  let x = margins.left;
  let y = cursor.y;

  fields.forEach((field, index) => {
    if (index > 0 && index % columns === 0) {
      x = margins.left;
      y += cardHeight + gap;
    }

    const nextCursor = ensurePdfSpace(doc, { ...cursor, y }, cardHeight + 10, margins);
    if (nextCursor.y !== y) {
      y = nextCursor.y;
      x = margins.left;
    }

    drawFieldCard(doc, field.label, field.value, x, y, cardWidth, cardHeight);
    x += cardWidth + gap;
  });

  return { ...cursor, y: y + cardHeight + 14 };
}

async function renderHeader(doc, context, cursor, margins) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const headerHeight = 96;
  const contentWidth = pageWidth - margins.left - margins.right;

  doc.setFillColor(...PDF_STYLE.navy);
  doc.roundedRect(margins.left, cursor.y, contentWidth, headerHeight, 10, 10, 'F');

  const companyLogo = await getPdfReadyImageData(context.companyLogoUrl, getDullesLogoDataUrl());
  const companyLogoRendered = addPdfImageSafely(doc, companyLogo, margins.left + 12, cursor.y + 13, 68, 34);
  if (!companyLogoRendered) {
    doc.setFillColor(...PDF_STYLE.white);
    doc.roundedRect(margins.left + 14, cursor.y + 18, 52, 42, 8, 8, 'F');
    setPdfText(doc, PDF_STYLE.navy, 13, 'bold');
    doc.text('DE', margins.left + 40, cursor.y + 45, { align: 'center' });
  }
  setPdfText(doc, PDF_STYLE.white, 10, 'bold');
  doc.text(pdfValue(context.companyName), margins.left + 14, cursor.y + 64);
  setPdfText(doc, [203, 213, 225], 6.5, 'normal');
  doc.text('Construction QA/QC Inspection Services', margins.left + 14, cursor.y + 76);

  const clientLogo = await urlToDataUrl(context.clientLogoUrl);
  addPdfImageSafely(doc, clientLogo, pageWidth - margins.right - 62, cursor.y + 18, 48, 48);

  setPdfText(doc, PDF_STYLE.white, 20, 'bold');
  doc.text('Concrete Test Log', pageWidth / 2, cursor.y + 31, { align: 'center' });
  setPdfText(doc, [203, 213, 225], 10, 'bold');
  doc.text(pdfValue(context.projectName), pageWidth / 2, cursor.y + 49, { align: 'center' });

  setPdfText(doc, [226, 232, 240], 8, 'normal');
  doc.text(`DFR: ${pdfValue(context.dfrNumber)}`, pageWidth / 2, cursor.y + 68, { align: 'center' });
  doc.text(`Date Sampled: ${context.dateSampled}`, pageWidth / 2, cursor.y + 81, { align: 'center' });

  drawStatusBadge(doc, context.status, context.statusTone, pageWidth - margins.right - 92, cursor.y + 70, 78);
  setPdfText(doc, [226, 232, 240], 8, 'bold');
  doc.text(`Generated: ${context.generatedAt}`, margins.left + 14, cursor.y + 90);

  return { ...cursor, y: cursor.y + headerHeight + 18 };
}

function renderProjectInfo(doc, context, cursor, margins) {
  cursor = drawSectionTitle(doc, 'Project Information', cursor, margins);
  return renderFieldGrid(doc, [
    { label: 'Project Number', value: context.projectInfo.project_number },
    { label: 'Project Name', value: context.projectInfo.project_name },
    { label: 'General Contractor', value: context.projectInfo.general_contractor },
    { label: 'GC Representative', value: context.projectInfo.gc_representative },
    { label: 'Project Location', value: context.projectInfo.project_location },
    { label: 'Technician Name', value: context.projectInfo.technician_name },
    { label: 'Weather', value: context.weather },
    { label: 'Batch Plant', value: context.batchPlant },
    { label: 'Mix No.', value: context.mixDesign },
    { label: 'DFR Number', value: context.dfrNumber }
  ], cursor, margins, 2);
}

function renderSpecifications(doc, context, cursor, margins) {
  cursor = drawSectionTitle(doc, 'Inspection Requirements', cursor, margins);
  const specs = context.specifications;
  const contentWidth = doc.internal.pageSize.getWidth() - margins.left - margins.right;
  const labelWidth = 118;
  const valueWidth = (contentWidth - (labelWidth * 2)) / 2;

  autoTable(doc, {
    startY: cursor.y,
    margin: { left: margins.left, right: margins.right },
    theme: 'grid',
    body: [
      [
        'Air Content (%)',
        pdfValue(specs.air_content_percent),
        'Unit Weight (lbs/ft³)',
        pdfValue(specs.unit_weight_lbs_ft3)
      ],
      [
        'Slump (in)',
        pdfValue(specs.slump_in),
        'Concrete Temp (°F)',
        pdfValue(specs.concrete_temp_f)
      ],
      [
        'Spread (in)',
        pdfValue(specs.spread_in),
        'J-Ring (in)',
        pdfValue(specs.j_ring_in)
      ],
      [
        'Specified Strength (PSI)',
        pdfValue(context.strengthRequirement),
        'Mix Number',
        pdfValue(specs.mix_number)
      ],
      [
        'Inspector Comments',
        pdfValue(specs.comments),
        '',
        ''
      ]
    ],
    styles: {
      fontSize: 8.5,
      cellPadding: 4,
      textColor: PDF_STYLE.navy,
      lineColor: PDF_STYLE.border,
      lineWidth: 0.4,
      minCellHeight: 20,
      overflow: 'linebreak',
      valign: 'middle'
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: PDF_STYLE.lightSlate, textColor: PDF_STYLE.slate, cellWidth: labelWidth },
      1: { cellWidth: valueWidth },
      2: { fontStyle: 'bold', fillColor: PDF_STYLE.lightSlate, textColor: PDF_STYLE.slate, cellWidth: labelWidth },
      3: { cellWidth: valueWidth }
    }
  });

  return { ...cursor, y: doc.lastAutoTable.finalY + 14 };
}

function renderDeliveryRecords(doc, context, cursor, margins) {
  if (doc.internal.pageSize.getWidth() < doc.internal.pageSize.getHeight()) {
    doc.addPage('letter', 'landscape');
    cursor = { ...cursor, y: margins.top };
  }

  cursor = drawSectionTitle(doc, 'Concrete Delivery & Testing Records', cursor, margins);
  if (!context.deliveryRecords.length) {
    setPdfText(doc, PDF_STYLE.slate, 10, 'bold');
    doc.text('No delivery records entered.', margins.left, cursor.y + 12);
    return { ...cursor, y: cursor.y + 28 };
  }

  autoTable(doc, {
    startY: cursor.y,
    margin: { left: 24, right: 24, top: margins.top, bottom: margins.bottom },
    theme: 'grid',
    showHead: 'everyPage',
    head: [[
      'Test #',
      'Ticket #',
      'Truck #',
      'CY',
      'Batch',
      'Arrival',
      'Tested',
      'Finish',
      'Min',
      'Water',
      'Status',
      'Air °F',
      'Conc °F',
      'Slump',
      'Air %',
      'Unit Wt',
      'Spread',
      'J-Ring',
      'Set #',
      'Lab',
      'Field',
      'Comments'
    ]],
    body: context.deliveryRecords.map((record, index) => {
      const recordStatus = getRecordStatus(record, context.status);
      return [
        pdfValue(record.test_number, String(index + 1)),
        pdfValue(record.ticket_number),
        pdfValue(record.truck_number),
        pdfValue(record.cubic_yards, '0'),
        pdfValue(record.time_batched),
        pdfValue(record.arrival_time),
        pdfValue(record.time_tested),
        pdfValue(record.finish_unload),
        pdfValue(record.actual_minutes),
        pdfValue(record.water_added_gal, '0'),
        recordStatus.label,
        pdfValue(record.air_temp_f),
        pdfValue(record.concrete_temp_f),
        pdfValue(record.slump_in),
        pdfValue(record.air_content_percent),
        pdfValue(record.unit_weight_lbs_ft3),
        pdfValue(record.spread_in),
        pdfValue(record.j_ring_in),
        pdfValue(record.set_number),
        pdfValue(record.lab_cylinders, '0'),
        pdfValue(record.field_cylinders, '0'),
        pdfValue(record.comments)
      ];
    }),
    styles: {
      fontSize: 5.7,
      cellPadding: { top: 2.2, right: 1.5, bottom: 2.2, left: 1.5 },
      overflow: 'linebreak',
      textColor: PDF_STYLE.navy,
      lineColor: PDF_STYLE.border,
      lineWidth: 0.35,
      minCellHeight: 13,
      valign: 'middle',
      halign: 'center'
    },
    headStyles: {
      fillColor: PDF_STYLE.navy,
      textColor: PDF_STYLE.white,
      fontStyle: 'bold',
      fontSize: 5.6,
      minCellHeight: 18
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 32 },
      2: { cellWidth: 32 },
      3: { cellWidth: 20 },
      4: { cellWidth: 29 },
      5: { cellWidth: 29 },
      6: { cellWidth: 29 },
      7: { cellWidth: 29 },
      8: { cellWidth: 22 },
      9: { cellWidth: 26 },
      10: { cellWidth: 36, halign: 'left' },
      11: { cellWidth: 24 },
      12: { cellWidth: 28 },
      13: { cellWidth: 26 },
      14: { cellWidth: 22 },
      15: { cellWidth: 32 },
      16: { cellWidth: 28 },
      17: { cellWidth: 28 },
      18: { cellWidth: 24 },
      19: { cellWidth: 20 },
      20: { cellWidth: 22 },
      21: { cellWidth: 54, halign: 'left' },
      22: { cellWidth: 30, halign: 'left' },
      23: { cellWidth: 44, halign: 'left' }
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 10) return;
      const status = String(data.cell.raw).toLowerCase();
      if (status.includes('fail')) {
        data.cell.styles.textColor = PDF_STYLE.red;
        data.cell.styles.fontStyle = 'bold';
      } else if (status.includes('warning') || status.includes('review')) {
        data.cell.styles.textColor = PDF_STYLE.amber;
        data.cell.styles.fontStyle = 'bold';
      } else if (status.includes('pass')) {
        data.cell.styles.textColor = PDF_STYLE.emerald;
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  return { ...cursor, y: doc.lastAutoTable.finalY + 18 };
}

function renderSummary(doc, context, cursor, margins) {
  cursor = drawSectionTitle(doc, 'QA/QC Summary', cursor, margins);
  const summaryCards = [
    { label: 'Total Records', value: context.summary.totalRecords, tone: PDF_STYLE.blue },
    { label: 'Total Cubic Yards', value: context.summary.totalCubicYards.toFixed(1), tone: PDF_STYLE.blue },
    { label: 'Total Cylinders', value: context.summary.totalLabCylinders + context.summary.totalFieldCylinders, tone: PDF_STYLE.blue },
    { label: 'Passed Tests', value: context.summary.passedTests, tone: PDF_STYLE.emerald },
    { label: 'Failed Tests', value: context.summary.failedTests, tone: PDF_STYLE.red },
    { label: 'Pending Review', value: context.summary.pendingReview, tone: PDF_STYLE.amber }
  ];

  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 10;
  const columns = 3;
  const cardWidth = (pageWidth - margins.left - margins.right - gap * (columns - 1)) / columns;
  let x = margins.left;
  let y = cursor.y;

  summaryCards.forEach((card, index) => {
    if (index > 0 && index % columns === 0) {
      x = margins.left;
      y += 56;
    }
    cursor = ensurePdfSpace(doc, { ...cursor, y }, 52, margins);
    y = cursor.y;
    doc.setFillColor(...PDF_STYLE.lightSlate);
    doc.roundedRect(x, y, cardWidth, 44, 8, 8, 'F');
    doc.setFillColor(...card.tone);
    doc.roundedRect(x, y, 5, 44, 3, 3, 'F');
    setPdfText(doc, PDF_STYLE.slate, 7, 'bold');
    doc.text(card.label.toUpperCase(), x + 14, y + 14);
    setPdfText(doc, PDF_STYLE.navy, 18, 'bold');
    doc.text(String(card.value), x + 14, y + 35);
    x += cardWidth + gap;
  });

  return { ...cursor, y: y + 60 };
}

async function renderPdfAttachmentPages(doc, attachment, accessUrl, cursor, margins) {
  const arrayBuffer = await getAttachmentArrayBuffer(attachment, accessUrl);
  if (!arrayBuffer) return cursor;

  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  const pdfDocument = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margins.left - margins.right;
  const maxImageHeight = pageHeight - margins.top - margins.bottom - 24;

  for (let pageIndex = 1; pageIndex <= pdfDocument.numPages; pageIndex += 1) {
    const page = await pdfDocument.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement('canvas');
    const context2d = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context2d, viewport }).promise;

    const imageData = canvas.toDataURL('image/jpeg', 0.92);
    const imageRatio = canvas.width / canvas.height;
    let renderWidth = contentWidth;
    let renderHeight = renderWidth / imageRatio;
    if (renderHeight > maxImageHeight) {
      renderHeight = maxImageHeight;
      renderWidth = renderHeight * imageRatio;
    }

    cursor = ensurePdfSpace(doc, cursor, renderHeight + 24, margins);
    setPdfText(doc, PDF_STYLE.slate, 7, 'bold');
    doc.text(
      `${pdfValue(attachment.name)}${pdfDocument.numPages > 1 ? ` · Page ${pageIndex} of ${pdfDocument.numPages}` : ''}`,
      margins.left,
      cursor.y + 8
    );
    addPdfImageSafely(doc, imageData, margins.left + (contentWidth - renderWidth) / 2, cursor.y + 14, renderWidth, renderHeight);
    cursor = { ...cursor, y: cursor.y + renderHeight + 26 };
  }

  return cursor;
}

async function renderImageAttachment(doc, attachment, imageUrl, cursor, margins) {
  const imageData = await urlToDataUrl(imageUrl);
  if (!imageData) return cursor;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margins.left - margins.right;
  const maxImageHeight = pageHeight - margins.top - margins.bottom - 24;
  const image = await new Promise((resolve) => {
    const nextImage = new window.Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => resolve(null);
    nextImage.src = imageData;
  });

  const imageRatio = image?.width && image?.height ? image.width / image.height : 1.35;
  let renderWidth = contentWidth;
  let renderHeight = renderWidth / imageRatio;
  if (renderHeight > maxImageHeight) {
    renderHeight = maxImageHeight;
    renderWidth = renderHeight * imageRatio;
  }

  cursor = ensurePdfSpace(doc, cursor, renderHeight + 24, margins);
  setPdfText(doc, PDF_STYLE.slate, 7, 'bold');
  doc.text(pdfValue(attachment.name), margins.left, cursor.y + 8);
  addPdfImageSafely(doc, imageData, margins.left + (contentWidth - renderWidth) / 2, cursor.y + 14, renderWidth, renderHeight);
  return { ...cursor, y: cursor.y + renderHeight + 26 };
}

async function renderTextAttachment(doc, attachment, accessUrl, cursor, margins) {
  const text = await getAttachmentText(attachment, accessUrl);
  if (!text) return cursor;
  return renderAttachmentTextBlock(doc, attachment.name, text, cursor, margins);
}

function renderCanvasSlices(doc, title, canvas, cursor, margins) {
  const contentWidth = doc.internal.pageSize.getWidth() - margins.left - margins.right;
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxImageHeight = pageHeight - margins.top - margins.bottom - 24;
  const sourceSliceHeight = Math.max(1, Math.floor(maxImageHeight * canvas.width / contentWidth));
  let sourceY = 0;
  let pageIndex = 1;

  while (sourceY < canvas.height) {
    const sliceHeight = Math.min(sourceSliceHeight, canvas.height - sourceY);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeight;
    const sliceContext = sliceCanvas.getContext('2d');
    sliceContext.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    const imageData = sliceCanvas.toDataURL('image/png');
    const renderHeight = contentWidth * (sliceHeight / canvas.width);
    cursor = ensurePdfSpace(doc, cursor, renderHeight + 24, margins);
    setPdfText(doc, PDF_STYLE.slate, 7, 'bold');
    doc.text(`${pdfValue(title)}${canvas.height > sourceSliceHeight ? ` · Page ${pageIndex}` : ''}`, margins.left, cursor.y + 8);
    addPdfImageSafely(doc, imageData, margins.left, cursor.y + 14, contentWidth, renderHeight);
    cursor = { ...cursor, y: cursor.y + renderHeight + 26 };
    sourceY += sliceHeight;
    pageIndex += 1;
  }

  return cursor;
}

async function renderHtmlAttachment(doc, title, html, cursor, margins) {
  const html2canvas = (await import('html2canvas')).default;
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.boxSizing = 'border-box';
  container.style.padding = '48px';
  container.style.background = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily = 'Arial, Helvetica, sans-serif';
  container.style.fontSize = '14px';
  container.style.lineHeight = '1.45';
  container.innerHTML = `
    <style>
      .embedded-doc h1,.embedded-doc h2,.embedded-doc h3 { margin: 0 0 12px; color: #0f172a; }
      .embedded-doc p { margin: 0 0 10px; }
      .embedded-doc table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      .embedded-doc td,.embedded-doc th { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; }
      .embedded-doc ul,.embedded-doc ol { margin: 0 0 10px 22px; padding: 0; }
      .embedded-doc img { max-width: 100%; height: auto; }
    </style>
    <div class="embedded-doc">${html}</div>
  `;
  document.body.appendChild(container);
  try {
    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true
    });
    return renderCanvasSlices(doc, title, canvas, cursor, margins);
  } finally {
    document.body.removeChild(container);
  }
}

function renderAttachmentTextBlock(doc, title, text, cursor, margins) {
  if (!text) return cursor;

  const contentWidth = doc.internal.pageSize.getWidth() - margins.left - margins.right;
  cursor = ensurePdfSpace(doc, cursor, 40, margins);
  setPdfText(doc, PDF_STYLE.slate, 7, 'bold');
  doc.text(pdfValue(title), margins.left, cursor.y + 8);
  setPdfText(doc, PDF_STYLE.navy, 8, 'normal');
  const lines = doc.splitTextToSize(text, contentWidth);
  for (const line of lines) {
    cursor = ensurePdfSpace(doc, cursor, 12, margins);
    doc.text(line, margins.left, cursor.y + 18);
    cursor = { ...cursor, y: cursor.y + 10 };
  }
  return { ...cursor, y: cursor.y + 12 };
}

async function renderDocxAttachment(doc, attachment, accessUrl, cursor, margins) {
  const arrayBuffer = await getAttachmentArrayBuffer(attachment, accessUrl);
  if (!arrayBuffer) return cursor;
  const mammoth = await import('mammoth/mammoth.browser');
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return renderHtmlAttachment(doc, attachment.name, result.value, cursor, margins);
}

async function renderAttachments(doc, context, cursor, margins) {
  const inlineAttachments = context.attachments.filter((attachment) => !isPdfAttachment(attachment));
  if (!inlineAttachments.length) return cursor;
  cursor = drawSectionTitle(doc, 'Attachments', cursor, margins);

  for (const attachment of inlineAttachments) {
    const freshAccessUrl = attachment.storagePath
      ? await getStorageAccessUrl(ATTACHMENT_BUCKET, attachment.storagePath)
      : attachment.url;
    const imageUrl = attachment.previewUrl?.startsWith('blob:') ? attachment.previewUrl : freshAccessUrl || attachment.previewUrl || attachment.url;

    try {
      if (isPdfAttachment(attachment)) {
        cursor = await renderPdfAttachmentPages(doc, attachment, freshAccessUrl || attachment.previewUrl || attachment.url, cursor, margins);
      } else if (attachment.type?.startsWith('image/')) {
        cursor = await renderImageAttachment(doc, attachment, imageUrl, cursor, margins);
      } else if (isDocxAttachment(attachment)) {
        cursor = await renderDocxAttachment(doc, attachment, freshAccessUrl || attachment.previewUrl || attachment.url, cursor, margins);
      } else if (isTextAttachment(attachment)) {
        cursor = await renderTextAttachment(doc, attachment, freshAccessUrl || attachment.previewUrl || attachment.url, cursor, margins);
      } else {
        cursor = ensurePdfSpace(doc, cursor, 34, margins);
        setPdfText(doc, PDF_STYLE.slate, 8, 'bold');
        doc.text(`${pdfValue(attachment.name)} could not be rendered inline.`, margins.left, cursor.y + 14);
        cursor = { ...cursor, y: cursor.y + 24 };
      }
    } catch (error) {
      console.warn('Attachment could not be embedded in PDF', attachment.name, error);
      cursor = ensurePdfSpace(doc, cursor, 34, margins);
      setPdfText(doc, PDF_STYLE.slate, 8, 'bold');
      doc.text(`${pdfValue(attachment.name)} could not be rendered inline.`, margins.left, cursor.y + 14);
      cursor = { ...cursor, y: cursor.y + 24 };
    }
  }

  return cursor;
}

async function mergePdfAttachments(basePdfBlob, attachments) {
  const pdfAttachments = attachments.filter(isPdfAttachment);
  if (!pdfAttachments.length) return basePdfBlob;

  const { PDFDocument } = await import('pdf-lib');
  const mergedDocument = await PDFDocument.load(await basePdfBlob.arrayBuffer());

  for (const attachment of pdfAttachments) {
    const freshAccessUrl = attachment.storagePath
      ? await getStorageAccessUrl(ATTACHMENT_BUCKET, attachment.storagePath)
      : attachment.url;
    const attachmentBuffer = await getAttachmentArrayBuffer(
      attachment,
      freshAccessUrl || attachment.previewUrl || attachment.url
    );
    if (!attachmentBuffer) continue;

    try {
      const attachmentDocument = await PDFDocument.load(attachmentBuffer);
      const pages = await mergedDocument.copyPages(
        attachmentDocument,
        attachmentDocument.getPageIndices()
      );
      pages.forEach((page) => mergedDocument.addPage(page));
    } catch (error) {
      console.warn('PDF attachment could not be merged as original pages', attachment.name, error);
    }
  }

  const mergedBytes = await mergedDocument.save();
  return new Blob([mergedBytes], { type: 'application/pdf' });
}

async function renderSignatures(doc, cursor, margins, context) {
  cursor = drawSectionTitle(doc, 'Signatures', cursor, margins);
  const pageWidth = doc.internal.pageSize.getWidth();
  const width = (pageWidth - margins.left - margins.right - 20) / 3;
  const labels = ['Technician Signature', 'QA Reviewer Signature', 'Date Approved'];
  const technicianSignature = await urlToDataUrl(context.technicianSignatureUrl);
  const qcSignature = await urlToDataUrl(context.qcSignatureUrl);
  labels.forEach((label, index) => {
    const x = margins.left + index * (width + 10);
    doc.setDrawColor(...PDF_STYLE.border);
    doc.line(x, cursor.y + 36, x + width, cursor.y + 36);
    if (label === 'Technician Signature' && technicianSignature) {
      addPdfImageSafely(doc, technicianSignature, x, cursor.y + 2, width, 30);
    }
    if (label === 'QA Reviewer Signature' && qcSignature) {
      addPdfImageSafely(doc, qcSignature, x, cursor.y + 2, width, 30);
    }
    setPdfText(doc, PDF_STYLE.slate, 8, 'bold');
    doc.text(label.toUpperCase(), x, cursor.y + 50);
    if (label === 'Technician Signature' && context.technicianName) {
      setPdfText(doc, PDF_STYLE.navy, 8, 'normal');
      doc.text(context.technicianName, x, cursor.y + 64);
    }
    if (label === 'QA Reviewer Signature' && context.approvalBy) {
      setPdfText(doc, PDF_STYLE.navy, 8, 'normal');
      doc.text(context.approvalBy, x, cursor.y + 64);
    }
    if (label === 'Date Approved' && context.approvedAt) {
      setPdfText(doc, PDF_STYLE.navy, 8, 'normal');
      doc.text(context.approvedAt, x, cursor.y + 64);
    }
  });
  return { ...cursor, y: cursor.y + 80 };
}

function drawApprovalSeal(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setTextColor(200, 210, 220);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(60);
  doc.text('APPROVED', pageWidth / 2, pageHeight / 2, {
    align: 'center',
    angle: 45
  });
  setPdfText(doc, PDF_STYLE.navy, 10, 'normal');
}

function renderFooter(doc, context, margins) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...PDF_STYLE.border);
    doc.line(margins.left, pageHeight - 34, pageWidth - margins.right, pageHeight - 34);
    setPdfText(doc, PDF_STYLE.slate, 8, 'normal');
    doc.text(context.companyName, margins.left, pageHeight - 19);
    doc.text(`Generated ${context.generatedAt}`, pageWidth / 2, pageHeight - 19, { align: 'center' });
    doc.text(`QCore QA/QC • Rev ${context.revision} • Page ${page} of ${pageCount}`, pageWidth - margins.right, pageHeight - 19, { align: 'right' });
  }
}

function Field({ label, value, onChange, register, name, rules, type = 'text', step, min, max, readOnly = false, error }) {
  const inputClass = `h-11 w-full rounded-2xl border px-3 text-sm font-medium text-slate-900 outline-none transition ${
    readOnly
      ? 'border-slate-200 bg-slate-100 text-slate-600'
      : error
      ? 'border-red-500 bg-white focus:border-red-700 focus:ring-4 focus:ring-red-100'
      : 'border-slate-300 bg-white focus:border-blue-700 focus:ring-4 focus:ring-blue-100'
  }`;

  return (
    <label className={`block min-w-0 ${error ? 'field-error' : ''}`}>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <input
        type={type === 'number' ? 'text' : type}
        step={type === 'number' ? undefined : step}
        min={type === 'number' ? undefined : min}
        max={type === 'number' ? undefined : max}
        readOnly={readOnly}
        value={register ? undefined : value}
        {...(register ? register(name, rules) : { onChange: (event) => onChange(event.target.value) })}
        className={inputClass}
      />
      {error && <span className="mt-1 block text-xs font-semibold text-red-700">{error}</span>}
    </label>
  );
}

function TextAreaField({ label, value, onChange, register, name, error, readOnly = false }) {
  return (
    <label className={`block md:col-span-2 xl:col-span-3 ${error ? 'field-error' : ''}`}>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <textarea
        rows={4}
        readOnly={readOnly}
        value={register ? undefined : value}
        {...(register ? register(name) : { onChange: (event) => onChange(event.target.value) })}
        className={`w-full rounded-2xl border px-3 py-3 text-sm font-medium text-slate-900 outline-none transition ${
          readOnly
            ? 'border-slate-200 bg-slate-100 text-slate-600'
            : error
            ? 'border-red-500 bg-white focus:border-red-700 focus:ring-4 focus:ring-red-100'
            : 'border-slate-300 bg-white focus:border-blue-700 focus:ring-4 focus:ring-blue-100'
        }`}
      />
      {error && <span className="mt-1 block text-xs font-semibold text-red-700">{error}</span>}
    </label>
  );
}

function RecordStatusField({ value, onChange, readOnly = false }) {
  const options = [
    { value: '', label: 'SELECT RESULT' },
    { value: 'passed', label: 'PASS' },
    { value: 'failed', label: 'FAIL' },
    { value: 'retest', label: 'RETEST' }
  ];

  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        Record Result
      </span>
      <select
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={readOnly}
        className="h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-700 focus:ring-4 focus:ring-blue-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-600"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function ConcreteTestLog() {
  const { projectId, reportId: routeReportId } = useParams();
  const navigate = useNavigate();
  const { session, profile, role } = useAuth();

  const {
    register,
    getValues,
    setValue,
    reset,
    trigger,
    setError,
    clearErrors,
    formState: { errors: formErrors, isDirty },
  } = useForm({
    defaultValues: createDefaultSpecifications(),
    mode: 'onBlur'
  });

  const [projectInfo, setProjectInfo] = useState(() => createDefaultObject(projectInfoFields));
  const [deliveryRecords, setDeliveryRecords] = useState(() => [createDeliveryRecord(0)]);
  const [recordFieldErrors, setRecordFieldErrors] = useState({});
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [collapsedRecords, setCollapsedRecords] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [reportId, setReportId] = useState(() => routeReportId || window.sessionStorage.getItem(getReportSessionKey(projectId)) || null);
  const [status, setStatus] = useState(REPORT_STATUS.DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [revisionNo, setRevisionNo] = useState(1);
  const [approvalBy, setApprovalBy] = useState('');
  const [approvedAt, setApprovedAt] = useState('');
  const [qcSignatureUrl, setQcSignatureUrl] = useState('');
  const [hasNonFormChanges, setHasNonFormChanges] = useState(false);
  const [errors, setErrors] = useState([]);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [generatedPdf, setGeneratedPdf] = useState(null);
  const [pdfGenerationStatus, setPdfGenerationStatus] = useState('');
  const [technicianSignature, setTechnicianSignature] = useState('');
  const [weatherLookupStatus, setWeatherLookupStatus] = useState('');
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const stepIds = useMemo(() => workflowSections.map((step) => step.id), []);
  const activeStepId = stepIds[activeStepIndex] || 'project';
  const lastAutosaveRef = useRef('');
  const reportIdRef = useRef(reportId);
  const createDraftPromiseRef = useRef(null);
  const deliveryRecordRowIdsRef = useRef({});
  const removedDeliveryRecordIdsRef = useRef([]);
  const pdfGenerationInProgressRef = useRef(false);
  const weatherLookupAttemptedRef = useRef(false);
  const setNumberSequenceOffsetRef = useRef(0);

  const isLocked = isStatusLocked(status);
  const hasUnsavedChanges = isDirty || hasNonFormChanges;

  const visibleSpecificationFields = specificationFields.filter((field) => field.type !== 'textarea');
  const specificationCommentsField = specificationFields.find((field) => field.key === 'comments');
  const currentSpecifications = getValues();
  const deliveryReviewRows = getDeliveryReviewRows(deliveryRecords, status);

  const summary = useMemo(() => {
    const totalCubicYards = deliveryRecords.reduce(
      (sum, record) => sum + (toNullableNumber(record.cubic_yards) || 0),
      0
    );
    const totalLabCylinders = deliveryRecords.reduce(
      (sum, record) => sum + (toNullableNumber(record.lab_cylinders) || 0),
      0
    );
    const totalFieldCylinders = deliveryRecords.reduce(
      (sum, record) => sum + (toNullableNumber(record.field_cylinders) || 0),
      0
    );
    const failedTests = deliveryRecords.filter((record) => {
      return ['FAIL', 'Needs Correction'].includes(getRecordStatus(record, status).label);
    }).length;
    const passedTests = deliveryRecords.filter((record) => {
      return getRecordStatus(record, status).label === 'PASS';
    }).length;
    const pendingReview = deliveryRecords.filter((record) => {
      return ['Pending', 'Needs Review', 'Ready for Review', 'QA Review', 'RETEST'].includes(getRecordStatus(record, status).label);
    }).length;
    const completionPercent = deliveryRecords.length
      ? Math.round(((passedTests + failedTests) / deliveryRecords.length) * 100)
      : 0;

    return {
      totalRecords: deliveryRecords.length,
      totalCubicYards,
      totalLabCylinders,
      totalFieldCylinders,
      passedTests,
      failedTests,
      pendingReview,
      completionPercent
    };
  }, [deliveryRecords, status]);

  const stepCompletion = {
    project: getStepCompletion('project', projectInfo, currentSpecifications, deliveryRecords, attachments),
    specifications: getStepCompletion('specifications', projectInfo, currentSpecifications, deliveryRecords, attachments),
    records: getStepCompletion('records', projectInfo, currentSpecifications, deliveryRecords, attachments),
    attachments: getStepCompletion('attachments', projectInfo, currentSpecifications, deliveryRecords, attachments),
    summary: getStepCompletion('summary', projectInfo, currentSpecifications, deliveryRecords, attachments)
  };

  const workflowComplete = stepCompletion.summary;
  const normalizedStatus = normalizeReportStatus(status);
  const isAwaitingQaReview = [
    REPORT_STATUS.SUBMITTED_FOR_QC,
    REPORT_STATUS.UNDER_REVIEW,
    REPORT_STATUS.RESUBMITTED
  ].includes(normalizedStatus);
  const reviewBadgeTone = summary.failedTests > 0 ? 'red' : isAwaitingQaReview ? 'amber' : workflowComplete ? 'emerald' : 'amber';
  const reviewBadgeLabel = summary.failedTests > 0 ? 'Not Ready' : isAwaitingQaReview ? 'Pending Review' : workflowComplete ? 'Ready' : 'Needs Data';
  const hasWorkflowProgress =
    Object.values(projectInfo).some(Boolean) ||
    Object.values(currentSpecifications).some(Boolean) ||
    deliveryRecords.length > 0 ||
    attachments.length > 0;

  const workflowStatus = getStatusLabel(status);

  const stepState = stepIds.reduce((state, stepId, index) => {
    const isComplete = stepCompletion[stepId];
    const isReviewStep = stepId === 'summary';
    const reviewUnlocked =
      stepCompletion.project &&
      stepCompletion.specifications &&
      stepCompletion.records &&
      stepCompletion.attachments;
    const unlocked = !isReviewStep || reviewUnlocked;
    state[stepId] = {
      status: index === activeStepIndex ? 'active' : isComplete ? 'completed' : unlocked ? 'invalid' : 'locked',
      unlocked
    };
    return state;
  }, {});

  const completedSteps = workflowSections.filter((step) => step.id !== 'pdf' && stepCompletion[step.id]);
  const pendingSteps = workflowSections.filter((step) => step.id !== 'pdf' && !stepCompletion[step.id]);
  const reviewStepComplete = activeStepId === 'summary' && workflowComplete;
  const canSubmit = reviewStepComplete && !saving && !isLocked;
  const canGeneratePdf = !saving && (!isLocked || status === REPORT_STATUS.APPROVED || status === REPORT_STATUS.FINALIZED);

  useEffect(() => {
    reportIdRef.current = reportId;
    if (reportId) {
      window.sessionStorage.setItem(getReportSessionKey(projectId), String(reportId));
    }
  }, [projectId, reportId]);

  useEffect(() => {
    return () => {
      if (generatedPdf?.url?.startsWith('blob:')) URL.revokeObjectURL(generatedPdf.url);
    };
  }, [generatedPdf]);

  useEffect(() => {
    async function initializeConcreteLog() {
      setLoading(true);
      setErrors([]);

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const userId = authData?.user?.id;
        const [projectResponse, profileResponse] = await Promise.all([
          supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single(),
          userId
            ? supabase
                .from('profiles')
                .select('full_name')
                .eq('id', userId)
                .single()
            : Promise.resolve({ data: null, error: null })
        ]);

        if (projectResponse.error) throw projectResponse.error;
        if (profileResponse.error) throw profileResponse.error;

          const nextProjectInfo = projectInfoFields.reduce((projectFields, field) => {
            const projectValue = field.sourceColumns
              ? getProjectValue(projectResponse.data, field.sourceColumns)
              : '';
            projectFields[field.key] = projectValue || (field.key === 'technician_name' ? profileResponse.data?.full_name : '');
            return projectFields;
          }, {});

          setNumberSequenceOffsetRef.current = await fetchProjectSetNumberOffset(projectId, reportIdRef.current || routeReportId || null);

	        setProjectInfo(nextProjectInfo);

          const existingDfrNumber = window.sessionStorage.getItem(getDfrSessionKey(projectId));
          const dfrNumber = await getUsableDfrNumber(getValues('dfr_number') || existingDfrNumber, nextProjectInfo.project_number, projectId, reportIdRef.current);
          window.sessionStorage.setItem(getDfrSessionKey(projectId), dfrNumber);
          reset(
            {
              ...getValues(),
              dfr_number: dfrNumber
            },
            { keepDirty: false }
          );
          setValue('dfr_number', dfrNumber, { shouldDirty: false, shouldTouch: false, shouldValidate: false });

          // ONLY auto-load from database if we have a reportId but no data yet,
          // OR if we are explicitly on an edit/details route.
          // DO NOT auto-load abandoned drafts from the database when on the "create" route.
          if (!reportIdRef.current && routeReportId) {
            reportIdRef.current = routeReportId;
            setReportId(routeReportId);
          }

          if (!reportIdRef.current) {
            console.log('Starting fresh concrete test log.');
            setDeliveryRecords(enrichDeliveryRecords([createDeliveryRecord(0)], nextProjectInfo, setNumberSequenceOffsetRef.current));
            setAttachments([]);
            setRevisionNo(1);
            setStatus(REPORT_STATUS.DRAFT);
            reset(createDefaultSpecifications());
            setValue('dfr_number', dfrNumber);
            setLoading(false);
            return;
          }

          if (reportIdRef.current) {
            const { data: savedReport, error: reportError } = await supabase
              .from('concrete_test_logs')
              .select('*')
              .eq('id', reportIdRef.current)
              .single();

            if (!reportError && savedReport) {
              const normalizedStatus = normalizeReportStatus(savedReport.status);
              
              // If we auto-loaded this from sessionStorage but it's already submitted/approved,
              // and we're NOT on an explicit edit route, then clear it and start fresh.
              if (!routeReportId && !['DRAFT', 'REVISION_REQUIRED'].includes(normalizedStatus)) {
                console.log('Clearing finished report from session storage:', reportIdRef.current);
                window.sessionStorage.removeItem(getReportSessionKey(projectId));
                window.sessionStorage.removeItem(getDfrSessionKey(projectId));
                setReportId(null);
                reportIdRef.current = null;
                // Re-run initialization to start fresh
                initializeConcreteLog();
                return;
              }

              setStatus(normalizedStatus);
              setRevisionNo(savedReport.revision_no || 1);
              if (savedReport?.reviewed_by_name || savedReport?.approved_by) setApprovalBy(savedReport.reviewed_by_name || savedReport.approved_by);
              if (savedReport?.approved_at) setApprovedAt(savedReport.approved_at);
              if (savedReport?.qc_signature_url) setQcSignatureUrl(savedReport.qc_signature_url);
              const loadedProjectInfo = mapPayloadToFields(projectInfoFields, savedReport);
              setProjectInfo((previous) => ({ ...previous, ...loadedProjectInfo }));

              const reportDfr = await getUsableDfrNumber(savedReport.dfr_number || dfrNumber, loadedProjectInfo.project_number || nextProjectInfo.project_number, projectId, reportIdRef.current);
              window.sessionStorage.setItem(getDfrSessionKey(projectId), reportDfr);
              let resetValues = {
                ...getValues(),
                dfr_number: reportDfr,
                ...mapPayloadToFields(specificationFields, savedReport)
              };
              setValue('dfr_number', reportDfr, { shouldDirty: false, shouldTouch: false, shouldValidate: false });

              const { data: specData } = await supabase
                .from('concrete_specifications')
                .select('*')
                .eq('log_id', reportIdRef.current)
                .single();

              if (specData) {
                resetValues = {
                  ...resetValues,
                  ...mapPayloadToFields(specificationFields, specData),
                  dfr_number: specData.dfr_number || resetValues.dfr_number
                };
              }

              reset(resetValues, { keepDirty: false });

              const { data: rowsData, error: rowsError } = await supabase
                .from('concrete_delivery_testing_records')
                .select('*')
                .eq('log_id', reportIdRef.current)
                .order('id', { ascending: true });

              if (!rowsError && Array.isArray(rowsData)) {
                setDeliveryRecords(
                  rowsData.map((row, index) => {
                    const record = {
                      ...mapPayloadToFields(deliveryRecordFields, row),
                      id: row.id,
                      test_number: row.test_number || String(index + 1)
                    };
                    deliveryRecordRowIdsRef.current[row.id] = row.id;
                    return record;
                  })
                );
              }

              const { data: attachmentsData, error: attachmentsError } = await supabase
                .from('concrete_attachments')
                .select('*')
                .eq('log_id', reportIdRef.current)
                .order('id', { ascending: true });

              if (!attachmentsError && Array.isArray(attachmentsData)) {
                setAttachments(
                  attachmentsData.map((item) => ({
                    id: crypto.randomUUID(),
                    file: null,
                    category: item.category,
                    name: item.file_name,
                    size: item.file_size,
                    type: item.content_type,
                    previewUrl: item.file_url,
                    uploaded: true,
                    url: item.file_url,
                    storagePath: item.storage_path,
                    deliveryRecordId: item.delivery_record_id || null
                  }))
                );
              }
            }
          }
	      } catch (error) {
        console.error('Concrete log initialization failed', error);
        setErrors(['Project information or technician profile could not be loaded from Supabase.']);
      } finally {
        setLoading(false);
      }
    }

    initializeConcreteLog();
  }, [getValues, projectId, reset, setValue]);

  useEffect(() => {
    if (!loading && !getValues('dfr_number') && projectInfo.project_number) {
      let cancelled = false;
      async function populateDfrNumber() {
        const existingDfrNumber = window.sessionStorage.getItem(getDfrSessionKey(projectId));
        const dfrNumber = await getUsableDfrNumber(existingDfrNumber, projectInfo.project_number, projectId, reportIdRef.current);
        if (cancelled) return;
        window.sessionStorage.setItem(getDfrSessionKey(projectId), dfrNumber);
        setValue('dfr_number', dfrNumber, { shouldDirty: false, shouldTouch: false, shouldValidate: false });
      }
      populateDfrNumber().catch((err) => {
        console.error('Unable to populate DFR number', err);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [loading, projectId, projectInfo, getValues, setValue]);

  useEffect(() => {
    if (loading) return;
    const enrichTimer = window.setTimeout(() => {
      setDeliveryRecords((previous) => {
        const enriched = enrichDeliveryRecords(previous, projectInfo, setNumberSequenceOffsetRef.current);
        const changed = enriched.some((record, index) => (
          record.set_number !== previous[index]?.set_number ||
          record.actual_minutes !== previous[index]?.actual_minutes
        ));
        return changed ? enriched : previous;
      });
    }, 0);
    return () => window.clearTimeout(enrichTimer);
  }, [loading, projectId, projectInfo]);

  const populateWeatherFromLocation = useCallback(async ({ force = false } = {}) => {
    if (isLocked) return;
    if (!force && projectInfo.weather) return;
    if (!force && weatherLookupAttemptedRef.current) return;

    weatherLookupAttemptedRef.current = true;
    setWeatherLookupStatus('Fetching daily high/low...');
    try {
      const weatherSummary = await getDailyWeatherSummary({
        projectLocation: projectInfo.project_location,
        date: new Date().toISOString().slice(0, 10),
        preferGps: true
      });
      setProjectInfo((previous) => ({ ...previous, weather: weatherSummary }));
      setHasNonFormChanges(true);
      setWeatherLookupStatus('Auto populated');
    } catch (error) {
      console.error('Weather lookup failed', error);
      setWeatherLookupStatus('Enter weather manually');
    }
  }, [isLocked, projectInfo.project_location, projectInfo.weather]);

  useEffect(() => {
    if (loading || isLocked || projectInfo.weather || !projectInfo.project_name) return;
    const weatherTimer = window.setTimeout(() => {
      populateWeatherFromLocation();
    }, 0);
    return () => window.clearTimeout(weatherTimer);
  }, [isLocked, loading, populateWeatherFromLocation, projectInfo.project_name, projectInfo.weather]);

  useEffect(() => {
    function warnOnUnload(event) {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', warnOnUnload);
    return () => window.removeEventListener('beforeunload', warnOnUnload);
  }, [hasUnsavedChanges]);

  function updateDeliveryRecord(recordId, fieldName, value) {
    setHasNonFormChanges(true);
    setRecordFieldErrors((previous) => ({ ...previous, [recordId]: {} }));
    setDeliveryRecords((previous) => {
      if (fieldName === 'row_status' && value === 'retest') {
        const sourceIndex = previous.findIndex((record) => record.id === recordId);
        const sourceRecord = previous[sourceIndex];
        if (sourceIndex >= 0 && sourceRecord && !sourceRecord.retestRecordId) {
          const retestId = crypto.randomUUID();
          const retestRecord = {
            ...sourceRecord,
            id: retestId,
            set_number: '',
            row_status: '',
            comments: sourceRecord.comments ? `Retest: ${sourceRecord.comments}` : 'Retest record'
          };
          const updatedSource = { ...sourceRecord, row_status: value, retestRecordId: retestId };
          return renumberRecords([
            ...previous.slice(0, sourceIndex),
            updatedSource,
            retestRecord,
            ...previous.slice(sourceIndex + 1)
          ]);
        }
      }

      const updatedRecords = previous.map((record) => {
        if (record.id !== recordId) return record;
        const nextRecord = { ...record, [fieldName]: value };
        if (['time_batched', 'finish_unload'].includes(fieldName)) {
          nextRecord.actual_minutes = calculateActualMinutes(nextRecord.time_batched, nextRecord.finish_unload);
        }
        return nextRecord;
      });
      return enrichDeliveryRecords(updatedRecords, projectInfo, setNumberSequenceOffsetRef.current);
    });
  }

  async function goToStep(stepId) {
    const nextIndex = stepIds.indexOf(stepId);
    if (nextIndex < 0 || nextIndex === activeStepIndex) return;
    if (!stepState[stepId]?.unlocked) {
      setErrors(['Complete Project Information, Concrete Specifications, and Delivery Records before reviewing the report.']);
      return;
    }

    setActiveStepIndex(nextIndex);
    setErrors([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (!isLocked && hasWorkflowProgress) {
      saveReportData(REPORT_STATUS.DRAFT, { silent: true }).catch(() => {});
    }
  }

  async function goToNextStep() {
    if (activeStepIndex >= stepIds.length - 1) return;
    const isValid = await validateStep(activeStepId, {
      projectInfo,
      specifications: getValues(),
      records: deliveryRecords,
      attachments,
      setErrors,
      setRecordFieldErrors,
      trigger,
      setError,
      clearErrors
    });
    if (!isValid) return;
    const nextStepId = stepIds[activeStepIndex + 1];
    if (nextStepId && !stepState[nextStepId]?.unlocked) {
      setErrors(['Complete Project Information, Concrete Specifications, and Delivery Records before reviewing the report.']);
      return;
    }

    try {
      await saveReportData('draft', { silent: false });
      setActiveStepIndex((previous) => Math.min(previous + 1, stepIds.length - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setErrors([error.message || 'Unable to save your changes before moving to the next section.']);
      return;
    }
  }

  function goToPreviousStep() {
    if (activeStepIndex <= 0) return;
    setActiveStepIndex((previous) => previous - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToCorrectionReview() {
    const reviewIndex = stepIds.indexOf('summary');
    if (reviewIndex < 0) return;
    setActiveStepIndex(reviewIndex);
    setErrors([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renumberRecords(records) {
    return enrichDeliveryRecords(
      records.map((record, index) => ({
        ...record,
        test_number: String(index + 1),
        set_number: record.set_number || generateSetNumberWithOffset(projectInfo.project_name, index, setNumberSequenceOffsetRef.current)
      })),
      projectInfo,
      setNumberSequenceOffsetRef.current
    );
  }

  function addRecord() {
    setHasNonFormChanges(true);
    setDeliveryRecords((previous) => renumberRecords([...previous, createDeliveryRecord(previous.length)]));
  }

  function duplicateRecord(recordId) {
    setHasNonFormChanges(true);
    setDeliveryRecords((previous) => {
      const record = previous.find((item) => item.id === recordId);
      if (!record) return previous;
      return renumberRecords([
        ...previous,
        {
          ...record,
          id: crypto.randomUUID(),
          set_number: '',
          row_status: '',
          retestRecordId: ''
        }
      ]);
    });
  }

  function removeRecord(recordId) {
    setHasNonFormChanges(true);
    setAttachments((previous) => previous.filter((attachment) => attachment.deliveryRecordId !== recordId));
    setDeliveryRecords((previous) => {
      if (previous.length === 1) return previous;
      const persistedRecordId = deliveryRecordRowIdsRef.current[recordId];
      if (persistedRecordId) {
        removedDeliveryRecordIdsRef.current = [
          ...removedDeliveryRecordIdsRef.current,
          persistedRecordId
        ];
        delete deliveryRecordRowIdsRef.current[recordId];
      }
      return renumberRecords(previous.filter((record) => record.id !== recordId));
    });
  }

  function toggleRecord(recordId) {
    setCollapsedRecords((previous) => ({ ...previous, [recordId]: !previous[recordId] }));
  }

  function handleAttachmentFiles(files, category, deliveryRecordId = null) {
    const newAttachments = Array.from(files || []).map((file) => ({
      id: crypto.randomUUID(),
      file,
      category,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      previewUrl: file.type?.startsWith('image/') ? URL.createObjectURL(file) : '',
      uploaded: false,
      url: '',
      storagePath: '',
      deliveryRecordId
    }));
    setAttachments((previous) => [...previous, ...newAttachments]);
    if (newAttachments.length > 0) setHasNonFormChanges(true);
  }

  function removeAttachment(attachmentId) {
    setAttachments((previous) => previous.filter((attachment) => attachment.id !== attachmentId));
    setHasNonFormChanges(true);
  }

  async function handleScanTicket(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setScanLoading(true);
    try {
      const extracted = await scanConcreteTicket(file);
      setOcrResult({
        fileName: file.name,
        recordId: deliveryRecords[0]?.id,
        values: extracted
      });
      handleAttachmentFiles([file], 'scan-ticket', deliveryRecords[0]?.id || null);
    } finally {
      setScanLoading(false);
      event.target.value = '';
    }
  }

  function confirmOcrAutofill() {
    if (!ocrResult?.recordId) return;
    setDeliveryRecords((previous) =>
      previous.map((record) => (record.id === ocrResult.recordId ? { ...record, ...ocrResult.values } : record))
    );
    setHasNonFormChanges(true);
    setOcrResult(null);
  }

  function validateReport() {
    const validationErrors = [];

    workflow_validation.project.required.forEach((key) => {
      if (!projectInfo[key]) validationErrors.push(`${getFieldLabel(projectInfoFields, key)} is required.`);
    });

    validationErrors.push(...getSpecificationValidationErrors(getValues()));

    if (deliveryRecords.length < workflow_validation.records.minRecords) {
      validationErrors.push('At least one delivery record is required.');
    }
    deliveryRecords.forEach((record, index) => {
      Object.values(getRecordValidationErrors(record)).forEach((message) => {
        validationErrors.push(`Record #${index + 1}: ${message}`);
      });
    });

    const hasValidAttachment =
      !workflow_validation.attachments.required ||
      attachments.some((attachment) => workflow_validation.attachments.requiredCategories.includes(attachment.category));
    if (!hasValidAttachment) {
      validationErrors.push('Attach at least one ticket upload or scanned ticket before submitting.');
    }

    return validationErrors;
  }

  const buildLogPayload = useCallback((nextStatus = REPORT_STATUS.DRAFT, nextRevision = revisionNo) => ({
    project_id: Number(projectId),
    status: nextStatus,
    revision_no: nextRevision,
    dfr_number: getValues('dfr_number'),
    rejection_reason: nextStatus === REPORT_STATUS.REJECTED ? undefined : null,
    ...buildPayloadFromFields(projectInfoFields, projectInfo)
  }), [getValues, projectId, projectInfo, revisionNo]);

  const buildSpecificationPayload = useCallback((logId) => ({
    log_id: logId,
    ...buildPayloadFromFields(specificationFields, getValues())
  }), [getValues]);

  const buildDeliveryPayload = useCallback((logId, record) => {
    return {
      log_id: logId,
      ...buildPayloadFromFields(deliveryRecordFields, record)
    };
  }, []);

  const insertConcreteLog = useCallback(async (payload) => {
    return runMutationWithColumnFallback(payload, (nextPayload) =>
      supabase
        .from('concrete_test_logs')
        .insert(nextPayload)
        .select('id')
        .single()
    );
  }, []);

  const updateConcreteLog = useCallback(async (logId, payload) => {
    return runMutationWithColumnFallback(payload, (nextPayload) =>
      supabase
        .from('concrete_test_logs')
        .update(nextPayload)
        .eq('id', logId)
    );
  }, []);

  const uploadPendingAttachments = useCallback(async (logId) => {
    const pendingAttachments = attachments.filter((attachment) => !attachment.uploaded);
    if (pendingAttachments.length === 0) return [];

    const uploaded = [];
    const projectFolder = getProjectStorageFolder(projectInfo, projectId);
    for (const attachment of pendingAttachments) {
      setUploadProgress((previous) => ({ ...previous, [attachment.id]: 25 }));
      const safeName = attachment.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const deliveryRecordRowId = attachment.deliveryRecordId
        ? deliveryRecordRowIdsRef.current[attachment.deliveryRecordId]
        : null;
      const attachmentScope = deliveryRecordRowId ? `records/record_${deliveryRecordRowId}` : 'report';
      const path = `${projectFolder}/concrete-test-logs/log_${logId}/attachments/${attachmentScope}/${attachment.category}-${Date.now()}-${safeName}`;

      const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, attachment.file, {
        contentType: attachment.type,
        upsert: true
      });
      if (error) throw error;

      setUploadProgress((previous) => ({ ...previous, [attachment.id]: 75 }));
      const attachmentUrl = await getStorageAccessUrl(ATTACHMENT_BUCKET, path);
      const uploadedAttachment = {
        ...attachment,
        uploaded: true,
        url: attachmentUrl,
        storagePath: path
      };

      const { error: attachmentError } = await runMutationWithColumnFallback(
        {
          log_id: logId,
          delivery_record_id: deliveryRecordRowId,
          category: attachment.category,
          file_name: attachment.name,
          file_url: attachmentUrl,
          storage_path: path,
          content_type: attachment.type,
          file_size: attachment.size
        },
        (nextPayload) => supabase.from('concrete_attachments').insert(nextPayload)
      );
      if (attachmentError) throw attachmentError;

      uploaded.push(uploadedAttachment);
      setUploadProgress((previous) => ({ ...previous, [attachment.id]: 100 }));
    }

    setAttachments((previous) =>
      previous.map((attachment) => uploaded.find((item) => item.id === attachment.id) || attachment)
    );

    return uploaded;
  }, [attachments, projectId, projectInfo]);

 

  const ensureDraftReport = useCallback(async (nextStatus = 'draft') => {
    console.log('Current reportId:', reportIdRef.current);
    if (reportIdRef.current) return reportIdRef.current;
    if (createDraftPromiseRef.current) return createDraftPromiseRef.current;

    createDraftPromiseRef.current = (async () => {
      const { data, error } = await insertConcreteLog(buildLogPayload(nextStatus));

      if (error) throw error;

      reportIdRef.current = data.id;
      setReportId(data.id);
      window.sessionStorage.setItem(getReportSessionKey(projectId), String(data.id));
      return data.id;
    })();

    try {
      return await createDraftPromiseRef.current;
    } finally {
      createDraftPromiseRef.current = null;
    }
  }, [buildLogPayload, insertConcreteLog, projectId]);

  const persistSpecifications = useCallback(async (logId) => {
    const { error: specificationError } = await runMutationWithColumnFallback(
      buildSpecificationPayload(logId),
      (nextPayload) =>
        supabase
          .from('concrete_specifications')
          .upsert(nextPayload, {
            onConflict: 'log_id'
          })
    );

    if (specificationError) throw specificationError;
  }, [buildSpecificationPayload]);

  const persistDeliveryRecords = useCallback(async (logId) => {
    const removedIds = [...new Set(removedDeliveryRecordIdsRef.current.filter(Boolean))];
    if (removedIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('concrete_delivery_testing_records')
        .delete()
        .in('id', removedIds);
      if (deleteError) throw deleteError;
      removedDeliveryRecordIdsRef.current = [];
    }

    const nextRecordRowIds = { ...deliveryRecordRowIdsRef.current };

    for (const record of deliveryRecords) {
      const recordPayload = buildDeliveryPayload(logId, record);
      const rowId = nextRecordRowIds[record.id];

      if (rowId) {
        const { error: updateError } = await runMutationWithColumnFallback(
          recordPayload,
          (nextPayload) =>
            supabase
              .from('concrete_delivery_testing_records')
              .update(nextPayload)
              .eq('id', rowId)
        );
        if (updateError) throw updateError;
      } else {
        const { data, error: insertError } = await runMutationWithColumnFallback(
          recordPayload,
          (nextPayload) =>
            supabase
              .from('concrete_delivery_testing_records')
              .insert(nextPayload)
              .select('id')
              .single()
        );
        if (insertError) throw insertError;
        if (data?.id) nextRecordRowIds[record.id] = data.id;
      }
    }

    deliveryRecordRowIdsRef.current = nextRecordRowIds;
  }, [buildDeliveryPayload, deliveryRecords]);

  const saveReportData = useCallback(
    async (nextStatus = REPORT_STATUS.DRAFT, { silent = false } = {}) => {
      const desiredStatus = nextStatus === REPORT_STATUS.DRAFT ? getAutoSaveStatus(status) : normalizeReportStatus(nextStatus);
      const nextRevision = status === REPORT_STATUS.REVISION_REQUIRED && desiredStatus !== REPORT_STATUS.REVISION_REQUIRED ? revisionNo + 1 : revisionNo;
      console.log('Current reportId:', reportIdRef.current, 'Desired status:', desiredStatus, 'Revision:', nextRevision);
      if (isLocked && ![REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED, REPORT_STATUS.SUBMITTED_FOR_QC, REPORT_STATUS.UNDER_REVIEW, REPORT_STATUS.RESUBMITTED].includes(desiredStatus)) {
        return reportIdRef.current;
      }
      setSaving(true);
      if (!silent) setErrors([]);

      try {
        const logId = await ensureDraftReport(desiredStatus);
        const logPayload = buildLogPayload(desiredStatus, nextRevision);

        const { error: logUpdateError } = await updateConcreteLog(logId, logPayload);
        if (logUpdateError) throw logUpdateError;

        await persistSpecifications(logId);
        await persistDeliveryRecords(logId);
        await uploadPendingAttachments(logId);

        const savedAt = new Date();
        setLastSavedAt(savedAt);
        reset(getValues());
        setHasNonFormChanges(false);
        setStatus(desiredStatus);
        setRevisionNo(nextRevision);
        lastAutosaveRef.current = JSON.stringify({
          projectInfo,
          specifications: getValues(),
          deliveryRecords,
          attachments: attachments.map(({ id, uploaded }) => ({ id, uploaded }))
        });
        return logId;
      } catch (error) {
        console.error('Concrete test log save failed', error);
        if (!silent) setErrors([error.message || 'Concrete test log could not be saved to Supabase.']);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [
      attachments,
      buildLogPayload,
      deliveryRecords,
      ensureDraftReport,
      getValues,
      persistDeliveryRecords,
      persistSpecifications,
      projectInfo,
      reset,
      revisionNo,
      status,
      updateConcreteLog,
      uploadPendingAttachments,
      isLocked
    ]
  );

  useEffect(() => {
    if (loading || isLocked) return undefined;

    const intervalId = window.setInterval(() => {
      const snapshot = JSON.stringify({
        projectInfo,
        specifications: getValues(),
        deliveryRecords,
        attachments: attachments.map(({ id, uploaded }) => ({ id, uploaded }))
      });

      if (snapshot === lastAutosaveRef.current) return;
      saveReportData('draft', { silent: true }).catch(() => {});
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [attachments, deliveryRecords, getValues, loading, projectInfo, saveReportData, isLocked]);

  async function saveDraft() {
    try {
      return await saveReportData('draft');
    } catch {
      // The save helper already sets user-facing errors.
      return null;
    }
  }

  async function submitReport() {
    if (!canSubmit) {
      setErrors(['Complete all required workflow sections before submitting.']);
      return;
    }
    setShowSubmitConfirmation(true);
  }

  async function confirmSubmitReport() {
    const validationErrors = validateReport();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setShowSubmitConfirmation(false);
      return;
    }
    if (!technicianSignature) {
      setErrors(['Technician digital signature is required before submitting for QA review.']);
      return;
    }

    try {
      const submittingStatus = normalizeReportStatus(status) === REPORT_STATUS.REVISION_REQUIRED
        ? REPORT_STATUS.RESUBMITTED
        : REPORT_STATUS.SUBMITTED_FOR_QC;
      const logId = await saveReportData(REPORT_STATUS.GENERATED);
      const { signatureUrl, signaturePath } = await uploadTechnicianSignature(logId);
      setPdfGenerationStatus('Generating QA review PDF...');
      const { pdfBlob, pdfFileName } = await createEngineeringPdfDocument(submittingStatus, {
        technicianSignatureUrl: signatureUrl
      });
      const { pdfAccessUrl } = await uploadGeneratedPdf(logId, pdfBlob, submittingStatus);
      const submittedAt = new Date().toISOString();
      await runMutationWithColumnFallback(
        {
          status: submittingStatus,
          is_locked: true,
          technician_signature_url: signatureUrl,
          technician_signature_storage_path: signaturePath,
          submitted_at: submittedAt,
          submitted_by: session?.user?.id || null,
          submitted_by_name: profile?.full_name || projectInfo.technician_name,
          submitted_by_email: profile?.email || session?.user?.email || null
        },
        (nextPayload) =>
          supabase
            .from('concrete_test_logs')
            .update(nextPayload)
            .eq('id', logId)
      );
      await addReviewHistory({
        reportId: logId,
        action: submittingStatus,
        remarks: 'Report submitted successfully to QA/QC review.',
        performedBy: session?.user?.id || null,
        performedByName: profile?.full_name || projectInfo.technician_name,
        performedByRole: role
      });
      const reviewUrl = `${window.location.origin}/qc/review/${logId}`;
      const { data: qcProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['qc', 'qc_approver', 'qc_manager', 'admin']);
      const qcRecipients = Array.from(new Set((qcProfiles || [])
        .map((item) => item.email)
        .filter(Boolean)));
      const qcEmail = buildQcReviewEmail({
        report: {
          ...projectInfo,
          dfr_number: getValues('dfr_number'),
          status: submittingStatus,
          submitted_at: submittedAt,
          data_logger: profile?.full_name || projectInfo.technician_name
        },
        reviewUrl,
        pdfUrl: pdfAccessUrl
      });
      await queueAndSendNotification({
        reportId: logId,
        recipientEmail: qcRecipients[0],
        subject: qcEmail.subject,
        html: qcEmail.html,
        notificationType: 'qc_review_required',
        pdfBlob,
        pdfFileName
      });
      setGeneratedPdf((previous) => {
        if (previous?.url?.startsWith('blob:')) URL.revokeObjectURL(previous.url);
        return { url: pdfAccessUrl, name: pdfFileName, generatedAt: new Date() };
      });
      setPdfGenerationStatus('Report submitted successfully to QA/QC review.');
      
      // Clear session storage for this project so the next "New Report" is fresh
      window.sessionStorage.removeItem(getReportSessionKey(projectId));
      window.sessionStorage.removeItem(getDfrSessionKey(projectId));
      
      reset(getValues());
      setHasNonFormChanges(false);
      setStatus(submittingStatus);
      setShowSubmitConfirmation(false);
      navigate(`/project/${projectId}/field-reports/concrete-test-log`);
    } catch (error) {
      console.error('Submit failed', error);
      const message = isStorageBucketError(error)
        ? `Concrete test log saved, but the QA review PDF could not be uploaded. Confirm the "${PDF_BUCKET}" bucket exists and has upload policies.`
        : error.message || 'Concrete test log could not be submitted.';
      setErrors([message]);
      setShowSubmitConfirmation(false);
    }
  }

  async function uploadTechnicianSignature(logId) {
    const signatureBlob = dataUrlToBlob(technicianSignature);
    const projectFolder = getProjectStorageFolder(projectInfo, projectId);
    const technicianName = toSafeStorageName(projectInfo.technician_name);
    const dfrNumber = toSafeStorageName(getValues('dfr_number'));
    const signaturePath = `${projectFolder}/concrete-test-logs/log_${logId}/signatures/${technicianName}_technician_digital_signature_${dfrNumber}.png`;
    const { error } = await supabase.storage.from(SIGNATURE_BUCKET).upload(signaturePath, signatureBlob, {
      contentType: signatureBlob.type,
      upsert: true
    });
    if (error) throw error;

    const signatureUrl = await getStorageAccessUrl(SIGNATURE_BUCKET, signaturePath);
    if (!signatureUrl) throw new Error(`The "${SIGNATURE_BUCKET}" bucket exists, but the app could not create a readable signature URL.`);

    return { signatureUrl, signaturePath };
  }

  async function handleGeneratePdfAction(event) {
    event?.preventDefault();
    if (pdfGenerationInProgressRef.current) return;
    pdfGenerationInProgressRef.current = true;
    try {
      await generateEngineeringPdf();
    } finally {
      pdfGenerationInProgressRef.current = false;
    }
  }

  async function createEngineeringPdfDocument(targetStatus = status, overrides = {}) {
    const normalizedTargetStatus = normalizeReportStatus(targetStatus);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    const margins = { top: 36, right: 40, bottom: 50, left: 40 };
    const specifications = getValues();
    const generatedAt = formatPdfTimestamp(new Date());
    const isFinalApproved = [REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(normalizedTargetStatus);
    const { data: companyLogoStorageData } = await supabase.storage
      .from(PDF_BUCKET)
      .createSignedUrl(COMPANY_LOGO_STORAGE_PATH, 60 * 60 * 24 * 30);
    const pdfContext = {
      projectInfo,
      specifications,
      deliveryRecords,
      attachments,
      summary,
      status: getStatusLabel(normalizedTargetStatus),
      statusTone: getStatusTone(normalizedTargetStatus),
      projectName: projectInfo.project_name,
      technicianName: projectInfo.technician_name,
      technicianSignatureUrl: overrides.technicianSignatureUrl || '',
      qcSignatureUrl: overrides.qcSignatureUrl || qcSignatureUrl,
      reviewerName: projectInfo.qc_rep || 'QA Reviewer',
      approvalBy: approvalBy || projectInfo.qc_rep || 'QA Reviewer',
      approvedAt: approvedAt ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(approvedAt)) : '',
      dfrNumber: specifications.dfr_number,
      dateSampled: new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date()),
      generatedAt,
      weather: projectInfo.weather || 'Not recorded',
      batchPlant: projectInfo.batch_plant || 'Not recorded',
      mixDesign: specifications.mix_number || 'Not recorded',
      strengthRequirement: specifications.strength_spec ? `${specifications.strength_spec}` : 'Not recorded',
      companyName: COMPANY_NAME,
      revision: revisionNo || 1,
      companyLogoUrl: projectInfo.company_logo_url || companyLogoStorageData?.signedUrl || COMPANY_LOGO_URL,
      clientLogoUrl: projectInfo.client_logo_url || ''
    };

      let cursor = { y: margins.top };
      cursor = await renderHeader(doc, pdfContext, cursor, margins);
      cursor = renderProjectInfo(doc, pdfContext, cursor, margins);
      cursor = renderSpecifications(doc, pdfContext, cursor, margins);
      cursor = renderDeliveryRecords(doc, pdfContext, cursor, margins);
      cursor = await renderAttachments(doc, pdfContext, cursor, margins);
      if (isFinalApproved || normalizedTargetStatus === REPORT_STATUS.SUBMITTED_FOR_QC || normalizedTargetStatus === REPORT_STATUS.UNDER_REVIEW || normalizedTargetStatus === REPORT_STATUS.RESUBMITTED) {
        cursor = renderSummary(doc, pdfContext, cursor, margins);
        await renderSignatures(doc, cursor, margins, pdfContext);
        if (isFinalApproved) drawApprovalSeal(doc);
      }
      renderFooter(doc, pdfContext, margins);

    const pdfBlob = await mergePdfAttachments(doc.output('blob'), attachments);
    const pdfFileName = `${pdfContext.dfrNumber || 'concrete-test-log'}.pdf`;
    return { pdfBlob, pdfFileName };
  }

  async function uploadGeneratedPdf(logId, pdfBlob, targetStatus = status) {
    const normalizedTargetStatus = normalizeReportStatus(targetStatus);
    const projectFolder = getProjectStorageFolder(projectInfo, projectId);
    const dfrNumber = toSafeStorageName(getValues('dfr_number'));
    const fileName = `${dfrNumber || `concrete_test_log_${logId}`}.pdf`;
    const path = `${projectFolder}/concrete-test-logs/log_${logId}/pdf/${fileName}`;
    const { error } = await supabase.storage.from(PDF_BUCKET).upload(path, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true
    });
    if (error) throw error;

    const pdfAccessUrl = await getStorageAccessUrl(PDF_BUCKET, path);
    if (!pdfAccessUrl) {
      throw new Error(`The "${PDF_BUCKET}" bucket exists, but the app could not create a readable Storage URL.`);
    }

    const pdfPayload = {
      pdf_url: pdfAccessUrl,
      pdf_storage_path: path
    };
    if ([REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(normalizedTargetStatus)) {
      pdfPayload.final_pdf_url = pdfAccessUrl;
      pdfPayload.status = REPORT_STATUS.FINALIZED;
    }

    const { error: pdfUrlError } = await runMutationWithColumnFallback(
      pdfPayload,
      (nextPayload) =>
        supabase
          .from('concrete_test_logs')
          .update(nextPayload)
          .eq('id', logId)
    );
    if (pdfUrlError) throw pdfUrlError;

    return { pdfAccessUrl, path };
  }

  async function generateEngineeringPdf() {
    console.log('Generate PDF clicked');
    setErrors([]);
    setPdfGenerationStatus('Preparing PDF...');
    try {
      const previewOnly = ![REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(status);
      const logId = reportIdRef.current || (await saveReportData(REPORT_STATUS.DRAFT));
      const { pdfBlob, pdfFileName } = await createEngineeringPdfDocument(status);
      const localPdfUrl = triggerPdfDownload(pdfBlob, pdfFileName);
      setPdfGenerationStatus(previewOnly ? 'Preview generated. Download has started.' : 'Final approved PDF generated.');
      setGeneratedPdf((previous) => {
        if (previous?.url?.startsWith('blob:')) URL.revokeObjectURL(previous.url);
        return { url: localPdfUrl, name: pdfFileName, generatedAt: new Date() };
      });

      try {
        const { pdfAccessUrl } = await uploadGeneratedPdf(logId, pdfBlob, status);
        setGeneratedPdf((previous) => {
          if (previous?.url?.startsWith('blob:')) URL.revokeObjectURL(previous.url);
          return { url: pdfAccessUrl, name: pdfFileName, generatedAt: new Date() };
        });
        setPdfGenerationStatus(previewOnly ? 'PDF downloaded and saved to Supabase.' : 'Final approved PDF generated and saved.');
        if (previewOnly) return;
        setStatus(REPORT_STATUS.FINALIZED);
        window.open(pdfAccessUrl, '_blank', 'noopener,noreferrer');
      } catch (error) {
        if (isStorageBucketError(error)) {
          setErrors([`PDF downloaded locally. Create Supabase Storage bucket "${PDF_BUCKET}" to save and share PDF files from Supabase.`]);
          window.open(localPdfUrl, '_blank', 'noopener,noreferrer');
          return;
        }
        throw error;
      }
    } catch (error) {
      console.error('PDF generation failed', error);
      setPdfGenerationStatus('PDF generation failed.');
      setErrors([error.message || 'PDF could not be generated.']);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm font-semibold text-slate-700">
        Loading concrete QA/QC testing log...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Concrete QA/QC Inspection</p>
            <h1 className="mt-2 text-xl font-semibold text-slate-950 sm:text-2xl">
              {projectInfo.project_name || 'Concrete Test Log'}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <button
              type="button"
              onClick={() => navigate(`/project/${projectId}`)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              <FolderKanban className="h-4 w-4" />
              Project Workspace
            </button>
            <StatusBadge status={status} />
            <span>Autosave: {saving ? 'Saving...' : hasUnsavedChanges ? 'Pending' : formatTimestamp(lastSavedAt)}</span>
            <span>{summary.totalRecords} records</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {projectInfo.rejection_reason && (status === REPORT_STATUS.REVISION_REQUIRED || status === REPORT_STATUS.REJECTED) && (
          <div className="mb-6 rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-rose-600" />
              <div>
                <h3 className="text-base font-bold text-rose-900">Revision Required</h3>
                <p className="mt-1 text-sm text-rose-700">{projectInfo.rejection_reason}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-rose-500">Please address these comments and resubmit.</p>
              </div>
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="rounded-3xl bg-red-50 px-4 py-4 text-sm font-semibold text-red-800">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}

        <div className="space-y-5">
          <div className="sticky top-[76px] z-20 mb-4 overflow-x-auto rounded-full bg-white/95 px-3 py-3 shadow-sm shadow-slate-200/10 ring-1 ring-slate-200/70">
            <div className="flex min-w-max gap-2">
              {workflowSections.map((step, index) => {
                const { status, unlocked } = stepState[step.id] || { status: 'locked', unlocked: false };
                const isActive = status === 'active';
                const isComplete = status === 'completed';
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goToStep(step.id)}
                    disabled={!unlocked}
                    className={`inline-flex min-w-[120px] items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-200/40'
                        : isComplete
                        ? 'bg-emerald-600 text-white'
                        : !unlocked
                        ? 'cursor-not-allowed bg-slate-100 text-slate-400 opacity-70'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] font-bold text-slate-900">
                      {isComplete ? '✓' : index + 1}
                    </span>
                    <span>{step.shortLabel || step.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeStepId === 'project' && (
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Project Information</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-950">Auto-filled report metadata</h2>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {projectInfoFields.map((field) => (
                  <div key={field.key} className="rounded-3xl bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">{field.label}</p>
                    {field.readOnly ? (
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-950">{projectInfo[field.key] || '—'}</p>
                    ) : (
                      <>
                        <input
                          type={field.type || 'text'}
                          value={projectInfo[field.key] || ''}
                          onChange={(event) => {
                            updateProjectInfoField(setProjectInfo, setHasNonFormChanges, field.key, event.target.value);
                            if (field.key === 'weather') setWeatherLookupStatus('Edited manually');
                          }}
                          placeholder={field.key === 'weather' ? 'Auto high/low weather or enter manually' : `Enter ${field.label.toLowerCase()}`}
                          disabled={isLocked}
                          className="mt-2 h-10 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
                        />
                        {field.key === 'weather' && weatherLookupStatus === 'Fetching daily high/low...' && (
                          <div className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading daily high/low...
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={goToNextStep}
                  disabled={saving}
                  className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Next: Specifications
                </button>
              </div>
            </section>
          )}

          {activeStepId === 'specifications' && (
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Concrete Specifications</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-950">Inspection requirements</h2>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {visibleSpecificationFields.map((field) => (
                  <Field
                    key={field.key}
                    label={field.label}
                    type={field.type}
                    step={field.step}
                    min={field.validation?.min}
                    max={field.validation?.max}
                    register={register}
                    name={field.key}
                    rules={getSpecificationRules(field)}
                    readOnly={isLocked || field.readOnly}
                    error={formErrors[field.key]?.message}
                  />
                ))}
                {specificationCommentsField && (
                  <TextAreaField
                    label={specificationCommentsField.label}
                    register={register}
                    name={specificationCommentsField.key}
                    readOnly={isLocked}
                  />
                )}
              </div>
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={goToPreviousStep}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={goToNextStep}
                  disabled={saving}
                  className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Next: Delivery Records
                </button>
              </div>
            </section>
          )}

          {activeStepId === 'records' && (
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Delivery Records</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-950">Truck ticket entries</h2>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <span>{deliveryRecords.length} entries</span>
                  <span>{summary.totalCubicYards.toFixed(1)} yd³</span>
                  <span>{summary.pendingReview > 0 ? `${summary.pendingReview} review` : `${summary.passedTests} passed`}</span>
                </div>
              </div>
              <div className="space-y-4">
                {deliveryRecords.map((record, recordIndex) => {
                  const collapsed = collapsedRecords[record.id];
                  const recordStatus = getRecordStatus(record, status);
                  return (
                    <article key={record.id} className="rounded-3xl bg-slate-50 shadow-sm">
                      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={() => toggleRecord(record.id)}
                          className="flex min-w-0 items-start gap-3 text-left sm:items-center"
                        >
                          <span className="rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">#{recordIndex + 1}</span>
                          <div>
                            <p className="text-sm font-semibold text-slate-950">Truck {record.truck_number || 'Pending'} · Ticket {record.ticket_number || 'Pending'}</p>
                            <p className="text-sm text-slate-600">{record.cubic_yards || '0'} yd³ · {recordStatus.label}</p>
                          </div>
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${badgeClass(recordStatus.tone)}`}>
                            {recordStatus.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => duplicateRecord(record.id)}
                            disabled={isLocked}
                            className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRecord(record.id)}
                            disabled={isLocked || deliveryRecords.length === 1}
                            className="rounded-2xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {!collapsed && (
                        <div className="space-y-4 border-t border-slate-200 px-4 py-4">
                          {recordStatus.messages?.length > 0 && (
                            <div className={`rounded-3xl px-4 py-3 text-sm font-semibold ${badgeClass(recordStatus.tone)}`}>
                              {recordStatus.messages.join(' · ')}
                            </div>
                          )}
                          {deliveryRecordGroups.map((group) => (
                            <div key={group.key} className="rounded-3xl bg-white px-4 py-4 shadow-sm">
                              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{group.title}</div>
                              <div className="grid gap-4 sm:grid-cols-2">
                                {deliveryRecordFields
                                  .filter((field) => field.section === group.key)
                                  .map((field) =>
                                    field.type === 'select' ? (
                                      <RecordStatusField
                                        key={field.key}
                                        value={record[field.key]}
                                        readOnly={isLocked}
                                        onChange={(value) => updateDeliveryRecord(record.id, field.key, value)}
                                      />
                                    ) : field.type === 'textarea' ? (
                                      <TextAreaField
                                        key={field.key}
                                        label={field.label}
                                        value={record[field.key]}
                                        readOnly={isLocked || field.readOnly}
                                        onChange={(value) => updateDeliveryRecord(record.id, field.key, value)}
                                        error={recordFieldErrors[record.id]?.[field.key]}
                                      />
                                    ) : (
                                      <Field
                                        key={field.key}
                                        label={field.label}
                                        type={field.type}
                                        step={field.step}
                                        min={field.validation?.min}
                                        max={field.validation?.max}
                                        value={record[field.key]}
                                        readOnly={isLocked || field.readOnly}
                                        onChange={(value) => updateDeliveryRecord(record.id, field.key, value)}
                                        error={recordFieldErrors[record.id]?.[field.key]}
                                      />
                                    )
                                  )}
                              </div>
                            </div>
                          ))}
                          {recordIndex === deliveryRecords.length - 1 && (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={addRecord}
                                disabled={isLocked}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                              >
                                <Plus className="h-4 w-4" />
                                Add Record
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={goToPreviousStep}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={goToNextStep}
                  disabled={saving}
                  className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Next: Attachments
                </button>
              </div>
            </section>
          )}

          {activeStepId === 'attachments' && (
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Attachments</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-950">Supporting files</h2>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <span>{attachments.length} files</span>
                  <span>{attachments.filter((attachment) => attachment.uploaded).length} uploaded</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {attachmentTypes.map((type) =>
                  type.key === 'scan-ticket' ? (
                    <label key={type.key} className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                      {scanLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                      {type.label}
                      <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleScanTicket} disabled={isLocked || scanLoading} />
                    </label>
                  ) : (
                    <label key={type.key} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                      <UploadCloud className="h-4 w-4" />
                      {type.label}
                      <input type="file" multiple className="hidden" onChange={(event) => handleAttachmentFiles(event.target.files, type.key)} disabled={isLocked} />
                    </label>
                  )
                )}
              </div>

              {ocrResult && (
                <div className="mt-4 rounded-3xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">OCR results ready</p>
                      <p className="mt-1 text-slate-700">
                        {ocrResult.fileName} · Ticket {ocrResult.values.ticket_number || '—'} · Truck {ocrResult.values.truck_number || '—'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={confirmOcrAutofill}
                        className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Confirm Autofill
                      </button>
                      <button
                        type="button"
                        onClick={() => setOcrResult(null)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {attachments.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="rounded-3xl bg-slate-50 px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (attachment.previewUrl) {
                              setAttachmentPreview(attachment);
                              return;
                            }
                            if (attachment.uploaded && attachment.url) {
                              if (attachment.type?.startsWith('image/')) {
                                setAttachmentPreview(attachment);
                              } else {
                                window.open(attachment.url, '_blank', 'noopener,noreferrer');
                              }
                            }
                          }}
                          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-500 transition hover:bg-slate-100"
                          aria-label={attachment.uploaded && attachment.url ? `Open ${attachment.name}` : undefined}
                        >
                          {attachment.previewUrl ? (
                            <img src={attachment.previewUrl} alt="" className="h-full w-full object-cover rounded-2xl" />
                          ) : (
                            <Paperclip className="h-5 w-5" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-950">{attachment.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{attachment.category}</p>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                            <div className="h-2 rounded-full bg-slate-950 transition-all" style={{ width: `${uploadProgress[attachment.id] || (attachment.uploaded ? 100 : 0)}%` }} />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAttachment(attachment.id)}
                          className="rounded-full border border-slate-200 p-2 text-slate-700 hover:bg-slate-100"
                          aria-label={`Delete ${attachment.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={goToPreviousStep}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={goToNextStep}
                  disabled={saving}
                  className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Next: Review & Submit
                </button>
              </div>
            </section>
          )}

          {activeStepId === 'summary' && (
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Review & submit</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-950">Inspection overview</h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${badgeClass(reviewBadgeTone)}`}>
                  {reviewBadgeLabel}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-emerald-50 px-3 py-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-700">Completed Sections</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {completedSteps.length > 0 ? completedSteps.map((step) => step.label).join(', ') : 'No sections complete yet.'}
                  </p>
                </div>
                <div className={`rounded-2xl px-3 py-3 shadow-sm ${pendingSteps.length ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-amber-700">Missing Sections</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {pendingSteps.length > 0 ? pendingSteps.map((step) => step.label).join(', ') : 'None'}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ['Total Records', summary.totalRecords],
                  ['Cubic Yards', summary.totalCubicYards.toFixed(1)],
                  ['Passed', summary.passedTests],
                  ['Failed', summary.failedTests]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 px-3 py-3 shadow-sm">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">{label}</p>
                    <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">PDF project preview</p>
                    <h3 className="mt-0.5 text-sm font-semibold text-slate-950">Project Information</h3>
                  </div>
                  <dl className="grid sm:grid-cols-2">
                    {projectInfoFields.map((field) => (
                      <div key={field.key} className="border-b border-slate-100 px-3 py-2 last:border-b-0 sm:border-r sm:last:border-r-0">
                        <dt className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{field.label}</dt>
                        <dd className="mt-0.5 break-words text-xs font-semibold leading-5 text-slate-950">{pdfValue(projectInfo[field.key])}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">PDF specifications preview</p>
                    <h3 className="mt-0.5 text-sm font-semibold text-slate-950">Inspection Requirements</h3>
                  </div>
                  <dl className="grid sm:grid-cols-2 xl:grid-cols-3">
                    {specificationFields.map((field) => (
                      <div
                        key={field.key}
                        className={`border-b border-slate-100 px-3 py-2 xl:border-r xl:[&:nth-child(3n)]:border-r-0 ${
                          field.type === 'textarea' ? 'sm:col-span-2 xl:col-span-3' : ''
                        } ${field.key === 'dfr_number' ? 'sm:col-span-2 xl:col-span-2' : ''}`}
                      >
                        <dt className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{field.label}</dt>
                        <dd
                          className={`mt-0.5 text-xs font-semibold leading-5 text-slate-950 ${
                            field.key === 'dfr_number'
                              ? 'overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] tracking-tight'
                              : 'break-words'
                          }`}
                          title={pdfValue(currentSpecifications[field.key])}
                        >
                          {pdfValue(currentSpecifications[field.key])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
              <div className="mt-6 rounded-3xl bg-slate-50 p-4 shadow-sm">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">PDF delivery table preview</p>
                    <h3 className="mt-1 text-base font-semibold text-slate-950">Concrete Delivery & Testing Records</h3>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                    {deliveryReviewRows.length} {deliveryReviewRows.length === 1 ? 'record' : 'records'}
                  </span>
                </div>
                {deliveryReviewRows.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="min-w-[1320px] w-full border-collapse text-left text-[11px] text-slate-800">
                      <thead className="bg-slate-950 text-white">
                        <tr>
                          {DELIVERY_REVIEW_COLUMNS.map((column) => (
                            <th key={column.key} scope="col" className="whitespace-nowrap border-r border-slate-700 px-2 py-2 font-semibold last:border-r-0">
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {deliveryReviewRows.map((row, rowIndex) => (
                          <tr key={row.id} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            {DELIVERY_REVIEW_COLUMNS.map((column) => (
                              <td key={`${row.id}-${column.key}`} className="max-w-[160px] border-r border-t border-slate-200 px-2 py-2 align-top font-medium last:border-r-0">
                                {column.key === 'status' ? (
                                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${badgeClass(row.status.tone)}`}>
                                    {row.values[column.key]}
                                  </span>
                                ) : (
                                  <span className="line-clamp-2 break-words">{row.values[column.key]}</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white px-4 py-6 text-sm font-semibold text-slate-500">
                    No delivery records entered.
                  </div>
                )}
              </div>
              <div className="mt-6 flex justify-start">
                <button
                  type="button"
                  onClick={goToPreviousStep}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Previous
                </button>
              </div>
            </section>
          )}

          {activeStepId === 'pdf' && (
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Generate PDF</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-950">Final output</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{getStatusLabel(status)}</span>
              </div>
              <div className="rounded-3xl bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-950">Final package</p>
                <p className="mt-2 text-sm text-slate-600">Generate the official PDF once all sections are completed. The file maps directly to the configured field data.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton
                    label={pdfGenerationStatus === 'Preparing PDF...' ? 'Generating...' : [REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(status) ? 'Generate Final PDF' : 'Preview PDF'}
                    icon={Download}
                    intent="neutral"
                    onClick={handleGeneratePdfAction}
                    disabled={!canGeneratePdf || saving}
                    loading={pdfGenerationStatus === 'Preparing PDF...'}
                  />
                  <ActionButton
                    label="Make Corrections"
                    intent="accent"
                    onClick={goToCorrectionReview}
                  />
                </div>
	                {pdfGenerationStatus && (
	                  <p className="mt-3 text-sm font-semibold text-slate-700">{pdfGenerationStatus}</p>
	                )}
	                {generatedPdf && (
	                  <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
	                    <p className="font-semibold text-slate-950">PDF ready</p>
	                    <ActionButton
                        label={`Download ${generatedPdf.name}`}
                        icon={Download}
                        intent="primary"
                        href={generatedPdf.url}
                        download={generatedPdf.name}
                        className="mt-2"
                      />
	                  </div>
	                )}
	              </div>
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={goToCorrectionReview}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Back to QA/QC Review
                </button>
                <div />
              </div>
            </section>
          )}
        </div>
      </div>

      {showSubmitConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[32px] bg-white p-6 shadow-2xl shadow-slate-950/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Ready to submit for QA review</p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-950">Confirm submission details</h2>
                <p className="mt-2 text-sm font-medium text-slate-600">
                  The QA review PDF will be generated and saved automatically when this report is submitted.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSubmitConfirmation(false)}
                className="rounded-full border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Project</p>
                <p className="mt-2 font-semibold text-slate-950">{projectInfo.project_name || 'Unknown Project'}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Records</p>
                <p className="mt-2 font-semibold text-slate-950">{deliveryRecords.length}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Attachments</p>
                <p className="mt-2 font-semibold text-slate-950">{attachments.length}</p>
              </div>
            </div>
            <div className="mt-6">
              <DigitalSignaturePad
                label="Technician Digital Signature"
                value={technicianSignature}
                onSave={setTechnicianSignature}
                disabled={saving}
                saveLabel="Complete Signature"
                typedSaveLabel="Complete Signature"
              />
              <p className="mt-3 text-xs font-medium text-slate-500">
                Signature file: {toSafeStorageName(projectInfo.technician_name)}_technician_digital_signature_{toSafeStorageName(getValues('dfr_number'))}.png
              </p>
              <p className={`mt-2 text-sm font-semibold ${technicianSignature ? 'text-emerald-700' : 'text-amber-700'}`}>
                {technicianSignature
                  ? 'Signature complete. Submit To QC is now available.'
                  : 'Complete and save the technician signature to unlock Submit To QC.'}
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <ActionButton
                label="Cancel"
                intent="accent"
                onClick={() => setShowSubmitConfirmation(false)}
              />
              <ActionButton
                label="Submit To QC"
                icon={Send}
                intent="neutral"
                onClick={confirmSubmitReport}
                disabled={!technicianSignature || saving}
                loading={saving}
              />
            </div>
          </div>
        </div>
      )}

      {attachmentPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <button
              type="button"
              onClick={() => setAttachmentPreview(null)}
              className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-3 text-slate-900 shadow-sm hover:bg-slate-100"
            >
              Close
            </button>
            <div className="max-h-[80vh] overflow-auto bg-slate-950 p-4">
              <img
                src={attachmentPreview.url || attachmentPreview.previewUrl}
                alt={attachmentPreview.name}
                className="mx-auto max-h-[72vh] object-contain"
              />
            </div>
            <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{attachmentPreview.name}</p>
              <p className="mt-1 text-slate-500">{attachmentPreview.type || 'Attachment'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-inner backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {saving ? 'Saving...' : hasUnsavedChanges ? 'Unsaved changes' : `Saved ${formatTimestamp(lastSavedAt)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton
              label="Save Draft"
              icon={Save}
              intent="accent"
              onClick={saveDraft}
              disabled={saving || isLocked}
              loading={saving}
            />
            {[REPORT_STATUS.APPROVED, REPORT_STATUS.FINALIZED].includes(status) && (
              <ActionButton
                label="Generate Final PDF"
                icon={Image}
                intent="accent"
                onClick={handleGeneratePdfAction}
                disabled={!canGeneratePdf || saving}
              />
            )}
            <ActionButton
              label="Submit To QC"
              icon={Send}
              intent="neutral"
              onClick={submitReport}
              disabled={!canSubmit || saving || isLocked}
              loading={saving}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConcreteTestLog;
