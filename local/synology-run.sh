#!/bin/sh
# Synology DSM 작업 스케줄러용 실행 스크립트 (Docker / Container Manager 필요)
# 사용법: sh /volume1/docker/lotto-purchase-action/local/synology-run.sh
#   강제 실행(오늘 실행 기록 무시): sh .../synology-run.sh --force
#
# 실패 시 자동 재시도:
#   - 최대 LOTTO_MAX_ATTEMPTS 회(기본 3) 시도, 시도 사이 LOTTO_RETRY_WAIT 초(기본 300 = 5분) 대기
#   - 로그에 구매 버튼 클릭 기록이 있으면 실제 결제가 됐을 수 있으므로 재시도하지 않음 (중복 구매 방지)
#   - 설정 오류(종료 코드 2)는 재시도해도 같으므로 재시도하지 않음

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="mcr.microsoft.com/playwright:v1.55.1-jammy"
LOG_DIR="$REPO_DIR/local/logs"
TODAY="$(TZ=Asia/Seoul date +%Y-%m-%d)"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$TODAY.log"

MAX_ATTEMPTS="${LOTTO_MAX_ATTEMPTS:-3}"
RETRY_WAIT="${LOTTO_RETRY_WAIT:-300}"

# DSM 작업 스케줄러는 PATH 가 짧아서 docker 경로를 직접 찾음
DOCKER="$(command -v docker || echo /usr/local/bin/docker)"

run_once() {
  "$DOCKER" run --rm --ipc=host \
    -e TZ=Asia/Seoul \
    -v "$REPO_DIR":/app -w /app \
    "$IMAGE" \
    sh -c '[ -d node_modules/playwright ] || npm ci --omit=dev; node local/run-local.mjs "$@"' sh "$@"
}

ATTEMPT=1
RC=0
TMP="$LOG_DIR/.attempt.$$"

{
  echo "===== $(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S') 시작 ====="
  while :; do
    echo "----- 시도 $ATTEMPT/$MAX_ATTEMPTS ($(TZ=Asia/Seoul date '+%H:%M:%S')) -----"
    if [ "$ATTEMPT" -eq 1 ]; then
      run_once "$@" > "$TMP" 2>&1
    else
      # 첫 시도가 오늘 실행 기록(last-run.txt)을 남겼으므로 재시도는 --force 로 실행
      run_once "$@" --force > "$TMP" 2>&1
    fi
    RC=$?
    cat "$TMP"

    if [ "$RC" -eq 0 ]; then
      break
    fi
    if grep -q "Clicking .*purchase button" "$TMP"; then
      echo "[Retry] 구매 버튼 클릭 이후 실패 → 결제가 됐을 수 있어 재시도하지 않습니다. 동행복권 구매내역을 확인해 주세요."
      break
    fi
    if [ "$RC" -eq 2 ]; then
      echo "[Retry] 설정 오류(종료 코드 2) → 재시도하지 않습니다."
      break
    fi
    if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
      echo "[Retry] 최대 시도 횟수($MAX_ATTEMPTS)에 도달했습니다."
      break
    fi
    echo "[Retry] 종료 코드 $RC → ${RETRY_WAIT}초 후 다시 시도합니다."
    sleep "$RETRY_WAIT"
    ATTEMPT=$((ATTEMPT + 1))
  done
  rm -f "$TMP"
  echo "===== 종료 코드: $RC ====="
} >> "$LOG" 2>&1

exit "$RC"
