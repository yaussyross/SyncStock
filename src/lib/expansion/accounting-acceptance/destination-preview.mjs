import {createHash} from 'node:crypto';
import {validateCandidate,usdMinor} from './accounting-gates.mjs';
const compiledPreviews=new WeakSet();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function freezeTree(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freezeTree(child);Object.freeze(value);}return value;}
const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error;};
function isoDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)fail('INVALID_DATE','Confirm a valid YYYY-MM-DD posting date.');return s;}
function numberAmount(s){const minor=usdMinor(s),n=Number(minor)/100;if(!Number.isFinite(n)||usdMinor(n.toFixed(2))!==minor)fail('UNREPRESENTABLE_AMOUNT','The destination JSON number cannot preserve the exact cents.');return n;}

/** Compile data only. There is deliberately no network client or post() function. */
export function compileDestination(candidate,context){
  const checked=validateCandidate(candidate),date=isoDate(context?.postingDate);
  if(context.tenantId!==candidate.destinationTenantId)fail('TENANT_MISMATCH','Account metadata belongs to a different accounting tenant.');
  if(context.baseCurrency!=='USD')fail('UNSUPPORTED_BASE_CURRENCY','Local output is limited to USD-base accounting tenants.');
  if(context.periodOpen!==true)fail('PERIOD_UNVERIFIED','Do not bypass a closed or unverified accounting period.');
  if(candidate.eventDate&&candidate.eventDate!==date&&context.dateOverrideApproved!==true)fail('DATE_MISMATCH','A changed source date requires explicit reconciliation.');
  if(candidate.kind==='refund'){
    const history=context.refundHistory;
    if(!history||history.merchantId!==candidate.merchantId||history.destinationTenantId!==candidate.destinationTenantId||history.originalEconomicEventId!==candidate.originalEconomicEventId||history.excludedCurrentEventId!==candidate.economicEventId||history.revenueOwner!==candidate.revenueOwner||history.currency!=='USD')fail('UNVERIFIED_REFUND_HISTORY','Reconcile the original sale and prior refunds under the same merchant, tenant and revenue owner.');
    const original=usdMinor(history.originalGross),prior=usdMinor(history.priorRefundTotal),current=usdMinor(candidate.gross);
    if(original===0n||prior>original||current>original-prior)fail('REFUND_EXCEEDS_SALE','Cumulative refunds exceed the proven original sale.');
  }
  if(!Array.isArray(context.accounts))fail('MISSING_ACCOUNT_CATALOG','Resolve destination accounts before producing a draft.');
  const mapped=candidate.lines.map(line=>{
    const matches=context.accounts.filter(a=>a.id===line.accountId);
    if(matches.length!==1)fail('AMBIGUOUS_ACCOUNT','Every account ID must resolve once in the destination account catalog.');
    const a=matches[0];
    if(a.tenantId!==context.tenantId||a.active!==true||a.role!==line.account)fail('ACCOUNT_MAPPING_MISMATCH','Account tenant, active state and mapped role must all match.');
    if(a.currency&&a.currency!=='USD')fail('ACCOUNT_CURRENCY_MISMATCH','A mapped account uses an unsupported currency.');
    if(!a.type||['AccountsReceivable','AccountsPayable','ACCREC','ACCPAY'].includes(a.type))fail('UNSUPPORTED_CONTROL_ACCOUNT','Receivable/payable control accounts need a separately validated document and contact path.');
    if(candidate.destination==='xero'&&(a.type==='BANK'||a.type==='Bank'||line.account==='bank'||a.manualJournalAllowed!==true))fail('UNSUPPORTED_XERO_JOURNAL_ACCOUNT','This local Xero journal path excludes bank/control accounts and unverified journal eligibility.');
    return {line,account:a};
  });
  const narration=`SyncStock ${candidate.source} ${candidate.kind} ${candidate.sourceEventId}`;
  const provenance={merchantId:candidate.merchantId,source:candidate.source,sourceAccountId:candidate.sourceAccountId,sourceEventId:candidate.sourceEventId,kind:candidate.kind,economicEventId:candidate.economicEventId,originalEconomicEventId:candidate.originalEconomicEventId||null,destination:candidate.destination,destinationTenantId:candidate.destinationTenantId,sourceFingerprint:checked.fingerprint};
  let payload;
  if(candidate.destination==='qbo'){
    payload={TxnDate:date,DocNumber:'SS-'+checked.key.slice(0,18),CurrencyRef:{value:'USD'},PrivateNote:narration,Line:mapped.map(({line})=>({Description:`${candidate.kind}: ${line.account}`,Amount:numberAmount(line.amount),DetailType:'JournalEntryLineDetail',JournalEntryLineDetail:{PostingType:line.side==='debit'?'Debit':'Credit',AccountRef:{value:line.accountId}}}))};
  }else{
    const rates=Array.isArray(context.taxRates)?context.taxRates.filter(t=>t.taxType===context.noTaxType&&t.status==='ACTIVE'&&typeof t.effectiveRate==='string'&&usdMinor(t.effectiveRate)===0n):[];
    if(!context.noTaxType||rates.length!==1)fail('UNVERIFIED_ZERO_TAX_CODE','An active destination zero-tax code must be selected explicitly.');
    payload={ManualJournals:[{Narration:narration,Date:date,LineAmountTypes:'NoTax',Status:'DRAFT',JournalLines:mapped.map(({line})=>({Description:`${candidate.kind}: ${line.account}`,AccountID:line.accountId,LineAmount:numberAmount(line.amount)*(line.side==='debit'?1:-1),TaxType:context.noTaxType}))}]};
  }
  const artifactType=candidate.destination==='qbo'?'qbo-local-journal-preview':'xero-draft-payload';
  const envelope={artifactType,localOnly:true,transportEnabled:false,remoteObjectCreated:false,providerAcceptanceTested:false,eventKey:checked.key,payloadFingerprint:digest(payload),artifactFingerprint:digest({artifactType,provenance,payload}),provenance,payload};
  // Keep data-only artifacts independent of arbitrary credentials or metadata in input.
  freezeTree(envelope);compiledPreviews.add(envelope);return envelope;
}

export function aggregatePreviews(previews){
  if(!Array.isArray(previews)||previews.length>1000)fail('INVALID_PREVIEW_BATCH','Aggregate at most 1,000 locally validated events.');
  const groups=new Map(),events=new Map(),economic=new Map();
  for(const item of previews){
    if(!item||typeof item!=='object'||!compiledPreviews.has(item)||item.localOnly!==true||item.transportEnabled!==false||item.remoteObjectCreated!==false)fail('INVALID_PREVIEW','Rebuild imported or copied artifacts from validated candidates and destination metadata before aggregation.');
    if(digest(item.payload)!==item.payloadFingerprint||digest({artifactType:item.artifactType,provenance:item.provenance,payload:item.payload})!==item.artifactFingerprint)fail('MODIFIED_PREVIEW','The destination payload or provenance changed after validation.');
    const previous=events.get(item.eventKey);
    if(previous){if(previous.payloadFingerprint!==item.payloadFingerprint||previous.provenance.sourceFingerprint!==item.provenance.sourceFingerprint)fail('EVENT_PAYLOAD_CONFLICT','A replay changed the financial destination payload.');continue;}
    const p=item.provenance;
    const economicKey=JSON.stringify([p.merchantId,p.destination,p.destinationTenantId,p.economicEventId,p.kind]);
    if(economic.has(economicKey))fail('CROSS_SOURCE_OVERLAP','Different source events claim the same economic sale. Resolve ownership before aggregation.');
    economic.set(economicKey,item);events.set(item.eventKey,item);
    const key=JSON.stringify([p.destination,p.destinationTenantId]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);
  }
  return {localOnly:true,transportEnabled:false,groups:[...groups].map(([scope,items])=>({scope:JSON.parse(scope),items})),uniqueEvents:events.size};
}
