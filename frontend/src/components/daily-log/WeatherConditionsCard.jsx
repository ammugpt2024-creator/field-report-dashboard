import { useEffect, useState } from "react";
import { CloudSun, Edit3, Save } from "lucide-react";
import { getStructuredWeatherConditions } from "../../services/weatherService";

function inputClass() {
  return "min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100";
}

function SummaryStat({ label, value }) {
  return (
    <div className="min-w-[120px] rounded-2xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-slate-950">{value || "-"}</p>
    </div>
  );
}

export default function WeatherConditionsCard({ log, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});

  const hasWeather = Boolean(log.temperature || log.weatherCondition || log.weatherOverride);
  const minTemperature = log.minTemperature || log.temperature || "";
  const maxTemperature = log.maxTemperature || log.temperature || "";
  const weatherCondition = log.weatherCondition || log.weatherOverride || "";

  async function refreshWeather(forceRefresh = false) {
    setLoading(true);
    setError("");
    try {
      const weather = await getStructuredWeatherConditions({
        projectLocation: log.projectLocation || log.projectName,
        date: log.date,
        forceRefresh
      });
      onUpdate({
        temperature: weather.temperature,
        minTemperature: weather.minTemperature || weather.temperature,
        maxTemperature: weather.maxTemperature || weather.temperature,
        humidity: weather.humidity,
        windSpeed: weather.windSpeed,
        rainProbability: weather.rainProbability,
        weatherCondition: weather.condition,
        weatherCapturedAt: weather.capturedAt,
        weatherSource: weather.source,
        weatherError: ""
      });
    } catch (err) {
      console.error("Daily Log weather capture failed", err);
      setError("Unable to retrieve weather.");
      onUpdate({ weatherError: "Unable to retrieve weather." });
    } finally {
      setLoading(false);
    }
  }

  function openOverride() {
    setDraft({
      weatherCondition: log.weatherCondition || log.weatherOverride || "",
      minTemperature: log.minTemperature || log.temperature || "",
      maxTemperature: log.maxTemperature || log.temperature || "",
      weatherOverrideReason: log.weatherOverrideReason || ""
    });
    setEditing(true);
  }

  function saveOverride() {
    onUpdate({
      ...draft,
      weatherCapturedAt: log.weatherCapturedAt || new Date().toISOString(),
      weatherError: ""
    });
    setEditing(false);
  }

  useEffect(() => {
    if (!hasWeather && !loading) refreshWeather(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.id]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <CloudSun className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Weather Summary</p>
            <p className="mt-0.5 truncate text-base font-bold text-slate-950">
              Weather: {weatherCondition || "-"}
              <span className="font-semibold text-slate-500"> • Min {minTemperature ? `${minTemperature}°F` : "--"} | Max {maxTemperature ? `${maxTemperature}°F` : "--"}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SummaryStat label="Condition" value={weatherCondition} />
          <SummaryStat label="Min Temp" value={minTemperature ? `${minTemperature}°F` : ""} />
          <SummaryStat label="Max Temp" value={maxTemperature ? `${maxTemperature}°F` : ""} />
          <button type="button" onClick={openOverride} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800">
            <Edit3 className="h-4 w-4" />
            Override
          </button>
        </div>
      </div>

      {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</div>}

      {log.weatherOverrideReason && (
        <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Override reason: {log.weatherOverrideReason}
        </p>
      )}

      {editing && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-950">Override Weather Conditions</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input value={draft.weatherCondition} onChange={(event) => setDraft({ ...draft, weatherCondition: event.target.value })} className={inputClass()} placeholder="Weather condition" />
            <input value={draft.minTemperature} onChange={(event) => setDraft({ ...draft, minTemperature: event.target.value })} className={inputClass()} placeholder="Minimum temperature °F" />
            <input value={draft.maxTemperature} onChange={(event) => setDraft({ ...draft, maxTemperature: event.target.value })} className={inputClass()} placeholder="Maximum temperature °F" />
            <input value={draft.weatherOverrideReason} onChange={(event) => setDraft({ ...draft, weatherOverrideReason: event.target.value })} className={inputClass()} placeholder="Override reason" />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="min-h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">Cancel</button>
            <button type="button" onClick={saveOverride} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white">
              <Save className="h-4 w-4" />
              Save Override
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
