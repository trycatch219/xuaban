const api = globalThis.browser || globalThis.chrome;
import {ask, endpointURL} from './llm.js';
import {formatted} from './render.js';
import {retrieve, fingerprint, pageURL, contextPrompt, assignCitations, sourceMap, citationButtons} from './context.js';
import {imageReview} from './page-images-ui.js';
import {modelProfile,listModels,serviceURL,permissionPattern} from './profiles.js';
import {formConfig,formCredentials,storedCredentials,fillForm} from './settings-ui.js';
import {searchWeb,webPrompt} from './web-search.js';
const $ = id => document.getElementById(id);
let config={}, key='', conversation=fresh(), pending=null, controller=null, busy=false, tabId=null;
let review=null, webReview=null, credentials={model:'',vision:'',search:''};
function invalidateSearch(){webReview=null;$('web-preview').hidden=true;$('web-results').replaceChildren();$('search-status').textContent='搜索词会发送至搜索服务；本地推理也不例外。';}
function searchReviewKey(question){return fingerprint(JSON.stringify({question,query:$('search-query').value.trim(),config:config.search||{},conversation:conversation.id,messages:conversation.messages.length}));}
function appendWebSources(node,context){const details=document.createElement('details'),summary=document.createElement('summary');details.className='message-context';summary.textContent='已发送联网参考 · '+context.refs.length+' 个来源';details.append(summary);for(const ref of context.refs){const b=document.createElement('button');b.textContent='来源 '+ref.citation;b.onclick=()=>showSource(ref);details.append(b);}node.append(details);}
async function prepareSearch(question=$('question').value.trim()){
  if(busy)return;
  if(!credentials.search){toast('请先在设置中配置搜索 API Key');view('settings');return;}
  const query=$('search-query').value.trim()||question;if(!query){toast('请填写搜索词');return;}$('search-query').value=query;
  const signature=searchReviewKey(question),abort=new AbortController();controller=abort;setBusy(true);$('search-status').textContent='正在联网搜索并读取服务返回的正文…';const timeout=setTimeout(()=>abort.abort(),45000);
  try{
    const url=serviceURL(config.search?.endpoint||'https://api.tavily.com/search');await authorize({endpoint:url.origin,provider:'compatible'});
    const refs=await searchWeb(config.search||{},credentials.search,query,abort.signal);
    if(signature!==searchReviewKey($('question').value.trim()))throw new Error('问题已改变，请确认搜索词后重新搜索');
    webReview={refs,query,key:signature,selected:new Set(refs.map(r=>r.id))};$('web-results').replaceChildren();
    for(const ref of refs){const details=document.createElement('details');details.className='context-card';const summary=document.createElement('summary'),check=document.createElement('input');check.type='checkbox';check.checked=true;check.setAttribute('aria-label','使用联网来源：'+ref.title);check.onclick=e=>e.stopPropagation();check.onchange=()=>{if(busy){check.checked=webReview.selected.has(ref.id);return;}if(check.checked)webReview.selected.add(ref.id);else webReview.selected.delete(ref.id);};const title=document.createElement('span');title.textContent=ref.title;summary.append(check,title);const meta=document.createElement('p');meta.className='note';meta.textContent=ref.reading+' · '+new URL(ref.url).hostname+' · 发布：'+(ref.publishedDate||'未提供')+' · 检索：'+new Date(ref.retrievedAt).toLocaleString('zh-CN');const text=document.createElement('pre');text.textContent=ref.text;details.append(summary,meta,text);$('web-results').append(details);}
    $('web-preview').hidden=false;$('web-preview').open=true;$('search-status').textContent='检索成功 · '+refs.length+' 个来源。请检查引用，确认后再发送给模型。';$('send').textContent='确认发送 ↑';
  }catch(e){invalidateSearch();$('search-status').textContent=abort.signal.aborted?'搜索已停止或超时；未调用模型。':e.message;toast($('search-status').textContent);}
  finally{clearTimeout(timeout);controller=null;setBusy(false);}
}
async function loadModelOptions(image=false){
  const target=modelProfile(readSettings(),formCredentials($),image),button=image?$('vision-models'):$('text-models');button.disabled=true;const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
  try{await authorize(target);const names=await listModels(target,abort.signal);const list=image?$('vision-model-list'):$('text-model-list');list.replaceChildren();for(const name of names){const option=document.createElement('option');option.value=name;list.append(option);}$('test-status').textContent='读取到 '+names.length+' 个模型；请在模型输入框选择。列表不代表支持图片，请另做图片测试。';}catch(e){$('test-status').textContent='读取失败：'+(abort.signal.aborted?'连接超时':e.message);}finally{clearTimeout(timer);button.disabled=false;}
}
function invalidateContext() {
  invalidateSearch();
  review?.imageAbort?.abort();
  review=null; $('context-preview').hidden=true; $('context-results').replaceChildren();
  $('send').textContent=$('page-context-toggle').checked?'检索并预览':'发送 ↑';
  $('context-status').textContent=$('page-context-toggle').checked?'将相关网页内容发送至已配置的模型服务。先预览，再确认发送。':'仅发送选中素材与对话；不发送检索出的网页片段。';
}
function reviewKey(question) { return fingerprint(JSON.stringify({id:conversation.id,question,materials:conversation.materials.map(m=>m.id),previous:conversation.messages.length})); }
async function readContextPage() {
  const [active]=await api.tabs.query({active:true,currentWindow:true});
  if(!active)throw new Error('未找到当前网页');
  const binding=conversation.contextBinding;
  const materialSource=conversation.materials.find(m=>m.url)||conversation.messages.flatMap(m=>m.materials||[]).find(m=>m.url);
  const expected=binding?.url||materialSource?.url;
  if(expected&&pageURL(active.url)!==pageURL(expected))throw new Error('当前网页与对话来源不同，请返回原网页，或点击 ＋ 开始本页对话。');
  try { await api.scripting.executeScript({target:{tabId:active.id},files:['context-page.js']}); }
  catch { throw new Error('无法读取此网页。请先点击工具栏的学伴图标授权当前页；浏览器内部页及商店页不支持正文读取。'); }
  const result=await api.tabs.sendMessage(active.id,{type:'page-context-v2'});
  if(result?.error)throw new Error(result.error);
  if(!result?.snapshot)throw new Error('网页正文读取失败');
  const snapshot={...result.snapshot,tabId:active.id};
  if(expected&&pageURL(snapshot.url)!==pageURL(expected))throw new Error('读取时网页已跳转，请重新选择素材。');
  return snapshot;
}
async function showReview(snapshot, question) {
  const selected=conversation.materials.length?conversation.materials:conversation.messages.findLast(m=>m.role==='user'&&m.materials?.length)?.materials||[];
  const previous=conversation.messages.filter(m=>m.role==='user').slice(-3).map(m=>m.text).join('\n').slice(-3000);
  const result=retrieve(snapshot,question,selected,previous);
  review={...result,snapshot,key:reviewKey(question),selected:new Set(result.refs.map(r=>r.id))};
  $('context-results').replaceChildren();
  const mode={whole:'网页有效正文',retrieval:'与问题相关的片段',overview:'跨章节代表片段',empty:'无正文'}[result.mode];
  $('context-status').textContent=result.refs.length?`已读取「${snapshot.title}」· ${mode} · ${result.refs.length} 个片段${snapshot.truncated?'（正文读取达到上限）':''}`:result.reason;
  $('context-warning').textContent=[result.reason,snapshot.truncated?'正文最多读取 200 个片段／24 万字符，未覆盖完整页面。':'','可取消勾选不需要的片段。当前预览仅在本地，确认后才发送至模型服务。'].filter(Boolean).join(' ');
  result.refs.forEach((ref,index)=>{
    const details=document.createElement('details');details.className='context-card';
    const summary=document.createElement('summary'),check=document.createElement('input');check.type='checkbox';check.checked=true;check.setAttribute('aria-label',`引用片段 ${index+1}`);
    check.onclick=e=>e.stopPropagation();check.onchange=()=>{if(check.checked)review.selected.add(ref.id);else review.selected.delete(ref.id);};
    const title=document.createElement('span');title.textContent=`${index+1}. ${ref.heading||ref.kind==='code'&&'代码片段'||'正文片段'}`;
    summary.append(check,title);const text=document.createElement('pre');text.textContent=ref.text;details.append(summary,text);$('context-results').append(details);
  });
  $('context-preview').hidden=false;$('context-preview').open=true;$('send').textContent=result.refs.length?'确认发送 ↑':'重新检索';
  const current=review;
  await imageReview(current,{api,question,materials:selected,container:$('context-results'),isCurrent:()=>review===current,isBusy:()=>busy,toast,capture});
  if(review===current&&current.images?.length)$('send').textContent='确认发送 ↑';
}
async function showSource(ref) {
  $('source-locate').hidden=ref.kind==='web';
  $('source-title').textContent=`来源 ${ref.citation} · ${ref.heading||ref.title}`;$('source-text').textContent=ref.text;
  $('source-image').hidden=!(ref.kind==='image'&&ref.data);if(ref.kind==='image'&&ref.data)$('source-image').src=ref.data;else $('source-image').removeAttribute('src');
  $('source-status').textContent=ref.kind==='web'?ref.reading+' · 发布：'+(ref.publishedDate||'未提供')+' · 检索：'+new Date(ref.retrievedAt).toLocaleString('zh-CN'):'';$('source-dialog').showModal();
  $('source-locate').onclick=async()=>{
    try {
      let tab;try{tab=await api.tabs.get(ref.tabId);}catch{}
      if(!tab||pageURL(tab.url)!==pageURL(ref.url)){const tabs=await api.tabs.query({currentWindow:true});tab=tabs.find(t=>{try{return pageURL(t.url)===pageURL(ref.url);}catch{return false;}});}
      if(!tab)throw new Error('原网页未打开，请手动打开来源链接后再定位。');
      await api.tabs.update(tab.id,{active:true});
      await api.scripting.executeScript({target:{tabId:tab.id},files:['context-page.js']});
      const result=await api.tabs.sendMessage(tab.id,{type:'locate-source-v2',ref});
      if(result?.error)throw new Error(result.error);
      $('source-status').textContent='已滚动到原文并高亮';
    }catch(e){$('source-status').textContent=e.message;}
  };
  const url=safeLink(ref.url);$('source-link').textContent=ref.title||'打开来源网页';if(url)$('source-link').href=url;else $('source-link').removeAttribute('href');
}
function fresh(){return {id:crypto.randomUUID(),date:Date.now(),materials:[],messages:[],provider:null,endpoint:null};}
const dbReady=new Promise((resolve,reject)=>{const r=indexedDB.open('xueban',1);r.onupgradeneeded=()=>r.result.createObjectStore('conversations',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function dbOp(mode,fn){const db=await dbReady;return new Promise((resolve,reject)=>{const tx=db.transaction('conversations',mode);const result=fn(tx.objectStore('conversations'));tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error);});}
async function persist(){if(config.saveHistory!==false&&conversation.messages.length)await dbOp('readwrite',s=>s.put(structuredClone(conversation)));}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,5000);}
function view(name){$('chat').hidden=name!=='chat';$('composer').hidden=name!=='chat';$('settings-view').hidden=name!=='settings';$('history-view').hidden=name!=='history';if(name==='history')renderHistory();}
function safeLink(url){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function materialNode(m){const div=document.createElement('div');const label=document.createElement('div');label.className='section-label';label.textContent=m.type==='text'?'已选文字':m.time!=null?`视频截图 · ${Math.floor(m.time/60)}:${String(Math.floor(m.time%60)).padStart(2,'0')}`:'图片截图';div.append(label);if(m.type==='text'){const text=document.createElement('div');text.className='excerpt';text.textContent=m.text;div.append(text);}else{const img=document.createElement('img');img.className='attachment';img.src=m.data;img.alt='待提问截图';div.append(img);}const source=document.createElement('div');source.className='source';const a=document.createElement('a');a.textContent=m.title||'网页素材';const url=safeLink(m.url);if(url){a.href=url;a.target='_blank';a.rel='noopener noreferrer';}source.append(a);div.append(source);return div;}
function render(){
  $('model-badge').textContent=config.textModel||'尚未连接模型';
  $('material').replaceChildren();$('material').hidden=!conversation.materials.length;
  conversation.materials.forEach((m,i)=>{const node=materialNode(m);if(!conversation.messages.length){const remove=document.createElement('button');remove.textContent='删除素材';remove.onclick=()=>{conversation.materials.splice(i,1);invalidateContext();render();};node.append(remove);}$('material').append(node);});
  if(!conversation.messages.length){$('messages').innerHTML='<div class="welcome"><div class="orb">✧</div><h1>带着问题，开始理解</h1><p>选中文字或截取画面，再输入你的问题。也可以直接提问。</p></div>';return;}
  $('messages').replaceChildren();
  conversation.messages.forEach(m=>{const node=document.createElement('article');node.className='message '+m.role;const speaker=document.createElement('div');speaker.className='speaker';speaker.textContent=m.role==='user'?'你':'✧ 学伴'+(m.model?' · '+m.model:'');const answerNode=formatted(m.text||'正在思考…',{streaming:busy&&m===conversation.messages.at(-1)});if(m.role==='assistant')citationButtons(answerNode,sourceMap(conversation.messages.slice(0,conversation.messages.indexOf(m)+1)),showSource);node.append(speaker,answerNode);if(m.webSearch)appendWebSources(node,m.webSearch);if(m.pageContext){const details=document.createElement('details');details.className='message-context';const summary=document.createElement('summary');summary.textContent='已发送网页参考 · '+m.pageContext.refs.length+' 个片段';details.append(summary);for(const ref of m.pageContext.refs){const b=document.createElement('button');b.className='citation';b.textContent='来源 '+ref.citation;b.onclick=()=>showSource({...ref,url:m.pageContext.url,title:m.pageContext.title,tabId:m.pageContext.tabId});details.append(b);}node.append(details);}if(m.status){const note=document.createElement('div');note.className=m.status.startsWith('失败')?'error':'note';note.textContent=m.status;node.append(note);}if(m.role==='assistant'&&m.text){const tools=document.createElement('div');tools.className='message-tools';const copy=document.createElement('button');copy.textContent='复制';copy.onclick=()=>navigator.clipboard.writeText(m.text).then(()=>toast('已复制')).catch(()=>toast('复制失败'));tools.append(copy);node.append(tools);}$('messages').append(node);});
  $('chat').scrollTop=$('chat').scrollHeight;
}
async function incoming(m){if(!m)return;if(m.type==='image'&&m.rect){const img=new Image();img.src=m.data;await img.decode();const canvas=document.createElement('canvas');const sx=img.width/m.viewport.width,sy=img.height/m.viewport.height;canvas.width=Math.round(m.rect.width*sx);canvas.height=Math.round(m.rect.height*sy);canvas.getContext('2d').drawImage(img,m.rect.x*sx,m.rect.y*sy,m.rect.width*sx,m.rect.height*sy,0,0,canvas.width,canvas.height);m={...m,data:canvas.toDataURL('image/png')};delete m.rect;delete m.viewport;}
  invalidateContext();
  await api.storage.session.remove('incoming');pending=m;view('chat');
  if(!conversation.messages.length&&!busy){conversation.materials.push(m);if(m.question)$('question').value=m.question;pending=null;render();return;}
  $('pending-preview').replaceChildren(materialNode(m));$('pending').hidden=false;
}
function setBusy(value){busy=value;$('send').hidden=value;$('stop').hidden=!value;for(const id of ['new','use-new','use-current','capture','settings','history','page-context-toggle','web-search-toggle','run-search','search-query'])$(id).disabled=value;document.querySelectorAll('#context-results input,#context-results button').forEach(input=>input.disabled=value||input.dataset.unloaded==='true');}
function messagesForApi(){return conversation.messages.filter(m=>m.role==='user'||(m.role==='assistant'&&m.text&&!m.status)).map(m=>{if(m.role==='assistant')return {role:m.role,content:m.text};const materials=m.materials||[];const parts=[{type:'text',text:(materials.filter(a=>a.type==='text').map(a=>'引用素材：\n'+a.text).join('\n\n')+'\n\n问题：'+m.text+($('page-context-toggle').checked?contextPrompt(m.pageContext):'')+($('web-search-toggle').checked?webPrompt(m.webSearch):'')).trim()}];if($('page-context-toggle').checked)for(const ref of m.pageContext?.refs||[]){if(ref.kind==='image'&&ref.data)parts.push({type:'text',text:'下面图片对应 [来源 '+ref.citation+']：'+ref.text},{type:'image_url',image_url:{url:ref.data}});}materials.filter(a=>a.type==='image').forEach(a=>parts.push({type:'image_url',image_url:{url:a.data}}));return {role:'user',content:parts.length===1?parts[0].text:parts};});}
async function send(){
  if(busy)return;const question=$('question').value.trim();if(!question){toast('请先输入问题');return;}
  if(!config.endpoint||!config.textModel){toast('请先配置服务地址与模型');view('settings');return;}
  let hasImage=conversation.materials.some(m=>m.type==='image')||conversation.messages.some(m=>m.materials?.some(a=>a.type==='image')||($('page-context-toggle').checked&&m.pageContext?.refs.some(r=>r.kind==='image'&&r.data)));
  if(hasImage&&!config.visionModel){toast('图片提问需要配置视觉模型');view('settings');return;}

  let pageContext=null;
  if($('page-context-toggle').checked){
    controller=new AbortController();setBusy(true);$('context-status').textContent='正在读取网页并本地检索…';
    try {
      const snapshot=await readContextPage();
      if(controller.signal.aborted)throw new Error('已取消正文检索');
      if($('question').value.trim()!==question){invalidateContext();throw new Error('问题已修改，请重新预览');}
      if(!review||review.key!==reviewKey(question)||review.snapshot.signature!==snapshot.signature||pageURL(review.snapshot.url)!==pageURL(snapshot.url)){
        const changed=!!review&&review.snapshot.signature!==snapshot.signature;
        await showReview(snapshot,question);if(changed)toast('网页内容已变化，请检查新的引用片段');return;
      }
      const selectedImages=(review.images||[]).filter(i=>i.selected&&i.data).map(i=>({...i,text:i.caption||i.alt||i.heading||'网页图片',kind:'image'}));
      const refs=assignCitations([...review.refs.filter(r=>review.selected.has(r.id)),...selectedImages],conversation.messages);
      if(!refs.length)throw new Error('请至少选择一个引用片段，或关闭“结合当前网页”。');
      pageContext={refs,mode:review.mode,title:snapshot.title,url:snapshot.url,tabId:snapshot.tabId,signature:snapshot.signature,truncated:snapshot.truncated,capturedAt:snapshot.capturedAt};
    }catch(e){$('context-status').textContent=e.message;toast(e.message);return;}
    finally{controller=null;setBusy(false);}
  }
  hasImage=hasImage||!!pageContext?.refs.some(r=>r.kind==='image'&&r.data);
  if(hasImage&&!config.visionModel){toast('本次引用包含图片，请先配置视觉模型');view('settings');return;}
  let webContext=null;
  if($('web-search-toggle').checked){
    if(!webReview||webReview.key!==searchReviewKey(question)){await prepareSearch(question);return;}
    const refs=webReview.refs.filter(r=>webReview.selected.has(r.id));
    if(!refs.length){toast('请至少选择一个联网来源，或关闭联网搜索');return;}
    webContext={query:webReview.query,refs:assignCitations(refs,[...conversation.messages,...(pageContext?[{pageContext}]:[])])};
  }
  const target=modelProfile(config,credentials,hasImage);
  if(!target.endpoint||!target.model){toast('请检查本次使用的模型连接设置');view('settings');return;}
  if(conversation.endpoint&&conversation.endpoint!==target.endpoint&&!confirm('当前对话将发送到另一个模型服务地址，是否继续？'))return;
  setBusy(true);
  try{await authorize(target);}catch(e){setBusy(false);toast(e.message);return;}
  if($('question').value.trim()!==question){setBusy(false);invalidateContext();toast('问题已修改，请重新发送');return;}
  const user={role:'user',text:question,materials:structuredClone(conversation.materials),...(pageContext?{pageContext}:{}),...(webContext?{webSearch:webContext}:{})};
  if(pageContext)conversation.contextBinding={url:pageContext.url,title:pageContext.title,tabId:pageContext.tabId,signature:pageContext.signature};
  conversation.pageMode=$('page-context-toggle').checked;conversation.webMode=$('web-search-toggle').checked;conversation.materials=[];conversation.messages.push(user);conversation.provider=target.provider;conversation.endpoint=target.endpoint;
  invalidateContext();
  const apiMessages=messagesForApi();const answer={role:'assistant',text:'',model:target.model};conversation.messages.push(answer);$('question').value='';controller=new AbortController();setBusy(true);render();
  let timeout=setTimeout(()=>controller?.abort('timeout'),120000);
  try{await ask(target,target.key,apiMessages,target.model,controller.signal,text=>{clearTimeout(timeout);timeout=setTimeout(()=>controller?.abort('timeout'),120000);answer.text+=text;render();});}
  catch(e){answer.status=controller.signal.aborted?(controller.signal.reason==='timeout'?'失败：服务响应超时，请重试':'已停止'):'失败：'+(e.message==='Failed to fetch'?'网络连接失败，请检查地址与服务访问限制':e.message);if(!answer.text){conversation.messages.splice(-2);conversation.materials=user.materials;$('question').value=question;toast(answer.status);} }
  finally{clearTimeout(timeout);controller=null;setBusy(false);render();persist().catch(()=>toast('记录保存失败，可能存储空间不足'));}
}
async function authorize(settings){const url=endpointURL(settings.endpoint,settings.provider);const origin=permissionPattern(url);if(await api.permissions.contains({origins:[origin]}))return;if(!await api.permissions.request({origins:[origin]}))throw new Error('需要授予所配置服务的访问权限');}
function readSettings(){return formConfig($);}
async function saveSettings(){
  const next=readSettings(),nextCredentials=formCredentials($);await authorize(next);
  if(next.vision.independent&&next.vision.endpoint)await authorize(next.vision);
  if(nextCredentials.search){const url=serviceURL(next.search.endpoint);await authorize({endpoint:url.origin,provider:'compatible'});}
  await api.storage.local.set({config:next});
  if(next.remember){await api.storage.local.set({credentials:nextCredentials});await api.storage.session.remove(['credentials','apiKey']);}
  else{await api.storage.session.set({credentials:nextCredentials});await api.storage.local.remove(['credentials','apiKey']);}
  await api.storage.local.remove('apiKey');await api.storage.session.remove('apiKey');
  config=next;credentials=nextCredentials;key=credentials.model;invalidateContext();toast('设置已保存');view('chat');render();
}
async function test(image=false){
  const settings=readSettings(),target=modelProfile(settings,formCredentials($),image),status=$('test-status');
  if(!target.endpoint||!target.model){status.textContent='请填写对应模型与服务地址';return;}
  const button=image?$('test-image'):$('test');button.disabled=true;const c=new AbortController(),timer=setTimeout(()=>c.abort(),60000);
  try{await authorize(target);status.textContent=image?'正在测试图片请求…':'正在测试文本请求…';const content=image?[{type:'text',text:'请简单描述这张图片。'},{type:'image_url',image_url:{url:testImage()}}]:'请回复：连接成功';let text='';await ask(target,target.key,[{role:'user',content}],target.model,c.signal,t=>text+=t);status.textContent=(image?'图片请求成功；请确认识别了红色方块。':'文本连接成功。')+' '+text.slice(0,200);}catch(e){status.textContent='测试失败：'+(c.signal.aborted?'连接超时，本地首次加载模型可稍后重试':e.message);}finally{clearTimeout(timer);button.disabled=false;}
}
function testImage(){const c=document.createElement('canvas');c.width=c.height=48;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,48,48);ctx.fillStyle='red';ctx.fillRect(10,10,28,28);return c.toDataURL('image/png');}
async function renderHistory(){const records=await dbOp('readonly',s=>s.getAll());const query=$('search').value.toLowerCase();$('records').replaceChildren();records.sort((a,b)=>b.date-a.date).filter(r=>JSON.stringify(r.messages.map(m=>({text:m.text,titles:m.materials?.map(a=>a.title)}))).toLowerCase().includes(query)).forEach(r=>{const card=document.createElement('div');card.className='record';const title=document.createElement('strong');title.textContent=r.messages.find(m=>m.role==='user')?.text.slice(0,90)||'学习对话';const date=document.createElement('small');date.textContent=new Date(r.date).toLocaleString('zh-CN');card.append(title,date);const actions=document.createElement('div');actions.className='actions';for(const [text,fn]of [['打开',()=>{conversation=r;$('web-search-toggle').checked=!!r.webMode;$('search-options').hidden=!r.webMode;$('search-query').value=r.messages.findLast(m=>m.role==='user')?.text||'';$('page-context-toggle').checked=!!r.pageMode;invalidateContext();$('page-notice').hidden=true;view('chat');render();}],['导出',()=>exportRecord(r)],['删除',async()=>{await dbOp('readwrite',s=>s.delete(r.id));renderHistory();}]]){const b=document.createElement('button');b.textContent=text;b.onclick=fn;actions.append(b);}card.append(actions);$('records').append(card);});if(!$('records').children.length)$('records').textContent='暂无符合条件的学习记录';}
function exportRecord(r){let text='# 学伴学习记录\n\n'+new Date(r.date).toLocaleString('zh-CN')+'\n';r.messages.forEach(m=>{if(m.webSearch){text+='\n### 联网来源\n';for(const ref of m.webSearch.refs)text+='\n[来源 '+ref.citation+'] '+ref.title+'\n'+ref.url+'\n发布：'+(ref.publishedDate||'未提供')+'；检索：'+ref.retrievedAt+'\n'+ref.text+'\n';}if(m.pageContext){text+='\n### 网页引用\n';for(const ref of m.pageContext.refs)text+='\n[来源 '+ref.citation+'] '+(ref.heading||m.pageContext.title)+'\n'+m.pageContext.url+'\n\n'+ref.text+'\n';}text+='\n## '+(m.role==='user'?'提问':'解答')+'\n\n'+m.text+'\n';m.materials?.forEach(a=>{text+='\n来源：'+a.title+' '+a.url+'\n';if(a.text)text+='\n引用：\n'+a.text+'\n';else text+='\n[图片素材保存在浏览器本地记录中]\n';});});const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='学伴学习记录.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function capture(){try{const [tab]=await api.tabs.query({active:true,currentWindow:true});if(!tab)throw new Error('未找到当前网页');await api.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});await api.tabs.sendMessage(tab.id,{type:'capture'});toast('请在网页中框选画面，建议先暂停视频');}catch{toast('无法启用截图，请先点击浏览器工具栏的学伴图标授权当前网页');}}
$('send').onclick=send;$('stop').onclick=()=>{controller?.abort();review?.imageAbort?.abort();};$('capture').onclick=capture;
$('page-context-toggle').onchange=()=>{conversation.pageMode=$('page-context-toggle').checked;invalidateContext();};
$('question').oninput=()=>{if(review)invalidateContext();};
$('source-close').onclick=()=>$('source-dialog').close();
$('web-search-toggle').onchange=()=>{$('search-options').hidden=!$('web-search-toggle').checked;if($('web-search-toggle').checked&&!$('search-query').value)$('search-query').value=$('question').value.trim();invalidateSearch();};
$('search-query').oninput=invalidateSearch;
$('question').addEventListener('input',()=>{if(webReview)invalidateSearch();});
$('run-search').onclick=()=>prepareSearch();
$('vision-independent').onchange=()=>{$('vision-connection').hidden=!$('vision-independent').checked;};
$('text-models').onclick=()=>loadModelOptions();$('vision-models').onclick=()=>loadModelOptions(true);
$('preset-ollama').onclick=()=>{$('provider').value='ollama';$('endpoint').value='http://127.0.0.1:11434';$('test-status').textContent='已填入 Ollama 本机地址，请启动服务并读取模型列表。';};
$('preset-lmstudio').onclick=()=>{$('provider').value='lmstudio';$('endpoint').value='http://127.0.0.1:1234/v1';$('test-status').textContent='已填入 LM Studio 本机地址，请先启动其 API 服务。';};
$('settings').onclick=()=>view($('settings-view').hidden?'settings':'chat');$('history').onclick=()=>view($('history-view').hidden?'history':'chat');$('welcome-settings').onclick=()=>view('settings');
$('new').onclick=async()=>{await persist();conversation=fresh();$('web-search-toggle').checked=false;$('search-options').hidden=true;$('search-query').value='';pending=null;$('pending').hidden=true;$('page-context-toggle').checked=false;invalidateContext();$('question').value='';$('page-notice').hidden=true;render();view('chat');};
$('use-new').onclick=async()=>{await persist();conversation=fresh();$('web-search-toggle').checked=false;$('search-options').hidden=true;$('search-query').value='';conversation.materials=[pending];$('page-context-toggle').checked=false;invalidateContext();$('question').value=pending.question||'';pending=null;$('pending').hidden=true;render();};
$('use-current').onclick=()=>{conversation.materials.push(pending);invalidateContext();if(pending.question)$('question').value=pending.question;pending=null;$('pending').hidden=true;render();};$('discard').onclick=()=>{pending=null;$('pending').hidden=true;};
$('question').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();send();}};
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{$('question').value=b.dataset.prompt;invalidateContext();$('question').focus();});
$('settings-form').onsubmit=e=>{e.preventDefault();saveSettings().catch(e=>toast(e.message));};$('test').onclick=()=>test();$('test-image').onclick=()=>test(true);$('search').oninput=()=>renderHistory();
$('clear').onclick=async()=>{if(confirm('清除所有本地学习记录？此操作无法撤销。')){await dbOp('readwrite',s=>s.clear());toast('学习记录已清除');}};
api.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.incoming?.newValue)incoming(changes.incoming.newValue).catch(e=>toast('素材处理失败：'+e.message));if(area==='session'&&changes.notice?.newValue){toast(changes.notice.newValue);api.storage.session.remove('notice');}});
api.tabs.onActivated.addListener(async info=>{if(info.tabId===tabId)return;tabId=info.tabId;if(conversation.messages.length||conversation.materials.length){$('page-notice').textContent='已切换网页，当前对话仍属于原素材。点击顶部 ＋ 可开始本页对话。';$('page-notice').hidden=false;}});
async function init(){const local=await api.storage.local.get(['config','apiKey','credentials']);const session=await api.storage.session.get(['apiKey','credentials','incoming','notice']);config=local.config||{provider:'compatible',saveHistory:true};credentials=storedCredentials(local,session);key=credentials.model;fillForm(config,credentials,$);const [tab]=await api.tabs.query({active:true,currentWindow:true});tabId=tab?.id;render();if(session.incoming)await incoming(session.incoming);if(session.notice)toast(session.notice);if(location.hash==='#settings'||!config.textModel)view('settings');}
init().catch(e=>toast('初始化失败：'+e.message));
