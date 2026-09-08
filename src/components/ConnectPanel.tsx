"use client";
import { useState } from "react";

export default function ConnectPanel({
  shopifyConnected,
  shopifyDomain,
  qboConnected,
}: {
  shopifyConnected: boolean;
  shopifyDomain?: string;
  qboConnected: boolean;
}) {
  const [shop, setShop] = useState("");

  return (
    <div className="card">
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Connections</h2>

      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #eee" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Shopify</span>
          {shopifyConnected ? (
            <span className="badge badge-success">Connected: {shopifyDomain}</span>
          ) : (
            <span className="badge badge-pending">Not connected</span>
          )}
        </div>
        {!shopifyConnected && (
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <input
              placeholder="your-store.myshopify.com"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
            />
            <a href={`/api/auth/shopify?shop=${encodeURIComponent(shop)}`} className="btn">
              Connect
            </a>
          </div>
        )}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>QuickBooks Online</span>
          {qboConnected ? (
            <span className="badge badge-success">Connected</span>
          ) : (
            <span className="badge badge-pending">Not connected</span>
          )}
        </div>
        {!qboConnected && (
          <a href="/api/auth/qbo" className="btn" style={{ marginTop: 10, display: "inline-block" }}>
            Connect QuickBooks
          </a>
        )}
      </div>
    </div>
  );
}
