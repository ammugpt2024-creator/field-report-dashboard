import { useAuth } from "../context/AuthContext";
import dullesFallback from "../assets/logo/dulles-engineering.svg";

/**
 * Client (company) logo shown in the app header next to the profile menu.
 *
 * The client admin uploads their own logo; we read it from the profile's
 * `company_logo_url`. Until one is uploaded we fall back to the Dulles
 * Engineering logo bundled with the app.
 */
function ClientLogo({ className = "" }) {
  const { profile, companyName } = useAuth();

  const src = profile?.company_logo_url || dullesFallback;
  const alt = companyName || "Client logo";

  return (
    <img
      src={src}
      alt={alt}
      className={`h-7 w-auto max-w-[88px] object-contain sm:h-10 sm:max-w-[180px] ${className}`}
    />
  );
}

export default ClientLogo;
