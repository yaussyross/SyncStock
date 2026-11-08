/** First-party session revocation only. This does not revoke Shopify login,
 * provider OAuth grants or work admitted before the version change commits. */
const HEADERS = Object.freeze({ 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
const result = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { ...HEADERS, 'Content-Type': 'application/json' },
});
const validVersion = value => Number.isInteger(value) && value >= 0 && value < 2147483647;
export function createRevokeSessionsRoute({ env, getSession, revoke, deadlineMs = 2000 }) {
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 2000) throw new Error('Invalid deadline');
  return async request => {
    if (request.method !== 'POST') return result(405, { error: 'method_not_allowed' });
    let expected, actual;
    try {
      expected = new URL(env.APP_URL);
      actual = new URL(request.url);
      if (expected.protocol !== 'https:' || expected.username || expected.password || expected.pathname !== '/' ||
          expected.search || expected.hash || ![expected.origin, expected.origin + '/'].includes(env.APP_URL)) throw Error();
    } catch { return result(503, { error: 'session_security_unavailable' }); }
    if (actual.origin !== expected.origin || actual.pathname !== '/api/auth/revoke-sessions' || actual.search || actual.hash ||
        actual.username || actual.password || request.headers.get('origin') !== expected.origin ||
        (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) {
      return result(403, { error: 'forbidden' });
    }
    // There are no browser-selectable identity/version fields. Do not read an
    // unbounded body, even if Content-Length lies or Transfer-Encoding is used.
    if (request.body !== null || ![null, '0'].includes(request.headers.get('content-length'))) {
      return result(400, { error: 'invalid_request' });
    }
    let timer, expired = false;
    try {
      const work = (async () => {
        const session = await getSession(request);
        // Never start a write after this handler's response deadline passed.
        if (expired || request.signal.aborted) return result(503, { error: 'session_security_unavailable' });
        if (!session) return result(401, { error: 'sign_in_required' });
        if (typeof session.userId !== 'string' || !/^[^\s\x00-\x1f\x7f]{1,200}$/.test(session.userId) || !validVersion(session.authVersion)) {
          return result(503, { error: 'session_security_unavailable' });
        }
        const changed = await revoke(session.userId, session.authVersion);
        if (changed !== true) return result(changed === false ? 409 : 503,
          { error: changed === false ? 'session_changed' : 'session_security_unavailable' });
        return result(200, { ok: true, scope: 'first_party_sessions' });
      })();
      return await Promise.race([work, new Promise(resolve => {
        timer = setTimeout(() => { expired = true; resolve(result(503, { error: 'outcome_unknown' })); }, deadlineMs);
      })]);
    } catch {
      // A write may have committed despite transport/adapter failure. Do not
      // retry it or assert success. No raw exception or session data is logged.
      return result(503, { error: 'outcome_unknown' });
    } finally { clearTimeout(timer); }
  };
}
