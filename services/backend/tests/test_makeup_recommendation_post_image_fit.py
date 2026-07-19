import json
from uuid import UUID

import pytest

from app.api import makeup_recommendations as makeup_api
from app.services.makeup_recommendation_fit import build_post_image_fit_assessment


REPORT_ID = UUID("77777777-7777-7777-7777-777777777777")


def _assessment(*, coherence_score: int = 90) -> dict:
  dimensions = {
    "situation": {"available": True, "score": 80, "reason": "situation plan"},
    "preference": {"available": True, "score": 80, "reason": "preference plan"},
    "personalColor": {"available": True, "score": 80, "reason": "color plan"},
    "faceStructure": {"available": True, "score": 80, "reason": "face plan"},
    "skinCompatibility": {"available": True, "score": 80, "reason": "skin plan"},
    "lookCoherence": {"available": True, "score": coherence_score, "reason": "brief plan"},
  }
  evidence_sources = (
    "situation",
    "preference",
    "personal_color",
    "face_structure",
    "skin_type",
    "look_coherence",
  )
  return {
    "scoringVersion": "makeup-fit-v1",
    "overallScore": 81,
    "dimensions": dimensions,
    "evidence": [
      {"source": source, "label": source, "reason": "plan evidence"}
      for source in evidence_sources
    ],
  }


def _crop_metadata() -> dict:
  box = {"left": 0.2, "top": 0.2, "right": 0.8, "bottom": 0.8}
  return {
    "areas": {
      area: [{"regionId": area, "box": dict(box)}]
      for area in ("base", "brow", "eye", "cheek", "lip")
    },
  }


def _alignment_metadata() -> dict:
  frame = {
    "faceBox": {"left": 0.2, "top": 0.1, "right": 0.8, "bottom": 0.9},
    "eyeCenters": {
      "imageLeft": {"x": 0.38, "y": 0.42},
      "imageRight": {"x": 0.62, "y": 0.42},
    },
    "rollDeg": 0,
  }
  return {"source": frame, "generated": frame}


def test_post_image_fit_uses_actual_asset_crop_and_alignment_metadata() -> None:
  updated = build_post_image_fit_assessment(
    {"fitAssessment": _assessment()},
    generation_source="claude",
    image_status="completed",
    provenance={
      "width": 1024,
      "height": 1024,
      "cropMetadata": _crop_metadata(),
      "alignmentMetadata": _alignment_metadata(),
    },
  )

  assert updated is not None
  assert updated["dimensions"]["lookCoherence"]["score"] == 96
  assert updated["overallScore"] == 82
  assert updated["imageValidation"] == {
    "version": "makeup-image-fit-v1",
    "stage": "post_image",
    "validationSource": "source_generated_alignment",
    "assetStatus": "completed",
    "actualAssetVerified": True,
    "validCropAreaCount": 5,
    "cropAreaCount": 5,
    "geometryScore": 100,
    "planScore": 90,
    "technicalScore": 100,
    "generationAttempt": None,
    "semanticMakeupVerified": False,
    "limitation": "추가 비전 모델 호출 없이 자산 상태와 MediaPipe 얼굴 기하 메타데이터만 검증했습니다.",
  }
  coherence_evidence = next(
    item for item in updated["evidence"] if item["source"] == "look_coherence"
  )
  assert "실제 자산" in coherence_evidence["label"]
  assert "MediaPipe 얼굴 정렬" in coherence_evidence["label"]
  assert "색상·질감" in coherence_evidence["reason"]


def test_post_image_fit_marks_media_pipe_unavailable_without_claiming_semantics() -> None:
  updated = build_post_image_fit_assessment(
    {"fitAssessment": _assessment()},
    generation_source="claude",
    image_status="completed",
    provenance={"width": 1024, "height": 1024},
  )

  assert updated is not None
  assert updated["dimensions"]["lookCoherence"]["score"] == 85
  assert updated["imageValidation"]["validationSource"] == "generated_asset"
  assert updated["imageValidation"]["semanticMakeupVerified"] is False
  assert "MediaPipe 검증 불가" in updated["evidence"][-1]["label"]


def test_post_image_fit_keeps_fallback_overall_score_capped() -> None:
  updated = build_post_image_fit_assessment(
    {"fitAssessment": _assessment(coherence_score=100)},
    generation_source="deterministic_fallback",
    image_status="completed",
    provenance={
      "width": 1024,
      "height": 1024,
      "cropMetadata": _crop_metadata(),
      "alignmentMetadata": _alignment_metadata(),
    },
  )

  assert updated is not None
  assert updated["overallScore"] == 74


def test_post_image_fit_waits_for_completed_asset() -> None:
  assert build_post_image_fit_assessment(
    {"fitAssessment": _assessment()},
    generation_source="claude",
    image_status="processing",
    provenance={},
  ) is None


@pytest.mark.asyncio
async def test_completed_asset_atomically_persists_post_image_fit() -> None:
  class DB:
    def __init__(self) -> None:
      self.query = ""
      self.args: tuple = ()

    async def fetchrow(self, query: str, *args):
      self.query = query
      self.args = args
      return {"look_id": "anchor"}

  post_fit = build_post_image_fit_assessment(
    {"fitAssessment": _assessment()},
    generation_source="claude",
    image_status="completed",
    provenance={"width": 1024, "height": 1024, "cropMetadata": _crop_metadata()},
  )
  assert post_fit is not None
  db = DB()

  persisted = await makeup_api._persist_v2_image_assets(
    db,
    REPORT_ID,
    [{
      "id": "anchor",
      "role": "anchor",
      "imageStatus": "completed",
      "fitAssessment": post_fit,
      "imageAsset": {
        "imageUrl": "https://cdn.example.com/anchor.webp",
        "storageBucket": "assets",
        "objectKey": "anchor.webp",
        "contentType": "image/webp",
        "isPrivate": False,
        "modelId": "gpt-image-2",
        "promptVersion": "makeup-image-v2",
        "provenance": {"width": 1024, "height": 1024},
      },
    }],
    generation_attempt=2,
  )

  assert persisted is True
  assert "with persisted_asset" in db.query
  assert "jsonb_set(item.look, '{fitAssessment}'" in db.query
  assert "order by item.ordinality" in db.query
  assert "attempt_count = $15" in db.query
  assert json.loads(db.args[15])["imageValidation"]["stage"] == "post_image"


@pytest.mark.asyncio
async def test_existing_completed_report_lazy_backfills_and_exposes_post_image_fit() -> None:
  class DB:
    def __init__(self) -> None:
      self.update_query = ""
      self.update_args: tuple = ()

    async def fetch(self, query: str, *args):
      assert "attempt_count" in query
      assert args == (REPORT_ID,)
      return [{
        "look_id": "anchor",
        "role": "anchor",
        "status": "completed",
        "image_url": "https://cdn.example.com/anchor.webp",
        "image_error": None,
        "storage_bucket": "assets",
        "object_key": "anchor.webp",
        "content_type": "image/webp",
        "is_private": False,
        "input_media_id": None,
        "model_id": "gpt-image-2",
        "prompt_version": "makeup-image-v2",
        "attempt_count": 4,
        "provenance": {
          "width": 1024,
          "height": 1024,
          "cropMetadata": _crop_metadata(),
        },
      }]

    async def fetchrow(self, query: str, *args):
      self.update_query = query
      self.update_args = args
      return {"id": REPORT_ID}

  report = {
    "id": REPORT_ID,
    "schema_version": "makeup-recommendation-v2",
    "recommendation": {
      "generationSource": "claude",
      "contextSummary": ["면접"],
      "looks": [{
        "id": "anchor",
        "role": "anchor",
        "title": "면접 룩",
        "summary": "차분한 메이크업",
        "reasons": ["상황 적합"],
        "fitAssessment": _assessment(),
      }],
    },
    "context_snapshot": {},
  }
  db = DB()

  response = await makeup_api._recommendation_report_response(report, db=db)

  response_fit = response["recommendation"]["looks"][0]["fitAssessment"]
  assert response_fit["imageValidation"]["stage"] == "post_image"
  assert response_fit["imageValidation"]["generationAttempt"] == 4
  assert response_fit["imageValidation"]["validationSource"] == "generated_face_metadata"
  assert "MediaPipe 얼굴 부위 검출" in response_fit["evidence"][-1]["label"]
  assert "asset.status = 'completed'" in db.update_query
  assert "asset.attempt_count = $3" in db.update_query
  assert db.update_args[:3] == (REPORT_ID, "anchor", 4)
  saved_fit = json.loads(db.update_args[3])
  assert saved_fit["overallScore"] == response_fit["overallScore"]
