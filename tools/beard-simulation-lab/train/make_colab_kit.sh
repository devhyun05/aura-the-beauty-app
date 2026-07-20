#!/bin/zsh
# Colab 학습 킷 zip 생성: 트레이너 + 가중치 출처 매니페스트 + 학습 데이터 스냅샷.
# 가중치(200MB)는 zip에 넣지 않음 — 노트북이 고정 sha로 직접 내려받아 검증.
# 사용: ./make_colab_kit.sh <ft_data 경로> [출력 zip]
set -euo pipefail
LAB="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${1:?usage: make_colab_kit.sh <ft_data dir> [out.zip]}"
OUT="${2:-$LAB/outputs/beard_lab_colab_kit.zip}"
STAGE="$(mktemp -d)"
mkdir -p "$STAGE/lab/train" "$STAGE/lab/spike" "$STAGE/lab/external/models/big-lama"
cp "$LAB/train/finetune_lama.py" "$STAGE/lab/train/"
cp "$LAB/spike/lama_manifest.json" "$STAGE/lab/spike/"
cp -r "$DATA" "$STAGE/lab/ft_data"
# K-FACE 포함 시 알림만 (활용계획서에 Drive/Colab 사용 명시하여 제출 — 승인 조건 준수 전제)
if ls "$STAGE/lab/ft_data" | grep -qi "aihub\|kface\|k-face"; then
  echo "NOTE: K-FACE 데이터 포함 — 승인된 활용계획서(클라우드 사용 명시)의 조건 하에서만 업로드"
fi
(cd "$STAGE/lab" && zip -qr "$OUT" .)
rm -rf "$STAGE"
echo "kit -> $OUT ($(du -h "$OUT" | cut -f1)) — 드라이브 beard_lab/ 폴더에 업로드"
