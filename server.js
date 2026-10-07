const http = require('http');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// --- sesi login kasir: token acak 256-bit + kedaluwarsa (server-side) ---
const SESSIONS = new Map(); // token -> {user, exp}
const TOKEN_TTL_MS = 12 * 3600 * 1000; // 12 jam
function newSession(user){
  const t = crypto.randomBytes(32).toString('hex');
  SESSIONS.set(t, { user, exp: Date.now() + TOKEN_TTL_MS });
  return t;
}
function getSession(req){
  const t = req.headers['x-token'];
  if (!t || typeof t !== 'string') return null;
  const s = SESSIONS.get(t);
  if (!s) return null;
  if (s.exp < Date.now()) { SESSIONS.delete(t); return null; }
  return s;
}
function needAuth(req, res){
  const s = getSession(req);
  if (!s) {
    res.writeHead(401, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ error:'Sesi habis / belum login. Login ulang di halaman utama.' }));
    return null;
  }
  return s;
}
// bersih-bersih token kedaluwarsa tiap 15 menit (jangan tahan proses)
setInterval(() => {
  const now = Date.now();
  for (const [t, s] of SESSIONS) if (s.exp < now) SESSIONS.delete(t);
  // bersih-bersih rate-limit yang kedaluwarsa
  for (const [k, v] of RL) if (v.reset < now) RL.delete(k);
}, 15 * 60 * 1000).unref();

// --- rate-limit in-memory anti brute-force / spam ---
const RL = new Map(); // key -> {count, reset}
function clientIp(req){
  const f = req.headers['x-forwarded-for'];
  if (typeof f === 'string' && f.length) return f.split(',')[0].trim().slice(0,64);
  return (req.socket && req.socket.remoteAddress || '').slice(0,64);
}
function rateLimit(key, max, windowMs){
  const now = Date.now();
  let e = RL.get(key);
  if (!e || e.reset < now) { e = { count: 0, reset: now + windowMs }; RL.set(key, e); }
  e.count++;
  return e.count <= max;
}
function rlDeny(res, retrySecs){
  res.writeHead(429, {'Content-Type':'application/json','Retry-After': String(retrySecs||60)});
  res.end(JSON.stringify({ error:'Terlalu banyak permintaan. Coba lagi nanti.' }));
  return false;
}
const PORT = process.env.CYBERPOS_PORT || 8000;
const HOST = process.env.CYBERPOS_HOST || '127.0.0.1';

const LOGIN_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>CyberPOS Login</title>
<style>body{font-family:sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0} .card{background:#1e293b;padding:32px;border-radius:16px;width:340px;text-align:center} button{background:#22c55e;border:0;padding:14px 20px;font-size:18px;border-radius:10px;width:100%;cursor:pointer;font-weight:bold} input{width:100%;padding:12px;margin:8px 0;border-radius:8px;border:0;box-sizing:border-box} small{color:#94a3b8}</style></head>
<body><div class="card"><h2>CyberPOS</h2><p>cyberpos.my.id</p>
<input id="u" value="admin@cyberpos.my.id" placeholder="email / username"><input id="p" type="password" placeholder="password" autocomplete="current-password">
<button id="btn" onclick="autoLogin()">AUTO LOGIN - Klik Sekali</button>
<p id="st"><small>Siap login otomatis</small></p>
<script>
async function autoLogin(){
  document.getElementById('st').innerHTML='Login...';
  try{
    const r = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({u:document.getElementById('u').value,p:document.getElementById('p').value})});
    const j = await r.json();
    if(j.token){ localStorage.setItem('cyberpos_token', j.token); localStorage.setItem('cyberpos_user', j.user); location.href='/pos'; }
    else document.getElementById('st').innerHTML='Gagal: '+j.error;
  }catch(e){ document.getElementById('st').innerHTML='Error: '+e; }
}
if(new URLSearchParams(location.search).get('autologin')==='1'){ window.onload=()=>setTimeout(autoLogin,800); }
</script></div></body></html>`;

const POS_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>CyberPOS Sesi Kerja</title>
<style>body{font-family:sans-serif;background:#0f172a;color:#fff;margin:0;padding:12px} h2{margin:6px 0} .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px} .item{background:#1e293b;border-radius:10px;padding:10px;text-align:center} .item b{display:block;margin:4px 0} .item button{background:#22c55e;border:0;border-radius:8px;padding:8px;width:100%;font-weight:bold} #cart{background:#1e293b;border-radius:10px;padding:10px;margin-top:10px} #cart button{background:#3b82f6;border:0;border-radius:8px;padding:12px;width:100%;font-weight:bold;color:#fff;font-size:16px} .top{display:flex;justify-content:space-between;align-items:center} .top button{background:#ef4444;border:0;border-radius:8px;padding:8px;color:#fff}</style></head>
<body><div class="top"><h2>CyberPOS Sesi Kerja</h2><button onclick="logout()">Keluar</button></div>
<p id="u"></p><div class="grid" id="g"></div>
<div id="cart"><h3>Keranjang (<span id="n">0</span>) Total: Rp <span id="t">0</span></h3><div id="items"></div><button onclick="checkout()">BAYAR</button><p id="rc"></p></div>
<script>
if(!localStorage.getItem('cyberpos_token')) location.href='/';
document.getElementById('u').innerHTML='Sesi kerja: '+localStorage.getItem('cyberpos_user');
const P=[['Kopi Hitam',8000],['Kopi Susu',12000],['Teh Manis',5000],['Gorengan',2000],['Nasi Goreng',15000],['Mie Ayam',13000],['Es Teh',4000],['Roti Bakar',10000]];
let C={};
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[c])); }
function render(){ let g=document.getElementById('g'); g.textContent=''; P.forEach((p,i)=>{ const d=document.createElement('div'); d.className='item'; const b=document.createElement('b'); b.textContent=p[0]; d.appendChild(b); const pr=document.createElement('div'); pr.textContent='Rp '+Number(p[1]); d.appendChild(pr); const br=document.createElement('br'); d.appendChild(br); const btn=document.createElement('button'); btn.textContent='+ Tambah'; btn.onclick=()=>add(i); d.appendChild(btn); g.appendChild(d); }); }
function add(i){ if(!Number.isInteger(i)||i<0||i>=P.length) return; C[i]=Math.min(100,(C[i]||0)+1); draw(); }
function draw(){ let n=0,t=0,h=''; for(let k in C){ const q=C[k]; if(!Number.isInteger(q)||q<1) continue; n+=q; t+=q*Number(P[k][1]); h+=esc(P[k][0])+' x'+q+' = Rp '+(q*Number(P[k][1]))+'<br>'; } document.getElementById('n').textContent=n; document.getElementById('t').textContent=t; document.getElementById('items').innerHTML=h; }
async function checkout(){ const rc=document.getElementById('rc'); if(!Object.keys(C).length){ rc.textContent='Keranjang kosong'; return; } const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json','X-Token':localStorage.getItem('cyberpos_token')},body:JSON.stringify({cart:C})}); if(r.status===401){ location.href='/'; return; } const j=await r.json(); rc.textContent='Lunas! Struk: '+String(j.receipt||'-')+' Total Rp '+Number(j.total||0); C={}; draw(); }
async function logout(){ try{ await fetch('/api/logout',{method:'POST',headers:{'X-Token':localStorage.getItem('cyberpos_token')}}); }catch(e){} localStorage.clear(); location.href='/'; }
render();
</script></body></html>`;

const MONITOR_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Monitor PC Ini Sendiri</title>
<style>body{font-family:sans-serif;background:#0f172a;color:#fff;margin:0;padding:12px} .card{background:#1e293b;border-radius:10px;padding:12px;margin-bottom:10px;white-space:pre-line} button{background:#22c55e;border:0;border-radius:8px;padding:10px;width:100%;font-weight:bold;margin-top:6px}</style></head>
<body><h2 style="text-align:center">MONITOR PC INI SENDIRI</h2>
<div class="card" id="sys">Loading...</div>
<button onclick="load(true)">REFRESH + SIMPAN LOG</button>
<h3 style="text-align:center">LOG PERFORMA (<span id="hc">0</span>)</h3><div id="hist"></div>
<p style="text-align:center"><a style="color:#22c55e" href="/pos">Ke Sesi Kerja</a> | <a style="color:#22c55e" href="/">Login</a></p>
<script>
function fmtUptime(s){ s=Math.floor(Number(s)||0); const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60); return (d>0?d+'h ':'')+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); }
function escH(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[c])); }
async function load(save){
  const j=await (await fetch('/api/sys')).json();
  document.getElementById('sys').innerText=
    'Host: '+j.hostname+'\\nOS: '+j.platform+' '+j.arch+' ('+j.release+')\\nCPU: '+j.cpuModel+' x'+j.cpuCount+' @ '+j.cpuSpeed+' MHz\\nRAM: '+j.usedMb+' / '+j.totalMb+' MB ('+j.ramPct+'%)\\nUptime: '+fmtUptime(j.uptimeSecs)+'\\nLoad: '+j.load1+', '+j.load5+', '+j.load15+(j.diskTotalGb?'\\nDisk: '+j.diskFreeGb+' / '+j.diskTotalGb+' GB free':'')+'\\nServices backend: '+(j.services?j.services.backend:'-')+' • opencode: '+(j.services?j.services.opencode:'-')+' • tunnel: '+(j.services?j.services.tunnel:'-')+'\\nPOS(8000): '+j.pos8000+' • Sesi OpenCode: '+j.sessionCount;
  if(save){ const tk=localStorage.getItem('cyberpos_token')||''; if(!tk){ document.getElementById('hc').textContent='login dulu untuk simpan log'; } else { await fetch('/api/sys/log',{method:'POST',headers:{'X-Token':tk}}); } }
  const h=await (await fetch('/api/sys/history')).json();
  document.getElementById('hc').textContent=(h.history||[]).length;
  document.getElementById('hist').innerHTML=(h.history||[]).map(x=>{ const t=new Date(Number(x.time)||0).toLocaleString(); const um=Number(x.usedMb)||0, tm=Number(x.totalMb)||0, rp=Number(x.ramPct)||0; return '<div style="background:#1e293b;border-radius:8px;padding:8px;margin:6px 0">'+escH(t)+'<br>RAM '+um+'/'+tm+' MB ('+rp+'%) • Up '+fmtUptime(x.uptimeSecs)+'</div>'; }).join('')||'<p style="text-align:center;color:#94a3b8">Belum ada log</p>';
}
load(false); setInterval(()=>load(false),5000);
</script></body></html>`;

// --- spek + log performa PC ini sendiri (non-blocking + cache) ---
const SVC_CACHE = { time: 0, data: { backend: 'n/a', opencode: 'n/a', tunnel: 'n/a', pos8000: 'n/a', sessionCount: -1 } };
let _svcRefreshing = false;
function httpGetTiny(port, path, timeoutMs){
  return new Promise((resolve) => {
    const r = http.get({ host: '127.0.0.1', port, path, timeout: timeoutMs || 2000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; if (b.length > 65536) res.destroy(); });
      res.on('end', () => resolve(b));
    });
    r.on('timeout', () => { r.destroy(); resolve(null); });
    r.on('error', () => resolve(null));
  });
}
function refreshServiceStatus(){
  if (_svcRefreshing) return;
  const now = Date.now();
  if (now - SVC_CACHE.time < 30000) return; // cache 30 detik
  _svcRefreshing = true;
  const { execFile } = require('child_process');
  const svcOne = (name) => new Promise((resolve) => {
    if (process.platform === 'win32') return resolve('n/a');
    execFile('systemctl', ['is-active', name], { timeout: 3000 }, (err, stdout) => {
      resolve(err ? 'n/a' : String(stdout || '').trim().slice(0, 32) || 'n/a');
    });
  });
  (async () => {
    const [b, o, t] = await Promise.all([svcOne('cyberpos-backend'), svcOne('opencode-serve'), svcOne('cloudflared-tunnel')]);
    let pos8000 = 'n/a';
    try {
      const h = await httpGetTiny(8000, '/health', 2000);
      pos8000 = h == null ? 'down' : (/ok/i.test(h) ? 'up' : 'down');
      if (process.platform === 'win32' && h == null) pos8000 = 'n/a';
    } catch (e) { pos8000 = 'down'; }
    let sessionCount = -1;
    try {
      const s = await httpGetTiny(4097, '/session', 4000);
      if (s != null) {
        const m = s.match(/ses_/g);
        sessionCount = m ? m.length : 0;
        try { const j = JSON.parse(s); if (Array.isArray(j)) sessionCount = j.length; } catch (e) {}
      }
    } catch (e) {}
    SVC_CACHE.data = { backend: b, opencode: o, tunnel: t, pos8000, sessionCount };
    SVC_CACHE.time = Date.now();
    _svcRefreshing = false;
  })().catch(() => { _svcRefreshing = false; });
}
function pcSys(){
  const cpus = os.cpus();
  const totalMb = Math.round(os.totalmem() / 1024 / 1024);
  const freeMb = Math.round(os.freemem() / 1024 / 1024);
  const usedMb = totalMb - freeMb;
  const load = os.loadavg();
  let diskTotalGb = null, diskFreeGb = null;
  try {
    if (fs.statfsSync) {
      const st = fs.statfsSync(__dirname);
      const bs = st.bsize || 4096;
      diskTotalGb = +((st.blocks * bs / 1024 / 1024 / 1024).toFixed(2));
      diskFreeGb = +((st.bfree * bs / 1024 / 1024 / 1024).toFixed(2));
    }
  } catch(e){}
  refreshServiceStatus(); // async, tidak blokir event loop; pakai cache
  const sv = SVC_CACHE.data;
  return {
    hostname: os.hostname(), platform: os.platform(), arch: os.arch(), release: os.release(),
    cpuCount: cpus.length, cpuModel: (cpus[0] ? cpus[0].model.trim() : '-'), cpuSpeed: (cpus[0] ? cpus[0].speed : 0),
    totalMb, freeMb, usedMb, ramPct: totalMb > 0 ? Math.round(usedMb * 100 / totalMb) : 0,
    uptimeSecs: Math.floor(os.uptime()),
    load1: +load[0].toFixed(2), load5: +load[1].toFixed(2), load15: +load[2].toFixed(2),
    diskTotalGb, diskFreeGb, time: Date.now(),
    services: { backend: sv.backend, opencode: sv.opencode, tunnel: sv.tunnel },
    pos8000: sv.pos8000, sessionCount: sv.sessionCount
  };
}
const SYS_HIST_FILE = __dirname + '/sys_history.json';
let SYS_HISTORY = [];
try { SYS_HISTORY = JSON.parse(fs.readFileSync(SYS_HIST_FILE,'utf8')||'[]'); } catch(e){ SYS_HISTORY = []; }
let lastSysLog = 0;
function saveSysHist(){ try{ fs.writeFileSync(SYS_HIST_FILE, JSON.stringify(SYS_HISTORY.slice(0,100))); }catch(e){} }

function mimeOf(p){
  if(p.endsWith('.js'))return 'application/javascript';
  if(p.endsWith('.css'))return 'text/css';
  if(p.endsWith('.png'))return 'image/png';
  if(p.endsWith('.json'))return 'application/json';
  return 'text/html';
}
function serveFile(rel,type,res){
  try{
    const path=require('path');
    const DASH_DIR=path.join(__dirname,'dash');
    let clean=(rel||'').split('?')[0].split('#')[0];
    try{ clean=decodeURIComponent(clean); }catch(e){}
    if(clean.includes('\0')) throw 0;
    // hanya boleh file di dalam folder dash/
    if(!(clean==='dash/index.html'||clean.startsWith('dash/'))) throw 0;
    if(clean.includes('..')) throw 0;
    const fp=path.resolve(__dirname,clean);
    const relCheck=path.relative(DASH_DIR,fp);
    if(relCheck.startsWith('..')||path.isAbsolute(relCheck)) throw 0;
    const d=fs.readFileSync(fp);
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(d);
  }catch(e){ res.writeHead(404); res.end('not found'); }
}
function proxyOc(req,res){
  const target=req.url.replace(/^\/oc-api/,'')||'/';
  const headers={...req.headers,host:'127.0.0.1:4097'};
  try{
    if(!global.__OCAUTH) global.__OCAUTH=require('fs').readFileSync(require('path').join(__dirname,'..','ocpass.txt'),'utf8').trim();
    if(global.__OCAUTH) headers.authorization='Basic '+Buffer.from('opencode:'+global.__OCAUTH).toString('base64');
  }catch(e){}
  const opts={host:'127.0.0.1',port:4097,path:target,method:req.method,headers};
  const pr=http.request(opts,(prx)=>{
    res.writeHead(prx.statusCode||200,prx.headers);
    prx.pipe(res);
  });
  pr.on('error',()=>{ res.writeHead(502,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'opencode down'})); });
  req.pipe(pr);
}
function autoLogSys(){
  const now = Date.now();
  if (now - lastSysLog < 10000) return; // max 1x per 10 detik biar tidak spam
  lastSysLog = now;
  const s = pcSys();
  SYS_HISTORY.unshift({time: s.time, ramPct: s.ramPct, usedMb: s.usedMb, totalMb: s.totalMb, uptimeSecs: s.uptimeSecs});
  SYS_HISTORY = SYS_HISTORY.slice(0,100); saveSysHist();
}

// --- warnet lama (tidak dipakai APK baru, tapi endpoint tetap biar tidak 404) ---
const TARIF_PER_JAM = 5000;
let PCS = Array.from({length:12},(_,i)=>({id:i+1,name:'PC'+String(i+1).padStart(2,'0'),playing:false,start:0,user:''}));
function pcState(){ const now=Date.now(); return {tarif:TARIF_PER_JAM,pcs:PCS.map(p=>{ const secs=p.playing?Math.floor((now-p.start)/1000):0; return {...p,secs,cost:Math.floor(secs*TARIF_PER_JAM/3600)}; })}; }
const HIST_FILE = __dirname + '/history.json';
let HISTORY = [];
try { HISTORY = JSON.parse(fs.readFileSync(HIST_FILE,'utf8')||'[]'); } catch(e){ HISTORY = []; }
function saveHist(){ try{ fs.writeFileSync(HIST_FILE, JSON.stringify(HISTORY.slice(0,100))); }catch(e){} }

// CORS hanya untuk endpoint publik (baca + login). Endpoint ber-auth
// tidak kirim CORS header supaya situs lain tidak bisa memakainya.
const PUBLIC_CORS_GET = new Set(['/','/pos','/monitor','/dash','/dash/','/health','/api/pcs','/api/sys','/api/sys/history']);
function allowCors(req,res){
  const p = req.url.split('?')[0];
  if (req.method === 'GET' && (PUBLIC_CORS_GET.has(p) || p.startsWith('/dash/'))) {
    res.setHeader('Access-Control-Allow-Origin','*');
    return;
  }
  if ((req.method === 'POST' && (p === '/api/login' || p === '/api/sys/log')) || req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Token');
  }
}

const server = http.createServer((req,res)=>{
  allowCors(req,res);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  if(req.method==='OPTIONS'){ res.writeHead(204); res.end(); return; }
  const urlPath = req.url.split('?')[0];
  if(req.url==='/' || req.url.startsWith('/?')){ res.writeHead(200,{'Content-Type':'text/html'}); res.end(LOGIN_HTML); return; }
  if(urlPath==='/dash'||urlPath==='/dash/'){ serveFile('dash/index.html','text/html',res); return; }
  if(urlPath.startsWith('/dash/')){ serveFile(urlPath.slice(1), mimeOf(urlPath.split('#')[0]), res); return; }
  if(req.url.startsWith('/oc-api/')){ proxyOc(req,res); return; }
  if(urlPath==='/pos'){ res.writeHead(200,{'Content-Type':'text/html'}); res.end(POS_HTML); return; }
  if(urlPath==='/monitor'){ res.writeHead(200,{'Content-Type':'text/html'}); res.end(MONITOR_HTML); return; }
  if(urlPath==='/api/sys'){ autoLogSys(); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(pcSys())); return; }
  if(urlPath==='/api/sys/history'){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({history:SYS_HISTORY})); return; }
  if(urlPath==='/api/sys/log' && req.method==='POST'){
    if(!needAuth(req,res)) return;
    const ip = clientIp(req);
    if(!rateLimit('syslog:'+ip, 10, 5*60*1000)) { rlDeny(res, 60); return; }
    autoLogSys(); lastSysLog = 0; autoLogSys(); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true,history:SYS_HISTORY})); return;
  }
  if(urlPath==='/api/sys/clear' && req.method==='POST'){ if(!needAuth(req,res)) return; SYS_HISTORY=[]; saveSysHist(); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true})); return; }
  if(urlPath==='/api/pcs'){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(pcState())); return; }
  if(urlPath==='/api/history'){ if(!needAuth(req,res)) return; res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({history:HISTORY})); return; }
  if((urlPath==='/api/pc/start'||urlPath==='/api/pc/stop') && req.method==='POST'){
    if(!needAuth(req,res)) return;
    let b=''; req.on('data',c=>b+=c); req.on('end',()=>{
      try{
        if(b.length>4096) throw 0;
        const {id}=JSON.parse(b||'{}'); const pc=PCS.find(p=>p.id===+id);
        if(!pc){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'pc tidak ada'})); return; }
        if(urlPath==='/api/pc/start'){ pc.playing=true; pc.start=Date.now(); pc.user='User'; }
        else {
          if(pc.playing){
            const end=Date.now(); const secs=Math.floor((end-pc.start)/1000);
            const cost=Math.floor(secs*TARIF_PER_JAM/3600);
            HISTORY.unshift({pcName:pc.name,user:pc.user||'User',startTime:pc.start,endTime:end,durationSecs:secs,cost});
            HISTORY=HISTORY.slice(0,100); saveHist();
          }
          pc.playing=false; pc.start=0; pc.user='';
        }
        res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true,pcs:pcState().pcs,history:HISTORY}));
      }catch(e){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'bad json'})); }
    }); return;
  }
  if(urlPath==='/health'){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true,domain:'cyberpos.my.id'})); return; }
  if(urlPath==='/api/login' && req.method==='POST'){
    const ip = clientIp(req);
    if(!rateLimit('login:'+ip, 10, 5*60*1000)) { rlDeny(res, 300); return; }
    let b=''; req.on('data',c=>b+=c); req.on('end',()=>{
      try{
        if(b.length>4096) throw 0;
        const {u,p}=JSON.parse(b||'{}');
        if(typeof u!=='string'||typeof p!=='string'||u.length>256||p.length>256) throw 0;
        const AU = process.env.CYBERPOS_ADMIN;
        const AP = process.env.CYBERPOS_PASS;
        if(!AU || !AP){
          console.error('FATAL: CYBERPOS_ADMIN / CYBERPOS_PASS belum di-set di environment');
          res.writeHead(503,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'server belum dikonfigurasi. hubungi admin.'}));
          return;
        }
        if(u===AU && p===AP){
          if(!rateLimit('login-ok:'+ip, 30, 5*60*1000)) { rlDeny(res, 300); return; }
          const token = newSession(u);
          res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({token,user:u,expHours:12}));
        } else {
          // samakan waktu respon biar tidak gampang user-enumeration via timing
          res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'user/pass salah'}));
        }
      }catch(e){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'bad json'})); }
    }); return;
  }
  if(urlPath==='/api/logout' && req.method==='POST'){
    const t = req.headers['x-token'];
    if (t && typeof t === 'string') SESSIONS.delete(t);
    res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true})); return;
  }
  if(urlPath==='/api/checkout' && req.method==='POST'){
    if(!needAuth(req,res)) return;
    let b=''; req.on('data',c=>b+=c); req.on('end',()=>{
      if(b.length>65536){ res.writeHead(413,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'payload terlalu besar'})); return; }
      const PRICES=[8000,12000,5000,2000,15000,13000,4000,10000];
      try{
        const {cart}=JSON.parse(b||'{}');
        if(!cart||typeof cart!=='object'||Array.isArray(cart)) throw 0;
        let total=0, count=0;
        for(const k in cart){
          if(!/^[0-7]$/.test(k)) throw 0;
          const q=cart[k];
          if(!Number.isInteger(q)||q<1||q>100) throw 0;
          count+=q;
          if(count>200) throw 0;
          total+=(PRICES[+k]||0)*q;
        }
        if(count===0) throw 0;
        res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({receipt:'CPS-'+Date.now(),total}));
      }catch(e){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'bad cart'})); }
    }); return;
  }
  res.writeHead(404); res.end('not found');
});
server.listen(PORT,HOST,()=>console.log(`CyberPOS backend http://${HOST}:${PORT} -> https://cyberpos.my.id`));
