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
  isItemFlagged
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
  const status = String(report.status || "draft").toUpperCase();
  doc.setTextColor(...(status === "COMPLETED" ? [4, 120, 87] : COLORS.muted));
  doc.text(status, MARGIN + width - 10, y + 33, { align: "right" });
  return y + 56;
}

function renderHeaderFields(doc, checklist, report, y) {
  const header = report.header || {};
  const cells = checklist.headerFields.map((field) => [field.label, text(fieldValue(field, header[field.key]))]);
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push([...(cells[i] || ["", ""]), ...(cells[i + 1] || ["", ""])]);
  }
  autoTable(doc, {
    startY: y,
    body: rows,
    theme: "grid",
    margin: { left: MARGIN, right: MARGIN, top: TOP, bottom: BOTTOM },
    tableWidth: contentWidth(doc),
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, lineColor: COLORS.line, lineWidth: 0.4, textColor: COLORS.ink, valign: "middle" },
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

  if (section.answerType === ANSWER_TYPES.PHASE) {
    autoTable(doc, {
      startY: y,
      head: [[{ content: sectionHeading(section, checklist), colSpan: 5 }], ["Item", "Status", "Inspector (Initial)", "Date", "Remarks"]],
      body: section.items.map((item) => {
        const answer = answers[item.id] || {};
        const status = (ANSWER_OPTIONS[ANSWER_TYPES.PHASE].find((entry) => entry.value === answer.value) || {}).label || "";
        return [item.label, status, answer.initials || "", formatDate(answer.date), answer.remarks || ""];
      }),
      theme: "grid",
      margin: { left: MARGIN, right: MARGIN, top: TOP, bottom: BOTTOM },
      tableWidth: width,
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, lineColor: COLORS.line, lineWidth: 0.4, textColor: COLORS.ink, valign: "middle", overflow: "linebreak" },
      headStyles: { fillColor: COLORS.head, textColor: COLORS.white, fontStyle: "bold", fontSize: 8 },
      columnStyles: {
        0: { cellWidth: width * 0.38 },
        1: { cellWidth: 54, halign: "center", fontStyle: "bold" },
        2: { cellWidth: 62, halign: "center" },
        3: { cellWidth: 60, halign: "center" }
      }
    });
    return doc.lastAutoTable.finalY + 8;
  }

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

function renderTextBox(doc, label, value, y) {
  const width = contentWidth(doc);
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

function renderSignatureLine(doc, label, name, date, x, y, width) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.ink);
  doc.text(`${name || ""}${date ? `   ${formatDate(date)}` : ""}`, x, y + 26);
  doc.setDrawColor(...COLORS.navy);
  doc.setLineWidth(0.6);
  doc.line(x, y + 30, x + width, y + 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.muted);
  doc.text(label.toUpperCase(), x, y + 40);
}

function renderFooter(doc, checklist, report, y) {
  const footer = report.footer || {};
  const header = report.header || {};
  const width = contentWidth(doc);
  const half = (width - 20) / 2;

  if (checklist.key === "mot") {
    y = renderTextBox(doc, "Remarks", footer.remarks, y);
    y = ensureSpace(doc, y, 56);
    renderSignatureLine(doc, "Inspector (sign & date)", header.inspector, report.completedAt ? report.completedAt.slice(0, 10) : "", MARGIN, y, half);
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

// Draws the whole checklist starting at y on the current page; returns the
// next free y. Used by the standalone PDF and by the daily-log PDF.
export function renderVdotChecklistToDoc(doc, report, y = TOP) {
  const checklist = getVdotChecklist(report);
  if (!checklist) return y;
  y = renderTitle(doc, checklist, report, y);
  y = renderHeaderFields(doc, checklist, report, y);
  y = renderSummaryLine(doc, checklist, report, y + 4);
  getChecklistSections(checklist, report).forEach((section) => {
    y = renderSectionTable(doc, checklist, section, report, y);
  });
  return renderFooter(doc, checklist, report, y + 4);
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
  renderVdotChecklistToDoc(doc, report, TOP);
  renderPageNumbers(doc, checklist, 1);
  return doc;
}

// mode "download" saves the file; mode "open" shows it in targetWindow (open
// that window synchronously in the click handler so popup blockers allow it).
export function generateVdotChecklistPdf(report, { mode = "download", targetWindow = null } = {}) {
  const doc = buildVdotChecklistPdf(report);
  const fileName = getVdotChecklistPdfFileName(report);
  if (mode === "download") {
    doc.save(fileName);
    return null;
  }
  const url = URL.createObjectURL(doc.output("blob"));
  const viewer = targetWindow && !targetWindow.closed ? targetWindow : window.open(url, "_blank");
  if (!viewer) {
    // Pop-ups blocked: still give the user the file.
    URL.revokeObjectURL(url);
    doc.save(fileName);
    return null;
  }
  if (viewer === targetWindow) viewer.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}
