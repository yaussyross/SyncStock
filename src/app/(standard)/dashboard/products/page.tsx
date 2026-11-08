import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import ProductMappingWorkspace from "@/components/ProductMappingWorkspace";

export default async function ProductMappingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [shopifyConnection, qboConnection] = await Promise.all([
    db.shopifyConnection.findUnique({ where: { userId: user.id }, select: { id: true } }),
    db.qboConnection.findUnique({ where: { userId: user.id }, select: { id: true } }),
  ]);

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 26 }}>
        <div>
          <a href="/dashboard" className="text-link" style={{ display: "inline-block", marginBottom: 12 }}>← Dashboard</a>
          <div className="section-kicker">PRODUCT MAPPINGS</div>
          <h1 style={{ fontSize: 34, marginTop: 8 }}>Tell SyncStock where each Shopify variant belongs.</h1>
          <p style={{ color: "var(--paper-dim)", maxWidth: 720, marginTop: 12 }}>
            Mappings are stored by Shopify variant ID, so they keep working even when a SKU is blank or later changes. Exact SKU matches are suggested for speed, but nothing reaches QuickBooks until you save the mapping.
          </p>
        </div>
        <a href="/dashboard" className="btn btn-secondary">Back to sync activity</a>
      </div>

      <ProductMappingWorkspace
        shopifyConnected={Boolean(shopifyConnection)}
        qboConnected={Boolean(qboConnection)}
      />
    </main>
  );
}
