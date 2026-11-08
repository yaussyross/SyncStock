// Local synthetic QA harness. Never run against deployed/provider accounts.
import {spawn} from 'node:child_process';
import {syntheticTestEnv} from './connection-page-test-env.mjs';
import {mkdir, writeFile, rm, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
process.chdir(root);
const fixture=path.join(root,'src/app/(standard)/isolation-test-fixture');
try {await access(fixture); throw new Error('Refusing to overwrite an existing fixture route.');}
catch(error) {if(error.code!=='ENOENT') throw error;}
const env=await syntheticTestEnv(root);
const next=path.join(root,'node_modules/next/dist/bin/next');
const port='3187';
let server;
try {
 await mkdir(fixture);
 await writeFile(path.join(fixture,'page.tsx'),`"use client";
import Link from "next/link";
import {useRouter} from "next/navigation";
import RevokeSessionsPanel from "@/components/RevokeSessionsPanel";
export default function Fixture(){const router=useRouter();return <main><Link href="/settings/connections?connection=00000000-0000-4000-8000-000000000001">Setup link</Link><button onClick={()=>router.push("/settings/connections")}>Setup router</button><RevokeSessionsPanel /></main>;}
`);
 await new Promise((resolve,reject)=>{
  const build=spawn('npm',['run','build'],{env,stdio:'inherit'});
  build.on('error',reject);build.on('exit',code=>code===0?resolve():reject(Error('Build failed: '+code)));
 });
 server=spawn(process.execPath,[next,'start','--hostname','127.0.0.1','--port',port],{env,stdio:['ignore','pipe','inherit']});
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Local server readiness timed out')),30000);
  server.on('error',reject);server.on('exit',code=>reject(Error('Local server exited: '+code)));
  server.stdout.on('data',data=>{process.stdout.write(data);if(data.toString().includes('Ready')){clearTimeout(timer);resolve();}});
 });
 process.env.SYNCSTOCK_TEST_ORIGIN=`http://127.0.0.1:${port}`;
 await import('./connection-page-isolation-browser.mjs');
} finally {
 server?.kill('SIGTERM');
 await rm(fixture,{recursive:true,force:true});
 console.log('Temporary fixture source removed. Rebuild before using or publishing .next outputs.');
}
