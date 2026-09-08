"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) router.push("/dashboard");
  }

  return (
    <main className="container" style={{ paddingTop: 80, maxWidth: 420 }}>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Log in</h1>
      <form onSubmit={handleSubmit} className="card">
        <input type="email" placeholder="you@yourstore.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ marginBottom: 16 }} />
        <button type="submit" className="btn" style={{ width: "100%" }}>Continue</button>
      </form>
    </main>
  );
}
