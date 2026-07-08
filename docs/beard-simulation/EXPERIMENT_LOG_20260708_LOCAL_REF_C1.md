# 수염 제모 시뮬레이션 보완 실험 기록 — Local C1 재실험

작성일: 2026-07-08

범위: `레이저제모_보완계획서.md`와 후속 대화에서 "채택" 또는 "다음 실험"으로 남은 항목 중, 계약 교체/SAM2/커스텀 학습처럼 명시적으로 보류된 항목을 제외한 C1 개선안 전체.

## 시도한 항목

1. 하관 local 피부 기준
   - 이마/윗볼 단일 기준 대신 하관 crop 안의 clean 후보 픽셀로 Lab local reference field를 생성.
   - 어두움만 보지 않고 blue-gray 방향성을 함께 gate.

2. 멀티스케일 hair 탐지
   - small / medium / large black-hat 커널을 분리.
   - `hardHair` 계약은 유지하면서 내부 지표로 `stubbleDotMean`, `shortHairMean` 기록.

3. connected component 후처리
   - hard 후보의 작은 고립 잡음을 줄이기 위해 component size/shape 필터 적용.
   - spike metrics에 `hardComponentKept / hardComponentCount` 기록.

4. 6장 spike 재판정
   - 채널별 그리드: `crop | C1 hard | C1 shadow | C1 union | C2 | C3`.
   - 채널별 coverage와 local reference 지표를 JSON으로 저장.

5. C2/C3 실행 시도
   - `--with-c2 --with-c3`를 켜고 실행.
   - 현재 venv에 `torch`, `transformers`가 없어 둘 다 실행 불가로 기록됨.

6. 난이도 높은 샘플 파이프라인 확인
   - `IMG_4534.HEIC`를 mild/medium/strong 전체 파이프라인으로 실행.
   - 모든 stage guard PASS.

## 명시적으로 시도하지 않은 항목

- Stage 2 계약 교체: 이전 검토에서 반려. v1 계약 불변 유지.
- Stage 0~9 전체 재실행: 이미 구축/검증 완료로 판단되어 이번 범위에서 제외.
- SAM2, 커스텀 학습형 segmenter: 이전 검토에서 "지금 시작 금지"로 보류.
- batch 30장: 현재 동의 샘플이 6장뿐이라 실행 불가.
- clean-face prior: 이전 검토에서 제외하기로 한 항목.

## 코드 변경

- `tools/beard-simulation-lab/engine/beard_segmentation.py`
  - local lower-face Lab reference field 추가
  - blue-gray shadow gate 추가
  - multiscale black-hat 추가
  - hard component filter 추가
  - `stubbleDotMean`, `shortHairMean`, `shadowBlueGrayMean`, region별 hard/shadow coverage stats 추가

- `tools/beard-simulation-lab/spike/run_spike.py`
  - 채널별 C1 hard/shadow/union 타일 출력
  - coverage/컴포넌트/local-ref/stubble metrics JSON 출력
  - C2/C3 missing 상태를 명시적으로 metrics에 남김

## 산출물

- 기준선:
  - `tools/beard-simulation-lab/outputs/spike/spike_grid.png`
  - `tools/beard-simulation-lab/outputs/spike/spike_metrics.json`

- 최종 재실험:
  - `tools/beard-simulation-lab/outputs/spike_local_ref_c1_final/spike_grid.png`
  - `tools/beard-simulation-lab/outputs/spike_local_ref_c1_final/spike_metrics.json`

- `IMG_4534.HEIC` 파이프라인 확인:
  - `tools/beard-simulation-lab/outputs/local_ref_pipeline_check/run-20260708-223514-6c9956/`

## 정량 결과

| Photo | Shadow base | Shadow final | Shadow delta | Hard base | Hard final | Dot | Line | Kept comps | C2/C3 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| IMG_4302 2.PNG | 0.4521 | 0.0265 | -0.4256 | 0.0069 | 0.0231 | 0.0246 | 0.0650 | 58/204 | missing/missing |
| IMG_4307.PNG | 0.1550 | 0.0114 | -0.1436 | 0.0058 | 0.0301 | 0.0267 | 0.0742 | 59/145 | missing/missing |
| IMG_4467.HEIC | 0.2338 | 0.0110 | -0.2228 | 0.0089 | 0.0248 | 0.0633 | 0.0190 | 117/266 | missing/missing |
| IMG_4468.HEIC | 0.4947 | 0.0049 | -0.4898 | 0.0081 | 0.0187 | 0.0690 | 0.0151 | 189/593 | missing/missing |
| IMG_4534.HEIC | 0.6482 | 0.1676 | -0.4806 | 0.0049 | 0.0118 | 0.0165 | 0.0263 | 29/122 | missing/missing |
| frame.PNG | 0.5223 | 0.0056 | -0.5167 | 0.0116 | 0.0316 | 0.0350 | 0.0782 | 187/385 | missing/missing |

## 관찰

- 하관 전체 shadow 과검출은 크게 줄었다. 특히 `IMG_4534.HEIC`는 `shadowMean 0.6482 -> 0.1676`, `frame.PNG`는 `0.5223 -> 0.0056`.
- `IMG_4534.HEIC`는 전체 shadow는 줄었지만, `chin=0.3299`, `jaw=0.3359`로 실제 blue-gray가 강한 턱/하악 영역에는 남는다. 목표치였던 전체 `shadowMean < 0.35`는 통과.
- hard 민감도는 전반적으로 상승했다. 기존 `hardMean 0.0049~0.0116`에서 최종 `0.0118~0.0316`.
- component filter가 일부 모공성 후보를 제거했다. 예: `IMG_4534.HEIC`는 `29/122`, `IMG_4302 2.PNG`는 `58/204`만 유지.
- 시각 확인상 hard 채널은 여전히 일부 피부 텍스처/모공에 반응한다. 다만 첫 개선판보다 줄었고, 다음 튜닝은 hard threshold/component density를 더 조이는 방향이 적합하다.
- C2/C3는 실제로 시도했지만 선택 의존성 부재로 실행되지 않았다.
  - C2: `CLIPSeg prior requires extras: pip install torch transformers`
  - C3: `No module named 'torch'`

## 검증

```bash
cd tools/beard-simulation-lab
.venv/bin/python -m py_compile engine/beard_segmentation.py spike/run_spike.py
.venv/bin/python -m pytest -q tests/test_masks_and_correction.py
MPLCONFIGDIR="$PWD/.mplconfig" .venv/bin/python -m pytest -q
```

결과:

```text
tests/test_masks_and_correction.py: 5 passed
full lab tests: 22 passed, 3 warnings
```

주의:

- 기본 샌드박스에서는 MediaPipe FaceMesh가 `NSOpenGLPixelFormat` 생성 실패로 샘플 테스트/스파이크를 실행하지 못했다.
- 권한 상승 실행에서는 동일 코드가 통과했다.

## 결론

이번 실험의 핵심 가설인 "하관 local reference가 하관 전체 shadow 과검출을 줄인다"는 6장 샘플에서 지지된다.

다음 단계는 C2/C3가 아니라, 현재 C1 결과를 기준으로 hard 모공 오탐을 조금 더 줄인 뒤 보정 쪽을 다시 보는 것이다. 특히 shadow는 이제 넓은 inpaint보다 blue-gray 색 방향 억제 보정으로 연결하는 편이 맞다.
