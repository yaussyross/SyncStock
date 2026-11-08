import {writeFile,mkdir} from 'node:fs/promises';
import {EXPERIENCES,SOURCES} from './accounting-gates.mjs';
import {sale,syntheticDestinationContext} from './fixtures.mjs';
import {compileDestination,aggregatePreviews} from './destination-preview.mjs';
const out=new URL('./evidence/',import.meta.url);await mkdir(out,{recursive:true});
const matrix=[];
for(const experience of EXPERIENCES){
  const sources=experience.source==='multichannel'?SOURCES:[experience.source];
  const previews=sources.map((source,index)=>{const candidate=sale(source,experience.destination,{economicEventId:`fictional-independent-sale-${source}-${index}`});return compileDestination(candidate,syntheticDestinationContext(candidate));});
  const result=experience.source==='multichannel'?aggregatePreviews(previews):previews[0];
  await writeFile(new URL(`${experience.source}-to-${experience.destination}.json`,out),JSON.stringify({warning:'Fictional local validation output. No source API or accounting API was called.',experience,result},null,2));
  matrix.push({...experience,localAccountingFixture:'passed',destinationCompilation:'passed',sourceApiAcceptance:'not_run',destinationApiAcceptance:'not_run',sharedWriterRaceTest:'not_run',publicDeployment:'not_done',liveConnectionClaim:false});
}
await writeFile(new URL('acceptance-matrix.json',out),JSON.stringify({canonicalBase:'7b61a906e03efa0a5d48eb239b8cecf0e33b3027',newIsolatedPatch:true,mode:'synthetic_no_network',experiences:matrix},null,2));
console.log(`Generated ${matrix.length} data-only experience artifacts and one explicit acceptance matrix.`);
