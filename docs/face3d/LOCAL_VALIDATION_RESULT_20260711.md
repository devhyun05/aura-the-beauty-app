# Face3D Lab 로컬 검증 결과 — 2026-07-11

## 2026-07-12 v7 시멘틱 정점 승인 및 재빌드

사용자 검수에서 중안면 안쪽 정점이 콧망울 위로 들어오는 문제를 수정했다. v7은
중안면 좌측을 `u <= 0.405`, 우측을 `u >= 0.595`로 제한하며, 좌우 기준군은 UV 반사
상호 최근접 쌍과 양쪽 공통 연결 그래프에서만 선택한다.

```text
candidateId        face3d-consensus-1783842642466-candidate-v1
semantic SHA-256   819fbe282252a06b3e4f474536ce51db9154c8c7b5eac52a3e9e713a32a6ce75
symmetry policy    uv-reflection-mutual-nearest-paired-connected-v2
mirror map SHA-256 ce17237f58f107911506d199d3403cf22bccda0af3ed07a17794e8cd815638e9
selected pairs     30 (midface 15 + chin 15)
max UV residual    0.0010260531 (cap 0.00125)
min ambiguity      10.5164 (required 2)
runtime mapId      arkit-face3d-g1-reviewed-v1
runtime map SHA    2c3c1a1c32275163f71d573ad68d92a09531465a57c65f493a014896a7f97861
```

세 사람의 `neutral/yawLeft/yawRight` 9개 재투영판, topology/full-frame, artifact hash,
좌우 exact-pair 계약을 모두 검증했다. 사용자가 보드를 확인하고 정점 수정을 승인한 뒤
approval gate가 runtime map과 receipt를 생성했다. Subject-01의 구형 분리 capture set은
`samePersonConfirmed: true`, 세 사람 구분은 `distinctPeopleConfirmed: true`로 명시했다.

Claude Fable 5 xhigh에는 얼굴 원본이나 workspace 파일을 전송하지 않고 추상화한 알고리즘
계약만 읽기 전용으로 검토시켰다. 판정은 `PROCEED_WITH_CAVEATS`였고, 주의점은 사람의
해부학적 육안 승인, UV seam, 결정적 tie-break, 경험적 임계값이었다. v7은 사용자 육안
승인, `(score,leftIndex,rightIndex)` tie-break, ambiguity fail-closed, 정책/hash 잠금으로
해당 조건을 충족했다.

v7 이후 다음 자동 검증을 다시 통과했다.

```text
npm run face3d:test:semantic-candidates      PASS
npm run face3d:test:semantic-validation     PASS
npm run face3d:test:semantic-review-board   PASS
npm run face3d:test:semantic-approval       PASS
npm run face3d:test:semantic-diagnostics    PASS
npm run mobile:test:face3d                  PASS
Unity EditMode Test Runner                  21 passed, 0 failed
UnityFramework iOS Release build            PASS
Face3D Lab signed Debug app build           PASS
```

새 Unity `resources.assets`와 서명된 앱 안에서 mapId와 topology fingerprint를 문자열로
재확인했다. 앱 번들은 `<local-dev-bundle>`, Team은 `<local-dev-team>`, Metro
호스트는 `<old-lan-ip>`로 기록됐다. 문서 작성 시점에는 iPhone의 CoreDevice 상태가
`paired`이지만 tunnel은 `unavailable`이라 Wi-Fi 설치가 아직 성공하지 않았다. 따라서
`face3d_analyzed`, 20개 이상 유효 프레임, 5개 finite metric은 아직 runtime 증거가 아니다.

## 2026-07-12 시맨틱 캘리브레이션 도구 추가

구현:

- Lab `시맨틱 후보용 메시 캡처` 진입
- 한 사람의 세 자세는 같은 `captureSetId`, 다음 사람은 새 set을 쓰는 순수 계약 테스트
- 기존 E7 ARFace 동기 캡처 포맷 재사용
- Unity 원본 index/UV 배열 기반 exact topology fingerprint 동봉
- 고정 landmark와 연결 정점 patch를 합친 12개 그룹의 자동 후보 생성
- 색상 SVG 및 클릭/브러시 방식 HTML 검수 화면
- 턱 전방점(Pogonion)과 턱 최하단(Menton) 분리
- 측정 landmark 5개와 reference plane 6개 사이 30개 금지 overlap 자동 차단
- 단일 프레임에서 runtime map을 내보내지 못하게 하고, 3명 고정 후보 재투영 승인 gate로 잠금
- candidate semantic content 및 검수 matrix/SVG hash 결박
- 중복 캡처·입력 덮어쓰기를 막는 오프라인 metric 진단

통과:

```text
npm run face3d:test:semantic-candidates  PASS
npm run face3d:test:semantic-validation PASS
npm run face3d:test:semantic-approval   PASS
npm run face3d:test:semantic-diagnostics PASS
npm run mobile:test:face3d              PASS
TypeScript transpile syntax check       PASS
Face3D 범위 git diff --check             PASS
```

합성 fixture에서는 12개 그룹 후보 생성, 고정 후보 다중 캡처 재투영, 3명 × 정면/좌/우
승인 gate, semantic/artifact hash 변조 차단, capture-set 사람 확인을 검증했다. 단일 프레임
편집 화면은 수정 후보만 저장하며 runtime map을 직접 내보내지 않는다.

전체 `npm run mobile:typecheck`는 현재 설치된 `node_modules`에 `expo-image`,
`expo-linear-gradient`, `expo-blur`, `@shopify/react-native-skia`, `expo-gl`, `three`
모듈이 없어 기존 화면들에서 실패했다. 이번 Face3D 변경 파일은 별도 TypeScript
transpile 구문 검사를 통과했다.

초기 시도에서는 Unity iOS export가 다음 라이선스 로그에서 중단했다.

```text
attempt to write a readonly database
[Licensing::Module] Timed-out after 60.00s, waiting for channel
[Licensing::Module] Error: Licensing initialization failed after 75.14s
```

Unity Editor를 종료하고 장시간 남아 있던 Licensing Client를 정상 종료한 뒤 같은
스크립트를 재실행했다. 재실행에서는 Unity import/C# compile, IL2CPP arm64 385/385,
Xcode `UnityFramework` Release 빌드가 모두 성공했다. 새 `UnityFramework.framework`,
Unity `Data`, `MediaPipeUnity.framework`도 `apps/mobile/ios/UnityBuild`로 복사됐다.

```text
*** il2cpp build success, 385 evaluated
** BUILD SUCCEEDED **
[aura:unity] Done: apps/mobile/ios/UnityBuild/UnityFramework.framework
```

## 판정

소스 구현, 로컬 순수 계산 검증, iPhone G0 ARKit 메시 취득, v7 세 사람 재투영 검수와
사람 승인, runtime map 생성, UnityFramework 및 서명된 Lab 앱 빌드까지 통과했다. G1은
`approved_pending_runtime_smoke`다. 새 앱을 iPhone에 설치해 실제 집계가 완료되기 전에는
G1 runtime 완료나 G2 진입 완료로 기록하지 않는다.

## 통과

| 항목 | 결과 |
| --- | --- |
| RN Face3D 계약/parser/reducer/진입 및 사람별 capture-set gate | `npm run mobile:test:face3d` EXIT 0 |
| Face3D 기능 범위 TypeScript | 지정 파일 `tsc --noEmit` EXIT 0 |
| Unity `Aura.Face3D` 독립 assembly compile | Unity Roslyn EXIT 0 |
| Unity Assembly-CSharp + Face3D adapter compile | Unity Roslyn EXIT 0, 기존 unreachable-code 경고 1건 |
| Face3D test assembly compile | Unity Roslyn EXIT 0 |
| Face3D core test 실행 | 공식 Unity EditMode Test Runner 21 passed, 0 failed |
| 세 사람 검수 보드·좌우 pair·승인 gate | Face3D script 5종 및 mobile contract EXIT 0 |
| iOS native camera stop-ack 문법 | iPhoneOS SDK `clang -fsyntax-only` EXIT 0 |
| Unity iOS export + IL2CPP arm64 | 385/385, `xcodebuild` BUILD SUCCEEDED, script EXIT 0 |
| iOS UnityFramework 산출물 | arm64 Mach-O, v7 승인 map 포함, 2026-07-12 갱신 |
| Face3D Lab 앱 | bundle/team/map/Metro IP 검증, CLI 서명 빌드 EXIT 0 |

Core test가 확인한 내용:

- 얼굴 변형에는 유지되고 index/UV 변경에는 달라지는 topology fingerprint
- semantic map 없음 및 topology 불일치 차단
- data-driven index로 5개 normalized metric 계산
- schema와 범위를 벗어난 semantic index 거부
- 12개 semantic 그룹의 최소 정점 수 `3 / 8 / 16` 강제
- 측정 landmark와 reference plane 사이 30개 overlap 조합 거부
- median 및 `3 x MAD` 이상치 제거
- 30 프레임 profile 생성과 canonical JSON
- 3초 시점 20 프레임 미만 거부
- unavailable metric의 JSON `null` 출력

## 미통과 또는 차단

### Unity Test Runner

2026-07-12 Unity 6000.3.18f1 공식 EditMode Test Runner를 실행했다.
`Aura.Face3D.Tests` 21개가 모두 통과했고 결과 XML은 `total=21`, `passed=21`,
`failed=0`이다. Pogonion/Menton 분리, 각 그룹 최소 정점 수, 측정 landmark 5개와
reference plane 6개의 모든 overlap 조합 거부, 정상 맵의 Menton 정점 보존이 포함됐다.

### Subject-01 v4 오프라인 진단 — 폐기된 과거 기준

아래는 같은 사람의 `neutral/yawLeft/yawRight`에서 v4 후보를 Unity와 같은 수식으로
비교했던 역사 기록이다. v4는 좌우 기준군 비대칭 문제로 v7에 의해 대체됐으며 승인이나
runtime 수치로 재사용하지 않는다.
이 결과는 JSON 반올림 좌표를 쓰는 `provisional_candidate_diagnostics`이며 runtime 승인이나
정확도 증거가 아니다.

| Metric | Median | MAD | 세 자세 범위 | Median 대비 범위 |
| --- | ---: | ---: | ---: | ---: |
| 코끝 돌출 | 0.375147 | 0.000100 | 0.001545 | 0.41% |
| 턱 전방점 돌출 | 0.076765 | 0.000132 | 0.002921 | 3.80% |
| 윗입술 E-line | 0.065330 | 0.002364 | 0.010818 | 16.56% |
| 아랫입술 E-line | 0.107635 | 0.001794 | 0.011589 | 10.77% |
| 코 중앙부 ROI 돌출 | 0.266092 | 0.000015 | 0.001335 | 0.50% |

코·중앙부는 이 세 프레임에서 안정적이지만 입술 E-line은 회전 자세에 더 민감했다.
따라서 실측 단계의 pose gate와 20~30 frame 집계를 완화하면 안 된다.

### 전체 모바일 typecheck

전체 `npm --prefix apps/mobile run typecheck`는 작업 전과 동일한 로컬 dependency
누락으로 실패했다. 누락 모듈은 `expo-image`, `expo-linear-gradient`, `expo-blur`,
`@shopify/react-native-skia`, `expo-gl`, `three`이며 Face3D 범위 오류는 없었다.

### 실기기

다음은 iPhone에서 확인한다.

- G0: 통과 — `Tracking`, vertex 1,220 / index 6,912 / UV 1,220, 동일 fingerprint
- G1: v7 세 사람 × 세 자세 승인 및 앱 빌드 완료, iPhone runtime smoke 대기
- G2: blend shape 값과 표정 반응
- G3: native/Unity 카메라 왕복 10회
- G4: 동일인 반복 측정 오차
- G5: 두 명 진입 차단

현재 `apps/mobile/ios/UnityBuild`와 `/tmp`의 서명된 Lab 앱에는 v7 승인 map과 강화된
semantic loader가 포함돼 있다. 다만 CoreDevice Wi-Fi tunnel이 내려가 있어 새 앱 설치가
남았다. framework와 앱 생성 성공은 실제 TrueDepth 원시 depth-map 취득이나 측정 정확도
증거가 아니다. G0는 위 실기기 메시 캡처로 통과했고, G1 runtime smoke와 G2-G5는 각
항목의 남은 실기기 조건을 별도로 판정한다.
