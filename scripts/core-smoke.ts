import assert from "node:assert/strict";

async function main() {
  process.env.ENCRYPTION_KEY = "syncstock-ci-encryption-key-that-is-long-enough";

  const { hashPassword, verifyPassword } = await import("../src/lib/password");
  const { encrypt, decrypt } = await import("../src/lib/crypto");
  const { getQuotaState } = await import("../src/lib/quota");

  const password = "correct horse battery staple";
  const hash = await hashPassword(password);
  assert.notEqual(hash, password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("definitely-wrong", hash), false);

  const secret = "oauth-token-value";
  const cipherText = encrypt(secret);
  assert.notEqual(cipherText, secret);
  assert.equal(decrypt(cipherText), secret);
  assert.throws(() => decrypt(`${cipherText.slice(0, -1)}x`));

  const baseUser = {
    planTier: "trial",
    orderQuotaUsed: 19,
    subscriptionStatus: "trial",
    quotaPeriodEnd: null,
  };
  assert.equal(getQuotaState(baseUser as any).allowed, true);
  assert.equal(getQuotaState({ ...baseUser, orderQuotaUsed: 20 } as any).reason, "quota_exceeded");

  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);
  const paidUser = {
    ...baseUser,
    planTier: "starter",
    orderQuotaUsed: 20,
    subscriptionStatus: "active",
    quotaPeriodEnd: future,
  };
  assert.equal(getQuotaState(paidUser as any).allowed, true);
  assert.equal(getQuotaState({ ...paidUser, subscriptionStatus: "past_due" } as any).reason, "subscription_inactive");
  assert.equal(getQuotaState({ ...paidUser, quotaPeriodEnd: past } as any).reason, "billing_period_expired");
  assert.equal(getQuotaState({ ...paidUser, orderQuotaUsed: 200 } as any).reason, "quota_exceeded");

  console.log("Core security and quota smoke tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
