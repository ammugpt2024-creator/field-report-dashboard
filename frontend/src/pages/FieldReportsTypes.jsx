import { useParams, useNavigate } from 'react-router-dom';
import {
  Grid,
  FileText,
  ClipboardList,
  Eye,
  ListChecks
} from 'lucide-react';

function FieldReportsTypes() {

  const { projectId } = useParams();
  const navigate = useNavigate();

  const types = [
    {
      id: 'concrete-test-log',
      title: 'Field Operations',
      description:
        'Track material placement, batch data, verification checks, strength samples, and acceptance results onsite.',
      icon: ClipboardList,
      color: 'bg-blue-50',
      iconColor: 'text-blue-700',
      route: `/project/${projectId}/field-reports/concrete-test-log`
    },
    {
      id: 'daily-field-report',
      title: 'Daily Field Report',
      description:
        'Capture daily manpower, weather, safety notes, delays, and site progress updates.',
      icon: FileText,
      color: 'bg-slate-50',
      iconColor: 'text-slate-700',
      route: `/project/${projectId}/field-reports/daily-report`
    },
    {
      id: 'inspection-reports',
      title: 'Inspection Reports',
      description:
        'Manage QC inspections, punch items, compliance checks, and observations.',
      icon: ListChecks,
      color: 'bg-amber-50',
      iconColor: 'text-amber-700',
      route: `/project/${projectId}/field-reports/inspection-reports`
    },
    {
      id: 'pour-cards',
      title: 'Pour Cards',
      description:
        'Maintain pour sequence details, placement locations, and concrete mix information.',
      icon: Grid,
      color: 'bg-emerald-50',
      iconColor: 'text-emerald-700',
      route: `/project/${projectId}/field-reports/pour-cards`
    },
    {
      id: 'site-observations',
      title: 'Site Observations',
      description:
        'Document real-time site observations, safety concerns, and field conditions.',
      icon: Eye,
      color: 'bg-indigo-50',
      iconColor: 'text-indigo-700',
      route: `/project/${projectId}/field-reports/site-observations`
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">

      <div className="max-w-7xl mx-auto px-6 py-10">

        {/* Header */}

        <div className="mb-10">

          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
            Field Operations
          </h1>

          <p className="text-gray-600 mt-3 text-lg">
            Select an operational workflow to manage field compliance documentation.
          </p>

        </div>

        {/* Cards */}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-7">

          {types.map((item) => {

            const Icon = item.icon;

            return (

              <button
                key={item.id}
                onClick={() => navigate(item.route)}
                className="
                  group
                  text-left
                  bg-white
                  border
                  border-gray-200
                  rounded-3xl
                  p-7
                  shadow-sm
                  hover:shadow-2xl
                  hover:-translate-y-1
                  transition-all
                  duration-300
                "
              >

                {/* Icon */}

                <div
                  className={`
                    ${item.color}
                    inline-flex
                    items-center
                    justify-center
                    p-4
                    rounded-2xl
                    mb-5
                    transition-transform
                    duration-300
                    group-hover:scale-105
                  `}
                >

                  <Icon className={`w-8 h-8 ${item.iconColor}`} />

                </div>

                {/* Title */}

                <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                  {item.title}
                </h2>

                {/* Description */}

                <p className="text-gray-600 leading-relaxed text-sm">
                  {item.description}
                </p>

                {/* Footer */}

                <div className="mt-6 flex items-center text-sm font-medium text-blue-600">
                  Open Workflow
                  <span className="ml-2 transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </div>

              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default FieldReportsTypes;
