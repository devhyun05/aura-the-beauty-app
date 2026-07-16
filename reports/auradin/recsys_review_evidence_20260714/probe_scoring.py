"""Auradin 점수 로직 실거동 프로브 — 가설 검증 (오프라인, AWS 불필요)."""
import sys, json, statistics
from pathlib import Path as _P
_REPO = next(p for p in _P(__file__).resolve().parents if (p / "services" / "backend").is_dir())
sys.path.insert(0, str(_REPO / "services" / "backend"))

from collections import Counter
from app.services.auradin_agent import session_manager as sm
from app.services.auradin_agent.catalog_loader import get_catalog
from app.services.auradin_agent.intent_parser import parse_intent
from app.services.auradin_agent.retrieval_service import retrieve_and_rank
from app.core.settings import get_settings

settings = get_settings()
catalog = get_catalog()
print(f"catalog items: {len(catalog.items)}, retrieval_backend 확인용")

def probe(prompt, personal_color=None, label=""):
  print(f"\n{'='*72}\nPROBE {label}: prompt={prompt!r} personalColor={personal_color!r}")
  intent = parse_intent(prompt)
  if personal_color:
    from app.services.auradin_agent.report_profile import personal_color_to_soft_preferences
    prefs = personal_color_to_soft_preferences(personal_color)
    intent["softPreferences"] = [*intent.get("softPreferences", []), *prefs]
  r = retrieve_and_rank(catalog, intent, [], settings=settings)
  ranked = r["ranked"]
  print(f"  backend={r['retrievalBackend']} candidates={r['candidateCountAfterFilters']}/{r['candidateCountBefore']}")
  print(f"  hardFilters={[(f['attribute'], f.get('values') or f.get('numberValue')) for f in r['hardFilters']]}")
  print(f"  softPrefs={[(p['attribute'], p.get('values'), p.get('weight')) for p in r['softPreferences']]}")
  # 성분 분산: 각 축이 랭킹 내에서 얼마나 변별력이 있는가
  if ranked:
    for comp in ("ruleScore", "semanticScore", "answerScore", "evidenceScore", "liveOfferScore"):
      vals = [row["components"][comp] for row in ranked]
      print(f"  {comp:15s}: min {min(vals):.3f} / max {max(vals):.3f} / 유니크 {len(set(vals))}")
    scores = [row["score"] for row in ranked]
    print(f"  final: top {scores[0]:.4f}, #2 {scores[1] if len(scores)>1 else '-'}, 동점그룹(top점수와 같은 수): {sum(1 for s in scores if abs(s-scores[0])<1e-9)}")
    print("  TOP5:", [(row['item']['brandName'], row['item']['productName'][:18], row['score'], row['components']['answerScore']) for row in ranked[:5]])
  # 질문 제안
  from app.services.auradin_agent.question_engine import propose_question
  q, log = propose_question(ranked, asked_attributes=[], intent=intent, question_count=0,
                            last_answer_was_noop=False,
                            score_gap_threshold=float(settings.auradin_score_gap_threshold))
  if q:
    print(f"  ▶질문: attr={q['attribute']} mode={q['type']} title={q['title']!r} options={[o['label'] for o in q['options']]}")
  else:
    et = log.get("earlyTermination")
    print(f"  ▶질문 없음 (earlyTermination={et})")
  return ranked

# 1) 브로드 립 — rule 상수 가설
r1 = probe("립 추천해줘", label="1 broad-lip")

# 2) 이미 말한 속성 되묻기 가설
r2 = probe("매트 립 추천해줘", label="2 redundant-finish")

# 3) 리포트 톤 넛지 지배 가설 — 리포트 유/무 순위 비교
r3a = probe("립 추천해줘", label="3a no-report")
r3b = probe("립 추천해줘", personal_color="봄 웜 라이트", label="3b with-report")
ids_a = [row["item"]["id"] for row in r3a[:10]]
ids_b = [row["item"]["id"] for row in r3b[:10]]
overlap = len(set(ids_a[:3]) & set(ids_b[:3]))
print(f"\n  리포트 유/무 TOP3 겹침: {overlap}/3, TOP10 겹침: {len(set(ids_a)&set(ids_b))}/10")
warm_in_top = sum(1 for row in r3b[:10] if (row['item'].get('attributes') or {}).get('undertone') == 'warm')
warm_conf = [( (row['item'].get('attributeConfidence') or {}).get('undertone'), (row['item'].get('hardFilterEligible') or {}).get('undertone')) for row in r3b[:5]]
print(f"  with-report TOP10 중 undertone=warm: {warm_in_top}, TOP5 undertone conf/eligible: {warm_conf}")

# 4) 핑크 립 2만원 이하 — 색 커버리지 희소 시 실동작
r4 = probe("핑크 립 2만원 이하 추천해줘", label="4 pink-lip-budget")
pink_top = [( (row['item'].get('attributes') or {}).get('colorFamily'), row['components']['answerScore']) for row in r4[:6]]
print(f"  TOP6 colorFamily/answerScore: {pink_top}")

# 5) floor 게이트 실질 동작 (브로드 질의)
from app.services.auradin_agent.ranking import passes_floor
fl = [passes_floor(row, s_floor=float(settings.auradin_floor_semantic)) for row in r1]
print(f"\n  브로드 립 floor 통과: {sum(fl)}/{len(fl)}")
# floor를 evidence만으로 넘는 비율
ev_only = sum(1 for row in r1 if row['components']['evidenceScore'] >= 0.45)
print(f"  evidence>=0.45 통과분: {ev_only}/{len(r1)} (semantic>=0.5: {sum(1 for row in r1 if row['components']['semanticScore']>=0.5)})")
