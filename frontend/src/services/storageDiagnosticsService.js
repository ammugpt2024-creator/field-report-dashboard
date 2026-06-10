import { supabase } from "./supabase.js";

export const REQUIRED_PRIVATE_BUCKETS = [
  "daily-log-pdfs",
  "timesheet-pdfs",
  "daily-log-attachments"
];

const MISSING_BUCKET_CODES = new Set(["404", "NoSuchBucket", "not_found"]);

export function isMissingBucketError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  const code = String(error?.statusCode || error?.code || "");
  return (
    MISSING_BUCKET_CODES.has(code) ||
    message.includes("bucket not found") ||
    message.includes("bucket does not exist") ||
    message.includes("not found")
  );
}

export function getStorageConfigError(bucketName, error) {
  if (isMissingBucketError(error)) {
    return new Error(`PDF storage configuration issue. Please contact administrator. Missing bucket: ${bucketName}.`);
  }
  return error instanceof Error ? error : new Error(error?.message || "Storage operation failed.");
}

export function logStorageStep(step, detail = {}) {
  console.info(`[Storage] ${step}`, detail);
}

export async function validateRequiredStorageBuckets() {
  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      console.error("[Storage] Bucket validation failed", error);
      return { ok: false, missing: [], error };
    }

    const existing = new Set((data || []).map((bucket) => bucket.name || bucket.id));
    const missing = REQUIRED_PRIVATE_BUCKETS.filter((bucket) => !existing.has(bucket));
    if (missing.length) {
      console.error("[Storage] Missing required private buckets", { missing, required: REQUIRED_PRIVATE_BUCKETS });
      return { ok: false, missing };
    }

    console.info("[Storage] Required private buckets validated", { buckets: REQUIRED_PRIVATE_BUCKETS });
    return { ok: true, missing: [] };
  } catch (error) {
    console.error("[Storage] Bucket validation failed", error);
    return { ok: false, missing: [], error };
  }
}
