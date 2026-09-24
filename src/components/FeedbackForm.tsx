"use client";

import { FormEvent, useMemo, useState } from "react";

const categories = [
  ["feedback", "General feedback"],
  ["bug", "Something broke"],
  ["feature", "Feature request"],
  ["onboarding", "Onboarding"],
  ["billing", "Billing"],
] as const;

export default function FeedbackForm() {
  const [category, setCategory] = useState("feedback");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const remaining = useMemo(() => 2000 - message.length, [message]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError("");

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          rating,
          message,
          page: window.location.pathname,
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Could not send feedback.");
      setMessage("");
      setRating(null);
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error && err.name !== "AbortError" ? err.message : "The request timed out. Please try again.");
    }
  }

  return (
    <form className="feedback-form" onSubmit={submit}>
      <div className="feedback-grid">
        <label>
          <span>What is this about?</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <div>
          <span className="feedback-label">How is SyncStock feeling?</span>
          <div className="rating-row" aria-label="Rating from 1 to 5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                type="button"
                key={value}
                aria-label={`${value} out of 5`}
                aria-pressed={rating === value}
                className={rating === value ? "rating-button selected" : "rating-button"}
                onClick={() => setRating(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="feedback-message">
        <span>Tell us what happened, what you expected, or what would make the product better.</span>
        <textarea
          required
          minLength={3}
          maxLength={2000}
          rows={7}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Example: Mapping products was clear, but I wanted a bulk-select option..."
        />
      </label>
      <div className="feedback-actions">
        <span className="feedback-count">{remaining} characters left</span>
        <button className="btn" type="submit" disabled={status === "sending" || message.trim().length < 3}>
          {status === "sending" ? "Sending…" : "Send feedback"}
        </button>
      </div>
      {status === "sent" && <p className="feedback-success">Received. Thank you — this goes directly into the SyncStock feedback queue.</p>}
      {status === "error" && <p className="feedback-error">{error}</p>}
    </form>
  );
}
