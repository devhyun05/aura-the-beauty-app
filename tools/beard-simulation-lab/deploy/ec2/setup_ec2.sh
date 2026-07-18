#!/bin/bash
# EC2 접속 후 실행: 추론 환경 + FLUX.1 Kontext dev 모델 다운로드 (~50GB)
# 사용: ssh 접속 후  bash setup_ec2.sh
set -euo pipefail

# DLAMI의 PyTorch 가상환경 활성화 (경로는 AMI 버전마다 다를 수 있음)
source /opt/pytorch/bin/activate 2>/dev/null || \
  source activate pytorch 2>/dev/null || \
  echo "※ PyTorch env 자동활성화 실패 — 'python -c \"import torch;print(torch.cuda.is_available())\"'로 확인"

pip install -U diffusers transformers accelerate safetensors sentencepiece protobuf "huggingface_hub[cli]" pillow

echo ""
echo ">>> HF 로그인 — hf_ 토큰 붙여넣기 (게이트 다운로드용)"
huggingface-cli login

echo ""
echo ">>> 모델 다운로드 (~50GB, 저장소 1개에 transformer+T5+CLIP+VAE 전부 포함)"
huggingface-cli download black-forest-labs/FLUX.1-Kontext-dev --local-dir ~/models/flux-kontext-dev

echo ""
echo "=== GPU 확인 ==="
python -c "import torch; print('CUDA:', torch.cuda.is_available(), '|', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'no gpu')"
echo "준비 끝. 추론:  python run_kontext.py 입력.jpg 출력.png"
