import Footer from "@/components/Footer";

export default function NotFound() {
  return (
    <>
      <main className="container" style={{ minHeight: "72vh", paddingTop: 110, paddingBottom: 90, maxWidth: 780 }}>
        <div className="section-kicker">404 · NOT FOUND</div>
        <h1 style={{ fontSize: "clamp(42px, 7vw, 72px)", marginTop: 14 }}>That page is not part of the sync.</h1>
        <p style={{ color: "var(--paper-dim)", fontSize: 18, marginTop: 20, maxWidth: 640 }}>
          The link may be outdated. Return to SyncStock or open the setup documentation.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 30 }}>
          <a className="btn" href="/">Back to SyncStock</a>
          <a className="btn btn-secondary" href="/docs">Open docs</a>
        </div>
      </main>
      <Footer />
    </>
  );
}
