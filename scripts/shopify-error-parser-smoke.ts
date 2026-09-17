function shopifyErrorMessage(payload: any, status: number) {
  const errors = payload?.errors;
  if (Array.isArray(errors)) {
    const messages = errors
      .map((error: any) => typeof error === "string" ? error : error?.message)
      .filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  if (typeof errors === "string" && errors.trim()) return errors.trim();
  if (errors && typeof errors === "object") {
    const messages = Object.entries(errors).flatMap(([field, value]) => {
      if (Array.isArray(value)) return value.map((item) => `${field}: ${String(item)}`);
      if (value != null) return [`${field}: ${String(value)}`];
      return [];
    });
    if (messages.length) return messages.join("; ");
  }
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
  return `Shopify returned ${status}`;
}

function expect(actual: string, expected: string) {
  if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

expect(shopifyErrorMessage({ errors: [{ message: "GraphQL failed" }] }, 200), "GraphQL failed");
expect(shopifyErrorMessage({ errors: "Invalid API key or access token" }, 401), "Invalid API key or access token");
expect(shopifyErrorMessage({ errors: { query: ["is invalid"] } }, 400), "query: is invalid");
expect(shopifyErrorMessage({ error: "invalid_request" }, 400), "invalid_request");
expect(shopifyErrorMessage(null, 502), "Shopify returned 502");

console.log("Shopify error parser smoke test passed");
