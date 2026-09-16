"use client";

import { useEffect, useMemo, useState } from "react";

type Fingerprint = { sha256Prefix: string; length: number } | null;
type ServerData = {
  sandbox: boolean;
  apiKey: Fingerprint;
  currentSecret: Fingerprint;
  previousSecret: Fingerprint;
  shopDomain: string | null;
};

async function localFingerprint(value: string) {
  const normalized = value.trim();
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return { sha256Prefix: hex.slice(0, 12), length: normalized.length };
}

function match(candidate: Fingerprint, live: Fingerprint) {
  if (!candidate || !live) return false;
  return candidate.sha256Prefix === live.sha256Prefix && candidate.length === live.length;
}

export default function ShopifyCredentialDiagnosticsPage() {
  const [server, setServer] = useState<ServerData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [previousSecret, setPreviousSecret] = useState("");
  const [local, setLocal] = useState<{ apiKey: Fingerprint; currentSecret: Fingerprint; previousSecret: Fingerprint } | null>(null);

  useEffect(() => {
    fetch("/api/diagnostics/shopify-credentials", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 401 ? "Log in to the sandbox first." : `Diagnostic unavailable (${response.status}).`);
        return response.json();
      })
      .then(setServer)
      .catch(error => setLoadError(error instanceof Error ? error.message : "Could not load diagnostic."));
  }, []);

  const results = useMemo(() => {
    if (!server || !local) return null;
    return {
      clientId: match(local.apiKey, server.apiKey),
      currentSecret: match(local.currentSecret, server.currentSecret),
      previousSecret: previousSecret ? match(local.previousSecret, server.previousSecret) : null,
    };
  }, [server, local, previousSecret]);

  async function compare() {
    setLocal({
      apiKey: clientId ? await localFingerprint(clientId) : null,
      currentSecret: secret ? await localFingerprint(secret) : null,
      previousSecret: previousSecret ? await localFingerprint(previousSecret) : null,
    });
  }

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Shopify credential diagnostic</h1>
      <p><strong>Sandbox only.</strong> Values you type below are hashed locally in your browser with Web Crypto. The raw Client ID and secrets are never sent to SyncStock.</p>
      {loadError ? <p style={{ color: "crimson" }}>{loadError}</p> : null}
      {server ? <p>Configured sandbox store: <code>{server.shopDomain || "not set"}</code></p> : <p>Loading live Railway fingerprints…</p>}

      <label style={{ display: "block", marginTop: 20 }}>Shopify Client ID</label>
      <input value={clientId} onChange={e => setClientId(e.target.value)} autoComplete="off" style={{ width: "100%", padding: 10 }} />

      <label style={{ display: "block", marginTop: 16 }}>Shopify current Client secret</label>
      <input type="password" value={secret} onChange={e => setSecret(e.target.value)} autoComplete="off" style={{ width: "100%", padding: 10 }} />

      <label style={{ display: "block", marginTop: 16 }}>Previous Client secret (only if Shopify still shows one)</label>
      <input type="password" value={previousSecret} onChange={e => setPreviousSecret(e.target.value)} autoComplete="off" style={{ width: "100%", padding: 10 }} />

      <button onClick={compare} disabled={!server || !clientId || !secret} style={{ marginTop: 20, padding: "10px 18px", cursor: "pointer" }}>
        Compare locally
      </button>

      {results ? (
        <section style={{ marginTop: 28 }}>
          <h2>Result</h2>
          <p>Client ID: <strong>{results.clientId ? "MATCH" : "MISMATCH"}</strong></p>
          <p>Current secret: <strong>{results.currentSecret ? "MATCH" : "MISMATCH"}</strong></p>
          {results.previousSecret !== null ? <p>Previous secret: <strong>{results.previousSecret ? "MATCH" : "MISMATCH"}</strong></p> : null}
          <p>If Client ID or current secret says MISMATCH, Railway is not using the credentials from the Shopify app you copied them from.</p>
        </section>
      ) : null}
    </main>
  );
}
