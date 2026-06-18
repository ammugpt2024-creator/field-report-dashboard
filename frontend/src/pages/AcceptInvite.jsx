import { useState } from "react";
import { supabase } from "../services/supabase";
import { BRAND } from "../config/branding";

// Invite acceptance: the link in the invitation email signs the invitee in
// with a one-time token and lands here so they can set their password and be
// attached to their company before entering the app.
function AcceptInvite() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
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

  return (
    <div className="flex min-h-screen w-full max-w-full items-center justify-center overflow-x-hidden bg-slate-100 px-4">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-xl sm:p-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-950 mb-2">{BRAND.name}</h1>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">{BRAND.tagline}</p>
          <p className="mt-3 text-sm font-medium text-gray-500">
            Welcome! Set a password to finish creating your account.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Choose a password (min. 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full border border-gray-300 p-3 rounded-lg mb-4"
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="w-full border border-gray-300 p-3 rounded-lg mb-4"
          />
          {error && (
            <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-blue-700 p-3 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? "Setting up your account…" : "Set Password & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AcceptInvite;
