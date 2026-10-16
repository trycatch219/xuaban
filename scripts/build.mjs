import {cp,mkdir,readFile,writeFile,readdir,lstat,rm} from 'node:fs/promises';
import path from 'node:path';
import {root} from './paths.mjs';
const dist=path.join(root,'dist');await mkdir(dist,{recursive:true});if((await lstat(dist)).isSymbolicLink())throw new Error('拒绝写入符号链接 dist');
for(const name of ['chromium','firefox']){
 const target=path.resolve(dist,name);if(path.dirname(target)!==dist)throw new Error('构建路径超出 dist');
 try{if((await lstat(target)).isSymbolicLink())throw new Error('拒绝清理符号链接构建目录');await rm(target,{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
 await cp(path.join(root,'extension'),target,{recursive:true});
 if(name==='firefox')await cp(path.join(root,'manifests/firefox.json'),path.join(target,'manifest.json'));
 for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md','PRIVACY.md'])await cp(path.join(root,file),path.join(target,file));
 const notices=await readFile(path.join(target,'THIRD_PARTY_NOTICES.md'),'utf8');await writeFile(path.join(target,'THIRD_PARTY_NOTICES.md'),notices.replaceAll('extension/vendor/','vendor/'));
 console.log('已构建 dist/'+name);
}
