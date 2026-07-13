# ARKit 3D 얼굴 메시 Lab 구현 기록

## 목표

기존 얼굴 촬영 화면으로 정면 사진을 남긴 뒤 카메라 소유권을 Unity로 넘기고,
ARKit 얼굴 메시의 여러 유효 프레임에서 3D 특성을 계산한다. 같은 Face3D 기능 모듈을
Lab 앱과 본 앱이 함께 사용하며 React Native에는 원시 vertex가 아니라 compact
`Face3DProfile`만 전달한다.

기능명은 `TrueDepth 얼굴 계측`이 아니라 **ARKit 3D 얼굴 메시 기반 추출**로 사용한다.
raw TrueDepth depth map은 메시 품질을 대조하는 Lab 전용 후속 검증 입력이다.

## 확정 경계

- 측정 좌표: `ARFace.vertices`의 face-local 좌표
- 출력 source: `arkit_face_mesh`
- 프로필 스키마: `aura.face3d-profile.v1`
- 게이트 버전: `face3d-gate-v1`
- 수집 잠정값: 최대 3초, 유효 프레임 30개 목표, 20개 최소
- 집계: 프레임별 metric 계산 후 중앙값, 중앙값에서 `3 x MAD`를 초과한 값 제거
- topology: vertex/index/UV 개수와 index/UV hash를 묶은 fingerprint로 잠금
- semantic map: fingerprint가 일치하는 검증 완료 자산만 허용
- RN 전송: 상태 및 최종 metric만 전송하고 프레임별 vertex 배열은 전송하지 않음

## 첫 MVP metric

- `noseTipProjection`: 코끝과 국소 중안면 기준면 사이 signed distance / 3D 얼굴 폭
- `chinProjection`: 턱 전방점과 국소 하관 기준면 사이 signed distance / 3D 얼굴 폭
- `upperLipToELine`: 코끝-턱 전방점 E-line과 윗입술 사이 signed distance / 3D 얼굴 폭
- `lowerLipToELine`: 코끝-턱 전방점 E-line과 아랫입술 사이 signed distance / 3D 얼굴 폭
- `centralProjectionScore`: 중앙 얼굴 ROI와 좌우 볼 기준의 전후 차 / 3D 얼굴 폭

이는 해부학·의료 계측값이 아니라 ARKit template-fit 표면의 상대적인 외관 trait다.

`chinIndices`는 E-line과 돌출도에 쓰는 턱 전방점(Pogonion)이고,
`chinBottomIndices`는 얼굴 윤곽이 끝나는 턱 최하단(Menton)이다. 둘을 같은 `턱끝`으로
취급하지 않는다. Menton은 semantic map에 보존하지만 위 첫 5개 metric에는 아직
직접 사용하지 않으며 이후 3D 얼굴 길이·수직 비율 metric의 기준점으로 사용한다.

## 런타임 흐름

```text
FaceCaptureLab 정면 촬영 완료
  -> native 촬영 화면 unmount 및 AVCaptureSession 종료
  -> Unity player resume / Unity view mount
  -> RNBridge.StartFace3DAnalysisJson
  -> ARFace Tracking + topology + 단일 얼굴 + pose gate
  -> 유효 frame별 metric 계산 및 robust aggregation
  -> face3d_analyzed 이벤트
  -> Unity view hide/pause
  -> 재촬영 또는 결과 보관
```

브리지 계약:

```text
GameObject: RNBridge
methods: StartFace3DAnalysisJson, CancelFace3DAnalysisJson
events: face3d_status, face3d_analyzed
```

## 하드 게이트

| Gate | 실기기 증명 | 통과 전 제한 |
| --- | --- | --- |
| G0 | Unity ARKit 구동, `Tracking`, vertex/index/UV count가 모두 0보다 큼 | 3D 결과 완료 선언 금지 |
| G1 | projected mesh overlay 육안 정합 승인 및 topology fingerprint 기록 | semantic map v1 값 입력 금지 |
| G2 | blend shape 값과 표정 반응 확인 | neutral expression gate 활성화 금지 |
| G3 | native -> Unity -> native 왕복 10회, crash/jetsam/freeze 0회 | 본 앱 편입 금지 |
| G4 | 동일인 반복 촬영 오차가 사람 간 분산보다 충분히 작음 | 사용자 노출 라벨 금지 |
| G5 | 두 명 진입을 실제 차단 | 다중 얼굴 보장 선언 금지 |

## 현재 실행 원칙

로컬에서는 순수 geometry, topology fingerprint, robust aggregation, JSON parser,
상태 전이를 자동 검증한다. 각 gate는 iPhone 실기기 증거가 없으면 `blocked` 또는
`pending`으로 남기며 코드가 존재한다는 이유만으로 통과 처리하지 않는다.

2026-07-12 기준 G0는 iPhone 실기기 정면/약한 좌우 회전 캡처에서 `Tracking`,
vertex 1,220 / index 6,912 / UV 1,220, 전체 메시 프레임 내 포함, 동일 topology
fingerprint를 확인해 통과했다. G1 v7은 서로 다른 세 사람의 정면/좌/우 9개 오버레이를
검수하고 사용자가 승인했다. 승인 gate가 runtime map
`arkit-face3d-g1-reviewed-v1`을 생성했고, 해당 map을 포함한 UnityFramework와 서명된
Face3D Lab 앱 빌드도 통과했다.

2026-07-12 G1 runtime smoke도 통과했다. iPhone 16(iOS 26.5)에 Lab 앱을 WiFi로 설치해
`semantic_map_missing` 없이 30/30 유효 프레임을 실제 집계했고, topology fingerprint
`57bdaf...f3f`(v1220/i6912/uv1220)와 5개 finite metric(noseTip 0.316, chin 0.064,
upperLip 0.015, lowerLip 0.036, central 0.239)을 확인했다. 이 실행은 pose gate 수정이
있어야 가능했다 — 기존 세션 기준 `localEulerAngles`가 정면을 8~14°로 오판해 0/30에서
막히던 것을, 카메라 기준 상대 회전(신규 `Aura.Face3D.Face3DHeadPose`, 관례 0/180 자동
판별)으로 바꿔 정면이 30/30까지 수집되게 했다. 상세는 `FACE3D_GATE_STATUS.json`의
`gates.G1.runtimeSmoke`, 실기기 빌드 절차는 리포지토리 `AGENTS.md`의
"iOS Real-Device Build & Verify" 참고. 참고: chin metric은 inlier 18개(<20)로
이번 회차 신뢰도가 가장 낮았다(품질 노트, 집계 확정 경계는 미변경).

## 구현 상태

완료된 로컬 구현:

- ARFoundation과 분리된 `Aura.Face3D` 순수 geometry/aggregation 모듈
- index/UV SHA-256 기반 topology fingerprint와 exact-match 잠금
- 부위별 기준면을 분리한 P0 metric 계산
- 최대 3초/30 목표/20 최소 및 median/3 x MAD 집계
- `Face3DSessionController`의 Tracking·pose·다중 얼굴 gate와 RN 이벤트
- native `AVCaptureSession.stopRunning` 완료를 기다리는 카메라 인계 ack
- 기존 `FaceCaptureLabApp`에서 촬영 후 공유 Face3D 화면 진입
- 한 사람의 `neutral/yawLeft/yawRight`를 같은 `captureSetId`로 묶고 3/3 완료 표시 및 다음 사람 세트 전환
- 측정 landmark와 기준면 정점의 금지 overlap을 후보 생성·승인·Unity loader에서 동일하게 차단
- UV 반사 상호 최근접 쌍과 양쪽 공통 연결 그래프를 이용한 좌우 기준군 생성
- 좌우 정점쌍·정책 hash를 후보/재투영/진단/승인 단계에서 fail-closed로 검증
- 중안면 기준군의 안쪽 경계(`left u <= 0.405`, `right u >= 0.595`) 잠금
- 후보 semantic content와 검수 matrix/SVG를 SHA-256으로 결박하는 승인 gate
- 세 사람 × 세 자세를 한 화면에서 비교하는 독립 검수 보드와 v7 승인 receipt
- 로컬 캡처의 5개 metric을 같은 수식으로 비교하는 승인 전 오프라인 진단 도구
- 차단 상태에서도 fingerprint, vertex/index/UV count, 지원 얼굴 수 표시
- RN 계약/parser/reducer/진입 gate 자동 테스트

의도적으로 미완료인 항목:

- 승인 map을 사용한 G1 iPhone runtime smoke
- G2 전의 blend shape neutral-expression gate
- G2-G5의 남은 iPhone 실기기 증거
- Lab 전용 raw TrueDepth depth-map 대조 캡처

초기 캘리브레이션 앱은 semantic map이 없어서 `semantic_map_missing`으로 멈추는 것이
정상이었다. v7 승인 이후에는 다음 경로에 검증 완료 map이 있으며, 새 UnityFramework와
서명된 Lab 앱에도 동일한 `mapId`와 fingerprint가 들어 있다.

```text
apps/unity/MakeupAR/Assets/Resources/Face3D/ARKitFaceSemanticMapV1.json
```

빈 template이나 검증되지 않은 index를 위 경로에 넣지 않는다. 새 설치본에서 다시
`semantic_map_missing`이 나오면 정점 문제로 보지 말고 오래된 UnityFramework/Data가
설치된 것으로 판정한다.

## 실행 명령

```bash
npm run mobile:test:face3d
./scripts/unity/build_ios_unity_framework.sh
npm --prefix apps/mobile run start:face-capture-lab
npm --prefix apps/mobile run ios:face-capture-lab
```

## G1 시맨틱 맵 캘리브레이션

시맨틱 맵은 정점 번호를 추측해서 작성하지 않는다. Lab의
`시맨틱 후보용 메시 캡처` 버튼으로 정면 무표정 ARFace 프레임을 저장한 뒤 Mac에서
후보 생성·색상 검수 도구를 사용한다.

캡처 폴더에는 기존 E7 공용 포맷을 재사용해 다음 파일을 저장한다.

```text
frame.png
arface_export.json
projected_mesh_overlay.png
capture_summary.json
```

`arface_export.json`의 `face3dCalibration.topologyFingerprint`는 Unity의 원본
vertex/index/UV 배열에서 계산한다. JSON으로 반올림된 UV 값을 다시 해시하지 않는다.

기기 Documents에서 캡처 폴더를 Mac으로 가져온 뒤 실행한다.

```bash
npm run face3d:semantic:candidates -- /path/to/pair_face3d_semantic_XXXXXXXX
```

생성물:

```text
face3d-semantic-review/
  ARKitFaceSemanticMapV1.candidate.json
  semantic_candidate_overlay.svg
  semantic_candidate_review.html
```

`semantic_candidate_review.html`을 열면 그룹을 선택하고 얼굴 위 정점을
추가·제거할 수 있다. 번호는 사용자가 받아 적지 않고 도구가 자동 저장한다.

- 빨강: 코끝
- 파랑: 턱 전방점(Pogonion/E-line)
- 분홍: 턱 최하단(Menton)
- 노랑/주황: 윗입술/아랫입술 중앙
- 초록/청록: 중안면 기준 영역
- 보라: 턱 기준 영역
- 하늘색: 중앙 얼굴 ROI

자동 생성 파일은 `aura.face3d-semantic-candidate.v1`이며 런타임 스키마와 다르다.
한 장짜리 편집 화면은 수정 후보만 저장하며 `ARKitFaceSemanticMapV1.json`을 직접
내보내지 않는다. 각 그룹의 위치를 서로 다른 얼굴 3명의 정면·측면에서 검수하고 별도
승인 gate를 통과해 만든 파일만 다음 경로에 둘 수 있다.

```text
apps/unity/MakeupAR/Assets/Resources/Face3D/ARKitFaceSemanticMapV1.json
```

현재 v7 후보 생성 규칙은 코끝·턱 전방점·턱 최하단·입술 중앙의 검토된 topology seed와,
화면 정규화 위치·카메라 깊이·삼각형 연결 관계로 고른 기준 영역 patch를 결합한다.
좌우 중안면/턱 기준군은 독립적으로 고르지 않는다. topology UV를 `u -> 1-u`로 반사해
상호 최근접인 정점쌍만 만들고, 왼쪽과 오른쪽 원본 mesh edge가 모두 존재하는 pair
intersection graph에서 15쌍씩 연결 성장시킨다. 정책 버전은
`uv-reflection-mutual-nearest-paired-connected-v2`이며 mirror-map hash까지 승인 증거에
고정한다. 여러 캡처의 합의 후보는 정면 `neutral` 캡처만 허용한다. 좌우 회전은 정면에서
고정한 동일 정점 집합을 재투영하는 검증 입력으로만 사용한다.

이 규칙은 정답 생성기가 아니라 검수 시작점을 만드는 휴리스틱이다. 한 명의 정면 프레임
승인만으로 G1을 통과하지 않으며, 최소 서로 다른 얼굴 3명과 각 사람의 정면/약한 좌우
회전 오버레이를 대조한 뒤 mapId를 고정한다.

v7에서 측정 landmark는 코끝 `7,8,9`, Pogonion `31,32,33`, Menton
`913,914,1047`, 윗입술 `1,21,22`, 아랫입술 `26,27,28`로 고정했다. 이 다섯 측정군은
중안면/턱 기준면 6개 그룹에 들어갈 수 없다. 코끝과 `centralRegionIndices`처럼 기준면이
아닌 ROI의 의도된 overlap은 허용한다. 이 정책과 좌우 exact pair 계약은 후보 생성기,
수동 후보 validator, 재투영/진단, 승인 변환기, Unity runtime loader에서 검사한다.

후보 정점군을 다른 캡처들에 그대로 재투영해 한 화면에서 비교하려면 승인 전 candidate
JSON 1개와 캡처 폴더 2개 이상을 지정한다.

```bash
npm run face3d:semantic:validate -- \
  /path/to/ARKitFaceSemanticMapV1.candidate.json \
  /path/to/neutral-capture \
  /path/to/yaw-left-capture \
  /path/to/yaw-right-capture \
  --output /path/to/semantic-validation
```

생성되는 `semantic_validation_matrix.html`은 각 프레임을 base64로 내장한 독립 검수판이며,
`semantic_validation_summary.json`은 topology/full-frame/캡처 메타데이터 입력 검증 결과다.
두 파일 모두 런타임 승인 맵이 아니다. 도구는 촬영 대상의 신원을 알 수 없으므로 서로 다른
얼굴 3명 조건을 자동 증명하거나 G1을 자동 승인하지 않는다.

승인 전에 고정 후보가 포즈별로 얼마나 흔들리는지 수치로 미리 보려면 다음을 실행한다.

```bash
npm run face3d:semantic:diagnostics -- \
  /path/to/ARKitFaceSemanticMapV1.candidate.json \
  /path/to/neutral-capture \
  /path/to/yaw-left-capture \
  /path/to/yaw-right-capture \
  --output /path/to/semantic_candidate_metric_diagnostics.json
```

이 결과는 캡처별 5개 metric과 median/MAD/min/max/range를 기록하고 원시 frame·vertex는
출력하지 않는다. 중복 캡처는 거부하고 입력 candidate/ARFace JSON을 출력 경로로 지정해
덮어쓰는 것도 차단한다. 수식은 Unity `Face3DMetricEvaluator`와 같지만 JSON 정점은 소수
6자리이며 JavaScript float64와 Unity native float32의 정밀도가 다르므로 bit-identical
런타임 결과는 아니다. 또한 Unity의 20~30 frame `3 x MAD` 집계가 아니라 세 자세의
raw 비교이므로 G1 사람 승인이나 정확도 증거로 사용할 수 없다.

세 사람의 검수판을 사람이 승인한 뒤
`SEMANTIC_APPROVAL_MANIFEST.example.json` 형식으로 pseudonymous subject와 검증 summary를
연결하고 승인 gate를 실행한다.

```bash
npm run face3d:semantic:approve -- \
  /path/to/ARKitFaceSemanticMapV1.candidate.json \
  /path/to/semantic-approval.json \
  --output apps/unity/MakeupAR/Assets/Resources/Face3D/ARKitFaceSemanticMapV1.json
```

이 gate는 각 사람의 `neutral/yawLeft/yawRight`, topology/full-frame 통과, 서로 다른
subject/capture, reviewer와 UTC 승인 시각을 검사한다. 후보의 12개 그룹은 canonical
semantic SHA-256으로 검수 summary와 현재 candidate에 결박하고, matrix/개별 SVG도
파일 hash가 일치해야 한다. 새 앱 캡처는 사람별 세 자세가 같은 `captureSetId`여야 하며,
구형 캡처처럼 set ID가 나뉜 경우에만 manifest의 `samePersonConfirmed: true` 사람 확인이
필요하다. 세 사람이 실제로 서로 다름도 `distinctPeopleConfirmed: true`로 명시한다.
런타임 맵에는 개인·검수 경로를 넣지 않고 별도 `approval-receipt.json`에 증거 hash를 남긴다.

로컬 후보 도구 계약 검증:

```bash
npm run face3d:test:semantic-candidates
npm run face3d:test:semantic-validation
npm run face3d:test:semantic-review-board
npm run face3d:test:semantic-approval
npm run face3d:test:semantic-diagnostics
```

2026-07-12 Unity 6000.3.18f1 공식 EditMode Test Runner에서 `Aura.Face3D.Tests` 21개가
전부 통과했다(`passed=21`, `failed=0`). 여기에는 Pogonion/Menton 분리, 12개 그룹의
최소 정점 수, 측정 landmark와 기준면의 30개 overlap 조합 거부, 기존
geometry/aggregation/profile 계약이 포함된다. 이는 순수 geometry와 Unity Editor 계약의
로컬 증거이며, iPhone ARKit 실행 증거와는 별도다.

v7 승인 map과 강화된 Unity loader를 포함한 UnityFramework 빌드, MediaPipe framework
복사, `<local-dev-bundle>` Debug 앱의 자동 서명 빌드까지 통과했다. 빌드된
`resources.assets`에서 mapId `arkit-face3d-g1-reviewed-v1`과 fingerprint
`57bdaf...f3f`를 다시 확인했다. 2026-07-12 Wi-Fi로 iPhone 16에 설치해 실제
`face3d_analyzed`, 30/30 유효 프레임, 5개 finite metric을 확인함으로써 runtime smoke를
완료했다(위 "현재 실행 원칙" 문단 참고). CoreDevice tunnel `unavailable` 설치 차단은
로컬 팀 서명 + Wi-Fi 로드로 우회했다.

## 다음 게이트 (G2-G5)

G0·G1은 통과했다. 남은 하드 게이트는 각각 iPhone 실기기 증거가 필요하다.

- **G2 — neutral-expression gate:** ARKit blend shape로 무표정을 검증한다. 현재 런타임은
  `neutral_expression_gate_pending_g2` 경고만 붙이고 실제 게이트는 비활성이다. 세션
  컨트롤러가 표정 계수(예: jawOpen, mouthSmile, browInnerUp 등)를 읽어 임계 초과 시
  프레임을 거부하도록 추가하고, 실기기에서 무표정/표정 반응을 확인해야 한다.
- **G3 — round-trip 안정성:** native→Unity→native 왕복 10회에서 crash/jetsam/freeze 0회.
  본 앱 편입 전 조건.
- **G4 — 반복 정밀도:** 동일인 반복 촬영 오차가 사람 간 분산보다 충분히 작아야 사용자 노출
  라벨을 허용한다. 이번 회차에서 드러난 chin 저신뢰(inlier 18<20)와 얇은 MAD로 인한
  신뢰도 눌림을 정량 평가할 자리다. 확정 경계인 3xMAD 집계 변경은 별도 승인이 필요하다.
- **G5 — 다중 얼굴 차단:** 두 명 진입을 실제로 차단. 현재 `g5_multiple_face_gate_pending`.

runtime 완료(G1)는 선언했으나, 사용자 노출·본 앱 편입은 위 게이트를 실기기 증거로
통과하기 전에는 하지 않는다.

### G2-G5 코드 상태 (2026-07-12)

G2-G5의 로컬 코드와 자동 테스트는 완료했다. 실기기 증거가 없으므로 게이트 상태는
`implemented_pending_device_evidence`로 두며, `FACE3D_GATE_STATUS.json`에 세부를 기록했다.

- **G2:** 순수 `Face3DNeutralExpressionGate` + 컨트롤러가 ARKit blend shape(jawOpen/mouthSmile/
  mouthFrown/mouthPucker/mouthClose/browInnerUp/browDown/cheekPuff)를 읽어 최강 왜곡 신호가
  0.5 초과면 프레임 거부. blend shape 미제공 시 fail-open이라 G1이 회귀하지 않는다.
- **G3:** `sessionSequence` 카운터를 매 `face3d_status`에 실어 왕복 횟수를 증거 로그로 계수.
- **G4:** `scripts/face3d/analyze-repeatability.mjs`가 지표별 동일인 내 분산 대 사람 간 분산으로
  discriminability를 계산(`npm run face3d:repeatability`).
- **G5:** 다중 얼굴을 `multiple_faces_detected`로 차단(로직 기존, 명시 테스트 추가).

로컬 증거: Unity EditMode 52/52, 모바일 typecheck·face3d 계약·반복성 분석 테스트 통과.

### 통합 실기기 프로토콜 (한 번의 세션으로 G2-G5 증거 수집)

재빌드한 UnityFramework를 담은 Lab 앱을 설치한 뒤(절차는 `AGENTS.md`의 "iOS Real-Device
Build & Verify"), 다음을 한 세션에서 진행하고 각 `events.jsonl`을 뽑아 검증한다.

1. **G2:** 무표정으로 1회 측정 → 30/30 수집 확인. 이어서 웃는 얼굴/입 벌림/눈썹 올림으로 측정 →
   `neutral_expression_gate_blocked`가 뜨고 수집이 멈추는지 확인.
2. **G3:** 무표정 측정을 완료·취소 섞어 10회 반복. 크래시/멈춤 0회, 증거 로그의
   `sessionSequence`가 10까지 증가하는지 확인.
3. **G5:** 두 사람이 프레임에 들어가면 `multiple_faces_detected`로 차단되고 수집이 안 되는지 확인.
4. **G4:** 서로 다른 3명이 각 3회 무표정 측정 → 각 `events.jsonl`을 Mac으로 가져와
   `manifest.json`(`{ "captures": [ { "subjectId", "capturePath" }, ... ] }`)을 만들고
   `npm run face3d:repeatability -- --manifest manifest.json` 실행. 5개 지표 discriminability가
   모두 2 이상이면 G4 통과.

각 단계 통과 시 `FACE3D_GATE_STATUS.json`의 해당 게이트를 `passed`와 증거로 갱신한다.

### 실기기 결과 (2026-07-12)

위 프로토콜을 iPhone 16에서 실행하고 증거 로그(events.jsonl)를 devicectl로 뽑아 검증했다.

- **G2 passed:** 입 벌림(jawOpen 0.74) 등 41개 프레임이 `neutral_expression_gate_blocked`로 거부되고, 무표정은 여전히 30/30 수집. 회귀 없음.
- **G3 passed:** `sessionSequence`가 한 프로세스에서 19까지 단조 증가(리셋 없음) → 10회 이상 왕복을 크래시 0으로 완료.
- **G5 passed:** 두 사람 진입 시 `multiple_faces_detected` 191회 차단, 수집 미진행.
- **G4 partial:** 자동 클러스터링 기준 5개 중 4개 지표가 사람 구분력 우수(discriminability 4.3~6.1). **chinProjection만 0.5로 사람 간 차이가 반복 노이즈보다 작다** — G1 smoke의 저신뢰와 일치. **chin은 개선 전 사용자 노출 금지.** 라벨된 3×3 재촬영으로 정밀 확인 권장.

세부 수치는 `FACE3D_GATE_STATUS.json`의 각 게이트 `deviceEvidence` 참고.
