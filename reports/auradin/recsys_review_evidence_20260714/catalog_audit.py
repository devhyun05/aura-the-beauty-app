"""Auradin 서빙 카탈로그(20260708) 정량 감사 — 추천 품질 결정 데이터 분포."""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = next(p for p in Path(__file__).resolve().parents if (p / "data" / "auradin").is_dir())
MVP = ROOT / "data/auradin/catalog/catalog_items_mvp_20260708.jsonl"
CHUNKS = ROOT / "data/auradin/knowledge/product_knowledge_chunks_mvp_20260708.jsonl"


def read_jsonl(p):
  return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


items = read_jsonl(MVP)
print(f"== MVP catalog rows: {len(items)}")

# purchasable gate (catalog_loader.is_purchasable와 동일)
def purchasable(it):
  lo = it.get("liveOffer") or {}
  return bool(int(lo.get("priceKrw") or 0) > 0 and str(lo.get("purchaseUrl") or "").strip() and str(lo.get("imageUrl") or "").strip())

served = [it for it in items if purchasable(it)]
print(f"== purchasable(서빙 대상): {len(served)}  (컷: {len(items)-len(served)})")

cat = Counter(it.get("category") for it in served)
print(f"\n== 카테고리 분포: {dict(cat.most_common())}")

brands = Counter((it.get("brandName") or "").strip() for it in served)
print(f"\n== 브랜드 수: {len(brands)}, 상위 12: {brands.most_common(12)}")
top5_share = sum(c for _, c in brands.most_common(5)) / max(len(served), 1)
print(f"== 상위5 브랜드 점유율: {top5_share:.1%}")

# 속성 커버리지: 존재 / eligible / conf>=0.6
fields = ["colorFamily", "finish", "texture", "undertone", "intensity"]
print("\n== 속성 커버리지 (존재 / hardFilterEligible / conf>=0.6):")
for f in fields:
  present = sum(1 for it in served if (it.get("attributes") or {}).get(f))
  elig = sum(1 for it in served if (it.get("hardFilterEligible") or {}).get(f))
  conf = sum(1 for it in served if float((it.get("attributeConfidence") or {}).get(f) or 0) >= 0.6)
  print(f"  {f:12s}: {present:4d} ({present/len(served):5.1%}) / {elig:4d} ({elig/len(served):5.1%}) / {conf:4d} ({conf/len(served):5.1%})")

# 카테고리별 colorFamily/finish 커버리지 (질문엔진 가능성에 결정적)
print("\n== 카테고리별 속성 존재율 (colorFamily / finish / texture):")
for c in cat:
  rows = [it for it in served if it.get("category") == c]
  cf = sum(1 for it in rows if (it.get("attributes") or {}).get("colorFamily")) / len(rows)
  fi = sum(1 for it in rows if (it.get("attributes") or {}).get("finish")) / len(rows)
  tx = sum(1 for it in rows if (it.get("attributes") or {}).get("texture")) / len(rows)
  print(f"  {c:8s} (n={len(rows):3d}): color {cf:5.1%} / finish {fi:5.1%} / texture {tx:5.1%}")

# colorFamily 값 분포
cf_vals = Counter((it.get("attributes") or {}).get("colorFamily") for it in served if (it.get("attributes") or {}).get("colorFamily"))
print(f"\n== colorFamily 값 분포: {dict(cf_vals.most_common())}")

# 가격 분포
prices = sorted(int((it.get("liveOffer") or {}).get("priceKrw") or 0) for it in served)
import statistics
print(f"\n== 가격: min {prices[0]:,} / p25 {prices[len(prices)//4]:,} / 중앙 {prices[len(prices)//2]:,} / p75 {prices[3*len(prices)//4]:,} / max {prices[-1]:,}")
tiers = Counter((it.get("liveOffer") or {}).get("priceTier") for it in served)
print(f"== priceTier: {dict(tiers.most_common())}")

# evidence 소스 분포
ev = Counter()
for it in served:
  for s in it.get("evidenceSourceTypes") or []:
    ev[s] += 1
print(f"\n== evidenceSourceTypes: {dict(ev.most_common())}")

# retailPresence
oy = sum(1 for it in served if ((it.get("retailPresence") or {}).get("oliveYoung") or {}).get("listed") is True)
ds = sum(1 for it in served if ((it.get("retailPresence") or {}).get("departmentStore") or {}).get("listed") is True)
print(f"== retailPresence: oliveYoung {oy}, departmentStore {ds}")

# shadeOptions
sh = sum(1 for it in served if it.get("shadeOptions"))
multi = sum(1 for it in served if len(it.get("shadeOptions") or []) > 1)
print(f"== shadeOptions 있음: {sh} ({sh/len(served):.1%}), 2개 이상: {multi}")

# 중복 의심: 정규화 이름 키
def norm(s):
  s = re.sub(r"[\s\[\]()/+·,~!-]", "", str(s or "").lower())
  return s

name_keys = Counter(norm(it.get("brandName")) + "|" + norm(it.get("productName")) for it in served)
dups = {k: v for k, v in name_keys.items() if v > 1}
print(f"\n== 정규화 (브랜드|상품명) 중복 키: {len(dups)}개 그룹, 총 {sum(dups.values())}행")
for k, v in list(sorted(dups.items(), key=lambda x: -x[1]))[:8]:
  print(f"   {v}x {k[:70]}")

# updatedAt 최신성
upd = Counter(str(it.get("updatedAt") or "")[:10] for it in served)
print(f"\n== updatedAt 날짜 분포: {dict(upd.most_common(6))}")

# 지식 청크
if CHUNKS.exists():
  chunks = read_jsonl(CHUNKS)
  ct = Counter(c.get("chunkType") for c in chunks)
  lens = [len(str(c.get("text") or "")) for c in chunks]
  print(f"\n== 지식 청크: {len(chunks)}개, 타입 {dict(ct.most_common())}, 평균 길이 {sum(lens)/max(len(lens),1):.0f}자")

# 임베딩 인덱스 메타
vec = ROOT / "data/auradin/vector/product_knowledge_vector_index_mvp_20260708.json"
if vec.exists():
  meta = json.loads(vec.read_text(encoding="utf-8")).get("metadata", {})
  print(f"== 벡터 인덱스 메타: {meta}")
else:
  print(f"== 벡터 인덱스 없음: {vec.name}")
