// Temporary, disposable sandbox only. No production database or queue is used.
import { spawn } from 'node:child_process';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { mkdir, writeFile, chown } from 'node:fs/promises';

const deadline = Date.parse(process.env.SANDBOX_EXPIRES_AT || '');
if (process.env.SYNCSTOCK_SANDBOX !== 'true' || !Number.isFinite(deadline) || deadline <= Date.now() || deadline - Date.now() > 24 * 3600_000) {
  console.error('Sandbox requires an unexpired absolute deadline within 24 hours.');
  process.exit(0);
}
const appUrl = process.env.APP_URL;
if (!appUrl || !/^https:\/\/[a-z0-9-]+\.up\.railway\.app$/.test(appUrl)) {
  console.error('Set APP_URL to this sandbox Railway HTTPS origin.');
  process.exit(1);
}
const children = [];
let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  setTimeout(() => {
    for (const child of children) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
    process.exit(code);
  }, 3000);
}
setTimeout(() => shutdown(0), deadline - Date.now());
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
function run(command, args, env = process.env, persistent = false) {
  const child = spawn(command, args, { env, stdio: 'inherit', detached: true });
  children.push(child);
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => {
      if (persistent && !stopping) shutdown(1);
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`));
    });
    if (persistent) resolve();
  });
}
const secret = () => randomBytes(32).toString('hex');
try {
  // Debian's postgres user owns only the ephemeral test cluster.
  const id = spawn('id', ['-u', 'postgres']);
  let uidText = '';
  for await (const chunk of id.stdout) uidText += chunk;
  const uid = Number(uidText.trim());
  if (!uid) throw new Error('Cannot resolve postgres user');
  const pgPassword = secret();
  await mkdir('/tmp/syncstock-pg', { recursive: true });
  await chown('/tmp/syncstock-pg', uid, uid);
  await writeFile('/tmp/syncstock-pg-password', pgPassword, { mode: 0o600 });
  await chown('/tmp/syncstock-pg-password', uid, uid);
  await run('runuser', ['-u', 'postgres', '--', '/usr/lib/postgresql/15/bin/initdb', '-D', '/tmp/syncstock-pg', '--auth-local=trust', '--auth-host=scram-sha-256', '--pwfile=/tmp/syncstock-pg-password']);
  await run('runuser', ['-u', 'postgres', '--', '/usr/lib/postgresql/15/bin/pg_ctl', '-D', '/tmp/syncstock-pg', '-o', '-h 127.0.0.1 -p 5432 -c shared_buffers=32MB -c max_connections=30', '-w', 'start']);
  await run('runuser', ['-u', 'postgres', '--', 'createdb', 'syncstock']);
  const redisPassword = secret();
  await run('redis-server', ['--bind', '127.0.0.1', '--port', '6379', '--requirepass', redisPassword, '--save', '', '--appendonly', 'no', '--maxmemory', '64mb', '--maxmemory-policy', 'noeviction'], process.env, true);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const port = process.env.PORT || '3000';
  const env = {
    ...process.env,
    SYNCSTOCK_SANDBOX: 'true', QBO_ENVIRONMENT: 'sandbox',
    POSTGRES_PRISMA_URL: `postgresql://postgres:${pgPassword}@127.0.0.1:5432/syncstock?connection_limit=5`,
    POSTGRES_URL_NON_POOLING: `postgresql://postgres:${pgPassword}@127.0.0.1:5432/syncstock`,
    REDIS_URL: `redis://:${redisPassword}@127.0.0.1:6379`,
    NEXTAUTH_SECRET: secret(), ENCRYPTION_KEY: secret(), QUEUE_BRIDGE_SECRET: secret(),
    QUEUE_BRIDGE_URL: 'http://127.0.0.1:4000',
    WORKER_SIGNING_PUBLIC_KEY_B64: Buffer.from(publicPem).toString('base64'),
    STRIPE_SECRET_KEY: 'sk_test_disabled_sandbox', STRIPE_WEBHOOK_SECRET: secret(),
  };
  delete env.WORKER_SIGNING_PRIVATE_KEY_B64;
  await run('node', ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], env);
  await run('node', ['--import', 'tsx', 'src/worker/index.ts'], {
    NODE_ENV: 'production', SYNCSTOCK_SANDBOX: 'true', PORT: '4000',
    APP_URL: `http://127.0.0.1:${port}`, REDIS_URL: env.REDIS_URL,
    QUEUE_BRIDGE_SECRET: env.QUEUE_BRIDGE_SECRET,
    WORKER_SIGNING_PRIVATE_KEY_B64: Buffer.from(privatePem).toString('base64'),
    PATH: process.env.PATH,
  }, true);
  await run('node', ['node_modules/next/dist/bin/next', 'start', '-p', port, '-H', '0.0.0.0'], env, true);
  console.log(`Disposable sandbox started; expires ${new Date(deadline).toISOString()}. Checkout disabled.`);
} catch (error) {
  console.error(error.message);
  shutdown(1);
}
