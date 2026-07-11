import httpx
import pytest

from scripts.load_test_auradin import (
  RequestSample,
  choose_answer_option,
  run_auradin_journey,
  summarize_samples,
)


def test_choose_answer_option_prefers_non_noop_filter() -> None:
  question = {
    "options": [
      {"id": "skip", "filterDelta": {"op": "noop"}},
      {"id": "pink", "filterDelta": {"op": "eq"}},
    ],
  }

  assert choose_answer_option(question)["id"] == "pink"


def test_summarize_samples_reports_latency_and_failures() -> None:
  summary = summarize_samples(
    [
      RequestSample("probe", 10.0, 200),
      RequestSample("probe", 20.0, 200),
      RequestSample("probe", 30.0, 500, "HTTP_500"),
    ],
  )

  assert summary["successes"] == 2
  assert summary["failures"] == 1
  assert summary["latencyMsP95"] == 30.0
  assert summary["errorCounts"] == {"HTTP_500": 1}


@pytest.mark.asyncio
async def test_run_auradin_journey_answers_question_and_reaches_results() -> None:
  calls: list[tuple[str, str]] = []

  def handler(request: httpx.Request) -> httpx.Response:
    calls.append((request.method, request.url.path))
    if request.method == "POST" and request.url.path == "/api/search/sessions":
      return httpx.Response(200, json={"data": {"sessionId": "auradin-test"}})
    if request.method == "GET" and request.url.path.endswith("/auradin-test"):
      get_count = sum(method == "GET" for method, _ in calls)
      if get_count == 1:
        return httpx.Response(
          200,
          json={
            "data": {
              "phase": "question",
              "question": {
                "id": "q1",
                "options": [
                  {"id": "o1", "filterDelta": {"op": "eq"}},
                ],
              },
            },
          },
        )
      return httpx.Response(200, json={"data": {"phase": "results"}})
    if request.method == "POST" and request.url.path.endswith("/answer"):
      return httpx.Response(200, json={"data": {"phase": "searching"}})
    if request.method == "POST" and request.url.path.endswith("/cancel"):
      return httpx.Response(200, json={"data": {"phase": "cancelled"}})
    return httpx.Response(404, json={"error": {"message": "not found"}})

  async with httpx.AsyncClient(
    base_url="https://example.test",
    transport=httpx.MockTransport(handler),
  ) as client:
    result = await run_auradin_journey(client, prompt="립 추천", max_answers=3)

  assert result.phase == "results"
  assert result.answered_questions == 1
  assert result.error is None
  assert ("POST", "/api/search/sessions/auradin-test/answer") in calls
  assert calls[-1] == ("POST", "/api/search/sessions/auradin-test/cancel")
