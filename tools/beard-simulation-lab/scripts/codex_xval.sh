#!/usr/bin/env bash
# codex_xval.sh -- 실패 방지 Codex 교차검증 러너.
#
# 모델·effort는 계약(사용자 지시 2026-07-11): 무조건 gpt-5.6-sol + xhigh. 인자로 변경 불가.
# 재발 방지 대상 실패 3종:
#   1) 스트림 스톨: 요청은 갔지만 서버 스트림이 죽고 CLI가 무한 대기 (50분 무통신 사례).
#      -> 세션 rollout 파일 크기를 60초 주기로 감시, STALL_MIN분 무성장 + 프로세스 생존이면
#         kill 후 자동 재시도.
#   2) 셸 인용 충돌: 인라인 heredoc이 상위 래퍼의 따옴표와 충돌해 실행 자체가 안 됨.
#      -> 프롬프트는 파일로만 받는다. stdin은 /dev/null로 명시 폐쇄.
#   3) CLI 구버전: 모델 미인식 ("requires newer version").
#      -> 감지 시 codex update 1회 후 재시도.
#
# 사용:  codex_xval.sh PROMPT_FILE OUT_FILE [MAX_RETRIES]
# 종료:  0 = 회신 수신, 그 외 = 실패(호출자가 판단).

set -u

MODEL="gpt-5.6-sol"
EFFORT="xhigh"
STALL_MIN="${CODEX_STALL_MIN:-15}"
SESSIONS_GLOB="$HOME/.codex/sessions"

if [ $# -lt 2 ]; then
    echo "usage: codex_xval.sh PROMPT_FILE OUT_FILE [MAX_RETRIES]" >&2
    exit 2
fi
PROMPT_FILE="$1"
OUT_FILE="$2"
MAX_RETRIES="${3:-2}"

if [ ! -s "$PROMPT_FILE" ]; then
    echo "[codex_xval] prompt file missing or empty: $PROMPT_FILE" >&2
    exit 2
fi

newest_rollout() {
    find "$SESSIONS_GLOB" -name 'rollout-*.jsonl' -newer "$1" 2>/dev/null \
        | head -1
}

updated_once=0
attempt=0
while [ "$attempt" -le "$MAX_RETRIES" ]; do
    attempt=$((attempt + 1))
    : > "$OUT_FILE"
    mark=$(mktemp)

    codex exec --sandbox read-only -m "$MODEL" \
        -c "model_reasoning_effort=$EFFORT" \
        "$(cat "$PROMPT_FILE")" < /dev/null > "$OUT_FILE" 2>&1 &
    pid=$!

    sleep 10
    rf=$(newest_rollout "$mark")
    rm -f "$mark"
    prev=-1
    still=0
    stalled=0
    while kill -0 "$pid" 2>/dev/null; do
        sleep 60
        kill -0 "$pid" 2>/dev/null || break
        cur=0
        [ -n "$rf" ] && [ -f "$rf" ] && cur=$(wc -c < "$rf")
        if [ "$cur" -gt "$prev" ]; then
            still=0
        else
            still=$((still + 1))
        fi
        prev=$cur
        if [ "$still" -ge "$STALL_MIN" ]; then
            echo "[codex_xval] stall: no session growth for ${STALL_MIN}m -- kill & retry" >&2
            stalled=1
            kill "$pid" 2>/dev/null
            sleep 2
            kill -9 "$pid" 2>/dev/null
            break
        fi
    done
    wait "$pid" 2>/dev/null
    rc=$?

    if grep -q "requires a newer version\|newer version of Codex" "$OUT_FILE" \
            && [ "$updated_once" -eq 0 ]; then
        echo "[codex_xval] CLI too old for $MODEL -- running codex update" >&2
        codex update >&2 || true
        updated_once=1
        continue
    fi

    # 성공 = 정상 종료 + 프롬프트 에코 이상의 본문(회신) 존재.
    if [ "$stalled" -eq 0 ] && [ "$rc" -eq 0 ] \
            && [ "$(wc -c < "$OUT_FILE")" -gt $(($(wc -c < "$PROMPT_FILE") + 500)) ]; then
        echo "[codex_xval] OK (attempt $attempt)" >&2
        exit 0
    fi
    echo "[codex_xval] attempt $attempt failed (rc=$rc, stalled=$stalled) -- retrying" >&2
done

echo "[codex_xval] all $attempt attempts failed" >&2
exit 1
