import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import { getRoleHomeRoute } from "../utils/navigation";
import { BRAND } from "../config/branding";

function Login() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // A re-clicked or expired invite/recovery link lands here with an error
  // hash; explain it instead of showing a bare login form.
  const [notice, setNotice] = useState(() => {
    if (sessionStorage.getItem("qcore-auth-error") === "otp_expired") {
      sessionStorage.removeItem("qcore-auth-error");
      return "That link has expired or was already used. Sign in with your password, or use “Forgot password?” to set a new one.";
    }
    return "";
  });
  const navigate = useNavigate();

  async function handleForgotPassword() {
    if (!email) {
      setNotice("Enter your email above first, then click “Forgot password?”.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    setNotice(error ? error.message : `Password reset email sent to ${email}. Check your inbox.`);
  }

  async function handleLogin() {

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data?.user?.id)
        .maybeSingle();

      navigate(getRoleHomeRoute(profile?.role), { replace: true });
    }
  }

  return (

    <div className="flex min-h-screen w-full max-w-full items-center justify-center overflow-x-hidden bg-slate-100 px-4">

      <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-xl sm:p-10">

        <div className="text-center mb-8">

          <h1 className="text-4xl font-bold text-slate-950 mb-2">
            {BRAND.name}
          </h1>

          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">
            {BRAND.tagline}
          </p>

          <p className="mt-3 text-sm font-medium text-gray-500">
            {BRAND.platformDescription}
          </p>

        </div>

        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg mb-4"
        />

        <input
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg mb-6"
        />

        {notice && (
          <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">{notice}</p>
        )}

        <button
          onClick={handleLogin}
          className="min-h-11 w-full rounded-lg bg-blue-600 p-3 font-semibold text-white transition hover:bg-blue-700"
        >
          Login
        </button>

        <button
          type="button"
          onClick={handleForgotPassword}
          className="mt-4 w-full text-center text-sm font-semibold text-blue-700 hover:underline"
        >
          Forgot password?
        </button>

      </div>

    </div>
  );
}

export default Login;
