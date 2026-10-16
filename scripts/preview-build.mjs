import {spawnSync} from 'node:child_process';import {root} from './paths.mjs';
for(const file of ['build-context-preview.mjs','build-image-preview.mjs']){const r=spawnSync(process.execPath,['scripts/'+file],{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
