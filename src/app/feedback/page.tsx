import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import FeedbackForm from "@/components/FeedbackForm";
import Footer from "@/components/Footer";

export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/feedback");

  return (
    <>
      <main className="container feedback-page">
        <a className="wordmark feedback-wordmark" href="/" aria-label="SyncStock home">Sync<span>Stock</span></a>
        <section className="feedback-shell">
          <div className="feedback-copy">
            <p className="section-kicker">FOUNDING BETA FEEDBACK</p>
            <h1>Tell us what slows you down.</h1>
            <p>
              Bugs, confusing setup, missing controls, ugly details — send it. Beta feedback is reviewed as product input, not buried in a generic support inbox.
            </p>
            <div className="feedback-promise">
              <span>01</span><p><strong>Specific beats polite.</strong><br />Screens, steps, expected behavior, and friction are useful.</p>
              <span>02</span><p><strong>Accounting correctness wins.</strong><br />Anything that risks a wrong or duplicate transaction gets priority.</p>
              <span>03</span><p><strong>No fake roadmap promises.</strong><br />Requests are reviewed against the core Shopify → QuickBooks workflow.</p>
            </div>
          </div>
          <div className="feedback-card">
            <FeedbackForm />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
