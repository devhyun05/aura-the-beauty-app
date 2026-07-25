import base64
import json
from io import BytesIO
from pathlib import Path
from uuid import UUID

import pytest
from PIL import Image as PillowImage
from pydantic import ValidationError

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.check_schema import EXPECTED_COLUMNS, EXPECTED_TABLES, build_schema_report
from app.services import makeup_recommendation_image
from app.services.ai_job_queue import AIJobQueuePublisher
from app.services.makeup_recommendation_image import (
  GeneratedRecommendationAsset,
  PersonalizedImageInput,
  _validate_and_normalize_output,
  generate_recommendation_asset,
  generate_recommendation_images,
)
from app.services.makeup_recommendation_schema import MAKEUP_RECOMMENDATION_SCHEMA_SQL
from app.workers import job_dispatcher
from app.workers.job_dispatcher import (
  AIJobDispatcher,
  AIJobMessageParseError,
  parse_ai_job_message,
)


PROJECT_ROOT = Path(__file__).resolve().parents[3]
REPORT_ID = UUID("22222222-2222-2222-2222-222222222222")
USER_ID = UUID("11111111-1111-1111-1111-111111111111")
OTHER_USER_ID = UUID("33333333-3333-3333-3333-333333333333")
MEDIA_ID = UUID("44444444-4444-4444-4444-444444444444")


def _encoded_test_image(size: tuple[int, int] = (640, 320), image_format: str = "PNG") -> str:
  buffer = BytesIO()
  PillowImage.new("RGB", size, (180, 120, 100)).save(buffer, format=image_format)
  return base64.b64encode(buffer.getvalue()).decode()


def _complete_crop_metadata() -> dict:
  box = {"left": 0.2, "top": 0.2, "right": 0.8, "bottom": 0.8}
  area_counts = {"base": 1, "brow": 2, "eye": 2, "cheek": 2, "lip": 1}
  return {
    "version": "makeup-face-crops-v1",
    "imageSize": {"width": 128, "height": 128},
    "areas": {
      area: [
        {"regionId": f"{area}-{index}", "box": box}
        for index in range(count)
      ]
      for area, count in area_counts.items()
    },
  }


def test_personalized_face_metadata_retries_generated_crop_detection(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  crop_metadata = _complete_crop_metadata()
  monkeypatch.setattr(
    makeup_recommendation_image,
    "extract_personalized_makeup_face_metadata",
    lambda *_args: {},
  )
  monkeypatch.setattr(
    makeup_recommendation_image,
    "extract_makeup_face_crop_metadata",
    lambda _image_bytes: crop_metadata,
  )

  metadata = makeup_recommendation_image._extract_personalized_face_metadata(
    b"source",
    b"generated",
  )

  assert metadata["cropMetadata"] == crop_metadata


def test_personalized_face_metadata_rejects_missing_required_crops(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  monkeypatch.setattr(
    makeup_recommendation_image,
    "extract_personalized_makeup_face_metadata",
    lambda *_args: {},
  )
  monkeypatch.setattr(
    makeup_recommendation_image,
    "extract_makeup_face_crop_metadata",
    lambda _image_bytes: None,
  )

  with pytest.raises(AppError) as exc_info:
    makeup_recommendation_image._extract_personalized_face_metadata(
      b"source",
      b"generated",
    )

  assert exc_info.value.code == "MAKEUP_IMAGE_CROP_METADATA_MISSING"


def test_v2_schema_and_checker_cover_taxonomy_sessions_snapshots_and_assets() -> None:
  required_tables = {
    "makeup_situations",
    "makeup_situation_keywords",
    "makeup_recommendation_sessions",
    "makeup_recommendation_assets",
  }
  assert required_tables <= EXPECTED_TABLES
  assert EXPECTED_COLUMNS["makeup_recommendation_reports"] >= {
    "source_analysis_report_id",
    "session_id",
    "situation_id",
    "keyword_id",
    "context_snapshot",
    "schema_version",
    "image_mode",
  }
  assert EXPECTED_COLUMNS["makeup_recommendation_assets"] >= {
    "storage_bucket",
    "object_key",
    "content_type",
    "is_private",
    "input_media_id",
    "provenance",
  }
  for table in required_tables:
    assert f"create table if not exists {table}" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "unique (user_id, idempotency_key)" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "on makeup_recommendation_reports (session_id);" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "where session_id is not null" not in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "chk_makeup_recommendation_assets_private_url" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "chk_makeup_recommendation_assets_provenance" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "unique (normalized_text)" not in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "uq_makeup_scenario_library_locale_scope" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "index_row.indnkeyatts = 1" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "index_row.indkey[0]" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "drop index if exists public.%I" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "on conflict (normalized_text, locale, (coalesce(market_scope, '')))" in MAKEUP_RECOMMENDATION_SCHEMA_SQL


def test_schema_checker_rejects_legacy_global_keyword_unique_index() -> None:
  report = build_schema_report(
    EXPECTED_TABLES,
    set(),
    indexes={
      "legacy_global_keyword_unique": (
        "CREATE UNIQUE INDEX legacy_global_keyword_unique "
        "ON public.makeup_scenario_library USING btree (normalized_text)"
      ),
    },
  )

  assert report["legacyGlobalUniqueIndexes"] == ["legacy_global_keyword_unique"]


def test_seed_ids_match_v2_fallback_uuid5_contract() -> None:
  assert "1f4f03a6-1e0e-51cd-8f2b-a7d5c61c8d66" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "3b815ca8-77ec-577c-8342-38554b0a59cf" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "36224560-13aa-5e42-b3af-3d45a20cf6a0" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "c4964d4c-76e2-5f73-8db8-7065658cb254" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "'makeup-keyword-seed-v2'" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "('daily', '출근·등교', 10)" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "('formal_event', '소개팅·데이트', 10)" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "('festival_performance', '패션 행사·전시 오프닝', 50)" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "('festival_performance', '로판 여주', 60)" in MAKEUP_RECOMMENDATION_SCHEMA_SQL
  assert "로맨스 판타지 작품의 여주인공처럼 연출하고 싶은 테마 촬영이나 코스프레 상황" in MAKEUP_RECOMMENDATION_SCHEMA_SQL


def test_schema_and_dbml_documents_are_synchronized_with_v2_contract() -> None:
  schema = (PROJECT_ROOT / "docs/backend/schema.sql").read_text(encoding="utf-8")
  dbml = (PROJECT_ROOT / "docs/backend/aws-postgresql-schema.dbml").read_text(encoding="utf-8")
  for token in (
    "makeup_situations",
    "makeup_situation_keywords",
    "makeup_recommendation_sessions",
    "makeup_recommendation_assets",
    "source_analysis_report_id",
    "context_snapshot",
    "is_private",
    "provenance",
  ):
    assert token in schema
    assert token in dbml
  assert "c4964d4c-76e2-5f73-8db8-7065658cb254" in schema
  assert "('festival_performance', '로판 여주', 60)" in schema
  assert (
    "로맨스 판타지 작품의 여주인공처럼 연출하고 싶은 테마 촬영이나 코스프레 상황"
    in schema
  )


def test_production_v2_enforces_claude_text_and_gpt_image_2_boundary() -> None:
  assert Settings(environment="production").makeup_model_boundaries_configured is True
  with pytest.raises(ValidationError, match="Claude on Bedrock"):
    Settings(environment="production", ai_provider="openai")
  with pytest.raises(ValidationError, match="gpt-image-2"):
    Settings(environment="production", openai_image_model_id="gpt-image-1")
  with pytest.raises(ValidationError, match="gpt-image-2"):
    Settings(environment="production", image_generation_provider="bedrock")
  with pytest.raises(ValidationError, match="dedicated non-public S3 prefix"):
    Settings(makeup_private_asset_prefix="uploads/generated-makeup-recommendations/private")


def test_openai_image_defaults_use_balanced_high_resolution_portrait_contract() -> None:
  settings = Settings()
  assert settings.openai_image_model_id == "gpt-image-2"
  assert settings.openai_image_quality == "low"
  assert settings.openai_image_size == "1024x1536"
  assert settings.openai_image_output_compression == 90
  assert settings.openai_image_output_max_edge == 1536


def test_matching_provider_jpeg_is_not_lossy_reencoded() -> None:
  source = BytesIO()
  PillowImage.new("RGB", (1024, 1536), (182, 128, 108)).save(
    source,
    format="JPEG",
    quality=90,
  )
  content = source.getvalue()

  output = _validate_and_normalize_output(Settings(), content, "jpeg")

  assert output.content == content
  assert (output.width, output.height) == (1024, 1536)
  assert output.resized is False


@pytest.mark.asyncio
async def test_generic_gpt_image_2_generation_uses_matching_format_and_public_cache(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, dict] = {}
  uploaded: dict = {}
  crop_metadata = {
    "version": "makeup-face-crops-v1",
    "imageSize": {"width": 256, "height": 128},
    "areas": {"lip": [{"regionId": "lips", "box": {"left": 0.3, "top": 0.6, "right": 0.7, "bottom": 0.8}}]},
  }

  class FakeImages:
    def generate(self, **kwargs):
      calls["generate"] = kwargs
      return type(
        "Response",
        (),
        {"data": [type("Image", (), {"b64_json": _encoded_test_image()})()]},
      )()

    def edit(self, **kwargs):
      calls["edit"] = kwargs
      raise AssertionError("generic mode must not edit")

  class FakeOpenAI:
    def __init__(self, **_kwargs):
      self.images = FakeImages()

  class FakeS3:
    def put_object(self, **kwargs):
      uploaded.update(kwargs)

  monkeypatch.setattr("app.services.makeup_recommendation_image.OpenAI", FakeOpenAI)
  monkeypatch.setattr(
    "app.services.makeup_recommendation_image.extract_makeup_face_crop_metadata",
    lambda _image_bytes: crop_metadata,
  )
  monkeypatch.setattr("app.services.makeup_recommendation_image.boto3.client", lambda *_args, **_kwargs: FakeS3())

  asset = await generate_recommendation_asset(
    Settings(
      openai_api_key="test",
      s3_bucket_name="bucket",
      cdn_base_url="https://cdn.example.com",
      openai_image_output_format="jpeg",
      openai_image_output_max_edge=256,
    ),
    REPORT_ID,
    "데이트",
    {
      "title": "anchor",
      "imageBrief": "Soft editorial strawberry glow for a spring daytime look",
      "areaGuides": [
        {
          "area": "lip",
          "color": {"name": "Rose Milk", "hex": "#A85D68"},
          "texture": "soft satin",
        },
      ],
    },
    "1-anchor",
  )

  assert calls["generate"]["model"] == "gpt-image-2"
  assert calls["generate"]["quality"] == "low"
  assert calls["generate"]["size"] == "1024x1536"
  assert calls["generate"]["output_format"] == "jpeg"
  assert calls["generate"]["output_compression"] == 90
  assert "Soft editorial strawberry glow" in calls["generate"]["prompt"]
  assert "Rose Milk #A85D68" in calls["generate"]["prompt"]
  assert "texture soft satin" in calls["generate"]["prompt"]
  assert asset.image_url == f"https://cdn.example.com/{asset.object_key}"
  assert asset.object_key.endswith(".jpg")
  assert uploaded["ContentType"] == "image/jpeg"
  assert uploaded["CacheControl"] == "public, max-age=31536000, immutable"
  assert "ServerSideEncryption" not in uploaded
  with PillowImage.open(BytesIO(uploaded["Body"])) as stored:
    assert stored.format == "JPEG"
    assert stored.size == (256, 128)
  assert asset.provenance == {
    "prompt": calls["generate"]["prompt"],
    "modelId": "gpt-image-2",
    "promptVersion": "makeup-image-v2",
    "consentStatus": "not-required",
    "rightsStatus": "synthetic-reference",
    "sourceMediaId": None,
    "sourceFormat": "png",
    "outputFormat": "jpeg",
    "width": 256,
    "height": 128,
    "resized": True,
    "cropMetadata": crop_metadata,
  }
  assert uploaded["Metadata"] == {
    "image-model": "gpt-image-2",
    "image-prompt-version": "makeup-image-v2",
    "consent-status": "not-required",
    "rights-status": "synthetic-reference",
    "source-format": "png",
    "output-format": "jpeg",
    "output-width": "256",
    "output-height": "128",
  }


@pytest.mark.asyncio
async def test_openai_success_with_s3_failure_is_classified_as_storage_error(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class FakeImages:
    def generate(self, **_kwargs):
      return type(
        'Response',
        (),
        {'data': [type('Image', (), {'b64_json': _encoded_test_image()})()]},
      )()

  class FakeOpenAI:
    def __init__(self, **_kwargs):
      self.images = FakeImages()

  class FailingS3:
    def put_object(self, **_kwargs):
      raise RuntimeError('ExpiredToken: cached SSO credentials are stale')

  monkeypatch.setattr(
    'app.services.makeup_recommendation_image.OpenAI',
    FakeOpenAI,
  )
  monkeypatch.setattr(
    'app.services.makeup_recommendation_image.extract_makeup_face_crop_metadata',
    lambda _image_bytes: None,
  )
  monkeypatch.setattr(
    'app.services.makeup_recommendation_image.boto3.client',
    lambda *_args, **_kwargs: FailingS3(),
  )

  with pytest.raises(AppError) as exc_info:
    await generate_recommendation_asset(
      Settings(
        openai_api_key='test',
        s3_bucket_name='bucket',
        cdn_base_url='https://cdn.example.com',
      ),
      REPORT_ID,
      '데이트',
      {'title': 'anchor'},
      '1-anchor',
    )

  error = exc_info.value
  assert error.status_code == 503
  assert error.code == 'MAKEUP_IMAGE_STORAGE_FAILED'
  assert 'ExpiredToken' not in error.message
  assert 'SSO' not in error.message


@pytest.mark.asyncio
async def test_personalized_edit_requires_owned_consented_media_and_stays_private(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, dict] = {}
  uploaded: dict = {}
  face_metadata = {
    "cropMetadata": _complete_crop_metadata(),
    "alignmentMetadata": {
      "version": "makeup-face-alignment-v1",
      "source": {
        "imageSize": {"width": 900, "height": 1100},
        "faceBox": {"left": 0.2, "top": 0.1, "right": 0.8, "bottom": 0.9},
        "eyeCenters": {
          "imageLeft": {"x": 0.38, "y": 0.385},
          "imageRight": {"x": 0.62, "y": 0.385},
        },
        "rollDeg": 0.0,
      },
      "generated": {
        "imageSize": {"width": 128, "height": 128},
        "faceBox": {"left": 0.21, "top": 0.11, "right": 0.79, "bottom": 0.89},
        "eyeCenters": {
          "imageLeft": {"x": 0.39, "y": 0.39},
          "imageRight": {"x": 0.61, "y": 0.39},
        },
        "rollDeg": 0.0,
      },
    },
  }
  face_metadata_calls: dict[str, bytes] = {}


  class FakeImages:
    def generate(self, **_kwargs):
      raise AssertionError("personalized mode must not generate from text only")

    def edit(self, **kwargs):
      calls["edit"] = kwargs
      return type(
        "Response",
        (),
        {"data": [type("Image", (), {"b64_json": _encoded_test_image((128, 128))})()]},
      )()

  class FakeOpenAI:
    def __init__(self, **_kwargs):
      self.images = FakeImages()

  class FakeS3:
    def put_object(self, **kwargs):
      uploaded.update(kwargs)

  normalized = BytesIO(b"normalized")
  normalized.name = "owned-source.jpg"

  def fake_personalized_face_metadata(source_bytes: bytes, generated_bytes: bytes):
    face_metadata_calls["source"] = source_bytes
    face_metadata_calls["generated"] = generated_bytes
    return face_metadata

  monkeypatch.setattr("app.services.makeup_recommendation_image.OpenAI", FakeOpenAI)
  monkeypatch.setattr(
    "app.services.makeup_recommendation_image.extract_personalized_makeup_face_metadata",
    fake_personalized_face_metadata,
  )
  monkeypatch.setattr("app.services.makeup_recommendation_image.boto3.client", lambda *_args, **_kwargs: FakeS3())
  monkeypatch.setattr(
    "app.services.makeup_recommendation_image._normalize_source_image",
    lambda _settings, _source: normalized,
  )
  settings = Settings(openai_api_key="test", s3_bucket_name="private-bucket")
  source = PersonalizedImageInput(
    media_id=MEDIA_ID,
    owner_user_id=USER_ID,
    requested_user_id=USER_ID,
    content=b"owned",
    content_type="image/jpeg",
    consent=True,
  )

  asset = await generate_recommendation_asset(
    settings,
    REPORT_ID,
    "데이트",
    {
      "title": "anchor",
      "imageBrief": "A muted rose office makeup edit",
      "areaGuides": [
        {
          "area": "cheek",
          "color": {"name": "Dusty Rose", "hex": "#B76E79"},
          "texture": "sheer satin",
        },
      ],
    },
    "1-anchor",
    image_mode="personalized",
    source_image=source,
    profile_presentation="masculine",
  )

  assert calls["edit"]["model"] == "gpt-image-2"
  assert calls["edit"]["quality"] == "low"
  assert calls["edit"]["size"] == "1024x1536"
  assert "input_fidelity" not in calls["edit"]
  assert "A muted rose office makeup edit" in calls["edit"]["prompt"]
  assert "masculine makeup presentation" in calls["edit"]["prompt"]
  assert "do not infer gender" in calls["edit"]["prompt"]
  assert "Dusty Rose #B76E79" in calls["edit"]["prompt"]
  assert "Preserve the exact crop and framing" in calls["edit"]["prompt"]
  assert "do not zoom, reframe, recrop, rotate, or translate" in calls["edit"]["prompt"]
  assert asset.image_url is None
  assert asset.is_private is True
  assert asset.input_media_id == MEDIA_ID
  assert asset.object_key.startswith("private/generated-makeup-recommendations/")
  assert uploaded["CacheControl"] == "private, no-store"
  assert uploaded["ServerSideEncryption"] == "AES256"
  assert uploaded["Metadata"]["data-classification"] == "user-face-derived"
  assert asset.provenance["prompt"] == calls["edit"]["prompt"]
  assert asset.provenance["consentStatus"] == "explicit"
  assert asset.provenance["rightsStatus"] == "source-owner-verified"
  assert asset.provenance["sourceMediaId"] == str(MEDIA_ID)
  assert asset.provenance["sourceFormat"] == "png"
  assert asset.provenance["outputFormat"] == "jpeg"
  assert asset.provenance["cropMetadata"] == face_metadata["cropMetadata"]
  assert asset.provenance["alignmentMetadata"] == face_metadata["alignmentMetadata"]
  assert face_metadata_calls["source"] == b"owned"
  assert face_metadata_calls["generated"].startswith(b"\xff\xd8")
  assert "landmark" not in json.dumps(asset.provenance).lower()

  with pytest.raises(AppError, match="Explicit consent"):
    await generate_recommendation_asset(
      settings,
      REPORT_ID,
      "데이트",
      {},
      "no-consent",
      image_mode="personalized",
      source_image=PersonalizedImageInput(
        media_id=MEDIA_ID,
        owner_user_id=USER_ID,
        requested_user_id=USER_ID,
        content=b"owned",
        content_type="image/jpeg",
        consent=False,
      ),
    )
  with pytest.raises(AppError) as error:
    await generate_recommendation_asset(
      settings,
      REPORT_ID,
      "데이트",
      {},
      "wrong-owner",
      image_mode="personalized",
      source_image=PersonalizedImageInput(
        media_id=MEDIA_ID,
        owner_user_id=OTHER_USER_ID,
        requested_user_id=USER_ID,
        content=b"owned",
        content_type="image/jpeg",
        consent=True,
      ),
    )
  assert error.value.code == "MAKEUP_SOURCE_MEDIA_NOT_FOUND"


@pytest.mark.asyncio
async def test_single_image_generation_targets_anchor_and_preserves_result_order(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  generated_roles: list[str] = []

  async def fake_generate(
    _settings,
    _report_id,
    _scenario_text,
    recommendation,
    image_key,
    **_kwargs,
  ):
    generated_roles.append(recommendation["role"])
    return GeneratedRecommendationAsset(
      image_url=f"https://cdn.example.com/{image_key}.jpg",
      storage_bucket="bucket",
      object_key=f"generic/{image_key}.jpg",
      content_type="image/jpeg",
      is_private=False,
      input_media_id=None,
      model_id="gpt-image-2",
    )

  monkeypatch.setattr(
    "app.services.makeup_recommendation_image.generate_recommendation_asset",
    fake_generate,
  )
  looks = [
    {"id": "discovery", "role": "discovery"},
    {"id": "anchor", "role": "anchor"},
    {"id": "bold", "role": "bold"},
  ]
  generated = await generate_recommendation_images(
    Settings(),
    REPORT_ID,
    "촬영",
    looks,
    continue_on_error=True,
  )

  assert generated_roles == ["anchor"]
  assert [look["role"] for look in generated] == ["discovery", "anchor", "bold"]
  assert "imageStatus" not in generated[0]
  assert generated[1]["imageStatus"] == "completed"
  assert "imageStatus" not in generated[2]


def test_makeup_queue_uses_v2_nested_look_payload_and_worker_parses_it(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  sent: dict = {}

  class FakeSQS:
    def send_message(self, **kwargs):
      sent.update(kwargs)
      return {"MessageId": "makeup-v2"}

  monkeypatch.setattr("app.services.ai_job_queue.boto3.client", lambda *_args, **_kwargs: FakeSQS())
  result = AIJobQueuePublisher(
    Settings(sqs_ai_job_queue_url="https://sqs.example.com/jobs"),
  ).publish_makeup_recommendation_job(REPORT_ID, USER_ID, "anchor")

  body = json.loads(sent["MessageBody"])
  assert body == {
    "version": 2,
    "jobType": "makeup_recommendation",
    "jobId": str(REPORT_ID),
    "userId": str(USER_ID),
    "payload": {"lookId": "anchor"},
  }
  parsed = parse_ai_job_message(sent["MessageBody"])
  assert parsed.version == 2
  assert parsed.payload == {"lookId": "anchor"}
  assert result["messageId"] == "makeup-v2"

  body["jobType"] = "analysis"
  with pytest.raises(AIJobMessageParseError):
    parse_ai_job_message(json.dumps(body))


@pytest.mark.asyncio
async def test_worker_dispatches_v2_single_look_retry(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  called: dict = {}

  async def fake_run(report_id, user_id, settings, *, db, look_id=None):
    called.update(
      report_id=report_id,
      user_id=user_id,
      settings=settings,
      db=db,
      look_id=look_id,
    )

  monkeypatch.setattr(job_dispatcher, "run_recommendation_image_job", fake_run)
  settings = Settings()
  db = object()
  dispatcher = AIJobDispatcher(settings, db)  # type: ignore[arg-type]
  message = parse_ai_job_message(
    json.dumps(
      {
        "version": 2,
        "jobType": "makeup_recommendation",
        "jobId": str(REPORT_ID),
        "userId": str(USER_ID),
        "payload": {"lookId": "anchor"},
      },
    ),
  )
  await dispatcher.dispatch(message)

  assert called == {
    "report_id": REPORT_ID,
    "user_id": USER_ID,
    "settings": settings,
    "db": db,
    "look_id": "anchor",
  }
