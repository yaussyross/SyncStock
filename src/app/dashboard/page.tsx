import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import ConnectPanel from "@/components/ConnectPanel";
import SyncLogTable from "@/components/SyncLogTable";

export default async function DashboardPage({ searchParams }: { searchParams: { webhook_error?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [shopifyConn, qboConn, logs, mappingCount] = await Promise.all([
    db.shopifyConnection.findUnique({ where: { userId: user.id } }),
    db.qboConnection.findUnique({ where: { userId: user.id } }),
    db.syncLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.productMapping.count({ where: { userId: user.id } }),
  ]);

  const quotaLimits: Record<string, number> = { trial: 20, starter: 200, growth: 1000, unlimited: Infinity };
  const limit = quotaLimits[user.planTier] ?? 20;
  const webhookFailed = searchParams.webhook_error === "1" || (shopifyConn && !shopifyConn.webhookId);
  const readyForMappings = Boolean(shopifyConn && qboConn);

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <h1 style={{ fontSize: 26 }}>Dashboard</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="/dashboard/products" className="btn btn-secondary">Product mappings</a>
          <a href="/dashboard/billing" className="btn btn-secondary">Billing</a>
        </div>
      </div>

      {webhookFailed && (
        <div className="card" style={{ background: "#2a1712", border: "1px solid #713f2e" }}>
          <strong>⚠ Shopify is connected, but automatic paid-order sync is not active yet.</strong>
          <p style={{ marginTop: 6, fontSize: 14 }}>Reconnect Shopify after confirming the app has order access. SyncStock will not silently pretend the webhook is active.</p>
        </div>
      )}

      <ConnectPanel shopifyConnected={!!shopifyConn} shopifyDomain={shopifyConn?.shopDomain} qboConnected={!!qboConn} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <div className="card">
          <div className="section-kicker">PLAN</div>
          <strong style={{ display: "block", fontSize: 20, marginTop: 8 }}>{user.planTier}</strong>
          <div style={{ color: "var(--paper-dim)", marginTop: 4 }}>{user.orderQuotaUsed} / {limit === Infinity ? "∞" : limit} orders synced this period</div>
          {user.planTier === "trial" && <div style={{ marginTop: 14 }}><a href="/dashboard/billing" className="btn btn-small">Upgrade plan</a></div>}
        </div>

        <div className="card">
          <div className="section-kicker">PRODUCT MAPPINGS</div>
          <strong style={{ display: "block", fontSize: 20, marginTop: 8 }}>{mappingCount} saved</strong>
          <div style={{ color: "var(--paper-dim)", marginTop: 4 }}>
            {readyForMappings ? "Map Shopify variants to QuickBooks items before live orders arrive." : "Connect Shopify and QuickBooks to load both catalogs."}
          </div>
          <div style={{ marginTop: 14 }}>
            <a href="/dashboard/products" className={`btn ${readyForMappings ? "" : "btn-secondary"} btn-small`}>
              {mappingCount ? "Manage mappings" : "Set up mappings"}
            </a>
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: 18, margin: "24px 0 12px" }}>Recent sync activity</h2>
      <SyncLogTable logs={logs} />
    </main>
  );
}
