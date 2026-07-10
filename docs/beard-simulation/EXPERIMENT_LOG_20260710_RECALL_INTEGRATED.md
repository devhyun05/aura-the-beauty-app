# 통합 recall 개선 — REGION 재베이스라인 + Stage 2 (2026-07-10)

계획: `~/.claude/plans/floofy-crafting-meerkat.md`
측정자: 프로토콜 v2.1 (`eval/run_protocol_v2.py --gt region`), 자 테스트 10 passed.
불변식: 입술 픽셀 diff 0 / pytest / 평가 9쌍은 튜닝 입력 금지 / 시각 관문 육안 기록.

## 라벨 표준 전환 — REGION (커밋 8d2d345)

tight vs broad는 거짓 이분법이었다. 확정 표준 = **ZONE**("경계는 정확하게, 내부는 채워서").
지대 = 이 사람의 수염 모낭 분포 범위 = 레이저 시술 부위 = 제품의 "after" 범위. (상세: 계획 라벨 섹션)

- 변환은 로드 시 코드(`eval/gt_region.py`), 원본 라벨 파일 무수정.
- 시각 관문(`region_transform_grid.jpg`) 육안: 노란 지대가 초록 털을 얇게 감싸고 틈만 메움,
  콧수염/턱수염은 입술 아래 깨끗한 피부를 두고 별개 섬 유지, 스프레이 없음. 변환 배율 ×1.2~1.7.
- 코밑선 위 클립 = 카운트되어 보고됨(총 14,012px, 대부분 psd04의 12,916 — 원래 볼 위까지 과라벨).

## v2.1 베이스라인 (커밋 후, `outputs/protocol_v2/v21_baseline/`)

REGION GT 기준. 구 strand-GT 수치와 **비교 불가**(분모가 다름) — 여기서부터 새 기준.

| 예측기 | thr | IoU | R | P |
|---|---|---|---|---|
| CLIPSeg (keep) | 0.12 | **0.464** | 0.673 | 0.730 |
| CLIPSeg (best sweep) | 0.08 | 0.491 | 0.778 | 0.646 |
| C1 (keep) | 0.05 | 0.326 | 0.492 | 0.508 |

- REGION 전환으로 CLIPSeg P 0.601→**0.730**, IoU 0.436→0.464 (지대 칠이 이제 정답으로 인정).
- 배관손실 여전히 전 밴드 ~0.000 (Stage 1 유지 확인).
- **사진별 CLIPSeg IoU** (동작점 thr0.12): 최악 **0.263 (pic4)**, 평균 0.464.
  두 최악이 정반대 실패: pic4 = 스프레이(R0.804/P0.281), pic2 = 소심(R0.301/P0.937).

## Stage 2 · 기법 1 — 타일 줌 앙상블 · **기각(단독)**, Stage 3 recall 소스로 이월

`spike/clipseg_zoom.py` (2×2 겹침 타일, overlap 0.35, raw sigmoid, Hanning 합성).
A/B 하니스 `spike/eval_zoom.py` — 두 방법 같은 raw 스케일, 전역 동작점(best mean IoU) 각자 선택.

| 방법 | thr | mean IoU | **worst IoU** |
|---|---|---|---|
| full-crop | 0.06 | **0.507** | **0.329** |
| tile-zoom | 0.06 | 0.485 | **0.118** |

채택 규칙(mean·worst 둘 다 개선) **미달** → 기각.

**사진별 델타** (zoom − full IoU): pic2 **+0.075**, pic3 +0.046, pic1 +0.019, psd05 +0.017,
psd04 +0.004, psd03 0.000, psd02 −0.013, pic4 **−0.140**, psd01 **−0.211**.

**시각 관문 육안 기록**:
- `zoom_pic4.jpg`: full은 콧수염만 잡고 턱수염 막대를 **통째로 놓침**(R0.637). zoom은 그 턱수염을
  **찾아냄**(R**0.919**) — 그러나 하관 전체에 파랑 스프레이, P **0.255**로 붕괴. IoU 0.389→0.249.
- `zoom_pic2.jpg`: 소심 케이스. zoom이 놓쳤던 콧수염·좌측 섬을 회복, R0.543→0.718,
  P는 0.817→0.718만 하락. IoU 0.484→**0.560**.
- psd01(−0.211, 미육안): 입 벌린 사진. gain-up 메커니즘상 어두운 입안·주변까지 증폭된 스프레이로 추정.

**핵심 인사이트(가설 반증)**: Stage 2의 전제("해상도가 병목")는 **부분적으로 틀렸다.**
줌은 결정을 날카롭게 만들지 않고 **감도를 균일하게 올린다**. 그래서
- 소심한 얼굴(진한 수염 일부를 full-crop이 놓친 경우) → 진짜 수염 회복(도움)
- 옅은 얼굴(매끈 피부가 많은 경우) → 오탐 증폭(스프레이 악화)

CLIPSeg의 진짜 적은 해상도가 아니라 **절대 보정 부재(스프레이)**다. 순수 CLIPSeg 기법
(부위 프롬프트/TTA)은 전부 이 보정 문제를 못 건드린다 → Stage 3(텍스처 게이트 융합)로 무게 이동.

**이월**: zoom이 pic4에서 회복한 턱수염은 진짜(알갱이 있음)이고 스프레이는 매끈하다.
zoom을 **recall 소스**로, C1의 알갱이(텍스처) 게이트를 **precision 필터**로 결합하는 것이
Stage 3의 직접 근거가 됐다. `spike/clipseg_zoom.py`는 폐기하지 않고 Stage 3에서 재사용.

## Stage 3 · 융합 시도 — 게이트 3종 전부 **기각**, raw-sigmoid 채택

`spike/grain_gate.py` + `spike/eval_fusion.py`. 모두 v2.1 REGION, 전역 동작점(best mean IoU).
비교 대상 `full` = whole-crop raw-sigmoid CLIPSeg: **mean 0.507 / worst 0.329**.

| 시도 | mean IoU | worst IoU | 판정 |
|---|---|---|---|
| full (raw-sigmoid) | **0.507** | **0.329** | 기준 |
| pixel grain gate | 0.186 | 0.020 | 기각 |
| zone grain gate | 0.259 | 0.000 | 기각 |
| 절대 히스테리시스(t_high 0.30) | 0.376 | 0.000 | 기각 |
| 상대 히스테리시스(0.55·max) | 0.444/0.483 | 0.257/0.118 | 기각 |

**게이트별 실패 근본원인**:
- **grain 게이트(알갱이 테스트의 코드화)**: 고주파 에너지는 수염↔피부가 아니라 **선명함↔흐림**을
  가른다. 계측: psd(고해상 사진)는 clean-skin grain이 2.3~4.1로 커서 문턱 5.4~9.4 → 수염이 못 넘어
  GT 안 게이트 발화 **2~9%**, pic(매끈 피부)는 GT 밖에서도 65~70% 무차별 발화. clean-skin 상대화도
  못 구제(같은 이미지 안에서 이마 모공 grain ≈ 볼 수염 grain).
- **pixel grain**: 채워진 REGION GT에 구멍을 뚫음. `zone_grain_filter`(덩어리 단위 유지)로 고쳤으나
  → 이번엔 거대 blob이 스프레이와 합쳐져 grain 비율 희석 + psd는 애초에 grain 미발화로 통째 기각.
  육안 `fusion_psd05.jpg`: full IoU 0.724가 색종이 조각(0.044)으로 붕괴.
- **히스테리시스**: 절대 t_high는 저확신 이미지(psd01 최대 0.175)를 통째 기각(← **또 미보정**).
  상대 t_high는 스프레이가 진짜 수염과 한 blob으로 연결돼 분리 실패 + 정상 케이스의 저확신 말단 절단.

**공통 결론**: CLIPSeg heat에 대한 어떤 값싼 비지도 후처리도 스프레이/옅음/그늘을 못 가른다.
반복해서 **이미지 간 미보정**이 모든 시도를 무너뜨린다. → Stage 4(학습) 정당화.

## 채택 — raw sigmoid (min-max 정규화 제거)

융합 실패의 부산물로 확정된 유일한 순증분. min-max 정규화는 각 이미지 peak를 1.0으로 끌어올려
**거의 수염 없는 얼굴의 잡음까지 만점 확신으로 부풀린다** — 스프레이의 수치적 뿌리를 증폭.
raw sigmoid로 바꾸면(둘 다 best-mean 동작점 선택, 공정):

| CLIPSeg | mean IoU | worst IoU | 인중 R | soul_patch R |
|---|---|---|---|---|
| 정규화(v21_baseline, thr0.08) | 0.491 | 0.239 | 0.791 | 0.540 |
| **raw(v21_raw, thr0.06)** | **0.507** | **0.329** | **0.898** | **0.613** |

`eval/bench_models.py`에 `normalize` 파라미터(기본 True=하위호환), 프로토콜은 `normalize=False`.
배관손실 여전히 ~0.000. pytest 39 passed(자 테스트 10 포함). 엔진 blend 무변경 → 입술 불변식 유지.

## Stage 4 트리거 — **발동**

현재 최고: mean IoU 0.507(<0.55) **및** worst 0.329(<0.35). 두 조건 모두 미달 → 학습 착수 정당.
근거: ①~③가 반복적으로 부딪힌 벽(이미지 간 미보정 + 스프레이/그늘/옅음 무료 판별기 부재)은
정확히 라벨 학습이 푸는 문제다. ND 2,350 하관 크롭으로 소형 seg 학습(로컬 우선).

## SKIPPED

- 기법 2(부위 프롬프트)·3(TTA): 미보정을 못 건드림이 자명 → 미실행, Stage 4로 직행.

## 커밋

- 8d2d345 REGION 표준 + 자 테스트 + 시각 관문
- 4c397c0 Stage 2 타일줌 spike(기각, 이월)
- (다음) Stage 3 게이트 spike(전부 기각) + raw-sigmoid 채택 + 본 로그

## 시각 관문 이미지 (사람 사후확인용)

- `outputs/visual_gate/region_transform_grid.jpg` — REGION 변환 9장
- `outputs/visual_gate/stage2_zoom/zoom_{pic4,pic2,psd05}.jpg` — 줌 gain-up 증거
- `outputs/visual_gate/stage3_fusion/fusion_{pic4,pic2,psd01,psd05}.jpg` — 게이트 붕괴 증거
