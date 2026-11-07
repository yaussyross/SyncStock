/** Narrow native provider reads. No accounting writes or consent creation. */
import { readProviderPages, ProviderReadError } from './read-client.mjs';
const fail = message => { throw new ProviderReadError('NATIVE_SCHEMA', message); };
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value);
function request(binding, provider, url) {
  if (binding?.provider !== provider) fail('Provider binding does not match the native reader.');
  return { provider, environment: binding.environment, tenantId: binding.tenantId, boundTenantId: binding.tenantId, accountId: binding.accountId, boundAccountId: binding.accountId, url };
}

/** Xero's /Accounts GET is an unpaginated complete chart-of-accounts read.
 * Credentials require accounting.settings.read or accounting.settings.
 * Account balances, bank account numbers and arbitrary source fields are omitted.
 * Accounts are not automatically assigned ledger roles or journal eligibility.
 */
export async function readXeroAccounts(binding, options = {}) {
  const req = request(binding, 'xero', 'https://api.xero.com/api.xro/2.0/Accounts');
  const result = await readProviderPages(req, { ...options, decodePage: data => {
    if (!data || !Array.isArray(data.Accounts) || data.ErrorNumber || data.Type === 'ValidationException' || (data.Status !== undefined && data.Status !== 'OK')) fail('Xero account response is not accepted.');
    const ids = new Set();
    const records = data.Accounts.map(account => {
      if (!account || !text(account.AccountID) || !text(account.Type) || !['ACTIVE','ARCHIVED'].includes(account.Status) || ids.has(account.AccountID)) fail('Xero account metadata is invalid or duplicated.');
      ids.add(account.AccountID);
      const record = { id: account.AccountID, type: account.Type, status: account.Status };
      for (const [from,to] of [['Code','code'],['Name','name'],['CurrencyCode','currency'],['TaxType','taxType']]) {
        if (account[from] !== undefined) { if (!text(account[from])) fail('Xero account metadata contains an invalid field.'); record[to] = account[from]; }
      }
      return record;
    });
    return { records, nextUrl: null };
  } });
  return { ...result, readKind: 'xero_native_account_catalog', accountingMappingVerified: false };
}

/** eBay native order list, deliberately not settlement/revenue evidence.
 * Complete traversal requires consistent totals, offsets, page lengths and an
 * unchanged query. Mutating live result sets are held for a fresh bounded run.
 * Only order identifiers and operational status are retained; no buyer PII.
 */
export async function readEbayOrders(binding, { createdFrom, createdTo, pageSize = 50, ...options } = {}) {
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  if (!date(createdFrom) || !date(createdTo) || Date.parse(createdFrom) >= Date.parse(createdTo)) fail('Use an explicit bounded UTC order window.');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) fail('Invalid eBay page size.');
  const origin = binding?.environment === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
  const first = new URL('/sell/fulfillment/v1/order', origin);
  const filter = `creationdate:[${createdFrom}..${createdTo}]`;
  first.searchParams.set('filter', filter); first.searchParams.set('limit', String(pageSize)); first.searchParams.set('offset', '0');
  const req = request(binding, 'ebay', first.href);
  let offset = 0, initialTotal = null;
  const ids = new Set();
  const result = await readProviderPages(req, { ...options, decodePage: data => {
    if (!data || (data.errors?.length) || (data.warnings?.length) || !Number.isSafeInteger(data.total) || data.total < 0 || data.offset !== offset || data.limit !== pageSize) fail('eBay page metadata is incomplete or inconsistent.');
    if (initialTotal === null) initialTotal = data.total;
    if (data.total !== initialTotal) fail('eBay result count changed during pagination.');
    const orders = data.orders ?? (data.total === 0 ? [] : null);
    if (!Array.isArray(orders) || orders.length !== Math.min(pageSize, data.total - offset)) fail('eBay page is missing expected orders.');
    const records = orders.map(order => {
      if (!order || !text(order.orderId) || ids.has(order.orderId)) fail('eBay order identity is invalid or repeated.');
      ids.add(order.orderId);
      const record = { id: order.orderId };
      for (const [from,to] of [['orderPaymentStatus','paymentStatus'],['orderFulfillmentStatus','fulfillmentStatus']]) {
        if (order[from] !== undefined) { if (!text(order[from])) fail('eBay order status is invalid.'); record[to] = order[from]; }
      }
      return record;
    });
    offset += orders.length;
    let nextUrl = null;
    if (offset < data.total) {
      if (typeof data.next !== 'string') fail('eBay omitted the next page.');
      const next = new URL(data.next);
      if (next.origin !== first.origin || next.pathname !== first.pathname || next.username || next.password || next.hash || [...next.searchParams].length !== 3 || next.searchParams.get('filter') !== filter || next.searchParams.get('limit') !== String(pageSize) || next.searchParams.get('offset') !== String(offset)) fail('eBay next page changed the bound query.');
      nextUrl = next.href;
    } else if (data.next !== undefined && data.next !== null && data.next !== '') fail('eBay returned an unexpected continuation.');
    return { records, nextUrl };
  } });
  return { ...result, readKind: 'ebay_native_operational_orders', financialEvidence: false };
}
