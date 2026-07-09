# ND 외부 평가 — C1 IoU 측정 (2026-07-09)

과제 지시서: `docs/beard-simulation/PLAN_ND_EVAL_CODEX.md`
스크립트: `tools/beard-simulation-lab/eval/run_nd_eval.py` (신규, engine/ 무수정)
목적: **측정** — 개선 아님. C1은 커밋된 상태 그대로 평가됨.

## 실행 요약

```bash
cd tools/beard-simulation-lab
MPLCONFIGDIR="$PWD/.mplconfig" .venv/bin/python eval/run_nd_eval.py --limit 20   # smoke
MPLCONFIGDIR="$PWD/.mplconfig" .venv/bin/python eval/run_nd_eval.py              # 전량
```

- 소요: **676초** (~11분, 2330장 신규 처리 + smoke 20장)
- 결과: **processed 2136 / gate_rejected 214 / load_failed 0**

## 정합성

`2136 + 214 + 0 = 2350` → `reconciliationOk = true`. summary.json:

```json
{"total": 2350, "processed": 2136, "gateRejectedTotal": 214, "loadFailed": 0, "reconciliationOk": true}
```

검증 명령(무출력=성공):
```bash
.venv/bin/python -c "import json; s=json.load(open('outputs/nd_eval/summary.json')); assert s['reconciliationOk'] and s['total']==2350, s"
```

## 게이트 거부 분석

| 사유 | 개수 | 비율 |
|---|---:|---:|
| face_not_frontal | 195 | 91.1% |
| photo_too_blurry | 16 | 7.5% |
| no_face_detected | 3 | 1.4% |

거부의 91%가 정면 아님 — CelebA-HQ는 유명인 3/4 측면 포트레이트가 많고, 우리 yaw 게이트가 이를 정상 배제한 것. 버그 아님이며, 오히려 게이트가 의도대로 작동함을 방증한다. (제품에선 셀피 정면 촬영이라 이 거부율은 재현되지 않음.)

## 채널별 결과 (processed n=2136, thr 0.3)

| 채널 | 스코프 | IoU | Precision | Recall |
|---|---|---:|---:|---:|
| hard | full | 0.031 | 0.708 | 0.038 |
| hard | roi | 0.037 | 0.708 | 0.048 |
| shadow | full | 0.023 | 0.090 | 0.137 |
| shadow | roi | 0.026 | 0.090 | 0.159 |
| union | full | 0.184 | 0.701 | 0.226 |
| **union** | **roi** | **0.218** | **0.701** | **0.276** |

threshold 스윕 (union, roi): precision은 0.69~0.70으로 평평, recall만 이동 →

| thr | IoU | P | R |
|---|---:|---:|---:|
| 0.2 | 0.289 | 0.701 | 0.381 |
| 0.3 | 0.218 | 0.701 | 0.276 |
| 0.4 | 0.162 | 0.694 | 0.198 |
| 0.5 | 0.118 | 0.686 | 0.139 |

**핵심 해석**: C1은 **정밀도는 높고(0.70) recall은 낮다(0.28)** — "잡으면 대체로 맞지만, 라벨된 수염 영역의 ~28%만 덮는다". threshold를 0.2로 낮추면 recall 0.38까지 오르고 precision은 유지 → 현재 동작점이 다소 보수적임을 시사.

**중요 caveat (지표 해석)**: ND GT는 **영역 채움 라벨**(labelme 폴리곤으로 수염 부위를 통째로 칠함)이고, 우리 `hard` 채널은 **가는 가닥/점 검출**(희소)이다. 따라서 hard-vs-GThard 직접 비교는 구조적으로 불리하며(R 0.048), 이것이 hard IoU가 바닥인 이유다. shadow의 넓은 커버리지까지 합친 **union이 공정한 비교**이고 그마저 recall 0.28 — 즉 "영역을 넓게 덮어야 하는" 제모 시뮬레이션 관점에서 이 저커버리지는 지표 잡음이 아니라 **실제 제품 관련 갭**이다.

## shadow-500 서브셋 (핵심 채널, n=463)

`shadow` 라벨 보유 이미지만, shadow 채널 vs GT shadow, roi:

| thr | IoU | P | R |
|---|---:|---:|---:|
| 0.2 | 0.161 | 0.431 | 0.234 |
| 0.3 | 0.114 | 0.418 | 0.159 |
| 0.4 | 0.076 | 0.392 | 0.104 |
| 0.5 | 0.050 | 0.373 | 0.067 |

우리 최우선 채널인 blue-gray shadow는 recall 0.16(thr0.3)으로 특히 약하다. 전체 processed에서 shadow precision이 0.090으로 폭락한 이유는 shadow 라벨이 없는 대다수 얼굴(2136 중 1673장)에 shadow를 조금이라도 예측하면 전부 오탐으로 계산되기 때문 — 서브셋에서 precision이 0.42로 회복하는 것이 이를 뒷받침한다. 즉 **shadow 채널은 "shadow가 있는 얼굴에서도 영역의 16%만 잡고, 없는 얼굴에서도 약하게 켜진다"** — recall·specificity 양쪽 개선 여지.

## best10 / worst10 관찰 (report.html)

worst 상위는 전부 IoU 0.0. 공통 실패 패턴 (3+):

1. **사이드번/귀 옆 GT가 우리 ROI 밖** (예: id 1012 — GT beard가 귀 밑 구레나룻 패치, 우리는 하관 ROI라 구조적으로 0). sideburn은 계약상 MVP 제외 영역 → 이 케이스는 검출 실패가 아니라 **스코프 불일치**.
2. **GT의 부분/편측 라벨 vs C1의 넓은 예측** (예: id 12222 — GT는 왼쪽 턱 작은 초록 패치, C1은 실제 보이는 턱 전체 stubble에 빨강. C1이 오히려 더 맞아 보이나 위치가 어긋나 교집합 0). ND 라벨이 손으로 대충 한쪽만 칠한 경우.
3. **준측면 얼굴**이 게이트를 겨우 통과했으나 기하가 틀어져 정렬 불량.
4. (채널 특성) **hard가 GT 영역 라벨과 granularity 불일치** — 위 caveat.

best10은 대비되게 **넓은 턱/염소수염 영역에서 GT·pred 합치**. 특히 **id 11959: 어두운 피부에서 IoU 0.805** — 턱 수염 영역을 빨강이 GT 초록과 강하게 겹침. 본인 피부 기준(local reference) 설계가 **피부톤을 넘어 작동**한다는 첫 외부 증거로, 우리 최대 리스크(어두운 피부 편향) 대비 긍정적. best는 mustache/beard 넓은 영역에 몰려 있어, **C1은 "넓고 진한 영역"에 강하고 "옅은 shadow·희소 stubble·편측 부분 라벨"에 약하다**는 그림이 일관된다.

## 우리 6장 스파이크와의 괴리

6장 스파이크는 "하관 전체 과검출 해소"(precision/특이도)만 봤고 recall은 못 쟀다. 이번 평가가 그 공백을 메꿨다:

- 6장에서 자신했던 "과검출 억제"의 이면 = **저커버리지**가 수치로 확인됨 (union R 0.28, shadow R 0.16).
- 즉 우리는 recall을 희생해 precision을 산 상태다. 6장만 봤으면 "shadow 0.65→0.17 감소 = 성공"으로 오독했을 것을, 463장 정답 대비로 보니 **"감소가 지나쳐 실제 shadow도 놓치고 있다"**가 드러남.
- 다음 튜닝의 정량 목표가 생김: precision 0.70을 크게 깨지 않으면서 union/shadow recall을 끌어올리기 (thr 0.2 동작점 + shadow 저강도 구간 감도 회복).

## 한계

- **ROI 밖 GT**: 사이드번 등 우리가 의도적으로 제외한 영역의 GT는 roi 스코프로도 완전히 못 걷어냄(패치가 ROI 경계에 걸치면 부분 계산). worst의 일부는 이 스코프 정의 차이.
- **도메인 차이**: CelebA-HQ는 서구 유명인·스튜디오/무대 조명·측면 다수. 우리 타깃(아시아인 셀피, 실내 정면)과 분포가 달라 절대 수치를 제품 성능으로 직역하면 안 됨. gate 214건(측면)이 그 방증.
- **라벨 거칠기**: ND 라벨은 손으로 대충 칠한 폴리곤(부분·편측 다수)이라 GT 자체가 완벽 정답이 아님 — worst의 IoU 0 중 일부는 C1이 더 맞는 경우.
- **granularity 불일치**: 영역 GT vs 가닥/필드 예측 — hard 채널 수치는 이 편향을 크게 받음.

## SKIPPED 항목

없음. 계획의 8단계 전부 수행, 산출물 4개 전부 생성, DoD 전 항목 충족.

## 결론

C1은 **넓고 진한 수염엔 정밀하나(P 0.70), 라벨된 수염/그림자 영역의 ~28%(shadow는 16%)만 덮는 저recall** 상태다. 어두운 피부에서도 작동함이 외부 데이터로 처음 확인됐다(best IoU 0.805).
개선 방향(측정 결과가 지시하는 것, 별도 과제): union 동작점을 thr 0.2 쪽으로 내리고 shadow 저강도 감도를 회복해 recall을 올리되, precision 0.70을 방어하는 튜닝.

## 산출물

- `tools/beard-simulation-lab/outputs/nd_eval/results.jsonl` (id별 지표+상태, 2350행)
- `tools/beard-simulation-lab/outputs/nd_eval/summary.json` (채널×thr×스코프 집계 + 서브셋)
- `tools/beard-simulation-lab/outputs/nd_eval/report.html` (best10 + worst10 오버레이)

## 검증

```text
full pytest: 29 passed, 3 warnings
git diff --stat engine/{beard_segmentation,detect_face,lower_face_roi}.py: (빈 출력 — C1 무수정)
reconciliationOk: true (2136+214+0=2350)
```

주의: 기본 샌드박스에서 MediaPipe FaceMesh가 NSOpenGL 오류를 낼 수 있어 `MPLCONFIGDIR` 지정 + 권한 상승 셸에서 실행.
