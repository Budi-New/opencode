// telecoder: gateway Telegram <-> OpenCode (tanpa dependensi, Node 22+).
// - hanya layani ALLOWED_CHAT_ID
// - /baru [judul] : sesi baru | teks biasa : prompt ke sesi aktif | /sesi | /batal
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const STATE_FILE = path.join(DIR, 'state.json');
const BOT = process.env.TELEBOT_TOKEN || '';
const OC = process.env.OPENCODE_BASE || 'http://127.0.0.1:4097';
const ALLOWED = (process.env.ALLOWED_CHAT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
const MODEL = { providerID: 'opencode', modelID: 'muse-spark-1.3-contributor-free' };
const AGENT = 'build';
const OC_AUTH = process.env.OPENCODE_AUTH || '';
const ocHeaders = { 'Content-Type': 'application/json' };
if (OC_AUTH) ocHeaders.Authorization = 'Basic ' + Buffer.from('opencode:' + OC_AUTH).toString('base64');

if (!BOT) { console.error('TELEBOT_TOKEN kosong'); process.exit(1); }
if (!ALLOWED.length) { console.error('ALLOWED_CHAT_ID kosong - fail-closed: tolak semua. Set ALLOWED_CHAT_ID=chat_id_anda'); process.exit(1); }

let state = { offset: 0, chats: {} };
try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) {}
const save = () => { try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (e) {} };

async function tg(method, body, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs || 60000);
  try {
    const r = await fetch('https://api.telegram.org/bot' + BOT + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: ctl.signal,
    });
    return await r.json();
  } finally { clearTimeout(t); }
}

async function oc(method, p, body, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs || 120000);
  try {
    const r = await fetch(OC + p, {
      method: method,
      headers: ocHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    const txt = await r.text();
    if (!r.ok) throw new Error('OC ' + r.status + ' ' + txt.slice(0, 200));
    return txt ? JSON.parse(txt) : null;
  } finally { clearTimeout(t); }
}

function splitSend(text) {
  const parts = [];
  let s = String(text || '(kosong)');
  while (s.length > 4000) {
    let cut = s.lastIndexOf('\n', 4000);
    if (cut < 500) cut = 4000;
    parts.push(s.slice(0, cut));
    s = s.slice(cut);
  }
  parts.push(s);
  return parts;
}

async function reply(chatId, text) {
  for (const p of splitSend(text)) {
    const r = await tg('sendMessage', { chat_id: chatId, text: p }, 30000);
    if (!r.ok) console.error('send fail', JSON.stringify(r).slice(0, 200));
    await new Promise((r2) => setTimeout(r2, 400));
  }
}

function partsText(msg) {
  const out = [];
  const parts = (msg && (msg.parts || (msg.info ? [] : []))) || [];
  const arr = Array.isArray(msg) ? msg : (msg.parts || []);
  for (const p of arr) {
    if (!p || typeof p !== 'object') continue;
    if (p.type === 'text' && p.text) out.push(p.text);
  }
  return out.join('\n').trim();
}

async function ensureSession(chatId, title) {
  if (state.chats[chatId]) return state.chats[chatId];
  const s = await oc('POST', '/session', { title: title || 'Telegram' }, 30000);
  state.chats[chatId] = s.id;
  save();
  return s.id;
}

async function handleUpdate(u) {
  const msg = u.message;
  if (!msg || !msg.text) return;
  const chatId = String(msg.chat.id);
  if (!ALLOWED.includes(chatId)) {
    await reply(msg.chat.id, 'Maaf, bot ini privat.');
    return;
  }
  const text = msg.text.trim();
  if (text === '/start') {
    await reply(msg.chat.id, 'Halo! Mode coding aktif kalau pesan diawali "coding bro".\nContoh: coding bro buatkan fungsi faktorial\n/bar u = sesi baru (opsional: /baru judul)\n/sesi = sesi aktif\n/batal = hentikan proses jalan');
    return;
  }
  if (text === '/sesi') {
    await reply(msg.chat.id, state.chats[chatId] ? ('Sesi aktif: ' + state.chats[chatId]) : 'Belum ada sesi. Kirim /baru dulu atau langsung kirim perintah.');
    return;
  }
  if (text === '/batal') {
    const sid = state.chats[chatId];
    if (!sid) { await reply(msg.chat.id, 'Tidak ada sesi aktif.'); return; }
    try { await oc('POST', '/session/' + sid + '/abort', {}, 20000); } catch (e) {}
    await reply(msg.chat.id, 'Dibatalkan.');
    return;
  }
  let sid = state.chats[chatId];
  if (text.startsWith('/baru')) {
    const title = text.replace('/baru', '').trim() || 'Telegram';
    const s = await oc('POST', '/session', { title }, 30000);
    state.chats[chatId] = s.id;
    save();
    await reply(msg.chat.id, 'Sesi baru: ' + (s.title || s.id) + '\nKirim perintah coding sekarang.');
    return;
  }
  try {
    const b = text.match(/^bro cyber\s*/i);
    if (b) {
      const prompt = text.slice(b[0].length).trim();
      if (!prompt) {
        await reply(msg.chat.id, 'Hadir bro. Tulis pesannya setelah "bro cyber".');
        return;
      }
      const chatKey = chatId + ':bro';
      if (!state.chats[chatKey]) {
        const s = await oc('POST', '/session', { title: 'BroCyber' }, 30000);
        state.chats[chatKey] = s.id;
        save();
      }
      const sid2 = state.chats[chatKey];
      const typing = setInterval(() => { tg('sendChatAction', { chat_id: msg.chat.id, action: 'typing' }, 10000).catch(() => {}); }, 4500);
      let answer;
      try {
        answer = await oc('POST', '/session/' + sid2 + '/message', {
          model: MODEL, agent: AGENT,
          system: 'Kamu bro cyber, asisten santai berbahasa Indonesia. Jawab singkat, jelas, gaya bro-bro tapi tetap tepat. Tidak perlu format kaku.',
          parts: [{ type: 'text', text: prompt }],
        }, 8 * 60 * 1000);
      } finally { clearInterval(typing); }
      const t = partsText(answer);
      await reply(msg.chat.id, t || '(kosong — coba lagi)');
      return;
    }
    const m = text.match(/^coding bro\s*/i);
    if (!m) {
      await reply(msg.chat.id, 'Mode coding: awali pesan dengan "coding bro".\nContoh: coding bro buatkan fungsi faktorial');
      return;
    }
    const prompt = text.slice(m[0].length).trim();
    if (!prompt) {
      await reply(msg.chat.id, 'Tulis perintahnya setelah "coding bro".\nContoh: coding bro buatkan fungsi faktorial');
      return;
    }
    sid = await ensureSession(chatId, 'Telegram');
    const typing = setInterval(() => { tg('sendChatAction', { chat_id: msg.chat.id, action: 'typing' }, 10000).catch(() => {}); }, 4500);
    let answer;
    try {
      answer = await oc('POST', '/session/' + sid + '/message', {
        model: MODEL, agent: AGENT,
        parts: [{ type: 'text', text: prompt }],
      }, 8 * 60 * 1000);
    } finally { clearInterval(typing); }
    const t = partsText(answer);
    await reply(msg.chat.id, t || '(selesai tanpa teks — cek detail di web)');
  } catch (e) {
    await reply(msg.chat.id, 'Gagal: ' + String((e && e.message) || e).slice(0, 300));
  }
}

async function loop() {
  console.log('telecoder jalan, OC=' + OC);
  for (;;) {
    try {
      const r = await tg('getUpdates', { offset: state.offset, timeout: 50 }, 70000);
      if (r.ok && r.result) {
        for (const u of r.result) {
          state.offset = u.update_id + 1;
          save();
          await handleUpdate(u).catch((e) => console.error('handle', e.message));
        }
      }
    } catch (e) {
      console.error('poll', String((e && e.message) || e).slice(0, 120));
      await new Promise((r2) => setTimeout(r2, 5000));
    }
  }
}
loop();
