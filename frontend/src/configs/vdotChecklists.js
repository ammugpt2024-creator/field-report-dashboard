// VDOT checklist definitions. Both checklists are activity reports stored in
// the daily log payload (activity.reports[]); the page, inline summary and PDF
// are all rendered from these definitions.
//
// Report shape (on top of the usual activity-report fields):
//   checklistKey      "mot" | "te97001"
//   header            { [fieldKey]: value }
//   answers           { [itemId]: { value, priority?, initials?, date?, remarks? } }
//   sectionNA         { [sectionId]: true }   section marked not applicable
//   sectionOptions    { [sectionId]: value }  e.g. Drums vs. Other devices
//   sectionComments   { [sectionId]: text }
//   customItems       [{ id, label }]         MOT only: the blank rows on the form
//   footer            { [fieldKey]: value }

// Type strings must not contain words the other report detectors match on
// ("sample", "proctor", "asphalt", "compaction", "density", "nuclear",
// "infiltration"), or the report would be routed to the wrong screen.
export const MOT_REPORT_TYPE = "VDOT Maintenance of Traffic Inspection";
export const WORK_ZONE_REPORT_TYPE = "VDOT Work Zone Safety Checklist (TE-97001)";

export const ANSWER_TYPES = {
  YES_NO: "yes_no",
  ADEQUATE: "adequate_inadequate",
  PHASE: "phase"
};

export const ANSWER_OPTIONS = {
  [ANSWER_TYPES.YES_NO]: [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" }
  ],
  [ANSWER_TYPES.ADEQUATE]: [
    { value: "adequate", label: "Adequate" },
    { value: "inadequate", label: "Inadequate" }
  ],
  [ANSWER_TYPES.PHASE]: [
    { value: "complete", label: "Complete" },
    { value: "na", label: "N/A" }
  ]
};

export const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent – correct immediately" },
  { value: "5days", label: "5 working days to correct" }
];

const MOT_CHECKLIST = {
  key: "mot",
  reportType: MOT_REPORT_TYPE,
  title: "Maintenance of Traffic Inspection Form",
  shortTitle: "MOT Inspection",
  kicker: "VDOT · If Lane Closed",
  formNumber: "VDOT Alternate Project Delivery Office 5/2006",
  description: "Lane-closure maintenance of traffic inspection: initial and date each item as it is verified.",
  headerFields: [
    { key: "reportNo", label: "Report No." },
    { key: "dateOfWork", label: "Date of Work", type: "date", required: true },
    { key: "projectNo", label: "Project No.", required: true, source: "projectNumber" },
    { key: "contractor", label: "Contractor" },
    { key: "location", label: "Location", required: true, source: "location" },
    { key: "planPage", label: "Plan Page" },
    { key: "inspector", label: "Inspector", required: true, source: "inspector" }
  ],
  sections: [
    {
      id: "preparatory",
      title: "Preparatory",
      answerType: ANSWER_TYPES.PHASE,
      items: [
        { id: "mot_traffic_controls", label: "Traffic controls appropriately designed to maintain traffic" }
      ]
    },
    {
      id: "intermediate",
      title: "Intermediate",
      answerType: ANSWER_TYPES.PHASE,
      items: [
        { id: "mot_materials_specs", label: "Materials conform to the specs" },
        { id: "mot_devices_conform", label: "Signalization, barricades, channelizing devices, safety devices & pavement markings conform to specs, Virginia Work Area Protection Manual & MUTCD standards" },
        { id: "mot_signs_placed", label: "Signs placed IAW Virginia Work Area Protection Manual & MUTCD standards" },
        { id: "mot_certified_flaggers", label: "Certified flaggers" },
        { id: "mot_contractor_maintenance", label: "Contractor proper maintenance of traffic control devices" }
      ]
    },
    {
      id: "completion",
      title: "Completion",
      answerType: ANSWER_TYPES.PHASE,
      items: [
        { id: "mot_final_inspection", label: "Final field inspection performed" }
      ]
    }
  ],
  allowCustomItems: 4,
  footerFields: [
    { key: "remarks", label: "Remarks", type: "textarea" }
  ]
};

const yesNo = (id, label, flagOn = "no") => ({ id, label, flagOn });
const adequate = (id, label) => ({ id, label, flagOn: "inadequate" });

const WORK_ZONE_CHECKLIST = {
  key: "te97001",
  reportType: WORK_ZONE_REPORT_TYPE,
  title: "Work Zone Safety Checklist",
  shortTitle: "Work Zone Safety (TE-97001)",
  kicker: "VDOT Traffic Engineering · Form TE-97001",
  formNumber: "Form #TE-97001",
  description: "Construction / maintenance / utility / permit work zone review. Mark Inadequate or a problem answer to flag it, then set Urgent or 5 working days.",
  headerFields: [
    { key: "operationCategory", label: "Category", type: "select", options: ["Construction", "Maintenance", "Utility", "Permit"] },
    { key: "residency", label: "Residency" },
    { key: "contractorHq", label: "Contractor / Area Headquarters" },
    { key: "cityCounty", label: "City / County" },
    { key: "projectLocation", label: "Proj. No. / Permit No. / Location", required: true, source: "projectAndLocation" },
    { key: "typeOfOperation", label: "Type of Operation", required: true },
    { key: "date", label: "Day / Date", type: "date", required: true },
    { key: "time", label: "Time", type: "time" },
    { key: "personInCharge", label: "Person in Charge", required: true },
    { key: "postedSpeed", label: "Posted Speed (MPH)", type: "number" },
    { key: "weather", label: "Weather Condition", source: "weather" },
    { key: "dayNight", label: "Day or Night", type: "select", options: ["Day", "Night"] },
    { key: "workInProgress", label: "Work", type: "select", options: ["In Progress", "Not In Progress"] }
  ],
  sections: [
    {
      id: "A", title: "Drive Thru", answerType: ANSWER_TYPES.YES_NO,
      items: [
        yesNo("A1", "Are maneuvers difficult or unexpected?", "yes"),
        yesNo("A2", "Adequate warning of hazards?"),
        yesNo("A3", "Is signing clear / uncluttered and properly spaced?"),
        yesNo("A4", "Are traffic control devices sufficiently visible?")
      ]
    },
    {
      id: "B", title: "Signs", answerType: ANSWER_TYPES.ADEQUATE, allowNA: true,
      items: [
        adequate("B1", "Need to be (removed / repositioned / covered)"),
        adequate("B2", "Need (cleaning / replacement)"),
        adequate("B3", "Need additional signs"),
        adequate("B4", "Conflicting (permanent / temporary signing)"),
        adequate("B5", "Non-approved sign support"),
        adequate("B6", "Blocked by vegetation")
      ]
    },
    {
      id: "C", title: "Portable Changeable Message Sign", answerType: ANSWER_TYPES.ADEQUATE, allowNA: true,
      items: [
        adequate("C1", "Application does not meet guidelines"),
        adequate("C2", "Inappropriate message"),
        adequate("C3", "Too much information on P.C.M.S."),
        adequate("C4", "Not delineated, no cones / barrels")
      ]
    },
    {
      id: "D", title: "Arrow Board", answerType: ANSWER_TYPES.ADEQUATE, allowNA: true,
      items: [
        adequate("D1", "Malfunction (bulb out, etc.)"),
        adequate("D2", "Incorrect placement"),
        adequate("D3", "Misaligned bulbs"),
        adequate("D4", "Not dimmed at night")
      ]
    },
    {
      id: "E", title: "Drums / Other Devices", answerType: ANSWER_TYPES.ADEQUATE, allowNA: true,
      option: { label: "Device type", choices: ["Drums (D)", "Other (O)"] },
      items: [
        adequate("E1", "Inappropriate taper length"),
        adequate("E2", "Spacing inadequate (too long / too short)"),
        adequate("E3", "(Repair / clean / replacement)"),
        adequate("E4", "Reflective bands (damaged / missing) on drums / other devices"),
        adequate("E5", "Additional devices needed"),
        adequate("E6", "Misaligned")
      ]
    },
    {
      id: "F", title: "Traffic Barrier", answerType: ANSWER_TYPES.ADEQUATE, allowNA: true,
      items: [
        adequate("F1", "Improper barrier wall flare"),
        adequate("F2", "Improper terminal treatment"),
        adequate("F3", "Barrier needs to be (realigned / removed)"),
        adequate("F4", "Warning light (service / clean)"),
        adequate("F5", "Delineators (clean / additional)"),
        adequate("F6", "8\" x 12\" vertical barrier panels (clean / additional)"),
        adequate("F7", "Attenuator (repair / replace)")
      ]
    },
    {
      id: "G", title: "Flagging Operation", answerType: ANSWER_TYPES.YES_NO, allowNA: true,
      items: [
        { ...adequate("G1", "Need additional advance signing"), answerType: ANSWER_TYPES.ADEQUATE },
        yesNo("G2", "Are flagpersons certified?"),
        yesNo("G3", "Positioned correctly?"),
        yesNo("G4", "Highly visible?"),
        yesNo("G5", "Properly clothed?"),
        yesNo("G6", "Flagging correctly?")
      ]
    },
    {
      id: "H", title: "Pavement Marking", answerType: ANSWER_TYPES.ADEQUATE, allowNA: true,
      option: { label: "Marking type", choices: ["Permanent", "Construction"] },
      items: [
        adequate("H1", "Remove"),
        adequate("H2", "Repair"),
        adequate("H3", "Need additional"),
        adequate("H4", "Unnecessary (markings / not eradicated completely)")
      ]
    },
    {
      id: "I", title: "Pavement Markers", answerType: ANSWER_TYPES.ADEQUATE, allowNA: true,
      option: { label: "Marker type", choices: ["Permanent", "Construction"] },
      items: [
        adequate("I1", "Replace missing"),
        adequate("I2", "Remove"),
        adequate("I3", "Need additional")
      ]
    },
    {
      id: "J", title: "Truck Mounted Attenuator", answerType: ANSWER_TYPES.YES_NO, allowNA: true,
      items: [
        yesNo("J1", "Properly positioned?"),
        yesNo("J2", "Properly maintained / delineated?")
      ]
    },
    {
      id: "K", title: "Miscellaneous", answerType: ANSWER_TYPES.YES_NO,
      items: [
        yesNo("K1", "Adequate buffer space?"),
        yesNo("K2", "Is the work area protected?"),
        yesNo("K3", "Materials properly stored?"),
        yesNo("K4", "Equipment properly stored?"),
        yesNo("K5", "Are lane closures in accord with allowed hours?")
      ]
    },
    {
      id: "L", title: "Accidents", answerType: ANSWER_TYPES.YES_NO,
      items: [
        yesNo("L1", "Evidence of an accident?", "yes"),
        yesNo("L2", "Damaged traffic control devices?", "yes"),
        yesNo("L3", "Skid marks?", "yes"),
        yesNo("L4", "Debris?", "yes")
      ]
    }
  ],
  footerFields: [
    { key: "recommendation", label: "Comments / Recommendation", type: "textarea" },
    { key: "reviewedBy", label: "Reviewed By (name)" },
    { key: "reviewedByDate", label: "Reviewed By – Date", type: "date" },
    { key: "reviewedWith", label: "Reviewed With (name)" },
    { key: "reviewedWithDate", label: "Reviewed With – Date", type: "date" },
    { key: "copyTo", label: "Copy To", type: "select", options: ["Contractor", "Inspector", "Resident Engineer", "Other"] },
    { key: "copyToOther", label: "Copy To – Other" }
  ]
};

export const VDOT_CHECKLISTS = {
  mot: MOT_CHECKLIST,
  te97001: WORK_ZONE_CHECKLIST
};

export function getVdotChecklistKey(report = {}) {
  if (report.checklistKey && VDOT_CHECKLISTS[report.checklistKey]) return report.checklistKey;
  const type = String(report.type || report.reportType || report.report_type || "").toLowerCase();
  if (type.includes("te-97001") || type.includes("work zone safety")) return "te97001";
  if (type.includes("maintenance of traffic")) return "mot";
  return "";
}

export function isVdotChecklistReport(report = {}) {
  return Boolean(getVdotChecklistKey(report));
}

export function getVdotChecklist(report = {}) {
  return VDOT_CHECKLISTS[getVdotChecklistKey(report)] || null;
}

export function getItemAnswerType(section, item) {
  return item.answerType || section.answerType;
}

// The checklist's items, with the MOT form's blank rows appended to the last
// section so they render, count and print like the printed ones.
export function getChecklistSections(checklist, report = {}) {
  if (!checklist) return [];
  const custom = (report.customItems || []).filter((item) => String(item.label || "").trim());
  if (!checklist.allowCustomItems || !custom.length) return checklist.sections;
  return [
    ...checklist.sections,
    {
      id: "additional",
      title: "Additional Items",
      answerType: checklist.sections[0].answerType,
      items: custom.map((item) => ({ id: item.id, label: item.label }))
    }
  ];
}

export function isItemFlagged(section, item, answer = {}) {
  if (getItemAnswerType(section, item) === ANSWER_TYPES.PHASE) return false;
  return Boolean(answer.value) && answer.value === item.flagOn;
}

export function getChecklistProgress(checklist, report = {}) {
  const sections = getChecklistSections(checklist, report);
  const answers = report.answers || {};
  const sectionNA = report.sectionNA || {};
  let total = 0;
  let answered = 0;
  let flagged = 0;
  let urgent = 0;
  sections.forEach((section) => {
    if (sectionNA[section.id]) return;
    section.items.forEach((item) => {
      total += 1;
      const answer = answers[item.id] || {};
      if (answer.value) answered += 1;
      if (isItemFlagged(section, item, answer)) {
        flagged += 1;
        if (answer.priority === "urgent") urgent += 1;
      }
    });
  });
  return { total, answered, flagged, urgent };
}

export function getMissingRequiredHeaderFields(checklist, report = {}) {
  if (!checklist) return [];
  const header = report.header || {};
  return checklist.headerFields.filter((field) => field.required && !String(header[field.key] ?? "").trim());
}

export function isVdotChecklistComplete(report = {}) {
  const checklist = getVdotChecklist(report);
  if (!checklist) return false;
  const progress = getChecklistProgress(checklist, report);
  return getMissingRequiredHeaderFields(checklist, report).length === 0 && progress.total > 0 && progress.answered === progress.total;
}

export function hasVdotChecklistContent(report = {}) {
  const header = report.header || {};
  return Boolean(
    Object.keys(report.answers || {}).length ||
    Object.values(header).some((value) => String(value ?? "").trim()) ||
    String(report.status || "").trim()
  );
}

export function getAnswerLabel(section, item, answer = {}) {
  if (!answer.value) return "";
  const option = (ANSWER_OPTIONS[getItemAnswerType(section, item)] || []).find((entry) => entry.value === answer.value);
  return option?.label || String(answer.value);
}

export function getPriorityLabel(value) {
  return PRIORITY_OPTIONS.find((option) => option.value === value)?.label || "";
}

// Prefills header values from the daily log when the report is created.
export function buildInitialHeader(checklist, context = {}) {
  const header = {};
  checklist.headerFields.forEach((field) => {
    if (field.source === "projectNumber") header[field.key] = context.projectNumber || "";
    else if (field.source === "location") header[field.key] = context.location || "";
    else if (field.source === "inspector") header[field.key] = context.inspector || "";
    else if (field.source === "weather") header[field.key] = context.weather || "";
    else if (field.source === "projectAndLocation") header[field.key] = [context.projectNumber, context.location].filter(Boolean).join(" · ");
    else if (field.type === "date") header[field.key] = context.date || "";
    else header[field.key] = "";
  });
  return header;
}

export function getInitials(name = "") {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .join("")
    .slice(0, 4);
}
