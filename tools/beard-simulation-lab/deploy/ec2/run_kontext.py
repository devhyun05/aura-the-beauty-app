#!/usr/bin/env python
"""FLUX.1 Kontext dev — 수염 제거 추론 (프로덕션 본체).

사용: python run_kontext.py 입력이미지 [출력이미지]

확정 세팅 (playground 실험으로 검증됨):
  - 작업 해상도 <= 1024 (>=1MP면 FLUX feature-duplication = 눈/이목구비 복제 발생 → 1024로 억제)
  - guidance 2.5 / steps 24
  - 프롬프트: 눈썹 보존 담백판 (FLUX가 눈썹을 스스로 유지, 붙이기 불필요)
  - 얼굴색 보존: 전체 피부 히스토그램 색보정 (원본을 P3->sRGB 색관리 후 기준으로)
  - 메쉬 경계/눈썹 붙이기 없음 (경계·겹침 아티팩트 원천 제거)
의존성: torch, diffusers, pillow, opencv-python(cv2), numpy  (mediapipe 불필요)
"""
import sys, io, torch, numpy as np, cv2
from PIL import Image, ImageCms
from diffusers import FluxKontextPipeline
from diffusers.utils import load_image

# 아이폰 HEIC 입력 대비 (있으면 등록, 없으면 무시)
try:
    import pillow_heif; pillow_heif.register_heif_opener()
except Exception:
    pass

MODEL = "/home/ubuntu/models/flux-kontext-dev"
PROMPT = (
    "Remove only the mustache and all chin and jaw stubble, leaving original skin. "
    "Keep the eyebrows unchanged. "
    "Same person, same eyes, same eyebrows, same lips, same moles, same lighting, same background."
)
GUIDANCE, STEPS, WORK_RES = 2.5, 24, 1024

_SRGB = ImageCms.createProfile("sRGB")

def _snap(v, m=16): return max(m, int(round(v / m)) * m)
def _prep(img, ls=WORK_RES):
    """긴 변을 ls 이하로 (>1MP feature-duplication 방지), 16 배수로 스냅."""
    img = img.convert("RGB"); w, h = img.size
    if max(w, h) <= ls:
        return img.resize((_snap(w), _snap(h)), Image.LANCZOS)
    nw, nh = (ls, ls * h / w) if w >= h else (ls * w / h, ls)
    return img.resize((_snap(nw), _snap(nh)), Image.LANCZOS)

def _managed(pil):
    """P3->sRGB (겉보기 색 유지). ICC 없으면 그대로."""
    icc = pil.info.get("icc_profile"); pil = pil.convert("RGB")
    if icc:
        try: pil = ImageCms.profileToProfile(pil, ImageCms.ImageCmsProfile(io.BytesIO(icc)), _SRGB, outputMode="RGB")
        except Exception: pass
    return pil

def _skin(a):
    a = a.astype(np.float32); R, G, B = a[..., 0], a[..., 1], a[..., 2]
    Y = .299*R + .587*G + .114*B
    Cb = 128 - .168736*R - .331264*G + .5*B
    Cr = 128 + .5*R - .418688*G - .081312*B
    return (Cb >= 77) & (Cb <= 135) & (Cr >= 133) & (Cr <= 180) & (Y > 40) & (Y < 235)

def _lut(sm, rm):
    sh = np.bincount(sm.astype(int), minlength=256).astype(np.float64)
    rh = np.bincount(rm.astype(int), minlength=256).astype(np.float64)
    return np.interp(np.cumsum(sh)/max(sh.sum(), 1), np.cumsum(rh)/max(rh.sum(), 1),
                     np.arange(256)).astype(np.float32)

def _color(out, ref):
    """전체 피부 히스토그램 색보정: 출력을 원본(색관리) 톤으로. 메쉬 경계 없음."""
    ref = _managed(ref).resize(out.size)
    o = np.asarray(out).astype(np.float32); r = np.asarray(ref).astype(np.float32)
    sr = _skin(r); stat = sr & _skin(o)
    if int(stat.sum()) < 800:
        return out
    oLAB = np.asarray(out.convert("LAB")).astype(np.float32)
    rLAB = np.asarray(ref.convert("LAB")).astype(np.float32)
    cLAB = oLAB.copy()
    for c in range(3):
        L = _lut(oLAB[..., c][stat], rLAB[..., c][stat])
        cLAB[..., c] = L[np.clip(oLAB[..., c], 0, 255).astype(int)]
    corr = np.asarray(Image.fromarray(cLAB.astype(np.uint8), "LAB").convert("RGB")).astype(np.float32)
    reg = cv2.dilate((sr.astype(np.uint8) * 255), np.ones((41, 41), np.uint8))  # 피부 전체 넉넉히
    fm = cv2.GaussianBlur(reg.astype(np.float32), (0, 0), 30) / 255              # 넓은 페더 -> 경계 X
    a = fm[..., None]
    return Image.fromarray(np.clip(corr * a + o * (1 - a), 0, 255).astype(np.uint8))

def main():
    if len(sys.argv) < 2:
        print("사용: python run_kontext.py 입력.jpg [출력.png]"); sys.exit(1)
    inp = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "out.png"

    print("모델 로드 중...", flush=True)
    pipe = FluxKontextPipeline.from_pretrained(MODEL, torch_dtype=torch.bfloat16).to("cuda")

    img = load_image(inp)                 # 원본 (ICC 있을 수 있음)
    orig_size = img.size
    src = _prep(img, WORK_RES)            # 작업 해상도 <=1024
    print(f"추론: {inp}  원본{orig_size[0]}x{orig_size[1]} -> 작업{src.size[0]}x{src.size[1]}", flush=True)
    res = pipe(image=src, prompt=PROMPT, guidance_scale=GUIDANCE,
               num_inference_steps=STEPS, width=src.width, height=src.height).images[0]

    res = _color(res, img)               # 얼굴색 보존
    if res.size != orig_size:            # 원본 크기로 복원
        res = res.resize(orig_size, Image.LANCZOS)
    res.save(out)
    print("저장:", out, flush=True)

if __name__ == "__main__":
    main()
