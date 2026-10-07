# Watchdog CYBER PC: pastikan agen monitor :8002 + tunnel pcmu hidup. Jalan tiap 5 mnt via Task Scheduler (SYSTEM).
$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot
if (!$root) { $root = 'D:\Opencode' }
$log = Join-Path $root 'watchdog.log'
function wlog($m){ Add-Content $log ("$(Get-Date -Format s) $m") }
$listen = Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
if (-not $listen) {
  $env:CYBERPOS_PORT = '8002'
  $env:CYBERPOS_HOST = '0.0.0.0'
  Start-Process node -ArgumentList "$root\server.js" -WorkingDirectory $root -WindowStyle Hidden
  wlog('restart node :8002')
}
$cf = Get-Process cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
  $cfg = $env:CF_PC_CONFIG
  if (!$cfg) { $cfg = 'C:\Users\CYBER\.cloudflared\pc-config.yml' }
  $tid = $env:CF_PC_TUNNEL_ID
  if (!$tid) { $tid = 'd29a854c-f922-46f0-bf46-3b72182e2e61' }
  Start-Process cloudflared -ArgumentList "tunnel --config $cfg run $tid" -WorkingDirectory $root -WindowStyle Hidden
  wlog('restart cloudflared pcmu')
}
