const http = require('http');
const os = require('os');
const fs = require('fs');
const PORT = process.env.CYBERPOS_PORT || 8000;
const HOST = process.env.CYBERPOS_HOST || '127.0.0.1';

const LOGIN_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>CyberPOS Login</title>
<style>body{font-family:sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0} .card{background:#1e293b;padding:32px;border-radius:16px;width:340px;text-align:center} button{background:#22c55e;border:0;padding:14px 20px;font-size:18px;border-radius:10px;width:100%;cursor:pointer;font-weight:bold} input{width:100%;padding:12px;margin:8px 0;border-radius:8px;border:0;box-sizing:border-box} small{color:#94a3b8}</style></head>
<body><div class="card"><h2>CyberPOS</h2><p>cyberpos.my.id</p>
<input id="u" value="admin@cyberpos.my.id"><input id="p" type="password" value="admin123">
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
function render(){ let g=document.getElementById('g'); g.innerHTML=''; P.forEach((p,i)=>{ g.innerHTML+='<div class=item><b>'+p[0]+'</b>Rp '+p[1]+'<br><br><button onclick="add('+i+')">+ Tambah</button></div>'; }); }
function add(i){ C[i]=(C[i]||0)+1; draw(); }
function draw(){ let n=0,t=0,h=''; for(let k in C){ n+=C[k]; t+=C[k]*P[k][1]; h+=P[k][0]+' x'+C[k]+' = Rp '+(C[k]*P[k][1])+'<br>'; } document.getElementById('n').innerHTML=n; document.getElementById('t').innerHTML=t; document.getElementById('items').innerHTML=h; }
async function checkout(){ if(!Object.keys(C).length){ document.getElementById('rc').innerHTML='Keranjang kosong'; return; } const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json','X-Token':localStorage.getItem('cyberpos_token')},body:JSON.stringify({cart:C})}); const j=await r.json(); document.getElementById('rc').innerHTML='Lunas! Struk: '+j.receipt+' Total Rp '+j.total; C={}; draw(); }
function logout(){ localStorage.clear(); location.href='/'; }
render();
</script></body></html>`;

const MONITOR_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Monitor PC Ini Sendiri</title>
<style>body{font-family:sans-serif;background:#0f172a;color:#fff;margin:0;padding:12px} .card{background:#1e293b;border-radius:10px;padding:12px;margin-bottom:10px;white-space:pre-line} button{background:#22c55e;border:0;border-radius:8px;padding:10px;width:100%;font-weight:bold;margin-top:6px}</style></head>
<body><h2 style="text-align:center">MONITOR PC INI SENDIRI</h2>
<div class="card" id="sys">Loading...</div>
<button onclick="load(true)">REFRESH + SIMPAN LOG</button>
<h3 style="text-align:center">LOG PERFORMA (<span id="hc">0</span>)</h3><div id="hist"></div>
<p style="text-align:center"><a style="color:#22c55e" href="/pos">Ke Kasir</a> | <a style="color:#22c55e" href="/">Login</a></p>
<script>
function fmtUptime(s){ s=Math.floor(s||0); const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60); return (d>0?d+'h ':'')+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); }
async function load(save){
  const j=await (await fetch('/api/sys')).json();
  document.getElementById('sys').innerText=
    'Host: '+j.hostname+'\\nOS: '+j.platform+' '+j.arch+' ('+j.release+')\\nCPU: '+j.cpuModel+' x'+j.cpuCount+' @ '+j.cpuSpeed+' MHz\\nRAM: '+j.usedMb+' / '+j.totalMb+' MB ('+j.ramPct+'%)\\nUptime: '+fmtUptime(j.uptimeSecs)+'\\nLoad: '+j.load1+', '+j.load5+', '+j.load15+(j.diskTotalGb?'\\nDisk: '+j.diskFreeGb+' / '+j.diskTotalGb+' GB free':'')+'\\nServices backend: '+(j.services?j.services.backend:'-')+' • opencode: '+(j.services?j.services.opencode:'-')+' • tunnel: '+(j.services?j.services.tunnel:'-')+'\\nPOS(8000): '+j.pos8000+' • Sesi OpenCode: '+j.sessionCount;
  if(save){ await fetch('/api/sys/log',{method:'POST'}); }
  const h=await (await fetch('/api/sys/history')).json();
  document.getElementById('hc').innerHTML=(h.history||[]).length;
  document.getElementById('hist').innerHTML=(h.history||[]).map(x=>'<div style="background:#1e293b;border-radius:8px;padding:8px;margin:6px 0">'+new Date(x.time).toLocaleString()+'<br>RAM '+x.usedMb+'/'+x.totalMb+' MB ('+x.ramPct+'%) • Up '+fmtUptime(x.uptimeSecs)+'</div>').join('')||'<p style="text-align:center;color:#94a3b8">Belum ada log</p>';
}
load(false); setInterval(()=>load(false),5000);
</script></body></html>`;

// --- spek + log performa PC ini sendiri ---
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
  // status service + sesi + POS (n/a di luar systemd)
  let svcBackend = 'n/a', svcOpencode = 'n/a', svcTunnel = 'n/a', pos8000 = 'n/a', sessionCount = -1;
  try {
    const ex = require('child_process').execSync;
    const svc = (n) => { try { return ex('systemctl is-active ' + n, { timeout: 3000 }).toString().trim(); } catch (e) { return 'n/a'; } };
    svcBackend = svc('cyberpos-backend'); svcOpencode = svc('opencode-serve'); svcTunnel = svc('cloudflared-tunnel');
    try {
      const h = ex('curl -s -m 2 http://127.0.0.1:8000/health', { timeout: 4000 }).toString();
      pos8000 = /ok/i.test(h) ? 'up' : 'down';
    } catch (e) { pos8000 = 'down'; }
    try {
      const out = ex('curl -s -m 4 http://127.0.0.1:4097/session | grep -o ses_ | wc -l', { timeout: 8000 }).toString().trim();
      const n = parseInt(out, 10);
      sessionCount = isNaN(n) ? -1 : n;
    } catch (e) { sessionCount = -1; }
  } catch (e) {}
  return {
    hostname: os.hostname(), platform: os.platform(), arch: os.arch(), release: os.release(),
    cpuCount: cpus.length, cpuModel: (cpus[0] ? cpus[0].model.trim() : '-'), cpuSpeed: (cpus[0] ? cpus[0].speed : 0),
    totalMb, freeMb, usedMb, ramPct: totalMb > 0 ? Math.round(usedMb * 100 / totalMb) : 0,
    uptimeSecs: Math.floor(os.uptime()),
    load1: +load[0].toFixed(2), load5: +load[1].toFixed(2), load15: +load[2].toFixed(2),
    diskTotalGb, diskFreeGb, time: Date.now(),
    services: { backend: svcBackend, opencode: svcOpencode, tunnel: svcTunnel },
    pos8000, sessionCount
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
    const fp=require('path').join(__dirname,rel);
    if(!fp.startsWith(__dirname)) throw 0;
    const d=fs.readFileSync(fp);
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});
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

const server = http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Token');
  if(req.method==='OPTIONS'){ res.writeHead(204); res.end(); return; }
  if(req.url==='/' || req.url.startsWith('/?')){ res.writeHead(200,{'Content-Type':'text/html'}); res.end(LOGIN_HTML); return; }
  if(req.url==='/dash'||req.url==='/dash/'){ serveFile('dash/index.html','text/html',res); return; }
  if(req.url.startsWith('/dash/')){ serveFile(req.url.slice(1), mimeOf(req.url), res); return; }
  if(req.url.startsWith('/oc-api/')){ proxyOc(req,res); return; }
  if(req.url==='/pos'){ res.writeHead(200,{'Content-Type':'text/html'}); res.end(POS_HTML); return; }
  if(req.url==='/monitor'){ res.writeHead(200,{'Content-Type':'text/html'}); res.end(MONITOR_HTML); return; }
  if(req.url==='/api/sys'){ autoLogSys(); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(pcSys())); return; }
  if(req.url==='/api/sys/history'){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({history:SYS_HISTORY})); return; }
  if(req.url==='/api/sys/log' && req.method==='POST'){ autoLogSys(); lastSysLog = 0; autoLogSys(); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true,history:SYS_HISTORY})); return; }
  if(req.url==='/api/sys/clear' && req.method==='POST'){ SYS_HISTORY=[]; saveSysHist(); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true})); return; }
  if(req.url==='/api/pcs'){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(pcState())); return; }
  if(req.url==='/api/history'){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({history:HISTORY})); return; }
  if((req.url==='/api/pc/start'||req.url==='/api/pc/stop') && req.method==='POST'){
    let b=''; req.on('data',c=>b+=c); req.on('end',()=>{
      try{
        const {id}=JSON.parse(b||'{}'); const pc=PCS.find(p=>p.id===+id);
        if(!pc){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'pc tidak ada'})); return; }
        if(req.url==='/api/pc/start'){ pc.playing=true; pc.start=Date.now(); pc.user='User'; }
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
  if(req.url==='/health'){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true,domain:'cyberpos.my.id'})); return; }
  if(req.url==='/api/login' && req.method==='POST'){
    let b=''; req.on('data',c=>b+=c); req.on('end',()=>{
      try{
        const {u,p}=JSON.parse(b||'{}');
        if((u==='admin@cyberpos.my.id'&&p==='admin123')||(u==='admin'&&p==='admin123')){
          res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({token:'cyberpos-auto-'+Date.now(),user:u}));
        } else { res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'user/pass salah. pakai admin@cyberpos.my.id / admin123'})); }
      }catch(e){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'bad json'})); }
    }); return;
  }
  if(req.url==='/api/checkout' && req.method==='POST'){
    let b=''; req.on('data',c=>b+=c); req.on('end',()=>{
      const PRICES=[8000,12000,5000,2000,15000,13000,4000,10000];
      try{
        const {cart}=JSON.parse(b||'{}'); let total=0;
        for(const k in (cart||{})) total+=(PRICES[+k]||0)*cart[k];
        res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({receipt:'CPS-'+Date.now(),total}));
      }catch(e){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'bad cart'})); }
    }); return;
  }
  res.writeHead(404); res.end('not found');
});
server.listen(PORT,HOST,()=>console.log(`CyberPOS backend http://${HOST}:${PORT} -> https://cyberpos.my.id`));
