import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import http from 'node:http';
import https from 'node:https';

// Exercise the real Next request-context/session/HTTP adapter with synthetic
// persistence only. Network tripwires make an accidental provider call fail.
const requireModule = createRequire(import.meta.url);
const globals = globalThis as any;
const savedPrisma = globals.prisma;
const savedStorage = globals.AsyncLocalStorage;
const savedFetch = globalThis.fetch;
const envKeys = ['NEXTAUTH_SECRET', 'APP_URL', 'SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET'] as const;
const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const savedNetwork = [http.request, http.get, https.request, https.get] as const;
let outboundCalls = 0;
const blockNetwork = () => { outboundCalls++; throw new Error('Synthetic session test forbids network'); };
let stage = 'setup';

async function main() {
  try {
    globals.AsyncLocalStorage = AsyncLocalStorage;
    globalThis.fetch = blockNetwork as typeof fetch;
    http.request = blockNetwork as typeof http.request;
    http.get = blockNetwork as typeof http.get;
    https.request = blockNetwork as typeof https.request;
    https.get = blockNetwork as typeof https.get;
    Object.assign(process.env, {
      NEXTAUTH_SECRET: 'synthetic-runtime-session-secret-not-real',
      APP_URL: 'https://review.invalid',
      SHOPIFY_API_KEY: 'synthetic-review-app',
      SHOPIFY_API_SECRET: 'synthetic-runtime-shopify-secret-not-real',
    });
    let version = 0, writes = 0;
    globals.prisma = {
      user: { findUnique: async ({ where }: any) => where.id === 'synthetic-user'
        ? { id: 'synthetic-user', authVersion: version } : null },
      shopifyConnection: { findUnique: async ({ where }: any) => where.shopDomain === 'test.myshopify.com'
        ? { user: { id: 'synthetic-shopify-user', authVersion: 0 } } : null },
      $transaction: async (fn: any) => fn({
        $executeRaw: async () => 0,
        user: { updateMany: async ({ where }: any) => {
          writes++;
          assert.equal(where.id, 'synthetic-user');
          if (where.authVersion !== version) return { count: 0 };
          version++;
          return { count: 1 };
        } },
      }),
    };
    // Require after installing the synthetic dependencies. Both Next async
    // stores are necessary; unit storage alone is not a request context.
    const session = requireModule('../../src/lib/session.ts');
    const { POST } = requireModule('../../src/app/api/auth/revoke-sessions/route.ts');
    const { NextRequest } = requireModule('next/server');
    const { signFirstPartySession } = requireModule('../../src/lib/first-party-session.mjs');
    const jwt = requireModule('jsonwebtoken');
    const work = requireModule('next/dist/server/app-render/work-async-storage.external.js').workAsyncStorage;
    const unit = requireModule('next/dist/server/app-render/work-unit-async-storage.external.js').workUnitAsyncStorage;
    const run = (headers: Record<string, string>, fn: () => any) => work.run(
      { route: '/api/auth/revoke-sessions' },
      () => unit.run({ type: 'request', phase: 'action', headers: new Headers(headers) }, fn),
    );
    const secret = process.env.NEXTAUTH_SECRET!;
    const web = signFirstPartySession('synthetic-user', 0, 'web', secret);
    const mobile = signFirstPartySession('synthetic-user', 0, 'mobile', secret);
    const legacy = jwt.sign({ userId: 'synthetic-user' }, secret, { issuer: 'syncstock', expiresIn: '30d' });
    const shopify = jwt.sign({ dest: 'https://test.myshopify.com', iss: 'https://test.myshopify.com/admin', sub: '123' },
      process.env.SHOPIFY_API_SECRET!, { audience: 'synthetic-review-app', expiresIn: '1m' });
    stage = 'admission';
    for (const token of [web, legacy]) {
      assert.equal((await run({ cookie: `session=${token}` }, session.getCurrentUser)).id, 'synthetic-user');
    }
    for (const [token, id] of [[mobile, 'synthetic-user'], [shopify, 'synthetic-shopify-user']]) {
      assert.equal((await run({ authorization: `Bearer ${token}` }, session.getCurrentUser)).id, id);
    }
    stage = 'source-separation';
    const rejectedGeneral: Array<Record<string, string>> = [
      { cookie: `session=${mobile}` }, { authorization: `Bearer ${web}` },
      { cookie: `session=${web}; session=${web}` },
    ];
    for (const headers of rejectedGeneral) assert.equal(await run(headers, session.getCurrentUser), null);
    const rejectedSecurity: Array<Record<string, string>> = [
      { cookie: `session=${mobile}` }, { authorization: `Bearer ${shopify}` },
      { authorization: `Bearer ${mobile}` }, { cookie: `session=${web}; session=` },
    ];
    for (const headers of rejectedSecurity) assert.equal(await run(headers, session.getCurrentFirstPartyWebSession), null);
    stage = 'http-mutation';
    const headers = { origin: 'https://review.invalid', cookie: `session=${web}` };
    const post = () => run(headers, () => POST(new NextRequest('https://review.invalid/api/auth/revoke-sessions', {
      method: 'POST', headers,
    })));
    let response = await post();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, scope: 'first_party_sessions' });
    assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
    assert.equal(writes, 1);
    stage = 'post-revocation';
    for (const token of [web, legacy]) {
      assert.equal(await run({ cookie: `session=${token}` }, session.getCurrentUser), null);
    }
    assert.equal(await run({ authorization: `Bearer ${mobile}` }, session.getCurrentUser), null);
    assert.equal((await run({ authorization: `Bearer ${shopify}` }, session.getCurrentUser)).id, 'synthetic-shopify-user');
    response = await post();
    assert.equal(response.status, 401);
    assert.equal(writes, 1);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(outboundCalls, 0);
    console.log('Session Next runtime passed: admission, source separation, duplicate cookies, actual revoke wrapper, successful clearing, stale rejection, Shopify preservation; zero network calls.');
  } finally {
    globalThis.fetch = savedFetch;
    [http.request, http.get, https.request, https.get] = savedNetwork;
    if (savedPrisma === undefined) delete globals.prisma; else globals.prisma = savedPrisma;
    if (savedStorage === undefined) delete globals.AsyncLocalStorage; else globals.AsyncLocalStorage = savedStorage;
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
    }
  }
}
main().catch(() => {
  // Do not print a thrown request, token, Prisma argument or raw exception.
  console.error(`Session Next runtime failed at fixed stage: ${stage}`);
  process.exitCode = 1;
});
