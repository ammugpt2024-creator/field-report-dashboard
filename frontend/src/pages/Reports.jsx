import FileUpload from "../components/FileUpload";

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { supabase } from "../services/supabase";

function Reports() {

  const { projectId } = useParams();

  const [reports, setReports] =
    useState([]);

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    fetchReports();

  }, [projectId]);

  async function fetchReports() {

    try {

      setLoading(true);

      const { data, error } =
        await supabase
          .from("reports")
          .select("*")
          .eq("project_id", projectId)
          .order("id", {
            ascending: false
          });

      if (error) {

        console.log(
          "Error fetching reports:",
          error
        );

      } else {

        setReports(data || []);
      }

    } catch (err) {

      console.log(
        "Unexpected error:",
        err
      );

    } finally {

      setLoading(false);
    }
  }

  // SEARCH FILTER

  const filteredReports =
    reports.filter((report) => {

      const reportName =
        report.name || "";

      const remarks =
        report.remarks || "";

      const type =
        report.type || "";

      return (
        reportName
          .toLowerCase()
          .includes(
            search.toLowerCase()
          ) ||

        remarks
          .toLowerCase()
          .includes(
            search.toLowerCase()
          ) ||

        type
          .toLowerCase()
          .includes(
            search.toLowerCase()
          )
      );
    });

  return (

    <div
      className="
        p-8
        bg-gray-100
        min-h-screen
      "
    >

      {/* HEADER */}

      <div
        className="
          flex
          flex-col
          md:flex-row
          md:items-center
          md:justify-between
          gap-5
          mb-8
        "
      >

        <div>

          <h1
            className="
              text-5xl
              font-bold
              text-gray-800
            "
          >
            Reports
          </h1>

          <p
            className="
              text-gray-500
              mt-2
            "
          >
            Manage uploaded reports
            and inspection files
          </p>

        </div>

        {/* SEARCH */}

        <input
          type="text"
          placeholder="Search reports..."
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
          className="
            w-full
            md:w-80
            p-4
            border
            border-gray-300
            rounded-2xl
            bg-white
            focus:outline-none
            focus:ring-2
            focus:ring-blue-500
          "
        />

      </div>

      {/* FILE UPLOAD */}

      <div className="mb-10">

        <FileUpload
          projectId={projectId}
        />

      </div>

      {/* LOADING */}

      {loading ? (

        <div
          className="
            text-center
            text-gray-500
            text-xl
            mt-20
          "
        >
          Loading reports...
        </div>

      ) : (

        <>

          {/* REPORT GRID */}

          <div
            className="
              grid
              grid-cols-1
              md:grid-cols-2
              xl:grid-cols-3
              gap-8
            "
          >

            {filteredReports.map(
              (report) => (

                <div
                  key={report.id}
                  className="
                    bg-white
                    p-7
                    rounded-3xl
                    shadow-sm
                    hover:shadow-2xl
                    transition
                    border
                    border-gray-100
                  "
                >

                  {/* ICON */}

                  <div
                    className="
                      text-5xl
                      mb-5
                    "
                  >
                    📄
                  </div>

                  {/* REPORT NAME */}

                  <h2
                    className="
                      text-2xl
                      font-bold
                      text-gray-800
                      break-words
                    "
                  >
                    {report.name}
                  </h2>

                  {/* TYPE */}

                  <div
                    className="
                      inline-block
                      mt-3
                      mb-4
                      px-3
                      py-1
                      rounded-full
                      bg-blue-100
                      text-blue-700
                      text-sm
                      font-medium
                    "
                  >
                    {report.type || "field"}
                  </div>

                  {/* REMARKS */}

                  <p
                    className="
                      text-gray-600
                      mb-6
                      leading-7
                    "
                  >
                    {report.remarks ||
                      "No remarks available"}
                  </p>

                  {/* BUTTON */}

                  <a
                    href={report.url}
                    target="_blank"
                    rel="noreferrer"
                    className="
                      inline-block
                      bg-blue-600
                      text-white
                      px-5
                      py-3
                      rounded-xl
                      hover:bg-blue-700
                      transition
                      font-semibold
                    "
                  >
                    Open PDF
                  </a>

                </div>

              )
            )}

          </div>

          {/* EMPTY STATE */}

          {filteredReports.length === 0 && (

            <div
              className="
                text-center
                text-gray-500
                text-xl
                mt-20
              "
            >
              No reports found
            </div>

          )}

        </>

      )}

    </div>
  );
}

export default Reports;