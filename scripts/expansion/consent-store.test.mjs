import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createConsentStore } from '../../src/lib/expansion/consent-store.mjs';
const NOW = Date.parse('2026-11-07T20:00:00Z'), KEY = Buffer.alloc(32, 7), HASH = 'a'.repeat(64);
const record = patch => ({ provider: 'xero', environment: 'production', tenantId: 'tenant-1', sessionHash: 'b'.repeat(64), callback: 'https://example.invalid/xero/callback', issuedAt: NOW, expiresAt: NOW + 600000, verifier: 'v'.repeat(64), ...patch });
function encrypt(value) { const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',KEY,iv);const bytes=Buffer.concat([c.update(value,'utf8'),c.final()]);return `v2:${iv.toString('base64url')}:${c.getAuthTag().toString('base64url')}:${bytes.toString('base64url')}`; }
function decrypt(value) { const [,iv,tag,bytes]=value.split(':');const d=createDecipheriv('aes-256-gcm',KEY,Buffer.from(iv,'base64url'));d.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([d.update(Buffer.from(bytes,'base64url')),d.final()]).toString('utf8'); }
function fake() {
  const rows=new Map();
  const table={
    async create({data}){if(rows.has(data.stateHash))throw Object.assign(Error('private database details'),{code:'P2002'});rows.set(data.stateHash,{...data});return data;},
    async delete({where}){const row=rows.get(where.stateHash);if(!row)throw Object.assign(Error('private database details'),{code:'P2025'});rows.delete(where.stateHash);return row;},
    async findMany({where,take}){return [...rows.values()].filter(r=>r.expiresAt<=where.expiresAt.lte).sort((a,b)=>a.expiresAt-b.expiresAt).slice(0,take).map(r=>({stateHash:r.stateHash}));},
    async deleteMany({where}){let count=0;for(const[k,r]of rows)if((!where.tenantId||r.tenantId===where.tenantId)&&(!where.stateHash||where.stateHash.in.includes(k))&&(!where.expiresAt||r.expiresAt<=where.expiresAt.lte)){rows.delete(k);count++;}return {count};},
  };
  return {rows,table,client:{expansionOAuthConsent:table}};
}
function setup(patch={}){const f=fake();let current=NOW;const store=createConsentStore({client:f.client,encrypt,decrypt,clock:()=>current,...patch});return {...f,store,setTime:time=>current=time};}
const code=expected=>error=>error.code===expected;
test('state is hashed and verifier/session binding are encrypted at rest',async()=>{
  const {store,rows}=setup();await store.insert(HASH,record());const saved=rows.get(HASH);
  assert.equal(saved.ciphertext.includes(record().verifier),false);assert.equal(saved.ciphertext.includes(record().sessionHash),false);
  assert.deepEqual(Object.keys(saved).sort(),['ciphertext','expiresAt','stateHash','tenantId']);assert.deepEqual(await store.take(HASH),record());assert.equal(await store.take(HASH),null);
});
test('duplicate insert never overwrites pending state',async()=>{
  const {store}=setup();await store.insert(HASH,record());await assert.rejects(()=>store.insert(HASH,record({tenantId:'tenant-2'})),code('STATE_EXISTS'));assert.equal((await store.take(HASH)).tenantId,'tenant-1');
});
test('a second store instance consumes the same persisted record once',async()=>{
  const {store,client}=setup();await store.insert(HASH,record());const second=createConsentStore({client,encrypt,decrypt,clock:()=>NOW});const results=await Promise.all(Array.from({length:20},(_,i)=>(i%2?store:second).take(HASH)));assert.equal(results.filter(Boolean).length,1);
});
test('expired state is consumed without returning decrypted data',async()=>{
  const {store,setTime,rows}=setup();await store.insert(HASH,record());setTime(NOW+600000);assert.equal(await store.take(HASH),null);assert.equal(rows.size,0);
});
for(const field of ['tenantId','expiresAt','stateHash'])test('encrypted envelope rejects changed database '+field,async()=>{
  const {store,rows}=setup();await store.insert(HASH,record());rows.get(HASH)[field]=field==='expiresAt'?new Date(NOW+600001):'other';await assert.rejects(()=>store.take(HASH),code('INVALID_STORED_RECORD'));assert.equal(rows.size,0);
});
test('ciphertext copied under another state key is rejected and consumed',async()=>{
  const {store,rows}=setup();await store.insert(HASH,record());rows.set('c'.repeat(64),{...rows.get(HASH),stateHash:'c'.repeat(64)});await assert.rejects(()=>store.take('c'.repeat(64)),code('INVALID_STORED_RECORD'));assert.equal(rows.has(HASH),true);
});
test('corrupt ciphertext cannot return a verifier or be retried',async()=>{
  const {store,rows}=setup();await store.insert(HASH,record());rows.get(HASH).ciphertext='v2:bad:bad:bad';await assert.rejects(()=>store.take(HASH),code('INVALID_STORED_RECORD'));assert.equal(await store.take(HASH),null);
});
test('extra input keys are not persisted',async()=>{
  const {store}=setup();await store.insert(HASH,record({accessToken:'SHOULD-NOT-BE-SAVED',arbitrary:'data'}));assert.deepEqual(await store.take(HASH),record());
});
for(const patch of [{issuedAt:NOW+1},{expiresAt:NOW},{expiresAt:NOW+600001},{tenantId:''},{sessionHash:'raw-session'},{verifier:'short'},{callback:'http://example.invalid/xero'},{callback:'https://example.invalid/xero?secret=x'}])test('invalid record is rejected before storage '+JSON.stringify(patch),async()=>{
  const {store,rows}=setup();await assert.rejects(()=>store.insert(HASH,record(patch)));assert.equal(rows.size,0);
});
test('raw state is not accepted as a database key',async()=>{
  const {store}=setup();await assert.rejects(()=>store.insert('raw-state-value',record()),code('INVALID_STATE_HASH'));await assert.rejects(()=>store.take('raw-state-value'),code('INVALID_STATE_HASH'));
});
test('plaintext or failed encryption prevents insertion',async()=>{
  for(const fn of [v=>v,()=>{throw Error('private-key-details');}]){const {store,rows}=setup({encrypt:fn});await assert.rejects(()=>store.insert(HASH,record()),e=>e.code==='ENCRYPTION_FAILED'&&!e.message.includes('private-key'));assert.equal(rows.size,0);}
});
test('database failure errors never expose query details',async()=>{
  const {store,table}=setup();table.create=async()=>{throw Error('PRIVATE-SQL')};await assert.rejects(()=>store.insert(HASH,record()),e=>e.code==='STORE_UNAVAILABLE'&&!e.message.includes('PRIVATE-SQL'));
});
test('cleanup is bounded and preserves unexpired states',async()=>{
  const {store,setTime,rows}=setup();for(const h of ['1','2','3'])await store.insert(h.repeat(64),record({expiresAt:NOW+1000}));await store.insert(HASH,record());setTime(NOW+1000);assert.equal(await store.cleanupExpired(2),2);assert.equal(rows.size,2);assert.equal(await store.cleanupExpired(2),1);assert.equal(rows.has(HASH),true);
});
test('revocation affects exactly one tenant',async()=>{
  const {store}=setup();await store.insert(HASH,record());await store.insert('c'.repeat(64),record({tenantId:'tenant-2'}));assert.equal(await store.revokeTenant('tenant-1'),1);assert.equal(await store.take(HASH),null);assert.equal((await store.take('c'.repeat(64))).tenantId,'tenant-2');
});
test('cleanup limits and tenant identifiers are validated',async()=>{
  const {store}=setup();for(const limit of [0,1001,1.5])await assert.rejects(()=>store.cleanupExpired(limit),code('INVALID_LIMIT'));await assert.rejects(()=>store.revokeTenant(''),code('INVALID_TENANT'));
});
