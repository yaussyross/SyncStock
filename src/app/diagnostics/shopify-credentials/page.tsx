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

function buildOAuthMessage(params: URLSearchParams) {
  const normalized = new URLSearchParams();
  Array.from(params.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([key, value]) => normalized.append(key, value));
  return normalized.toString().replace(/\+/g, "%20");
}

async function calculateHmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret.trim()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

type CallbackResult = {
  currentMatches: boolean;
  previousMatches: boolean | null;
  shop: string | null;
  hasRequiredParams: boolean;
};

export default function ShopifyCredentialDiagnosticsPage() {
  const [server, setServer] = useState<ServerData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [previousSecret, setPreviousSecret] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [callbackError, setCallbackError] = useState("");
  const [callbackResult, setCallbackResult] = useState<CallbackResult | null>(null);
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

  async function verifyCallback() {
    setCallbackError("");
    setCallbackResult(null);
    try {
      const url = new URL(callbackUrl.trim());
      const provided = url.searchParams.get("hmac")?.toLowerCase() ?? "";
      const message = buildOAuthMessage(url.searchParams);
      const hasRequiredParams = Boolean(
        provided &&
        /^[0-9a-f]{64}$/.test(provided) &&
        url.searchParams.get("code") &&
        url.searchParams.get("shop") &&
        url.searchParams.get("state") &&
        url.searchParams.get("timestamp")
      );
      if (!hasRequiredParams) throw new Error("That URL does not contain a complete Shopify OAuth callback.");

      const current = await calculateHmacHex(secret, message);
      const previous = previousSecret ? await calculateHmacHex(previousSecret, message) : null;
      setCallbackResult({
        currentMatches: current === provided,
        previousMatches: previous ? previous === provided : null,
        shop: url.searchParams.get("shop"),
        hasRequiredParams,
      });
    } catch (error) {
      setCallbackError(error instanceof Error ? error.message : "Could not verify callback URL.");
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Shopify credential diagnostic</h1>
      <p><strong>Sandbox only.</strong> Values you type below are processed locally in your browser with Web Crypto. Raw Client IDs, secrets, authorization codes, and callback URLs are never sent to SyncStock.</p>
      {loadError ? <p style={{ color: "crimson" }}>{loadError}</p> : null}
      {server ? <p>Configured sandbox store: <code>{server.shopDomain || "not set"}</code></p> : <p>Loading live Railway fingerprints…</p>}

      <label style={{ display: "block", marginTop: 20 }}>Shopify Client ID</label>
      <input value={clientId} onChange={e => setClientId(e.target.value)} autoComplete="off" style={{ width: "100%", padding: 10 }} />

      <label style={{ display: "block", marginTop: 16 }}>Shopify current Client secret</label>
      <input type="password" value={secret} onChange={e => setSecret(e.target.value)} autoComplete="off" style={{ width: "100%", padding: 10 }} />

      <label style={{ display: "block", marginTop: 16 }}>Previous Client secret (only if Shopify still shows one)</label>
      <input type="password" value={previousSecret} onChange={e => setPreviousSecret(e.target.value)} autoComplete="off" style={{ width: "100%", padding: 10 }} />

      <button onClick={compare} disabled={!server || !clientId || !secret} style={{ marginTop: 20, padding: "10px 18px", cursor: "pointer" }}>
        Compare credentials locally
      </button>

      {results ? (
        <section style={{ marginTop: 28 }}>
          <h2>Credential result</h2>
          <p>Client ID: <strong>{results.clientId ? "MATCH" : "MISMATCH"}</strong></p>
          <p>Current secret: <strong>{results.currentSecret ? "MATCH" : "MISMATCH"}</strong></p>
          {results.previousSecret !== null ? <p>Previous secret: <strong>{results.previousSecret ? "MATCH" : "MISMATCH"}</strong></p> : null}
        </section>
      ) : null}

      <hr style={{ margin: "36px 0" }} />
      <h2>Verify the failed OAuth callback</h2>
      <p>Copy the full URL from the browser address bar on the <code>signature_mismatch</code> error page and paste it below. Verification stays in this browser.</p>
      <label style={{ display: "block", marginTop: 16 }}>Failed callback URL</label>
      <textarea value={callbackUrl} onChange={e => setCallbackUrl(e.target.value)} rows={4} autoComplete="off" style={{ width: "100%", padding: 10 }} />
      <button onClick={verifyCallback} disabled={!callbackUrl || !secret} style={{ marginTop: 16, padding: "10px 18px", cursor: "pointer" }}>
        Verify callback signature locally
      </button>
      {callbackError ? <p style={{ color: "crimson" }}>{callbackError}</p> : null}
      {callbackResult ? (
        <section style={{ marginTop: 24 }}>
          <h2>Callback signature result</h2>
          <p>Callback store: <code>{callbackResult.shop}</code></p>
          <p>Signed by current secret: <strong>{callbackResult.currentMatches ? "YES" : "NO"}</strong></p>
          {callbackResult.previousMatches !== null ? <p>Signed by previous secret: <strong>{callbackResult.previousMatches ? "YES" : "NO"}</strong></p> : null}
          <p><strong>Interpretation:</strong> If previous = YES and current = NO, Railway must use that previous secret as <code>SHOPIFY_API_SECRET_PREVIOUS</code> until Shopify stops signing with it. If both = NO, the callback came from a different Shopify app/secret or the copied callback URL was incomplete or altered.</p>
        </section>
      ) : null}
    </main>
  );
}
