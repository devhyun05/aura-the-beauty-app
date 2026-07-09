# 과제 A: ND 데이터셋 외부 평가 — C1 세그멘테이션 IoU 측정 (Codex 실행용)

> **이 문서는 Codex가 실행할 작업 지시서다.** 승인 후 첫 작업으로 이 문서를
> `docs/beard-simulation/PLAN_ND_EVAL_CODEX.md`에 그대로 저장하고 시작하라.

## Context

C1 결정론 수염 세그멘테이션(로컬 피부 기준 + 멀티스케일 black-hat)은 자체 6장 스파이크에서 "하관 전체 과검출 해소"까지 검증됐지만, **recall(잡아야 할 것을 잡는가)은 한 번도 측정된 적 없다** — 정답 라벨이 없었기 때문. 이제 Notre Dame FG2025 라벨(2,350장: beard 1,857 / mustache 1,649 / shadow 500)과 CelebAMask-HQ 원본 이미지를 확보했으므로, **C1을 있는 그대로 제3자 정답에 대고 IoU/precision/recall을 측정한다.**

**이 과제의 목적은 측정이지 개선이 아니다.** IoU가 낮게 나와도 그것이 유효한 결과다. 수치를 좋게 만들려는 어떤 시도도 스코프 위반이다.

## 절대 규칙 (위반 = 과제 실패)

1. **`engine/` 디렉토리의 어떤 파일도 수정 금지.** 평가 대상은 현재 커밋된 C1 그대로다. 완료 시 `git diff --stat engine/`가 빈 출력이어야 한다.
2. **전량 2,350장 처리 필수.** 서브셋으로 끝내는 것 금지. 아래 정합성 등식이 성립해야 한다:
   `processed + gate_rejected + load_failed == 2350`
3. **나쁜 결과 숨기기 금지.** worst-10 시각화는 best-10과 동급 필수 산출물이다.
4. **막히면 침묵하지 말 것.** 해결 못 하는 단계는 실험 로그에 `SKIPPED: <이유>`로 명시하고 다음 단계 진행. 조용히 생략하면 미완료로 간주된다.
5. 외부 데이터는 **비상업 연구 전용** — `external/` 밖으로 복사 금지, git 커밋 금지 (이미 gitignore됨). 결과물 중 커밋 가능한 것은 코드·로그 문서·요약 수치뿐.

## 환경 (검증된 사실 — 탐색으로 시간 낭비하지 말 것)

- 작업 디렉토리: `tools/beard-simulation-lab/` (모든 명령은 여기서)
- Python: `.venv/bin/python` (3.12, mediapipe==0.10.14 — **재설치·업그레이드 금지**)
- ND 라벨: `external/facial_hair_annotations/<id>/` — 로더가 이미 있다: [engine/nd_annotations.py](tools/beard-simulation-lab/engine/nd_annotations.py)의 `list_annotation_ids()`, `load_annotation()`, `to_engine_channels()`. **직접 PNG 파싱 재구현 금지** (색→클래스 매핑이 폴더별 서수라 함정 있음 — 로더가 처리함)
- 원본 이미지: `external/CelebAMask-HQ/CelebA-HQ-img/<id>.jpg` (30,000장, 1024×1024 — ND 폴더명과 id 직접 매칭)
- 재사용할 기존 함수 (재구현 금지):
  - `engine.detect_face.detect_face(bgr)` → FaceDetection(quality 게이트 포함) 또는 None
  - `engine.lower_face_roi.build_lower_face_crop(bgr, landmarks, face_width, face_height)` → LowerFaceCrop (bbox 필드로 crop→full 좌표 복원)
  - `engine.lower_face_roi.skin_reference_pixels`, `engine.beard_segmentation.fit_skin_model`, `segment_beard(crop, skin_model)` → BeardMasks(hard/shadow, crop 좌표)
- 참고 패턴: [spike/run_spike.py](tools/beard-simulation-lab/spike/run_spike.py) (이미지 순회·오버레이), [batch/run_batch.py](tools/beard-simulation-lab/batch/run_batch.py) (HTML 리포트)
- 테스트: `MPLCONFIGDIR="$PWD/.mplconfig" .venv/bin/python -m pytest -q` → 현재 **29 passed** (샌드박스에서 FaceMesh가 NSOpenGL 오류 나면 권한 상승 셸에서 실행)

## 구현: 새 파일 1개 — `eval/run_nd_eval.py`

### 흐름 (id별)

```
id → cv2.imread(external/CelebAMask-HQ/CelebA-HQ-img/<id>.jpg)
   → 로드 실패 → load_failed 기록, 다음
   → detect_face() → None 또는 quality.passed=False → gate_rejected(사유 포함) 기록, 다음
   → build_lower_face_crop → segment_beard
   → pred hard/shadow를 1024² 전체 프레임 캔버스에 복원 (crop.bbox 사용, 밖은 0)
   → GT = to_engine_channels(load_annotation(id))  # hard=beard∪mustache, shadow=shadow
   → 지표 계산 → results.jsonl에 즉시 append (중단 대비 재개 가능하게: 이미 있는 id는 skip)
```

### 지표 (교차 조합 전부)

- 채널 3종: `hard` vs GT hard / `shadow` vs GT shadow / `union` vs GT union
- threshold 4종: pred > {0.2, 0.3, 0.4, 0.5} 이진화
- 스코프 2종:
  - `full`: 1024² 전체에서 비교
  - `roi`: 우리 editable 영역(roi_mask×(1−protect)을 full 캔버스로 복원) 안으로 GT·pred 모두 제한 — 사이드번 등 by-design 제외 영역의 페널티를 분리하기 위함
- 각 조합마다 IoU, precision, recall (분모 0이면 null)

### CLI

```bash
.venv/bin/python eval/run_nd_eval.py --limit 20   # smoke (필수 선행)
.venv/bin/python eval/run_nd_eval.py              # 전량 2350
```

### 산출물 (경로 고정 — 전부 존재해야 완료)

```text
outputs/nd_eval/results.jsonl          # id별 지표 + 상태(processed/gate_rejected/load_failed)
outputs/nd_eval/summary.json           # 아래 필수 키 참조
outputs/nd_eval/report.html            # best10 + worst10 (union IoU, roi 스코프, thr 0.3 기준)
                                       #   각 행: 원본 | GT 오버레이(초록) | pred 오버레이(빨강) | 교집합(노랑)
docs/beard-simulation/EXPERIMENT_LOG_<날짜>_ND_EVAL.md   # 아래 템플릿 전 항목 기입
```

`summary.json` 필수 키: `total(=2350)`, `processed`, `gateRejected`(사유별 카운트 dict), `loadFailed`, `reconciliationOk`(bool — 등식 검증 결과), `perChannel`(채널×threshold×스코프별 mean/median IoU·P·R), `subsets`(shadow 라벨 보유 500장 / beard-only / mustache-only 별 요약), `runtimeSec`.

## 실행 순서와 완료 증거 (각 단계마다 로그 문서에 증거 붙일 것)

| # | 작업 | 완료 증거 (로그에 붙여넣기) |
|---|---|---|
| 0 | 이 문서를 `docs/beard-simulation/PLAN_ND_EVAL_CODEX.md`로 저장 | 파일 존재 |
| 1 | `eval/run_nd_eval.py` 작성 | — |
| 2 | smoke: `--limit 20` 실행 | 터미널 출력 마지막 10줄 |
| 3 | smoke 결과 육안 확인: report.html의 오버레이가 GT·pred 위치가 상식적인가 (pred가 전부 0이거나 전체 화면이면 좌표 복원 버그 — bbox 복원 재확인) | 확인 문장 1줄 + 이상 시 수정 내역 |
| 4 | 전량 실행 (20~60분 예상; nohup/백그라운드 권장) | 종료 코드 + runtimeSec |
| 5 | 정합성 검증: `python -c "import json; s=json.load(open('outputs/nd_eval/summary.json')); assert s['reconciliationOk'] and s['total']==2350, s"` | 명령과 무출력(성공) 붙여넣기 |
| 6 | `git diff --stat engine/` 빈 출력 확인 | 붙여넣기 |
| 7 | 전체 pytest 29 passed 유지 | 마지막 2줄 붙여넣기 |
| 8 | 실험 로그 작성 (아래 템플릿 **전 항목**) | — |

## 실험 로그 템플릿 (항목 하나라도 비면 미완료)

```markdown
# ND 외부 평가 — C1 IoU 측정 (날짜)
## 실행 요약: 명령 / 소요 시간 / processed·gateRejected·loadFailed 수치
## 정합성: 등식 성립 여부 + summary.json 해당 부분 인용
## 게이트 거부 분석: 사유별 카운트 표 + 가장 많은 사유 1줄 해석
## 채널별 결과 표: (hard/shadow/union) × (0.2/0.3/0.4/0.5) × (full/roi) — IoU·P·R
## shadow-500 서브셋 결과: 별도 표 (우리 핵심 채널)
## best10/worst10 관찰: worst 공통 패턴 3가지 이상 서술 (필수 — 여기가 다음 튜닝의 입력)
## 우리 6장 스파이크와의 괴리: recall 관점에서 새로 알게 된 것
## 한계: ROI 밖 GT 비율, 도메인 차이(유명인/조명), 라벨 거칠기
## SKIPPED 항목: 없으면 "없음"이라고 명시
## 결론: 3줄 이내 — 측정 결과가 말해주는 것만 (개선 제안은 별도 1줄까지)
```

## Definition of Done (전부 예여야 완료 선언 가능)

- [ ] 산출물 4개 경로 전부 존재
- [ ] summary.json: `total==2350`, `reconciliationOk==true`
- [ ] report.html에 best10 + **worst10** 모두 포함
- [ ] `git diff --stat engine/` 빈 출력
- [ ] pytest 29 passed
- [ ] 실험 로그 템플릿 10개 섹션 전부 기입 (빈칸·"TODO" 없음)
- [ ] 절대 규칙 1~5 위반 없음

## 검증 방법 (사람이 확인할 것)

1. 로그 문서만 읽고 실험 전체가 재구성되는가
2. report.html worst10에서 실패 패턴이 실제로 보이는가
3. summary.json의 shadow-500 recall — 이 숫자 하나가 이번 과제의 핵심 결과물
