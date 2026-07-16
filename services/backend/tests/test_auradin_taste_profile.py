"""B7 §7.3 — user_taste_profile 계산·새도 모드·anchor-only 격리 계약 테스트.

계약(비협상): profile은 softPreferences에 절대 주입되지 않고, anchor 선정
(select_anchor_with_profile) 한 지점에서만 소비된다. diverse/discovery(assign_roles)·
floor(passes_floor)·MMR·전체 정렬의 입력에 profile 인자가 아예 없어야 한다.
"""

from __future__ import annotations

import importlib.util
import inspect
import json
import pathlib
from datetime import datetime, timedelta, timezone

import pytest

from app.core.settings import Settings
from app.services.auradin_agent import ranking, session_manager
from app.services.auradin_agent.ranking import build_slice_result, select_anchor_with_profile
from app.services.auradin_agent.taste_profile import (
  CAP_PROFILE,
  build_taste_profile,
  cold_start_eligible,
  decay_factor,
  get_taste_profile,
  profile_raw_score,
  reset_profile_cache,
)


NOW = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)
OWNER = "user:v1:test:abc"


def _item(
  item_id: str,
  *,
  brand: str = "",
  finish: str = "",
  color_family: str = "",
  texture: str = "",
  price: int = 0,
) -> dict:
  attributes = {}
  if finish:
    attributes["finish"] = finish
  if color_family:
    attributes["colorFamily"] = color_family
  if texture:
    attributes["texture"] = texture
  live_offer = (
    {"priceKrw": price, "imageUrl": f"https://img/{item_id}.jpg", "purchaseUrl": f"https://buy/{item_id}"}
    if price
    else {}
  )
  return {
    "id": item_id,
    "brandName": brand,
    "productName": f"product {item_id}",
    "category": "lip",
    "attributes": attributes,
    "liveOffer": live_offer,
  }


CATALOG = {
  "p-glossy": _item("p-glossy", brand="BrandA", finish="glossy", color_family="pink", texture="tint", price=12000),
  "p-matte": _item("p-matte", brand="BrandB", finish="matte", color_family="red", texture="cream", price=30000),
  "p-velvet": _item("p-velvet", brand="BrandC", finish="velvet", color_family="coral", texture="balm", price=15000),
  "p-plain": _item("p-plain", brand=""),
}


def _event(event_type: str, product_id: str, session_id: str, occurred_at: datetime, owner: str = OWNER) -> dict:
  return {
    "ownerSubject": owner,
    "eventType": event_type,
    "productId": product_id,
    "sessionId": session_id,
    "occurredAt": occurred_at.isoformat(),
  }


def _row(item_id: str, score: float) -> dict:
  return {
    "item": CATALOG[item_id],
    "score": round(score, 6),
    "_scoreRaw": score,
    "components": {
      "matchedExplicitPref": True,
      "semanticScore": 0.0,
      "evidenceScore": 0.5,
      "_scoreRaw": score,
    },
    "matchedLabels": [],
  }


def _ranked() -> list[dict]:
  return [
    _row("p-matte", 0.700),
    _row("p-glossy", 0.699),
    _row("p-velvet", 0.600),
    _row("p-plain", 0.550),
  ]


# 프로필: glossy 선호 + matte 회피 — p-matte(현행 anchor)를 p-glossy로 뒤집을 수 있는 신호.
PROFILE = {
  "attrAffinity": {"finish": {"glossy": 3.0}},
  "attrAvoid": {"finish": {"matte": 3.0}},
  "brandAffinity": {},
  "brandAvoid": {},
  "priceBand": None,
}


# ------------------------------------------------------------------ 지수감쇠·프로필 계산


def test_decay_factor_halves_every_30_days() -> None:
  assert decay_factor(NOW, NOW) == pytest.approx(1.0)
  assert decay_factor(NOW - timedelta(days=30), NOW) == pytest.approx(0.5)
  assert decay_factor(NOW - timedelta(days=60), NOW) == pytest.approx(0.25)
  # 미래 시각(시계 skew)은 증폭 금지 — 1.0 클램프.
  assert decay_factor(NOW + timedelta(days=5), NOW) == pytest.approx(1.0)


def test_profile_weights_decay_and_negative_goes_to_avoid() -> None:
  events = [
    _event("save", "p-glossy", "s1", NOW),                        # +3.0
    _event("save", "p-matte", "s2", NOW - timedelta(days=30)),    # +3.0 * 0.5 = 1.5
    _event("hide", "p-velvet", "s3", NOW),                        # avoid 3.0
    _event("product_open", "p-plain", "s1", NOW),
    _event("product_open", "p-plain", "s2", NOW - timedelta(days=30)),
  ]
  profile = build_taste_profile(events, catalog=CATALOG, now=NOW)
  assert profile is not None
  assert profile["attrAffinity"]["finish"]["glossy"] == pytest.approx(3.0)
  assert profile["attrAffinity"]["finish"]["matte"] == pytest.approx(1.5)
  # 음수 선호는 음수 weight가 아니라 avoid 맵으로 (§7.3).
  assert profile["attrAvoid"]["finish"]["velvet"] == pytest.approx(3.0)
  assert profile["brandAvoid"] == {"brandc": pytest.approx(3.0)}
  assert profile["brandAffinity"]["branda"] == pytest.approx(3.0)
  assert profile["brandAffinity"]["brandb"] == pytest.approx(1.5)
  for bucket in ("attrAffinity", "attrAvoid"):
    for by_value in profile[bucket].values():
      assert all(weight > 0 for weight in by_value.values())
  assert all(weight > 0 for weight in profile["brandAffinity"].values())
  assert all(weight > 0 for weight in profile["brandAvoid"].values())
  # priceBand = engaged(양수 이벤트) 가격의 p25~p75: [12000, 30000] → 16500~25500.
  assert profile["priceBand"] == {"p25Krw": 16500, "p75Krw": 25500}


def test_profile_nets_opposing_signals_into_single_map() -> None:
  events = [
    _event("save", "p-glossy", "s1", NOW - timedelta(days=30)),  # +1.5
    _event("hide", "p-glossy", "s2", NOW),                       # -3.0 → net -1.5
    _event("product_open", "p-matte", "s3", NOW),
    _event("product_open", "p-plain", "s1", NOW - timedelta(days=30)),
    _event("product_open", "p-plain", "s2", NOW),
  ]
  profile = build_taste_profile(events, catalog=CATALOG, now=NOW)
  assert profile is not None
  assert profile["attrAvoid"]["finish"]["glossy"] == pytest.approx(1.5)
  assert "glossy" not in profile["attrAffinity"].get("finish", {})


# ------------------------------------------------------------------ 콜드스타트


def test_cold_start_requires_five_actionable_events() -> None:
  events = [
    _event("save", "p-glossy", "s1", NOW),
    _event("save", "p-matte", "s2", NOW - timedelta(days=1)),
    _event("product_open", "p-velvet", "s1", NOW),
    _event("product_open", "p-plain", "s2", NOW - timedelta(days=1)),
  ]
  assert not cold_start_eligible(events, now=NOW)
  assert build_taste_profile(events, catalog=CATALOG, now=NOW) is None


def test_cold_start_requires_multiple_sessions_and_days() -> None:
  base = [
    _event("save", "p-glossy", "s1", NOW),
    _event("save", "p-matte", "s1", NOW),
    _event("product_open", "p-velvet", "s1", NOW),
    _event("product_open", "p-plain", "s1", NOW),
    _event("purchase_click", "p-glossy", "s1", NOW),
  ]
  # 단일 세션 5건 → 미달.
  assert not cold_start_eligible(base, now=NOW)
  # 복수 세션이지만 단일 일자 → 미달.
  same_day = [*base[:3], _event("save", "p-plain", "s2", NOW), _event("save", "p-velvet", "s2", NOW)]
  assert not cold_start_eligible(same_day, now=NOW)
  # 복수 세션 + 복수 일자 → 생성.
  multi = [*base[:3], _event("save", "p-plain", "s2", NOW - timedelta(days=2)), _event("save", "p-velvet", "s2", NOW - timedelta(days=2))]
  assert cold_start_eligible(multi, now=NOW)
  assert build_taste_profile(multi, catalog=CATALOG, now=NOW) is not None


def test_cold_start_caps_repeated_clicks_in_single_session() -> None:
  # 같은 세션의 같은 제품 반복 클릭은 1건으로 cap — 8번 눌러도 카운트 1.
  repeated = [
    _event("product_open", "p-glossy", "s1", NOW + timedelta(minutes=index))
    for index in range(8)
  ]
  spread = [
    _event("save", "p-matte", "s2", NOW - timedelta(days=2)),
    _event("save", "p-velvet", "s2", NOW - timedelta(days=2)),
    _event("product_open", "p-plain", "s2", NOW - timedelta(days=2)),
  ]
  # dedupe 후 actionable = 1 + 3 = 4건 < 5 → 프로필 없음.
  assert not cold_start_eligible([*repeated, *spread], now=NOW)
  assert build_taste_profile([*repeated, *spread], catalog=CATALOG, now=NOW) is None


# ------------------------------------------------------------------ anchor-only 격리 (구조적)


def test_profile_argument_is_structurally_absent_from_floor_and_diversity_paths() -> None:
  """§7.3 격리 — floor·diverse/discovery·전체 정렬 함수 시그니처에 profile 인자 부재."""
  isolated_functions = (
    ranking.passes_floor,          # floor — profile은 이 함수의 입력 자체가 아님 (§13 R2)
    ranking.mmr_rerank,            # diverse 재랭킹
    ranking.assign_roles,          # diverse/discovery 선정
    ranking.guard_conflicting_candidates,
    ranking.rank_candidates,       # 전체 정렬
    ranking.preference_deltas,     # R2a — prompt/report만, profile 없음
    ranking.compute_score_components,
    ranking.dedupe_ranked_candidates,
    ranking.conditional_mmr_picks,
  )
  for function in isolated_functions:
    parameter_names = inspect.signature(function).parameters
    assert not any("profile" in name.lower() for name in parameter_names), function.__name__


def test_floor_and_role_sources_do_not_mention_profile() -> None:
  """시그니처 위장(예: **kwargs) 방지 — 함수 본문에도 profile 참조가 없어야 한다."""
  for function in (ranking.passes_floor, ranking.assign_roles, ranking.mmr_rerank):
    assert "profile" not in inspect.getsource(function).lower(), function.__name__


# ------------------------------------------------------------------ 새도 모드 / 스왑 / cap / 억제


def test_shadow_mode_computes_would_be_anchor_without_reordering() -> None:
  reranked = _ranked()
  selection = select_anchor_with_profile(reranked, PROFILE, enabled=False)
  assert selection["reranked"] == reranked  # 순위 무영향
  shadow = selection["profileAnchor"]
  assert shadow["enabled"] is False
  assert shadow["swapped"] is False
  assert shadow["anchorId"] == "p-matte"
  assert shadow["wouldBeAnchorId"] == "p-glossy"
  assert shadow["wouldBeAnchorIndex"] == 1


def test_enabled_mode_swaps_anchor_within_top_k_only() -> None:
  reranked = _ranked()
  selection = select_anchor_with_profile(reranked, PROFILE, enabled=True)
  swapped = selection["reranked"]
  assert selection["profileAnchor"]["swapped"] is True
  assert swapped[0]["item"]["id"] == "p-glossy"
  assert swapped[1]["item"]["id"] == "p-matte"  # 스왑 — 나머지 순서 불변
  assert [row["item"]["id"] for row in swapped[2:]] == ["p-velvet", "p-plain"]


def test_profile_delta_is_clipped_to_cap() -> None:
  big_profile = {
    "attrAffinity": {
      "finish": {"glossy": 5.0},
      "colorFamily": {"pink": 5.0},
      "texture": {"tint": 5.0},
    },
    "attrAvoid": {},
    "brandAffinity": {"branda": 5.0},
    "brandAvoid": {},
    "priceBand": {"p25Krw": 10000, "p75Krw": 20000},
  }
  raw = profile_raw_score(CATALOG["p-glossy"], big_profile)
  assert raw > CAP_PROFILE  # clip 전 raw가 cap을 넘는 상황
  selection = select_anchor_with_profile(_ranked(), big_profile, enabled=False)
  deltas = {entry["id"]: entry["profileDelta"] for entry in selection["profileAnchor"]["profileDeltas"]}
  assert deltas["p-glossy"] == pytest.approx(CAP_PROFILE)
  assert all(-CAP_PROFILE <= delta <= CAP_PROFILE for delta in deltas.values())


def test_explicit_session_preference_suppresses_profile_signal() -> None:
  # 명시 세션 선호가 finish를 다루면 프로필의 finish 신호는 억제 (프롬프트>리포트>프로필).
  assert profile_raw_score(CATALOG["p-glossy"], PROFILE, explicit_attributes=frozenset({"finish"})) == 0.0
  selection = select_anchor_with_profile(
    _ranked(),
    PROFILE,
    enabled=True,
    explicit_attributes=frozenset({"finish"}),
  )
  assert selection["profileAnchor"]["swapped"] is False
  assert [row["item"]["id"] for row in selection["reranked"]] == [row["item"]["id"] for row in _ranked()]


def test_suppressed_attributes_collect_session_preferences_and_hard_filters() -> None:
  state = {
    "softPreferences": [
      {"attribute": "finish", "values": ["matte"], "source": "prompt"},
      {"attribute": "undertone", "values": ["warm"], "source": "report"},
    ],
    "hardFilters": [
      {"attribute": "priceKrw", "op": "lte", "numberValue": 20000},
      {"attribute": "category", "op": "noop"},  # noop은 잠금이 아니다
    ],
  }
  suppressed = session_manager._profile_suppressed_attributes(state)
  assert suppressed == frozenset({"finish", "undertone", "priceKrw"})


# ------------------------------------------------------------------ build_slice_result 통합 (floor 격리 포함)


def test_build_slice_result_shadow_keeps_products_and_floor_identical() -> None:
  baseline = build_slice_result(_ranked(), top_n=3)
  shadow = build_slice_result(
    _ranked(),
    top_n=3,
    taste_profile=PROFILE,
    profile_score_enabled=False,
  )
  assert [product["id"] for product in shadow["products"]] == [product["id"] for product in baseline["products"]]
  assert shadow["floorCount"] == baseline["floorCount"]  # floor는 profile 유무와 무관
  assert baseline["profileAnchor"] is None
  assert shadow["profileAnchor"]["swapped"] is False
  assert shadow["profileAnchor"]["wouldBeAnchorId"] == "p-glossy"


def test_build_slice_result_enabled_swaps_anchor_but_not_floor() -> None:
  baseline = build_slice_result(_ranked(), top_n=3)
  enabled = build_slice_result(
    _ranked(),
    top_n=3,
    taste_profile=PROFILE,
    profile_score_enabled=True,
  )
  assert enabled["floorCount"] == baseline["floorCount"]
  assert enabled["products"][0]["id"] == "p-glossy"
  assert enabled["products"][0]["role"] == "anchor"
  # 서빙 제품은 여전히 floor 통과 후보 안에서만 나온다.
  floored_ids = {row["item"]["id"] for row in _ranked()}
  assert {product["id"] for product in enabled["products"]} <= floored_ids


# ------------------------------------------------------------------ 세션 배선 — 새도 로깅 (wouldBeAnchor)


def _profile_settings(tmp_path: pathlib.Path, *, enabled: bool) -> Settings:
  profile_path = tmp_path / "profiles.jsonl"
  profile_path.write_text(json.dumps({"ownerSubject": OWNER, "profile": PROFILE}, ensure_ascii=False) + "\n")
  return Settings(
    database_url=None,
    auradin_taste_profiles_path=str(profile_path),
    auradin_profile_score_enabled=enabled,
  )


def _state() -> dict:
  return {
    "prompt": "립 추천해줘",
    "ownerSubject": OWNER,
    "hardFilters": [],
    "softPreferences": [],
    "answers": [],
    "logs": [],
  }


def test_session_result_logs_would_be_anchor_in_shadow_mode(tmp_path: pathlib.Path) -> None:
  reset_profile_cache()
  settings = _profile_settings(tmp_path, enabled=False)
  state = _state()
  baseline = session_manager._build_result(_state(), _ranked(), Settings(database_url=None))
  result = session_manager._build_result(state, _ranked(), settings)
  # 새도: 순위 무영향 — 결과 제품은 프로필 없음과 동일.
  assert [product["id"] for product in result["products"]] == [
    product["id"] for product in baseline["products"]
  ]
  shadow_logs = [log for log in state["logs"] if log.get("stage") == "profileAnchor"]
  assert len(shadow_logs) == 1
  assert shadow_logs[0]["enabled"] is False
  assert shadow_logs[0]["swapped"] is False
  assert shadow_logs[0]["wouldBeAnchorId"] == "p-glossy"


def test_session_result_swaps_anchor_when_flag_enabled(tmp_path: pathlib.Path) -> None:
  reset_profile_cache()
  settings = _profile_settings(tmp_path, enabled=True)
  state = _state()
  result = session_manager._build_result(state, _ranked(), settings)
  assert result["products"][0]["id"] == "p-glossy"
  swap_logs = [log for log in state["logs"] if log.get("stage") == "profileAnchor"]
  assert swap_logs and swap_logs[0]["swapped"] is True


def test_get_taste_profile_fail_open_without_path_or_owner(tmp_path: pathlib.Path) -> None:
  reset_profile_cache()
  assert get_taste_profile(OWNER, settings=Settings(database_url=None)) is None
  settings = _profile_settings(tmp_path, enabled=False)
  assert get_taste_profile("", settings=settings) is None
  assert get_taste_profile("user:v1:test:unknown", settings=settings) is None
  assert get_taste_profile(OWNER, settings=settings) == PROFILE


# ------------------------------------------------------------------ 배치 스크립트 (jsonl 모드 — DB 불요)


def _load_script_module():
  script_path = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "build_auradin_taste_profiles.py"
  spec = importlib.util.spec_from_file_location("build_auradin_taste_profiles", script_path)
  module = importlib.util.module_from_spec(spec)
  spec.loader.exec_module(module)
  return module


def test_batch_script_builds_profiles_from_events_jsonl(tmp_path: pathlib.Path) -> None:
  module = _load_script_module()
  events_path = tmp_path / "events.jsonl"
  catalog_path = tmp_path / "catalog.jsonl"
  output_path = tmp_path / "profiles.jsonl"

  eligible_events = [
    _event("save", "p-glossy", "s1", NOW),
    _event("save", "p-matte", "s2", NOW - timedelta(days=30)),
    _event("hide", "p-velvet", "s3", NOW),
    _event("product_open", "p-plain", "s1", NOW),
    _event("product_open", "p-plain", "s2", NOW - timedelta(days=30)),
  ]
  # snake_case 행(DB export 형태)도 허용되는지 1건 섞어 확인.
  snake_case_event = {
    "owner_subject": OWNER,
    "event_type": "purchase_click",
    "product_id": "p-glossy",
    "session_id": "s3",
    "occurred_at": NOW.isoformat(),
  }
  cold_start_events = [_event("save", "p-glossy", "s9", NOW, owner="user:v1:test:coldstart")]
  with events_path.open("w", encoding="utf-8") as handle:
    for event in [*eligible_events, snake_case_event, *cold_start_events]:
      handle.write(json.dumps(event, ensure_ascii=False) + "\n")
  with catalog_path.open("w", encoding="utf-8") as handle:
    for item in CATALOG.values():
      handle.write(json.dumps(item, ensure_ascii=False) + "\n")

  exit_code = module.main(
    [
      "--events-jsonl", str(events_path),
      "--catalog-jsonl", str(catalog_path),
      "--output", str(output_path),
      "--now", NOW.isoformat(),
    ],
  )
  assert exit_code == 0

  rows = [json.loads(line) for line in output_path.read_text().splitlines() if line.strip()]
  profiles = {row["ownerSubject"]: row["profile"] for row in rows}
  assert OWNER in profiles
  assert "user:v1:test:coldstart" not in profiles  # 콜드스타트 미달 owner는 프로필 없음
  profile = profiles[OWNER]
  # purchase_click(+2) snake_case 행까지 합산: glossy = 3.0 + 2.0 = 5.0
  assert profile["attrAffinity"]["finish"]["glossy"] == pytest.approx(5.0)
  assert profile["attrAvoid"]["finish"]["velvet"] == pytest.approx(3.0)
  assert profile["updatedAt"] == NOW.isoformat()

  # serving 로더로도 그대로 읽힌다.
  reset_profile_cache()
  settings = Settings(database_url=None, auradin_taste_profiles_path=str(output_path))
  assert get_taste_profile(OWNER, settings=settings) == profile
