"""LLM 배치 속성 추출기 (B3 — 종합보고서 §6.4-2).

입력: 카탈로그/시드 jsonl (상품명 + 옵션명 + 공식 설명 텍스트).
출력: {colorFamily, finish, texture, undertone} 각각 {value, confidence, evidenceSpan}.

비협상 게이트 3종:
  ① evidenceSpan이 입력 텍스트에 실재하지 않으면(substring) 해당 필드 자동 리젝.
  ② confidence는 field-specific만 인정 — 전체(overall) confidence 폴백 금지
     (시드 조작 함정 재발 방지: 감사에서 field-specific만 인정하기로 확정된 계약).
  ③ hardFilterEligible 승격은 conf≥0.70 + 사람 스팟체크 통과 배치만 —
     이 스크립트는 review 큐 파일까지만 만들고 시드에 직접 병합하지 않는다.

Bedrock 실호출은 backend enrichment 패턴 재사용(BEDROCK_ANALYSIS_INFERENCE_ID 등
env — 서울 리전은 apac.* 크로스리전 추론 프로파일 id 필요). 크리덴셜이 없으면
`--dry-run`으로 룰 기반 모의 응답을 돌려 게이트 로직만 검증한다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
if str(BACKEND_ROOT) not in sys.path:
  sys.path.insert(0, str(BACKEND_ROOT))

EXTRACTOR_VERSION = "auradin-llm-attribute-extraction-v1"
OUTPUT_SCHEMA = "AuradinLlmAttributeExtraction.review.v1"
TARGET_FIELDS = ("colorFamily", "finish", "texture", "undertone")
UNDERTONE_ALLOWLIST = ("cool", "neutral", "warm")
PROMOTION_CONFIDENCE_THRESHOLD = 0.70
DRY_RUN_CONFIDENCE = 0.75

REJECT_EVIDENCE_SPAN = "evidence_span_not_found"
REJECT_MISSING_FIELD_CONFIDENCE = "missing_field_confidence"
REJECT_VALUE_NOT_IN_ALLOWLIST = "value_not_in_allowlist"

SPOTCHECK_COLUMNS = (
  "catalogItemId",
  "brand",
  "category",
  "field",
  "extractedValue",
  "confidence",
  "evidenceSpan",
  "verdict",
  "checkedBy",
  "note",
)


class ExtractionError(ValueError):
  pass


def _default_run_date() -> str:
  return (datetime.now(tz=UTC) + timedelta(hours=9)).strftime("%Y%m%d")


def _load_env_file(path: Path) -> None:
  if not path.exists():
    return
  for line in path.read_text(encoding="utf-8").splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
      continue
    key, value = stripped.split("=", 1)
    key = key.strip()
    if not key or key in os.environ:
      continue
    os.environ[key] = value.strip().strip('"').strip("'")


def _load_local_env() -> None:
  _load_env_file(REPO_ROOT / ".env")
  _load_env_file(BACKEND_ROOT / ".env")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []
  for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
    if not line.strip():
      continue
    row = json.loads(line)
    if not isinstance(row, dict):
      raise ExtractionError(f"JSONL row must be an object at {path}:{line_number}")
    rows.append(row)
  return rows


def resolve_active_catalog_path(data_root: Path) -> Path | None:
  pointer_path = data_root / "active_snapshot.json"
  if not pointer_path.exists():
    return None
  pointer = json.loads(pointer_path.read_text(encoding="utf-8"))
  manifest_path = data_root / str(pointer.get("manifestPath") or "")
  if not manifest_path.exists():
    return None
  manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
  catalog_path = data_root / str(manifest.get("catalogPath") or "")
  return catalog_path if catalog_path.exists() else None


def build_category_allowlists(catalog_rows: list[dict[str, Any]]) -> dict[str, dict[str, list[str]]]:
  """카탈로그의 기존 colorFamily/finish/texture 어휘를 카테고리별로 집계 — 프롬프트 고정 라벨 정의서."""
  observed: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
  for row in catalog_rows:
    category = str(row.get("category") or "").strip()
    if not category:
      continue
    attributes = row.get("attributes") if isinstance(row.get("attributes"), dict) else {}
    for field in TARGET_FIELDS:
      value = attributes.get(field)
      if isinstance(value, str) and value.strip():
        observed[category][field].add(value.strip())

  allowlists: dict[str, dict[str, list[str]]] = {}
  for category, fields in observed.items():
    allowlists[category] = {
      field: sorted(values) for field, values in fields.items() if values
    }
    # undertone은 닫힌 어휘 — 관측 유무와 무관하게 3값으로 고정.
    allowlists[category]["undertone"] = list(UNDERTONE_ALLOWLIST)
  return allowlists


def build_input_text(row: dict[str, Any]) -> str:
  """상품명 + 옵션명 + (있으면) 공식 설명 텍스트 — evidenceSpan substring 검증의 기준 원문."""
  parts: list[str] = []
  for key in ("brandName", "productName", "rawTitle"):
    value = row.get(key)
    if isinstance(value, str) and value.strip():
      parts.append(value.strip())
  for option in row.get("shadeOptions") or []:
    if not isinstance(option, dict):
      continue
    for key in ("shadeName", "optionName"):
      value = option.get(key)
      if isinstance(value, str) and value.strip():
        parts.append(value.strip())
  for key in ("officialDescription", "description"):
    value = row.get(key)
    if isinstance(value, str) and value.strip():
      parts.append(value.strip())
  deduped: list[str] = []
  for part in parts:
    if part not in deduped:
      deduped.append(part)
  return "\n".join(deduped)


def build_prompt(category: str, input_text: str, allowlist: dict[str, list[str]]) -> str:
  label_lines = [
    f"- {field}: {', '.join(allowlist[field])}" if allowlist.get(field) else f"- {field}: (이 카테고리에서는 추출 금지 — null)"
    for field in TARGET_FIELDS
  ]
  return (
    f"화장품 상품 텍스트에서 속성을 추출합니다. 카테고리: {category}\n\n"
    "카테고리별 라벨 정의서 (이 목록 밖의 값은 무효):\n"
    + "\n".join(label_lines)
    + "\n\n규칙:\n"
    "1. 각 필드는 위 allowlist 값 중 하나만. 근거가 없으면 반드시 null.\n"
    "2. evidenceSpan은 입력 텍스트에 그대로 존재하는 연속 부분 문자열이어야 합니다(변형·요약 금지).\n"
    "3. confidence는 필드별로 0.0~1.0. 전체 confidence는 출력하지 마세요.\n"
    "4. JSON만 반환: {\"colorFamily\": {\"value\": ..., \"confidence\": ..., \"evidenceSpan\": ...}, "
    "\"finish\": {...}, \"texture\": {...}, \"undertone\": {...}}\n\n"
    f"입력 텍스트:\n{input_text}"
  )


def _parse_json_output(output_text: str) -> dict[str, Any] | None:
  normalized = output_text.strip()
  fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", normalized, re.DOTALL)
  if fence_match:
    normalized = fence_match.group(1).strip()
  try:
    parsed = json.loads(normalized)
  except json.JSONDecodeError:
    return None
  return parsed if isinstance(parsed, dict) else None


def _extract_output_text(response_payload: dict[str, Any]) -> str:
  # enrichment._extract_output_text 미러 (Claude messages body).
  content = response_payload.get("content")
  if isinstance(content, list):
    return "\n".join(
      str(part.get("text") or "")
      for part in content
      if isinstance(part, dict) and part.get("type") == "text"
    ).strip()
  completion = response_payload.get("completion")
  return completion.strip() if isinstance(completion, str) else ""


# dry-run 모의 응답용 한국어 표기 → allowlist 라벨 매핑 (evidenceSpan은 한국어 원문).
DRY_RUN_KOREAN_SURFACE_FORMS: dict[str, str] = {
  "핑크": "pink",
  "레드": "red",
  "코랄": "coral",
  "피치": "peach",
  "누드": "nude",
  "브라운": "brown",
  "로즈": "rose",
  "플럼": "plum",
  "모브": "mauve",
  "오렌지": "orange",
  "버건디": "burgundy",
  "블랙": "black",
  "매트": "matte",
  "글로시": "glossy",
  "벨벳": "velvet",
  "시어": "sheer",
  "쉬머": "shimmer",
  "틴트": "tint",
  "쿠션": "cushion",
  "립스틱": "lipstick",
  "글로스": "gloss",
  "팔레트": "palette",
  "파우더": "powder",
  "펜슬": "pencil",
  "스틱": "stick",
  "리퀴드": "liquid",
  "라이너": "liner",
  "마스카라": "mascara",
  "크림": "cream",
  "젤": "gel",
  "밤": "balm",
  "웜": "warm",
  "웜톤": "warm",
  "쿨": "cool",
  "쿨톤": "cool",
  "뉴트럴": "neutral",
}


class DryRunAttributeExtractionClient:
  """실호출 없는 룰 기반 모의 응답 — 게이트 로직 검증 전용.

  allowlist 값(영문) 또는 그 한국어 표기가 입력 텍스트에 나타나면 그 실제
  부분 문자열을 evidenceSpan으로 반환한다. 실재 substring이므로 게이트 ①을
  통과하는 정상 경로와, 테스트에서 주입한 비실재 스팬의 리젝 경로를 함께
  검증할 수 있다.
  """

  backend = "dry-run"

  def extract(self, *, category: str, input_text: str, allowlist: dict[str, list[str]]) -> dict[str, Any]:
    lowered = input_text.lower()
    result: dict[str, Any] = {}
    for field in TARGET_FIELDS:
      match: dict[str, Any] | None = None
      allowed = allowlist.get(field) or []
      for value in allowed:
        index = lowered.find(value.lower())
        if index >= 0:
          match = {
            "value": value,
            "confidence": DRY_RUN_CONFIDENCE,
            "evidenceSpan": input_text[index : index + len(value)],
          }
          break
      if match is None:
        for surface, label in DRY_RUN_KOREAN_SURFACE_FORMS.items():
          if label not in allowed:
            continue
          index = input_text.find(surface)
          if index >= 0:
            match = {
              "value": label,
              "confidence": DRY_RUN_CONFIDENCE,
              "evidenceSpan": input_text[index : index + len(surface)],
            }
            break
      result[field] = match
    return result


class BedrockAttributeExtractionClient:
  """backend enrichment(BedrockReasonCopyClient) 패턴 재사용 — 배치 경로라 read timeout은 넉넉히.

  모델 id는 BEDROCK_ANALYSIS_INFERENCE_ID > BEDROCK_ANALYSIS_MODEL_ID > BEDROCK_MODEL_ID.
  서울(ap-northeast-2)은 apac.anthropic.* 크로스리전 추론 프로파일 id가 필요하다 —
  bare model id는 ValidationException.
  """

  backend = "bedrock"

  def __init__(self, *, model_id: str | None = None, region: str | None = None) -> None:
    self.model_id = (
      model_id
      or os.environ.get("BEDROCK_ANALYSIS_INFERENCE_ID")
      or os.environ.get("BEDROCK_ANALYSIS_MODEL_ID")
      or os.environ.get("BEDROCK_MODEL_ID")
      or ""
    ).strip()
    self.region = (
      region
      or os.environ.get("BEDROCK_ANALYSIS_REGION")
      or os.environ.get("AWS_REGION")
      or "ap-northeast-2"
    ).strip()

  def _bedrock_runtime_client(self):
    import boto3
    from botocore.config import Config

    client_kwargs: dict[str, Any] = {
      "region_name": self.region,
      "config": Config(connect_timeout=5, read_timeout=60, retries={"max_attempts": 2}),
    }
    access_key = os.environ.get("AWS_ACCESS_KEY_ID")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
    if access_key and secret_key:
      client_kwargs.update(
        {
          "aws_access_key_id": access_key,
          "aws_secret_access_key": secret_key,
        },
      )
    return boto3.client("bedrock-runtime", **client_kwargs)

  def extract(self, *, category: str, input_text: str, allowlist: dict[str, list[str]]) -> dict[str, Any]:
    if not self.model_id:
      raise ExtractionError(
        "Bedrock model id missing — set BEDROCK_ANALYSIS_INFERENCE_ID (apac.* inference profile) "
        "or run with --dry-run",
      )
    response = self._bedrock_runtime_client().invoke_model(
      modelId=self.model_id,
      body=json.dumps(
        {
          "anthropic_version": "bedrock-2023-05-31",
          "max_tokens": 500,
          "temperature": 0.0,
          "system": (
            "당신은 화장품 카탈로그 속성 추출기입니다. 반드시 JSON만 반환하고, "
            "evidenceSpan은 입력 텍스트의 연속 부분 문자열만 사용합니다."
          ),
          "messages": [
            {
              "role": "user",
              "content": [
                {"type": "text", "text": build_prompt(category, input_text, allowlist)},
              ],
            },
          ],
        },
        ensure_ascii=False,
      ),
      accept="application/json",
      contentType="application/json",
    )
    response_payload = json.loads(response["body"].read())
    parsed = _parse_json_output(_extract_output_text(response_payload))
    return parsed if isinstance(parsed, dict) else {}


def apply_field_gates(
  raw_extraction: dict[str, Any],
  *,
  input_text: str,
  allowlist: dict[str, list[str]],
) -> dict[str, dict[str, Any]]:
  """비협상 게이트 — 필드 단위 accept/reject 판정.

  raw_extraction의 top-level 'confidence' 키(전체 confidence)는 어떤 경우에도
  필드 confidence의 폴백으로 쓰지 않는다(게이트 ②).
  """
  gated: dict[str, dict[str, Any]] = {}
  for field in TARGET_FIELDS:
    payload = raw_extraction.get(field)
    if not isinstance(payload, dict) or payload.get("value") in {None, ""}:
      gated[field] = {"status": "empty"}
      continue

    value = str(payload.get("value")).strip()
    evidence_span = payload.get("evidenceSpan")
    confidence = payload.get("confidence")

    if not isinstance(evidence_span, str) or not evidence_span or evidence_span not in input_text:
      gated[field] = {
        "status": "rejected",
        "rejectReason": REJECT_EVIDENCE_SPAN,
        "value": value,
      }
      continue

    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
      gated[field] = {
        "status": "rejected",
        "rejectReason": REJECT_MISSING_FIELD_CONFIDENCE,
        "value": value,
      }
      continue

    confidence = float(confidence)
    if confidence < 0.0 or confidence > 1.0:
      gated[field] = {
        "status": "rejected",
        "rejectReason": REJECT_MISSING_FIELD_CONFIDENCE,
        "value": value,
      }
      continue

    allowed = allowlist.get(field) or []
    if value not in allowed:
      gated[field] = {
        "status": "rejected",
        "rejectReason": REJECT_VALUE_NOT_IN_ALLOWLIST,
        "value": value,
      }
      continue

    gated[field] = {
      "status": "accepted",
      "value": value,
      "confidence": confidence,
      "evidenceSpan": evidence_span,
      # 게이트 ③: conf≥0.70은 '승격 후보'일 뿐 — hardFilterEligible 승격은
      # 사람 스팟체크 통과 배치에서만 일어난다 (이 파일은 review 큐).
      "promotionCandidate": confidence >= PROMOTION_CONFIDENCE_THRESHOLD,
    }
  return gated


def extract_row(
  row: dict[str, Any],
  *,
  client: Any,
  allowlists: dict[str, dict[str, list[str]]],
  run_date: str,
) -> dict[str, Any] | None:
  category = str(row.get("category") or "").strip()
  if not category or category not in allowlists:
    return None
  input_text = build_input_text(row)
  if not input_text:
    return None
  allowlist = allowlists[category]
  raw_extraction = client.extract(category=category, input_text=input_text, allowlist=allowlist)
  gated = apply_field_gates(raw_extraction, input_text=input_text, allowlist=allowlist)
  return {
    "backend": client.backend,
    "brandName": row.get("brandName"),
    "catalogItemId": row.get("catalogItemId"),
    "category": category,
    "extractorVersion": EXTRACTOR_VERSION,
    "fields": gated,
    "inputTextSha256": hashlib.sha256(input_text.encode("utf-8")).hexdigest(),
    "mergePolicy": "review_queue_only__never_direct_seed_merge",
    "productName": row.get("productName"),
    "runDate": run_date,
    "schema": OUTPUT_SCHEMA,
  }


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
  counters = {
    "accepted": 0,
    "empty": 0,
    "promotionCandidates": 0,
    "rejected": 0,
  }
  reject_reasons: dict[str, int] = defaultdict(int)
  for result in results:
    for payload in result["fields"].values():
      status = payload["status"]
      if status == "accepted":
        counters["accepted"] += 1
        if payload.get("promotionCandidate"):
          counters["promotionCandidates"] += 1
      elif status == "rejected":
        counters["rejected"] += 1
        reject_reasons[str(payload.get("rejectReason"))] += 1
      else:
        counters["empty"] += 1
  return {**counters, "itemCount": len(results), "rejectReasons": dict(reject_reasons)}


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
  )


def write_spotcheck_csv(path: Path, results: list[dict[str, Any]]) -> int:
  import csv

  path.parent.mkdir(parents=True, exist_ok=True)
  row_count = 0
  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=SPOTCHECK_COLUMNS)
    writer.writeheader()
    for result in results:
      for field, payload in result["fields"].items():
        if payload.get("status") != "accepted" or not payload.get("promotionCandidate"):
          continue
        writer.writerow(
          {
            "catalogItemId": result.get("catalogItemId"),
            "brand": result.get("brandName"),
            "category": result.get("category"),
            "field": field,
            "extractedValue": payload.get("value"),
            "confidence": payload.get("confidence"),
            "evidenceSpan": payload.get("evidenceSpan"),
            # verdict/checkedBy/note는 사람만 기입.
            "verdict": "",
            "checkedBy": "",
            "note": "",
          },
        )
        row_count += 1
  return row_count


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Batch-extract Auradin attributes with an LLM into a human review queue (B3, §6.4-2).",
  )
  parser.add_argument("--input", type=Path, required=True, help="카탈로그/시드 jsonl")
  parser.add_argument(
    "--vocab-source",
    type=Path,
    default=None,
    help="allowlist 집계용 카탈로그 jsonl (기본: active_snapshot 카탈로그)",
  )
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--output", type=Path, default=None)
  parser.add_argument("--spotcheck-output", type=Path, default=None)
  parser.add_argument("--data-root", type=Path, default=REPO_ROOT / "data" / "auradin")
  parser.add_argument("--max-items", type=int, default=0, help="0이면 전체")
  parser.add_argument("--model-id", default=None)
  parser.add_argument("--region", default=None)
  parser.add_argument("--request-delay-seconds", type=float, default=0.5)
  parser.add_argument(
    "--dry-run",
    action="store_true",
    help="Bedrock 실호출 없이 룰 기반 모의 응답으로 게이트 로직 검증.",
  )
  return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
  args = parse_args(argv)
  if not args.dry_run:
    # dry-run은 Bedrock 자격증명이 불필요하다. .env 주입은 실호출에만 —
    # 테스트가 main()을 호출할 때 프로세스 env(BEDROCK_*)를 오염시켜
    # 이후 생성되는 Settings의 분기(질문 카피 등)를 바꾸는 사고 방지.
    _load_local_env()
  try:
    input_rows = read_jsonl(args.input)
    vocab_path = args.vocab_source or resolve_active_catalog_path(args.data_root)
    if vocab_path is None:
      raise ExtractionError("vocab source not found — pass --vocab-source explicitly")
    allowlists = build_category_allowlists(read_jsonl(vocab_path))
    if not allowlists:
      raise ExtractionError(f"no category vocabulary found in {vocab_path}")

    if args.dry_run:
      client: Any = DryRunAttributeExtractionClient()
    else:
      client = BedrockAttributeExtractionClient(model_id=args.model_id, region=args.region)

    if args.max_items > 0:
      input_rows = input_rows[: args.max_items]

    results: list[dict[str, Any]] = []
    for index, row in enumerate(input_rows):
      result = extract_row(row, client=client, allowlists=allowlists, run_date=args.date)
      if result is not None:
        results.append(result)
      if not args.dry_run and index + 1 < len(input_rows) and args.request_delay_seconds > 0:
        time.sleep(args.request_delay_seconds)

    output_path = args.output or (
      args.data_root / "review" / f"llm_attribute_extraction_{args.date}.jsonl"
    )
    spotcheck_path = args.spotcheck_output or (
      args.data_root / "review" / f"llm_attribute_spotcheck_{args.date}.csv"
    )
    write_jsonl(output_path, results)
    spotcheck_rows = write_spotcheck_csv(spotcheck_path, results)

    summary = summarize(results)
    print(
      json.dumps(
        {
          **summary,
          "backend": client.backend,
          "output": str(output_path),
          "spotcheck": str(spotcheck_path),
          "spotcheckRowCount": spotcheck_rows,
          "vocabSource": str(vocab_path),
        },
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
      ),
    )
    return 0
  except (OSError, ExtractionError, json.JSONDecodeError) as exc:
    print(f"llm attribute extraction failed: {exc}", file=sys.stderr)
    return 1


if __name__ == "__main__":
  raise SystemExit(main())
