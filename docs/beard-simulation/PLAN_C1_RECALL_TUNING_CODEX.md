# 과제 B: C1 recall 튜닝 — precision 방어하며 커버리지 올리기 (Codex 실행용)

> **이 문서는 Codex가 실행할 작업 지시서다.** 승인 후 첫 작업으로 이 문서를
> `docs/beard-simulation/PLAN_C1_RECALL_TUNING_CODEX.md`에 그대로 저장하고 시작하라.

## Context

과제 A(ND 외부 평가, `docs/beard-simulation/EXPERIMENT_LOG_20260709_ND_EVAL.md`)에서
C1을 2,350장 정답에 대고 처음 정량 측정한 결과가 나왔다:

- **union roi thr0.3: IoU 0.218 / Precision 0.70 / Recall 0.28** — 잡으면 맞지만 라벨 영역의 28%만 덮음
- **shadow-500 서브셋: Recall 0.16** — 우리 핵심 채널이 특히 약함
- threshold를 0.2로 내리면 union Recall 0.38, precision 유지 → **현재 동작점이 과하게 보수적**

즉 C1은 recall을 희생해 precision을 샀다. 이 과제는 **precision 0.70을 방어하면서
recall을 올리는 것**이 목표다. 개선 대상은 세그멘테이션 로직(`engine/beard_segmentation.py`)
이며, 판정은 과제 A가 만든 평가 하네스(`eval/run_nd_eval.py`)로 한다.

**이건 "숫자를 올리는" 과제가 아니라 "recall을 올리되 precision을 지키는" 과제다.**
precision을 무너뜨리며 recall만 올리는 변경은 실패다(임계만 낮추면 누구나 함).

## 절대 규칙 (위반 = 과제 실패)

1. **베이스라인을 먼저 고정하고 절대 덮어쓰지 말 것.** 첫 작업으로 현재 C1의 평가
   결과를 `outputs/nd_eval_baseline/`로 복사/재생성한다. 모든 개선은 이 베이스라인
   대비 델타로 보고한다.
2. **precision 게이트: union roi 어떤 최종 동작점에서도 mean precision ≥ 0.66**
   (베이스라인 0.70에서 0.04 이상 하락 금지). 이걸 깨면 그 변경은 채택 불가.
3. **엔진 계약·guard·다른 채널 인터페이스 불변.** `segment_beard` 시그니처, 반환
   `BeardMasks(hard, shadow, protect, stats)` 구조, stats 키 유지(추가는 허용, 삭제/개명 금지).
4. **평가 하네스(`eval/run_nd_eval.py`) 수정 금지** — 측정자를 바꾸면 델타가 무의미해진다.
   지표를 더 보고 싶으면 별도 분석 스크립트를 새로 만들 것.
5. **실패한 변경도 로그에 남길 것.** "시도 → 델타 → 채택/기각 사유"를 실험 로그에
   전부 기록. 채택 안 한 시도를 지우면 미완료로 간주한다.
6. 각 변경은 **파라미터·소규모 로직 한정.** 새 대형 의존성/모델 도입 금지(이 과제는
   결정론 C1 튜닝이지 학습 도입이 아니다). 학습형은 별도 후속 과제다.
7. `pytest` 29건 계속 통과 유지. 합성 테스트가 깨지면 그 변경은 회귀다.

## 환경 (검증된 사실 — 탐색 낭비 금지)

- 작업 디렉토리: `tools/beard-simulation-lab/`, Python `.venv/bin/python` (3.12, mediapipe==0.10.14 — 재설치 금지)
- 평가: `MPLCONFIGDIR="$PWD/.mplconfig" .venv/bin/python eval/run_nd_eval.py [--limit N]`
  → `outputs/nd_eval/{results.jsonl,summary.json,report.html}`. 재개 가능(기존 id skip)
  이므로 **재실행 전 `outputs/nd_eval/results.jsonl` 삭제 필수**(안 지우면 옛 예측이 남음).
- 튜닝 대상 코드 (전부 [engine/beard_segmentation.py](tools/beard-simulation-lab/engine/beard_segmentation.py)):
  - shadow 브랜치 L250~267: `_smoothstep(shadow_d0*0.55, shadow_d1*0.62, local_dist)` 등
    스무스스텝 edge들과 `blue_gray` 결합식 — **저강도 구간 감도가 여기서 잘림**
  - hard 브랜치 L239~248: `hard_small*0.75`, `density_gate` 계수 `0.45+0.75*`,
    `_component_filter` 후 `prior` 곱 `0.15+0.85*`
  - `segment_beard`의 기본 인자 `shadow_d0=2.2, shadow_d1=7.0, hard_percentile=99.0`,
    `blackhat_kernel_ratio=0.022`
- 근본 원인 가설 (과제 A 로그 기반):
  - shadow: local reference가 넓은 shadow의 중심부를 스스로 참조에 흡수 → 저강도
    shadow가 스무스스텝 하단(edge0)에서 0으로 잘림. → **edge 하향 + 넓은 영역 회복**
  - hard: GT가 영역 채움 라벨이라 가닥 검출과 granularity 불일치. hard 단독 recall은
    구조적으로 낮음 → hard는 무리해서 올리지 말고 **union 커버리지(주로 shadow)로 recall 확보**
- 참고: shadow-500 서브셋이 핵심. beardOnly(n=1577)는 GT가 영역 라벨이라 union으로만 의미.

## 접근 (측정 주도, 소단위 반복)

**핵심 전략: shadow recall을 올리되, "shadow 라벨 없는 얼굴에서 안 켜지는" 특이도를
동시에 봐야 precision이 안 무너진다.** 즉 강도(민감도)와 위치(비-수염 얼굴 억제)를
분리해 튜닝한다. 다음 후보들을 **하나씩** 적용→평가→델타 기록:

1. **shadow 저강도 구간 감도 회복** — `local_dist_score`/`darker`/`blue_gray`
   스무스스텝의 edge0(하단)을 낮춰 옅은 shadow를 확률적으로 살림. edge1은 유지해
   과검출 폭주 방지.
2. **local reference의 shadow 자기흡수 완화** — `_local_reference_lab`의 후보 luma_floor
   (현 42퍼센타일)/sigma를 조정해, 넓은 shadow가 자기 참조로 빨려 사라지는 걸 줄임.
3. **동작점(threshold) 재조정** — 평가상 thr 0.2가 유리했음. 단 이건 세그가 아니라
   **소비 측 임계**라, guard의 `confidence_floor`(현 0.3)와 stats 산정에 영향. 임계를
   내리면 protect 특이도가 떨어질 수 있으니 protect overlap 재확인 필수.
4. (선택) **shadow specificity 보강** — shadow 라벨 없는 얼굴에서의 오검출을 줄이는
   조건(예: 영역 연속성/최소 면적). precision 방어용.

각 후보는 독립 커밋 단위로 다루고, 조합은 개별 효과 확인 후에만.

## 실행 순서와 완료 증거

| # | 작업 | 완료 증거 (로그에 붙여넣기) |
|---|---|---|
| 0 | 이 문서를 `docs/beard-simulation/PLAN_C1_RECALL_TUNING_CODEX.md`로 저장 | 파일 존재 |
| 1 | 베이스라인 고정: results.jsonl 삭제 후 전량 재평가 → `outputs/nd_eval_baseline/`로 복사 | summary.json의 union roi thr0.3 P/R 수치 |
| 2 | 후보 1(shadow 저강도) 적용 → 전량 재평가 → 델타 표 | before/after IoU·P·R (union roi + shadow500) |
| 3 | 후보 2(local ref) 적용 → 재평가 → 델타 | 동일 표 |
| 4 | 후보 3(동작점) 검토 → 재평가 + **protect overlap 재확인** | 델타 + protect overlap 수치 |
| 5 | (필요시) 후보 4(specificity) | 델타 |
| 6 | 최종 조합 확정 → 전량 재평가 → 베이스라인 대비 최종 델타 | 최종 summary + 델타 |
| 7 | precision 게이트 검증: 최종 union roi mean P ≥ 0.66 | assert 명령 무출력 |
| 8 | pytest 29 passed + `git diff --stat` 확인 | 마지막 2줄 + diff stat |
| 9 | 실험 로그 작성(아래 템플릿 전 항목) + before/after report.html 병기 | — |

## 수용 기준 (Definition of Done — 전부 예)

- [ ] `outputs/nd_eval_baseline/` 고정본 존재, 모든 델타가 이 대비
- [ ] **union roi thr0.3 Recall: 베이스라인 0.28 → 목표 ≥ 0.38** (상대 +35% 이상)
- [ ] **shadow-500 shadow roi thr0.3 Recall: 0.16 → 목표 ≥ 0.24**
- [ ] **precision 게이트: union roi mean Precision ≥ 0.66 유지** (필수 — 안 지키면 실패)
- [ ] protect overlap 베이스라인 대비 악화 없음
- [ ] pytest 29 passed
- [ ] 실험 로그: 시도한 후보 전부(기각 포함) + 최종 델타 표 + before/after 관찰
- [ ] 절대 규칙 1~7 위반 없음

## 실험 로그 템플릿 (`docs/beard-simulation/EXPERIMENT_LOG_<날짜>_C1_RECALL_TUNING.md`)

```markdown
# C1 recall 튜닝 (날짜)
## 베이스라인 고정: 명령 + union roi/shadow500 P·R 표
## 후보별 시도: 각 후보마다 [변경 요약 / 델타 표 / 채택·기각 + 사유]
##   — 기각한 시도도 반드시 포함
## 최종 조합: 무엇을 채택했나 + 베이스라인 대비 최종 델타 표
## precision 게이트: 최종 P 수치 + 통과 여부
## protect overlap: before/after
## report.html before/after: worst였던 케이스가 개선됐나 (id 몇 개 육안)
## 남은 한계: recall 목표 미달 시 왜, 다음 후보(학습형 등) 제언 1줄
## SKIPPED: 없으면 "없음"
## 결론: 3줄 이내
```

## 검증 방법 (사람이 확인)

1. 로그의 델타 표에서 recall이 올랐고 precision이 게이트 위인가
2. report.html에서 과제 A worst 케이스(넓은 shadow 미검출)가 실제로 개선됐나
3. precision 게이트 assert가 통과하는가 (recall만 올리고 precision 버린 게 아닌지)

---

## 참고: 과제 A(완료) 요약 — 이 과제의 입력

과제 A는 완료됨. 산출물: `eval/run_nd_eval.py`, `engine/nd_annotations.py`,
`outputs/nd_eval/`, `docs/beard-simulation/EXPERIMENT_LOG_20260709_ND_EVAL.md`.
핵심 발견: C1 고precision·저recall / 어두운 피부 IoU 0.805(설계 검증) / ND GT는
영역 채움 라벨이라 hard 채널 직접 비교는 불리(union이 공정).
