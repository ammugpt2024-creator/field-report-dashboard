import { supabase } from "./supabase";

export const AI_SUMMARY_TYPES = {
  EXECUTIVE: "EXECUTIVE",
  DETAILED: "DETAILED"
};

export const AI_SUMMARY_ACTIONS = {
  GENERATE: "GENERATE",
  REGENERATE: "REGENERATE",
  IMPROVE: "IMPROVE",
  EXPAND: "EXPAND",
  CONDENSE: "CONDENSE",
  SITE_CONDITIONS: "SITE_CONDITIONS"
};

const LOCAL_SUMMARY_KEY = "imqcore:ai-summary-cache";

function readSummaryCache() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_SUMMARY_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSummaryCache(cache) {
  window.localStorage.setItem(LOCAL_SUMMARY_KEY, JSON.stringify(cache));
}

function stripUnsafeValue(value) {
  if (typeof value !== "string") return value;
  if (/https?:\/\//i.test(value)) return "";
  if (/token|apikey|api_key|password|signed/i.test(value)) return "";
  return value;
}

function compactReport(report = {}) {
  return {
    type: "Concrete Report",
    placementLocation: stripUnsafeValue(report.placementLocation),
    mixNumber: stripUnsafeValue(report.mixNumber),
    ticketNumber: stripUnsafeValue(report.ticketNumber),
    truckNumber: stripUnsafeValue(report.truckNumber),
    cubicYards: stripUnsafeValue(report.cubicYards),
    slump: stripUnsafeValue(report.slump),
    airContent: stripUnsafeValue(report.airContent),
    concreteTemperature: stripUnsafeValue(report.concreteTemperature),
    notes: stripUnsafeValue(report.notes)
  };
}

export function buildDailySummaryContext(log) {
  return {
    dailyLog: {
      id: log.id,
      projectId: log.projectId,
      projectName: stripUnsafeValue(log.projectName),
      date: stripUnsafeValue(log.date),
      shift: stripUnsafeValue(log.shift),
      weather: stripUnsafeValue(log.weather),
      weatherConditions: {
        temperature: stripUnsafeValue(log.temperature),
        humidity: stripUnsafeValue(log.humidity),
        windSpeed: stripUnsafeValue(log.windSpeed),
        rainProbability: stripUnsafeValue(log.rainProbability),
        condition: stripUnsafeValue(log.weatherCondition),
        capturedAt: stripUnsafeValue(log.weatherCapturedAt),
        override: stripUnsafeValue(log.weatherOverride),
        overrideReason: stripUnsafeValue(log.weatherOverrideReason)
      },
      siteConditions: stripUnsafeValue(log.siteConditions),
      notes: stripUnsafeValue(log.notes)
    },
    activities: (log.activities || []).map((activity) => ({
      title: stripUnsafeValue(activity.title),
      type: stripUnsafeValue(activity.type),
      description: stripUnsafeValue(activity.description),
      location: stripUnsafeValue(activity.location),
      startTime: stripUnsafeValue(activity.startTime),
      endTime: stripUnsafeValue(activity.endTime),
      crewSize: stripUnsafeValue(activity.crewSize),
      equipmentUsed: stripUnsafeValue(activity.equipmentUsed),
      materialUsed: stripUnsafeValue(activity.materialUsed),
      status: stripUnsafeValue(activity.status),
      photoCount: (activity.photos || []).length,
      attachmentCount: (activity.attachments || []).length,
      concreteReports: (activity.concreteReports || activity.reports || []).map(compactReport)
    }))
  };
}

export function getCachedAiSummary(dailyLogId, summaryType) {
  const cache = readSummaryCache();
  return cache?.[dailyLogId]?.[summaryType] || null;
}

export function cacheAiSummary(dailyLogId, summaryType, summary) {
  const cache = readSummaryCache();
  cache[dailyLogId] = {
    ...(cache[dailyLogId] || {}),
    [summaryType]: {
      ...summary,
      updatedAt: new Date().toISOString()
    }
  };
  writeSummaryCache(cache);
  return cache[dailyLogId][summaryType];
}

export async function generateDailySummary({
  log,
  summaryType,
  action = AI_SUMMARY_ACTIONS.GENERATE,
  currentContent = ""
}) {
  const context = buildDailySummaryContext(log);
  const { data, error } = await supabase.functions.invoke("generate-daily-summary", {
    body: {
      dailyLogId: log.id,
      companyId: log.companyId || log.organizationId || null,
      projectId: log.projectId || null,
      summaryType,
      action,
      currentContent,
      context
    }
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Unable to generate summary.");

  return cacheAiSummary(log.id, summaryType, {
    id: data.id,
    summaryType,
    generatedContent: data.generatedContent,
    editedContent: data.editedContent || data.generatedContent,
    promptVersion: data.promptVersion,
    aiProvider: data.aiProvider,
    modelName: data.modelName,
    generationStatus: data.generationStatus || "completed"
  });
}

export async function generateSiteConditionsSummary({ log, currentContent = "" }) {
  return generateDailySummary({
    log,
    summaryType: AI_SUMMARY_TYPES.DETAILED,
    action: AI_SUMMARY_ACTIONS.SITE_CONDITIONS,
    currentContent
  });
}
