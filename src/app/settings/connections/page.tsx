"use client";

import { useEffect, useRef, useState } from "react";

type Connection = { connectionId: string; provider: string; environment: string; version: number; status: string; accountStatus: string; providerAccountId: string | null; customerReady: false };
type Account = { accountId: string; label: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const errorMessage = (status: number) => status === 401 ? "Sign in to SyncStock, then return here." : status === 409 ? "This connection changed. Reload its status before trying again." : status === 404 || status === 503 ? "Expansion connections are not enabled or this connection is unavailable." : "This request could not be completed. Try loading the connection again.";

export default function ExpansionConnectionsPage() {
  const [connectionId, setConnectionId] = useState("");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const actionInFlight = useRef(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const values = new URL(window.location.href).searchParams.getAll("connection");
    if (values.length === 1 && uuid.test(values[0])) setConnectionId(values[0]);
    else if (values.length) setMessage("The connection link is invalid.");
  }, []);

  async function request(path: string, init?: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer", signal: controller.signal });
      if(response.status===429){
        const seconds=Number(response.headers.get("retry-after"));
        throw new Error(Number.isSafeInteger(seconds)&&seconds>=1&&seconds<=3600?`This request is temporarily limited. Try again in ${seconds} seconds.`:"This request is temporarily limited. Wait before trying again.");
      }
      if (!response.ok) throw new Error(errorMessage(response.status));
      return await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw new Error("This request timed out. Reload the connection status before trying again.");
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function run(action: () => Promise<void>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(error instanceof Error && ["Sign in", "This connection", "Expansion connections", "This request"].some(prefix => error.message.startsWith(prefix)) ? error.message : "This request could not be completed. Try again."); }
    finally { actionInFlight.current = false; setBusy(false); }
  }
  async function connect(provider: "ebay" | "xero") {
    await run(async () => {
      const result = await request(`/api/expansion/oauth/${provider}/start`, { method: "POST" });
      const authorization = new URL(result.authorizationUrl);
      const hosts = provider === "xero" ? ["login.xero.com"] : ["auth.ebay.com", "auth.sandbox.ebay.com"];
      if (authorization.protocol !== "https:" || !hosts.includes(authorization.hostname) || authorization.username || authorization.password) throw new Error();
      window.location.assign(authorization.href);
    });
  }
  async function loadStatus() {
    await run(async () => {
      if (!uuid.test(connectionId)) { setMessage("Enter the connection ID from the authorization return link."); return; }
      const result = await request(`/api/expansion/connections/${connectionId}`);
      setConnection(result.connection); setAccounts([]); setSelected("");
    });
  }
  async function loadAccounts() {
    await run(async () => {
      if (!connection) return;
      const result = await request(`/api/expansion/connections/${connection.connectionId}/accounts`);
      setConnection(result.connection); setAccounts(result.accounts); setSelected("");
      if (!result.accounts.length) setMessage("No eligible authorized accounts were returned.");
    });
  }
  async function bind() {
    await run(async () => {
      if (!connection || !accounts.some(account => account.accountId === selected)) return;
      const result = await request(`/api/expansion/connections/${connection.connectionId}/bind`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: selected, version: connection.version }),
      });
      setConnection(result.connection); setAccounts([]); setSelected("");
      setMessage("Account binding saved. This connection is not customer-ready and does not enable syncing or posting.");
    });
  }
  return <main className="mx-auto max-w-2xl p-6 space-y-6">
    <h1 className="text-2xl font-semibold">Expansion connections</h1>
    <p>Experimental eBay and Xero authorization. Disabled unless explicitly enabled and configured on this server. Connecting or binding an account does not enable syncing, accounting writes, or customer readiness.</p>
    <div className="flex gap-3">
      <button type="button" disabled={busy} onClick={() => connect("ebay")} className="rounded border px-3 py-2">Connect eBay</button>
      <button type="button" disabled={busy} onClick={() => connect("xero")} className="rounded border px-3 py-2">Connect Xero</button>
    </div>
    <p>After authorization, load the returned connection and explicitly choose an authorized account. If no connection ID appears, authorization did not finish. eBay sandbox mock identities cannot be bound.</p>
    <label className="block">Connection ID
      <input value={connectionId} onChange={event => { setConnectionId(event.target.value); setConnection(null); setAccounts([]); setSelected(""); }} disabled={busy} autoComplete="off" maxLength={36} className="block w-full rounded border p-2" />
    </label>
    <button type="button" disabled={busy || !uuid.test(connectionId)} onClick={loadStatus} className="rounded border px-3 py-2">Load connection status</button>
    {connection && <section className="space-y-3" aria-label="Connection setup">
      <p>{connection.provider} ({connection.environment}): {connection.status}, account {connection.accountStatus}{connection.providerAccountId ? ` (${connection.providerAccountId})` : ""}. Not customer-ready.</p>
      <button type="button" disabled={busy || connection.status !== "available"} onClick={loadAccounts} className="rounded border px-3 py-2">Load authorized accounts</button>
      {accounts.length > 0 && <>
        <label className="block">Authorized account
          <select value={selected} onChange={event => setSelected(event.target.value)} disabled={busy} className="block w-full rounded border p-2">
            <option value="">Select an account</option>
            {accounts.map(account => <option key={account.accountId} value={account.accountId}>{account.label || account.accountId}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy || !selected} onClick={bind} className="rounded border px-3 py-2">Bind selected account</button>
      </>}
    </section>}
    {busy && <p role="status">Working…</p>}
    {message && <p role="status">{message}</p>}
    <a href="/dashboard" className="underline">Back to dashboard</a>
  </main>;
}
