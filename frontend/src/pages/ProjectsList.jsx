import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderKanban,
  MapPin,
  Calendar,
  User,
  Hash,
  ChevronRight,
  Activity,
  Search,
} from "lucide-react";
import { supabase } from "../services/supabase";

function statusColor(status) {
  const s = String(status || "").toLowerCase();
  if (s === "active") return "bg-emerald-100 text-emerald-700";
  if (s === "completed") return "bg-blue-100 text-blue-700";
  if (s === "on hold") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default function ProjectsList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        setProjects(
          data.map((p) => ({
            id: p.id,
            name: p.project_name || "Untitled Project",
            number: p.project_number || "—",
            client: p.client_name || "—",
            status: p.status || "Active",
            location: p.project_location || "—",
            startDate: p.start_date || "",
            manager: p.client_representative || "—",
            description: p.description || "",
          }))
        );
      }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = projects.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.number.toLowerCase().includes(q) ||
      p.client.toLowerCase().includes(q) ||
      p.location.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <FolderKanban className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-slate-950">Projects</h1>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {loading ? "Loading…" : `${projects.length} project${projects.length !== 1 ? "s" : ""} total`}
                </p>
              </div>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, number, client…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <p className="text-sm font-semibold text-slate-500">Loading projects…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <FolderKanban className="h-7 w-7" />
            </span>
            <p className="mt-4 text-sm font-bold text-slate-700">
              {search ? "No projects match your search." : "No projects found."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => navigate(`/project/${project.id}`)}
                className="group rounded-3xl border border-slate-200 bg-white p-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl text-left overflow-hidden"
              >
                {/* Card header */}
                <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-6 pt-5 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                        {project.number}
                      </p>
                      <h2 className="mt-1 truncate text-lg font-bold text-slate-950">
                        {project.name}
                      </h2>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${statusColor(project.status)}`}>
                      <Activity className="h-3 w-3" />
                      {project.status}
                    </span>
                  </div>
                  {project.description && (
                    <p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-500">
                      {project.description}
                    </p>
                  )}
                </div>

                {/* Card body */}
                <div className="px-6 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-start gap-2">
                      <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Client</p>
                        <p className="truncate text-xs font-bold text-slate-800">{project.client}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Location</p>
                        <p className="truncate text-xs font-bold text-slate-800">{project.location}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Start Date</p>
                        <p className="truncate text-xs font-bold text-slate-800">{project.startDate || "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Hash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Manager</p>
                        <p className="truncate text-xs font-bold text-slate-800">{project.manager}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
                  <span className="text-xs font-semibold text-slate-400">Open workspace</span>
                  <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
