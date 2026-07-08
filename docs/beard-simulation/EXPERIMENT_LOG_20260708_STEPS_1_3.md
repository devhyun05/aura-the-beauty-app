# 수염 레이저 제모 시뮬레이션 실험 기록 — Steps 1~3

작성일: 2026-07-08
저장소: `AURA-cosmetic-search-engine`
범위: `docs/제모시뮬레이션구현계획.md`의 다음 실험 스텝 1~3

## 요약

- Step 1 / Stage 1: C1 결정론 segmentation 스파이크를 로컬 실사진 6장으로 실행했다. 최종 산출 마스크 기준 `protectOverlap=0.0`으로 입술/콧구멍 보호 영역 침범은 제거됐지만, 계획 기준 10장 및 C2/C3 비교가 남아 게이트 ① 최종 판정은 보류다.
- Step 2 / Stage 2: TS 계약 + Python mirror 계약 검증을 통과했다. HEIC 샘플이 누락되지 않도록 랩 공용 이미지 로더를 추가했다.
- Step 3 / Stage 3: UI 없는 CLI 파이프라인을 PNG/HEIC 샘플로 실행했고 guard PASS 산출물을 생성했다.

## Step 1 / Stage 1: Segmentation 스파이크

실행:

```bash
cd tools/beard-simulation-lab
.venv/bin/python spike/run_spike.py
```

입력:

- 로컬 `samples/`의 동의 실사진 6장
- 형식: PNG, HEIC
- 계획 기준 10장에는 미달하므로 게이트 ① 최종 판정은 보류

산출물:

- `tools/beard-simulation-lab/outputs/spike/spike_grid.png`
- `tools/beard-simulation-lab/outputs/spike/spike_metrics.json`

C1 결과:

- 최종 산출 마스크 기준 `protectOverlap=0.0` 전 샘플
- 처리 시간: 장당 약 0.008~0.016초
- `hardMean`: 대략 0.0049~0.0116
- `shadowMean`: 대략 0.1550~0.6482

진단:

- `preProtectOverlap=0.8612~0.9930`
- protect 적용 전 shadow 후보가 입술 영역에도 강하게 반응한다.
- 최종 산출 마스크는 protect를 구조적으로 제거하지만, shadow 범위 튜닝은 Stage 6 이전 추가 확인이 필요하다.

C2/C3 상태:

- `torch`, `transformers`가 없어 선택 의존성 설치를 시도했다.
- 설치는 `OSError: [Errno 28] No space left on device`로 중단됐다.
- 디스크 공간 확보 후 아래 명령으로 재실행 필요:

```bash
cd tools/beard-simulation-lab
.venv/bin/python spike/run_spike.py --with-c2 --with-c3
```

게이트 ① 상태:

- 부분 진행
- C1 결정론 경로는 Stage 3 CLI 검증으로 이어갈 수 있다.
- C2/C3 비교와 10장 판정이 남아 최종 채택은 보류다.

## Step 2 / Stage 2: 계약 고정

계약 위치:

- `apps/mobile/src/features/beard-simulation/contracts/`
- `tools/beard-simulation-lab/engine/contracts.py`

변경:

- `tools/beard-simulation-lab/engine/image_io.py` 추가
- PNG/JPG와 iPhone HEIC/HEIF 입력을 공용 BGR 로더로 처리
- `spike/run_spike.py`, `pipeline.py`, `test_pipeline_smoke.py`가 같은 이미지 지원 범위를 보도록 정렬

검증:

```bash
npm run mobile:test:beard-simulation
```

결과:

```text
beard-simulation contract: 5 fixtures validated OK
```

랩 테스트:

```bash
cd tools/beard-simulation-lab
.venv/bin/python -m pytest -q
```

결과:

```text
22 passed, 3 warnings
```

주의:

- MediaPipe FaceMesh는 샌드박스 안에서 `NSOpenGLPixelFormat` 생성 실패가 있었다.
- 같은 테스트를 권한 상승 실행으로 재시도했을 때 통과했다.

## Step 3 / Stage 3: UI 없는 CLI 파이프라인

PNG 샘플 실행:

```bash
cd tools/beard-simulation-lab
.venv/bin/python cli.py "samples/IMG_4302 2.PNG"
```

결과:

- `mild` PASS, mitigations 없음
- `medium` PASS, mitigations 없음
- `strong` PASS, mitigations 없음

산출물:

- `tools/beard-simulation-lab/outputs/runs/run-20260708-214334-0e9fa4/`
- 주요 파일: `result.json`, `metrics.json`, `mask_*`, `result_mild.png`, `result_medium.png`, `result_strong.png`

HEIC 샘플 실행:

```bash
cd tools/beard-simulation-lab
.venv/bin/python cli.py samples/IMG_4467.HEIC --stages medium
```

결과:

- `medium` PASS, mitigations 없음

산출물:

- `tools/beard-simulation-lab/outputs/runs/run-20260708-214348-b412e1/`

## 다음 액션

1. 디스크 공간을 확보한다. 현재 선택 의존성 설치가 `No space left on device`로 실패했다.
2. 샘플을 계획 기준 10장까지 채운다.
3. `spike/run_spike.py --with-c2 --with-c3`를 재실행해 C1/C2/C3 비교 그리드를 만든다.
4. 게이트 ①에서 C1/C2 채택 또는 dense beard 차단 결정을 내린다.
