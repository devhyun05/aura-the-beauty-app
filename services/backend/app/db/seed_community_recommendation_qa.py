"""Seed real QA rows for the community recommendation pipeline.

The rows inserted by this script intentionally keep embedding = null. Run
`python -m app.db.backfill_embeddings` afterward to generate Bedrock Titan
embeddings and exercise /community/threads/recommended end-to-end.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import uuid
from typing import Any

from app.core.settings import get_settings
from app.db.connection_config import connect_database

QA_NAMESPACE = uuid.UUID("2f1767a1-3959-4f57-a944-77fb2fc563b5")
QA_AUTH_PROVIDER = "google"
QA_REPORT_REQUEST_ID = "community-qa-bedrock-recommendation-report"
QA_EVENT_TYPES = ("save", "like", "dwell", "view")

POSTS: list[dict[str, Any]] = [
  {
    "key": "glass-coral-base",
    "author_sub": "community-qa-reco-01",
    "author_nickname": "qa.glow.archive",
    "category": "lookbook",
    "title": "맑은 코랄 베이스 루틴",
    "body": "얇은 글로우 베이스에 코랄 립을 올린 데일리 룩. 맑은 톤, 투명한 피부 표현, 출근 메이크업 추천 검증용 게시글입니다.",
    "mood_tags": ["글로우", "코랄", "맑은톤"],
    "situation_tags": ["데일리", "출근"],
    "difficulty": "easy",
    "duration_minutes": 9,
    "products": {"base": [{"name": "글로우 파운데이션", "shade": "21N1"}], "eye": [], "cheek": [{"name": "코랄 블러셔"}], "lip": [{"name": "코랄 틴트"}]},
    "counts": {"likes": 184, "replies": 8, "saves": 96, "views": 1600},
  },
  {
    "key": "muted-rose-combo",
    "author_sub": "community-qa-reco-02",
    "author_nickname": "qa.mute.palette",
    "category": "product_combo",
    "title": "뮤트 로즈 제품 조합",
    "body": "채도 낮은 로즈 립과 치크를 같이 쓴 제품 조합. 차분한 데일리 톤과 약속 메이크업 추천 검증용입니다.",
    "mood_tags": ["뮤트", "로즈", "차분한톤"],
    "situation_tags": ["데일리", "약속"],
    "difficulty": None,
    "duration_minutes": None,
    "products": {"base": [], "eye": [{"name": "로즈 브라운 섀도"}], "cheek": [{"name": "뮤트 치크"}], "lip": [{"name": "로즈 립"}]},
    "counts": {"likes": 142, "replies": 5, "saves": 88, "views": 1200},
  },
  {
    "key": "clean-before-after",
    "author_sub": "community-qa-reco-03",
    "author_nickname": "qa.soft.after",
    "category": "before_after",
    "title": "피부톤 정리 비포애프터",
    "body": "칙칙함을 줄이고 밝은 베이스로 정리한 비포애프터. 클린 베이스, 세미매트 쿠션, 사진용 메이크업 추천 검증용입니다.",
    "mood_tags": ["클린", "베이스", "밝은톤"],
    "situation_tags": ["데일리", "사진"],
    "difficulty": "easy",
    "duration_minutes": 8,
    "products": {"base": [{"name": "톤업 베이스"}, {"name": "세미매트 쿠션"}], "eye": [], "cheek": [], "lip": []},
    "counts": {"likes": 219, "replies": 12, "saves": 104, "views": 2100},
  },
  {
    "key": "soft-brow-eye",
    "author_sub": "community-qa-reco-04",
    "author_nickname": "qa.brow.note",
    "category": "question",
    "title": "브로우 톤 질문",
    "body": "헤어 컬러와 브로우 컬러가 따로 노는지 봐달라는 질문형 룩. 소프트 브로우와 내추럴 아이 메이크업 추천 후보 검증용입니다.",
    "mood_tags": ["브로우", "소프트", "내추럴"],
    "situation_tags": ["상담", "데일리"],
    "difficulty": None,
    "duration_minutes": None,
    "products": {"base": [], "eye": [{"name": "애쉬 브로우 펜슬"}], "cheek": [], "lip": []},
    "counts": {"likes": 77, "replies": 14, "saves": 38, "views": 900},
  },
  {
    "key": "berry-lip-layer",
    "author_sub": "community-qa-reco-05",
    "author_nickname": "qa.lip.layer",
    "category": "product_combo",
    "title": "베리 립 레이어링",
    "body": "맑은 베리 틴트 위에 투명 글로스를 얹은 립 조합. 쿨톤 립 포인트와 주말 메이크업 추천 검증용입니다.",
    "mood_tags": ["베리", "글로스", "립포인트"],
    "situation_tags": ["주말", "약속"],
    "difficulty": None,
    "duration_minutes": None,
    "products": {"base": [], "eye": [], "cheek": [{"name": "라벤더 핑크 치크"}], "lip": [{"name": "베리 틴트"}, {"name": "클리어 글로스"}]},
    "counts": {"likes": 165, "replies": 7, "saves": 91, "views": 1320},
  },
  {
    "key": "semi-matte-office",
    "author_sub": "community-qa-reco-06",
    "author_nickname": "qa.office.base",
    "category": "lookbook",
    "title": "세미매트 출근 메이크업",
    "body": "무너짐을 줄인 세미매트 베이스와 뉴트럴 아이 팔레트를 쓴 출근 룩. 지속력과 깔끔한 피부 표현 추천 검증용입니다.",
    "mood_tags": ["세미매트", "뉴트럴", "지속력"],
    "situation_tags": ["출근", "장시간"],
    "difficulty": "medium",
    "duration_minutes": 12,
    "products": {"base": [{"name": "롱웨어 쿠션", "shade": "21N"}], "eye": [{"name": "뉴트럴 팔레트"}], "cheek": [], "lip": [{"name": "누드 로즈 립"}]},
    "counts": {"likes": 121, "replies": 6, "saves": 73, "views": 1110},
  },
]


def qa_uuid(name: str) -> uuid.UUID:
  return uuid.uuid5(QA_NAMESPACE, name)


def qa_thread_ids() -> list[uuid.UUID]:
  return [qa_uuid(f"thread:{post['key']}") for post in POSTS]


def qa_media_ids() -> list[uuid.UUID]:
  return [qa_uuid(f"media:{post['key']}") for post in POSTS]


async def cleanup(connection: Any) -> dict[str, str]:
  thread_ids = qa_thread_ids()
  media_ids = qa_media_ids()
  await connection.execute("delete from community_events where thread_id = any($1::uuid[])", thread_ids)
  await connection.execute("delete from community_thread_likes where thread_id = any($1::uuid[])", thread_ids)
  await connection.execute("delete from community_thread_saves where thread_id = any($1::uuid[])", thread_ids)
  await connection.execute("delete from community_thread_media where thread_id = any($1::uuid[])", thread_ids)
  deleted_threads = await connection.execute("delete from community_threads where id = any($1::uuid[])", thread_ids)
  await connection.execute("delete from media_assets where id = any($1::uuid[])", media_ids)
  deleted_reports = await connection.execute("delete from analysis_reports where request_id = $1", QA_REPORT_REQUEST_ID)
  deleted_users = await connection.execute("delete from users where oauth_sub like 'community-qa-reco-%'")
  return {"deletedThreads": deleted_threads, "deletedReports": deleted_reports, "deletedUsers": deleted_users}


async def find_target_user(connection: Any, explicit_user_id: str | None) -> uuid.UUID:
  if explicit_user_id:
    target_id = uuid.UUID(explicit_user_id)
    exists = await connection.fetchval("select exists(select 1 from users where id = $1 and deleted_at is null)", target_id)
    if not exists:
      raise RuntimeError("--target-user-id does not match an active user.")
    return target_id

  row = await connection.fetchrow(
    """
    select author_user_id
    from community_threads
    where deleted_at is null
      and author_user_id not in (select id from users where oauth_sub like 'community-qa-reco-%')
    group by author_user_id
    order by count(*) desc, max(created_at) desc
    limit 1
    """,
  )
  if row is None:
    raise RuntimeError("No non-QA community author exists. Create one user post first or pass --target-user-id.")
  return row["author_user_id"]


async def upsert_qa_user(connection: Any, *, oauth_sub: str, nickname: str) -> uuid.UUID:
  row = await connection.fetchrow(
    """
    select id from users
    where auth_provider = $1 and oauth_sub = $2 and deleted_at is null
    limit 1
    """,
    QA_AUTH_PROVIDER,
    oauth_sub,
  )
  if row:
    await connection.execute("update users set nickname = $2, updated_at = now() where id = $1", row["id"], nickname)
    return row["id"]

  return await connection.fetchval(
    """
    insert into users (auth_provider, oauth_sub, email, name, nickname, tags)
    values ($1, $2, $3, $4, $5, $6::text[])
    returning id
    """,
    QA_AUTH_PROVIDER,
    oauth_sub,
    f"{oauth_sub}@qa.local",
    nickname,
    nickname,
    ["community-qa", "recommendation"],
  )


async def upsert_target_report(connection: Any, target_user_id: uuid.UUID) -> None:
  report_id = qa_uuid(f"bedrock-report:{target_user_id}")
  await connection.execute(
    """
    insert into analysis_reports (
      id, user_id, status, ai_provider, ai_model, request_id, analyzed_at,
      title, report_title, personal_color, skin_type, tone_summary,
      recommended_mood, summary, short_summary, tags, detail_payload, embedding
    ) values (
      $1, $2, 'completed', 'qa', 'bedrock-backfill-required', $3, now(),
      '룩톡 Bedrock 추천 QA 리포트', '룩톡 Bedrock 추천 QA 리포트', 'spring_clear', 'combination',
      '맑고 투명한 베이스와 코랄, 로즈, 글로우 계열이 잘 맞는 추천 검증용 리포트입니다.',
      '글로우 코랄 데일리', '커뮤니티 추천 로직 QA용 분석 리포트입니다.',
      '추천 로직 QA', $4::text[], $5::jsonb, null
    )
    on conflict (id) do update set
      analyzed_at = now(),
      updated_at = now(),
      embedding = null,
      tags = excluded.tags,
      detail_payload = excluded.detail_payload,
      tone_summary = excluded.tone_summary,
      recommended_mood = excluded.recommended_mood
    """,
    report_id,
    target_user_id,
    QA_REPORT_REQUEST_ID,
    ["글로우", "코랄", "로즈", "데일리", "맑은톤", "베이스"],
    json.dumps({"source": "community_recommendation_qa", "embedding": "bedrock_backfill_required"}, ensure_ascii=False),
  )


async def upsert_post(connection: Any, post: dict[str, Any], index: int) -> uuid.UUID:
  author_id = await upsert_qa_user(connection, oauth_sub=post["author_sub"], nickname=post["author_nickname"])
  thread_id = qa_uuid(f"thread:{post['key']}")
  media_id = qa_uuid(f"media:{post['key']}")
  media_link_id = qa_uuid(f"thread-media:{post['key']}")
  counts = post["counts"]

  await connection.execute(
    """
    insert into media_assets (id, owner_user_id, media_kind, source, content_type, width, height, status, original_filename)
    values ($1, $2, 'community-thread', 'seed', 'image/jpeg', 1080, 1350, 'active', $3)
    on conflict (id) do update set
      owner_user_id = excluded.owner_user_id,
      status = 'active',
      deleted_at = null
    """,
    media_id,
    author_id,
    f"{post['key']}.jpg",
  )

  await connection.execute(
    """
    insert into community_threads (
      id, author_user_id, category, title, body, mood_tags, situation_tags,
      difficulty, duration_minutes, product_usage, like_count, reply_count,
      save_count, view_count, status, embedding, created_at, updated_at, deleted_at
    ) values (
      $1, $2, $3, $4, $5, $6::text[], $7::text[], $8, $9,
      $10::jsonb, $11, $12, $13, $14, 'active', null,
      now() - ($15::int * interval '37 minutes'), now(), null
    )
    on conflict (id) do update set
      author_user_id = excluded.author_user_id,
      category = excluded.category,
      title = excluded.title,
      body = excluded.body,
      mood_tags = excluded.mood_tags,
      situation_tags = excluded.situation_tags,
      difficulty = excluded.difficulty,
      duration_minutes = excluded.duration_minutes,
      product_usage = excluded.product_usage,
      like_count = excluded.like_count,
      reply_count = excluded.reply_count,
      save_count = excluded.save_count,
      view_count = excluded.view_count,
      status = 'active',
      embedding = null,
      updated_at = now(),
      deleted_at = null
    """,
    thread_id,
    author_id,
    post["category"],
    post["title"],
    post["body"],
    post["mood_tags"],
    post["situation_tags"],
    post["difficulty"],
    post["duration_minutes"],
    json.dumps(post["products"], ensure_ascii=False),
    counts["likes"],
    counts["replies"],
    counts["saves"],
    counts["views"],
    index + 1,
  )

  await connection.execute(
    """
    insert into community_thread_media (id, thread_id, media_id, sort_order)
    values ($1, $2, $3, 0)
    on conflict (thread_id, sort_order) do update set media_id = excluded.media_id
    """,
    media_link_id,
    thread_id,
    media_id,
  )
  return thread_id


async def seed_events(connection: Any, target_user_id: uuid.UUID, thread_ids: list[uuid.UUID]) -> None:
  await connection.execute(
    """
    delete from community_events
    where user_id = $1
      and thread_id = any($2::uuid[])
      and event_type = any($3::text[])
    """,
    target_user_id,
    thread_ids,
    list(QA_EVENT_TYPES),
  )

  for thread_id in thread_ids:
    await connection.executemany(
      """
      insert into community_events (user_id, thread_id, event_type, dwell_ms, created_at)
      values ($1, $2, $3, $4, now())
      """,
      [
        (target_user_id, thread_id, "save", None),
        (target_user_id, thread_id, "like", None),
        (target_user_id, thread_id, "dwell", 15000),
        (target_user_id, thread_id, "view", None),
      ],
    )


async def main() -> None:
  parser = argparse.ArgumentParser(description="Seed QA community recommendation rows for Bedrock embedding backfill.")
  parser.add_argument("--target-user-id", default=None, help="Optional active user id. Defaults to the non-QA author with most community posts.")
  parser.add_argument("--cleanup", action="store_true", help="Delete QA recommendation rows instead of seeding them.")
  args = parser.parse_args()

  settings = get_settings()
  connection, _ = await connect_database(settings)
  try:
    async with connection.transaction():
      if args.cleanup:
        print(await cleanup(connection))
        return

      target_user_id = await find_target_user(connection, args.target_user_id)
      await upsert_target_report(connection, target_user_id)
      thread_ids = [await upsert_post(connection, post, index) for index, post in enumerate(POSTS)]
      await seed_events(connection, target_user_id, thread_ids)

    print({"seededQaThreads": len(POSTS), "seededQaEvents": len(POSTS) * len(QA_EVENT_TYPES), "embeddingStatus": "pending_bedrock_backfill"})
  finally:
    await connection.close()


if __name__ == "__main__":
  asyncio.run(main())