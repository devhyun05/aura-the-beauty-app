import pytest

from app.api import feedback as feedback_api


class FakeDatabase:
  def __init__(self) -> None:
    self.query = ""
    self.args = ()

  async def fetch(self, query, *args):
    self.query = query
    self.args = args
    return []


@pytest.mark.asyncio
async def test_list_feedback_reports_excludes_retake_and_unfinished_jobs(monkeypatch):
  db = FakeDatabase()

  async def fake_ensure_user(_db, _auth):
    return {"id": "user-1"}

  monkeypatch.setattr(feedback_api, "ensure_user", fake_ensure_user)

  await feedback_api.list_feedback_reports(
    auth=object(),
    db=db,
  )

  normalized_query = " ".join(db.query.split()).lower()
  assert "status = 'completed'" in normalized_query
  assert "score is not null" in normalized_query
  assert db.args == ("user-1",)

@pytest.mark.asyncio
async def test_preview_uses_owned_report_request_as_canonical_context(monkeypatch):
  report_id = "12345678-1234-5678-1234-567812345678"
  captured = {}

  class PreviewDatabase:
    async def fetchrow(self, _query, *args):
      assert str(args[0]) == report_id
      assert args[1] == "user-1"
      return {
        "id": report_id,
        "feedback_payload": {
          "request": {"feedbackContext": {"userGoalText": "저장된 결혼식 목적"}, "source": "gallery"},
        },
      }

  async def fake_ensure_user(_db, _auth):
    return {"id": "user-1"}

  async def fake_build(request_payload, _settings):
    captured.update(request_payload)
    return [], "summary", "coach", "bedrock_completed", None

  monkeypatch.setattr(feedback_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(feedback_api, "build_makeup_feedback_conference_preview", fake_build)
  payload = feedback_api.FeedbackConferencePreviewCreate(
    reportId=report_id,
    requestPayload={
      "feedbackContext": {"userGoalText": "클라이언트가 바꾼 목적"},
      "conversationSeed": {"agentId": "goal", "text": "목적을 이어서 살펴볼게요."},
    },
  )

  await feedback_api.create_feedback_conference_preview_messages(
    payload=payload,
    auth=type("Auth", (), {"subject": "sub-1"})(),
    db=PreviewDatabase(),
    settings=object(),
  )

  assert captured["feedbackContext"]["userGoalText"] == "저장된 결혼식 목적"
  assert captured["conversationSeed"]["agentId"] == "goal"


@pytest.mark.asyncio
async def test_closing_uses_completed_owned_report_result(monkeypatch):
  report_id = "12345678-1234-5678-1234-567812345678"
  captured = {}

  class ClosingDatabase:
    async def fetchrow(self, _query, *args):
      return {
        "id": report_id,
        "feedback_payload": {
          "request": {"feedbackContext": {"userGoalText": "저장된 목적"}},
          "result": {"score": 81, "scoreReason": "저장된 결과"},
        },
      }

  async def fake_ensure_user(_db, _auth):
    return {"id": "user-1"}

  async def fake_build(result, request_payload, _settings, *, preview_context):
    captured["result"] = result
    captured["request"] = request_payload
    captured["preview"] = preview_context
    return [], "bedrock_completed", None

  monkeypatch.setattr(feedback_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(feedback_api, "build_makeup_feedback_conference_messages", fake_build)
  payload = feedback_api.FeedbackConferenceMessagesCreate(
    reportId=report_id,
    result={"score": 1, "scoreReason": "클라이언트 결과"},
    requestPayload={"feedbackContext": {"userGoalText": "클라이언트 목적"}},
    previewContext={"summary": "준비 대화 요약"},
  )

  await feedback_api.create_feedback_conference_messages(
    payload=payload,
    auth=type("Auth", (), {"subject": "sub-1"})(),
    db=ClosingDatabase(),
    settings=object(),
  )

  assert captured["result"]["score"] == 81
  assert captured["request"]["feedbackContext"]["userGoalText"] == "저장된 목적"
  assert captured["preview"] == {"summary": "준비 대화 요약"}
