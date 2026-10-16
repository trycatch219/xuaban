(() => {
  const api = globalThis.browser || globalThis.chrome;
  if (typeof globalThis.__xuebanContextV1==='function') api.runtime.onMessage.removeListener(globalThis.__xuebanContextV1);
  const excluded = 'script,style,noscript,nav,aside,footer,form,button,input,textarea,select,[contenteditable="true"],[role="navigation"],[role="banner"],[role="complementary"],[hidden],[aria-hidden="true"],.advertisement,.ads,.comments,#comments,[data-xueban-ui]';
  const selectors = 'h1,h2,h3,h4,h5,h6,p,pre,table,figcaption,dt,dd,li,blockquote,img[alt]';
  let locations = new Map(), imageLocations = new Map();
  const hash = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return (h >>> 0).toString(16); };
  function visible(element) {
    if (element.closest(excluded)) return false;
    for (let e = element; e && e !== document.documentElement; e = e.parentElement) {
      const style = getComputedStyle(e); if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }
  function textOf(element) {
    const clone = element.cloneNode(true);
    const originals = [...element.querySelectorAll('*')], copies = [...clone.querySelectorAll('*')];
    originals.forEach((e, i) => { if (!visible(e)) copies[i].remove(); });
    clone.querySelectorAll(excluded).forEach(e => e.remove());
    clone.querySelectorAll('.katex').forEach(e => { const tex = e.querySelector('annotation')?.textContent; if (tex) e.replaceWith(document.createTextNode(' ' + tex + ' ')); });
    if (element.matches('img')) return '图片说明：' + element.getAttribute('alt');
    if (element.matches('table')) return [...clone.querySelectorAll('tr')].map(r => [...r.querySelectorAll('th,td')].map(c => c.textContent.trim()).join(' | ')).join('\n');
    const text = clone.textContent || '';
    return element.matches('pre') ? text.trim() : text.replace(/[ \t\r]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }
  function chunks(text, limit) {
    if (text.length <= limit) return [text];
    const result = []; let offset = 0;
    while (offset < text.length) {
      let end = Math.min(offset + limit, text.length);
      if (end < text.length) { const line = text.lastIndexOf('\n', end); if (line > offset + limit / 2) end = line + 1; }
      result.push(text.slice(offset, end)); offset = end;
    }
    return result;
  }
  function extract() {
    const roots = [...document.querySelectorAll('article,main,[role="main"]')].filter(visible);
    const root = roots.sort((a, b) => b.textContent.length - a.textContent.length)[0] || document.body;
    if (!root) throw new Error('页面尚未加载正文');
    const candidates = [...root.querySelectorAll(selectors)];
    if (root.matches(selectors)) candidates.unshift(root);
    const blocks = []; const headings = []; locations = new Map(); let total = 0, truncated = false;
    for (const el of candidates) {
      if (!visible(el)) continue;
      if (el.closest('pre,table') && !el.matches('pre,table')) continue;
      if (el.matches('li,blockquote,dd') && el.querySelector('p,pre,table,li,blockquote,dd')) continue;
      // Prefer the paragraph inside a list item; do not duplicate its parent.
      const text = textOf(el); if (!text || text.length < 2) continue;
      if (/^H[1-6]$/.test(el.tagName)) { const level = Number(el.tagName[1]); headings.length = level - 1; headings[level - 1] = text; }
      const kind = el.matches('pre') ? 'code' : el.matches('table') ? 'table' : el.matches('img,figcaption') ? 'caption' : /^H/.test(el.tagName) ? 'heading' : 'text';
      const pieces = chunks(text, kind === 'code' || kind === 'table' ? 5000 : 1400);
      for (const [part, value] of pieces.entries()) {
        if (blocks.length >= 200 || total + value.length > 240000) { truncated = true; break; }
        const id = `b${blocks.length + 1}-${hash(value)}`;
        blocks.push({id, kind, heading: headings.filter(Boolean).join(' › '), text: value, locator: {hash: hash(value), excerpt: value.slice(0, 160), part}});
        locations.set(id, {element: el, text: value}); total += value.length;
      }
      if (truncated) break;
    }
    const images=[];imageLocations=new Map();
    for(const image of root.querySelectorAll('img')){
      if(!visible(image)||images.length>=40)continue;
      const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
      if(width<80||height<60)continue;
      const src=image.currentSrc||image.src;if(!src)continue;
      if(images.some(i=>i.src===src))continue;
      const figure=image.closest('figure');const caption=figure?.querySelector('figcaption')?.textContent.trim()||'';
      const nearby=(figure?.textContent||image.parentElement?.textContent||'').trim().slice(0,1000);
      const preceding=blocks.filter(b=>{const el=locations.get(b.id)?.element;return el&&!!(el.compareDocumentPosition(image)&Node.DOCUMENT_POSITION_FOLLOWING);}).at(-1);
      const rect=image.getBoundingClientRect();const id='img-'+hash(src);
      images.push({id,kind:'image',src,alt:(image.alt||'').slice(0,400),caption:caption.slice(0,600),nearby,heading:preceding?.heading||'',width,height,order:images.length,inViewport:rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth});
      imageLocations.set(id,image);
    }
    if (!blocks.length&&!images.length) throw new Error('未找到可读取的正文或图片；可直接选择文字或截图。');
    return {url: location.href, title: document.title, blocks, images, truncated, capturedAt: Date.now(), signature: hash(location.href.split('#')[0] + blocks.map(b => b.text).join('\n')+JSON.stringify(images.map(i=>[i.src,i.alt,i.caption,i.width,i.height])))};
  }
  function locate(ref) {
    if (location.href.split('#')[0] !== String(ref.url).split('#')[0]) throw new Error('网页已跳转，无法在当前页面定位该来源');
    let target = ref.kind==='image'?imageLocations.get(ref.id):locations.get(ref.id)?.element;
    if(ref.kind==='image'){
      if(!target?.isConnected||(target.currentSrc||target.src)!==ref.src)target=[...document.images].find(i=>visible(i)&&(i.currentSrc||i.src)===ref.src);
      if(!target)throw new Error('原图片已变化或不在当前页面');
    }
    else if (!target?.isConnected || !textOf(target).includes(ref.text)) {
      target = [...document.querySelectorAll(selectors)].find(e => visible(e) && textOf(e).includes(ref.text));
    }
    if (!target) throw new Error('原文已变化或不在当前页面，已保留引用内容供核对');
    target.scrollIntoView({behavior: 'smooth', block: 'center'});
    const value = target.style.getPropertyValue('outline'), priority = target.style.getPropertyPriority('outline');
    target.style.setProperty('outline', '3px solid #8274f3', 'important');
    setTimeout(() => { if (value) target.style.setProperty('outline', value, priority); else target.style.removeProperty('outline'); }, 2600);
    return {ok: true};
  }
  function handler(msg,sender,respond){
    if (!['page-context','page-context-v2','locate-source','locate-source-v2','page-image'].includes(msg.type)) return;
    try {
      if(msg.type==='page-image'){
        if(location.href.split('#')[0]!==String(msg.url).split('#')[0])throw new Error('网页已跳转，请重新检索');
        const image=imageLocations.get(msg.id)||[...document.images].find(i=>visible(i)&&(i.currentSrc||i.src)===msg.src);
        if(!image||!visible(image)||(image.currentSrc||image.src)!==msg.src)throw new Error('原图片已变化，请重新检索');
        if(!image.complete||!image.naturalWidth)throw new Error('图片尚未加载，请滚动加载后重新检索');
        const canvas=document.createElement('canvas');let edge=1600;
        for(let n=0;n<5;n++){
          const scale=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/png');
          if(data.length*3/4<1500000){respond({data,width:canvas.width,height:canvas.height});return;}edge=Math.round(edge*.72);
        }
        throw new Error('图片压缩后仍过大，请使用截图');
      }
      respond(msg.type.startsWith('page-context')?{snapshot:extract()}:locate(msg.ref));
    }catch(error){respond({error:error.message});}
  }
  globalThis.__xuebanContextV1=handler;api.runtime.onMessage.addListener(handler);
})();
