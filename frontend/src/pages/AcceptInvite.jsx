import { useEffect, useState } from "react";
import { Eye, EyeOff, Check, Loader2, PartyPopper, AlertTriangle } from "lucide-react";
import { supabase } from "../services/supabase";
import { BRAND } from "../config/branding";
import Logo from "../components/Logo";
import loginBg from "../assets/login-bg.png";
import { MIN_PASSWORD_LENGTH, checkPassword, passwordStrength } from "../utils/passwordPolicy";

// Who this link belongs to, and why that matters: opening it signs the reader
// in as that address, so a forwarded invitation would hand over the account.
function IdentityNotice({ email }) {
  return (
    <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="min-w-0 text-sm text-amber-900">
        <p className="font-bold">
          This invitation is for <span className="break-all">{email || "the invited person"}</span>
        </p>
        <p className="mt-0.5 font-medium">
          If that isn't you, don't continue — choose "This isn't me". Team members each get their own invitation from their company admin.
        </p>
      </div>
    </div>
  );
}

// Invite acceptance: the link in the invitation email signs the invitee in
// with a one-time token and lands here so they can set their password and be
// attached to their company before entering the app.
// Declared here, not inside the screen: a component created during render is
// rebuilt on every keystroke and loses its state.
function Requirement({ met, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${met ? "text-emerald-600" : "text-slate-400"}`}>
      <span className={`grid h-4 w-4 place-items-center rounded-full ${met ? "bg-emerald-100" : "bg-slate-100"}`}>
        <Check className="h-3 w-3" />
      </span>
      {label}
    </span>
  );
}

function AcceptInvite({ flow = "" }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState({ name: "", email: "" });
  // The link signs whoever opens it in as the invited address, so a forwarded
  // email hands over that account. Nobody proceeds until they confirm the
  // address shown is theirs.
  const [confirmedIdentity, setConfirmedIdentity] = useState(false);
  // loading → checking the link; form → new invitee may set a password;
  // confirm → an existing account opened its sign-in link; notMe → the person
  // said the address is not theirs and was signed out; expired → no valid
  // session (stale/expired link).
  const [phase, setPhase] = useState("loading");

  useEffect(() => {
    let active = true;
    (async () => {
      // An `invite` link is only ever issued for an account that was just
      // created, so it has no password yet. That fact — not the presence of a
      // profiles row — decides whether the password form is required: the row
      // is created during this very sign-in by claim_company_invite, so a
      // profile check here would always find one and skip the form.
      const fromInviteLink = flow === "invite";
      sessionStorage.removeItem("qcore-auth-flow");

      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!active) return;

      // No session means the link is expired or already used — don't offer a
      // password form for a dead link.
      if (!user) { setPhase("expired"); return; }

      // Whether this account has ever set a password is the only thing that
      // actually matters here, so record it explicitly rather than inferring it.
      // The profiles row is not a safe proxy: it can be created by a database
      // trigger the moment the account exists, and claim_company_invite creates
      // one too -- either way it is present before the person has chosen a
      // password, which is exactly how invitees were being waved straight
      // through into the app.
      // An invite link is only ever issued for a freshly created account, so it
      // never has a password - treat it as conclusive on its own.
      const passwordAlreadySet = !fromInviteLink && user.user_metadata?.password_set === true;
      setIdentity({ name: user.user_metadata?.full_name || "", email: user.email || "" });
      // An existing account's sign-in link: still confirm who is opening it
      // before joining the company and entering the app.
      if (passwordAlreadySet) { setPhase("confirm"); return; }

      // New invitee with a valid link — let them set a password.
      setPhase("form");
    })();
    return () => { active = false; };
  }, [flow]);

  // Length floor plus the handful of patterns that get guessed first; the
  // old rule accepted "password" and the person's own email address.
  const policy = checkPassword(password, { email: identity.email, fullName: identity.name });
  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const strength = passwordStrength(password, { email: identity.email, fullName: identity.name });
  const matches = confirm.length > 0 && password === confirm;
  const firstName = identity.name ? identity.name.split(" ")[0] : "";

  // Not the invited person: end the session the link created before anything
  // is attached to the account.
  async function handleNotMe() {
    setBusy(true);
    try { await supabase.auth.signOut(); } catch { /* session already gone */ }
    setBusy(false);
    setPhase("notMe");
  }

  async function handleContinueExisting() {
    setBusy(true);
    try { await supabase.rpc("claim_company_invite"); } catch { /* already linked */ }
    window.location.replace("/");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!confirmedIdentity) {
      setError(`Confirm that you are ${identity.email || "the invited person"} to continue.`);
      return;
    }
    if (!policy.ok) {
      setError(policy.problem);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password, data: { password_set: true } });
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

          {phase === "notMe" && (
            <div className="py-4 text-center">
              <h2 className="text-xl font-bold text-slate-900">You've been signed out</h2>
              <p className="mt-2 text-sm font-medium text-slate-500">
                This invitation belongs to <span className="font-bold text-slate-700">{identity.email || "someone else"}</span>, so nothing was set up.
              </p>
              <p className="mt-3 text-sm font-medium text-slate-500">
                To join, ask your company admin to invite your own email address from Company Settings. Please let {identity.email || "the invited person"} know their link was opened — they'll need their admin to resend it.
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

          {phase === "confirm" && (
            <>
              <h2 className="text-xl font-bold text-slate-900">Continue as {identity.email || "this account"}?</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                This sign-in link opens the QCore account for this address.
              </p>
              <IdentityNotice email={identity.email} />
              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  onClick={handleContinueExisting}
                  disabled={busy}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" />Signing you in…</> : `Yes, I'm ${identity.email || "this person"}`}
                </button>
                <button
                  type="button"
                  onClick={handleNotMe}
                  disabled={busy}
                  className="min-h-12 w-full rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  This isn't me
                </button>
              </div>
            </>
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

          <IdentityNotice email={identity.email} />

          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <input
              type="checkbox"
              checked={confirmedIdentity}
              onChange={(e) => setConfirmedIdentity(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-blue-700"
            />
            <span className="text-sm font-semibold text-slate-700">
              I am <span className="break-all">{identity.email || "the invited person"}</span>
            </span>
          </label>

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
              <Requirement met={longEnough} label={`At least ${MIN_PASSWORD_LENGTH} characters`} />
              <Requirement met={policy.ok} label={policy.ok ? (strength.label || "Not easily guessed") : (password ? policy.problem : "Not easily guessed")} />
              <Requirement met={matches} label="Passwords match" />
            </div>

            {error && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy || !confirmedIdentity || !policy.ok || !matches}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" />Setting up your account…</> : "Create account & continue"}
            </button>
            <button
              type="button"
              onClick={handleNotMe}
              disabled={busy}
              className="min-h-11 w-full rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
            >
              This isn't me
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
