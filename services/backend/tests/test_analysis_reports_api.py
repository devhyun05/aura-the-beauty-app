import pytest

from app.api import analysis as analysis_api


class FakeDatabase:
  def __init__(self) -> None:
    self.query = ""
    self.args = ()

  async def fetch(self, query, *args):
    self.query = query
    self.args = args
    return []


@pytest.mark.asyncio
async def test_list_analysis_reports_exposes_completed_fallback_reports(monkeypatch):
  db = FakeDatabase()

  async def fake_ensure_user(_db, _auth):
    return {"id": "user-1"}

  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)

  await analysis_api.list_analysis_reports(
    with_recommended_makeups=False,
    limit=3,
    auth=object(),
    db=db,
  )

  normalized_query = " ".join(db.query.split()).lower()
  assert "r.status = 'completed'" in normalized_query
  assert "'faceanalysisv2'->'perception'" not in normalized_query
  assert "'faceanalysisv2'->'consulting'" not in normalized_query
  assert db.args == ("user-1", 3)
