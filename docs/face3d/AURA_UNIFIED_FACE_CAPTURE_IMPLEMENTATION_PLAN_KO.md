# AURA 헤어라인 소프트 넛지·한 번 촬영 통합 얼굴 분석 구현 계획

작성일: 2026-07-16 KST

상태: 기능 플래그 후보 구현 완료 / rebase 전 전체 EditMode·iOS UnityFramework 및 rebase 후 focused 계약 검증 완료 / 일반 품질 게이트 보강·실기기 런타임·보정 검증 대기

기준 브랜치: `feature/WEI/얼굴분석보고서`

검증 기준 커밋: `cca5aedc793083c1b19b43d43cc8af3c2c416bfc`

구현 착수 기준: 2026-07-16 `git fetch origin` 및 fast-forward 후 `HEAD = origin/dev = cca5aedc`, `HEAD...origin/dev = 0 0`

원격 차이 영향: 이전 검토에서 확인한 19개 makeup-recommendation 계열 커밋은 구현 전에 fast-forward로 통합했다. 통합 뒤 계획 대상 파일의 기존 사용자 변경을 다시 확인하고 구현을 시작했다.

PR 준비 기준: 2026-07-16 재조회에서 `origin/dev = 3247a164`로 6개 커밋이 추가돼 해당 기준으로 rebase했다. 구현 파일과 겹친 `FaceLandmarkSource.cs`는 broker 전환과 upstream의 `FaceLossGraceResults = 3` 얼굴 미검출 grace 로직을 함께 보존했으며, rebase 직후 `HEAD...origin/dev = 1 0`이었다. PR 생성 전 원격 기준을 다시 조회한다.

관련 문서:

- `docs/AURA_FACE_HAIRLINE_APPLE_MATTE_PLAN_KO_v0.1.md`
- `docs/face3d/ARKit_FACE3D_LAB_IMPLEMENTATION_KO.md`
- `docs/superpowers/plans/2026-07-15-face-analysis-capture-guidance.md`

---

## 0. 결론

이 계획은 다음 두 기능을 함께 구현한다.

1. 헤어라인은 촬영 전 **소프트 넛지**로만 안내하고 셔터를 잠그지 않는다. 촬영 후 실제 경계 H를 신뢰할 수 없으면 근사값을 넣지 않고 상안부와 H 의존 결과를 보고서·AI 분석에서 제외한다.
2. 사용자가 한 번 촬영했을 때 같은 ARKit 캡처 구간에서 얻은 이미지 1장과 짧은 ARFace 메시 묶음으로 2D·색·3D 입력을 만든다.

권장 구조는 **Unity/ARKit이 전면 카메라 세션을 단독 소유하는 통합 촬영 화면**이다. 기존 네이티브 `AVCapturePhotoOutput` 촬영과 Unity ARKit 측정을 동시에 실행하는 구조는 채택하지 않는다. 두 런타임이 TrueDepth 카메라 소유권을 놓고 경쟁하며, 서로 다른 시점의 사진과 메시를 같은 프레임이라고 잘못 묶을 수 있기 때문이다.

통합 촬영은 다음처럼 정의한다.

- **한 번의 촬영**: 사용자가 셔터를 한 번 누른다.
- **한 장의 분석 이미지**: 최종 2D·색 분석에는 선택된 `ARFrame.capturedImage` 한 장만 사용한다. MediaPipe 입력용 `XRCpuImage`는 같은 센서 시각의 broker token을 연결하는 용도이며 별도 사진을 만들지 않는다.
- **헤어라인 정책**: 미리보기 검출은 안내용이며 헤어라인만으로 셔터를 잠그지 않는다. 현재 통합 후보의 셔터는 native provider 가용성·단일 얼굴·자세를 확인하며, 기존 거리·노출·blur·카메라 안정성 정책의 통합은 기본 on 전 보강 항목이다. 촬영 후 실제 H의 품질로 전체/부분 보고서를 결정한다.
- **구현 후보 3D 입력**: 기능 플래그 안에서는 촬영 이미지를 중심으로 최대 500ms 안에 목표 8개, 최소 5개의 유효 ARFace를 모은다. 이는 출시 기본값이 아니라 30프레임 기준선과 비교할 첫 후보값이다.
- **정확히 한 프레임 모드**: 기술 검증과 비교를 위한 Lab 모드로만 유지한다. 반복성 검증 전에는 제품 보고서 기본값으로 사용하지 않는다.
- **미리보기 프레임**: 촬영 전 헤어라인·단일 얼굴·자세·표정 안정성을 판정하기 위해 여러 미리보기 프레임을 관찰할 수 있다. 미리보기 관찰은 최종 분석 프레임 수에 포함하지 않는다. 거리·노출·blur·카메라 안정성은 별도 보강 항목이다.

따라서 이 계획에서 “한 장”은 **사용자 촬영 동작과 저장 이미지가 하나**라는 뜻이다. 3D까지 무조건 한 프레임만 사용한다는 뜻으로 정의하지 않는다. 구현·비교의 첫 후보는 `target=8`, `minimum=5`, `maximumDuration=500ms`인 짧은 micro-burst다. **출시 기본값은 반복성·실패율·지연의 사전 등록 기준을 통과하기 전까지 현재 20/30프레임으로 유지한다.**

### 0.1 외부 검토 반영 판정

첨부 검토는 코드와 최신 원격을 다시 대조해 다음처럼 판정했다.

| 검토 주장 | 판정 | 계획 반영 |
|---|---|---|
| 기존 Face3D validator가 500ms·8프레임을 거부한다 | 수용 | legacy v1 validator는 보존하고, 통합 캡처는 별도 v2 요청·validator를 사용한다. |
| Unity 관찰 시각끼리 뺀 `imageFaceDeltaMs`는 동기성을 증명하지 못한다 | 수용 | 동일 센서 frame token/timestamp를 필수 계약으로 바꾸고, 공통 센서 시각을 얻지 못하면 Gate 0을 실패시킨다. |
| controller의 독립 `TryAcquireLatestCpuImage()`는 기존 획득자와 경합한다 | 수용, 구현 전제 교정 | 특정 source가 아니라 독립 `FaceCameraFrameBroker`를 유일한 CPU image 획득자로 둔다. 현재 직접 획득하는 `FaceLandmarkSource`, `E7VisionLipBoundaryRuntime`, `E7HandOcclusionRuntime`를 모두 broker 구독자로 옮긴다. |
| 빌드 씬에 `FaceLandmarkSource`·`SegmentationSource`가 항상 존재한다 | 기각 | 현재 제품 씬에는 두 source가 없을 수 있고 `ARBootstrap`도 기존 `ARSession`이 있으면 조기 종료한다. `RNBridge`가 AR camera에 broker와 통합 controller를 idempotent하게 런타임 배선한다. |
| target 수를 낮춰 얻은 coverage 상승은 정확도 근거가 아니다 | 수용 | 5/8을 confidence 수식으로 정당화하지 않고, 30프레임 대비 독립 반복성으로 결정한다. |
| fail-closed hairline gate가 일부 사용자를 영구 차단한다 | 수용 | 헤어라인은 soft advisory로만 사용하고, 실제 H가 없으면 촬영 차단 대신 H 의존 결과를 생략한다. |
| Apple 사후 검출의 0.70/0.55·5샘플을 그대로 계승할 수 있다 | 수용 | 출처 없는 0.55와 5샘플 주장을 삭제하고, 새 모델용 라벨셋 보정과 시간 기반 안정성을 사용한다. |
| 현재 브랜치가 `origin/dev`보다 97커밋 뒤다 | 숫자는 기각, drift 경고는 수용 | 최종 재조회 기준 실제 차이는 `0 19`다. 19개 중 계획 범위와 겹치는 것은 `homeRoutes.tsx`뿐이지만 구현 전에 최신 dev를 통합한다. |
| `makeupFeedbackRealtimeQuality.ts`가 제공하는 중앙 limits·시간 안정성 패턴을 따라야 한다 | 수용 | 공통 실시간 품질 평가기를 확장하고, 통합 전용 greenlight를 독립 포크하지 않는다. |
| 여러 `useState` 때문에 reducer가 반드시 필요하다 | 일부 기각 | React 배칭 자체보다 stale async 완료가 위험하다. 활성 `requestId/captureId`를 확인하는 commit API로 막는다. |
| `FaceVerticalThirdsScreen`이 MediaPipe H를 계산에서 버린다 | 표현 교정 후 수용 | 계산에서 버리지는 않지만 Apple provider만 “감지됨”으로 표시한다. provider 중립 표시로 수정한다. |
| H가 없어도 현재 partial 결과가 `dominantPart`와 성공 요약을 만들 수 있다 | 독립 확인, 추가 반영 | H가 없으면 3분할 우세 판정은 `unknown`으로 고정하고, 별도 중안부:하안부 2구간 결과만 표시·직렬화한다. |
| hard gate의 escape 조건이 본문·완료 정의·테스트에서 서로 다르다 | 문제는 수용, 해법은 교체 | 헤어라인이 셔터를 잠그지 않으므로 escape·8초·안내 3회 계약을 모두 삭제한다. |
| segmentation의 의복 class로 가림 원인을 세분해야 한다 | 기각 | 셔터 차단이 없고 재촬영도 선택 사항이므로 의복 종류를 추정할 제품 이득보다 오분류 위험이 크다. 구현 후보는 `likely_occluded`·`unknown`을 생산하며, `environment_issue`는 low-light·motion 입력을 연결한 뒤 사용할 확장 계약으로 남긴다. |
| `not_applicable`을 낮은 ROI와 구분하고 해부학 상태를 세분해야 한다 | 문제는 수용, 상태 추론은 기각 | 초기 ROI 위쪽을 한 번 확장해 실제 경계를 다시 찾되, 영상만으로 탈모 유형이나 H의 존재 여부를 추정하지 않는다. 끝내 H가 없으면 모두 `omitted`다. |
| `unobservable`에는 근사값을 허용하고 `not_applicable`만 생략해야 한다 | 기각 | 현재 idx-10은 실제 헤어라인 검출이 아니며 평균 회귀 편향을 만든다. 실패 원인과 무관하게 실제 H가 없으면 권위 있는 상안부 계산과 AI 입력에서 제외한다. |
| 검증 하위군을 명시적 6개로 사전 등록해야 한다 | 수용 | 서로 겹칠 수 있는 6개 하위군, 최소 표본 수, 고정된 검증 지표를 Phase -1에 명시한다. |
| 8초/3회 escape를 사전 등록해야 한다 | 기각 | 소프트 셔터에서는 escape가 불필요하다. 대신 교정 가능한 원인이 있을 때만 촬영 후 재촬영을 최대 1회 권고하도록 사전 등록한다. |

이 판정 이후의 임계값은 “현재 Apple 계약의 복사본”이 아니라 **별도 입력 도메인에서 검증해야 하는 초기 후보**로 취급한다.

### 0.2 2026-07-16 구현 결과

구현은 계획의 제품 후보 경로까지 완료했다. 출시 승격에 필요한 실기기 보정·반복성 검증은 의도적으로 완료 처리하지 않는다.

| 영역 | 구현 결과 | 증거 |
|---|---|---|
| 카메라 단일 소유권 | Unity ARKit만 전면 카메라를 소유하며 `FaceCameraFrameBroker`만 `TryAcquireLatestCpuImage()`를 호출한다. | `FaceCameraFrameBroker.cs` 및 정적 검색 |
| 동일 ARFrame 이미지·3D | iOS plugin이 한 `ARSession.currentFrame`에서 `capturedImage`, tracked `ARFaceAnchor`, mesh, projected vertices를 함께 복사한다. broker token은 센서 timestamp 1ms 이내에서만 연결한다. | `AuraUnifiedFaceNativeCapture.mm`, `ARKitUnifiedFaceNativeCaptureProvider.cs` |
| 결과 독립 anchor | 네 번째 유효 3D 표본을 fallback anchor로 먼저 보존한다. 그 token이 segmentation에 수락되지 않았다면 이후 처음 확인되는 exact accepted token 표본으로 한 번만 교체한다. H 성공·confidence를 본 뒤 고르는 best-of-N 선택은 하지 않으며 controller가 지속 보유하는 native pixel buffer는 최대 한 개다. | `UnifiedFaceCaptureController.cs`, `SegmentationSource.HasAcceptedFrameToken()` |
| 이미지 1장 | 고정 anchor가 결정된 뒤에만 `ARFrame.capturedImage`를 upright·non-mirrored JPEG 한 장으로 인코딩한다. | native provider 및 iOS arm64 링크 심볼 |
| 헤어라인 soft advisory | 400ms 시간 debounce를 적용한 `likely_visible`·`likely_occluded`·`unknown` 안내를 제공하며 hairline 상태는 셔터 greenlight에 포함하지 않는다. `environment_issue`는 TS 확장 계약만 있고 Unity producer는 아직 없다. | `HairlineVisibilityEstimator.cs`, controller gate |
| 일반 촬영 품질 | native provider 가용성·단일 얼굴·pose gate는 구현했다. 기존 native 경로의 거리·노출·blur·400ms 카메라 안정성 평가는 아직 통합 후보에 이식하지 않았다. | `UnifiedFaceCaptureController.cs`, `faceCaptureGreenlight.ts` |
| 촬영 후 H 정책 | 같은 camera token·1ms sensor timestamp의 segmentation만 사용한다. `>=0.70`만 H 의존 분석에 사용하고, `0.45–0.70`은 실제 좌표를 보존하되 보고서 계산에서는 제외하며, 미검출은 proxy 없이 생략한다. 통합 결과의 `mediapipe_selfie_multiclass`는 보고서 입력에서 실제 경계 provider인 `mediapipe_hairline_boundary`로 변환한다. generic `mediapipe` landmark는 공식 H 후보에서 거부한다. | `unifiedFaceCaptureNavigation.ts`, vertical-thirds selector 및 계약 테스트 |
| 재촬영 | 교정 가능한 첫 실패에서만 최대 한 번 권고하고, 같은 흐름의 수동 재촬영에서도 attempt 1을 유지한다. | `unifiedFaceCaptureFlowState.ts` 및 계약 테스트 |
| 보고서 안전성 | H가 없으면 상안부·3분할 우세·H 의존 얼굴 길이와 AI 서사를 생략하고 중안부:하안부만 제공한다. | mobile/backend 측정·AI payload 회귀 테스트 |
| 원자적 RN 흐름 | 이미지 업로드와 v2 Face3D 결과를 request 단위로 원자 커밋하고 stale/duplicate 완료를 거부한다. 통합 성공 시 별도 30프레임 측정 화면을 건너뛴다. | unified capture hook, flow state, routes |
| 임시 파일 정리 | 미커밋 취소·fallback·commit 실패·확인 화면 재촬영/닫기에서 앱 cache 직속 통합 JPEG만 idempotent 삭제한다. | `unifiedFaceCaptureTempImageCleanup.ts` |
| 프레임 비교 Lab | exact 1/3/5/8/12/30과 legacy 30을 명시적으로 구별하는 요청·파싱·Lab 선택 경로를 구현했다. Exact 1은 공개 v2 profile factory에서 raw 1/1 값은 유지하되 metric confidence를 0으로 강제하고 JSON의 MAD를 `null`로 내보내며 `single_frame_unaggregated`를 남긴다. 실제 기기 수집 성공은 아직 검증하지 않았다. 제품 후보는 5-of-8/500ms이고 기본 feature flag는 off다. | `FaceCaptureLabApp.tsx`, `UnifiedFaceCaptureContracts.cs` 및 계약 테스트 |

검증 완료:

- 모바일 TypeScript typecheck 통과
- 모바일 Face3D·통합 촬영 계약 테스트 통과
- Unity Face3D EditMode `78/78` 통과
- native ObjC++ iPhoneOS SDK 구문 검사 통과
- Unity iOS export와 arm64 `UnityFramework.framework` 빌드 성공
- 빌드 산출물에 `AuraUnifiedFaceCapture_*` native 심볼 포함 확인

전체 Unity Face3D EditMode `78/78`과 UnityFramework 빌드는 최신 `origin/dev` 6개 커밋을 rebase하기 전 구현 snapshot에서 통과했다. rebase 뒤 겹친 `FaceLandmarkSource.cs`는 broker 전환과 upstream face-loss grace를 정적으로 함께 확인했다. 이후 통합 `HEAD`의 provider mapping 회귀 테스트를 통과했고, Exact-1 변경은 Unity 생성 compiler response로 `Aura.Face3D` 제품·테스트 어셈블리를 컴파일한 뒤 관련 테스트 2개를 직접 실행해 통과했다. Unity headless EditMode 재실행은 licensing client 연결 실패로 시작되지 않았으며, 사용자 지시에 따라 통합 `HEAD`의 앱·UnityFramework 추가 빌드는 실행하지 않았다.

아직 `UNVERIFIED`:

- 실제 iPhone에서 orientation·mirror·token/timestamp 런타임 증거
- 실제 iPhone에서 결과 image count 1과 500ms 내 5/8 확보율
- 실제 사용자 헤어라인 precision/recall 및 normalized H 오차
- 1/3/5/8/12/30 반복성 비교와 최종 제품 프레임 수
- ColorChecker ΔE, TTI, fps, RSS, thermal gate
- 통합 경로의 거리·노출·blur·카메라 안정성 greenlight 회귀
- `environment_issue` producer와 low-light·motion 원인 라우팅
- fixed-anchor 선택 순서와 exact accepted-token 판정의 직접 회귀 테스트

따라서 기능 플래그 후보 구현과 출시 승인은 분리한다. feature flag는 위 보강·실기기 gate를 통과할 때까지 기본 off이며 기존 30프레임 경로가 fallback이다. 현재 로컬 실기기 서명 profile은 2026-07-18 만료 예정이므로 이후 검증 전 갱신이 필요하다.

### 0.3 커밋 `0ffa1011` 적대적 검토의 비판적 반영

첨부된 최종 검토는 `0ffa1011`을 기준으로 작성됐으므로, 이후 커밋과 현재 작업 트리를 다시 대조해 판정했다. provider 매핑과 Exact-1 집계 문제는 후속 커밋 `7dac2000`에서 이미 수정됐다. 나머지 항목은 아래처럼 반영한다.

| 검토 주장 | 판정 | 반영 |
|---|---|---|
| timeout 종료가 500ms를 넘겨 5~7프레임 완료 payload가 TS validator에서 거부된다 | 수용 | collector는 500ms 밖 표본을 받지 않으므로 wire의 `captureWindowMs`는 finalization 지연이 아니라 정책상 표본 창으로 clamp한다. 5/8 부분 완료 회귀 테스트를 추가한다. |
| 라이브 헤어라인 좌표에 90도 변환이 빠졌다 | 기각 | FaceLandmarker 결과는 `ImageProcessingOptions`가 적용된 upright 처리 공간 좌표다. 같은 공간의 `ReferenceToMask`가 맞고, raw `XRCpuImage`용 `InputImageToMask`를 다시 적용하면 이중 회전이 된다. 호출부에 좌표 공간 주석을 남긴다. 실기기 orientation 증거는 별도 미검증 항목이다. |
| 새 필드가 없는 모든 구버전 세로비율 payload가 강등된다 | 제한 수용 | `measurementMode`가 없더라도 schema v1·`full_success`·실제 H provider·confidence 0.70 이상을 모두 만족하는 과거 payload만 전체 세로비율로 인정한다. proxy provider와 partial payload는 계속 fail-closed다. |
| in-flight token을 accepted로 세는 계약 자체가 잘못됐다 | 일부 기각 | 고정 anchor가 “segmenter에 정확히 제출된 token”을 예약하는 현재 의미는 유지한다. 다만 watchdog timeout 때 metadata를 제거해 죽은 promise가 남지 않게 한다. 재생성 상한이 있어 딕셔너리가 무한 증가한다는 표현은 과장이다. |
| iOS `inactive`에서도 요청을 영구 종료한다 | 수용 | 알림 센터·일시 중단에 해당하는 `inactive`는 유지하고 실제 `background` 전환에서만 종료한다. |
| start 전 cancel이 prepare 상태를 해제하지 않는다 | 수용 | request ID가 일치하는 prepared request도 cancelled terminal을 보내고 advisory 상태와 prepared 상태를 정리한다. |
| `SegmentationSource`가 중복 생성될 수 있다 | 수용 | controller와 `MakeupController` 모두 기존 singleton을 우선 재사용하고 없을 때만 생성한다. |
| 외부 사진·영상 편집 중 라이브 segmentation이 계속 실행된다 | 수용 | `FaceLandmarkSource.ExternalMode` 동안 broker frame segmentation 제출을 중단한다. |
| 미지 Face3D schema가 검증 없이 제품·AI 입력으로 통과한다 | 수용 | schema 없음과 v1만 legacy로 허용하고, v2는 현 정책 검증을 유지하며, 그 밖의 schema는 저장 원본을 보존하되 제품 metric과 AI prompt에서는 차단한다. |
| 닫기와 업로드가 경합해 원본 파일을 먼저 지울 수 있다 | 수용 | 업로드 중 닫기는 abandon만 표시하고, 업로드 reader가 끝난 뒤 완료 경로에서 임시 파일을 삭제한다. |

이번 반영에서 다음 항목은 범위를 확대하지 않는다.

- 10Hz React 갱신, mask 복제, 중복 landmark 처리 같은 성능 항목은 계측값 없이 구조를 바꾸지 않고 실기기 fps·RSS·thermal 측정 단계에서 우선순위를 정한다.
- pose·confidence·Apple/C# 튜닝 상수 통합은 독립 계약 정리 작업으로 분리한다.
- `OnDisable` terminal 보강, native sync 세부 사유 노출, JSON 제어문자 escape는 이번 확정 결함 수정과 별도 후속 항목으로 남긴다.
- C#과 TS의 양방향 fixture 생성은 유효한 재발 방지 방향이지만, 이번 변경에서는 경계값별 focused 계약 테스트와 정적 wiring guard를 먼저 추가한다.

앱·UnityFramework 빌드 없이 수행한 현재 작업 트리의 focused 검증은 다음과 같다.

- 모바일 TypeScript typecheck 통과
- 모바일 Face3D·통합 lifecycle 계약 테스트 통과
- 모바일 얼굴비율 왜곡 회귀 테스트 통과
- native/Unity wiring 정적 계약 테스트 통과
- 백엔드 세로비율·Face3D 저장/AI payload focused 테스트 `21 passed`
- Unity 생성 response file 기준 `Aura.Face3D`, `AuraMediaPipeGraft`, `Assembly-CSharp` 컴파일 통과
- `PartialProductBurstClampsFinalizationOvershootToPolicyWindow`를 포함한 Unity focused 계약 테스트 3개 통과

이 반영 후에도 제품 기본 프레임 수 결정은 바뀌지 않는다. 5-of-8/500ms는 기능 후보이며, 단일 프레임은 진단 전용이다. 30프레임 대비 반복성·실패율·지연의 사전 등록 기준을 실기기에서 통과하기 전에는 기존 30프레임 경로를 기본값으로 유지한다.

---

## 1. 현재 구현과 Git 이력에서 확인된 사실

### 1.1 구현 착수 시 이미 존재했던 기능

| 영역 | 착수 전 구현 | 재사용 지점 |
|---|---|---|
| Apple 헤어라인 분석 | 촬영된 사진의 hair/skin semantic matte로 실제 헤어라인을 사후 검출 | `apps/mobile/ios/AURA/AURAFaceRatioHairline.m` |
| 네이티브 촬영 게이트 | 얼굴 위치·정면·거리·카메라 안정성으로 셔터를 차단 | `apps/mobile/src/features/face-capture/services/faceCaptureGreenlight.ts` |
| 실시간 품질 정책 선례 | 조정값을 frozen limits에 모으고 `minStableDurationMs: 400`, 해상도 640×480 하한을 paired telemetry로 관리 | `apps/mobile/src/features/face-capture/services/makeupFeedbackRealtimeQuality.ts` |
| Unity 실시간 세그멘테이션 | AR 카메라 CPU 이미지에서 hair와 face skin 클래스를 12fps 기본값으로 추론 | `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/SegmentationSource.cs` |
| Unity 원본 프레임 획득 | `ARCameraManager.TryAcquireLatestCpuImage()` 직접 호출자가 3곳이라 동일 프레임 공유가 보장되지 않았음 | `FaceLandmarkSource.cs`, `E7VisionLipBoundaryRuntime.cs`, `E7HandOcclusionRuntime.cs` |
| Unity 동기화 내보내기 | 화면 이미지와 선택된 ARFace 메시·투영 정점을 한 요청으로 내보내지만, 이미지는 `ReadPixels` 결과이며 `XRCpuImage` 구현 예시는 아님 | `apps/unity/MakeupAR/Assets/Scripts/E7SynchronizedCaptureExporter.cs` |
| Face3D 측정 | 유효 프레임 20개 이상, 목표 30개를 집계해 프로필 생성 | `apps/unity/MakeupAR/Assets/Scripts/Face3DSessionController.cs` |
| Face3D 지표 계산 | 단일 `Face3DMeshSnapshot`을 지표 값으로 변환하는 순수 평가기 | `apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DMetricEvaluator.cs` |
| RN↔Unity 브리지 | 일반 메시지 전달과 Face3D/E7 캡처 이벤트 전달 | `apps/unity/MakeupAR/Assets/Scripts/RNBridge.cs`, `apps/mobile/src/features/ar/services/unityMakeupBridge.ts` |

### 1.2 구현 착수 시 없었던 기능

- 촬영 전 실제 헤어라인 상태를 안내하되 셔터 조건에는 넣지 않는 실시간 advisory
- 이미지와 ARFace 메시를 하나의 `captureId`와 타임스탬프로 묶는 제품용 계약
- 같은 native `ARFrame`의 `capturedImage`를 최종 분석 사진으로 저장하고 broker token과 연결하는 제품용 캡처 경로
- micro-burst와 정확히 한 프레임을 구별하는 Face3D 프로필 계약
- 통합 결과를 받아 사진 확인 후 별도 `Face3DMeasurement` 화면을 건너뛰는 라우팅
- 5/8프레임 micro-burst와 단일 프레임의 반복성, ARKit 이미지 색 정확도에 대한 실기기 출시 게이트
- `XRCpuImage`와 ARFace가 같은 ARKit 센서 프레임에서 왔음을 증명하는 공통 native frame token/timestamp 계약

### 1.3 관련 Git 이력

- `e1ed2be3` — Apple semantic matte 헤어라인 밑작업
- `f9844b54` — Apple semantic matte 헤어라인 검출 구현
- `7c26cd91` — Face3D Lab, ARFace 메시, E7 동기화 내보내기 통합
- `e23e1bb9` — 현재 Unity AR 세그멘테이션 계열이 포함된 통합 이력

이 이력은 두 기능이 완전히 존재했다가 삭제된 것이 아니라, **사후 헤어라인 분석·순차 Face3D 측정·검증용 동기화 내보내기라는 각각의 재료가 따로 구현된 상태**임을 보여준다.

---

## 2. 목표, 비목표, 성공 기준

### 2.1 목표

- `face_analysis` 카메라에서 헤어라인 상태를 촬영 전 소프트 넛지로 안내하되, 헤어라인만으로 셔터를 잠그지 않는다.
- 촬영 후 실제 H를 검출한 경우에만 상안부와 H 의존 결과를 계산하고, H가 없거나 신뢰도가 부족하면 해당 결과를 생략한다.
- 앞머리·모자·조명·움직임처럼 사용자가 고칠 수 있는 구체적 원인이나 일시적 segmentation 실패가 있을 때만 재촬영을 최대 한 번 제안한다.
- 한 번의 셔터로 이미지 1장, 헤어라인 판정, 2D/색 입력, 짧은 ARFace micro-burst 3D 프로필을 생성한다.
- 이미지와 모든 파생 결과를 동일한 `captureId`로 묶는다.
- 캡처 이미지와 ARFace 메시가 공통 native sensor clock 또는 frame token으로 연계됐는지 확인하고, 증명할 수 없거나 허용 범위 밖이면 자동 재시도한다.
- 기존 갤러리 입력과 다른 촬영 유형은 변경하지 않는다.
- 실패하거나 미지원이면 기존 네이티브 사진 + 30프레임 Face3D 흐름으로 되돌릴 수 있다.

### 2.2 비목표

- `AVCapturePhotoOutput`과 Unity ARKit을 동시에 구동하지 않는다.
- raw TrueDepth depth map을 제품 프로필에 저장하거나 업로드하지 않는다.
- ARFace 원시 vertex 배열과 segmentation 원본 마스크를 백엔드에 업로드하지 않는다.
- 단일 프레임 또는 micro-burst 결과를 임상·의학적 측정이나 절대 mm 값으로 표현하지 않는다.
- 다른 촬영 유형인 `makeup_feedback`, `hair_analysis`, `personal_color`의 카메라를 통합 화면으로 이관하지 않는다.
- 기존 E7 검증 아티팩트의 파일명·스키마를 통합 캡처 계약으로 재사용하지 않는다.

### 2.3 출시 승인 완료 정의

코드 구현 완료와 별개로 다음 항목이 모두 충족돼야 제품 출시 승인을 완료한 것으로 본다.

- 앞머리·모자로 헤어라인이 가려져도 헤어라인 advisory만 표시하고, 얼굴·자세·카메라 품질 조건을 만족하면 셔터는 활성화된다.
- 촬영 후 고신뢰 실제 H가 있으면 상안부를 포함한 전체 세로 비율을 생성한다.
- 촬영 후 실제 H가 없으면 idx-10 등 대리점을 사용하지 않고 상안부·얼굴 세로 길이·3분할 우세 판정과 관련 AI 서사를 생략한다. 중안부·하안부처럼 H에 의존하지 않는 결과만 제공하고 이유를 고지한다.
- 교정 가능한 실패 원인이 있으면 재촬영을 한 번만 제안하고, 원인이 불명확하거나 이미 한 번 재시도했으면 반복 권고하지 않는다.
- 결과 이미지 파일이 정확히 한 개 생성된다.
- 기능 플래그의 비교 후보 Face3D 결과가 `sampleMode: "micro_burst"`, `validFrameCount >= 5`, `targetFrameCount: 8`이고 500ms 안에 수집된다.
- Lab의 정확히 한 프레임 비교 모드는 `sampleMode: "single_frame"`, `validFrameCount: 1`, `targetFrameCount: 1`로 명확히 구별된다.
- 이미지·세그멘테이션·ARFace 스냅샷이 동일 `captureId`를 사용한다.
- image·ARFace는 공통 native sensor clock 기준 오차가 계약 상한 이내임을 런타임 증거로 확인한다. image·segmentation token이 다르면 헤어라인만 생략하고 캡처 전체를 실패시키지 않는다.
- 사진 확인에서 다시 촬영하면 이미지와 Face3D 프로필이 함께 폐기된다.
- 사진 확인 후 별도 3D 측정 화면 없이 분석 로딩으로 이동한다.
- 통합 기능 플래그를 끄면 현재 네이티브 사진 + 30프레임 Face3D 흐름이 그대로 동작한다.
- 헤어라인 advisory 오탐, 실제 H 검출 누락, 색차, 해상도, cold/warm TTI, 메모리·발열 기준을 별도 validation set에서 통과한다.

---

## 3. 확정 아키텍처

```text
React Native UnifiedFaceCaptureScreen
                  │ start / capture / cancel
                  ▼
       RNBridge + UnityMakeupBridge
                  │
                  ▼
       UnifiedFaceCaptureController
          ├─ FaceCameraFrameBroker (유일한 XRCpuImage 획득자)
          │    ├─ FaceLandmarkSource / SegmentationSource
          │    │    └─ camera token·sensor timestamp가 보존된 입력
          │    ├─ E7VisionLipBoundaryRuntime
          │    └─ E7HandOcclusionRuntime
          ├─ iOS ARKit native provider
          │    └─ 같은 ARFrame의 capturedImage + ARFaceAnchor
          │         → 고정 anchor JPEG 1장 → 2D·색 입력
          ├─ ARFaceManager
          │    └─ native ARFrame timestamp와 연계된 ARFace 5~8개
          │         → Face3DMetricEvaluator → median/MAD 집계
          └─ UnifiedFaceCaptureResult
                  │ captureId + timestamps + imageUri + Face3DProfile
                  ▼
     uploadFaceCaptureImage → 확인 화면 → 분석 로딩
```

### 3.1 카메라 소유권

- 통합 화면이 활성화된 동안 Unity ARKit만 전면 카메라를 소유한다.
- 네이티브 `AURARealtimeFaceCaptureView`를 같은 화면 뒤에 마운트하거나 숨겨서 실행하지 않는다.
- Unity 종료·일시정지와 RN 화면 이탈은 하나의 idempotent finalizer로 정리한다.
- 앱 백그라운드, 권한 철회, Unity unmount, 재촬영, 성공 완료가 모두 같은 정리 함수를 사용한다.

### 3.2 동기화 정의

Unity callback 관찰 시각이 가깝다는 사실만으로 동일 센서 프레임을 증명하지 않는다. 같은 callback에서 만든 `cameraObservedAtMs`와 `anchorFaceObservedAtMs`는 거의 항상 작아질 수 있으므로 acceptance metric으로 금지한다.

제품 동기 계약은 다음과 같다.

- `cameraFrameToken`: 단일 획득자 `FaceCameraFrameBroker`가 새 `XRCpuImage.timestamp`마다 발급하는 불변 token
- `cameraSensorTimestampMs`: `XRCpuImage.timestamp`를 밀리초로 변환한 센서 시각
- `segmentationFrameToken` / `segmentationSensorTimestampMs`: segmentation이 실제 사용한 입력 frame의 token과 센서 시각. 결과가 없으면 생략할 수 있다.
- `faceNativeFrameToken` 또는 `faceNativeTimestampMs`: 동일 `ARSession/ARFrame`에서 face anchor와 연계된 native frame 식별자 또는 센서 시각
- `maxAbsFaceSensorDeltaMs`: anchor image의 센서 시각과 micro-burst ARFace 표본들의 공통 native clock 기준 최대 절대 차이
- `cameraObservedAtMs`, `faceObservedAtMs`, `segmentationCompletedAtMs`: 지연 진단용 Unity monotonic 시각. 동기 acceptance에는 사용하지 않는다.

불변식:

1. 실제 H를 채택하려면 `cameraFrameToken == segmentationFrameToken`이어야 한다. 다른 token이거나 segmentation 결과가 없으면 delta가 작아도 H를 만들지 않고 `omitted`로 처리하되, 이미지·3D 캡처 전체를 실패시키지 않는다.
2. image와 ARFace는 동일 native frame token이거나, 같은 native sensor clock으로 계산한 `abs(cameraSensorTimestampMs - faceNativeTimestampMs)`가 사전 등록 상한 이내여야 한다.
3. ARFoundation 공개 API만으로 face anchor의 native frame 식별자를 얻을 수 없다면 Unity 관찰 시각으로 대체하지 않는다. Gate 0을 실패시키고 iOS ARKit plugin에서 `ARFrame.timestamp`, `capturedImage`, face anchor를 한 payload로 내보낸다.
4. 기존 `SegStaleMs = 600`은 지연 표시 clock 기준 렌더링 정책이다. 캡처 acceptance 상한으로 복제하지 않고, clock 의미를 명시한 공통 timing policy로 이동한 뒤 legacy 동작을 회귀 테스트한다.

### 3.3 원본 이미지 정책

- `E7SynchronizedCaptureExporter`의 `ReadPixels` 결과는 최종 색 분석 이미지로 사용하지 않는다.
- E7 exporter의 `ReadPixels`는 센서 이미지 source가 아니다. MediaPipe용 CPU image 획득·lifetime·frame token은 `FaceCameraFrameBroker` 한 곳에서 관리하고 landmark·segmentation·E7 runtime은 borrowed frame 구독자로 둔다.
- HUD, Unity 렌더링, 색 보정 효과가 들어갈 수 있는 화면 캡처 대신 고정 anchor의 `ARFrame.capturedImage`를 Core Image로 upright·non-mirrored 정규화해 저장한다.
- orientation과 mirror 정보를 결과 계약에 명시하고, 저장 직전에 EXIF-upright 픽셀 방향으로 정규화한다.
- JPEG 품질과 해상도는 실기기 성능 측정 후 확정한다. 최초 구현은 원본 CPU 이미지 종횡비를 유지한다.

---

## 4. 데이터 계약

### 4.1 통합 요청

```ts
type UnifiedFaceCaptureRequest = {
  requestId: string;
  gateVersion: 'face3d-gate-v2';
  hairlinePolicy: 'soft_nudge_post_capture_omit';
  collectionPolicyId:
    | 'unified-micro-burst-5of8-v1'
    | 'diagnostics-exact-1-v1'
    | 'diagnostics-exact-3-v1'
    | 'diagnostics-exact-5-v1'
    | 'diagnostics-exact-8-v1'
    | 'diagnostics-exact-12-v1'
    | 'diagnostics-exact-30-v1';
  sampleMode: 'micro_burst' | 'single_frame';
  minimumValidFrames: number;
  targetValidFrames: number;
  maximumDurationMs: number;
  maxAbsFaceSensorDeltaMs: number;
};
```

기능 플래그의 첫 비교 요청은 `unified-micro-burst-5of8-v1 = micro_burst / minimum 5 / target 8 / maximum 500ms`다. exact 1/3/5/8/12/30은 Lab과 비교 실험에서만 요청할 수 있도록 diagnostics gate로 제한한다. 숫자 조합을 임의로 받지 않고 policy ID와 exact tuple을 함께 검증한다. 이 요청은 기존 `Face3DSessionController.ParseStartRequest()`로 보내지 않는다. legacy v1의 `maximumDurationMs >= 1000`, `targetValidFrames >= 20` validator와 `face3d-gate-v1`은 그대로 보존한다. Gate 6에서 최종 수를 고르면 새 immutable product policy ID를 추가하며 기존 ID의 뜻을 바꾸지 않는다.

### 4.2 실시간 품질·헤어라인 advisory 이벤트

```ts
type HairlineAdvisoryStatus =
  | 'likely_visible'
  | 'likely_occluded'
  | 'environment_issue'
  | 'unknown';

type HairlineActionableReason =
  | 'hairline_occluded'
  | 'low_light'
  | 'motion'
  | 'segmentation_temporarily_unavailable';

type UnifiedFaceCaptureGateEvent = {
  type: 'unified_face_capture_gate';
  requestId: string;
  faceReady: boolean;
  poseReady: boolean;
  cameraReady: boolean;
  hairline: {
    status: HairlineAdvisoryStatus;
    confidence: number | null;
    stableDurationMs: number;
    frameToken: string | null;
    sensorTimestampMs: number | null;
    actionableReason?: HairlineActionableReason;
    messageCode?:
      | 'show_hairline_for_full_ratio'
      | 'improve_lighting'
      | 'hold_still';
  };
  // 헤어라인 advisory는 이 값에 참여하지 않는다.
  finalCaptureGreenlight: boolean;
};
```

`finalCaptureGreenlight`는 헤어라인과 분리한다. 현재 구현 후보는 native provider 가용성·얼굴 존재·단일 얼굴·자세로 계산하고, 기존 native 경로의 거리·노출·blur·카메라 안정성 조건은 기본 on 전에 같은 이벤트 계약에 추가한다. 헤어라인 상태는 같은 이벤트에 실리지만 어떤 경우에도 셔터 잠금 조건이 아니다.

### 4.3 통합 결과

```ts
type UnifiedFaceCaptureResult = {
  schemaVersion: 'aura.unified-face-capture.v1';
  requestId: string;
  captureId: string;
  status: 'full_success' | 'partial_success';
  image: {
    uri: string;
    width: number;
    height: number;
    format: 'jpg' | 'png';
    orientation: 'upright';
    mirrored: false;
  };
  timestamps: {
    cameraFrameToken: string;
    cameraSensorTimestampMs: number;
    cameraObservedAtMs: number;
    segmentationFrameToken?: string;
    segmentationSensorTimestampMs?: number;
    faceNativeFrameToken?: string;
    anchorFaceNativeTimestampMs?: number;
    faceObservedAtMs: number;
    burstStartObservedAtMs: number;
    burstEndObservedAtMs: number;
    maxAbsFaceSensorDeltaMs: number;
  };
  hairline: {
    provider:
      | 'apple_semantic_matte'
      | 'mediapipe_selfie_multiclass'
      | 'none';
    outcome:
      | 'detected_high_confidence'
      | 'detected_low_confidence'
      | 'omitted';
    analysisEligible: boolean;
    confidence: number | null;
    normalizedPoint?: {x: number; y: number};
    retryRecommendation: {
      recommended: boolean;
      attemptCount: 0 | 1;
      reason?: HairlineActionableReason;
    };
  };
  face3d: Face3DProfile;
  cameraMetadata?: {
    provider: 'arfoundation';
    exposureDurationMs?: number;
    iso?: number;
    whiteBalanceAvailable: boolean;
  };
  warnings: string[];
};
```

`detected_low_confidence`는 실제로 검출된 H이므로 디버그·보정 자료와 선택적 참고 표시에 보존할 수 있다. 그러나 검증 전에는 `analysisEligible: false`이며 상안부·얼굴 세로 길이·3분할 우세 판정·AI 추천에 사용하지 않는다. `omitted`에는 normalized H가 없어야 한다. 어떤 실패 원인에서도 고정 MediaPipe 정점 같은 proxy를 H로 채우지 않는다.

### 4.4 Face3D 소수 프레임 계약

기존 `aura.face3d-profile.v1`은 20~30프레임 집계를 전제로 운영되고 있다. micro-burst와 정확히 한 프레임을 기존 프로필처럼 보이게 만들지 않는다.

권장 변경:

```ts
type Face3DProfileV2 = {
  schemaVersion: 'aura.face3d-profile.v2';
  source: 'arkit_face_mesh';
  collectionPolicyId: string;
  sampleMode: 'micro_burst' | 'single_frame';
  aggregation: 'median_mad' | 'none';
  gateVersion: 'face3d-gate-v2';
  validFrameCount: number;
  targetFrameCount: number;
  completionRatio: number;
  confidenceCalibrationStatus: 'uncalibrated' | 'calibrated';
  captureWindowMs: number;
  topologyFingerprint: string;
  metrics: Face3DMetrics;
  warnings: (
    | 'micro_burst_target_not_reached'
    | 'single_frame_unaggregated'
    | string
  )[];
};
```

마이그레이션 규칙:

- RN 파서는 v1과 v2를 모두 읽는다.
- v1은 기존 30프레임 경로에서 계속 생성한다.
- v2는 통합 micro-burst와 Lab 단일 프레임 경로에서 생성한다.
- v1 요청은 legacy validator, v2 요청은 unified validator만 처리하며 버전과 정책을 교차 조합하면 거부한다.
- product `unified-micro-burst-5of8-v1`은 `aggregation: median_mad`, 목표 8, 최소 5, 최대 500ms를 강제한다. diagnostics exact policy는 이름에 적힌 target과 `minimum == target`을 강제한다.
- `single_frame`은 `aggregation: none`, 1/1을 강제하고 `single_frame_unaggregated`를 반드시 남긴다.
- 백엔드 `measurements` envelope 버전은 유지한다. 현재 백엔드는 face3d profile schema를 검사하지 않고 metrics만 정규화하므로, v2의 `collectionPolicyId`, `sampleMode`, `aggregation`, frame count와 calibration 상태를 보존하는 metadata 계약을 새로 추가한다.
- 즉시 막히는 지점은 클라이언트 `faceAnalysisMeasurements.ts`가 v1 전용 `parseFace3DProfile()`을 재사용하는 부분이다. 이 파서를 먼저 v1/v2 union으로 고친다.
- micro-burst는 현재 median/MAD 집계기를 새 5/8 정책으로 재사용하되 반복성 자료로 다시 보정한다.
- 단일 프레임 confidence는 기존 MAD 기반 confidence를 재사용하지 않으며, 제품 AI 해석에 사용하지 않는다.

### 4.5 적절한 3D 촬영 프레임 수 판단

**판단: 8프레임은 가장 먼저 검증할 합리적인 engineering candidate지만, 아직 제품 기본값으로 승인할 근거는 없다.** 이미지와 색 분석은 계속 한 장만 사용한다. 기능 플래그 안의 첫 구현은 목표 8, 최소 5, 최대 500ms로 만들고, 출시 기본은 30프레임 기준선과의 사전 등록 비교를 통과한 수로 확정한다.

| 유효 ARFace 수 | 판단 | 근거 |
|---:|---|---|
| 1 | Lab 전용, 제품 기본값으로 부적절 | 순간 메시 노이즈·미세 표정·트래킹 오차를 구분할 방법이 없고 MAD/이상치 제거가 불가능하다. |
| 3 | 제품 후보에서 제외 | 중앙값은 가능하지만 1개 오염 시 표본의 1/3이 흔들리고, 반복성 추정이 취약하다. |
| 5 | 8프레임 요청의 degraded 성공 하한 후보 | 중앙값과 MAD 계산은 가능하지만, 정확성 하한은 별도 실측으로만 승인한다. |
| 8 | 첫 engineering candidate | 30fps에서 약 233ms로 UX 이점이 예상되고 소수 outlier를 견딜 여지가 있다. 이것은 통계적 충분성의 증명이 아니다. |
| 12 | 상향 후보 | 8보다 반복성이 유의하게 좋아지고 500ms·TTI 기준을 지킬 때 선택한다. |
| 20/30 | 기준선·fallback | 현재 가장 보수적인 집계이며 반복성 비교 기준으로 유지한다. 한 번 촬영처럼 느껴지는 UX에는 과하다. |

현재 `Face3DRobustMetricAggregator`의 confidence는 아래처럼 선언한 target 수에 직접 의존한다.

```text
confidence = coverage * inlierRatio * stability
coverage = inlierCount / targetFrameCount
```

`targetFrameCount`를 30에서 8로 낮추면 같은 물리적 표본의 coverage가 상승한다. 이는 “요청한 수를 채웠다”는 완료도이지 측정 정확도가 높아졌다는 증거가 아니다. 또한 500ms micro-burst의 표본은 강하게 상관되어 MAD≈0이 쉽게 나오므로 stability도 과대평가될 수 있다. 따라서 기존 confidence 0.5 문턱은 frame 수 선택 근거로 사용하지 않으며, v2 confidence는 30프레임 대비 bias·반복성·실패율 자료로 다시 유도하기 전까지 `uncalibrated`로 표시하고 제품 AI 입력에서 제외한다.

수집 방식:

1. 셔터를 누르면 500ms capture window를 시작한다.
2. pose·neutral expression·topology gate를 통과한 ARFace만 수집한다.
3. 네 번째 유효 ARFace부터 segmentation이 실제 수락한 첫 shared broker token을 결과와 무관하게 고정한다. 수집 종료까지 수락 token이 없으면 네 번째 이후 첫 native sample을 고정하고 H는 생략한다. 고정 sample의 `ARFrame.capturedImage`와 face anchor가 동일 native payload임이 증명된 경우에만 anchor image로 저장한다.
4. 유효 ARFace 8개가 모이면 즉시 종료한다.
5. 500ms 종료 시 5~7개면 median/MAD로 성공시키되 `micro_burst_target_not_reached`를 남긴다.
6. 5개 미만이면 부분 3D 결과를 만들지 않고 재촬영한다.

30fps에서는 8개가 약 233ms, 60fps에서는 약 117ms 범위에 들어온다는 계산이 8의 UX 가설이다. 실제 ARFace callback 간 상관·누락·neutral gate 탈락을 포함한 시간은 실기기로 측정한다. 5/8/12 각각은 독립 3×3 manifest로 검증하며, 같은 validation 결과를 보고 target이나 합격선을 다시 조정하지 않는다.

---

## 5. 헤어라인 소프트 넛지와 촬영 후 보고서 정책

### 5.1 검출 입력

- `SegmentationSource`의 face-skin confidence channel
- `SegmentationSource`의 hair confidence channel
- 같은 프레임 계열의 MediaPipe 얼굴 랜드마크
- 얼굴 좌우 폭, glabella 근처 기준점, 상부 이마 스캔 범위
- 얼굴 pose
- 향후 일반 품질 보강에서 연결할 카메라 안정성·노출·blur 신호

`SegmentationSource`는 현재 RGBA packed mask를 내부 history에 보관하지만 외부에서 CPU 마스크를 안전하게 읽는 API가 없다. 안내와 촬영 후 H 검출에 재사용할 수 있도록 다음 immutable snapshot API를 추가한다.

```csharp
public readonly struct HairlineMaskSnapshot
{
    public readonly string FrameToken;
    public readonly double SensorTimestampMs;
    public readonly int InputWidth;
    public readonly int InputHeight;
    public readonly int MaskWidth;
    public readonly int MaskHeight;
    public readonly int RotationDegrees;
    public readonly byte[] FaceSkin;
    public readonly byte[] Hair;
    public readonly Matrix4x4 ImageToMask;
}
```

- 내부 버퍼를 그대로 외부에 노출하지 않는다.
- `SegmentationSource`의 재사용 버퍼는 `_resultLock` 안에서 필요한 두 channel만 깊은 복사한다.
- 새 결과가 없거나 stale이면 `TryGetHairlineMaskSnapshot()`은 false를 반환한다.
- 마스크가 회전 공간에 있으므로 원본 입력 크기와 rotation을 누락하지 않는다.
- 구현이 `#if MEDIAPIPE` 안에 있으므로 동일 public API의 `#else` unavailable stub을 제공해 비-MediaPipe 빌드를 보존한다.
- segmentation이 비활성·실패한 경우 피부 전체로 간주하는 렌더링 폴백을 H 검출에 적용하지 않는다. 셔터는 헤어라인과 무관하게 유지하고, 촬영 후 H만 생략한다.

### 5.2 경계 검출

기존 `AURAFaceRatioHairline.m`의 경계 탐색 원리를 C# 순수 함수로 옮기되 Apple matte 전용 코드를 직접 공유하지 않는다.

1. 얼굴 폭과 이마 기준점으로 normalized forehead ROI를 만든다.
2. ROI의 여러 세로 열에서 위쪽 hair score와 아래쪽 face-skin score가 교차하는 후보를 찾는다.
3. 후보가 있으면 후보 수, 좌우 coverage, 후보 Y 표준편차, boundary gradient, 이마 skin fraction을 계산한다.
4. 후보들의 중앙값을 실제 H로 선택한다.
5. pose 품질을 포함해 confidence를 계산한다.
6. 실제 H가 glabella보다 충분히 위에 있는지 확인한다.
7. 초기 ROI에서 후보가 없고 상단 경계에 hair/skin 전이가 이어지는 경우에만 ROI를 위쪽으로 한 번 확장해 재탐색한다. 두 번째 실패 뒤에는 위치를 추정하지 않는다.

Apple 코드는 고해상도 사진에 포함된 `AVSemanticSegmentationMatte`를 읽는 무상태 사후 함수이고, Unity 입력은 기본 256px·12fps MediaPipe Selfie Multiclass다. 아래 Apple 값은 알고리즘 탐색의 seed일 뿐 통합 estimator의 검증된 계약이 아니다.

```text
Apple seed only:
candidateCount >= 8
skinFraction >= 0.20
H.y <= G.y - faceWidth * 0.02
confidence weights = 0.40 / 0.30 / 0.20 / 0.10
```

Apple의 `0.70`은 TS full/partial 결과 tier이고 native visible gate가 아니다. `0.45`는 기각·근사 fallback 경계이지 hysteresis exit가 아니다. `0.55`와 연속 5샘플은 현재 코드에 없으므로 계승값으로 사용하지 않는다.

통합 estimator의 모든 조정값은 `UNIFIED_FACE_CAPTURE_QUALITY_LIMITS` 한 객체에 모은다. 안정성은 세그멘테이션 cadence와 무관하게 `minStableDurationMs`로 판단하며 첫 seed는 기존 하우스 패턴과 같은 400ms다. 값은 calibration set에서 정하고 validation set을 보기 전에 freeze한다. overall 및 하위군 advisory precision/recall, 실제 H 검출 누락률과 H 오차를 함께 보고하며, 합성 fixture만으로 threshold를 승인하지 않는다.

confidence의 feature 구성 후보:

```text
0.40 * boundarySharpness
+ 0.30 * candidateConsistency
+ 0.20 * foreheadSkinVisibility
+ 0.10 * poseQuality
```

현재 Apple 구현은 후보 수가 부족하면 `no_candidates`로 먼저 반환하고 그 뒤 단계에서만 `skinFraction`을 계산한다. 따라서 “후보 없음 + skinFraction”만으로 앞머리 가림과 경계 부재를 이미 구분할 수 있다는 주장은 현재 코드상 사실이 아니다. 새 구현도 영상만으로 해부학적 상태를 단정하지 않고, 검출 실패는 최종적으로 `omitted` 하나로 수렴시킨다.

### 5.3 촬영 전 안내와 촬영 후 결정

촬영 전에는 고칠 수 있는 원인이 충분히 관측됐을 때만 구체적인 넛지를 표시한다. 원인을 모르면 해부학적 상태를 추측하거나 반복 행동을 요구하지 않는다.

| 상태 | 내부 코드 | 사용자 문구 | 셔터 |
|---|---|---|---|
| 실제 경계가 안정적으로 보일 가능성 높음 | `likely_visible` | 별도 경고 없음 | 일반 품질 조건에 따름 |
| 앞머리·모자 가림 가능성이 높음 | `likely_occluded` | `앞머리나 모자를 정리하면 이마 비율까지 측정할 수 있어요` | 헤어라인 때문에 잠그지 않음 |
| 저조도·움직임 등 교정 가능한 환경 문제 | `environment_issue` | **확장 계약, 현재 Unity producer 미구현.** 구현 후 원인별로 `조명을 밝게 해주세요` 또는 `잠시 움직이지 말아주세요` | 헤어라인 때문에 잠그지 않음 |
| 원인 불명·세그멘테이션 미가용 | `unknown` | 해부학적 원인 문구 없음 | 헤어라인 때문에 잠그지 않음 |

최종 셔터 조건:

```text
faceReady
&& poseReady
&& cameraReady
```

헤어라인 advisory는 이 식에 들어가지 않는다. 얼굴 없음·다중 얼굴·심한 자세 이탈·해상도 부족처럼 현재 일반 품질 정책이 막는 조건은 계속 hard gate다.

`expressionReady`를 RN 셔터의 새 hard gate로 만들지 않는다. neutral expression은 기존 `Face3DNeutralExpressionGate`를 재사용해 셔터 이후 micro-burst의 **프레임 admission**에 적용한다. neutral 표본이 최소 수에 못 미치면 무표정 안내와 재시도를 제공한다.

촬영 후에는 저장 이미지와 같은 frame token의 segmentation 또는 legacy Apple semantic matte에서 얻은 **실제 경계 H**만 판정한다.

| 촬영 후 결과 | 보고서 처리 | 사용자 고지 |
|---|---|---|
| 고신뢰 실제 H | 상안부·중안부·하안부, H 의존 얼굴 길이·우세 판정과 관련 AI 분석 허용 | 전체 비율을 측정했다는 일반 표시 |
| 저신뢰 실제 H | H 후보는 보정 자료와 선택적 참고 표시에만 보존. 검증 전에는 상안부·H 의존 얼굴 길이·우세 판정·AI 분석에서 제외 | `헤어라인 신뢰도가 낮아 이마 비율은 결과에 반영하지 않았어요` |
| 유효한 H 없음 | `provider: none`, `outcome: omitted`; 중안부·하안부처럼 H 비의존 결과만 유지 | `헤어라인을 확인하기 어려워 이마 비율은 제외했어요` |

idx-10 등 고정 정점은 실제 헤어라인이 아니므로 어떤 실패 구간에서도 권위 있는 H로 승격하지 않는다. “평균에서 얼마나 다른가”를 설명하는 기능에 평균에 가까운 proxy를 넣으면 편차가 큰 사용자에게 체계적으로 반대 방향의 설명을 만들 수 있기 때문이다.

재촬영은 결과를 본 뒤 다음 식으로만 권고한다.

```text
retryRecommended = actionableReason != null && retryAttemptCount < 1
```

- 현재 producer가 실제로 내보내는 교정 가능 원인은 앞머리·모자 가림 가능성과 일시적 segmentation 미가용이다. 저조도·움직임은 일반 품질 신호를 연결한 뒤 `environment_issue`로 확장하며, 일반 pose 실패는 hard gate가 촬영 전에 처리한다.
- 첫 촬영에서만 `조건을 바꾸면 이마 비율까지 측정할 수 있어요`와 선택형 재촬영을 제공한다.
- 한 번 재촬영한 뒤에도 H를 얻지 못하면 같은 권고를 반복하지 않고 부분 보고서를 생성한다.
- 원인이 불명확하면 처음부터 재촬영을 권고하지 않는다. 사용자가 일반 재촬영 버튼을 직접 선택하는 것은 막지 않는다.

### 5.4 단위 테스트

다음 합성 마스크와 계약 fixture를 코드에 포함한다.

- 얼굴 피부 위에 선명한 머리카락 경계 → `likely_visible`, 촬영 후 고신뢰 실제 H
- 이마 전체가 hair이고 독립 가림 특징이 충분함 → `likely_occluded`; 불충분하면 `unknown`
- hair/skin channel 없음 또는 stale timestamp → `unknown`, 셔터는 다른 일반 품질 조건에만 따름
- 후보가 좌우 일부에만 존재 → low confidence 또는 `omitted`, proxy 금지
- 초기 ROI 바로 위에 실제 경계가 있음 → 위쪽 1회 확장으로 검출
- 확장 ROI에도 후보가 없음 → `omitted`, 해부학 상태 추정 금지
- pose 초과 → 일반 pose hard gate로 final gate false. 헤어라인 원인으로 기록하지 않음
- 같은 confidence가 cadence 변화에도 400ms 전에는 advisory ready가 되지 않음
- 짧은 1회 실패에 advisory 문구가 깜빡이지 않는 time-based debounce
- 모든 hairline advisory 상태에서 일반 품질 조건이 true면 셔터 true
- 고신뢰 실제 H → 전체 세로 비율과 허용된 AI payload 생성
- 저신뢰 실제 H → 참고 데이터만 보존하고 H 의존 결과·AI payload 제외
- H 없음 → 중안부·하안부만 유지, `omitted`, 근사값 미생성
- 교정 가능한 원인 + 첫 실패 → 재촬영 제안, 두 번째 실패 → 제안 없음
- 원인 불명 실패 → 재촬영 강요 없음
- idx-10 proxy가 세로 비율·`dominantPart`·`faceLength`·AI payload에 들어가지 않는 회귀 테스트

---

## 6. 구현 단계

이 절의 `Files`와 체크리스트는 구현 착수 전 작업 분해를 보존한 기록이다. 실제 구현은 일부 파일을 합치거나 위치를 바꿨다.

- native bridge: `Assets/Plugins/iOS/AuraUnifiedFaceNativeCapture.mm`
- native provider: `Assets/Scripts/ARKitUnifiedFaceNativeCaptureProvider.cs`
- broker: `Assets/Scripts/MediaPipeGraft/ARwithFable/Face/FaceCameraFrameBroker.cs`
- controller: `Assets/Scripts/UnifiedFaceCaptureController.cs`
- 공용 snapshot factory: `Assets/Scripts/ARFaceMeshSnapshotFactory.cs`
- v2 collector·validator: `Assets/Scripts/Face3D/UnifiedFaceCaptureContracts.cs`

코드 구현 결과는 0.2 표를 기준으로 판단한다. 아래 미체크 항목에는 실제 미구현뿐 아니라 실기기·calibration·출시 승인 작업도 포함되므로, 체크박스 개수만으로 현재 코드 완성도를 해석하지 않는다.

### Phase -1 — 기준 동결과 수치 사전 등록

**목적:** 같은 데이터로 threshold를 만들고 통과 여부까지 판단하는 자기 인증을 막는다.

- [ ] 구현 시작 시 `git fetch origin` 후 `HEAD...origin/dev`를 기록한다. 2026-07-16 최종 값은 `0 19`이므로 코드 구현 전에 최신 dev를 rebase/merge 방식 중 팀 정책에 맞게 통합하고 사실표·대상 파일·feature flag 회귀를 다시 검증한다.
- [ ] `makeupFeedbackRealtimeQuality.ts`의 “limits 중앙화 + paired telemetry로만 완화” 규칙을 공통 evaluator로 추출한다. 통합 gate는 기존 base/makeup feedback gate와 독립적인 세 번째 greenlight를 만들지 않는다.
- [ ] calibration set과 validation set의 사람·세션을 분리한다. hairline calibration은 최소 30명, 최종 validation은 최소 60명이며 핵심 하위군별 최소 10개 유효 세션을 확보한다.
- [ ] 검증 하위군은 다음 6개를 데이터 확인 전에 고정한다. 소속은 서로 겹칠 수 있으며 각 하위군은 최소 10개 유효 세션을 갖는다: ① 어두운 머리색, ② 밝은색·회색·염색 머리, ③ 밝음·중간 피부톤, ④ 짙은 피부톤, ⑤ 일반적인 직선·곡선형 헤어라인, ⑥ M자·후퇴·성긴·삭발 상태. 가림·저조도·움직임은 인구 하위군이 아니라 별도 교란 조건으로 교차 적용한다.
- [ ] 실제 H 위치 오차는 수동 라벨된 독립 holdout을 기준으로 평가한다. Apple semantic matte는 paired pseudo-reference로 활용할 수 있지만 자동 정답으로 부르지 않는다.
- [ ] 아래 임시 수치를 **첫 데이터 수집 전에** 품질·퍼스널컬러 담당자가 승인한다. validation 결과를 본 뒤 같은 결과에 맞춰 수치를 이동하면 그 run은 무효로 하고 새 holdout set으로 다시 검증한다.

| 항목 | 사전 등록 임시 합격선 |
|---|---|
| H 채택 시 image↔segmentation | frame token 완전 일치 100%. 불일치 표본은 H만 `omitted` |
| image↔ARFace | 공통 native sensor clock 기준 p95 ≤ 33ms, max ≤ 50ms. 공통 clock 부재는 자동 실패 |
| 저장 이미지 해상도 | upright 결과 long side ≥ 1280px, short side ≥ 720px, 분석 얼굴 폭 ≥ 320px |
| 색 정확도 | 고정 광원·ColorChecker 기준 median ΔE00 ≤ 4, p95 ≤ 8이며 현 네이티브 사진보다 median이 1.0 초과 악화되지 않음 |
| 카메라 TTI | warm p95 ≤ 1.5초, Unity cold p95 ≤ 3.0초 |
| 정상 조건 capture 성공률 | validation set에서 ≥ 95% |
| 고신뢰 H 검출 누락 | 수동 라벨상 관측 가능한 H에서 overall ≤ 5%, 사전 정의 하위군별 ≤ 10% |
| 가림 advisory 오탐 | 실제 가림이 없는데 `likely_occluded`를 표시 ≤ 5% |
| 가림 advisory 정밀도 | `likely_occluded` 중 수동 라벨상 교정 가능한 가림 ≥ 90% |
| 보고서 안전성 | proxy가 H 의존 공식·AI payload에 들어간 비율 0%, analysis-ineligible H 누출 0% |
| 재촬영 정책 | 권고 최대 1회 100% 준수, 원인 불명 상태의 자동 권고 0% |
| 성능 | 10분 연속 preview 평균 ≥ 24fps, serious/critical thermal 0회, peak RSS 증가 ≤ 250MB |

위 숫자는 현재 코드가 이미 충족한다고 주장하는 값이 아니라, **실패할 수 있도록 미리 고정한 engineering gate**다. 첫 calibration 결과가 부적절함을 보이면 근거와 함께 다음 버전을 사전 등록하고 새 validation set에서 확인한다.

### Phase 0 — 실기기 동기·색 품질 feasibility spike

**목적:** 구조 전체를 바꾸기 전에 ARFoundation이 제공하는 실제 이미지 해상도, 타임스탬프, 색 품질을 확인한다.

**Files:**

- Create: `apps/unity/MakeupAR/Assets/Scripts/Face3D/UnifiedFaceCaptureDiagnostics.cs`
- Create: `apps/mobile/src/features/face-capture/services/unifiedFaceCaptureDiagnostics.ts`
- Create if required: `apps/mobile/ios/AURA/AURAUnifiedARFrameBridge.mm`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/RNBridge.cs`

- [ ] `XRCpuImage` frame token·sensor timestamp와 같은 native ARFrame의 face anchor token/timestamp를 최소 100회 기록한다.
- [ ] image↔segmentation token 일치율과 image↔ARFace native sensor delta의 min/median/p95/max를 기록한다.
- [ ] Unity callback 관찰 delta는 진단값으로만 기록하며 Gate 0 acceptance에 사용하지 않는다.
- [ ] ARFoundation만으로 공통 native clock을 얻을 수 있는지 먼저 증명하고, 불가능하면 iOS native ARKit bridge spike로 전환한다.
- [ ] gate 통과 후 500ms 안에 확보되는 유효 ARFace 수의 median/p5를 기록해 5/8 정책의 현실성을 확인한다.
- [ ] 고정 광원과 ColorChecker로 ARKit 원본 이미지·현재 네이티브 사진의 ΔE00를 계산한다. 육안 비교를 합격 근거로 사용하지 않는다.
- [ ] 퍼스널 컬러가 사용하는 white-balance/노출 metadata 가용성을 기록한다.
- [ ] Unity 화면 `ReadPixels`가 아니라 `ARFrame.capturedImage` 기반 JPEG를 실제로 열어 orientation·mirror를 확인한다.
- [ ] 저장 이미지 해상도와 얼굴 폭 px를 측정한다.
- [ ] Unity cold/warm start부터 첫 preview와 첫 stable gate까지 TTI를 측정한다.
- [ ] 10분 preview에서 fps·RSS·thermal state를 측정한다.

**Gate 0:**

- Phase -1의 동기·색·해상도·TTI·성능 수치 중 하나라도 실패하면 feature flag 출시와 기본 on을 중단한다. 코드 후보는 진단·보정 용도로만 유지하거나 기존 경로로 롤백한다.
- 공통 native frame 관계를 증명하지 못하면 관찰 시각 상한을 늘려 통과시키지 않고 iOS native ARKit plugin으로 전환한다.
- 정상 정면 조건에서도 500ms 안에 최소 5개를 안정적으로 확보하지 못하면 시간 상한을 조정하거나 현재 20/30 경로를 유지한다.
- 색·해상도가 떨어지면 “완전 동일 프레임” 요구와 분석 정확도 중 제품 우선순위를 명시적으로 결정하기 전까지 본 앱에 적용하지 않는다.

### Phase 1 — 계약과 feature flag

**Files:**

- Create: `apps/unity/MakeupAR/Assets/Scripts/Face3D/UnifiedFaceCaptureContracts.cs`
- Create: `apps/mobile/src/features/face-capture/services/unifiedFaceCaptureContract.ts`
- Create: `apps/mobile/src/features/face-capture/services/unifiedFaceCaptureContract.test.ts`
- Create: `apps/mobile/src/features/face-capture/services/unifiedFaceCaptureMode.ts`
- Create: `apps/unity/MakeupAR/Assets/Scripts/Face3D/UnifiedFaceCaptureQualityPolicy.cs`
- Create: `apps/mobile/src/features/face-capture/services/realtimeCaptureQualityPolicy.ts`
- Create: `apps/mobile/src/features/face-capture/services/realtimeCaptureQualityPolicy.test.ts`
- Modify: `apps/mobile/src/features/face-3d/types.ts`
- Modify: `apps/mobile/src/features/face-3d/services/face3DContract.ts`
- Modify: `apps/mobile/src/features/face-3d/services/face3DContract.test.ts`
- Modify: `apps/mobile/src/features/face-capture/services/makeupFeedbackRealtimeQuality.ts`
- Modify: `scripts/mobile/run-face3d-contract.mjs`

- [ ] 요청, gate, completed, blocked, cancelled 이벤트를 C#/TS에 동일하게 정의한다.
- [ ] `captureId`와 `requestId`를 모든 이벤트에 강제한다.
- [ ] Face3D v1/v2 파서를 함께 지원한다.
- [ ] v2에서 product `unified-micro-burst-5of8-v1=median_mad/5/8/500ms`와 diagnostics exact 1/3/5/8/12/30 조합을 policy ID별로 강제한다.
- [ ] legacy `Face3DSessionController`의 v1 validator와 기본 3000ms/20/30을 변경하지 않는다. 별도 unified v2 validator가 500ms/5/8과 Lab 1/1만 허용한다.
- [ ] `face3d-gate-v1`과 v2 policy, `face3d-gate-v2`와 legacy policy를 교차 요청하면 거부하는 테스트를 추가한다.
- [ ] 알 수 없는 스키마·음수 timestamp·image↔ARFace native sync 위반은 거부한다. image↔segmentation token 불일치는 유효한 partial 결과로 파싱하되 H 채택을 거부한다.
- [ ] 실시간 품질 공통 evaluator와 mode별 frozen limits를 분리해 기존 makeup-feedback 동작을 snapshot test로 보존한다.
- [ ] 통합 기능 플래그 기본값은 off로 둔다.

Run:

```bash
npm run test:face3d --prefix apps/mobile
npm run typecheck --prefix apps/mobile
```

### Phase 2 — 실시간 헤어라인 advisory와 촬영 후 H selector

**Files:**

- Create: `apps/unity/MakeupAR/Assets/Scripts/Face3D/HairlineVisibilityEstimator.cs`
- Create: `apps/unity/MakeupAR/Assets/Scripts/Face3D/HairlineAdvisoryStateMachine.cs`
- Create: `apps/unity/MakeupAR/Assets/Tests/Face3D/HairlineVisibilityEstimatorTests.cs`
- Create: `apps/unity/MakeupAR/Assets/Tests/Face3D/HairlineAdvisoryStateMachineTests.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/SegmentationSource.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/FaceLandmarkSource.cs`

- [ ] `SegmentationSource`에 immutable hair/face-skin snapshot API를 추가한다.
- [ ] snapshot은 `_resultLock` 안에서 깊은 복사하고 frame token·sensor timestamp·rotation·input/mask 크기를 포함한다.
- [ ] 비-MediaPipe build용 동일 API unavailable stub을 추가한다.
- [ ] `FaceLandmarkSource`에 같은 camera frame token의 랜드마크를 읽는 API를 추가한다. 지연 표시용 `PresentedTimestampMs`를 캡처 센서 시각으로 오해하지 않는다.
- [ ] ROI와 마스크 좌표 변환을 하나의 순수 입력 구조로 정규화한다.
- [ ] Apple feature 구성은 seed로만 사용하고 MediaPipe 라벨셋에 맞는 C# estimator를 구현한다.
- [ ] 초기 ROI 위에 경계가 이어질 가능성이 있을 때만 위쪽 ROI를 한 번 확장하고, 재탐색 실패 시 H를 추정하지 않는다.
- [ ] 모든 조정값을 `UNIFIED_FACE_CAPTURE_QUALITY_LIMITS`에 모으고 400ms time-based advisory enter/debounce를 구현한다.
- [ ] calibration/validation 사람을 분리하고 overall·6개 하위군 advisory precision/recall·H 검출 누락·H 오차를 산출한다.
- [x] `likely_visible`, `likely_occluded`, `unknown`을 분리한다. 영상으로 해부학 상태를 진단하는 상태는 만들지 않는다.
- [ ] 기존 low-light·motion 신호를 연결한 뒤에만 `environment_issue`를 실제 producer 상태로 활성화한다.
- [ ] 모든 advisory 상태에서 헤어라인을 제외한 일반 품질 조건이 같으면 `finalCaptureGreenlight`도 같다는 계약 테스트를 추가한다.
- [ ] face lost, camera switch, app background에서 advisory history를 즉시 초기화한다.
- [ ] 촬영 후 selector가 high/low/omitted를 결정하고, 실제 H가 없을 때 proxy를 생성하지 않도록 한다.
- [ ] 교정 가능한 원인이 있는 첫 실패에만 재촬영을 권고하고 두 번째 실패 또는 원인 불명에는 권고하지 않는다.
- [ ] 합성 마스크 단위 테스트와 실제 마스크 overlay 디버그 모드를 추가한다.

### Phase 3 — 단일 이미지·ARFace micro-burst

**Files:**

- Create: `apps/unity/MakeupAR/Assets/Scripts/Face3D/UnifiedFaceFrameSnapshot.cs`
- Create: `apps/unity/MakeupAR/Assets/Scripts/Face3D/FaceCameraFrameBroker.cs`
- Create: `apps/unity/MakeupAR/Assets/Scripts/Face3D/Face3DCaptureProfileBuilder.cs`
- Create: `apps/unity/MakeupAR/Assets/Scripts/Face3D/UnifiedFaceCaptureController.cs`
- Create: `apps/unity/MakeupAR/Assets/Tests/Face3D/Face3DCaptureProfileBuilderTests.cs`
- Create: `apps/unity/MakeupAR/Assets/Tests/Face3D/UnifiedFaceCaptureSynchronizationTests.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/Face3DSessionController.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/FaceLandmarkSource.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/E7VisionLipBoundaryRuntime.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/E7HandOcclusionRuntime.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/RNBridge.cs`

- [ ] `Face3DSessionController` 내부의 ARFace→`Face3DMeshSnapshot` 복사 코드를 공용 factory로 추출한다.
- [ ] 기존 30프레임 controller가 공용 factory를 사용해 동작이 바뀌지 않도록 한다.
- [ ] `FaceCameraFrameBroker`만 `TryAcquireLatestCpuImage()`를 호출하고, 새 frame을 동기 subscriber에게 token·sensor timestamp와 함께 빌려준 뒤 broker가 마지막에 dispose한다.
- [ ] 기존 직접 획득자 `FaceLandmarkSource`, `E7VisionLipBoundaryRuntime`, `E7HandOcclusionRuntime`를 broker 구독으로 전환하고, 구현 후 `TryAcquireLatestCpuImage` 정적 검색 결과가 broker 한 곳뿐인지 검사한다.
- [ ] 제품 씬에 source가 미리 직렬화돼 있다고 가정하지 않는다. `RNBridge`가 기존 AR camera에 broker·통합 controller를 중복 없이 런타임 배선한다.
- [ ] 통합 controller가 `ARCameraManager.TryAcquireLatestCpuImage()`를 직접 호출하지 못하게 구조·테스트로 고정한다.
- [ ] 통합 controller는 셔터 요청부터 500ms capture window를 시작한다.
- [ ] 얼굴·pose·neutral expression·tracking 품질을 통과한 ARFace를 목표 8개, 최소 5개까지 수집한다. 헤어라인 advisory는 ARFace admission 조건이 아니다.
- [x] 네 번째 유효 ARFace를 fallback으로 보존하고, 이후 segmentation이 실제 수락한 첫 exact token 표본이 있으면 결과 독립적으로 한 번만 교체한다. 수락 token이 끝내 없으면 fallback을 유지하고 H만 생략한다. controller가 지속 보유하는 native pixel buffer는 최대 한 개다.
- [x] 고정 anchor의 broker token을 segmentation 입력 metadata와 연결하고, 750ms finalization budget 안에서 정확히 같은 token의 결과만 기다린다. nearest/most-recent mask로 바꾸지 않으며 timeout이면 H만 `omitted`다.
- [ ] Lab `single_frame` 모드에서는 anchor image에 가장 가까운 tracking ARFace 하나만 선택한다.
- [ ] 여러 얼굴, neutral-expression 실패, topology 불일치는 3D 표본에서 차단한다. stale/missing segmentation은 H만 `omitted`로 만들고 이미지·3D 캡처는 계속한다.
- [ ] image↔segmentation token 일치는 H 채택 조건으로, image↔ARFace native sensor delta는 통합 캡처 조건으로 검사한다. segmentation token 불일치는 H를 생략하고, ARFace 상한 밖 표본은 제외한다. Unity 관찰 delta로 대체하지 않는다.
- [x] 고정 `ARFrame.capturedImage`를 upright·non-mirrored JPEG로 앱 전용 임시 cache 디렉터리에 저장한다.
- [ ] 각 유효 snapshot에 `Face3DMetricEvaluator.Evaluate()`를 호출하고 현재 median/MAD 집계기를 5/8 정책으로 실행한다.
- [ ] 5~7개로 끝나면 `micro_burst_target_not_reached`를 기록한다.
- [x] Lab `single_frame`은 결과 계약에서 raw metric 1개를 유지하고 metric confidence를 0, MAD를 `null`로 내보내며 `single_frame_unaggregated`를 기록한다. 공개 v2 profile factory에서도 같은 규칙을 강제한다.
- [ ] 5개 미만이면 image와 부분 프로필을 폐기하고 성공 이벤트를 보내지 않는다.
- [ ] 성공 이벤트는 request당 정확히 한 번만 방출한다.

`E7SynchronizedCaptureExporter`는 이벤트·파일 정리 참고로만 사용한다. E7 이미지는 `ReadPixels`이므로 CPU image source로 재사용하지 않으며, Phase 3에서는 기존 `frame.png`, `arface_export.json` 계약을 변경하지 않는다.

### Phase 4 — RN 브리지와 통합 촬영 화면

**Files:**

- Create: `apps/mobile/src/features/face-capture/services/unifiedFaceCaptureBridge.ts`
- Create: `apps/mobile/src/features/face-capture/services/unifiedFaceCaptureQuality.ts`
- Create: `apps/mobile/src/features/face-capture/services/unifiedFaceCaptureQuality.test.ts`
- Create: `apps/mobile/src/features/face-capture/hooks/useUnifiedFaceCapture.ts`
- Create: `apps/mobile/src/features/face-capture/screens/UnifiedFaceCaptureScreen.tsx`
- Create: `apps/mobile/src/features/face-capture/screens/UnifiedFaceCaptureScreen.test.tsx`
- Modify: `apps/mobile/src/features/ar/services/unityMakeupBridge.ts`
- Modify: `apps/mobile/src/features/ar/services/unityMakeupBridge.test.ts`
- Modify: `apps/mobile/src/features/face-capture/services/faceCaptureGreenlight.ts`
- Modify: `apps/mobile/src/features/face-capture/services/makeupFeedbackRealtimeQuality.ts`

- [ ] Unity generic event에서 통합 캡처 이벤트를 엄격하게 파싱한다.
- [ ] hook이 request 단위로 stale·duplicate 이벤트를 무시한다.
- [ ] 기존 `evaluateFaceCaptureGreenlight`와 공통 realtime quality evaluator를 조합하고, 통합용 pose/해상도 정책과 별도 hairline advisory를 주입한다. base·makeup-feedback·unified의 공통 규칙을 복사하지 않는다.
- [ ] 화면에 기존 얼굴 타원 가이드와 우선순위가 가장 높은 헤어라인 advisory 문구 하나를 theme token으로 표시한다.
- [ ] 헤어라인 상태를 `finalCaptureGreenlight` 계산에서 제외한다. 일반 face/pose/camera gate가 false일 때만 셔터를 비활성화한다.
- [ ] RN live gate에 `expressionReady`를 새로 추가하지 않는다. neutral은 Unity micro-burst frame admission으로만 검증한다.
- [ ] 셔터 후에는 sync 재시도·파일 저장 동안 중복 입력을 막는다.
- [ ] 성공 시 로컬 image URI와 Face3D v2 프로필을 함께 반환한다.
- [ ] 성공 결과를 RN에 넘기기 전에 AR session을 중지해 카메라를 반납하고, Unity runtime은 이후 still-analysis가 재사용할 수 있게 로드된 상태로 일시정지한다.
- [ ] 오류·취소·unmount 모두 Unity 캡처를 한 번만 종료한다.
- [ ] 통합 플래그 off에서는 이 화면을 마운트하지 않는다.

### Phase 5 — 업로드·라우팅·분석 연결

**Files:**

- Modify: `apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx`
- Modify: `apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.test.ts`
- Modify: `apps/mobile/src/app/navigation/routes/faceCaptureConfirmationRoutes.tsx`
- Modify: `apps/mobile/src/app/navigation/routes/faceCaptureConfirmationRoutes.test.ts`
- Modify: `apps/mobile/src/app/navigation/flowState.tsx`
- Modify: `apps/mobile/src/features/face-capture/services/faceCaptureUploadService.ts`
- Modify: `apps/mobile/src/features/face-analysis/services/faceAnalysisMeasurements.ts`
- Modify: `apps/mobile/src/features/face-analysis/services/faceAnalysisMeasurements.test.ts`
- Modify: `apps/mobile/src/features/face-ratio/types.ts`
- Create: `apps/mobile/src/features/face-ratio/services/faceVerticalThirdsHairlineSelection.ts`
- Create: `apps/mobile/src/features/face-ratio/services/faceVerticalThirdsHairlineSelection.test.ts`
- Modify: `apps/mobile/src/features/face-ratio/services/faceVerticalThirdsService.ts`
- Modify: `apps/mobile/src/features/face-ratio/services/faceVerticalThirdsMath.ts`
- Modify: `apps/mobile/src/features/face-ratio/services/faceVerticalThirdsMath.test.ts`
- Modify: `apps/mobile/src/features/face-ratio/services/faceVerticalThirdsAiPayload.ts`
- Create: `apps/mobile/src/features/face-ratio/services/faceVerticalThirdsAiPayload.test.ts`
- Modify: `apps/mobile/src/features/face-ratio/screens/FaceVerticalThirdsScreen.tsx`
- Modify: `services/backend/app/services/face_analysis_measurements.py`
- Modify: `services/backend/app/services/openai_analysis.py`
- Modify: `services/backend/tests/test_face_analysis_measurements.py`
- Modify: `services/backend/tests/test_face_analysis_ai.py`

- [ ] `face_analysis + camera + flag on`일 때만 `UnifiedFaceCaptureScreen`을 사용한다.
- [ ] 결과 image URI를 기존 `uploadFaceCaptureImage()`에 전달한다.
- [ ] `flowState`를 reducer로 바꾸는 것을 필수 전제로 두지 않는다. `commitUnifiedFaceCapture(activeRequestId, result)`가 현재 requestId를 다시 확인한 뒤 capture/profile/metadata를 커밋하고 stale async 결과를 버리게 한다.
- [ ] retake는 먼저 활성 request/capture id를 무효화한 뒤 관련 상태를 지워 늦게 도착한 성공 이벤트가 새 촬영을 덮지 못하게 한다.
- [ ] 통합 캡처에서는 `selectedFaceCaptureGreenlight`의 native metadata 필수 조건을 우회하지 말고 별도 eligibility 계약을 사용한다.
- [ ] 사진 확인에서 재촬영할 때 capture와 Face3D profile을 모두 null로 만든다.
- [ ] 사진 확인에서 통합 프로필이 있으면 `Face3DMeasurement`를 건너뛰고 `FaceAnalysisLoading`으로 이동한다.
- [ ] legacy 프로필이 없으면 현재 `Face3DMeasurement` 경로를 유지한다.
- [ ] `afterAnalysisRoute`를 확인→로딩까지 그대로 전달한다.
- [x] `FaceVerticalThirdsInput`에 통합 캡처가 계산한 normalized H, provider, confidence, `analysisEligible`을 전달하는 optional seam을 추가하고, Unity의 `mediapipe_selfie_multiclass`를 공식 경계 provider `mediapipe_hairline_boundary`로 변환한다.
- [ ] 결과에 `measurementMode: 'full_vertical_thirds' | 'middle_lower_only'`와 H 분석 적격성을 명시한다. 기존 schema를 유지하려면 additive optional field로 시작하고, 백엔드 저장·복원 테스트를 함께 추가한다.
- [ ] Apple 실제 H와 통합 MediaPipe 실제 H의 선택 우선순위·confidence·H<G 검사를 순수 selector로 분리해 계약 테스트로 고정한다. 기존 idx-10 근사 H는 권위 있는 선택지에서 제거한다.
- [x] 같은 저장 이미지에 Apple auxiliary semantic matte가 실제로 있으면 검증된 Apple H를 우선한다. auxiliary matte가 없는 통합 ARFrame 경로에서는 같은 broker token의 검증된 MediaPipe 실제 H만 사용한다. 제공되지 않은 Apple metadata를 재생성한 것처럼 취급하지 않는다.
- [x] 현재 후보 임계값 기준 고신뢰 실제 H만 `analysisEligible: true`로 사용한다. 저신뢰 실제 H는 좌표·confidence를 보존하되 H 의존 계산과 AI 전달에서는 제외한다.
- [ ] 유효 H가 없으면 `FaceVerticalThirdsMath`에 H를 null로 전달해 중안부:하안부 상대비만 만들고, `upper`, 3분할 `dominantPart`, H 의존 `faceLength`는 생성하지 않는다. `deriveDominantPart()`가 lower만 보고 3분할 균형·우세를 판정하지 않도록 바꾼다.
- [ ] H가 없는 partial summary가 `상·중·하 비율이 고르다` 같은 3분할 문구를 만들지 않고, `중안부와 하안부만 비교했어요`라는 별도 2구간 서사를 사용하도록 테스트한다.
- [ ] `faceVerticalThirdsAiPayload.ts`가 analysis-ineligible H, 상안부, H 의존 우세 판정·얼굴 길이를 직렬화하지 않는지 테스트한다.
- [ ] 백엔드 `openai_analysis.py`가 생략된 상안부를 추론하거나 이마·3분할 관련 추천을 만들지 않도록 입력 존재성 조건과 회귀 테스트를 추가한다.
- [ ] `FaceVerticalThirdsScreen.tsx`는 provider 중립으로 실제 검출을 표시하되, low confidence/omitted는 각각 `반영하지 않음` 고지를 표시한다.
- [ ] `mediapipe_forehead_approx` provider 문자열은 과거 저장 결과 파싱 호환을 위해 타입에 남길 수 있지만 신규 결과 생성·공식 계산·AI 직렬화에서는 거부한다.
- [ ] 촬영 후 교정 가능한 실패 원인이 있고 `retryAttemptCount == 0`일 때만 선택형 재촬영을 제안한다. 재촬영 선택 시 image/profile/captureId와 retry 대상 결과를 함께 무효화한다.
- [ ] 세로 비율, 2D 기하, personal color가 통합 캡처의 동일 image URI를 사용하도록 한다.
- [ ] ARFoundation에서 제공하지 않는 white-balance metadata를 네이티브 값처럼 만들지 않고 personal-color correction에 명시적 unavailable reason을 전달한다.
- [ ] 먼저 `faceAnalysisMeasurements.ts`의 v1 전용 `parseFace3DProfile()` seam을 v1/v2 union parser로 바꿔 v2가 네트워크 전에 유실되지 않게 한다.
- [ ] 백엔드 `_normalize_face3d()`는 현재 metrics/warnings만 남긴다는 전제에서, `schemaVersion`, `sampleMode`, `aggregation`, valid/target count를 별도 measurement metadata로 보존한다.
- [ ] flag off에서도 공유 parser·service가 바뀌므로 “코드 무변경”이 아니라 v1 request/parse/upload/report snapshot이 동일하다는 회귀 테스트로 legacy 불변을 증명한다.

### Phase 6A — 헤어라인 보정과 보고서 안전성

- [ ] 먼저 shadow mode에서 촬영 전 advisory, 촬영 후 MediaPipe H, 가능한 legacy Apple H, 수동 라벨을 같은 `captureId`로 비교한다. 원본 마스크와 얼굴 영상은 기존 동의·보존 정책 밖으로 저장하지 않는다.
- [ ] telemetry에는 관측 특징·provider·confidence·outcome·actionable reason·재촬영 선택 여부만 남긴다. 탈모 유형 같은 해부학 라벨을 자동 생성하거나 저장하지 않는다.
- [ ] Phase -1의 6개 하위군과 가림·저조도·움직임 교란 조건별로 advisory precision/recall, 고신뢰 H 검출 누락, normalized H MAE/p95, 한 번 재촬영 회복률, 촬영 이탈률을 보고한다.
- [ ] 고신뢰 임계값은 calibration set에서 정하고 validation 전에 freeze한다. validation 결과를 보고 같은 데이터에 맞춰 바꾸지 않는다.
- [ ] 고신뢰 실제 H만 권위 있는 상안부 계산에 허용한다. low-confidence H의 제품 사용은 별도 검증과 승인 없이는 승격하지 않는다.
- [ ] 기존 idx-10 경로를 제거한 뒤 `provider: mediapipe_forehead_approx` 또는 동등 proxy가 measurements·AI payload·보고서 문구에 0건인지 확인한다.
- [ ] H 생략 보고서가 중안부·하안부를 정상 표시하고, 이마·3분할·H 의존 얼굴 길이에 관한 AI 문장을 만들지 않는지 golden case로 검증한다.
- [ ] 한 번 재촬영 정책이 원인별로 실제 회복률을 높이는지 확인한다. 회복률이 낮거나 이탈률이 높아도 셔터를 잠그는 방식으로 자동 승격하지 않는다.

**Gate 6A:** 수동 라벨 holdout에서 Phase -1의 헤어라인 기준과 proxy/AI 누출 0%를 모두 만족해야 high-confidence H를 제품 보고서에 사용한다. 실패하면 촬영은 계속 허용하고 모든 H를 `omitted`로 처리한다.

### Phase 6B — Face3D confidence 보정과 프레임 수 확정

5/8 micro-burst는 기존 median/MAD 집계기를 계산 도구로 재사용할 수 있지만, 20/30보다 짧은 같은 사람 표본의 상관관계가 높아 단순히 `targetFrameCount`만 바꾼 confidence를 제품 신뢰도로 사용할 수 없다. 정확히 한 프레임은 MAD와 이상치 제거가 없으므로 기존 confidence를 사용할 수 없다.

- [ ] 같은 피험자·자세에서 1, 3, 5, 8, 12, 30프레임 결과를 쌍으로 수집한다.
- [ ] 각 필수·Tier-2 지표의 30프레임 대비 bias, 반복성, 실패율, 처리 시간을 계산한다.
- [ ] 기존 `analyze-repeatability.mjs`가 정확히 3명×3회를 요구하므로 frame count별 `repeatability-{1,3,5,8,12,30}.json` 독립 manifest를 만든다. 여러 count를 한 manifest에 섞지 않는다.
- [ ] 기존 3×3 contract gate와 별도로, Phase -1 validation cohort에서 동일 피험자 paired short-vs-30 비교를 실행한다.
- [ ] 각 required metric은 기존 `discriminability >= 2.0`, short-frame within spread ≤ 30-frame의 1.25배, paired median bias ≤ 30-frame between-subject spread의 10%, p95 bias ≤ 25%를 모두 만족해야 한다.
- [ ] capture 실패율은 30프레임 대비 5%p 초과 악화되지 않아야 하고, 후보의 p95 capture window는 500ms 이하여야 한다.
- [ ] 5/8/12 중 위 기준을 모두 통과하는 가장 작은 수를 선택한다. 8은 첫 구현 후보일 뿐 자동 우선권이 없으며, 5가 독립 validation에서 통과하면 5를 선택할 수 있다.
- [ ] 5·8이 실패하고 12가 통과하면 출시 후보를 12로 올리되 500ms UX 상한도 함께 재검증한다.
- [ ] 12까지 실패하면 20/30 fallback을 유지하고 micro-burst를 출시하지 않는다.
- [ ] v2 confidence에서 선언 target을 품질처럼 사용하는 coverage 항을 제거하거나 completion과 quality로 분리하고, pose·neutral expression·tracking·native sync·독립 반복성으로 다시 보정한다.
- [ ] 보정 전 micro-burst와 single-frame profile은 Lab/내부 증거에만 사용하고 AI 보고서에는 공급하지 않는다.
- [ ] 보정 후에도 confidence `< 0.5`인 지표는 현재 백엔드 규칙대로 `blocked` 처리한다.
- [ ] 사용자 UI에는 raw 경고 코드 대신 `짧은 순간 여러 번 확인해 측정했어요` 같은 승인된 문구만 노출한다.

**Gate 6B:** 구현 후보는 5/8/500ms, 출시 전 기본은 30프레임이다. 5/8/12 중 사전 등록 기준을 통과하는 가장 작은 수만 출시 후보로 승격한다. 모두 실패하면 20/30 fallback을 유지한다. 정확히 한 프레임은 별도 반복성 결과가 나오더라도 기본값으로 자동 승격하지 않고 명시적인 제품 승인 대상으로 남긴다.

### Phase 7 — 회귀·실기기 검증·점진 배포

**자동 검증:**

```bash
npm run test:face3d --prefix apps/mobile
npm run test:native-wiring --prefix apps/mobile
npm run typecheck --prefix apps/mobile
git diff --check
```

Unity Test Runner:

- `HairlineVisibilityEstimatorTests`
- `HairlineAdvisoryStateMachineTests`
- `Face3DCaptureProfileBuilderTests`
- `UnifiedFaceCaptureSynchronizationTests`
- 기존 `Face3DCoreTests`
- 기존 `Face3DHeadPoseTests`
- 기존 `Face3DNeutralExpressionGateTests`
- 기존 `Face3DMultipleFaceGateTests`

**실기기 매트릭스:**

| 케이스 | 기대 결과 |
|---|---|
| 헤어라인 완전 노출 | `likely_visible`, 일반 품질 조건 충족 시 촬영, 고신뢰 실제 H면 전체 비율 |
| 앞머리로 중앙 이마 가림 | 검증된 경우 `likely_occluded` 넛지, 셔터 유지. H 미검출 시 생략하고 선택형 재촬영 1회 |
| 모자 착용 | 검증된 경우 `likely_occluded` 넛지, 셔터 유지. H 미검출 시 생략하고 선택형 재촬영 1회 |
| M자·후퇴·성긴·삭발 상태 | 해부학 상태 추정·잘못된 가림 문구 금지. 실제 H가 검출되면 신뢰도에 따라 사용하고, 없으면 생략·반복 재촬영 금지 |
| 어두운 머리·짙은 피부·저대비 | 사전 등록 하위군별 H 누락·오차와 advisory 오탐 측정. 실패 시 근사 없이 생략 |
| 밝은색·회색·염색 머리 | 사전 등록 하위군별 H 누락·오차와 잘못된 가림 advisory 기록 |
| 어두운 조명 | 출시 전 보강에서 원인이 검증되면 `environment_issue`로 밝기 안내. 심한 경우 일반 camera gate만 셔터를 제어 |
| 얼굴 좌우 회전 | pose 실패, 셔터 비활성 |
| 두 명 진입 | multiple face 차단 |
| 500ms 안에 유효 ARFace 8개 | 8/8 완료, target warning 없음 |
| 500ms 안에 유효 ARFace 5~7개 | 프로필 완료, `micro_burst_target_not_reached` 기록 |
| 500ms 안에 유효 ARFace 0~4개 | 성공 결과 없이 재촬영 안내 |
| Lab single-frame 요청 | 1/1과 `single_frame_unaggregated`, 제품 AI 전달 차단 |
| 촬영 직후 움직임 | sync/pose 실패 시 자동 재시도, 잘못된 결과 저장 금지 |
| image/segmentation frame token 불일치 | H 채택 금지·`omitted`; image↔ARFace가 유효하면 캡처와 나머지 분석은 성공 |
| segmentation 초기화 실패 | 헤어라인 `unknown`/`omitted`; 일반 품질과 image↔ARFace가 유효하면 촬영 성공 |
| ARFace 공통 native timestamp 없음 | 관찰 시각으로 우회 금지, Gate 0 실패/native plugin 전환 |
| 해상도·얼굴 px 하한 미달 | 정밀 촬영 차단 또는 현재 native 경로 유지 |
| 웃는 상태에서 셔터 | RN 셔터를 새로 잠그지 않고, neutral이 아닌 3D 표본만 admission에서 제외 |
| 사진 확인에서 재촬영 | image/profile/captureId 모두 초기화 |
| 재촬영 뒤 이전 request 성공 도착 | stale 결과 폐기, 새 capture 상태 유지 |
| 앱 백그라운드 전환 | 카메라 해제, 복귀 후 새 requestId |
| 기능 플래그 off | 기존 네이티브 촬영 + 30프레임 측정 |

**필수 런타임 증거:**

```json
{
  "type": "unified_face_capture_completed",
  "captureId": "...",
  "imageCount": 1,
  "face3dSampleMode": "micro_burst",
  "face3dValidFrameCount": 8,
  "face3dTargetFrameCount": 8,
  "face3dCaptureWindowMs": 240.0,
  "hairlineAdvisoryStatus": "likely_visible",
  "hairlineOutcome": "detected_high_confidence",
  "hairlineAnalysisEligible": true,
  "hairlineConfidence": 0.78,
  "hairlineRetryRecommended": false,
  "cameraFrameToken": "camera-1842",
  "segmentationFrameToken": "camera-1842",
  "faceNativeFrameToken": "arkit-1842",
  "maxAbsFaceSensorDeltaMs": 32.0,
  "cameraObservedAtMs": 123456.0,
  "faceObservedAtMs": 123470.0,
  "imageUriExists": true
}
```

`cameraObservedAtMs`와 `faceObservedAtMs`는 지연 진단일 뿐 두 값의 차이로 동기 통과를 판정하지 않는다. 실제 로그에는 sensor/frame 증거가 들어가야 하며, 원본 이미지 bytes·랜드마크 배열·ARFace vertex 배열은 기록하지 않는다.

점진 배포 순서:

1. Lab 전용 플래그
2. 내부 개발 기기
3. QA 계정 제한
4. 소수 사용자 원격 플래그
5. 기본 on

각 단계에서 crash, capture failure, H 검출 누락·오차, advisory precision/recall, 한 번 재촬영 회복률·이탈률, proxy/AI 누출, sync retry, ΔE, 해상도, cold/warm TTI, fps, RSS, thermal state를 비교한다. image↔ARFace native sync 위반이 1건이라도 성공 결과에 들어가거나 Phase -1의 색·TTI·성능 상한을 넘으면 플래그를 직전 단계로 롤백한다. image↔segmentation 불일치가 발생해도 H 채택률은 반드시 0%여야 한다.

---

## 7. 실패·폴백 정책

| 실패 | 처리 |
|---|---|
| TrueDepth/ARFace 미지원 | 기존 2D 촬영 흐름 또는 명시적 미지원 안내 |
| 실시간 segmentation 초기화 실패 | 헤어라인 advisory는 `unknown`, 촬영 후 H는 `omitted`. 일반 품질과 image↔ARFace가 유효하면 캡처는 계속 성공 |
| 교정 가능한 헤어라인 가림 | 셔터를 잠그지 않고 소프트 넛지. 그대로 촬영해 H가 없으면 생략하고 선택형 재촬영을 최대 한 번 제안 |
| 유효한 실제 H 없음·원인 불명 | 근사값 없이 상안부와 H 의존 결과를 생략. 재촬영을 강요하지 않고 부분 보고서 생성 |
| image↔segmentation token 불일치 | 해당 segmentation에서 H를 채택하지 않고 `omitted`. 이미지·3D 결과는 image↔ARFace 계약으로 별도 판정 |
| image↔face native sync 초과 또는 공통 clock 없음 | 관찰 시각으로 우회하지 않고 native plugin 전환 또는 기존 경로 유지 |
| image 저장 실패 | 결과 이벤트를 성공으로 보내지 않음 |
| micro-burst 유효 프레임 5개 미만 또는 3D 평가 실패 | 이미지까지 폐기하고 재촬영; 2D 성공과 묶어 부분 성공 처리하지 않음 |
| 업로드 실패 | 로컬 통합 결과를 유지하고 기존 업로드 재시도 UX 사용 |
| feature flag off | 현재 네이티브 사진 + 30프레임 Face3D 유지 |

통합 모드의 목표는 하나의 원자적 capture set이다. 따라서 이미지 성공·3D 실패를 같은 `captureId`의 성공 결과로 저장하지 않는다.

---

## 8. 개인정보와 저장 정책

- 원본 이미지는 기존 face capture 업로드 정책을 따른다.
- hair/skin 원본 마스크는 메모리에서만 사용하고 기본적으로 파일에 저장하지 않는다.
- ARFace vertex 배열은 메모리에서 metric 계산 후 폐기한다.
- 백엔드에는 compact Face3D metrics와 품질 metadata만 전달한다.
- 디버그 overlay와 마스크는 `__DEV__` 및 명시적 diagnostics 옵션에서만 생성한다.
- 런타임 증거에는 파일 경로, frame count, warning, frame token, native sync delta만 남긴다.
- 재촬영·취소 시 아직 업로드하지 않은 임시 이미지 파일을 삭제한다.

---

## 9. 구현 중 변경 금지 불변식

- 다른 촬영 타입의 네이티브 카메라 동작을 변경하지 않는다.
- `afterAnalysisRoute`를 어느 라우트에서도 유실하지 않는다.
- retake가 이전 Face3D 프로필을 새 사진에 붙이지 못하게 한다.
- request당 completed 이벤트와 분석 POST는 각각 한 번만 실행한다.
- `ReadPixels` 화면 캡처를 색 분석 원본으로 사용하지 않는다.
- `UnifiedFaceCaptureController`가 `TryAcquireLatestCpuImage()`를 독립 호출하지 않는다.
- anchor는 H 검출 결과를 보기 전에 고정하고 nearest/latest/best-of-N 방식으로 바꾸지 않는다.
- controller가 지속 보유하는 native `CVPixelBuffer`는 고정 anchor 후보 한 개를 넘지 않는다.
- image와 ARFace의 native frame/sensor sync 상한을 넘은 표본을 성공으로 묶지 않는다.
- image와 segmentation frame token이 다르면 H를 만들지 않되, 그 이유만으로 셔터나 이미지·3D 캡처를 실패시키지 않는다.
- Unity 관찰 시각 차이를 센서 동기 증거로 사용하지 않는다.
- micro-burst와 단일 프레임을 기존 30프레임 집계 결과로 표시하지 않는다.
- 헤어라인 advisory가 어떤 상태이든 그 상태만으로 셔터를 잠그지 않는다.
- 유효한 실제 H가 없을 때 idx-10 등 proxy를 권위 있는 측정으로 사용하지 않는다.
- low-confidence 또는 `analysisEligible: false` H를 H 의존 공식·AI payload·추천 문구에 넣지 않는다.
- 검출 실패 telemetry와 사용자 문구에서 영상만으로 해부학 상태를 추정하지 않는다.
- v2 target count 변경만으로 기존 confidence 문턱을 통과시키지 않는다.
- 원시 얼굴 메시와 segmentation 마스크를 네트워크로 보내지 않는다.
- 임시 JPEG는 앱 cache 직속 `aura_unified_face_<timestamp>_<nonce>.jpg`만 정리하고 Documents·원격 URI·경로 순회 입력은 삭제하지 않는다.

---

## 10. 최종 승인 체크리스트

- [ ] Phase -1 수치와 calibration/validation 분리 사전 등록 승인
- [ ] Gate 0 native 동기·ΔE·해상도·TTI·성능 feasibility 승인
- [ ] C#/TS 계약 parity 테스트 통과
- [ ] 합성 마스크 헤어라인 단위 테스트 통과
- [ ] 사전 등록 6개 머리색·피부톤·헤어라인 하위군과 가림·저조도·움직임 교란 조건의 실기기 테스트 통과
- [ ] 모든 헤어라인 advisory 상태에서 일반 품질 조건이 같으면 셔터 상태도 동일함을 확인
- [ ] H 미검출·저신뢰 시 proxy, 상안부, H 의존 우세 판정·얼굴 길이·AI 문구 누출 0건 확인
- [ ] 교정 가능한 첫 실패만 선택형 재촬영을 권고하고 최대 1회 제한을 준수함을 확인
- [ ] 결과 image count 1 확인
- [ ] 기능 플래그 후보 Face3D target 8 / minimum 5 / 500ms 확인
- [ ] Lab single-frame 1/1이 제품 기본 경로에서 선택되지 않음 확인
- [ ] 채택된 H의 image/segmentation token 일치 100%와 native face sensor delta 분포 확인
- [ ] 독립 3×3 manifest의 1/3/5/8/12/30 sweep과 paired validation으로 최종 frame 수 승인
- [ ] v2 coverage/completion과 quality confidence 분리 승인
- [ ] ColorChecker ΔE와 personal-color 회귀 기준 통과
- [ ] warm/cold TTI·해상도·fps·RSS·thermal 기준 통과
- [ ] v1 flag-off request/parse/upload/report snapshot 회귀 통과
- [ ] retake·cancel·background camera cleanup 확인
- [ ] 기존 30프레임 fallback 확인
- [ ] 모바일 typecheck, Face3D 계약, native wiring, Unity tests 통과
- [ ] 문서와 실제 이벤트 스키마 일치 확인
