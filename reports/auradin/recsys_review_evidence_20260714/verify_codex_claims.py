"""Codex 리뷰 1 주장 적대적 재검증 — 실행 재현."""
import sys, json
from pathlib import Path as _P
_REPO = next(p for p in _P(__file__).resolve().parents if (p / "services" / "backend").is_dir())
sys.path.insert(0, str(_REPO / "services" / "backend"))
from collections import Counter
from app.services.auradin_agent.catalog_loader import get_catalog
from app.services.auradin_agent.intent_parser import parse_intent
from app.services.auradin_agent.retrieval_service import retrieve_and_rank, matches_filter, build_semantic_scores
from app.services.auradin_agent import session_manager as sm
from app.core.settings import get_settings

settings = get_settings()
cat = get_catalog()

print("== C1: undertone 브랜드명 오염 ==")
cool_brands = Counter(it["brandName"] for it in cat.items if (it.get("attributes") or {}).get("undertone") == "cool")
print(f"  cool 브랜드 분포: {dict(cool_brands.most_common(5))}, 총 {sum(cool_brands.values())}")
lip_cool = [(it["brandName"], it["productName"][:30]) for it in cat.items if it["category"]=="lip" and (it.get("attributes") or {}).get("undertone")=="cool"]
print(f"  립 cool {len(lip_cool)}: {lip_cool}")
warm_brands = Counter(it["brandName"] for it in cat.items if (it.get("attributes") or {}).get("undertone") == "warm")
print(f"  warm 브랜드 분포: {dict(warm_brands.most_common(5))}")

print("\n== C3: intent 파서 반전 ==")
for p in ["2만원 이상 립 추천", "1만원대 립", "립 말고 블러셔 추천해줘", "매트는 싫고 글로시한 립"]:
  i = parse_intent(p)
  print(f"  {p!r} -> hard={[(f['attribute'], f.get('op'), f.get('values') or f.get('numberValue')) for f in i['lockedFilters']]} soft={[(s['attribute'], s['values']) for s in i['softPreferences']]}")

print("\n== C2: 질문 hard filter가 eligibility 무시 ==")
lip_glossy = [it for it in cat.items if it["category"]=="lip" and (it.get("attributes") or {}).get("finish")=="glossy"]
inel = [it for it in lip_glossy if not (it.get("hardFilterEligible") or {}).get("finish")]
print(f"  립 glossy {len(lip_glossy)}개 중 eligible=False {len(inel)}개")
delta = {"attribute":"finish","op":"eq","values":["glossy"],"mode":"hard"}
passed = [it for it in lip_glossy if matches_filter(it, delta)]
print(f"  matches_filter(glossy hard) 통과: {len(passed)} (eligible 무관 여부: {len(passed)==len(lip_glossy)})")

print("\n== C4: semantic 빈 결과 fail-open ==")
# backend=auto에서 어휘 검색이 0매치인 질의 (영문만)
scores, backend = build_semantic_scores(cat, "xyzzy quux nothing", settings=settings)
print(f"  무매치 질의: backend={backend}, len(scores)={len(scores)}")
from app.services.auradin_agent.ranking import rank_candidates, passes_floor
ranked = rank_candidates(cat.items[:20], hard_filters=[], soft_preferences=[], semantic_scores=scores if scores else {})
sem_vals = {r["components"]["semanticScore"] for r in ranked}
fl = sum(1 for r in ranked if passes_floor(r))
print(f"  빈 dict 시 semanticScore 집합={sem_vals}, floor 통과 {fl}/20")

print("\n== C5: 세션 비멱등 (results 후 답변 재전송 / 질문 중 refine) ==")
st = sm.create_session(prompt="립 추천해줘", owner_subject="v", settings=settings)
answers_trace = []
while st["phase"] == "question":
  q = st["lastQuestion"]
  opt = q["options"][0]
  answers_trace.append((q["id"], opt["id"]))
  st = sm.answer_session(st["sessionId"], owner_subject="v", question_id=q["id"], option_id=opt["id"], settings=settings)
print(f"  최종 phase={st['phase']}, answers={len(st['answers'])}, qcount={st['questionCount']}")
if st["phase"] == "results" and answers_trace:
  qid, oid = answers_trace[-1]
  st2 = sm.answer_session(st["sessionId"], owner_subject="v", question_id=qid, option_id=oid, settings=settings)
  print(f"  재전송 후 phase={st2['phase']}, answers={len(st2['answers'])}, qcount={st2['questionCount']}  <- 증가하면 비멱등 확정")

st3 = sm.create_session(prompt="립 추천해줘", owner_subject="v2", settings=settings)
if st3["phase"] == "question":
  st3 = sm.refine_session(st3["sessionId"], owner_subject="v2", dial="more_diverse", settings=settings)
  print(f"  질문 중 dial refine 후 phase={st3['phase']} (question→results면 퍼널 스킵 확정), 캐시존재={bool(st3.get('rankedCache'))}")

print("\n== C11: qualityFlags 미필터 ==")
flagged = [it for it in cat.items if it.get("qualityFlags")]
fc = Counter(f for it in flagged for f in it["qualityFlags"])
print(f"  flagged {len(flagged)}/{len(cat.items)}, 종류: {dict(fc.most_common())}")
i = parse_intent("립 추천해줘")
r = retrieve_and_rank(cat, i, [], settings=settings)
top10_flags = [(row["item"]["brandName"], row["item"]["productName"][:22], row["item"].get("qualityFlags")) for row in r["ranked"][:10] if row["item"].get("qualityFlags")]
print(f"  브로드 립 TOP10 중 flagged: {top10_flags}")

print("\n== C9: 질문 후보 40개 창 ==")
print(f"  브로드 립 후보 {len(r['ranked'])} — 질문 expectedCandidateCount는 min(40, n) 창 기준")
