import {
  ClipboardCheck,
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
    label: 'Field Engineer Name',
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
    type: 'text',
    valueType: 'text',
    required: true,
    validation: null
  },

  {
    key: 'unit_weight_lbs_ft3',
    label: 'Unit Weight (lbs/ft³)',
    dbColumn: 'unit_weight',
    type: 'text',
    valueType: 'text',
    validation: null
  },

  {
    key: 'spread_in',
    label: 'Spread (in)',
    dbColumn: 'spread',
    type: 'text',
    valueType: 'text',
    validation: null
  },

  {
    key: 'slump_in',
    label: 'Slump (in)',
    dbColumn: 'slump',
    type: 'text',
    valueType: 'text',
    required: true,
    validation: null
  },

  {
    key: 'concrete_temp_f',
    label: 'Allowable Temp (°F)',
    dbColumn: 'concrete_temp',
    type: 'text',
    valueType: 'text',
    required: true,
    validation: null
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
    type: 'text',
    valueType: 'text',
    validation: null
  },

  {
    key: 'speed_of_stress_psi',
    label: 'Specified Strength (PSI)',
    dbColumn: 'speed_of_stress',
    type: 'text',
    valueType: 'text',
    validation: null
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
  { key: 'test_number', dbColumn: 'test_number', label: 'Test Number', type: 'text', valueType: 'text', readOnly: true, required: true, section: 'delivery_details', defaultValue: '' },
  { key: 'ticket_number', dbColumn: 'ticket_number', label: 'Ticket Number', type: 'text', valueType: 'text', required: true, section: 'delivery_details', placeholder: 'Enter ticket number', defaultValue: '' },
  { key: 'truck_number', dbColumn: 'truck_number', label: 'Truck Number', type: 'text', valueType: 'text', required: true, section: 'delivery_details', placeholder: 'Enter truck number', defaultValue: '' },
  { key: 'cubic_yards', dbColumn: 'cubic_yards', label: 'Cubic Yards', type: 'text', unit: 'yd³', valueType: 'text', required: false, section: 'delivery_details', defaultValue: '', validation: null },
  { key: 'time_batched', dbColumn: 'time_batched', label: 'Time Batched', type: 'time', valueType: 'text', required: true, section: 'time_tracking', defaultValue: '' },
  { key: 'arrival_time', dbColumn: 'arrival_time', label: 'Arrival Time', type: 'time', valueType: 'text', required: false, section: 'time_tracking', defaultValue: '' },
  { key: 'time_tested', dbColumn: 'time_tested', label: 'Time Tested', type: 'time', valueType: 'text', required: true, section: 'time_tracking', defaultValue: '' },
  { key: 'finish_unload', dbColumn: 'finish_unload', label: 'Finish Unload', type: 'time', valueType: 'text', required: false, section: 'time_tracking', defaultValue: '' },
  { key: 'actual_minutes', dbColumn: 'actual_minutes', label: 'Actual Minutes', type: 'text', valueType: 'text', readOnly: true, required: false, section: 'time_tracking', defaultValue: '', validation: null },
  { key: 'water_added_gal', dbColumn: 'water_added_gal', label: 'Water Added (gal)', type: 'text', valueType: 'text', required: false, section: 'field_test_results', defaultValue: '', validation: null },
  { key: 'air_temp_f', dbColumn: 'air_temp_f', label: 'Air Temp (°F)', type: 'text', valueType: 'text', required: false, section: 'field_test_results', defaultValue: '', validation: null },
  { key: 'concrete_temp_f', dbColumn: 'concrete_temp_f', label: 'Material Temp (°F)', type: 'text', valueType: 'text', required: false, section: 'field_test_results', defaultValue: '', validation: null },
  { key: 'slump_in', dbColumn: 'slump_in', label: 'Slump (in)', type: 'text', valueType: 'text', required: false, section: 'field_test_results', defaultValue: '', validation: null },
  { key: 'air_content_percent', dbColumn: 'air_content_percent', label: 'Air Content (%)', type: 'text', valueType: 'text', required: false, section: 'field_test_results', defaultValue: '', validation: null },
  { key: 'unit_weight_lbs_ft3', dbColumn: 'unit_weight_lbs_ft3', label: 'Unit Weight (lbs/ft³)', type: 'text', valueType: 'text', required: false, section: 'field_test_results', defaultValue: '', validation: null },
  { key: 'j_ring_in', dbColumn: 'j_ring_in', label: 'J-Ring (in)', type: 'text', valueType: 'text', required: false, section: 'field_test_results', defaultValue: '', validation: null },
  { key: 'spread_in', dbColumn: 'spread_in', label: 'Spread (in)', type: 'text', valueType: 'text', required: false, section: 'field_test_results', defaultValue: '', validation: null },
  { key: 'strength_verification_required', dbColumn: 'strength_verification_required', label: 'Strength Verification Required?', type: 'select', valueType: 'boolean', required: false, section: 'field_test_results', defaultValue: 'no', options: [
    { value: 'no', label: 'No' },
    { value: 'yes', label: 'Yes' }
  ] },
  { key: 'set_number', dbColumn: 'set_number', label: 'Set Number', type: 'text', valueType: 'text', readOnly: true, required: false, section: 'cylinder_tracking', defaultValue: '' },
  { key: 'lab_cylinders', dbColumn: 'lab_cylinders', label: 'Lab Samples', type: 'text', valueType: 'text', required: false, section: 'cylinder_tracking', defaultValue: '', validation: null },
  { key: 'field_cylinders', dbColumn: 'field_cylinders', label: 'Field Samples', type: 'text', valueType: 'text', required: false, section: 'cylinder_tracking', defaultValue: '', validation: null },
  { key: 'row_status', dbColumn: 'row_status', label: 'Record Result', type: 'select', valueType: 'text', required: true, section: 'strength_result', defaultValue: '' },
  { key: 'comments', dbColumn: 'comments', label: 'Inspector Notes', type: 'textarea', valueType: 'text', required: false, section: 'strength_result', defaultValue: '' }
];

export const deliveryRecordGroups = [
  { key: 'delivery_details', title: 'Delivery Details' },
  { key: 'time_tracking', title: 'Time Tracking' },
  { key: 'field_test_results', title: 'Field Test Results' }
];

export const recordSummaryFields = ['truck_number', 'ticket_number', 'cubic_yards'];

export const attachmentTypes = [
  { key: 'batch-ticket', label: 'Batch Ticket' },
  { key: 'delivery-slip', label: 'Delivery Slip' },
  { key: 'test-photo', label: 'Test Photo' },
  { key: 'cylinder-photo', label: 'Strength Sample Photo' },
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
  { id: 'specifications', label: 'Material Specifications', shortLabel: 'Specifications', icon: FlaskConical },
  { id: 'records', label: 'Material Records', shortLabel: 'Records', icon: ClipboardCheck },
  { id: 'attachments', label: 'Evidence Center', shortLabel: 'Evidence', icon: UploadCloud },
  { id: 'summary', label: 'Review & Submit', shortLabel: 'Review', icon: ClipboardCheck }
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
