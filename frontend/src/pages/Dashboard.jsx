import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import { supabase } from "../services/supabase";

function Dashboard() {

  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {

    const { data, error } = await supabase
      .from("projects")
      .select("*");

    if (error) {
      console.log(error);
    } else {
      setProjects(data);
    }
  }

  return (
    <MainLayout>

      <h1 className="text-4xl font-bold mb-8 text-gray-800">
        Field Report Dashboard
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() => navigate(`/reports/${project.id}`)}
            className="bg-white rounded-xl shadow-md p-8 cursor-pointer hover:shadow-2xl transition"
          >
            <h2 className="text-2xl font-semibold text-gray-800">
              {project.name}
            </h2>

            <p className="text-gray-500 mt-3">
              {project.description}
            </p>
          </div>
        ))}

      </div>

    </MainLayout>
  );
}

export default Dashboard;