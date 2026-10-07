# CyberPOS + opencode via cyberpos.my.id
# 1. backend :8000, 2. opencode :4097, 3. cloudflared tunnel
$root = $PSScriptRoot
if (!$root) { $root = "D:\Opencode" }
Start-Process node "$root\server.js" -WorkingDirectory $root
Start-Sleep 2
Start-Process opencode -ArgumentList "serve --port 4097 --hostname 127.0.0.1" -WorkingDirectory $root
Start-Sleep 3
$tunnel = $env:CF_TUNNEL_ID
if (!$tunnel) { $tunnel = "d8d8d4d4-eec8-41bb-8033-bcf519b29683" }
cloudflared tunnel run $tunnel
