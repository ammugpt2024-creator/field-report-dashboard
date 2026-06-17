import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import { getRoleHomeRoute } from "../utils/navigation";
import { BRAND } from "../config/branding";
import Logo from "../components/Logo";

function Login() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

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

          <Logo variant="full" className="mb-4" />

          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#1c2f4a]">
            {BRAND.tagline}
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

        <button
          onClick={handleLogin}
          className="min-h-11 w-full rounded-lg bg-gradient-to-r from-accent-500 to-accent-600 p-3 font-semibold text-white shadow-sm shadow-accent-600/20 transition hover:from-accent-600 hover:to-accent-700"
        >
          Login
        </button>

      </div>

    </div>
  );
}

export default Login;
