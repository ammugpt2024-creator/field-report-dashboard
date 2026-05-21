export const workflow_validation = {
  project: {
    required: [
      'project_number',
      'project_name',
      'general_contractor',
      'gc_representative',
      'project_location',
      'technician_name'
    ]
  },

  specifications: {
    required: [
      'dfr_number',
      'mix_number',
      'slump_in',
      'air_content_percent',
      'concrete_temp_f'
    ]
  },

  records: {
    minRecords: 1,

    requiredFields: [
      'ticket_number',
      'truck_number',
      'cubic_yards',
      'time_tested',
      'slump_in',
      'concrete_temp_f',
      'air_content_percent'
    ]
  },

  attachments: {
    required: false,
    requiredCategories: []
  }
};
