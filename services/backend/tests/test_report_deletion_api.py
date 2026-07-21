from uuid import UUID

import pytest

from app.api import feedback as feedback_api
from app.api import filter_extractions as filter_extractions_api
from app.api import makeup_recommendations as makeup_recommendations_api
from app.core.errors import AppError


REPORT_ID = UUID("12345678-1234-5678-1234-567812345678")


class DeleteDatabase:
  def __init__(self, *, found: bool = True) -> None:
    self.args = ()
    self.found = found
    self.query = ""

  async def fetchrow(self, query, *args):
    self.query = query
    self.args = args
    return {"id": REPORT_ID} if self.found else None


@pytest.mark.parametrize(
  ("module", "delete_report", "table_name"),
  [
    (feedback_api, feedback_api.delete_feedback_report, "makeup_feedback_reports"),
    (
      filter_extractions_api,
      filter_extractions_api.delete_filter_extraction,
      "filter_extraction_reports",
    ),
    (
      makeup_recommendations_api,
      makeup_recommendations_api.delete_recommendation_report,
      "makeup_recommendation_reports",
    ),
  ],
)
@pytest.mark.asyncio
async def test_report_deletion_is_scoped_to_authenticated_owner(
  monkeypatch,
  module,
  delete_report,
  table_name,
):
  db = DeleteDatabase()

  async def fake_ensure_user(_db, _auth):
    return {"id": "user-1"}

  monkeypatch.setattr(module, "ensure_user", fake_ensure_user)
  response = await delete_report(REPORT_ID, auth=object(), db=db)

  normalized_query = " ".join(db.query.split()).lower()
  assert f"delete from {table_name}" in normalized_query
  assert "where id = $1 and user_id = $2" in normalized_query
  assert db.args == (REPORT_ID, "user-1")
  assert response["data"]["deleted"] is True
  assert response["data"]["reportId"] == str(REPORT_ID)


@pytest.mark.parametrize(
  ("module", "delete_report"),
  [
    (feedback_api, feedback_api.delete_feedback_report),
    (filter_extractions_api, filter_extractions_api.delete_filter_extraction),
    (makeup_recommendations_api, makeup_recommendations_api.delete_recommendation_report),
  ],
)
@pytest.mark.asyncio
async def test_report_deletion_hides_missing_or_foreign_report(
  monkeypatch,
  module,
  delete_report,
):
  db = DeleteDatabase(found=False)

  async def fake_ensure_user(_db, _auth):
    return {"id": "user-1"}

  monkeypatch.setattr(module, "ensure_user", fake_ensure_user)

  with pytest.raises(AppError) as exc_info:
    await delete_report(REPORT_ID, auth=object(), db=db)

  assert exc_info.value.status_code == 404
