const {test}=require('node:test'),assert=require('node:assert/strict');
const {createStreetCache,rewrite,permitted}=require('./street-cache.cjs');
test('cache shares in-flight lookups, reuses results and serves stale metadata on outage',async()=>{
 let calls=0,time=0,fail=false,release;const gate=new Promise(r=>release=r);const cache=createStreetCache({now:()=>time,ttl:100,fetcher:async()=>{calls++;await gate;if(fail)throw Error('offline');return {ok:true,text:async()=>JSON.stringify({id:'picture'})};}});
 const a=cache.get('/search?ids=test'),b=cache.get('/search?ids=test');release();assert.deepEqual(await a,await b);assert.equal(calls,1);assert.equal((await cache.get('/search?ids=test')).status,'HIT');assert.equal(calls,1);time=101;fail=true;assert.equal((await cache.get('/search?ids=test')).status,'STALE');
});
test('metadata cache rewrites API links, leaves images external and forbids arbitrary upstream URLs',()=>{
 const data={links:[{href:'https://api.panoramax.xyz/api/collections/12345678-1234-1234-1234-123456789012/items/12345678-1234-1234-1234-123456789012'}],assets:{sd:{href:'https://example.org/image.jpg'}}};const output=rewrite(data,'http://localhost:8081');assert.ok(output.links[0].href.startsWith('http://localhost:8081/api/street/collections/'));assert.equal(output.assets.sd.href,data.assets.sd.href);assert.equal(permitted('/../secrets'),false);assert.equal(permitted('/https://example.org'),false);assert.equal(permitted('/search'),true);
});
test('background metadata prefetch is limited to two neighbors and never recurses',async()=>{
 let calls=0;const cache=createStreetCache({fetcher:async()=>{calls++;return {ok:true,text:async()=>JSON.stringify({links:[{rel:'next',href:'https://api.panoramax.xyz/api/search?ids=other'}]})};}});cache.warmNeighbors({links:Array.from({length:10},(_,i)=>({rel:'next',href:'https://api.panoramax.xyz/api/collections/'+String(i).padStart(36,'0')}))});await new Promise(r=>setImmediate(r));assert.equal(calls,2);
});
