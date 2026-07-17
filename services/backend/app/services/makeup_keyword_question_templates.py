"""Reviewed reverse-question templates for curated makeup situation keywords.

Curated keywords must feel instant and predictable at runtime.  The approved
copy below is therefore both the database seed source and a repository fallback
while a deployment is rolling out the table migration.  Custom situations and
unreviewed trend keywords remain outside this module and may use the runtime AI
question path.
"""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from app.schemas.makeup_recommendation import GeneratedQuestions


logger = logging.getLogger(__name__)

QUESTION_TEMPLATE_VERSION = 1
QUESTION_TEMPLATE_PROMPT_VERSION = "makeup-keyword-questions-reviewed-v1"


def _option(option_id: str, label: str) -> dict[str, str]:
  return {"id": option_id, "label": label}


def _question(
  question_id: str,
  title: str,
  first: tuple[str, str],
  second: tuple[str, str],
  third: tuple[str, str],
) -> dict[str, Any]:
  return {
    "id": question_id,
    "title": title,
    "options": [
      _option(*first),
      _option(*second),
      _option(*third),
      _option("ai_pick", "AI가 골라줘"),
    ],
  }


PREP_TIME_QUESTION = _question(
  "prep_time",
  "메이크업에 어느 정도 시간을 쓸 수 있나요?",
  ("quick_15", "15분 안에 핵심만"),
  ("standard_30", "30분 정도 꼼꼼하게"),
  ("detail_60_plus", "60분 이상 디테일까지"),
)


_CONTEXT_QUESTIONS: dict[str, dict[str, Any]] = {
  "출근·등교": _question(
    "daily_priority",
    "오늘 일정에서 가장 중요한 순간은 언제예요?",
    ("arrival", "도착했을 때 첫인상"),
    ("all_day", "하루 종일 편안한 상태"),
    ("after_hours", "퇴근·하교 뒤 약속까지"),
  ),
  "카페·브런치": _question(
    "cafe_plan",
    "카페나 브런치에서 어떤 시간을 보낼 예정인가요?",
    ("conversation", "편안하게 대화하기"),
    ("photo", "사진과 기록을 많이 남기기"),
    ("outing", "식사 뒤 야외 일정까지"),
  ),
  "가벼운 약속": _question(
    "casual_meeting_impression",
    "가벼운 약속에서 어떤 인상으로 보이고 싶나요?",
    ("comfortable", "꾸민 듯 안 꾸민 듯 편안하게"),
    ("polished", "부담 없이 단정하게"),
    ("point", "한 군데만 은근히 포인트"),
  ),
  "퇴근 후 약속": _question(
    "after_work_touchup",
    "약속 전에 메이크업을 손볼 여유가 어느 정도인가요?",
    ("none", "바로 이동해서 거의 없어요"),
    ("quick", "잠깐 수정할 수 있어요"),
    ("redo", "충분히 다시 정돈할 수 있어요"),
  ),
  "주말 나들이": _question(
    "weekend_route",
    "주말 나들이 동선은 어디에 가까워요?",
    ("indoor", "실내 공간 위주"),
    ("outdoor", "햇빛 받는 야외 위주"),
    ("mixed", "실내와 야외를 모두 이동"),
  ),
  "소개팅·데이트": _question(
    "date_impression",
    "상대에게 어떤 첫인상을 남기고 싶나요?",
    ("friendly", "편안하고 다정하게"),
    ("confident", "또렷하고 자신감 있게"),
    ("chic", "세련되고 살짝 거리감 있게"),
  ),
  "결혼식 하객": _question(
    "wedding_setting",
    "참석할 예식은 어떤 분위기에 가까워요?",
    ("day_indoor", "밝은 낮 실내 예식"),
    ("outdoor", "자연광이 있는 야외 예식"),
    ("evening_hotel", "조명이 깊은 저녁·호텔 예식"),
  ),
  "면접·중요한 발표": _question(
    "formal_stage",
    "가장 중요한 장면은 어디에서 진행되나요?",
    ("in_person", "가까이 마주 보는 대면 자리"),
    ("stage", "거리가 있는 발표 공간"),
    ("video", "화면으로 보이는 화상 자리"),
  ),
  "기념일·생일": _question(
    "celebration_moment",
    "기념일에서 가장 오래 남길 순간은 무엇인가요?",
    ("dinner", "분위기 있는 식사와 대화"),
    ("photo", "사진을 많이 남기는 시간"),
    ("all_day", "낮부터 밤까지 이어지는 일정"),
  ),
  "졸업식·가족 행사": _question(
    "family_event_setting",
    "행사의 중심 장면은 어디에 가까워요?",
    ("ceremony", "실내 공식 행사"),
    ("outdoor_photo", "야외 단체 사진"),
    ("gathering", "가족과 가까이 마주하는 모임"),
  ),
  "증명사진": _question(
    "id_photo_use",
    "증명사진은 어디에 사용할 예정인가요?",
    ("official", "신분증·여권 같은 공식 서류"),
    ("career", "이력서·지원서"),
    ("school", "학생증·학교 제출용"),
  ),
  "프로필 촬영": _question(
    "profile_purpose",
    "프로필 사진으로 어떤 모습을 보여주고 싶나요?",
    ("business", "신뢰감 있는 업무 프로필"),
    ("personal", "나답고 친근한 개인 프로필"),
    ("creative", "개성이 드러나는 창작 프로필"),
  ),
  "SNS 셀카": _question(
    "selfie_light",
    "셀카를 가장 많이 찍을 조명은 무엇인가요?",
    ("daylight", "창가나 야외 자연광"),
    ("indoor", "카페·실내 조명"),
    ("night", "플래시나 야간 조명"),
  ),
  "영상·라이브": _question(
    "video_format",
    "영상에서는 어떤 방식으로 가장 많이 보이나요?",
    ("closeup", "얼굴 중심의 가까운 화면"),
    ("movement", "움직임이 많은 전신·반신 화면"),
    ("long_live", "오래 이어지는 라이브 화면"),
  ),
  "야구장 전광판": _question(
    "stadium_timing",
    "야구장에서 가장 기대하는 시간대는 언제예요?",
    ("day", "햇빛이 강한 낮 경기"),
    ("sunset", "자연광이 바뀌는 오후 경기"),
    ("night", "조명과 전광판이 밝은 밤 경기"),
  ),
  "콘서트·페스티벌": _question(
    "festival_environment",
    "공연을 즐길 환경은 어디에 가까워요?",
    ("indoor", "조명이 강한 실내 공연"),
    ("outdoor", "햇빛과 바람이 있는 야외 축제"),
    ("all_day", "낮부터 밤까지 이어지는 일정"),
  ),
  "클럽·야간 파티": _question(
    "night_party_light",
    "파티에서 가장 많이 마주할 빛은 무엇인가요?",
    ("dark", "어두운 실내 조명"),
    ("neon", "컬러 네온과 무빙 라이트"),
    ("flash", "플래시 사진과 영상"),
  ),
  "테마 파티·코스프레": _question(
    "theme_expression",
    "테마를 어느 정도까지 표현하고 싶나요?",
    ("subtle", "평소 룩에 힌트만 더하기"),
    ("inspired", "캐릭터 특징을 알아볼 만큼"),
    ("full", "의상과 어울리게 확실히 표현"),
  ),
  "무대 공연": _question(
    "stage_view",
    "메이크업이 가장 잘 보여야 하는 거리는 어디인가요?",
    ("audience", "멀리 있는 객석"),
    ("camera", "가까이 잡히는 카메라"),
    ("both", "객석과 카메라 모두"),
  ),
  "패션 행사·전시 오프닝": _question(
    "fashion_event_role",
    "행사에서 어떤 시간을 가장 많이 보내나요?",
    ("viewing", "작품과 공간을 둘러보기"),
    ("networking", "사람들과 가까이 대화하기"),
    ("photo", "포토월과 기록 남기기"),
  ),
}


def _validated_template(context_question: dict[str, Any]) -> list[dict[str, Any]]:
  payload = GeneratedQuestions.model_validate(
    {"questions": [context_question, PREP_TIME_QUESTION]},
  )
  return payload.model_dump(by_alias=True)["questions"]


CURATED_KEYWORD_QUESTION_TEMPLATES: dict[str, list[dict[str, Any]]] = {
  label: _validated_template(context_question)
  for label, context_question in _CONTEXT_QUESTIONS.items()
}


def reviewed_repository_template(keyword_label: str) -> dict[str, Any] | None:
  """Return a validated copy of a repository-reviewed keyword template."""
  questions = CURATED_KEYWORD_QUESTION_TEMPLATES.get(keyword_label.strip())
  if questions is None:
    return None
  validated = GeneratedQuestions.model_validate({"questions": questions})
  return {
    "questions": validated.model_dump(by_alias=True)["questions"],
    "source": "reviewed_keyword_template",
    "version": f"{QUESTION_TEMPLATE_PROMPT_VERSION}:{QUESTION_TEMPLATE_VERSION}",
  }


def _sql_literal(value: str) -> str:
  return "'" + value.replace("'", "''") + "'"


def _seed_values_sql() -> str:
  rows: list[str] = []
  for keyword_label, questions in CURATED_KEYWORD_QUESTION_TEMPLATES.items():
    encoded_questions = json.dumps(questions, ensure_ascii=False, separators=(",", ":"))
    rows.append(
      "(" + ", ".join(
        (
          _sql_literal(keyword_label),
          str(QUESTION_TEMPLATE_VERSION),
          _sql_literal(encoded_questions) + "::jsonb",
        ),
      ) + ")",
    )
  return ",\n    ".join(rows)


MAKEUP_KEYWORD_QUESTION_TEMPLATE_SCHEMA_SQL = f"""
create table if not exists makeup_keyword_question_templates (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references makeup_scenario_library(id) on delete cascade,
  template_version integer not null,
  locale text not null default 'ko-KR',
  questions jsonb not null,
  source text not null default 'curated',
  model_id text,
  prompt_version text not null,
  review_status text not null default 'draft',
  status text not null default 'active',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (keyword_id, template_version),
  constraint chk_makeup_keyword_question_templates_version check (template_version > 0),
  constraint chk_makeup_keyword_question_templates_questions check (
    jsonb_typeof(questions) = 'array'
    and jsonb_array_length(questions) between 1 and 3
  ),
  constraint chk_makeup_keyword_question_templates_source check (source in ('curated', 'ai_generated')),
  constraint chk_makeup_keyword_question_templates_review check (review_status in ('draft', 'approved', 'rejected')),
  constraint chk_makeup_keyword_question_templates_status check (status in ('active', 'retired')),
  constraint chk_makeup_keyword_question_templates_reviewed_at check (
    review_status <> 'approved' or reviewed_at is not null
  )
);
create unique index if not exists uq_makeup_keyword_question_templates_active_reviewed
  on makeup_keyword_question_templates (keyword_id)
  where status = 'active' and review_status = 'approved';
create index if not exists idx_makeup_keyword_question_templates_lookup
  on makeup_keyword_question_templates
  (keyword_id, locale, status, review_status, template_version desc);

with template_seed(keyword_text, template_version, questions) as (
  values
    {_seed_values_sql()}
), resolved_seed as (
  select template_seed.*, keyword.id as keyword_id
  from template_seed
  join lateral (
    select candidate.id
    from makeup_scenario_library candidate
    where candidate.normalized_text = template_seed.keyword_text
      and candidate.locale = 'ko-KR'
      and candidate.status = 'active'
      and candidate.review_status = 'approved'
    order by (candidate.prompt_version = 'makeup-keyword-seed-v2') desc,
             candidate.created_at,
             candidate.id
    limit 1
  ) keyword on true
)
insert into makeup_keyword_question_templates as current
  (keyword_id, template_version, locale, questions, source, model_id,
   prompt_version, review_status, status, reviewed_at)
select keyword_id, template_version, 'ko-KR', questions, 'curated', null,
       '{QUESTION_TEMPLATE_PROMPT_VERSION}', 'approved', 'active', now()
from resolved_seed
where not exists (
  select 1
  from makeup_keyword_question_templates approved
  where approved.keyword_id = resolved_seed.keyword_id
    and approved.status = 'active'
    and approved.review_status = 'approved'
)
on conflict (keyword_id, template_version) do nothing;

drop trigger if exists trg_makeup_keyword_question_templates_updated_at
  on makeup_keyword_question_templates;
create trigger trg_makeup_keyword_question_templates_updated_at
before update on makeup_keyword_question_templates
for each row execute function set_updated_at();
"""


async def fetch_reviewed_keyword_template(
  db: Any,
  keyword_id: UUID | str,
  *,
  locale: str = "ko-KR",
) -> dict[str, Any] | None:
  """Load and contract-validate the current approved database template."""
  try:
    normalized_keyword_id = (
      keyword_id if isinstance(keyword_id, UUID) else UUID(str(keyword_id))
    )
  except (TypeError, ValueError, AttributeError):
    return None
  row = await db.fetchrow(
    """
    select id, template_version, questions, prompt_version
    from makeup_keyword_question_templates
    where keyword_id = $1
      and locale = $2
      and status = 'active'
      and review_status = 'approved'
    order by template_version desc
    limit 1
    """,
    normalized_keyword_id,
    locale,
  )
  if row is None:
    return None

  try:
    raw_questions = row.get("questions")
    if isinstance(raw_questions, str):
      raw_questions = json.loads(raw_questions)
    validated = GeneratedQuestions.model_validate({"questions": raw_questions})
  except (json.JSONDecodeError, TypeError, ValueError):
    logger.warning(
      "[aura:makeup-recommendation] reviewed-keyword-template:invalid templateId=%s keywordId=%s",
      row.get("id"),
      keyword_id,
      exc_info=True,
    )
    return None

  template_version = int(row.get("template_version") or QUESTION_TEMPLATE_VERSION)
  prompt_version = str(row.get("prompt_version") or QUESTION_TEMPLATE_PROMPT_VERSION)
  return {
    "questions": validated.model_dump(by_alias=True)["questions"],
    "source": "reviewed_keyword_template",
    "version": f"{prompt_version}:{template_version}",
  }


async def resolve_reviewed_keyword_questions(
  db: Any,
  keyword: dict[str, Any],
) -> dict[str, Any] | None:
  """Resolve DB-approved copy, falling back only to the same reviewed repo copy."""
  keyword_id = keyword.get("id")
  keyword_label = str(keyword.get("label") or "").strip()
  if not keyword_id:
    return None
  try:
    normalized_keyword_id = UUID(str(keyword_id))
  except (TypeError, ValueError, AttributeError):
    return None
  try:
    return await fetch_reviewed_keyword_template(db, normalized_keyword_id)
  except Exception:
    logger.warning(
      "[aura:makeup-recommendation] reviewed-keyword-template:lookup-fallback keywordId=%s",
      normalized_keyword_id,
      exc_info=True,
    )
    return reviewed_repository_template(keyword_label)
