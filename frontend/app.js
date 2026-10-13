
let socket,goal,audioUrl;
const el=id=>document.getElementById(id);
const headers=()=>({'Content-Type':'application/json',...(el('token').value?{Authorization:'Bearer '+el('token').value}:{})});
const base=()=>el('api').value.replace(/\/$/,'');
fetch('/config').then(r=>r.json()).then(c=>{if(c.apiUrl)el('api').value=c.apiUrl}).catch(()=>{});
async function request(path,opts={}){const r=await fetch(base()+path,{...opts,headers:headers()});if(!r.ok)throw new Error('API returned '+r.status);return r;}
async function show(){if(!goal)return;try{const data=await(await request(`/goals/${goal}/verdict?mode=${el('mode').value}&lang=${el('lang').value}`)).json();el('verdict').textContent=`${data.source} · ${data.lang}\n${data.text}\n${(data.warnings||[]).join('\n')}\n${data.translation_warning||''}`;el('voice').disabled=!data.audio_available;}catch(e){el('verdict').textContent=e.message;}}
el('start').onclick=async()=>{try{el('start').disabled=true;if(socket)socket.close();goal=null;el('verdict').textContent='';el('voice').disabled=true;const match=await(await request('/matches',{method:'POST',body:JSON.stringify({seed:42})})).json();const protocols=el('token').value?['rootcause',el('token').value]:undefined;socket=new WebSocket(base().replace(/^http/,'ws')+'/live/'+match.id,protocols);socket.onmessage=e=>{const msg=JSON.parse(e.data);el('status').textContent=`Match ${match.id}\n${msg.sequence}: ${msg.type}`;if(msg.type==='verdict.ready'){goal=msg.payload.goal_id;show();}};socket.onerror=()=>{el('status').textContent='WebSocket failed. Check API address and authentication.'};}catch(e){el('status').textContent=e.message;}finally{el('start').disabled=false;}};
el('mode').onchange=show;el('lang').onchange=show;
el('voice').onclick=async()=>{try{const blob=await(await request(`/goals/${goal}/audio?mode=${el('mode').value}&lang=${el('lang').value}`)).blob();if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(blob);await new Audio(audioUrl).play();}catch(e){el('voice').disabled=true;el('status').textContent='Audio unavailable; text remains available.';}};
