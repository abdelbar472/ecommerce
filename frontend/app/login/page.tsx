"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authApi, ApiError, getRole, dashboardPath, type RegisterRole } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("alice@example.com");
  const [password, setPassword] = useState("secret123");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<RegisterRole>("client");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await authApi.register(email, password, fullName, role);
        setInfo(`Account created as ${role === "merchant" ? "seller" : "cx"}. Signing you in…`);
      }
      const token = await authApi.login(email, password);
      // role is stored in the JWT + localStorage by authApi.login
      router.push(dashboardPath(getRole()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <div className="card login-card">
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Kafka Demo Console</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Sign in to manage orders, notifications and analytics.
        </p>

        <div className="tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        {error && <div className="error">{error}</div>}
        {info && (
          <div className="pill ok" style={{ display: "block", marginBottom: 14 }}>
            {info}
          </div>
        )}

        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {mode === "register" && (
            <div style={{ marginBottom: 12 }}>
              <label>Full name (optional)</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}

          {mode === "register" && (
            <div style={{ marginBottom: 12 }}>
              <label>Account type</label>
              <div className="tabs" style={{ marginBottom: 0 }}>
                <button
                  type="button"
                  className={role === "client" ? "active" : ""}
                  onClick={() => setRole("client")}
                >
                  Customer (cx)
                </button>
                <button
                  type="button"
                  className={role === "merchant" ? "active" : ""}
                  onClick={() => setRole("merchant")}
                >
                  Seller
                </button>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
                {role === "merchant"
                  ? "Sellers add products with prices and see their own sales analytics."
                  : "Customers browse products and keep a history of their purchases."}
              </p>
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          <button type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Please wait…" : mode === "login" ? "Login" : "Register & login"}
          </button>
        </form>

        <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 16 }}>
          Auth Service · port 8004. Register creates a <span className="mono">cx</span> or{" "}
          <span className="mono">seller</span> account; admin accounts are created by an existing
          admin.
        </p>
      </div>
    </div>
  );
}
