"""B7 §7.3 — auradin_events → user_taste_profile 배치 계산 (새도 모드 산출물).

owner_subject별로 save=3 / purchase_click=2 / product_open=1 / hide=-3 가중치와
반감기 30일 지수감쇠로 attrAffinity/brandAffinity/brandAvoid/priceBand(p25~p75)를
계산한다. 콜드스타트(복수 세션·복수 일자 actionable 5건 미만) owner는 건너뛴다.

DB 없이도 동작한다(테이블 생성은 비범위 — 출력은 jsonl):

  cd services/backend
  # jsonl 모드 (DB 불필요 — 이벤트 export/샘플로 로컬 계산)
  python scripts/build_auradin_taste_profiles.py \
    --events-jsonl events.jsonl --output profiles.jsonl
  # DB 모드 (auradin_events 테이블 직접 조회)
  python scripts/build_auradin_taste_profiles.py \
    --database-url postgresql://... --output profiles.jsonl

출력 행: {"ownerSubject": ..., "profile": {...}} — serving은
settings.auradin_taste_profiles_path로 이 파일을 읽는다(새도 로깅/anchor 스왑).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

# 백엔드 루트(services/backend)를 임포트 경로에 추가 — pytest의 `pythonpath = .`과 동일.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.auradin_agent.taste_profile import (  # noqa: E402
  EVENT_WEIGHTS,
  build_taste_profile,
)


def _read_events_jsonl(path: str) -> list[dict[str, Any]]:
  events: list[dict[str, Any]] = []
  with open(path, encoding="utf-8") as handle:
    for line_number, line in enumerate(handle, start=1):
      line = line.strip()
      if not line:
        continue
      try:
        row = json.loads(line)
      except json.JSONDecodeError:
        print(f"[warn] skip malformed jsonl line {line_number}", file=sys.stderr)
        continue
      if isinstance(row, dict):
        events.append(row)
  return events


async def _read_events_db(database_url: str) -> list[dict[str, Any]]:
  import asyncpg  # 지연 임포트 — jsonl 모드는 DB 드라이버 없이 동작해야 한다

  connection = await asyncpg.connect(database_url)
  try:
    rows = await connection.fetch(
      """
      select owner_subject, session_id, event_type, product_id, occurred_at
      from auradin_events
      where event_type = any($1::text[])
      """,
      list(EVENT_WEIGHTS),
    )
  finally:
    await connection.close()
  return [dict(row) for row in rows]


def _load_catalog(catalog_jsonl: str | None) -> Any:
  if catalog_jsonl:
    items: dict[str, dict[str, Any]] = {}
    with open(catalog_jsonl, encoding="utf-8") as handle:
      for line in handle:
        line = line.strip()
        if not line:
          continue
        try:
          item = json.loads(line)
        except json.JSONDecodeError:
          continue
        item_id = str(item.get("id") or "").strip()
        if item_id:
          items[item_id] = item
    return items
  from app.services.auradin_agent.catalog_loader import get_catalog

  return get_catalog()


def _owner_of(event: dict[str, Any]) -> str:
  return str(event.get("ownerSubject") or event.get("owner_subject") or "").strip()


def build_profiles(
  events: list[dict[str, Any]],
  *,
  catalog: Any,
  now: datetime,
) -> tuple[dict[str, dict[str, Any]], int]:
  """owner→profile 맵과 콜드스타트로 건너뛴 owner 수를 돌려준다."""
  by_owner: dict[str, list[dict[str, Any]]] = {}
  for event in events:
    owner = _owner_of(event)
    if owner:
      by_owner.setdefault(owner, []).append(event)

  profiles: dict[str, dict[str, Any]] = {}
  skipped = 0
  for owner, owner_events in sorted(by_owner.items()):
    profile = build_taste_profile(owner_events, catalog=catalog, now=now)
    if profile is None:
      skipped += 1
      continue
    profiles[owner] = profile
  return profiles, skipped


def main(argv: list[str] | None = None) -> int:
  parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
  source = parser.add_mutually_exclusive_group(required=True)
  source.add_argument("--events-jsonl", help="이벤트 jsonl 경로 (DB 없이 동작하는 모드)")
  source.add_argument("--database-url", help="auradin_events를 직접 조회할 Postgres URL")
  parser.add_argument(
    "--catalog-jsonl",
    help="product_id→attributes 조인용 카탈로그 jsonl (생략 시 active snapshot 카탈로그)",
  )
  parser.add_argument("--output", required=True, help="user_taste_profile jsonl 출력 경로")
  parser.add_argument("--now", help="감쇠 기준 시각 ISO8601 (생략 시 현재 UTC — 테스트/재현용)")
  args = parser.parse_args(argv)

  now = (
    datetime.fromisoformat(args.now.replace("Z", "+00:00"))
    if args.now
    else datetime.now(tz=timezone.utc)
  )
  if now.tzinfo is None:
    now = now.replace(tzinfo=timezone.utc)

  if args.events_jsonl:
    events = _read_events_jsonl(args.events_jsonl)
  else:
    events = asyncio.run(_read_events_db(args.database_url))

  catalog = _load_catalog(args.catalog_jsonl)
  profiles, skipped = build_profiles(events, catalog=catalog, now=now)

  output_dir = os.path.dirname(os.path.abspath(args.output))
  os.makedirs(output_dir, exist_ok=True)
  with open(args.output, "w", encoding="utf-8") as handle:
    for owner, profile in profiles.items():
      handle.write(json.dumps({"ownerSubject": owner, "profile": profile}, ensure_ascii=False) + "\n")

  print(
    json.dumps(
      {
        "events": len(events),
        "owners": len({_owner_of(event) for event in events if _owner_of(event)}),
        "profilesWritten": len(profiles),
        "coldStartSkipped": skipped,
        "output": args.output,
        "now": now.isoformat(),
      },
      ensure_ascii=False,
    ),
  )
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
