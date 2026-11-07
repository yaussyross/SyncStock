/** Explicit local mapping only. Never infer ownership/account IDs or enable transport. */
import {SOURCES,identifier,fail,normalizeEvidence} from './normalize.mjs';
import {validateCandidate} from '../accounting-acceptance/accounting-gates.mjs';
export function evidenceToCandidate(row, mapping) {
  const e = normalizeEvidence(row.source,row);
  if(!mapping || mapping.merchantId!==e.merchantId || mapping.sourceAccountId!==e.sourceAccountId) fail('MAPPING_SCOPE','Mapping must match merchant and source account.');
  if(!SOURCES.includes(mapping.revenueOwner)||mapping.ownership!=='explicit') fail('OWNERSHIP','Explicit revenue ownership is required.');
  identifier(mapping.destinationTenantId,'Destination tenant');
  if(mapping.destination!=='qbo'&&mapping.destination!=='xero')fail('DESTINATION','Unknown destination.');
  if(!Array.isArray(mapping.lines))fail('MAPPING_LINES','Explicit balanced account mappings are required.');
  const c={
    merchantId:e.merchantId,source:e.source,sourceAccountId:e.sourceAccountId,sourceEventId:e.sourceEventId,
    economicEventId:e.economicEventId,eventDiscriminator:e.eventDiscriminator,originalEconomicEventId:e.originalEconomicEventId,
    kind:e.kind,currency:e.currency,gross:e.gross,status:e.status,balanceAffecting:e.balanceAffecting,
    destination:mapping.destination,destinationTenantId:mapping.destinationTenantId,
    revenueOwner:mapping.revenueOwner,ownership:'explicit',taxTreatment:e.taxTreatment,
    mode:mapping.destination==='xero'?'DRAFT':'LOCAL_PREVIEW',transportEnabled:false,
    lines:mapping.lines.map(line=>({side:line.side,account:line.account,accountId:line.accountId,amount:line.amount,currency:line.currency})),settledAt:e.settledAt,eventDate:e.settledAt.slice(0,10),
  };
  validateCandidate(c); return c;
}
