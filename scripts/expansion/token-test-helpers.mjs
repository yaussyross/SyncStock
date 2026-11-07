import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {createTokenStore} from '../../src/lib/expansion/token-store.mjs';
export const NOW=Date.parse('2026-11-07T20:20:00Z');
const KEY=Buffer.alloc(32,11);
export function encrypt(value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',KEY,iv),bytes=Buffer.concat([c.update(value),c.final()]);return `v2:${iv.toString('base64url')}:${c.getAuthTag().toString('base64url')}:${bytes.toString('base64url')}`;}
export function decrypt(value){const[,iv,tag,bytes]=value.split(':'),d=createDecipheriv('aes-256-gcm',KEY,Buffer.from(iv,'base64url'));d.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([d.update(Buffer.from(bytes,'base64url')),d.final()]).toString();}
export const grant=(patch={})=>({grantId:randomUUID(),provider:'xero',environment:'production',tenantId:'tenant-1',clientId:'synthetic-client',authorizationBinding:'a'.repeat(64),accessToken:'synthetic-access-token-1',refreshToken:'synthetic-refresh-token-1',tokenType:'Bearer',expiresAt:NOW+1800000,refreshExpiresAt:NOW+60*86400000,scopes:['accounting.settings.read','offline_access'],status:'account_binding_required',providerAccountId:null,customerReady:false,...patch});
export const replacement=(claim,patch={})=>({...claim.credential,connectionId:claim.connectionId,version:claim.version,expectedVersion:claim.version,accessToken:'synthetic-access-token-2',refreshToken:'synthetic-refresh-token-2',...patch});
function matches(row,where){return Object.entries(where).every(([k,v])=>v&&typeof v==='object'&&!(v instanceof Date)?('lte'in v?row[k]!==null&&row[k]<=v.lte:('in'in v?v.in.includes(row[k]):false)):row[k]===v);}
export function fakeDatabase(){const rows=new Map();const table={
 async create({data}){if(rows.has(data.id)||[...rows.values()].some(r=>(data.refreshFingerprint&&r.refreshFingerprint===data.refreshFingerprint)||(data.initialGrantFingerprint&&r.initialGrantFingerprint===data.initialGrantFingerprint)))throw Error('PRIVATE duplicate');rows.set(data.id,structuredClone(data));return structuredClone(data);},
 async findFirst({where}){return structuredClone([...rows.values()].find(r=>matches(r,where))??null);},
 async findMany({where,take,select}){return [...rows.values()].filter(r=>matches(r,where)).slice(0,take).map(r=>Object.fromEntries(Object.keys(select).map(k=>[k,r[k]])));},
 async updateMany({where,data}){let count=0;for(const[id,row]of rows)if(matches(row,where)){if(data.refreshFingerprint&&[...rows.values()].some(r=>r.id!==id&&r.refreshFingerprint===data.refreshFingerprint))throw Error('PRIVATE unique conflict');rows.set(id,{...row,...structuredClone(data)});count++;}return {count};},
 };return {rows,table,client:{expansionOAuthGrant:table}};}
export function setup(){const f=fakeDatabase();let now=NOW;return {...f,store:createTokenStore({client:f.client,encrypt,decrypt,clock:()=>now}),setTime:value=>{now=value},second:()=>createTokenStore({client:f.client,encrypt,decrypt,clock:()=>now})};}
