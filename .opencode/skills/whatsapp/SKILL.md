---
name: whatsapp
description: Use when sending WhatsApp messages, building WhatsApp bots, or working with WhatsApp API, Baileys, whatsapp-web.js, Fonnte, Wablas, WHATSAPP_TOKEN, QR pairing.
---

# WhatsApp Skill

Gunakan skill ini setiap kali user menyebut whatsapp, wa, kirim pesan wa, bot wa, Baileys, `whatsapp-web.js`, Fonnte, Wablas, `WHATSAPP_TOKEN`.

WhatsApp tidak punya Bot API resmi gratis seperti Telegram. Pilih salah satu jalur di bawah. Default disarankan: **HTTP gateway** untuk kirim pesan saja, **Baileys** untuk bot full.

## Jalur A - HTTP Gateway (disarankan untuk kirim pesan saja)

Populer di Indonesia: Fonnte, Wablas, Starsender, dll. User harus daftar sendiri dan memberi token + device.

Env yang dipakai:
- `WHATSAPP_PROVIDER` - `fonnte` | `wablas` | `custom`
- `WHATSAPP_TOKEN` - API key dari provider
- `WHATSAPP_DEVICE` - nomor device / sender (khusus Wablas)
- `WHATSAPP_API_BASE` - base URL provider jika custom

Contoh Fonnte (PowerShell):
```powershell
$Headers = @{ Authorization = $env:WHATSAPP_TOKEN }
$Body = @{ target = "62812xxxxxxx"; message = "Halo dari opencode!" }
Invoke-RestMethod -Uri "https://api.fonnte.com/send" -Method Post -Headers $Headers -Body $Body
```

Contoh Wablas (PowerShell):
```powershell
$Headers = @{ Authorization = "$($env:WHATSAPP_TOKEN).$($env:WHATSAPP_DEVICE)" }
$Body = @{ phone = "62812xxxxxxx"; message = "Halo!" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://console.wablas.com/api/send-message" -Method Post -Headers $Headers -ContentType "application/json" -Body $Body
```

Format nomor: `628xx...` (tanpa `+`, tanpa spasi, tanpa `-`). Selalu validasi nomor sebelum kirim. Jangan broadcast spam — nomor bisa ke-ban.

Jika user belum punya provider, tanya: "Mau pakai Fonnte / Wablas / Baileys self-host?" Jangan asal pilih.

## Jalur B - Self-host (Baileys / whatsapp-web.js)

Untuk bot yang bisa baca dan balas pesan tanpa biaya per pesan.

- **Baileys** (`@whiskeysockets/baileys`, disarankan): tidak perlu browser, pakai pairing code / QR, session tersimpan di folder `auth/`.
- **whatsapp-web.js** (`whatsapp-web`): butuh Chrome/Chromium, lebih berat di Windows.

Alur Baileys minimal:
1. `npm init -y; npm i @whiskeysockets/baileys pino`
2. Buat `wa-bot.js` yang menyimpan auth state ke `./auth`, tampilkan QR / pairing code sekali, lalu `sock.sendMessage(jid, { text: "..." })`.
3. JID = `<nomor>@s.whatsapp.net` untuk personal, `<id>@g.us` untuk grup.
4. Jangan commit folder `auth/`. Tambahkan ke `.gitignore`.
5. Minta user scan QR dari HP: WhatsApp → Perangkat Tertaut → Tautkan.

Contoh kirim (Baileys, setelah konek):
```js
await sock.sendMessage("62812xxxxxxx@s.whatsapp.net", { text: "Halo dari bot!" });
```

## Aturan keamanan & anti-ban

- Jangan hardcode token / session di kode. Pakai env atau file yang di-gitignore.
- Jangan spam / broadcast massal dari nomor pribadi — gunakan nomor khusus bot.
- Simpan session (`auth/`) dengan aman, itu setara password.
- Tambahkan jeda 2-5 detik antar pesan untuk broadcast.
- Selalu minta ke user: nomor tujuan (`628...`), isi pesan, dan provider/token yang dipakai jika belum ada di env.
- Di Windows, pastikan Node.js LTS terinstall sebelum `npm i`. Minta izin sebelum install package.
