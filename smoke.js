// Smoke test CyberPOS backend: node smoke.js (exit 1 jika ada yang gagal).
// Menyalakan server.js anak di port tes, tanpa mengganggu server produksi.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 18090;
const BASE = 'http://127.0.0.1:' + PORT;
const ADMIN = 'smoke@test.id';
const PASS = 'SmokeTest1234567890';
const SESS_KEY = 'smoke-test-passphrase-1234567890';
const SESS_FILE = path.join(__dirname, 'sessions.json');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function req(method, p, headers, body, timeoutMs) {
  return new Promise((resolve) => {
    const u = new URL(BASE + p);
    const r = http.request({ host: u.hostname, port: u.port, path: u.pathname, method, headers: headers || {}, timeout: timeoutMs || 8000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on('timeout', () => { r.destroy(); resolve({ status: -1, headers: {}, body: 'timeout' }); });
    r.on('error', (e) => resolve({ status: -1, headers: {}, body: String((e && e.message) || e) }));
    if (body) r.write(body);
    r.end();
  });
}
function waitHealth(proc, ms) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      if (proc.exitCode !== null && proc.exitCode !== undefined) return resolve(false);
      const r = await req('GET', '/health');
      if (r.status === 200) return resolve(true);
      if (Date.now() - t0 > (ms || 20000)) return resolve(false);
      setTimeout(tick, 300);
    };
    tick();
  });
}
function startServer(clean) {
  if (clean !== false) {
    try { fs.unlinkSync(SESS_FILE); } catch (e) {}
    try { fs.unlinkSync(SESS_FILE + '.tmp'); } catch (e) {}
  }
  const env = Object.assign({}, process.env, {
    CYBERPOS_PORT: String(PORT), CYBERPOS_HOST: '127.0.0.1',
    CYBERPOS_ADMIN: ADMIN, CYBERPOS_PASS: PASS, CYBERPOS_SESS_KEY: SESS_KEY,
  });
  return spawn('node', ['server.js'], { cwd: __dirname, env, stdio: 'ignore' });
}
function stopServer(proc, sig) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode !== null) return resolve();
    const to = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (e) {} resolve(); }, 8000);
    proc.on('exit', () => { clearTimeout(to); resolve(); });
    try { proc.kill(sig || 'SIGTERM'); } catch (e) { clearTimeout(to); resolve(); }
  });
}
(async () => {
  let child = startServer();
  try {
    ok('server-up', await waitHealth(child, 20000));
    let r = await req('GET', '/dash/../server.js');
    ok('traversal-404', r.status === 404, 'got ' + r.status);
    r = await req('GET', '/dash/');
    ok('dash-200', r.status === 200, 'got ' + r.status);

    r = await req('POST', '/api/login', { 'Content-Type': 'application/json' }, JSON.stringify({ u: 'x', p: 'y' }));
    ok('login-salah-401', r.status === 401, 'got ' + r.status);

    r = await req('POST', '/api/login', { 'Content-Type': 'application/json' }, JSON.stringify({ u: ADMIN, p: PASS }));
    let tok = null, cookie = null;
    try { tok = JSON.parse(r.body).token; } catch (e) {}
    const sc = r.headers['set-cookie'];
    const m = Array.isArray(sc) ? sc.join(';').match(/cyberpos_token=([0-9a-f]{64})/) : String(sc || '').match(/cyberpos_token=([0-9a-f]{64})/);
    if (m) cookie = 'cyberpos_token=' + m[1];
    ok('login-ok-200', r.status === 200 && /^[0-9a-f]{64}$/.test(tok || ''), 'status ' + r.status);
    ok('login-set-cookie-httponly', !!cookie && /HttpOnly/.test(Array.isArray(sc) ? sc.join(';') : String(sc || '')), String(sc || '').slice(0, 60));

    const XT = { 'Content-Type': 'application/json', 'X-Token': tok };
    r = await req('POST', '/api/checkout', XT, JSON.stringify({ cart: { 0: -5 } }));
    ok('checkout-qty-negatif-400', r.status === 400, 'got ' + r.status);
    r = await req('POST', '/api/checkout', XT, JSON.stringify({ cart: { 99: 1 } }));
    ok('checkout-key-salah-400', r.status === 400, 'got ' + r.status);
    r = await req('POST', '/api/checkout', { 'Content-Type': 'application/json', Cookie: cookie }, JSON.stringify({ cart: { 2: 3 } }));
    let total = null;
    try { total = JSON.parse(r.body).total; } catch (e) {}
    ok('checkout-cookie-only-200-total-15000', r.status === 200 && total === 15000, 'got ' + r.status + ' total=' + total);

    r = await req('POST', '/api/sys/log');
    ok('syslog-anon-401', r.status === 401, 'got ' + r.status);
    r = await req('POST', '/api/sys/log', { Cookie: cookie });
    ok('syslog-auth-200', r.status === 200, 'got ' + r.status);

    const h0 = await req('GET', '/api/sys/history');
    const t0 = (((JSON.parse(h0.body).history) || [])[0] || {}).time;
    await req('GET', '/api/sys');
    await req('GET', '/api/sys');
    const h1 = await req('GET', '/api/sys/history');
    const t1 = (((JSON.parse(h1.body).history) || [])[0] || {}).time;
    ok('get-sys-tanpa-side-effect', t0 === t1, t0 + ' vs ' + t1);
    await req('POST', '/api/sys/log', { Cookie: cookie });
    const h2 = await req('GET', '/api/sys/history');
    const t2 = (((JSON.parse(h2.body).history) || [])[0] || {}).time;
    ok('post-log-nambah-1', t2 > t1, t1 + ' vs ' + t2);

    r = await req('GET', '/api/me', { Cookie: cookie });
    ok('me-auth-200', r.status === 200, 'got ' + r.status);
    r = await req('GET', '/api/me');
    ok('me-anon-401', r.status === 401, 'got ' + r.status);
    r = await req('GET', '/oc-api/session');
    ok('ocapi-anon-401', r.status === 401, 'got ' + r.status);

    let saw429 = false;
    for (let i = 0; i < 12; i++) {
      r = await req('POST', '/api/login', { 'Content-Type': 'application/json' }, JSON.stringify({ u: 'x', p: 'y' }));
      if (r.status === 429) saw429 = true;
    }
    ok('login-bruteforce-429', saw429);

    await stopServer(child);
    child = startServer(false);
    // sesi persist: file terenkripsi sudah tersimpan saat login tadi
    ok('restart-up', await waitHealth(child, 20000));
    r = await req('POST', '/api/checkout', { 'Content-Type': 'application/json', Cookie: cookie }, JSON.stringify({ cart: { 0: 1 } }));
    ok('sesi-tahan-restart', r.status === 200, 'got ' + r.status);

    r = await req('POST', '/api/logout', { Cookie: cookie });
    ok('logout-200', r.status === 200, 'got ' + r.status);
    r = await req('POST', '/api/checkout', { 'Content-Type': 'application/json', Cookie: cookie }, JSON.stringify({ cart: { 0: 1 } }));
    ok('checkout-setelah-logout-401', r.status === 401, 'got ' + r.status);
  } finally {
    await stopServer(child, 'SIGKILL');
    try { fs.unlinkSync(SESS_FILE); } catch (e) {}
    try { fs.unlinkSync(SESS_FILE + '.tmp'); } catch (e) {}
  }
  console.log('SELESAI pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL fatal ' + String((e && e.message) || e)); process.exit(1); });
