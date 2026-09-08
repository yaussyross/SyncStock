import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PLAN_LABELS, PLAN_LIMITS, isSubscriptionActive } from "@/lib/plans";
import { redirect } from "next/navigation";
import ConnectPanel from "@/components/ConnectPanel";
import SyncLogTable from "@/components/SyncLogTable";
import LogoutButton from "@/components/LogoutButton";

export default async function DashboardPage({ searchParams }: { searchParams: { webhook_error?: string; lifecycle_warning?: string; billing?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [shopifyConn, qboConn, logs, mappingCount, adjustments] = await Promise.all([
    db.shopifyConnection.findUnique({ where: { userId: user.id } }),
    db.qboConnection.findUnique({ where: { userId: user.id } }),
    db.syncLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.productMapping.count({ where: { userId: user.id } }),
    db.orderAdjustment.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  const limit = PLAN_LIMITS[user.planTier] ?? PLAN_LIMITS.trial;
  const webhookFailed = searchParams.webhook_error === "1" || Boolean(shopifyConn && !shopifyConn.webhookId);
  const lifecycleMissing = searchParams.lifecycle_warning === "1" || Boolean(
    shopifyConn && (!shopifyConn.refundWebhookId || !shopifyConn.cancelledWebhookId || !shopifyConn.uninstallWebhookId)
  );
  const readyForMappings = Boolean(shopifyConn && qboConn);
  const paidPlan = user.planTier !== "trial";
  const billingHealthy = !paidPlan || isSubscriptionActive(user.subscriptionStatus);

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <div className="section-kicker">SYNCSTOCK</div>
          <h1 style={{ fontSize: 26, marginTop: 5 }}>Dashboard</h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="/dashboard/products" className="btn btn-secondary">Product mappings</a>
          <a href="/dashboard/billing" className="btn btn-secondary">Billing</a>
          <LogoutButton />
        </div>
      </div>

      {searchParams.billing === "success" && (
        <div className="card" style={{ borderColor: "rgba(131, 208, 147, 0.35)" }}>
          <strong>Billing checkout completed.</strong>
          <p style={{ marginTop: 6, fontSize: 14, color: "var(--paper-dim)" }}>Stripe is confirming the subscription. Your plan updates automatically from signed Stripe webhooks.</p>
        </div>
      )}

      {webhookFailed && (
        <div className="card" style={{ background: "#2a1712", border: "1px solid #713f2e" }}>
          <strong>⚠ Shopify is connected, but automatic paid-order sync is not active.</strong>
          <p style={{ marginTop: 6, fontSize: 14 }}>Reconnect Shopify after confirming the app has order access. SyncStock will not silently pretend the webhook is active.</p>
        </div>
      )}

      {lifecycleMissing && shopifyConn && (
        <div className="card" style={{ background: "#241f12", border: "1px solid #6c5a2e" }}>
          <strong>⚠ Refund/cancellation monitoring is incomplete.</strong>
          <p style={{ marginTop: 6, fontSize: 14 }}>Reconnect Shopify so SyncStock can register refund, cancellation, and uninstall lifecycle webhooks.</p>
        </div>
      )}

      {!billingHealthy && (
        <div className="card" style={{ background: "#2a1712", border: "1px solid #713f2e" }}>
          <strong>⚠ Sync is paused because billing is {user.subscriptionStatus}.</strong>
          <p style={{ marginTop: 6, fontSize: 14 }}>Update your payment method or subscription in Billing before new paid orders can sync.</p>
        </div>
      )}

      <ConnectPanel shopifyConnected={!!shopifyConn} shopifyDomain={shopifyConn?.shopDomain} qboConnected={!!qboConn} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <div className="card">
          <div className="section-kicker">PLAN</div>
          <strong style={{ display: "block", fontSize: 20, marginTop: 8 }}>{PLAN_LABELS[user.planTier] ?? user.planTier}</strong>
          <div style={{ color: "var(--paper-dim)", marginTop: 4 }}>{user.orderQuotaUsed} / {limit === Infinity ? "∞" : limit} orders synced this billing period</div>
          {paidPlan && user.quotaPeriodEnd && (
            <div style={{ color: "var(--paper-dim)", marginTop: 4, fontSize: 13 }}>Current period ends {user.quotaPeriodEnd.toLocaleDateString()}</div>
          )}
          <div style={{ marginTop: 14 }}><a href="/dashboard/billing" className="btn btn-small">{user.planTier === "trial" ? "Upgrade plan" : "Manage billing"}</a></div>
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

        <div className="card">
          <div className="section-kicker">ADJUSTMENTS</div>
          <strong style={{ display: "block", fontSize: 20, marginTop: 8 }}>{adjustments.filter((item) => item.status === "needs_review").length} need review</strong>
          <div style={{ color: "var(--paper-dim)", marginTop: 4 }}>Refunds and cancellations are captured immediately and kept out of QuickBooks until their accounting treatment is confirmed.</div>
        </div>
      </div>

      {adjustments.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, margin: "24px 0 12px" }}>Refunds & cancellations</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 720 }}>
              <thead><tr><th>Order</th><th>Type</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {adjustments.map((item) => (
                  <tr key={item.id}>
                    <td>{item.orderNumber || item.shopifyOrderId}</td>
                    <td>{item.kind}</td>
                    <td>{item.amount ? `${item.currency || ""} ${item.amount}`.trim() : "—"}</td>
                    <td><span className="badge badge-pending">{item.status.replace(/_/g, " ")}</span></td>
                    <td style={{ color: "var(--paper-dim)", fontSize: 13 }}>{item.createdAt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 style={{ fontSize: 18, margin: "24px 0 12px" }}>Recent sync activity</h2>
      <SyncLogTable logs={logs} />
    </main>
  );
}
