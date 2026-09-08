"use client";

import { useEffect, useMemo, useState } from "react";

type QboItem = { id: string; name: string; sku: string | null; type: string | null };
type Settings = {
  shippingQboItemId: string | null;
  tipsQboItemId: string | null;
  dutiesQboItemId: string | null;
  additionalFeeQboItemId: string | null;
};

const emptySettings: Settings = {
  shippingQboItemId: null,
  tipsQboItemId: null,
  dutiesQboItemId: null,
  additionalFeeQboItemId: null,
};

const rows = [
  {
    key: "shippingQboItemId" as const,
    label: "Shipping income",
    description: "Used when Shopify charges shipping. Choose the QuickBooks item whose linked account should receive shipping revenue.",
  },
  {
    key: "tipsQboItemId" as const,
    label: "Tips",
    description: "Used when a paid Shopify order includes a tip. Choose the QBO item/accounting treatment you want SyncStock to post to.",
  },
  {
    key: "dutiesQboItemId" as const,
    label: "Duties / import charges",
    description: "Used only when Shopify reports duties. Pick a QBO item configured to the account your accountant wants.",
  },
  {
    key: "additionalFeeQboItemId" as const,
    label: "Additional fees",
    description: "Used for other Shopify order fees. SyncStock will block the order if fees exist and this is not configured.",
  },
];

export default function AccountingSettingsPage() {
  const [items, setItems] = useState<QboItem[]>([]);
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/catalog/qbo", { cache: "no-store" }).then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not load QuickBooks items");
        return body.items as QboItem[];
      }),
      fetch("/api/accounting-settings", { cache: "no-store" }).then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not load accounting settings");
        return body.settings as Settings;
      }),
    ])
      .then(([qboItems, current]) => {
        setItems(qboItems);
        setSettings({ ...emptySettings, ...current });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => `${item.name} ${item.sku || ""} ${item.type || ""}`.toLowerCase().includes(term));
  }, [items, search]);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    const res = await fetch("/api/accounting-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Could not save accounting settings");
    else setMessage("Accounting settings saved.");
    setSaving(false);
  }

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <a href="/dashboard" className="text-link">← Dashboard</a>
      <p className="section-kicker" style={{ marginTop: 24 }}>ACCOUNTING CONTROL</p>
      <h1 style={{ fontSize: 30, marginTop: 8, marginBottom: 8 }}>Order adjustments</h1>
      <p style={{ color: "var(--paper-dim)", maxWidth: 760, marginBottom: 18 }}>
        Product variants already map individually. These settings tell SyncStock where non-product Shopify charges belong in QuickBooks. Discounts are represented as a native transaction discount and do not need a separate item.
      </p>
      <div className="card" style={{ marginBottom: 20 }}>
        <strong>Safety rule</strong>
        <p style={{ color: "var(--paper-dim)", marginTop: 6, fontSize: 14 }}>
          If an order contains shipping, tips, duties, or fees and its matching QuickBooks item is not configured, SyncStock blocks the transaction before it reaches your books.
        </p>
      </div>

      {loading ? (
        <div className="card">Loading QuickBooks accounting items…</div>
      ) : error && items.length === 0 ? (
        <div className="card" style={{ borderColor: "#713f2e" }}><strong>Could not load settings</strong><p style={{ marginTop: 6 }}>{error}</p></div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Filter QuickBooks items</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, SKU, or type" />
            </label>
          </div>

          <div className="ledger" style={{ borderTop: "none", paddingTop: 0 }}>
            {rows.map((row) => (
              <div className="ledger-row" key={row.key} style={{ alignItems: "flex-start", gap: 20 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="plan-name">{row.label}</div>
                  <div className="plan-desc" style={{ maxWidth: 560 }}>{row.description}</div>
                </div>
                <select
                  value={settings[row.key] || ""}
                  onChange={(e) => setSettings((current) => ({ ...current, [row.key]: e.target.value || null }))}
                  style={{ minWidth: 280, maxWidth: 380 }}
                >
                  <option value="">Not configured — block these orders</option>
                  {visibleItems.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}{item.sku ? ` · ${item.sku}` : ""}{item.type ? ` · ${item.type}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {message && <p style={{ marginTop: 16 }}>{message}</p>}
          {error && <p role="alert" style={{ color: "#e37a4e", marginTop: 16 }}>{error}</p>}
          <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
            <button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save accounting settings"}</button>
            <span style={{ color: "var(--paper-dim)", fontSize: 13 }}>Changes affect new sync attempts and manual retries.</span>
          </div>
        </>
      )}
    </main>
  );
}
