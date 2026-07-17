import asyncio
from difflib import SequenceMatcher
from hashlib import sha256
import json
import logging
import re
import time
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, ReadTimeoutError
from pydantic import ValidationError

from app.core.errors import AppError
from app.core.settings import Settings
from app.schemas.makeup_recommendation import (
  GeneratedMakeupRecommendation,
  GeneratedMakeupRecommendationV2,
  GeneratedQuestions,
  NormalizedCustomSituation,
)
from app.services.makeup_ai_observability import emit_ai_metric
from app.services.makeup_recommendation_prompt import (
  CUSTOM_NORMALIZATION_SYSTEM_PROMPT,
  QUESTION_V2_SYSTEM_PROMPT,
  RECOMMENDATION_V2_SYSTEM_PROMPT,
  build_custom_normalization_prompt,
  build_question_prompt,
  build_recommendation_prompt,
)


logger = logging.getLogger(__name__)

BEDROCK_CONVERSE_CONFIG = Config(
  read_timeout=50,
  connect_timeout=10,
  retries={"max_attempts": 1, "mode": "standard"},
)


QUESTION_SYSTEM_PROMPT = """너는 사용자가 직접 메이크업을 설계하게 만드는 설문지가 아니라, 사용자가 원하는 장면과 캐릭터를 발견하도록 돕는 재치 있는 에디토리얼 디렉터다.

질문의 목적은 색상, 제품, 제형, 아이라인 형태 같은 메이크업 사양을 사용자에게 결정시키는 것이 아니다. 사용자는 원하는 서사만 고르고, 구체적인 메이크업 방법은 AI가 나중에 스스로 설계해야 한다.

다음 네 가지 큰 방향에서, 선택한 카드에 이미 답이 없는 것만 골라 보통 1~2개, 최대 3개의 질문을 만든다.
- 어디에서 어떻게 보이고 싶은지
- 어떤 분위기가 끌리는지
- 평소보다 얼마나 과감해지고 싶은지
- 시간과 난이도를 어느 정도 감수할지

질문 규칙:
- 선택한 카드의 설정을 이어 다음 장면을 고르는 느낌이 들게 한다. 분류표나 피부 문진표가 아니라 짧은 인터뷰처럼 재미있어야 한다.
- 각 질문의 선택지 세 개는 단 하나의 의미 기준을 공유하고 서로 배타적이어야 한다. 사용자가 두 선택지에 동시에 해당하지 않게 한다.
- 선택지는 구체적인 장면, 태도, 캐릭터 또는 변화 폭을 짧고 생생하게 쓴다.
- 답에 따라 최종 추천 세 가지의 콘셉트와 서사가 크게 달라져야 한다.
- 색상, 질감, 강조 부위, 제품 종류, 도구와 테크닉을 직접 고르게 하지 않는다.
- '워터프루프 아이라이너 + 롱래스팅 섀도우'처럼 완성 레시피를 선택지로 제시하지 않는다.
- '입술 색상은 어떤 톤'처럼 사용자가 컬러 디렉터 역할을 하게 만들지 않는다.
- 피부톤, 피부 밝기, 언더톤, 퍼스널컬러, 얼굴형, 피부 고민을 묻지 않는다. 이것은 추천을 설계할 AI의 일이다.
- '밝은 톤/중간 톤/어두운 톤/쿨 톤/웜 톤'은 밝기와 언더톤이라는 다른 기준을 섞은 금지 예시다.
- 선택한 카드 문구와 내부 의도에 이미 드러난 상황은 반복해서 묻지 않는다.
- 자연스럽게/은은하게/부드럽게처럼 의미가 겹치는 선택지를 함께 쓰지 않는다.
- '어떤 톤이 좋아요?', '어디를 강조할까요?' 같은 예측 가능한 메이크업 설문을 금지한다.
- 성별, 나이, 외모 결점, 피부색의 우열을 추정하거나 암시하지 않는다.
- 질문은 짧고 자연스러운 한국어 존댓말로 쓴다.
- 선택지는 질문당 정확히 4개다. 서로 배타적인 서사 선택지 3개 다음, 마지막은 반드시 {\"id\":\"ai_pick\",\"label\":\"AI가 골라줘\"}다.
- id는 고유한 영문 snake_case로 쓴다.

좋은 질문 예시:
- 어디에서 어떻게 보이고 싶어요?
- 어떤 분위기가 끌리나요?
- 평소보다 얼마나 과감해질까요?
- 오늘은 어느 정도 공들일 수 있어요?

재미있는 선택지 예시:
- 오늘의 반전은 어느 쪽이에요? / '조용히 시선 끌기', '등장부터 장면 만들기', '돌아선 뒤 여운 남기기'
- 사진 속 나는 어떤 인물이었으면 해요? / '여유 있는 주인공', '조용한 신스틸러', '우연히 잡힌 슈퍼스타'

설명이나 마크다운 없이 유효한 JSON 객체만 반환한다."""


SCENARIO_COPY_EXAMPLES = (
  "공항 출국 레전드",
  "점 하나 찍고 컴백",
  "증명사진 잘 나오기",
  "나다운 프로필 사진",
  "성수동 느좋 감성",
  "출근길에 번따",
  "내 얼굴에 서사 한 방울",
  "밤샘의 흔적만 지우고 출근",
  "첫 출근인데 이미 에이스",
  "약속 없이도 특별한 기분",
)
SCENARIO_GENERIC_WORDS = ("메이크업", "스타일", "분위기", "느낌", "감성", "무드", "사진", "오늘", "하루", "룩")
SCENARIO_UNSAFE_PATTERNS = (
  "못생",
  "추한",
  "추해",
  "뚱뚱",
  "살빼",
  "하얗게바꿔",
  "얼굴을작게",
  "성형",
  "남자답",
  "여자답",
  "여신",
  "남신",
  "인종",
  "민족",
  "장애",
  "효과보장",
  "반드시예뻐",
)


def _scenario_copy_key(text: str) -> str:
  normalized = text.casefold()
  for word in SCENARIO_GENERIC_WORDS:
    normalized = normalized.replace(word, "")
  return re.sub(r"[^0-9a-z가-힣]", "", normalized)


def _scenario_copy_is_similar(left: str, right: str) -> bool:
  raw_left = re.sub(r"[^0-9a-z가-힣]", "", left.casefold())
  raw_right = re.sub(r"[^0-9a-z가-힣]", "", right.casefold())
  if raw_left and raw_left == raw_right:
    return True
  left_key = _scenario_copy_key(left)
  right_key = _scenario_copy_key(right)
  if not left_key or not right_key:
    return False
  if left_key == right_key:
    return True
  shorter, longer = sorted((left_key, right_key), key=len)
  if len(shorter) >= 4 and shorter in longer:
    return True
  return SequenceMatcher(None, left_key, right_key).ratio() >= 0.78


def _scenario_copy_is_safe(text: str, seed_prompt: str, tags: list[Any] | None = None) -> bool:
  combined = "".join([text, seed_prompt, *[str(tag) for tag in tags or []]]).casefold()
  normalized = re.sub(r"\s+", "", combined)
  return not any(pattern in normalized for pattern in SCENARIO_UNSAFE_PATTERNS)


def apply_refinement_contract(
  previous: dict[str, Any],
  generated: dict[str, Any],
  refinement: str,
) -> dict[str, Any]:
  image_fields = {"imageUrl", "imageAsset", "imageStatus", "imageError"}
  generated_looks = generated.get("looks") if isinstance(generated.get("looks"), list) else []
  clean_generated = [
    {key: value for key, value in look.items() if key not in image_fields}
    for look in generated_looks
    if isinstance(look, dict)
  ]
  if refinement != "replaceProducts":
    return {**generated, "looks": clean_generated}

  previous_looks = previous.get("looks") if isinstance(previous.get("looks"), list) else []
  generated_by_role = {look.get("role"): look for look in clean_generated}
  merged = []
  for previous_look in previous_looks:
    if not isinstance(previous_look, dict):
      continue
    replacement = generated_by_role.get(previous_look.get("role"), {})
    preserved = {
      key: value
      for key, value in previous_look.items()
      if key not in image_fields | {"products", "areaGuides"}
    }
    previous_guides = (
      previous_look.get("areaGuides")
      if isinstance(previous_look.get("areaGuides"), list)
      else []
    )
    replacement_guides = (
      replacement.get("areaGuides")
      if isinstance(replacement.get("areaGuides"), list)
      else []
    )
    replacement_by_area = {
      guide.get("area"): guide
      for guide in replacement_guides
      if isinstance(guide, dict)
    }
    merged_guides: list[dict[str, Any]] = []
    for previous_guide in previous_guides:
      if not isinstance(previous_guide, dict):
        continue
      guide_replacement = replacement_by_area.get(previous_guide.get("area"), {})
      guide_base = {
        key: value
        for key, value in previous_guide.items()
        if key not in {"products", "alternatives"}
      }
      merged_guides.append(
        {
          **guide_base,
          "products": guide_replacement.get("products", previous_guide.get("products", [])),
          "alternatives": guide_replacement.get(
            "alternatives",
            previous_guide.get("alternatives", []),
          ),
        },
      )
    merged.append(
      {
        **preserved,
        **({"areaGuides": merged_guides} if previous_guides else {}),
        "products": replacement.get("products", previous_look.get("products", [])),
      },
    )
  return {**generated, "looks": merged}

def _converse(settings: Settings, model_id: str, system: str, prompt: str, *, max_tokens: int = 3500) -> dict[str, Any]:
  client_kwargs = {"region_name": settings.aws_region, "config": BEDROCK_CONVERSE_CONFIG}
  if settings.aws_profile_name:
    client = boto3.Session(profile_name=settings.aws_profile_name).client("bedrock-runtime", **client_kwargs)
  else:
    client = boto3.client("bedrock-runtime", **client_kwargs)
  response = client.converse_stream(
    modelId=model_id,
    system=[{"text": system}],
    messages=[{"role": "user", "content": [{"text": prompt}]}],
    inferenceConfig={"maxTokens": max_tokens, "temperature": 0.35},
  )
  text = "".join(
    str(delta.get("text") or "")
    for event in response.get("stream", [])
    if isinstance(event, dict)
    if isinstance((content_delta := event.get("contentBlockDelta")), dict)
    if isinstance((delta := content_delta.get("delta")), dict)
  ).strip()
  if not text:
    output = response.get("output", {})
    message = output.get("message", {}) if isinstance(output, dict) else {}
    content = message.get("content", []) if isinstance(message, dict) else []
    text = "".join(
      str(item.get("text") or "") for item in content if isinstance(item, dict)
    ).strip()

  if text.startswith("```") and text.endswith("```"):
    first_newline = text.find("\n")
    text = text[first_newline + 1 : -3].strip() if first_newline >= 0 else text[3:-3].strip()
  start_idx = text.find("{")
  end_idx = text.rfind("}")
  if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
    text = text[start_idx : end_idx + 1]
  try:
    value = json.loads(text)
  except json.JSONDecodeError as exc:
    raise AppError(502, "BEDROCK_INVALID_JSON", "Bedrock returned an invalid recommendation response.") from exc
  if not isinstance(value, dict):
    raise AppError(502, "BEDROCK_INVALID_JSON", "Bedrock returned an invalid recommendation response.")
  return value


async def generate_json(
  settings: Settings,
  model_id: str,
  system: str,
  prompt: str,
  *,
  max_tokens: int = 3500,
) -> dict[str, Any]:
  started_at = time.perf_counter()
  try:
    if not model_id:
      raise AppError(503, "BEDROCK_MODEL_NOT_CONFIGURED", "The Bedrock model is not configured.")
    result = await asyncio.to_thread(_converse, settings, model_id, system, prompt, max_tokens=max_tokens)
  except AppError as exc:
    emit_ai_metric(
      provider="bedrock", operation="generate_json", model_id=model_id,
      status="error", latency_ms=(time.perf_counter() - started_at) * 1000,
      error_code=exc.code,
    )
    raise
  except Exception as exc:
    error = _bedrock_app_error(exc)
    logger.exception(
      "[aura:makeup-recommendation] bedrock:failed modelId=%s providerCode=%s providerRequestId=%s",
      model_id,
      error.details.get("providerCode"),
      error.details.get("providerRequestId"),
    )
    emit_ai_metric(
      provider="bedrock", operation="generate_json", model_id=model_id,
      status="error", latency_ms=(time.perf_counter() - started_at) * 1000,
      error_code=error.code,
    )
    raise error from exc
  emit_ai_metric(
    provider="bedrock", operation="generate_json", model_id=model_id,
    status="success", latency_ms=(time.perf_counter() - started_at) * 1000,
  )
  return result


def _bedrock_app_error(exc: Exception) -> AppError:
  if isinstance(exc, ReadTimeoutError):
    return AppError(
      504,
      "BEDROCK_REQUEST_TIMEOUT",
      "The Bedrock request timed out.",
      {"providerCode": "ReadTimeoutError"},
    )

  if not isinstance(exc, ClientError):
    return AppError(502, "BEDROCK_REQUEST_FAILED", "The Bedrock request failed.")

  error = exc.response.get("Error", {})
  metadata = exc.response.get("ResponseMetadata", {})
  provider_code = str(error.get("Code") or "ClientError")
  request_id = str(metadata.get("RequestId") or "")
  details = {
    "providerCode": provider_code,
    **({"providerRequestId": request_id} if request_id else {}),
  }
  if provider_code in {"AccessDeniedException", "UnauthorizedException"}:
    return AppError(
      503,
      "BEDROCK_ACCESS_DENIED",
      "Bedrock access is not configured for this service.",
      details,
    )
  if provider_code in {"ThrottlingException", "ServiceUnavailableException"}:
    return AppError(
      503,
      "BEDROCK_TEMPORARILY_UNAVAILABLE",
      "Bedrock is temporarily unavailable.",
      details,
    )
  if provider_code in {"ValidationException", "ResourceNotFoundException"}:
    return AppError(
      502,
      "BEDROCK_MODEL_REQUEST_INVALID",
      "The configured Bedrock model request is invalid.",
      details,
    )
  return AppError(502, "BEDROCK_REQUEST_FAILED", "The Bedrock request failed.", details)


async def generate_scenarios(settings: Settings, count: int, exclude_texts: list[str]) -> dict[str, Any]:
  excluded = [text.strip()[:60] for text in exclude_texts if text.strip()][:100]
  seen = list(excluded)
  items: list[dict[str, Any]] = []

  for _attempt in range(3):
    remaining = count - len(items)
    if remaining <= 0:
      break
    response = await generate_json(
      settings,
      settings.effective_scenario_model_id,
      "Write sharp Korean editorial situation cards for makeup discovery. Avoid generic beauty copy, bland category labels, paraphrases, stereotypes, and repeated ideas. Return JSON only.",
      f"Return {{\"items\":[{{\"id\":\"string\",\"text\":\"short display copy\",\"seedPrompt\":\"specific makeup intent\",\"tags\":[\"string\"]}}]}} with exactly {remaining} items. "
      "Write natural Korean display copy, usually 5 to 18 characters, without the words 룩 or 메이크업. Mix concise scenes, character, place, camera, work, everyday, and small-transformation ideas. Every card must point to a distinct makeup direction rather than merely sounding poetic. "
      f"Use this quality and rhythm as reference only; do not copy or lightly paraphrase them: {json.dumps(SCENARIO_COPY_EXAMPLES, ensure_ascii=False)}. "
      "seedPrompt must clearly describe color, texture, emphasis, and occasion without relying on the display copy. "
      f"Do not repeat, reorder, extend, or paraphrase any previously shown idea: {json.dumps([*excluded, *[item['text'] for item in items]], ensure_ascii=False)}",
    )
    raw_items = response.get("items")
    if not isinstance(raw_items, list):
      continue
    for raw_item in raw_items:
      if not isinstance(raw_item, dict):
        continue
      text = str(raw_item.get("text") or "").strip()[:60]
      seed_prompt = str(raw_item.get("seedPrompt") or "").strip()[:240]
      if not text or not seed_prompt or any(_scenario_copy_is_similar(text, previous) for previous in seen):
        continue
      tags = raw_item.get("tags")
      clean_tags = [str(tag).strip() for tag in tags[:8] if str(tag).strip()] if isinstance(tags, list) else []
      if not _scenario_copy_is_safe(text, seed_prompt, clean_tags):
        continue
      items.append(
        {
          "id": f"generated-{sha256(text.encode('utf-8')).hexdigest()[:16]}",
          "text": text,
          "seedPrompt": seed_prompt,
          "tags": clean_tags,
        },
      )
      seen.append(text)
      if len(items) >= count:
        break

  if not items:
    raise AppError(502, "BEDROCK_EMPTY_SCENARIOS", "Bedrock did not return any usable makeup scenarios.")
  return {"items": items[:count]}


def _scenario_library_item(row: dict[str, Any]) -> dict[str, Any]:
  tags = row.get("tags")
  if isinstance(tags, str):
    try:
      tags = json.loads(tags)
    except json.JSONDecodeError:
      tags = []
  return {
    "id": str(row.get("id") or ""),
    "text": str(row.get("text") or "").strip(),
    "seedPrompt": str(row.get("seed_prompt") or "").strip(),
    "tags": [str(tag).strip() for tag in tags if str(tag).strip()] if isinstance(tags, list) else [],
  }


async def enforce_scenario_generation_limit(db: Any, user_id: Any) -> None:
  row = await db.fetchrow(
    """
    insert into makeup_scenario_generation_limits (user_id, window_started_at, request_count)
    values ($1, now(), 1)
    on conflict (user_id) do update set
      window_started_at = case
        when makeup_scenario_generation_limits.window_started_at <= now() - interval '60 seconds' then now()
        else makeup_scenario_generation_limits.window_started_at
      end,
      request_count = case
        when makeup_scenario_generation_limits.window_started_at <= now() - interval '60 seconds' then 1
        else least(makeup_scenario_generation_limits.request_count + 1, 4)
      end
    returning request_count
    """,
    user_id,
  )
  if row is None or int(row.get("request_count") or 0) > 3:
    raise AppError(
      429,
      "MAKEUP_SCENARIO_RATE_LIMITED",
      "잠시 후 카드를 더 만들어 주세요.",
      {"limit": 3, "windowSeconds": 60},
    )


async def _persist_generated_scenario(
  db: Any,
  item: dict[str, Any],
  model_id: str,
  created_by_user_id: Any,
) -> dict[str, Any] | None:
  text = str(item.get("text") or "").strip()[:60]
  seed_prompt = str(item.get("seedPrompt") or "").strip()[:240]
  normalized_text = _scenario_copy_key(text) or re.sub(r"[^0-9a-z가-힣]", "", text.casefold())
  tags = item.get("tags") if isinstance(item.get("tags"), list) else []
  return await db.fetchrow(
    """
    with capacity_lock as materialized (
      select pg_advisory_xact_lock(73120451)
    ), existing as materialized (
      select id, status
      from makeup_scenario_library, capacity_lock
      where normalized_text = $2
        and locale = 'ko-KR'
        and coalesce(market_scope, '') = ''
      limit 1
    ), reused as (
      update makeup_scenario_library
      set usage_count = usage_count + 1,
          last_served_at = now(),
          updated_at = now()
      where id = (select id from existing where status = 'active')
      returning id, text, seed_prompt, tags, status
    ), capacity as materialized (
      select count(*)::integer as ai_count
      from makeup_scenario_library, capacity_lock
      where source = 'ai'
        and locale = 'ko-KR'
        and coalesce(market_scope, '') = ''
    ), inserted as (
      insert into makeup_scenario_library
        (text, normalized_text, seed_prompt, tags, source, model_id, prompt_version,
         status, usage_count, last_served_at, created_by_user_id, locale, market_scope)
      select $1, $2, $3, $4::jsonb, 'ai', $5, 'makeup-scenario-v2',
             'active', 1, now(), $6, 'ko-KR', null
      from capacity
      where ai_count < 2000
        and not exists (select 1 from existing)
      on conflict (normalized_text, locale, (coalesce(market_scope, ''))) do nothing
      returning id, text, seed_prompt, tags, status
    ), replacement_candidate as materialized (
      select library.id
      from makeup_scenario_library library, capacity
      where capacity.ai_count >= 2000
        and library.source = 'ai'
        and library.locale = 'ko-KR'
        and coalesce(library.market_scope, '') = ''
        and library.status = 'active'
        and (
          library.last_served_at is null
          or library.last_served_at < now() - interval '7 days'
        )
        and not exists (select 1 from existing)
      order by library.usage_count asc,
               library.last_served_at asc nulls first,
               library.created_at asc
      limit 1
      for update skip locked
    ), replaced as (
      update makeup_scenario_library
      set text = $1,
          normalized_text = $2,
          seed_prompt = $3,
          tags = $4::jsonb,
          source = 'ai',
          model_id = $5,
          prompt_version = 'makeup-scenario-v2',
          status = 'active',
          usage_count = 1,
          last_served_at = now(),
          created_by_user_id = $6,
          created_at = now(),
          updated_at = now()
      where id = (select id from replacement_candidate)
      returning id, text, seed_prompt, tags, status
    ), existing_blocked as (
      select library.id, library.text, library.seed_prompt, library.tags, library.status
      from makeup_scenario_library library
      where library.id = (select id from existing where status = 'disabled')
    )
    select * from reused
    union all select * from inserted
    union all select * from replaced
    union all select * from existing_blocked
    limit 1
    """,
    text,
    normalized_text,
    seed_prompt,
    json.dumps(tags, ensure_ascii=False),
    model_id,
    created_by_user_id,
  )


async def generate_shared_scenarios(
  settings: Settings,
  db: Any,
  count: int,
  exclude_texts: list[str],
  created_by_user_id: Any,
) -> dict[str, Any]:
  candidates = await db.fetch(
    """
    select id, text, seed_prompt, tags, status
    from makeup_scenario_library
    where locale = 'ko-KR'
      and coalesce(market_scope, '') = ''
      and keyword_kind = 'legacy_scenario'
    order by (status = 'active') desc, usage_count asc, random()
    limit $1
    """,
    max(100, count * 20),
  )
  excluded = [text.strip()[:60] for text in exclude_texts if text.strip()][:100]
  shared_target = max(0, count - min(4, count))
  eligible: list[dict[str, Any]] = []
  seen = list(excluded)
  for row in candidates:
    if str(row.get("status") or "active") != "active":
      continue
    item = _scenario_library_item(row)
    if not item["id"] or not item["text"] or not item["seedPrompt"]:
      continue
    if any(_scenario_copy_is_similar(item["text"], previous) for previous in seen):
      continue
    eligible.append(item)
    seen.append(item["text"])
  selected = eligible[:shared_target]

  generation_count = count - len(selected)
  generated_items: list[dict[str, Any]] = []
  if generation_count > 0:
    generation_exclusions = [*excluded, *[str(row.get("text") or "") for row in candidates]]
    try:
      generated = await generate_scenarios(settings, generation_count, generation_exclusions)
    except Exception:
      if not selected:
        raise
      logger.exception("[aura:makeup-recommendation] shared-scenarios:generation-failed")
      generated = {"items": []}

    for item in generated.get("items", []):
      text = str(item.get("text") or "").strip()[:60]
      seed_prompt = str(item.get("seedPrompt") or "").strip()[:240]
      if not text or not seed_prompt or any(_scenario_copy_is_similar(text, previous) for previous in seen):
        continue
      try:
        stored = await _persist_generated_scenario(
          db,
          {**item, "text": text, "seedPrompt": seed_prompt},
          settings.effective_scenario_model_id,
          created_by_user_id,
        )
      except Exception:
        logger.exception("[aura:makeup-recommendation] shared-scenarios:persist-failed")
        stored = None
      if stored is not None and str(stored.get("status") or "active") != "active":
        continue
      stored_item = _scenario_library_item(stored) if stored is not None else {
        "id": str(item.get("id") or f"generated-{sha256(text.encode('utf-8')).hexdigest()[:16]}"),
        "text": text,
        "seedPrompt": seed_prompt,
        "tags": [str(tag).strip() for tag in item.get("tags", []) if str(tag).strip()][:8]
        if isinstance(item.get("tags"), list)
        else [],
      }
      if any(_scenario_copy_is_similar(stored_item["text"], previous) for previous in seen):
        continue
      generated_items.append(stored_item)
      seen.append(stored_item["text"])
      if len(selected) + len(generated_items) >= count:
        break

  if len(generated_items) < generation_count:
    raise AppError(
      502,
      "BEDROCK_INSUFFICIENT_SCENARIOS",
      "Bedrock did not return enough distinct makeup scenarios.",
      {"requestedFresh": generation_count, "generatedFresh": len(generated_items)},
    )

  combined = [*selected, *generated_items]

  generated_ids = {item["id"] for item in generated_items}
  shared_ids = [item["id"] for item in combined if item["id"] not in generated_ids]
  if shared_ids:
    await db.execute(
      "update makeup_scenario_library set usage_count = usage_count + 1, last_served_at = now(), updated_at = now() where id::text = any($1::text[])",
      shared_ids,
    )
  return {"items": combined[:count]}


async def generate_questions(
  settings: Settings,
  scenario_text: str,
  tags: list[str],
  scenario_label: str | None = None,
) -> dict[str, Any]:
  for _attempt in range(2):
    response = await generate_json(
      settings,
      settings.effective_question_model_id,
      QUESTION_SYSTEM_PROMPT,
      f"선택한 카드 문구: {scenario_label or '(자유 입력)'}\n"
      f"카드가 담은 내부 의도 또는 사용자 입력: {scenario_text}\n"
      f"태그: {', '.join(tags) or '(없음)'}\n\n"
      "카드 문구와 내부 의도를 질문 생성의 출발점으로 함께 고려하라. 내부 의도에 적힌 색이나 테크닉을 사용자에게 되묻지 말고, AI가 나중에 알아서 구현해야 할 정보로 취급하라. "
      "Return {\"questions\":[{\"id\":\"string\",\"title\":\"string\",\"options\":[{\"id\":\"string\",\"label\":\"string\"}]}]} with 1 to 3 questions and exactly 4 options each: 3 mutually exclusive story choices plus ai_pick last.",
    )
    try:
      return GeneratedQuestions.model_validate(response).model_dump(by_alias=True)
    except ValidationError as exc:
      logger.warning(
        "[aura:makeup-recommendation] questions:validation-failed modelId=%s errors=%s",
        settings.effective_question_model_id,
        exc.errors(include_input=False),
      )
      continue
  raise AppError(502, "BEDROCK_INVALID_QUESTIONS", "Bedrock returned invalid makeup questions.")


async def generate_recommendation(
  settings: Settings,
  scenario_text: str,
  tags: list[str],
  questions: list[dict[str, Any]],
  answers: list[dict[str, Any]],
  scenario_label: str | None = None,
) -> dict[str, Any]:
  output_contract = (
    '{"looks":[{"id":"string","role":"anchor|bold|discovery","title":"string",'
    '"summary":"string","reasons":["string"],"appliedConditions":["string"],'
    '"durationMinutes":15,"difficulty":"easy|medium|advanced",'
    '"steps":[{"order":1,"area":"base|brow|eye|cheek|lip","instruction":"string"}],'
    '"products":[{"area":"base|brow|eye|cheek|lip","brandName":"string",'
    '"productName":"string","shadeName":"string","reason":"string"}]}]}'
  )
  validation_errors: list[dict[str, Any]] = []
  for _attempt in range(1):
    response = await generate_json(
      settings,
      settings.effective_recommendation_model_id,
      "Generate practical, inclusive Korean makeup recommendations. The AI must do the makeup design work: translate the user's chosen story and answers into colors, textures, emphasis, techniques, and products without asking the user to design the recipe. Do not use face analysis or personal color data. Return JSON only. The response must be valid against the exact schema in the user message.",
      f"Selected scenario card: {scenario_label or '(free input)'}\nScenario intent: {scenario_text}\nTags: {tags}\nQuestions: {json.dumps(questions, ensure_ascii=False)}\nAnswers: {json.dumps(answers, ensure_ascii=False)}\nReturn exactly this shape: {output_contract}. Treat both the initially selected card and every answer as binding creative context. Return exactly three meaningfully different looks in this order: anchor (safe and balanced), bold (clearer and more expressive), discovery (unexpected but wearable). The three looks must differ in overall character and story, not merely in one shade or intensity. Each look must include one step for every area: base, brow, eye, cheek, lip, plus 3 to 8 realistic Korean-market product suggestions. Direct user answers and constraints take priority.",
    )
    try:
      return GeneratedMakeupRecommendation.model_validate(response).model_dump(by_alias=True)
    except ValidationError as exc:
      validation_errors = exc.errors(include_input=False)
      logger.warning(
        "[aura:makeup-recommendation] recommendation:validation-failed modelId=%s errors=%s",
        settings.effective_recommendation_model_id,
        validation_errors,
      )
      continue
  raise AppError(
    502,
    "BEDROCK_INVALID_RECOMMENDATION",
    "Bedrock returned an invalid makeup recommendation.",
    {
      "modelId": settings.effective_recommendation_model_id,
      "validationErrors": validation_errors[:12],
    },
  )

async def normalize_custom_situation_v2(settings: Settings, text: str) -> dict[str, Any]:
  try:
    response = await generate_json(
      settings,
      settings.effective_question_model_id,
      CUSTOM_NORMALIZATION_SYSTEM_PROMPT,
      build_custom_normalization_prompt(text),
      max_tokens=900,
    )
    normalized = NormalizedCustomSituation.model_validate(response).model_dump(by_alias=True)
    return {**normalized, "normalizationSource": "claude"}
  except Exception:
    logger.warning(
      "[aura:makeup-recommendation] custom-normalization:fallback modelId=%s",
      settings.effective_question_model_id,
      exc_info=True,
    )
    return {
      "situationIntent": text,
      "desiredImpression": None,
      "constraints": [],
      "normalizationSource": "deterministic_fallback",
    }


def deterministic_questions_v2(context_snapshot: dict[str, Any]) -> list[dict[str, Any]]:
  selection = context_snapshot.get("selection")
  if not isinstance(selection, dict):
    selection = {}
  situation = selection.get("situation")
  situation_key = str(situation.get("key") or "") if isinstance(situation, dict) else ""
  keyword = selection.get("keyword")
  keyword_label = str(keyword.get("label") or "").strip() if isinstance(keyword, dict) else ""
  change_title = (
    f"‘{keyword_label}’ 분위기를 평소보다 어느 정도 강조할까요?"
    if keyword_label
    else "평소보다 어느 정도 변화를 줄까요?"
  )

  questions: list[dict[str, Any]] = [
    {
      "id": "change_level",
      "title": change_title,
      "options": [
        {"id": "familiar", "label": "익숙한 나를 또렷하게"},
        {"id": "balanced", "label": "한 단계 새로운 인상"},
        {"id": "bold", "label": "오늘만큼은 확실한 반전"},
        {"id": "ai_pick", "label": "AI가 골라줘"},
      ],
    },
  ]
  if situation_key == "camera_content":
    questions.append(
      {
        "id": "camera_priority",
        "title": "결과는 어디에서 가장 빛나면 좋을까요?",
        "options": [
          {"id": "photo", "label": "사진 한 장의 선명함"},
          {"id": "video", "label": "움직이는 영상의 생동감"},
          {"id": "both", "label": "렌즈 밖 실물까지 균형"},
          {"id": "ai_pick", "label": "AI가 골라줘"},
        ],
      },
    )
  elif situation_key in {"travel_outdoor", "festival_performance"}:
    questions.append(
      {
        "id": "wear_priority",
        "title": "현장에서 무엇을 가장 우선할까요?",
        "options": [
          {"id": "lasting", "label": "오래 유지되는 안정감"},
          {"id": "quick_fix", "label": "빠르게 고치기 쉬운 표현"},
          {"id": "moment", "label": "짧아도 강한 순간의 인상"},
          {"id": "ai_pick", "label": "AI가 골라줘"},
        ],
      },
    )
  else:
    questions.append(
      {
        "id": "prep_time",
        "title": "오늘은 어느 정도 공들일 수 있어요?",
        "options": [
          {"id": "quick", "label": "15분 안에 빠르게"},
          {"id": "standard", "label": "30분 정도 여유 있게"},
          {"id": "detail", "label": "60분 이상 디테일까지"},
          {"id": "ai_pick", "label": "AI가 골라줘"},
        ],
      },
    )
  return GeneratedQuestions.model_validate({"questions": questions}).model_dump(by_alias=True)["questions"]


PREP_TIME_OPTION_LABELS = (
  "15분 안에 빠르게",
  "30분 정도 여유 있게",
  "60분 이상 디테일까지",
)


def normalize_prep_time_question_options(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
  normalized_questions: list[dict[str, Any]] = []
  for question in questions:
    normalized_question = {**question}
    options = [dict(option) for option in question.get("options", [])]
    searchable = " ".join(
      [
        str(question.get("id") or ""),
        str(question.get("title") or ""),
        *[str(option.get("label") or "") for option in options[:3]],
      ],
    ).casefold()
    is_prep_time = (
      "prep_time" in searchable
      or "time_skill" in searchable
      or "공들일" in searchable
      or "준비 시간" in searchable
      or sum("분" in str(option.get("label") or "") for option in options[:3]) >= 2
    )
    if is_prep_time and len(options) == 4:
      for index, label in enumerate(PREP_TIME_OPTION_LABELS):
        options[index]["label"] = label
      normalized_question["options"] = options
    normalized_questions.append(normalized_question)
  return normalized_questions

async def generate_questions_v2_with_fallback(
  settings: Settings,
  context_snapshot: dict[str, Any],
) -> dict[str, Any]:
  validation_errors: list[dict[str, Any]] = []
  for _attempt in range(2):
    try:
      response = await generate_json(
        settings,
        settings.effective_question_model_id,
        QUESTION_V2_SYSTEM_PROMPT,
        build_question_prompt(context_snapshot),
        max_tokens=1800,
      )
      questions = GeneratedQuestions.model_validate(response).model_dump(by_alias=True)["questions"]
      questions = normalize_prep_time_question_options(questions)
      return {"questions": questions, "source": "claude", "version": "makeup-questions-v2"}
    except ValidationError as exc:
      validation_errors = exc.errors(include_input=False)
      logger.warning(
        "[aura:makeup-recommendation] questions-v2:validation-failed modelId=%s errors=%s",
        settings.effective_question_model_id,
        validation_errors,
      )
    except Exception:
      logger.warning(
        "[aura:makeup-recommendation] questions-v2:provider-failed modelId=%s",
        settings.effective_question_model_id,
        exc_info=True,
      )
      break

  return {
    "questions": deterministic_questions_v2(context_snapshot),
    "source": "deterministic_fallback",
    "version": "makeup-questions-fallback-v1",
  }


def deterministic_recommendation_v2(
  context_snapshot: dict[str, Any],
  answers: list[dict[str, Any]],
) -> dict[str, Any]:
  analysis = context_snapshot.get("analysisReport")
  if not isinstance(analysis, dict):
    analysis = {}
  profile = context_snapshot.get("profile")
  if not isinstance(profile, dict):
    profile = {}
  presentation = str(profile.get("presentation") or "neutral")
  if presentation not in {"feminine", "masculine", "neutral"}:
    presentation = "neutral"
  profile_direction = {
    "feminine": "여성적인 선과 생기를 살린",
    "masculine": "색조를 절제하고 윤곽과 결을 정돈한",
    "neutral": "성별에 치우치지 않는 균형과 정돈을 살린",
  }[presentation]
  selection = context_snapshot.get("selection")
  if not isinstance(selection, dict):
    selection = {}
  situation = selection.get("situation") if isinstance(selection.get("situation"), dict) else {}
  keyword = selection.get("keyword") if isinstance(selection.get("keyword"), dict) else {}

  scenario = str(
    keyword.get("label")
    or selection.get("customSituationLabel")
    or selection.get("customSituationText")
    or situation.get("label")
    or "선택한 상황"
  ).strip()[:40] or "선택한 상황"
  answer_labels = [
    str(answer.get("label") or answer.get("freeText") or "").strip()[:80]
    for answer in answers
    if isinstance(answer, dict)
    and str(answer.get("label") or answer.get("freeText") or "").strip()
  ]
  context_summary = [scenario]
  for label, value in (
    ("퍼스널 컬러", analysis.get("personalColor")),
    ("얼굴형 참고", analysis.get("faceShape")),
  ):
    if value:
      context_summary.append(f"{label}: {str(value).strip()[:80]}")
  context_summary.extend(f"응답: {value}" for value in answer_labels[:4])

  area_specs = {
    "base": ("베이스", "얇고 균일한 피부 표현", "얼굴 중심에서 바깥쪽으로 얇게", "소량씩 두드려 경계를 정리"),
    "brow": ("브로우", "인상을 정돈하는 자연스러운 눈썹", "본래 눈썹 결을 따라 빈 곳만 채우기", "앞머리는 옅게, 꼬리는 짧고 선명하게"),
    "eye": ("아이", "눈매의 깊이와 선명도 조절", "쌍꺼풀 선 안쪽과 눈꼬리 중심", "경계를 충분히 풀어 한 겹씩 쌓기"),
    "cheek": ("치크", "얼굴에 생기와 입체감 더하기", "볼 중심에서 관자 방향으로 얇게", "남은 양으로 가장자리부터 연결"),
    "lip": ("립", "전체 인상을 마무리하는 입술 표현", "입술 안쪽부터 외곽으로 번지듯", "얇게 한 번 바른 뒤 중심만 덧바르기"),
  }
  role_specs = (
    ("anchor", "밸런스 룩", "정돈되고 편안한 균형", 15, "easy", {
      "base": ("뉴트럴 베이지", "#D9B49A", "얇은 세미 글로우"),
      "brow": ("내추럴 브라운", "#795548", "보송한 파우더"),
      "eye": ("소프트 토프", "#9B7F74", "은은한 새틴"),
      "cheek": ("로지 피치", "#D98E8E", "맑은 쉬어"),
      "lip": ("뮤티드 로즈", "#A85D68", "편안한 세미 글로우"),
    }),
    ("bold", "포인트 룩", "사진과 현장에서 또렷하게 남는 포인트", 25, "medium", {
      "base": ("웜 뉴트럴", "#D3AA90", "매끈한 세미 매트"),
      "brow": ("딥 브라운", "#5C4038", "선명한 소프트 매트"),
      "eye": ("딥 로즈 브라운", "#7B4E55", "밀도 있는 새틴"),
      "cheek": ("클리어 로즈", "#CF6F7D", "선명한 쉬어"),
      "lip": ("딥 베리 로즈", "#8F354D", "또렷한 벨벳"),
    }),
    ("discovery", "디스커버리 룩", "익숙한 인상에 한 가지 세련된 변주", 20, "medium", {
      "base": ("소프트 베이지", "#D8B399", "투명한 새틴"),
      "brow": ("애쉬 브라운", "#6B5147", "가벼운 파우더"),
      "eye": ("모브 토프", "#8B6B87", "잔잔한 쉬머"),
      "cheek": ("모브 로즈", "#C98291", "부드러운 쉬어"),
      "lip": ("플럼 로즈", "#9E5A78", "촉촉한 블러"),
    }),
  )
  presentation_palette_overrides = {
    "feminine": {},
    "masculine": {
      "anchor": {
        "eye": ("뮤티드 토프", "#85766F", "차분한 소프트 매트"),
        "cheek": ("뉴트럴 베이지", "#B9937F", "색감을 절제한 쉬어"),
        "lip": ("로즈 베이지", "#916B63", "자연스러운 세미 매트"),
      },
      "bold": {
        "eye": ("코코아 브라운", "#684E46", "밀도 있는 소프트 매트"),
        "cheek": ("웜 탄", "#A97862", "얇은 새틴"),
        "lip": ("뮤티드 브릭", "#824F47", "정돈된 벨벳"),
      },
      "discovery": {
        "eye": ("스모키 토프", "#756866", "잔잔한 새틴"),
        "cheek": ("더스티 베이지", "#B18D80", "부드러운 쉬어"),
        "lip": ("모브 브라운", "#80615F", "가벼운 블러"),
      },
    },
    "neutral": {
      "anchor": {
        "eye": ("뉴트럴 토프", "#8B7B75", "은은한 새틴"),
        "cheek": ("피치 베이지", "#C08E7C", "맑고 얇은 쉬어"),
        "lip": ("뉴트럴 로즈", "#986C6B", "편안한 세미 글로우"),
      },
      "bold": {
        "eye": ("딥 토프", "#6F5756", "밀도 있는 새틴"),
        "cheek": ("뮤티드 로즈 베이지", "#B47D78", "선명도를 낮춘 쉬어"),
        "lip": ("딥 뉴트럴 로즈", "#815054", "부드러운 벨벳"),
      },
      "discovery": {
        "eye": ("모브 토프", "#817078", "잔잔한 쉬머"),
        "cheek": ("더스티 로즈 베이지", "#B98A86", "부드러운 쉬어"),
        "lip": ("뮤티드 모브", "#85656F", "촉촉한 블러"),
      },
    },
  }[presentation]


  applied_conditions = context_summary[:8] or [scenario]
  looks: list[dict[str, Any]] = []
  for role, title_suffix, direction, duration, difficulty, palette in role_specs:
    palette = {**palette, **presentation_palette_overrides.get(role, {})}
    direction = f"{profile_direction} {direction}"
    guides = []
    for area, (label, goal, placement, technique) in area_specs.items():
      color_name, color_hex, texture = palette[area]
      guides.append({
        "area": area,
        "label": label,
        "goal": f"{direction}을 살리는 {goal}",
        "color": {"name": color_name, "hex": color_hex},
        "texture": texture,
        "placement": placement,
        "technique": technique,
        "steps": [{"order": 1, "instruction": technique}],
        "reason": f"{scenario} 상황과 선택한 답변을 함께 반영했습니다.",
        "avoid": ["한 번에 많은 양을 올려 경계가 두꺼워지지 않게 해주세요."],
        "products": [],
        "arSupported": True,
      })
    looks.append({
      "id": role,
      "role": role,
      "title": f"{scenario} {title_suffix}"[:100],
      "summary": f"{scenario}에 맞춰 {direction}을 중심으로 구성한 메이크업입니다.",
      "reasons": [
        f"선택한 {scenario} 상황을 기준으로 구성했습니다.",
        "얼굴 분석 보고서와 역질문 답변을 함께 참고했습니다.",
      ],
      "appliedConditions": applied_conditions,
      "durationMinutes": duration,
      "difficulty": difficulty,
      "areaGuides": guides,
      "imageBrief": (
        f"인물의 고유한 얼굴 특징은 유지하고 {scenario}에 어울리는 "
        f"{direction} 메이크업만 자연스럽게 적용"
      ),
    })

  return GeneratedMakeupRecommendationV2.model_validate({
    "contextSummary": context_summary[:8] or [scenario],
    "looks": looks,
  }).model_dump(by_alias=True)


async def generate_recommendation_v2(
  settings: Settings,
  context_snapshot: dict[str, Any],
  questions: list[dict[str, Any]],
  answers: list[dict[str, Any]],
) -> dict[str, Any]:
  validation_errors: list[dict[str, Any]] = []
  for _attempt in range(2):
    try:
      response = await generate_json(
        settings,
        settings.effective_recommendation_model_id,
        RECOMMENDATION_V2_SYSTEM_PROMPT,
        build_recommendation_prompt(context_snapshot, questions, answers),
        max_tokens=9000,
      )
    except Exception:
      logger.warning(
        "[aura:makeup-recommendation] recommendation-v2:provider-failed "
        "modelId=%s using deterministic fallback",
        settings.effective_recommendation_model_id,
        exc_info=True,
      )
      return deterministic_recommendation_v2(context_snapshot, answers)
    try:
      return GeneratedMakeupRecommendationV2.model_validate(response).model_dump(by_alias=True)
    except ValidationError as exc:
      validation_errors = exc.errors(include_input=False)
      logger.warning(
        "[aura:makeup-recommendation] recommendation-v2:validation-failed modelId=%s errors=%s",
        settings.effective_recommendation_model_id,
        validation_errors,
      )

  logger.warning(
    "[aura:makeup-recommendation] recommendation-v2:using deterministic fallback "
    "after validation failures modelId=%s errors=%s",
    settings.effective_recommendation_model_id,
    validation_errors[:16],
  )
  return deterministic_recommendation_v2(context_snapshot, answers)
