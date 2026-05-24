function ReportsTable() {

  const reports = [
    {
      name: "Concrete Strength Test",
      project: "Project Alpha",
      status: "Completed"
    },
    {
      name: "Density Test",
      project: "Project Beta",
      status: "Pending"
    },
    {
      name: "Slump Test",
      project: "Project Alpha",
      status: "In Progress"
    }
  ];

  return (

    <div className="table-card">

      <div className="table-header">

        <h3>
          Recent Reports
        </h3>

      </div>

      <div className="report-card-list">
        {reports.map((report, index) => (
          <article className="report-mobile-card" key={index}>
            <div>
              <p className="report-mobile-label">Report</p>
              <h4>{report.name}</h4>
            </div>
            <div>
              <p className="report-mobile-label">Project</p>
              <p>{report.project}</p>
            </div>
            <span
              className={`status ${report.status
                .toLowerCase()
                .replace(" ", "-")}`}
            >
              {report.status}
            </span>
          </article>
        ))}
      </div>

      <table className="custom-table">

        <thead>

          <tr>
            <th>Report</th>
            <th>Project</th>
            <th>Status</th>
          </tr>

        </thead>

        <tbody>

          {reports.map((report, index) => (

            <tr key={index}>

              <td>{report.name}</td>

              <td>{report.project}</td>

              <td>

                <span
                  className={`status ${report.status
                    .toLowerCase()
                    .replace(" ", "-")}`}
                >

                  {report.status}

                </span>

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
  );
}

export default ReportsTable;
