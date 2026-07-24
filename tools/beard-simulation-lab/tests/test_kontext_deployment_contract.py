import ast
import importlib.util
from pathlib import Path
import sys
import types

import numpy as np
from PIL import Image


LAB_ROOT = Path(__file__).resolve().parents[1]
RUN_KONTEXT = LAB_ROOT / "deploy" / "ec2" / "run_kontext.py"
SERVE_KONTEXT = LAB_ROOT / "deploy" / "ec2" / "serve_kontext.py"
RUN_ON_INSTANCE = LAB_ROOT / "deploy" / "serverless" / "run_on_instance.sh"
SETUP_EC2 = LAB_ROOT / "deploy" / "ec2" / "setup_ec2.sh"


def _module_assignments(source: str) -> dict[str, object]:
    tree = ast.parse(source)
    assignments: dict[str, object] = {}

    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name):
                try:
                    assignments[target.id] = ast.literal_eval(node.value)
                except (ValueError, TypeError):
                    continue

    return assignments


def _load_run_kontext(monkeypatch):
    torch_stub = types.ModuleType("torch")
    torch_stub.bfloat16 = object()
    diffusers_stub = types.ModuleType("diffusers")
    diffusers_stub.FluxKontextPipeline = object
    diffusers_utils_stub = types.ModuleType("diffusers.utils")
    diffusers_utils_stub.load_image = lambda value: value

    monkeypatch.setitem(sys.modules, "torch", torch_stub)
    monkeypatch.setitem(sys.modules, "diffusers", diffusers_stub)
    monkeypatch.setitem(sys.modules, "diffusers.utils", diffusers_utils_stub)

    spec = importlib.util.spec_from_file_location("run_kontext_under_test", RUN_KONTEXT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_shipping_kontext_uses_approved_prompt_and_settings() -> None:
    source = RUN_KONTEXT.read_text(encoding="utf-8")
    assignments = _module_assignments(source)

    assert assignments["PROMPT_VERSION"] == "beard-removal-identity-preserving-2026-07-25-v2"
    assert assignments["GUIDANCE"] == 2.5
    assert assignments["STEPS"] == 28
    assert assignments["DEFAULT_SEED"] == 0
    assert assignments["WORK_RES"] == 1024
    assert assignments["_COLOR_STRENGTH"] == 1.0

    assert assignments["PROMPT"] == (
        "Retouch only the lower face to a freshly shaved appearance. "
        "Replace dark gray or black speckles and shadows on the upper lip, chin, cheeks, and jaw "
        "with natural skin texture and tone matching the surrounding face. "
        "Leave no dark hair-shaped marks in those areas. "
        "Keep the eyebrows unchanged. "
        "Same person, same eyes, same eyebrows, same lips, same moles, same lighting, same background."
    )


def test_shipping_kontext_uses_bounded_face_skin_color_correction() -> None:
    source = RUN_KONTEXT.read_text(encoding="utf-8")
    tree = ast.parse(source)
    function_names = {
        node.name
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }

    assert "_color" in function_names
    assert "_skin" in function_names
    assert "_face_skin_region" in function_names
    assert "_lut" not in function_names
    assert "cv2.dilate" not in source
    assert "cv2.connectedComponentsWithStats" in source
    assert "raw_shift = np.median" in source
    assert "_COLOR_MAX_SHIFT_LAB" in source
    assert "_COLOR_REJECT_SHIFT_LAB" in source
    assert "alpha *= face_skin.astype(np.float32)" in source
    assert "out_rgb.astype(np.float32) * (1.0 - alpha[..., None])" in source
    assert "res = _color(res, img)" in source
    assert "def load_pipe(compile=False)" in source
    assert "def infer(" in source
    assert "space_compat=True" in source
    assert "selected_seed = DEFAULT_SEED if seed is None else seed" in source
    assert "_prep(img, WORK_RES)" in source
    assert 'img = img.convert("RGB")' in source
    assert "img = _managed(img)" not in source
    assert 'pipe_kwargs["max_area"] = src.width * src.height' in source
    assert 'pipe_kwargs["_auto_resize"] = False' in source
    assert 'torch.Generator() if space_compat else torch.Generator(device="cuda")' in source


def test_color_correction_moves_tone_toward_reference_without_spatial_patches(monkeypatch) -> None:
    module = _load_run_kontext(monkeypatch)
    generated_rgb = np.full((128, 128, 3), [178, 126, 104], dtype=np.uint8)
    reference_rgb = np.full((128, 128, 3), [168, 119, 101], dtype=np.uint8)
    generated = Image.fromarray(generated_rgb, "RGB")
    reference = Image.fromarray(reference_rgb, "RGB")

    corrected = np.asarray(module._color(generated, reference), dtype=np.uint8)
    before_distance = np.linalg.norm(generated_rgb[64, 64].astype(float) - reference_rgb[64, 64])
    after_distance = np.linalg.norm(corrected[64, 64].astype(float) - reference_rgb[64, 64])

    assert after_distance < before_distance
    assert np.array_equal(corrected[0, 0], generated_rgb[0, 0])
    assert np.array_equal(corrected[-1, -1], generated_rgb[-1, -1])


def test_color_correction_keeps_non_face_background_byte_exact(monkeypatch) -> None:
    module = _load_run_kontext(monkeypatch)
    generated_rgb = np.full((160, 128, 3), [55, 75, 95], dtype=np.uint8)
    reference_rgb = generated_rgb.copy()
    yy, xx = np.ogrid[:160, :128]
    face = ((xx - 64) / 40) ** 2 + ((yy - 72) / 58) ** 2 <= 1
    generated_rgb[face] = [178, 126, 104]
    reference_rgb[face] = [168, 119, 101]

    corrected = np.asarray(
        module._color(
            Image.fromarray(generated_rgb, "RGB"),
            Image.fromarray(reference_rgb, "RGB"),
        ),
        dtype=np.uint8,
    )

    assert np.array_equal(corrected[~face], generated_rgb[~face])
    before = np.linalg.norm(generated_rgb[72, 64].astype(float) - reference_rgb[72, 64])
    after = np.linalg.norm(corrected[72, 64].astype(float) - reference_rgb[72, 64])
    assert after < before


def test_color_correction_fails_safe_on_extreme_mismatch(monkeypatch) -> None:
    module = _load_run_kontext(monkeypatch)
    generated_rgb = np.full((128, 128, 3), [95, 65, 50], dtype=np.uint8)
    reference_rgb = np.full((128, 128, 3), [225, 180, 155], dtype=np.uint8)
    generated = Image.fromarray(generated_rgb, "RGB")
    reference = Image.fromarray(reference_rgb, "RGB")

    corrected = np.asarray(module._color(generated, reference), dtype=np.uint8)

    assert np.array_equal(corrected, generated_rgb)


def test_instance_runner_always_refreshes_inference_script() -> None:
    source = RUN_ON_INSTANCE.read_text(encoding="utf-8")

    assert 'aws s3 cp "s3://${BUCKET}/scripts/run_kontext.py" "$NEXT_SCRIPT"' in source
    assert 'aws s3 cp "s3://${BUCKET}/scripts/serve_kontext.py" "$NEXT_SERVER"' in source
    assert "sha256sum" in source
    assert "systemctl restart beard-kontext.service" in source
    assert '"${BASE}/ready"' in source
    assert '"${BASE}/infer"' in source
    assert "source /opt/pytorch/bin/activate" not in source
    assert '"$PYTHON_BIN" /home/ubuntu/run_kontext.py' not in source


def test_server_forbids_prompt_override_and_uses_unique_request_paths() -> None:
    source = SERVE_KONTEXT.read_text(encoding="utf-8")

    assert 'forbidden_overrides = {"prompt", "guidance", "steps"} & set(body)' in source
    assert "run_kontext.PROMPT_SHA256" in source
    assert 'TemporaryDirectory(prefix="beard-infer-"' in source
    assert 'body.get("prompt")' not in source
    assert "raw_output_key=raw_output_key" in source
    assert 'diagnostic_steps = body.get("diagnostic_steps")' in source
    assert 'diagnostic_guidance = body.get("diagnostic_guidance")' in source
    assert "guidance=diagnostic_guidance" in source
    assert 'diagnostic_space_compat = body.get("diagnostic_space_compat", True)' in source
    assert "run_kontext.DEFAULT_SEED" in source
    assert "space_compat=diagnostic_space_compat" in source


def test_ec2_setup_pins_verified_runtime_and_model_revision() -> None:
    source = SETUP_EC2.read_text(encoding="utf-8")

    assert '"diffusers==0.39.0"' in source
    assert '"transformers==5.14.1"' in source
    assert '"accelerate==1.14.0"' in source
    assert "--revision 24e9dedc4ef646698dc8eb4e18ae2cec3c9fea0d" in source
    assert "pip install -U diffusers" not in source
