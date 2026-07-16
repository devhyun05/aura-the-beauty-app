"""MMR/3역할('비슷한 후보')·refine 다이얼 실거동 프로브."""
import sys
from pathlib import Path as _P
_REPO = next(p for p in _P(__file__).resolve().parents if (p / "services" / "backend").is_dir())
sys.path.insert(0, str(_REPO / "services" / "backend"))

from app.services.auradin_agent import session_manager as sm
from app.services.auradin_agent.catalog_loader import get_catalog
from app.services.auradin_agent.intent_parser import parse_intent
from app.services.auradin_agent.retrieval_service import retrieve_and_rank
from app.services.auradin_agent.ranking import build_slice_result, mmr_rerank, _similarity
from app.core.settings import get_settings

settings = get_settings()
catalog = get_catalog()

def show_slice(prompt, lam=None):
  intent = parse_intent(prompt)
  r = retrieve_and_rank(catalog, intent, [], settings=settings)
  res = build_slice_result(r["ranked"], lambda_=lam or float(settings.auradin_mmr_lambda),
                           s_floor=float(settings.auradin_floor_semantic),
                           hard_filters=r["hardFilters"], top_n=3)
  print(f"\n=== {prompt!r} λ={lam or settings.auradin_mmr_lambda} floorFallback={res['floorFallback']} ranked={res['rankedCount']} floor={res['floorCount']}")
  for p in res["products"]:
    attrs = catalog.get(p["id"]).get("attributes", {})
    print(f"  [{p['role']:9s}] {p['brandName']:8s} {p['productName'][:26]:26s} rate={p['matchRate']} attrs={{cf:{attrs.get('colorFamily')},fin:{attrs.get('finish')},tex:{attrs.get('texture')}}}")
  # anchor vs diverse 유사도
  ids = [p["id"] for p in res["products"]]
  if len(ids) >= 2:
    a, b = catalog.get(ids[0]), catalog.get(ids[1])
    print(f"  sim(anchor,diverse)={_similarity(a,b):.3f}", end="")
    if len(ids) >= 3:
      c = catalog.get(ids[2])
      print(f" sim(anchor,discovery)={_similarity(a,c):.3f}", end="")
    print()
  return res

s1 = show_slice("촉촉한 립 추천해줘")
s2 = show_slice("촉촉한 립 추천해줘", lam=0.95)   # more_similar 극단
s3 = show_slice("촉촉한 립 추천해줘", lam=0.05)   # more_diverse 극단
s4 = show_slice("아이섀도우 팔레트 추천해줘")
s5 = show_slice("올리브영에서 살 수 있는 매트 립")

# λ 극단 간 결과 변화량
ids1 = [p["id"] for p in s1["products"]]
ids2 = [p["id"] for p in s2["products"]]
ids3 = [p["id"] for p in s3["products"]]
print(f"\nλ0.7 vs λ0.95 겹침: {len(set(ids1)&set(ids2))}/3 | λ0.7 vs λ0.05 겹침: {len(set(ids1)&set(ids3))}/3")

# 전체 세션 refine 다이얼 시뮬레이션 (dial 반복 → 포화)
state = sm.create_session(prompt="촉촉한 립 추천해줘", owner_subject="probe-user", settings=settings)
print(f"\nsession phase={state['phase']}")
if state["phase"] == "question":
  # noop으로 넘겨 결과 받기
  q = state["lastQuestion"]
  noop = next(o for o in q["options"] if o["filterDelta"]["op"] == "noop")
  state = sm.answer_session(state["sessionId"], owner_subject="probe-user", question_id=q["id"], option_id=noop["id"], settings=settings)
  print(f"after noop answer: phase={state['phase']}")
if state["phase"] == "results":
  before = [p["id"] for p in state["result"]["products"]]
  for i in range(4):
    state = sm.refine_session(state["sessionId"], owner_subject="probe-user", dial="more_diverse", settings=settings)
    lam = state.get("mmrLambda")
    ids = [p["id"] for p in (state.get("result") or {}).get("products", [])]
    notice = (state.get("result") or {}).get("refineNotice")
    print(f"  dial#{i+1} λ={lam} 변화={sum(1 for a,b in zip(before,ids) if a!=b)}/3 notice={bool(notice)}")
    before = ids
