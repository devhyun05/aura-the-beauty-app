import asyncio
import json
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, get_database, require_database
from app.schemas.community import CommunityEventCreate, CommunityEventsCreate, CommunityReplyCreate, CommunityReplyUpdate, CommunityThreadCreate, CommunityThreadUpdate
from app.services.embeddings import embed_text, embedding_match_percent, format_pgvector, thread_embedding_text
from app.services.users import ensure_user


router = APIRouter(prefix="/community", tags=["community"])
logger = logging.getLogger(__name__)
community_embedding_tasks: set[asyncio.Task] = set()
VALID_CATEGORIES = {"trending", "lookbook", "question", "product_combo", "before_after"}
WRITABLE_CATEGORIES = {"lookbook", "question", "product_combo", "before_after"}
VALID_SORTS = {"latest", "popular"}
COMMUNITY_EVENT_TYPES = {"impression", "view", "revisit", "dwell", "like", "save", "reply", "slider", "search"}
CLIENT_COMMUNITY_EVENT_TYPES = {"impression", "view", "revisit", "dwell", "slider", "search"}
SERVER_COMMUNITY_EVENT_TYPES = {"like", "save", "reply"}
RECOMMENDED_MATCH_THRESHOLD = 50
POPULAR_SCORE_SQL = "(t.like_count + t.save_count * 2 + t.reply_count)"
POPULAR_MIN_SCORE = 1

def _normalize_community_event(event: CommunityEventCreate, *, allow_server_events: bool = False) -> dict[str, Any]:
  event_type = event.event_type.strip()
  if event_type not in COMMUNITY_EVENT_TYPES:
    raise AppError(400, "INVALID_COMMUNITY_EVENT_TYPE", "Unsupported community event type.")

  if not allow_server_events and event_type in SERVER_COMMUNITY_EVENT_TYPES:
    raise AppError(400, "COMMUNITY_EVENT_SERVER_MANAGED", "This community event is recorded by the server endpoint.")

  search_query = (event.search_query or "").strip() or None
  if event_type == "search":
    if search_query is None:
      raise AppError(400, "INVALID_COMMUNITY_EVENT_TARGET", "search_query is required for search events.")
    return {"event_type": event_type, "thread_id": None, "search_query": search_query, "dwell_ms": None}

  if event.thread_id is None:
    raise AppError(400, "INVALID_COMMUNITY_EVENT_TARGET", "thread_id is required for non-search events.")

  if event_type == "dwell" and event.dwell_ms is None:
    raise AppError(400, "INVALID_COMMUNITY_EVENT_TARGET", "dwell_ms is required for dwell events.")

  return {
    "event_type": event_type,
    "thread_id": event.thread_id,
    "search_query": None,
    "dwell_ms": event.dwell_ms if event_type == "dwell" else None,
  }


async def _record_community_event(
  db: Database,
  user_id: UUID,
  event_type: str,
  *,
  thread_id: UUID | None = None,
  search_query: str | None = None,
  dwell_ms: int | None = None,
) -> None:
  await db.execute(
    """
    insert into community_events (user_id, thread_id, event_type, search_query, dwell_ms)
    values ($1, $2, $3, $4, $5)
    """,
    user_id,
    thread_id,
    event_type,
    search_query,
    dwell_ms,
  )


async def _record_community_events(db: Database, user_id: UUID, events: list[CommunityEventCreate]) -> int:
  if len(events) > 20:
    raise AppError(400, "COMMUNITY_EVENTS_LIMIT_EXCEEDED", "Community event batches can include at most 20 events.")

  normalized_events = [_normalize_community_event(event) for event in events]
  for event in normalized_events:
    await _record_community_event(db, user_id, **event)
  return len(normalized_events)

def _clean_tags(tags: list[str]) -> list[str]:
  cleaned: list[str] = []
  for tag in tags:
    value = str(tag or "").strip()
    if value and value not in cleaned:
      cleaned.append(value[:30])
  return cleaned[:6]


def _product_usage_item_count(payload: CommunityThreadCreate | CommunityThreadUpdate) -> int:
  product_usage = payload.product_usage
  return len(product_usage.base) + len(product_usage.eye) + len(product_usage.cheek) + len(product_usage.lip)


def _validate_thread_create_payload(payload: CommunityThreadCreate) -> None:
  if payload.category == "before_after" and len(payload.media_ids) != 2:
    raise AppError(400, "INVALID_COMMUNITY_PAYLOAD", "Before/after threads require exactly two images.")

  if payload.category == "product_combo" and _product_usage_item_count(payload) < 2:
    raise AppError(400, "INVALID_COMMUNITY_PAYLOAD", "Product combo threads require at least two products.")


def _validate_thread_update_payload(payload: CommunityThreadUpdate) -> None:
  if payload.category not in WRITABLE_CATEGORIES:
    raise AppError(400, "INVALID_COMMUNITY_CATEGORY", "Trending is not a writable category.")

  if payload.category == "before_after" and len(payload.media_ids) != 2:
    raise AppError(400, "INVALID_COMMUNITY_PAYLOAD", "Before/after threads require exactly two images.")

  if payload.category == "product_combo" and _product_usage_item_count(payload) < 2:
    raise AppError(400, "INVALID_COMMUNITY_PAYLOAD", "Product combo threads require at least two products.")


def _decode_json(value: Any, fallback: Any) -> Any:
  if value is None:
    return fallback
  if isinstance(value, str):
    try:
      return json.loads(value)
    except json.JSONDecodeError:
      return fallback
  return value


def _media(row: dict[str, Any], prefix: str = "cover") -> dict[str, Any] | None:
  media_id = row.get(f"{prefix}_media_id")
  if not media_id:
    return None
  return {
    "id": media_id,
    "cdn_url": row.get(f"{prefix}_cdn_url"),
    "image_url": row.get(f"{prefix}_cdn_url"),
  }


def _author(row: dict[str, Any]) -> dict[str, Any]:
  return {
    "id": row.get("author_id"),
    "nickname": row.get("author_nickname") or "AURA User",
    "avatar_url": row.get("author_avatar_url"),
  }


def _counts(row: dict[str, Any]) -> dict[str, int]:
  return {
    "likes": int(row.get("like_count") or 0),
    "replies": int(row.get("reply_count") or 0),
    "saves": int(row.get("save_count") or 0),
    "views": int(row.get("view_count") or 0),
  }


def _viewer_state(row: dict[str, Any]) -> dict[str, bool]:
  return {
    "liked": bool(row.get("viewer_liked")),
    "saved": bool(row.get("viewer_saved")),
  }


def _thread_summary(row: dict[str, Any]) -> dict[str, Any]:
  cover_media = _media(row) or {"id": None, "cdn_url": None, "image_url": None, "thumbnail_url": None}
  return {
    "id": row["id"],
    "title": row["title"],
    "category": row["category"],
    "cover_media": cover_media,
    "mood_tags": row.get("mood_tags") or [],
    "situation_tags": row.get("situation_tags") or [],
    "difficulty": row.get("difficulty"),
    "duration_minutes": row.get("duration_minutes"),
    "author": _author(row),
    "counts": _counts(row),
    "viewer_state": _viewer_state(row),
    "created_at": row["created_at"],
  }


def _reply(row: dict[str, Any]) -> dict[str, Any]:
  is_deleted = row.get("status") == "deleted"
  return {
    "id": row["id"],
    "parent_reply_id": row.get("parent_reply_id"),
    "author": _author(row),
    "body": "삭제된 답글이에요" if is_deleted else row["body"],
    "like_count": 0 if is_deleted else int(row.get("like_count") or 0),
    "created_at": row["created_at"],
    "viewer_state": {"liked": False if is_deleted else bool(row.get("viewer_liked"))},
    "replies": [],
  }


async def _viewer_user(db: Database, auth: AuthContext) -> dict[str, Any] | None:
  if not db.is_connected:
    return None
  return await ensure_user(db, auth)


async def _fetch_thread_row(db: Database, thread_id: UUID, viewer_user_id: UUID | None = None) -> dict[str, Any] | None:
  return await db.fetchrow(
    """
    select
      t.*,
      u.id as author_id,
      u.nickname as author_nickname,
      avatar.cdn_url as author_avatar_url,
      cover.media_id as cover_media_id,
      media.cdn_url as cover_cdn_url,
      media.thumbnail_cdn_url as cover_thumbnail_cdn_url,
      exists(select 1 from community_thread_likes l where l.thread_id = t.id and l.user_id = $2) as viewer_liked,
      exists(select 1 from community_thread_saves s where s.thread_id = t.id and s.user_id = $2) as viewer_saved
    from community_threads t
    join users u on u.id = t.author_user_id
    left join media_assets avatar on avatar.id = u.avatar_media_id
    left join community_thread_media cover on cover.thread_id = t.id and cover.sort_order = 0
    left join media_assets media on media.id = cover.media_id
    where t.id = $1 and t.deleted_at is null and t.status = 'active'
    limit 1
    """,
    thread_id,
    viewer_user_id,
  )


async def _fetch_thread_detail(db: Database, thread_id: UUID, viewer_user_id: UUID | None = None) -> dict[str, Any]:
  row = await _fetch_thread_row(db, thread_id, viewer_user_id)
  if row is None:
    raise AppError(404, "COMMUNITY_THREAD_NOT_FOUND", "Community thread was not found.")

  media_rows = await db.fetch(
    """
    select tm.media_id, m.cdn_url, m.thumbnail_cdn_url
    from community_thread_media tm
    join media_assets m on m.id = tm.media_id
    where tm.thread_id = $1
    order by tm.sort_order asc
    """,
    thread_id,
  )
  reply_rows = await db.fetch(
    """
    select
      r.*,
      u.id as author_id,
      u.nickname as author_nickname,
      avatar.cdn_url as author_avatar_url,
      exists(select 1 from community_reply_likes rl where rl.reply_id = r.id and rl.user_id = $2) as viewer_liked
    from community_replies r
    join users u on u.id = r.author_user_id
    left join media_assets avatar on avatar.id = u.avatar_media_id
    where r.thread_id = $1
      and (
        (r.deleted_at is null and r.status = 'active')
        or (
          r.status = 'deleted'
          and exists (
            select 1
            from community_replies child
            where child.parent_reply_id = r.id
              and child.deleted_at is null
              and child.status = 'active'
          )
        )
      )
    order by r.created_at asc
    """,
    thread_id,
    viewer_user_id,
  )
  replies_by_id = {_row["id"]: _reply(_row) for _row in reply_rows}
  top_level_replies: list[dict[str, Any]] = []
  for reply in replies_by_id.values():
    parent_reply_id = reply.get("parent_reply_id")
    if parent_reply_id and parent_reply_id in replies_by_id:
      replies_by_id[parent_reply_id]["replies"].append(reply)
    else:
      top_level_replies.append(reply)

  detail = _thread_summary(row)
  detail.update(
    {
      "body": row.get("body") or "",
      "media": [
        {"id": media_row["media_id"], "cdn_url": media_row.get("cdn_url"), "image_url": media_row.get("cdn_url"), "thumbnail_url": media_row.get("thumbnail_cdn_url")}
        for media_row in media_rows
      ],
      "product_usage": _decode_json(row.get("product_usage"), {"base": [], "eye": [], "cheek": [], "lip": []}),
      "replies": top_level_replies,
      "viewer_user_id": viewer_user_id,
    }
  )
  return detail

async def _fetch_reply_detail(db: Database, reply_id: UUID, viewer_user_id: UUID | None = None) -> dict[str, Any]:
  row = await db.fetchrow(
    """
    select
      r.*,
      u.id as author_id,
      u.nickname as author_nickname,
      avatar.cdn_url as author_avatar_url,
      exists(select 1 from community_reply_likes rl where rl.reply_id = r.id and rl.user_id = $2) as viewer_liked
    from community_replies r
    join users u on u.id = r.author_user_id
    left join media_assets avatar on avatar.id = u.avatar_media_id
    where r.id = $1 and r.deleted_at is null and r.status = 'active'
    limit 1
    """,
    reply_id,
    viewer_user_id,
  )
  if row is None:
    raise AppError(404, "COMMUNITY_REPLY_NOT_FOUND", "Community reply was not found.")
  return _reply(row)
async def _update_thread_embedding(db: Database, thread_id: UUID, source: Any) -> bool:
  embedding = await asyncio.to_thread(embed_text, thread_embedding_text(source))
  if embedding is None:
    return False

  try:
    await db.execute(
      "update community_threads set embedding = $2::vector where id = $1",
      thread_id,
      format_pgvector(embedding),
    )
  except Exception:
    return False
  return True


def _schedule_thread_embedding_update(db: Database, thread_id: UUID, source: Any) -> None:
  task = asyncio.create_task(_update_thread_embedding(db, thread_id, source))
  community_embedding_tasks.add(task)

  def log_unhandled_error(completed_task: asyncio.Task) -> None:
    community_embedding_tasks.discard(completed_task)
    try:
      completed_task.result()
    except Exception:  # noqa: BLE001 - detached recommendation indexing must not break writes.
      logger.exception("[aura:community] embedding:update-task-crashed threadId=%s", thread_id)

  task.add_done_callback(log_unhandled_error)
  logger.info("[aura:community] embedding:update-scheduled threadId=%s", thread_id)

def _thread_tag_values(row: dict[str, Any]) -> list[str]:
  return [
    *[str(tag) for tag in (row.get("mood_tags") or []) if tag],
    *[str(tag) for tag in (row.get("situation_tags") or []) if tag],
    str(row.get("category") or ""),
  ]


def _behavior_interest_percent(row: dict[str, Any], tag_scores: dict[str, float]) -> int:
  raw_score = 0.0
  for tag in _thread_tag_values(row):
    for key, score in tag_scores.items():
      if tag == key:
        raw_score += score
      elif tag and key and (tag in key or key in tag):
        raw_score += score * 0.7
  return min(100, max(0, round(raw_score * 3)))


async def _fetch_behavior_tag_scores(db: Database, user_id: UUID) -> dict[str, float]:
  rows = await db.fetch(
    """
    with weighted_events as (
      select
        thread_tag.tag as tag,
        case e.event_type
          when 'save' then 3.0
          when 'reply' then 2.5
          when 'like' then 2.0
          when 'dwell' then case when coalesce(e.dwell_ms, 0) >= 12000 then 1.5 else 0 end
          when 'revisit' then 1.0
          when 'slider' then 1.0
          when 'view' then 0.8
          when 'impression' then -0.3
          else 0
        end as score
      from community_events e
      join community_threads t on t.id = e.thread_id
      cross join unnest(t.mood_tags || t.situation_tags || array[t.category]) as thread_tag(tag)
      where e.user_id = $1
        and e.created_at > now() - interval '30 days'
        and e.thread_id is not null
        and e.event_type <> 'search'

      union all

      select
        lower(trim(search_token.token)) as tag,
        2.0 as score
      from community_events e
      cross join regexp_split_to_table(coalesce(e.search_query, ''), '[[:space:]]+') with ordinality as search_token(token, position)
      where e.user_id = $1
        and e.created_at > now() - interval '30 days'
        and e.event_type = 'search'
        and search_token.position <= 5
        and char_length(trim(search_token.token)) >= 2
    )
    select tag, sum(score) as score
    from weighted_events
    where tag <> '' and score <> 0
    group by tag
    order by score desc
    limit 30
    """,
    user_id,
  )
  return {str(row["tag"]): float(row.get("score") or 0) for row in rows}


async def _get_recommended_threads(db: Database, user_id: UUID, limit: int = 20) -> dict[str, Any]:
  limit = min(max(limit, 1), 50)
  candidate_limit = min(max(limit * 3, limit), 100)
  report = await db.fetchrow(
    """
    select id
    from analysis_reports
    where user_id = $1 and status = 'completed' and embedding is not null
    order by analyzed_at desc nulls last, created_at desc
    limit 1
    """,
    user_id,
  )
  if report is None:
    return {"threads": [], "based_on": None}

  rows = await db.fetch(
    """
    select
      t.*,
      u.id as author_id,
      u.nickname as author_nickname,
      avatar.cdn_url as author_avatar_url,
      cover.media_id as cover_media_id,
      media.cdn_url as cover_cdn_url,
      media.thumbnail_cdn_url as cover_thumbnail_cdn_url,
      exists(select 1 from community_thread_likes l where l.thread_id = t.id and l.user_id = $2) as viewer_liked,
      exists(select 1 from community_thread_saves s where s.thread_id = t.id and s.user_id = $2) as viewer_saved,
      1 - (t.embedding <=> r.embedding) as similarity
    from community_threads t
    join users u on u.id = t.author_user_id
    left join media_assets avatar on avatar.id = u.avatar_media_id
    left join community_thread_media cover on cover.thread_id = t.id and cover.sort_order = 0
    left join media_assets media on media.id = cover.media_id
    cross join analysis_reports r
    where r.id = $1
      and t.embedding is not null
      and t.deleted_at is null
      and t.status = 'active'
      and t.author_user_id <> $2
      and not exists (
        select 1
        from community_thread_saves saved
        where saved.thread_id = t.id and saved.user_id = $2
      )
    order by t.embedding <=> r.embedding asc
    limit $3
    """,
    report["id"],
    user_id,
    candidate_limit,
  )
  tag_scores = await _fetch_behavior_tag_scores(db, user_id)
  threads: list[dict[str, Any]] = []
  for row in rows:
    summary = _thread_summary(row)
    tone_percent = embedding_match_percent(row.get("similarity"))
    interest_percent = _behavior_interest_percent(row, tag_scores)
    match_percent = round(tone_percent * 0.5 + interest_percent * 0.5)
    if match_percent < RECOMMENDED_MATCH_THRESHOLD:
      continue

    summary["match_percent"] = match_percent
    threads.append(summary)
    if len(threads) >= limit:
      break

  return {"threads": threads, "based_on": {"report_id": report["id"]}}

@router.get("/threads")
async def get_threads(
  category: str = "trending",
  sort: str | None = None,
  cursor: str | None = None,
  limit: int = 20,
  window_days: int | None = None,
  author: str | None = None,
  saved: str | None = None,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(get_database),
) -> dict:
  if not db.is_connected:
    return success({"threads": [], "next_cursor": None}, {"source": "empty_not_configured"})

  if category not in VALID_CATEGORIES:
    raise AppError(400, "INVALID_COMMUNITY_CATEGORY", "Unsupported community category.")

  resolved_sort = sort or ("popular" if category == "trending" else "latest")
  if resolved_sort not in VALID_SORTS:
    raise AppError(400, "INVALID_COMMUNITY_SORT", "Unsupported community sort.")

  if window_days is not None and (window_days < 1 or window_days > 365):
    raise AppError(400, "INVALID_COMMUNITY_WINDOW_DAYS", "window_days must be between 1 and 365.")

  saved_filter = saved.strip() if saved else None
  if saved_filter is not None and saved_filter != "me":
    raise AppError(400, "INVALID_COMMUNITY_SAVED_FILTER", "Only saved=me is supported.")

  author_filter = author.strip() if author else None
  viewer = await _viewer_user(db, auth)
  viewer_id = viewer["id"] if viewer else None

  author_filter_id: UUID | None = None
  if author_filter is not None:
    if author_filter == "me":
      if viewer_id is None:
        raise AppError(401, "COMMUNITY_VIEWER_REQUIRED", "Viewer is required for author=me.")
      author_filter_id = viewer_id
    else:
      try:
        author_filter_id = UUID(author_filter)
      except ValueError as exc:
        raise AppError(400, "INVALID_COMMUNITY_AUTHOR", "author must be me or a valid user id.") from exc

  if saved_filter == "me" and viewer_id is None:
    raise AppError(401, "COMMUNITY_VIEWER_REQUIRED", "Viewer is required for saved=me.")

  profile_filter = author_filter_id is not None or saved_filter == "me"
  limit = min(max(limit, 1), 30 if profile_filter else 50)
  params: list[Any] = [viewer_id, limit]

  saved_join = ""
  if saved_filter == "me":
    saved_join = "join community_thread_saves saved_filter on saved_filter.thread_id = t.id and saved_filter.user_id = $1"

  category_clause = ""
  if category != "trending":
    params.append(category)
    category_clause = f"and t.category = ${len(params)}"

  author_clause = ""
  if author_filter_id is not None:
    params.append(author_filter_id)
    author_clause = f"and t.author_user_id = ${len(params)}"

  cursor_clause = ""
  if cursor and not profile_filter:
    params.append(cursor)
    cursor_clause = f"and t.created_at < ${len(params)}::timestamptz"

  window_clause = ""
  if window_days is not None:
    params.append(window_days)
    window_clause = f"and t.created_at >= now() - (${len(params)}::int * interval '1 day')"

  popular_score_clause = ""
  if resolved_sort == "popular" and not profile_filter:
    popular_score_clause = f"and {POPULAR_SCORE_SQL} >= {POPULAR_MIN_SCORE}"

  if saved_filter == "me":
    order_clause = "saved_filter.saved_at desc, t.created_at desc"
  elif author_filter_id is not None:
    order_clause = "t.created_at desc"
  else:
    order_clause = f"{POPULAR_SCORE_SQL} desc, t.created_at desc" if resolved_sort == "popular" else "t.created_at desc"

  rows = await db.fetch(
    f"""
    select
      t.*,
      u.id as author_id,
      u.nickname as author_nickname,
      avatar.cdn_url as author_avatar_url,
      cover.media_id as cover_media_id,
      media.cdn_url as cover_cdn_url,
      media.thumbnail_cdn_url as cover_thumbnail_cdn_url,
      exists(select 1 from community_thread_likes l where l.thread_id = t.id and l.user_id = $1) as viewer_liked,
      exists(select 1 from community_thread_saves s where s.thread_id = t.id and s.user_id = $1) as viewer_saved
    from community_threads t
    {saved_join}
    join users u on u.id = t.author_user_id
    left join media_assets avatar on avatar.id = u.avatar_media_id
    left join community_thread_media cover on cover.thread_id = t.id and cover.sort_order = 0
    left join media_assets media on media.id = cover.media_id
    where t.deleted_at is null and t.status = 'active'
      {category_clause}
      {author_clause}
      {cursor_clause}
      {window_clause}
      {popular_score_clause}
    order by {order_clause}
    limit $2
    """,
    *params,
  )
  next_cursor = None if profile_filter else rows[-1]["created_at"].isoformat() if len(rows) == limit else None
  return success({"threads": [_thread_summary(row) for row in rows], "next_cursor": next_cursor})


@router.post("/threads")
async def create_thread(
  payload: CommunityThreadCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(get_database),
) -> dict:
  if payload.category not in WRITABLE_CATEGORIES:
    raise AppError(400, "INVALID_COMMUNITY_CATEGORY", "Trending is not a writable category.")

  _validate_thread_create_payload(payload)

  if not db.is_connected:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Database is not available.")

  user = await ensure_user(db, auth)
  media_rows = await db.fetch(
    """
    select id from media_assets
    where owner_user_id = $1 and id = any($2::uuid[]) and deleted_at is null
    """,
    user["id"],
    payload.media_ids,
  )
  if len(media_rows) != len(set(payload.media_ids)):
    raise AppError(400, "COMMUNITY_MEDIA_NOT_OWNED", "All community images must belong to the current user.")

  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Database is not available.")

  async with db.pool.acquire() as connection:
    async with connection.transaction():
      thread = await connection.fetchrow(
        """
        insert into community_threads (
          author_user_id, category, title, body, mood_tags, situation_tags,
          difficulty, duration_minutes, product_usage
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        returning id
        """,
        user["id"],
        payload.category,
        payload.title.strip(),
        payload.body.strip(),
        _clean_tags(payload.mood_tags),
        _clean_tags(payload.situation_tags),
        payload.difficulty,
        payload.duration_minutes,
        payload.product_usage.model_dump_json(by_alias=False),
      )
      thread_id = thread["id"]
      for index, media_id in enumerate(payload.media_ids):
        await connection.execute(
          """
          insert into community_thread_media (thread_id, media_id, sort_order)
          values ($1, $2, $3)
          """,
          thread_id,
          media_id,
          index,
        )

  _schedule_thread_embedding_update(db, thread_id, payload)
  return success(await _fetch_thread_detail(db, thread_id, user["id"]))



async def _fetch_owned_thread(db: Database, user_id: UUID, thread_id: UUID) -> dict[str, Any]:
  row = await db.fetchrow(
    """
    select id, author_user_id
    from community_threads
    where id = $1 and deleted_at is null and status = 'active'
    limit 1
    """,
    thread_id,
  )
  if row is None:
    raise AppError(404, "COMMUNITY_THREAD_NOT_FOUND", "Community thread was not found.")

  if row["author_user_id"] != user_id:
    raise AppError(403, "COMMUNITY_THREAD_FORBIDDEN", "Only the author can modify this thread.")

  return row


async def _update_thread(
  db: Database,
  user_id: UUID,
  thread_id: UUID,
  payload: CommunityThreadUpdate,
) -> dict[str, Any]:
  await _fetch_owned_thread(db, user_id, thread_id)
  _validate_thread_update_payload(payload)

  media_rows = await db.fetch(
    """
    select id from media_assets
    where owner_user_id = $1 and id = any($2::uuid[]) and deleted_at is null
    """,
    user_id,
    payload.media_ids,
  )
  if len(media_rows) != len(set(payload.media_ids)):
    raise AppError(400, "COMMUNITY_MEDIA_NOT_OWNED", "All community images must belong to the current user.")

  await db.execute(
    """
    update community_threads
    set category = $3,
        title = $4,
        body = $5,
        mood_tags = $6,
        situation_tags = $7,
        difficulty = $8,
        duration_minutes = $9,
        product_usage = $10::jsonb
    where id = $1 and author_user_id = $2 and deleted_at is null and status = 'active'
    """,
    thread_id,
    user_id,
    payload.category,
    payload.title.strip(),
    payload.body.strip(),
    _clean_tags(payload.mood_tags),
    _clean_tags(payload.situation_tags),
    payload.difficulty,
    payload.duration_minutes,
    payload.product_usage.model_dump_json(by_alias=False),
  )
  await db.execute("delete from community_thread_media where thread_id = $1", thread_id)
  for index, media_id in enumerate(payload.media_ids):
    await db.execute(
      """
      insert into community_thread_media (thread_id, media_id, sort_order)
      values ($1, $2, $3)
      """,
      thread_id,
      media_id,
      index,
    )
  _schedule_thread_embedding_update(db, thread_id, payload)
  return await _fetch_thread_detail(db, thread_id, user_id)


async def _delete_thread(db: Database, user_id: UUID, thread_id: UUID) -> dict[str, Any]:
  await _fetch_owned_thread(db, user_id, thread_id)
  await db.execute(
    """
    update community_threads
    set status = 'deleted', deleted_at = coalesce(deleted_at, now())
    where id = $1 and author_user_id = $2 and deleted_at is null and status = 'active'
    """,
    thread_id,
    user_id,
  )
  return {"thread_id": thread_id, "deleted": True}


@router.patch("/threads/{thread_id}")
async def update_thread(
  thread_id: UUID,
  payload: CommunityThreadUpdate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success(await _update_thread(db, user["id"], thread_id, payload))



@router.post("/threads/{thread_id}/update")
async def update_thread_via_post(
  thread_id: UUID,
  payload: CommunityThreadUpdate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success(await _update_thread(db, user["id"], thread_id, payload))


@router.post("/threads/{thread_id}/delete")
async def delete_thread_via_post(thread_id: UUID, auth: AuthContext = Depends(get_current_user), db: Database = Depends(require_database)) -> dict:
  user = await ensure_user(db, auth)
  return success(await _delete_thread(db, user["id"], thread_id))

@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: UUID, auth: AuthContext = Depends(get_current_user), db: Database = Depends(require_database)) -> dict:
  user = await ensure_user(db, auth)
  return success(await _delete_thread(db, user["id"], thread_id))


async def _search_threads(db: Database, user_id: UUID, query: str, limit: int = 20) -> dict[str, Any]:
  search_query = query.strip()
  if not search_query:
    raise AppError(400, "INVALID_COMMUNITY_SEARCH_QUERY", "Search query is required.")

  limit = min(max(limit, 1), 50)
  await _record_community_event(db, user_id, "search", search_query=search_query)
  pattern = f"%{search_query}%"
  embedding = await asyncio.to_thread(embed_text, search_query)

  if embedding is not None:
    rows = await db.fetch(
      """
      select
        t.*,
        u.id as author_id,
        u.nickname as author_nickname,
        avatar.cdn_url as author_avatar_url,
        cover.media_id as cover_media_id,
        media.cdn_url as cover_cdn_url,
      media.thumbnail_cdn_url as cover_thumbnail_cdn_url,
        exists(select 1 from community_thread_likes l where l.thread_id = t.id and l.user_id = $1) as viewer_liked,
        exists(select 1 from community_thread_saves s where s.thread_id = t.id and s.user_id = $1) as viewer_saved,
        case
          when t.title ilike $3 or t.body ilike $3 or exists (
            select 1 from unnest(t.mood_tags || t.situation_tags || array[t.category]) as tag where tag ilike $3
          ) then 1
          else 0
        end as lexical_boost
      from community_threads t
      join users u on u.id = t.author_user_id
      left join media_assets avatar on avatar.id = u.avatar_media_id
      left join community_thread_media cover on cover.thread_id = t.id and cover.sort_order = 0
      left join media_assets media on media.id = cover.media_id
      where t.embedding is not null and t.deleted_at is null and t.status = 'active'
      order by t.embedding <=> $2::vector asc, lexical_boost desc, t.created_at desc
      limit $4
      """,
      user_id,
      format_pgvector(embedding),
      pattern,
      limit,
    )
  else:
    rows = await db.fetch(
      """
      select
        t.*,
        u.id as author_id,
        u.nickname as author_nickname,
        avatar.cdn_url as author_avatar_url,
        cover.media_id as cover_media_id,
        media.cdn_url as cover_cdn_url,
      media.thumbnail_cdn_url as cover_thumbnail_cdn_url,
        exists(select 1 from community_thread_likes l where l.thread_id = t.id and l.user_id = $1) as viewer_liked,
        exists(select 1 from community_thread_saves s where s.thread_id = t.id and s.user_id = $1) as viewer_saved
      from community_threads t
      join users u on u.id = t.author_user_id
      left join media_assets avatar on avatar.id = u.avatar_media_id
      left join community_thread_media cover on cover.thread_id = t.id and cover.sort_order = 0
      left join media_assets media on media.id = cover.media_id
      where t.deleted_at is null and t.status = 'active'
        and (
          t.title ilike $2
          or t.body ilike $2
          or exists (
            select 1 from unnest(t.mood_tags || t.situation_tags || array[t.category]) as tag where tag ilike $2
          )
        )
      order by t.created_at desc
      limit $3
      """,
      user_id,
      pattern,
      limit,
    )

  return {"threads": [_thread_summary(row) for row in rows]}


@router.get("/search")
async def search_threads(
  q: str = Query(..., min_length=1, max_length=120),
  limit: int = 20,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success(await _search_threads(db, user["id"], q, limit))

@router.get("/threads/recommended")
async def get_recommended_threads(
  limit: int = 20,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success(await _get_recommended_threads(db, user["id"], limit))

@router.get("/threads/{thread_id}")
async def get_thread_detail(
  thread_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  await db.execute(
    "update community_threads set view_count = view_count + 1 where id = $1 and deleted_at is null",
    thread_id,
  )
  return success(await _fetch_thread_detail(db, thread_id, user["id"]))


async def _refresh_thread_reply_count(db: Database, thread_id: UUID) -> int:
  row = await db.fetchrow(
    """
    update community_threads
    set reply_count = (
      select count(*)
      from community_replies
      where thread_id = $1 and deleted_at is null and status = 'active'
    )
    where id = $1
    returning reply_count
    """,
    thread_id,
  )
  return int(row.get("reply_count") or 0) if row else 0


async def _delete_reply(db: Database, user_id: UUID, reply_id: UUID) -> dict[str, Any]:
  reply = await db.fetchrow(
    """
    select id, thread_id, author_user_id
    from community_replies
    where id = $1 and deleted_at is null and status = 'active'
    limit 1
    """,
    reply_id,
  )
  if reply is None:
    raise AppError(404, "COMMUNITY_REPLY_NOT_FOUND", "Community reply was not found.")

  if reply["author_user_id"] != user_id:
    raise AppError(403, "COMMUNITY_REPLY_FORBIDDEN", "Only the author can delete this reply.")

  await db.execute(
    """
    update community_replies
    set status = 'deleted', deleted_at = now()
    where id = $1
    """,
    reply_id,
  )
  reply_count = await _refresh_thread_reply_count(db, reply["thread_id"])
  return {"reply_id": reply_id, "deleted": True, "counts": {"replies": reply_count}}

async def _create_reply(
  db: Database,
  user_id: UUID,
  thread_id: UUID,
  payload: CommunityReplyCreate,
) -> dict[str, Any]:
  if await _fetch_thread_row(db, thread_id, user_id) is None:
    raise AppError(404, "COMMUNITY_THREAD_NOT_FOUND", "Community thread was not found.")

  if payload.parent_reply_id:
    parent = await db.fetchrow(
      "select parent_reply_id from community_replies where id = $1 and thread_id = $2 and deleted_at is null",
      payload.parent_reply_id,
      thread_id,
    )
    if parent is None:
      raise AppError(404, "COMMUNITY_REPLY_NOT_FOUND", "Parent reply was not found.")
    if parent.get("parent_reply_id") is not None:
      raise AppError(400, "COMMUNITY_REPLY_DEPTH_EXCEEDED", "Replies can only be nested one level deep.")

  created_reply = await db.fetchrow(
    """
    insert into community_replies (thread_id, parent_reply_id, author_user_id, body)
    values ($1, $2, $3, $4)
    returning id
    """,
    thread_id,
    payload.parent_reply_id,
    user_id,
    payload.body.strip(),
  )
  if created_reply is None:
    raise AppError(500, "COMMUNITY_REPLY_CREATE_FAILED", "Community reply could not be created.")

  reply_count = await _refresh_thread_reply_count(db, thread_id)
  reply = await _fetch_reply_detail(db, created_reply["id"], user_id)
  await _record_community_event(db, user_id, "reply", thread_id=thread_id)
  return {"reply": reply, "counts": {"replies": reply_count}}

@router.post("/threads/{thread_id}/replies")
async def create_reply(
  thread_id: UUID,
  payload: CommunityReplyCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success(await _create_reply(db, user["id"], thread_id, payload))


async def _set_thread_reaction(db: Database, user_id: UUID, thread_id: UUID, table: str, enabled: bool) -> None:
  if table not in {"community_thread_likes", "community_thread_saves"}:
    raise ValueError("Unsupported reaction table")
  time_column = "liked_at" if table.endswith("likes") else "saved_at"
  if enabled:
    await db.execute(
      f"insert into {table} (user_id, thread_id) values ($1, $2) on conflict (user_id, thread_id) do nothing",
      user_id,
      thread_id,
    )
  else:
    await db.execute(f"delete from {table} where user_id = $1 and thread_id = $2", user_id, thread_id)
  count_column = "like_count" if table.endswith("likes") else "save_count"
  await db.execute(
    f"""
    update community_threads
    set {count_column} = (select count({time_column}) from {table} where thread_id = $1)
    where id = $1
    """,
    thread_id,
  )


async def _set_reply_reaction(db: Database, user_id: UUID, reply_id: UUID, enabled: bool) -> UUID:
  reply = await db.fetchrow(
    """
    select id, thread_id
    from community_replies
    where id = $1 and deleted_at is null and status = 'active'
    limit 1
    """,
    reply_id,
  )
  if reply is None:
    raise AppError(404, "COMMUNITY_REPLY_NOT_FOUND", "Community reply was not found.")

  if enabled:
    await db.execute(
      """
      insert into community_reply_likes (user_id, reply_id)
      values ($1, $2)
      on conflict (user_id, reply_id) do nothing
      """,
      user_id,
      reply_id,
    )
  else:
    await db.execute(
      "delete from community_reply_likes where user_id = $1 and reply_id = $2",
      user_id,
      reply_id,
    )

  await db.execute(
    """
    update community_replies
    set like_count = (select count(*) from community_reply_likes where reply_id = $1)
    where id = $1
    """,
    reply_id,
  )
  return reply["thread_id"]



async def _update_reply(db: Database, user_id: UUID, reply_id: UUID, payload: CommunityReplyUpdate) -> dict[str, Any]:
  reply = await db.fetchrow(
    """
    select id, thread_id, author_user_id
    from community_replies
    where id = $1 and deleted_at is null and status = 'active'
    limit 1
    """,
    reply_id,
  )
  if reply is None:
    raise AppError(404, "COMMUNITY_REPLY_NOT_FOUND", "Community reply was not found.")

  if reply["author_user_id"] != user_id:
    raise AppError(403, "COMMUNITY_REPLY_FORBIDDEN", "Only the author can edit this reply.")

  await db.execute(
    """
    update community_replies
    set body = $2
    where id = $1 and author_user_id = $3 and deleted_at is null and status = 'active'
    """,
    reply_id,
    payload.body.strip(),
    user_id,
  )
  return {"reply": await _fetch_reply_detail(db, reply_id, user_id)}


@router.post("/replies/{reply_id}/update")
async def update_reply(reply_id: UUID, payload: CommunityReplyUpdate, auth: AuthContext = Depends(get_current_user), db: Database = Depends(require_database)) -> dict:
  user = await ensure_user(db, auth)
  return success(await _update_reply(db, user["id"], reply_id, payload))


@router.patch("/replies/{reply_id}")
async def patch_reply(reply_id: UUID, payload: CommunityReplyUpdate, auth: AuthContext = Depends(get_current_user), db: Database = Depends(require_database)) -> dict:
  user = await ensure_user(db, auth)
  return success(await _update_reply(db, user["id"], reply_id, payload))


@router.post("/replies/{reply_id}/delete")
async def delete_reply_via_post(reply_id: UUID, auth: AuthContext = Depends(get_current_user), db: Database = Depends(require_database)) -> dict:
  user = await ensure_user(db, auth)
  return success(await _delete_reply(db, user["id"], reply_id))

@router.delete("/replies/{reply_id}")
async def delete_reply(reply_id: UUID, auth: AuthContext = Depends(get_current_user), db: Database = Depends(require_database)) -> dict:
  user = await ensure_user(db, auth)
  return success(await _delete_reply(db, user["id"], reply_id))


@router.post("/threads/{thread_id}/like")
async def like_thread(thread_id: UUID, auth: AuthContext = Depends(get_current_user), db: Database = Depends(require_database)) -> dict:
  user = await ensure_user(db, auth)
  await _set_thread_reaction(db, user["id"], thread_id, "community_thread_likes", True)
  await _record_community_event(db, user["id"], "like", thread_id=thread_id)
  return success({"thread_id": thread_id, "liked": True})


@router.delete("/threads/{thread_id}/like")
async def unlike_thread(thread_id: UUID, auth: AuthContext = Depends(get_current_user), db: Database = Depends(require_database)) -> dict:
  user = await ensure_user(db, auth)
  await _set_thread_reaction(db, user["id"], thread_id, "community_thread_likes", False)
  return success({"thread_id": thread_id, "liked": False})


@router.post("/threads/{thread_id}/save")
async def save_thread(thread_id: UUID, auth: AuthContext = Depends(get_current_user), db: Database = Depends(require_database)) -> dict:
  user = await ensure_user(db, auth)
  await _set_thread_reaction(db, user["id"], thread_id, "community_thread_saves", True)
  await _record_community_event(db, user["id"], "save", thread_id=thread_id)
  return success({"thread_id": thread_id, "saved": True})


@router.delete("/threads/{thread_id}/save")
async def unsave_thread(thread_id: UUID, auth: AuthContext = Depends(get_current_user), db: Database = Depends(require_database)) -> dict:
  user = await ensure_user(db, auth)
  await _set_thread_reaction(db, user["id"], thread_id, "community_thread_saves", False)
  return success({"thread_id": thread_id, "saved": False})


@router.post("/replies/{reply_id}/like")
async def like_reply(reply_id: UUID, auth: AuthContext = Depends(get_current_user), db: Database = Depends(require_database)) -> dict:
  user = await ensure_user(db, auth)
  thread_id = await _set_reply_reaction(db, user["id"], reply_id, True)
  await _record_community_event(db, user["id"], "like", thread_id=thread_id)
  return success({"reply_id": reply_id, "liked": True})


@router.delete("/replies/{reply_id}/like")
async def unlike_reply(reply_id: UUID, auth: AuthContext = Depends(get_current_user), db: Database = Depends(require_database)) -> dict:
  user = await ensure_user(db, auth)
  await _set_reply_reaction(db, user["id"], reply_id, False)
  return success({"reply_id": reply_id, "liked": False})


@router.post("/events")
async def record_events(
  payload: CommunityEventsCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  accepted = await _record_community_events(db, user["id"], payload.events)
  return success({"accepted": accepted})
