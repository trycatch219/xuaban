import assert from 'node:assert/strict';
import {requestSpec,ask,endpointURL} from '../extension/llm.js';
import {modelProfile,listModels,permissionPattern} from '../extension/profiles.js';
import {storedCredentials} from '../extension/settings-ui.js';
import {searchRequest,normalizeResults,searchWeb,webPrompt} from '../extension/web-search.js';
const ollama={provider:'ollama',endpoint:'http://127.0.0.1:11434'};
assert.equal(endpointURL(ollama.endpoint,ollama.provider).href,'http://127.0.0.1:11434/api/chat');assert.equal(permissionPattern(ollama.endpoint),'http://127.0.0.1/*');
const parts=[{type:'text',text:'解释图片'},{type:'image_url',image_url:{url:'data:image/png;base64,YWJj'}}];
const spec=requestSpec(ollama,'',[{role:'user',content:parts}],'vision');assert.deepEqual(spec.body.messages[1].images,['YWJj']);assert.equal(spec.body.messages[1].content,'解释图片');assert.equal(spec.headers.Authorization,undefined);
const config={...ollama,textModel:'local-text',visionModel:'remote-vision',vision:{independent:true,provider:'compatible',endpoint:'https://vision.test/v1'}};
assert.equal(modelProfile(config,{model:'',vision:'different-key'},true).key,'different-key');assert.equal(modelProfile(config,{},false).endpoint,ollama.endpoint);
assert.equal(modelProfile({...config,vision:undefined},{model:'legacy'},true).key,'legacy');assert.equal(storedCredentials({apiKey:'legacy'},{}).model,'legacy');assert.equal(storedCredentials({credentials:{model:'old'}},{credentials:{model:'new'}}).model,'new');
const search={endpoint:'https://api.search.test/search',domains:'docs.example.com',timeRange:'month'};
const req=searchRequest(search,'search-secret','技术最新变化');assert.equal(req.body.include_raw_content,'text');assert.equal(req.body.time_range,'month');assert.deepEqual(req.body.include_domains,['docs.example.com']);assert.equal(req.headers.Authorization,'Bearer search-secret');assert.ok(!JSON.stringify(req.body).includes('secret'));assert.throws(()=>searchRequest(search,'','a'));assert.throws(()=>searchRequest({...search,domains:'https://wrong.test'},'key','a'));
const refs=normalizeResults({results:[{url:'https://docs.test/new',title:'官方文档',raw_content:'正文资料',content:'摘要',published_date:'2026-10-15'},{url:'https://docs.test/new',content:'重复'},{url:'javascript:alert(1)',content:'恶意'},{url:'https://docs.test/other',title:'其他',content:'只有摘要'}]});assert.equal(refs.length,2);assert.equal(refs[0].reading,'正文摘录');assert.equal(refs[1].publishedDate,null);assert.equal(refs[1].reading,'搜索摘要');assert.ok(webPrompt({query:'q',refs}).includes('检索时间不是发布时间'));
const realFetch=globalThis.fetch;
try{
  const bytes=new TextEncoder().encode(JSON.stringify({message:{content:'你好'},done:false})+'\n'+JSON.stringify({message:{content:'，本地模型'},done:true}));
  globalThis.fetch=async()=>new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=2)c.enqueue(bytes.slice(i,i+2));c.close();}}),{headers:{'content-type':'application/x-ndjson'}});let text='';await ask(ollama,'',[{role:'user',content:'你好'}],'local',null,t=>text+=t);assert.equal(text,'你好，本地模型');
  globalThis.fetch=async()=>new Response('{"error":"model missing"}\n');await assert.rejects(()=>ask(ollama,'',[],'missing',null,()=>{}),/model missing/);
  globalThis.fetch=async()=>new Response('{"message":{"content":"非流式"},"done":true}');text='';await ask(ollama,'',[],'local',null,t=>text+=t);assert.equal(text,'非流式');
  globalThis.fetch=async(url,options)=>{assert.equal(String(url),'http://127.0.0.1:11434/api/tags');assert.equal(options.headers.Authorization,undefined);return new Response('{"models":[{"name":"local-text"}]}');};assert.deepEqual(await listModels({...ollama,key:''}),['local-text']);
  globalThis.fetch=async(url,options)=>{assert.equal(String(url),'http://127.0.0.1:1234/v1/models');return new Response('{"data":[{"id":"lm-model"}]}');};assert.deepEqual(await listModels({provider:'lmstudio',endpoint:'http://127.0.0.1:1234/v1'}),['lm-model']);
  globalThis.fetch=async()=>new Response(JSON.stringify({results:[{url:'https://docs.test/',content:'结果'}]}));assert.equal((await searchWeb(search,'secret','q')).length,1);
  globalThis.fetch=async()=>new Response('{}',{status:429});await assert.rejects(()=>searchWeb(search,'secret','q'),/429/);
  globalThis.fetch=async()=>new Response('{"results":[]}');await assert.rejects(()=>searchWeb(search,'secret','q'),/没有可用/);
}finally{globalThis.fetch=realFetch;}
console.log('通过：Ollama 图片与 NDJSON / UTF-8 分块、无 Key 本机调用、独立视觉连接、旧设置迁移、模型列表、搜索请求、正文/摘要/日期、失败与空结果。');
