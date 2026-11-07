import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createPrismaRouteLimiter } from '../src/lib/expansion/prisma-route-limiter';
async function main(){
 const url=process.env.SYNCSTOCK_EXPANSION_TEST_DATABASE_URL;assert.ok(url,'Explicit disposable local database required');assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'Never use app or production database');
 const one=new PrismaClient({datasources:{db:{url}}}),two=new PrismaClient({datasources:{db:{url}}}),a=createPrismaRouteLimiter(one),b=createPrismaRouteLimiter(two),users:string[]=[];let groups=0;
 try{
  const owner=await one.user.create({data:{email:`rate-${randomUUID()}@example.invalid`}}),other=await two.user.create({data:{email:`rate-${randomUUID()}@example.invalid`}});users.push(owner.id,other.id);
  assert.equal((await a('start',owner.id)).allowed,true);
  // Pin only this contention fixture to a future window so crossing a real
  // wall-clock boundary cannot legitimately reset its quota mid-assertion.
  await one.expansionRouteLimit.update({where:{tenantId_action:{tenantId:owner.id,action:'start'}},data:{windowStartedAt:new Date(Date.now()+3600000),windowEndsAt:new Date(Date.now()+4500000)}});
  const raced=await Promise.allSettled(Array.from({length:19},(_,i)=>(i%2?a:b)('start',owner.id)));const admitted=1+raced.filter(r=>r.status==='fulfilled'&&r.value.allowed).length;assert.ok(admitted>=1&&admitted<=10);for(const r of raced)if(r.status==='rejected')assert.equal(r.reason.code,'RATE_LIMIT_UNAVAILABLE');const bucket=await one.expansionRouteLimit.findUniqueOrThrow({where:{tenantId_action:{tenantId:owner.id,action:'start'}}});assert.ok(bucket.usageCount<=11);groups++;
  // Failed/rolled-back reservations need not consume quota. Fill any slots
  // left after contention before testing steady-state denial.
  let denied=await b('start',owner.id);for(let i=0;i<11&&denied.allowed;i++)denied=await b('start',owner.id);
  assert.equal(denied.allowed,false);assert.ok(denied.retryAfterSeconds>=1&&denied.retryAfterSeconds<=3600);assert.equal(await one.expansionRouteLimit.count({where:{tenantId:owner.id,action:'start'}}),1);groups++;
  const normal=await b('start',other.id);assert.equal(normal.allowed,true);assert.equal((await a('callback',owner.id)).allowed,true);groups++;
  await one.expansionRouteLimit.update({where:{tenantId_action:{tenantId:owner.id,action:'start'}},data:{windowStartedAt:new Date(0),windowEndsAt:new Date(1000),usageCount:11}});assert.equal((await a('start',owner.id)).allowed,true);assert.equal((await one.expansionRouteLimit.findUniqueOrThrow({where:{tenantId_action:{tenantId:owner.id,action:'start'}}})).usageCount,1);groups++;
  const futureStart=new Date(Date.now()+3600000),futureEnd=new Date(Date.now()+7200000);await one.expansionRouteLimit.update({where:{tenantId_action:{tenantId:owner.id,action:'start'}},data:{windowStartedAt:futureStart,windowEndsAt:futureEnd,usageCount:10}});assert.equal((await b('start',owner.id)).allowed,false);const future=await one.expansionRouteLimit.findUniqueOrThrow({where:{tenantId_action:{tenantId:owner.id,action:'start'}}});assert.equal(future.windowStartedAt.valueOf(),futureStart.valueOf());assert.equal(future.usageCount,11);groups++;
  const hostile=`rate-${randomUUID()}');SELECT(1);--`;await one.user.create({data:{id:hostile,email:`rate-hostile-${randomUUID()}@example.invalid`}});users.push(hostile);assert.equal((await a('bind',hostile)).allowed,true);assert.equal(await one.user.count({where:{id:{in:users}}}),3);assert.equal((await one.expansionRouteLimit.findUniqueOrThrow({where:{tenantId_action:{tenantId:hostile,action:'bind'}}})).tenantId,hostile);groups++;
  await assert.rejects(()=>a('unknown_action',owner.id));assert.equal(await one.expansionRouteLimit.count({where:{tenantId:owner.id,action:'unknown_action'}}),0);groups++;
  let release!:()=>void,locked!:()=>void;const ready=new Promise<void>(resolve=>{locked=resolve}),held=new Promise<void>(resolve=>{release=resolve});
  const blocker=two.$transaction(async tx=>{await tx.$queryRaw`SELECT 1 FROM "ExpansionRouteLimit" WHERE "tenantId"=${owner.id} AND "action"='callback' FOR UPDATE`;locked();await held;},{timeout:5000});
  let lockTimer:ReturnType<typeof setTimeout>|undefined;
  let databaseCode:string|undefined;
  const observed=createPrismaRouteLimiter({$transaction:async(operation:any,options:any)=>{try{return await one.$transaction(operation,options)}catch(error:any){databaseCode=error.meta?.code;throw error}}} as any);
  try{await Promise.race([ready,blocker.then(()=>{throw Error('Lock transaction ended before readiness')}),new Promise((_,reject)=>{lockTimer=setTimeout(()=>reject(Error('Lock test did not become ready')),2000)})]);await assert.rejects(()=>observed('callback',owner.id),e=>(e as any).code==='RATE_LIMIT_UNAVAILABLE');assert.equal(databaseCode,'55P03','Database lock timeout must fire, not just HTTP timeout');}finally{clearTimeout(lockTimer);release();await blocker;}groups++;
  await one.expansionRouteLimit.update({where:{tenantId_action:{tenantId:owner.id,action:'callback'}},data:{usageCount:2147483647,windowStartedAt:new Date(Date.now()+3600000),windowEndsAt:new Date(Date.now()+4500000)}});assert.equal((await a('callback',owner.id)).allowed,false);assert.equal((await one.expansionRouteLimit.findUniqueOrThrow({where:{tenantId_action:{tenantId:owner.id,action:'callback'}}})).usageCount,31);groups++;
  await one.user.delete({where:{id:owner.id}});assert.equal(await two.expansionRouteLimit.count({where:{tenantId:owner.id}}),0);await assert.rejects(()=>b('start',owner.id),e=>(e as any).code==='RATE_LIMIT_UNAVAILABLE');assert.equal(await two.expansionRouteLimit.count({where:{tenantId:owner.id}}),0);assert.equal((await b('status',other.id)).allowed,true);groups++;
  console.log(`Expansion route-limit PostgreSQL checks passed: ${groups} groups, cross-client quota, parameterized tenant isolation, monotonic DB windows, lock timeout and deletion.`);
 }finally{await one.user.deleteMany({where:{id:{in:users}}});await Promise.all([one.$disconnect(),two.$disconnect()]);}
}
main().catch(error=>{console.error(error);process.exitCode=1});
