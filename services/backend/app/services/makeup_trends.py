import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from app.core.errors import AppError


logger = logging.getLogger(__name__)

SOURCE_REGISTRY: dict[str, dict[str, Any]] = {
  "allure-ss26": {
    "name": "Allure Summer 2026",
    "url": "https://www.allure.com/story/summer-makeup-trends-2026",
    "publishedAt": "2026-05-20T00:00:00Z",
    "marketScope": "global",
  },
  "elle-ss26": {
    "name": "ELLE Spring 2026",
    "url": "https://www.elle.com/beauty/makeup-skin-care/a70607092/spring-2026-best-makeup-trends/",
    "publishedAt": "2026-03-04T00:00:00Z",
    "marketScope": "global",
  },
  "vogue-kbeauty": {
    "name": "Vogue K-Beauty 2026",
    "url": "https://www.vogue.com/article/k-beauty-makeup-trends",
    "publishedAt": "2026-01-30T00:00:00Z",
    "marketScope": "ko-KR",
  },
  "bazaar-kbeauty": {
    "name": "Harper's Bazaar K-Beauty 2026",
    "url": "https://www.harpersbazaar.com/beauty/makeup/g69969668/2026-korean-makeup-trends/",
    "publishedAt": "2026-01-16T00:00:00Z",
    "marketScope": "ko-KR",
  },
  "pinterest-ss26": {
    "name": "Pinterest Summer Trend Report 2026",
    "url": "https://newsroom.pinterest.com/news/summer-trend-report-2026/",
    "publishedAt": "2026-05-26T00:00:00Z",
    "marketScope": "global",
  },
}


SEED_SITUATIONS: tuple[dict[str, Any], ...] = (
  {
    "key": "daily",
    "label": "일상",
    "description": "출근, 등교, 가벼운 약속과 주말 외출",
    "imageAssetKey": "daily",
    "keywords": (
      ("출근·등교", "curated", None),
      ("카페·브런치", "curated", None),
      ("가벼운 약속", "curated", None),
      ("퇴근 후 약속", "curated", None),
      ("주말 나들이", "curated", None),
    ),
  },
  {
    "key": "formal_event",
    "label": "특별한 날",
    "description": "데이트, 중요한 일정과 기념일",
    "imageAssetKey": "formal-event",
    "keywords": (
      ("소개팅·데이트", "curated", None),
      ("결혼식 하객", "curated", None),
      ("면접·중요한 발표", "curated", None),
      ("기념일·생일", "curated", None),
      ("졸업식·가족 행사", "curated", None),
    ),
  },
  {
    "key": "camera_content",
    "label": "촬영",
    "description": "증명사진부터 프로필과 영상까지",
    "imageAssetKey": "camera-content",
    "keywords": (
      ("증명사진", "curated", None),
      ("프로필 촬영", "curated", None),
      ("SNS 셀카", "curated", None),
      ("영상·라이브", "curated", None),
      ("야구장 전광판", "curated", None),
    ),
  },
  {
    "key": "festival_performance",
    "label": "독특한 날",
    "description": "공연, 테마 파티와 색다른 이벤트",
    "imageAssetKey": "festival-performance",
    "keywords": (
      ("콘서트·페스티벌", "curated", None),
      ("클럽·야간 파티", "curated", None),
      ("테마 파티·코스프레", "curated", None),
      ("무대 공연", "curated", None),
      ("패션 행사·전시 오프닝", "curated", None),
    ),
  },
)

def _stable_id(kind: str, value: str) -> str:
  return str(uuid5(NAMESPACE_URL, f"aura:makeup:{kind}:{value}"))


def _iso(value: Any) -> str | None:
  if value is None:
    return None
  if isinstance(value, datetime):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
  return str(value)


def _json_list(value: Any) -> list[str]:
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return []
  return [str(item).strip() for item in value if str(item).strip()] if isinstance(value, list) else []


def curated_fallback_discovery() -> dict[str, Any]:
  situations: list[dict[str, Any]] = []
  for index, seed in enumerate(SEED_SITUATIONS, start=1):
    keywords = []
    for label, _kind, _source_key in seed["keywords"]:
      keywords.append(
        {
          "id": _stable_id("keyword", label),
          "label": label,
          "kind": "curated",
          "badge": "CURATED",
          "marketScope": "ko-KR",
          "seedPrompt": f"{seed['label']} 상황에 맞는 {label} 방향을 실용적으로 해석한다.",
          "tags": [seed["key"], label],
          "trendScore": None,
          "sourceName": None,
          "sourceUrl": None,
          "sourcePublishedAt": None,
          "asOf": None,
          "expiresAt": None,
          "confidence": None,
        },
      )
    situations.append(
      {
        "id": _stable_id("situation", seed["key"]),
        "key": seed["key"],
        "label": seed["label"],
        "description": seed["description"],
        "imageAssetKey": seed["imageAssetKey"],
        "sortOrder": index * 10,
        "keywords": keywords,
      },
    )
  return {
    "situations": situations,
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "fallback": True,
  }


def _keyword_from_row(row: dict[str, Any]) -> dict[str, Any] | None:
  kind = str(row.get("keyword_kind") or "curated")
  source_required = (
    row.get("source_url"),
    row.get("source_published_at"),
    row.get("market_scope"),
    row.get("as_of"),
    row.get("expires_at"),
  )
  if kind == "trend" and not all(source_required):
    kind = "curated"
  expires_at = row.get("expires_at")
  if kind == "trend" and isinstance(expires_at, datetime) and expires_at <= datetime.now(timezone.utc):
    return None
  raw_market_scope = str(row.get("market_scope") or "ko-KR").strip()
  normalized_market_scope = raw_market_scope.casefold().replace("_", "-")
  if normalized_market_scope in {"kr", "ko-kr", "korea"}:
    market_scope = "ko-KR"
  elif normalized_market_scope in {"global", "global-ss26"}:
    market_scope = "global"
  else:
    market_scope = raw_market_scope
  badge = {
    "steady": "STEADY",
    "curated": "CURATED",
  }.get(kind)
  if kind == "trend":
    badge = "TREND_K_BEAUTY_2026" if market_scope == "ko-KR" else "TREND_GLOBAL_SS26"
  return {
    "id": str(row.get("keyword_id") or ""),
    "label": str(row.get("keyword_label") or "").strip(),
    "kind": kind,
    "badge": badge,
    "marketScope": market_scope,
    "seedPrompt": str(row.get("seed_prompt") or "").strip(),
    "tags": _json_list(row.get("tags")),
    "trendScore": float(row["trend_score"]) if row.get("trend_score") is not None else None,
    "sourceName": str(row.get("source_name") or "").strip() or None,
    "sourceUrl": str(row.get("source_url") or "").strip() or None,
    "sourcePublishedAt": _iso(row.get("source_published_at")),
    "asOf": _iso(row.get("as_of")),
    "expiresAt": _iso(expires_at),
    "confidence": str(row.get("confidence") or "").strip() or None,
  }


async def fetch_discovery(db: Any) -> dict[str, Any]:
  try:
    rows = await db.fetch(
      """
      select s.id as situation_id, s.key as situation_key, s.label as situation_label,
             s.description as situation_description, s.image_asset_key, s.sort_order,
             k.id as keyword_id, k.text as keyword_label, k.seed_prompt, k.tags,
             k.keyword_kind, k.source_name, k.source_url, k.source_published_at,
             k.market_scope, k.trend_score, k.confidence, k.as_of, k.expires_at,
             mapping.sort_order as keyword_sort_order
      from makeup_situations s
      left join makeup_situation_keywords mapping
        on mapping.situation_id = s.id and mapping.status = 'active'
      left join makeup_scenario_library k
        on k.id = mapping.keyword_id
       and k.status = 'active'
       and k.review_status = 'approved'
       and k.keyword_kind <> 'legacy_scenario'
       and (k.expires_at is null or k.expires_at > now())
      where s.status = 'active' and s.key <> 'custom'
      order by s.sort_order, mapping.sort_order, k.text
      """,
    )
  except Exception:
    logger.warning("[aura:makeup-recommendation] discovery:fallback", exc_info=True)
    return curated_fallback_discovery()

  grouped: dict[str, dict[str, Any]] = {}
  for row in rows:
    situation_id = str(row.get("situation_id") or "")
    if not situation_id:
      continue
    situation = grouped.setdefault(
      situation_id,
      {
        "id": situation_id,
        "key": str(row.get("situation_key") or ""),
        "label": str(row.get("situation_label") or ""),
        "description": str(row.get("situation_description") or ""),
        "imageAssetKey": str(row.get("image_asset_key") or ""),
        "sortOrder": int(row.get("sort_order") or 0),
        "keywords": [],
      },
    )
    if row.get("keyword_id") is not None:
      keyword = _keyword_from_row(row)
      if keyword and keyword["label"]:
        situation["keywords"].append(keyword)

  return {
    "situations": list(grouped.values()),
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "fallback": False,
  }


async def fetch_source_report_projections(db: Any, user_id: UUID) -> list[dict[str, Any]]:
  rows = await db.fetch(
    """
    select r.id, r.title, r.report_title, r.analyzed_at, r.created_at,
           r.face_shape, r.skin_type, r.tone_summary, r.personal_color,
           r.recommended_mood, r.summary, r.short_summary,
           coalesce(preview_media.thumbnail_cdn_url, preview_media.cdn_url,
                    source_media.thumbnail_cdn_url, source_media.cdn_url) as thumbnail_url
    from analysis_reports r
    left join media_assets source_media on source_media.id = r.source_media_id
    left join media_assets preview_media on preview_media.id = r.preview_media_id
    where r.user_id = $1 and r.status = 'completed' and r.deleted_at is null
    order by coalesce(r.analyzed_at, r.created_at) desc
    limit 100
    """,
    user_id,
  )
  return [
    {
      "id": str(row["id"]),
      "title": str(row.get("report_title") or row.get("title") or "얼굴 분석 보고서"),
      "analyzedAt": _iso(row.get("analyzed_at") or row.get("created_at")),
      "thumbnailUrl": str(row.get("thumbnail_url") or "") or None,
      "faceShape": str(row.get("face_shape") or "") or None,
      "skinType": str(row.get("skin_type") or "") or None,
      "toneSummary": str(row.get("tone_summary") or "") or None,
      "personalColor": str(row.get("personal_color") or "") or None,
      "recommendedMood": str(row.get("recommended_mood") or "") or None,
      "summary": str(row.get("short_summary") or row.get("summary") or "") or None,
    }
    for row in rows
  ]


async def resolve_keyword_selection(
  db: Any,
  situation_id: UUID,
  keyword_id: UUID,
) -> tuple[dict[str, Any], dict[str, Any]]:
  row = await db.fetchrow(
    """
    select s.id as situation_id, s.key as situation_key, s.label as situation_label,
           s.description as situation_description, s.image_asset_key,
           k.id as keyword_id, k.text as keyword_label, k.seed_prompt, k.tags,
           k.keyword_kind, k.source_name, k.source_url, k.source_published_at,
           k.market_scope, k.trend_score, k.confidence, k.as_of, k.expires_at
    from makeup_situation_keywords mapping
    join makeup_situations s on s.id = mapping.situation_id and s.status = 'active'
    join makeup_scenario_library k on k.id = mapping.keyword_id and k.status = 'active'
    where mapping.situation_id = $1 and mapping.keyword_id = $2
      and mapping.status = 'active'
      and k.review_status = 'approved'
      and k.keyword_kind <> 'legacy_scenario'
      and (k.expires_at is null or k.expires_at > now())
    """,
    situation_id,
    keyword_id,
  )
  if row is None:
    raise AppError(
      422,
      "MAKEUP_KEYWORD_NOT_IN_SITUATION",
      "The selected keyword is not available for this situation.",
    )
  keyword = _keyword_from_row(row)
  if keyword is None:
    raise AppError(422, "MAKEUP_KEYWORD_EXPIRED", "The selected keyword has expired.")
  situation = {
    "id": str(row["situation_id"]),
    "key": str(row.get("situation_key") or ""),
    "label": str(row.get("situation_label") or ""),
    "description": str(row.get("situation_description") or ""),
    "imageAssetKey": str(row.get("image_asset_key") or ""),
  }
  return situation, keyword
