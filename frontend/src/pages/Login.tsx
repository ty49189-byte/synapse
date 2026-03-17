import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await res.json();
      console.log("LOGIN RESPONSE:", data);

      // 🔥 FIX: handle all possible backend formats
      const token =
        data?.token ||
        data?.data?.token ||
        data?.data?.accessToken;

      if (token && token !== "undefined") {
        localStorage.setItem("token", token);

        console.log("TOKEN SAVED:", token);

        // redirect properly
        navigate("/");
      } else {
        console.error("NO TOKEN FOUND IN RESPONSE:", data);
        alert("Login failed - no token received");
      }
    } catch (err) {
      console.error("LOGIN ERROR:", err);
      alert("Cannot connect to backend");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-[380px] p-8 rounded-2xl bg-surface border border-border shadow-xl"
      >
        <h1 className="text-2xl font-semibold text-foreground mb-6">
          Welcome Back
        </h1>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full p-3 rounded-lg bg-muted text-foreground outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full p-3 rounded-lg bg-muted text-foreground outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full p-3 rounded-lg bg-primary text-white font-medium hover:opacity-90 transition"
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          <p className="text-sm text-muted-foreground text-center">
            Don’t have an account?{" "}
            <span
              onClick={() => navigate("/register")}
              className="text-primary cursor-pointer"
            >
              Register
            </span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}