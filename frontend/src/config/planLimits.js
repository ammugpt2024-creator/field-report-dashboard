// Subscription plan definitions. `null` means unlimited. These are the
// single source of truth for plan caps shown across the platform admin UI.
//
// Phase 2 is INFORMATIONAL: limits drive usage bars and warnings only — they
// are not enforced at the data layer. When enforcement is added, this table is
// the natural thing to move into a `plan_limits` DB table so platform admins
// can tune caps per company without a deploy.
export const PLAN_LIMITS = {
  trial: {
    label: "Trial",
    users: 2,
    projects: 1,
    reports: 100,
    storageGb: 1,
    trialDays: 30,
    features: []
  },
  starter: {
    label: "Starter",
    users: 5,
    projects: 5,
    reports: 500,
    storageGb: 2,
    features: []
  },
  professional: {
    label: "Professional",
    users: 25,
    projects: 25,
    reports: null,
    storageGb: 10,
    features: ["Custom Branding"]
  },
  enterprise: {
    label: "Enterprise",
    users: null,
    projects: null,
    reports: null,
    storageGb: null,
    features: ["SSO", "Priority Support", "Custom Branding", "Unlimited Storage"]
  }
};

export const PLAN_ORDER = ["trial", "starter", "professional", "enterprise"];

export function planLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
}

// Fraction 0..1 of a limit consumed; 0 when the limit is unlimited (null).
export function utilization(used, limit) {
  if (limit == null) return 0;
  if (!limit) return 0;
  return Math.min(1, (used || 0) / limit);
}

// Tone for a usage bar by how close it is to the cap.
export function usageTone(used, limit) {
  if (limit == null) return "unlimited";
  const frac = utilization(used, limit);
  if ((used || 0) > limit) return "over";
  if (frac >= 0.9) return "warn";
  return "ok";
}

export function formatLimit(limit) {
  return limit == null ? "∞" : limit;
}
