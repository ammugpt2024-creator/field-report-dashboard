import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Gauge,
  HardHat,
  Layers3,
  Mic,
  PenLine,
  SendHorizontal,
  ShieldAlert,
  Undo2,
  User,
  Upload,
  Wrench
} from "lucide-react";

export const FIELD_ENGINEER_NAV = [
  { label: "Dashboard", path: "/technician/dashboard", icon: Gauge },
  { section: "Operations", module: "daily_logs" },
  { label: "Daily Logs", path: "/technician/dashboard?view=reports-home", icon: ClipboardList, module: "daily_logs" },
  { label: "Drafts", path: "/technician/dashboard?view=daily-logs", icon: PenLine, nested: true, module: "daily_logs" },
  { label: "Submitted", path: "/technician/dashboard?view=submitted-logs", icon: SendHorizontal, nested: true, module: "daily_logs" },
  { label: "Returned", path: "/technician/dashboard?view=returned-logs", icon: Undo2, nested: true, module: "daily_logs" },
  { label: "Approved", path: "/technician/dashboard?view=approved-logs", icon: CheckCircle2, nested: true, module: "daily_logs" },
  { section: "Workforce", module: "timesheets" },
  { label: "Timesheets", path: "/technician/dashboard?view=time-cards", icon: FileText, module: "timesheets" },
  { label: "Current", path: "/timesheets", icon: Clock, nested: true, module: "timesheets" },
  { label: "Submitted", path: "/technician/dashboard?view=submitted-time-cards", icon: SendHorizontal, nested: true, module: "timesheets" },
  { label: "Approved", path: "/technician/dashboard?view=approved-time-cards", icon: CheckCircle2, nested: true, module: "timesheets" },
  { section: "Time Off" },
  { label: "Time Off", path: "/time-off", icon: CalendarClock },
  { section: "Account" },
  { label: "Notifications", path: "/technician/dashboard?view=notifications", icon: Bell },
  { label: "Profile", path: "/technician/dashboard?view=profile", icon: User }
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
