# AURA 헤어라인(H) Apple Semantic Matte 도입 계획 v0.1 — Codex 핸드오프

작성일: 2026-07-05 KST
상태: 밑작업 완료 / Codex 구현 이어받기용
상위 문서: `docs/AURA_FACE_VERTICAL_THIRDS_MEASUREMENT_PLAN_KO_v0.2.md` (§4.3 / §4.7 / §4.9 / §4.10)

---

## 0. 목표와 현재 상태

MediaPipe 이터레이션은 구현 완료: G/Sn/Me는 정확하지만 H는 landmark idx-10 근사라 실제 헤어라인을 못 잡고 항상 `partial_success`다. 이번 단계는 **Apple AVSemanticSegmentationMatte(hair/skin)** 로 H를 검출해 `full_success`를 달성한다.

**하드 제약:**
- Apple matte는 **촬영 시점**에 `AVCapturePhotoOutput`에 요청해야만 얻을 수 있다(사후 추출 불가).
- 캡처 네이티브 뷰(`AURARealtimeFaceCaptureView.m`)는 **main 앱과 공유**된다. 모든 세션 설정 변경은 새 view prop `semanticMatteCapture`(기본 NO) 뒤에 숨긴다. prop OFF면 기존 코드 경로와 100% 동일해야 한다.
- matte 실패 시 항상 현행 동작(idx-10 근사 + `partial_success`)으로 폴백. 어느 단계도 hard failure 금지.
- 적용 범위는 face-capture-lab 실험앱 한정. `grep -rn semanticMatteCapture apps/mobile/src` 결과가 lab 플로우 밖에서 true로 설정되면 안 된다.

**아키텍처(확정):**
- matte는 `settings.embedsSemanticSegmentationMattesInPhoto = YES`로 **촬영 JPEG 파일에 임베드**해 저장 → `AURAFaceRatioAnalyzer`가 같은 파일에서 ImageIO auxiliary data로 읽는다. 캡처↔분석 간 별도 파일 전달 불필요, source.jpg에 matte가 남아 오프라인 재분석 가능.
- 헤어라인 경계 검출(ROI 스캔)은 네이티브 C 함수(`AURAFaceRatioHairline.m`)에서 수행. JS에는 normalized H + confidence만 전달.
- H는 normalized(EXIF-upright 공간)로 반환 → 기존 `toPixelKeypoint` 경로 그대로 사용.

---

## 1. 이미 완료된 밑작업 (2026-07-05)

Codex는 아래를 **다시 만들지 말고 그대로 사용**한다. `tsc --noEmit`, pbxproj plist lint, ObjC 문법 체크(`xcrun --sdk iphoneos clang -fsyntax-only`) 모두 통과 상태.

| 파일 | 상태 | 내용 |
|---|---|---|
| `apps/mobile/ios/AURA/AURAFaceRatioHairline.h` | 신규 | 검출 함수 API 계약 확정: `AURAFaceRatioDetectHairline(NSURL *imageFileURL, AURAFaceRatioHairlineLandmarks landmarks, NSDictionary *options)`. 입력 struct(idx234/454/10 + G + pose, 전부 normalized upright), options/반환 dict 형식은 헤더 주석 참조 |
| `apps/mobile/ios/AURA/AURAFaceRatioHairline.m` | 신규(스텁) | `kHairline*` 상수 블록 전체(튜닝 계약) + `AURAHairlineTuningValue()` 헬퍼 구현 완료. 본체는 `{failureReason:"not_implemented"}` 반환 — **TODO(codex) 주석에 구현 순서 1)~6) 명시됨** |
| `apps/mobile/ios/AURA.xcodeproj/project.pbxproj` | 수정 | 위 .h/.m 등록 완료 (PBXBuildFile `E5F0A1212F80333300FACE01`, PBXFileReference `E5F0A120…`/`E5F0A122…`, group, Sources phase). **pbxproj는 더 건드릴 필요 없음** |
| `apps/mobile/src/features/face-ratio/constants.ts` | 신규 | `APPLE_HAIRLINE_FULL_CONFIDENCE`(0.70) / `APPLE_HAIRLINE_MIN_CONFIDENCE`(0.45), `HAIRLINE_WARNING` 문자열 상수, `HairlineSelectionTier`, `FaceRatioHairlineTuning`(네이티브 상수와 키 1:1) + `HAIRLINE_TUNING` |
| `apps/mobile/src/features/face-ratio/types.ts` | 수정 | `NativeFaceRatioMatteInfo`, `NativeFaceRatioHairline`, `NativeFaceRatioHairlineDebugArtifacts` 추가. `NativeFaceRatioAnalyzeResult`에 `matte?`/`hairline?`/`hairlineFailureReason?`/`debugArtifacts?` 추가. `FaceVerticalThirdsInput.semanticMattes?`, `FaceVerticalThirdsResult.artifacts`에 matte 디버그 URI 3종 추가 |
| `apps/mobile/src/features/face-ratio/services/faceRatioAnalyzerNative.ts` | 수정 | `FaceRatioAnalyzeOptions{hairline:{enabled,debugArtifacts,tuning}}` 정의, `analyzeFacePhoto(imageUri, options)`가 options를 네이티브로 전달(기존 호출부는 무인자 그대로 호환) |
| `apps/mobile/src/features/face-capture/components/RealtimeFaceCaptureNativeView.tsx` | 수정 | `SemanticMatteAvailability` export, `RealtimeCameraCaptureResult`에 `semanticMattes?`/`matteCapability?`/`format 'heic'`, `NativeRealtimeFaceCaptureProps.semanticMatteCapture?`(타입만 — **네이티브 `RCT_EXPORT_VIEW_PROPERTY` 구현 전에 이 prop을 실제로 전달하면 안 됨**) |
| `apps/mobile/src/features/face-capture/services/faceCaptureUploadService.ts` | 수정 | `FaceCaptureImageInput.semanticMattes?` 추가(타입만) |
| `apps/mobile/src/features/face-ratio/screens/FaceVerticalThirdsScreen.tsx` | 수정 | `FaceVerticalThirdsCapture.semanticMattes?` 추가(타입만) |

**아직 아무 로직도 연결돼 있지 않다.** 네이티브 캡처/검출 구현과 JS 배선이 Codex 작업이다.

---

## 2. 기술 결정 사항 (변경 금지, 근거 포함)

### 2.1 matte 가용성 — 3단 에스컬레이션 (`configureSession` 내, prop ON일 때만)

- **Rung 0** (prop OFF, main 앱): 오늘과 동일. 새 코드 한 줄도 실행 금지.
- **Rung 1**: front device discovery를 `@[AVCaptureDeviceTypeBuiltInTrueDepthCamera, AVCaptureDeviceTypeBuiltInWideAngleCamera]`(첫 매치)로 변경, 프리셋 1280x720 유지, photo output 추가 후 `photoOutput.depthDataDeliveryEnabled = photoOutput.depthDataDeliverySupported` 설정 → `availableSemanticSegmentationMatteTypes` 확인. hair+skin 있으면 완료(라이브 비디오 경로 무변경 — 최선).
- **Rung 2**: Rung 1 실패 시 같은 `beginConfiguration` 블록에서 `_session.sessionPreset = AVCaptureSessionPresetPhoto`로 재시도. 그래도 없으면 matte 포기, 세션은 정상 유지(unsupported 로그).
- rung마다 구조화 로그: `[aura:face-capture] matte:capability rung=<n> device=<type> preset=<p> depthSupported=<b> availableTypes=[...]`. 최종 capability dict는 ivar에 보관해 capture resolve payload의 `matteCapability`로 JS까지 전달.
- **어느 rung이 필요한지는 실기기 로그 1회로 확정**한다(문서상 확답 불가한 부분). Rung 2가 발동하면 라이브 프레임이 4:3으로 변하므로 라이브 MediaPipe/greenlight 게이트 재검증 필수 — 회귀 시 Rung 2를 unsupported 처리로 후퇴.

### 2.2 파일 포맷과 read-back API

- **JPEG 유지** (Apple은 JPEG 컨테이너에도 SSM auxiliary image 임베드 지원). delegate에서 파일 저장 직후 같은 파일을 재오픈해 aux-data round-trip 확인 로그 `matte:embedded hair=<b> skin=<b>`를 남긴다. round-trip 실패가 확인되면(in-memory matte는 있는데 파일에서 nil) prop ON일 때만 HEIC로 전환: `[AVCapturePhotoSettings photoSettingsWithFormat:@{AVVideoCodecKey: AVVideoCodecTypeHEVC}]` + `.heic` 파일명 + payload `format:'heic'`.
- 읽기 체인(분석 측, `AURAFaceRatioHairline.m`의 TODO 1~2단계):
  1. `CGImageSourceCreateWithURL` → `CGImageSourceCopyPropertiesAtIndex(src, 0, NULL)`에서 `kCGImagePropertyOrientation`(EXIF) 읽기
  2. `CGImageSourceCopyAuxiliaryDataInfoAtIndex(src, 0, kCGImageAuxiliaryDataTypeSemanticSegmentationHairMatte / …SkinMatte)`
  3. `+[AVSemanticSegmentationMatte semanticSegmentationMatteFromImageSourceAuxiliaryDataType:dictionaryRepresentation:error:]`
  4. `-[AVSemanticSegmentationMatte semanticSegmentationMatteByApplyingExifOrientation:]`에 1)의 EXIF 값 적용
  5. `matte.mattingImage` → `kCVPixelFormatType_OneComponent8` CVPixelBuffer
- 좌표계 근거: `AURAFaceRatioAnalyzer`의 `AURAFaceRatioUprightImage`가 EXIF를 픽셀에 bake한 뒤 landmark를 뽑으므로, 같은 EXIF를 matte에 적용하면 두 좌표계가 일치한다. 전면 카메라 미러링은 파일 기준으로 동일하므로 추가 변환 불필요.

### 2.3 해상도 불일치

matte는 사진보다 저해상도(통상 1/2~1/4, 종횡비 동일). **normalized 좌표를 다리로 matte 픽셀 공간에서만 스캔**하고 업스케일 금지. hair/skin matte 크기가 서로 다를 수 있으므로 각 matte를 자기 크기로 `(normX*w, normY*h)` 샘플링. 스캔 창은 해상도 비례(상수 블록의 `*Fraction` 값 + 픽셀 하한: hair≥2px, skin≥3px, gradientOffset≥2px). `boundaryStdPx`는 **사진 픽셀 기준**으로 환산해 보고(`std_matte * imageHeight / matteHeight`).

### 2.4 confidence 공식 (lightingQuality 제외 후 재정규화)

```
confidence = 0.40*boundarySharpness + 0.30*candidateConsistency
           + 0.20*foreheadSkinVisibility + 0.10*poseQuality
```
- boundarySharpness = clamp(meanGradient / 0.60, 0, 1)
- candidateConsistency = 0.5*coverage + 0.5*(1 - clamp(std(candidateY)/(0.08*faceWidth), 0, 1)), coverage = filtered/sampled
- foreheadSkinVisibility = clamp(skinFraction / 0.60, 0, 1) — skinFraction은 검출된 H행~roiY1 사이 ROI에서 skin alpha > 0.5 픽셀 비율
- poseQuality = 1 - clamp(max(|yaw|/8, |pitch|/8, |roll|/5), 0, 1)
- `hairlineVisible = candidates ≥ 8 && skinFraction ≥ 0.20 && H.y ≤ G.y - 0.02*faceWidth`
- 판정은 JS에서: conf ≥ 0.70 → apple H + `full_success` 가능 / 0.45~0.70 → apple H + low-confidence warning + `partial_success` / < 0.45 → idx-10 근사 폴백(현행).

### 2.5 threshold 위치

- 네이티브 스캔 상수: `AURAFaceRatioHairline.m` 상단 `kHairline*` 블록(작성 완료). `options[@"tuning"]`으로 개별 override — `AURAHairlineTuningValue()` 사용.
- JS 판정 상수·warning 문자열: `src/features/face-ratio/constants.ts`(작성 완료). **warning 문자열을 하드코딩하지 말고 반드시 `HAIRLINE_WARNING`에서 import.**

---

## 3. Codex 구현 순서

### Phase 1 — 캡처: capability probe + matte 임베드 촬영

파일: `apps/mobile/ios/AURA/AURARealtimeFaceCaptureView.m`

1. ivar `BOOL _semanticMatteCapture;` + `NSDictionary *_matteCapability;`, `RCT_EXPORT_VIEW_PROPERTY(semanticMatteCapture, BOOL)`. setter: 세션이 이미 구성됐고 값이 바뀌면 session queue에서 reconfigure(기존 `configureSession`은 input/output을 제거 후 재추가하므로 재진입 안전, ~L630-641).
2. `cameraDeviceForPosition:`(~L689): `_semanticMatteCapture && position == front`일 때만 TrueDepth 우선 discovery. 그 외 기존 그대로.
3. `configureSession`(~L624-687): photo output 추가 직후 prop ON이면 §2.1 래더 실행(헬퍼 `-(NSDictionary *)configureSemanticMatteDelivery`). hair+skin 가용 시 `_photoOutput.enabledSemanticSegmentationMatteTypes` 설정. rung별 `matte:capability` NSLog.
4. `captureWithResolver:`(~L1379): enabled types 비어있지 않으면 `settings.enabledSemanticSegmentationMatteTypes = _photoOutput.enabledSemanticSegmentationMatteTypes;` + `settings.embedsSemanticSegmentationMattesInPhoto = YES;`. per-photo `depthDataDeliveryEnabled`는 OFF 유지(파일 크기) — 실기기에서 matte가 nil이면 ON으로 폴백.
5. delegate(~L1404): 파일 저장 후 `[photo semanticSegmentationMatteForType:AVSemanticSegmentationMatteTypeHair/…Skin]` nil 여부 + §2.2 round-trip 체크 → resolve payload에 `semanticMattes:{hair,skin,requested}` + `matteCapability` 추가(키 이름은 JS `RealtimeCameraCaptureResult`와 일치).

JS 배선:
- `FaceCaptureScreen.tsx`: props에 `semanticMatteCapture?: boolean`(기본 false) 추가 → `<RealtimeFaceCaptureNativeView>`에 전달(Expo CameraView 폴백은 무시). 캡처 핸들러(~L872-918)에서 `picture.semanticMattes`를 `imageInput.semanticMattes`에 실음.
- `FaceCaptureLabApp.tsx`: lab에서만 `semanticMatteCapture={Platform.OS === 'ios'}` 전달. `LabCapture`/`createLabCaptureResult`(~L27-40)에 `semanticMattes` 추가 → `FaceVerticalThirdsScreen`의 `capture` 객체(~L52-60)로 전달.

**검증**: Face ID 실기기(A12+/iPhone XS 이상)에서 `npm --prefix apps/mobile run ios:face-capture-lab` → 로그에서 `matte:capability`로 성공 rung 확정, `matte:embedded hair=true skin=true`. 라이브 landmark/greenlight 정상(특히 Rung 2 발동 시). main 앱 촬영 플로우에 `matte:capability` 로그가 없어야 한다.

### Phase 2 — 분석: 헤어라인 검출 (네이티브)

1. `AURAFaceRatioHairline.m`의 `AURAFaceRatioDetectHairline` 본체 구현 — 파일 내 TODO(codex) 주석 1)~6) 순서대로, §2.2~2.4 계약 준수. 반환 형식은 `AURAFaceRatioHairline.h` 헤더 주석이 SSOT.
2. `AURAFaceRatioAnalyzer.m`: `options` 파싱(`hairline:{enabled,debugArtifacts,tuning}`, 기본 enabled — matte 없는 파일의 aux 조회는 빠른 nil이라 안전). landmark 계산 후(~L404 이후, glabella 확보 시점) `AURAFaceRatioHairlineLandmarks` struct 구성(**원본 파일 URL 전달** — upright UIImage 아님, 모듈이 자체 orientation 처리) → 결과 dict의 `matte`/`hairline`/`debugArtifacts`/`failureReason`을 payload에 병합(`hairlineFailureReason` 키로). `debugPoints`에 idx234/454/10 추가. NSLog: `[aura:face-ratio] native hairline hair=%d skin=%d visible=%d confidence=%.2f candidates=%lu stdPx=%.1f reason=%@`.
3. `#import "AURAFaceRatioHairline.h"` + 필요 시 시스템 프레임워크만(ImageIO/AVFoundation/CoreVideo — Podfile 무변경).

**검증**: JS seam 전환 전 상태로 lab 실행 → `native hairline` 로그로 이마 노출/앞머리/모자 3케이스의 confidence·candidateCount 수집, matte 해상도 확인. `debugArtifacts` 임시 활성화로 PNG 3종에서 matte↔얼굴 정렬 육안 확인(문서 v0.2 §4.3.2).

### Phase 3 — JS provider seam + 상태 매핑 + UI

1. `faceVerticalThirdsService.ts`:
   - `landmark:ready` 직후 `matte:ready` 로그(§4.9: provider `apple_avsemanticsegmentationmatte`, hairAvailable/skinAvailable/matteWidth/Height — matte 없어도 false로 항상 기록).
   - 신규 `selectHairlineKeypoint(nativeResult, w, h)`: `hairline.visible && confidence ≥ APPLE_HAIRLINE_MIN_CONFIDENCE` → H `{provider:'apple_semantic_matte', method:'apple_hair_skin_boundary', confidence, x/y 픽셀 변환}`; 아니면 기존 hApprox 매핑(KEYPOINT_CONFIG의 G/Sn/Me는 불변). `HairlineSelectionTier` 반환.
   - `hairline:ready` 로그 확장(method/visible/confidence/candidateCount/boundaryStdPx/provider) + `keypoint:ready` 로그 추가(§4.9 형식).
   - 상태 선택(~L356): tier `apple_full` && quality gate에서 H 생존(provider가 apple) → `full_success`, 그 외 `partial_success`. 이벤트명 `analysis:partial` 유지 + payload에 `status` 필드 추가(로그 소비자 호환).
   - analyzer 호출 options: `{hairline:{enabled: semanticMattes ? (hair||skin||requested) : true, debugArtifacts: debug, tuning: HAIRLINE_TUNING}}`.
   - `nativeResult.debugArtifacts` 있으면 세션 dir로 복사 후 `result.artifacts.appleHairMatteUri/appleSkinMatteUri/hairlineDebugUri` 기록.
2. `faceVerticalThirdsQualityGate.ts`(~L99-106): provider-aware로 교체 — `H.y < G.y` 순서 검사는 공통. 위반 시 apple→`HAIRLINE_WARNING.invalidOrder`, approx→`approximatedUnusable`로 null 처리. 생존 시 conf≥0.70→`appleMatte`, 0.45~0.70→`appleMatteLowConfidence`, approx→`approximated`.
3. `faceVerticalThirdsMath.ts`(~L59 하드코딩 수정): warnings를 `H?.provider` 기반 파생 — apple 고신뢰→`[]`, apple 저신뢰→`appleMatteLowConfidence`, approx→`approximated`, null→`unavailable`.
4. `faceVerticalThirdsArtifacts.ts`: `saveHairlineDebugArtifacts(sessionId, uris)`(`saveOverlayImage` copyAsync 패턴, 파일명 `apple-hair-matte.png`/`apple-skin-matte.png`/`hairline-debug.png`).
5. `FaceVerticalThirdsScreen.tsx`: `capture.semanticMattes`를 서비스 입력에 전달, `debug`를 debugArtifacts 토글로 전달. `ArtifactFooter`(~L648-671) provider 분기 — approx→기존 "이마 기준선은 근사값이에요.", apple→"헤어라인이 감지되었어요.", apple 저신뢰→"헤어라인 신뢰도가 낮아 참고용이에요.". 디버그 아티팩트 URI 나열. `buildInterpretation`의 "근사값" 카피는 approx일 때만.

### Phase 4 — 회귀/안전 감사

- `grep -rn semanticMatteCapture apps/mobile/src` → lab 플로우만 true.
- main 앱 실기기 촬영: `matte:capability` 로그 없음, 동작/지연 동일.
- lab greenlight 게이트 재검증(Rung 2 발동 시 필수).
- `npm --prefix apps/mobile run typecheck`.

---

## 4. E2E 수용 기준 (실기기 전용 — 시뮬레이터는 카메라/matte 없음)

1. 이마 노출 정면 → result.json `status:'full_success'`, `keypoints.H.provider:'apple_semantic_matte'`, 로그 체인: `capture:ready → landmark:ready → matte:ready(hair:true,skin:true) → quality:gate → hairline:ready(method:apple_hair_skin_boundary, conf≥0.7) → keypoint:ready → ratio:computed → analysis:partial(status:full_success) → overlay:saved`.
2. 앞머리/모자 → apple H 기각(visible:false 또는 저신뢰) → `partial_success`. **H가 불확실한데 full_success가 나오면 실패다**(문서 v0.2 §4.10).
3. matte 미지원 경로(Expo 폴백/갤러리) → `matte:ready hairAvailable:false` + 현행 동작 유지.
4. 디버그 모드 → 세션 dir에 matte PNG 3종, hairline-debug.png의 H선이 실제 헤어라인과 육안 일치.
5. 10회 이상 촬영으로 threshold 튜닝 — `HAIRLINE_TUNING`(constants.ts)으로 리빌드 없이.

## 5. 실기기에서만 확정 가능한 리스크

1. front 카메라 SSM 가용 rung(TrueDepth+720p로 충분한지 vs Photo 프리셋/depth delivery 필수인지) — probe 로그 1회로 확정.
2. JPEG 임베드 SSM round-trip(실패 시 HEIC 컨틴전시, §2.2).
3. Photo 프리셋 전환 시 라이브 MediaPipe/greenlight 영향(4:3 프레임, CPU).
4. 실제 matte 해상도/품질 대비 문서 threshold(0.45/0.35/0.25) 적합성.
5. 하드웨어 하한 A12+(iPhone XS/XR 이상) — 테스트 기기 확인.
6. matte 생성으로 인한 촬영 지연(기존 로딩 상태로 흡수되는지 UX 확인).
