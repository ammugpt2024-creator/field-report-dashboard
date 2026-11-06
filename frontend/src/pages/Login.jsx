import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import { getRoleHomeRoute } from "../utils/navigation";
import { BRAND } from "../config/branding";
import Logo from "../components/Logo";
import loginBg from "../assets/login-bg.png";

function Login() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // A re-clicked or expired invite/recovery link lands here with an error
  // hash; explain it instead of showing a bare login form.
  // Set once from the URL or a stored marker; the reset flow keeps its own
  // state now, so nothing writes to this after mount.
  const [notice] = useState(() => {
    // Set by the reset screen, which signs the user out so the new password
    // has to be used to get back in.
    if (new URLSearchParams(window.location.search).has("password_reset")) {
      return "Your password has been updated. Sign in with your new password.";
    }
    // Set by the idle timeout, so being signed out reads as a deliberate
    // protection rather than the app dropping someone mid-shift.
    if (new URLSearchParams(window.location.search).get("signed_out") === "idle") {
      return "You were signed out because this device was left idle. Sign in to carry on — any draft report is still saved on this device.";
    }
    if (sessionStorage.getItem("qcore-auth-error")) {
      sessionStorage.removeItem("qcore-auth-error");
      return "That link has expired or was already used. Invitation and reset links work once — ask your admin to resend your invite, or use “Forgot password?” below to set a new password.";
    }
    return "";
  });
  const [loginError, setLoginError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  // "signIn" or "reset": the same card, one job at a time.
  const [mode, setMode] = useState("signIn");
  const [resetEmail, setResetEmail] = useState("");
  const [resetState, setResetState] = useState({ busy: false, error: "", sentTo: "" });
  // The address the visitor arrived on, captured before this screen rewrites
  // it. Only in-app paths are kept, so a crafted link cannot bounce someone to
  // another site after they sign in.
  const [requestedPath] = useState(() => {
    const { pathname, search } = window.location;
    const isAppPath = pathname.startsWith("/") && !pathname.startsWith("//") && !pathname.includes("\\");
    const skip = ["/", "/welcome", "/reset-password"].includes(pathname);
    return isAppPath && !skip ? `${pathname}${search || ""}` : "";
  });
  const navigate = useNavigate();

  // Drop the marker once it has been read so a refresh doesn't repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("password_reset") && !params.has("signed_out")) return;
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // Asking for the address on its own screen. It used to be read from the
  // sign-in field, so clicking "Forgot password?" with an empty box told the
  // person to go back and fill it in first -- a step people got stuck on.
  function openReset() {
    setResetEmail(email);
    setResetState({ busy: false, error: "", sentTo: "" });
    setMode("reset");
  }

  function backToSignIn() {
    setMode("signIn");
    setResetState({ busy: false, error: "", sentTo: "" });
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    const address = resetEmail.trim();
    if (!address) {
      setResetState({ busy: false, error: "Enter the email address you sign in with.", sentTo: "" });
      return;
    }
    setResetState({ busy: true, error: "", sentTo: "" });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      // Supabase deliberately reports success for addresses with no account,
      // so the form cannot be used to discover which emails are registered.
      // Promise only what we actually know.
      setResetState({ busy: false, error: "", sentTo: address });
    } catch (error) {
      setResetState({
        busy: false,
        sentTo: "",
        error: /failed to fetch|network/i.test(error?.message || "")
          ? "Unable to reach QCore. Check your internet connection and try again."
          : (error?.message || "The reset email could not be sent. Please try again.")
      });
    }
  }

  // A real form submit, so Enter in either field signs in -- the fields used to
  // sit outside a form and only a click on Login worked.
  async function handleLogin(event) {
    event.preventDefault();
    if (signingIn) return;
    setLoginError("");
    setSigningIn(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setLoginError(/failed to fetch|network/i.test(error.message || "")
          ? "Unable to reach QCore. Check your internet connection and try again."
          : error.message);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data?.user?.id)
        .maybeSingle();

      // Land on the page they actually asked for. Every emailed link (View
      // Submitted Log, approval notices) went through this screen and then
      // dropped the reader on their dashboard instead.
      navigate(requestedPath || getRoleHomeRoute(profile?.role), { replace: true });
    } catch (error) {
      setLoginError(error?.message || "Unable to sign in right now. Please try again.");
    } finally {
      setSigningIn(false);
    }
  }

  return (

    <div
      className="flex min-h-screen w-full max-w-full items-center justify-center overflow-x-hidden bg-slate-50 bg-cover bg-center bg-no-repeat px-4"
      style={{ backgroundImage: `url(${loginBg})` }}
    >

      <div className="w-full max-w-[420px] rounded-2xl border border-white/60 bg-white/85 p-6 shadow-2xl shadow-navy-900/10 backdrop-blur-md sm:p-10">

        <div className="text-center mb-8">

          <Logo variant="full" className="mb-4" />

          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#1c2f4a]">
            {BRAND.tagline}
          </p>

        </div>

        {mode === "reset" ? (
          resetState.sentTo ? (
            <div>
              <h2 className="text-lg font-bold text-slate-900">Check your email</h2>
              <p className="mt-2 text-sm font-medium text-slate-600">
                If an account exists for <span className="font-bold text-slate-900 break-all">{resetState.sentTo}</span>,
                a link to set a new password is on its way. It works once and expires, so use it soon.
              </p>
              <p className="mt-2 text-sm font-medium text-slate-500">
                Nothing after a few minutes? Check the spam folder, or ask your company admin to confirm the address on your account.
              </p>
              <button
                type="button"
                onClick={backToSignIn}
                className="mt-5 min-h-11 w-full rounded-lg bg-gradient-to-r from-accent-500 to-accent-600 p-3 font-semibold text-white"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword}>
              <h2 className="text-lg font-bold text-slate-900">Reset your password</h2>
              <p className="mb-4 mt-1 text-sm font-medium text-slate-600">
                Enter the email address you sign in with and we will send you a link to set a new password.
              </p>
              <input
                type="email"
                name="reset-email"
                autoComplete="username"
                autoFocus
                placeholder="you@company.com"
                value={resetEmail}
                onChange={(e) => { setResetEmail(e.target.value); setResetState({ busy: false, error: "", sentTo: "" }); }}
                required
                className="w-full border border-gray-300 p-3 rounded-lg"
              />
              {resetState.error && (
                <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{resetState.error}</p>
              )}
              <button
                type="submit"
                disabled={resetState.busy}
                className="mt-4 min-h-11 w-full rounded-lg bg-gradient-to-r from-accent-500 to-accent-600 p-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {resetState.busy ? "Sending…" : "Send reset link"}
              </button>
              <button
                type="button"
                onClick={backToSignIn}
                className="mt-3 w-full text-center text-sm font-semibold text-blue-700 hover:underline"
              >
                Back to sign in
              </button>
            </form>
          )
        ) : (
        <form onSubmit={handleLogin}>
          <input
            type="email"
            name="email"
            autoComplete="username"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-gray-300 p-3 rounded-lg mb-4"
          />

          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border border-gray-300 p-3 rounded-lg mb-6"
          />

          {loginError && (
            <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{loginError}</p>
          )}

          {notice && (
            <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">{notice}</p>
          )}

          <button
            type="submit"
            disabled={signingIn}
            className="min-h-11 w-full rounded-lg bg-gradient-to-r from-accent-500 to-accent-600 p-3 font-semibold text-white shadow-sm shadow-accent-600/20 transition hover:from-accent-600 hover:to-accent-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {signingIn ? "Signing in…" : "Login"}
          </button>

          <button
            type="button"
            onClick={openReset}
            className="mt-4 w-full text-center text-sm font-semibold text-blue-700 hover:underline"
          >
            Forgot password?
          </button>
        </form>
        )}

      </div>

    </div>
  );
}

export default Login;
