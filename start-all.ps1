# CyberPOS + opencode via cyberpos.my.id
# 1. backend :8000, 2. opencode :4096, 3. cloudflared tunnel
Start-Process node "E:\Opencode\server.js"
Start-Sleep 2
Start-Process opencode -ArgumentList "serve --port 4097 --hostname 127.0.0.1" -WorkingDirectory "E:\Opencode"
Start-Sleep 3
cloudflared tunnel run d8d8d4d4-eec8-41bb-8033-bcf519b29683
