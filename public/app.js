const $=id=>document.getElementById(id),fmt=n=>new Intl.NumberFormat('ru-RU').format(n);
let session,seed,viewer,map,pin,lines=[],guess,answered=false,clock,round,currentNode,streetViewer,guessPending=false;
let auth=null,roomState=null,roomPoll,roomQueue=Promise.resolve(),pollPending=false,shownTurn=null,shownResult=null,serverOffset=0;
const best=()=>{try{return Number(localStorage.getItem('geotrail-best')||0)}catch{return 0}};
$('best').textContent=fmt(best());
function toast(message){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,5000)}
async function api(route,data){const res=await fetch('api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const out=await res.json();if(!res.ok){const e=Error(out.error||'Не удалось выполнить запрос');e.status=res.status;throw e;}return out;}
function screen(name){for(const id of ['home','game','summary','room'])$(id).hidden=id!==name;$('gameStats').hidden=name!=='game';$('homeBtn').hidden=name!=='game';}
function destroyViewer(){if(streetViewer){streetViewer.remove();streetViewer=null;}if(viewer){viewer.destroy();viewer=null;}}
function destroyScene(){clearInterval(clock);destroyViewer();}
function buttonBusy(id,busy){$(id).disabled=busy;}
async function start(){buttonBusy('start',true);buttonBusy('again',true);try{
 const shared=new URLSearchParams(location.search).get('route');const data=await api('start',{daily:$('mode').value==='daily',timed:$('pace').value==='timed',walking:$('explore').value==='walk',seed:shared||undefined});session=data.id;seed=data.seed;$('total').textContent='0';$('raceStatus').hidden=true;$('raceScores').hidden=true;screen('game');if(!map)initMap();showRound(data.round);
 }catch(e){toast(e.message);}finally{buttonBusy('start',false);buttonBusy('again',false)}}
function markerIcon(className){return L.divIcon({className,iconSize:[20,20],iconAnchor:[10,10]});}
function initMap(){
 map=L.map('map',{worldCopyJump:true,minZoom:1,maxZoom:18}).setView([22,12],1);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',maxZoom:19}).addTo(map);
 map.on('click',e=>{if(answered||guessPending)return;const lat=Math.max(-90,Math.min(90,e.latlng.lat)),lng=((e.latlng.lng+180)%360+360)%360-180;guess={lat,lng};if(pin)pin.setLatLng([lat,lng]);else pin=L.marker([lat,lng],{icon:markerIcon('custom-pin')}).addTo(map);$('mapHint').textContent='Отправляем ответ…';submit();});
}
function clearMap(){if(pin){pin.remove();pin=null;}for(const l of lines)l.remove();lines=[];guess=null;map.setView([22,12],1);}
function attachStreetWarmup(element){
 let timer;const warmed=new Set(),images=[];
 element.oncePSVReady().then(()=>{if(!element.isConnected)return;
  element.psv.addEventListener('picture-loaded',()=>{clearTimeout(timer);const meta=element.psv.getPictureMetadata();
   performance.mark('geotrail-picture-visible');
   if(navigator.connection?.saveData||/^(slow-)?2g$/.test(navigator.connection?.effectiveType||''))return;
   timer=setTimeout(async()=>{if(!element.isConnected)return;
    for(const link of (meta?.links||[]).filter(l=>['prev','next'].includes(l.rel)).slice(0,2)){
     if(!element.isConnected)break;
     try{const u=new URL(link.href,location.href);if(u.origin!==location.origin||!u.pathname.startsWith('/api/street/'))continue;
      const response=await fetch(u.href,{cache:'force-cache',signal:AbortSignal.timeout(8000)});if(!response.ok)continue;const data=await response.json();
      const assets=Object.values(data.assets||{}),asset=assets.find(a=>a.roles?.includes('visual')&&a.type==='image/webp')||assets.find(a=>a.roles?.includes('visual'));
      if(!asset?.href||warmed.has(asset.href)||!element.isConnected)continue;warmed.add(asset.href);if(warmed.size>24)warmed.delete(warmed.values().next().value);
      const image=new Image();image.crossOrigin='anonymous';image.decoding='async';image.fetchPriority='low';image.src=asset.href;images.push(image);if(images.length>4)images.shift();
     }catch{}
    }
   },1500);
  });
 }).catch(()=>{});
}
function loadScene(node){
 currentNode=node.id;performance.mark('geotrail-scene-start');
 if(node.provider==='panoramax'&&streetViewer){streetViewer.select(node.sequence,node.picture);return;}
 destroyViewer();
 if(node.provider==='panoramax'){
  streetViewer=document.createElement('pnx-photo-viewer');
  for(const [key,value]of Object.entries({endpoint:'/api/street','fetch-options':JSON.stringify({cache:'force-cache'}),picture:node.picture,sequence:node.sequence,widgets:'false','url-parameters':'false','keyboard-shortcuts':'false',lang:'ru'}))streetViewer.setAttribute(key,value);
  const legend=document.createElement('pnx-widget-legend');legend.setAttribute('light','true');legend.setAttribute('slot','bottom-left');streetViewer.append(legend);
  $('panorama').replaceChildren(streetViewer);attachStreetWarmup(streetViewer);$('navigation').hidden=false;$('walkPrev').hidden=true;$('walkNext').hidden=true;$('walkHome').disabled=false;$('walkHint').textContent='Нажимай стрелки на улице · Ответ — место старта';
  streetViewer.addEventListener('broken',()=>toast('Уличные панорамы временно недоступны. Попробуйте вернуться к старту.'));
  return;
 }
 $('walkPrev').hidden=false;$('walkNext').hidden=false;
 viewer=pannellum.viewer('panorama',{type:'equirectangular',panorama:node.image,vaov:node.vaov||180,autoLoad:true,showControls:false,hfov:105,minHfov:35,maxHfov:120,compass:false,mouseZoom:true,strings:{loadingLabel:'ПРИБЫВАЕМ НА МЕСТО…',noWebGLError:'Браузер не поддерживает WebGL. Откройте игру в современном браузере.',fileAccessError:'Не удалось загрузить панораму. Обновите страницу.'}});
 viewer.on('error',()=>toast('Не удалось отобразить панораму. Проверьте поддержку WebGL.'));
 const nav=round?.navigation;$('navigation').hidden=!nav;if(!nav)return;
 const current=nav.nodes.find(n=>n.id===currentNode),index=nav.nodes.indexOf(current);
 for(const [id,link,text]of [['walkPrev',current.previous,'← Назад'],['walkNext',current.next,'Вперёд →']]){$(id).disabled=!link;$(id).textContent=link?text+' · '+fmt(link.meters)+' м':text;}
 $('walkHome').disabled=currentNode===nav.start;
 $('walkHint').textContent='Точка '+(index+1)+' / '+nav.nodes.length+' · Найди на карте место старта';
}
function walk(direction){if(round?.provider==='panoramax'){if(direction==='home'){streetViewer?.select(round.sequence,round.picture);}return;}const nav=round?.navigation;if(!nav)return;const current=nav.nodes.find(n=>n.id===currentNode);const target=direction==='home'?nav.start:current[direction]?.id;if(target)loadScene(nav.nodes.find(n=>n.id===target));}
function showRound(r){
 clearInterval(clock);round=r;answered=false;clearMap();$('result').hidden=true;$('mapPanel').classList.remove('expanded');$('roundNum').textContent=r.number+' / 5';$('mapHint').textContent='Клик по карте сразу отправляет ответ';$('guess').disabled=true;$('guess').textContent='Ответ отправится по клику';$('next').disabled=false;
 loadScene(r.navigation?r.navigation.nodes.find(n=>n.id===r.navigation.start):r);
 setTimeout(()=>map.invalidateSize(),100);
 if(r.seconds){const tick=()=>{const left=Math.max(0,Math.ceil(((r.deadline||r.started+r.seconds*1000)-Date.now()-(auth?serverOffset:0))/1000));$('timer').textContent=Math.floor(left/60)+':'+String(left%60).padStart(2,'0');if(left===0){clearInterval(clock);if(auth){answered=true;$('guess').disabled=true;pollRoom();}else submit();}};tick();clock=setInterval(tick,250);}else $('timer').textContent='∞';
}
function renderResult(r){
 clearInterval(clock);answered=true;guess=r.guess;for(const l of lines)l.remove();lines=[];
 if(pin){pin.remove();pin=null;}if(guess)pin=L.marker([guess.lat,guess.lng],{icon:markerIcon('custom-pin')}).addTo(map);
 $('guess').disabled=true;$('total').textContent=fmt(r.total);$('resultLabel').textContent=r.expired?'ВРЕМЯ ВЫШЛО':r.km===null?'БЕЗ ОТВЕТА':r.km<50?'ОТЛИЧНОЕ ПОПАДАНИЕ!':'ВОТ ГДЕ МЫ БЫЛИ';$('placeName').textContent=r.place.name;$('points').textContent='+'+fmt(r.points);$('distance').textContent=r.km===null?'Нет метки':fmt(Math.round(r.km))+' км до цели';
 $('credit').replaceChildren();const a=document.createElement('a');a.href=r.place.source;a.target='_blank';a.rel='noopener';a.textContent=r.place.author+' · '+r.place.license;$('credit').append('Фото: ',a,r.place.provider==='panoramax'?' · Panoramax':' · уменьшенная копия.');
 const mark=L.marker([r.place.lat,r.place.lng],{icon:markerIcon('target-pin')}).addTo(map).bindPopup(r.place.name);lines.push(mark);
 if(guess){let targetLng=r.place.lng;while(targetLng-guess.lng>180)targetLng-=360;while(targetLng-guess.lng< -180)targetLng+=360;const coords=[[guess.lat,guess.lng],[r.place.lat,targetLng]];mark.setLatLng(coords[1]);const line=L.polyline(coords,{color:'#263f2b',weight:3,dashArray:'7 8'}).addTo(map);lines.push(line);setTimeout(()=>{map.invalidateSize();map.fitBounds(r.allGuesses?.length?L.latLngBounds([...coords,...r.allGuesses.map(g=>[g.lat,g.lng])]):line.getBounds(),{padding:[35,35],maxZoom:13})},100);}else setTimeout(()=>{map.invalidateSize();map.setView([r.place.lat,r.place.lng],5)},100);
 $('mapHint').textContent='Все ответы открыты';$('next').textContent=r.number===5?'Итоги путешествия →':'Следующий раунд →';$('result').hidden=false;
}
async function submit(){
 if(answered||guessPending)return;guessPending=true;answered=true;clearInterval(clock);$('guess').disabled=true;
 try{if(auth){await roomRequest('guess',{turn:roomState.turn,guess:guess||null});}else{const r=await api('guess',{id:session,guess:guess||null});renderResult(r);}}
 catch(e){toast(e.message);if(auth){await roomRequest('state').catch(()=>{});if(roomState?.status==='playing'&&!roomState.submitted){answered=false;$('guess').disabled=!guess;}}else{answered=false;$('guess').disabled=!guess;}$('mapHint').textContent='Не удалось отправить. Нажми на карту ещё раз.';}finally{guessPending=false;}
}
async function next(){buttonBusy('next',true);try{if(auth)await roomRequest('next',{turn:roomState.turn});else{const data=await api('next',{id:session});if(data.finished)finish(data);else showRound(data.round);}}catch(e){toast(e.message);buttonBusy('next',false);}}
function finish(data){
 screen('summary');destroyScene();$('finalScore').textContent=fmt(data.total);if(data.total>best()){try{localStorage.setItem('geotrail-best',data.total)}catch{}}$('best').textContent=fmt(best());$('roundList').replaceChildren();
 for(const [i,r]of data.results.entries()){const row=document.createElement('div');row.className='round-row';const label=document.createElement('span');label.textContent=(i+1)+'. '+r.place.name;const sub=document.createElement('small');sub.textContent=r.km===null?' — нет ответа':' — '+fmt(Math.round(r.km))+' км';label.append(sub);const points=document.createElement('b');points.textContent=fmt(r.points)+' очков';row.append(label,points);$('roundList').append(row);}$('shareStatus').textContent='';
}
function roomUrl(code){const u=new URL(location.href);u.search='';u.searchParams.set('room',code);return u.href;}
function storeAuth(){try{sessionStorage.setItem('geotrail-room-'+auth.code,JSON.stringify(auth));}catch{}}
function resetAuth(){clearInterval(roomPoll);if(auth){try{sessionStorage.removeItem('geotrail-room-'+auth.code);}catch{}}auth=null;roomState=null;shownTurn=null;shownResult=null;destroyScene();$('raceStatus').hidden=true;$('raceScores').hidden=true;}
function roomEntry(code=''){
 screen('room');$('roomEntry').hidden=false;$('roomLobby').hidden=true;$('roomHeading').textContent='Кто ближе к цели?';$('roomCode').value=code;$('leaveRoom').textContent='На главную';if(code)$('playerName').focus();
}
function roomRequest(action,extra={}){
 const identity=auth;
 const task=roomQueue.catch(()=>{}).then(async()=>{if(!identity||identity!==auth)return;const state=await api('room/'+action,{...identity,...extra});if(identity!==auth)return;if(!state.left)applyRoom(state);return state;});roomQueue=task;return task;
}
function beginPolling(){clearInterval(roomPoll);roomPoll=setInterval(pollRoom,1500);}
async function pollRoom(){if(!auth||pollPending)return;pollPending=true;try{await roomRequest('state');}catch(e){if([403,404].includes(e.status)){const code=auth?.code;resetAuth();roomEntry(code);toast(e.message);}else{$('roomMessage').textContent='Связь прервалась. Переподключаемся…';$('raceStatus').textContent='Связь прервалась. Переподключаемся…';}}finally{pollPending=false;}}
async function enterRoom(create){
 const name=$('playerName').value.trim(),code=$('roomCode').value.trim().toUpperCase();buttonBusy('createRoom',true);buttonBusy('joinRoom',true);
 try{const out=await api(create?'room/create':'room/join',{name,code,seconds:Number($('roomSeconds').value)});auth={code:out.state.code,token:out.token};storeAuth();history.replaceState({},'',roomUrl(auth.code));applyRoom(out.state);beginPolling();}catch(e){toast(e.message);}finally{buttonBusy('createRoom',false);buttonBusy('joinRoom',false);}
}
function scoreTable(state,compact=false){
 const table=document.createElement('table');table.className='score-table';const head=document.createElement('thead'),hr=document.createElement('tr');for(const text of ['#','ИГРОК',compact?'РАУНД':'СТАТУС','ОЧКИ']){const th=document.createElement('th');th.textContent=text;hr.append(th);}head.append(hr);table.append(head);const body=document.createElement('tbody');
 for(const p of state.players){const row=document.createElement('tr');if(p.id===state.you)row.className='my-row';const rank=document.createElement('td');rank.textContent=state.status==='lobby'?'·':p.rank;const name=document.createElement('td');name.className='score-name';name.textContent=p.name;const badge=document.createElement('small');badge.textContent=(p.id===state.you?' · ты':'')+(p.host?' · ведущий':'');name.append(badge);const status=document.createElement('td');status.textContent=p.last?'+'+fmt(p.last.points):state.status==='lobby'?'В комнате':p.answered?'✓ Ответил':'Думает…';const total=document.createElement('td');total.className='score-value';total.textContent=fmt(p.total);
  if(!compact&&state.you===state.hostId&&p.id!==state.you&&state.status!=='finished'){const kick=document.createElement('button');kick.className='kick';kick.textContent='Убрать';kick.setAttribute('aria-label','Убрать игрока '+p.name);kick.onclick=()=>roomRequest('kick',{playerId:p.id}).catch(e=>toast(e.message));name.append(kick);}row.append(rank,name,status,total);body.append(row);
 }table.append(body);return table;
}
function applyRoom(state){
 roomState=state;serverOffset=state.serverTime-Date.now();const host=state.you===state.hostId;const me=state.players.find(p=>p.id===state.you);
 if(['lobby','finished'].includes(state.status)){
  if(!$('game').hidden)destroyScene();screen('room');$('roomEntry').hidden=true;$('roomLobby').hidden=false;$('codeBadge').textContent=state.code;$('inviteUrl').value=roomUrl(state.code);$('leaveRoom').textContent='Покинуть комнату';$('roomHeading').textContent=state.status==='finished'?'Финиш. Кто ближе?':'Все в сборе?';$('lobbyScores').replaceChildren(scoreTable(state));$('launchRoom').hidden=state.status!=='lobby'||!host;$('launchRoom').disabled=state.players.length<2;$('rematch').hidden=state.status!=='finished'||!host;$('rematch').disabled=false;
  if(state.status==='lobby'){$('roomMessage').textContent=state.players.length<2?'Отправь ссылку другу. Для старта нужны хотя бы двое.':host?state.players.length+' игроков · '+state.seconds+' сек. на раунд. Можно начинать.':'Ведущий скоро начнёт матч · '+state.seconds+' сек. на раунд.';$('matchHistory').replaceChildren();shownTurn=null;shownResult=null;}
  else{const winners=state.players.filter(p=>p.rank===1).map(p=>p.name);$('roomMessage').textContent=(winners.length>1?'Победители: ':'Победитель: ')+winners.join(', ')+(host?'. Можно сыграть ещё раз.':'. Ждём нового матча от ведущего.');$('matchHistory').replaceChildren();for(const [i,r]of state.history.entries()){const line=document.createElement('div');line.className='match-round';const title=document.createElement('b');title.textContent=(i+1)+'. '+r.name;line.append(title);line.append(state.players.map(p=>{const result=r.players.find(x=>x.id===p.id);return p.name+': '+fmt(result?.points||0)}).join(' · '));$('matchHistory').append(line);}}
  return;
 }
 screen('game');$('homeBtn').textContent='Выйти';$('raceStatus').hidden=false;if(!map)initMap();
 if(shownTurn!==state.turn){shownTurn=state.turn;shownResult=null;$('raceScores').hidden=true;showRound(state.round);}
 $('total').textContent=fmt(me.total);const answeredCount=state.players.filter(p=>p.answered).length;
 if(state.status==='playing'){
  $('result').hidden=true;answered=state.submitted||Date.now()+serverOffset>=state.round.deadline;$('guess').disabled=answered||!guess;
  $('guess').textContent=state.submitted?'✓ Ответ принят':'Ответ отправится по клику';$('raceStatus').textContent='Комната '+state.code+' · Ответили '+answeredCount+' / '+state.players.length+(state.submitted?' · Ждём остальных':'');if(state.submitted){$('mapHint').textContent='Ответ принят. Остальные точки пока скрыты.';}
 }else{
  $('raceStatus').textContent='Все ответы открыты · Раунд '+state.round.number;
  if(shownResult!==state.turn){shownResult=state.turn;renderResult({...me.last,total:me.total,number:state.round.number,place:state.place,allGuesses:state.players.map(p=>p.last?.guess).filter(Boolean)});for(const p of state.players){if(p.id===state.you||!p.last?.guess)continue;const g=p.last.guess;const dot=L.circleMarker([g.lat,g.lng],{radius:7,color:'#fff',weight:2,fillColor:'#7869d7',fillOpacity:1}).addTo(map);const label=document.createElement('span');label.textContent=p.name+' · '+fmt(p.last.points)+' очков';dot.bindTooltip(label);lines.push(dot);}}
  $('raceScores').hidden=false;$('raceScores').replaceChildren(scoreTable(state,true));$('next').disabled=!host;$('next').textContent=host?(state.round.number===5?'Итоги соревнования →':'Следующий раунд →'):'Ждём ведущего…';
 }
}
async function leaveRoom(){if(auth){if(!confirm('Покинуть соревнование?'))return;try{await roomRequest('leave');}catch(e){if(![403,404].includes(e.status)){toast(e.message);return;}}resetAuth();}history.replaceState({},'',location.pathname);screen('home');}
$('start').onclick=start;$('again').onclick=()=>{history.replaceState({},'',location.pathname);start()};$('guess').onclick=submit;$('next').onclick=next;
$('expand').onclick=()=>{$('mapPanel').classList.toggle('expanded');setTimeout(()=>map.invalidateSize(),220)};
$('walkPrev').onclick=()=>walk('previous');$('walkNext').onclick=()=>walk('next');$('walkHome').onclick=()=>walk('home');
$('resetView').onclick=()=>{if(streetViewer){streetViewer.select(round.sequence,round.picture);}else{viewer?.setYaw(0);viewer?.setPitch(0);viewer?.setHfov(105);}};
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen?.();else $('game').requestFullscreen?.().catch(()=>toast('Полный экран недоступен'))};
$('homeBtn').onclick=()=>{if(auth){leaveRoom();return;}if(!answered&&!confirm('Выйти? Текущий маршрут не сохранится.'))return;destroyScene();screen('home');};
$('friends').onclick=()=>roomEntry();$('createRoom').onclick=()=>enterRoom(true);$('joinRoom').onclick=()=>enterRoom(false);$('leaveRoom').onclick=leaveRoom;
$('launchRoom').onclick=async()=>{buttonBusy('launchRoom',true);try{await roomRequest('start');}catch(e){toast(e.message);buttonBusy('launchRoom',false);}};
$('rematch').onclick=async()=>{buttonBusy('rematch',true);try{await roomRequest('rematch',{match:roomState.match});}catch(e){toast(e.message);buttonBusy('rematch',false);}};
$('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(roomUrl(auth.code));toast('Приглашение скопировано');}catch{$('inviteUrl').focus();$('inviteUrl').select();toast('Скопируй выделенную ссылку');}};
$('share').onclick=async()=>{const url=new URL(location.href);url.search='';url.searchParams.set('route',seed);url.searchParams.set('walk',$('explore').value==='walk'?'1':'0');try{await navigator.clipboard.writeText(url.href);$('shareStatus').textContent='Ссылка скопирована. В ней те же пять мест.';}catch{$('shareStatus').textContent=url.href;}};
$('roomCode').addEventListener('keydown',e=>{if(e.key==='Enter')enterRoom(false)});
window.addEventListener('resize',()=>map?.invalidateSize());
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['SELECT','BUTTON','INPUT'].includes(document.activeElement.tagName)&&!$('game').hidden){e.preventDefault();if(!answered&&guess)submit();else if(answered&&!$('next').disabled)next();}});
const params=new URLSearchParams(location.search);
if(params.has('route')){$('start').firstChild.textContent='Пройти маршрут по ссылке ';$('mode').disabled=true;if(params.get('walk')==='0')$('explore').value='overview';}
if(params.has('room')){
 const code=params.get('room').trim().toUpperCase();roomEntry(code);try{auth=JSON.parse(sessionStorage.getItem('geotrail-room-'+code)||'null');}catch{}
 if(auth){roomRequest('state').then(beginPolling).catch(e=>{resetAuth();roomEntry(code);toast(e.message);});}
}
