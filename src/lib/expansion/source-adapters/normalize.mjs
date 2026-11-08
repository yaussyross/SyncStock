/** Local, network-free accounting evidence normalization. NOT a provider connector.
 * The seven profile readers consume SyncStock Evidence v1, not native provider API
 * responses. A future authenticated ingestion layer must establish provenance,
 * account ownership, completeness and settlement; client assertions are not proof.
 */
import { createHash } from 'node:crypto';
export const SOURCES = Object.freeze(['amazon','shopify','ebay','etsy','walmart','tiktok_shop','paypal']);
export const KINDS = Object.freeze(['sale','refund','fee','transfer','reserve','chargeback']);
export const SOURCE_PROFILES = Object.freeze(Object.fromEntries(SOURCES.map(source => [source, Object.freeze({
  source, inputSchema:'syncstock-evidence/v1', nativeTransport:false, productionReady:false,
  requiredFinancialEvidence: source === 'amazon' ? 'settlement-or-financial-event' : source === 'paypal' ? 'balance-affecting-transaction-report' : 'financial-event-or-settlement-report',
})])));
export function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
export function identifier(value, field) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 200 || /[\x00-\x1f\x7f]/.test(value)) fail('INVALID_ID', `Invalid ${field}.`);
  return value;
}
export function minor(value) {
  if(typeof value !== 'string' || !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value)) fail('INVALID_MONEY','Money must be an exact nonnegative USD decimal string.');
  const [whole, fraction=''] = value.split('.'); return BigInt(whole)*100n + BigInt(fraction.padEnd(2,'0'));
}
export function money(value) { const amount = minor(value); return `${amount/100n}.${String(amount%100n).padStart(2,'0')}`; }
export function isoTime(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) fail('INVALID_TIME','Use an explicit UTC timestamp.');
  const d = new Date(value); if(!Number.isFinite(d.valueOf()) || d.toISOString()!==value.replace(/(?<!\.\d{3})Z$/,'.000Z')) fail('INVALID_TIME','Invalid calendar timestamp.');
  return d.toISOString();
}
function stable(value) { if(Array.isArray(value)) return value.map(stable); if(value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])); return value; }
export const digest = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
export function normalizeEvidence(source, row) {
  if(!SOURCES.includes(source)) fail('UNKNOWN_SOURCE','Multichannel is an aggregation, not a provider.');
  if(!row || row.schema!=='syncstock-evidence/v1' || row.source!==source) fail('SCHEMA_MISMATCH','Wrong evidence schema or source.');
  for(const key of ['merchantId','sourceAccountId','sourceEventId','economicEventId','evidenceReference']) identifier(row[key],key);
  if(row.financialStatus!=='completed' || row.balanceAffecting!==true) fail('NOT_FINANCIAL','Operational order status is not completed financial evidence.');
  if(row.recordType!=='financial_event') fail('NOT_FINANCIAL','Orders, listings and net settlement summaries need a separate verified parser.');
  if(row.reportComplete!==true) fail('INCOMPLETE_EVIDENCE','Incomplete pages or report fragments must be held.');
  if(row.currency!=='USD') fail('UNSUPPORTED_CURRENCY','Only exact USD evidence is modeled locally.');
  if(!KINDS.includes(row.kind)) fail('UNKNOWN_KIND','Unknown events must not become sales.');
  if(row.taxTreatment!=='none' || minor(row.taxAmount)!==0n) fail('UNSUPPORTED_TAX','Tax requires separately verified accounting treatment.');
  if(row.adjustmentsUnmodeled!==false) fail('UNMODELED_ADJUSTMENT','Unmodeled adjustments must not be silently dropped.');
  const gross = money(row.gross); if(minor(gross)===0n) fail('ZERO_EVENT','Zero events need an explicit skip classification.');
  if(source==='paypal') identifier(row.eventDiscriminator,'PayPal event discriminator');
  if(row.kind==='refund') identifier(row.originalEconomicEventId,'Original sale identity');
  const result = {
    schema:'syncstock-normalized/v1', source, merchantId:row.merchantId,sourceAccountId:row.sourceAccountId,
    sourceEventId:row.sourceEventId,economicEventId:row.economicEventId,
    ...(source==='paypal'?{eventDiscriminator:row.eventDiscriminator}:{}),
    ...(row.kind==='refund'?{originalEconomicEventId:row.originalEconomicEventId}:{}),
    kind:row.kind,currency:'USD',gross,status:'completed',balanceAffecting:true,taxTreatment:'none',
    settledAt:isoTime(row.settledAt), ...(row.sourceUpdatedAt?{sourceUpdatedAt:isoTime(row.sourceUpdatedAt)}:{}), ...(row.financialDateEvidenceReference?{financialDateEvidenceReference:identifier(row.financialDateEvidenceReference,'Financial date evidence reference')}:{}), provenance:{evidenceReference:row.evidenceReference, completeness:'complete', nativeTransport:false},
  };
  result.eventKey = digest([result.merchantId,source,result.sourceAccountId,result.sourceEventId,result.eventDiscriminator??'',result.kind]);
  result.fingerprint = digest({kind:result.kind,currency:result.currency,gross:result.gross,economicEventId:result.economicEventId,originalEconomicEventId:result.originalEconomicEventId??null,settledAt:result.settledAt});
  return Object.freeze(result);
}
export const adapters = Object.freeze(Object.fromEntries(SOURCES.map(source=>[source,row=>normalizeEvidence(source,row)])));
/** Same-provider duplicates are skipped; conflicts stop the batch. Cross-provider
 * sale identity is held until an owner explicitly resolves the overlap. No merges. */
export function normalizeBatch(rows) {
  if(!Array.isArray(rows)||rows.length>1000) fail('BATCH_LIMIT','At most 1000 local evidence rows.');
  const events=new Map(), economics=new Map(), output=[], duplicates=[];
  for(const row of rows){
    const event=normalizeEvidence(row.source,row), prior=events.get(event.eventKey);
    if(prior){if(prior.fingerprint!==event.fingerprint) fail('REPLAY_CONFLICT','The same event key has changed financial content.');duplicates.push(event.eventKey);continue;}
    events.set(event.eventKey,event);
    if(event.kind==='sale'||event.kind==='refund'){
      const key=digest([event.merchantId,event.economicEventId,event.kind]);
      const existing=economics.get(key);
      if(existing && (existing.source!==event.source || existing.sourceAccountId!==event.sourceAccountId || existing.sourceEventId!==event.sourceEventId)) fail('ECONOMIC_OVERLAP','One economic event has multiple revenue records; resolve ownership explicitly.');
      economics.set(key,event);
    }
    output.push(event);
  }
  return {events:output,duplicateKeys:duplicates};
}
