from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable
from urllib import robotparser
from urllib.parse import urlparse
from urllib.request import Request, urlopen


DEFAULT_USER_AGENT = "AURA-AuradinCatalogBot/0.1 PhaseC-safe-enrichment"

KNOWN_TERMS_URLS: dict[str, tuple[str, ...]] = {
  "www.oliveyoung.co.kr": (
    "https://www.oliveyoung.co.kr/store/company/terms.do",
  ),
  "www.lotteimall.com": (
    "https://www.lotteimall.com/custcenter/terms/viewCustomerTerms.lotte",
  ),
}


@dataclass(frozen=True)
class FetchSummary:
  url: str
  status: int | None
  ok: bool
  content_length: int
  error: str
  body: str


FetchUrl = Callable[[str, str, float], FetchSummary]


def _now_iso() -> str:
  return datetime.now(tz=UTC).isoformat()


def _origin(url: str) -> str:
  parsed = urlparse(url)

  return f"{parsed.scheme}://{parsed.netloc}"


def _domain(url: str) -> str:
  return urlparse(url).netloc


def _summarize_fetch(url: str, user_agent: str, timeout_seconds: float) -> FetchSummary:
  request = Request(url, headers={"User-Agent": user_agent})

  try:
    with urlopen(request, timeout=timeout_seconds) as response:
      body_bytes = response.read()
      body = body_bytes.decode("utf-8", errors="replace")
      status = int(getattr(response, "status", 0) or 0)

      return FetchSummary(
        url=url,
        status=status,
        ok=200 <= status < 400,
        content_length=len(body_bytes),
        error="",
        body=body,
      )
  except Exception as exc:  # noqa: BLE001 - preflight records failures instead of failing the run.
    return FetchSummary(
      url=url,
      status=None,
      ok=False,
      content_length=0,
      error=f"{type(exc).__name__}: {exc}",
      body="",
    )


def _robots_can_fetch(
  *,
  robots_summary: FetchSummary,
  urls: list[str],
  user_agent: str,
) -> dict[str, bool | None]:
  if not robots_summary.ok or not robots_summary.body:
    return {url: None for url in urls}

  parser = robotparser.RobotFileParser()
  parser.parse(robots_summary.body.splitlines())

  return {url: parser.can_fetch(user_agent, url) for url in urls}


def _terms_status(
  *,
  domain: str,
  terms_summaries: list[FetchSummary],
) -> str:
  if not KNOWN_TERMS_URLS.get(domain):
    return "not_configured"

  if any(summary.ok for summary in terms_summaries):
    return "fetched_requires_manual_review"

  return "fetch_failed_requires_manual_review"


def build_domain_preflight(
  *,
  source_urls: list[str],
  user_agent: str = DEFAULT_USER_AGENT,
  timeout_seconds: float = 10.0,
  request_delay_seconds: float = 5.0,
  fetch_url: FetchUrl = _summarize_fetch,
) -> dict[str, dict[str, object]]:
  grouped_urls: dict[str, list[str]] = {}

  for url in source_urls:
    if not url:
      continue

    grouped_urls.setdefault(_domain(url), []).append(url)

  preflight: dict[str, dict[str, object]] = {}

  for index, (domain, urls) in enumerate(sorted(grouped_urls.items())):
    if index > 0 and request_delay_seconds > 0:
      time.sleep(request_delay_seconds)

    robots_url = f"{_origin(urls[0])}/robots.txt"
    robots_summary = fetch_url(robots_url, user_agent, timeout_seconds)
    can_fetch_by_url = _robots_can_fetch(
      robots_summary=robots_summary,
      urls=urls,
      user_agent=user_agent,
    )
    terms_summaries = [
      fetch_url(terms_url, user_agent, timeout_seconds)
      for terms_url in KNOWN_TERMS_URLS.get(domain, ())
    ]
    terms_status = _terms_status(domain=domain, terms_summaries=terms_summaries)
    robots_status = (
      "fetched"
      if robots_summary.ok
      else "fetch_failed_requires_manual_review"
    )

    preflight[domain] = {
      "domain": domain,
      "checkedAt": _now_iso(),
      "userAgent": user_agent,
      "robotsUrl": robots_url,
      "robotsStatus": robots_status,
      "robotsHttpStatus": robots_summary.status,
      "robotsContentLength": robots_summary.content_length,
      "robotsError": robots_summary.error,
      "termsUrls": [summary.url for summary in terms_summaries],
      "termsStatus": terms_status,
      "termsHttpStatuses": [summary.status for summary in terms_summaries],
      "termsErrors": [summary.error for summary in terms_summaries if summary.error],
      "canFetchByUrl": can_fetch_by_url,
      "detailFetchAllowed": all(value is True for value in can_fetch_by_url.values())
      and terms_status == "fetched_requires_manual_review",
      "detailFetchDecision": "manual_review_required_before_detail_fetch",
      "sourceUrlCount": len(urls),
    }

  return preflight


def write_domain_preflight_report(
  path: Path,
  *,
  run_date: str,
  preflight: dict[str, dict[str, object]],
) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  lines = [
    f"# Auradin Phase C Domain Preflight ({run_date})",
    "",
    "No product detail HTML, review text, or original image files are stored in this report.",
    "",
  ]

  for domain, status in sorted(preflight.items()):
    lines.extend(
      [
        f"## {domain}",
        "",
        f"- Checked at: `{status.get('checkedAt')}`",
        f"- User-Agent: `{status.get('userAgent')}`",
        f"- robots.txt: `{status.get('robotsUrl')}`",
        f"- Robots status: `{status.get('robotsStatus')}`",
        f"- Robots HTTP status: `{status.get('robotsHttpStatus')}`",
        f"- Terms URLs: `{status.get('termsUrls')}`",
        f"- Terms status: `{status.get('termsStatus')}`",
        f"- Detail fetch decision: `{status.get('detailFetchDecision')}`",
        f"- Source URL count: `{status.get('sourceUrlCount')}`",
        "",
        "Robots URL decisions:",
        "",
      ],
    )
    can_fetch_by_url = status.get("canFetchByUrl")

    if isinstance(can_fetch_by_url, dict):
      lines.extend(f"- `{url}`: `{decision}`" for url, decision in can_fetch_by_url.items())

    lines.append("")

  path.write_text("\n".join(lines), encoding="utf-8")
