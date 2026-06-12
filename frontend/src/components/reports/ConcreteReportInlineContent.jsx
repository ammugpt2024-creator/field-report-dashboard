import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabase";

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function normalizeStatus(value) {
  const status = String(value || "").toLowerCase();
  if (status === "passed" || status === "pass") return "PASS";
  if (status === "failed" || status === "fail") return "FAIL";
  if (status === "retest") return "RETEST";
  return valueOrDash(value);
}

function statusClass(value) {
  const status = String(value || "").toLowerCase();
  if (status.includes("pass")) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status.includes("fail")) return "border-rose-200 bg-rose-50 text-rose-800";
  if (status.includes("retest")) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function FieldValue({ label, value, className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-950">{valueOrDash(value)}</p>
    </div>
  );
}

function getSpecifications(report) {
  const specs = report.specifications || {};
  return [
    ["Air Content (%)", specs.air_content_percent ?? specs.air_content ?? report.airContent ?? report.airContentPercent],
    ["Unit Weight (lbs/ft³)", specs.unit_weight_lbs_ft3 ?? specs.unit_weight ?? report.unitWeight ?? report.unitWeightLbsFt3],
    ["Spread (in)", specs.spread_in ?? specs.spread ?? report.spread ?? report.spreadIn],
    ["Slump (in)", specs.slump_in ?? specs.slump ?? report.slump],
    ["Material Temp (°F)", specs.concrete_temp_f ?? specs.concrete_temp ?? specs.material_temp_f ?? report.concreteTemperature ?? report.materialTemp],
    ["Mix No.", specs.mix_number ?? specs.mix_no ?? report.mixNumber ?? report.mixNo],
    ["J-Ring (in)", specs.j_ring_in ?? specs.j_ring ?? report.jRing ?? report.jRingIn],
    ["Specified Strength (PSI)", specs.speed_of_stress_psi ?? specs.speed_of_stress ?? specs.strength_spec ?? specs.specified_strength_psi ?? specs.specified_strength ?? report.specifiedStrength],
    ["DFR Number", specs.dfr_number ?? report.dfrNumber ?? report.reportNumber],
    ["Comments", specs.comments ?? report.notes]
  ];
}

function getRecords(report) {
  if (Array.isArray(report.deliveryRecords) && report.deliveryRecords.length) return report.deliveryRecords;
  if (Array.isArray(report.testRecords) && report.testRecords.length) return report.testRecords;
  return [{
    test_number: 1,
    ticket_number: report.ticketNumber,
    truck_number: report.truckNumber,
    cubic_yards: report.cubicYards,
    slump_in: report.slump,
    air_content_percent: report.airContent,
    concrete_temp_f: report.concreteTemperature,
    set_number: report.setNumber,
    lab_cylinders: report.labSamples,
    field_cylinders: report.fieldSamples,
    row_status: report.recordResult,
    comments: report.inspectorNotes || report.notes,
    strength_verification_required: report.strengthVerificationRequired
  }];
}

function isStrengthRequired(record) {
  return record?.strength_verification_required === true ||
    record?.strength_verification_required === "true" ||
    record?.strength_verification_required === "yes" ||
    record?.strengthVerificationRequired === true;
}

const CONSOLIDATED_RECORD_COLUMNS = [
  "Test #",
  "Ticket #",
  "Truck #",
  "CY",
  "Batch",
  "Arrival",
  "Tested",
  "Finish",
  "Minutes",
  "Result",
  "Water Added",
  "Air °F",
  "Conc °F",
  "Slump",
  "Air %",
  "Unit Wt",
  "Spread",
  "J-Ring",
  "Strength",
  "Set #",
  "Lab",
  "Field",
  "Comments"
];

function getSummary(report, records) {
  const summary = report.summary || {};
  const totalQuantity = summary.totalCubicYards ?? records.reduce((sum, record) => {
    const value = Number(record.cubic_yards ?? record.cubicYards ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const passed = summary.passedTests ?? records.filter((record) => String(record.row_status ?? record.recordResult ?? "").toLowerCase().includes("pass")).length;
  const failed = summary.failedTests ?? records.filter((record) => String(record.row_status ?? record.recordResult ?? "").toLowerCase().includes("fail")).length;
  const retests = records.filter((record) => String(record.row_status ?? record.recordResult ?? "").toLowerCase().includes("retest")).length;
  return {
    totalRecords: summary.totalRecords ?? records.length,
    totalQuantity,
    passed,
    failed,
    retests
  };
}

export default function ConcreteReportInlineContent({ report, reportLabel = "Report" }) {
  const [hydratedReport, setHydratedReport] = useState(report);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const linkedReportId = report?.linkedReportId || report?.linked_report_id;

  useEffect(() => {
    let active = true;
    setHydratedReport(report);

    async function hydrateReportDetails() {
      if (!linkedReportId || !/^\d+$/.test(String(linkedReportId))) {
        setLoadingDetails(false);
        return;
      }

      const currentRecords = getRecords(report);
      if (Array.isArray(report.deliveryRecords) && report.deliveryRecords.length > 1) {
        setLoadingDetails(false);
        return;
      }

      setLoadingDetails(true);
      const [specResponse, rowsResponse] = await Promise.all([
        supabase
          .from("concrete_specifications")
          .select("*")
          .eq("log_id", linkedReportId)
          .maybeSingle(),
        supabase
          .from("concrete_delivery_testing_records")
          .select("*")
          .eq("log_id", linkedReportId)
          .order("id", { ascending: true })
      ]);

      if (!active) return;
      if (!rowsResponse.error && Array.isArray(rowsResponse.data) && rowsResponse.data.length) {
        setHydratedReport((previous) => ({
          ...previous,
          specifications: specResponse.data || previous.specifications || {},
          deliveryRecords: rowsResponse.data.map((row, index) => ({
            ...row,
            test_number: row.test_number || String(index + 1)
          }))
        }));
      } else if (currentRecords.length) {
        setHydratedReport(report);
      }
      setLoadingDetails(false);
    }

    hydrateReportDetails().catch((error) => {
      if (!active) return;
      console.error("Unable to load all Concrete Report records", error);
      setLoadingDetails(false);
    });

    return () => {
      active = false;
    };
  }, [linkedReportId, report]);

  const specifications = getSpecifications(hydratedReport);
  const records = useMemo(() => getRecords(hydratedReport), [hydratedReport]);
  const summary = getSummary(hydratedReport, records);

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <section className="report-section keep-together">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Concrete Report Details</p>
            <h4 className="mt-1 text-lg font-bold text-slate-950">{reportLabel} · {report.dfrNumber || report.reportNumber || "Concrete Report"}</h4>
          </div>
          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${statusClass(report.status)}`}>
            {report.status || "Draft"}
          </span>
        </div>
      </section>

      <section className="report-section keep-together specification-summary">
        <h5 className="text-sm font-bold text-slate-950">Inspection Requirements</h5>
        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-3">
          {specifications.map(([label, value]) => (
            // Free-text fields get the full row so they don't crush the grid on phones.
            <FieldValue key={label} label={label} value={value} className={label === "Comments" || label === "DFR Number" ? "col-span-2 xl:col-span-1" : ""} />
          ))}
        </div>
      </section>

      <section className="report-section keep-together">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h5 className="text-sm font-bold text-slate-950">Material Delivery & Verification Records</h5>
          <span className="text-xs font-bold text-slate-500">{loadingDetails ? "Loading records..." : `${records.length} records`}</span>
        </div>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[1680px] w-full border-collapse text-left text-xs">
            <thead className="bg-slate-950 text-white">
              <tr>
                {CONSOLIDATED_RECORD_COLUMNS.map((heading) => (
                  <th key={heading} className="border-r border-slate-800 px-2 py-2 font-bold last:border-r-0">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => {
                const result = record.row_status ?? record.recordResult;
                return (
                  <tr key={record.id || index} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.test_number ?? record.testNumber ?? index + 1)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.ticket_number ?? record.ticketNumber)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.truck_number ?? record.truckNumber)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.cubic_yards ?? record.cubicYards)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.time_batched ?? record.timeBatched)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.arrival_time ?? record.arrivalTime)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.time_tested ?? record.timeTested)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.finish_unload ?? record.finishUnload)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.actual_minutes ?? record.actualMinutes)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2">
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(result)}`}>{normalizeStatus(result)}</span>
                    </td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.water_added_gal ?? record.waterAdded)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.air_temp_f ?? record.airTempF)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.concrete_temp_f ?? record.concreteTempF)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.slump_in ?? record.slump)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.air_content_percent ?? record.airContent)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.unit_weight_lbs_ft3 ?? record.unitWeight)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.spread_in ?? record.spread)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.j_ring_in ?? record.jRing)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{isStrengthRequired(record) ? "Required" : "No"}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.set_number ?? record.setNumber)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.lab_cylinders ?? record.lab_samples ?? record.labSamples)}</td>
                    <td className="border-r border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.field_cylinders ?? record.field_samples ?? record.fieldSamples)}</td>
                    <td className="border-t border-slate-200 px-2 py-2 font-semibold">{valueOrDash(record.comments ?? record.inspectorNotes)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-section keep-together">
        <h5 className="text-sm font-bold text-slate-950">Compliance Summary</h5>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <FieldValue label="Total Records" value={summary.totalRecords} />
          <FieldValue label="Total Quantity" value={summary.totalQuantity} />
          <FieldValue label="Passed" value={summary.passed} />
          <FieldValue label="Failed" value={summary.failed} />
          <FieldValue label="Retests" value={summary.retests} />
        </div>
      </section>
    </div>
  );
}
