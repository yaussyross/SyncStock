"use client";

interface LogRow {
  id: string;
  orderNumber: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
}

const badgeClass: Record<string, string> = {
  success: "badge-success",
  pending: "badge-pending",
  failed: "badge-failed",
  skipped_no_mapping: "badge-failed",
  skipped_quota_exceeded: "badge-failed",
};

export default function SyncLogTable({ logs }: { logs: LogRow[] }) {
  async function retry(id: string) {
    const response = await fetch("/api/sync/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncLogId: id }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      window.alert(body.error || "Could not retry this order");
      return;
    }

    window.location.reload();
  }

  if (logs.length === 0) {
    return <p style={{ color: "#888" }}>No orders synced yet. New paid Shopify orders will appear here automatically.</p>;
  }

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table style={{ minWidth: 820 }}>
        <thead>
          <tr>
            <th>Order</th>
            <th>Status</th>
            <th>Details</th>
            <th>When</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{log.orderNumber || "—"}</td>
              <td>
                <span className={`badge ${badgeClass[log.status] || "badge-pending"}`}>
                  {log.status.replace(/_/g, " ")}
                </span>
              </td>
              <td style={{ color: "#888", fontSize: 13 }}>{log.errorMessage || "—"}</td>
              <td style={{ color: "#888", fontSize: 13 }}>
                {new Date(log.createdAt).toLocaleString()}
              </td>
              <td>
                {log.status === "skipped_no_mapping" ? (
                  <a href="/dashboard/products" className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 13 }}>
                    Map products
                  </a>
                ) : log.status === "failed" ? (
                  <button onClick={() => retry(log.id)} className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 13 }}>
                    Retry
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
