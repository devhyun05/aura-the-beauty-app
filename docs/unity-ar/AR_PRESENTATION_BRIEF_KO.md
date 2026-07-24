# AR 발표 대비 브리핑 — 3시간 속성 이해

> 목적: 우리 앱 AR 파트의 **구조를 설명하고 기술 질문에 답할 수 있는 상태**로 만들기.
> 기준: `fix/ar-asset-0723` 작업 트리 (2026-07-24). 코드 직접 확인.
>
> 관련 문서
> - [`AR_MAKEUP_RENDERING_PIPELINE_REPORT_KO.md`](AR_MAKEUP_RENDERING_PIPELINE_REPORT_KO.md) — 렌더링 내부 레퍼런스(2026-07-16 기준, **일부 stale** → §5 참조)
> - [`AR_MAKEUP_PIPELINE_QA_KO.md`](AR_MAKEUP_PIPELINE_QA_KO.md) — 원리 문답

---

## 0. 3시간 타임박스

| 시간 | 할 일 | 읽을 것 |
|---|---|---|
| 0:00–0:15 | §1 한 문장 요약 + §2 5층 구조 암기 | 이 문서 |
| 0:15–0:45 | §3 데이터 흐름 — 손가락으로 짚으며 1회 완주 | 이 문서 + 파일 열어보기 |
| 0:45–1:15 | RN 쪽: `StencilARApp.tsx` 헤더 주석 → `lookTree.ts` 헤더 → `model.ts` `compileLayers` | 3개 파일 상단 주석만 |
| 1:15–1:50 | Unity 쪽: `AuraMediaPipeGraftBootstrap` → `NativeBridge` → `MakeupController.ApplyTo` → `MakeupQueues` | C# 4개 |
| 1:50–2:10 | §4 "자랑할 기술 결정 6가지" 소리내어 설명해보기 | 이 문서 |
| 2:10–2:40 | §6 예상 질문 30개 답변 리허설 | 이 문서 |
| 2:40–3:00 | §7 숫자 치트시트 암기 + §5 약점 방어 문장 | 이 문서 |

**요령:** 코드를 다 읽으려 하지 말 것. 이 프로젝트 AR 코드는 파일 하나가 5,000줄이다(`StencilARApp.tsx` 5,155줄, `RNBridge.cs` 5,182줄). **파일 상단 주석이 설계 근거를 담고 있으므로 주석만 읽어도 된다.**

---

## 1. 한 문장 요약

> **"React Native 앱 안에 Unity를 UaaL로 얹고, MediaPipe 478점 얼굴 랜드마크 위에 UV 마스크와 부위별 전용 셰이더로 메이크업을 실시간 합성한다. RN은 룩(what)을 결정하고 Unity는 렌더(how)만 한다."**

### 30초 발표 스크립트

"AR 메이크업은 세 층입니다. **첫째, RN 레이어** — 사용자가 고르는 룩을 재귀 트리로 모델링하고, 이걸 평탄화해서 Unity가 이해하는 파라미터 커맨드로 컴파일합니다. **둘째, 브리지 레이어** — iOS UaaL 위에서 JSON 메시지를 주고받습니다. **셋째, Unity 렌더 레이어** — MediaPipe로 얼굴 478점을 찾고, 얼굴을 평면으로 펼친 UV 좌표 위에 마스크를 올린 뒤, 부위별 전용 셰이더가 카메라 원본 픽셀의 명암을 보존하면서 색을 입힙니다. 얼굴이 움직여도 화장이 붙어 있는 이유는 화면 좌표가 아니라 UV 좌표에 저장하기 때문입니다."

---

## 2. 5층 구조

```
┌─────────────────────────────────────────────────────────┐
│ ① RN UI / 룩 모델        StencilARApp.tsx (5,155줄)      │
│    LOOK 레인(메이크업 트리) + FIT 레인(얼굴형 보정)      │
│    lookTree.ts · model.ts · regions.ts                   │
└───────────────┬─────────────────────────────────────────┘
                │ flattenTree → compileLayers
                │ = FilterParams + OverlayLayer[]
┌───────────────▼─────────────────────────────────────────┐
│ ② RN 브리지              unityMakeupBridge.ts (2,628줄)  │
│    postUnityMessage('NativeBridge','OnMessageFromRN',…)  │
└───────────────┬─────────────────────────────────────────┘
                │ NativeModule
┌───────────────▼─────────────────────────────────────────┐
│ ③ iOS 네이티브           UnityMakeupBridge.m             │
│    UnityFramework 싱글턴 · UnitySendMessage              │
│    UnityMakeupContainerView가 Unity rootView를 호스팅     │
└───────────────┬─────────────────────────────────────────┘
                │ UnitySendMessage
┌───────────────▼─────────────────────────────────────────┐
│ ④ Unity 로직             NativeBridge.cs → MakeupController│
│    JSON 파싱 · 부트 상태 게이팅 · 렌더러별 분배           │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│ ⑤ Unity 렌더             FaceLandmarkSource(MediaPipe)   │
│    CanonicalFaceMesh + 부위별 렌더러 14개 + 셰이더        │
│    렌더 큐 3000~4000으로 순서 고정                        │
└─────────────────────────────────────────────────────────┘
```

### 각 층의 책임 한 줄

| 층 | 책임 | 절대 안 하는 것 |
|---|---|---|
| ① RN 룩 모델 | 무엇을 바를지 결정, undo/저장/편집 | 좌표 계산, 픽셀 |
| ② RN 브리지 | 직렬화, ready 핸드셰이크, 재동기화 | 룩 판단 |
| ③ iOS 네이티브 | Unity 플레이어 수명주기, 뷰 마운트 | 메이크업 로직 |
| ④ Unity 로직 | 파라미터를 렌더러/머티리얼에 분배 | 룩 결정 |
| ⑤ Unity 렌더 | 얼굴 추적, 마스크, 셰이더, 합성 | 사용자 의도 해석 |

**핵심 원칙(코드 주석에 명시됨): "모델은 RN에만, 브리지엔 컴파일된 커맨드만"** — `model.ts:1`

---

## 3. 데이터 흐름 — 진입부터 픽셀까지

### 3.1 화면 진입 (2가지 경로, 도착지는 하나)

```
홈 "메이크업 필터" 바로가기 ─┐
                            ├→ ARFilter 라우트 → StencilARApp
추천 "AR로 적용하기" ────────┘   (recommendedLook 주입)
```

- 라우트: [`arRoutes.tsx:14`](../../apps/mobile/src/app/navigation/routes/arRoutes.tsx#L14) — `ARFilterRouteScreen`
- **과거에 있던 독립 `ARFilterScreen`은 삭제됨.** AR 화면은 `StencilARApp` **하나**로 통일됐다. (문서 리포트에 남은 `ARFilterScreen` 서술은 stale — §5)

### 3.2 추천 → AR 룩 주입

```
AI 분석 리포트 (퍼스널컬러·얼굴형)
    ↓
LLM 룩 추천 (MakeupLookRecommendation.areaGuides = 부위별 색/질감/강도)
    ↓ getMakeupRecommendationStencilRouteParams()      makeupRecommendationRouteActions.ts:57
    ├─ 1순위: createLookMakeupEditState(look, colors)  ← areaGuides 자체가 레시피
    └─ 폴백:  role 고정 프리셋 + 분석색만 개인화
    ↓ createRecommendedStencilLook()                    recommendedStencilLook.ts
StencilInitialLook { label, params: Partial<FilterParams>, eyeshadowLayers[] }
    ↓ 라우트 파라미터로 전달
StencilARApp — buildInitialLookTree()로 컴포저 트리에 1회 분해 적용
```

**설명 포인트:** 주입된 추천 룩은 "사진→룩 추출"과 **같은 관문(`changeTreeUser`)** 을 통과한다. 그래서 추천으로 들어온 룩도 undo·저장·부위별 재편집이 일반 룩과 완전히 동일하게 동작한다. ([`stencilInitialLook.ts:3`](../../apps/mobile/src/features/ar/stencil/stencilInitialLook.ts) 주석)

### 3.3 룩 트리 → 브리지 커맨드

```
LookNode (재귀 트리)
  전체 룩 = 부위 룩의 합 = 세부 룩의 합 = 제품 적용(잎)의 합
  ├─ 상위 계층: 하위 참조의 묶음일 뿐, 자체 데이터 없음
  └─ 잎(ProductLeaf): 실제 렌더 데이터 = Partial<FilterParams>
        ↓ flattenTree()           lookTree.ts:810
   ComposerLayer[]
        ↓ compileLayers()          model.ts:269
   { FilterParams, OverlayLayer[], LensLayer[], EyeshadowLayer[] }
        ↓ sendToUnity()            StencilARApp.tsx:972
   applyFilter / setOverlayLayers / setLensLayers / setEyeshadowLayers
```

**copy-on-write 3규칙** (`lookTree.ts:7` 주석 — 발표에서 인용하기 좋음):
1. 편집 중 절대 묻지 않는다 — 트리는 항상 작업본, dirty(*)만 전파
2. 시스템 프리셋은 불변 — 수정분은 저장 시 자동 사본
3. 중간 계층은 기본 익명으로 상위에 흡수 — ☆승격으로만 라이브러리 등록

**2개 레인:** LOOK(메이크업, 로즈) / FIT(얼굴형 보정 워프, 골드). 워프 필드는 **FIT 레인이 단독 소유**하고 룩 트리는 절대 갖지 않는다 — 조합 폭발을 막는 설계.

### 3.4 브리지 프로토콜

- **RN → Unity:** `postUnityMessage('NativeBridge', 'OnMessageFromRN', JSON)` → iOS `UnitySendMessage` → `NativeBridge.OnMessageFromRN(string json)`
- **Unity → RN:** `sendMessageToMobileApp` (Obj-C) → RN `UnityMakeupEvent` 네이티브 이벤트
- 타입 계약: [`src/bridge/types.ts`](../../apps/mobile/src/features/ar/stencil/src/bridge/types.ts) ↔ `BridgeMessages.cs`
- RN→Unity 메시지 **약 35종** (`applyFilter`, `setOverlayLayers`, `setLensLayers`, `setEyeshadowLayers`, `setRegionMask`, `setLighting`, `capture`, `extractLook` …)
- Unity→RN **약 15종** (`ready`, `booting`, `faceTracked`, `photoCaptured`, `lookExtracted`, `error` …)

**ready 핸드셰이크가 이 시스템의 가장 까다로운 부분** — §6 Q11~Q13에서 다룬다.

### 3.5 Unity 내부 — 부트스트랩

```
AURA 씬(MakeupARFaceValidation.unity)이 ARSession을 이미 소유
    ↓
ARBootstrap.Init()  → ARSession 이미 있음 → 조기 return (upstream 단독 실행용)
    ↓
AuraMediaPipeGraftBootstrap.Spawn()  [RuntimeInitializeOnLoadMethod]
    → "Aura Stencil Runtime" GameObject 생성
    → Update()에서 ARCameraManager를 찾으면 1회 배선:
        FramePresenter · FaceLandmarkSource · FaceWarpField · CanonicalFaceMesh
        IrisRenderer · LipRenderer · LipStyleRenderer · BlushStyleRenderer
        BrowRenderer · PencilRenderer · StyleRenderer · EyelinerStyleRenderer
        LowerLidRenderer · LashRenderer · MakeupController
    → 씬에 이미 있으면 편입만: TeethRenderer · DoubleLidRenderer ·
        StencilGuideRenderer · SymmetryGuideRenderer · SplitMaskRenderer ·
        LightingSimRenderer
    → AuraStencilHost가 이 전부를 controlled 목록으로 묶어 한 번에 on/off
    → NativeBridge.MarkReady()  ← ARBootstrap이 bail했으므로 여기서 직접 호출
```

**이게 왜 중요한가:** `MakeupController`는 `OnEnable`에서 브리지를 구독한다. 즉 **비활성 = 구독 해제**다. 그래서 RN이 화면을 열 때 `SetStencilActive(true)`를 보내야 메이크업 메시지가 도달한다. 이탈 시에는 **반드시 리셋 → 비활성화 순서**여야 한다(반대로 하면 리셋이 증발). ([`StencilUnityViewAdapter.tsx:95`](../../apps/mobile/src/features/ar/stencil/StencilUnityViewAdapter.tsx#L95))

### 3.6 얼굴 추적 — 지연 재생(delayed playback)

`FaceLandmarkSource.cs` 헤더 주석이 정본. **발표에서 가장 인상적인 부분.**

```
캡처   : 매 프레임 카메라 이미지를 링버퍼에 담음     (~60fps, 추론과 무관)
검출   : 여유가 생길 때마다 최신 프레임을 저해상도 추론 (~30fps)
재생   : 실시간보다 "늦은" 재생 시계로 프레임을 표시하고,
         그 프레임 시각을 사이에 두는 두 검출 결과를 보간해 랜드마크로 씀
```

**얻는 것:** 영상은 디스플레이 레이트로 부드럽고, 메이크업은 **표시 중인 그 프레임과 같은 시각의 랜드마크**로 그려져 픽셀이 고정된다. 외삽이 없으니 오버슈트도 없다.
**대가:** 재생 지연(추론 간격 + 결과 나이 + 마진)뿐.
**안전장치:** 재생 시계는 최신 검출 결과를 추월하지 못한다 → 추론이 느려지면 표시가 느려질 뿐, 메이크업이 얼굴에서 떨어지지 않는다. 추론이 죽으면 워치독이 재제출하고 그동안 메이크업을 숨긴다.

같은 이유로 `ARCameraBackground`(항상 최신 프레임)를 끄고 **`FramePresenter`가 랜드마크를 계산한 바로 그 프레임을 배경으로 그린다.**

### 3.7 픽셀이 만들어지는 과정

```
maskStrength = SoftMask(maskTexture[faceUV], threshold, feather)
visibility   = tracking × occlusionGate × skinGate
amount       = maskStrength × opacity × intensity × visibility
sourceColor  = ProductModel(cameraColor, productColor, finish, amount)
finalColor   = FramebufferBlend(sourceColor, cameraColor, blendMode)
```

**부위별 전략이 다른 게 핵심 설계:**

| 부위 | 경계를 만드는 것 | 이유 |
|---|---|---|
| 립 | 실제 입술 외곽/내곽 **랜드마크 링 메시** | 경계가 정밀해야 함. 텍스처로는 입 모양 변화를 못 따라감 |
| 아이라이너 | 랜드마크 기반 띠/선 | 위와 동일 |
| 블러셔·컨투어·하이라이트 | **UV 마스크 텍스처** | 넓고 부드러운 영역은 지오메트리가 낭비 |
| 눈썹 | 랜드마크 띠 + 전용 렌더러 | 자연 눈썹 덮기(inpaint)가 필요 |
| 렌즈 | 홍채 지오메트리 + 런타임 방사형 마스크 | 동공 구멍·깜박임 처리 |

> **"정밀한 경계는 지오메트리, 넓고 부드러운 영역은 텍스처"** — 이 한 줄이 설계 철학이다.

---

## 4. 자랑할 기술 결정 6가지

발표에서 "왜 이렇게 만들었나"를 물으면 여기서 답한다.

### ① UV 좌표 기반 — 얼굴이 움직여도 화장이 붙어 있는 이유
화면 픽셀 좌표가 아니라 **얼굴을 평면으로 펼친 UV 좌표**에 마스크를 저장한다. 정점의 화면 위치는 매 프레임 바뀌지만 UV는 고정이므로, 마스크 한 장을 **모든 얼굴·모든 표정에 재사용**할 수 있다.

### ② MediaPipe 478점 canonical 토폴로지 — 플랫폼 단일 마스크
ARKit(iOS)/ARCore(Android)는 얼굴 메시 토폴로지가 다르다. MediaPipe Face Landmarker를 쓰면 **iOS/Android/전면/후면 카메라가 전부 같은 토폴로지**를 출력하므로 마스크 자산을 한 벌만 만들면 된다. (478 = 얼굴 468 + 홍채 10)
- 폴백: MediaPipe 패키지 미설치 시 ARKit/ARCore 얼굴 추적(전면 전용)으로 자동 전환 — `asmdef`의 `versionDefines`가 `MEDIAPIPE` 디파인을 자동 토글.

### ③ 지연 재생 시간 동기 — "메이크업이 미끄러지는" 문제의 근본 해결
§3.6 참조. 대부분의 AR 앱은 최신 카메라 프레임 + 약간 오래된 랜드마크를 섞어서 화장이 얼굴에서 미끄러진다. 우리는 **배경과 랜드마크의 시각을 강제로 일치**시켰다.

### ④ 하이브리드 지오메트리/텍스처
§3.7 표. 하나의 UV 아틀라스로 모든 걸 풀려 하지 않고 부위별 최적 지오메트리를 쓴다.

### ⑤ 렌더 큐 계약 — 겹침 순서를 상수로 고정
코드 호출 순서가 아니라 머티리얼 렌더 큐가 순서를 결정한다. `MakeupQueues.cs`가 중앙 상수로 관리.

```
3000 FaceMakeup 베이스 → 3001 블러셔 → 3004~3013 눈 스택
→ 3014~3019 눈썹 스택 → 3020 치아 → 3021~3023 립 스택
→ 3100 스플릿 비교 → 3400 라이팅 그레이드 → 4000 스텐실 가이드
```
의도가 담긴 순서 예:
- **치아(3020) < 립(3021)** — 치아가 립 링 아래여야 립·라이너 엣지가 또렷
- **스플릿(3100) < 라이팅(3400)** — 비교용 맨얼굴 반쪽도 **같은 라이팅 그레이드**를 받게
- **라이팅(3400) < 가이드(4000)** — 안내선이 그레이드에 물들지 않게

### ⑥ 재귀 룩 트리 + 컴파일 분리
UI 모델(트리)과 렌더 커맨드(FilterParams)를 분리했다. 덕분에
- 저장 포맷은 컴파일 결과라 스토리지 스키마 변경 없음
- 재편집은 `seedLayers`로 현재 룩을 다시 트리로 분해
- Unity 브리지는 트리 구조를 전혀 모른다 → 룩 모델을 바꿔도 Unity 수정 불필요

---

## 5. 문서 vs 현재 코드 — 반드시 알아둘 차이

`AR_MAKEUP_RENDERING_PIPELINE_REPORT_KO.md`는 **2026-07-16 기준**이라 이후 변경이 반영돼 있지 않다. 발표 중 이 문서를 근거로 답하면 틀릴 수 있다.

| 리포트 서술 | 현재 코드 |
|---|---|
| `ARFilterScreen`이 일반 포인트 메이크업 담당 | **삭제됨.** AR 화면은 `StencilARApp` 하나 |
| "F4: `applyFilter`를 받을 구독자가 없다" | **해소.** `StencilUnityViewAdapter`가 `SetStencilActive(true)`를 보내 `MakeupController`가 구독을 붙인다 |
| E3 경로(`RNBridge.ApplyRecipeJson` + `SmoothRegionMask.shader`)가 풀페이스 담당 | **Unity 코드는 남아 있으나 모바일에 호출자가 없다.** `postUnityFilterParams`·레시피 배치 전송 함수 모두 live caller 0건 |
| 렌더 경로가 2개(ARwithFable / E3) | **실질 라이브 경로는 ARwithFable 하나.** E3는 유휴 자산 |
| iOS `targetFrameRate = 30` | AURA에서는 `ARBootstrap`이 조기 return하므로 그 30 캡이 적용되지 않고, 그래프트가 **60**을 설정한다 |

### 약점을 물으면 이렇게 답한다 (정직 + 관리 중임을 보여주기)

- **"렌더 경로가 두 개인 건 부채 아닌가?"**
  → "맞습니다. 역사적 이유로 두 구현이 합쳐졌고, 지금은 ARwithFable 경로로 통일했습니다. E3 코드는 아직 남아 있지만 모바일 호출자가 없어서 실질적으로는 단일 경로입니다. 정리는 별도 과제로 추적 중입니다."
- **"5,000줄짜리 파일은 문제 아닌가?"**
  → "인정합니다. 다만 설계 근거를 파일 상단 주석과 별도 리포트 문서로 남겨서, 읽는 사람이 코드를 통독하지 않고도 계약을 파악할 수 있게 했습니다. 실제로 이 프로젝트에는 렌더링 파이프라인 검증 리포트와 문답 문서가 따로 있습니다."
- **"실기기 성능은?"**
  → "정적 코드 검증은 끝났지만 FPS·GPU time·메모리 피크는 실측이 남았습니다. 알려진 비용 지점은 파악돼 있습니다 — 마스크 소프트닝의 13탭 샘플링, 립 광택 2패스, 스크린스페이스 파운데이션의 풀스크린 프래그먼트 비용."

---

## 6. 예상 질문 30개 + 답변

### A. 구조·선택

**Q1. 왜 Unity를 썼나? RN만으로는 안 되나?**
실시간 얼굴 메시 렌더링, 커스텀 셰이더, GPU 합성이 필요하다. RN에는 이걸 할 렌더 파이프라인이 없다. Unity를 UaaL(Unity as a Library)로 임베드하면 RN이 앱 셸/UI/네트워크를 유지한 채 AR 부분만 Unity에 위임할 수 있다.

**Q2. UaaL의 단점은?**
① 앱 바이너리가 커진다. ② Unity 플레이어는 싱글턴이라 수명주기 관리가 까다롭다 — 화면을 나가도 플레이어가 살아 있을 수 있어 "렌더러는 정상인데 RN 화면은 검정" 같은 문제가 생긴다. ③ RN↔Unity가 문자열 JSON 통신이라 타입 안전성을 수동 계약(`types.ts` ↔ `BridgeMessages.cs`)으로 보장해야 한다.

**Q3. 왜 ARKit 얼굴 추적 대신 MediaPipe인가?**
플랫폼 토폴로지 통일 때문이다. ARKit과 ARCore는 얼굴 메시 정점 배치가 다르므로 마스크 자산을 두 벌 만들어야 한다. MediaPipe canonical 토폴로지는 어디서나 동일해서 **마스크 한 벌**로 끝난다. 전/후면 카메라도 동일하게 동작한다. ARKit 경로는 폴백으로 남겨 뒀다.

**Q4. 그럼 ARKit은 아예 안 쓰나?**
ARFoundation/ARKit은 계속 쓴다 — 카메라 세션, CPU 이미지 획득, 블렌드셰이프(표정), 깊이가 ARKit에서 온다. 얼굴 **랜드마크**만 MediaPipe가 담당한다.

**Q5. 얼굴이 움직여도 화장이 붙어 있는 원리는?**
화면 좌표가 아니라 UV 좌표(얼굴을 평면으로 펼친 지도)에 저장하기 때문이다. 정점의 UV는 표정·회전과 무관하게 고정이므로, 같은 UV는 항상 같은 얼굴 부위를 가리킨다.

**Q6. 입술처럼 모양이 변하는 부위는 UV만으로 안 되지 않나?**
정확한 지적이다. 그래서 립·아이라이너는 UV 마스크가 아니라 **실제 랜드마크로 매 프레임 만드는 링 메시**가 경계를 담당한다. 셰이더는 그 안의 색과 마감만 계산한다. 넓고 부드러운 블러셔·컨투어는 반대로 UV 마스크가 효율적이다.

**Q7. 마스크와 텍스처는 같은 건가?**
아니다. 마스크는 "어디에 얼마나 적용할지"라는 **의미**이고, 텍스처는 그걸 GPU에 담는 **그릇**이다. 같은 마스크가 PNG일 수도, 런타임 생성 R8일 수도, 다채널 RGBA일 수도 있다.

**Q8. 마스크의 채널은 무슨 의미인가?**
부위마다 다르다. 절차 생성 마스크는 R=적용 강도. 생성 눈썹 마스크는 R=자연 눈썹을 덮을 영역, G=새로 그릴 눈썹 본체, B=털 결. **"PNG니까 알파를 읽겠지"는 틀린 가정이고, 셰이더가 실제로 읽는 채널이 계약의 진실이다.**

### B. 렌더링

**Q9. 겹치는 화장의 순서는 어떻게 정하나?**
코드 호출 순서가 아니라 **머티리얼 렌더 큐**로 고정한다. `MakeupQueues.cs`에 3000~4000 상수가 중앙 관리돼 있다. 예를 들어 치아(3020)를 립(3021) **아래**에 둬야 립 라이너 엣지가 또렷해진다.

**Q10. 블렌딩은 어디서 일어나나?**
두 층이다. ① 셰이더 **내부** 색 혼합(lerp, 루마 보존 틴트, 마감 계산) — 소스 색을 만드는 과정. ② GPU **프레임버퍼** 블렌드 — 완성된 소스를 이미 그려진 픽셀과 합치는 과정. 립은 premultiplied alpha에 `Blend One OneMinusSrcAlpha`를 쓰는데, 글로스가 알파를 키우지 않고도 빛을 더할 수 있기 때문이다.

**Q11. 색을 그냥 덮어씌우지 않나? 스티커처럼 보이지 않나?**
안 덮는다. 셰이더가 카메라의 실제 픽셀 밝기(luma)를 읽어서 제품색에 반영한다. 그래서 입술 주름, 조명, 그림자가 살아 있다. `FaceMakeup.shader`는 아예 `GrabPass`로 메이크업 이전 카메라색을 읽어 셰이더 안에서 완성 픽셀을 재구성한다 — 반투명 판을 얹는 게 아니다.

**Q12. 손으로 얼굴을 가리면 어떻게 되나?**
가림(occlusion) 게이트가 있다. 현재 라이브 경로(ARwithFable)는 **세그멘테이션 기반 `OccludeGate`** 를 써서 손·머리카락·옷 픽셀을 걸러낸다. 별도로 Apple Vision 손 관절 21개를 쓰는 `E7HandOcclusionRuntime`도 구현돼 있다(E3 경로용).

**Q13. 자연 눈썹은 어떻게 지우나?**
지우는 게 아니라 **덮는다(inpainting)**. 눈썹 바로 위 이마에서 피부색을 여러 지점 샘플링하고, 그 피부색으로 자연 눈썹을 먼저 덮은 뒤 그 위에 새 눈썹을 그린다. 어두운 눈썹을 밝은 피부로 덮어야 하므로 multiply 블렌드로는 불가능하고 알파 오버를 강제한다.

### C. 브리지·수명주기 (실전에서 가장 많이 터진 부분)

**Q14. RN과 Unity는 어떻게 통신하나?**
JSON 문자열이다. RN → `postUnityMessage(gameObject, method, json)` → Obj-C → `UnitySendMessage` → C# `NativeBridge.OnMessageFromRN`. 반대 방향은 Obj-C `sendMessageToMobileApp` → RN 네이티브 이벤트. 타입은 `types.ts`와 `BridgeMessages.cs`를 수동으로 맞춘 계약이다.

**Q15. Unity가 준비되기 전에 메시지를 보내면?**
버려진다. `NativeBridge`가 부트 상태(Booting/Ready/Failed)를 들고 있고, Ready가 아니면 적용 커맨드를 **의도적으로 드롭**한다. 렌더러가 초기화되지 않은 상태에서 부분 적용하는 것보다 안전하기 때문이다. RN은 ready 이후 룩 전체를 재전송한다.

**Q16. ready 핸드셰이크가 왜 어려웠나?**
UaaL에서는 Unity가 RN 핸들러가 붙기 전에 ready를 먼저 쏠 수 있다. 그래서 ① RN이 `requestReady`를 재시도(처음 20회는 750ms, 이후 5초)하고, ② Unity는 ready를 **재생 가능(replayable)** 하게 만들었고, ③ 어댑터가 놓친 ready를 350ms 타이머로 복구한다.

**Q17. 그러면 ready가 중복으로 오는 문제는?**
있었다. 네이티브 브리지가 메시지 전송마다 ready를 되쏠 수 있는데, 그걸 화면에 전달하면 **전송→이벤트→재동기화→전송 피드백 루프**가 된다. 실기기에서 앱이 jetsam으로 죽는 걸 재현했다. 그래서 첫 ready 이후의 ready는 어댑터에서 반드시 삼킨다. 웜 재진입에서 유실된 적용은 별도의 1회성 타이머 재동기화가 복구한다.

**Q18. 화면을 나갈 때는?**
순서가 중요하다. **① 맨얼굴 리셋 → ② `SetStencilActive(false)` → ③ 뷰 숨김.** `MakeupController`가 `OnDisable`에서 브리지 구독을 해제하므로, 비활성화 뒤에 보낸 리셋은 증발한다. Unity 플레이어는 싱글턴이라 리셋을 빠뜨리면 **다음에 다른 화면에서 열었을 때 이전 메이크업이 남아 있다.**

**Q19. 메시지를 ref로 안 보내고 싱글턴으로 보내는 이유는?**
React는 ref를 `componentDidMount` 이후에 연결한다. Unity가 이미 떠 있는 재진입에서는 어댑터가 동기적으로 합성 ready를 방출하는데, 그 시점에 ref가 아직 null이다. ref 경유였을 때 재동기화 전체가 조용히 증발해 "RN은 원본인데 얼굴은 이전 룩" 상태가 됐다. 싱글턴 브리지는 뷰 마운트와 무관하게 전달된다.

**Q20. Unity는 언제 뜨고 언제 멈추나?**
프리워밍한다 — 화면 진입 지연을 줄이려고 미리 로드해 두고, 안 보일 때는 플레이어를 pause해서 CPU/GPU와 AR 세션을 통째로 멈춘다. hidden run lease 개념이 있어서, 화면이 안 보여도 계속 돌려야 하는 작업(정지 이미지 분석 등)은 lease를 잡는다.

### D. 룩 모델

**Q21. 룩 데이터 모델을 왜 트리로 했나?**
메이크업은 자연스럽게 계층적이다 — 전체 룩 = 부위 룩의 합 = 세부 룩의 합 = 제품 적용의 합. 트리로 두면 "눈만 다른 룩으로 교체", "이 조합을 내 룩으로 저장" 같은 조작이 노드 교체 하나로 끝난다. 실제 렌더 데이터는 **잎에만** 있고 상위는 참조 묶음이라 중복이 없다.

**Q22. 편집 중 "덮어쓸까요?" 같은 걸 왜 안 묻나?**
의도적이다. 트리는 항상 작업본이고 정의는 불변이며 dirty 표시만 전파한다. 시스템 프리셋을 수정하면 저장 시 자동으로 사본이 만들어진다. **유일하게 실제로 묻는 경우는 "내가 만든 룩이 다른 저장 룩에서도 쓰일 때"** — 사본으로 갈지 원본에 반영할지다.

**Q23. 얼굴형 보정(FIT)과 메이크업(LOOK)을 왜 분리했나?**
자유 조합을 위해서다. 두 레인을 별도로 두면 "이 메이크업 룩 × 저 얼굴형 보정"을 곱집합으로 쓸 수 있다. 합쳐 놓으면 조합마다 별도 프리셋을 만들어야 한다. 워프 필드는 FIT 레인이 단독 소유한다.

**Q24. AI 추천이 AR에 어떻게 반영되나?**
LLM 추천 결과의 `areaGuides`(부위별 색 hex, 질감, 강도)가 **그 자체로 레시피**다. 이걸 `FilterParams`로 직접 빌드해서 룩으로 주입한다. 구버전 리포트처럼 `areaGuides`가 없으면 role 기반 고정 프리셋에 분석색만 개인화하는 폴백을 탄다.

**Q25. 추천 색을 그대로 쓰면 안 되는 경우는?**
있다. 엔진 틴트가 루마 보존 알파 합성이라 아주 밝은 파스텔 hex는 강도만큼 그대로 덧칠돼 흰 떡짐이 된다. 그래서 상대 휘도 0.7을 넘는 색은 초과분에 비례해 강도를 최대 절반까지 감쇠시킨다. 추천 경로 전용 가드다.

### E. 성능·품질

**Q26. FPS는?**
iOS는 열 관리 때문에 프레임레이트를 제한하는 전략을 갖고 있다 — 카메라·MediaPipe 추론·Unity 렌더를 60Hz로 계속 돌리면 발열 보호로 iOS가 화면을 강제로 어둡게 한다. 실측 FPS·GPU time은 아직 실기기 측정이 남아 있다.

**Q27. 가장 비싼 연산은?**
① MediaPipe 추론(그래서 저해상도 + 캡처와 분리), ② 마스크 소프트닝의 다중 탭 샘플링(기본 13탭), ③ 립 광택의 추가 가산 패스, ④ 스크린스페이스 파운데이션의 풀스크린 프래그먼트 비용.

**Q28. 메모리는?**
절차 생성 마스크는 256×256 **R8**로 만든다 — 같은 크기 RGBA32의 1/4(64KiB vs 256KiB)다. 소프트니스는 5개 버킷으로 양자화해 캐시하므로 슬라이더를 움직여도 매 프레임 텍스처를 새로 만들지 않는다.

**Q29. 화장이 안 보일 때 어떻게 디버깅하나?**
색을 의심하기 전에 계층을 순서대로 분리한다: ① RN이 올바른 대상에 메시지를 보냈나 → ② Unity 브리지가 실제로 파싱·invoke했나 → ③ 얼굴 추적이 유효한가 → ④ 마스크 텍스처가 등록됐고 예상 채널에 값이 있나 → ⑤ 머티리얼 파라미터 → ⑥ 렌더러 enabled·큐 → ⑦ 가림/피부 게이트가 결과를 0으로 만들었나 → ⑧ 네이티브 뷰가 마운트됐나. **"데이터 → 지오메트리 → 머티리얼 → 렌더러 → 뷰"** 순서다.

**Q30. Unity 코드를 바꾸면 바로 반영되나?**
아니다. Unity 소스를 바꾸면 `scripts/unity/build_ios_unity_framework.sh`로 **UnityFramework를 다시 export**한 뒤 네이티브 빌드를 해야 기기에 반영된다. RN 코드만 바꿨을 때는 Metro 리로드로 충분하다.

---

## 7. 숫자 치트시트

| 항목 | 값 |
|---|---|
| MediaPipe 랜드마크 | **478** (얼굴 468 + 홍채 좌5·우5) |
| 렌더 큐 범위 | **3000~4000** (베이스 3000, 립 3021, 라이팅 3400, 가이드 4000) |
| 오버레이 레이어 상한 | **4** (`MAX_OVERLAY_LAYERS`) |
| 렌즈 레이어 상한 | **6** (`MAX_LENS_LAYERS`) |
| 아이섀도 멀티밴드 상한 | **8** (`MAX_EYESHADOW_LAYERS_V2`) |
| 절차 생성 마스크 | 256×256 **R8** = 64 KiB (RGBA32면 256 KiB) |
| 소프트니스 버킷 | **5**개 양자화 + 버킷별 캐시 |
| 마스크 소프트닝 탭 수 | **13** (중심1 + 축4 + 대각4 + 먼축4) |
| RN→Unity 메시지 종류 | 약 **35**종 |
| Unity→RN 메시지 종류 | 약 **15**종 |
| Unity C# 스크립트 | **82**개 |
| ready 재시도 | 처음 20회 750ms → 이후 5초 |
| 어댑터 활성화 타이머 | 350ms |

---

## 8. 파일 지도 — 질문 받았을 때 열 곳

| 주제 | 파일 |
|---|---|
| AR 화면 진입 | `apps/mobile/src/app/navigation/routes/arRoutes.tsx` |
| AR 메인 화면 | `apps/mobile/src/features/ar/stencil/StencilARApp.tsx` (헤더 주석) |
| Unity 뷰 어댑터·핸드셰이크 | `.../stencil/StencilUnityViewAdapter.tsx` |
| 룩 트리 모델 | `.../stencil/src/composer/lookTree.ts` (헤더 주석) |
| 레이어 컴파일 | `.../stencil/src/composer/model.ts` — `compileLayers` |
| 브리지 타입 계약 | `.../stencil/src/bridge/types.ts` |
| RN 브리지 구현 | `.../features/ar/services/unityMakeupBridge.ts` |
| 추천 → 룩 변환 | `.../features/ar/services/recommendedStencilLook.ts` |
| 추천 라우트 조립 | `.../navigation/routes/makeupRecommendationRouteActions.ts` |
| iOS UaaL 브리지 | `apps/mobile/ios/AURA/UnityMakeupBridge.m` |
| Unity 그래프 배선 | `apps/unity/.../MediaPipeGraft/AuraMediaPipeGraftBootstrap.cs` |
| Unity 메시지 허브 | `.../ARwithFable/Bridge/NativeBridge.cs` |
| 파라미터 분배 | `.../ARwithFable/Face/MakeupController.cs` — `ApplyTo` |
| 얼굴 추적 | `.../ARwithFable/Face/FaceLandmarkSource.cs` (헤더 주석) |
| 시간 동기 배경 | `.../ARwithFable/Face/FramePresenter.cs` |
| 렌더 순서 계약 | `.../ARwithFable/Face/MakeupQueues.cs` |
| 립 렌더러/셰이더 | `.../Face/LipRenderer.cs`, `Assets/Resources/Lip.shader` |
| 베이스 셰이더 | `Assets/Resources/FaceMakeup.shader` |

---

## 9. 발표 직전 체크리스트

- [ ] §1 30초 스크립트를 보지 않고 말할 수 있다
- [ ] §2 5층 구조를 화이트보드에 그릴 수 있다
- [ ] §4의 6가지 결정 중 최소 3개를 "왜"까지 설명할 수 있다
- [ ] §5의 약점 방어 문장 3개를 외웠다
- [ ] §7 숫자 중 478 / 3000~4000 / 256×256 R8은 즉답할 수 있다
- [ ] 데모 중 화면 이탈 → 재진입을 한 번 해본다 (리셋 순서 이슈가 가장 눈에 띄는 버그)
