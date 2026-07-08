# 수염 제모 시뮬레이션 보충 실험 기록 - 리뷰 반영 C1 안전성/recall

작성일: 2026-07-09

범위: 2026-07-08 C1/C2/C3 스파이크 리뷰에서 지적된 3개 리스크를 보정 연결 전에 닫는다. 제품 후보는 계속 C1이며, C2는 Mac lab 비교용, C3는 기각 유지다. 모바일 v1 계약은 변경하지 않았다.

## 리뷰에서 반영한 사항

1. preProtect 관문 복원
   - 최종 persisted mask의 `protectOverlapRatio`는 안전 지표로 유지했다.
   - raw candidate가 protect 영역에 크게 걸치는 경우를 잡기 위해 `preProtectOverlapRatio > 0.30`이면 pipeline을 `guard:mask_preprotect_overlap`로 reject하도록 추가했다.
   - spike metrics에는 `protectOverlap`과 `preProtectOverlap`을 모두 남긴다.
   - 결론에서 `protectOverlap=0`만으로 "세그멘테이션이 안전하다"고 과해석하지 않도록 수정한다.

2. 턱선 실루엣 hard 오탐 제거
   - `_component_filter`에서 lower-face ROI 경계 band를 만들고, elongated component가 이 band와 `>= 0.55` 겹치면 hard 후보에서 제외한다.
   - 제외 수를 `hardBoundaryComponentDropped`로 기록한다.

3. 인중 protect 비대칭 팽창
   - lip protect dilation은 유지하되, upper-lip 방향 확장은 `0.018 * face_width`까지만 허용했다.
   - 아래/좌우 방향 protect는 기존 수준을 유지해서 입술 침범 zeroing은 유지했다.
   - region별 편집 가능 면적을 `regionEditableArea`로 추가했다.

4. C2 결론 보정
   - `clipseg_beard_prior`가 processor/model을 매 호출마다 로드하지 않도록 module-level cache를 추가했다.
   - C2 제외 근거는 "runtime이 너무 커서"가 아니라 "raw prior가 입술/protect/얼굴 경계에도 강하게 반응해 단독 또는 전역 prior로 위험하다"로 수정한다.
   - `C1`, `Raw CLIPSeg`, `C2 full`, `C2 mustache+chin restricted`를 나란히 비교했다.

5. recall proxy 추가
   - 현재 6장에 대해 local-only coarse label JSON을 만들었다.
   - 좌표계는 lower-face crop normalized `xyxy`이고, `mustache`와 `chin` 사각형만 포함한다.
   - 개인 사진 파생물이므로 output artifact로만 두며 커밋 대상이 아니다.

## 코드 변경

- `tools/beard-simulation-lab/engine/beard_segmentation.py`
  - ROI boundary band 기반 elongated component drop 추가
  - `hardBoundaryComponentDropped`, `regionEditableArea` metrics 추가
  - CLIPSeg processor/model module-level cache 추가

- `tools/beard-simulation-lab/engine/lower_face_roi.py`
  - lip protect의 upper-lip 방향 팽창 cap 추가

- `tools/beard-simulation-lab/engine/pipeline.py`
  - `preProtectOverlapRatio > 0.30` guard 추가

- `tools/beard-simulation-lab/spike/run_spike.py`
  - `--labels` 옵션 추가
  - coarse label recall metrics 추가
  - C1 grid에 `preP`와 boundary drop count 표시

- `tools/beard-simulation-lab/spike/run_c2_restricted_spike.py`
  - C2 raw/full/mustache+chin restricted 비교 spike 추가

- `tools/beard-simulation-lab/tests/test_masks_and_correction.py`
  - boundary elongated component drop test 추가
  - asymmetric lip protect test 추가
  - CLIPSeg cached loader test 추가

- `tools/beard-simulation-lab/tests/test_geometry_guard.py`
  - pipeline preProtect reject test 추가

## 산출물

- C1 follow-up grid:
  - `tools/beard-simulation-lab/outputs/spike_review_followup_c1_v1/spike_grid.png`
  - `tools/beard-simulation-lab/outputs/spike_review_followup_c1_v1/spike_metrics.json`

- C2 restricted comparison:
  - `tools/beard-simulation-lab/outputs/spike_review_followup_c2_restricted_v1/spike_grid.png`
  - `tools/beard-simulation-lab/outputs/spike_review_followup_c2_restricted_v1/spike_metrics.json`

- local-only coarse label:
  - `tools/beard-simulation-lab/outputs/review_followup_coarse_labels_20260709.json`

- `IMG_4534.HEIC` pipeline check:
  - `tools/beard-simulation-lab/outputs/review_followup_pipeline_check/run-20260709-010653-3e1fee/`

## C1 follow-up 정량 결과

| Photo | hard | shadow | preProtect | boundary drop | mustache recall | chin recall | mustache editable |
|---|---:|---:|---:|---:|---:|---:|---:|
| IMG_4302 2.PNG | 0.0231 | 0.0265 | 0.0000 | 0 | 0.0374 | 0.0754 | 0.1375 |
| IMG_4307.PNG | 0.0253 | 0.0112 | 0.0000 | 3 | 0.0298 | 0.0320 | 0.1252 |
| IMG_4467.HEIC | 0.0248 | 0.0110 | 0.0000 | 2 | 0.0030 | 0.0542 | 0.1122 |
| IMG_4468.HEIC | 0.0176 | 0.0049 | 0.0000 | 6 | 0.0004 | 0.0218 | 0.1322 |
| IMG_4534.HEIC | 0.0107 | 0.1676 | 0.0000 | 2 | 0.0031 | 0.2518 | 0.0552 |
| frame.PNG | 0.0315 | 0.0056 | 0.0000 | 4 | 0.1066 | 0.0093 | 0.1155 |

요약:

- `IMG_4534.HEIC` shadow는 `0.1676`으로 기존 목표 `<= 0.20` 근처를 유지했다.
- boundary drop은 총 17개였고, 6장 중 5장에서 턱선/ROI 경계 elongated 후보가 제거됐다.
- `preProtectOverlap`은 C1 follow-up 6장 모두 0.0이다.
- 인중 recall은 여전히 낮은 샘플이 많다. 이번 변경은 protect가 인중을 먹는지 측정 가능하게 만들었지만, recall 문제를 완전히 해결했다고 보기는 어렵다.
- `IMG_4307.PNG`은 shadowMean `0.0112`로 낮아, 리뷰 지적처럼 shadow recall 저하 후보로 계속 별도 관찰이 필요하다.

## C2 restricted 비교 결과

| Photo | Raw CLIPSeg runtime | Raw protect mean | C2 full preProtect | C2 M+C preProtect | C2 full mustache recall | C2 M+C mustache recall |
|---|---:|---:|---:|---:|---:|---:|
| IMG_4302 2.PNG | 10.961s | 0.4733 | 0.4477 | 0.0000 | 0.0938 | 0.0878 |
| IMG_4307.PNG | 0.190s | 0.0975 | 0.0000 | 0.0000 | 0.0298 | 0.0298 |
| IMG_4467.HEIC | 0.196s | 0.2143 | 0.0000 | 0.0000 | 0.0030 | 0.0030 |
| IMG_4468.HEIC | 0.194s | 0.0705 | 0.0000 | 0.0000 | 0.0004 | 0.0004 |
| IMG_4534.HEIC | 0.195s | 0.1091 | 0.0000 | 0.0000 | 0.0031 | 0.0031 |
| frame.PNG | 0.206s | 0.1947 | 0.0000 | 0.0000 | 0.1785 | 0.1778 |

판단:

- 첫 CLIPSeg call `10.961s`는 cold model load가 포함된 값이다.
- module-level cache 이후 raw CLIPSeg inference는 이 샘플에서 약 `0.190-0.206s/장`이다.
- `IMG_4302 2.PNG`에서 C2 full은 `preProtectOverlap=0.4477`로 위험하지만, mustache+chin 제한을 걸면 `0.0000`으로 내려간다.
- 그래도 raw CLIPSeg heatmap은 입술/protect/얼굴 경계 반응이 남아 있어, 제품 경로에서 단독 prior나 전역 prior로 쓰기에는 위험하다.

## 파이프라인 검증

`IMG_4534.HEIC`:

```text
mild    PASS  mitigations=-
medium  PASS  mitigations=-
strong  PASS  mitigations=-
analysis: {'beardType': 'shadow_dominant', 'densityScore': 0.0286, 'shadowScore': 0.4194, 'regionCoverage': {'mustache': 0.0239, 'chin': 0.3436, 'mouth_side': 0.064, 'jaw': 0.3406}}
```

## 테스트

```text
tests/test_masks_and_correction.py + tests/test_geometry_guard.py: 19 passed
full lab tests: 26 passed, 3 warnings
```

주의:

- 기본 sandbox에서는 MediaPipe FaceMesh가 `NSOpenGLPixelFormat` 생성 실패로 smoke test를 실행하지 못했다.
- macOS OpenGL 접근으로 재실행하면 full lab tests는 통과했다.

## 공간 관리

- 실험 전후로 여유 공간이 계속 부족했다.
- 보충 실험 중 앱 빌드 속도에 영향이 적고 C3 기각 상태에서 재생성 가능한 C3 face parsing Hugging Face cache만 삭제했다.
- 삭제한 항목:
  - `tools/beard-simulation-lab/.hf-cache/hub/models--jonathandinu--face-parsing`
  - `tools/beard-simulation-lab/.hf-cache/hub/.locks/models--jonathandinu--face-parsing`
- 유지한 항목:
  - CLIPSeg cache
  - 현재 실험 outputs
  - 사용자 사진/소스/문서
  - 현재 repo DerivedData 및 앱 빌드 관련 cache

실험 후 대략 상태:

```text
df -h .: 377MiB available
tools/beard-simulation-lab/.hf-cache: 577M
```

## 2026-07-09 Cleanup - C2/C3 실험 의존성 제거

보충 실험 후 C2/C3를 제품 후보로 유지하지 않기로 했기 때문에, C1 실행/검증에 필요하지 않은 heavy dependency만 제거했다.

삭제한 venv package:

- `torch`
- `torchvision`
- `transformers`
- `tokenizers`
- `safetensors`
- `regex`
- `sympy`
- `mpmath`

삭제한 모델 cache:

- `tools/beard-simulation-lab/.hf-cache/hub/models--CIDAS--clipseg-rd64-refined`

유지한 package:

- `huggingface_hub`, `filelock`, `fsspec`, `tqdm` 등은 Gradio/local UI 계열에서도 의존하므로 삭제하지 않았다.
- `networkx`는 `scikit-image`가 요구하므로 삭제하지 않았다.

삭제 후 상태:

```text
.venv: 1.7G -> 1.0G
.hf-cache: 577M -> 12K
df -h .: 114MiB available -> 1.3GiB available
torch/transformers/torchvision import spec: None
full lab tests: 26 passed, 3 warnings
```

## 결론

- preProtect 관문은 복원됐다. 이제 최종 protect overlap이 0이어도 raw candidate가 protect에 크게 걸치면 pipeline에서 reject된다.
- 턱선 실루엣 hard 오탐은 일부 줄었다. 다만 시각적으로 아주 얇은 턱선 잔여가 남는 샘플이 있어 보정 연결 전 추가 conservative cap이 필요할 수 있다.
- 인중 recall은 아직 핵심 미해결 리스크다. coarse label 기준으로 `IMG_4534.HEIC` mustache recall은 `0.0031`에 그친다.
- C2는 runtime 근거로 제외할 후보가 아니다. cache 후 속도는 훨씬 낮다. 다만 quality/safety 근거상 raw/full prior는 위험하고, 다시 보더라도 mustache+chin 제한 prior로만 검토해야 한다.
- C3는 기각 유지다.
- 게이트 1 최종 통과 선언은 여전히 보류한다. 현재 6장은 동일인/옅은 수염 중심이고, dense beard/어두운 피부/타인 사진이 없다.

## 다음 스텝

1. C1 인중 recall을 따로 올리는 micro-pass를 만든다.
   - upper-lip protect cap을 더 줄일지, 인중 전용 narrow black-hat threshold를 둘지 비교한다.
2. 턱선 boundary drop을 더 보수적으로 한다.
   - 현재는 elongated + boundary overlap 조건만 본다.
   - 다음에는 jaw/ROI boundary와 각도, component 두께, shadow-only 여부를 같이 본다.
3. 보정 연결은 아직 hard 전체 inpaint로 바로 가지 않는다.
   - shadow-only는 blue-gray suppression.
   - hard는 인중/턱 중심의 제한적 texture attenuation부터 시작한다.
4. 4장 이상 추가 샘플을 확보한 뒤 게이트 1을 다시 판정한다.
   - 타인 사진
   - dense beard
   - 더 어두운 피부/다른 조명
