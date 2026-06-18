// Full clean sweep of a company: every storage file under its tenant prefix,
// then every database record via hard_delete_company(). Platform admins only,
// and never against an active company — suspend or cancel it first.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Storage listing is per-folder; walk the tenant prefix depth-first.
async function listAllFiles(admin: ReturnType<typeof createClient>, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const queue = [prefix];
  while (queue.length) {
    const folder = queue.pop()!;
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset });
      if (error || !data?.length) break;
      for (const entry of data) {
        const path = `${folder}/${entry.name}`;
        if (entry.id) files.push(path);   // files have ids, folders don't
        else queue.push(path);
      }
      if (data.length < 1000) break;
      offset += data.length;
    }
  }
  return files;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { companyId, confirmName } = await req.json();
    if (!companyId) return json({ error: "companyId is required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization") || "";
    const { data: caller } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!caller?.user?.id) return json({ error: "unauthorized" }, 401);

    const { data: platformAdmin } = await admin
      .from("platform_admins").select("user_id")
      .eq("user_id", caller.user.id).eq("status", "active").maybeSingle();
    if (!platformAdmin) return json({ error: "forbidden" }, 403);

    const { data: company } = await admin
      .from("companies").select("id, company_name, status").eq("id", companyId).maybeSingle();
    if (!company) return json({ error: "company not found" }, 404);
    if (company.status === "active") {
      return json({ error: "Company is active. Suspend or cancel it before deleting." }, 409);
    }
    if (confirmName !== undefined && confirmName !== company.company_name) {
      return json({ error: "confirmation name does not match" }, 400);
    }

    // 1. Storage sweep of the tenant prefix.
    const paths = await listAllFiles(admin, "company-files", `company-${companyId}`);
    let filesRemoved = 0;
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { error } = await admin.storage.from("company-files").remove(batch);
      if (error) return json({ error: `storage cleanup failed: ${error.message}` }, 500);
      filesRemoved += batch.length;
    }

    // 2. Database sweep, run as the calling admin so the SQL guard and the
    //    platform-level audit record both see the real actor.
    const asCaller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: counts, error: sweepError } = await asCaller.rpc("hard_delete_company", {
      target_company: companyId
    });
    if (sweepError) return json({ error: sweepError.message }, 500);

    return json({ deleted: true, counts: { ...counts, storage_files: filesRemoved } });
  } catch (error) {
    return json({ error: String((error as Error)?.message || error) }, 500);
  }
});
