import { createHash } from 'node:crypto';
import { verifyFirstPartySession, sessionMatchesUser, firstPartyTokenFromCookieHeader } from '../first-party-session.mjs';
import { rejectRoute } from './route-config.mjs';

/** Cookie-only first-party web session. No bearer, Shopify ID token, new mobile
 * token or browser-supplied user ID fallback. Legacy untyped sessions can only
 * survive while the account's persisted revocation version is still zero. */
export async function authenticateExpansionSession(request, { secret, findUser, clock = Date.now }) {
  const token = firstPartyTokenFromCookieHeader(request.headers.get('cookie'));
  if (!token) rejectRoute(401, 'sign_in_required');
  let claims;
  try { claims = verifyFirstPartySession(token, secret, Math.floor(clock() / 1000)); }
  catch { rejectRoute(401, 'sign_in_required'); }
  if (!claims || claims.sessionKind === 'mobile') rejectRoute(401, 'sign_in_required');
  // A fresh persisted version check rejects deleted accounts, old signed JWTs
  // and legacy versionless sessions once the account has revoked its sessions.
  const user = await findUser(claims.userId);
  if (!sessionMatchesUser(claims, user)) rejectRoute(401, 'sign_in_required');
  return Object.freeze({ tenantId: user.id, sessionId: createHash('sha256').update(token).digest('hex') });
}
