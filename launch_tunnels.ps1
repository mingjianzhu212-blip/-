# 九霄问道 · 隧道独立拉起脚本（纯 ASCII；用标记文件定位游戏目录，避免中文路径）
$ErrorActionPreference = 'Continue'

$CF   = 'C:\Users\35695\.workbuddy\tools\cloudflared.exe'
$base = 'D:\xx-scratch\jiuxiao-analysis'

# 游戏目录 = 唯一含 server\server.mjs 的子目录（无需在脚本里写中文）
$ROOT = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName 'server\server.mjs') } |
        Select-Object -First 1 -ExpandProperty FullName

if (-not $ROOT) {
  Write-Host "ERROR: cannot locate game dir under $base"
  exit 1
}

# 清空代理，避免 cloudflared 走本地代理导致 quic 超时
$env:HTTPS_PROXY = ''
$env:HTTP_PROXY  = ''
$env:https_proxy = ''
$env:http_proxy  = ''

$MAIN_LOG = Join-Path $ROOT 'cloudflared_main.log'
$SECT_LOG = Join-Path $ROOT 'cloudflared_sect.log'
$URL_FILE = Join-Path $ROOT 'TUNNEL_URL.txt'

# 清掉可能残留的 cloudflared
Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 启动主隧道（游戏入口 7730）
Start-Process -FilePath $CF -ArgumentList 'tunnel','--url','http://localhost:7730','--logfile',$MAIN_LOG,'--loglevel','info' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $ROOT '_cf_main_out.txt') -RedirectStandardError (Join-Path $ROOT '_cf_main_err.txt')
# 启动宗门隧道（8787）
Start-Process -FilePath $CF -ArgumentList 'tunnel','--url','http://localhost:8787','--logfile',$SECT_LOG,'--loglevel','info' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $ROOT '_cf_sect_out.txt') -RedirectStandardError (Join-Path $ROOT '_cf_sect_err.txt')

function Get-URL($log){
  for ($i = 0; $i -lt 10; $i++) {
    $u = Get-Content $log -ErrorAction SilentlyContinue |
         Select-String -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' |
         ForEach-Object { $_.Matches.Value } | Select-Object -Last 1
    if ($u) { return $u }
    Start-Sleep -Seconds 3
  }
  return $null
}

$M = Get-URL $MAIN_LOG
$S = Get-URL $SECT_LOG

$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Add-Content -Path $URL_FILE -Value "$ts launch detached main=$M"
Add-Content -Path $URL_FILE -Value "$ts launch detached sect=$S"

$procs = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
Write-Host "ROOT=$ROOT"
Write-Host "MAIN=$M"
Write-Host "SECT=$S"
Write-Host "PROCS=$($procs.Count)"
