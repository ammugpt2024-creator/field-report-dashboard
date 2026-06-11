import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROMPT_VERSION = "daily-summary-v1";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function cleanText(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanText);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cleanText(item)]));
  }
  if (typeof value !== "string") return value;
  if (/https?:\/\//i.test(value)) return "";
  if (/password|token|api[_-]?key|signed|storage/i.test(value)) return "";
  return value.slice(0, 4000);
}

function getSystemPrompt(summaryType: string, action: string) {
  if (action === "SITE_CONDITIONS") {
    return `
You are a Senior Field Engineer preparing the Site Conditions section for an enterprise construction Daily Field Log.
Use only weather, activities, delays, notes, and safety observations from the current Daily Log context.
Write professional site condition language suitable for Project Managers, QC Managers, Construction Managers, clients, and executive reporting.
Return clean HTML only using p, strong, ul, and li tags.
Do not mention AI.
Do not write "Today we worked".
Do not write "Based on the information provided".
Do not invent facts. If no issues are reported, state that no significant site restrictions, environmental impacts, or safety concerns were reported.
`.trim();
  }

  const lengthInstruction = summaryType === "DETAILED"
    ? "Create a full detailed narrative. Include all available relevant activity and quality details."
    : "Keep the executive section concise for managers, QC managers, clients, and executives. The executive section should be 2 to 4 paragraphs.";

  return `
You are a Senior Field Engineer preparing an enterprise construction field operations report for IMQCore.
This is not a chatbot conversation.
Use professional construction and QA/QC terminology.
Write for Project Managers, QC Managers, Construction Managers, clients, and executive reporting.
${lengthInstruction}
Always use this exact structure:
<h2>EXECUTIVE SUMMARY</h2>
<p>...</p>
<h2>WORK PERFORMED</h2>
<ul><li>Activity 1</li><li>Activity 2</li><li>Activity 3</li></ul>
<h2>QUALITY ACTIVITIES</h2>
<p>...</p>
<h2>SITE CONDITIONS</h2>
<p>...</p>
<h2>ISSUES / DELAYS</h2>
<p>...</p>
<h2>COMPLETION STATUS</h2>
<p>...</p>
Return clean HTML only using p, h2, strong, ul, ol, and li tags.
Do not use casual language.
Do not use filler.
Do not mention AI.
Do not write "Today we worked".
Do not write "Based on the information provided".
Do not use AI-generated phrasing.
Do not invent facts. If no issue is provided, state that no significant issues or delays were reported.
Action requested: ${action}.
`.trim();
}

function buildUserPrompt(context: Record<string, unknown>, currentContent = "") {
  return `
Generate a professional Daily Field Log summary from this current Daily Log context only.

Current editable content, if improving/expanding/condensing:
${currentContent || "N/A"}

Daily Log Context:
${JSON.stringify(cleanText(context), null, 2)}
`.trim();
}

function normalizeSummaryType(value: unknown) {
  const normalized = String(value || "EXECUTIVE").toUpperCase();
  return normalized === "DETAILED" ? "DETAILED" : "EXECUTIVE";
}

function normalizeAction(value: unknown) {
  const normalized = String(value || "GENERATE").toUpperCase();
  if (["GENERATE", "REGENERATE", "IMPROVE", "EXPAND", "CONDENSE", "SITE_CONDITIONS"].includes(normalized)) return normalized;
  return "GENERATE";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "POST is required." }, 405);

  try {
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!openAiKey) throw new Error("OPENAI_API_KEY is not configured.");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase function credentials are not configured.");

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ ok: false, error: "Authentication is required." }, 401);

    const body = await req.json().catch(() => ({}));
    const dailyLogId = String(body.dailyLogId || body.context?.dailyLog?.id || "");
    const companyId = body.companyId ? Number(body.companyId) : null;
    const projectId = body.projectId ? Number(body.projectId) : null;
    const summaryType = normalizeSummaryType(body.summaryType);
    const action = normalizeAction(body.action);
    const context = cleanText(body.context || {});
    const currentContent = String(body.currentContent || "").slice(0, 12000);

    if (!dailyLogId) throw new Error("dailyLogId is required.");
    if (!context || typeof context !== "object") throw new Error("Daily Log context is required.");

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.25,
        messages: [
          { role: "system", content: getSystemPrompt(summaryType, action) },
          { role: "user", content: buildUserPrompt(context as Record<string, unknown>, currentContent) }
        ]
      })
    });

    const openAiPayload = await openAiResponse.json().catch(() => ({}));
    if (!openAiResponse.ok) {
      throw new Error(openAiPayload?.error?.message || "OpenAI summary generation failed.");
    }

    const generatedContent = String(openAiPayload?.choices?.[0]?.message?.content || "").trim();
    if (!generatedContent) throw new Error("OpenAI returned an empty summary.");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: summaryRow, error: insertError } = await admin
      .from("ai_summarys")
      .insert({
        daily_log_id: dailyLogId,
        company_id: companyId,
        project_id: projectId,
        generated_by: userData.user.id,
        summary_type: summaryType,
        generated_content: generatedContent,
        edited_content: generatedContent,
        prompt_version: PROMPT_VERSION,
        ai_provider: "openai",
        model_name: OPENAI_MODEL,
        generation_status: "completed"
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    await admin.from("ai_audit_events").insert({
      event_type: "AI_SUMMARY_GENERATED",
      daily_log_id: dailyLogId,
      company_id: companyId,
      project_id: projectId,
      user_id: userData.user.id,
      metadata: {
        summary_type: summaryType,
        action,
        prompt_version: PROMPT_VERSION,
        model_name: OPENAI_MODEL
      }
    });

    return jsonResponse({
      ok: true,
      id: summaryRow.id,
      generatedContent,
      editedContent: generatedContent,
      promptVersion: PROMPT_VERSION,
      aiProvider: "openai",
      modelName: OPENAI_MODEL,
      generationStatus: "completed"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate summary.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
