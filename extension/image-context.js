import {searchTerms} from './context.js';
export const IMAGE_LIMIT = 3;
export const MAX_IMAGE_BYTES = 1500000;
export function rankImages(snapshot, question, materials = []) {
  const terms = searchTerms(question + '\n' + materials.filter(m => m.type === 'text').map(m => m.text).join('\n'));
  return (snapshot.images || []).map(image => {
    const description = [image.alt, image.caption, image.nearby, image.heading].join(' ').toLowerCase();
    let score = terms.reduce((n, term) => n + (description.includes(term) ? /^[a-z_]/.test(term) ? 3 : 1 : 0), 0);
    if (/图|image|diagram|chart/i.test(question) && image.inViewport) score += 2;
    return {...image, score};
  }).sort((a,b) => b.score-a.score || a.order-b.order).map((image,index) => ({...image,recommended:index<IMAGE_LIMIT&&image.score>0}));
}
export function imageOrigin(src) {
  const url = new URL(src);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('此原图地址不支持直接读取，请使用框选截图。');
  if (url.username || url.password) throw new Error('图片地址包含认证信息，请使用框选截图。');
  return url.protocol + '//' + url.hostname + '/*';
}
export function pngBytes(data) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data || '')) throw new Error('图片没有生成有效的 PNG 数据');
  return Math.ceil(data.split(',')[1].length * 3 / 4);
}
export async function imageFromURL(src, signal) {
  imageOrigin(src);
  const response = await fetch(src,{signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
  if (!response.ok) throw new Error(`原图读取失败（HTTP ${response.status}），可使用截图。`);
  if (Number(response.headers.get('content-length')) > 8*1024*1024) throw new Error('原图超过 8 MB，请使用截图。');
  const reader=response.body.getReader();let length=0;const chunks=[];
  try {while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>8*1024*1024)throw new Error('原图超过 8 MB，请使用截图。');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bitmap=await createImageBitmap(new Blob(chunks,{type:response.headers.get('content-type')||'application/octet-stream'}));
  try {
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw new Error('图片尺寸过大，请使用截图。');
    const canvas=document.createElement('canvas');let edge=1600;
    for(let i=0;i<5;i++){
      const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/png');
      if(pngBytes(data)<=MAX_IMAGE_BYTES)return {data,width:canvas.width,height:canvas.height};edge=Math.round(edge*.72);
    }
    throw new Error('压缩后图片仍过大，请裁剪截图。');
  }finally{bitmap.close();}
}
