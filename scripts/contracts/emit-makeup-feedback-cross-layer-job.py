from __future__ import annotations

import json
import sys
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPOSITORY_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.makeup_feedback_analysis import normalize_makeup_feedback_result  # noqa: E402


def main() -> int:
  if len(sys.argv) != 2:
    raise SystemExit("usage: emit-makeup-feedback-cross-layer-job.py FIXTURE_PATH")

  fixture = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
  result = normalize_makeup_feedback_result(
    fixture["bedrockResponse"],
    fixture["requestPayload"],
  )
  result["analysisImageSize"] = {"width": 1080, "height": 1440}
  result["evidenceRegions"] = [
    {"id": "full", "box": {"left": 0.1, "top": 0.05, "right": 0.9, "bottom": 0.95}},
    {"id": "left_eye", "box": {"left": 0.2, "top": 0.2, "right": 0.48, "bottom": 0.4}},
    {"id": "right_eye", "box": {"left": 0.52, "top": 0.2, "right": 0.8, "bottom": 0.4}},
    {"id": "left_cheek", "box": {"left": 0.18, "top": 0.38, "right": 0.48, "bottom": 0.68}},
    {"id": "right_cheek", "box": {"left": 0.52, "top": 0.38, "right": 0.82, "bottom": 0.68}},
    {"id": "lips", "box": {"left": 0.35, "top": 0.62, "right": 0.65, "bottom": 0.8}},
  ]
  for evaluation in result["evaluations"]:
    topic_id = evaluation["topicId"]
    regional_ids = (
      ["lips"]
      if topic_id == "lip"
      else ["left_cheek", "right_cheek"]
      if topic_id in {"foundation", "blush", "highlight", "shading"}
      else ["left_eye", "right_eye"]
    )
    region_ids = ["full", *regional_ids]
    for observation in evaluation["observations"]:
      observation["evidenceRegionIds"] = region_ids
  job = {
    "feedbackPayload": {
      "analysisStatus": "bedrock_completed",
      "result": result,
    },
    "id": "makeup-feedback-cross-layer-job",
    "modelVersion": result["modelVersion"],
    "sourceLabel": fixture["selection"].get("photoTitle"),
    "status": "completed",
  }
  json.dump(job, sys.stdout, ensure_ascii=True)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
