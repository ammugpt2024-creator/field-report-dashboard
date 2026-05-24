import {
  AlertTriangle,
  Bell,
  Camera,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  FileText,
  Gauge,
  HardHat,
  Layers3,
  Mic,
  PenLine,
  Plus,
  RotateCcw,
  ShieldAlert,
  Upload,
  Wrench
} from "lucide-react";
import { MODULE_NAMES } from "../../config/branding";

export const FIELD_ENGINEER_NAV = [
  { label: MODULE_NAMES.commandCenter, path: "/technician/dashboard", icon: Gauge },
  { label: MODULE_NAMES.fieldOps, path: "/technician/dashboard?view=field-operations", icon: HardHat },
  { label: "Assigned Work", path: "/technician/dashboard?view=assigned-work", icon: ClipboardList, nested: true },
  { label: "Create Inspection Record", path: "/technician/dashboard?view=create-inspection", icon: Plus, nested: true },
  { label: "Active Tasks", path: "/technician/dashboard?view=active-tasks", icon: ClipboardCheck, nested: true },
  { label: "Work In Progress", path: "/technician/dashboard?view=work-in-progress", icon: FileClock, nested: true },
  { label: "Revisions", path: "/technician/dashboard?view=revisions", icon: RotateCcw, nested: true },
  { label: "Upload Center", path: "/technician/dashboard?view=upload-center", icon: Upload, nested: true },
  { label: "Site Records", path: "/technician/dashboard?view=site-records", icon: Layers3 },
  { label: MODULE_NAMES.activityStream, path: "/technician/dashboard?view=activity-stream", icon: Bell }
];

export const INSPECTION_TEMPLATES = [
  { label: "Concrete Placement Record", description: "Placement location, mix, batch tickets, slump, air, temperature, samples, and signatures.", icon: HardHat, routeType: "concrete", enabled: true },
  { label: "Daily Field Report", description: "Manpower, weather, progress, delays, and site notes.", icon: FileText, enabled: false },
  { label: "Material Inspection", description: "Material delivery checks, specs, acceptance, and field verification.", icon: ClipboardCheck, enabled: false },
  { label: "Cylinder Sampling Record", description: "Field and lab samples, curing, pickup, and strength tracking.", icon: Gauge, enabled: false },
  { label: "Density Test", description: "Compaction checks, lift data, location, method, and result status.", icon: Layers3, enabled: false },
  { label: "Site Observation", description: "Field observations, photos, responsible party, and closeout status.", icon: PenLine, enabled: false },
  { label: "Equipment Inspection", description: "Equipment condition, compliance checks, and corrective actions.", icon: Wrench, enabled: false },
  { label: "Safety Observation", description: "Safety observations, hazards, controls, and follow-up actions.", icon: ShieldAlert, enabled: false },
  { label: "Non-Conformance Report", description: "Issue description, affected work, disposition, and resolution trail.", icon: AlertTriangle, enabled: false }
];

export const UPLOAD_OPTIONS = [
  { label: "Camera Upload", description: "Capture field photos directly from the device.", icon: Camera },
  { label: "PDF Upload", description: "Attach supplier tickets, submittals, and signed documents.", icon: FileText },
  { label: "Image Markup", description: "Annotate issue photos before attaching them to a record.", icon: PenLine },
  { label: "Attachments", description: "Add supporting evidence to active inspections.", icon: Upload },
  { label: "Voice Notes", description: "Record observations while moving through the site.", icon: Mic }
];

export const SITE_RECORD_TYPES = [
  "Approved Reports",
  "Mix Designs",
  "Material Specs",
  "Approved Submittals",
  "Previous Inspections"
];

export const EMPTY_ASSIGNMENTS = [
  {
    id: "demo-1",
    inspectionType: "Concrete Placement Record",
    project: "I-495 Expansion",
    dueTime: "10:30 AM",
    priority: "High",
    status: "Ready To Start"
  },
  {
    id: "demo-2",
    inspectionType: "Site Observation",
    project: "I-495 Expansion",
    dueTime: "1:00 PM",
    priority: "Normal",
    status: "Scheduled"
  }
];

export const ACTIVITY_EXAMPLES = [
  { label: "Report submitted", detail: "Concrete placement record moved to quality review.", time: "18 min ago" },
  { label: "Upload completed", detail: "Batch ticket photos synced to the active inspection.", time: "42 min ago" },
  { label: "New assignment received", detail: "Density test added to today's work list.", time: "1 hr ago" },
  { label: "Revision requested", detail: "Quality reviewer flagged missing placement location.", time: "Yesterday" },
  { label: "Report approved", detail: "Cylinder sampling record approved and archived.", time: "Yesterday" }
];
