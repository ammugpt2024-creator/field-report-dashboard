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

    <div className="w-full max-w-full overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">

      <div className="mb-4">

        <h3 className="text-xl font-semibold text-slate-950">
          Recent Operations Reports
        </h3>

      </div>

      <div className="space-y-3 md:hidden">
        {reports.map((report, index) => (
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4" key={index}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Report</p>
              <h4 className="mt-1 break-words text-base font-semibold text-slate-950">{report.name}</h4>
            </div>
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Project</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">{report.project}</p>
            </div>
            <span
              className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] status ${report.status
                .toLowerCase()
                .replace(" ", "-")}`}
            >
              {report.status}
            </span>
          </article>
        ))}
      </div>

      <table className="hidden w-full text-left text-sm md:table">

        <thead>

          <tr>
            <th className="bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">Report</th>
            <th className="bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">Project</th>
            <th className="bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">Status</th>
          </tr>

        </thead>

        <tbody>

          {reports.map((report, index) => (

            <tr key={index}>

              <td className="border-t border-slate-100 px-4 py-3 font-semibold text-slate-950">{report.name}</td>

              <td className="border-t border-slate-100 px-4 py-3 text-slate-700">{report.project}</td>

              <td className="border-t border-slate-100 px-4 py-3">

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
