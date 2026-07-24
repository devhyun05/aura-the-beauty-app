#!/usr/bin/env python
"""FLUX.1 Kontext dev — 수염 제거 추론 (프로덕션 본체).

사용: python run_kontext.py 입력이미지 [출력이미지]

확정 세팅 (playground 실험으로 검증됨):
  - 공식 HF Space와 같은 원본 RGB 직접 입력 및 파이프라인 자동 해상도 처리
  - guidance 2.5 / steps 28 / CPU generator seed 0
  - 프롬프트: 2026-07-25 v2 확정 정본 (수염 자국 제거와 얼굴 정체성 보존)
  - 모델 입력: 검증본과 동일한 단순 RGB 변환
  - 얼굴색 보존: 얼굴 피부 연결 영역에서 색차를 추정해 제한된 단일 LAB 이동을
    같은 피부 영역에만 적용 (배경·눈·눈썹·입술·머리 픽셀은 원출력 그대로 보존)
  - 원본 ICC 색관리는 보정 기준에만 사용하며 채널별 히스토그램 LUT는 사용하지 않음
의존성: torch, diffusers, pillow, opencv-python(cv2), numpy  (mediapipe 불필요)
"""
import io
import hashlib
import sys

import cv2
import numpy as np
import torch
from PIL import Image, ImageCms
from diffusers import FluxKontextPipeline
from diffusers.utils import load_image

# 아이폰 HEIC 입력 대비 (있으면 등록, 없으면 무시)
try:
    import pillow_heif; pillow_heif.register_heif_opener()
except Exception:
    pass

MODEL = "/home/ubuntu/models/flux-kontext-dev"
# 사용자 검수 확정 정본. 문구 변경 시 PROMPT_VERSION과 회귀 테스트를 함께 갱신한다.
PROMPT_VERSION = "beard-removal-identity-preserving-2026-07-25-v2"
PROMPT = (
    "Retouch only the lower face to a freshly shaved appearance. "
    "Replace dark gray or black speckles and shadows on the upper lip, chin, cheeks, and jaw "
    "with natural skin texture and tone matching the surrounding face. "
    "Leave no dark hair-shaped marks in those areas. "
    "Keep the eyebrows unchanged. "
    "Same person, same eyes, same eyebrows, same lips, same moles, same lighting, same background."
)
PROMPT_SHA256 = hashlib.sha256(PROMPT.encode("utf-8")).hexdigest()
GUIDANCE = 2.5
STEPS = 28
DEFAULT_SEED = 0
WORK_RES = 1024

_SRGB = ImageCms.createProfile("sRGB")
_COLOR_MIN_SAMPLES = 800
_COLOR_STRENGTH = 1.0
_COLOR_MAX_SHIFT_LAB = np.array([12.0, 8.0, 8.0], dtype=np.float32)
_COLOR_REJECT_SHIFT_LAB = np.array([40.0, 24.0, 24.0], dtype=np.float32)

def _snap(v, m=16): return max(m, int(round(v / m)) * m)
def _prep(img, ls=WORK_RES):
    """검증본과 동일하게 RGB 변환 후 긴 변을 ls 이하로 줄이고 16 배수로 스냅."""
    img = img.convert("RGB")
    w, h = img.size
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
    """YCbCr 기반 피부 후보. 색차 추정 표본 선택에만 쓰며 합성 마스크로 쓰지 않는다."""
    a = a.astype(np.float32)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    Y = .299*R + .587*G + .114*B
    Cb = 128 - .168736*R - .331264*G + .5*B
    Cr = 128 + .5*R - .418688*G - .081312*B
    return (Cb >= 77) & (Cb <= 135) & (Cr >= 133) & (Cr <= 180) & (Y > 40) & (Y < 235)


def _face_skin_region(rgb):
    """중앙 셀피에서 얼굴에 연결된 피부 성분과 bbox를 찾는다.

    단순 피부색 전체를 쓰면 베이지색 벽까지 선택될 수 있다. 중앙 얼굴 초점 영역과
    가장 많이 겹치는 연결 성분 하나만 고르며, 충분한 성분이 없으면 실패시킨다.
    """
    height, width = rgb.shape[:2]
    eligible = _skin(rgb)
    search = np.zeros((height, width), dtype=np.uint8)
    search[
        int(height * 0.05):max(int(height * 0.86), 1),
        int(width * 0.12):max(int(width * 0.88), 1),
    ] = 1
    component_input = (eligible & search.astype(bool)).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        component_input,
        connectivity=8,
    )
    if count <= 1:
        return None

    focus = labels[
        int(height * 0.22):max(int(height * 0.65), 1),
        int(width * 0.30):max(int(width * 0.70), 1),
    ]
    overlaps = np.bincount(focus.ravel(), minlength=count)
    overlaps[0] = 0
    label = int(np.argmax(overlaps))
    x, y, component_width, component_height, area = stats[label]
    if label == 0 or int(area) < _COLOR_MIN_SAMPLES:
        return None
    return labels == label, (int(x), int(y), int(component_width), int(component_height))


def _color(out, ref):
    """원본 피부톤으로 안전하게 복귀시키는 bounded face-skin LAB correction.

    얼굴 피부에서 추정한 한 개의 제한된 LAB 이동만 사용한다. 같은 얼굴 피부
    연결 성분 안쪽에만 부드럽게 적용하고 원본 RGB와 합성하므로 배경과 눈·눈썹·
    입술·머리는 바이트 단위로 유지된다. 대응 색차가 비정상적으로 크거나 얼굴
    성분을 찾지 못하면 원본 생성 결과를 그대로 반환한다.
    """
    out = out.convert("RGB")
    ref = _managed(ref).resize(out.size, Image.LANCZOS)
    out_rgb = np.asarray(out, dtype=np.uint8)
    ref_rgb = np.asarray(ref, dtype=np.uint8)

    region = _face_skin_region(out_rgb)
    if region is None:
        return out
    face_skin, (x, y, face_width, face_height) = region

    # 수염이 편집되는 하부 대신 이마·볼·코가 있는 얼굴 성분 상부에서만 색차를
    # 추정한다. 적용 대상에는 생성된 턱 피부도 포함된다.
    stable = np.zeros(out_rgb.shape[:2], dtype=bool)
    stable[
        y:min(y + int(face_height * 0.60), out_rgb.shape[0]),
        x:min(x + face_width, out_rgb.shape[1]),
    ] = True
    sample = face_skin & _skin(ref_rgb) & stable
    if int(sample.sum()) < _COLOR_MIN_SAMPLES:
        return out

    out_lab = cv2.cvtColor(out_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    ref_lab = cv2.cvtColor(ref_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    raw_shift = np.median(ref_lab[sample] - out_lab[sample], axis=0)
    if not np.isfinite(raw_shift).all() or np.any(np.abs(raw_shift) > _COLOR_REJECT_SHIFT_LAB):
        return out

    shift = np.clip(raw_shift, -_COLOR_MAX_SHIFT_LAB, _COLOR_MAX_SHIFT_LAB)
    shift *= _COLOR_STRENGTH
    shifted_lab = np.clip(
        np.rint(out_lab + shift.reshape(1, 1, 3)),
        0,
        255,
    ).astype(np.uint8)
    shifted_rgb = cv2.cvtColor(shifted_lab, cv2.COLOR_LAB2RGB)

    # 흐린 경계는 얼굴 피부 성분의 안쪽에만 둔다. 비피부 픽셀은 alpha=0이라
    # LAB 왕복 양자화조차 거치지 않고 원출력 RGB가 정확히 유지된다.
    alpha = cv2.GaussianBlur(
        face_skin.astype(np.float32),
        (0, 0),
        sigmaX=max(1.0, min(out_rgb.shape[:2]) * 0.003),
    )
    alpha *= face_skin.astype(np.float32)
    corrected_rgb = np.rint(
        out_rgb.astype(np.float32) * (1.0 - alpha[..., None])
        + shifted_rgb.astype(np.float32) * alpha[..., None]
    ).clip(0, 255).astype(np.uint8)
    return Image.fromarray(corrected_rgb, "RGB")

def load_pipe(compile=False):
    """FLUX Kontext 파이프라인을 GPU에 1회 로드해 상주 서버에서 재사용한다.

    torch.compile은 compile=True로 명시적으로 요청한 경우에만 적용한다.
    프로덕션 기본값은 첫 요청 지연이 없는 eager 실행이다.
    """
    pipe = FluxKontextPipeline.from_pretrained(MODEL, torch_dtype=torch.bfloat16).to("cuda")
    if compile:
        try:
            pipe.transformer = torch.compile(pipe.transformer, dynamic=True)
            print("[run_kontext] torch.compile 적용(transformer, dynamic)", flush=True)
        except Exception as exc:
            print(f"[run_kontext] torch.compile 스킵(eager 폴백): {exc}", flush=True)
    else:
        print("[run_kontext] torch.compile 비활성(eager)", flush=True)
    return pipe


def infer(
    pipe,
    inp,
    out,
    prompt=None,
    guidance=None,
    steps=None,
    *,
    raw_out=None,
    seed=None,
    space_compat=True,
):
    """이미 로드된 파이프라인으로 1장 추론하고 안전한 색 보정을 적용한다."""
    selected_prompt = prompt or PROMPT
    selected_guidance = GUIDANCE if guidance is None else guidance
    selected_steps = STEPS if steps is None else steps
    img = load_image(inp)                 # 원본 (ICC 있을 수 있음)
    orig_size = img.size
    selected_seed = DEFAULT_SEED if seed is None else seed
    # 사용자 통과 실험과 새 얼굴 샘플 재검증은 공식 HF Space가 원본 RGB를
    # 그대로 파이프라인에 넘긴 경로였다. 이 경로가 프로덕션 기본값이다.
    src = img.convert("RGB") if space_compat else _prep(img, WORK_RES)
    print(
        f"추론: {inp} prompt={PROMPT_VERSION if prompt is None else 'override'} "
        f"promptSha256={hashlib.sha256(selected_prompt.encode('utf-8')).hexdigest()} "
        f"seed={selected_seed} "
        f"steps={selected_steps} guidance={selected_guidance} "
        f"원본{orig_size[0]}x{orig_size[1]} -> 작업{src.size[0]}x{src.size[1]}",
        flush=True,
    )
    pipe_kwargs = {
        "image": src,
        "prompt": selected_prompt,
        "guidance_scale": selected_guidance,
        "num_inference_steps": selected_steps,
        "width": src.width,
        "height": src.height,
    }
    if not space_compat:
        # diffusers 0.39+는 width/height를 받더라도 기본 max_area=1024**2에 맞춰
        # 출력을 다시 키우고, 입력도 Kontext 선호 해상도로 자동 확대한다.
        # 검증본의 긴 변 1024 제한을 실제 모델 입·출력까지 유지한다.
        pipe_kwargs["max_area"] = src.width * src.height
        pipe_kwargs["_auto_resize"] = False
    generator = torch.Generator() if space_compat else torch.Generator(device="cuda")
    pipe_kwargs["generator"] = generator.manual_seed(selected_seed)
    res = pipe(
        **pipe_kwargs,
    ).images[0]

    if raw_out is not None:
        raw_res = res if res.size == orig_size else res.resize(orig_size, Image.LANCZOS)
        raw_res.save(raw_out)
    res = _color(res, img)                # bounded global correction; 피부 마스크 합성 없음
    if res.size != orig_size:            # 원본 크기로 복원
        res = res.resize(orig_size, Image.LANCZOS)
    res.save(out)
    return out


def main():
    if len(sys.argv) < 2:
        print("사용: python run_kontext.py 입력.jpg [출력.png]"); sys.exit(1)
    inp = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "out.png"

    print("모델 로드 중...", flush=True)
    pipe = load_pipe()
    infer(pipe, inp, out)
    print("저장:", out, flush=True)

if __name__ == "__main__":
    main()
