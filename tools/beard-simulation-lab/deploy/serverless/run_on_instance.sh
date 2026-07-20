#!/bin/bash
# EC2 인스턴스에서 SSM Run Command로 실행됨(root 실행). 절대경로만 사용.
# S3 입력 다운로드 → FLUX.1 Kontext 추론 → S3 결과 업로드.
# 필요 env: BUCKET, INPUT_KEY, OUTPUT_KEY
set -euo pipefail

# DLAMI PyTorch env 활성화 (모델·의존성은 setup_ec2.sh에서 이미 설치됨)
source /opt/pytorch/bin/activate 2>/dev/null || source activate pytorch 2>/dev/null || true

cd /home/ubuntu

# 추론 스크립트가 없으면 S3 scripts/에서 가져옴(프롬프트 갱신 = S3 재업로드로 반영)
if [ ! -f /home/ubuntu/run_kontext.py ]; then
  aws s3 cp "s3://${BUCKET}/scripts/run_kontext.py" /home/ubuntu/run_kontext.py
fi

aws s3 cp "s3://${BUCKET}/${INPUT_KEY}" /home/ubuntu/_in.jpg
python /home/ubuntu/run_kontext.py /home/ubuntu/_in.jpg /home/ubuntu/_out.png
aws s3 cp /home/ubuntu/_out.png "s3://${BUCKET}/${OUTPUT_KEY}"

echo "DONE ${OUTPUT_KEY}"
