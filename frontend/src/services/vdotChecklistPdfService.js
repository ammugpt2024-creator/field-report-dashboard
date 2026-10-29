import jsPdfModule from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ANSWER_OPTIONS,
  ANSWER_TYPES,
  getChecklistProgress,
  getChecklistSections,
  getItemAnswerType,
  getPriorityLabel,
  getVdotChecklist,
  isItemFlagged,
  VDOT_CHECKLISTS
} from "../configs/vdotChecklists";

const JsPDFConstructor = jsPdfModule.jsPDF || jsPdfModule;

const MARGIN = 40;
const TOP = 36;
const BOTTOM = 42;
const COLORS = {
  navy: [15, 23, 42],
  ink: [30, 41, 59],
  muted: [100, 116, 139],
  line: [148, 163, 184],
  soft: [241, 245, 249],
  head: [30, 58, 95],
  flag: [254, 226, 226],
  flagText: [153, 27, 27],
  white: [255, 255, 255]
};

function pageWidth(doc) {
  return doc.internal.pageSize.getWidth();
}

function contentWidth(doc) {
  return pageWidth(doc) - MARGIN * 2;
}

function ensureSpace(doc, y, needed) {
  if (y + needed <= doc.internal.pageSize.getHeight() - BOTTOM) return y;
  doc.addPage("letter", "portrait");
  return TOP;
}

function text(value) {
  const str = String(value ?? "").trim();
  return str || "—";
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return String(value);
  return `${month}/${day}/${year}`;
}

function fieldValue(field, value) {
  if (field.type === "date") return formatDate(value);
  return value;
}

// Fillable PDF fields. While jsPDF draws the form, each blank on the paper
// form is recorded here with its position; pdf-lib then adds real form fields
// at those spots (jsPDF's own AcroForm output has no font resources, so
// viewers show the fields empty). Values from the app are pre-filled.
const fieldSpecs = new WeakMap();

function recordField(doc, spec, x, y, width, height) {
  if (!fieldSpecs.has(doc)) fieldSpecs.set(doc, []);
  fieldSpecs.get(doc).push({
    ...spec,
    page: doc.internal.getCurrentPageInfo().pageNumber,
    x: x + 1.5,
    y: y + 1.5,
    width: width - 3,
    height: height - 3
  });
}

function addTextField(doc, name, value, x, y, width, height, { multiline = false, fontSize = 9, align = "left" } = {}) {
  recordField(doc, { kind: "text", name, value: String(value ?? ""), multiline, fontSize, align }, x, y, width, height);
}

function addChoiceField(doc, name, value, options, x, y, width, height) {
  // The leading blank option lets someone clear a status they picked by mistake.
  recordField(doc, { kind: "choice", name, value: value || "", options: ["", ...options], fontSize: 9 }, x, y, width, height);
}

function renderTitle(doc, checklist, report, y) {
  const width = contentWidth(doc);
  doc.setDrawColor(...COLORS.navy);
  doc.setLineWidth(1.2);
  doc.rect(MARGIN, y, width, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text(checklist.kicker.toUpperCase(), MARGIN + 10, y + 14);
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.navy);
  doc.text(checklist.title.toUpperCase(), MARGIN + 10, y + 33);
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text(checklist.formNumber, MARGIN + width - 10, y + 14, { align: "right" });
  const status = String(report.status || "").toUpperCase();
  if (status) {
    doc.setTextColor(...(status === "COMPLETED" ? [4, 120, 87] : COLORS.muted));
    doc.text(status, MARGIN + width - 10, y + 33, { align: "right" });
  }
  return y + 56;
}

function renderHeaderFields(doc, checklist, report, y, fillable = false) {
  const header = report.header || {};
  const fields = checklist.headerFields;
  const cells = fields.map((field) => [field.label, fillable ? "" : text(fieldValue(field, header[field.key]))]);
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push([...(cells[i] || ["", ""]), ...(cells[i + 1] || ["", ""])]);
  }
  autoTable(doc, {
    didDrawCell(data) {
      if (!fillable || data.section !== "body" || (data.column.index !== 1 && data.column.index !== 3)) return;
      const field = fields[data.row.index * 2 + (data.column.index === 3 ? 1 : 0)];
      if (!field) return;
      addTextField(doc, `header_${field.key}`, fieldValue(field, header[field.key]) || "", data.cell.x, data.cell.y, data.cell.width, data.cell.height);
    },
    startY: y,
    body: rows,
    theme: "grid",
    margin: { left: MARGIN, right: MARGIN, top: TOP, bottom: BOTTOM },
    tableWidth: contentWidth(doc),
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, lineColor: COLORS.line, lineWidth: 0.4, textColor: COLORS.ink, valign: "middle", minCellHeight: fillable ? 20 : 0 },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: COLORS.soft, cellWidth: 105, fontSize: 7.5, textColor: COLORS.muted },
      1: { cellWidth: contentWidth(doc) / 2 - 105 },
      2: { fontStyle: "bold", fillColor: COLORS.soft, cellWidth: 105, fontSize: 7.5, textColor: COLORS.muted }
    }
  });
  return doc.lastAutoTable.finalY + 10;
}

function renderSummaryLine(doc, checklist, report, y) {
  const progress = getChecklistProgress(checklist, report);
  const parts = [`${progress.answered} of ${progress.total} items answered`];
  if (checklist.key === "te97001") {
    parts.push(`${progress.flagged} deficienc${progress.flagged === 1 ? "y" : "ies"} noted`);
    if (progress.urgent) parts.push(`${progress.urgent} urgent`);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...(progress.urgent ? COLORS.flagText : COLORS.ink));
  doc.text(parts.join("   •   "), MARGIN, y);
  return y + 10;
}

function sectionHeading(section, checklist) {
  return checklist.key === "te97001" ? `${section.id}.  ${section.title.toUpperCase()}` : section.title.toUpperCase();
}

// The MOT form is one table, like the paper form: section names
// (Preparatory / Intermediate / Completion / Additional Items) are label rows
// between the items rather than separate tables.
function renderPhaseTable(doc, sections, report, y, fillable = false) {
  const answers = report.answers || {};
  const width = contentWidth(doc);
  const phaseOptions = ANSWER_OPTIONS[ANSWER_TYPES.PHASE];
  const statusLabel = (answer) => (phaseOptions.find((entry) => entry.value === answer.value) || {}).label || "";
  const rows = [];
  sections.forEach((section) => {
    rows.push({ title: section.title });
    section.items.forEach((item) => rows.push({ item }));
    for (let index = 1; index <= (section.blankRows || 0); index += 1) rows.push({ item: { id: `blank_${index}`, label: "", blank: true } });
  });
  y = ensureSpace(doc, y, 80);
  autoTable(doc, {
    startY: y,
    head: [["Item", "Status", "Inspector (Initial)", "Date", "Remarks"]],
    body: rows.map((row) => {
      if (row.title) return [{ content: row.title.toUpperCase(), colSpan: 5 }];
      const answer = answers[row.item.id] || {};
      if (fillable) return [row.item.label, "", "", "", ""];
      return [row.item.label, statusLabel(answer), answer.initials || "", formatDate(answer.date), answer.remarks || ""];
    }),
    theme: "grid",
    margin: { left: MARGIN, right: MARGIN, top: TOP, bottom: BOTTOM },
    tableWidth: width,
    showHead: "everyPage",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, lineColor: COLORS.line, lineWidth: 0.4, textColor: COLORS.ink, valign: "middle", overflow: "linebreak", minCellHeight: fillable ? 21 : 0 },
    headStyles: { fillColor: COLORS.head, textColor: COLORS.white, fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      0: { cellWidth: width * 0.38 },
      1: { cellWidth: 62, halign: "center", fontStyle: "bold" },
      2: { cellWidth: 62, halign: "center" },
      3: { cellWidth: 62, halign: "center" }
    },
    didParseCell(data) {
      if (data.section !== "body" || !rows[data.row.index]?.title) return;
      data.cell.styles.fillColor = COLORS.soft;
      data.cell.styles.fontStyle = "bold";
      data.cell.styles.textColor = COLORS.navy;
      data.cell.styles.minCellHeight = 0;
    },
    didDrawCell(data) {
      if (!fillable || data.section !== "body") return;
      const row = rows[data.row.index];
      if (!row?.item) return;
      const answer = answers[row.item.id] || {};
      const { x, y: cellY, width: w, height: h } = data.cell;
      const name = row.item.id;
      if (data.column.index === 0 && row.item.blank) addTextField(doc, `${name}_item`, "", x, cellY, w, h);
      if (data.column.index === 1) addChoiceField(doc, `${name}_status`, statusLabel(answer), phaseOptions.map((entry) => entry.label), x, cellY, w, h);
      if (data.column.index === 2) addTextField(doc, `${name}_initials`, answer.initials || "", x, cellY, w, h, { align: "center" });
      if (data.column.index === 3) addTextField(doc, `${name}_date`, formatDate(answer.date), x, cellY, w, h, { align: "center" });
      if (data.column.index === 4) addTextField(doc, `${name}_remarks`, answer.remarks || "", x, cellY, w, h, { multiline: h > 26, fontSize: 8 });
    }
  });
  return doc.lastAutoTable.finalY + 10;
}

function renderSectionTable(doc, checklist, section, report, y) {
  const answers = report.answers || {};
  const notApplicable = Boolean((report.sectionNA || {})[section.id]);
  const option = (report.sectionOptions || {})[section.id];
  const comment = String((report.sectionComments || {})[section.id] || "").trim();
  const width = contentWidth(doc);
  // Keep a section on one page when it fits: roughly 46pt of headings plus
  // 25pt per item row. Longer sections fall back to splitting across pages.
  const estimatedHeight = notApplicable ? 50 : 46 + section.items.length * 25 + (comment ? 22 : 0);
  y = ensureSpace(doc, y, Math.min(estimatedHeight, 420));


  const titleSuffix = [
    option ? `${section.option?.label || "Type"}: ${option}` : "",
    notApplicable ? "NOT APPLICABLE" : ""
  ].filter(Boolean).join("   ");

  // Column headings come from the section's answer type, like the paper form.
  // Section G mixes in one Adequate/Inadequate item, so that row also carries
  // its own small option labels.
  const sectionOptions = ANSWER_OPTIONS[section.answerType];
  const body = notApplicable
    ? [[{ content: "Section not applicable to this work zone.", colSpan: 5, styles: { fontStyle: "italic", textColor: COLORS.muted } }]]
    : section.items.map((item, index) => {
        const answer = answers[item.id] || {};
        const itemType = getItemAnswerType(section, item);
        const options = ANSWER_OPTIONS[itemType];
        const ownLabels = itemType !== section.answerType;
        const flagged = isItemFlagged(section, item, answer);
        return {
          flagged,
          ownLabels,
          marked: [answer.value === options[0].value, answer.value === options[1].value],
          cells: [
            `${section.id}${index + 1}`,
            item.label,
            ownLabels ? options[0].label : "",
            ownLabels ? options[1].label : "",
            flagged ? (getPriorityLabel(answer.priority) || "Priority not set") : ""
          ]
        };
      });

  const head = [[{ content: `${sectionHeading(section, checklist)}${titleSuffix ? `      ${titleSuffix}` : ""}`, colSpan: 5 }]];
  if (!notApplicable) {
    head.push(["", "", sectionOptions[0].label, sectionOptions[1].label, "Correct within"]);
  }

  autoTable(doc, {
    startY: y,
    head,
    body: notApplicable ? body : body.map((row) => row.cells),
    theme: "grid",
    margin: { left: MARGIN, right: MARGIN, top: TOP, bottom: BOTTOM },
    tableWidth: width,
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, lineColor: COLORS.line, lineWidth: 0.4, textColor: COLORS.ink, valign: "middle", overflow: "linebreak", minCellHeight: 20 },
    headStyles: { fillColor: COLORS.head, textColor: COLORS.white, fontStyle: "bold", fontSize: 8.5 },
    columnStyles: notApplicable ? {} : {
      0: { cellWidth: 24, textColor: COLORS.muted, fontSize: 7.5 },
      1: { cellWidth: width - 24 - 62 - 62 - 118 },
      2: { cellWidth: 62, halign: "center" },
      3: { cellWidth: 62, halign: "center" },
      4: { cellWidth: 118, fontSize: 7.5 }
    },
    didParseCell(data) {
      if (notApplicable) return;
      if (data.section === "head" && data.row.index === 1) {
        data.cell.styles.fillColor = COLORS.soft;
        data.cell.styles.textColor = COLORS.ink;
        data.cell.styles.fontSize = 7.5;
        data.cell.styles.halign = data.column.index >= 2 && data.column.index <= 3 ? "center" : "left";
        return;
      }
      if (data.section !== "body") return;
      const row = body[data.row.index];
      if (row?.ownLabels) data.cell.styles.minCellHeight = 30;
      if (row?.ownLabels && (data.column.index === 2 || data.column.index === 3)) {
        data.cell.styles.fontSize = 6.5;
        data.cell.styles.textColor = COLORS.muted;
        data.cell.styles.valign = "top";
      }
      if (row?.flagged) {
        data.cell.styles.fillColor = COLORS.flag;
        if (data.column.index === 4) {
          data.cell.styles.textColor = COLORS.flagText;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    didDrawCell(data) {
      if (notApplicable || data.section !== "body" || (data.column.index !== 2 && data.column.index !== 3)) return;
      const row = body[data.row.index];
      if (!row?.marked?.[data.column.index - 2]) return;
      const cx = data.cell.x + data.cell.width / 2;
      const cy = row.ownLabels ? data.cell.y + data.cell.height - 4 : data.cell.y + data.cell.height / 2 + 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...COLORS.navy);
      doc.text("X", cx, cy, { align: "center" });
    }
  });
  y = doc.lastAutoTable.finalY;

  if (comment) {
    autoTable(doc, {
      startY: y,
      body: [[{ content: `Comments: ${comment}` }]],
      theme: "grid",
      margin: { left: MARGIN, right: MARGIN, top: TOP, bottom: BOTTOM },
      tableWidth: width,
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, lineColor: COLORS.line, lineWidth: 0.4, textColor: COLORS.ink, fillColor: COLORS.soft }
    });
    y = doc.lastAutoTable.finalY;
  }
  return y + 8;
}

function renderTextBox(doc, label, value, y, { fillable = false, name = "", height: fixedHeight = 120 } = {}) {
  const width = contentWidth(doc);
  if (fillable) {
    y = ensureSpace(doc, y, fixedHeight + 6);
    doc.setDrawColor(...COLORS.line);
    doc.setLineWidth(0.4);
    doc.rect(MARGIN, y, width, fixedHeight);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.muted);
    doc.text(label.toUpperCase(), MARGIN + 8, y + 12);
    addTextField(doc, name, String(value ?? ""), MARGIN + 4, y + 16, width - 8, fixedHeight - 18, { multiline: true });
    return y + fixedHeight + 10;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(text(value), width - 20);
  const height = Math.max(44, lines.length * 12 + 26);
  y = ensureSpace(doc, y, height + 6);
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN, y, width, height);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);
  doc.text(label.toUpperCase(), MARGIN + 8, y + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.ink);
  doc.text(lines, MARGIN + 8, y + 26);
  return y + height + 10;
}

function renderSignatureLine(doc, label, name, date, x, y, width, fieldName = "") {
  if (fieldName) {
    // Name and date as separate fields above the line; the signature itself
    // can be added with Acrobat / Preview "Fill & Sign".
    addTextField(doc, `${fieldName}_name`, name || "", x, y + 10, width * 0.65, 20);
    addTextField(doc, `${fieldName}_date`, formatDate(date), x + width * 0.67, y + 10, width * 0.33, 20);
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.ink);
    doc.text(`${name || ""}${date ? `   ${formatDate(date)}` : ""}`, x, y + 26);
  }
  doc.setDrawColor(...COLORS.navy);
  doc.setLineWidth(0.6);
  doc.line(x, y + 30, x + width, y + 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);
  doc.text(label.toUpperCase(), x, y + 40);
}

function renderFooter(doc, checklist, report, y, fillable = false) {
  const footer = report.footer || {};
  const header = report.header || {};
  const width = contentWidth(doc);
  const half = (width - 20) / 2;

  if (checklist.key === "mot") {
    y = renderTextBox(doc, "Remarks", footer.remarks, y, { fillable, name: "remarks", height: 100 });
    y = ensureSpace(doc, y, 56);
    renderSignatureLine(doc, "Inspector (sign & date)", header.inspector, report.completedAt ? report.completedAt.slice(0, 10) : "", MARGIN, y, half, fillable ? "inspector_signature" : "");
    return y + 52;
  }

  y = renderTextBox(doc, "Comments / Recommendation", footer.recommendation, y);
  y = ensureSpace(doc, y, 80);
  renderSignatureLine(doc, "Reviewed by (sign & date)", footer.reviewedBy, footer.reviewedByDate, MARGIN, y, half);
  renderSignatureLine(doc, "Reviewed with (sign & date)", footer.reviewedWith, footer.reviewedWithDate, MARGIN + half + 20, y, half);
  y += 50;
  const copyTo = footer.copyTo === "Other" ? `Other: ${footer.copyToOther || ""}` : footer.copyTo;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text(`COPY: ${text(copyTo).toUpperCase()}`, MARGIN, y + 6);
  return y + 16;
}

function renderPageNumbers(doc, checklist, fromPage) {
  const total = doc.getNumberOfPages();
  for (let page = fromPage; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.muted);
    const h = doc.internal.pageSize.getHeight();
    doc.text(checklist.formNumber, MARGIN, h - 20);
    doc.text(`${page - fromPage + 1} of ${total - fromPage + 1}`, pageWidth(doc) - MARGIN, h - 20, { align: "right" });
  }
}

// Sections for the fillable form: the paper form's blank rows become an
// "Additional Items" table holding any items named in the app plus empty rows.
function getFillableSections(checklist, report) {
  const custom = (report.customItems || []).filter((item) => String(item.label || "").trim());
  const sections = checklist.sections.slice();
  if (checklist.allowCustomItems) {
    sections.push({
      id: "additional",
      title: "Additional Items",
      answerType: checklist.sections[0].answerType,
      items: custom.map((item) => ({ id: item.id, label: item.label })),
      blankRows: Math.max(0, checklist.allowCustomItems - custom.length)
    });
  }
  return sections;
}

// Only the MOT form is produced as a fillable PDF.
export function isFillableChecklist(report) {
  return getVdotChecklist(report)?.key === "mot";
}

// Draws the whole checklist starting at y on the current page; returns the
// next free y. Used by the standalone PDF and by the daily-log PDF. The
// daily-log PDF stays non-fillable: it is merged with attachments, which
// would orphan the form fields.
export function renderVdotChecklistToDoc(doc, report, y = TOP, { fillable = false } = {}) {
  const checklist = getVdotChecklist(report);
  if (!checklist) return y;
  y = renderTitle(doc, checklist, report, y);
  y = renderHeaderFields(doc, checklist, report, y, fillable);
  // The answered-count line would go stale as soon as someone edits the form.
  y = fillable ? y + 4 : renderSummaryLine(doc, checklist, report, y + 4);
  const sections = fillable ? getFillableSections(checklist, report) : getChecklistSections(checklist, report);
  if (sections.every((section) => section.answerType === ANSWER_TYPES.PHASE)) {
    y = renderPhaseTable(doc, sections, report, y, fillable);
  } else {
    sections.forEach((section) => {
      y = renderSectionTable(doc, checklist, section, report, y);
    });
  }
  return renderFooter(doc, checklist, report, y + 4, fillable);
}

export function getVdotChecklistPdfFileName(report) {
  const checklist = getVdotChecklist(report);
  const project = String(report.header?.projectNo || report.projectNumber || report.project_number || "").replace(/[^a-zA-Z0-9_-]+/g, "_");
  const date = String(report.header?.dateOfWork || report.header?.date || report.date || "").slice(0, 10);
  const prefix = checklist?.key === "te97001" ? "TE-97001_Work_Zone_Checklist" : "MOT_Inspection";
  return [prefix, project, date].filter(Boolean).join("_") + ".pdf";
}

export function buildVdotChecklistPdf(report) {
  const checklist = getVdotChecklist(report);
  if (!checklist) throw new Error("Unknown checklist type");
  const doc = new JsPDFConstructor({ orientation: "portrait", unit: "pt", format: "letter", compress: true });
  renderVdotChecklistToDoc(doc, report, TOP, { fillable: isFillableChecklist(report) });
  renderPageNumbers(doc, checklist, 1);
  return doc;
}

// Adds the recorded fields to the jsPDF output with pdf-lib and returns the
// final PDF bytes. Forms without recorded fields are returned unchanged.
async function addFormFields(doc) {
  const specs = fieldSpecs.get(doc) || [];
  const bytes = doc.output("arraybuffer");
  if (!specs.length) return new Uint8Array(bytes);
  const { PDFDocument, StandardFonts, TextAlignment } = await import("pdf-lib");
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const form = pdf.getForm();
  specs.forEach((spec) => {
    const page = pdf.getPage(spec.page - 1);
    const placement = {
      x: spec.x,
      y: page.getHeight() - spec.y - spec.height,
      width: spec.width,
      height: spec.height,
      font,
      borderWidth: 0
    };
    if (spec.kind === "choice") {
      const dropdown = form.createDropdown(spec.name);
      dropdown.setOptions(spec.options);
      if (spec.value) dropdown.select(spec.value);
      dropdown.addToPage(page, placement);
      dropdown.setFontSize(spec.fontSize);
      return;
    }
    const field = form.createTextField(spec.name);
    if (spec.multiline) field.enableMultiline();
    field.setText(spec.value);
    field.addToPage(page, placement);
    field.setFontSize(spec.fontSize);
    if (spec.align === "center") field.setAlignment(TextAlignment.Center);
  });
  form.updateFieldAppearances(font);
  return pdf.save();
}

export async function buildVdotChecklistPdfBytes(report) {
  return addFormFields(buildVdotChecklistPdf(report));
}

function saveBytes(bytes, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// A blank copy of the form (no answers) for filling in offline.
export async function generateBlankVdotChecklistPdf(checklistKey) {
  const checklist = VDOT_CHECKLISTS[checklistKey];
  if (!checklist) throw new Error("Unknown checklist type");
  const bytes = await buildVdotChecklistPdfBytes({ type: checklist.reportType, checklistKey, header: {}, answers: {}, footer: {}, status: "" });
  saveBytes(bytes, `${checklistKey === "mot" ? "MOT_Inspection" : "TE-97001_Work_Zone_Checklist"}_Blank_Fillable.pdf`);
}

// mode "download" saves the file; mode "open" shows it in targetWindow (open
// that window synchronously in the click handler so popup blockers allow it).
export async function generateVdotChecklistPdf(report, { mode = "download", targetWindow = null } = {}) {
  const bytes = await buildVdotChecklistPdfBytes(report);
  const fileName = getVdotChecklistPdfFileName(report);
  if (mode === "download") {
    saveBytes(bytes, fileName);
    return null;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const viewer = targetWindow && !targetWindow.closed ? targetWindow : window.open(url, "_blank");
  if (!viewer) {
    // Pop-ups blocked: still give the user the file.
    URL.revokeObjectURL(url);
    saveBytes(bytes, fileName);
    return null;
  }
  if (viewer === targetWindow) viewer.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}
