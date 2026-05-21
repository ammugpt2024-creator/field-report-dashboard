import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const generateConcretePDF = async ({
  form,
  rows,
  weather,
  attachments = []
}) => {

  const doc = new jsPDF("landscape");

  const pageWidth = doc.internal.pageSize.getWidth();

  /*
  ==========================================
  HEADER
  ==========================================
  */

  doc.setFillColor(15, 23, 42);

  doc.rect(0, 0, pageWidth, 40, "F");

  doc.setTextColor(255, 255, 255);

  doc.setFontSize(24);

  doc.setFont("helvetica", "bold");

  doc.text("CONCRETE TEST LOG REPORT", 14, 18);

  doc.setFontSize(11);

  doc.setFont("helvetica", "normal");

  doc.text(
    "Concrete Placement Inspection & QA/QC",
    14,
    28
  );

  /*
  ==========================================
  REPORT DETAILS
  ==========================================
  */

  doc.setTextColor(0, 0, 0);

  doc.setFontSize(12);

  doc.setFont("helvetica", "bold");

  doc.text("PROJECT INFORMATION", 14, 52);

  doc.setFont("helvetica", "normal");

  doc.text(
    `Project Number: ${form.projectNumber}`,
    14,
    62
  );

  doc.text(
    `Project Name: ${form.projectName}`,
    14,
    70
  );

  doc.text(
    `General Contractor: ${form.generalContractor}`,
    14,
    78
  );

  doc.text(
    `GC Representative: ${form.gcRepresentative}`,
    14,
    86
  );

  doc.text(
    `Project Location: ${form.projectLocation}`,
    14,
    94
  );

  /*
  ==========================================
  REPORT META
  ==========================================
  */

  doc.setFont("helvetica", "bold");

  doc.text("REPORT DETAILS", 170, 52);

  doc.setFont("helvetica", "normal");

  doc.text(
    `DFR Number: ${form.dfrNumber}`,
    170,
    62
  );

  doc.text(
    `Sample Date: ${form.sampleDate}`,
    170,
    70
  );

  doc.text(
    `Technician: ${form.technicianName}`,
    170,
    78
  );

  doc.text(
    `Status: ${form.status}`,
    170,
    86
  );

  /*
  ==========================================
  WEATHER
  ==========================================
  */

  doc.setFont("helvetica", "bold");

  doc.text("WEATHER CONDITIONS", 14, 110);

  doc.setFont("helvetica", "normal");

  doc.text(
    `Condition: ${weather.condition}`,
    14,
    120
  );

  doc.text(
    `Current Temp: ${weather.temp}`,
    90,
    120
  );

  doc.text(
    `High: ${weather.high}`,
    160,
    120
  );

  doc.text(
    `Low: ${weather.low}`,
    220,
    120
  );

  /*
  ==========================================
  TABLE
  ==========================================
  */

  const tableBody = rows.map((row, index) => [
    index + 1,
    row.ticketNumber || "-",
    row.truckNumber || "-",
    row.mixDesign || "-",
    row.placementLocation || "-",
    row.batchTime || "-",
    row.arrivalTime || "-",
    row.sampleTime || "-",
    row.slump || "-",
    row.airContent || "-",
    row.concreteTemperature || "-",
    row.unitWeight || "-",
    row.yield || "-",
    row.waterAdded || "-",
    row.airTemperature || "-",
    row.cylindersMade || "-"
  ]);

  autoTable(doc, {
    startY: 130,

    head: [[
      "#",
      "Ticket",
      "Truck",
      "Mix",
      "Placement",
      "Batch",
      "Arrival",
      "Sample",
      "Slump",
      "Air %",
      "Conc Temp",
      "Unit Wt",
      "Yield",
      "Water",
      "Air Temp",
      "Cylinders"
    ]],

    body: tableBody,

    styles: {
      fontSize: 8,
      cellPadding: 2,
      overflow: "linebreak"
    },

    headStyles: {
      fillColor: [30, 41, 59],
      textColor: 255,
      fontStyle: "bold"
    },

    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },

    margin: {
      left: 10,
      right: 10
    }
  });

  /*
  ==========================================
  NOTES SECTION
  ==========================================
  */

  let currentY =
    doc.lastAutoTable.finalY + 15;

  rows.forEach((row, index) => {

    if (currentY > 180) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont("helvetica", "bold");

    doc.setFontSize(11);

    doc.text(
      `Sample ${index + 1} Notes`,
      14,
      currentY
    );

    currentY += 8;

    doc.setFont("helvetica", "normal");

    doc.setFontSize(9);

    doc.text(
      `Test Results: ${
        row.testResults || "-"
      }`,
      14,
      currentY
    );

    currentY += 6;

    doc.text(
      `SCC Notes: ${
        row.sccNotes || "-"
      }`,
      14,
      currentY
    );

    currentY += 6;

    doc.text(
      `Comments: ${
        row.comments || "-"
      }`,
      14,
      currentY
    );

    currentY += 6;

    doc.text(
      `Acceptance Notes: ${
        row.acceptanceNotes || "-"
      }`,
      14,
      currentY
    );

    currentY += 14;
  });

  /*
  ==========================================
  ATTACHMENTS
  ==========================================
  */

  if (attachments.length > 0) {

    if (currentY > 220) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont("helvetica", "bold");

    doc.setFontSize(11);

    doc.text(
      "ATTACHMENTS",
      14,
      currentY
    );

    currentY += 10;

    doc.setFont("helvetica", "normal");

    attachments.forEach((file, index) => {

      doc.text(
        `${index + 1}. ${file.name}`,
        18,
        currentY
      );

      currentY += 6;
    });
  }

  /*
  ==========================================
  SIGNATURE SECTION
  ==========================================
  */

  currentY += 20;

  if (currentY > 180) {
    doc.addPage();
    currentY = 30;
  }

  doc.setDrawColor(100);

  doc.line(20, currentY, 90, currentY);

  doc.line(120, currentY, 190, currentY);

  doc.line(220, currentY, 290, currentY);

  currentY += 8;

  doc.setFontSize(10);

  doc.text(
    "Technician Signature",
    28,
    currentY
  );

  doc.text(
    "GC Representative",
    132,
    currentY
  );

  doc.text(
    "Inspector Approval",
    235,
    currentY
  );

  /*
  ==========================================
  FOOTER
  ==========================================
  */

  const pageCount = doc.internal.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {

    doc.setPage(i);

    doc.setFontSize(8);

    doc.setTextColor(120);

    doc.text(
      `Generated on ${new Date().toLocaleString()}`,
      14,
      205
    );

    doc.text(
      `Page ${i} of ${pageCount}`,
      275,
      205
    );
  }

  /*
  ==========================================
  SAVE PDF
  ==========================================
  */

  doc.save(
    `${form.dfrNumber}-Concrete-Test-Log.pdf`
  );
};

export default generateConcretePDF;