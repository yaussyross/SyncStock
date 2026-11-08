import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { revokeSessionsWithPrisma } from '../src/lib/prisma-session-revocation';
import { signFirstPartySession, verifyFirstPartySession, sessionMatchesUser, signMobileOAuthHandoff, verifyMobileOAuthHandoff, MAX_AUTH_VERSION } from '../src/lib/first-party-session.mjs';
let stage='setup';
async function main() {
 const url=process.env.SYNCSTOCK_SESSION_TEST_DATABASE_URL;
 assert.ok(url,'Explicit disposable local database required');
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'Never use app or production database');
 const one=new PrismaClient({datasources:{db:{url}}}),two=new PrismaClient({datasources:{db:{url}}});
 const users:string[]=[];let groups=0;
 const secret='synthetic-revocation-tests-not-a-real-session-secret';
 const now=Math.floor(Date.now()/1000),state='a'.repeat(32);
 try {
  const a=await one.user.create({data:{email:`sessions-${randomUUID()}@example.invalid`}}),b=await one.user.create({data:{email:`sessions-other-${randomUUID()}@example.invalid`}});
  users.push(a.id,b.id);assert.equal(a.authVersion,0);groups++;
  stage='initial-tokens';
  const legacy=jwt.sign({userId:a.id,iat:now},secret,{issuer:'syncstock',expiresIn:'30d'});
  const web=signFirstPartySession(a.id,0,'web',secret,now),mobile=signFirstPartySession(a.id,0,'mobile',secret,now);
  for(const token of [legacy,web,mobile])assert(sessionMatchesUser(verifyFirstPartySession(token,secret,now),a));groups++;
  stage='cas-and-admission';assert.equal(await revokeSessionsWithPrisma(one,a.id,0),true);
  const after=await two.user.findUniqueOrThrow({where:{id:a.id}});assert.equal(after.authVersion,1);
  for(const token of [legacy,web,mobile])assert.equal(sessionMatchesUser(verifyFirstPartySession(token,secret,now),after),false);groups++;
  assert.equal(await revokeSessionsWithPrisma(two,a.id,0),false);assert.equal((await one.user.findUniqueOrThrow({where:{id:a.id}})).authVersion,1);
  assert(sessionMatchesUser(verifyFirstPartySession(signFirstPartySession(a.id,1,'web',secret,now),secret,now),after));groups++;
  stage='tenant-isolation';assert.equal((await two.user.findUniqueOrThrow({where:{id:b.id}})).authVersion,0);
  assert.equal(sessionMatchesUser(verifyFirstPartySession(web,secret,now),b),false);groups++;
  stage='two-client-race';const raced=await Promise.all(Array.from({length:8},(_,i)=>revokeSessionsWithPrisma(i%2?one:two,a.id,1)));
  assert.equal(raced.filter(Boolean).length,1);assert.equal((await two.user.findUniqueOrThrow({where:{id:a.id}})).authVersion,2);groups++;
  stage='derived-handoff';const handoff=signMobileOAuthHandoff({userId:a.id,authVersion:2},'qbo',state,null,secret,now);
  assert(sessionMatchesUser(verifyMobileOAuthHandoff(handoff,'qbo',state,null,secret,now),await one.user.findUniqueOrThrow({where:{id:a.id}})));
  assert.equal(await revokeSessionsWithPrisma(two,a.id,2),true);
  assert.equal(sessionMatchesUser(verifyMobileOAuthHandoff(handoff,'qbo',state,null,secret,now),await one.user.findUniqueOrThrow({where:{id:a.id}})),false);groups++;
  stage='overflow';await one.user.update({where:{id:b.id},data:{authVersion:MAX_AUTH_VERSION-1}});
  assert.equal(await revokeSessionsWithPrisma(two,b.id,MAX_AUTH_VERSION-1),true);assert.equal(await revokeSessionsWithPrisma(one,b.id,MAX_AUTH_VERSION),false);
  assert.equal((await one.user.findUniqueOrThrow({where:{id:b.id}})).authVersion,MAX_AUTH_VERSION);groups++;
  stage='database-constraint';await assert.rejects(()=>one.user.update({where:{id:b.id},data:{authVersion:-1}}));
  assert.equal((await one.user.findUniqueOrThrow({where:{id:b.id}})).authVersion,MAX_AUTH_VERSION);groups++;
  stage='parameterization';const hostile=`session-${randomUUID()}');SELECT(1);--`;
  await one.user.create({data:{id:hostile,email:`session-hostile-${randomUUID()}@example.invalid`}});users.push(hostile);
  assert.equal(await revokeSessionsWithPrisma(two,hostile,0),true);assert.equal((await one.user.findUniqueOrThrow({where:{id:hostile}})).authVersion,1);assert.equal(await one.user.count({where:{id:{in:users}}}),3);groups++;
  stage='lock-timeout';let release!:()=>void,ready!:()=>void;
  const held=new Promise<void>(resolve=>release=resolve),locked=new Promise<void>(resolve=>ready=resolve);
  const blocker=two.$transaction(async tx=>{await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id"=${a.id} FOR UPDATE`;ready();await held;},{timeout:6000});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([locked,blocker.then(()=>{throw Error('Lock finished early');}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Lock setup timed out')),2000);})]);
   await assert.rejects(()=>revokeSessionsWithPrisma(one,a.id,3),(error:any)=>error?.meta?.code==='55P03'||String(error?.message).includes('lock timeout'));
  }finally{clearTimeout(timer);release();await blocker;}
  assert.equal((await two.user.findUniqueOrThrow({where:{id:a.id}})).authVersion,3);groups++;
  stage='deletion';await one.user.delete({where:{id:a.id}});
  assert.equal(sessionMatchesUser(verifyFirstPartySession(web,secret,now),await two.user.findUnique({where:{id:a.id}})),false);
  assert.equal(await revokeSessionsWithPrisma(two,a.id,3),false);groups++;
  console.log(`First-party session revocation PostgreSQL checks passed: ${groups} groups; independent-client CAS, admission revocation, derived handoff, overflow, isolation, lock timeout and deletion.`);
 } finally {await one.user.deleteMany({where:{id:{in:users}}});await Promise.all([one.$disconnect(),two.$disconnect()]);}
}
main().catch(()=>{console.error(`First-party session revocation database checks failed at fixed stage: ${stage}`);process.exitCode=1;});
