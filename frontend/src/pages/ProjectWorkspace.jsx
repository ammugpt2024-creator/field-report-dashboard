import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

import {
  FileText,
  Beaker,
  ChevronRight,
  MapPin,
  Calendar,
  User,
  Package,
  FlaskConical,
  ClipboardCheck,
  Building2,
  Activity
} from "lucide-react";
import { MODULE_NAMES } from "../config/branding";

function ProjectWorkspace() {

  const { projectId } = useParams();

  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loadingProject, setLoadingProject] = useState(true);

  useEffect(() => {
    async function loadProject() {
      setLoadingProject(true);
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (error) {
        console.error("Project load failed", error);
        setProject(null);
      } else {
        setProject({
          id: projectId,
          name: data.project_name || "",
          number: data.project_number || "",
          client: data.client_name || "",
          status: data.status || "Active",
          location: data.project_location || "",
          startDate: data.start_date || "",
          manager: data.client_representative || "",
          description: data.description || ""
        });
      }
      setLoadingProject(false);
    }

    loadProject();
  }, [projectId]);

  /*
  ==========================================
  MODULES
  ==========================================
  */

  const modules = [

    /*
    ==========================================
    FIELD OPERATIONS
    ==========================================
    */

    {
      id: "field-reports",

      title: MODULE_NAMES.fieldOps,

      description:
        "Site operations, field assignments, evidence capture, and inspection workflows for daily operational execution.",

      icon: FileText,

      gradient:
        "bg-gradient-to-br from-blue-50 to-blue-100",

      iconBg: "bg-blue-600",

      actions: [

        {
          label: "Create Site Operations Record",

          onClick: () =>
            navigate(
              `/project/${projectId}/field-reports/daily-report/create`
            ),

          primary: true
        },

        {
          label: `View ${MODULE_NAMES.fieldOps}`,

          onClick: () =>
            navigate(
              `/project/${projectId}/field-reports/daily-report`
            ),

          primary: false
        }
      ],

      stats: {
        reports: 12,
        updated: "Today"
      }
    },

    /*
    ==========================================
    LAB INTELLIGENCE
    ==========================================
    */

    {
      id: "lab-reports",

      title: MODULE_NAMES.labIntelligence,

      description:
        "Laboratory intelligence records, material verification, test results, and compliance evidence for project teams.",

      icon: Beaker,

      gradient:
        "bg-gradient-to-br from-green-50 to-emerald-100",

      iconBg: "bg-emerald-600",

      actions: [

        {
          label: "Create Lab Intelligence Record",

          onClick: () =>
            navigate(
              `/project/${projectId}/lab-reports/create`
            ),

          primary: true
        },

        {
          label: `View ${MODULE_NAMES.labIntelligence}`,

          onClick: () =>
            navigate(
              `/project/${projectId}/lab-reports`
            ),

          primary: false
        }
      ],

      stats: {
        reports: 8,
        updated: "Yesterday"
      }
    },

    /*
    ==========================================
    FIELD OPERATIONS QUALITY
    ==========================================
    */

    {
      id: "concrete-tests",

      title: MODULE_NAMES.materialAssurance,

      description:
        "Field operations quality records, verification data, placement metrics, validation status, and digital deliverables.",

      icon: FlaskConical,

      gradient:
        "bg-gradient-to-br from-orange-50 to-orange-100",

      iconBg: "bg-orange-600",

      actions: [

        {
          label: "Create Field Operations Record",

          onClick: () =>
            navigate(
              `/project/${projectId}/field-reports/concrete-test-log/create`
            ),

          primary: true
        },

        {
          label: `View ${MODULE_NAMES.materialAssurance}`,

          onClick: () =>
            navigate(
              `/project/${projectId}/field-reports/concrete-test-log`
            ),

          primary: false
        }
      ],

      stats: {
        reports: 24,
        updated: "Today"
      }
    },

    /*
    ==========================================
    INSPECTIONS
    ==========================================
    */

    {
      id: "inspections",

      title: MODULE_NAMES.inspectionWorkflows,

      description:
        "Inspection workflows, quality incidents, resolution tracking, approvals, safety audits, and asset verification.",

      icon: ClipboardCheck,

      gradient:
        "bg-gradient-to-br from-purple-50 to-purple-100",

      iconBg: "bg-purple-600",

      actions: [

        {
          label: "Create Inspection Workflow",

          onClick: () =>
            navigate(
              `/project/${projectId}/inspections/create`
            ),

          primary: true
        },

        {
          label: `View ${MODULE_NAMES.inspectionWorkflows}`,

          onClick: () =>
            navigate(
              `/project/${projectId}/inspections`
            ),

          primary: false
        }
      ],

      stats: {
        reports: 6,
        updated: "2 Days Ago"
      }
    }
  ];

  if (loadingProject) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-100 text-sm font-semibold text-slate-700">
        Loading project workspace...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-100 text-sm font-semibold text-red-700">
        Project could not be loaded from Supabase.
      </div>
    );
  }

  return (

    <div className="bg-gradient-to-br from-slate-50 to-slate-100">

      {/* HEADER */}

      <div className="bg-white border-b border-slate-200 shadow-sm">

        <div className="max-w-7xl mx-auto px-6 py-10">

          <div className="
            flex
            flex-col
            lg:flex-row
            lg:items-start
            lg:justify-between
            gap-8
          ">

            {/* LEFT */}

            <div>

              <div className="
                flex
                flex-wrap
                items-center
                gap-4
                mb-4
              ">

                <h1 className="
                  text-3xl
                  md:text-5xl
                  font-bold
                  text-slate-900
                ">
                  {project.name}
                </h1>

                <span className="
                  inline-flex
                  items-center
                  px-4
                  py-2
                  rounded-full
                  text-sm
                  font-semibold
                  bg-emerald-100
                  text-emerald-700
                ">

                  <Activity className="w-4 h-4 mr-2" />

                  {project.status}

                </span>

              </div>

              <p className="
                text-slate-600
                text-lg
                max-w-4xl
                leading-relaxed
              ">
                {project.description}
              </p>

            </div>

            {/* RIGHT */}

            <div className="
              bg-gradient-to-r
              from-blue-600
              to-blue-700
              text-white
              rounded-3xl
              px-8
              py-6
              w-full
              max-w-full
              sm:w-auto
              shadow-xl
            ">

              <div className="
                flex
                items-center
                gap-4
                mb-4
              ">

                <div className="
                  bg-white/20
                  p-3
                  rounded-2xl
                ">

                  <Building2 className="w-7 h-7" />

                </div>

                <div>

                  <p className="text-blue-100 text-sm">
                    Project Number
                  </p>

                  <h2 className="text-2xl font-bold">
                    {project.number}
                  </h2>

                </div>

              </div>

              <p className="text-blue-100 text-sm">
                Operations Manager
              </p>

              <p className="font-semibold mt-1">
                {project.manager}
              </p>

            </div>

          </div>

          {/* DETAILS */}

          <div className="
            grid
            grid-cols-1
            md:grid-cols-2
            xl:grid-cols-4
            gap-5
            mt-10
          ">

            <InfoCard
              icon={Package}
              title="PROJECT NUMBER"
              value={project.number}
            />

            <InfoCard
              icon={User}
              title="CLIENT"
              value={project.client}
            />

            <InfoCard
              icon={MapPin}
              title="LOCATION"
              value={project.location}
            />

            <InfoCard
              icon={Calendar}
              title="START DATE"
              value={project.startDate}
            />

          </div>

        </div>

      </div>

      {/* CONTENT */}

      <div className="max-w-7xl mx-auto px-6 py-12">

        {/* TITLE */}

        <div className="mb-10">

          <h2 className="
            text-4xl
            font-bold
            text-slate-900
            mb-3
          ">
            {MODULE_NAMES.projectHub}
          </h2>

          <p className="
            text-slate-600
            text-lg
          ">
            Manage field operations, validation workflows, evidence records, and digital deliverables
          </p>

        </div>

        {/* MODULE CARDS */}

        <div className="
          grid
          grid-cols-1
          lg:grid-cols-2
          gap-8
        ">

          {modules.map((module) => {

            const IconComponent = module.icon;

            return (

              <div
                key={module.id}
                className="
                  bg-white
                  rounded-3xl
                  border
                  border-slate-200
                  overflow-hidden
                  shadow-sm
                  hover:shadow-2xl
                  hover:-translate-y-1
                  transition-all
                  duration-300
                "
              >

                {/* CARD HEADER */}

                <div className={`
                  ${module.gradient}
                  px-8
                  py-8
                  border-b
                  border-slate-200
                `}>

                  <div className="
                    flex
                    items-start
                    gap-5
                  ">

                    <div className={`
                      ${module.iconBg}
                      p-4
                      rounded-2xl
                      shadow-lg
                    `}>

                      <IconComponent
                        className="w-8 h-8 text-white"
                      />

                    </div>

                    <div className="flex-1">

                      <h3 className="
                        text-3xl
                        font-bold
                        text-slate-900
                        mb-2
                      ">
                        {module.title}
                      </h3>

                      <p className="
                        text-slate-600
                        leading-relaxed
                      ">
                        {module.description}
                      </p>

                    </div>

                  </div>

                </div>

                {/* BODY */}

                <div className="px-8 py-8">

                  <div className="space-y-4">

                    {module.actions.map((action, idx) => (

                      <button
                        key={idx}
                        onClick={action.onClick}
                        className={`
                          w-full
                          px-6
                          py-4
                          rounded-2xl
                          font-semibold
                          flex
                          items-center
                          justify-between
                          transition-all
                          duration-300
                          group

                          ${
                            action.primary
                              ? `
                                bg-gradient-to-r
                                from-blue-600
                                to-blue-700
                                text-white
                                hover:shadow-xl
                                hover:scale-[1.01]
                              `
                              : `
                                bg-slate-100
                                text-slate-900
                                hover:bg-slate-200
                                border
                                border-slate-300
                              `
                          }
                        `}
                      >

                        <span>
                          {action.label}
                        </span>

                        <ChevronRight className="
                          w-5
                          h-5
                          group-hover:translate-x-1
                          transition-transform
                        " />

                      </button>

                    ))}

                  </div>

                </div>

                {/* FOOTER */}

                <div className="
                  px-8
                  py-5
                  bg-slate-50
                  border-t
                  border-slate-200
                ">

                  <div className="
                    flex
                    items-center
                    justify-between
                  ">

                    <p className="text-sm text-slate-600">

                      <span className="
                        font-bold
                        text-slate-900
                      ">
                        {module.stats.reports}
                      </span>

                      {" "}Records

                    </p>

                    <p className="
                      text-sm
                      text-slate-500
                    ">
                      Updated {module.stats.updated}
                    </p>

                  </div>

                </div>

              </div>
            );
          })}

        </div>

      </div>

    </div>
  );
}

/*
==========================================
INFO CARD
==========================================
*/

function InfoCard({
  icon: Icon,
  title,
  value
}) {

  return (

    <div className="
      flex
      items-center
      gap-4
      p-5
      rounded-2xl
      bg-white
      border
      border-slate-200
      shadow-sm
    ">

      <div className="
        bg-slate-100
        p-3
        rounded-2xl
      ">

        <Icon className="w-6 h-6 text-slate-700" />

      </div>

      <div>

        <p className="
          text-xs
          font-semibold
          tracking-wider
          text-slate-500
          uppercase
        ">
          {title}
        </p>

        <p className="
          text-sm
          font-bold
          text-slate-900
          mt-1
        ">
          {value}
        </p>

      </div>

    </div>
  );
}

export default ProjectWorkspace;
