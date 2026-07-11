# 체크포인트 ⑥ 사전등록 프로토콜 (Pre-registered)

작성: 2026-07-12 · 근거: EXPERIMENT_LOG_20260710_ERASER_SPRINT.md — "Codex #14 §Q7",
"범위 결정(dense는 v1 목표에서 제외)", "정정(아이누 세피아 제외)", "webset 글로벌 보강 완료"

> **사전등록 원칙**: 이 문서가 커밋되고 §6의 manifest 커밋이 이루어진 뒤에는
> **합격 기준·재료·판정 절차의 어떤 항목도 변경할 수 없다.** 변경이 필요하면
> 체크포인트 번호를 새로 부여하고(⑦) 재료를 새로 조달한다. 결과 열람 후의 수정은
> §7 소진 조항을 발동시킨다.

---

## 1. 목적과 범위

- 목적: 수염 지우기 파이프라인의 **frozen baseline(A)** 대비 **challenger(B)** 의
  개선/비열화를 봉인된 홀드아웃에서 1인 블라인드 판정으로 검증.
- 범위: **stubble·medium이 유일한 차단(blocking) 층**이다. dense는 v1 목표에서
  제외됐으므로(로그 2026-07-12 범위 결정) **비차단 스트레스 프로브로 측정·보고만** 한다.
- 사전등록 한계 명기: 현대 실사 dense는 표본 1(IMG_4572) + 웹셋 프로브 2뿐 —
  **"dense 일반화는 표본 부족으로 미입증"** 을 결과 보고서에 반드시 명기한다.
  판정자 1인(사용자) 체제이므로 판정자 간 신뢰도는 측정 불가 — rubric 고정으로 보완.

## 2. 재료 (총 43장, 실행 전 전량 sha256 봉인)

### 2.1 실사 primary 5장 (봉인 홀드아웃, 5/5 처리 필수)

| 파일 | 층 | 역할 |
|---|---|---|
| IMG_4572 | dense | **비차단 프로브** (유일 실사 dense; 합격 기준에 불산입, 원자료 보고만) |
| IMG_4570 | medium | 차단 양성 |
| IMG_4575 | stubble | 차단 양성 |
| IMG_4561 | negative(무수염) | 차단 negative |
| IMG_4565 | negative(무수염) | 차단 negative |

- 5장 전부 실행 전 수동 annotation(수염 영역·어퍼처·해부 랜드마크) 후 봉인.
- **촬영 게이트를 통과한 사진의 abstain은 실패로 계상**한다(분모 유지).

### 2.2 웹셋 secondary (아카이브/webset_cp6, 결정론 선정)

**풀 정의 규칙(결정론)**: `아카이브/webset_cp6/manifest.json`에서
`gateOk == true` 이고, 파일명이 `cand_` 로 시작하지 않고, `_spare` 를 포함하지 않으며,
license/note에 1904·19세기 세피아(아이누)가 아닌 항목만 셀 풀에 넣는다.
→ 결과 풀: **none 8 / stubble 10 / medium 10 / dense(현대 컬러 프로브) 2**.
(로그의 "medium 12"는 spare·cand 포함 수치 — 본 규칙 적용 후 10이 정본.)

**셀당 선정 규칙(결정론, 사후 변경 금지)**: 각 셀 풀의 파일명(UTF-8 basename,
확장자 포함)을 `sha256(파일명)` 16진 문자열 오름차순으로 정렬해 **상위 N**을 뽑는다.

| 셀 | 풀 | N | 선정 결과(위 규칙의 유일해) |
|---|---|---|---|
| none | 8 | 5 | none_wikimedia_g01, none_wikimedia_03, none_wikimedia_01, none_wikimedia_g02, none_wikimedia_02 |
| stubble | 10 | 8 | stubble_wikimedia_g03, g04, g05, 02, 06, g01, g06, 03 |
| medium | 10 | 8 | medium_flickr_91, medium_wikimedia_g02, medium_unsplash_06, medium_wikimedia_05, g04, g03, medium_pexels_01, medium_wikimedia_04 |
| dense 프로브 | 2 | 2 | dense_wikimedia_g01, g02 (비차단) |

### 2.3 필터/압축 합성 변형 셀 (결정론)

- 목적: "필터(보정) 셀피 지원" 사용자 결정(2026-07-12)의 최소 검증.
- 변형 도구: `아카이브/webset_cp6/make_filter_variants.py` (파라미터 동결값은
  스크립트 상수 — §부록 A). 변형 3종: ① beauty-filter 근사(bilateral 2패스 +
  L채널 +6 리프트) ② JPEG q40 재압축 ③ 0.6x 다운스케일 후 원크기 복원.
- **변형 기반 사진(결정론)**: §2.2 선정 결과 내에서 다시 sha256(파일명) 오름차순
  상위 — stubble 2장(stubble_wikimedia_g03, g04) + medium 2장(medium_flickr_91,
  medium_wikimedia_g02) + none 1장(none_wikimedia_g01). 각 3변형 = **15장**.
- 변형 생성은 **체크포인트 빌드 시점(§6 3단계)에만** 실행한다. 그 전에는 웹셋
  원본에 어떤 처리도 가하지 않는다.

### 2.4 층별 집계 (차단 분모)

| 층 | 구성 | 분모 |
|---|---|---|
| stubble 차단 | 실사 4575 + 웹셋 8 + 변형 6 | **15** |
| medium 차단 | 실사 4570 + 웹셋 8 + 변형 6 | **15** |
| negative 차단 | 실사 4561·4565 + 웹셋 5 + 변형 3 | **10** |
| dense 프로브(비차단) | 실사 4572 + 웹셋 2 | 3 |
| 총계 | | **43** |

## 3. 팔(Arms)

| 팔 | 정의 | 동결 정보(실행 전 기입, §6 1단계에서 커밋) |
|---|---|---|
| **A** | frozen baseline (mask v4 / maskv4_b3 시점, lamaMaxDim 512·dilate 0.004) | 커밋 해시: `cadfe81ab1c956b6f7505c46ffc2f8dab348f4dc` · 모델 가중치 sha256: `344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9` |
| **B** | challenger (최종 1개만): v4.1 hardening + 채움 factorial 채택(lamaMaxDim 1024·dilate 0.02) | 커밋 해시: `8bb295005c9d0d34a3f3988d3972b1c6df98e18c` · 모델 가중치 sha256: `344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9` |

- challenger는 **정확히 1개**. 여러 후보 비교는 dev에서 끝내고 온다(Codex #14 §Q7).
- 두 팔 모두 동일 입력 바이트·동일 실행 환경(venv 해시 기록).
- venv 패키지 해시(sha256 of sorted pip freeze): `3003eaadfb5fdb323ec81e6bf0e89be13234340eda901fb5500058a55705e05a`
  (python 3.12.4 · 상세: `아카이브/webset_cp6/cp6_run/environment.json`, `pip_freeze.txt`)
- 실행기: `tools/beard-simulation-lab/spike/checkpoint6.py` (§6 전 절차 + K1~K5 집계
  로직을 이 파일에 동결; 본 커밋 이후 수정 금지, 수정 시 §7 소진)

## 4. 블라인드

- 판정자에게는 사진별 **원본 + 무기명 좌/우 결과 2장**만 제시. A/B 라벨 비노출.
- 좌우 배치(결정론): 실행 시 1회 생성한 salt(32 hex, 봉인 파일에만 저장)에 대해
  `sha256(salt + ":" + 파일 stem)` 의 첫 16진 문자가 짝수면 A=좌, 홀수면 A=우.
- 매핑 봉인 파일: `아카이브/webset_cp6/cp6_run/blind_mapping.sealed.json`
  (salt + 사진별 좌우 매핑; 생성 직후 `chmod 400`, §6 6단계 개봉 전까지 열람 금지.
  판정 완료 전 열람 = §7 소진 발동).

## 5. 판정 (1인, rubric 동결)

- 판정자: 사용자 1인(2026-07-12 사용자 결정 — 다수결 불가, 체크리스트로 편차 최소화).
- 사진당 **항목별 A/B/tie를 각 1회만** 판정(재판정 금지):

| 항목 | 질문 |
|---|---|
| ① 수염 잔존 | 어느 쪽이 수염(잔존 그림자·점묘 포함)을 더 완전히 제거했는가 |
| ② 피부 자연스러움 | 어느 쪽 피부가 더 자연스러운가(왁스감·결 소실·색 편차·줄무늬) |
| ③ 해부 보존 | 어느 쪽이 입술·콧구멍·턱선·인중을 원본대로 보존했는가(환각 구조물 = 즉시 열세) |

- 추가 체크박스(승패와 별도, 사진·팔별): **anatomy 훼손 유무**(제2의 입/이빨 환각,
  콧구멍 소실, 턱선 붕괴 등 원본 대비 구조 변형), **abstain 여부**.
- **rubric 앵커 예시는 dev 사진으로만 동결**(pic3·pic4·psd03·psd05 + 4574 오라클
  채움 결과에서 발췌한 "훼손/왁스/자연" 예시 이미지 시트) — 판정 전 확정, 홀드아웃
  사진은 예시로 사용 금지.
- negative와 변형-negative는 판정 대상이 아니라 **기계 측정**(editPx, byte identity)만.

## 6. 절차 (순서 고정)

1. **동결 커밋**: A·B 코드 커밋 해시 + 모델 가중치 sha256 + venv 패키지 해시를
   §3 표에 기입하고 본 문서와 함께 커밋.
2. **이미지 manifest 커밋**: 43장 전체의 `sha256(바이트)` 목록
   (`cp6_run/image_manifest.json`)을 커밋. 이후 재료 교체 불가.
3. **패널 생성**: 변형 15장 생성(`make_filter_variants.py --checkpoint-build`) →
   두 팔 실행(43장 × 2팔) → 블라인드 패널 생성 + 매핑 봉인. negative는 이 단계에서
   editPx/byte identity 자동 측정.
4. **판정**: §5 체크리스트 작성(1회).
5. **개봉**: 매핑 봉인 해제, 팔별 집계.
6. **보고**: §8 기준별 원자료(예: stubble 13/15)로 보고. 백분율 단독 보고 금지.

## 7. 소진(exhaustion) 조항

- **결과 열람(개봉) 후 코드·모델·기준·rubric 어느 하나라도 수정하면**, 본 체크포인트에
  사용된 세트 전체 — 실사 primary 5장 + 사용된 웹셋 28장(선정분+변형 기반) — 는
  **홀드아웃 자격을 영구 상실**하고 dev로 강등된다. 다음 체크포인트는 신규 재료로만.
- 판정 완료 전 봉인 열람, 홀드아웃에 대한 실행 전 파이프라인 시험 실행도 동일하게
  소진을 발동한다(Codex #14 프로토콜).

## 8. 사전등록 합격 기준 (사후 변경 금지)

Codex #14 §Q7 + Codex #13 §Q6의 비율(밀도별 8/10=80%, anatomy 0, negative 0)을
소규모 분모(§2.4)에 맞게 조정한 값. **dense는 어떤 기준에도 불산입.**

| # | 기준 | 대상/분모 | 합격선 | 차단 여부 |
|---|---|---|---|---|
| K1 | negative 완전 무편집 | negative 10장, B팔 | **editPx=0 AND 출력 byte identity, 10/10 (100%)** | 차단 |
| K2 | anatomy 훼손 0 | stubble+medium 차단 양성 30장, B팔 | **훼손 0/30** | 차단 |
| K3 | stubble 종합 비열화 | stubble 15장 | **"B 개선 또는 tie(3항목 중 A승 0)" ≥ 12/15 (80%)** | 차단 |
| K4 | medium 종합 비열화 | medium 15장 | **"B 개선 또는 tie(3항목 중 A승 0)" ≥ 12/15 (80%)** | 차단 |
| K5 | primary 전량 처리 | 실사 primary 5장 | **5/5 처리 (게이트 통과 사진의 abstain=해당 사진 실패 계상)** | 차단 |
| K6 | 변형 강건성 | 변형 12 양성(각 층 K3/K4 분모에 포함) + 변형 negative 3(K1 분모에 포함) | 별도 합격선 없음 — K1~K4에 산입 + 변형/원본 대비 원자료 보고 | (산입) |
| R1 | dense 프로브 | 4572 + 웹셋 2 | 합격선 없음 — 3항목 판정·anatomy·abstain 원자료 보고 | 보고만 |
| R2 | B 순수 개선율 | stubble·medium 30장 | 합격선 없음 — "B가 ≥1항목 승 & A승 0" 수를 원자료 보고 | 보고만 |
| R3 | A팔 negative 거동 | negative 10장, A팔 | 합격선 없음 — 기지 결함(maskv4_b3 오발화) 추적 보고 | 보고만 |

- 판정 규칙 정의: 사진의 "A승"이란 §5 3항목 중 해당 항목에서 A가 선택된 것.
  **"B 개선 또는 비열화" = 그 사진의 3항목 어디에서도 A승이 없음**(전부 B승 또는 tie).
- abstain 처리: 차단 양성에서 B팔 abstain은 그 사진을 K3/K4에서 자동 탈락(비열화
  아님)으로 계상, K5 위반 여부도 함께 판정. negative에서 abstain은 no-op과 다르므로
  K1 위반이 아니라 별도 표기(단, 출력이 없으면 byte identity 불성립 → K1 실패).
- **불변 조항**: K1~K5의 숫자·분모·정의는 §6 1단계 커밋 이후 어떤 사유로도 바꿀 수
  없다. 결과가 아깝게 미달해도(예: 11/15) 불합격이며, 재도전은 소진 조항(§7)에 따라
  신규 재료로만 한다.

## 9. 결과 해석 사전 약속

- 전 차단 기준 통과 → B를 새 frozen baseline으로 승격, dense 프로브 결과는 fine-tune
  설계 입력으로만 사용.
- 하나라도 실패 → B 기각. 실패 원인 분석은 dev 재료로만 수행(홀드아웃 재열람 금지).
- dense 프로브가 아무리 나빠도(예: 4574형 붕괴 재현) 합격/불합격에 영향 없음 —
  "dense 미지원, v1 범위 밖" 서사를 유지한다.

---

## 부록 A. 변형 스크립트 동결 파라미터 (make_filter_variants.py)

| 변형 | 상수 | 값 |
|---|---|---|
| beauty | BEAUTY_BILATERAL_D / SIGMA_COLOR / SIGMA_SPACE / PASSES | 9 / 75.0 / 75.0 / 2 |
| beauty | BEAUTY_L_LIFT (LAB L채널 가산, 0–255 스케일) | +6 |
| jpeg40 | JPEG_QUALITY | 40 |
| down06 | DOWNSCALE_FACTOR (INTER_AREA 축소 → INTER_CUBIC 원크기 복원) | 0.6 |

- 출력 파일명: `{stem}__beauty.png`, `{stem}__jpeg40.png`, `{stem}__down06.png`
- 스크립트는 기본적으로 웹셋/홀드아웃 경로(`webset_cp6` 하위, `IMG_4*` 파일명)를
  거부하며, §6 3단계에서만 `--checkpoint-build` 플래그로 해제한다.
- dev 검증: `tools/beard-simulation-lab/samples/pic3.png` **사본**(scratchpad)에만
  실행해 육안 확인 완료(2026-07-12). 홀드아웃·웹셋 원본은 §6 3단계까지 무접촉.
