#!/bin/bash
# 九霄问道 · 隧道被动看守（心跳版）
# 关键：每轮向 stdout 输出心跳，防止框架因 idle 回收本任务。
# cloudflared 的 stdout 重定向到 /dev/null，避免污染心跳输出。
CF="/c/Users/35695/.workbuddy/tools/cloudflared.exe"
ROOT="D:/xx-scratch/jiuxiao-analysis/九霄问道"
MAIN_LOG="$ROOT/cloudflared_main.log"
SECT_LOG="$ROOT/cloudflared_sect.log"
URL_FILE="$ROOT/TUNNEL_URL.txt"
PORT_MAIN=7730
PORT_SECT=8787

start_main() {
  : > "$MAIN_LOG"
  HTTPS_PROXY= HTTP_PROXY= https_proxy= http_proxy= "$CF" tunnel --url "http://localhost:$PORT_MAIN" --logfile "$MAIN_LOG" --loglevel info >/dev/null 2>&1 &
  sleep 9
  M=$(grep -io "https://[a-z0-9-]*\.trycloudflare\.com" "$MAIN_LOG" 2>/dev/null | tail -1)
  echo "$(date '+%Y-%m-%d %H:%M:%S') main=$M" >> "$URL_FILE"
}
start_sect() {
  : > "$SECT_LOG"
  HTTPS_PROXY= HTTP_PROXY= https_proxy= http_proxy= "$CF" tunnel --url "http://localhost:$PORT_SECT" --logfile "$SECT_LOG" --loglevel info >/dev/null 2>&1 &
  sleep 9
  S=$(grep -io "https://[a-z0-9-]*\.trycloudflare\.com" "$SECT_LOG" 2>/dev/null | tail -1)
  echo "$(date '+%Y-%m-%d %H:%M:%S') sect=$S" >> "$URL_FILE"
}

echo "$(date '+%Y-%m-%d %H:%M:%S') watchdog started" >> "$URL_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') watchdog heartbeat loop started"

while true; do
  N=$(tasklist.exe 2>/dev/null | grep -c cloudflared)
  if [ "$N" -lt 2 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') RESTART cloudflared (alive=$N)"
    taskkill.exe /F /IM cloudflared.exe 2>/dev/null
    sleep 2
    start_main
    start_sect
  fi
  echo "$(date '+%Y-%m-%d %H:%M:%S') heartbeat cloudflared=$N"
  sleep 30
done
