from app.services.auradin_catalog.naver_collect import build_query_plan


def test_build_query_plan_prioritizes_lip_first_brand_defaults() -> None:
  queries = build_query_plan(max_queries=3)

  assert [query.brand for query in queries] == ["롬앤", "롬앤", "롬앤"]
  assert [query.category for query in queries] == ["lip", "shadow", "base"]
  assert queries[0].query == "롬앤 립틴트"


def test_build_query_plan_supports_subset() -> None:
  queries = build_query_plan(
    brands=["라카"],
    categories=["cheek"],
    max_queries=5,
  )

  assert len(queries) == 1
  assert queries[0].query == "라카 블러셔"


def test_build_query_plan_all_templates_and_zero_limit_are_unbounded() -> None:
  queries = build_query_plan(
    brands=["라카"],
    categories=["base"],
    max_queries=0,
    all_templates=True,
  )

  assert [query.query for query in queries] == [
    "라카 쿠션",
    "라카 파운데이션",
    "라카 베이스",
  ]
