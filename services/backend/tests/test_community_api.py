from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import community as community_api
from app.api.community import _create_reply, _delete_reply, _delete_thread, _fetch_thread_detail, _get_recommended_threads, _record_community_events, _reply, _search_threads, _set_reply_reaction, _update_reply, _update_thread, _update_thread_embedding
from app.core.errors import AppError
from app.core.responses import success
from app.core.settings import Settings
from app.main import create_app
from app.schemas.community import CommunityEventCreate, CommunityEventsCreate, CommunityReplyCreate, CommunityReplyUpdate, CommunityThreadCreate, CommunityThreadUpdate


VALID_MEDIA_ID = "11111111-1111-4111-8111-111111111111"
VALID_MEDIA_UUID = UUID(VALID_MEDIA_ID)
VALID_REPLY_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
PARENT_REPLY_ID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")
VALID_THREAD_ID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
VALID_USER_ID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
OTHER_USER_ID = UUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd")


class ThreadDetailDatabase:
  async def fetchrow(self, _query: str, *args):
    return {
      "id": args[0],
      "title": "detail test",
      "category": "lookbook",
      "body": "body",
      "mood_tags": [],
      "situation_tags": [],
      "difficulty": None,
      "duration_minutes": None,
      "product_usage": None,
      "like_count": 0,
      "reply_count": 0,
      "save_count": 0,
      "view_count": 0,
      "created_at": "2026-07-06T00:00:00Z",
      "author_id": VALID_USER_ID,
      "author_nickname": "tester",
      "author_avatar_url": None,
      "cover_media_id": None,
      "cover_cdn_url": None,
      "viewer_liked": False,
      "viewer_saved": False,
    }

  async def fetch(self, _query: str, *args):
    return []
class CommunityEventDatabase:
  def __init__(self) -> None:
    self.events: list[tuple] = []

  async def execute(self, query: str, *args):
    if "insert into community_events" not in query:
      raise AssertionError(f"Unexpected execute query: {query}")

    self.events.append(args)
    return "INSERT 0 1"


class SearchThreadsDatabase:
  def __init__(self) -> None:
    self.events: list[tuple] = []
    self.fetch_query: str | None = None
    self.fetch_args: tuple = ()

  async def execute(self, query: str, *args):
    if "insert into community_events" not in query:
      raise AssertionError(f"Unexpected execute query: {query}")

    self.events.append(args)
    return "INSERT 0 1"

  async def fetch(self, query: str, *args):
    self.fetch_query = query
    self.fetch_args = args
    return [
      {
        "id": VALID_THREAD_ID,
        "title": "glass glow base",
        "category": "lookbook",
        "mood_tags": ["glow"],
        "situation_tags": ["daily"],
        "difficulty": "easy",
        "duration_minutes": 10,
        "like_count": 1,
        "reply_count": 2,
        "save_count": 3,
        "view_count": 4,
        "created_at": "2026-07-06T00:00:00Z",
        "author_id": VALID_USER_ID,
        "author_nickname": "tester",
        "author_avatar_url": None,
        "cover_media_id": None,
        "cover_cdn_url": None,
        "viewer_liked": False,
        "viewer_saved": True,
      },
    ]


class RecommendedThreadsDatabase:
  def __init__(self, *, report_exists: bool = True, similarity: float = 0.75, event_score: float = 10) -> None:
    self.report_exists = report_exists
    self.similarity = similarity
    self.event_score = event_score
    self.fetch_calls: list[str] = []

  async def fetchrow(self, query: str, *args):
    if "from analysis_reports" in query:
      if not self.report_exists:
        return None
      return {"id": UUID("99999999-9999-4999-8999-999999999999")}

    raise AssertionError(f"Unexpected fetchrow query: {query}")

  async def fetch(self, query: str, *args):
    self.fetch_calls.append(query)
    if "community_events" in query:
      return [{"tag": "glow", "score": self.event_score}]

    if "t.embedding <=> r.embedding" in query:
      return [
        {
          "id": VALID_THREAD_ID,
          "title": "glass glow base",
          "category": "lookbook",
          "mood_tags": ["glow"],
          "situation_tags": ["daily"],
          "difficulty": "easy",
          "duration_minutes": 10,
          "like_count": 1,
          "reply_count": 2,
          "save_count": 3,
          "view_count": 4,
          "created_at": "2026-07-06T00:00:00Z",
          "author_id": VALID_USER_ID,
          "author_nickname": "tester",
          "author_avatar_url": None,
          "cover_media_id": None,
          "cover_cdn_url": None,
          "viewer_liked": False,
          "viewer_saved": False,
          "similarity": self.similarity,
        },
      ]

    raise AssertionError(f"Unexpected fetch query: {query}")


class ThreadManageDatabase:
  def __init__(self, *, author_user_id: UUID = VALID_USER_ID, media_count: int = 1, thread_exists: bool = True) -> None:
    self.author_user_id = author_user_id
    self.media_count = media_count
    self.thread_exists = thread_exists
    self.deleted_thread_ids: list[UUID] = []
    self.media_order: list[tuple[UUID, UUID, int]] = []
    self.updated_args: list[tuple] = []
    self.updated_title = "old title"

  async def fetchrow(self, query: str, *args):
    if "select id, author_user_id" in " ".join(query.split()):
      if not self.thread_exists:
        return None
      return {"id": args[0], "author_user_id": self.author_user_id}

    if "from community_threads t" in query:
      return {
        "id": args[0],
        "title": self.updated_title,
        "category": "lookbook",
        "body": "updated body",
        "mood_tags": ["glow"],
        "situation_tags": ["daily"],
        "difficulty": "easy",
        "duration_minutes": 10,
        "product_usage": {"base": [], "eye": [], "cheek": [], "lip": []},
        "like_count": 0,
        "reply_count": 0,
        "save_count": 0,
        "view_count": 0,
        "created_at": "2026-07-06T00:00:00Z",
        "author_id": VALID_USER_ID,
        "author_nickname": "tester",
        "author_avatar_url": None,
        "cover_media_id": None,
        "cover_cdn_url": None,
        "viewer_liked": False,
        "viewer_saved": False,
      }

    raise AssertionError(f"Unexpected fetchrow query: {query}")

  async def fetch(self, query: str, *args):
    if "from media_assets" in query:
      return [{"id": media_id} for media_id in args[1]]

    if "from community_thread_media" in query:
      return [{"media_id": media_id, "cdn_url": None} for _, media_id, _ in self.media_order]

    return []

  async def execute(self, query: str, *args):
    if "update community_threads\n    set category" in query:
      self.updated_args.append(args)
      self.updated_title = args[3]
      return "UPDATE 1"

    if "delete from community_thread_media" in query:
      self.media_order = []
      return "DELETE 1"

    if "insert into community_thread_media" in query:
      self.media_order.append(args)
      return "INSERT 0 1"

    if "update community_threads\n    set status = 'deleted'" in query:
      self.deleted_thread_ids.append(args[0])
      return "UPDATE 1"

    if "update community_threads set embedding" in query:
      return "UPDATE 1"

    raise AssertionError(f"Unexpected execute query: {query}")

class ThreadEmbeddingDatabase:
  def __init__(self) -> None:
    self.embedding_updates: list[tuple] = []

  async def execute(self, query: str, *args):
    if "update community_threads set embedding" not in query:
      raise AssertionError(f"Unexpected execute query: {query}")

    self.embedding_updates.append(args)
    return "UPDATE 1"

class ThreadListDatabase:
  is_connected = True

  def __init__(self) -> None:
    self.fetch_query: str | None = None
    self.fetch_args: tuple = ()

  async def fetch(self, query: str, *args):
    self.fetch_query = query
    self.fetch_args = args
    return []
class ThreadReactionEventDatabase(CommunityEventDatabase):
  def __init__(self) -> None:
    super().__init__()
    self.reaction_queries: list[str] = []
    self.count_updates = 0

  async def execute(self, query: str, *args):
    if "insert into community_events" in query:
      return await super().execute(query, *args)

    if "update community_threads" in query:
      self.count_updates += 1
      return "UPDATE 1"

    if "community_thread_likes" in query or "community_thread_saves" in query:
      self.reaction_queries.append(query)
      return "INSERT 0 1"

    raise AssertionError(f"Unexpected execute query: {query}")


class ReplyUpdateDatabase:
  def __init__(self, author_user_id: UUID = VALID_USER_ID, reply_exists: bool = True) -> None:
    self.author_user_id = author_user_id
    self.reply_exists = reply_exists
    self.updated_body = "old body"
    self.updated_args: list[tuple] = []

  async def fetchrow(self, query: str, *args):
    if "select id, thread_id, author_user_id" in query:
      if not self.reply_exists:
        return None
      return {"id": args[0], "thread_id": VALID_THREAD_ID, "author_user_id": self.author_user_id}

    if "from community_replies r" in query:
      return {
        "id": args[0],
        "thread_id": VALID_THREAD_ID,
        "parent_reply_id": None,
        "author_user_id": self.author_user_id,
        "author_id": self.author_user_id,
        "author_nickname": "tester",
        "author_avatar_url": None,
        "body": self.updated_body,
        "like_count": 0,
        "created_at": "2026-07-06T00:00:00Z",
        "status": "active",
        "viewer_liked": False,
      }

    raise AssertionError(f"Unexpected fetchrow query: {query}")

  async def execute(self, query: str, *args):
    if "update community_replies\n    set body" not in query:
      raise AssertionError(f"Unexpected execute query: {query}")

    self.updated_args.append(args)
    self.updated_body = args[1]
    return "UPDATE 1"

class ReplyDeleteDatabase:
  def __init__(self, author_user_id: UUID = VALID_USER_ID, reply_exists: bool = True, reply_count: int = 0) -> None:
    self.author_user_id = author_user_id
    self.reply_exists = reply_exists
    self.reply_count = reply_count
    self.deleted_reply_ids: list[UUID] = []

  async def fetchrow(self, query: str, *args):
    if "select id, thread_id, author_user_id" in query:
      if not self.reply_exists:
        return None
      return {"id": args[0], "thread_id": VALID_THREAD_ID, "author_user_id": self.author_user_id}

    if "update community_threads" in query:
      return {"reply_count": self.reply_count}

    raise AssertionError(f"Unexpected fetchrow query: {query}")

  async def execute(self, query: str, *args):
    if "update community_replies" not in query:
      raise AssertionError(f"Unexpected execute query: {query}")

    self.deleted_reply_ids.append(args[0])
    return "OK"

class ReplyReactionDatabase:
  def __init__(self, reply_exists: bool = True) -> None:
    self.reply_exists = reply_exists
    self.likes: set[tuple[UUID, UUID]] = set()
    self.count_updates: list[int] = []
    self.insert_queries: list[str] = []

  async def fetchrow(self, _query: str, *args):
    if not self.reply_exists:
      return None
    return {"id": args[0], "thread_id": VALID_THREAD_ID}

  async def execute(self, query: str, *args):
    if "insert into community_reply_likes" in query:
      self.insert_queries.append(query)
      self.likes.add((args[0], args[1]))
    elif "delete from community_reply_likes" in query:
      self.likes.discard((args[0], args[1]))
    elif "update community_replies" in query:
      self.count_updates.append(len(self.likes))
    return "OK"


class ReplyReactionEventDatabase(ReplyReactionDatabase):
  def __init__(self) -> None:
    super().__init__()
    self.events: list[tuple] = []

  async def execute(self, query: str, *args):
    if "insert into community_events" in query:
      self.events.append(args)
      return "INSERT 0 1"

    return await super().execute(query, *args)

class ReplyCreateDatabase:
  def __init__(
    self,
    *,
    thread_exists: bool = True,
    parent_exists: bool = True,
    parent_parent_reply_id: UUID | None = None,
    reply_count: int = 25,
  ) -> None:
    self.thread_exists = thread_exists
    self.parent_exists = parent_exists
    self.parent_parent_reply_id = parent_parent_reply_id
    self.reply_count = reply_count
    self.insert_args: list[tuple[UUID, UUID | None, UUID, str]] = []
    self.insert_queries: list[str] = []
    self.events: list[tuple] = []

  async def fetchrow(self, query: str, *args):
    if "from community_threads t" in query:
      if not self.thread_exists:
        return None
      return {"id": args[0], "thread_id": VALID_THREAD_ID}

    if "select parent_reply_id from community_replies" in query:
      if not self.parent_exists:
        return None
      return {"parent_reply_id": self.parent_parent_reply_id}

    if "insert into community_replies" in query:
      self.insert_queries.append(query)
      self.insert_args.append(args)
      return {"id": VALID_REPLY_ID}

    if "update community_threads" in query:
      return {"reply_count": self.reply_count}

    if "from community_replies r" in query:
      thread_id, parent_reply_id, author_user_id, body = self.insert_args[-1]
      return {
        "id": args[0],
        "thread_id": thread_id,
        "parent_reply_id": parent_reply_id,
        "author_user_id": author_user_id,
        "author_id": author_user_id,
        "author_nickname": "tester",
        "author_avatar_url": None,
        "body": body,
        "like_count": 0,
        "created_at": "2026-07-06T00:00:00Z",
        "status": "active",
        "viewer_liked": False,
      }

    raise AssertionError(f"Unexpected fetchrow query: {query}")
  async def execute(self, query: str, *args):
    if "insert into community_events" in query:
      self.events.append(args)
      return "INSERT 0 1"

    raise AssertionError(f"Unexpected execute query: {query}")

def create_client() -> TestClient:
  return TestClient(create_app(Settings(database_url=None, auth_required=False)))


@pytest.mark.asyncio
async def test_search_threads_uses_semantic_vector_and_records_search(monkeypatch) -> None:
  monkeypatch.setattr(community_api, "embed_text", lambda _text: [0.1] * 1024)
  db = SearchThreadsDatabase()

  result = await _search_threads(db, VALID_USER_ID, " glow base ", limit=5)

  assert db.events == [(VALID_USER_ID, None, "search", "glow base", None)]
  assert db.fetch_query is not None
  assert "t.embedding <=> $2::vector" in db.fetch_query
  assert "lexical_boost" in db.fetch_query
  assert db.fetch_args[0] == VALID_USER_ID
  assert db.fetch_args[1].startswith("[0.10000000")
  assert db.fetch_args[2] == "%glow base%"
  assert db.fetch_args[3] == 5
  assert result["threads"][0]["id"] == VALID_THREAD_ID
  assert result["threads"][0]["viewer_state"] == {"liked": False, "saved": True}


@pytest.mark.asyncio
async def test_search_threads_falls_back_to_lexical_without_embedding(monkeypatch) -> None:
  monkeypatch.setattr(community_api, "embed_text", lambda _text: None)
  db = SearchThreadsDatabase()

  result = await _search_threads(db, VALID_USER_ID, "  coral  ", limit=100)

  assert db.events == [(VALID_USER_ID, None, "search", "coral", None)]
  assert db.fetch_query is not None
  assert "t.embedding <=> $2::vector" not in db.fetch_query
  assert "t.title ilike $2" in db.fetch_query
  assert db.fetch_args == (VALID_USER_ID, "%coral%", 50)
  assert result["threads"][0]["title"] == "glass glow base"


@pytest.mark.asyncio
async def test_search_threads_rejects_blank_query() -> None:
  db = SearchThreadsDatabase()

  with pytest.raises(AppError) as error:
    await _search_threads(db, VALID_USER_ID, "   ")

  assert error.value.status_code == 400
  assert error.value.code == "INVALID_COMMUNITY_SEARCH_QUERY"
  assert db.events == []


@pytest.mark.asyncio
async def test_search_threads_route_returns_camelized_contract(monkeypatch) -> None:
  async def fake_ensure_user(_db, _auth):
    return {"id": VALID_USER_ID}

  monkeypatch.setattr(community_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(community_api, "embed_text", lambda _text: None)

  response = await community_api.search_threads(
    q="glow",
    auth=None,
    db=SearchThreadsDatabase(),
  )

  assert response["data"]["threads"][0]["viewerState"] == {"liked": False, "saved": True}


@pytest.mark.asyncio
async def test_get_recommended_threads_returns_empty_without_report() -> None:
  result = await _get_recommended_threads(
    RecommendedThreadsDatabase(report_exists=False),
    VALID_USER_ID,
  )

  assert result == {"threads": [], "based_on": None}


@pytest.mark.asyncio
async def test_get_recommended_threads_blends_embedding_and_interest() -> None:
  result = await _get_recommended_threads(RecommendedThreadsDatabase(), VALID_USER_ID, limit=20)

  assert result["based_on"] == {"report_id": UUID("99999999-9999-4999-8999-999999999999")}
  assert result["threads"][0]["id"] == VALID_THREAD_ID
  assert result["threads"][0]["viewer_state"] == {"liked": False, "saved": False}
  assert result["threads"][0]["match_percent"] == 65


@pytest.mark.asyncio
async def test_get_recommended_threads_excludes_viewer_authored_threads() -> None:
  db = RecommendedThreadsDatabase()

  await _get_recommended_threads(db, VALID_USER_ID, limit=20)

  recommendation_query = next(query for query in db.fetch_calls if "t.embedding <=> r.embedding" in query)
  assert "t.author_user_id <> $2" in recommendation_query
  assert "community_thread_saves saved" in recommendation_query
  assert "saved.thread_id = t.id and saved.user_id = $2" in recommendation_query

@pytest.mark.asyncio
async def test_get_recommended_threads_uses_explicit_behavior_weights() -> None:
  db = RecommendedThreadsDatabase()

  await _get_recommended_threads(db, VALID_USER_ID, limit=20)

  behavior_query = next(query for query in db.fetch_calls if "weighted_events" in query)
  assert "when 'save' then 3.0" in behavior_query
  assert "when 'reply' then 2.5" in behavior_query
  assert "when 'like' then 2.0" in behavior_query
  assert "when 'dwell'" in behavior_query
  assert "when 'impression' then -0.3" in behavior_query
  assert "regexp_split_to_table" in behavior_query
  assert "else 1" not in behavior_query

@pytest.mark.asyncio
async def test_get_recommended_threads_filters_below_match_threshold() -> None:
  result = await _get_recommended_threads(
    RecommendedThreadsDatabase(similarity=0.18, event_score=0),
    VALID_USER_ID,
    limit=20,
  )

  assert result["based_on"] == {"report_id": UUID("99999999-9999-4999-8999-999999999999")}
  assert result["threads"] == []


@pytest.mark.asyncio
async def test_get_recommended_threads_route_returns_camelized_contract(monkeypatch) -> None:
  async def fake_ensure_user(_db, _auth):
    return {"id": VALID_USER_ID}

  monkeypatch.setattr(community_api, "ensure_user", fake_ensure_user)

  response = await community_api.get_recommended_threads(
    auth=None,
    db=RecommendedThreadsDatabase(),
  )

  assert response["data"]["basedOn"]["reportId"] == "99999999-9999-4999-8999-999999999999"
  assert response["data"]["threads"][0]["matchPercent"] == 65


@pytest.mark.asyncio
async def test_update_thread_updates_own_thread(monkeypatch) -> None:
  monkeypatch.setattr(community_api, "embed_text", lambda _text: None)
  db = ThreadManageDatabase()
  payload = CommunityThreadUpdate.model_validate(
    {
      "category": "lookbook",
      "title": "  updated glow  ",
      "body": "  updated body  ",
      "mediaIds": [VALID_MEDIA_ID],
      "moodTags": ["glow"],
      "situationTags": ["daily"],
      "difficulty": "easy",
      "durationMinutes": 10,
      "productUsage": {"base": [], "eye": [], "cheek": [], "lip": []},
    },
  )

  result = await _update_thread(db, VALID_USER_ID, VALID_THREAD_ID, payload)

  assert db.updated_args[0][0] == VALID_THREAD_ID
  assert db.updated_args[0][1] == VALID_USER_ID
  assert db.updated_args[0][3] == "updated glow"
  assert db.updated_args[0][4] == "updated body"
  assert db.media_order == [(VALID_THREAD_ID, VALID_MEDIA_UUID, 0)]
  assert result["title"] == "updated glow"


@pytest.mark.asyncio
async def test_update_thread_rejects_other_author() -> None:
  db = ThreadManageDatabase(author_user_id=OTHER_USER_ID)
  payload = CommunityThreadUpdate.model_validate(
    {
      "category": "lookbook",
      "title": "not mine",
      "mediaIds": [VALID_MEDIA_ID],
      "productUsage": {"base": [], "eye": [], "cheek": [], "lip": []},
    },
  )

  with pytest.raises(AppError) as error:
    await _update_thread(db, VALID_USER_ID, VALID_THREAD_ID, payload)

  assert error.value.status_code == 403
  assert error.value.code == "COMMUNITY_THREAD_FORBIDDEN"
  assert db.updated_args == []


@pytest.mark.asyncio
async def test_delete_thread_soft_deletes_own_thread() -> None:
  db = ThreadManageDatabase()

  result = await _delete_thread(db, VALID_USER_ID, VALID_THREAD_ID)

  assert db.deleted_thread_ids == [VALID_THREAD_ID]
  assert result == {"thread_id": VALID_THREAD_ID, "deleted": True}

@pytest.mark.asyncio
async def test_update_thread_embedding_skips_without_embedding(monkeypatch) -> None:
  monkeypatch.setattr(community_api, "embed_text", lambda _text: None)
  db = ThreadEmbeddingDatabase()

  updated = await _update_thread_embedding(db, VALID_THREAD_ID, {"title": "daily"})

  assert updated is False
  assert db.embedding_updates == []


@pytest.mark.asyncio
async def test_update_thread_embedding_writes_pgvector(monkeypatch) -> None:
  monkeypatch.setattr(community_api, "embed_text", lambda _text: [0.1] * 1024)
  db = ThreadEmbeddingDatabase()

  updated = await _update_thread_embedding(db, VALID_THREAD_ID, {"title": "daily"})

  assert updated is True
  assert db.embedding_updates[0][0] == VALID_THREAD_ID
  assert db.embedding_updates[0][1].startswith("[0.10000000")

@pytest.mark.asyncio
async def test_record_community_events_accepts_client_batch() -> None:
  db = CommunityEventDatabase()
  payload = CommunityEventsCreate.model_validate(
    {
      "events": [
        {"eventType": "view", "threadId": str(VALID_THREAD_ID)},
        {"eventType": "dwell", "threadId": str(VALID_THREAD_ID), "dwellMs": 2400},
        {"eventType": "search", "searchQuery": "  glow base  "},
      ],
    },
  )

  accepted = await _record_community_events(db, VALID_USER_ID, payload.events)

  assert accepted == 3
  assert db.events == [
    (VALID_USER_ID, VALID_THREAD_ID, "view", None, None),
    (VALID_USER_ID, VALID_THREAD_ID, "dwell", None, 2400),
    (VALID_USER_ID, None, "search", "glow base", None),
  ]


@pytest.mark.asyncio
async def test_record_community_events_rejects_unsupported_type() -> None:
  event = CommunityEventCreate.model_validate(
    {"eventType": "follow", "threadId": str(VALID_THREAD_ID)},
  )

  with pytest.raises(AppError) as error:
    await _record_community_events(CommunityEventDatabase(), VALID_USER_ID, [event])

  assert error.value.status_code == 400
  assert error.value.code == "INVALID_COMMUNITY_EVENT_TYPE"


@pytest.mark.asyncio
async def test_record_community_events_rejects_server_managed_type() -> None:
  event = CommunityEventCreate.model_validate(
    {"eventType": "like", "threadId": str(VALID_THREAD_ID)},
  )

  with pytest.raises(AppError) as error:
    await _record_community_events(CommunityEventDatabase(), VALID_USER_ID, [event])

  assert error.value.status_code == 400
  assert error.value.code == "COMMUNITY_EVENT_SERVER_MANAGED"



@pytest.mark.asyncio
async def test_record_community_events_validates_full_batch_before_insert() -> None:
  db = CommunityEventDatabase()
  events = [
    CommunityEventCreate.model_validate({"eventType": "view", "threadId": str(VALID_THREAD_ID)}),
    CommunityEventCreate.model_validate({"eventType": "unknown", "threadId": str(VALID_THREAD_ID)}),
  ]

  with pytest.raises(AppError) as error:
    await _record_community_events(db, VALID_USER_ID, events)

  assert error.value.status_code == 400
  assert error.value.code == "INVALID_COMMUNITY_EVENT_TYPE"
  assert db.events == []

@pytest.mark.asyncio
async def test_record_community_events_rejects_more_than_twenty() -> None:
  events = [
    CommunityEventCreate.model_validate({"eventType": "view", "threadId": str(VALID_THREAD_ID)})
    for _ in range(21)
  ]

  with pytest.raises(AppError) as error:
    await _record_community_events(CommunityEventDatabase(), VALID_USER_ID, events)

  assert error.value.status_code == 400
  assert error.value.code == "COMMUNITY_EVENTS_LIMIT_EXCEEDED"


@pytest.mark.asyncio
async def test_record_events_route_returns_accepted(monkeypatch) -> None:
  async def fake_ensure_user(_db, _auth):
    return {"id": VALID_USER_ID}

  monkeypatch.setattr(community_api, "ensure_user", fake_ensure_user)
  db = CommunityEventDatabase()
  payload = CommunityEventsCreate.model_validate(
    {"events": [{"eventType": "impression", "threadId": str(VALID_THREAD_ID)}]},
  )

  response = await community_api.record_events(payload, auth=None, db=db)

  assert response["data"] == {"accepted": 1}
  assert db.events == [(VALID_USER_ID, VALID_THREAD_ID, "impression", None, None)]


@pytest.mark.asyncio
async def test_like_and_save_thread_record_server_events(monkeypatch) -> None:
  async def fake_ensure_user(_db, _auth):
    return {"id": VALID_USER_ID}

  monkeypatch.setattr(community_api, "ensure_user", fake_ensure_user)
  db = ThreadReactionEventDatabase()

  like_response = await community_api.like_thread(VALID_THREAD_ID, auth=None, db=db)
  save_response = await community_api.save_thread(VALID_THREAD_ID, auth=None, db=db)

  assert like_response["data"]["liked"] is True
  assert save_response["data"]["saved"] is True
  assert db.events == [
    (VALID_USER_ID, VALID_THREAD_ID, "like", None, None),
    (VALID_USER_ID, VALID_THREAD_ID, "save", None, None),
  ]
  assert db.count_updates == 2


@pytest.mark.asyncio
async def test_like_reply_records_thread_event(monkeypatch) -> None:
  async def fake_ensure_user(_db, _auth):
    return {"id": VALID_USER_ID}

  monkeypatch.setattr(community_api, "ensure_user", fake_ensure_user)
  db = ReplyReactionEventDatabase()

  response = await community_api.like_reply(VALID_REPLY_ID, auth=None, db=db)

  assert response["data"]["liked"] is True
  assert db.events == [(VALID_USER_ID, VALID_THREAD_ID, "like", None, None)]

@pytest.mark.asyncio
async def test_get_threads_applies_window_days_clause(monkeypatch) -> None:
  async def fake_ensure_user(_db, _auth):
    return {"id": VALID_USER_ID}

  monkeypatch.setattr(community_api, "ensure_user", fake_ensure_user)
  db = ThreadListDatabase()

  response = await community_api.get_threads(
    category="trending",
    sort="popular",
    limit=3,
    window_days=7,
    auth=None,
    db=db,
  )

  assert db.fetch_query is not None
  assert "t.created_at >= now() - ($3::int * interval '1 day')" in db.fetch_query
  assert "and (t.like_count + t.save_count * 2 + t.reply_count) >= 1" in db.fetch_query
  assert "order by (t.like_count + t.save_count * 2 + t.reply_count) desc, t.created_at desc" in db.fetch_query
  assert db.fetch_args == (VALID_USER_ID, 3, 7)
  assert response["data"] == {"threads": [], "nextCursor": None}

@pytest.mark.asyncio
async def test_get_threads_positions_window_days_after_category_and_cursor(monkeypatch) -> None:
  async def fake_ensure_user(_db, _auth):
    return {"id": VALID_USER_ID}

  monkeypatch.setattr(community_api, "ensure_user", fake_ensure_user)
  db = ThreadListDatabase()

  await community_api.get_threads(
    category="lookbook",
    sort="latest",
    cursor="2026-07-06T00:00:00+00:00",
    limit=5,
    window_days=14,
    auth=None,
    db=db,
  )

  assert db.fetch_query is not None
  assert "and t.category = $3" in db.fetch_query
  assert "and t.created_at < $4::timestamptz" in db.fetch_query
  assert "t.created_at >= now() - ($5::int * interval '1 day')" in db.fetch_query
  assert db.fetch_args == (
    VALID_USER_ID,
    5,
    "lookbook",
    "2026-07-06T00:00:00+00:00",
    14,
  )

@pytest.mark.asyncio
async def test_get_threads_rejects_invalid_window_days() -> None:
  db = ThreadListDatabase()

  with pytest.raises(AppError) as error:
    await community_api.get_threads(window_days=0, auth=None, db=db)

  assert error.value.status_code == 400
  assert error.value.code == "INVALID_COMMUNITY_WINDOW_DAYS"
  assert db.fetch_query is None


@pytest.mark.asyncio
async def test_get_threads_filters_author_me(monkeypatch) -> None:
  async def fake_ensure_user(_db, _auth):
    return {"id": VALID_USER_ID}

  monkeypatch.setattr(community_api, "ensure_user", fake_ensure_user)
  db = ThreadListDatabase()

  response = await community_api.get_threads(author="me", limit=30, auth=None, db=db)

  assert db.fetch_query is not None
  assert "and t.author_user_id = $3" in db.fetch_query
  assert "order by t.created_at desc" in db.fetch_query
  assert "saved_filter.saved_at" not in db.fetch_query
  assert db.fetch_args == (VALID_USER_ID, 30, VALID_USER_ID)
  assert response["data"] == {"threads": [], "nextCursor": None}


@pytest.mark.asyncio
async def test_get_threads_filters_author_uuid_with_viewer_state(monkeypatch) -> None:
  async def fake_ensure_user(_db, _auth):
    return {"id": VALID_USER_ID}

  monkeypatch.setattr(community_api, "ensure_user", fake_ensure_user)
  db = ThreadListDatabase()

  await community_api.get_threads(author=str(OTHER_USER_ID), limit=12, auth=None, db=db)

  assert db.fetch_query is not None
  assert "exists(select 1 from community_thread_saves s where s.thread_id = t.id and s.user_id = $1)" in db.fetch_query
  assert "and t.author_user_id = $3" in db.fetch_query
  assert db.fetch_args == (VALID_USER_ID, 12, OTHER_USER_ID)


@pytest.mark.asyncio
async def test_get_threads_filters_saved_me(monkeypatch) -> None:
  async def fake_ensure_user(_db, _auth):
    return {"id": VALID_USER_ID}

  monkeypatch.setattr(community_api, "ensure_user", fake_ensure_user)
  db = ThreadListDatabase()

  await community_api.get_threads(saved="me", limit=50, auth=None, db=db)

  assert db.fetch_query is not None
  assert "join community_thread_saves saved_filter on saved_filter.thread_id = t.id and saved_filter.user_id = $1" in db.fetch_query
  assert "order by saved_filter.saved_at desc, t.created_at desc" in db.fetch_query
  assert db.fetch_args == (VALID_USER_ID, 30)


@pytest.mark.asyncio
async def test_get_threads_rejects_invalid_author(monkeypatch) -> None:
  async def fake_ensure_user(_db, _auth):
    return {"id": VALID_USER_ID}

  monkeypatch.setattr(community_api, "ensure_user", fake_ensure_user)
  db = ThreadListDatabase()

  with pytest.raises(AppError) as error:
    await community_api.get_threads(author="not-a-user-id", auth=None, db=db)

  assert error.value.status_code == 400
  assert error.value.code == "INVALID_COMMUNITY_AUTHOR"
  assert db.fetch_query is None


@pytest.mark.asyncio
async def test_get_threads_rejects_invalid_saved_filter() -> None:
  db = ThreadListDatabase()

  with pytest.raises(AppError) as error:
    await community_api.get_threads(saved="all", auth=None, db=db)

  assert error.value.status_code == 400
  assert error.value.code == "INVALID_COMMUNITY_SAVED_FILTER"
  assert db.fetch_query is None

@pytest.mark.asyncio
async def test_create_reply_returns_single_reply_and_counts() -> None:
  db = ReplyCreateDatabase()
  payload = CommunityReplyCreate.model_validate(
    {"body": "  soft glow tip  ", "parentReplyId": str(PARENT_REPLY_ID)},
  )

  result = await _create_reply(db, VALID_USER_ID, VALID_THREAD_ID, payload)

  assert set(result.keys()) == {"reply", "counts"}
  assert result["counts"] == {"replies": 25}
  assert result["reply"]["id"] == VALID_REPLY_ID
  assert result["reply"]["parent_reply_id"] == PARENT_REPLY_ID
  assert result["reply"]["body"] == "soft glow tip"
  assert result["reply"]["viewer_state"] == {"liked": False}
  assert "body" not in result
  assert "media" not in result
  assert db.insert_args == [(VALID_THREAD_ID, PARENT_REPLY_ID, VALID_USER_ID, "soft glow tip")]
  assert db.insert_queries
  assert all("returning id" in query for query in db.insert_queries)
  assert db.events == [(VALID_USER_ID, VALID_THREAD_ID, "reply", None, None)]

  envelope = success(result)
  assert set(envelope["data"].keys()) == {"reply", "counts"}
  assert envelope["data"]["reply"]["parentReplyId"] == str(PARENT_REPLY_ID)
  assert envelope["data"]["reply"]["viewerState"] == {"liked": False}

@pytest.mark.asyncio
async def test_create_reply_rejects_missing_thread() -> None:
  db = ReplyCreateDatabase(thread_exists=False)
  payload = CommunityReplyCreate.model_validate({"body": "orphan reply"})

  with pytest.raises(AppError) as error:
    await _create_reply(db, VALID_USER_ID, VALID_THREAD_ID, payload)

  assert error.value.status_code == 404
  assert error.value.code == "COMMUNITY_THREAD_NOT_FOUND"
  assert db.insert_args == []

@pytest.mark.asyncio
async def test_create_reply_preserves_depth_rejection() -> None:
  db = ReplyCreateDatabase(parent_parent_reply_id=PARENT_REPLY_ID)
  payload = CommunityReplyCreate.model_validate(
    {"body": "nested reply", "parentReplyId": str(VALID_REPLY_ID)},
  )

  with pytest.raises(AppError) as error:
    await _create_reply(db, VALID_USER_ID, VALID_THREAD_ID, payload)

  assert error.value.status_code == 400
  assert error.value.code == "COMMUNITY_REPLY_DEPTH_EXCEEDED"
  assert db.insert_args == []

def test_reply_mapper_includes_viewer_state() -> None:
  reply = _reply(
    {
      "id": VALID_REPLY_ID,
      "parent_reply_id": None,
      "author_id": VALID_USER_ID,
      "author_nickname": "tester",
      "author_avatar_url": None,
      "body": "좋아요 테스트",
      "like_count": 3,
      "created_at": "2026-07-06T00:00:00Z",
      "viewer_liked": True,
    },
  )

  assert reply["viewer_state"] == {"liked": True}


@pytest.mark.asyncio
async def test_set_reply_reaction_is_idempotent() -> None:
  db = ReplyReactionDatabase()

  await _set_reply_reaction(db, VALID_USER_ID, VALID_REPLY_ID, True)
  await _set_reply_reaction(db, VALID_USER_ID, VALID_REPLY_ID, True)

  assert db.likes == {(VALID_USER_ID, VALID_REPLY_ID)}
  assert db.count_updates == [1, 1]
  assert db.insert_queries
  assert all("on conflict (user_id, reply_id) do nothing" in query for query in db.insert_queries)


@pytest.mark.asyncio
async def test_set_reply_reaction_rejects_missing_reply() -> None:
  db = ReplyReactionDatabase(reply_exists=False)

  with pytest.raises(AppError) as error:
    await _set_reply_reaction(db, VALID_USER_ID, VALID_REPLY_ID, True)

  assert error.value.status_code == 404
  assert error.value.code == "COMMUNITY_REPLY_NOT_FOUND"

@pytest.mark.asyncio
async def test_fetch_thread_detail_includes_viewer_user_id() -> None:
  detail = await _fetch_thread_detail(ThreadDetailDatabase(), VALID_THREAD_ID, VALID_USER_ID)

  assert detail["viewer_user_id"] == VALID_USER_ID

def test_reply_mapper_masks_deleted_reply() -> None:
  reply = _reply(
    {
      "id": VALID_REPLY_ID,
      "parent_reply_id": None,
      "author_id": VALID_USER_ID,
      "author_nickname": "tester",
      "author_avatar_url": None,
      "body": "원문",
      "like_count": 7,
      "created_at": "2026-07-06T00:00:00Z",
      "status": "deleted",
      "viewer_liked": True,
    },
  )

  assert reply["body"] == "삭제된 답글이에요"
  assert reply["like_count"] == 0
  assert reply["viewer_state"] == {"liked": False}


@pytest.mark.asyncio
async def test_update_reply_updates_own_reply() -> None:
  db = ReplyUpdateDatabase()
  payload = CommunityReplyUpdate.model_validate({"body": "  edited reply  "})

  result = await _update_reply(db, VALID_USER_ID, VALID_REPLY_ID, payload)

  assert db.updated_args == [(VALID_REPLY_ID, "edited reply", VALID_USER_ID)]
  assert result["reply"]["body"] == "edited reply"
  assert result["reply"]["viewer_state"] == {"liked": False}


@pytest.mark.asyncio
async def test_update_reply_rejects_other_author() -> None:
  db = ReplyUpdateDatabase(author_user_id=OTHER_USER_ID)
  payload = CommunityReplyUpdate.model_validate({"body": "not mine"})

  with pytest.raises(AppError) as error:
    await _update_reply(db, VALID_USER_ID, VALID_REPLY_ID, payload)

  assert error.value.status_code == 403
  assert error.value.code == "COMMUNITY_REPLY_FORBIDDEN"
  assert db.updated_args == []


@pytest.mark.asyncio
async def test_thread_manage_post_aliases(monkeypatch) -> None:
  async def fake_ensure_user(_db, _auth):
    return {"id": VALID_USER_ID}

  monkeypatch.setattr(community_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(community_api, "embed_text", lambda _text: None)
  update_db = ThreadManageDatabase()
  payload = CommunityThreadUpdate.model_validate(
    {
      "category": "lookbook",
      "title": "alias update",
      "mediaIds": [VALID_MEDIA_ID],
      "productUsage": {"base": [], "eye": [], "cheek": [], "lip": []},
    },
  )

  update_response = await community_api.update_thread_via_post(VALID_THREAD_ID, payload, auth=None, db=update_db)
  delete_response = await community_api.delete_thread_via_post(VALID_THREAD_ID, auth=None, db=ThreadManageDatabase())

  assert update_response["data"]["title"] == "alias update"
  assert delete_response["data"] == {"threadId": str(VALID_THREAD_ID), "deleted": True}


@pytest.mark.asyncio
async def test_delete_reply_soft_deletes_own_reply_and_recounts() -> None:
  db = ReplyDeleteDatabase(reply_count=2)

  result = await _delete_reply(db, VALID_USER_ID, VALID_REPLY_ID)

  assert db.deleted_reply_ids == [VALID_REPLY_ID]
  assert result == {"reply_id": VALID_REPLY_ID, "deleted": True, "counts": {"replies": 2}}


@pytest.mark.asyncio
async def test_delete_reply_rejects_other_author() -> None:
  db = ReplyDeleteDatabase(author_user_id=OTHER_USER_ID)

  with pytest.raises(AppError) as error:
    await _delete_reply(db, VALID_USER_ID, VALID_REPLY_ID)

  assert error.value.status_code == 403
  assert error.value.code == "COMMUNITY_REPLY_FORBIDDEN"
  assert db.deleted_reply_ids == []


@pytest.mark.asyncio
async def test_delete_reply_rejects_missing_reply() -> None:
  db = ReplyDeleteDatabase(reply_exists=False)

  with pytest.raises(AppError) as error:
    await _delete_reply(db, VALID_USER_ID, VALID_REPLY_ID)

  assert error.value.status_code == 404
  assert error.value.code == "COMMUNITY_REPLY_NOT_FOUND"
  assert db.deleted_reply_ids == []

def test_community_threads_returns_empty_contract_without_database() -> None:
  client = create_client()

  response = client.get("/api/community/threads?category=trending&sort=popular&limit=12")

  assert response.status_code == 200
  body = response.json()
  assert body["data"] == {"threads": [], "nextCursor": None}
  assert body["meta"]["source"] == "empty_not_configured"


def test_thread_schema_rejects_virtual_trending_category() -> None:
  with pytest.raises(ValidationError):
    CommunityThreadCreate.model_validate(
      {
        "category": "trending",
        "title": "trend tab is virtual",
        "mediaIds": [VALID_MEDIA_ID],
        "productUsage": {"base": [], "eye": [], "cheek": [], "lip": []},
      },
    )


def test_thread_schema_requires_one_to_four_images() -> None:
  with pytest.raises(ValidationError):
    CommunityThreadCreate.model_validate(
      {
        "category": "lookbook",
        "title": "too many images",
        "mediaIds": [
          "11111111-1111-4111-8111-111111111111",
          "22222222-2222-4222-8222-222222222222",
          "33333333-3333-4333-8333-333333333333",
          "44444444-4444-4444-8444-444444444444",
          "55555555-5555-4555-8555-555555555555",
        ],
        "productUsage": {"base": [], "eye": [], "cheek": [], "lip": []},
      },
    )


def test_create_thread_rejects_before_after_without_two_images() -> None:
  client = create_client()

  response = client.post(
    "/api/community/threads",
    json={
      "category": "before_after",
      "title": "before only",
      "mediaIds": [VALID_MEDIA_ID],
      "productUsage": {"base": [], "eye": [], "cheek": [], "lip": []},
    },
  )

  assert response.status_code == 400
  assert response.json()["error"]["code"] == "INVALID_COMMUNITY_PAYLOAD"


def test_create_thread_rejects_before_after_with_more_than_two_images() -> None:
  client = create_client()

  response = client.post(
    "/api/community/threads",
    json={
      "category": "before_after",
      "title": "too many frames",
      "mediaIds": [
        VALID_MEDIA_ID,
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ],
      "productUsage": {"base": [], "eye": [], "cheek": [], "lip": []},
    },
  )

  assert response.status_code == 400
  assert response.json()["error"]["code"] == "INVALID_COMMUNITY_PAYLOAD"


def test_create_thread_rejects_product_combo_with_one_product() -> None:
  client = create_client()

  response = client.post(
    "/api/community/threads",
    json={
      "category": "product_combo",
      "title": "single product",
      "mediaIds": [VALID_MEDIA_ID],
      "productUsage": {
        "base": [{"name": "tone cushion"}],
        "eye": [],
        "cheek": [],
        "lip": [],
      },
    },
  )

  assert response.status_code == 400
  assert response.json()["error"]["code"] == "INVALID_COMMUNITY_PAYLOAD"

def test_create_thread_requires_database_for_valid_write() -> None:
  client = create_client()

  response = client.post(
    "/api/community/threads",
    json={
      "category": "lookbook",
      "title": "daily glow",
      "body": "soft shimmer look",
      "mediaIds": [VALID_MEDIA_ID],
      "moodTags": ["glow"],
      "situationTags": ["daily"],
      "difficulty": "easy",
      "durationMinutes": 10,
      "productUsage": {"base": [], "eye": [], "cheek": [], "lip": []},
    },
  )

  assert response.status_code == 503
  assert response.json()["error"]["code"] == "DATABASE_NOT_CONFIGURED"
