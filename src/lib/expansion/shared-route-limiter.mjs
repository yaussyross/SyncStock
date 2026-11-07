/** A shared reserve operation is mandatory. There is no local-memory fallback,
 * retry or release: an unknown DB outcome burns a slot rather than admits work.
 */
export class RouteLimitError extends Error { constructor(code,message){super(message);this.name='RouteLimitError';this.code=code;} }
/** @type {() => never} */
const fail=()=>{throw new RouteLimitError('RATE_LIMIT_UNAVAILABLE','Shared route protection is unavailable.');};
export const ROUTE_LIMITS=Object.freeze({
 start:Object.freeze({limit:10,windowSeconds:900}),
 callback:Object.freeze({limit:30,windowSeconds:900}),
 accounts:Object.freeze({limit:30,windowSeconds:300}),
 bind:Object.freeze({limit:10,windowSeconds:300}),
 status:Object.freeze({limit:120,windowSeconds:300}),
});
/** @param {{reserve: (request: {tenantId:string,action:string,limit:number,windowSeconds:number})=>Promise<any>,deadlineMs?:number}} options */
export function createSharedRouteLimiter({reserve,deadlineMs=1500}){
 if(typeof reserve!=='function'||!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>5000)fail();
 return async(action,tenantId)=>{
  if(!Object.hasOwn(ROUTE_LIMITS,action)||typeof tenantId!=='string'||!tenantId||tenantId.length>200||/[\s\x00-\x1f\x7f]/.test(tenantId))fail();
  const policy=ROUTE_LIMITS[action],request=Object.freeze({tenantId,action,limit:policy.limit,windowSeconds:policy.windowSeconds});let timer;
  try{
   const result=await Promise.race([Promise.resolve().then(()=>reserve(request)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new RouteLimitError('RATE_LIMIT_UNAVAILABLE','Shared route protection timed out.')),deadlineMs);})]);
   if(!result||!Number.isSafeInteger(result.usageCount)||result.usageCount<1||result.usageCount>policy.limit+1||!Number.isSafeInteger(result.retryAfterSeconds)||result.retryAfterSeconds<1||result.retryAfterSeconds>3600)fail();
   const allowed=result.usageCount<=policy.limit;
   return Object.freeze({allowed,remaining:Math.max(0,policy.limit-result.usageCount),retryAfterSeconds:allowed?0:result.retryAfterSeconds});
  }catch{fail();}finally{clearTimeout(timer);}
 };
}
