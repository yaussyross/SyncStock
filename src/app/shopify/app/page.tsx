"use client";

import { useEffect, useMemo, useState } from "react";
import { clearedMappingIds } from "@/lib/mapping-selection";

type EmbeddedStatus = {
  shopify: { connected: boolean; domain: string | null; webhookReady: boolean; lifecycleReady: boolean };
  quickbooks: { connected: boolean; requiresReconnect?: boolean; realmId: string | null };
  mappings: { count: number };
  plan: { tier: string; label: string; status: string; used: number; limit: number | null };
  adjustmentsNeedingReview: number;
  logs: Array<{ id: string; orderNumber: string | null; status: string; errorMessage: string | null; shopifyTotal: string | null; qboActualTotal: string | null; createdAt: string }>;
};

type ShopifyVariant = {
  id: string;
  legacyResourceId: string;
  title: string;
  sku: string | null;
  productTitle: string;
};

type QboItem = { id: string; name: string; sku: string | null; type: string | null };
type Mapping = { shopifyVariantId: string; qboItemId: string };

const RETRYABLE_SYNC_STATUSES = new Set([
  "failed",
  "queue_failed",
  "skipped_no_mapping",
  "blocked_reconciliation",
  "skipped_quota_exceeded",
]);

function syncStatusPresentation(status: string) {
  if (status === "success") return { label: "Synced", className: "badge-success" };
  if (status === "pending") return { label: "Processing", className: "badge-pending" };
  if (status === "skipped_no_mapping") return { label: "Mapping needed", className: "badge-pending" };
  if (status === "skipped_quota_exceeded") return { label: "Plan action needed", className: "badge-pending" };
  if (status === "blocked_reconciliation") return { label: "Total mismatch", className: "badge-failed" };
  if (status === "reconciliation_failed_qbo") return { label: "Review in QuickBooks", className: "badge-failed" };
  if (status === "queue_failed") return { label: "Retry needed", className: "badge-failed" };
  if (status === "failed") return { label: "Failed", className: "badge-failed" };
  return { label: status.replace(/_/g, " "), className: "badge-pending" };
}

declare global {
  interface Window {
    shopify?: { idToken: () => Promise<string> };
  }
}

async function shopifyFetch(path: string, init: RequestInit = {}) {
  if (!window.shopify?.idToken) throw new Error("Open SyncStock from Shopify Admin to continue.");
  const token = await window.shopify.idToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export default function ShopifyAppHome() {
  const [status, setStatus] = useState<EmbeddedStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("Initializing SyncStock…");
  const [variants, setVariants] = useState<ShopifyVariant[]>([]);
  const [qboItems, setQboItems] = useState<QboItem[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [savedVariantIds, setSavedVariantIds] = useState<string[]>([]);

  async function refreshStatus() {
    const next = await shopifyFetch("/api/shopify/embedded/status");
    setStatus(next);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBusy("Connecting this Shopify store…");
        await shopifyFetch("/api/shopify/embedded/bootstrap", { method: "POST" });
        if (cancelled) return;
        await refreshStatus();
        if (!cancelled) setBusy("");
      } catch (err: any) {
        if (!cancelled) {
          setBusy("");
          setError(err?.message || "Could not initialize SyncStock.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function connectQuickBooks() {
    setError("");
    setBusy("Opening QuickBooks…");
    try {
      const data = await shopifyFetch("/api/shopify/embedded/qbo-start", { method: "POST" });
      window.open(data.url, "_top");
    } catch (err: any) {
      setBusy("");
      setError(err?.message || "Could not start QuickBooks connection.");
    }
  }

  async function loadCatalogs() {
    setError("");
    setBusy("Loading Shopify and QuickBooks catalogs…");
    try {
      const [shopifyCatalog, qboCatalog, mappingData] = await Promise.all([
        shopifyFetch("/api/catalog/shopify"),
        shopifyFetch("/api/catalog/qbo"),
        shopifyFetch("/api/mappings"),
      ]);
      const loadedVariants = (shopifyCatalog.variants ?? []) as ShopifyVariant[];
      const loadedMappings = (mappingData.mappings ?? []) as Mapping[];
      setVariants(loadedVariants);
      setQboItems((qboCatalog.items ?? []) as QboItem[]);
      setSelections(Object.fromEntries(loadedMappings.map((mapping) => [mapping.shopifyVariantId, mapping.qboItemId])));
      setSavedVariantIds(loadedMappings.map((mapping) => mapping.shopifyVariantId));
      setCatalogLoaded(true);
    } catch (err: any) {
      setError(err?.message || "Could not load product catalogs.");
      try { await refreshStatus(); } catch {}
    } finally {
      setBusy("");
    }
  }

  async function saveMappings() {
    setError("");
    setBusy("Saving product mappings…");
    try {
      const qboById = new Map(qboItems.map((item) => [item.id, item]));
      const mappings = variants
        .filter((variant) => selections[variant.legacyResourceId])
        .map((variant) => {
          const qboItem = qboById.get(selections[variant.legacyResourceId]);
          return {
            shopifyVariantId: variant.legacyResourceId,
            shopifySku: variant.sku,
            shopifyTitle: variant.title === "Default Title" ? variant.productTitle : `${variant.productTitle} — ${variant.title}`,
            qboItemId: qboItem!.id,
            qboItemName: qboItem!.name,
          };
        });
      const saved = await shopifyFetch("/api/mappings", {
        method: "POST",
        body: JSON.stringify({ mappings, removeVariantIds }),
      });
      setSavedVariantIds((saved.mappings as Mapping[]).map((mapping) => mapping.shopifyVariantId));
      await refreshStatus();
    } catch (err: any) {
      setError(err?.message || "Could not save product mappings.");
    } finally {
      setBusy("");
    }
  }

  async function retrySync(syncLogId: string) {
    setError("");
    setBusy("Retrying order sync…");
    try {
      await shopifyFetch("/api/shopify/embedded/retry", {
        method: "POST",
        body: JSON.stringify({ syncLogId }),
      });

      // Keep the merchant on the same screen and refresh until the queue has
      // either completed or reached a merchant-actionable state.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 900 : 1400));
        const next = await shopifyFetch("/api/shopify/embedded/status");
        setStatus(next);
        const retried = (next.logs as EmbeddedStatus["logs"]).find((log) => log.id === syncLogId);
        if (retried && retried.status !== "pending") break;
      }
    } catch (err: any) {
      setError(err?.message || "Could not retry order sync.");
    } finally {
      setBusy("");
    }
  }

  async function resolveMissingMapping() {
    await loadCatalogs();
    window.setTimeout(() => {
      document.getElementById("product-mappings")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function openBilling() {
    setError("");
    setBusy("Opening Shopify billing…");
    try {
      const data = await shopifyFetch("/api/shopify/billing", { method: "POST" });
      window.open(data.url, "_top");
    } catch (err: any) {
      setBusy("");
      setError(err?.message || "Could not open Shopify billing.");
    }
  }

  const selectedCount = useMemo(() => Object.values(selections).filter(Boolean).length, [selections]);
  const setupComplete = Boolean(status?.shopify.webhookReady && status?.quickbooks.connected && status?.mappings.count);
  const setupStepsComplete = [
    Boolean(status?.shopify.webhookReady),
    Boolean(status?.quickbooks.connected),
    Boolean(status?.mappings.count),
  ].filter(Boolean).length;
  const removeVariantIds = useMemo(() => clearedMappingIds(
    variants.map((variant) => variant.legacyResourceId), savedVariantIds, selections,
  ), [variants, savedVariantIds, selections]);

  return (
    <main className="embedded-app-shell"><div className="embedded-app">
      <div style={{ marginBottom: 22 }}>
        <div className="section-kicker">SYNCSTOCK · SHOPIFY APP</div>
        <h1 style={{ fontSize: 28, marginTop: 6 }}>Shopify orders in. Clean QuickBooks out.</h1>
        <p style={{ color: "#6d7175", marginTop: 8 }}>Connect QuickBooks, map your products, then let SyncStock reconcile paid orders before they reach your books.</p>
      </div>

      {busy && <div className="card" role="status" aria-live="polite" style={{ marginBottom: 16 }}><strong>{busy}</strong></div>}
      {error && (
        <div className="card" role="alert" style={{ marginBottom: 16, borderColor: "#d72c0d", background: "#fff4f4", color: "#5c1f15" }}>
          <strong>Action needed</strong>
          <p style={{ marginTop: 6 }}>{error}</p>
          {(status?.quickbooks.requiresReconnect || /refresh token|authorize again|quickbooks/i.test(error)) && (
            <button className="btn btn-small" style={{ marginTop: 12 }} onClick={connectQuickBooks}>
              Reconnect QuickBooks
            </button>
          )}
        </div>
      )}

      {status && (
        <>
          <div className="card embedded-readiness" style={{ marginBottom: 18 }}>
            <div>
              <div className="section-kicker">SETUP READINESS</div>
              <strong style={{ display: "block", marginTop: 8, fontSize: 18 }}>
                {setupComplete ? "Ready to sync paid orders" : `${setupStepsComplete} of 3 setup steps complete`}
              </strong>
              <p style={{ color: "#6d7175", marginTop: 6, fontSize: 13 }}>
                {setupComplete
                  ? "Store webhook, QuickBooks connection, and product mapping are ready."
                  : "Complete the remaining connection and mapping steps before testing a paid order."}
              </p>
            </div>
            <span className={`badge ${setupComplete ? "badge-success" : "badge-pending"}`}>
              {setupComplete ? "READY" : "SETUP"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 18 }}>
            <div className="card">
              <div className="section-kicker">SHOPIFY</div>
              <strong style={{ display: "block", marginTop: 8 }}>{status.shopify.domain || "Connected"}</strong>
              <span className={`badge ${status.shopify.webhookReady ? "badge-success" : "badge-pending"}`} style={{ marginTop: 10, display: "inline-block" }}>
                {status.shopify.webhookReady ? "Paid-order webhook ready" : "Webhook setup incomplete"}
              </span>
            </div>
            <div className="card">
              <div className="section-kicker">QUICKBOOKS</div>
              <strong style={{ display: "block", marginTop: 8 }}>
                {status.quickbooks.requiresReconnect ? "Reconnect required" : status.quickbooks.connected ? "Connected" : "Not connected"}
              </strong>
              {!status.quickbooks.connected && (
                <button className="btn btn-small" style={{ marginTop: 12 }} onClick={connectQuickBooks}>
                  {status.quickbooks.requiresReconnect ? "Reconnect QuickBooks" : "Connect QuickBooks"}
                </button>
              )}
            </div>
            <div className="card">
              <div className="section-kicker">PLAN</div>
              <strong style={{ display: "block", marginTop: 8 }}>{status.plan.label}</strong>
              <div style={{ color: "#6d7175", marginTop: 4 }}>{status.plan.used} / {status.plan.limit ?? "∞"} orders this period</div>
              {status.quickbooks.connected && status.mappings.count > 0 && <button className="btn btn-small" style={{ marginTop: 12 }} onClick={openBilling}>Manage Shopify plan</button>}
            </div>
            <div className="card">
              <div className="section-kicker">MAPPINGS</div>
              <strong style={{ display: "block", marginTop: 8 }}>{status.mappings.count} saved</strong>
              {status.quickbooks.connected && <button className="btn btn-secondary btn-small" style={{ marginTop: 12 }} onClick={loadCatalogs}>{catalogLoaded ? "Reload catalogs" : "Map products"}</button>}
            </div>
          </div>

          {catalogLoaded && (
            <div id="product-mappings" className="card" style={{ marginBottom: 18, scrollMarginTop: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ fontSize: 19 }}>Product mappings</h2>
                  <p style={{ color: "#6d7175", fontSize: 13, marginTop: 4 }}>Choose the QuickBooks item that corresponds to each Shopify variant you want SyncStock to process.</p>
                </div>
                <button className="btn" onClick={saveMappings} disabled={Boolean(busy) || (selectedCount === 0 && removeVariantIds.length === 0)}>Save mappings</button>
              </div>
              <div style={{ overflowX: "auto", marginTop: 16 }}>
                <table style={{ minWidth: 760 }}>
                  <thead><tr><th>Shopify variant</th><th>SKU</th><th>QuickBooks item</th></tr></thead>
                  <tbody>
                    {variants.map((variant) => (
                      <tr key={variant.id}>
                        <td>{variant.productTitle}{variant.title !== "Default Title" ? ` — ${variant.title}` : ""}</td>
                        <td>{variant.sku || "—"}</td>
                        <td>
                          <select
                            value={selections[variant.legacyResourceId] || ""}
                            onChange={(event) => setSelections((current) => ({ ...current, [variant.legacyResourceId]: event.target.value }))}
                          >
                            <option value="">Do not sync this variant</option>
                            {qboItems.map((item) => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ""}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 19 }}>Recent sync activity</h2>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#6d7175", fontSize: 13 }}>{status.adjustmentsNeedingReview} refund/cancellation events need review</span>
                <button className="btn btn-secondary btn-small" onClick={() => refreshStatus()} disabled={Boolean(busy)}>Refresh</button>
              </div>
            </div>
            {status.logs.length === 0 ? (
              <p style={{ color: "#6d7175", marginTop: 12 }}>No paid orders have been synced yet.</p>
            ) : (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table style={{ minWidth: 680 }}>
                  <thead><tr><th>Order</th><th>Status</th><th>Shopify</th><th>QuickBooks</th><th>When</th><th>Action</th></tr></thead>
                  <tbody>{status.logs.map((log) => {
                    const retryable = RETRYABLE_SYNC_STATUSES.has(log.status);
                    const presentation = syncStatusPresentation(log.status);
                    return (
                      <tr key={log.id}>
                        <td><strong>{log.orderNumber || "—"}</strong></td>
                        <td>
                          <span className={`badge ${presentation.className}`}>{presentation.label}</span>
                          {log.errorMessage && <div style={{ color: "#6d7175", fontSize: 12, lineHeight: 1.45, marginTop: 6, maxWidth: 360 }}>{log.errorMessage}</div>}
                        </td>
                        <td>{log.shopifyTotal || "—"}</td>
                        <td>{log.qboActualTotal || "—"}</td>
                        <td>{new Date(log.createdAt).toLocaleString()}</td>
                        <td>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {log.status === "skipped_no_mapping" && (
                              <button className="btn btn-secondary btn-small" onClick={resolveMissingMapping} disabled={Boolean(busy)}>
                                Map products
                              </button>
                            )}
                            {retryable && (
                              <button className="btn btn-secondary btn-small" onClick={() => retrySync(log.id)} disabled={Boolean(busy)}>
                                Retry
                              </button>
                            )}
                            {!retryable && log.status !== "success" && "—"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div></main>
  );
}
