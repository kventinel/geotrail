const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const token=()=>crypto.randomBytes(24).toString('hex');
class RoomError extends Error{constructor(status,message){super(message);this.status=status;}}
module.exports=function createRooms({world,distance,score,file,now=Date.now}){
 const rooms=new Map(file&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[]);
 const fail=(status,message)=>{throw new RoomError(status,message)};
 function save(){if(!file)return;fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify([...rooms]),{mode:0o600});fs.renameSync(temp,file);}
 function player(name){if(typeof name!=='string'||!name.trim()||name.trim().length>24)fail(400,'Введите имя от 1 до 24 символов');return {id:crypto.randomBytes(8).toString('hex'),token:token(),name:name.trim(),answers:[]};}
 function endIfReady(r){if(r.status!=='playing')return;const expired=now()>=r.deadline;if(expired){for(const p of r.players)if(!p.answers[r.index])p.answers[r.index]={guess:null,km:null,points:0};}
  if(expired||r.players.every(p=>p.answers[r.index])){r.status='revealed';save();}}
 const turn=r=>r.match+':'+r.index;
 function snapshot(r,me){const revealed=['revealed','finished'].includes(r.status),limit=r.status==='playing'?r.index:r.index+1;
  const players=r.players.map(p=>({id:p.id,name:p.name,host:p.id===r.hostId,answered:!!p.answers[r.index],total:p.answers.slice(0,limit).reduce((n,a)=>n+(a?.points||0),0),last:revealed?p.answers[r.index]:undefined})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));let rank=0,previous;
  for(let i=0;i<players.length;i++){if(players[i].total!==previous)rank=i+1;players[i].rank=rank;previous=players[i].total;}
  return {code:r.code,status:r.status,you:me.id,hostId:r.hostId,seconds:r.seconds,match:r.match,turn:turn(r),players,serverTime:now(),submitted:!!me.answers[r.index],round:r.status==='lobby'?null:{number:r.index+1,total:5,seconds:r.seconds,started:r.started,deadline:r.deadline,...world.view(r.places[r.index])},place:revealed?r.places[r.index]:undefined,history:r.status==='finished'?r.places.map((p,i)=>({name:p.name,players:r.players.map(m=>({id:m.id,...m.answers[i]}))})):undefined};
 }
 function launch(r){r.match++;r.places=world.pick(token(),true);r.index=0;r.started=now();r.deadline=r.started+r.seconds*1000;r.status='playing';r.players.forEach(p=>p.answers=[]);}
 function handle(action,data){try{
  if(action==='create'){
   for(const [code,r]of rooms)if(now()-r.updated>86400000)rooms.delete(code);
   if(rooms.size>=200)fail(503,'Все комнаты заняты. Попробуйте позже.');
   const p=player(data.name);let code;do{code=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(code));
   const r={code,hostId:p.id,players:[p],status:'lobby',seconds:[60,120,180].includes(data.seconds)?data.seconds:120,match:0,index:0,updated:now()};rooms.set(code,r);save();return {status:200,data:{token:p.token,state:snapshot(r,p)}};
  }
  const code=String(data.code||'').trim().toUpperCase(),r=rooms.get(code);if(!r||now()-r.updated>86400000)fail(404,'Комната не найдена или срок её действия истёк');
  endIfReady(r);
  if(action==='join'){
   if(r.status!=='lobby')fail(409,'Игра уже идёт. Дождитесь нового матча.');if(r.players.length>=12)fail(409,'В комнате уже 12 игроков');const p=player(data.name);
   if(r.players.some(m=>m.name.toLocaleLowerCase()===p.name.toLocaleLowerCase()))fail(409,'Это имя уже занято');r.players.push(p);r.updated=now();save();return {status:200,data:{token:p.token,state:snapshot(r,p)}};
  }
  const me=r.players.find(p=>p.token===data.token);if(!me)fail(403,'Вы больше не в этой комнате. Войдите заново.');
  if(action==='state')return {status:200,data:snapshot(r,me)};
  if(['start','next','rematch','kick'].includes(action)&&me.id!==r.hostId)fail(403,'Это действие доступно ведущему');
  if(action==='start'){if(r.status!=='lobby')fail(409,'Матч уже запущен');if(r.players.length<2)fail(409,'Пригласите хотя бы одного друга');launch(r);}
  else if(action==='guess'){
   if(data.turn!==turn(r))fail(409,'Этот раунд уже завершён');if(me.answers[r.index])return {status:200,data:snapshot(r,me)};
   if(r.status!=='playing')fail(409,'Раунд уже завершён');const g=data.guess;
   if(g!==null&&(!g||!Number.isFinite(g.lat)||!Number.isFinite(g.lng)||Math.abs(g.lat)>90||Math.abs(g.lng)>180))fail(400,'Выберите точку на карте');
   const km=g?distance(g,r.places[r.index]):null;me.answers[r.index]={guess:g,km,points:g?score(km):0};endIfReady(r);
  }
  else if(action==='next'){if(data.turn!==turn(r)||r.status!=='revealed')fail(409,'Дождитесь завершения текущего раунда');if(r.index===4)r.status='finished';else{r.index++;r.started=now();r.deadline=r.started+r.seconds*1000;r.status='playing';}}
  else if(action==='rematch'){if(r.status!=='finished'||data.match!==r.match)fail(409,'Сначала завершите матч');r.status='lobby';r.players.forEach(p=>p.answers=[]);r.index=0;}
  else if(action==='leave'||action==='kick'){
   const id=action==='leave'?me.id:data.playerId;if(action==='kick'&&id===me.id)fail(400,'Чтобы выйти, нажмите «Покинуть комнату»');if(!r.players.some(p=>p.id===id))fail(404,'Игрок не найден');r.players=r.players.filter(p=>p.id!==id);
   if(!r.players.length){rooms.delete(code);save();return {status:200,data:{left:true}};}if(r.hostId===id)r.hostId=r.players[0].id;endIfReady(r);r.updated=now();save();return {status:200,data:action==='leave'?{left:true}:snapshot(r,me)};
  }else fail(404,'Неизвестное действие');
  r.updated=now();save();return {status:200,data:snapshot(r,me)};
 }catch(e){if(e instanceof RoomError)return {status:e.status,data:{error:e.message}};throw e;}}
 return {handle};
};
