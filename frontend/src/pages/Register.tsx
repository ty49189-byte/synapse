import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export default function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setLoading(true);

    try {
      const res = await fetch("https://synapse-j8v6.onrender.comonrender.com/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      const data = await res.json();
      console.log("REGISTER RESPONSE:", data);

      if (res.ok && data.success) {
        alert("Registered successfully ✅");
        navigate("/login");
      } else {
        alert(data.message || "Registration failed");
      }
    } catch (err) {
      console.error("REGISTER ERROR:", err);
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
          Create Account
        </h1>

        <div className="space-y-4">
          <input
            placeholder="Name"
            className="w-full p-3 rounded-lg bg-muted text-foreground outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

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
            onClick={handleRegister}
            disabled={loading}
            className="w-full p-3 rounded-lg bg-primary text-white font-medium hover:opacity-90 transition"
          >
            {loading ? "Registering..." : "Register"}
          </button>

          <p className="text-sm text-muted-foreground text-center">
            Already have an account?{" "}
            <span
              onClick={() => navigate("/login")}
              className="text-primary cursor-pointer"
            >
              Login
            </span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
