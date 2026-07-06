from uuid import UUID

import pytest
from app.api import analysis as analysis_api
from app.services import embeddings as embeddings_service
from app.core.settings import Settings
from app.services.embeddings import (
  embed_text,
  embedding_match_percent,
  format_pgvector,
  report_embedding_text,
  thread_embedding_text,
)


class RecordLike:
  def __init__(self, values: dict) -> None:
    self.values = values

  def __getitem__(self, key: str):
    return self.values[key]

  def get(self, key: str, default=None):
    return self.values.get(key, default)

def test_embed_text_skips_without_bedrock_credentials() -> None:
  assert embed_text("glow base", Settings(aws_access_key_id=None, aws_secret_access_key=None, aws_use_iam_role=False)) is None




def test_embed_text_uses_bedrock_embedding(monkeypatch) -> None:
  monkeypatch.setattr(embeddings_service, "_bedrock_embedding_client", lambda _settings: object())
  monkeypatch.setattr(
    embeddings_service,
    "_invoke_bedrock_text_embedding",
    lambda _client, _settings, _text: [0.1] * 1024,
  )

  embedding = embed_text(
    "glow base",
    Settings(aws_access_key_id="AKIAEXAMPLE", aws_secret_access_key="secret"),
  )

  assert embedding is not None
  assert len(embedding) == 1024

def test_thread_embedding_text_includes_tags_products_and_body() -> None:
  text = thread_embedding_text(
    {
      "title": "glass base",
      "body": "soft wet glow",
      "mood_tags": ["glow"],
      "situation_tags": ["daily"],
      "product_usage": {"base": [{"name": "tone cushion", "shade": "01"}]},
    },
  )

  assert "glass base" in text
  assert "glow" in text
  assert "daily" in text
  assert "tone cushion 01" in text
  assert "soft wet glow" in text


def test_report_embedding_text_reads_record_like_rows() -> None:
  text = report_embedding_text(
    RecordLike(
      {
        "personal_color": "warm spring",
        "skin_type": "oily",
        "recommended_mood": "clear coral",
        "tone_summary": "bright warm",
        "tags": ["fresh"],
      },
    ),
  )

  assert "warm spring" in text
  assert "oily" in text
  assert "clear coral" in text
  assert "fresh" in text

def test_report_embedding_text_includes_report_profile() -> None:
  text = report_embedding_text(
    {
      "personal_color": "cool summer",
      "skin_type": "dry",
      "recommended_mood": "watery glow",
      "tone_summary": "clear pink tone",
      "tags": ["moist"],
    },
  )

  assert "cool summer" in text
  assert "dry" in text
  assert "watery glow" in text
  assert "clear pink tone" in text
  assert "moist" in text


def test_embedding_match_percent_is_calibrated() -> None:
  assert embedding_match_percent(0.18) == 0
  assert embedding_match_percent(0.365) == 50
  assert embedding_match_percent(0.55) == 100


def test_format_pgvector_formats_float_list() -> None:
  assert format_pgvector([0.1, -0.25]) == "[0.10000000,-0.25000000]"

class ReportEmbeddingDatabase:
  def __init__(self) -> None:
    self.embedding_updates: list[tuple] = []

  async def execute(self, query: str, *args):
    if "update analysis_reports set embedding" not in query:
      raise AssertionError(f"Unexpected execute query: {query}")

    self.embedding_updates.append(args)
    return "UPDATE 1"


@pytest.mark.asyncio
async def test_update_analysis_report_embedding_writes_pgvector(monkeypatch) -> None:
  monkeypatch.setattr(analysis_api, "embed_text", lambda _text: [0.2] * 1024)
  db = ReportEmbeddingDatabase()
  report_id = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")

  updated = await analysis_api.update_analysis_report_embedding(
    db,
    {
      "id": report_id,
      "personal_color": "cool summer",
      "skin_type": "dry",
      "recommended_mood": "glow",
      "tone_summary": "pink clear",
      "tags": ["moist"],
    },
  )

  assert updated is True
  assert db.embedding_updates[0][0] == report_id
  assert db.embedding_updates[0][1].startswith("[0.20000000")


@pytest.mark.asyncio
async def test_update_analysis_report_embedding_skips_without_embedding(monkeypatch) -> None:
  monkeypatch.setattr(analysis_api, "embed_text", lambda _text: None)
  db = ReportEmbeddingDatabase()

  updated = await analysis_api.update_analysis_report_embedding(
    db,
    {"id": UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), "personal_color": "cool"},
  )

  assert updated is False
  assert db.embedding_updates == []