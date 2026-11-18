const http=require('node:http'), fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'public');
const distance=(a,b)=>{const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lng-a.lng)*r;return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2)));};
const score=km=>Math.round(5000*Math.exp(-km/2000));
function shuffled(items,seed){let n=crypto.createHash('sha256').update(seed).digest().readUInt32LE();const arr=[...items];for(let i=arr.length-1;i>0;i--){n=(Math.imul(n,1664525)+1013904223)>>>0;const j=n%(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
function createServer(options={}){const locations=JSON.parse(fs.readFileSync(path.join(__dirname,'locations.json'))),sessions=new Map();
const streets=JSON.parse(fs.readFileSync(path.join(__dirname,'streets.json')));
const world=require('./world.cjs')(locations,{distance,shuffled,streets});
const streetCache=require('./street-cache.cjs').createStreetCache({seed:JSON.parse(fs.readFileSync(path.join(__dirname,'street-metadata.json')))});
const rooms=require('./rooms.cjs')({world,distance,score,file:options.roomFile===undefined?path.join(__dirname,'data','rooms.json'):options.roomFile,now:options.now});
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const round=s=>({number:s.index+1,total:5,...world.view(s.places[s.index],s.walking),seconds:s.timed?120:0,started:s.started});
return http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&(url.pathname==='/api/street'||url.pathname.startsWith('/api/street/')))return await streetCache.serve(req,res,url);
 if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,locations:locations.length+streets.length,streetStarts:streets.length,streetCountries:new Set(streets.map(p=>p.country)).size,provider:'Panoramax'});
 if(req.method==='POST'&&url.pathname.startsWith('/api/')){
 let body='';for await(const c of req){body+=c;if(body.length>4096)return json(res,413,{error:'Слишком большой запрос'});}let data;try{data=JSON.parse(body||'{}');}catch{return json(res,400,{error:'Неверный запрос'});}
 if(!data||typeof data!=='object'||Array.isArray(data))return json(res,400,{error:'Неверный запрос'});
 if(url.pathname.startsWith('/api/room/')){const result=rooms.handle(url.pathname.slice('/api/room/'.length),data);return json(res,result.status,result.data);}
 if(url.pathname==='/api/start'){
  for(const [id,s]of sessions)if(Date.now()-s.updated>3600000)sessions.delete(id);
  if(sessions.size>=2000)return json(res,503,{error:'Сервер занят. Попробуйте позже.'});
  const seed=data.daily?new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Moscow'}):String(data.seed||crypto.randomBytes(6).toString('hex')).slice(0,64);
  const id=crypto.randomBytes(24).toString('hex'),s={places:world.pick(seed,data.walking!==false),index:0,total:0,results:[],timed:!!data.timed,walking:data.walking!==false,started:Date.now(),updated:Date.now()};sessions.set(id,s);return json(res,200,{id,seed,round:round(s)});
 }
 const s=sessions.get(data.id);if(!s)return json(res,404,{error:'Сессия истекла. Начните новую игру.'});s.updated=Date.now();
 if(url.pathname==='/api/guess'){
  if(s.result)return json(res,200,s.result);
  if(s.index>=5)return json(res,409,{error:'Игра завершена'});
  let guess=data.guess;const expired=s.timed&&Date.now()-s.started>123000;
  if(guess!==null&&(!guess||!Number.isFinite(guess.lat)||!Number.isFinite(guess.lng)||Math.abs(guess.lat)>90||Math.abs(guess.lng)>180))return json(res,400,{error:'Выберите точку на карте'});
  const place=s.places[s.index],km=guess?distance(guess,place):null,points=guess&&!expired?score(km):0;s.total+=points;
  s.result={place,guess,km,points,total:s.total,number:s.index+1,expired};s.results.push(s.result);return json(res,200,s.result);
 }
 if(url.pathname==='/api/next'){
  if(!s.result)return json(res,409,{error:'Сначала ответьте'});
  s.index++;s.result=null;if(s.index>=5){sessions.delete(data.id);return json(res,200,{finished:true,total:s.total,results:s.results});}s.started=Date.now();return json(res,200,{round:round(s)});
 }
 return json(res,404,{error:'Не найдено'});
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 const stat=await fs.promises.stat(file).catch(()=>null);if(!stat||!stat.isFile()){res.writeHead(404);return res.end('Not found');}
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':url.pathname.startsWith('/panos/')?'public, max-age=604800':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
 }catch(e){console.error(e.message);if(!res.headersSent)json(res,500,{error:'Ошибка сервера. Попробуйте ещё раз.'});else res.end();}});
}
if(require.main===module)createServer().listen(process.env.PORT||8081,process.env.HOST||'::',()=>console.log('GeoTrail listening on '+(process.env.PORT||8081)));
module.exports={distance,score,shuffled,createServer};
