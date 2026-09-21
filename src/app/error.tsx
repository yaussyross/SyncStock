"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="container" style={{ minHeight: "72vh", paddingTop: 110, paddingBottom: 90, maxWidth: 780 }}>
      <div className="section-kicker">SYNCSTOCK · RECOVERY</div>
      <h1 style={{ fontSize: "clamp(38px, 6vw, 64px)", marginTop: 14 }}>Something did not load cleanly.</h1>
      <p style={{ color: "var(--paper-dim)", fontSize: 17, marginTop: 20, maxWidth: 640 }}>
        No accounting action is taken from this error screen. Retry the page; if the problem persists, use Support.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 30 }}>
        <button className="btn" onClick={() => reset()}>Try again</button>
        <a className="btn btn-secondary" href="/support">Support</a>
      </div>
    </main>
  );
}
