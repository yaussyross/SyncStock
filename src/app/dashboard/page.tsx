import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import ConnectPanel from "@/components/ConnectPanel";
import SyncLogTable from "@/components/SyncLogTable";

export default async function DashboardPage({ searchParams }: { searchParams: { webhook_error?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [shopifyConn, qboConn, logs] = await Promise.all([
    db.shopifyConnection.findUnique({ where: { userId: user.id } }),
    db.qboConnection.findUnique({ where: { userId: user.id } }),
    db.syncLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const quotaLimits: Record<string, number> = { trial: 20, starter: 200, growth: 1000, unlimited: Infinity };
  const limit = quotaLimits[user.planTier] ?? 20;
  const webhookFailed = searchParams.webhook_error === "1" || (shopifyConn && !shopifyConn.webhookId);

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <h1 style={{ fontSize: 26, marginBottom: 24 }}>Dashboard</h1>
      {webhookFailed && (
        <div className="card" style={{ background: "#2a1712", border: "1px solid #713f2e" }}>
          <strong>⚠ Shopify is connected, but automatic paid-order sync is not active yet.</strong>
          <p style={{ marginTop: 6, fontSize: 14 }}>Reconnect Shopify after confirming the app has order access. SyncStock will not silently pretend the webhook is active.</p>
        </div>
      )}
      <ConnectPanel shopifyConnected={!!shopifyConn} shopifyDomain={shopifyConn?.shopDomain} qboConnected={!!qboConn} />
      <div className="card">
        <strong>Plan: {user.planTier}</strong> — {user.orderQuotaUsed} / {limit === Infinity ? "∞" : limit} orders synced this period
        {user.planTier === "trial" && <div style={{ marginTop: 8 }}><a href="/dashboard/billing" className="btn">Upgrade plan</a></div>}
      </div>
      <h2 style={{ fontSize: 18, margin: "24px 0 12px" }}>Recent sync activity</h2>
      <SyncLogTable logs={logs} />
    </main>
  );
}
