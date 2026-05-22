import {
  ClipboardCheck,
  Download,
  FileText,
  FlaskConical,
  UploadCloud
} from 'lucide-react';

export const projectInfoFields = [
  {
    key: 'project_number',
    dbColumn: 'project_number',
    label: 'Project Number',
    type: 'text',
    required: true,
    readOnly: false,
    sourceColumns: ['project_number'],
    defaultValue: ''
  },
  {
    key: 'project_name',
    dbColumn: 'project_name',
    label: 'Project Name',
    type: 'text',
    required: true,
    readOnly: false,
    sourceColumns: ['project_name'],
    defaultValue: ''
  },
  {
    key: 'general_contractor',
    dbColumn: 'gc',
    label: 'General Contractor',
    type: 'text',
    required: false,
    readOnly: false,
    sourceColumns: ['gc', 'client_name'],
    defaultValue: ''
  },
  {
    key: 'gc_representative',
    dbColumn: 'gc_rep',
    label: 'GC Representative',
    type: 'text',
    required: false,
    readOnly: false,
    sourceColumns: ['gc_rep', 'client_representative'],
    defaultValue: ''
  },
  {
    key: 'project_location',
    dbColumn: 'location',
    label: 'Project Location',
    type: 'text',
    required: false,
    readOnly: false,
    sourceColumns: ['location', 'project_location'],
    defaultValue: ''
  },
  {
    key: 'technician_name',
    dbColumn: 'data_logger',
    label: 'Technician Name',
    type: 'text',
    required: true,
    readOnly: true,
    sourceColumns: ['data_logger'],
    defaultValue: ''
  },
  {
    key: 'weather',
    dbColumn: 'weather',
    label: 'Weather',
    type: 'text',
    required: false,
    readOnly: false,
    defaultValue: ''
  },
  {
    key: 'batch_plant',
    dbColumn: 'batch_plant',
    label: 'Batch Plant',
    type: 'text',
    required: false,
    readOnly: false,
    defaultValue: ''
  }
];

export const specificationFields = [
  {
    key: 'air_content_percent',
    label: 'Air Content (%)',
    dbColumn: 'air_content',
    type: 'number',
    step: '0.1',
    valueType: 'number',
    required: true,
    validation: { min: 0, max: 15, message: 'Air Content must be between 0 and 15%.' }
  },

  {
    key: 'unit_weight_lbs_ft3',
    label: 'Unit Weight (lbs/ft³)',
    dbColumn: 'unit_weight',
    type: 'number',
    step: '0.1',
    valueType: 'number',
    validation: { min: 80, max: 170, message: 'Unit Weight must be between 80 and 170 lbs/ft³.' }
  },

  {
    key: 'spread_in',
    label: 'Spread (in)',
    dbColumn: 'spread',
    type: 'number',
    step: '0.25',
    valueType: 'number',
    validation: { min: 18, max: 32, message: 'Spread must be between 18 and 32 in for SCC/flowable concrete.' }
  },

  {
    key: 'slump_in',
    label: 'Slump (in)',
    dbColumn: 'slump',
    type: 'number',
    step: '0.25',
    valueType: 'number',
    required: true,
    validation: { min: 0, max: 12, message: 'Slump must be between 0 and 12 in.' }
  },

  {
    key: 'concrete_temp_f',
    label: 'Concrete Temp (°F)',
    dbColumn: 'concrete_temp',
    type: 'number',
    step: '1',
    valueType: 'number',
    required: true,
    validation: { min: 30, max: 120, message: 'Concrete Temp must be between 30 and 120 °F.' }
  },

  {
    key: 'mix_number',
    label: 'Mix No.',
    dbColumn: 'mix_no',
    type: 'text',
    valueType: 'text',
    required: true
  },

  {
    key: 'j_ring_in',
    label: 'J-Ring (in)',
    dbColumn: 'j_ring',
    type: 'number',
    step: '0.25',
    valueType: 'number',
    validation: { min: 0, max: 4, message: 'J-Ring must be between 0 and 4 in.' }
  },

  {
    key: 'speed_of_stress_psi',
    label: 'Speed Of Stress (PSI)',
    dbColumn: 'speed_of_stress',
    type: 'number',
    step: '1',
    valueType: 'number',
    validation: { min: 20, max: 50, message: 'Speed Of Stress should be between 20 and 50 psi/sec.' }
  },

  {
    key: 'report_time',
    label: 'Report Time',
    dbColumn: 'report_time',
    type: 'time',
    valueType: 'text'
  },

  {
    key: 'dfr_number',
    label: 'DFR Number',
    dbColumn: 'dfr_number',
    type: 'text',
    valueType: 'text',
    required: true,
    readOnly: true
  },

  {
    key: 'comments',
    label: 'Comments',
    dbColumn: 'comments',
    type: 'textarea',
    valueType: 'text'
  }
]

export const deliveryRecordFields = [
  { key: 'test_number', dbColumn: 'test_number', label: 'Test Number', type: 'text', valueType: 'number', readOnly: true, required: true, section: 'delivery_details', defaultValue: '' },
  { key: 'ticket_number', dbColumn: 'ticket_number', label: 'Ticket Number', type: 'text', valueType: 'text', required: true, section: 'delivery_details', placeholder: 'Enter ticket number', defaultValue: '' },
  { key: 'truck_number', dbColumn: 'truck_number', label: 'Truck Number', type: 'text', valueType: 'text', required: true, section: 'delivery_details', placeholder: 'Enter truck number', defaultValue: '' },
  { key: 'cubic_yards', dbColumn: 'cubic_yards', label: 'Cubic Yards', type: 'number', step: '0.1', unit: 'yd³', valueType: 'number', required: false, section: 'delivery_details', defaultValue: '', validation: { min: 0.1, max: 20, message: 'Cubic Yards must be between 0.1 and 20 yd³.' } },
  { key: 'mix_design', dbColumn: 'mix_design', label: 'Mix Design', type: 'text', valueType: 'text', required: false, section: 'delivery_details', defaultValue: '' },
  { key: 'time_batched', dbColumn: 'time_batched', label: 'Time Batched', type: 'time', valueType: 'text', required: true, section: 'time_tracking', defaultValue: '' },
  { key: 'arrival_time', dbColumn: 'arrival_time', label: 'Arrival Time', type: 'time', valueType: 'text', required: false, section: 'time_tracking', defaultValue: '' },
  { key: 'time_tested', dbColumn: 'time_tested', label: 'Time Tested', type: 'time', valueType: 'text', required: true, section: 'time_tracking', defaultValue: '' },
  { key: 'finish_unload', dbColumn: 'finish_unload', label: 'Finish Unload', type: 'time', valueType: 'text', required: false, section: 'time_tracking', defaultValue: '' },
  { key: 'actual_minutes', dbColumn: 'actual_minutes', label: 'Actual Minutes', type: 'number', step: '1', valueType: 'number', required: false, section: 'time_tracking', defaultValue: '', validation: { min: 0, max: 180, message: 'Actual Minutes must be between 0 and 180.' } },
  { key: 'water_added_gal', dbColumn: 'water_added_gal', label: 'Water Added (gal)', type: 'number', step: '0.1', valueType: 'number', required: false, section: 'field_test_results', defaultValue: '', validation: { min: 0, max: 50, message: 'Water Added must be between 0 and 50 gal.' } },
  { key: 'air_temp_f', dbColumn: 'air_temp_f', label: 'Air Temp (°F)', type: 'number', step: '1', valueType: 'number', required: false, section: 'field_test_results', defaultValue: '', validation: { min: -20, max: 120, message: 'Air Temp must be between -20 and 120 °F.' } },
  { key: 'concrete_temp_f', dbColumn: 'concrete_temp_f', label: 'Concrete Temp (°F)', type: 'number', step: '1', valueType: 'number', required: false, section: 'field_test_results', defaultValue: '', validation: { min: 30, max: 120, message: 'Concrete Temp must be between 30 and 120 °F.' } },
  { key: 'slump_in', dbColumn: 'slump_in', label: 'Slump (in)', type: 'number', step: '0.25', valueType: 'number', required: false, section: 'field_test_results', defaultValue: '', validation: { min: 0, max: 12, message: 'Slump must be between 0 and 12 in.' } },
  { key: 'air_content_percent', dbColumn: 'air_content_percent', label: 'Air Content (%)', type: 'number', step: '0.1', valueType: 'number', required: false, section: 'field_test_results', defaultValue: '', validation: { min: 0, max: 15, message: 'Air Content must be between 0 and 15%.' } },
  { key: 'unit_weight_lbs_ft3', dbColumn: 'unit_weight_lbs_ft3', label: 'Unit Weight (lbs/ft³)', type: 'number', step: '0.1', valueType: 'number', required: false, section: 'field_test_results', defaultValue: '', validation: { min: 80, max: 170, message: 'Unit Weight must be between 80 and 170 lbs/ft³.' } },
  { key: 'j_ring_in', dbColumn: 'j_ring_in', label: 'J-Ring (in)', type: 'number', step: '0.25', valueType: 'number', required: false, section: 'field_test_results', defaultValue: '', validation: { min: 0, max: 4, message: 'J-Ring must be between 0 and 4 in.' } },
  { key: 'spread_in', dbColumn: 'spread_in', label: 'Spread (in)', type: 'number', step: '0.25', valueType: 'number', required: false, section: 'field_test_results', defaultValue: '', validation: { min: 18, max: 32, message: 'Spread must be between 18 and 32 in for SCC/flowable concrete.' } },
  { key: 'set_number', dbColumn: 'set_number', label: 'Set Number', type: 'text', valueType: 'text', required: false, section: 'cylinder_tracking', defaultValue: '' },
  { key: 'lab_cylinders', dbColumn: 'lab_cylinders', label: 'Lab Cylinders', type: 'number', step: '1', valueType: 'number', required: false, section: 'cylinder_tracking', defaultValue: '', validation: { min: 0, max: 12, message: 'Lab Cylinders must be between 0 and 12.' } },
  { key: 'field_cylinders', dbColumn: 'field_cylinders', label: 'Field Cylinders', type: 'number', step: '1', valueType: 'number', required: false, section: 'cylinder_tracking', defaultValue: '', validation: { min: 0, max: 12, message: 'Field Cylinders must be between 0 and 12.' } },
  { key: 'placement_location', dbColumn: 'placement_location', label: 'Placement Location', type: 'text', valueType: 'text', required: false, section: 'placement_information', defaultValue: '' },
  { key: 'comments', dbColumn: 'comments', label: 'Comments', type: 'textarea', valueType: 'text', required: false, section: 'inspector_notes', defaultValue: '' }
];

export const deliveryRecordGroups = [
  { key: 'delivery_details', title: 'Delivery Details' },
  { key: 'time_tracking', title: 'Time Tracking' },
  { key: 'field_test_results', title: 'Field Test Results' },
  { key: 'cylinder_tracking', title: 'Cylinder Tracking' },
  { key: 'placement_information', title: 'Placement Information' },
  { key: 'inspector_notes', title: 'Inspector Notes' }
];

export const recordSummaryFields = ['truck_number', 'ticket_number', 'cubic_yards', 'mix_design'];

export const attachmentTypes = [
  { key: 'batch-ticket', label: 'Batch Ticket' },
  { key: 'delivery-slip', label: 'Delivery Slip' },
  { key: 'test-photo', label: 'Test Photo' },
  { key: 'cylinder-photo', label: 'Cylinder Photo' },
  { key: 'supporting-document', label: 'Supporting Document' },
  { key: 'scan-ticket', label: 'Scanned Ticket' }
];

export const reportStatusList = [
  'DRAFT',
  'IN_PROGRESS',
  'SUBMITTED_FOR_REVIEW',
  'UNDER_QA_REVIEW',
  'REJECTED',
  'APPROVED',
  'FINALIZED'
];

export const workflowSections = [
  { id: 'project', label: 'Project Information', shortLabel: 'Project Info', icon: FileText },
  { id: 'specifications', label: 'Concrete Specifications', shortLabel: 'Specifications', icon: FlaskConical },
  { id: 'records', label: 'Delivery Records', shortLabel: 'Records', icon: ClipboardCheck },
  { id: 'attachments', label: 'Attachments', shortLabel: 'Attachments', icon: UploadCloud },
  { id: 'summary', label: 'Review & Submit', shortLabel: 'Review', icon: ClipboardCheck },
  { id: 'pdf', label: 'Generate PDF', shortLabel: 'Generate PDF', icon: Download }
];

export const createDefaultObject = (fields) =>
  fields.reduce((accumulator, field) => {
    accumulator[field.key] = field.defaultValue ?? '';
    return accumulator;
  }, {});

export const createDefaultSpecifications = () => createDefaultObject(specificationFields);

export const createDeliveryRecord = (index = 0) => ({
  id: crypto.randomUUID(),
  ...createDefaultObject(deliveryRecordFields),
  test_number: String(index + 1)
});

export default {
  projectInfoFields,
  specificationFields,
  deliveryRecordFields,
  deliveryRecordGroups,
  recordSummaryFields,
  attachmentTypes,
  workflowSections,
  reportStatusList,
  createDefaultObject,
  createDefaultSpecifications,
  createDeliveryRecord
};
