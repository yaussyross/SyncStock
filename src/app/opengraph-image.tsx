import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "SyncStock — paid Shopify orders into clean QuickBooks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0e12",
          color: "#f1eee7",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 700 }}>
          <span>Sync</span><span style={{ color: "#f0c652" }}>Stock</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1000 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.02 }}>
            Paid orders in. Clean QuickBooks out.
          </div>
          <div style={{ fontSize: 28, color: "#a7a39b", lineHeight: 1.35 }}>
            Product mapping, reconciliation checks, duplicate protection, and visible sync history.
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 20, color: "#83d093" }}>
          <span>20 free orders</span><span>•</span><span>No card to test</span><span>•</span><span>Shopify → QuickBooks Online</span>
        </div>
      </div>
    ),
    size
  );
}
