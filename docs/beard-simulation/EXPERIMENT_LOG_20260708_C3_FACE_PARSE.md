# 수염 제모 시뮬레이션 보완 실험 기록 - C3 Face Parsing

작성일: 2026-07-08

범위: C3 후보인 face parsing(SegFormer CelebAMask-HQ)의 `hair` class가 하관 수염을 유의미하게 잡는지 확인한다. 제품 적용 후보 검증이 아니라 빠른 falsification 실험이다.

## 변경 및 설치

- `torchvision 0.27.1`을 추가 설치했다.
- `torch`, `transformers`는 기존 설치 유지:
  - `torch 2.12.1`
  - `transformers 5.13.0`
- `tools/beard-simulation-lab/spike/run_spike.py`의 C3 loader를 수정했다.
  - 실패: `AutoImageProcessor.from_pretrained("jonathandinu/face-parsing")`
  - 수정: `SegformerImageProcessor.from_pretrained("jonathandinu/face-parsing")`
- `tools/beard-simulation-lab/requirements-extras.txt`에 C3가 `torchvision`을 요구한다는 내용을 반영했다.

## 실행

```bash
cd tools/beard-simulation-lab
MPLCONFIGDIR="$PWD/.mplconfig" .venv/bin/python spike/run_spike.py \
  --out outputs/spike_c3_face_parse_v2 \
  --with-c3
```

산출물:

- `tools/beard-simulation-lab/outputs/spike_c3_face_parse_v2/spike_grid.png`
- `tools/beard-simulation-lab/outputs/spike_c3_face_parse_v2/easy_c3_summary.png`
- `tools/beard-simulation-lab/outputs/spike_c3_face_parse_v2/spike_metrics.json`

## 정량 결과

| Photo | C1 hard | C1 shadow | C3 runtime | C3 hair coverage |
|---|---:|---:|---:|---:|
| IMG_4302 2.PNG | 0.0231 | 0.0265 | 39.064s | 0.0125 |
| IMG_4307.PNG | 0.0301 | 0.0114 | 3.138s | 0.0123 |
| IMG_4467.HEIC | 0.0248 | 0.0110 | 3.231s | 0.0117 |
| IMG_4468.HEIC | 0.0187 | 0.0049 | 3.107s | 0.0088 |
| IMG_4534.HEIC | 0.0118 | 0.1676 | 3.106s | 0.0397 |
| frame.PNG | 0.0316 | 0.0056 | 3.201s | 0.0000 |

주의:

- 첫 샘플 runtime 39.064s는 모델 다운로드/초기 로딩 비용이 포함된 값이다.
- 캐시 후 runtime은 약 3.1-3.2s/장이다.
- Hugging Face cache는 `tools/beard-simulation-lab/.hf-cache`에 저장된다.

## 시각 판정

C3 `hair` class는 하관 수염을 안정적으로 잡지 못했다.

- `IMG_4302 2.PNG`: 입술/protect 영역 안쪽에 강한 반응이 생김.
- `IMG_4307.PNG`: 하관 수염보다 얼굴 양옆 머리카락/경계 쪽 반응이 더 두드러짐.
- `IMG_4467.HEIC`: 입술 안쪽에 작은 반응, 왼쪽 머리카락/경계 반응.
- `IMG_4468.HEIC`: 수염 영역은 거의 못 잡고 오른쪽 머리카락/경계에 반응.
- `IMG_4534.HEIC`: coverage는 가장 높지만, 입술/protect 영역과 측면 머리카락 반응이 섞임.
- `frame.PNG`: 하관 수염 후보를 거의 잡지 못함.

## 공간

실행 후 대략 상태:

```text
tools/beard-simulation-lab/.hf-cache: 900M
tools/beard-simulation-lab/.venv: 1.7G
df -h .: 3.5GiB available
```

삭제는 하지 않았다. C3 모델 캐시는 실험 캐시이며, C3 종료 결정 시 앱 빌드 속도 영향 없이 삭제 가능하다.

## 검증

```text
py_compile run_spike.py: PASS
full lab tests: 22 passed, 3 warnings
```

## 결론

C3는 기각한다.

- C3 face parsing의 `hair` class는 beard 전용이 아니다.
- 이번 샘플에서는 하관 수염보다 입술/protect 영역, 얼굴 측면 머리카락, 배경/경계 쪽 반응이 더 문제다.
- C3는 C1을 보강하는 prior로도 현재는 가치가 낮다.
- 제품 후보는 계속 C1이며, C2는 인중/턱 제한 prior로만 추가 실험 가치가 있다.

## 2026-07-09 Addendum - 보충 세션 반영

- C3 기각 판단은 유지한다.
- 2026-07-09 보충 세션에서는 C3를 더 진행하지 않았다.
- 디스크 여유 공간이 400MiB대까지 줄어든 상태였고, C3는 기각된 실험 캐시였기 때문에 `tools/beard-simulation-lab/.hf-cache/hub/models--jonathandinu--face-parsing`와 해당 lock만 삭제했다.
- 이 삭제는 앱 빌드 속도와 현재 C1/C2 비교에는 영향을 주지 않는다. C3를 다시 돌리려면 해당 Hugging Face 모델을 다시 다운로드해야 한다.
