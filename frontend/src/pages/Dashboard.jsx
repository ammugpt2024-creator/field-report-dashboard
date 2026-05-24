import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  FolderKanban,
  AlertTriangle,
  Plus,
  X
} from "lucide-react";

import StatCard from "../components/StatCard";
import { supabase } from "../services/supabase";

function Dashboard() {

  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    project_number: "",
    project_name: "",
    client_name: "",
    client_representative: "",
    project_location: "",
    status: "Active"
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      console.log(error);
    } else {
      setProjects(data || []);
    }
  }

  async function createProject() {

    const { error } = await supabase
      .from("projects")
      .insert([formData]);

    if (error) {

      alert(error.message);

    } else {

      setShowModal(false);

      setFormData({
        project_number: "",
        project_name: "",
        client_name: "",
        client_representative: "",
        project_location: "",
        status: "Active"
      });

      fetchProjects();
    }
  }

  const filteredProjects = projects.filter(
    (project) =>
      project.project_name
        ?.toLowerCase()
        .includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-slate-400">QC Management Platform</p>
              <h1 className="mt-3 text-4xl font-semibold text-slate-900">Projects</h1>
              <p className="mt-2 text-slate-600">
                Manage all QA/QC projects in one place
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus size={18} />
                Create Project
              </button>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-64 rounded-2xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Projects"
            value={projects.length}
            color="blue"
            icon={<FolderKanban size={24} />}
          />
          <StatCard
            title="Active Projects"
            value={projects.filter((project) => project.status === "Active").length}
            color="green"
            icon={<FolderKanban size={24} />}
          />
          <StatCard
            title="Pending Review"
            value={projects.filter((project) => project.status === "Pending").length}
            color="orange"
            icon={<AlertTriangle size={24} />}
          />
          <StatCard
            title="Delayed Projects"
            value={projects.filter((project) => project.status === "Delayed").length}
            color="red"
            icon={<AlertTriangle size={24} />}
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                    <span className="text-2xl">📁</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{project.project_name}</h2>
                    <p className="text-sm text-slate-500">{project.project_number}</p>
                  </div>
                </div>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  project.status === 'Active' ? 'bg-emerald-100 text-emerald-800' :
                  project.status === 'Pending' ? 'bg-amber-100 text-amber-800' :
                  project.status === 'Delayed' ? 'bg-rose-100 text-rose-800' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {project.status}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-slate-500">Client:</span>
                  <span className="ml-2 font-medium text-slate-900">{project.client_name || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Representative:</span>
                  <span className="ml-2 font-medium text-slate-900">{project.client_representative || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Location:</span>
                  <span className="ml-2 font-medium text-slate-900">{project.project_location || '—'}</span>
                </div>
              </div>
              <button
                onClick={() => navigate(`/project/${project.id}`)}
                className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Open Project
              </button>
            </div>
          ))}
        </div>

        {filteredProjects.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center text-slate-600">
            <FolderKanban className="mx-auto mb-4 h-12 w-12 text-slate-400" />
            <p className="text-lg font-semibold">No projects found</p>
            <p className="mt-2 text-sm">Create a new project to get started with QA/QC management.</p>
          </div>
        )}

        {/* MODAL */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6">
            <div className="w-full max-w-lg rounded-[32px] bg-white p-6 shadow-2xl shadow-slate-950/10">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">New Project</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Create Project</h2>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-full border border-slate-200 bg-slate-100 p-2 text-slate-700 hover:bg-slate-200"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Project Number</label>
                  <input
                    type="text"
                    placeholder="Enter project number"
                    value={formData.project_number}
                    onChange={(e) => setFormData({ ...formData, project_number: e.target.value })}
                    className="w-full rounded-2xl border border-slate-300 bg-white py-3 px-4 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Project Name</label>
                  <input
                    type="text"
                    placeholder="Enter project name"
                    value={formData.project_name}
                    onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                    className="w-full rounded-2xl border border-slate-300 bg-white py-3 px-4 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Client Name</label>
                  <input
                    type="text"
                    placeholder="Enter client name"
                    value={formData.client_name}
                    onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                    className="w-full rounded-2xl border border-slate-300 bg-white py-3 px-4 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Client Representative</label>
                  <input
                    type="text"
                    placeholder="Enter client representative"
                    value={formData.client_representative}
                    onChange={(e) => setFormData({ ...formData, client_representative: e.target.value })}
                    className="w-full rounded-2xl border border-slate-300 bg-white py-3 px-4 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Project Location</label>
                  <input
                    type="text"
                    placeholder="Enter project location"
                    value={formData.project_location}
                    onChange={(e) => setFormData({ ...formData, project_location: e.target.value })}
                    className="w-full rounded-2xl border border-slate-300 bg-white py-3 px-4 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full rounded-2xl border border-slate-300 bg-white py-3 px-4 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  >
                    <option value="Active">Active</option>
                    <option value="Pending">Pending</option>
                    <option value="Delayed">Delayed</option>
                  </select>
                </div>

                <button
                  onClick={createProject}
                  className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Save Project
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;