# 수염 제모 시뮬레이션 보완 실험 기록 - C2/C3 랩 비교

작성일: 2026-07-08

범위: 기존 C1 계획은 유지하고, C2(CLIPSeg prior)와 C3(face parsing probe)를 Mac 랩 비교 실험으로만 확인한다. 아이폰 온디바이스 후보는 C1 native 포팅으로 유지한다.

## 실행 요약

- C1은 변경하지 않고 현재 `spike_local_ref_c1_final` 기준선을 유지했다.
- `torch`, `transformers`만 설치했다.
- Hugging Face cache는 `tools/beard-simulation-lab/.hf-cache`로 고정했다.
- `insightface`, `onnxruntime`은 설치하지 않았다.
- 공간 부족이 발생하지 않아 삭제 작업은 하지 않았다.

## 의존성 및 공간

설치 전 확인:

- `torch`, `transformers`는 venv에 없었다.
- 설치 전 여유 공간은 약 6.1GiB였다.

설치:

```bash
tools/beard-simulation-lab/.venv/bin/python -m pip install --no-cache-dir torch transformers
```

설치 후 smoke:

```text
torch 2.12.1
transformers 5.13.0
```

실험 후 공간:

```text
df -h .: 4.0GiB available
tools/beard-simulation-lab/.venv: 1.7G
tools/beard-simulation-lab/.hf-cache: 577M
```

판단:

- 삭제는 하지 않았다. 설치와 모델 다운로드가 성공했기 때문에 안전정리 정책상 보존한다.
- `.hf-cache`는 C2/C3 중단 결정 시 삭제 가능한 실험 캐시다. 삭제해도 앱 빌드 속도에는 영향이 없고, C2/C3 첫 실행만 다시 느려진다.

## 멀티 에이전트 검토

Agent A - C1 hard/stubble precision:

- C1의 주된 남은 리스크는 hard/stubble이 일부 모공과 피부 텍스처를 같이 잡는 점이다.
- `stubbleDotMean`, `shortHairMean`은 최종 accepted mask가 아니라 진단 지표로 봐야 한다.
- 다음 C1 튜닝은 `protectOverlap <= 0.02`, clean/near-clean hard 오탐 상한, component keep ratio를 함께 봐야 한다.

Agent B - C2/C3 해석 기준:

- C2는 최종 결정권을 갖는 마스크가 아니라 coarse prior로만 써야 한다.
- C2가 입술/피부 쪽을 넓히면 제품 경로에서는 제외하고 참고용으로만 둔다.
- C3는 beard 전용 class가 아니라 face parsing의 hair class probe라서, 안정적으로 하관 수염만 잡지 못하면 종료 후보로 본다.

## 산출물

- 전체 그리드: `tools/beard-simulation-lab/outputs/spike_c1_c2_c3_compare_v1/spike_grid.png`
- 쉬운 요약 이미지: `tools/beard-simulation-lab/outputs/spike_c1_c2_c3_compare_v1/easy_before_after_summary.png`
- 지표 JSON: `tools/beard-simulation-lab/outputs/spike_c1_c2_c3_compare_v1/spike_metrics.json`
- `IMG_4534.HEIC` 파이프라인 확인:
  - `tools/beard-simulation-lab/outputs/c2_c3_compare_pipeline_check/run-20260708-230116-ce7250/`

## C1 vs C2 정량 결과

| Photo | C1 hard | C1 shadow | C1 preP | C2 hard | C2 shadow | C2 preP | C2 runtime | C3 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| IMG_4302 2.PNG | 0.0231 | 0.0265 | 0.0000 | 0.0302 | 0.0470 | 0.4467 | 52.286s | blocked: torchvision |
| IMG_4307.PNG | 0.0301 | 0.0114 | 0.0000 | 0.0303 | 0.0127 | 0.0000 | 4.639s | blocked: torchvision |
| IMG_4467.HEIC | 0.0248 | 0.0110 | 0.0000 | 0.0281 | 0.0199 | 0.0000 | 4.159s | blocked: torchvision |
| IMG_4468.HEIC | 0.0187 | 0.0049 | 0.0000 | 0.0188 | 0.0064 | 0.0000 | 4.041s | blocked: torchvision |
| IMG_4534.HEIC | 0.0118 | 0.1676 | 0.0000 | 0.0138 | 0.1772 | 0.0000 | 4.238s | blocked: torchvision |
| frame.PNG | 0.0316 | 0.0056 | 0.0000 | 0.0363 | 0.0057 | 0.0000 | 5.000s | blocked: torchvision |

주의:

- `IMG_4302 2.PNG`의 C2 `preProtectOverlap=0.4467`은 CLIPSeg prior가 보호영역 쪽으로 크게 번진 흔적이다. 최종 `protectOverlap`은 0으로 잘렸지만, C2를 최종 결정권자로 쓰면 위험하다.
- C2 첫 샘플 runtime 52.286s는 모델 다운로드/초기 로딩 비용이 포함된 값이다. 캐시 후 샘플은 약 4-5초다.
- C1은 샘플당 약 0.05-0.10초대라 모바일 native 포팅 후보로 유지할 수 있다.

## C2 판정

C2는 제품 경로에 직접 넣기에는 이득이 작고 비용이 크다.

- 좋은 점: 일부 사진에서 인중/턱 외곽 hard 또는 shadow를 조금 넓힌다.
- 나쁜 점: `IMG_4302 2.PNG`에서 pre-protect overlap이 크게 올라가, coarse prior가 입술/보호영역 근처로 번질 수 있음을 보였다.
- `IMG_4534.HEIC`에서 C1 shadow 0.1676이 C2 0.1772로 증가했다. 핵심 목표였던 shadow 과검출 축소 관점에서는 C2가 C1보다 낫지 않았다.

결론:

- C2는 dense beard 외곽 보강 가능성을 보는 랩 참고용 prior로만 보존한다.
- 현재 제품 후보 로직은 C1 유지가 맞다.
- C2를 켜더라도 최종 결정권은 C1이 가져야 한다.

## C3 판정

C3는 이번 계획의 설치 경계 안에서는 실행 완료하지 못했다.

에러:

```text
AutoImageProcessor requires the Torchvision library but it was not found in your environment.
```

판단:

- 최신 계획이 `torch`, `transformers`만 설치한다고 명시했기 때문에 `torchvision`은 설치하지 않았다.
- C3 자체를 판정하려면 최소 추가 의존성으로 `torchvision` 설치가 필요하다.
- 이번 결과 기준으로 C3는 "의존성 추가 없이는 실행 불가"로 기록한다.
- C3가 제품 후보라는 뜻은 아니다. 다음에 굳이 확인한다면 Mac 랩 falsification만 진행하고, 모바일 적용은 별도 Core ML 변환 가능성 검토로 분리해야 한다.

## 파이프라인 검증

`IMG_4534.HEIC`:

```text
mild    PASS  mitigations=-
medium  PASS  mitigations=-
strong  PASS  mitigations=-
analysis: {'beardType': 'shadow_dominant', 'densityScore': 0.031, 'shadowScore': 0.4194, 'regionCoverage': {'mustache': 0.0388, 'chin': 0.3437, 'mouth_side': 0.064, 'jaw': 0.3406}}
```

전체 랩 테스트:

```text
22 passed, 3 warnings
```

주의:

- 기본 샌드박스에서는 MediaPipe FaceMesh가 `NSOpenGLPixelFormat` 생성 실패로 실행되지 않았다.
- 권한 상승 실행에서는 같은 명령이 통과했다.

## 결론

이번 비교 실험은 C1 유지 결정을 강화한다.

- C1은 `IMG_4534.HEIC` shadow 목표인 0.20 근처를 유지했다: 0.1676.
- C2는 C1보다 일관되게 좋은 후보가 아니라, 약간 확장하는 coarse prior다.
- C3는 `torchvision` 없이는 실행되지 않았고, 이번 계획의 의존성 제한 안에서는 종료/보류 상태다.
- 다음 구현은 C2/C3 확장이 아니라 C1 hard/stubble precision과 C1 기반 보정 연결에 집중하는 것이 맞다.

## 다음 스텝

1. C1 hard/stubble clean 오탐 상한을 추가한다.
2. component density와 keep ratio를 조여 모공성 점 오탐을 줄인다.
3. shadow-only 영역은 blue-gray suppression으로 연결한다.
4. hard 영역은 제한적 texture attenuation/inpaint만 적용한다.
5. C3를 더 보려면 별도 승인 후 `torchvision`만 추가 설치해서 Mac 랩 falsification으로 한 번 더 돌린다.

## 2026-07-09 Addendum - 리뷰 반영 정정

- C2 runtime `4-5s/장` 해석은 과장으로 정정한다. 기존 spike는 `clipseg_beard_prior`가 사진마다 processor/model을 `from_pretrained`로 다시 로드했기 때문에 loader 비용이 섞였다.
- 2026-07-09 follow-up에서 module-level cache를 넣은 뒤 raw CLIPSeg는 첫 call `10.961s` 이후 약 `0.190-0.206s/장`으로 측정됐다.
- 따라서 C2 제외/보류 근거는 비용이 아니라 품질/안전성이다. raw prior가 입술/protect/얼굴 경계에도 반응했고, `IMG_4302 2.PNG`에서 C2 full은 `preProtectOverlap=0.4477`까지 올라갔다.
- 같은 follow-up에서 mustache+chin 제한 prior를 적용하면 `IMG_4302 2.PNG` preProtect가 `0.0000`으로 내려갔다. C2를 다시 검토하더라도 전역 prior가 아니라 제한 prior로만 봐야 한다.
- 기존 C2 지표는 C1-fusion 결과이고 raw CLIPSeg probe와 목적이 다르다. 두 지표를 같은 의미로 비교하지 않는다.
- C3는 별도 C3 face parsing 로그에서 실행 및 기각 완료됐다.
