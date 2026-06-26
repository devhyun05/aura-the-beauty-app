# 모바일 앱 화면/플로우 기획서

정리일: 2026-06-26

이 문서는 `apps/mobile`의 현재 코드 기준 화면 구성, 플로우, 핵심 기획 용어를 한곳에 모은 모바일 앱 기획 문서다. 완료된 리팩터링 히스토리와 실행 플랜은 남기지 않고, 앞으로 화면을 설계하거나 구현할 때 필요한 현재 상태만 기록한다.

관련 문서:

- `docs/mobile/FRONTEND_WORK_GUIDE.md`: 모바일 작업 규칙, 폴더 구조, mock/service/type 기준
- `docs/planning/NAMING_DECISIONS.md`: 용어 결정 이유와 네이밍 원칙

## 1. 현재 개발 범위

현재 모바일 앱은 실제 백엔드, Unity AR, ARKit/ARCore, AI 모델을 붙인 상태가 아니라 프론트엔드 UI/UX와 mock 데이터 중심으로 구현한다.

- 실제 API, DB, Unity, 네이티브 AR, AI 추천 로직은 구현 범위가 아니다.
- 화면은 실제 서비스 흐름처럼 연결하되 데이터는 mock/service/type 계층을 통해 제공한다.
- 기획 변경이 잦은 화면은 feature 내부 컴포넌트와 순수 service 함수로 나누어 변경 범위를 작게 유지한다.
- 화면 컴포넌트는 shared theme, typography, icon size, shared UI를 사용한다.

## 2. 앱 구조

앱 화면 전환은 React Navigation 기준이다.

주요 파일:

- `apps/mobile/src/app/AppRoot.tsx`
- `apps/mobile/src/app/navigation/RootNavigator.tsx`
- `apps/mobile/src/app/navigation/MainTabNavigator.tsx`
- `apps/mobile/src/app/navigation/routes/`
- `apps/mobile/src/app/navigation/routeTypes.ts`
- `apps/mobile/src/app/navigation/routeChrome.ts`
- `apps/mobile/src/app/navigation/linkingConfig.ts`
- `apps/mobile/src/app/navigation/flowState.tsx`
- `apps/mobile/src/app/navigation/demoFlowState.ts`

현재 책임 분리:

| 영역 | 책임 |
| --- | --- |
| `routeTypes.ts` | root stack, main tab route 이름과 params 타입 |
| `routeChrome.ts` | route별 depth, category, header/footer/status bar 정책 |
| `linkingConfig.ts` | deep link path와 route 목록 일치 검증 |
| `flowState.tsx` | route param으로 넘기기 어려운 플로우 임시 상태 |
| `demoFlowState.ts` | 캡처/데모용 seed 상태 |
| `routes/*.tsx` | 플로우별 feature screen, navigation callback, flow state 연결 |

Route depth:

| Depth | 의미 | 예시 |
| --- | --- | --- |
| `entry` | 로그인/온보딩 같은 앱 진입 화면 | `Login`, `Tutorial` |
| `main` | 하단 footer가 있는 주요 탭 | `HomeTab`, `CustomTab`, `ProfileTab` |
| `sub` | 상세, 목록, 폼, 진행 화면 | `FaceAnalysisReportDetail`, `ProfileEdit` |
| `immersive` | 카메라, AR, 추출 편집처럼 화면 몰입이 필요한 런타임 | `ARFilter`, `MakeupFeedbackCapture` |
| `terminal` | 저장 완료 같은 플로우 종료 화면 | `MakeupFilterSaveComplete` |

Chrome 종류:

| Kind | 표시 방식 |
| --- | --- |
| `mainTab` | app header와 footer를 route 정책에 따라 표시 |
| `detail` | route-level detail header 사용 |
| `fullscreen` | 일반 header/footer 없이 화면 자체가 필요한 조작 UI를 제공 |

하단 footer의 `capture` 액션은 main tab route가 아니라 root stack의 `ARFilter`로 이동한다.

## 3. 화면 목록

### 3.1 Root Stack

| Route | 화면 | 역할 | Chrome |
| --- | --- | --- | --- |
| `Login` | `LoginScreen.tsx` | 소셜 로그인 진입 | fullscreen |
| `Tutorial` | `TutorialIntroScreen.tsx`, `FaceCaptureTutorialScreen.tsx` | 온보딩/얼굴 촬영 안내 | fullscreen |
| `MainTabs` | `MainTabNavigator.tsx` | 탭 호스트 | fullscreen |
| `FaceCapture` | `FaceCaptureScreen.tsx` | 얼굴 분석용 사진 촬영 | fullscreen |
| `FaceAnalysisLoading` | `FaceAnalysisLoadingScreen.tsx` | 얼굴 분석 진행 | detail |
| `FaceAnalysisReportsList` | `FaceAnalysisReportsListScreen.tsx` | 얼굴 분석 보고서 목록 | detail |
| `FaceAnalysisReportDetail` | `FaceAnalysisReportDetailScreen.tsx` | 얼굴 분석 보고서 상세 | detail |
| `ProfileEdit` | `ProfileEditScreen.tsx` | 프로필 수정 | detail |
| `MakeupLookList` | `MakeupLookListScreen.tsx` | 저장 메이크업 룩 목록 | detail |
| `LikedProductList` | `LikedProductListScreen.tsx` | 좋아요 제품 목록 | detail |
| `ARFilter` | `ARFilterScreen.tsx` | AR 필터 적용 | fullscreen |
| `ARFilterShapeAdjust` | `ARFilterShapeAdjustScreen.tsx` | AR 필터 형태 수정 | fullscreen |
| `MakeupFilterEdit` | `MakeupFilterEditScreen.tsx` | 메이크업 필터 편집 | fullscreen |
| `MakeupFeedbackEntry` | `MakeupFeedbackEntryScreen.tsx` | 메이크업 피드백 시작 | detail |
| `MakeupFeedbackCapture` | `MakeupFeedbackCaptureScreen.tsx` | 피드백 사진 촬영/선택 | fullscreen |
| `MakeupFeedbackLoading` | `MakeupFeedbackLoadingScreen.tsx` | 피드백 분석 진행 | detail |
| `MakeupFeedbackResult` | `MakeupFeedbackResultScreen.tsx` | 피드백 결과 | detail |
| `MakeupCorrectionGuide` | `MakeupCorrectionGuideOverlayScreen.tsx` | 수정 가이드 오버레이 | detail |
| `MakeupCorrectionTip` | `MakeupCorrectionTipScreen.tsx` | 수정팁 상세 | detail |
| `ReferenceMakeupExtractionUpload` | `ReferenceMakeupExtractionUploadScreen.tsx` | 레퍼런스 사진 선택 | detail |
| `ReferenceMakeupExtractionLoading` | `ReferenceMakeupExtractionLoadingScreen.tsx` | 메이크업 추출 진행 | fullscreen |
| `ReferenceMakeupExtractionResult` | `ReferenceMakeupExtractionResultScreen.tsx` | 추출 결과 | detail |
| `ExtractedMakeupLookAdjust` | `ExtractedMakeupLookAdjustScreen.tsx` | 추출 룩 조정 | fullscreen |
| `MakeupFilterSave` | `MakeupFilterSaveScreen.tsx` | 메이크업 필터 저장 폼 | detail |
| `MakeupFilterSaveComplete` | `MakeupFilterSaveCompleteScreen.tsx` | 메이크업 필터 저장 완료 | fullscreen |
| `MakeupRecipeDetail` | `MakeupRecipeDetailScreen.tsx` | 메이크업 레시피 상세 | detail |
| `MakeupRecipeSaveComplete` | `MakeupRecipeSaveCompleteScreen.tsx` | 메이크업 레시피 저장 완료 | fullscreen |

### 3.2 Main Tabs

| Tab Route | 화면 | 역할 |
| --- | --- | --- |
| `HomeTab` | `HomeScreen.tsx` | 홈/기능 허브 |
| `CustomTab` | `ProductRecommendationScreen.tsx` | 추천 제품 |
| `ProfileTab` | `ProfileScreen.tsx` | 마이페이지 |

## 4. 핵심 용어

| 용어 | 의미 |
| --- | --- |
| `메이크업 필터` / `MakeupFilter` | AR에 적용하고 저장할 수 있는 메이크업 효과 전체 |
| `룩` / `Look` | 사용자가 카드, 저장 목록, 추천 기준에서 인식하는 메이크업 이름 단위 |
| `토탈메이크업룩` / `TotalMakeupLook` | 얼굴 전체에 적용되는 하나의 룩 |
| `포인트메이크업룩` / `PointMakeupLook` | 립, 아이, 치크 등 특정 부위에 적용되는 룩 |
| `프리셋값` / `makeupPresetValues` | 룩 안에 저장된 컬러, 타입, 질감, 형태 등의 설정값 묶음 |
| `MakeupArea` | 메이크업 적용/저장/편집 범위의 기준 타입 |
| `형태` / `Shape` | 메이크업 레이어가 얼굴 기준점에 붙는 모양, 적용 범위, 변형 패턴 |
| `shapePoint` | 사용자가 손가락으로 옮기는 형태 조정점 |
| `FaceAnalysis` | 얼굴 진단/얼굴 분석 기능 |
| `MakeupFeedback` | 현재 메이크업 사진에 대한 점수와 수정 포인트 피드백 |
| `ReferenceMakeupExtraction` | 레퍼런스 사진에서 메이크업 룩을 추출하는 기능 |
| `Product` | 실제 제품 엔티티 |
| `RecommendedProduct` | 추천 결과로 노출되는 제품 항목 |

사용하지 않는 방향:

- 사용자-facing 룩 개념에 `스타일`을 쓰지 않는다.
- AR 형태 옵션을 `위치`로 부르지 않는다.
- 사용자가 조정하는 형태점을 `landmarkPoint`라고 부르지 않는다.
- 현재 얼굴 진단/피드백/추출 기능명으로 `ImageAnalysis`를 쓰지 않는다. 향후 사진 전체 인상 분석 상위 도메인이 생기면 예약어로 사용할 수 있다.

## 5. 주요 플로우

### 5.1 인증/온보딩

`Login`에서 소셜 로그인 UI를 보여주고, `Tutorial`에서 앱 소개와 얼굴 촬영 튜토리얼을 제공한다. 현재는 실제 OAuth가 아니라 mock login service 기준이다.

### 5.2 홈/기능 허브

`HomeTab`은 홈 hero, 공지, 주간 트렌드, 필터 스토어, 추천 룩 섹션을 보여준다. 홈 데이터는 `features/home/mocks/home.mock.ts`와 service 계층에서 제공한다.

### 5.3 얼굴 진단

흐름:

```text
FaceCapture
-> FaceAnalysisLoading
-> FaceAnalysisReportDetail
-> ARFilter 또는 보고서 목록/마이페이지
```

핵심 파일:

- `features/face-capture/screens/FaceCaptureScreen.tsx`
- `features/face-analysis/screens/FaceAnalysisLoadingScreen.tsx`
- `features/face-analysis/screens/FaceAnalysisReportDetailScreen.tsx`
- `shared/mocks/faceAnalysis.mock.ts`
- `shared/services/faceAnalysisService.ts`

기획 기준:

- `FaceCapture`는 촬영 조건을 안내하고 사진을 준비한다.
- `FaceAnalysisLoading`은 mock 분석 진행 상태를 보여준다.
- `FaceAnalysisReportDetail`은 퍼스널 컬러, 얼굴형, 피부 타입, 추천/비추천 메이크업 포인트를 보고서 형태로 보여준다.
- AR 필터 생성은 실제 AI 생성이 아니라 mock 흐름으로 `ARFilter`에 연결한다.

### 5.4 AR 필터 적용/수정

흐름:

```text
ARFilter
-> ARFilterShapeAdjust
-> ARFilter
-> MakeupFilterEdit
-> MakeupFilterSave
-> MakeupFilterSaveComplete
```

요약:

- `ARFilter`는 라이브 카메라 위에 메이크업 필터를 적용하고, 토탈메이크업룩/포인트메이크업룩과 옵션을 선택하는 핵심 화면이다.
- 전체 부위에서는 `룩`, `형태` 옵션만 노출한다.
- 개별 부위에서는 `룩`, `컬러`, `타입`, `질감`, `형태` 옵션을 노출한다.
- `ARFilterShapeAdjust`는 `shapePoint.position`과 `shapePoint.offset`을 기준으로 형태를 세밀하게 수정한다.
- `MakeupFilterEdit`은 현재 필터 조합의 컬러/타입/질감 옵션을 편집한다.
- 저장 플로우는 route 기준 `MakeupFilterSave`와 `MakeupFilterSaveComplete`를 사용한다.

### 5.5 메이크업 피드백

흐름:

```text
MakeupFeedbackEntry
-> MakeupFeedbackCapture
-> MakeupFeedbackLoading
-> MakeupFeedbackResult
-> MakeupCorrectionGuide 또는 MakeupCorrectionTip
```

기획 기준:

- 피드백은 저장된 룩 생성 플로우가 아니라 현재 메이크업 사진을 평가하고 수정 방향을 제안하는 플로우다.
- `MakeupFeedbackCapture`는 expo-camera와 image-picker 기반 UI를 사용한다.
- `MakeupFeedbackResult`는 종합 점수, 수정 포인트, 잘한 포인트, 사진 annotation을 보여준다.
- `MakeupCorrectionGuide`는 사진 위 기준선/가이드를 overlay로 보여준다.
- `MakeupCorrectionTip`은 수정 포인트 하나에 대한 3단계 루틴을 보여준다.

### 5.6 레퍼런스 메이크업 추출/저장

흐름:

```text
ReferenceMakeupExtractionUpload
-> ReferenceMakeupExtractionLoading
-> ReferenceMakeupExtractionResult
-> ExtractedMakeupLookAdjust
-> MakeupFilterSave 또는 MakeupRecipeDetail
```

저장/레시피 흐름:

```text
MakeupFilterSave
-> MakeupFilterSaveComplete

MakeupRecipeDetail
-> MakeupRecipeSaveComplete
```

기획 기준:

- 레퍼런스 사진에서 추출된 구조화 결과는 `ReferenceMakeupExtractionResult`다.
- 추출된 룩을 사용자가 조정하는 화면은 `ExtractedMakeupLookAdjust`다.
- 레시피는 추출된 룩을 실제 메이크업 적용 순서로 풀어낸 구성/절차/조합이다.
- 메이크업 레시피 route는 `MakeupRecipeDetail`과 `MakeupRecipeSaveComplete`를 사용한다.

### 5.7 마이페이지/프로필/저장 목록

마이페이지는 `ProfileTab`과 `ProfileScreen`이 담당한다.

연결 화면:

- `ProfileEdit`: 사용자 기본 정보와 관심사 수정 mock UI
- `MakeupLookList`: 저장한 메이크업 룩 전체 목록
- `LikedProductList`: 좋아요 제품 전체 목록
- `FaceAnalysisReportsList`: 얼굴 분석 보고서 목록

기획 기준:

- 마이페이지 요약 데이터는 `MyPageProfileSummary` 계열이다.
- 로그인 사용자 기본 정보는 `UserProfile` 계열이다.
- 얼굴 분석/추천에 활용되는 개인화 특성 데이터는 `BeautyProfile` 계열이다.

### 5.8 추천 제품

`CustomTab`의 `ProductRecommendationScreen`이 담당한다.

기획 기준:

- 실제 제품 엔티티는 `Product`다.
- 추천 결과 항목은 `RecommendedProduct`다.
- 추천 행위, 추천 화면, 추천 service는 `ProductRecommendation` 계열을 사용한다.
- 현재는 mock 추천 데이터와 mock 정렬/좋아요 상태만 제공한다.

## 6. 데이터와 상태 기준

- 화면 컴포넌트가 mock 데이터를 직접 깊게 알지 않도록 service 계층을 둔다.
- route param에는 deep link와 재진입에 필요한 식별자 중심 값을 둔다.
- 사진 선택 결과, 피드백 결과, 추출 결과처럼 route param으로 넘기기 어려운 임시 데이터는 `NavigationFlowStateProvider`에서 관리한다.
- 일반 앱 시작 상태는 clean state를 사용하고, 화면 캡처/딥링크 검토가 필요할 때만 `demoFlowState.ts`의 seed를 주입한다.
- 이미지 경로는 mock/service/type 계층에서 관리하고 화면마다 직접 반복하지 않는다.

## 7. 구조 리팩터링 적용 상태

2026-06-26 기준 남은 모바일 구조 TODO는 코드에 반영했다.

- route adapter는 `apps/mobile/src/app/navigation/routes/` 아래에서 플로우별로 관리한다.
- 저장 route는 `MakeupFilterSave`, 레시피 route는 `MakeupRecipeDetail`/`MakeupRecipeSaveComplete`로 최종화했다.
- `ProfileEditScreen`, `FaceAnalysisReportDetailScreen`, `FullscreenOverlay`, `MakeupCorrectionGuideOverlayScreen`의 순수 모델 또는 공통 UI 일부를 service/component 파일로 분리했다.
- AR 형태 편집은 `shapePoint.offset` 기반 drag, 개별/전체 reset, preset save value 모델을 사용한다.
- 백엔드/API 연동 전까지 화면 데이터는 mock/service/type 계층을 통해 교체 가능하게 유지한다.

## 8. 화면별 상세 기획

### 8.1 Login

파일:

- `apps/mobile/src/features/auth/screens/LoginScreen.tsx`
- `apps/mobile/src/features/auth/services/authService.ts`
- `apps/mobile/src/features/auth/mocks/socialLoginProviders.mock.ts`

역할:

- 앱 진입 시 AURA 브랜드와 소셜 로그인 진입점을 보여준다.
- 실제 OAuth가 아니라 mock login service를 통해 다음 화면으로 이동한다.

주요 UI:

- AURA 로고
- 서비스 소개 문구
- 소셜 로그인 버튼 목록
- 로그인 실패/진행 상태를 표시할 수 있는 구조

이동:

- 로그인 성공 → `Tutorial` 또는 `MainTabs`

### 8.2 Tutorial / FaceCaptureTutorial

파일:

- `apps/mobile/src/features/onboarding/screens/TutorialIntroScreen.tsx`
- `apps/mobile/src/features/onboarding/screens/FaceCaptureTutorialScreen.tsx`

역할:

- 앱의 추천 → AR 적용 → 피드백 경험을 소개한다.
- 얼굴 분석 촬영 전에 조명, 표정, 머리카락, 액세서리 기준을 안내한다.

주요 UI:

- 온보딩 소개 카드
- 촬영 가이드 이미지
- 촬영 전 체크 포인트
- 시작 CTA

이동:

- 튜토리얼 완료 → `FaceCapture`
- 건너뛰기 또는 완료 후 → `MainTabs`

### 8.3 HomeTab

파일:

- `apps/mobile/src/features/home/screens/HomeScreen.tsx`
- `apps/mobile/src/features/home/services/homeService.ts`
- `apps/mobile/src/features/home/mocks/home.mock.ts`

역할:

- 앱의 주요 기능으로 이동하는 허브다.
- 얼굴 분석, AR 필터, 메이크업 피드백, 레퍼런스 메이크업 추출, 추천 제품으로 이어지는 진입점을 제공한다.

주요 UI:

- 홈 hero
- 공지/가이드
- 주간 트렌드
- 필터 스토어 mock 카드
- 추천 룩 섹션

이동:

- 얼굴 진단 CTA → `FaceCapture`
- AR/필터 CTA → `ARFilter`
- 피드백 CTA → `MakeupFeedbackEntry`
- 메이크업 추출 CTA → `ReferenceMakeupExtractionUpload`

### 8.4 FaceCapture

파일:

- `apps/mobile/src/features/face-capture/screens/FaceCaptureScreen.tsx`
- `apps/mobile/src/features/face-capture/services/faceCaptureValidation.ts`
- `apps/mobile/src/features/face-capture/mocks/faceCapture.mock.ts`

역할:

- 얼굴 분석에 사용할 사진을 촬영한다.
- 카메라 권한, 촬영 준비 상태, 촬영 가이드 조건을 보여준다.

주요 UI:

- 카메라 프리뷰 또는 권한 안내
- 얼굴 위치/조명/표정 체크
- 촬영 버튼
- 전/후면 전환, 재시도, 닫기 버튼

이동:

- 촬영 성공 → `FaceAnalysisLoading`
- 닫기 → `HomeTab`

### 8.5 FaceAnalysisLoading / Reports / Detail

파일:

- `apps/mobile/src/features/face-analysis/screens/FaceAnalysisLoadingScreen.tsx`
- `apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportsListScreen.tsx`
- `apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.tsx`
- `apps/mobile/src/features/face-analysis/services/faceAnalysisLoadingService.ts`
- `apps/mobile/src/features/face-analysis/services/faceAnalysisReportDetailLoadState.ts`
- `apps/mobile/src/shared/mocks/faceAnalysis.mock.ts`

역할:

- 얼굴 분석 진행 상태를 보여주고, 완료 후 분석 보고서 상세를 제공한다.
- 마이페이지에서는 과거 분석 보고서 목록으로 다시 접근할 수 있다.

주요 UI:

- 분석 단계/진행 상태
- 퍼스널 컬러, 얼굴형, 피부 타입, 추천 무드
- 추천 메이크업 포인트
- 피해야 할 메이크업 포인트
- AR 필터 생성 CTA

이동:

- 분석 완료 → `FaceAnalysisReportDetail`
- 보고서 목록 항목 선택 → `FaceAnalysisReportDetail`
- AR 적용 CTA → `ARFilter`

### 8.6 ARFilter

파일:

- `apps/mobile/src/features/ar/screens/ARFilterScreen.tsx`
- `apps/mobile/src/features/ar/hooks/useARFilterSelectionState.ts`
- `apps/mobile/src/features/ar/services/arFilterOptionRules.ts`
- `apps/mobile/src/features/ar/components/ARFilterCameraPreview.tsx`
- `apps/mobile/src/features/ar/components/ARFilterModeTabs.tsx`
- `apps/mobile/src/features/ar/components/ARFilterMakeupAreaTabs.tsx`
- `apps/mobile/src/features/ar/components/ARFilterOptionGroupTabs.tsx`
- `apps/mobile/src/features/ar/components/ARFilterOptionCardList.tsx`
- `apps/mobile/src/features/ar/components/ARFilterBottomActions.tsx`
- `apps/mobile/src/features/ar/components/ARFilterCaptureControls.tsx`

역할:

- 라이브 카메라 프리뷰 위에 메이크업 필터를 적용한다.
- 추천/저장 룩 카드, 컬러/타입/질감/형태 옵션, 촬영 컨트롤을 한 화면에 배치한다.
- 저장 가능한 custom 필터 상태를 만든다.

옵션 노출 규칙:

- 전체 얼굴(`MakeupArea = all`): `룩`, `형태`
- 개별 부위(`base`, `eye`, `lip`, `cheek`, `contour`): `룩`, `컬러`, `타입`, `질감`, `형태`
- 옵션 카드 목록의 첫 번째 항목은 항상 `원본`이다.
- 개별 옵션 수정 시 `selectedTotalMakeupLookId`는 `null`이 되고 `hasUnsavedMakeupChanges`가 켜진다.

이동:

- 형태 수정 → `ARFilterShapeAdjust`
- 필터 편집 → `MakeupFilterEdit`
- 저장 → `MakeupFilterSave`
- 촬영 완료 또는 닫기 → `HomeTab`

### 8.7 ARFilterShapeAdjust

파일:

- `apps/mobile/src/features/ar/screens/ARFilterShapeAdjustScreen.tsx`
- `apps/mobile/src/features/ar/services/filterCustomizationService.ts`
- `apps/mobile/src/features/ar/mocks/filterCustomization.mock.ts`

역할:

- 사용자가 얼굴 위의 `shapePoint`를 조정해 메이크업 레이어의 형태를 바꾼다.
- reset/save/preset으로 이어질 수 있는 형태 상태를 만든다.

주요 상태:

- `FilterShapeState`
- `FilterShapePoint`
- `FilterShapeAdjustment`
- `shapePoint.position`
- `shapePoint.offset`

주요 함수:

- `updateFilterShapePointOffset`
- `resetFilterShapePointOffset`
- `resetFilterShapePoints`
- `getResolvedShapePointPosition`
- `createShapePresetFromState`

### 8.8 MakeupFilterEdit / Save

파일:

- `apps/mobile/src/features/ar/screens/MakeupFilterEditScreen.tsx`
- `apps/mobile/src/features/reference-makeup-extraction/screens/MakeupFilterSaveScreen.tsx`
- `apps/mobile/src/features/reference-makeup-extraction/screens/MakeupFilterSaveCompleteScreen.tsx`
- `apps/mobile/src/features/ar/services/filterCustomizationService.ts`

역할:

- `MakeupFilterEdit`은 현재 적용될 메이크업 필터 조합의 컬러/타입/질감 옵션을 편집한다.
- `MakeupFilterSave`은 AR에서 조합한 필터 또는 추출된 룩을 이름, 태그, 공개 설정과 함께 저장한다.
- `MakeupFilterSaveComplete`는 저장 완료 후 적용 화면 또는 마이페이지로 이동시킨다.

구조 기준:

- route 화면명과 화면 컴포넌트는 `MakeupFilterSave` 계열을 사용한다.
- 저장 화면 내부에서 별도 폼 컴포넌트가 필요해지면 `MakeupFilterSaveForm`처럼 내부 UI 단위에만 `Form`을 붙인다.

### 8.9 MakeupFeedback

파일:

- `apps/mobile/src/features/makeup-feedback/screens/MakeupFeedbackEntryScreen.tsx`
- `apps/mobile/src/features/makeup-feedback/screens/MakeupFeedbackCaptureScreen.tsx`
- `apps/mobile/src/features/makeup-feedback/screens/MakeupFeedbackLoadingScreen.tsx`
- `apps/mobile/src/features/makeup-feedback/screens/MakeupFeedbackResultScreen.tsx`
- `apps/mobile/src/features/makeup-feedback/screens/MakeupCorrectionGuideOverlayScreen.tsx`
- `apps/mobile/src/features/makeup-feedback/screens/MakeupCorrectionTipScreen.tsx`
- `apps/mobile/src/features/makeup-feedback/services/makeupFeedbackService.ts`
- `apps/mobile/src/features/makeup-feedback/mocks/makeupFeedback.mock.ts`

역할:

- 현재 메이크업 사진을 촬영/선택하고, mock 분석 결과로 점수와 수정 포인트를 보여준다.
- 가이드 오버레이와 수정팁으로 실제 수정 루틴을 제안한다.

주요 UI:

- 피드백 기능 소개
- 카메라/갤러리 사진 선택
- 분석 진행 카드
- 점수, 수정 포인트, 잘한 포인트
- 사진 위 annotation marker
- 가이드 오버레이
- 수정팁 상세 루틴

### 8.10 ReferenceMakeupExtraction

파일:

- `apps/mobile/src/features/reference-makeup-extraction/screens/ReferenceMakeupExtractionUploadScreen.tsx`
- `apps/mobile/src/features/reference-makeup-extraction/screens/ReferenceMakeupExtractionLoadingScreen.tsx`
- `apps/mobile/src/features/reference-makeup-extraction/screens/ReferenceMakeupExtractionResultScreen.tsx`
- `apps/mobile/src/features/reference-makeup-extraction/screens/ExtractedMakeupLookAdjustScreen.tsx`
- `apps/mobile/src/features/reference-makeup-extraction/screens/MakeupRecipeDetailScreen.tsx`
- `apps/mobile/src/features/reference-makeup-extraction/screens/MakeupRecipeSaveCompleteScreen.tsx`
- `apps/mobile/src/features/reference-makeup-extraction/services/makeupExtractionService.ts`
- `apps/mobile/src/features/reference-makeup-extraction/mocks/referenceMakeupExtraction.mock.ts`

역할:

- 레퍼런스 사진을 선택하고 메이크업 룩을 추출한다.
- 추출된 룩을 조정하거나 저장하고, 메이크업 레시피 상세로 변환한다.

주요 UI:

- 앨범/카메라 선택 탭
- 선택 사진 preview
- 분석 진행률과 단계
- 추출 결과 요약, palette, point
- 추출 룩 조정 화면
- 레시피 단계와 저장 완료 화면

구조 기준:

- 레시피 route와 화면은 `MakeupRecipe*` 계열을 사용한다.
- 레퍼런스 추출에서 진입하더라도 산출물 자체는 재사용 가능한 메이크업 레시피로 다룬다.

### 8.11 Profile / Lists

파일:

- `apps/mobile/src/features/profile/screens/ProfileScreen.tsx`
- `apps/mobile/src/features/profile/screens/ProfileEditScreen.tsx`
- `apps/mobile/src/features/recommendation/screens/MakeupLookListScreen.tsx`
- `apps/mobile/src/features/recommendation/screens/LikedProductListScreen.tsx`
- `apps/mobile/src/features/profile/services/profileScreenData.ts`
- `apps/mobile/src/shared/services/profileService.ts`
- `apps/mobile/src/shared/services/makeupService.ts`
- `apps/mobile/src/shared/services/productService.ts`

역할:

- 마이페이지 요약과 사용자 프로필 수정 UI를 제공한다.
- 저장 룩 목록과 좋아요 제품 목록으로 확장된다.

주요 UI:

- 프로필 요약 카드
- 얼굴 분석 요약
- 저장 메이크업 룩 preview
- 좋아요 제품 preview
- 프로필 수정 폼
- 저장 룩/좋아요 제품 전체 목록과 페이지네이션

### 8.12 ProductRecommendation

파일:

- `apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx`
- `apps/mobile/src/features/recommendation/services/productRecommendationService.ts`
- `apps/mobile/src/features/recommendation/mocks/productRecommendation.mock.ts`
- `apps/mobile/src/features/recommendation/types.ts`

역할:

- 저장한 룩 또는 개인화 특성에 맞는 추천 제품 목록을 보여준다.
- 추천 항목은 `RecommendedProduct`, 실제 제품 엔티티는 `Product`로 구분한다.

주요 UI:

- 추천 기준 룩 요약
- 추천 제품 카드
- 매칭 점수/추천 이유
- 좋아요 상태
- sort/filter mock UI
