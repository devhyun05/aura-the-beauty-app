#!/usr/bin/env python
"""FLUX.1 Kontext dev — 수염 제거 추론 (제로샷).
사용: python run_kontext.py 입력이미지 [출력이미지]
확정 프롬프트(간결판) 사용 — FLUX 데모는 간결한 지시를 더 잘 따름.
"""
import sys, torch
from PIL import Image
from diffusers import FluxKontextPipeline
from diffusers.utils import load_image

MODEL = "/home/ubuntu/models/flux-kontext-dev"
PROMPT = (
    "Remove the mustache and chin stubble completely, leaving clean bare skin. "
    "Same person, same lips, same moles, same lighting, same background. "
    "Keep the exact same skin color and tone - do not lighten or pale the face. "
    "Keep the original framing and image dimensions - do not crop or resize. "
    "Natural skin texture with visible pores, not airbrushed."
)

def main():
    if len(sys.argv) < 2:
        print("사용: python run_kontext.py 입력.jpg [출력.png]"); sys.exit(1)
    inp = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "out.png"

    print("모델 로드 중...")
    pipe = FluxKontextPipeline.from_pretrained(MODEL, torch_dtype=torch.bfloat16).to("cuda")

    img = load_image(inp)
    orig_size = img.size                       # (W, H) — 원본 픽셀 크기
    print(f"추론 중: {inp}  (원본 {orig_size[0]}x{orig_size[1]}) ...")
    result = pipe(
        image=img,
        prompt=PROMPT,
        guidance_scale=2.5,        # Kontext 편집 권장 2.5~3.5
        num_inference_steps=28,
    ).images[0]

    # Kontext는 내부 해상도 버킷으로 맞추느라 출력 크기가 원본과 미세하게 달라짐.
    # 프롬프트로는 못 잡으므로 여기서 원본 크기로 되돌려 가로폭 변화를 확실히 제거.
    if result.size != orig_size:
        print(f"크기 보정: {result.size[0]}x{result.size[1]} -> {orig_size[0]}x{orig_size[1]}")
        result = result.resize(orig_size, Image.LANCZOS)

    result.save(out)
    print("저장:", out)

if __name__ == "__main__":
    main()
