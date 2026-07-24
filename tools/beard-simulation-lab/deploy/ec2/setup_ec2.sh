#!/bin/bash
# EC2 접속 후 실행: 추론 환경 + FLUX.1 Kontext dev 모델 다운로드 (~50GB)
# 사용: ssh 접속 후  bash setup_ec2.sh
set -euo pipefail

# DLAMI의 PyTorch 가상환경 활성화 (경로는 AMI 버전마다 다를 수 있음)
source /opt/pytorch/bin/activate 2>/dev/null || \
  source activate pytorch 2>/dev/null || \
  echo "※ PyTorch env 자동활성화 실패 — 'python -c \"import torch;print(torch.cuda.is_available())\"'로 확인"

# 2026-07-24 실기기 샘플·L40S 런타임 검증본. 무버전 -U는 파이프라인의
# 자동 리사이즈·토크나이저 동작을 예고 없이 바꿀 수 있으므로 재현성을 고정한다.
pip install \
  "diffusers==0.39.0" \
  "transformers==5.14.1" \
  "accelerate==1.14.0" \
  "safetensors==0.8.0" \
  "sentencepiece==0.2.2" \
  "protobuf==7.35.1" \
  "huggingface_hub[cli]==1.24.0" \
  "pillow==12.3.0"

echo ""
echo ">>> HF 로그인 — hf_ 토큰 붙여넣기 (게이트 다운로드용)"
huggingface-cli login

echo ""
echo ">>> 모델 다운로드 (~50GB, 저장소 1개에 transformer+T5+CLIP+VAE 전부 포함)"
huggingface-cli download black-forest-labs/FLUX.1-Kontext-dev \
  --revision 24e9dedc4ef646698dc8eb4e18ae2cec3c9fea0d \
  --local-dir ~/models/flux-kontext-dev

echo ""
echo "=== GPU 확인 ==="
python -c "import torch; print('CUDA:', torch.cuda.is_available(), '|', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'no gpu')"
echo "준비 끝. 추론:  python run_kontext.py 입력.jpg 출력.png"
