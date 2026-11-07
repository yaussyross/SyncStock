/** Native PayPal Transaction Search row reader. Restricted to incoming completed
 * Express Checkout (T0006), USD, confirmed no tax/other adjustments. Not a fetcher.
 * Context must eventually come from authenticated complete Y-filtered report
 * ingestion plus reviewed tax/ownership evidence, never a browser form assertion.
 */
import {identifier,minor,money,isoTime,fail,normalizeEvidence} from './normalize.mjs';
const UNSUPPORTED_AMOUNTS=['discount_amount','insurance_amount','sales_tax_amount','shipping_amount','shipping_discount_amount','shipping_tax_amount','other_amount','tip_amount','credit_transactional_fee','credit_promotional_fee'];
function requireUsd(amount) {if(!amount||amount.currency_code!=='USD')fail('UNSUPPORTED_CURRENCY','PayPal amount must carry USD.');return amount.value;}
export function readPayPalCheckoutReport(record, context) {
  if(!context||context.balanceAffectingRecordsOnly!=='Y'||context.reportComplete!==true)fail('REPORT_SCOPE','Require complete balance-affecting-only reporting provenance.');
  if(context.taxReview!=='confirmed_none')fail('UNSUPPORTED_TAX','A missing PayPal tax field is not proof that no tax exists.');
  const t=record?.transaction_info;
  if(!t||t.transaction_status!=='S')fail('NOT_COMPLETED','Only successful completed report rows are eligible.');
  if(t.transaction_event_code!=='T0006')fail('UNSUPPORTED_PAYPAL_EVENT','Only incoming Express Checkout report rows are modeled; other codes stay held.');
  identifier(t.transaction_id,'PayPal transaction ID');
  if(t.paypal_account_id!==context.sourceAccountId)fail('ACCOUNT_MISMATCH','Reporting account must match the source-account scope.');
  const gross=money(requireUsd(t.transaction_amount)); if(minor(gross)===0n)fail('ZERO_EVENT','Zero payments need explicit skip handling.');
  for(const field of UNSUPPORTED_AMOUNTS)if(t[field]!=null && minor(requireUsd(t[field]))!==0n)fail('UNMODELED_ADJUSTMENT','PayPal nonzero tax, shipping or other adjustments require a separate verified path.');
  const dateEvidence=context.financialDateEvidence;
  if(dateEvidence?.confirmed!==true||dateEvidence.transactionId!==t.transaction_id||dateEvidence.sourceAccountId!==context.sourceAccountId)fail('FINANCIAL_DATE_UNVERIFIED','Require scoped reviewed financial-date evidence; the PayPal updated timestamp is not settlement proof.');
  identifier(dateEvidence.evidenceReference,'Financial date evidence reference');
  const sourceUpdatedAt=isoTime(t.transaction_updated_date);
  if(t.fee_amount==null){
    const feeReview=context.zeroFeeEvidence;
    if(feeReview?.confirmedZero!==true||feeReview.transactionId!==t.transaction_id||feeReview.sourceAccountId!==context.sourceAccountId)fail('FEE_EVIDENCE_INCOMPLETE','Missing fee_amount is not proof of a zero fee.');
    identifier(feeReview.evidenceReference,'Zero fee evidence reference');
  }
  const base={schema:'syncstock-evidence/v1',source:'paypal',merchantId:context.merchantId,sourceAccountId:context.sourceAccountId,
    sourceEventId:t.transaction_id,economicEventId:context.economicEventId,evidenceReference:context.evidenceReference,
    recordType:'financial_event',financialStatus:'completed',balanceAffecting:true,reportComplete:true,currency:'USD',
    taxTreatment:'none',taxAmount:'0.00',adjustmentsUnmodeled:false,settledAt:isoTime(dateEvidence.settledAt),sourceUpdatedAt,financialDateEvidenceReference:dateEvidence.evidenceReference,
  };
  const rows=[{...base,kind:'sale',gross,eventDiscriminator:'T0006:checkout-gross'}];
  if(t.fee_amount!=null){
    const raw=requireUsd(t.fee_amount);
    if(typeof raw!=='string')fail('INVALID_MONEY','PayPal fees must be exact decimal strings.');
    if(raw.startsWith('-')){
      const fee=money(raw.slice(1));
      if(minor(fee)>0n)rows.push({...base,kind:'fee',gross:fee,eventDiscriminator:'T0006:checkout-fee'});
    }else if(minor(raw)!==0n)fail('UNSUPPORTED_FEE_DIRECTION','A positive fee credit is not a debit expense.');
  }
  // Do not preserve payer details, descriptions, emails, addresses or raw JSON.
  rows.forEach(row=>normalizeEvidence('paypal',row));return rows;
}
