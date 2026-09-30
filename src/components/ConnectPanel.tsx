"use client";

export default function ConnectPanel({
  shopifyConnected,
  shopifyDomain,
  qboConnected,
}: {
  shopifyConnected: boolean;
  shopifyDomain?: string;
  qboConnected: boolean;
}) {
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
          <div style={{ marginTop: 10 }}>
            <p style={{ marginBottom: 8 }}>Open SyncStock from Apps in Shopify Admin to connect your store.</p>
            <a href="https://admin.shopify.com" className="btn">
              Open Shopify Admin
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
