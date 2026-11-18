const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {distance,score,shuffled,createServer}=require('./server.cjs');
const locations=JSON.parse(fs.readFileSync(path.join(__dirname,'locations.json'))),streets=JSON.parse(fs.readFileSync(path.join(__dirname,'streets.json')));
test('global street rounds span five different world regions and conceal answer coordinates',()=>{
 const world=require('./world.cjs')(locations,{distance,shuffled,streets});assert.ok(streets.length>=80);assert.ok(new Set(streets.map(p=>p.country)).size>=25);
 for(let i=0;i<20;i++){const picked=world.pick('world-'+i,true);assert.equal(picked.length,5);assert.equal(new Set(picked.map(p=>p.continent)).size,5);for(const place of picked){const view=world.view(place);assert.equal(view.provider,'panoramax');assert.equal(view.picture,place.id);assert.equal(view.lat,undefined);assert.equal(view.lng,undefined);assert.equal(view.name,undefined);assert.equal(view.navigation,undefined);assert.ok(view.sequence);assert.equal(view.endpoint,'https://api.panoramax.xyz/api');}}
 assert.deepEqual(world.pick('daily',true),world.pick('daily',true));
});
test('street scoring uses the original viewpoint and retries do not replace or double-score an answer',async()=>{
 const server=createServer({roomFile:null});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=async(route,data)=>{const res=await fetch(base+'/api/'+route,{method:'POST',body:JSON.stringify(data)});assert.equal(res.status,200);return res.json();};
 try{const start=await post('start',{seed:'streets'});assert.equal(start.round.provider,'panoramax');const origin=streets.find(p=>p.id===start.round.picture);const result=await post('guess',{id:start.id,guess:{lat:origin.lat,lng:origin.lng}});assert.equal(result.points,5000);assert.equal(result.place.id,origin.id);assert.equal(result.place.source,origin.source);const retry=await post('guess',{id:start.id,guess:{lat:0,lng:0}});assert.deepEqual(retry,result);const next=await post('next',{id:start.id});assert.equal(next.round.number,2);assert.equal(next.round.provider,'panoramax');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
