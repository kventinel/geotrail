module.exports=function createWorld(locations,{distance,shuffled,streets=[]}){
 const groups=new Map();for(const p of locations)if(p.group){if(!groups.has(p.group))groups.set(p.group,[]);groups.get(p.group).push(p);}
 for(const nodes of groups.values())nodes.sort((a,b)=>a.order-b.order);
 function pick(seed,walking){
  if(!walking)return shuffled(locations.filter(p=>p.overview!==false),seed).slice(0,5);
  if(streets.length>=5){
   const continents=[...new Set(streets.map(p=>p.continent))];
   return shuffled(continents,seed).slice(0,5).map((c,i)=>{const choices=streets.filter(p=>p.continent===c);const countries=shuffled([...new Set(choices.map(p=>p.country))],seed+':'+i);return shuffled(choices.filter(p=>p.country===countries[0]),seed+':point:'+i)[0];});
  }
  if(groups.size<5)throw Error('Недостаточно маршрутов для прогулки');
  return shuffled([...groups.values()],seed).slice(0,5).map((nodes,i)=>shuffled(nodes,seed+':'+i)[0]);
 }
 function view(place,walking=true){if(place.provider==='panoramax')return {provider:place.provider,endpoint:place.endpoint,picture:place.picture,sequence:place.sequence};const result={image:'/panos/'+place.id+'.jpg',vaov:place.vaov||180};const nodes=groups.get(place.group);
  if(nodes&&walking)result.navigation={start:place.id,nodes:nodes.map((p,i)=>({id:p.id,image:'/panos/'+p.id+'.jpg',vaov:p.vaov||180,previous:i?{id:nodes[i-1].id,meters:Math.round(1000*distance(p,nodes[i-1]))}:null,next:i<nodes.length-1?{id:nodes[i+1].id,meters:Math.round(1000*distance(p,nodes[i+1]))}:null}))};return result;
 }
 return {pick,view};
};
