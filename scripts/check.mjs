import {readdir,readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {root} from './paths.mjs';
async function walk(dir){let files=[];for(const item of await readdir(dir,{withFileTypes:true})){if(['node_modules','dist','.git','.npm-cache'].includes(item.name))continue;const file=path.join(dir,item.name);if(item.isDirectory())files.push(...await walk(file));else files.push(file);}return files;}
for(const file of await walk(root))if(/\.(?:cjs|mjs|js)$/.test(file)){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||file);}
const manifest=JSON.parse(await readFile(path.join(root,'extension/manifest.json'),'utf8'));const firefox=JSON.parse(await readFile(path.join(root,'manifests/firefox.json'),'utf8'));const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
assert.equal(manifest.version,pkg.version);assert.equal(firefox.version,pkg.version);assert.equal(manifest.manifest_version,3);assert.ok(!manifest.host_permissions);
const html=await readFile(path.join(root,'extension/panel.html'),'utf8');for(const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g))await access(path.join(root,'extension',match[1]));
console.log('通过：JavaScript 语法、版本一致性、Manifest 与页面资源引用。');
