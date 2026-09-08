"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    const body = await res.json().catch(() => ({}));
    setError(body.error || "Could not log in.");
    setLoading(false);
  }

  return (
    <main className="container" style={{ paddingTop: 80, maxWidth: 440 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Log in</h1>
      <p style={{ color: "var(--paper-dim)", marginBottom: 24 }}>Manage your Shopify → QuickBooks sync.</p>
      <form onSubmit={handleSubmit} className="card">
        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Email</span>
          <input type="email" autoComplete="email" placeholder="you@yourstore.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p role="alert" style={{ color: "#e37a4e", fontSize: 13, marginBottom: 14 }}>{error}</p>}
        <button type="submit" className="btn" style={{ width: "100%" }} disabled={loading}>{loading ? "Logging in..." : "Log in"}</button>
      </form>
      <p style={{ color: "var(--paper-dim)", fontSize: 13, marginTop: 14 }}>New to SyncStock? <a href="/signup">Create an account</a>.</p>
    </main>
  );
}
