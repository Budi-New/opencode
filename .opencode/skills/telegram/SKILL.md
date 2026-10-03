---
name: telegram
description: Use when sending Telegram messages, building Telegram bots, or working with Telegram Bot API, sendMessage, getUpdates, webhook, TELEGRAM_BOT_TOKEN, BotFather.
---

# Telegram Skill

Gunakan skill ini setiap kali user menyebut telegram, bot telegram, kirim pesan telegram, Bot API, `sendMessage`, `getUpdates`, webhook telegram.

## Prasyarat

1. Buat bot via [@BotFather](https://t.me/BotFather) di Telegram → `/newbot` → dapatkan token seperti `123456:ABC-DEF...`
2. Jangan hardcode token di kode. Gunakan environment variable:
   - `TELEGRAM_BOT_TOKEN` - token bot (wajib)
   - `TELEGRAM_CHAT_ID` - target chat default (opsional tapi disarankan)
   - `TELEGRAM_API_BASE` - default `https://api.telegram.org`
3. Cara dapat `chat_id`:
   - Kirim pesan dulu ke bot, lalu buka di browser/PowerShell:
     `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Ambil `message.chat.id` (user) atau `-100xxx` (group/channel).

## Kirim pesan cepat (tanpa library)

Base URL: `https://api.telegram.org/bot$env:TELEGRAM_BOT_TOKEN`

PowerShell (Windows):
```powershell
$Token = $env:TELEGRAM_BOT_TOKEN
$ChatId = $env:TELEGRAM_CHAT_ID
$Text = "Halo dari opencode!"

Invoke-RestMethod -Uri "https://api.telegram.org/bot$Token/sendMessage" `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{ chat_id = $ChatId; text = $Text; parse_mode = "HTML" } | ConvertTo-Json)
```

curl / bash:
```bash
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d chat_id="${TELEGRAM_CHAT_ID}" \
  -d text="Halo dari opencode!" \
  -d parse_mode="HTML"
```

Python (tanpa dependency):
```python
import os, urllib.request, urllib.parse, json
token = os.environ["TELEGRAM_BOT_TOKEN"]
chat_id = os.environ.get("TELEGRAM_CHAT_ID")
data = urllib.parse.urlencode({"chat_id": chat_id, "text": "Halo!", "parse_mode": "HTML"}).encode()
req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=data)
print(json.loads(urllib.request.urlopen(req).read()))
```

Format `parse_mode`: `HTML` (`<b>`, `<i>`, `<code>`) atau `MarkdownV2`. Untuk foto/dokumen pakai `sendPhoto` / `sendDocument` dengan field `photo` / `document` + `caption`.

## Pola bot

Pilih satu, jangan campur:

1. **Polling (`getUpdates`)** - untuk skrip lokal / dev:
   - Loop `GET /getUpdates?offset=<offset>&timeout=30`
   - Simpan `offset = last_update_id + 1`
   - Cocok untuk bot sederhana, cron, auto-reply.
2. **Webhook (`setWebhook`)** - untuk production:
   - `POST /setWebhook` dengan `url=https://domain-anda.com/telegram/<secret>`
   - Verifikasi pakai `secret_token`, selalu balas `200 OK` cepat (<5 detik).
   - Jangan expose token di URL path.

## Bikin bot baru

- Python: `python-telegram-bot` (polling) atau `aiogram` (async). Minta izin user sebelum `pip install`.
- Node.js: `grammy` (modern, disarankan) atau `telegraf` / `node-telegram-bot-api`.
- Struktur minimal: `bot.js` / `main.py` + `.env` berisi `TELEGRAM_BOT_TOKEN=...`, jangan commit `.env`.

Contoh Node (grammy):
```js
import { Bot } from "grammy";
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
bot.command("start", (ctx) => ctx.reply("Halo!"));
bot.start();
```

## Aturan keamanan

- Token = password. Jika bocor, revoke via BotFather → `/revoke`.
- Selalu baca token dari env, tidak dari kode / log.
- Untuk group: bot harus jadi admin jika mau baca semua pesan, atau matikan privacy mode via BotFather.
- Rate limit Bot API ~30 msg/detik. Tambahkan jeda untuk broadcast.
- Jangan kirim spam. Minta `TELEGRAM_CHAT_ID` ke user jika belum ada.
