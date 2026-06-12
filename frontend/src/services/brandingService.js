import { supabase } from './supabase';

// Company branding for PDFs and headers. Cached at module level so the
// synchronous PDF generators can read it; preloaded after login from
// AuthContext. Falls back to the historic defaults when no company exists.
const FALLBACK = {
  name: 'Dulles Engineering, Inc.',
  logoUrl: 'https://img1.wsimg.com/isteam/ip/5d283b38-0950-4c46-838b-44766d9a75d2/DULLES%20ENGINEERING_new%20logo.png/%3A/rs%3Dh%3A78%2Ccg%3Atrue%2Cm/qt%3Dq%3A95',
  brandColor: '#1d4ed8'
};

let cachedBranding = { ...FALLBACK };

export function getCompanyBranding() {
  return cachedBranding;
}

export async function preloadCompanyBranding() {
  try {
    const { data: membership } = await supabase
      .from('company_users')
      .select('company_id')
      .eq('status', 'active')
      .maybeSingle();
    if (!membership?.company_id) return cachedBranding;

    const { data: company } = await supabase
      .from('companies')
      .select('company_name, legal_name, logo_url, logo_storage_path, brand_color')
      .eq('id', membership.company_id)
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
      logoUrl: logoUrl || FALLBACK.logoUrl,
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
