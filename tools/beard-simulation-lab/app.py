"""Gradio web UI for the beard simulation lab — local, self-serve.

Run:
  .venv/bin/python app.py
Opens http://127.0.0.1:7860 in the browser. Local-only: photos never leave
this machine (matches docs/beard-simulation/DATA_POLICY_KO.md). Reuses the
exact same engine as cli.py / server.py.

Two tabs:
- "3단계 미리보기": runs the real pipeline (mild/medium/strong) and shows the
  stage results + detection masks + analysis — what the app/API would return.
- "파라미터 튜닝": caches the per-photo analysis and re-renders on slider move,
  so you can converge shadow/hair presets interactively.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import cv2
import gradio as gr
import numpy as np

# iPhone photos upload as HEIC; PIL (used by gradio's image input) can't decode
# it without this plugin. Register the opener so HEIC uploads Just Work.
try:
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:  # pragma: no cover - JPG/PNG still work without it
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent))

from engine.beard_segmentation import fit_skin_model, segment_beard  # noqa: E402
from engine.beard_shadow_corrector import correct_crop  # noqa: E402
from engine.blend import composite_full, derive_soft_blend  # noqa: E402
from engine.detect_face import detect_face, detect_landmarks  # noqa: E402
from engine.geometry_guard import run_post_checks  # noqa: E402
from engine.lower_face_roi import (  # noqa: E402
    build_lower_face_crop,
    skin_reference_pixels,
)
from engine.pipeline import DEFAULT_SURVEY, MAX_IMAGE_DIM, run_pipeline  # noqa: E402

STAGE_LABELS = {
    "mild": "초기 변화 느낌",
    "medium": "눈에 띄는 변화 느낌",
    "strong": "많이 줄어든 느낌",
}
BEARD_TYPE_LABELS = {
    "shadow_dominant": "그림자 위주형",
    "stubble": "짧은 수염형",
    "patchy": "부분 분포형",
    "dense": "고밀도형",
}
SHAVING_CHOICES = [
    ("매일 면도 (깔끔한 상태)", "clean"),
    ("짧은 수염이 자주 올라옴", "stubble"),
    ("짧게 유지하는 편", "short"),
    ("수염이 굵고 밀도가 높음", "dense"),
]
REASON_HINTS = {
    "quality_gate:no_face_detected": "얼굴을 찾지 못했어요. 정면·얼굴 전체가 나오게 촬영하세요.",
    "quality_gate:face_too_small": "얼굴이 너무 작아요. 조금 더 가까이서 촬영하세요.",
    "quality_gate:head_tilted": "고개가 기울어졌어요. 똑바로 정면을 보세요.",
    "quality_gate:face_not_frontal": "정면 사진이 필요해요.",
    "quality_gate:photo_too_blurry": "사진이 흔들렸어요. 초점을 맞춰 다시 촬영하세요.",
    "quality_gate:bad_lighting": "조명이 너무 어둡거나 밝아요.",
    "guard:mask_protect_overlap": "입 주변 분석이 어려워요. 수염이 길면 짧게 정리 후 시도하세요.",
}


def _rgb_to_bgr(img: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)


def _bgr_to_rgb(img: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def _overlay_rgb(crop_bgr: np.ndarray, masks) -> np.ndarray:
    vis = crop_bgr.astype(np.float32) * 0.72
    vis[..., 2] = np.clip(vis[..., 2] + masks.hard * 200, 0, 255)     # red = hair
    vis[..., 0] = np.clip(vis[..., 0] + masks.shadow * 200, 0, 255)   # blue = shadow
    vis[..., 1] = np.clip(vis[..., 1] + masks.protect * 120, 0, 255)  # green = protect
    return _bgr_to_rgb(vis.astype(np.uint8))


# --- Tab 1: full pipeline, 3 stages ----------------------------------------

def generate_stages(photo_rgb, shaving_state):
    if photo_rgb is None:
        return "사진을 먼저 올려주세요.", None, [], ""
    with tempfile.TemporaryDirectory() as tmp:
        # PNG (lossless): re-encoding to JPEG here perturbs landmark detection
        # enough to trip the near-margin jawline check on otherwise-fine photos.
        src = Path(tmp) / "input.png"
        cv2.imwrite(str(src), _rgb_to_bgr(photo_rgb))
        survey = {**DEFAULT_SURVEY, "shavingState": shaving_state}
        outcome = run_pipeline(
            src, stages=["mild", "medium", "strong"], survey=survey,
            out_root=Path(tmp) / "runs")

        run_dir = outcome.run_dir
        overlay_path = run_dir / "mask_overlay.png"
        overlay_rgb = (
            _bgr_to_rgb(cv2.imread(str(overlay_path)))
            if overlay_path.exists() else None
        )

        if outcome.rejected:
            hint = REASON_HINTS.get(
                outcome.reject_reason, "결과를 안전하게 만들 수 없었어요. 다시 촬영해 주세요.")
            return (f"### ❌ 표시 불가\n`{outcome.reject_reason}`\n\n{hint}",
                    overlay_rgb, [], "")

        result = outcome.result
        gallery = []
        for stage_result in result["stages"]:
            stage = stage_result["stage"]
            img = cv2.imread(str(run_dir / f"result_{stage}.png"))
            mitigations = stage_result["guard"]["mitigationsApplied"]
            caption = STAGE_LABELS[stage] + (
                f" (완화: {','.join(mitigations)})" if mitigations else "")
            gallery.append((_bgr_to_rgb(img), caption))

        analysis = result["analysis"]
        beard_type = BEARD_TYPE_LABELS.get(analysis["beardType"], analysis["beardType"])
        analysis_md = (
            f"**수염 타입:** {beard_type}  \n"
            f"**밀도:** {round(analysis['densityScore'] * 100)} / 100 · "
            f"**그림자:** {round(analysis['shadowScore'] * 100)} / 100\n\n"
            "**상담 질문 예시**\n"
            + "\n".join(f"- {q}" for q in result["consultQuestions"][:3])
        )

        status = f"### ✅ 완료 — {len(result['stages'])}개 단계 생성"
        if result["failures"]:
            names = ", ".join(STAGE_LABELS[f["stage"]] for f in result["failures"])
            status += f"\n\n⚠️ 원본 보존 검증 미통과로 제외: {names}"
        return status, overlay_rgb, gallery, analysis_md


# --- Tab 2: cached per-photo analysis + interactive tuning ------------------

def analyze_photo(photo_rgb, shadow, hair, stubble):
    if photo_rgb is None:
        return None, "사진을 올리면 분석이 시작돼요.", None, None
    bgr = _rgb_to_bgr(photo_rgb)
    scale = MAX_IMAGE_DIM / max(bgr.shape[:2])
    if scale < 1.0:
        bgr = cv2.resize(bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    detection = detect_face(bgr)
    if detection is None or not detection.quality.passed:
        reason = detection.quality.reject_reason if detection else "no_face_detected"
        hint = REASON_HINTS.get(f"quality_gate:{reason}", "다시 촬영해 주세요.")
        return None, f"### ❌ 분석 불가\n`{reason}`\n\n{hint}", None, None

    skin_model = fit_skin_model(
        skin_reference_pixels(bgr, detection.landmarks, detection.face_width))
    crop = build_lower_face_crop(
        bgr, detection.landmarks, detection.face_width, detection.face_height)
    masks = segment_beard(crop, skin_model)
    bundle = {"bgr": bgr, "detection": detection, "crop": crop, "masks": masks}

    overlay = _overlay_rgb(crop.bgr, masks)
    result_rgb, status = render_tuned(bundle, shadow, hair, stubble)
    return bundle, status, overlay, result_rgb


def render_tuned(bundle, shadow, hair, stubble):
    if not bundle:
        return None, "먼저 사진을 올려주세요."
    bgr = bundle["bgr"]
    detection = bundle["detection"]
    crop = bundle["crop"]
    masks = bundle["masks"]

    corrected = correct_crop(
        crop, masks, shadow_strength=shadow, hair_attenuation=hair,
        stubble_inpaint=stubble)
    soft = derive_soft_blend(crop, masks)
    result = composite_full(bgr, corrected, crop, soft)

    soft_full = np.zeros(bgr.shape[:2], dtype=np.float32)
    x0, y0, x1, y1 = crop.bbox
    soft_full[y0:y1, x0:x1] = soft
    report = run_post_checks(
        original=bgr, result=result,
        landmarks_before=detection.landmarks,
        landmarks_after=detect_landmarks(result),
        interocular=detection.interocular,
        face_height=detection.face_height,
        soft_blend_full=soft_full,
        identity_mode="off",  # tuning speed; acceptance runs use 'require'
    )

    header = ("✅ 원본 보존 검증 통과" if report.passed
              else f"⚠️ 검증 실패: `{report.reject_reason}` "
                   "(실제 앱에선 이 결과는 표시되지 않아요)")
    lines = "  \n".join(
        f"{'✓' if c.passed else '✗'} {c.id}: {round(c.value, 4)} "
        f"(기준 {c.threshold})"
        for c in report.checks
    )
    return _bgr_to_rgb(result), f"{header}\n\n{lines}"


def build_demo() -> gr.Blocks:
    with gr.Blocks(title="수염 제모 시뮬레이션 랩") as demo:
        gr.Markdown(
            "# 수염 제모 시뮬레이션 랩\n"
            "**로컬 전용** — 사진은 이 컴퓨터를 벗어나지 않습니다. "
            "결과는 참고용 합성 이미지이며 의료적 예측이 아닙니다."
        )
        with gr.Tabs():
            with gr.Tab("3단계 미리보기"):
                with gr.Row():
                    with gr.Column(scale=1):
                        photo1 = gr.Image(type="numpy", label="정면 사진", height=320)
                        shaving = gr.Dropdown(
                            choices=SHAVING_CHOICES, value="stubble",
                            label="평소 면도 상태")
                        gen_btn = gr.Button("3단계 생성", variant="primary")
                    with gr.Column(scale=1):
                        status1 = gr.Markdown()
                        overlay1 = gr.Image(
                            label="검출 마스크 (빨강=수염, 파랑=그림자, 초록=보호영역)",
                            height=260)
                        gallery = gr.Gallery(
                            label="단계별 결과", columns=3, height=260)
                        analysis1 = gr.Markdown()
                gen_btn.click(
                    generate_stages, [photo1, shaving],
                    [status1, overlay1, gallery, analysis1])

            with gr.Tab("파라미터 튜닝"):
                gr.Markdown(
                    "사진을 올리면 자동 분석 후 아래 슬라이더로 강도를 실시간 조절합니다. "
                    "**그림자 → 수염 순서로** 수렴시키는 걸 권장해요.")
                bundle_state = gr.State(None)
                with gr.Row():
                    with gr.Column(scale=1):
                        photo2 = gr.Image(type="numpy", label="정면 사진", height=300)
                        overlay2 = gr.Image(label="검출 마스크", height=200)
                        shadow_sl = gr.Slider(
                            0.0, 1.0, value=0.6, step=0.05, label="그림자 완화 강도")
                        hair_sl = gr.Slider(
                            0.0, 1.0, value=0.6, step=0.05, label="수염 옅게 강도")
                        stubble_ck = gr.Checkbox(
                            value=False, label="잔여 수염 점 제거 (강)")
                    with gr.Column(scale=1):
                        status2 = gr.Markdown("사진을 올리면 분석이 시작돼요.")
                        result2 = gr.Image(label="결과 (합성 이미지)", height=420)

                tuning_inputs = [bundle_state, shadow_sl, hair_sl, stubble_ck]
                photo2.change(
                    analyze_photo,
                    [photo2, shadow_sl, hair_sl, stubble_ck],
                    [bundle_state, status2, overlay2, result2])
                for control in (shadow_sl, hair_sl):
                    control.release(render_tuned, tuning_inputs, [result2, status2])
                stubble_ck.change(render_tuned, tuning_inputs, [result2, status2])
        return demo


if __name__ == "__main__":
    build_demo().launch(
        server_name="127.0.0.1", server_port=7860, inbrowser=True)
