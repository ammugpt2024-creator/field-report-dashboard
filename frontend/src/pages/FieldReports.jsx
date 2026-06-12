import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  ChevronLeft,
  Calendar,
  User,
  Cloud,
  CheckCircle,
  Clock
} from 'lucide-react';

function FieldReports() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  // Sample field reports data
  const [reports] = useState([
    {
      id: 1,
      number: 'FR-2024-001',
      date: '2024-05-18',
      inspector: 'John Smith',
      weather: 'Sunny, 28°C',
      status: 'Submitted',
      createdBy: 'John Smith',
      workers: 15,
      activities: 'Foundation excavation',
    },
    {
      id: 2,
      number: 'FR-2024-002',
      date: '2024-05-17',
      inspector: 'Sarah Johnson',
      weather: 'Cloudy, 25°C',
      status: 'Draft',
      createdBy: 'Sarah Johnson',
      workers: 12,
      activities: 'Concrete pouring',
    },
    {
      id: 3,
      number: 'FR-2024-003',
      date: '2024-05-16',
      inspector: 'Mike Davis',
      weather: 'Rainy, 22°C',
      status: 'Submitted',
      createdBy: 'Mike Davis',
      workers: 10,
      activities: 'Rebar placement',
    },
  ]);

  const filteredReports = reports.filter((report) => {
    const matchesSearch =
      report.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.inspector.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || report.status === statusFilter;
    const matchesDate = !dateFilter || report.date === dateFilter;
    return matchesSearch && matchesStatus && matchesDate;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'Submitted':
        return 'bg-green-100 text-green-800';
      case 'Draft':
        return 'bg-yellow-100 text-yellow-800';
      case 'Rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Submitted':
        return <CheckCircle className="w-4 h-4" />;
      case 'Draft':
        return <Clock className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-gradient-to-br from-gray-50 to-gray-100">
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
                <h1 className="break-words text-3xl font-bold text-gray-900">Field Operations</h1>
                <p className="text-gray-600 text-sm mt-1">Manage site operations, inspection workflows, and field compliance observations.</p>
              </div>
            </div>
            <button
              onClick={() => navigate(`/project/${projectId}/field-reports/create`)}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 font-semibold text-white transition-shadow hover:shadow-lg sm:w-auto"
            >
              <Plus className="w-5 h-5" />
              Create Field Operations Report
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by report # or inspector..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="Draft">Draft</option>
                <option value="Submitted">Submitted</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            {/* Date Filter */}
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {dateFilter && (
                <button
                  onClick={() => setDateFilter('')}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
          {filteredReports.length > 0 ? (
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
                      Inspector
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Weather
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Workers
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredReports.map((report, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900">{report.number}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{report.date}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="w-4 h-4 text-blue-600" />
                          </div>
                          <span className="text-sm font-medium text-gray-900">{report.inspector}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Cloud className="w-4 h-4" />
                          {report.weather}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(report.status)}`}>
                          {getStatusIcon(report.status)}
                          {report.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{report.workers}</td>
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
              {filteredReports.map((report, idx) => (
                <article key={idx} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-bold text-gray-900">{report.number}</h3>
                      <p className="mt-1 text-sm font-semibold text-gray-600">{report.date}</p>
                    </div>
                    <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(report.status)}`}>
                      {getStatusIcon(report.status)}
                      {report.status}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Inspector</p>
                      <p className="mt-1 font-semibold text-gray-800">{report.inspector}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Weather</p>
                      <p className="mt-1 font-semibold text-gray-800">{report.weather}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Workers</p>
                      <p className="mt-1 font-semibold text-gray-800">{report.workers}</p>
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
              <p className="text-gray-600">No field operations reports found</p>
            </div>
          )}
        </div>

        {/* Results Summary */}
        <div className="mt-4 text-sm text-gray-600">
          Showing <span className="font-semibold">{filteredReports.length}</span> of{' '}
          <span className="font-semibold">{reports.length}</span> reports
        </div>
      </div>
    </div>
  );
}

export default FieldReports;
