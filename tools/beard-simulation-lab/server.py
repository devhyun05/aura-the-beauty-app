"""Local dev API wrapping the lab pipeline — NOT a production path.

Binds 127.0.0.1 by default (iOS simulator reaches it via localhost). For a
physical device on the same LAN run with --host 0.0.0.0 knowingly — photos
then traverse your local network.

  .venv/bin/python server.py            # 127.0.0.1:8765
  .venv/bin/python server.py --port 9000

POST /simulate      multipart: photo=<file>, survey=<json str>, stages=<csv>
GET  /runs/{id}/{artifact}
GET  /health
"""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from engine.contracts import validate_survey
from engine.pipeline import DEFAULT_SURVEY, run_pipeline

LAB_ROOT = Path(__file__).resolve().parent
RUNS_ROOT = LAB_ROOT / "outputs" / "runs"

app = FastAPI(title="beard-simulation dev API", docs_url=None, redoc_url=None)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "beard-simulation-lab", "time": time.time()}


@app.post("/simulate")
async def simulate(
    photo: UploadFile = File(...),
    survey: str = Form("{}"),
    stages: str = Form("mild,medium,strong"),
) -> dict:
    try:
        survey_payload = {**DEFAULT_SURVEY, **json.loads(survey)}
    except json.JSONDecodeError as exc:
        raise HTTPException(400, f"survey must be JSON: {exc}") from exc
    valid, errors = validate_survey(survey_payload)
    if not valid:
        raise HTTPException(400, f"invalid survey: {errors}")

    request_id = f"dev-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    suffix = Path(photo.filename or "photo.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(photo.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        outcome = run_pipeline(
            tmp_path,
            stages=stages.split(","),
            survey=survey_payload,
            request_id=request_id,
        )
    finally:
        tmp_path.unlink(missing_ok=True)

    if outcome.rejected:
        raise HTTPException(422, detail={"rejected": True,
                                         "reason": outcome.reject_reason,
                                         "requestId": request_id})

    result = outcome.result
    assert result is not None
    base = f"/runs/{request_id}"
    for stage_result in result["stages"]:
        stage_result["imageRef"] = f"{base}/{stage_result['imageRef']}"
    result["maskPackage"]["masks"] = {
        key: f"{base}/{name}"
        for key, name in result["maskPackage"]["masks"].items()
    }
    result["inputImageRef"] = f"{base}/input.png"
    return result


@app.get("/runs/{run_id}/{artifact}")
def get_artifact(run_id: str, artifact: str) -> FileResponse:
    # Path-traversal hard stop: both segments must be plain names.
    if "/" in run_id or ".." in run_id or "/" in artifact or ".." in artifact:
        raise HTTPException(400, "bad path")
    path = RUNS_ROOT / run_id / artifact
    if not path.is_file():
        raise HTTPException(404, "not found")
    return FileResponse(path)


@app.delete("/runs/{run_id}")
def delete_run(run_id: str) -> dict:
    """Immediate-delete hook (data policy): removes photo + all derivatives."""
    if "/" in run_id or ".." in run_id:
        raise HTTPException(400, "bad path")
    path = RUNS_ROOT / run_id
    if not path.is_dir():
        raise HTTPException(404, "not found")
    shutil.rmtree(path)
    return {"deleted": run_id}


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port)
