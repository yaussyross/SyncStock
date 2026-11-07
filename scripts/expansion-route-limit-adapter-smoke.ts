import assert from 'node:assert/strict';
import { createPrismaRouteLimiter } from '../src/lib/expansion/prisma-route-limiter';
let options:any,query:any,settings:any;
const client={async $transaction(operation:any,limits:any){options=limits;return operation({async $executeRaw(strings:any){settings=strings.join('')},async $queryRaw(sql:any){query=sql;return[{usageCount:1,retryAfterSeconds:120}]}})}};
const limiter=createPrismaRouteLimiter(client as any);
async function main(){
 const tenant="synthetic');SELECT(1);--";assert.equal((await limiter('start',tenant)).allowed,true);
 assert.deepEqual(options,{maxWait:500,timeout:1200});assert.match(settings,/statement_timeout','1000ms'/);assert.match(settings,/lock_timeout','500ms'/);
 assert.equal(query.values.includes(tenant),true);assert.equal(query.text.includes(tenant),false);assert.equal(query.sql.includes(tenant),false);
 assert.match(query.text,/statement_timestamp\(\)/);assert.match(query.text,/ON CONFLICT \("tenantId","action"\)/);assert.match(query.text,/EXCLUDED\."windowStartedAt" > "ExpansionRouteLimit"\."windowStartedAt"/);assert.match(query.text,/LEAST\("ExpansionRouteLimit"\."usageCount", \$\d+\) \+ 1/);
 console.log('Expansion limiter adapter checks passed: parameterization, scoped DB timeouts, atomic monotonic window and saturation.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
