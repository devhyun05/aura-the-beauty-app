"""Auradin §11 레인 A — 2단계 얇은 수직 슬라이스 데모.

실데이터 1질의("글리터 추천해줘")를 랭킹 파이프라인에 직접 통과시켜
§5(floor → relevance → MMR → 3역할)와 §6(구조화 근거)을 JSON으로 눈검증한다.

  cd services/backend && AURADIN_RUN_DATE=20260706 python3 scripts/auradin_glitter_slice.py
  cd services/backend && python3 scripts/auradin_glitter_slice.py "플럼 립 2만원 이하"

질문 루프(§7/§8)는 슬라이스 범위 밖 — 랭킹 계약만 검증한다.
"""

from __future__ import annotations

import json
import os
import sys

os.environ.setdefault("AURADIN_RUN_DATE", "20260706")
# 백엔드 루트(services/backend)를 임포트 경로에 추가 — pytest의 `pythonpath = .`과 동일.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.settings import Settings  # noqa: E402
from app.services.auradin_agent.catalog_loader import load_mvp_catalog  # noqa: E402
from app.services.auradin_agent.intent_parser import parse_intent  # noqa: E402
from app.services.auradin_agent.ranking import build_slice_result  # noqa: E402
from app.services.auradin_agent.retrieval_service import retrieve_and_rank  # noqa: E402

GLITTER_TERMS = ("글리터", "반짝", "스파클", "glitter", "sparkle")


def run_slice(prompt: str, *, lambda_: float = 0.7, s_floor: float = 0.5) -> dict:
  catalog = load_mvp_catalog()
  intent = parse_intent(prompt)
  retrieval = retrieve_and_rank(catalog, intent, [], settings=Settings(database_url=None))

  # '글리터'는 카탈로그에 없는 마감 → 아이섀도우·쉬머로 해석했음을 근거에 투명하게 남긴다 (§6/§9).
  extra_caveats = None
  if any(term.lower() in prompt.lower() for term in GLITTER_TERMS):
    extra_caveats = ["'글리터'는 카탈로그 기준 아이섀도우·쉬머 계열로 해석했어요"]

  slice_result = build_slice_result(
    retrieval["ranked"],
    lambda_=lambda_,
    s_floor=s_floor,
    hard_filters=retrieval["hardFilters"],
    extra_caveats=extra_caveats,
  )
  return {
    "query": prompt,
    "intent": {
      "category": intent["category"],
      "lockedFilters": [f["attribute"] for f in intent["lockedFilters"]],
      "softPreferences": [(s["attribute"], s["values"]) for s in intent["softPreferences"]],
      "broad": intent["broad"],
    },
    "retrieval": {
      "candidatesAfterFilters": retrieval["candidateCountAfterFilters"],
      "backend": retrieval["retrievalBackend"],
    },
    "slice": {
      "rankedCount": slice_result["rankedCount"],
      "floorCount": slice_result["floorCount"],
      "topScoreGap": slice_result["topScoreGap"],
      "lambda": slice_result["lambda"],
      "sFloor": slice_result["sFloor"],
    },
    "products": [
      {
        "role": p["role"],
        "source": p["source"],
        "brandName": p["brandName"],
        "productName": p["productName"],
        "category": p["category"],
        "shadeName": p["shadeName"],
        "matchRate": p["matchRate"],
        "price": p["price"],
        "palette": p["palette"],
        "reason": p["reason"],
      }
      for p in slice_result["products"]
    ],
  }


def main() -> None:
  prompt = sys.argv[1] if len(sys.argv) > 1 else "글리터 추천해줘"
  result = run_slice(prompt)
  print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
  main()
