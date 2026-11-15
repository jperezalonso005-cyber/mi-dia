/* Mi día — versión independiente (fuera de Claude).
   Datos: Supabase (sincroniza móvil y ordenador). Calendario: API de Google Calendar.
   Este archivo imita las piezas que la versión de Claude usa (window.claude.use("db"/"mcp")),
   así el resto de la app es idéntico. */
(function(){
  const TZ = "Europe/Madrid";
  const LSK = "md_cfg";
  const get = (k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v) }catch(e){ return d } };
  const set = (k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)) }catch(e){} };
  const cfg = ()=>Object.assign({},window.MD_DEFAULTS||{},Object.fromEntries(Object.entries(get(LSK,{})).filter(([k,v])=>v!==""&&v!=null)));
  window.mdStandalone = true;

  /* ---------- Google: recoger el token al volver de la pantalla de Google ---------- */
  (function(){
    const h = location.hash||"";
    if(h.includes("access_token=")){
      const p = new URLSearchParams(h.slice(1));
      set("md_gtok",{v:p.get("access_token"),exp:Date.now()+(+p.get("expires_in")||3600)*1000});
      history.replaceState(null,"",location.pathname+location.search);
    }
  })();
  const gtok = ()=>{ const t=get("md_gtok",null); return t&&t.exp>Date.now()+60000?t.v:null };
  window.connectGoogle = function(silent){
    const c=cfg(); if(!c.gid){ alertBox("Falta el Client ID de Google. Ve a ⚙︎ Datos → Configuración."); return }
    if(!silent) localStorage.setItem("md_gtry",String(Date.now()));
    const q = new URLSearchParams({client_id:c.gid,redirect_uri:location.origin+location.pathname,response_type:"token",
      scope:"https://www.googleapis.com/auth/calendar.events",include_granted_scopes:"true",prompt:c.gok?"none":"consent"});
    if(c.gmail) q.set("login_hint",c.gmail);
    set(LSK,Object.assign({},c,{gok:true}));
    location.href="https://accounts.google.com/o/oauth2/v2/auth?"+q.toString();
  };
  // si Google devuelve error con prompt=none (por ejemplo, permiso retirado), la próxima vez pide consentimiento
  (function(){ const h=location.hash||""; if(h.includes("error=")){ const c=get(LSK,{}); set(LSK,Object.assign({},c,{gok:false})); history.replaceState(null,"",location.pathname) } })();
  /* Reconexión automática: si el permiso de Google ha caducado y ya lo aceptaste antes,
     la app va a Google y vuelve sola (sin pulsar nada). Como máximo un intento cada 3 minutos. */
  function autoGoogle(reason){
    const c=cfg(); if(!c.gid||!c.gok||gtok()) return false;
    const last=+(localStorage.getItem("md_gtry")||0); if(Date.now()-last<180000) return false;
    const a=document.activeElement; if(a&&["INPUT","TEXTAREA","SELECT"].includes(a.tagName)) return false;
    localStorage.setItem("md_gtry",String(Date.now())); window.connectGoogle(true); return true;
  }
  window.mdAutoGoogle=autoGoogle;
  let hiddenAt=0;
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden") hiddenAt=Date.now(); else if(hiddenAt&&Date.now()-hiddenAt>60000&&uid) autoGoogle("vuelta") });
  window.disconnectGoogle = function(){ localStorage.removeItem("md_gtok"); const c=cfg(); set(LSK,Object.assign({},c,{gok:false})); location.reload() };

  /* ---------- Calendario (misma forma que el conector de Claude) ---------- */
  const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  async function gfetch(url,opt){
    const t=gtok(); if(!cfg().gid) throw {code:"no_google",message:"Sin calendario configurado"};
    if(!t){ if(autoGoogle("caducado")) await new Promise(()=>{}); throw {code:"needs_google",message:"Conecta Google Calendar"} }
    const r=await fetch(url,Object.assign({},opt||{},{headers:{Authorization:"Bearer "+t,"Content-Type":"application/json"}}));
    if(r.status===401){ localStorage.removeItem("md_gtok"); if(autoGoogle("401")) await new Promise(()=>{}); throw {code:"needs_google",message:"Sesión de Google caducada"} }
    if(!r.ok){ const tx=await r.text(); throw {code:r.status>=500?"server_unavailable":"tool_error",message:tx} }
    return r.status===204?{}:r.json();
  }
  const rfc = s=>new Date(s).toISOString();
  function body(i){
    const b={};
    if(i.summary!=null) b.summary=i.summary;
    if(i.colorId) b.colorId=i.colorId;
    if(i.location!=null) b.location=i.location;
    if(i.description!=null) b.description=i.description;
    if(i.startTime){
      if(i.allDay){ b.start={date:i.startTime.slice(0,10)}; b.end={date:(i.endTime||i.startTime).slice(0,10)} }
      else { b.start={dateTime:i.startTime,timeZone:TZ}; b.end={dateTime:i.endTime||i.startTime,timeZone:TZ} }
    }
    if(i.overrideReminders) b.reminders={useDefault:false,overrides:i.overrideReminders};
    else if(i.useDefaultReminders===false) b.reminders={useDefault:false,overrides:[]};
    if(i.recurrenceData) b.recurrence=i.recurrenceData;
    return b;
  }
  async function callTool(server,tool,i){
    i=i||{};
    if(tool==="list_events"){
      const q=new URLSearchParams({singleEvents:"true",orderBy:"startTime",maxResults:String(i.pageSize||250)});
      if(i.startTime) q.set("timeMin",rfc(i.startTime)); if(i.endTime) q.set("timeMax",rfc(i.endTime)); if(i.pageToken) q.set("pageToken",i.pageToken);
      const r=await gfetch(API+"?"+q.toString());
      const events=(r.items||[]).map(e=>Object.assign({},e,{overrideReminders:e.reminders&&e.reminders.overrides}));
      return {payload:{events,nextPageToken:r.nextPageToken}};
    }
    if(tool==="create_event") return {payload:await gfetch(API,{method:"POST",body:JSON.stringify(body(i))})};
    if(tool==="update_event") return {payload:await gfetch(API+"/"+encodeURIComponent(i.eventId),{method:"PATCH",body:JSON.stringify(body(i))})};
    if(tool==="delete_event") return {payload:await gfetch(API+"/"+encodeURIComponent(i.eventId),{method:"DELETE"})};
    throw {code:"bad_request",message:"Herramienta desconocida"};
  }
  const watchers=new Set();
  const MCP={
    callTool,
    watchTool(server,tool,input,handler,opts){
      let alive=true;
      const run=async()=>{ try{ const r=await callTool(server,tool,input); if(alive) handler({type:"data",result:r}) }catch(e){ if(alive) handler({type:"error",error:e}) } };
      const w={run}; watchers.add(w); run();
      const iv=setInterval(()=>{ if(document.visibilityState==="visible") run() },(opts&&opts.refetchInterval)||300000);
      const vis=()=>{ if(document.visibilityState==="visible") run() }; document.addEventListener("visibilitychange",vis);
      return ()=>{ alive=false; watchers.delete(w); clearInterval(iv); document.removeEventListener("visibilitychange",vis) };
    },
    async invalidate(){ for(const w of watchers) w.run() },
    async listTools(){ return {servers:[{server:"Google Calendar",authStatus:gtok()?"connected":"unknown",tools:[]}]} }
  };

  /* ---------- Base de datos (misma forma que la de Claude) ---------- */
  let sb=null, uid=null; const colListeners={}; let channel=null;
  function snap(map){ const docs=Object.keys(map).map(id=>({id,exists:true,data:()=>map[id],metadata:{fromCache:false,hasPendingWrites:false}}));
    return {docs,size:docs.length,empty:!docs.length,metadata:{fromCache:false,hasPendingWrites:false},docChanges:()=>[]} }
  function ensureChannel(){
    if(channel) return;
    channel=sb.channel("md-docs").on("postgres_changes",{event:"*",schema:"public",table:"docs"},p=>{
      const row=p.eventType==="DELETE"?p.old:p.new; if(!row||!row.col) return;
      const L=colListeners[row.col]; if(!L) return;
      for(const l of L){ if(p.eventType==="DELETE") delete l.map[row.id]; else l.map[row.id]=row.data; l.next(snap(l.map)) }
    }).subscribe();
  }
  /* Cambios hechos sin internet: se guardan aquí y se envían al volver la conexión */
  let pend=get("md_pend",{});
  const savePend=()=>set("md_pend",pend);
  async function sendOne(k){ const op=pend[k]; if(!op) return; const i=k.indexOf("/"), col=k.slice(0,i), id=k.slice(i+1);
    const r=op.op==="set"?await sb.from("docs").upsert({user_id:uid,col,id,data:op.data,updated_at:new Date().toISOString()},{onConflict:"user_id,col,id"}):await sb.from("docs").delete().eq("col",col).eq("id",id);
    if(r.error) throw {code:"unavailable",message:r.error.message};
    if(pend[k]===op){ delete pend[k]; savePend() } }
  let flushing=false;
  async function flush(){ if(flushing||!uid) return; flushing=true; try{ for(const k of Object.keys(pend)){ try{ await sendOne(k) }catch(e){ break } } } finally{ flushing=false } }
  window.addEventListener("online",flush);
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") flush() });
  const DB={
    collection(col){ return {
      onSnapshot(next,err){
        const l={map:{},next}; (colListeners[col]=colListeners[col]||new Set()).add(l);
        const load=async()=>{ const {data,error}=await sb.from("docs").select("id,data").eq("col",col);
          if(error){ err&&err({code:"unavailable",message:error.message}); return }
          l.map={}; for(const r of data) l.map[r.id]=r.data;
          for(const k in pend){ if(!k.startsWith(col+"/")) continue; const id=k.slice(col.length+1); if(pend[k].op==="set") l.map[id]=pend[k].data; else delete l.map[id] }
          next(snap(l.map)) };
        load(); ensureChannel();
        const vis=()=>{ if(document.visibilityState==="visible") load() }; document.addEventListener("visibilitychange",vis);
        return ()=>{ colListeners[col].delete(l); document.removeEventListener("visibilitychange",vis) };
      }
    }},
    doc(path){ const i=path.indexOf("/"), col=path.slice(0,i), id=path.slice(i+1); return {
      async set(obj){ pend[path]={op:"set",data:obj}; savePend(); try{ await sendOne(path) }catch(e){} },
      async delete(){ pend[path]={op:"del"}; savePend(); try{ await sendOne(path) }catch(e){} }
    }}
  };

  /* ---------- IA para recetas en la web: Gemini (clave gratuita de Google AI Studio) ---------- */
  const iaKey=()=>{ try{ return (typeof window.mdIAKey==="function"&&window.mdIAKey())||"" }catch(e){ return "" } };
  const b64=blob=>new Promise((ok,ko)=>{ const r=new FileReader(); r.onload=()=>ok(String(r.result).split(",")[1]); r.onerror=ko; r.readAsDataURL(blob) });
  async function gem(model,body,key){ const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); return r }
  const GEM={
    async limits(){ return {images:true,video:true} },
    async json(prompt,opts){
      const key=iaKey(); if(!key) throw {code:"not_granted",message:"Falta la clave de IA"};
      const parts=[{text:prompt+"\nSi recibes un vídeo, míralo entero y escucha el audio: las cantidades y pasos dichos en voz alta también cuentan."}];
      for(const im of (opts&&opts.images)||[]) parts.push({inline_data:{mime_type:im.type||"image/jpeg",data:await b64(im)}});
      if(opts&&opts.video){ let mt=opts.video.type||"video/mp4"; if(/quicktime/i.test(mt)) mt="video/mov"; parts.push({inline_data:{mime_type:mt,data:await b64(opts.video)}}) }
      const body={contents:[{role:"user",parts}],generationConfig:{responseMimeType:"application/json",temperature:0.2}};
      // Si un modelo está saturado (503/500/429) o no existe (404), espera un poco y prueba el siguiente
      const MODELS=["gemini-flash-latest","gemini-2.5-flash","gemini-flash-lite-latest","gemini-2.5-flash-lite","gemini-2.0-flash"];
      const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
      let r=null, last="", busy=0;
      for(let i=0;i<MODELS.length;i++){
        if(typeof window.mdIAStatus==="function") window.mdIAStatus(i===0?"":"Gemini está saturado, probando otro modelo… ("+(i+1)+"/"+MODELS.length+")");
        r=await gem(MODELS[i],body,key);
        if(r.ok) break;
        if(r.status===400||r.status===403){ const t=await r.text(); if(/API key|API_KEY|PERMISSION/i.test(t)) throw {code:"bad_key",message:t}; last=t; if(r.status===400) continue; throw {code:"tool_error",message:t} }
        last=await r.text();
        if(r.status===429||r.status>=500){ busy++; await sleep(1500+i*1000); continue }
        if(r.status===404) continue;
        break;
      }
      if(!r||!r.ok){ if(busy) throw {code:"rate_limited",message:"Todos los modelos de Gemini están saturados"}; throw {code:"unavailable",message:last.slice(0,200)} }
      const j=await r.json(); const txt=((j.candidates||[])[0]?.content?.parts||[]).map(p=>p.text||"").join("");
      return JSON.parse(txt.replace(/^```json|```$/g,"").trim());
    }
  };

  /* ---------- Arranque: configuración e inicio de sesión ---------- */
  let resolveReady; const ready=new Promise(r=>resolveReady=r);
  window.claude={ use: name=>ready.then(()=>name==="db"?DB:name==="mcp"?(cfg().gid?MCP:null):name==="sample"?(iaKey()?GEM:null):null) };
  window.mdLogout=async function(){ try{ await sb.auth.signOut() }catch(e){} location.reload() };

  const SQL=`create table if not exists docs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  col text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, col, id)
);
alter table docs enable row level security;
alter table docs replica identity full;
create policy "solo lo mio" on docs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter publication supabase_realtime add table docs;`;
  window.mdSQL=SQL;

  function overlay(html){
    let o=document.getElementById("md-setup");
    if(!o){ o=document.createElement("div"); o.id="md-setup"; o.style.cssText="position:fixed;inset:0;z-index:100;background:var(--bg);overflow:auto;padding:calc(env(safe-area-inset-top) + 20px) 16px 40px"; document.body.appendChild(o) }
    o.innerHTML=`<div class="wrap">${html}</div>`;
  }
  function closeOverlay(){ const o=document.getElementById("md-setup"); if(o) o.remove() }
  function alertBox(m){ const t=document.getElementById("md-msg"); if(t){ t.textContent=m; t.style.display="block" } else alert(m) }
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  window.mdShowSetup=function(){
    const c=cfg();
    overlay(`<h1>Configurar Mi día</h1><div class="sub">Solo hace falta una vez en cada dispositivo.</div>
      <div class="card"><div class="head" style="background:#47B5A8;color:#fff"><span class="cap">1 · Supabase (tus datos)</span></div>
        <div class="sub">En Supabase: Project Settings → API.</div>
        <input id="md-url" style="margin-top:8px" placeholder="Project URL (https://xxxx.supabase.co)" value="${esc(c.url||"")}">
        <input id="md-key" style="margin-top:8px" placeholder="anon public key" value="${esc(c.key||"")}">
        <details style="margin-top:10px"><summary class="sub">SQL para crear la tabla (pegar en SQL Editor → Run)</summary>
          <pre style="white-space:pre-wrap;font-size:12px;background:var(--soft);padding:10px;border-radius:10px">${esc(SQL)}</pre>
          <button class="btn small ghost" onclick="navigator.clipboard.writeText(window.mdSQL).then(()=>this.textContent='Copiado ✓')">Copiar SQL</button></details></div>
      <div class="card"><div class="head" style="background:#A3C1E2"><span class="cap">2 · Google Calendar (opcional)</span></div>
        <input id="md-gid" placeholder="Client ID (….apps.googleusercontent.com)" value="${esc(c.gid||"")}">
        <input id="md-gmail" style="margin-top:8px" placeholder="Tu Gmail (para no elegir cuenta cada vez)" value="${esc(c.gmail||"")}">
        <div class="note">Dirección que debes autorizar en Google: <b>${esc(location.origin)}</b> (orígenes) y <b>${esc(location.origin+location.pathname)}</b> (redirección).</div></div>
      <div id="md-msg" class="note" style="display:none;color:#F76F54"></div>
      <button class="btn" onclick="mdSaveSetup()">Guardar y seguir</button>`);
  };
  window.mdSaveSetup=function(){
    const url=document.getElementById("md-url").value.trim().replace(/\/+$/,""), key=document.getElementById("md-key").value.trim();
    const gid=document.getElementById("md-gid").value.trim(), gmail=document.getElementById("md-gmail").value.trim();
    if(!/^https:\/\/.+\.supabase\.co$/.test(url)) return alertBox("La URL de Supabase debe ser como https://xxxx.supabase.co");
    if(key.length<30) return alertBox("Pega la clave anon public completa");
    set(LSK,Object.assign({},cfg(),{url,key,gid,gmail})); location.reload();
  };
  function showLogin(){
    overlay(`<h1>Mi día</h1><div class="sub">Entra con tu cuenta (la misma en el móvil y en el ordenador).</div>
      <div class="card"><input id="md-em" type="email" autocomplete="email" placeholder="Email" value="${esc(cfg().gmail||"")}">
        <input id="md-pw" type="password" autocomplete="current-password" style="margin-top:8px" placeholder="Contraseña (mín. 6)">
        <div id="md-msg" class="note" style="display:none;color:#F76F54"></div>
        <button class="btn" style="margin-top:10px" onclick="mdAuth(false)">Entrar</button>
        <button class="btn ghost" style="margin-top:8px" onclick="mdAuth(true)">Crear cuenta (primera vez)</button></div>
      <button class="link mute" onclick="mdShowSetup()">Cambiar configuración</button>`);
  }
  window.mdAuth=async function(signup){
    const email=document.getElementById("md-em").value.trim(), password=document.getElementById("md-pw").value;
    if(!email||password.length<6) return alertBox("Pon tu email y una contraseña de al menos 6 caracteres");
    const r=signup?await sb.auth.signUp({email,password}):await sb.auth.signInWithPassword({email,password});
    if(r.error) return alertBox(r.error.message.includes("Invalid login")?"Email o contraseña incorrectos":r.error.message.includes("not confirmed")?"Confirma primero el correo que te ha mandado Supabase":r.error.message);
    if(signup&&!r.data.session) return alertBox("Cuenta creada. Abre el correo de Supabase para confirmarla y luego pulsa Entrar.");
  };

  async function start(){
    const c=cfg();
    if(!window.supabase){ overlay(`<h1>Mi día</h1><div class="card"><b>No se ha podido cargar la app.</b><div class="sub">Comprueba que tienes internet y vuelve a abrirla.</div><button class="btn" style="margin-top:10px" onclick="location.reload()">Reintentar</button></div>`); return }
    if(!c.url||!c.key){ window.mdShowSetup(); return }
    sb=window.supabase.createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data}=await sb.auth.getSession();
    const go=s=>{ if(!s||uid) return; uid=s.user.id; closeOverlay(); resolveReady(); flush(); setTimeout(()=>autoGoogle("inicio"),800) };
    if(data.session) go(data.session); else showLogin();
    sb.auth.onAuthStateChange((ev,s)=>{ if(s) go(s) });
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start); else start();
})();
