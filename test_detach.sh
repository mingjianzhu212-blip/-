#!/bin/bash
# 隔离测试：用 cmd /c start 真正脱离进程组拉起 cloudflared，45s 后回报存活
CF="C:/Users/35695/.workbuddy/tools/cloudflared.exe"
LOG="C:/Users/35695/AppData/Local/Temp/cf_main.log"
RES="C:/Users/35695/AppData/Local/Temp/cf_test_result.txt"
: > "$LOG"
: > "$RES"
HTTPS_PROXY= HTTP_PROXY= https_proxy= http_proxy= cmd /c start "" "$CF" tunnel --url http://localhost:7730 --logfile "$LOG" --loglevel info
echo "launched via cmd /c start, waiting 45s..."
sleep 45
N=$(tasklist.exe 2>/dev/null | grep -c cloudflared)
U=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" "$LOG" | tail -1)
echo "PROCS=$N"
echo "URL=$U"
echo "PROCS=$N" > "$RES"
echo "URL=$U" >> "$RES"
