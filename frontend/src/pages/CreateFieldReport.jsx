import { useParams, useNavigate } from "react-router-dom";

import {
  useState,
  useEffect
} from "react";

import { supabase } from "../services/supabase";

import {
  ChevronLeft,
  Save,
  Send,
  Info,
  Users,
  Wrench,
  Shield,
  Paperclip,
  Beaker
} from "lucide-react";

function CreateFieldReport() {

  const { projectId } = useParams();

  const navigate = useNavigate();

  /*
  ==========================================
  FORM DATA
  ==========================================
  */

  const [formData, setFormData] = useState({

    reportNumber: `FR-${new Date().getFullYear()}-${String(
      Math.floor(Math.random() * 1000)
    ).padStart(3, "0")}`,

    date: new Date()
      .toISOString()
      .split("T")[0],

    weather: "",

    temperature: "",

    inspectorName: "",

    workersCount: "",

    subcontractor: "",

    equipmentUsed: "",

    activityDescription: "",

    observations: "",

    safetyRemarks: "",

    slump: "",

    airContent: ""
  });

  const [attachments, setAttachments] =
    useState([]);

  const [activeTab, setActiveTab] =
    useState("general");

  /*
  ==========================================
  AUTO LOAD
  ==========================================
  */

  useEffect(() => {

    fetchWeather();

    loadUser();

  }, []);

  /*
  ==========================================
  LOAD USER
  ==========================================
  */

  async function loadUser() {

    try {

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {

        setFormData((prev) => ({
          ...prev,
          inspectorName:
            user.email || "Inspector"
        }));
      }

    } catch (error) {

      console.log(error);
    }
  }

  /*
  ==========================================
  WEATHER
  ==========================================
  */

  async function fetchWeather() {

    try {

      const response = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=38.9072&longitude=-77.0369&current_weather=true&timezone=auto"
      );

      const data = await response.json();

      const weatherCodeMap = {

        0: "Clear Sky",

        1: "Mainly Clear",

        2: "Partly Cloudy",

        3: "Cloudy",

        45: "Fog",

        61: "Rain",

        80: "Rain Showers",

        95: "Thunderstorm"
      };

      setFormData((prev) => ({

        ...prev,

        weather:
          weatherCodeMap[
            data.current_weather.weathercode
          ] || "Moderate",

        temperature:
          data.current_weather.temperature
      }));

    } catch (error) {

      console.log(error);

      setFormData((prev) => ({
        ...prev,
        weather: "Unavailable",
        temperature: "N/A"
      }));
    }
  }

  /*
  ==========================================
  INPUT CHANGE
  ==========================================
  */

  function handleInputChange(e) {

    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  }

  /*
  ==========================================
  FILE UPLOAD
  ==========================================
  */

  function handleFileUpload(e) {

    const files = Array.from(
      e.target.files
    );

    setAttachments((prev) => [
      ...prev,
      ...files
    ]);
  }

  /*
  ==========================================
  SAVE DRAFT
  ==========================================
  */

  function handleSaveDraft() {

    alert("Draft Saved Successfully");
  }

  /*
  ==========================================
  SUBMIT
  ==========================================
  */

  function handleSubmit() {

    alert("Report Submitted Successfully");

    navigate(
      `/project/${projectId}/field-reports/daily-report`
    );
  }

  /*
  ==========================================
  FORM SECTIONS
  ==========================================
  */

  const sections = [

    {
      id: "general",
      label: "General Info",
      icon: Info
    },

    {
      id: "manpower",
      label: "Manpower",
      icon: Users
    },

    {
      id: "equipment",
      label: "Equipment",
      icon: Wrench
    },

    {
      id: "concrete",
      label: "Concrete Testing",
      icon: Beaker
    },

    {
      id: "safety",
      label: "Safety",
      icon: Shield
    },

    {
      id: "attachments",
      label: "Attachments",
      icon: Paperclip
    }
  ];

  return (

    <div className="min-h-screen bg-slate-100">

      {/* HEADER */}

      <div className="bg-white border-b border-slate-200">

        <div className="max-w-7xl mx-auto px-8 py-6">

          <div className="flex items-center justify-between">

            <div className="flex items-center gap-5">

              <button
                onClick={() =>
                  navigate(-1)
                }
                className="
                  p-3
                  rounded-xl
                  hover:bg-slate-100
                "
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <div>

                <h1 className="
                  text-4xl
                  font-bold
                  text-slate-900
                ">
                  Create Field Report
                </h1>

                <p className="
                  text-slate-500
                  mt-1
                ">
                  Report #
                  {formData.reportNumber}
                </p>

              </div>

            </div>

            <div className="flex gap-4">

              <button
                onClick={handleSaveDraft}
                className="
                  px-6
                  py-3
                  rounded-2xl
                  border
                  border-slate-300
                  bg-white
                  font-semibold
                  flex
                  items-center
                  gap-2
                "
              >
                <Save className="w-5 h-5" />
                Save Draft
              </button>

              <button
                onClick={handleSubmit}
                className="
                  px-6
                  py-3
                  rounded-2xl
                  bg-blue-600
                  text-white
                  font-semibold
                  flex
                  items-center
                  gap-2
                "
              >
                <Send className="w-5 h-5" />
                Submit
              </button>

            </div>

          </div>

        </div>

      </div>

      {/* CONTENT */}

      <div className="
        max-w-7xl
        mx-auto
        px-8
        py-10
      ">

        <div className="
          grid
          grid-cols-1
          lg:grid-cols-4
          gap-8
        ">

          {/* SIDEBAR */}

          <div className="
            bg-white
            rounded-3xl
            border
            border-slate-200
            p-6
            h-fit
          ">

            <h2 className="
              text-xl
              font-bold
              mb-6
            ">
              Form Sections
            </h2>

            <div className="space-y-3">

              {sections.map((section) => {

                const Icon =
                  section.icon;

                return (

                  <button
                    key={section.id}
                    onClick={() =>
                      setActiveTab(
                        section.id
                      )
                    }
                    className={`
                      w-full
                      flex
                      items-center
                      gap-3
                      px-4
                      py-4
                      rounded-2xl
                      transition-all

                      ${
                        activeTab ===
                        section.id
                          ? `
                            bg-blue-100
                            text-blue-700
                            font-semibold
                          `
                          : `
                            hover:bg-slate-100
                            text-slate-700
                          `
                      }
                    `}
                  >

                    <Icon className="w-5 h-5" />

                    {section.label}

                  </button>
                );
              })}

            </div>

          </div>

          {/* FORM */}

          <div className="lg:col-span-3">

            <div className="
              bg-white
              rounded-3xl
              border
              border-slate-200
              p-8
            ">

              <h2 className="
                text-3xl
                font-bold
                mb-8
              ">
                General Information
              </h2>

              <div className="
                grid
                grid-cols-1
                md:grid-cols-2
                gap-6
              ">

                <Input
                  label="Report Number"
                  name="reportNumber"
                  value={formData.reportNumber}
                  onChange={handleInputChange}
                  readOnly
                />

                <Input
                  label="Date"
                  name="date"
                  type="date"
                  value={formData.date}
                  onChange={handleInputChange}
                />

                <Input
                  label="Weather"
                  name="weather"
                  value={formData.weather}
                  onChange={handleInputChange}
                  readOnly
                />

                <Input
                  label="Temperature (°C)"
                  name="temperature"
                  value={formData.temperature}
                  onChange={handleInputChange}
                  readOnly
                />

                <Input
                  label="Inspector Name"
                  name="inspectorName"
                  value={formData.inspectorName}
                  onChange={handleInputChange}
                  readOnly
                />

                <Input
                  label="Workers Count"
                  name="workersCount"
                  value={formData.workersCount}
                  onChange={handleInputChange}
                />

                <Input
                  label="Subcontractor"
                  name="subcontractor"
                  value={formData.subcontractor}
                  onChange={handleInputChange}
                />

                <Input
                  label="Equipment Used"
                  name="equipmentUsed"
                  value={formData.equipmentUsed}
                  onChange={handleInputChange}
                />

                <Input
                  label="Slump"
                  name="slump"
                  value={formData.slump}
                  onChange={handleInputChange}
                />

                <Input
                  label="Air Content"
                  name="airContent"
                  value={formData.airContent}
                  onChange={handleInputChange}
                />

              </div>

              {/* TEXTAREAS */}

              <div className="mt-8 space-y-6">

                <TextArea
                  label="Activity Description"
                  name="activityDescription"
                  value={
                    formData.activityDescription
                  }
                  onChange={handleInputChange}
                />

                <TextArea
                  label="Observations"
                  name="observations"
                  value={
                    formData.observations
                  }
                  onChange={handleInputChange}
                />

                <TextArea
                  label="Safety Remarks"
                  name="safetyRemarks"
                  value={
                    formData.safetyRemarks
                  }
                  onChange={handleInputChange}
                />

              </div>

              {/* FILES */}

              <div className="mt-8">

                <label className="
                  block
                  text-sm
                  font-semibold
                  mb-3
                ">
                  Attachments
                </label>

                <input
                  type="file"
                  multiple
                  onChange={
                    handleFileUpload
                  }
                  className="
                    w-full
                    border
                    border-slate-300
                    rounded-2xl
                    p-4
                    bg-slate-50
                  "
                />

                {attachments.length >
                  0 && (

                  <div className="
                    mt-4
                    space-y-2
                  ">

                    {attachments.map(
                      (
                        file,
                        index
                      ) => (

                        <div
                          key={index}
                          className="
                            bg-slate-100
                            rounded-xl
                            px-4
                            py-3
                          "
                        >
                          {file.name}
                        </div>
                      )
                    )}

                  </div>
                )}

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

/*
==========================================
INPUT
==========================================
*/

function Input({
  label,
  name,
  value,
  onChange,
  type = "text",
  readOnly = false
}) {

  return (

    <div>

      <label className="
        block
        text-sm
        font-semibold
        mb-2
      ">
        {label}
      </label>

      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        className="
          w-full
          border
          border-slate-300
          rounded-2xl
          px-4
          py-4
          bg-white
        "
      />

    </div>
  );
}

/*
==========================================
TEXTAREA
==========================================
*/

function TextArea({
  label,
  name,
  value,
  onChange
}) {

  return (

    <div>

      <label className="
        block
        text-sm
        font-semibold
        mb-2
      ">
        {label}
      </label>

      <textarea
        rows="5"
        name={name}
        value={value}
        onChange={onChange}
        className="
          w-full
          border
          border-slate-300
          rounded-2xl
          px-4
          py-4
          bg-white
        "
      />

    </div>
  );
}

export default CreateFieldReport;