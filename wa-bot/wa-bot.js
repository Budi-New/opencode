// wa-bot QR: simpan QR ke qr.png tiap ada event, kirim 1 pesan saat konek lalu keluar.
const fs = require('fs');
const QRCode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const TARGET = '6287886084448@s.whatsapp.net';
const TEXT = 'hallo';
const WAIT_MS = 5 * 60 * 1000;

const log = (m) => { console.log(m); };

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const sock = makeWASocket({ auth: state, printQRInTerminal: false, browser: ['CyberBot', 'Chrome', '1.0'] });
  sock.ev.on('creds.update', saveCreds);

  let done = false, qrCount = 0;
  const finish = (msg, code) => { if (!done) { done = true; log(msg); setTimeout(() => process.exit(code), 500); } };
  setTimeout(() => finish('FAIL:TIMEOUT 5 menit', 1), WAIT_MS);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      qrCount++;
      try {
        await QRCode.toFile('./qr.png', qr, { width: 400, margin: 2 });
        log('QR_READY:' + qrCount);
      } catch (e) { log('WARN:QR ' + (e && e.message)); }
    }
    if (connection === 'open') {
      log('CONNECTED');
      try {
        await sock.sendMessage(TARGET, { text: TEXT });
        finish('SENT:' + TARGET, 0);
      } catch (e) { finish('FAIL:SEND ' + (e && e.message), 1); }
    } else if (connection === 'close') {
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
      if (code === DisconnectReason.loggedOut) finish('FAIL:LOGGED_OUT hapus folder auth dan ulangi', 1);
    }
  });

  if (sock.authState.creds.registered) log('ALREADY_REGISTERED');
}

main().catch((e) => { console.log('FAIL:START ' + (e && e.message)); process.exit(1); });
