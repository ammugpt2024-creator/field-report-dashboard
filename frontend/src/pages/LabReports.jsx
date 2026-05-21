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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(`/project/${projectId}`)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-6 h-6 text-gray-600" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Lab Reports</h1>
                <p className="text-gray-600 text-sm mt-1">Concrete testing, soil analysis, and laboratory QA/QC documentation</p>
              </div>
            </div>
            <button
              onClick={() => navigate(`/project/${projectId}/lab-reports/create`)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg font-semibold hover:shadow-lg transition-shadow"
            >
              <Plus className="w-5 h-5" />
              Create Lab Report
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
          {reports.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
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
                      Technician
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
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="text-gray-600">No lab reports found</p>
            </div>
          )}
        </div>

        {/* Results Summary */}
        <div className="mt-4 text-sm text-gray-600">
          Showing <span className="font-semibold">{reports.length}</span> lab reports
        </div>
      </div>
    </div>
  );
}

export default LabReports