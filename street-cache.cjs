// Public, read-only STAC metadata cache. Image pixels remain on the provider CDN.
const UPSTREAM='https://api.panoramax.xyz/api',PREFIX='/api/street';
const uuid='[0-9a-f-]{36}',allowed=new RegExp(`^(?:|/search|/collections(?:/${uuid}(?:/items(?:/${uuid})?)?)?)$`,'i');
function permitted(path){return allowed.test(path);}
function rewrite(value,origin){return JSON.parse(JSON.stringify(value,(key,v)=>{
 if(typeof v==='string'&&v.startsWith(UPSTREAM)){const tail=v.slice(UPSTREAM.length),pathname=tail.split('?')[0];if(permitted(pathname))return origin+PREFIX+tail;}
 return v;
}));}
function createStreetCache({seed={},fetcher=fetch,now=Date.now,ttl=21600000,maxBytes=20000000}={}){
 const cache=new Map(),pending=new Map(),queue=[],queued=new Set();let bytes=0,warming=0;
 function put(key,data){const size=Buffer.byteLength(JSON.stringify(data));if(size>2000000)return;const old=cache.get(key);if(old)bytes-=old.size;cache.delete(key);cache.set(key,{data,size,expires:now()+ttl});bytes+=size;while(cache.size>256||bytes>maxBytes){const k=cache.keys().next().value;bytes-=cache.get(k).size;cache.delete(k);}}
 for(const [key,data]of Object.entries(seed))put(key,data);
 async function get(key){const entry=cache.get(key);if(entry&&entry.expires>now()){cache.delete(key);cache.set(key,entry);return {data:entry.data,status:'HIT'};}
  if(pending.has(key))return pending.get(key);
  if(pending.size>=18)throw Error('Metadata queue full');
  const task=(async()=>{try{const res=await fetcher(UPSTREAM+key,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!res.ok)throw Error('Provider status '+res.status);const text=await res.text();if(Buffer.byteLength(text)>2000000)throw Error('Metadata too large');const data=JSON.parse(text);put(key,data);return {data,status:'MISS'};}catch(e){if(entry)return {data:entry.data,status:'STALE'};throw e;}finally{pending.delete(key);}})();pending.set(key,task);return task;
 }
 function pump(){while(warming<2&&queue.length){const key=queue.shift();warming++;get(key).catch(()=>{}).finally(()=>{queued.delete(key);warming--;pump();});}}
 function warmNeighbors(feature){for(const link of (feature?.links||[]).filter(l=>['next','prev'].includes(l.rel)).slice(0,2)){try{const u=new URL(link.href);if(!u.href.startsWith(UPSTREAM+'/'))continue;const key=u.pathname.slice('/api'.length);if(!permitted(key)||queued.has(key)||pending.has(key)||(cache.get(key)?.expires||0)>now()||queue.length>=16)continue;queued.add(key);queue.push(key);}catch{}}pump();}
 async function serve(req,res,url){const path=url.pathname.slice(PREFIX.length);if(!permitted(path)||url.search.length>1500){res.writeHead(404);res.end();return;}
  const params=new URLSearchParams(url.search);if(params.has('limit'))params.set('limit',String(Math.min(100,Math.max(1,Number(params.get('limit'))||20))));params.sort();const key=path+(params.size?'?'+params:'');
  try{const result=await get(key);const body=JSON.stringify(rewrite(result.data,'http://'+req.headers.host));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':result.status==='STALE'?'no-cache':'public, max-age=600','X-GeoTrail-Cache':result.status,'Content-Length':Buffer.byteLength(body)});res.end(body);if(path.includes('/items/'))warmNeighbors(result.data);}catch{res.writeHead(502,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Уличные панорамы временно недоступны'}));}
 }
 return {serve,get,warmNeighbors};
}
module.exports={createStreetCache,rewrite,permitted};
