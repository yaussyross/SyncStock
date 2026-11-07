import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";

export default async function PrivacyRequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const requests = await db.complianceRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <a href="/dashboard" className="text-link">← Dashboard</a>
      <p className="section-kicker" style={{ marginTop: 24 }}>SHOPIFY PRIVACY</p>
      <h1 style={{ fontSize: 30, marginTop: 8, marginBottom: 8 }}>Privacy requests</h1>
      <p style={{ color: "var(--paper-dim)", marginBottom: 28, maxWidth: 720 }}>
        SyncStock does not store Shopify customer profiles. This page records mandatory Shopify privacy requests and the order-sync metadata that was returned or deleted in response.
      </p>

      {requests.length === 0 ? (
        <div className="card"><p style={{ color: "var(--paper-dim)" }}>No Shopify privacy requests have been received.</p></div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 820 }}>
            <thead><tr><th>Type</th><th>Status</th><th>Received</th><th>Result</th></tr></thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td>{request.kind.replace(/_/g, " ")}</td>
                  <td><span className="badge badge-success">{request.status}</span></td>
                  <td style={{ color: "var(--paper-dim)", fontSize: 13 }}>{request.createdAt.toLocaleString()}</td>
                  <td style={{ color: "var(--paper-dim)", fontSize: 12, maxWidth: 460, whiteSpace: "pre-wrap" }}>
                    {request.response ? JSON.stringify(request.response, null, 2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
