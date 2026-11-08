import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
let networkAttempts=0;
const denyNetwork=()=>{networkAttempts++;throw new Error("Synthetic OAuth tests must never use network");};
for(const transport of [http,https]){(transport as any).request=denyNetwork;(transport as any).get=denyNetwork;}
globalThis.fetch=denyNetwork as typeof fetch;
import { NextRequest } from "next/server";
import { signFirstPartySession, signMobileOAuthHandoff } from "../../src/lib/first-party-session.mjs";

// Entirely synthetic DB stub; every allowed callback stops before provider I/O.
process.env.NEXTAUTH_SECRET = "synthetic-offline-session-test-secret-only";
process.env.APP_URL = "https://synthetic.invalid";
process.env.QBO_CLIENT_ID = "synthetic-client";
process.env.QBO_CLIENT_SECRET = "synthetic-secret";
process.env.QBO_ENVIRONMENT = "sandbox";
process.env.SHOPIFY_API_KEY = "synthetic-key";
process.env.SHOPIFY_SCOPES = "read_orders";
process.env.SYNCSTOCK_SANDBOX = "false";
let version = 0;
let reads = 0;
(globalThis as any).prisma = {user: {findUnique: async ({where}: any) => {
  reads++;
  return where.id === "synthetic-user" ? {id: where.id, authVersion: version} : null;
}}};
async function main() {
  const qboStart = (await import("../../src/app/api/auth/qbo/route")).GET;
  const shopStart = (await import("../../src/app/api/auth/shopify/route")).GET;
  const qboCallback = (await import("../../src/app/api/auth/qbo/callback/route")).GET;
  const shopCallback = (await import("../../src/app/api/auth/shopify/callback/route")).GET;
  const secret = process.env.NEXTAUTH_SECRET!;
  const token = signFirstPartySession("synthetic-user",0,"mobile",secret);
  const web = signFirstPartySession("synthetic-user",0,"web",secret);
  for (const [provider, start, callback] of [["qbo", qboStart, qboCallback], ["shopify", shopStart, shopCallback]] as const) {
    const base=`https://synthetic.invalid/api/auth/${provider}`;
    const shop="synthetic.myshopify.com";
    for (const session of [web, "bad-token"]) {
      const res=await start(new NextRequest(`${base}?mobile=1&shop=${shop}`,{headers:{authorization:`Bearer ${session}`}}));
      assert.equal(res.status,401);
    }
    version=0;
    const result=await start(new NextRequest(`${base}?mobile=1&shop=${shop}`,{headers:{authorization:`Bearer ${token}`}}));
    assert.equal(result.status,307);
    assert(!result.headers.get("location")!.includes(token));
    const proof=result.cookies.get(`${provider}_oauth_mobile_user`)!.value;
    const state=result.cookies.get(`${provider}_oauth_state`)!.value;
    assert.notEqual(proof,"synthetic-user");
    version=1;
    const stale=await start(new NextRequest(`${base}?mobile=1&shop=${shop}`,{headers:{authorization:`Bearer ${token}`}}));
    assert.equal(stale.status,401);
    for(const handoff of [proof,"synthetic-user",signMobileOAuthHandoff({userId:"synthetic-user",authVersion:0},provider,"b".repeat(32),provider === "shopify" ? shop : null,secret)]) {
      const req=new NextRequest(`${base}/callback?state=${state}&code=synthetic&realmId=synthetic`,{headers:{cookie:`${provider}_oauth_state=${state}; ${provider}_oauth_shop=${shop}; ${provider}_oauth_mobile_user=${handoff}`}});
      assert.equal((await callback(req)).status,401);
    }
  }
  assert(reads>0);
  assert.equal(networkAttempts,0);
  console.log("Mobile OAuth runtime: provenance, revocation before start/callback, signed state binding, legacy-cookie rejection, no outgoing session token passed.");
}
main().catch(()=>{console.error("Mobile OAuth synthetic regression failed");process.exitCode=1;});
