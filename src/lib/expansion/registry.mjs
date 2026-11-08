// Default-off connection registry. This module has no network or token-storage side effects.
import { createHash } from 'node:crypto';
export const SOURCES = Object.freeze(['amazon','shopify','ebay','etsy','walmart','tiktok_shop','paypal']);
export const DESTINATIONS = Object.freeze(['qbo','xero']);
export const EXPERIENCES = Object.freeze(DESTINATIONS.flatMap(destination=>[...SOURCES,'multichannel'].map(source=>Object.freeze({id:`${source}-${destination}`,source,destination}))));
export const REQUIRED = Object.freeze(['app_access','merchant_consent','read_acceptance','mapping_acceptance','dedup_acceptance','accounting_acceptance','deletion_acceptance','support_ready']);
const iso = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s));
const validId = s => typeof s === 'string' && s.length > 0 && s.length <= 200 && s.trim() === s && !/[\x00-\x1f\x7f]/.test(s);
export function channelBindingFingerprint(config) {
  if (!Array.isArray(config?.channelConfigs)) return null;
  return createHash('sha256').update(JSON.stringify(config.channelConfigs.map(c => ({ source: c.source, account: c.boundSourceId, mappingRevision: c.mappingRevision })).sort((a,b) => String(a.source).localeCompare(String(b.source))))).digest('hex');
}
function verified(fn, evidence, context, gate) {
  if (typeof fn !== 'function') return false;
  try { return fn(evidence, context, gate) === true; } catch { return false; }
}
export function evidenceValid(e, context, now=Date.now()) {
  return !!e && e.status==='passed' && e.mode==='provider' && e.environment===context.environment && e.tenantId===context.tenantId && e.source===context.source && e.destination===context.destination && validId(context.boundSourceId) && e.boundSourceId===context.boundSourceId && validId(context.boundDestinationId) && e.boundDestinationId===context.boundDestinationId && validId(context.mappingRevision) && e.mappingRevision===context.mappingRevision && (context.source!=='multichannel'||(typeof context.channelBindingFingerprint==='string'&&e.channelBindingFingerprint===context.channelBindingFingerprint)) && typeof e.runId==='string' && e.runId.trim().length>0 && typeof e.receipt==='string' && /^https:\/\//.test(e.receipt) && iso(e.checkedAt) && Date.parse(e.checkedAt)<=now && iso(e.expiresAt) && Date.parse(e.expiresAt)>now;
}
export function checkExperience(id, config={}, now=Date.now(), verifyEvidence=null) {
  const pair=EXPERIENCES.find(p=>p.id===id);if(!pair)throw new Error('Unknown connection experience');
  const problems=[];
  if(config.enabled!==true)problems.push('Feature disabled');
  if(!['sandbox','production'].includes(config.environment))problems.push('Environment not selected');
  if(typeof config.tenantId!=='string'||!config.tenantId.trim())problems.push('Tenant not selected');
  if(!validId(config.boundSourceId)||!validId(config.boundDestinationId))problems.push('Provider accounts not bound');
  if(!validId(config.mappingRevision))problems.push('Mapping revision not bound');
  const ctx={...pair,environment:config.environment,tenantId:config.tenantId,boundSourceId:config.boundSourceId,boundDestinationId:config.boundDestinationId,mappingRevision:config.mappingRevision,channelBindingFingerprint:pair.source==='multichannel'?channelBindingFingerprint(config):null};
  if(typeof verifyEvidence!=='function')problems.push('Trusted evidence verification is not configured');
  for(const gate of REQUIRED)if(!evidenceValid(config.evidence?.[gate],ctx,now)||!verified(verifyEvidence,config.evidence?.[gate],ctx,gate))problems.push(`Missing or invalid provider evidence: ${gate}`);
  if(config.currency!=='USD')problems.push('Currency not accepted by this release');
  if(config.writerOwner!=='syncstock')problems.push('Exclusive accounting writer ownership not established');
  if(!iso(config.cutoverAt)||Date.parse(config.cutoverAt)>now)problems.push('Invalid transaction cutover');
  if(pair.source==='multichannel'){
    if(!Array.isArray(config.channelConfigs)||config.channelConfigs.length<2)problems.push('Multichannel requires at least two individually accepted sources');
    else {
      const seen=new Set();
      for(const c of config.channelConfigs){if(!SOURCES.includes(c.source)||seen.has(c.source)){problems.push('Invalid or duplicate multichannel source');continue;}seen.add(c.source);if(c.tenantId!==config.tenantId||c.environment!==config.environment||c.boundDestinationId!==config.boundDestinationId)problems.push(`Channel binding mismatch: ${c.source}`);const verdict=checkExperience(`${c.source}-${pair.destination}`,c,now,verifyEvidence);if(!verdict.allowed)problems.push(`Source is not accepted: ${c.source}`);}
      if(!evidenceValid(config.evidence?.cross_channel_ownership,ctx,now)||!verified(verifyEvidence,config.evidence?.cross_channel_ownership,ctx,'cross_channel_ownership'))problems.push('Missing cross-channel ownership acceptance');
    }
  }
  return {id,allowed:problems.length===0,customerReady:problems.length===0&&config.environment==='production',mode:'evidence_gate_not_provider_verification',problems};
}
export function launchMatrix(configs={},now=Date.now(),verifyEvidence=null){return EXPERIENCES.map(x=>checkExperience(x.id,configs[x.id],now,verifyEvidence));}
