import {readFile} from 'node:fs/promises';import {launchMatrix} from '../../src/lib/expansion/registry.mjs';
let config={};if(process.argv[2])config=JSON.parse(await readFile(process.argv[2],'utf8'));
const matrix=launchMatrix(config);console.log(JSON.stringify({checkedAt:new Date().toISOString(),note:'Evidence gate only. This command does not contact providers or verify claimed receipts.',total:matrix.length,customerReady:matrix.filter(x=>x.customerReady).length,matrix},null,2));process.exitCode=matrix.every(x=>x.customerReady)?0:2;
