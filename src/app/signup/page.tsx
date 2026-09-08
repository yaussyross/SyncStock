"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) router.push("/dashboard");
    setLoading(false);
  }

  return (
    <main className="container" style={{ paddingTop: 80, maxWidth: 420 }}>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Start your free trial</h1>
      <form onSubmit={handleSubmit} className="card">
        <input type="email" placeholder="you@yourstore.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ marginBottom: 16 }} />
        <button type="submit" className="btn" style={{ width: "100%" }} disabled={loading}>{loading ? "Starting..." : "Continue"}</button>
      </form>
      <p style={{ color: "#888", fontSize: 13, marginTop: 12 }}>20 orders free, no card required.</p>
    </main>
  );
}
