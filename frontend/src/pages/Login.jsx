import { useState } from "react";
import { supabase } from "../services/supabase";

function Login() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin() {

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      window.location.href = "/";
    }
  }

  return (

    <div className="flex items-center justify-center min-h-screen bg-gray-100">

      <div className="bg-white p-10 rounded-2xl shadow-xl w-[420px]">

        <div className="text-center mb-8">

          <h1 className="text-4xl font-bold text-blue-600 mb-2">
            QCore
          </h1>

          <p className="text-gray-500">
            Quality Control & Field Operations Platform
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
          className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg font-semibold transition"
        >
          Login
        </button>

      </div>

    </div>
  );
}

export default Login;