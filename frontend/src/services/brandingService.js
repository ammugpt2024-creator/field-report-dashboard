import { supabase } from './supabase';

// Company branding for PDFs and headers. Cached at module level so the
// synchronous PDF generators can read it; preloaded after login from
// AuthContext. Falls back to the historic defaults when no company exists.
// No hard-coded logo: a company shows its OWN uploaded logo or nothing (the UI
// falls back to the company name). Never brand one tenant with another's logo.
const FALLBACK = {
  name: 'Your Company',
  logoUrl: '',
  brandColor: '#1d4ed8'
};

let cachedBranding = { ...FALLBACK };

export function getCompanyBranding() {
  return cachedBranding;
}

export async function preloadCompanyBranding() {
  try {
    // SaaS members resolve their company via the roster; legacy users
    // (e.g. technicians) resolve it via their profile's company_id.
    const { data: membership } = await supabase
      .from('company_users')
      .select('company_id')
      .eq('status', 'active')
      .maybeSingle();
    let companyId = membership?.company_id || null;
    if (!companyId) {
      const { data: auth } = await supabase.auth.getUser();
      if (auth?.user?.id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('id', auth.user.id)
          .maybeSingle();
        companyId = prof?.company_id || null;
      }
    }
    if (!companyId) return cachedBranding;

    const { data: company } = await supabase
      .from('companies')
      .select('company_name, legal_name, logo_url, logo_storage_path, brand_color')
      .eq('id', companyId)
      .maybeSingle();
    if (!company) return cachedBranding;

    let logoUrl = company.logo_url || '';
    if (!logoUrl && company.logo_storage_path) {
      const { data: signed } = await supabase.storage
        .from('company-files')
        .createSignedUrl(company.logo_storage_path, 60 * 60 * 24 * 7);
      logoUrl = signed?.signedUrl || '';
    }

    cachedBranding = {
      name: company.company_name || company.legal_name || FALLBACK.name,
      logoUrl: logoUrl, // the company's own uploaded logo, or '' → UI shows the name
      brandColor: company.brand_color || FALLBACK.brandColor
    };
  } catch (error) {
    console.warn('Company branding could not be preloaded.', error?.message);
  }
  return cachedBranding;
}

// Storage layout: company-{company_id}/logos | daily-reports | field-tests |
// lab-reports | timesheets | invoices | calibration-certificates
export function companyStoragePath(companyId, area, fileName) {
  return `company-${companyId}/${area}/${fileName}`;
}
