#!/bin/bash
# EC2에서 SSM Run Command로 실행됨(root). 상주 추론 서버(beard-kontext.service)에
# 요청만 전달하는 경량 클라이언트. 서버가 모델을 상주시키므로 요청당 추론은 ~20초대.
# S3 다운로드/업로드는 서버가 수행한다. 필요 env: BUCKET, INPUT_KEY, OUTPUT_KEY
set -euo pipefail
PORT="${BEARD_SERVE_PORT:-8077}"
BASE="http://127.0.0.1:${PORT}"

# 부팅 직후엔 서버가 모델 로딩 중(~4~5분)일 수 있으니 /ready 를 대기(최대 ~6분).
# 모델 로드는 서버 프로세스가 하므로(이 SSM 명령의 자식이 아님) 여기선 가벼운 폴링만 → ipc 타임아웃 없음.
ready=0
for _ in $(seq 1 90); do
  if curl -sf "${BASE}/ready" >/dev/null 2>&1; then ready=1; break; fi
  sleep 4
done
if [ "$ready" -ne 1 ]; then
  echo "SERVER_NOT_READY" >&2
  exit 1
fi

# 동기 추론 요청. 서버가 S3 다운로드 → 추론 → S3 업로드까지 수행.
resp="$(curl -sS -m 300 -X POST "${BASE}/infer" \
  -H 'content-type: application/json' \
  -d "{\"bucket\":\"${BUCKET}\",\"input_key\":\"${INPUT_KEY}\",\"output_key\":\"${OUTPUT_KEY}\"}")"
echo "$resp"
echo "$resp" | grep -q '"status": *"ok"' || { echo "INFER_FAILED" >&2; exit 1; }
echo "DONE ${OUTPUT_KEY}"
