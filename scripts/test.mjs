import {spawnSync} from 'node:child_process';
import {root} from './paths.mjs';
for(const file of ['xueban-tests.mjs','render-tests.mjs','context-tests.mjs','context-ui-tests.mjs','image-context-tests.mjs','image-load-tests.mjs','services-tests.mjs','services-ui-tests.mjs']){const result=spawnSync(process.execPath,['tests/'+file],{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
