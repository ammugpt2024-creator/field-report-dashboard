import { BRAND } from "../config/branding";

/**
 * QCore brand logo.
 *
 * variant:
 *   - "mark"    -> just the stylized Q magnifying-glass mark (square)
 *   - "lockup"  -> mark + "QCore" wordmark (use in nav/header)
 *   - "full"    -> mark + wordmark + platform tagline (use on login / splash)
 *
 * Colors come from the brand palette:
 *   navy  #1c2f4a   orange #bd5d3a
 */

const NAVY = "#1c2f4a";
const ORANGE = "#bd5d3a";

function Mark({ className = "", title = "QCore mark" }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <circle
        cx="48"
        cy="48"
        r="30"
        fill="none"
        stroke={NAVY}
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray="150 38"
        strokeDashoffset="-124"
      />
      <circle cx="48" cy="48" r="11" fill={ORANGE} />
      <line
        x1="65"
        y1="65"
        x2="84"
        y2="84"
        stroke={ORANGE}
        strokeWidth="11"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Wordmark({ className = "" }) {
  return (
    <span className={`font-bold leading-none tracking-tight ${className}`}>
      <span style={{ color: ORANGE }}>Core</span>
    </span>
  );
}

function Logo({ variant = "lockup", className = "" }) {
  if (variant === "mark") {
    return <Mark className={className || "h-9 w-9"} />;
  }

  if (variant === "full") {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <div className="flex items-center gap-0.5">
          <Mark className="h-14 w-14 shrink-0" />
          <Wordmark className="text-5xl" />
        </div>
        <p className="mt-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {BRAND.platformDescription}
        </p>
      </div>
    );
  }

  // lockup (default)
  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      <Mark className="h-9 w-9 shrink-0" />
      <Wordmark className="text-xl sm:text-2xl" />
    </div>
  );
}

export default Logo;
export { Mark as LogoMark, Wordmark as LogoWordmark };
