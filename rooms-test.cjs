const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {distance,score,shuffled,createServer}=require('./server.cjs');
const locations=JSON.parse(fs.readFileSync(path.join(__dirname,'locations.json'))),world=require('./world.cjs')(locations,{distance,shuffled});
function fixture(file=null){let time=1000000;const store=require('./rooms.cjs')({world,distance,score,file,now:()=>time});const call=(action,data)=>store.handle(action,data);const create=call('create',{name:'Ведущий',seconds:60});const a={code:create.data.state.code,token:create.data.token};const join=call('join',{code:a.code,name:'Друг'});const b={code:a.code,token:join.data.token};return {call,a,b,advance:ms=>time+=ms};}
test('walking routes have real assets, neighboring scenes and five different areas',()=>{
 const places=world.pick('walk',true);assert.equal(new Set(places.map(p=>p.group)).size,5);
 for(const p of locations.filter(p=>p.group)){const view=world.view(p);assert.ok(view.navigation.nodes.length>=2);assert.equal(view.navigation.start,p.id);for(const node of view.navigation.nodes){assert.ok(fs.existsSync(path.join(__dirname,'public',node.image)));assert.equal(node.lat,undefined);for(const link of [node.previous,node.next].filter(Boolean)){assert.ok(link.meters>=0&&link.meters<1500);assert.ok(view.navigation.nodes.some(n=>n.id===link.id));}}}
 assert.equal(world.view(places[0],false).navigation,undefined);
});
test('rooms synchronize five rounds, hide early guesses, score once and reject stale controls',()=>{
 const {call,a,b}=fixture();assert.equal(call('start',b).status,403);let state=call('start',a).data;assert.equal(state.status,'playing');assert.equal(state.place,undefined);assert.equal(state.round.lat,undefined);
 for(let i=0;i<5;i++){
  const turn=state.turn;const origin=locations.find(p=>p.id===state.round.navigation.start);const first=call('guess',{...a,turn,guess:{lat:origin.lat,lng:origin.lng}});assert.equal(first.status,200);assert.equal(first.data.status,'playing');assert.equal(first.data.place,undefined);assert.equal(first.data.players.find(p=>p.id===first.data.you).total,i*5000);assert.ok(first.data.players.every(p=>p.last===undefined));
  assert.equal(call('next',{...a,turn}).status,409);assert.equal(call('guess',{...a,turn,guess:{lat:0,lng:0}}).status,200);
  const second=call('guess',{...b,turn,guess:null});assert.equal(second.data.status,'revealed');assert.equal(second.data.place.id,origin.id);assert.equal(second.data.players.find(p=>p.id===first.data.you).last.points,5000);assert.equal(call('next',{...b,turn}).status,403);
  const next=call('next',{...a,turn});assert.equal(next.status,200);state=next.data;assert.equal(call('next',{...a,turn}).status,409);
 }
 assert.equal(state.status,'finished');assert.equal(state.players[0].total,25000);assert.equal(state.history.length,5);assert.equal(call('rematch',{...a,match:999}).status,409);assert.equal(call('rematch',{...a,match:state.match}).data.status,'lobby');
});
test('server deadline awards zero to unanswered players and needs no client timeout submission',()=>{
 const {call,a,b,advance}=fixture();const s=call('start',a).data;call('guess',{...a,turn:s.turn,guess:{lat:20,lng:10}});advance(60000);const after=call('state',b).data;assert.equal(after.status,'revealed');assert.deepEqual(after.players.find(p=>p.id===after.you).last,{guess:null,km:null,points:0});assert.equal(call('guess',{...b,turn:s.turn,guess:{lat:0,lng:0}}).data.players.find(p=>p.id===after.you).last.points,0);
});
test('rooms persist, members resume, host transfers and removed tokens stop working',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'geotrail-room-'));try{
 const f=path.join(dir,'rooms.json'),{call,a,b}=fixture(f);const started=call('start',a).data;
 const restored=require('./rooms.cjs')({world,distance,score,file:f,now:()=>1000010});assert.equal(restored.handle('state',a).data.turn,started.turn);assert.equal(restored.handle('state',b).data.players.length,2);
 assert.equal(restored.handle('leave',a).data.left,true);const state=restored.handle('state',b).data;assert.equal(state.hostId,state.you);assert.equal(restored.handle('state',a).status,403);assert.equal(restored.handle('leave',b).data.left,true);assert.equal(restored.handle('state',b).status,404);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('names, player limits, join phase, ownership and turn are checked',()=>{
 const {call,a,b}=fixture();assert.equal(call('join',{code:a.code,name:'  '}).status,400);assert.equal(call('join',{code:a.code,name:'друг'}).status,409);assert.equal(call('state',{code:a.code,token:'wrong'}).status,403);assert.equal(call('kick',{...b,playerId:'wrong'}).status,403);
 for(let i=0;i<10;i++)assert.equal(call('join',{code:a.code,name:'Игрок '+i}).status,200);assert.equal(call('join',{code:a.code,name:'Лишний'}).status,409);const s=call('start',a).data;assert.equal(call('join',{code:a.code,name:'Опоздал'}).status,409);assert.equal(call('guess',{...b,turn:s.turn,guess:{lat:NaN,lng:0}}).status,400);assert.equal(call('guess',{...b,turn:'stale',guess:null}).status,409);
});
test('HTTP multiplayer API supports two independent clients and reload state',async()=>{
 const s=createServer({roomFile:null});await new Promise(r=>s.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+s.address().port;const post=async(action,data)=>{const r=await fetch(base+'/api/room/'+action,{method:'POST',body:JSON.stringify(data)});return {status:r.status,data:await r.json()}};
 try{const h=await post('create',{name:'A'});assert.equal(h.status,200);const a={code:h.data.state.code,token:h.data.token};const j=await post('join',{code:a.code,name:'B'});const b={code:a.code,token:j.data.token};const started=await post('start',a);const state=await post('state',b);assert.deepEqual(state.data.round,started.data.round);assert.equal((await post('state',{code:a.code,token:'bad'})).status,403);assert.equal((await post('state',b)).data.you,state.data.you);
 }finally{s.closeAllConnections();await new Promise(r=>s.close(r));}
});
