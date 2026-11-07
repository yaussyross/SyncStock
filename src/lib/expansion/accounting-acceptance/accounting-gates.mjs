/**
 * Independent, local-only acceptance specification for SyncStock expansion.
 * This module is integrated into the offline expansion preview, not a posting transport.
 * USD-only journal previews and Xero DRAFT payloads are the verified local scope.
 */
import {createHash} from 'node:crypto';

export const SOURCES=Object.freeze(['amazon','shopify','ebay','etsy','walmart','tiktok_shop','paypal']);
export const DESTINATIONS=Object.freeze(['qbo','xero']);
export const EXPERIENCES=Object.freeze(DESTINATIONS.flatMap(destination=>[...SOURCES,'multichannel'].map(source=>({source,destination}))));
export const TYPES=Object.freeze(['sale','refund','fee','transfer','reserve','chargeback']);
const ACCOUNTS=new Set(['clearing','bank','revenue','sales_tax_payable','fee_expense','reserve_asset','refunds','chargeback_expense']);
const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error;};
function id(value,label){if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>200||/[\x00-\x1f\x7f]/.test(value))fail('MISSING_ID',`Invalid ${label}.`);return value;}
export function usdMinor(value){
  if(typeof value!=='string'||!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value)) fail('INVALID_MONEY','Use a nonnegative exact USD decimal string with no excess precision.');
  const [whole,fraction='']=value.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
const hash=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

export function validateCandidate(c){
  if(!c||!SOURCES.includes(c.source))fail('UNKNOWN_SOURCE','Multichannel is an aggregate view, not an eighth provider.');
  if(!DESTINATIONS.includes(c.destination))fail('UNKNOWN_DESTINATION','Unknown accounting destination.');
  for(const field of ['merchantId','sourceAccountId','destinationTenantId','sourceEventId','economicEventId'])id(c[field],field);
  if(c.currency!=='USD')fail('UNSUPPORTED_FX','Non-USD currency requires separately verified accounting and exchange-rate handling.');
  if(!TYPES.includes(c.kind))fail('UNKNOWN_EVENT','Unknown event type must not become a sale.');
  if(c.status!=='completed')fail('NOT_SETTLED','Pending, denied or unknown events are not completed transactions.');
  if(c.balanceAffecting!==true)fail('NON_BALANCE_EVENT','Non-balance-affecting reporting rows must not generate a posting.');
  if(c.source==='paypal')id(c.eventDiscriminator,'PayPal reporting-event discriminator');
  if(c.ownership!=='explicit')fail('AMBIGUOUS_OWNERSHIP','Do not guess whether a channel or payment processor owns the sale.');
  if(!SOURCES.includes(c.revenueOwner))fail('MISSING_REVENUE_OWNER','Select the canonical revenue owner.');
  if(c.taxTreatment!=='none')fail('UNSUPPORTED_TAX','This expansion specification blocks unverified tax treatment.');
  if(c.destination==='xero'&&c.mode!=='DRAFT')fail('DESTINATION_MODE','Xero output must remain a DRAFT payload.');
  if(c.destination==='qbo'&&c.mode!=='LOCAL_PREVIEW')fail('DESTINATION_MODE','QBO output is a local journal preview, not a remote draft.');
  if(c.transportEnabled!==false)fail('TRANSPORT_ENABLED','No remote posting transport is approved by this local specification.');
  if(!Array.isArray(c.lines)||c.lines.length<2||c.lines.length>100)fail('INVALID_LINES','Use 2–100 balanced journal lines.');
  let debit=0n,credit=0n,revenueCredits=0n,revenueDebits=0n,fees=0n;
  const lineAmounts=c.lines.map(line=>{
    if(!ACCOUNTS.has(line.account))fail('UNMAPPED_ACCOUNT','Every line requires a known accounting role.');
    id(line.accountId,'destination account ID');
    if(line.currency!==c.currency)fail('MIXED_CURRENCY','Line and document currency must match.');
    const amount=usdMinor(line.amount);if(amount===0n)fail('ZERO_LINE','Zero-value lines do not prove a valid transaction.');
    if(line.side==='debit')debit+=amount;else if(line.side==='credit')credit+=amount;else fail('INVALID_SIDE','Line side must be debit or credit.');
    if(line.account==='revenue'){if(line.side==='credit')revenueCredits+=amount;else revenueDebits+=amount;}
    if(line.account==='fee_expense'&&line.side==='debit')fees+=amount;
    return amount;
  });
  if(debit!==credit)fail('UNBALANCED','Debits and credits must balance exactly in minor units.');
  const gross=usdMinor(c.gross);
  if(gross===0n)fail('ZERO_EVENT','Zero-value events require an explicit skip classification.');
  if(c.kind==='sale'){
    if(c.source!==c.revenueOwner)fail('REVENUE_OVERLAP','A processor or second channel cannot recognize an already-owned sale.');
    if(revenueCredits!==gross||revenueDebits!==0n)fail('SALE_RECONCILIATION','Sale revenue must match gross once, before fees.');
  }else if(c.kind==='refund'){
    id(c.originalEconomicEventId,'original sale reference');
    if(c.source!==c.revenueOwner)fail('REVENUE_OVERLAP','Refund revenue reversal belongs to the canonical sale owner.');
    if(revenueDebits!==gross||revenueCredits!==0n)fail('REFUND_RECONCILIATION','Refund reverses gross once and links to the original sale.');
  }else if(revenueCredits!==0n||revenueDebits!==0n)fail('NON_REVENUE_EVENT','Transfers, reserve movements, fees and chargebacks must not create a second sale.');
  if(c.kind==='fee'&&fees!==gross)fail('FEE_RECONCILIATION','Fee expense must match the fee amount.');
  const sides = side => new Set(c.lines.filter(line => line.side === side).map(line => line.account));
  const only = (set, allowed) => [...set].every(role => allowed.includes(role));
  const d = sides('debit'), cr = sides('credit');
  const pattern = c.kind === 'sale' ? only(d,['clearing']) && only(cr,['revenue'])
    : c.kind === 'refund' ? only(d,['revenue']) && only(cr,['clearing'])
    : c.kind === 'fee' ? only(d,['fee_expense']) && only(cr,['clearing'])
    : c.kind === 'transfer' ? only(d,['bank']) && only(cr,['clearing'])
    : c.kind === 'reserve' ? (only(d,['reserve_asset']) && only(cr,['clearing'])) || (only(d,['clearing']) && only(cr,['reserve_asset']))
    : c.kind === 'chargeback' ? only(d,['chargeback_expense']) && only(cr,['clearing']) : false;
  if (!pattern) fail('UNSUPPORTED_ENTRY_PATTERN','This event role and direction combination needs a separately validated accounting path.');
  if(debit!==gross)fail('GROSS_RECONCILIATION','This atomic event must balance to its own gross amount, not a combined net payout.');
  const identity=[c.merchantId,c.source,c.sourceAccountId,c.sourceEventId,c.eventDiscriminator||'',c.kind,c.destination,c.destinationTenantId];
  // A changed financial payload under the same event key is a conflict, not a new event.
  const financialLines=c.lines.map((line,index)=>({side:line.side,account:line.account,accountId:line.accountId,currency:line.currency,amountMinor:lineAmounts[index].toString()})).sort((a,b)=>JSON.stringify(stable(a)).localeCompare(JSON.stringify(stable(b))));
  const fingerprint=hash({currency:c.currency,kind:c.kind,grossMinor:gross.toString(),lines:financialLines,revenueOwner:c.revenueOwner,economicEventId:c.economicEventId,originalEconomicEventId:c.originalEconomicEventId||null,eventDate:c.eventDate||null});
  return {key:hash(identity),fingerprint,debitMinor:debit.toString(),creditMinor:credit.toString(),lineMinor:lineAmounts.map(String),economicKey:hash([c.merchantId,c.economicEventId,c.kind,c.destination,c.destinationTenantId])};
}

export function compareReplay(previous,next){
  if(previous.key!==next.key)return 'different_event';
  return previous.fingerprint===next.fingerprint?'duplicate_skip':'conflict_hold';
}

/** Validate known sale/payout evidence without classifying the deposit as revenue. */
export function reconcilePayout({currency,grossSales,refunds,fees,reserveHeld,reserveReleased,adjustmentCredits,adjustmentDebits,deposit}){
  if(currency!=='USD')fail('UNSUPPORTED_FX','Mixed/foreign-currency settlement needs a separate verified path.');
  const values={grossSales,refunds,fees,reserveHeld,reserveReleased,adjustmentCredits,adjustmentDebits,deposit};
  const m=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,usdMinor(v)]));
  const expected=m.grossSales-m.refunds-m.fees-m.reserveHeld+m.reserveReleased+m.adjustmentCredits-m.adjustmentDebits;
  if(expected!==m.deposit)fail('PAYOUT_MISMATCH','Payout evidence does not reconcile; do not invent a balancing revenue entry.');
  return {expectedMinor:expected.toString(),depositMinor:m.deposit.toString()};
}
