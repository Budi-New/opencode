# Watchdog CYBER PC: pastikan agen monitor :8002 + tunnel pcmu hidup. Jalan tiap 5 mnt via Task Scheduler (SYSTEM).
$ErrorActionPreference = 'SilentlyContinue'
$listen = Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
if (-not $listen) {
  $env:CYBERPOS_PORT = '8002'
  $env:CYBERPOS_HOST = '0.0.0.0'
  Start-Process node -ArgumentList 'E:\Opencode\server.js' -WorkingDirectory 'E:\Opencode' -WindowStyle Hidden
}
$cf = Get-Process cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
  Start-Process cloudflared -ArgumentList 'tunnel --config C:\Users\CYBER\.cloudflared\pc-config.yml run d29a854c-f922-46f0-bf46-3b72182e2e61' -WorkingDirectory 'E:\Opencode' -WindowStyle Hidden
}
