import { useEffect, useState } from "react";
import { Eye, EyeOff, Check, Loader2, ShieldCheck, PartyPopper } from "lucide-react";
import { supabase } from "../services/supabase";
import { BRAND } from "../config/branding";
import Logo from "../components/Logo";
import loginBg from "../assets/login-bg.png";

// Invite acceptance: the link in the invitation email signs the invitee in
// with a one-time token and lands here so they can set their password and be
// attached to their company before entering the app.
function AcceptInvite() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState({ name: "", email: "" });
  // loading → checking the link; form → new invitee may set a password;
  // expired → no valid session (stale/expired link).
  const [phase, setPhase] = useState("loading");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!active) return;

      // No session means the link is expired or already used — don't offer a
      // password form for a dead link.
      if (!user) { setPhase("expired"); return; }

      // If the account is already set up (a profile exists), an old invite link
      // must NOT let anyone re-create the password. Attach any still-pending
      // invite, then drop them into the app instead of the set-password screen.
      const { data: profile } = await supabase
        .from("profiles").select("id").eq("id", user.id).maybeSingle();
      if (!active) return;
      if (profile) {
        try { await supabase.rpc("claim_company_invite"); } catch { /* already linked */ }
        window.location.replace("/");
        return;
      }

      // Genuinely new invitee with a valid link — let them set a password.
      setIdentity({ name: user.user_metadata?.full_name || "", email: user.email || "" });
      setPhase("form");
    })();
    return () => { active = false; };
  }, []);

  const longEnough = password.length >= 8;
  const matches = confirm.length > 0 && password === confirm;
  const firstName = identity.name ? identity.name.split(" ")[0] : "";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!longEnough) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;

      // Attach this account to its pending company invitation.
      const { data: claim, error: claimError } = await supabase.rpc("claim_company_invite");
      if (claimError) throw claimError;
      if (claim?.claimed === false) {
        console.info("No pending invitation to claim — account may already be linked.");
      }

      // Full reload so the auth context rebuilds with the new membership.
      window.location.replace("/");
    } catch (err) {
      setError(err.message || "Your account could not be set up. Please try again.");
      setBusy(false);
    }
  }

  const Requirement = ({ met, label }) => (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${met ? "text-emerald-600" : "text-slate-400"}`}>
      <span className={`grid h-4 w-4 place-items-center rounded-full ${met ? "bg-emerald-100" : "bg-slate-100"}`}>
        <Check className="h-3 w-3" />
      </span>
      {label}
    </span>
  );

  return (
    <div
      className="flex min-h-screen w-full max-w-full items-center justify-center overflow-x-hidden bg-slate-50 bg-cover bg-center bg-no-repeat px-4 py-10"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      <div className="w-full max-w-[440px] overflow-hidden rounded-3xl border border-white/60 bg-white/95 shadow-2xl shadow-navy-900/10 backdrop-blur-md">
        {/* Brand logo — identical to the login screen */}
        <div className="px-8 pt-8 text-center">
          <Logo variant="full" className="mb-3" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1c2f4a]">{BRAND.tagline}</p>
        </div>

        <div className="px-8 pb-8 pt-6">
          {phase === "loading" && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Checking your invitation…
            </div>
          )}

          {phase === "expired" && (
            <div className="py-4 text-center">
              <h2 className="text-xl font-bold text-slate-900">This invitation can't be opened</h2>
              <p className="mt-2 text-sm font-medium text-slate-500">
                The link has expired or was already used. Invitation links work once — ask your company admin to resend your invite.
              </p>
              <button
                type="button"
                onClick={() => window.location.replace("/")}
                className="mt-5 min-h-12 w-full rounded-xl bg-blue-700 text-sm font-bold text-white hover:bg-blue-800"
              >
                Go to sign in
              </button>
            </div>
          )}

          {phase === "form" && (
          <>
          <div className="flex items-center gap-2 text-blue-700">
            <PartyPopper className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wide">You're invited</span>
          </div>
          <h2 className="mt-2 text-xl font-bold text-slate-900">
            {firstName ? `Welcome, ${firstName}!` : "Welcome aboard!"}
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Create a password to activate your account and get started.
          </p>

          {identity.email && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate text-sm font-semibold text-slate-700">{identity.email}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                placeholder="Choose a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="min-h-12 w-full rounded-xl border border-slate-300 pl-3 pr-11 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:text-slate-600" aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <input
              type={show ? "text" : "password"}
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="min-h-12 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5">
              <Requirement met={longEnough} label="At least 8 characters" />
              <Requirement met={matches} label="Passwords match" />
            </div>

            {error && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy || !longEnough || !matches}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" />Setting up your account…</> : "Create account & continue"}
            </button>
          </form>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AcceptInvite;
