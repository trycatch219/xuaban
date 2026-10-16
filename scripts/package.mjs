import './build.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {root} from './paths.mjs';
import {zipFolder} from './zip.mjs';
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));const sums=[];
for(const browser of ['chromium','firefox']){const name=`xueban-${browser}-${version}.zip`;const file=path.join(root,'dist',name);await zipFolder(path.join(root,'dist',browser),file);sums.push(createHash('sha256').update(await readFile(file)).digest('hex')+'  '+name);console.log('已打包 dist/'+name);}
await writeFile(path.join(root,'dist/SHA256SUMS.txt'),sums.join('\n')+'\n');
