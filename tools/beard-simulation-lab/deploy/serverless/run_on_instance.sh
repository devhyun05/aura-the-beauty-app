#!/bin/bash
# EC2에서 SSM Run Command로 실행됨(root 실행). 상주 추론 서버에 요청을 전달한다.
# 필요 env: BUCKET, INPUT_KEY, OUTPUT_KEY
set -euo pipefail
PORT="${BEARD_SERVE_PORT:-8077}"
BASE="http://127.0.0.1:${PORT}"
SCRIPT=/home/ubuntu/run_kontext.py
NEXT_SCRIPT=/home/ubuntu/run_kontext.next.py
SERVER=/home/ubuntu/serve_kontext.py
NEXT_SERVER=/home/ubuntu/serve_kontext.next.py
VERSION_FILE=/home/ubuntu/.run_kontext.sha256

# S3 배포본의 해시가 바뀌었으면 상주 프로세스를 재시작한다. 파일만 갱신하고
# 메모리의 이전 프롬프트/후처리를 계속 쓰는 배포 불일치를 막는다.
aws s3 cp "s3://${BUCKET}/scripts/run_kontext.py" "$NEXT_SCRIPT"
aws s3 cp "s3://${BUCKET}/scripts/serve_kontext.py" "$NEXT_SERVER"
NEXT_HASH="$(
  sha256sum "$NEXT_SCRIPT" "$NEXT_SERVER" |
    cut -d ' ' -f 1 |
    sha256sum |
    cut -d ' ' -f 1
)"
CURRENT_HASH="$(test -f "$VERSION_FILE" && sed -n '1p' "$VERSION_FILE" || true)"
if [ "$NEXT_HASH" != "$CURRENT_HASH" ]; then
  mv "$NEXT_SCRIPT" "$SCRIPT"
  mv "$NEXT_SERVER" "$SERVER"
  printf '%s\n' "$NEXT_HASH" > "$VERSION_FILE"
  systemctl restart beard-kontext.service
else
  rm -f "$NEXT_SCRIPT"
  rm -f "$NEXT_SERVER"
fi

# 부팅 또는 코드 갱신 직후 모델 로드/워밍 완료까지 최대 10분 대기.
ready=0
for _ in $(seq 1 150); do
  if curl -sf "${BASE}/ready" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 4
done
if [ "$ready" -ne 1 ]; then
  echo "SERVER_NOT_READY" >&2
  systemctl status beard-kontext.service --no-pager >&2 || true
  exit 1
fi

response="$(curl -sS -m 300 -X POST "${BASE}/infer" \
  -H 'content-type: application/json' \
  -d "{\"bucket\":\"${BUCKET}\",\"input_key\":\"${INPUT_KEY}\",\"output_key\":\"${OUTPUT_KEY}\"}")"
echo "$response"
echo "$response" | grep -q '"status": *"ok"' || {
  echo "INFER_FAILED" >&2
  exit 1
}

echo "DONE ${OUTPUT_KEY}"
