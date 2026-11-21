# 诊断：用 Start-Process 拉起单条 cloudflared，记录 PID/异常到文件
$ErrorActionPreference = 'Continue'

$CF   = 'C:\Users\35695\.workbuddy\tools\cloudflared.exe'
$base = 'D:\xx-scratch\jiuxiao-analysis'
$ROOT = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName 'server\server.mjs') } |
        Select-Object -First 1 -ExpandProperty FullName

$DIAG = Join-Path $ROOT 'diag_launch.txt'
$MAIN_LOG = Join-Path $ROOT 'cloudflared_main.log'
$OUT  = Join-Path $ROOT '_cf_main_out.txt'
$ERR  = Join-Path $ROOT '_cf_main_err.txt'

"ROOT=$ROOT" | Set-Content $DIAG
$env:HTTPS_PROXY=''; $env:HTTP_PROXY=''; $env:https_proxy=''; $env:http_proxy=''

if (Test-Path $MAIN_LOG) { Clear-Content $MAIN_LOG }
if (Test-Path $OUT) { Clear-Content $OUT }
if (Test-Path $ERR) { Clear-Content $ERR }

try {
  $p = Start-Process -FilePath $CF -ArgumentList 'tunnel','--url','http://localhost:7730','--logfile',$MAIN_LOG,'--loglevel','info' -WindowStyle Hidden -RedirectStandardOutput $OUT -RedirectStandardError $ERR -PassThru -ErrorAction Stop
  "STARTED PID=$($p.Id)" | Add-Content $DIAG
} catch {
  "START-ERROR: $($_.Exception.Message)" | Add-Content $DIAG
}

Start-Sleep -Seconds 4
$n = (Get-Process -Name cloudflared -ErrorAction SilentlyContinue).Count
"PROCS_AFTER=$n" | Add-Content $DIAG
"OUT_EXISTS=$(Test-Path $OUT)" | Add-Content $DIAG
"ERR_EXISTS=$(Test-Path $ERR)" | Add-Content $DIAG
"OUT_SIZE=$((Get-Item $OUT -ErrorAction SilentlyContinue).Length)" | Add-Content $DIAG
"ERR_SIZE=$((Get-Item $ERR -ErrorAction SilentlyContinue).Length)" | Add-Content $DIAG
