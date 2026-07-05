# AURA 온디바이스 퍼스널 컬러 엔진 — 구현 계획 (v0.1)

> **Codex 구현 핸드오프 문서.** 계획·설계·밑작업은 Claude가, 구현은 Codex가 담당한다.
> 원 제안서: `personalColorExtractionPaper.md`(레포 상위 루트). 이 문서가 구현의 단일 소스오브트루스.
> 기반: `AURA_FACE_HAIRLINE_APPLE_MATTE_PLAN_KO_v0.1.md`, `AURA_FACE_VERTICAL_THIRDS_MEASUREMENT_PLAN_KO_v0.2.md`의 캡처·매트·랜드마크 파이프라인 위에 올린다.

## 핸드오프 요약 (Codex가 먼저 읽을 것)

원 제안서를 다중 에이전트로 비판 검토한 결과: **뼈대(축 우선 → 타입 파생)와 엔지니어링 기반은 탄탄**하나 3개 결함(색과학 미보정 절대 Lab, 수식 버그 3종, 프라이버시 부재)이 확인됨. 아래 계획은 그 결함을 **사용자 결정 4가지**에 맞춰 수정한 최종본이다.

**사용자 결정(불변):**
1. **CPU 픽셀 루프** (Core Image 미사용 — 레포에 CI 전무, premult-alpha·CIKMeans 함정 회피)
2. **상대값 + 정직한 표기** (AWB-lock 후 절대 Lab는 device-relative → within-frame 상대만; 절대 undertone 단정 금지)
3. **5축(skin/hair/lip), 눈 제외, 12타입** (한국 12톤 = 시즌×3)
4. **App-Store 심사 기준 프라이버시** (앱 제출됨, 온디바이스 전용)

**구현 순서 강제:** Phase 0 → 1 → **2(재현성 하드 게이트)** → 3 → … 순서 준수. Phase 2에서 동일 캡처가 시즌/타입을 뒤집으면 STOP하고 ROI/specular/lock부터 수정. 재현 안 되는 feature 위 분류는 무의미.

**밑작업(Claude 완료분):** 재사용 seam 전수 확인 완료 — 네이티브 브리지 템플릿(`AURAFaceRatioAnalyzer.m`), matte 픽셀 read-back 헬퍼(`AURAFaceRatioHairline.m`), JS feature 템플릿(`features/face-ratio/`), 게이트 fold 지점(`CameraFaceCaptureScreen.tsx:530-531`), 테스트 러너(`scripts/mobile/run-generated-brow-contract.mjs`). 각 파일·라인은 본문에 명시.

---

## Locked Decisions (설계 불변식)

| # | 결정 | 이유 |
|---|---|---|
| 1 | **CPU 픽셀 루프** (Core Image 미사용) | 레포에 CI 전무. premult-alpha 오염·CIKMeans footgun 원천 차단. 스틸은 알파 없는 불투명 JPEG/HEIC라 sRGB 비트맵 rasterize 시 RGB 무손상; 알파 가중은 **별도 matte 버퍼**에서만 옴 |
| 2 | **상대값 + 정직한 표기** | AWB-lock 후 절대 Lab는 device-relative. 축은 within-frame 상대(부위 간 관계)만 소비, gray-card 없음 |
| 3 | **5축(skin/hair/lip), 눈 제외, 12타입** | iris는 재검출 시 얻을 수 있으나 신뢰 낮아 defer |
| 4 | **App-Store 기준 프라이버시, 온디바이스 전용** | 앱 제출됨. 얼굴/피부색은 biometric-adjacent |
| 5 | **재현성 검증을 Phase 2(조기)로**, 이후 게이트 | 재현 안 되는 feature 위 분류는 무의미 |

**부호 규약(전역 고정):** Temperature +웜/−쿨 · Value +딥/−라이트 · Chroma +선명/−뮤트 · Clarity +맑음/−소프트 · Contrast +고대비/−저대비. 모든 축 ∈ [−1, 1] 또는 `null`.

---

## Architecture — 네이티브↔JS 분리

- **네이티브**(`AURAPersonalColorAnalyzer.m`): 픽셀만 다룸. rasterize → MediaPipe 재검출 → matte 재구성 → ROI별 **matte-alpha 가중 RGB 통계**(색공간 태그) 반환. Xcode 리빌드 없이 임계값을 못 바꾸는 부분만 네이티브.
- **JS**(`features/personal-color/`): 색과학 + 분류 전부(greenfield). RGB→Lab/ΔE00 → 5축 → 12톤 → 팔레트. 테스트 가능(레포 tsc-러너 + 타입 TS 픽스처, jest 없음).

이 분리는 face-ratio와 동일(네이티브=keypoint, JS=비율/해석).

---

## 1. 네이티브 모듈 — `ios/AURA/AURAPersonalColorAnalyzer.m` (신규)

`AURAFaceRatioAnalyzer.m`를 미러: `RCT_EXPORT_MODULE()`, serial `methodQueue`(`com.aura.personal-color-analyzer`), 캐시된 image-mode `MPPFaceLandmarker`, 시그니처:
```objc
RCT_EXPORT_METHOD(analyze:(NSString *)imageUri options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
```

**파이프라인 (rasterize 1회 → 검출 1회 → matte 재구성 1회 → ROI 샘플):**

1. **로드+정립(upright):** `imageWithContentsOfFile:` 후 EXIF orientation을 픽셀에 bake(`AURAFaceRatioUprightImage` 클론). 하나의 canonical orientation을 matte 경로에도 전달.
2. **1회 rasterize → color 바이트 버퍼:** `E7BrowImageSampler` 레시피(`E7NativeLipBoundaryProviders.swift:1356-1400`)를 따르되 **DeviceRGB 대신 명시적 sRGB**(`CGColorSpaceCreateWithName(kCGColorSpaceSRGB)`). 최신 아이폰 Display-P3 캡처 → deviceRGB는 색관리 skip으로 P3 primary가 temperature 오염(리스크 #3). R,G,B 분리 보존(brow 샘플러는 luminance로 뭉갬 — 금지). `colorSpace:"srgb"` 태그.
3. **MediaPipe image-mode 재검출.** 얼굴 없음 → `status:"no_face"`. iris 468-477 무시(눈 defer).
4. **Hair+Skin matte 1회 재구성:** 승격된 `AURAHairlineCopyMatteFromSource(source, …HairMatte/SkinMatte, orientation)` → `.mattingImage` CVPixelBuffer. 샘플링 전체 구간 `kCVPixelBufferLock_ReadOnly`. `{skinAvailable,hairAvailable,matteW,matteH}` 기록. **matte↔image 해상도 불일치는 `AURAHairlineSampleNorm(buffer,nx,ny)`(정규화 0..1)로 이미 해결** — resize 불필요.
5. **ROI 구성:**
   - **Skin(3패치: 좌볼/우볼/이마)** — 랜드마크 배치 + **skin-matte 게이트**. 좌볼≈`{50,101,118,119,205,36}` 평균, 우볼≈`{280,330,347,348,425,266}`, 이마≈`{10,151,9,107,336}` 밴드. 후보 픽셀은 정규화 좌표로 skin-alpha>~0.6일 때만 채택(머리카락·안경·눈썹·배경 배제).
   - **Hair** — matte 주도(랜드마크 없음). 이마 상단(idx 10) 위 밴드에서 hair-alpha>~0.6. 랜드마크 폴백 없음 → **optional/degradable**(리스크 #1).
   - **Lip** — 랜드마크 폴리곤(입술 matte 없음). outer(`mediaPipeOuterLipIndices`)에서 inner(`mediaPipeInnerLipIndices`) point-in-polygon 차감(치아/입안 제외).
6. **ROI별 집계:**
   - **matte-alpha 가중 평균:** `mean = Σ(colorᵢ·αᵢ)/Σ(αᵢ)`(skin=skin-matte, hair=hair-matte, lip=폴리곤 내부 α=1).
   - **가중 분산**(채널별) → confidence 신호.
   - **specular 제거:** near-white·저채도(glint) 드롭 + 상위 ~8%/하위 ~3% luminance 트림. `specularRejectedRatio` 반환.
   - **over/under 노출:** `max(RGB)≥250` / `≤16`.
   - **dominant:** 8×8×8 RGB 히스토그램 mode 빈 centroid(**k-means/CIKMeans 없음**).
   - **부위 confidence 0..1** = f(sampleCount, matteCoverage, 노출비율, specular, 분산).
7. **반환 payload**(색공간 태그, JS가 축 계산):
```
{ status, faceCount, landmarkCount, imageWidth, imageHeight, colorSpace:"srgb",
  matte:{skinAvailable,hairAvailable,matteWidth,matteHeight},
  regions:{ skinCheekLeft|skinCheekRight|skinForehead|hair|lip:{
    rgbMean:{r,g,b}, rgbVariance:{r,g,b}, dominant:{r,g,b},
    sampleCount, matteCoverage, overexposedRatio, underexposedRatio,
    specularRejectedRatio, confidence } },
  warnings:[...] }
```
`status:"unsupported"` 우아한 폴백(faceRatioAnalyzerNative 패턴). 카메라 메타데이터는 JS가 캡처 payload에서 직접 보유.

**등록:** `ios/AURA.xcodeproj/project.pbxproj`에 `AURAFaceRatioAnalyzer.m`와 동일하게 3곳(PBXFileReference, PBXBuildFile, Sources build phase) 추가.

**헬퍼 재사용:** `AURAHairlineCopyMatteFromSource` + `AURAHairlineSampleNorm`을 `AURAFaceRatioHairline.h`로 **승격**(drift 방지). lip index 배열은 Obj-C로 **복제**(`E7NativeLipBoundaryProviders.swift:1842-1850` 교차참조 주석) — 현 `extractLipBoundary`는 `arFaceExportPath` 강제라 그대로는 재사용 불가.

---

## 2. JS feature 트리 — `src/features/personal-color/` (face-ratio 미러)

```
types.ts            NativePersonalColorResult, PersonalColorRegion, 5축, PersonalColor12Type,
                    AURAPersonalColorResult, PersonalColorPrivacy 불변식
constants.ts        5축 임계값(INSTRUMENTED·튜너블), 12톤 프로토타입, 부위 가중치, schemaVersion 'aura-personal-color-v1'
services/
  personalColorAnalyzerNative.ts   NativeModules.AURAPersonalColorAnalyzer 래퍼 + isAvailable + status:'unsupported'
  personalColorService.ts          오케스트레이터(faceVerticalThirdsService 클론): native→qualityGate→axes→classify→
                                   정직-confidence→artifacts→JSONL→result; privacy 불변식 assert; personal_color는 업로드 경로 미호출
  personalColorAxes.ts (+.test)    PURE: regions→5축, within-frame 상대만
  personalColorClassify.ts (+.test) PURE: 5축→12톤 + confidence + 걸침/uncertain 밴드
  personalColorRepeatability.ts (+.test)  N캡처 per-axis stdev/spread + pass/fail (Phase 2 게이트)
  personalColorQualityGate.ts      노출/pose 게이트 → usable + warnings
  personalColorArtifacts.ts        expo-file-system/legacy 세션 dir + saveSource/Overlay/writeResultJson + deletePersonalColorData()
  personalColorLogger.ts           세션 dir + JSONL(__DEV__ only)
  personalColorConsentStore.ts     AsyncStorage `personalColorConsentAcceptedAt`
components/
  PersonalColorSwatchOverlay.tsx   ROI 마커 + 스와치(**얼굴 픽셀 없음**, captureRef 아티팩트)
  PersonalColorTypeCard.tsx        12톤 카드 + 정직 confidence 카피
screens/
  PersonalColorScreen.tsx          mount→analyze→setResult→captureRef→finalize (FaceVerticalThirdsScreen 드라이버 클론)
  PersonalColorConsentScreen.tsx   최초 캡처 전 just-in-time 동의 게이트
```
신규 순수 로직은 `personalColorAxes.ts`(상대 수식)·`personalColorClassify.ts`(12톤) 둘뿐 — 모든 임계값 리스크가 여기 격리되어 테스트됨.

---

## 3. 수식 (버그 3종 수정) — 이 계획의 핵심

**색 유틸(`colorMath.ts`, greenfield):** sRGB(8-bit,태그)→linear→XYZ(D65)→Lab/LCh, **CIEDE2000** 전체 구현. 코드 헤더+contract에 **device-relative demotion** 명시: AWB-lock 후 절대 Lab는 device·scene-relative → 하위 축은 (i) 고정 population ref 대비 within-ROI 형태(Value/Chroma), (ii) 동일 프레임 부위 간 관계(Temperature/Contrast)만 소비. 절대 Lab 단정 축 없음.

**Reference 전략(`referencePoints.ts`, 하이브리드):** Value/Chroma는 **고정 population ref**(모집단 대비 라이트/딥·선명/뮤트). Temperature/Contrast는 **per-capture 상대 ref**(프레임 내 저채도 중립 픽셀 median; 없으면 고정 `U_ref` 폴백 + temperature confidence 하향). 사용된 ref는 `artifacts.referencePoints`에 기록. **모든 고정 상수는 calibration target.**

고정 ref(전부 calibration target): `D_ref_skin=0.45,D_scale_skin=0.22`, `D_ref_hair=0.75/0.20`, `D_ref_lip=0.55/0.18`; `C_ref_skin=20/12`, `C_ref_lip=45/25`; `U=b*−a*`, `U_ref_skin=6/8`, `U_ref_lip=−17/15`, `U_ref_hair=3/6`; `σ_ref=18`.

**부위별 정규화 sub-feature**(각 `clamp(±1)`):
```
valSkin=(0.55−L*_skin/100)/0.22   valHair=((1−L*_hair/100)−0.75)/0.20   valLip=((1−L*_lip/100)−0.55)/0.18
chrSkin=(C*_skin−20)/12           chrLip=(C*_lip−45)/25
tmpSkin=((b*_skin−a*_skin)−6)/8   tmpLip=((b*_lip−a*_lip)+17)/15        tmpHair=((b*_hair−a*_hair)−3)/6
varSkin=clamp(σRGB_skin/18−1,±1)
```

**유효 부위 confidence:** `qEff_r = q_r·expPenalty_r·areaPenalty_r`, `expPenalty=clamp(1−2·max(0,over−0.10)−2·max(0,under−0.10),0,1)`, `areaPenalty=clamp(area/areaMin,0,1)`(areaMin skin .08/hair .03/lip .01).

**★ bug #2 수정 — q 재정규화 aggregator(단일 재사용 헬퍼):**
```
aggregate(entries:{w,v,qEff}[], qFloor=0.35):
  W = Σ w·qEff
  if W < qFloor: return {value:null, floored:true}
  return {value: clamp(Σ(w·v·qEff)/W, −1, 1), floored:false, support:W}
```
→ (i) 모든 q에 상수 곱해도 축 불변(0으로 수축 안 함), (ii) 고신뢰 소수 부위가 `w·q` 몫 이상으로 부호 탈취 불가. floor 미만이면 `null` + measurementConfidence 하향.

**부위 가중치(Σ=1):**
| 축 | skin | hair | lip |
|---|--:|--:|--:|
| Temperature | 0.60 | 0.10 | 0.30 |
| Value | 0.55 | 0.35 | 0.10 |
| Chroma | 0.45 | 0.00 | 0.55 |

```
Temperature = aggregate([{.60,tmpSkin,qS},{.10,tmpHair,qH},{.30,tmpLip,qL}])
Value       = aggregate([{.55,valSkin,qS},{.35,valHair,qH},{.10,valLip,qL}])
Chroma      = aggregate([{.45,chrSkin,qS},{.55,chrLip,qL}])   // hair 제외
```

**Contrast(관계식 + min q):**
```
VC = 0.7·|L*_skin−L*_hair| + 0.3·|L*_skin−L*_lip|
CC = 0.6·ΔE00(skin,hair) + 0.4·ΔE00(skin,lip)
contrastScore = 0.65·(VC/35) + 0.35·(CC/30)
Contrast = clamp((contrastScore−0.50)/0.35, ±1);  qContrast=min(qS,qH,qL)
// hair 없으면 skin-lip만으로 재가중, qContrast=min(qS,qL), warn; qContrast<0.35 → null
```

**Clarity(복합):** `Clarity = clamp(0.5·chrSkin + 0.3·(−varSkin) + 0.2·Contrast_or_0, ±1)`; `qEffSkin<0.35 → null`. (Chroma/Contrast 잔여 collinearity는 calibration 항목으로 flag.)

각 축 반환: `{value:number|null, confidence, floored, basis:'within-frame-relative'}`.

**12톤 프로토타입 좌표** `[Temp,Value,Chroma,Clarity,Contrast]` — **교육적 시작값, 전부 Phase 2 calibration target(prior)**:
```
SPRING  spring_light  [+.55,−.75,+.25,+.30,−.35]  spring_bright [+.45,−.30,+.85,+.85,+.45]  spring_true [+.85,−.35,+.60,+.55,+.10]
SUMMER  summer_light  [−.50,−.70,−.25,−.25,−.55]  summer_true   [−.85,−.30,−.35,−.35,−.25]  summer_muted[−.55,−.10,−.70,−.80,−.60]
AUTUMN  autumn_muted  [+.55,+.35,−.55,−.70,−.20]  autumn_true   [+.90,+.45,+.20,−.35,+.15]  autumn_deep [+.65,+.85,+.30,−.05,+.55]
WINTER  winter_bright [−.55,+.35,+.85,+.90,+.85]  winter_true   [−.90,+.45,+.55,+.70,+.70]  winter_deep [−.60,+.90,+.50,+.55,+.90]
```

**★ bug #3 수정 — 거리·softmax·앵커 임계값:**
```
ω = [Temp 1.0, Value 1.0, Chroma 0.6, Clarity 0.8, Contrast 0.9]   // chroma 최저 신뢰
d(x,P_k) = √( Σ_{i∈present} ω_i(x_i−P_ki)² / Σ_{i∈present} ω_i )   // null 축 드롭 후 재정규화
p_k = exp(−d_k/τ) / Σ_j exp(−d_j/τ);  gap = p_top − p_second
τ0 = 0.30 (pre-calibration 기본)
MIXED_GAP=0.12  SECONDARY_MIN=0.20  NEUTRAL_MIN=0.28   // 확률공간(스케일 안정)
```

**τ·임계값 보정(Phase 2 재현성 캡처로):** 소규모 라벨 패널 × 조명 × N(≥3)프레임. τ 스윕 `{.15,.20,.30,.45,.60}` → (1) per-person top-type flip rate, (2) cusp 패널의 `mixed` 비율 측정 → **flip rate 최소화하며 진짜 cusp 얼굴 ≥80%가 `mixed`**인 τ 선택. 이후 `MIXED_GAP/NEUTRAL_MIN` 설정. `{τ,임계값들}`을 버전드 `CALIBRATION` const로 저장; `calibrationApplied`는 보정셋 로드 시에만 true.

**보정 전:** 절대 단일타입 단정 금지 → `status:'provisional'`, `preCalibrationHedge:true`, 헤지 카피(`가까운 톤: {top}·{secondary} (보정 전 참고용)`), 항상 5축 + top-2 확률 노출.

**measurementConfidence 게이팅:**
```
mc = clamp(0.5·mean(qEff)+0.3·(axesPresent/5)+0.2·clamp(nFrames/3,0,1)−globalExpPenalty, 0,1)
'definitive'   : mc≥0.70 AND typeScore≥NEUTRAL_MIN AND gap≥MIXED_GAP AND calibrationApplied
'mixed'        : mc≥0.45 AND gap<MIXED_GAP (top-2 헤지)
'provisional'  : mc≥0.45 AND (!calibrationApplied OR typeScore 낮음) (헤지)
'insufficient' : mc<0.45 OR ≥2축 null → 재촬영 안내, 타입 미주장(tone=null)
```

**팔레트(소프트 프레이밍):** `undertoneTarget=|Temp|<0.25?'neutral':Temp>0?'warm':'cool'`, `valueTarget=Value<−.33?'light':Value>.33?'deep':'mid'`, `chromaTarget=(Chroma>.40&&Clarity>.30)?'vivid':(Chroma<−.20&&Clarity<−.20)?'soft':'clear'`. **best**=타깃 밴드 + 인접 1밴드. **worst**=반대 undertone×반대 chroma, 단 "안 어울림" 금지 → 축 태그 이유("포인트로 쓰면 좋아요"). `colorFamily{id,undertone,valueBand,chromaBand,labelKo,exemplars}` 3×3×3 그리드; 제품추천 join key=`(undertone,valueBand,chromaBand)`+top tone id.

---

## 4. colorLightingGreenlight — `face-capture/services/colorLightingGreenlight.ts` (신규)

**제약:** 실시간 스트림은 랜드마크+`cameraMetadata`만 줌(**per-frame 픽셀 없음**). 조명은 `iso/exposureDurationMs/whiteBalanceGains/adjusting*`에서만 추론 → 반드시 soft.

- **HARD-block(최소·자기해소·비적층):** base(랜드마크/센터링/pose) + **`awb_ae_not_settled`**(`adjustingWhiteBalance||Exposure||Focus` → 셔터 락이 전이 중 상태를 얼림). ~1초 내 자기해소라 데드엔드 불가. **유일한 신규 하드 게이트.**
- **SOFT-warn(계측·로깅·비차단):** `too_dark`(iso 높음), `too_bright`(iso 매우 낮음+짧은 노출), `strong_color_cast`(WB gain 중립밴드 밖 — 실내 웜광 흔해 차단 금지, 상대 프레이밍이 흡수).

리포트 `{finalColorGreenlight, hardBlockClear, lightingWarnings[], metrics{iso,exposureDurationMs,wbRatioRG,wbRatioBG,adjusting}, message}`. 경고는 비차단 힌트 + greenlight JSONL 적재 → Phase 7 전까지 임계값 승격 금지.

**Fold(`CameraFaceCaptureScreen.tsx`, pitch gate 패턴 484-531/949-983):**
- `semanticMatteCapture = requireGreenlight && (captureType==='face_analysis' || 'personal_color')`.
- `requireColorLighting = requireGreenlight && captureType==='personal_color'`; `shouldBlockForColorLighting = requireColorLighting && !colorReport.hardBlockClear` → `isCaptureDisabled`(530-531) + `handleCapture` 가드(965-973)에 추가.

---

## 5. 프라이버시 슬라이스 (App Store)

현 갭(확인됨): `LoginScreen.tsx:102` 죽은 개인정보처리방침 `<Text>`(onPress 없음); 온보딩 동의 의도적 제거(`requiresPrivacyAgreement:false`); 아티팩트 삭제 전무; `회원 탈퇴` 스텁; `PrivacyInfo.xcprivacy` `NSPrivacyTracking:false`.

1. **최초 캡처 전 동의** — `PersonalColorConsentScreen.tsx`(1회, `personalColorConsentStore` 플래그 게이트). 카피: 온디바이스 전용, 업로드 없음, 얼굴 이미지는 색 추출용 일시 사용·로컬 저장·삭제 가능. **feature-scoped 민감정보 동의**(앱 전역 온보딩 동의와 무관).
2. **작동하는 개인정보처리방침** — `features/legal/screens/PrivacyPolicyScreen.tsx`(실제 카피) + 죽은 `LoginScreen.tsx:102` 링크 연결 + 동의 화면 링크. App Store Connect에도 도달 가능 URL 필요.
3. **App Privacy 라벨** — 퍼컬 자체는 **Data Not Collected**. 단 앱은 백엔드 존재(`faceCaptureUploadService`)라 앱 전역 라벨은 "무수집"이 아님 → 퍼컬이 아무것도 추가 안 함을 코드로 보장(#5). `PrivacyInfo.xcprivacy` 정확 유지.
4. **목적 문자열** — `NSCameraUsageDescription` 이미 존재. 퍼스널 컬러(색) 분석 명시로 확장. **`app.json`의 `expo.ios.infoPlist` 편집**(Info.plist 단독 편집은 prebuild에서 소실).
5. **로컬 전용 불변식** — `lipGenerateCore`의 `LipGeneratePrivacy`+`validatePrivacyFlags()` 재사용. `PersonalColorPrivacy{localOnly:true;offDeviceUpload:false;longTermRawFrameStored:false}` 정의·assert. `captureType==='personal_color'`는 로컬 analyze만, `faceCaptureUploadService` presigned-upload 경로 **절대 미호출**로 분기.
6. **삭제 컨트롤** — `deletePersonalColorData()`(`FileSystem.deleteAsync` 세션 트리) → "내 색상 데이터 삭제" 버튼. `longTermRawFrameStored:false` 이행: 스와치 오버레이 확정 후 `source.jpg` 삭제, 오버레이는 **스와치만(얼굴 픽셀 없음)**.

---

## 6. Phase 계획 (재현성 게이트 조기)

- **Phase 0 — 스캐폴딩·seam.** `AURAPersonalColorAnalyzer.m` 스텁(`status:"ok"`, 빈 regions)+pbxproj 등록; 네이티브 래퍼; feature 스켈레톤; `'personal_color'`를 `FaceCaptureUploadCaptureType`에 추가; `semanticMatteCapture` 확장; `FaceCaptureLabApp.tsx`가 `personal_color` 캡처에 `PersonalColorScreen` 마운트. **게이트:** 모듈 로드·payload 수신·아티팩트 기록.
- **Phase 1 — ROI+색통계(네이티브).** Step 1-7 전체; 스와치 오버레이. **게이트:** 여러 얼굴에서 스와치 그럴듯; 디버그 matte-overlay PNG(`AURAHairlineImageFromMatte` 재사용)로 skin/hair/lip 정합 확인.
- **★ Phase 2 — 재현성 검증(조기·게이팅).** `personalColorRepeatability.ts` + `FaceCaptureLabApp` 랩 러너: 같은 얼굴 N회 → 부위 RGB 평균+5축 raw 입력 기록 → per-axis stdev/spread+verdict. **실기기 matte hit-rate**도 측정(전면 카메라 matte 부재 가능). **하드 결정 게이트:** 동일 캡처가 시즌/타입을 뒤집으면 STOP, ROI/specular/lock부터 수정. 이후 전부 이에 의존.
- **Phase 3 — 축+12톤(JS).** `personalColorAxes`+`personalColorClassify` + 합성 픽스처 단위테스트. **게이트:** Phase 2 통과 입력에서 안정 분류.
- **Phase 4 — colorLightingGreenlight+fold.** 게이트 구현(하드: awb_ae_not_settled+base; 소프트: 계측) + `personal_color` 스코프 fold. **게이트:** 데드엔드 없음, 경고 로깅.
- **Phase 5 — 결과 UI.** `PersonalColorScreen`+`PersonalColorTypeCard`+스와치 아티팩트.
- **Phase 6 — 프라이버시.** 동의 화면+스토어+게이트; 처리방침+죽은 링크 연결; 불변식+무업로드 분기; 삭제+source 즉시정리; 목적 문자열; xcprivacy 검증. **게이트:** App Review 체크리스트.
- **Phase 7 — 보정·하드닝.** 누적 greenlight+재현성 로그로 축 임계값·τ·프로토타입 보정, 소프트→하드 승격 여부 결정. 승격은 여기서만.

---

## 7. 생성/수정 파일

**신규 네이티브:** `ios/AURA/AURAPersonalColorAnalyzer.m`(+`.h`)
**수정 네이티브:** `ios/AURA/AURAFaceRatioHairline.h`(헬퍼 2개 승격) · `ios/AURA.xcodeproj/project.pbxproj`(등록)
**신규 JS:** `src/features/personal-color/**`(위 트리 전체) · `src/features/face-capture/services/colorLightingGreenlight.ts`(+test) · `src/features/legal/screens/PrivacyPolicyScreen.tsx` · `scripts/mobile/run-personal-color-contract.mjs`
**수정 JS:** `src/features/face-capture/screens/CameraFaceCaptureScreen.tsx`(게이트 fold + 무업로드 분기) · `src/app/experiments/FaceCaptureLabApp.tsx`(스크린 스왑 + 랩 러너) · `src/features/auth/screens/LoginScreen.tsx`(죽은 링크 연결) · `app.json`(카메라 목적 문자열) · `package.json`(`"test:personal-color"`)
**기존 리스크 별도 표기(이 기능 밖):** `회원 탈퇴` 스텁(`ProfileEditScreen.tsx:530-535`) — Apple 5.1.1(v) 계정 삭제 필수.

---

## 8. 테스트 (레포 관례: jest 없음)

**픽스처** `personalColorFixtureInventory.ts`(타입 TS·스키마버전, JSON 아님): `light_cool_summer, deep_warm_autumn, bright_clear_winter, muted_soft_summer, cusp_spring_summer, low_confidence_all, hair_missing, overexposed_skin`.
**러너** `scripts/mobile/run-personal-color-contract.mjs`(`run-generated-brow-contract.mjs` 클론: tsc→node) + `package.json` `"test:personal-color"`. 인라인 `expect/expectClose` 헬퍼, `runXTests()` export.

**버그별 assertion:**
- **#1 센터링:** Lab 왕복(`sRGB(255,0,0)→L*≈53.24,a*≈80.09,b*≈67.20`, gray→a*≈b*≈0); ΔE00 Sharma 검증쌍(`Lab(50,2.6772,−79.7751)`vs`(50,0,−82.7485)→2.0425`, ε=1e-3); `light_cool_summer⇒value<0`, `deep_warm_autumn⇒value>0`; `muted_soft_summer⇒chroma<0`, `bright_clear_winter⇒chroma>0`.
- **#2 q 재정규화:** 전역-q 불변(모두 0.9 == 모두 0.4, ε=1e-9); 한 부위 qEff→0에도 남은 부위 값 범위·부호 유지; `low_confidence_all⇒축 null·floored·status 'insufficient'·tone null·mc 하향`.
- **#3 τ/걸침 앵커:** `cusp_spring_summer`가 τ∈{.15,.30,.60} 전부 `isMixed`·같은 top-2; `bright_clear_winter`가 스윕 전부 `top==='winter_bright'`·`gap≥MIXED_GAP`; 확률합=1(ε=1e-6); τ↑ 시 cusp gap 단조 감소.
- **구조:** 프로토타입 정확히 12개·5축 전부 ∈[−1,1]·4시즌×3·최소 쌍거리>0·시즌 centroid 부호 정합.

---

## 9. Verification (엔드투엔드)

1. **빌드:** iOS 실기기 빌드(사용자 직접). 모듈 로드 확인.
2. **랩 실행:** `FaceCaptureLabApp`에서 `personal_color` 캡처 → payload·스와치·아티팩트 확인. 디버그 matte-over-image 오버레이로 ROI 정합.
3. **재현성(Phase 2 게이트):** 같은 얼굴 N회 × 조명 → per-axis spread·matte hit-rate. 시즌/타입 flip 시 중단.
4. **단위테스트:** `npm run test:personal-color` — 버그 3종 assertion 통과.
5. **프라이버시:** 무업로드(네트워크 로그 0), 삭제 버튼 실제 파일 purge, source.jpg 확정 후 삭제, 처리방침 링크 도달, 동의 게이트 최초 1회.

---

## 10. Top 리스크 (구현 시 주의)

1. **전면 카메라 semantic matte 부재 가능** → hair는 랜드마크 폴백 없음. hair optional·축 우아한 저하·Phase 2에서 hit-rate 측정. *(가장 틀릴 수 있는 가정)*
2. **상대 feature가 12개 미세 타입에 충분히 재현되나** → 확신 없음. 넓은 uncertain 밴드, 저신뢰 시 4시즌으로 collapse, Phase 2가 게이트.
3. **색공간** — Display-P3 스틸을 DeviceRGB로 rasterize하면 temperature 오염 → 명시 sRGB.
4. **orientation 정합** — color 버퍼(upright)와 matte(EXIF 적용) 불일치 시 헤어라인에서 skin이 hair 픽셀 오염 → 단일 canonical orientation.
5. **lip ROI 본질적 노이즈**(gloss/치아) → 가중 낮춤·confidence 게이트.
6. **static/private 재사용** — matte 샘플러 header 승격, lip index 복제.
7. **greenlight 실시간 픽셀 부재** → 조명은 iso/노출/WB 프록시 추정(오발 가능) → 전부 soft·Phase 7 보정.
