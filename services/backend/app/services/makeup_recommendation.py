import asyncio
from difflib import SequenceMatcher
from hashlib import sha256
import json
import logging
import re
from typing import Any

import boto3
from botocore.exceptions import ClientError
from pydantic import ValidationError

from app.core.errors import AppError
from app.core.settings import Settings
from app.schemas.makeup_recommendation import GeneratedMakeupRecommendation, GeneratedQuestions


logger = logging.getLogger(__name__)


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
  generated_looks = generated.get("looks") if isinstance(generated.get("looks"), list) else []
  clean_generated = [{key: value for key, value in look.items() if key != "imageUrl"} for look in generated_looks if isinstance(look, dict)]
  if refinement != "replaceProducts":
    return {**generated, "looks": clean_generated}

  previous_looks = previous.get("looks") if isinstance(previous.get("looks"), list) else []
  generated_by_role = {look.get("role"): look for look in clean_generated}
  merged = []
  for previous_look in previous_looks:
    if not isinstance(previous_look, dict):
      continue
    replacement = generated_by_role.get(previous_look.get("role"), {})
    preserved = {key: value for key, value in previous_look.items() if key not in {"imageUrl", "products"}}
    merged.append({**preserved, "products": replacement.get("products", previous_look.get("products", []))})
  return {**generated, "looks": merged}


def _converse(settings: Settings, model_id: str, system: str, prompt: str) -> dict[str, Any]:
  client = boto3.client("bedrock-runtime", region_name=settings.aws_region)
  response = client.converse(
    modelId=model_id,
    system=[{"text": system}],
    messages=[{"role": "user", "content": [{"text": prompt}]}],
    inferenceConfig={"maxTokens": 6000, "temperature": 0.45},
  )
  text = "".join(
    block.get("text", "")
    for block in response.get("output", {}).get("message", {}).get("content", [])
    if isinstance(block, dict)
  ).strip()
  if text.startswith("```") and text.endswith("```"):
    first_newline = text.find("\n")
    text = text[first_newline + 1 : -3].strip() if first_newline >= 0 else text[3:-3].strip()
  try:
    value = json.loads(text)
  except json.JSONDecodeError as exc:
    raise AppError(502, "BEDROCK_INVALID_JSON", "Bedrock returned an invalid recommendation response.") from exc
  if not isinstance(value, dict):
    raise AppError(502, "BEDROCK_INVALID_JSON", "Bedrock returned an invalid recommendation response.")
  return value


async def generate_json(settings: Settings, model_id: str, system: str, prompt: str) -> dict[str, Any]:
  if not model_id:
    raise AppError(503, "BEDROCK_MODEL_NOT_CONFIGURED", "The Bedrock model is not configured.")
  try:
    return await asyncio.to_thread(_converse, settings, model_id, system, prompt)
  except AppError:
    raise
  except Exception as exc:
    error = _bedrock_app_error(exc)
    logger.exception(
      "[aura:makeup-recommendation] bedrock:failed modelId=%s providerCode=%s providerRequestId=%s",
      model_id,
      error.details.get("providerCode"),
      error.details.get("providerRequestId"),
    )
    raise error from exc


def _bedrock_app_error(exc: Exception) -> AppError:
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
    for raw_item in response.get("items", []):
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
    ), inserted as (
      insert into makeup_scenario_library
        (text, normalized_text, seed_prompt, tags, source, model_id, prompt_version,
         status, usage_count, last_served_at, created_by_user_id)
      select $1, $2, $3, $4::jsonb, 'ai', $5, 'makeup-scenario-v2',
             'active', 1, now(), $6
      from capacity
      where ai_count < 2000
        and not exists (select 1 from existing)
      on conflict (normalized_text) do nothing
      returning id, text, seed_prompt, tags, status
    ), replacement_candidate as materialized (
      select library.id
      from makeup_scenario_library library, capacity
      where capacity.ai_count >= 2000
        and library.source = 'ai'
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
  for _attempt in range(2):
    response = await generate_json(
      settings,
      settings.effective_recommendation_model_id,
      "Generate practical, inclusive Korean makeup recommendations. The AI must do the makeup design work: translate the user's chosen story and answers into colors, textures, emphasis, techniques, and products without asking the user to design the recipe. Do not use face analysis or personal color data. Return JSON only.",
      f"Selected scenario card: {scenario_label or '(free input)'}\nScenario intent: {scenario_text}\nTags: {tags}\nQuestions: {json.dumps(questions, ensure_ascii=False)}\nAnswers: {json.dumps(answers, ensure_ascii=False)}\nReturn exactly this shape: {output_contract}. Treat both the initially selected card and every answer as binding creative context. Return exactly three meaningfully different looks in this order: anchor (safe and balanced), bold (clearer and more expressive), discovery (unexpected but wearable). The three looks must differ in overall character and story, not merely in one shade or intensity. Each look must include one step for every area: base, brow, eye, cheek, lip, plus 3 to 8 realistic Korean-market product suggestions. Direct user answers and constraints take priority.",
    )
    try:
      return GeneratedMakeupRecommendation.model_validate(response).model_dump(by_alias=True)
    except ValidationError as exc:
      logger.warning(
        "[aura:makeup-recommendation] recommendation:validation-failed modelId=%s errors=%s",
        settings.effective_recommendation_model_id,
        exc.errors(include_input=False),
      )
      continue
  raise AppError(502, "BEDROCK_INVALID_RECOMMENDATION", "Bedrock returned an invalid makeup recommendation.")
