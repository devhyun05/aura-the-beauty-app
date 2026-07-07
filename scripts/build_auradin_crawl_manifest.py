"""AURADIN 카탈로그 확장 크롤 매니페스트 생성기 (네트워크 없음).

Codex 크롤 실행 에이전트가 소비할 "무엇을·어떤 목표로·어떤 명령으로" 수집할지의 단일 소스.
17개 화이트리스트 브랜드 × 세부 카테고리(subcategory) 슬롯을 열거하고, 브랜드를 웨이브로
묶어 기존 `run_auradin_targeted_slot_collection.py` 호출 커맨드를 함께 산출한다.

실제 NAVER 접속·수집은 이 스크립트가 하지 않는다 (분업: 파이프라인=Claude, 접속·크롤=Codex).
산출물: JSON 매니페스트 + 사람이 읽는 마크다운 체크리스트.

사용:
  python scripts/build_auradin_crawl_manifest.py --date 20260708 \
    --per-subcategory 15 --brands-per-wave 4
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_catalog.brand_aliases import BRAND_PRIORITY  # noqa: E402
from app.services.auradin_catalog.category_queries import (  # noqa: E402
  COLLECTABLE_CATEGORIES,
  SUBCATEGORIES,
  SUBCATEGORIES_BY_CATEGORY,
)

# 수집 계약 하드 룰 — 매니페스트에 박아 Codex가 반드시 지키게 한다 (AURADIN.md §9/§10).
CONSTRAINTS: list[str] = [
  "메타데이터만 저장 — 원본 HTML/리뷰/성분/원본 이미지 파일 저장 금지 (quality.py가 차단).",
  "401/403/429/캡차/로그인 벽 → 'blocked'로 기록하고 우회 금지.",
  "OliveYoung 상세·스마트스토어(JS)·HTTP 차단 브랜드는 수집 대상에서 제외 (positive 입점 증거만 허용).",
  "colorHex/colorLab 저장 금지, madeInCountry 신규 수집 금지.",
  "속성은 신뢰도 ≥0.65 + 결정적 신호일 때만 hard-filter eligible — 제목/오퍼 추론은 ≤0.62.",
  "미확인 입점은 부정(false)이 아니다 — unknown으로 남긴다.",
  "브랜드 화이트리스트(17개) 밖은 수집하지 않는다.",
]


def _default_run_date() -> str:
  return (datetime.now(tz=UTC) + timedelta(hours=9)).strftime("%Y%m%d")


def _split_csv(value: str | None) -> list[str] | None:
  if not value:
    return None
  items = [item.strip() for item in value.split(",") if item.strip()]
  return items or None


def _ordered_brands(brands: list[str] | None) -> list[str]:
  return sorted(brands or list(BRAND_PRIORITY), key=lambda brand: BRAND_PRIORITY.get(brand, 999))


def _max_subcats_per_category() -> int:
  return max((len(ids) for ids in SUBCATEGORIES_BY_CATEGORY.values()), default=1)


def _resolved_queries(brand: str, subcategory_id: str) -> list[str]:
  return [template.format(brand=brand) for template in SUBCATEGORIES[subcategory_id]["queries"]]


def _build_slots(brands: list[str], per_subcategory: int) -> list[dict[str, Any]]:
  slots: list[dict[str, Any]] = []
  for brand in brands:
    for category in COLLECTABLE_CATEGORIES:
      for subcategory_id in SUBCATEGORIES_BY_CATEGORY.get(category, ()):
        slots.append(
          {
            "brand": brand,
            "category": category,
            "subcategory": subcategory_id,
            "label": SUBCATEGORIES[subcategory_id]["label"],
            "target": per_subcategory,
            "queries": _resolved_queries(brand, subcategory_id),
          },
        )
  return slots


def _chunk(items: list[str], size: int) -> list[list[str]]:
  return [items[index : index + size] for index in range(0, len(items), max(1, size))]


def _wave_command(date: str, brands: list[str], per_category_top_n: int) -> str:
  brand_arg = ",".join(brands)
  return (
    "python scripts/run_auradin_targeted_slot_collection.py "
    f"--date {date} "
    f"--brands '{brand_arg}' "
    f"--top-n {per_category_top_n} "
    "--display 100 "
    "--request-delay-seconds 0.5 "
    "--naverpay-only"
  )


def _build_waves(
  brands: list[str],
  *,
  date: str,
  brands_per_wave: int,
  per_category_top_n: int,
) -> list[dict[str, Any]]:
  waves: list[dict[str, Any]] = []
  for index, group in enumerate(_chunk(brands, brands_per_wave), start=1):
    waves.append(
      {
        "wave": index,
        "kind": "naver_api",
        "brands": group,
        "expectedSlots": len(group) * len(COLLECTABLE_CATEGORIES),
        "command": _wave_command(date, group, per_category_top_n),
      },
    )
  return waves


def _write_report(path: Path, manifest: dict[str, Any]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  lines: list[str] = [
    f"# AURADIN 크롤 매니페스트 — {manifest['date']}",
    "",
    f"- 브랜드: {len(manifest['brands'])}개 · 세부 카테고리: {len(manifest['subcategories'])}종",
    f"- 세부 카테고리 목표: 슬롯당 {manifest['perSubcategoryTarget']}개 (최소 10)",
    f"- 카테고리 수집 top-n: {manifest['perCategoryTopN']} (세부 카테고리 목표 × 최대 세부 수)",
    f"- 웨이브: {len(manifest['waves'])}개 (브랜드 {manifest['brandsPerWave']}개/웨이브)",
    f"- 총 슬롯(브랜드×세부): {len(manifest['slots'])}",
    "",
    "## 사전 준비 (Codex, 웨이브 실행 전 1회)",
    "",
    "- `NAVER_SHOPPING_CLIENT_ID` / `NAVER_SHOPPING_CLIENT_SECRET` 환경변수 필요.",
    "- 각 웨이브 커맨드는 `data/auradin/processed/product_candidates_<date>.jsonl`를 base로 읽는다.",
    "  없으면 `--base-candidates <기존 candidates.jsonl>`로 지정하거나 Wave 0(초기 수집)을 먼저 돌린다.",
    "- 먼저 `--dry-run`으로 질의 목록을 확인한 뒤 실제 수집을 실행할 것.",
    "",
    "## 웨이브 (NAVER 쇼핑 API)",
    "",
  ]
  for wave in manifest["waves"]:
    lines.append(f"### Wave {wave['wave']} — {', '.join(wave['brands'])}")
    lines.append("")
    lines.append(f"- 예상 슬롯(브랜드×대분류): {wave['expectedSlots']}")
    lines.append("- dry-run: `" + wave["command"] + " --dry-run`")
    lines.append("- 실행: `" + wave["command"] + "`")
    lines.append("")
  lines.extend(["## 세부 카테고리 슬롯 목표", "", "| 대분류 | 세부 카테고리 | 라벨 | 질의 템플릿 |", "|---|---|---|---|"])
  for subcategory in manifest["subcategories"]:
    templates = " · ".join(subcategory["queryTemplates"])
    lines.append(
      f"| {subcategory['category']} | {subcategory['id']} | {subcategory['label']} | {templates} |",
    )
  lines.extend(["", "## 수집 계약 (반드시 준수)", ""])
  lines.extend(f"- {rule}" for rule in manifest["constraints"])
  lines.extend(
    [
      "",
      "## 검증 (수집 후)",
      "",
      "- `python scripts/report_auradin_crawl_coverage.py --date <date>` 로 브랜드×세부 커버리지 갭 확인.",
      "- 슬롯당 구매가능(is_purchasable) 후보 ≥10 미달 슬롯은 해당 세부 카테고리 질의로 재수집.",
      "",
    ],
  )
  path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_manifest(
  *,
  date: str,
  brands: list[str],
  per_subcategory: int,
  brands_per_wave: int,
) -> dict[str, Any]:
  per_category_top_n = min(80, max(per_subcategory, per_subcategory * _max_subcats_per_category()))
  subcategories = [
    {
      "id": subcategory_id,
      "category": meta["category"],
      "label": meta["label"],
      "queryTemplates": list(meta["queries"]),
    }
    for subcategory_id, meta in SUBCATEGORIES.items()
  ]
  return {
    "schema": "auradin-crawl-manifest.v1",
    "date": date,
    "perSubcategoryTarget": per_subcategory,
    "perSubcategoryMin": 10,
    "perCategoryTopN": per_category_top_n,
    "brandsPerWave": brands_per_wave,
    "brands": brands,
    "categories": list(COLLECTABLE_CATEGORIES),
    "subcategories": subcategories,
    "waves": _build_waves(
      brands,
      date=date,
      brands_per_wave=brands_per_wave,
      per_category_top_n=per_category_top_n,
    ),
    "slots": _build_slots(brands, per_subcategory),
    "constraints": CONSTRAINTS,
  }


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Build the AURADIN catalog crawl manifest (no network).")
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--brands", help="쉼표구분 브랜드 목록 (기본: 화이트리스트 17개 우선순위 순).")
  parser.add_argument("--per-subcategory", type=int, default=15, help="세부 카테고리 슬롯당 목표 수량 (기본 15).")
  parser.add_argument("--brands-per-wave", type=int, default=4)
  parser.add_argument("--output", type=Path)
  parser.add_argument("--report", type=Path)
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  if args.per_subcategory < 10:
    print("--per-subcategory must be >= 10 (요구: 세부 카테고리별 10~20개).", file=sys.stderr)
    return 2

  brands = _ordered_brands(_split_csv(args.brands))
  manifest = build_manifest(
    date=args.date,
    brands=brands,
    per_subcategory=args.per_subcategory,
    brands_per_wave=max(1, args.brands_per_wave),
  )

  output_path = args.output or REPO_ROOT / "data" / "auradin" / "manifests" / f"crawl_manifest_{args.date}.json"
  report_path = args.report or REPO_ROOT / "reports" / "auradin" / f"crawl_manifest_{args.date}.md"
  output_path.parent.mkdir(parents=True, exist_ok=True)
  output_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
  _write_report(report_path, manifest)

  print(
    json.dumps(
      {
        "manifest": str(output_path.relative_to(REPO_ROOT)),
        "report": str(report_path.relative_to(REPO_ROOT)),
        "brands": len(brands),
        "subcategories": len(manifest["subcategories"]),
        "slots": len(manifest["slots"]),
        "waves": len(manifest["waves"]),
        "perCategoryTopN": manifest["perCategoryTopN"],
        "estimatedTargetProducts": len(manifest["slots"]) * args.per_subcategory,
      },
      ensure_ascii=False,
      indent=2,
      sort_keys=True,
    ),
  )
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
