import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { rejectRoute } from './route-config.mjs';

/** Only SyncStock's web session cookie is accepted. Browser requests do not
 * carry cookie attributes; HTTPS + production-only routes ensure the existing
 * login flow issues this cookie as Secure, HttpOnly, SameSite=Lax. No bearer,
 * Shopify ID token, mobile token or browser-supplied user ID is a fallback. */
export async function authenticateExpansionSession(request, { secret, findUser, clock = Date.now }) {
  const cookie = request.headers.get('cookie') || '';
  if (cookie.length > 16384) rejectRoute(401, 'sign_in_required');
  const candidates = cookie.split(';').map(value => value.trim()).filter(value => value.split('=', 1)[0] === 'session');
  if (candidates.length !== 1) rejectRoute(401, 'sign_in_required');
  const token = candidates[0].slice('session='.length);
  if (token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) rejectRoute(401, 'sign_in_required');
  let payload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'syncstock', maxAge: '30d', clockTimestamp: Math.floor(clock() / 1000) });
    if (!payload || typeof payload !== 'object' || typeof payload.userId !== 'string' || !/^[^\s\x00-\x1f\x7f]{1,200}$/.test(payload.userId) ||
        !Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.iat) || payload.exp <= payload.iat || payload.iat > Math.floor(clock() / 1000)) throw Error();
  } catch { rejectRoute(401, 'sign_in_required'); }
  // The verified JWT alone is insufficient after the local account is removed.
  const user = await findUser(payload.userId);
  if (!user || user.id !== payload.userId) rejectRoute(401, 'sign_in_required');
  return Object.freeze({ tenantId: user.id, sessionId: createHash('sha256').update(token).digest('hex') });
}
