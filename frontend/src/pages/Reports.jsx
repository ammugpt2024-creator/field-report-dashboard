import FileUpload from "../components/FileUpload";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../services/supabase";

function Reports() {

  const { projectId } = useParams();

  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, [projectId]);

  async function fetchReports() {

    setLoading(true);

    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .eq("project_id", projectId)
      .order("id", { ascending: false });

    if (error) {
      console.log("Error fetching reports:", error);
    } else {
      setReports(data || []);
    }

    setLoading(false);
  }

  // SEARCH FILTER
  const filteredReports = reports.filter((report) => {

    const reportType = report.report_type || "";
    const remarks = report.remarks || "";

    return (
      reportType.toLowerCase().includes(search.toLowerCase()) ||
      remarks.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="p-6 bg-gray-100 min-h-screen">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">

        <h1 className="text-4xl font-bold text-gray-800">
          Reports
        </h1>

        {/* SEARCH */}
        <input
          type="text"
          placeholder="Search reports..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-80 p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

      </div>

      {/* FILE UPLOAD */}
      <div className="mb-8">
        <FileUpload projectId={projectId} />
      </div>

      {/* LOADING */}
      {loading ? (
        <div className="text-center text-gray-500 text-lg mt-10">
          Loading reports...
        </div>
      ) : (

        <>
          {/* REPORT GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {filteredReports.map((report) => (

              <div
                key={report.id}
                className="bg-white p-6 rounded-2xl shadow-md hover:shadow-2xl transition duration-300"
              >

                <h2 className="text-2xl font-bold text-gray-800">
                  {report.report_type}
                </h2>

                <p className="text-gray-600 mt-3 mb-5">
                  {report.remarks || "No remarks available"}
                </p>

                <a
                  href={report.file_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <button className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition">
                    Open PDF
                  </button>
                </a>

              </div>

            ))}

          </div>

          {/* EMPTY STATE */}
          {filteredReports.length === 0 && (
            <div className="text-center text-gray-500 text-lg mt-10">
              No reports found
            </div>
          )}

        </>

      )}

    </div>
  );
}

export default Reports;