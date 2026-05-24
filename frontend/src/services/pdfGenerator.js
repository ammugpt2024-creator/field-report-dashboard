import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BRAND } from '../config/branding';

const COMPANY_NAME = 'Customer Organization';
const SYSTEM_NAME = BRAND.name;
const REVISION_VERSION = 'v1.0';

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
      bytes[3] === 0x47;
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
    console.warn('Skipping invalid PDF image', error);
    return false;
  }
}

async function imageSourceToDataUrl(source) {
  if (!source) return '';
  if (source.startsWith?.('data:image/')) return removeGeneratedSignatureCaption(source);

  try {
    const response = await fetch(source);
    if (!response.ok) return '';
    const blob = await response.blob();

    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
    return removeGeneratedSignatureCaption(dataUrl);
  } catch (error) {
    console.warn('Unable to load PDF image source', error);
    return '';
  }
}

async function removeGeneratedSignatureCaption(dataUrl) {
  if (!dataUrl?.startsWith?.('data:image/')) return dataUrl || '';

  try {
    const image = await new Promise((resolve) => {
      const nextImage = new window.Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => resolve(null);
      nextImage.src = dataUrl;
    });
    if (!image?.width || !image?.height) return dataUrl;

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);

    const sampleY = Math.floor(image.height * 0.69);
    const band = context.getImageData(0, Math.max(0, sampleY - 4), image.width, 9).data;
    let nonWhitePixels = 0;
    for (let index = 0; index < band.length; index += 4) {
      const red = band[index];
      const green = band[index + 1];
      const blue = band[index + 2];
      if (red < 252 || green < 252 || blue < 252) nonWhitePixels += 1;
    }

    if (nonWhitePixels <= image.width * 0.08) return dataUrl;

    const croppedHeight = Math.floor(image.height * 0.64);
    const cleanedCanvas = document.createElement('canvas');
    cleanedCanvas.width = image.width;
    cleanedCanvas.height = croppedHeight;
    const cleanedContext = cleanedCanvas.getContext('2d');
    cleanedContext.fillStyle = '#ffffff';
    cleanedContext.fillRect(0, 0, cleanedCanvas.width, cleanedCanvas.height);
    cleanedContext.drawImage(canvas, 0, 0, image.width, croppedHeight, 0, 0, image.width, croppedHeight);
    return cleanedCanvas.toDataURL('image/png');
  } catch {
    return dataUrl;
  }
}

function renderPdfHeader(doc, { projectName, dfrNumber, dateSampled, technician, statusBadge, generatedAt, companyName }, layout) {
  const { marginLeft, marginTop, contentWidth } = layout;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Navy header bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 56, 'F');

  // Company and system
  doc.setFontSize(14);
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName || COMPANY_NAME, marginLeft, 20);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${SYSTEM_NAME} Digital Deliverable`, marginLeft, 36);

  // Report title and identifiers
  doc.setFontSize(16);
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.text('FIELD OPERATIONS RECORD', marginLeft + contentWidth / 2 - 80, 28);

  doc.setFontSize(9);
  doc.setTextColor(255);
  doc.setFont('helvetica', 'normal');
  doc.text(`Project: ${projectName || '-'}`, marginLeft, 56 + 12);
  doc.text(`DFR: ${dfrNumber || '-'}`, marginLeft + 240, 56 + 12);
  doc.text(`Date Sampled: ${dateSampled || '-'}`, marginLeft + 380, 56 + 12);
  doc.text(`Field Engineer: ${technician || '-'}`, marginLeft + 520, 56 + 12);

  // Status badge
  if (statusBadge) {
    const badgeX = pageWidth - marginLeft - 100;
    const badgeColor = Array.isArray(statusBadge.color) ? statusBadge.color : [56, 189, 248];
    doc.setFillColor(...badgeColor);
    doc.roundedRect(badgeX, 16, 88, 20, 4, 4, 'F');
    doc.setTextColor(255);
    doc.setFontSize(9);
    doc.text(statusBadge.label || statusBadge, badgeX + 44, 31, { align: 'center' });
  }

  // Generated timestamp
  doc.setFontSize(8);
  doc.setTextColor(220);
  doc.text(`Generated: ${generatedAt}`, marginLeft, 56 + 28);

  // baseline separator
  doc.setDrawColor(230);
  doc.line(marginLeft, 56 + 36, pageWidth - marginLeft, 56 + 36);

  return 56 + 44; // y position after header
}

function ensureSpace(doc, y, needed, layout, renderer) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomLimit = pageHeight - layout.marginBottom;
  if (y + needed > bottomLimit) {
    doc.addPage();
    const headerY = renderPdfHeader(doc, renderer.headerData, layout);
    return headerY + 8;
  }
  return y;
}

function renderProjectInformation(doc, form, y, layout) {
  const { marginLeft, contentWidth } = layout;
  const colGap = 18;
  const colWidth = (contentWidth - colGap) / 2;
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('PROJECT INFORMATION', marginLeft, y);
  y += 14;
  doc.setFont('helvetica', 'normal');

  const left = [
    ['Project Name', form.projectName],
    ['Project Number', form.projectNumber],
    ['Location', form.location],
    ['Batch Plant', form.batchPlant]
  ];

  const right = [
    ['GC', form.gc],
    ['DFR Number', form.dfrNumber],
    ['Time In', form.timeIn],
    ['Time Out', form.timeOut]
  ];

  const rowHeight = 14;
  left.forEach((item, idx) => {
    const yy = y + idx * rowHeight;
    doc.setFont('helvetica', 'bold');
    doc.text(item[0] + ':', marginLeft, yy);
    doc.setFont('helvetica', 'normal');
    doc.text(item[1] ? String(item[1]) : '-', marginLeft + 110, yy);
  });

  right.forEach((item, idx) => {
    const yy = y + idx * rowHeight;
    doc.setFont('helvetica', 'bold');
    doc.text(item[0] + ':', marginLeft + colWidth + colGap, yy);
    doc.setFont('helvetica', 'normal');
    doc.text(item[1] ? String(item[1]) : '-', marginLeft + colWidth + colGap + 90, yy);
  });

  return y + Math.max(left.length, right.length) * rowHeight + 12;
}

function renderSpecifications(doc, form, y, layout) {
  const { marginLeft } = layout;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('CONCRETE SPECIFICATIONS', marginLeft, y);
  y += 14;
  doc.setFont('helvetica', 'normal');

  const specs = [
    ['Air Content (%)', form.airContentSpec],
    ['Unit Weight', form.unitWeightSpec],
    ['Slump (in)', form.slumpSpec],
    ['J-Ring (in)', form.jRingSpec],
    ['Spread (in)', form.spreadSpec],
    ['Strength (psi)', form.strengthSpec],
    ['Mix No.', form.mixNoSpec]
  ];

  const colCount = 3;
  const itemW = Math.floor((layout.contentWidth - 24) / colCount);
  const itemH = 32;

  specs.forEach((spec, idx) => {
    const col = idx % colCount;
    const row = Math.floor(idx / colCount);
    const x = marginLeft + col * (itemW + 8);
    const yy = y + row * (itemH + 8);

    doc.setFillColor(248, 249, 250);
    doc.roundedRect(x, yy, itemW, itemH, 6, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text(spec[0], x + 8, yy + 12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(spec[1] ? String(spec[1]) : '-', x + 8, yy + 26);
  });

  const rows = Math.ceil(specs.length / colCount);
  return y + rows * (itemH + 8) + 12;
}

function renderDeliveryRecord(doc, record, index, y, layout) {
  const { marginLeft, contentWidth } = layout;
  const blockW = contentWidth;
  const blockX = marginLeft;
  const blockPadding = 10;
  const headerH = 26;
  const sectionGap = 6;

  // estimate block height conservatively
  const estimatedHeight = 240;
  // page break check
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + estimatedHeight > pageHeight - layout.marginBottom) {
    doc.addPage();
    y = renderPdfHeader(doc, layout.headerData, layout);
  }

  // Card background
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(blockX, y, blockW, estimatedHeight - 24, 6, 6, 'F');

  // Header bar
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(blockX, y, blockW, headerH, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255);
  const statusLabel = record.status || (record.slump ? 'Approved' : 'Draft');
  doc.text(`RECORD #${index + 1} — ${statusLabel.toUpperCase()}`, blockX + 12, y + 18);

  let cursorY = y + headerH + blockPadding;
  const colX = blockX + 12;
  const rightColX = blockX + blockW / 2 + 6;

  // Truck Information
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Truck Information', colX, cursorY);
  cursorY += 14;
  doc.setFont('helvetica', 'normal');
  const truckItems = [
    ['Ticket Number', record.ticketNo],
    ['Truck Number', record.truckNo],
    ['Cubic Yards', record.cubicYards]
  ];
  truckItems.forEach((it, i) => {
    doc.text(`${it[0]}: ${it[1] ?? '-'}`, colX, cursorY + i * 12);
  });

  // Time Tracking
  truckItems.forEach(() => {}); // spacing
  const timeY = cursorY;
  doc.setFont('helvetica', 'bold');
  doc.text('Time Tracking', rightColX, timeY);
  doc.setFont('helvetica', 'normal');
  const timeItems = [
    ['Time Batched', record.timeBatched],
    ['Arrival Time', record.arrivalTime],
    ['Time Tested', record.timeTested || record.time_sampled || record.timeSampled],
    ['Finish Unload', record.finishUnload],
    ['Actual Minutes', record.actualMinutes]
  ];
  timeItems.forEach((it, i) => {
    doc.text(`${it[0]}: ${it[1] ?? '-'}`, rightColX, timeY + 12 + i * 12);
  });

  // Move cursor down for next sections
  cursorY += Math.max(truckItems.length, timeItems.length) * 12 + 8;

  // Material verification (two columns)
  doc.setFont('helvetica', 'bold');
  doc.text('Material Verification', colX, cursorY);
  doc.setFont('helvetica', 'normal');
  const testItems = [
    ['Slump (in)', record.slump],
    ['Air Content (%)', record.airContent || record.air_content],
    ['Material Temp (°F)', record.concreteTemp || record.concrete_temp],
    ['Unit Weight', record.unitWeight || record.unit_weight],
    ['Spread (in)', record.spread],
    ['J-Ring (in)', record.jRing || record.j_ring],
    ['Water Added (gal)', record.waterAdded]
  ];
  testItems.forEach((it, i) => {
    const cx = colX + (i % 2) * (blockW / 2 - 24);
    const cy = cursorY + 12 + Math.floor(i / 2) * 12;
    doc.text(`${it[0]}: ${it[1] ?? '-'}`, cx, cy);
  });

  const testRows = Math.ceil(testItems.length / 2);
  cursorY += testRows * 12 + 8;

  // Strength verification information
  doc.setFont('helvetica', 'bold');
  doc.text('Strength Verification', colX, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Lab Samples: ${record.labCylinders ?? record.lab_cylinders ?? '-'}`, colX + 120, cursorY);
  doc.text(`Field Samples: ${record.fieldCylinders ?? record.field_cylinders ?? '-'}`, colX + 280, cursorY);

  cursorY += 18;

  // Field observations (full width)
  doc.setFont('helvetica', 'bold');
  doc.text('Field Observations', colX, cursorY);
  doc.setFont('helvetica', 'normal');
  const comments = record.comments || record.notes || '';
  const split = doc.splitTextToSize(comments || '-', blockW - 24);
  doc.text(split, colX, cursorY + 12);

  // Return bottom Y
  return y + estimatedHeight - 24;
}

function renderAttachments(doc, attachmentsList, y, layout) {
  const { marginLeft, contentWidth } = layout;
  if (!attachmentsList || attachmentsList.length === 0) {
    return y;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('EVIDENCE CENTER', marginLeft, y);
  y += 14;

  const thumbW = 90;
  const thumbH = 60;
  const gap = 12;
  let x = marginLeft;
  let rowY = y;
  for (const att of attachmentsList) {
    if (x + thumbW > marginLeft + contentWidth) {
      x = marginLeft;
      rowY += thumbH + 40;
    }

    if (rowY + thumbH > doc.internal.pageSize.getHeight() - layout.marginBottom) {
      doc.addPage();
      rowY = renderPdfHeader(doc, layout.headerData, layout) + 8;
    }

    // draw thumbnail placeholder
    doc.setFillColor(255, 255, 255);
    doc.rect(x, rowY, thumbW, thumbH, 'F');
    if (att.dataUrl) addPdfImageSafely(doc, att.dataUrl, x, rowY, thumbW, thumbH);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(att.type || att.category || '-', x, rowY + thumbH + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(att.name || att.file_name || '-', x, rowY + thumbH + 24);

    x += thumbW + gap;
  }

  return rowY + thumbH + 36;
}

function renderSummary(doc, summary, y, layout) {
  const { marginLeft, contentWidth } = layout;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('COMPLIANCE SUMMARY', marginLeft, y);
  y += 14;

  const cards = [
    ['Total Records', summary.totalRecords],
    ['Total Quantity', summary.totalCubicYards],
    ['Strength Samples', summary.totalCylinders],
    ['Approved Checks', summary.passedTests],
    ['Requires Action', summary.failedTests],
    ['Under Validation', summary.pendingReview]
  ];

  const cardW = Math.floor((contentWidth - 24) / 3);
  const cardH = 48;
  let x = marginLeft;
  let rowY = y;
  cards.forEach((c, idx) => {
    if (idx > 0 && idx % 3 === 0) {
      x = marginLeft;
      rowY += cardH + 12;
    }
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(x, rowY, cardW, cardH, 6, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text(c[0], x + 8, rowY + 16);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(String(c[1] ?? '-'), x + 8, rowY + 36);
    x += cardW + 12;
  });

  return rowY + cardH + 18;
}

function formatPdfDateTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function renderSignatures(doc, signatures, y, layout) {
  const { marginLeft, contentWidth } = layout;
  const gap = 18;
  const boxW = (contentWidth - gap * 2) / 3;
  let x = marginLeft;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SIGNATURES', marginLeft, y);
  y += 14;

  const items = [
    {
      label: 'Field Engineer Signature',
      value: signatures?.technician,
      name: signatures?.technicianName || signatures?.technician_name || ''
    },
    {
      label: 'Quality Reviewer Signature',
      value: signatures?.qcApproval,
      name: signatures?.qcReviewerName || signatures?.reviewerName || signatures?.approvalBy || 'Quality Reviewer'
    },
    {
      label: 'Date Approved',
      value: null,
      text: formatPdfDateTime(signatures?.approvedAt)
    }
  ];

  items.forEach((item) => {
    if (x + boxW > marginLeft + contentWidth) {
      x = marginLeft;
      y += 80;
    }
    doc.setDrawColor(203, 213, 225);
    doc.line(x, y + 42, x + boxW, y + 42);
    if (item.value) addPdfImageSafely(doc, item.value, x + 8, y + 2, boxW - 16, 36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(item.label.toUpperCase(), x, y + 58);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(item.text || item.name || '-', x, y + 74);
    x += boxW + gap;
  });

  return y + 96;
}

function renderFooter(doc, layout) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    const footerY = doc.internal.pageSize.getHeight() - layout.marginBottom + 8;
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${layout.companyName || COMPANY_NAME} · ${BRAND.footer} · ${REVISION_VERSION}`, layout.marginLeft, footerY);
    doc.text(`Generated: ${layout.generatedAt}`, pageWidth - layout.marginLeft - 140, footerY);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - layout.marginLeft, footerY, { align: 'right' });
  }
}

export async function generateConcreteTestLogPdf({ form, rows = [], weather, signatures = {}, attachments = [] }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const layout = {
    marginLeft: 36,
    marginTop: 20,
    marginBottom: 40,
    contentWidth: pageWidth - 72
  };

  layout.generatedAt = new Date().toLocaleString();
  layout.headerData = {
    projectName: form.projectName,
    dfrNumber: form.dfrNumber,
    dateSampled: form.dateSampled,
    technician: form.dataLogger || form.technician || form.technician_name,
    statusBadge: { label: form.status || 'Draft', color: [16, 185, 129] },
    generatedAt: layout.generatedAt,
    companyName: form.companyName || form.company_name || form.clientName || form.client_name || form.company || COMPANY_NAME
  };
  layout.companyName = layout.headerData.companyName;

  let cursorY = renderPdfHeader(doc, layout.headerData, layout) + 8;

  // Project info
  cursorY = renderProjectInformation(doc, form, cursorY, layout);

  // Specifications
  cursorY = renderSpecifications(doc, form, cursorY, layout);

  // Delivery records (each record its own block)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  cursorY = ensureSpace(doc, cursorY, 18, layout, { headerData: layout.headerData });
  doc.text('MATERIAL DELIVERY & VERIFICATION RECORDS', layout.marginLeft, cursorY);
  cursorY += 16;

  rows.forEach((row, idx) => {
    cursorY = ensureSpace(doc, cursorY, 260, layout, { headerData: layout.headerData });
    cursorY = renderDeliveryRecord(doc, row, idx, cursorY, layout);
    cursorY += 12;
  });

  // Attachments
  cursorY = ensureSpace(doc, cursorY, 120, layout, { headerData: layout.headerData });
  cursorY = renderAttachments(doc, attachments, cursorY, layout);

  // Summary
  const summary = {
    totalRecords: rows.length,
    totalCubicYards: rows.reduce((s, r) => s + Number(r.cubicYards || r.cubic_yards || 0), 0),
    totalCylinders: rows.reduce((s, r) => s + Number(r.labCylinders || r.lab_cylinders || 0) + Number(r.fieldCylinders || r.field_cylinders || 0), 0),
    passedTests: rows.filter((r) => (r.status || '').toLowerCase() === 'passed').length,
    failedTests: rows.filter((r) => (r.status || '').toLowerCase() === 'failed').length,
    pendingReview: rows.filter((r) => !r.status).length
  };

  cursorY = ensureSpace(doc, cursorY, 140, layout, { headerData: layout.headerData });
  cursorY = renderSummary(doc, summary, cursorY, layout);

  // Signatures
  const resolvedSignatures = {
    ...signatures,
    technician: await imageSourceToDataUrl(signatures.technician),
    qcApproval: await imageSourceToDataUrl(signatures.qcApproval)
  };
  cursorY = ensureSpace(doc, cursorY, 120, layout, { headerData: layout.headerData });
  cursorY = renderSignatures(doc, resolvedSignatures, cursorY, layout);

  // Footer on every page
  renderFooter(doc, layout);

  return doc.output('blob');
}
