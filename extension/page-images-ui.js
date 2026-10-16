import {rankImages,imageOrigin,imageFromURL,pngBytes,MAX_IMAGE_BYTES,IMAGE_LIMIT} from './image-context.js';
export async function imageReview(review,{api,question,materials,container,isCurrent,isBusy,toast,capture}){
  const images=rankImages(review.snapshot,question,materials);review.images=images;review.imageAbort=new AbortController();
  const section=document.createElement('details');section.className='page-images';section.open=images.some(i=>i.recommended);
  const summary=document.createElement('summary');summary.textContent=`选择网页图片 · ${images.length} 张候选 · 最多 ${IMAGE_LIMIT} 张`;section.append(summary);
  const note=document.createElement('p');note.className='note';note.textContent='按图注和周围文字推荐。只发送勾选且预览成功的图片；可展开补选其他候选。';section.append(note);
  container.append(section);
  if(!images.length){note.textContent='当前正文未发现已加载的内容图片，可使用截图素材。';return;}
  function select(image,check){if(images.filter(i=>i.selected).length>=IMAGE_LIMIT){check.checked=false;image.selected=false;toast('每轮最多选择 3 张网页图片，请先取消其他图片。');return;}image.selected=true;check.checked=true;}
  const tasks=[];
  for(const image of images){
    const card=document.createElement('div');card.className='page-image-card';
    const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.disabled=true;check.dataset.unloaded='true';check.setAttribute('aria-label','发送图片：'+(image.alt||image.caption||`图片 ${image.order+1}`));
    const title=document.createElement('span');title.textContent=(image.recommended?'推荐 · ':'')+(image.alt||image.caption||`网页图片 ${image.order+1}`);label.append(check,title);
    const preview=document.createElement('img');preview.hidden=true;preview.alt=image.alt||'网页图片预览';
    const status=document.createElement('p');status.className='note';status.textContent=`${image.width} × ${image.height} · ${image.heading||'无文字说明'}`;
    const actions=document.createElement('div');actions.className='actions';const load=document.createElement('button');load.type='button';load.textContent='载入图片预览';
    const screenshot=document.createElement('button');screenshot.type='button';screenshot.textContent='定位后截图';
    screenshot.onclick=async()=>{try{const result=await api.tabs.sendMessage(review.snapshot.tabId,{type:'locate-source-v2',ref:{...image,url:review.snapshot.url}});if(result?.error)throw new Error(result.error);await capture();}catch(e){toast(e.message);}};
    check.onchange=()=>{if(isBusy()){check.checked=!!image.selected;return;}if(check.checked)select(image,check);else image.selected=false;};
    async function fetchImage(grant=false,automatic=false){
      if(isBusy()&&!automatic)return;
      load.disabled=true;status.textContent='正在载入本地图片预览…';const abort=new AbortController();const cancel=()=>abort.abort();review.imageAbort.signal.addEventListener('abort',cancel,{once:true});const timeout=setTimeout(cancel,20000);
      try{
        if(grant){const origin=imageOrigin(image.src);if(!await api.permissions.request({origins:[origin]}))throw new Error('未授予原图域名权限，可使用截图。');}
        const local=await api.tabs.sendMessage(review.snapshot.tabId,{type:'page-image',id:image.id,src:image.src,url:review.snapshot.url});let result=local;
        if(!local?.data){
          const origin=imageOrigin(image.src);
          if(!await api.permissions.contains({origins:[origin]})){image.needsPermission=true;throw new Error('网页限制直接读取。可授权此原图域名，或使用截图。');}
          result=await imageFromURL(image.src,abort.signal);
        }
        if(!isCurrent()||abort.signal.aborted)return;
        if(pngBytes(result.data)>MAX_IMAGE_BYTES)throw new Error('图片超过压缩预算，请使用截图');
        Object.assign(image,{data:result.data,sentWidth:result.width,sentHeight:result.height,needsPermission:false});preview.src=result.data;preview.hidden=false;delete check.dataset.unloaded;check.disabled=false;
        status.textContent=`预览就绪 · ${result.width} × ${result.height} · ${Math.ceil(pngBytes(result.data)/1024)} KB`;load.hidden=true;select(image,check);
      }catch(e){if(isCurrent()){status.textContent=abort.signal.aborted?'载入超时或已取消，可重试或截图。':e.message;load.textContent=image.needsPermission?'授权原图域名并载入':'重试载入';}}
      finally{clearTimeout(timeout);review.imageAbort.signal.removeEventListener('abort',cancel);load.disabled=false;}
    }
    load.onclick=()=>fetchImage(!!image.needsPermission);
    actions.append(load,screenshot);card.append(label,preview,status,actions);section.append(card);
    if(image.recommended)tasks.push(fetchImage(false,true));
  }
  await Promise.allSettled(tasks);
}
