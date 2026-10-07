#!/bin/sh
# Synology DSM 작업 스케줄러용 실행 스크립트 (Docker / Container Manager 필요)
# 사용법: sh /volume1/docker/lotto-purchase-action/local/synology-run.sh
#   강제 실행(오늘 실행 기록 무시): sh .../synology-run.sh --force

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="mcr.microsoft.com/playwright:v1.55.1-jammy"
LOG_DIR="$REPO_DIR/local/logs"
TODAY="$(TZ=Asia/Seoul date +%Y-%m-%d)"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$TODAY.log"

# DSM 작업 스케줄러는 PATH 가 짧아서 docker 경로를 직접 찾음
DOCKER="$(command -v docker || echo /usr/local/bin/docker)"

{
  echo "===== $(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S') 시작 ====="
  "$DOCKER" run --rm --ipc=host \
    -e TZ=Asia/Seoul \
    -v "$REPO_DIR":/app -w /app \
    "$IMAGE" \
    sh -c '[ -d node_modules/playwright ] || npm ci --omit=dev; node local/run-local.mjs "$@"' sh "$@"
  RC=$?
  echo "===== 종료 코드: $RC ====="
} >> "$LOG" 2>&1

exit ${RC:-0}
