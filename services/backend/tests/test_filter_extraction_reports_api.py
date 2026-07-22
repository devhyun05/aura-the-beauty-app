import pytest
from fastapi import BackgroundTasks

from app.api import filter_extractions as filter_extractions_api
from app.core.errors import AppError
from app.core.settings import Settings
from app.schemas.analysis import FilterExtractionAnalyzeRequest


class FakeDatabase:
  def __init__(self) -> None:
    self.args = ()
    self.query = ""

  async def fetch(self, query, *args):
    self.query = query
    self.args = args
    return []


@pytest.mark.asyncio
async def test_analyze_rejects_disabled_ai_before_auth_or_database(monkeypatch):
  async def fail_ensure_user(_db, _auth):
    raise AssertionError("runAi=false must be rejected before auth or DB work")

  monkeypatch.setattr(filter_extractions_api, "ensure_user", fail_ensure_user)
  assert FilterExtractionAnalyzeRequest().run_ai is True

  with pytest.raises(AppError) as error:
    await filter_extractions_api.analyze_filter_extraction(
      FilterExtractionAnalyzeRequest(runAi=False),
      BackgroundTasks(),
      auth=object(),
      db=object(),
      settings=Settings(),
    )

  assert error.value.status_code == 400
  assert error.value.code == "REFERENCE_MAKEUP_AI_REQUIRED"


@pytest.mark.asyncio
async def test_list_filter_extractions_returns_latest_completed_reports(monkeypatch):
  db = FakeDatabase()

  async def fake_ensure_user(_db, _auth):
    return {"id": "user-1"}

  monkeypatch.setattr(filter_extractions_api, "ensure_user", fake_ensure_user)

  await filter_extractions_api.list_filter_extractions(
    limit=4,
    offset=0,
    auth=object(),
    db=db,
  )

  normalized_query = " ".join(db.query.split()).lower()
  assert "status = 'completed'" in normalized_query
  assert "result_payload->>'aistatus' = 'bedrock_completed'" in normalized_query
  assert "order by created_at desc" in normalized_query
  assert db.args == ("user-1", 4, 0)
