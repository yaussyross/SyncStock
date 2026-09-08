"use client";

import { useEffect, useMemo, useState } from "react";

interface ShopifyVariant {
  id: string;
  legacyResourceId: string;
  title: string;
  sku: string | null;
  price: string;
  productId: string;
  productTitle: string;
  productStatus: string;
}

interface QboItem {
  id: string;
  name: string;
  sku: string | null;
  type: string | null;
}

interface ProductMapping {
  id: string;
  shopifyVariantId: string;
  shopifySku: string | null;
  shopifyTitle: string | null;
  qboItemId: string;
  qboItemName: string | null;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

async function responseJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed with ${response.status}`);
  return body;
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

export default function ProductMappingWorkspace({
  shopifyConnected,
  qboConnected,
}: {
  shopifyConnected: boolean;
  qboConnected: boolean;
}) {
  const [variants, setVariants] = useState<ShopifyVariant[]>([]);
  const [items, setItems] = useState<QboItem[]>([]);
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pageInfo, setPageInfo] = useState<PageInfo>({ hasNextPage: false, endCursor: null });
  const [loading, setLoading] = useState(shopifyConnected && qboConnected);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "mapped" | "unmapped">("all");
  const [qboTruncated, setQboTruncated] = useState(false);

  const mappingByVariantId = useMemo(
    () => new Map(mappings.map((mapping) => [mapping.shopifyVariantId, mapping])),
    [mappings]
  );

  const itemBySku = useMemo(() => {
    const map = new Map<string, QboItem>();
    for (const item of items) {
      const sku = normalize(item.sku);
      if (sku && !map.has(sku)) map.set(sku, item);
    }
    return map;
  }, [items]);

  function seedDrafts(nextVariants: ShopifyVariant[], nextItems: QboItem[], nextMappings: ProductMapping[]) {
    const mappingMap = new Map(nextMappings.map((mapping) => [mapping.shopifyVariantId, mapping]));
    const skuMap = new Map<string, QboItem>();
    for (const item of nextItems) {
      const sku = normalize(item.sku);
      if (sku && !skuMap.has(sku)) skuMap.set(sku, item);
    }

    setDrafts((previous) => {
      const next = { ...previous };
      for (const variant of nextVariants) {
        const key = variant.legacyResourceId;
        if (key in next) continue;
        const existing = mappingMap.get(key);
        const suggestion = variant.sku ? skuMap.get(normalize(variant.sku)) : undefined;
        next[key] = existing?.qboItemId || suggestion?.id || "";
      }
      return next;
    });
  }

  useEffect(() => {
    if (!shopifyConnected || !qboConnected) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [shopifyData, qboData, mappingData] = await Promise.all([
          fetch("/api/catalog/shopify", { cache: "no-store" }).then(responseJson),
          fetch("/api/catalog/qbo", { cache: "no-store" }).then(responseJson),
          fetch("/api/mappings", { cache: "no-store" }).then(responseJson),
        ]);
        if (cancelled) return;

        const nextVariants = shopifyData.variants as ShopifyVariant[];
        const nextItems = qboData.items as QboItem[];
        const nextMappings = (mappingData.mappings as ProductMapping[]).filter(
          (mapping) => !mapping.shopifyVariantId.startsWith("legacy:")
        );

        setVariants(nextVariants);
        setItems(nextItems);
        setMappings(nextMappings);
        setPageInfo(shopifyData.pageInfo);
        setQboTruncated(Boolean(qboData.truncated));
        seedDrafts(nextVariants, nextItems, nextMappings);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Could not load product catalogs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopifyConnected, qboConnected]);

  const mappedCount = variants.filter((variant) => mappingByVariantId.has(variant.legacyResourceId)).length;
  const dirtyVariants = variants.filter((variant) => {
    const current = mappingByVariantId.get(variant.legacyResourceId)?.qboItemId || "";
    return current !== (drafts[variant.legacyResourceId] || "");
  });

  const visibleVariants = variants.filter((variant) => {
    const haystack = normalize(`${variant.productTitle} ${variant.title} ${variant.sku || ""}`);
    if (search && !haystack.includes(normalize(search))) return false;
    const isMapped = mappingByVariantId.has(variant.legacyResourceId);
    if (filter === "mapped" && !isMapped) return false;
    if (filter === "unmapped" && isMapped) return false;
    return true;
  });

  async function loadMore() {
    if (!pageInfo.hasNextPage || !pageInfo.endCursor) return;
    try {
      setLoadingMore(true);
      setError(null);
      const response = await fetch(`/api/catalog/shopify?after=${encodeURIComponent(pageInfo.endCursor)}`, {
        cache: "no-store",
      });
      const data = await responseJson(response);
      const newVariants = data.variants as ShopifyVariant[];
      setVariants((current) => [...current, ...newVariants]);
      setPageInfo(data.pageInfo);
      seedDrafts(newVariants, items, mappings);
    } catch (err: any) {
      setError(err?.message || "Could not load more Shopify variants");
    } finally {
      setLoadingMore(false);
    }
  }

  async function saveChanges() {
    if (dirtyVariants.length === 0) return;

    const upserts = dirtyVariants.flatMap((variant) => {
      const qboItemId = drafts[variant.legacyResourceId] || "";
      if (!qboItemId) return [];
      const item = items.find((candidate) => candidate.id === qboItemId);
      if (!item) return [];
      return [{
        shopifyVariantId: variant.legacyResourceId,
        shopifySku: variant.sku,
        shopifyTitle: variant.title === "Default Title" ? variant.productTitle : `${variant.productTitle} — ${variant.title}`,
        qboItemId: item.id,
        qboItemName: item.name,
      }];
    });

    const removeVariantIds = dirtyVariants
      .filter((variant) => !(drafts[variant.legacyResourceId] || ""))
      .map((variant) => variant.legacyResourceId);

    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const response = await fetch("/api/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: upserts, removeVariantIds }),
      });
      const data = await responseJson(response);
      const nextMappings = (data.mappings as ProductMapping[]).filter(
        (mapping) => !mapping.shopifyVariantId.startsWith("legacy:")
      );
      setMappings(nextMappings);
      setNotice(`Saved ${dirtyVariants.length} mapping change${dirtyVariants.length === 1 ? "" : "s"}.`);
    } catch (err: any) {
      setError(err?.message || "Could not save product mappings");
    } finally {
      setSaving(false);
    }
  }

  if (!shopifyConnected || !qboConnected) {
    return (
      <div className="card">
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Connect both systems first</h2>
        <p style={{ color: "var(--paper-dim)", marginBottom: 16 }}>
          Product mapping needs access to both your Shopify variants and QuickBooks Online items.
        </p>
        <a href="/dashboard" className="btn">Back to connections</a>
      </div>
    );
  }

  if (loading) {
    return <div className="card">Loading Shopify variants and QuickBooks items…</div>;
  }

  return (
    <>
      {error && (
        <div className="card" style={{ borderColor: "#713f2e", background: "#2a1712" }}>
          <strong>Could not complete that mapping action.</strong>
          <div style={{ marginTop: 6, color: "#e6b09a" }}>{error}</div>
        </div>
      )}
      {notice && (
        <div className="card" style={{ borderColor: "#365b43", background: "#122219" }}>
          {notice} Return to the dashboard to retry any orders that were waiting on mappings.
        </div>
      )}
      {qboTruncated && (
        <div className="card" style={{ borderColor: "#6c5a2e" }}>
          Your QuickBooks company returned at least 1,000 active items. Mapping currently shows the first 1,000; catalog search pagination is a follow-up hardening item.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
        <div className="card" style={{ marginBottom: 0 }}><div className="mono" style={{ color: "var(--paper-dim)", fontSize: 11 }}>LOADED VARIANTS</div><strong style={{ fontSize: 28 }}>{variants.length}</strong></div>
        <div className="card" style={{ marginBottom: 0 }}><div className="mono" style={{ color: "var(--paper-dim)", fontSize: 11 }}>MAPPED</div><strong style={{ fontSize: 28 }}>{mappedCount}</strong></div>
        <div className="card" style={{ marginBottom: 0 }}><div className="mono" style={{ color: "var(--paper-dim)", fontSize: 11 }}>UNMAPPED</div><strong style={{ fontSize: 28 }}>{Math.max(variants.length - mappedCount, 0)}</strong></div>
        <div className="card" style={{ marginBottom: 0 }}><div className="mono" style={{ color: "var(--paper-dim)", fontSize: 11 }}>UNSAVED CHANGES</div><strong style={{ fontSize: 28 }}>{dirtyVariants.length}</strong></div>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 10, flex: "1 1 520px", flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Shopify product, variant, or SKU"
              style={{ minWidth: 240, flex: "1 1 320px" }}
            />
            <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} style={{ width: 170 }}>
              <option value="all">All variants</option>
              <option value="unmapped">Unmapped</option>
              <option value="mapped">Mapped</option>
            </select>
          </div>
          <button className="btn" onClick={saveChanges} disabled={saving || dirtyVariants.length === 0} style={{ opacity: saving || dirtyVariants.length === 0 ? 0.55 : 1 }}>
            {saving ? "Saving…" : `Save changes${dirtyVariants.length ? ` (${dirtyVariants.length})` : ""}`}
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 880 }}>
            <thead>
              <tr>
                <th>Shopify product</th>
                <th>Variant</th>
                <th>SKU</th>
                <th>QuickBooks item</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleVariants.map((variant) => {
                const key = variant.legacyResourceId;
                const existing = mappingByVariantId.get(key);
                const selectedId = drafts[key] || "";
                const suggestion = variant.sku ? itemBySku.get(normalize(variant.sku)) : undefined;
                const dirty = (existing?.qboItemId || "") !== selectedId;
                const status = existing ? (dirty ? "changed" : "mapped") : selectedId ? "suggested" : "unmapped";

                return (
                  <tr key={key}>
                    <td>
                      <strong>{variant.productTitle}</strong>
                      <div className="mono" style={{ color: "var(--paper-dim)", fontSize: 10, marginTop: 3 }}>#{key}</div>
                    </td>
                    <td>{variant.title === "Default Title" ? "Default" : variant.title}</td>
                    <td className="mono" style={{ color: variant.sku ? "var(--paper)" : "var(--paper-dim)" }}>{variant.sku || "No SKU"}</td>
                    <td style={{ minWidth: 330 }}>
                      <select
                        value={selectedId}
                        onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                      >
                        <option value="">— Do not map —</option>
                        {items.map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name}{item.sku ? ` · SKU ${item.sku}` : ""}{item.type ? ` · ${item.type}` : ""}
                          </option>
                        ))}
                      </select>
                      {!existing && suggestion && selectedId === suggestion.id && (
                        <div style={{ color: "var(--gold-bright)", fontSize: 11, marginTop: 5 }}>Suggested from exact SKU match</div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${status === "mapped" ? "badge-success" : status === "unmapped" ? "badge-failed" : "badge-pending"}`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {visibleVariants.length === 0 && (
                <tr><td colSpan={5} style={{ color: "var(--paper-dim)", padding: 28, textAlign: "center" }}>No Shopify variants match this view.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {pageInfo.hasNextPage && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load 100 more Shopify variants"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
