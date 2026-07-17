import json
from pathlib import Path
from uuid import UUID

import pytest

from app.db.check_schema import EXPECTED_COLUMNS, EXPECTED_INDEX_CONTRACTS, EXPECTED_TABLES
from app.schemas.makeup_recommendation import GeneratedQuestions
from app.services.makeup_keyword_question_templates import (
  CURATED_KEYWORD_QUESTION_TEMPLATES,
  MAKEUP_KEYWORD_QUESTION_TEMPLATE_SCHEMA_SQL,
  QUESTION_TEMPLATE_PROMPT_VERSION,
  fetch_reviewed_keyword_template,
  resolve_reviewed_keyword_questions,
  reviewed_repository_template,
)
from app.services.makeup_recommendation_schema import MAKEUP_RECOMMENDATION_SCHEMA_SQL


PROJECT_ROOT = Path(__file__).resolve().parents[3]
KEYWORD_ID = UUID("da30ac53-acbd-5320-b23d-94a653541b24")


def test_all_curated_situation_keywords_have_contract_validated_questions() -> None:
  assert set(CURATED_KEYWORD_QUESTION_TEMPLATES) == {
    "출근·등교",
    "카페·브런치",
    "가벼운 약속",
    "퇴근 후 약속",
    "주말 나들이",
    "소개팅·데이트",
    "결혼식 하객",
    "면접·중요한 발표",
    "기념일·생일",
    "졸업식·가족 행사",
    "증명사진",
    "프로필 촬영",
    "SNS 셀카",
    "영상·라이브",
    "야구장 전광판",
    "콘서트·페스티벌",
    "클럽·야간 파티",
    "테마 파티·코스프레",
    "무대 공연",
    "패션 행사·전시 오프닝",
  }

  first_titles: set[str] = set()
  for questions in CURATED_KEYWORD_QUESTION_TEMPLATES.values():
    validated = GeneratedQuestions.model_validate({"questions": questions})
    assert len(validated.questions) == 2
    first_titles.add(validated.questions[0].title)
    prep_time = validated.questions[1]
    assert prep_time.id == "prep_time"
    assert [option.label for option in prep_time.options] == [
      "15분 안에 핵심만",
      "30분 정도 꼼꼼하게",
      "60분 이상 디테일까지",
      "AI가 골라줘",
    ]

  assert len(first_titles) == len(CURATED_KEYWORD_QUESTION_TEMPLATES)


def test_repository_template_returns_a_fresh_validated_copy() -> None:
  first = reviewed_repository_template("출근·등교")
  second = reviewed_repository_template("출근·등교")

  assert first is not None and second is not None
  assert first["source"] == "reviewed_keyword_template"
  assert first["version"].startswith(QUESTION_TEMPLATE_PROMPT_VERSION)
  first["questions"][0]["title"] = "changed by caller"
  assert second["questions"][0]["title"] != "changed by caller"
  assert reviewed_repository_template("등록되지 않은 키워드") is None


def test_template_schema_is_versioned_reviewed_and_in_runtime_schema() -> None:
  sql = MAKEUP_KEYWORD_QUESTION_TEMPLATE_SCHEMA_SQL
  assert "create table if not exists makeup_keyword_question_templates" in sql
  assert "unique (keyword_id, template_version)" in sql
  assert "review_status in ('draft', 'approved', 'rejected')" in sql
  assert "uq_makeup_keyword_question_templates_active_reviewed" in sql
  assert "idx_makeup_keyword_question_templates_lookup" in sql
  assert "'출근·등교'" in sql
  assert "'패션 행사·전시 오프닝'" in sql
  assert "15분 안에 핵심만" in sql
  assert "60분 이상 디테일까지" in sql
  assert "on conflict (keyword_id, template_version) do nothing" in sql
  assert "do update set" not in sql
  assert sql in MAKEUP_RECOMMENDATION_SCHEMA_SQL

  assert "makeup_keyword_question_templates" in EXPECTED_TABLES
  assert EXPECTED_COLUMNS["makeup_keyword_question_templates"] >= {
    "keyword_id",
    "template_version",
    "questions",
    "prompt_version",
    "review_status",
    "reviewed_at",
  }
  assert "idx_makeup_keyword_question_templates_lookup" in EXPECTED_INDEX_CONTRACTS
  assert "uq_makeup_keyword_question_templates_active_reviewed" in EXPECTED_INDEX_CONTRACTS


def test_template_storage_is_documented_in_schema_and_dbml() -> None:
  schema = (PROJECT_ROOT / "docs/backend/schema.sql").read_text(encoding="utf-8")
  dbml = (PROJECT_ROOT / "docs/backend/aws-postgresql-schema.dbml").read_text(encoding="utf-8")

  assert "create table if not exists makeup_keyword_question_templates" in schema
  assert "'출근·등교'" in schema
  assert "60분 이상 디테일까지" in schema
  documented_start = schema.index("create table if not exists makeup_keyword_question_templates")
  documented_end = schema.index("create table if not exists makeup_scenario_generation_limits", documented_start)
  assert schema[documented_start:documented_end].strip() == MAKEUP_KEYWORD_QUESTION_TEMPLATE_SCHEMA_SQL.strip()
  assert "Table makeup_keyword_question_templates" in dbml
  assert "Ref: makeup_keyword_question_templates.keyword_id > makeup_scenario_library.id" in dbml


@pytest.mark.asyncio
async def test_fetch_reviewed_keyword_template_validates_db_copy() -> None:
  template = CURATED_KEYWORD_QUESTION_TEMPLATES["출근·등교"]

  class DB:
    async def fetchrow(self, query: str, *args):
      assert "review_status = 'approved'" in query
      assert args == (KEYWORD_ID, "ko-KR")
      return {
        "id": UUID("11111111-1111-1111-1111-111111111111"),
        "template_version": 3,
        "questions": json.dumps(template, ensure_ascii=False),
        "prompt_version": "reviewed-copy-v3",
      }

  result = await fetch_reviewed_keyword_template(DB(), KEYWORD_ID)

  assert result is not None
  assert result["source"] == "reviewed_keyword_template"
  assert result["version"] == "reviewed-copy-v3:3"
  assert result["questions"] == template


@pytest.mark.asyncio
async def test_resolver_uses_repository_reviewed_copy_during_db_rollout() -> None:
  class DB:
    async def fetchrow(self, _query: str, *_args):
      raise RuntimeError("relation does not exist during rolling deploy")

  result = await resolve_reviewed_keyword_questions(
    DB(),
    {"id": str(KEYWORD_ID), "label": "출근·등교"},
  )

  assert result is not None
  assert result["source"] == "reviewed_keyword_template"
  assert result["questions"] == CURATED_KEYWORD_QUESTION_TEMPLATES["출근·등교"]


@pytest.mark.asyncio
async def test_resolver_does_not_claim_unknown_keyword_is_reviewed() -> None:
  class DB:
    async def fetchrow(self, _query: str, *_args):
      return None

  result = await resolve_reviewed_keyword_questions(
    DB(),
    {"id": "22222222-2222-2222-2222-222222222222", "label": "새 실시간 트렌드"},
  )

  assert result is None


@pytest.mark.asyncio
async def test_resolver_respects_missing_or_rejected_database_review() -> None:
  class DB:
    async def fetchrow(self, _query: str, *_args):
      return None

  result = await resolve_reviewed_keyword_questions(
    DB(),
    {"id": str(KEYWORD_ID), "label": "출근·등교"},
  )

  assert result is None

@pytest.mark.asyncio
async def test_resolver_normalizes_string_uuid_and_skips_invalid_keyword_id() -> None:
  calls: list[tuple] = []

  class DB:
    async def fetchrow(self, _query: str, *args):
      calls.append(args)
      return None

  await resolve_reviewed_keyword_questions(
    DB(),
    {"id": str(KEYWORD_ID), "label": "새 실시간 트렌드"},
  )
  assert calls == [(KEYWORD_ID, "ko-KR")]

  calls.clear()
  result = await resolve_reviewed_keyword_questions(
    DB(),
    {"id": "not-a-uuid", "label": "새 실시간 트렌드"},
  )
  assert result is None
  assert calls == []