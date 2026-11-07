import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {syntheticTestEnv} from './connection-page-test-env.mjs';
const port=3191;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:await syntheticTestEnv(),stdio:['ignore','pipe','inherit']});
try {
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Local server readiness timed out')),30000);
  child.on('error',reject);child.on('exit',code=>reject(Error('Local server exited: '+code)));
  child.stdout.on('data',data=>{if(data.toString().includes('Ready')){clearTimeout(timer);resolve();}});
 });
 const origin=`http://127.0.0.1:${port}`;
 let previousNonce;
 for(const route of ['/settings/connections','/settings/connections?connection=00000000-0000-4000-8000-000000000001','/%73ettings/connections','/settings/%63onnections','/settings/connections/missing']) {
  const response=await fetch(origin+route); const html=await response.text();
  assert.equal(response.status,route.endsWith('/missing')?404:200);
  const csp=response.headers.get('content-security-policy');
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.match(csp,/connect-src 'self'/);
  assert(!csp.includes('unsafe-eval'));
  assert(!html.includes('cdn.shopify.com')&&!html.includes('fonts.googleapis.com')&&!html.includes('feedback-fab'));
  const nonce=csp.match(/'nonce-([^']+)'/)[1];
  assert.notEqual(nonce,previousNonce);previousNonce=nonce;
  for(const script of html.matchAll(/<script\b[^>]*>/g)) assert(script[0].includes(`nonce="${nonce}"`));
 }
 for(const route of ['/','/shopify/app','/definitely-missing']) {
  const response=await fetch(origin+route);const html=await response.text();
  assert.equal(response.status,route==='/definitely-missing'?404:200);
  assert(html.includes('cdn.shopify.com')&&html.includes('fonts.googleapis.com'));
  if(route==='/definitely-missing') assert(html.includes('That page is not part of the sync.'));
  if(route==='/shopify/app') assert.match(response.headers.get('content-security-policy'),/frame-ancestors https:\/\/admin.shopify.com/);
 }
 console.log('PASS: production HTTP/SSR nonces, isolated resources/headers, encoded aliases, ordinary/embedded resources, and scoped 404s. No browser execution claimed.');
} finally {child.kill('SIGTERM');}
