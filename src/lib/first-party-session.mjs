import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const MAX_AUTH_VERSION = 2147483647;

export function isAuthVersion(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_AUTH_VERSION;
}

function validUserId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 191 && !/[\s\x00-\x1f\x7f]/u.test(value);
}

function validNow(now) { return Number.isSafeInteger(now) && now >= 0; }

export function signFirstPartySession(userId, authVersion, sessionKind, secret, now = Math.floor(Date.now() / 1000)) {
  if (!validUserId(userId) || !isAuthVersion(authVersion) || !['web', 'mobile'].includes(sessionKind) || !secret || !validNow(now)) {
    throw new Error('Invalid session issuance');
  }
  return jwt.sign({ userId, authVersion, sessionKind, iat: now }, secret, {
    algorithm: 'HS256', jwtid: randomUUID(), issuer: 'syncstock', expiresIn: SESSION_MAX_AGE_SECONDS,
  });
}

// Legacy issuance had neither version nor kind. It remains usable only against
// an untouched (version 0) account. Never treat a partially specified token as legacy.
export function verifyFirstPartySession(token, secret, now = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || token.length > 8192 || !secret || !validNow(now)) throw new Error('Invalid session');
  const payload = jwt.verify(token, secret, {
    algorithms: ['HS256'], issuer: 'syncstock', clockTimestamp: now,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  if (typeof payload !== 'object' || !validUserId(payload.userId) ||
      !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
      payload.iat > now || payload.exp <= now || payload.exp <= payload.iat ||
      payload.exp - payload.iat > SESSION_MAX_AGE_SECONDS) throw new Error('Invalid session');
  const legacy = payload.authVersion === undefined && payload.sessionKind === undefined;
  if (!legacy && (!isAuthVersion(payload.authVersion) || !['web', 'mobile'].includes(payload.sessionKind))) {
    throw new Error('Invalid session');
  }
  return { userId: payload.userId, authVersion: legacy ? 0 : payload.authVersion,
    sessionKind: legacy ? 'legacy' : payload.sessionKind };
}

export function sessionMatchesUser(claims, user) {
  return !!user && isAuthVersion(user.authVersion) && claims.userId === user.id && claims.authVersion === user.authVersion;
}

// Atomic compare-and-swap: a stale request cannot revoke a newly issued version.
// Overflow fails closed, never wrapping back to legacy-compatible version zero.
export async function revokeFirstPartySessions(store, userId, expectedAuthVersion) {
  if (!validUserId(userId) || !isAuthVersion(expectedAuthVersion) || expectedAuthVersion === MAX_AUTH_VERSION) return false;
  const result = await store.updateMany({
    where: { id: userId, authVersion: expectedAuthVersion },
    data: { authVersion: { increment: 1 } },
  });
  return result.count === 1;
}

export function signMobileOAuthHandoff(identity, provider, state, shop, secret, now = Math.floor(Date.now() / 1000)) {
  if (!validNow(now) || !validUserId(identity.userId) || !isAuthVersion(identity.authVersion) ||
      !['qbo', 'shopify'].includes(provider) || !/^[a-f0-9]{32}$/.test(state) ||
      (provider === 'shopify' && !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop))) throw new Error('Invalid OAuth handoff');
  return jwt.sign({ userId: identity.userId, authVersion: identity.authVersion,
    sessionKind: 'mobile', provider, state, shop: shop ?? null, iat: now }, secret,
  { algorithm: 'HS256', issuer: 'syncstock-mobile-oauth', expiresIn: 600 });
}

export function verifyMobileOAuthHandoff(token, provider, state, shop, secret, now = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || token.length > 8192 || !secret || !validNow(now)) throw new Error('Invalid OAuth handoff');
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'syncstock-mobile-oauth', clockTimestamp: now, maxAge: 600 });
  if (typeof payload !== 'object' || !validUserId(payload.userId) || !isAuthVersion(payload.authVersion) ||
      payload.sessionKind !== 'mobile' || payload.provider !== provider || !['qbo', 'shopify'].includes(provider) ||
      !/^[a-f0-9]{32}$/.test(state) || payload.state !== state || payload.shop !== (shop ?? null) ||
      !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
      payload.iat > now || payload.exp <= now || payload.exp <= payload.iat || payload.exp - payload.iat > 600) throw new Error('Invalid OAuth handoff');
  return { userId: payload.userId, authVersion: payload.authVersion, sessionKind: 'mobile' };
}

// Ambiguous cookie headers must never select an arbitrary identity. Do not
// URL-decode JWT cookie values; compact JWT syntax is already cookie-safe.
export function firstPartyTokenFromCookieHeader(header) {
  if (typeof header !== 'string' || header.length > 16384 || /[\r\n\x00]/.test(header)) return null;
  const matches = header.split(';').map(part => part.trim()).filter(part => /^session(?:=|$|\s)/.test(part));
  if (matches.length !== 1) return null;
  const match = /^session=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(matches[0]);
  return match && match[1].length <= 8192 ? match[1] : null;
}
