"""End-to-end pipeline smoke over real sample photos.

Skipped until consented photos land in samples/ (data policy:
docs/beard-simulation/DATA_POLICY_KO.md). Once photos exist this becomes the
regression check that the whole path — quality gate → masks → correction →
guard → contract-valid result.json — still holds.
"""

import json
from pathlib import Path

import pytest

from engine.contracts import validate_result
from engine.image_io import is_supported_image_path
from engine.pipeline import run_pipeline

LAB_ROOT = Path(__file__).resolve().parents[1]
SAMPLES = sorted(
    p for p in (LAB_ROOT / "samples").glob("*")
    if is_supported_image_path(p)
) if (LAB_ROOT / "samples").exists() else []


@pytest.mark.skipif(not SAMPLES, reason="no consented sample photos in samples/")
def test_pipeline_first_sample(tmp_path: Path) -> None:
    outcome = run_pipeline(SAMPLES[0], out_root=tmp_path)
    if outcome.rejected:
        # A rejection is a legitimate outcome (quality gate / protect overlap),
        # but the run dir must say why.
        assert (outcome.run_dir / "rejected.json").exists()
        return

    result_path = outcome.run_dir / "result.json"
    assert result_path.exists()
    result = json.loads(result_path.read_text())
    valid, errors = validate_result(result)
    assert valid, errors
    for stage_result in result["stages"]:
        assert (outcome.run_dir / Path(stage_result["imageRef"]).name).exists()
    assert (outcome.run_dir / "mask_hard_hair.png").exists()
    assert (outcome.run_dir / "metrics.json").exists()
