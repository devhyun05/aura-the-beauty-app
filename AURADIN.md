# AURADIN — 노스스타 계약 (North-Star Contract)

작성일: 2026-07-06 KST · 대상 repo: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine`

> **이 문서의 위치**: 아우라딘의 **단일 진실 소스**다. 팀 전원(백엔드/모바일/디자인/평가)이 이걸 보고 정렬한다.
> 여기 담는 것은 **안정된 결정 + API/데이터 계약**뿐이다. 휘발성 구현 디테일(커버리지 %, 임계값, 질문 정책 표)은
> 여기에 박지 않는다 — 그것들은 워크스트림별 JIT 문서와 빌드타임 산출물에서 관리한다.
> (기존 `AURADIN_*_KO.md` 3종이 20260703 커버리지 숫자를 계약처럼 박아 낡았다. 그 실수를 반복하지 않는다.)

---

## 0. 한 줄 정의 (정체성 — A+C 하이브리드로 확정)

> **아우라딘은 AURA 얼굴분석의 "그래서 뭘 사지?"를 닫는, 근거를 투명하게 보여주는 화장품 추천 에이전트다.**

- **A (입구/포지셔닝)**: AURA의 퍼스널컬러 진단·AR 룩·사용자 프로필을 **입력**으로 받아 구매 가능한 제품으로 번역한다. 독립 검색창이 아니라 **분석의 실행 레이어**다.
- **C (원칙/신뢰)**: 모든 추천이 **근거와 신뢰도를 드러낸다.** 확신 없는 건 확신 없다고 말한다. 얻을 수 없는 데이터(undertone 등)를 **억지로 만들지 않는다.**
- **B (메커니즘)**: 아키네이터형 질문 루프는 **정체성이 아니라 후보를 좁히는 수단**이다.

한 줄 판정: **간지는 화려함이 아니라, "질문이 후보를 좁히는 퍼널 + 왜 추천했는지 읽히는 근거"를 아름답게 드러내는 데서 나온다.**

---

## 1. 추천 결정 아키텍처 (5단계 파이프라인)

"어떻게 판단하는가"는 하나의 판단이 아니라 5개의 분리된 결정이다.

```
① 요청 프로필화 : 프롬프트 + 리포트 + 사진 + AR → {hard, soft, semantic, lookContext}  (§3)
② 출력 모양 결정 : 입력 modality + 카테고리 cardinality → single-top3 | per-category-set | compare  (§4)
③ 후보 풀 선택   : Tier1(큐레이션) 우선 → 얇으면 Tier2(라이브 Naver) broaden  (§2)
④ 신뢰도-게이트 랭킹 : floor(정당화 문턱) → relevance → MMR(다양성) → 3역할 배치  (§5)
⑤ 구조화 근거 생성 : 점수를 만든 성분에서 matched/inferred/caveat 역생성  (§6)
```

핵심 원리 (반드시 지킴):
- **신뢰도는 정렬 키가 아니라 게이트다.** 문턱만 넘으면 관련성+다양성으로 순위. (부익부 방지)
- **unknown ≠ negative.** 속성이 없다고 탈락 아님 — 그 항목으로 점수를 못 벌 뿐.
- **LLM은 후보·필터를 발명하지 않는다.** 슬롯 제안·카피만. 서버가 ask/no-ask·filterDelta·랭킹의 최종 결정권.

---

## 2. 데이터 계약 — 2계층 카탈로그

| | Tier 1 (신뢰 엔진) | Tier 2 (다양성·신선도 엔진) |
|---|---|---|
| 소스 | 큐레이션 seed 624개 (감사됨, 거짓 0) | 라이브 Naver Shopping API |
| 성격 | 속성 풍부, 근거 있는 매치 | 얕음(제목/가격/이미지/몰), 신선함 |
| 파일/경로 | `data/auradin/catalog/catalog_items_seed_20260706.jsonl` | 런타임 API 호출 (자격증명 보유) |
| 랭킹 기여 | evidenced match(확정 근거) + semantic | semantic + 가격 + 신선도, 근거는 헤지 |
| 역할 | anchor·다양성 슬롯의 주력 | **발견 슬롯**의 주력, 카테고리/질의 커버 확장 |

- 검색은 **Tier1 우선**, Tier1이 얇은 질의/카테고리에서 **Tier2로 broaden**.
- Tier2 항목은 `source="live_naver"`로 표시, 근거는 항상 헤지("제품명·판매문구상 ~계열로 보여요").
- 데이터 판단: **깊이(undertone 9.6%)는 소스가 막힌 천장 — 추가 수집 안 함. 폭·신선도는 Tier2 라이브가 담당.**

---

## 3. 입력 계약 — 요청 프로필 정규화 (입력별 신뢰도)

모든 입력은 `RequestProfile`로 번역된다. 입력마다 신뢰도가 다르다.

```ts
type RequestProfile = {
  hardConstraints: FilterDelta[];   // 완화 금지 (명시 category/price/channel)
  softPreferences: SoftPreference[]; // 점수/설명 반영, 후보 제거 X (톤/무드/inferred)
  semanticText: string;              // 임베딩 질의 (prompt + 답변 + 리포트 요약)
  lookContext?: LookSpec;            // 다-카테고리 룩 스펙 (사진/AR/풀페이스 리포트)
};
```

| 입력 | 성격 | 신뢰도 | RequestProfile 반영 |
|---|---|---|---|
| **AR 필터** | 앱이 생성한 파라미터(색/마감 known) | 최상 | lookContext(하드에 가까움) |
| **분석 리포트** | 구조화된 퍼스널컬러 진단 | 높음 | softPreferences(톤) — undertone 낮아 **hard 금지** |
| **텍스트 프롬프트** | 파싱된 의도 | 중간 | hard + soft |
| **임의 사진** | 비전으로 추론 | 낮음 | lookContext(부위별) — 강하게 헤지 |

- 리포트/AR/사진 → 부위별 색·마감 스펙이 `lookContext`가 되고, 이는 §4에서 **세트 출력**을 트리거한다.

---

## 4. 출력 모양 계약 — 에이전트가 자동 판단

**입력 modality + 카테고리 cardinality → 출력 모양.** (사용자가 안 정해도 자동)

| 조건 | 출력 모양 |
|---|---|
| 카테고리 0~1개 명시 (텍스트 질의) | **단일 카테고리 추천순 Top 3** (기본) |
| lookContext 존재 (사진 / AR / 풀페이스 리포트 / "세트·풀메") | **카테고리별 ~2개 세트** (하모니) |
| "A vs B" | 비교 |
| 결과 이후 후속 발화 | refine (§7) |

기본 출력은 **Top 3 + 근거**. "이 사진 전체 메이크업"처럼 룩이 들어오면 자동으로 세트 모드.

---

## 5. 랭킹 계약 — floor → relevance → MMR → 3역할

```
score = pass(hardConstraints) ×
   ( w_ev·evidencedMatch   // 근거 있는 속성 일치 (Tier1) — reason의 matched
   + w_se·semantic         // 임베딩 유사도
   + w_sp·softPref/answer  // 톤·무드·질문 답변
   + w_ev2·evidence        // 소스 품질 (공식>리테일>title추론)
   + w_lo·liveOffer )      // 가격·링크·이미지·신선도
```

- **가중치 `w_*`는 튜너블(빌드/설정)** — 이 문서에 숫자를 박지 않는다. (현행 값은 `ranking.py` 참조)
- **floor 게이트**: 정당화 미달 후보는 정렬 전 컷.
- **MMR 재랭킹**: `λ·relevance − (1−λ)·이미_뽑힌것과_유사도`로 결과셋 다양성 확보. `λ`는 §7에서 사용자가 조절.
- **3역할 배치**:

```
1등  anchor  = 가장 잘 근거된 정답        ← 신뢰
2등  다른 결 = MMR로 뽑힌 대비되는 선택   ← 다양성
3등  발견    = Tier2 라이브의 신선한 찾음  ← 확장
```

---

## 6. 근거 계약 — 구조화 (LLM 자유 문장 금지)

결과 카드의 근거는 **3칸 구조**. LLM은 이 구조를 자연스러운 카피로 바꾸는 역할만.

```ts
type Reason = {
  matchedOn: string[]; // 확정 근거: [category, price<=2만, 벨벳 마감]  (Tier1/명시조건)
  inferred:  string[]; // 추론(헤지): [제품명상 코랄 계열]
  caveat:    string[]; // 정직한 한계: [톤은 참고용·확정 아님]
};
```

---

## 7. Refine 계약 — 다양성 다이얼

```
POST /api/search/sessions/{id}/refine
  req: { prompt?: string, dial?: 'more_similar' | 'more_diverse' }
```

- `more_similar` → λ↑ (anchor 유사), `more_diverse` → λ↓ (MMR 강). **기존 후보를 재랭킹만** (재검색 불필요 = 쌈).
- 자유 텍스트 refine은 §3 파서를 태워 hard/soft 병합. **같은 attribute의 refine-출처 필터만 교체, 원 프롬프트 출처는 불변.**
- 후보 0이면 조용히 완화 금지 — 이전 결과 유지 + recoveryOptions.

---

## 8. 세션 API 계약

```
POST /api/search/sessions            { prompt, reportId?, source?, context? } → { sessionId, phase:'searching' }
GET  /api/search/sessions/{id}       → SearchTurn
POST /api/search/sessions/{id}/answer { questionId, optionId } → { sessionId, phase:'searching' }
POST /api/search/sessions/{id}/refine { prompt?, dial? } → { sessionId, phase:'searching' }   [신규]
```

공통 봉투 `{ data, meta, error }`. 모바일은 `imageUrl`을 `{uri}`로 변환.

```ts
type SearchTurn = {
  sessionId: string;
  phase: 'searching' | 'question' | 'results' | 'failed' | 'expired';
  thinking: { id: string; label: string; status: 'done'|'active'|'pending' }[];
  question?: AuradinQuestion;
  result?: {
    shape: 'single' | 'set' | 'compare';
    headerLabel: string;
    products: RankedProduct[];          // single: 3, set: 카테고리별 ~2
    appliedFilters: { label: string; source: 'prompt'|'question'|'report'|'fallback' }[];
    suggestedRefinements?: { label: string; expectedCandidateCount: number }[];
  };
  error?: { code: string; message: string; recoverable: boolean };
  retryAfterMs?: number;
};

type RankedProduct = {
  id: string; brandName: string; productName: string; category: Category;
  role: 'anchor' | 'diverse' | 'discovery';   // 3역할
  source: 'curated' | 'live_naver';
  matchRate: number;                            // 0~100
  price: number; imageUrl: string; purchaseUrl: string; palette: string[];
  reason: Reason;                               // §6 구조화 근거
};
```

**결과 카드 필수**: imageUrl · purchaseUrl · price · brandName · productName · category · reason. (없으면 표시 안 함)

---

## 9. 정직성 불변식 (C 원칙 — 하드 룰, 테스트로 강제)

- 저신뢰 필드(undertone/intensity 등)를 **hard filter로 쓰지 않는다.**
- **unknown retail presence를 negative로 바꾸지 않는다.** (미입점 아님)
- 명시 조건(category/price≤N/channel)을 **조용히 완화하지 않는다** — 못 맞추면 "가까운 후보"로 표시.
- 결과 카피에서 "공식", "정확한 호수", "퍼스널컬러 매칭 확정" 같은 표현 금지.
- **LLM은 후보/필터/속성을 발명하지 않는다** — 카탈로그 근거만 사용.
- colorHex/colorLab 저장 안 함, 신규 madeInCountry 수집 안 함, 보안 챌린지는 우회 없이 blocked.

---

## 10. 데이터 현황 & 정책 (숫자는 빌드타임 산출물 참조 — 여기 박지 않음)

- 현재 서빙: `catalog_items_seed_20260706.jsonl` (624 고유 제품) → MVP 337(lip/cheek/shadow). base/brow/liner 287개는 정책상 제외(개방 검토 대상).
- **질문 정책은 하드코딩하지 말고 빌드타임에 커버리지에서 자동 생성** (기존 문서가 9% 시절 표를 박아 낡은 교훈).
- 커버리지·감사 결과: `reports/auradin/collection_final_summary_20260706.md`, `seed_refinement_coverage_20260706.md`.
- 데이터 파이프라인: `scripts/refine_auradin_seed_derivation.py` → `scripts/merge_official_into_seed.py`.
- 서빙 스위치: `catalog_loader.RUN_DATE` = env `AURADIN_RUN_DATE` (기본 20260706).

---

## 11. 구현 순서 & 솔로 병렬 흐름

**전제**: 1인 개발. 병렬 = "Claude 스트림 여러 개"가 아니라 **활동 종류가 다른 2개 레인이 시간상 겹치는 것** + 긴 작업의 백그라운드화.

```
레인 A (Claude 실행, 대체로 순차 — 하나씩 리뷰):
  0. 결정 잠금 (완료: 정체성 A+C, 라이브 API 보유)
  1. 이 계약 문서 (완료)
  2. 얇은 수직 슬라이스 : 실데이터 1질의 → anchor/다양성/발견 → 근거, 러프 UI로 계약 검증  ← 직렬 게이트
  3. 백엔드 Phase1 : floor + MMR + 3역할 + 구조화 근거 + 점수갭 즉답 종료 (+ plum 라벨 버그)
  4. 모바일 : 3역할 카드 + refine 다이얼 + 능력 공개 홈
  5. 평가 : 의도 보존 골든 스위트 (구현과 함께, 회귀 잡이)
  6. LLM 통합 + 가드레일 (내장, 분리 금지)
  7. 발견 슬롯 = 라이브 Naver API (Tier2 broaden)
  8. E2E + 데모 리허설 (상시 골든 위에서)

레인 B (당신이 한 발 앞서 조사·결정 — 레인 A가 멈추지 않게 §13을 미리 채움):
  while 슬라이스 : 데모 질의 확정, λ·floor 감
  while 백엔드   : UI 레퍼런스·아이디어 (압도적 디자인), 디자인 매체 결정
  while 모바일   : 하모니 맵 큐레이션 판단, 카테고리 개방 여부
  while LLM      : Bedrock 모델·리전·쿼터·가드레일 정책 확인

백그라운드 (Claude가 띄우고 둘 다 딴짓 → 완료 시 알림):
  긴 eval 실행, 디자인 목업 생성, 데이터 프로브
```

원칙:
- **직렬 척추**: 계약(완료) → 얇은 슬라이스(계약을 코드로 검증). 슬라이스 전엔 다음 단계 착수 금지 — 계약이 틀리면 이후 전부 틀린 위에 지어짐.
- **레인 B는 항상 한 발 앞서** §13 열린 결정을 채운다 → Claude가 "λ 얼마?", "디자인 어떻게?"에서 멈추지 않는다 (진짜 파이프라이닝).
- **코드는 집중 순차** — 혼자 리뷰하므로 한 번에 하나. Claude 다중 팬아웃은 리뷰가 감당 안 됨.
- **"Claude 돌리며 딴거"는 백그라운드 태스크**로 실현 (긴 독립 작업만).
- **진짜 의존성(순서 고정)**: 가드레일 ⊂ LLM 통합, 발견 슬롯 ⊂ 라이브 API 클라이언트.

---

## 12. 문서 인덱스

| 문서 | 상태 | 역할 |
|---|---|---|
| **AURADIN.md** (이 문서) | ACTIVE | 노스스타 계약 — 단일 진실 소스 |
| `AURADIN_AKINATOR_AGENT_SYSTEM_DESIGN_KO.md` | ARCHIVED | 20260703 기준, 아키네이터 설계 참고용 (질문 정책 표 낡음) |
| `AURADIN_MVP_PREPROCESSING_BEDROCK_AGENT_PLAN_KO.md` | ARCHIVED | 20260703 기준, MVP 전처리/Bedrock 참고용 |
| `AURADIN_SEARCH_AGENT_BUILD_PLAN.md` | ARCHIVED | 밤샘 MVP 스펙 참고용 |
| `AURADIN_*_20260706.md` (reports/) | ACTIVE | 데이터 수집/커버리지 산출물 |
| `AURADIN_BACKEND_PHASE1.md` 등 | (JIT) | 각 단계(레인 A) 착수 시 생성, 이 계약을 참조 |

---

## 13. 열린 결정 (착수 전 확정 대상)

- [ ] MMR `λ` 기본값 & 조건별(명확 질의↑ / 탐색 질의↓) 매핑 — 얇은 슬라이스에서 캘리브레이션
- [ ] floor(정당화 문턱) 정의 — 어떤 최소 근거를 요구할지
- [ ] 세트 모드 하모니 맵 (colorFamily 계열 매칭) — 큐레이션 판단, "톤 보장 아님" 라벨
- [ ] base/brow/liner 카테고리 개방 여부 & 시점
- [ ] 디자인 매체 (Claude 아티팩트 / Figma / RN 네이티브)
- [ ] Bedrock 모델·리전·호출 제한·가드레일 상세 (JIT: LLM 통합 문서)
