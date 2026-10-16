export function modelProfile(config,credentials,image=false){
  const independent=image&&config.vision?.independent;
  const profile=independent?config.vision:config;
  return {provider:profile.provider||'compatible',endpoint:profile.endpoint||'',model:image?config.visionModel||'':config.textModel||'',key:independent?credentials.vision||'':credentials.model||''};
}
export function serviceURL(base){
  const url=new URL(base);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('服务地址需使用 HTTPS，或 localhost / 127.0.0.1 的 HTTP 地址');
  if(url.username||url.password||url.search||url.hash)throw new Error('服务地址不能包含账号、查询参数或片段');return url;
}
export function permissionPattern(url){const value=typeof url==='string'?serviceURL(url):url;return value.protocol+'//'+value.hostname+'/*';}
export async function listModels(profile,signal){
  const url=serviceURL(profile.endpoint);url.pathname=url.pathname.replace(/\/$/,'')+(profile.provider==='ollama'?'/api/tags':'/models');
  if(profile.provider==='anthropic')throw new Error('此处不自动列出 Anthropic 模型，请手动填写');
  const headers=profile.key?{Authorization:'Bearer '+profile.key}:{};
  const r=await fetch(url,{headers,signal,credentials:'omit',redirect:'error'});if(!r.ok)throw new Error('模型列表读取失败（HTTP '+r.status+'）');const data=await r.json();
  const names=(profile.provider==='ollama'?data.models?.map(m=>m.name):data.data?.map(m=>m.id))||[];
  return [...new Set(names.filter(n=>typeof n==='string'&&n.length<200))].slice(0,200);
}
