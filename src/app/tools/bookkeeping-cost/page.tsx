import type { Metadata } from "next";
import BookkeepingCalculator from "@/components/BookkeepingCalculator";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Shopify bookkeeping cost calculator | SyncStock",
  description: "Estimate the time you spend entering Shopify orders and compare its value with SyncStock's planned subscription pricing. Free, no sign-in required.",
};

export default function BookkeepingCostPage() {
  return <>
    <main className="container section">
      <a className="wordmark" href="/">Sync<span>Stock</span></a>
      <section style={{ marginTop: 48, marginBottom: 32, maxWidth: 780 }}>
        <p className="section-kicker">FREE TOOL · NO SIGN-IN</p>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 60px)" }}>What is copying orders costing you?</h1>
        <p className="lede">Put a number on manual Shopify order entry. Adjust the assumptions to see whether automating part of the work could be worthwhile.</p>
      </section>
      <BookkeepingCalculator />
      <section className="section" style={{ maxWidth: 800 }}>
        <h2>How the estimate works</h2>
        <p>Monthly hours = orders × minutes per order ÷ 60. Potential time recovered = monthly hours × the percentage you enter. We multiply that time by your hourly value, then subtract the plan price for your order volume.</p>
        <p>The calculator runs in your browser and does not ask for store or customer data. It does not inspect your books, validate your accounting, or predict product performance.</p>
      </section>
    </main>
    <Footer />
  </>;
}
