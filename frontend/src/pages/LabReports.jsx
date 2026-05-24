import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  Plus,
  ChevronLeft,
  Beaker,
  TestTube,
  Droplets,
  Zap,
  Download,
  Eye
} from 'lucide-react';

function LabReports() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  // Sample lab reports data
  const [reports] = useState([
    {
      id: 1,
      number: 'LR-2024-001',
      date: '2024-05-18',
      testType: 'Concrete Compression',
      specimen: 'Concrete Cylinder #1-3',
      result: '32.5 MPa',
      status: 'Completed',
      technician: 'Dr. Ahmed Khan',
    },
    {
      id: 2,
      number: 'LR-2024-002',
      date: '2024-05-17',
      testType: 'Soil Compaction',
      specimen: 'Soil Sample - Zone A',
      result: '95% Modified Proctor',
      status: 'Completed',
      technician: 'Dr. Sarah Lee',
    },
    {
      id: 3,
      number: 'LR-2024-003',
      date: '2024-05-16',
      testType: 'Aggregate Testing',
      specimen: 'Coarse Aggregate',
      result: 'Pass - Gradation OK',
      status: 'Pending',
      technician: 'Dr. Michael Brown',
    },
  ]);

  const getTestIcon = (testType) => {
    switch (testType) {
      case 'Concrete Compression':
        return <Zap className="w-5 h-5" />;
      case 'Soil Compaction':
        return <Droplets className="w-5 h-5" />;
      case 'Aggregate Testing':
        return <TestTube className="w-5 h-5" />;
      default:
        return <Beaker className="w-5 h-5" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-100 text-green-800';
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'Failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <button
                onClick={() => navigate(`/project/${projectId}`)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-6 h-6 text-gray-600" />
              </button>
              <div className="min-w-0">
                <h1 className="break-words text-3xl font-bold text-gray-900">Lab Intelligence</h1>
                <p className="text-gray-600 text-sm mt-1">Manage laboratory verification records and compliance documentation.</p>
              </div>
            </div>
            <button
              onClick={() => navigate(`/project/${projectId}/lab-reports/create`)}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-4 py-2 font-semibold text-white transition-shadow hover:shadow-lg sm:w-auto"
            >
              <Plus className="w-5 h-5" />
              Create Lab Report
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
          {reports.length > 0 ? (
            <>
            <div className="hidden lg:block">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Report #
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Test Type
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Specimen
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Result
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Field Engineer
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {reports.map((report, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900">{report.number}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{report.date}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-900">
                          {getTestIcon(report.testType)}
                          {report.testType}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{report.specimen}</td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900 text-sm">{report.result}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(report.status)}`}>
                          {report.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{report.technician}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            className="p-2 hover:bg-blue-50 rounded-lg transition-colors text-blue-600"
                            title="View Report"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 hover:bg-green-50 rounded-lg transition-colors text-green-600"
                            title="Export PDF"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-4 p-4 lg:hidden">
              {reports.map((report, idx) => (
                <article key={idx} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-bold text-gray-900">{report.number}</h3>
                      <p className="mt-1 text-sm font-semibold text-gray-600">{report.date}</p>
                    </div>
                    <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(report.status)}`}>
                      {report.status}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Test Type</p>
                      <p className="mt-1 flex items-center gap-2 font-semibold text-gray-800">{getTestIcon(report.testType)} {report.testType}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Specimen</p>
                      <p className="mt-1 font-semibold text-gray-800">{report.specimen}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Result</p>
                      <p className="mt-1 font-semibold text-gray-800">{report.result}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Field Engineer</p>
                      <p className="mt-1 font-semibold text-gray-800">{report.technician}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 py-2 font-semibold text-blue-700">
                      <Eye className="h-4 w-4" />
                      View Report
                    </button>
                    <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-50 px-4 py-2 font-semibold text-green-700">
                      <Download className="h-4 w-4" />
                      Export PDF
                    </button>
                  </div>
                </article>
              ))}
            </div>
            </>
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="text-gray-600">No concrete quality reports found</p>
            </div>
          )}
        </div>

        {/* Results Summary */}
        <div className="mt-4 text-sm text-gray-600">
          Showing <span className="font-semibold">{reports.length}</span> concrete quality reports
        </div>
      </div>
    </div>
  );
}

export default LabReports
