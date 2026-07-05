# AURADIN 백엔드 Phase1 — 서빙 배선 + 랭킹 정직화 (JIT)

착수일: 2026-07-06 KST · 상태: 구현 완료 · 대상 단계: [AURADIN.md](AURADIN.md) §11 레인 A 3단계

> **위치**: 이 문서는 §11 3단계(백엔드 Phase1)의 JIT 착수 문서다. 안정 계약은 [AURADIN.md](AURADIN.md)가
> 단일 진실 소스이고, 여기엔 **휘발성 구현값**(가중치·임계·λ)과 이 단계의 결정만 담는다.

## 목표

2단계 얇은 수직 슬라이스에서 코드로 검증한 §5/§6 랭킹 함수를 **서빙 경로(세션 API)에 배선**하고,
슬라이스가 드러낸 랭킹 왜곡을 정직화한다. 3개 잔여 배선:

1. 서빙 결과가 §5/§8 role·source + §6 구조화 근거를 싣는다.
2. 매치율 정직화 (category rule 실버그 + 가중치 재조정).
3. 점수갭 즉답 종료 (결정적 질의는 질문 스킵).

## 확정 구현값 (튜너블 — 계약 문서엔 안 박음)

| 노브 | 값 | 근거 |
|---|---|---|
| `SCORE_WEIGHTS` (rule/semantic/preference/evidence/liveOffer) | 0.40 / 0.08 / 0.22 / 0.20 / 0.10 | evidencedMatch 주력(§5). semantic은 현행 hash 임베딩 max≈0.13이라 낮춤 |
| `auradin_mmr_lambda` (λ) | 0.7 | 슬라이스 캘리브레이션. §7 refine 다이얼로 조절 |
| `auradin_floor_semantic` | 0.5 | floor 게이트 semantic 문턱 (OR 게이트: 매칭 / semantic / evidence) |
| `auradin_score_gap_threshold` (θ) | 0.04 | 관측 raw 갭 0.000~0.046. 동점 상위(≤0.011) vs 확연 앞선 질의(≥0.041)의 자연 경계 |

값은 `app/core/settings.py`(λ/floor/θ)와 `app/services/auradin_agent/ranking.py`(`SCORE_WEIGHTS`)에서 관리.

## category rule 실버그 (수정 완료)

- **증상**: 모든 카테고리 잠금 질의의 매치율이 조용히 반토막 (글리터 anchor 40%).
- **원인**: `ranking._item_value(item, "category")`가 `attributes.category`(항상 None)를 읽음 — category는
  **top-level 필드**. 하드 필터는 `retrieval_service._item_values`가 옳게 처리해 드롭은 정상이었으나,
  `_rule_score`가 category 매칭을 0으로 계산 → w_rule(0.40) 통째로 손실.
- **수정**: `_item_value`에 `if attribute == "category": return item.get("category")` 추가.
- **효과**: 글리터 anchor 40 → 90 (근거 완비 Tier1 매칭이 정직하게 높게). 회귀 테스트로 고정.

## 점수갭 즉답 종료 설계 결정

- **신호**: raw ranked 상위 #1-#2 relevance 갭(`top_score_gap`), MMR **전** 계산.
- **발동 조건**: 하드 조건(category/price/channel) 존재 AND 갭 ≥ θ(0.04). `propose_question` 초입 가드.
- **왜 raw 갭이 작나**: 재조정 후 하드필터 통과 상위가 근거상 뭉쳐(0.83~0.85) 갭이 작다. 이는
  "여러 제품이 똑같이 잘 맞음 → 질문이 실제로 좁혀줌"을 뜻하므로 **대개 질문 유지가 옳다**(아키네이터 퍼널 §0-B).
  θ=0.04는 확연히 앞선 소수 질의(글리터 0.046 등)에서만 즉답. 보수적 발동이 의도.
- **투명성**: 발동 시 `decision_log.earlyTermination = {reason, gap}` 기록.

## 변경 파일

- `app/services/auradin_agent/ranking.py` — `_item_value` category 케이스, `SCORE_WEIGHTS` 상수화·적용.
- `app/core/settings.py` — `auradin_mmr_lambda` / `auradin_floor_semantic` / `auradin_score_gap_threshold`.
- `app/services/auradin_agent/question_engine.py` — `propose_question` 점수갭 즉답 종료 가드(`top_score_gap` 배선).
- `app/services/auradin_agent/session_manager.py` — `_build_result` → `build_slice_result`(floor→MMR→3역할→구조화 근거), `_interpretation_caveats`, `_advance`가 θ·settings 전달.
- 테스트: `tests/test_auradin_phase1_serving.py`(신규), `tests/test_auradin_glitter_slice.py`(category 회귀 가드 추가).

## 검증

- `cd services/backend && python3 -m pytest tests/ -q` → 103 passed.
- 서빙 E2E: `글리터 추천해줘` → 질문 스킵, 3역할(anchor 90/diverse 84/discovery 77) + 구조화 근거(글리터→쉬머 caveat). `올리브영 매트 립`·`데일리 제품` → 질문 유지.

## 남은 항목 (Phase1 밖)

- Refine 다이얼(§7 λ 조절 endpoint) — λ는 settings로만 노출, 배선은 다음.
- 세트/비교 shape(§4) — 현재 단일 Top3만.
- Bedrock 실임베딩(§11 6) — semantic 약함 근본 해결. 전환 시 `SCORE_WEIGHTS["semantic"]` 상향.
- 모바일 mapper(§11 4) — `auradinSearchService.ts`가 `reason:string` 기대 → dict 소비로 교체.
