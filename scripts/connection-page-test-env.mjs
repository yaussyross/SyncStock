import {access} from 'node:fs/promises';
import path from 'node:path';

export async function syntheticTestEnv(root = process.cwd()) {
  // Next loads these independently of the child process environment. Never
  // run a synthetic browser/HTTP build in a checkout carrying real env files.
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    try { await access(path.join(root, name)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error(`Refusing synthetic QA with ${name} present; use a disposable clean checkout.`);
  }
  const inherited = {};
  for (const key of ['PATH','HOME','TMPDIR','TMP','TEMP','SYSTEMROOT','WINDIR','PLAYWRIGHT_BROWSERS_PATH']) {
    if (process.env[key]) inherited[key] = process.env[key];
  }
  return {
    ...inherited,
    NODE_ENV: 'production', CI: '1', NEXT_TELEMETRY_DISABLED: '1',
    EXPANSION_OAUTH_ENABLED: 'false', EXPANSION_EBAY_ENABLED: 'false', EXPANSION_XERO_ENABLED: 'false',
    EXPANSION_QUERY_LOG_POLICY_VERIFIED: 'false',
    POSTGRES_PRISMA_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic?connect_timeout=1',
    POSTGRES_URL_NON_POOLING: 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic?connect_timeout=1',
    DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic?connect_timeout=1',
    REDIS_URL: 'redis://127.0.0.1:1',
    APP_URL: 'http://127.0.0.1:3187',
    NEXTAUTH_SECRET: 'synthetic-local-test-only-not-a-real-session-secret',
    ENCRYPTION_KEY: 'synthetic-local-test-only-no-real-tokens',
  };
}
