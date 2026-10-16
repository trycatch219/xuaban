import {cp,readFile} from 'node:fs/promises';import path from 'node:path';import {root} from './paths.mjs';
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
for(const name of ['marked','dompurify','katex']){const installed=JSON.parse(await readFile(path.join(root,'node_modules',name,'package.json'),'utf8'));if(installed.version!==pkg.devDependencies[name])throw new Error(name+' 版本不匹配，请运行 npm ci');}
for(const [src,dest]of [['marked/lib/marked.esm.js','marked.js'],['marked/LICENSE','MARKED-LICENSE.txt'],['dompurify/dist/purify.es.mjs','purify.mjs'],['dompurify/LICENSE','DOMPURIFY-LICENSE.txt'],['katex/dist/katex.mjs','katex/katex.mjs'],['katex/dist/katex.min.css','katex/katex.min.css'],['katex/dist/fonts','katex/fonts'],['katex/LICENSE','KATEX-LICENSE.txt']])await cp(path.join(root,'node_modules',src),path.join(root,'extension/vendor',dest),{recursive:true});
console.log('已同步锁定版本的本地渲染依赖与许可证。');
