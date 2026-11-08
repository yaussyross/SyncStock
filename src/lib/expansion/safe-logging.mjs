/** Optional application-log projection, not a request/object sanitizer.
 * Routes intentionally do not emit logs or import this module. Nothing here
 * controls Next.js, platform access logs, trace attributes or log-drain metadata.
 * Add reviewed, code-owned enum fields rather than arbitrary strings/objects.
 */
const ACTIONS = new Set(['start', 'callback', 'status', 'accounts', 'bind', 'disconnect']);
const PROVIDERS = new Set(['xero', 'ebay']);
const ENVIRONMENTS = new Set(['production', 'sandbox']);
const STATUSES = new Set([200, 302, 303, 400, 401, 403, 404, 405, 409, 429, 503]);
const REASONS = new Set(['none', 'not_found', 'sign_in_required', 'forbidden',
  'invalid_request', 'method_not_allowed', 'connection_changed',
  'try_again_later', 'disconnect_unavailable', 'expansion_unavailable']);

function ownData(input, key) {
  if (input === null || typeof input !== 'object') return undefined;
  try {
    // No property access, iteration, recursion, string coercion, toJSON or
    // inspection hooks on the supplied object. Accessors/inherited data are
    // ignored. A throwing/revoked proxy cannot turn its error into log output.
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch { return undefined; }
}
function choice(input, key, allowed, fallback = 'unknown') {
  const value = ownData(input, key);
  return allowed.has(value) ? value : fallback;
}

/** Return a fresh frozen, null-prototype event with a closed output vocabulary.
 * Pass only server-owned route metadata. Unknown fields and invalid values are
 * discarded; no URL/path, query, ID, header, cookie, body, Error or token survives.
 * This function never changes input or logs anything, including on failure.
 */
export function projectExpansionLogEvent(input) {
  const event = Object.create(null);
  event.event = 'expansion.http';
  event.action = choice(input, 'action', ACTIONS);
  event.provider = choice(input, 'provider', PROVIDERS);
  event.environment = choice(input, 'environment', ENVIRONMENTS);
  event.status = choice(input, 'status', STATUSES, null);
  event.reason = choice(input, 'reason', REASONS, 'unspecified');
  return Object.freeze(event);
}

/** Serialize only the projected event, never the original object. If a future
 * caller emits this string, it must not append raw context/extra log arguments.
 * There is deliberately no default console sink or global logger interception.
 */
export function serializeExpansionLogEvent(input) {
  return JSON.stringify(projectExpansionLogEvent(input));
}
