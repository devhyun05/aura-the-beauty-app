# 앱 전체 화면/플로우 기능 상세 기획서

작성일: 2026-06-26

이 문서는 `apps/mobile` 현재 코드 기준으로 앱의 모든 주요 화면을 기능/플로우별로 분류하고, 화면별 역할, 이동 흐름, 관련 파일, 주요 변수/타입/서비스 이름을 정리한 문서다. 또한 앱 전체 용어 사전과 비슷하지만 다른 개념이 같은 용어, 파일명, 변수명으로 섞여 있는 지점을 별도로 정리한다.

현재 모바일 앱은 실제 백엔드, Unity AR, ARKit/ARCore, AI 모델을 붙인 상태가 아니라 프론트엔드 UI와 mock 데이터 중심으로 구현되어 있다.

## 1. 전체 화면 분류

### 1.1 앱 Shell과 Navigation

앱의 화면 전환은 React Navigation 기준으로 구성되어 있다.

- Root stack: `RootNavigator`
- Main tab: `MainTabNavigator`
- Route 타입: `RootStackParamList`, `MainTabParamList`
- 화면 chrome 정책: `routeChromeByRoute`
- 딥링크 정책: `rootStackLinkingScreens`, `mainTabLinkingScreens`
- 플로우 임시 상태: `NavigationFlowStateProvider`

파일:

- `apps/mobile/src/app/AppRoot.tsx`
- `apps/mobile/src/app/navigation/RootNavigator.tsx`
- `apps/mobile/src/app/navigation/MainTabNavigator.tsx`
- `apps/mobile/src/app/navigation/navigationAdapters.tsx`
- `apps/mobile/src/app/navigation/routeTypes.ts`
- `apps/mobile/src/app/navigation/routeChrome.ts`
- `apps/mobile/src/app/navigation/linkingConfig.ts`
- `apps/mobile/src/app/navigation/flowState.tsx`

주요 변수/타입:

- `RootStackParamList`
- `MainTabParamList`
- `RootStackRouteName`
- `MainTabRouteName`
- `RouteName`
- `routeChromeByRoute`
- `ScreenDepth`
- `ScreenCategory`
- `NavigationFlowState`
- `selectedMakeupFeedbackPhoto`
- `selectedReferenceMakeupPhoto`
- `savedMakeupStyle`
- `makeupFeedbackResult`

### 1.2 Root Stack 화면 목록

현재 root stack route는 다음과 같다.

| Route | 화면 파일 | 기능 분류 | Chrome |
| --- | --- | --- | --- |
| `Login` | `LoginScreen.tsx` | 인증 진입 | fullscreen |
| `Tutorial` | `TutorialIntroScreen.tsx`, `PhotoCaptureGuideScreen.tsx` | 온보딩/촬영 가이드 | fullscreen |
| `MainTabs` | `MainTabNavigator.tsx` | 탭 호스트 | fullscreen |
| `FaceCapture` | `FaceCaptureScreen.tsx` | 얼굴 진단 촬영 | fullscreen |
| `ImageAnalysisLoading` | `ImageAnalysisLoadingScreen.tsx` | 얼굴 분석 진행 | detail |
| `ImageAnalysisReportsList` | `ImageAnalysisReportsListScreen.tsx` | 분석 결과 목록 | detail |
| `ImageAnalysisReportDetail` | `ImageAnalysisReportDetailScreen.tsx` | 맞춤 분석 보고서 | detail |
| `ProfileEdit` | `ProfileEditScreen.tsx` | 프로필 수정 | detail |
| `MakeupStyleList` | `MakeupStyleListScreen.tsx` | 저장 메이크업 스타일 목록 | detail |
| `LikedProductList` | `LikedProductListScreen.tsx` | 좋아요 제품 목록 | detail |
| `ARFilter` | `ARFilterScreen.tsx` | AR 필터 적용 | fullscreen |
| `ARFilterLocationAdjust` | `ARFilterLocationAdjustScreen.tsx` | AR 필터 형태 수정 | fullscreen |
| `ARFilterStyleAdjust` | `ARFilterStyleAdjustScreen.tsx` | AR 필터 프리셋 수정 | fullscreen |
| `MakeupFeedbackEntry` | `MakeupFeedbackEntryScreen.tsx` | 메이크업 피드백 시작 | detail |
| `MakeupFeedbackCapture` | `MakeupFeedbackCaptureScreen.tsx` | 피드백 사진 촬영/선택 | fullscreen |
| `MakeupFeedbackLoading` | `MakeupFeedbackLoadingScreen.tsx` | 피드백 분석 진행 | detail |
| `MakeupFeedbackResult` | `MakeupFeedbackResultScreen.tsx` | 피드백 결과 | detail |
| `MakeupCorrectionGuide` | `MakeupCorrectionGuideOverlayScreen.tsx` | 수정 가이드 오버레이 | detail |
| `MakeupCorrectionTip` | `MakeupCorrectionTipScreen.tsx` | 수정팁 상세 | detail |
| `ReferenceMakeupExtractionUpload` | `ReferenceMakeupExtractionUploadScreen.tsx` | 레퍼런스 메이크업 사진 선택 | detail |
| `ReferenceMakeupExtractionLoading` | `ReferenceMakeupExtractionLoadingScreen.tsx` | 메이크업 추출 진행 | fullscreen |
| `ReferenceMakeupExtractionResult` | `ReferenceMakeupExtractionResultScreen.tsx` | 추출 결과 | detail |
| `ExtractedMakeupStyleAdjust` | `ExtractedMakeupStyleAdjustScreen.tsx` | 추출 스타일 조정 | fullscreen |
| `ExtractedMakeupStyleSaveForm` | `ExtractedMakeupStyleSaveFormScreen.tsx` | 메이크업 스타일 저장 폼 | detail |
| `ExtractedMakeupStyleSaveComplete` | `ExtractedMakeupStyleSaveCompleteScreen.tsx` | 스타일 저장 완료 | fullscreen |
| `ExtractedMakeupStyleRecipeDetail` | `ExtractedMakeupStyleRecipeDetailScreen.tsx` | 메이크업 레시피 상세 | detail |
| `ExtractedMakeupStyleRecipeSaveComplete` | `ExtractedMakeupStyleRecipeSaveCompleteScreen.tsx` | 레시피 저장 완료 | fullscreen |

### 1.3 Main Tab 화면 목록

| Tab Route | 화면 파일 | 기능 분류 | Footer 상태 |
| --- | --- | --- | --- |
| `HomeTab` | `HomeScreen.tsx` | 홈/기능 허브 | `home` |
| `CustomTab` | `ProductRecommendationScreen.tsx` | 추천 제품 | `custom` |
| `ProfileTab` | `ProfileScreen.tsx` | 마이페이지 | footer active 없음 |

하단 footer의 `capture` 탭은 main tab이 아니라 root stack의 `ARFilter`로 이동한다.

## 2. 앱 전체 용어 사전

`AURA`

앱 브랜드명이다. 로그인, 온보딩, 홈 헤더에서 로고로 사용한다.

`메이크업 스타일`

사용자가 저장, 추천, 추출 결과로 인식하는 메이크업 조합 단위다. 마이페이지 저장 목록, 레퍼런스 추출 결과 저장, 추천 제품의 기준 스타일에서 쓰인다. 코드에서는 `MakeupStyle`, `MakeupStylePreview`, `ExtractedMakeupStyle*`, `ProductRecommendationStyle`처럼 여러 맥락으로 나뉜다.

`AR 필터`

실시간 카메라 위에 적용하는 메이크업 효과다. 코드에서는 `ARFilter`, `MakeupFilter`, `ARMakeupGuideData`, `mockARMakeupGuideData`가 핵심이다.

`스타일`

AR 필터 화면에서는 전체 얼굴 조합 단위를 뜻한다. 레퍼런스 추출 플로우에서는 저장 가능한 메이크업 조합 결과를 뜻한다. 같은 한국어지만 화면 맥락에 따라 전체 AR 조합 또는 저장된 메이크업 조합을 뜻하므로 주의가 필요하다.

`프리셋`

AR 필터 화면에서 눈, 립, 윤곽, 베이스 같은 개별 부위의 조합 단위를 뜻한다. 전체 얼굴의 `스타일`과 구분하기 위해 도입한 용어다.

`컬러`

메이크업의 색상 옵션이다. AR 필터, 레퍼런스 추출, 제품 추천 모두에서 사용한다.

`타입`

메이크업 표현 방식 또는 제품/적용 카테고리를 뜻한다. AR 필터 옵션에서는 `typeOptions`, 레퍼런스 스타일 조정에서는 `MakeupStyleAttributeGroup = 'type'`로 사용한다.

`질감`

메이크업 표면감이다. 예: 매트, 글로우, 새틴, 쉬머.

`형태`

AR 필터에서 메이크업 레이어가 얼굴 랜드마크에 붙는 모양과 배치 패턴이다. 단순 좌표 이동보다 넓은 개념이므로 `위치` 대신 사용하는 최종 용어다.

`원본`

AR 필터 옵션 카드의 첫 번째 항목이다. 해당 부위의 필터 적용을 끄거나 형태를 기본 랜드마크 상태로 되돌린다.

`얼굴 진단`

사용자 얼굴 촬영 후 AI가 퍼스널 컬러, 얼굴형, 피부 타입, 추천 무드, 포인트 가이드를 분석하는 플로우다. `FaceCapture` → `ImageAnalysisLoading` → `ImageAnalysisReportDetail`로 이어진다.

`이미지 분석 결과`

얼굴 진단 결과 보고서 목록과 상세를 뜻한다. 마이페이지에서 진입한다.

`메이크업 피드백`

사용자가 현재 한 메이크업 사진을 촬영/선택하면 AI가 점수, 수정 포인트, 잘한 포인트를 알려주는 플로우다. 저장된 스타일을 만드는 플로우가 아니라 현재 메이크업을 평가하고 수정하는 플로우다.

`수정 포인트`

메이크업 피드백 결과에서 개선이 필요한 부위/항목이다. 코드에서는 `MakeupFeedbackCorrectionPoint`를 사용한다.

`수정팁`

수정 포인트 하나에 대한 상세 루틴이다. 코드에서는 `MakeupCorrectionTipScreen`이 담당한다.

`가이드 오버레이`

메이크업 피드백 결과를 사진 위 랜드마크/라인으로 보여주는 수정 가이드 화면이다. 코드에서는 `MakeupCorrectionGuideOverlayScreen`이 담당한다.

`레퍼런스 메이크업 추출`

참고할 메이크업 사진에서 색감, 포인트, 스타일을 추출하는 플로우다. 코드에서는 `ReferenceMakeupExtraction*`를 사용한다.

`추출된 메이크업 스타일`

레퍼런스 사진에서 분석되어 저장 또는 조정 가능한 형태로 변환된 메이크업 스타일이다. 코드에서는 `MakeupExtractionResult`, `extractedMakeupStyle`, `ExtractedMakeupStyle*`를 사용한다.

`메이크업 레시피`

추출된 메이크업 스타일을 실제 적용 순서와 부위별 단계로 풀어낸 상세 가이드다. 코드에서는 `ExtractedMakeupStyleRecipeDetailScreen`과 `MakeupStyleRecipeTab`을 사용한다.

`추천 제품`

저장한 메이크업 스타일과 어울리는 제품 추천이다. 코드에서는 `ProductRecommendation*` 계열 타입을 사용한다.

`좋아요 제품`

사용자가 좋아요한 제품 목록이다. 마이페이지 요약과 전체 목록에서 사용한다. 코드에서는 `Product`, `LikedProductPreview`, `getLikedProducts`를 사용한다.

`필터 스토어`

홈 화면에 있는 필터 탐색 섹션이다. 현재는 mock 카드이며 실제 구매/다운로드 동작은 없다.

## 3. 플로우별 상세 기획

### 3.1 인증 플로우

#### Login

역할:

소셜 로그인으로 앱에 진입하는 첫 화면이다.

화면 내용:

- AURA 로고
- Google, Kakao, Naver 소셜 로그인 버튼
- 로그인 성공/실패 피드백 메시지
- 이용약관/개인정보처리방침 동의 안내

이동:

- 로그인 성공 시 `Tutorial`로 이동한다.

파일:

- 화면: `apps/mobile/src/features/auth/screens/LoginScreen.tsx`
- 컴포넌트: `AuraLogo.tsx`, `SocialLoginButton.tsx`
- mock: `socialLoginProviders.mock.ts`
- service: `authService.ts`
- type: `types.ts`

주요 변수/타입:

- `SocialLoginProvider`
- `SocialLoginItem`
- `AuthSession`
- `AuthUser`
- `loadingProvider`
- `feedback`
- `loginWithSocialProvider`

### 3.2 온보딩/촬영 가이드 플로우

#### Tutorial

역할:

얼굴 진단 시작 전 앱의 목적을 소개하고 촬영 가이드로 이어지는 화면이다.

화면 내용:

- AURA 로고
- `이미지 진단을 시작합니다.` 문구
- 진단 시작 버튼

이동:

- `진단 시작` 선택 시 같은 route 안에서 `PhotoCaptureGuideScreen`을 보여준다.
- 촬영 가이드 완료 시 `FaceCapture`로 이동한다.

파일:

- `apps/mobile/src/features/onboarding/screens/TutorialIntroScreen.tsx`
- `apps/mobile/src/features/onboarding/screens/PhotoCaptureGuideScreen.tsx`

주요 변수/타입:

- `TutorialIntroHeroContent`
- `tutorialIntroHeroContent`
- `isPhotoGuideVisible`
- `PhotoCaptureGuideStep`
- `photoCaptureGuideSteps`
- `currentStepIndex`
- `hasAgreedToPrivacy`

#### PhotoCaptureGuide

역할:

얼굴 분석 촬영 전 사용자가 지켜야 할 조건을 안내한다.

화면 내용:

- 4단계 촬영 가이드
- 표정, 머리, 액세서리, 얼굴 중앙 정렬 안내
- 마지막 단계 개인정보 수집 및 이용 동의
- `촬영하기` 버튼

파일:

- `PhotoCaptureGuideScreen.tsx`

주요 변수/타입:

- `PHOTO_CAPTURE_GUIDE_IMAGE_ASPECT_RATIO`
- `PHOTO_CAPTURE_GUIDE_SWIPE_HINT_LABEL`
- `PhotoCaptureGuideIconKey`
- `PhotoCaptureGuideStep`
- `photoCaptureGuideNavigationMode`
- `photoCaptureGuideVisualPresentation`

### 3.3 홈/기능 허브 플로우

#### HomeTab / HomeScreen

역할:

앱의 기능 허브다. 사용자가 AR, 얼굴 진단, 레퍼런스 추출, 메이크업 피드백, 추천 제품으로 빠르게 진입한다.

화면 내용:

- 트렌드 히어로 배너 캐러셀
- 빠른 실행 버튼 5개
- 필터 스토어 섹션
- 추천 메이크업 리스트 섹션

빠른 실행:

- `실시간 AR` → `ARFilter`
- `얼굴 진단` → `Tutorial`
- `메이크업 추출` → `ReferenceMakeupExtractionUpload`
- `메이크업 피드백` → `MakeupFeedbackEntry`
- `추천 제품` → `CustomTab`

파일:

- 화면: `apps/mobile/src/features/home/screens/HomeScreen.tsx`
- service: `apps/mobile/src/features/home/services/homeService.ts`
- mock: `apps/mobile/src/features/home/mocks/home.mock.ts`
- type: `apps/mobile/src/features/home/types.ts`

주요 변수/타입:

- `HomeData`
- `HomeTrendItem`
- `HomeFilterStoreItem`
- `HomeMakeupStyle`
- `quickActions`
- `HomeQuickActionId`
- `getHomeQuickActionPressHandler`
- `homeData`
- `active hero carousel offset` 관련 `getHeroCarousel*` 헬퍼

### 3.4 얼굴 진단/이미지 분석 플로우

#### FaceCapture

역할:

얼굴 분석용 사진을 촬영하는 풀스크린 카메라 화면이다.

화면 내용:

- 라이브 카메라 레이어
- 얼굴 가이드 타원
- 촬영 가능/불가 상태 메시지
- 앨범 선택 버튼
- 전/후면 카메라 전환 버튼
- 촬영 버튼

이동:

- 촬영 시 `ImageAnalysisLoading`으로 이동한다.

파일:

- 화면: `apps/mobile/src/features/face-capture/screens/FaceCaptureScreen.tsx`
- validation: `apps/mobile/src/features/face-capture/services/faceCaptureValidation.ts`
- mock: `apps/mobile/src/features/face-capture/mocks/faceCapture.mock.ts`

주요 변수/타입:

- `CameraDirection`
- `FaceCaptureCheckKey`
- `FaceCaptureCheckState`
- `FaceCaptureGuidance`
- `FACE_CAPTURE_RULES`
- `mockReadyFaceCaptureChecks`
- `mockBlockedFaceCaptureChecks`
- `cameraDirection`
- `evaluateFaceCaptureGuidance`

#### ImageAnalysisLoading

역할:

촬영 이미지를 AI가 분석하는 진행 화면이다.

화면 내용:

- 분석 중 제목
- 촬영 이미지 프리뷰
- 진행률 링
- 단계별 분석 상태
- TIP 카드

이동:

- mock 진행 완료 후 `ImageAnalysisReportDetail`로 이동한다.

파일:

- 화면: `apps/mobile/src/features/image-analysis/screens/ImageAnalysisLoadingScreen.tsx`
- service: `apps/mobile/src/features/image-analysis/services/imageAnalysisLoadingService.ts`

주요 변수/타입:

- `IMAGE_ANALYSIS_LOADING_TOTAL_MS`
- `imageAnalysisLoadingSteps`
- `getImageAnalysisProgressState`
- `elapsedMs`
- `progressState`

#### ImageAnalysisReportsList

역할:

사용자의 과거 이미지 분석 결과 목록이다.

화면 내용:

- 2열 카드 그리드
- 페이지 단위 표시
- 분석 결과 카드 터치 시 상세 이동

이동:

- 카드 선택 시 `ImageAnalysisReportDetail`로 이동한다.

파일:

- 화면: `ImageAnalysisReportsListScreen.tsx`
- 컴포넌트: `ImageAnalysisReportCard.tsx`
- service: `shared/services/imageAnalysisService.ts`
- mock: `shared/mocks/imageAnalysis.mock.ts`
- type: `shared/types/imageAnalysis.ts`

주요 변수/타입:

- `ImageAnalysisReport`
- `ImageAnalysisReportCard`
- `reports`
- `getImageAnalysisReports`

#### ImageAnalysisReportDetail

역할:

얼굴 분석 결과 상세 보고서다.

화면 내용:

- 분석 날짜와 사용자명
- 얼굴 이미지
- 요약 정보: 퍼스널 컬러, 얼굴형, 톤 요약, 추천 무드
- 분석 요약
- 부위별 포인트 가이드
- 추천 메이크업 카드
- 비추천 메이크업 카드
- AR 필터 만들기 버튼
- 공유 액션

이동:

- `AR 필터 만들기` 선택 시 `ARFilterStyleAdjust`로 이동한다.
- 공유 버튼은 route-level header action으로 연결된다.

파일:

- 화면: `ImageAnalysisReportDetailScreen.tsx`
- service: `imageAnalysisReportDetailLoadState.ts`, `shared/services/imageAnalysisService.ts`, `shared/services/userService.ts`
- type: `ImageAnalysisReport`, `ImageAnalysisFacePointGuide`, `ImageAnalysisMakeupCard`

주요 변수/타입:

- `ImageAnalysisReportDetailLoadState`
- `guideLabels`
- `getImageAnalysisReportSummaryItems`
- `getImageAnalysisReportPointGuideItems`
- `onHeaderShareActionChange`
- `onCreateARFilter`
- `loadState`
- `report`
- `profile`

### 3.5 AR 필터 적용/수정 플로우

AR 필터 화면의 상세 기획은 별도 문서도 함께 유지한다.

- `docs/mobile/AR_FILTER_SCREEN_FEATURE_SPEC.md`

#### ARFilter

역할:

라이브 카메라 위에 메이크업 필터를 적용하고, 전체 스타일 또는 부위별 프리셋/옵션을 선택해 저장 가능한 조합을 만드는 화면이다.

화면 내용:

- 라이브 카메라 AR 프리뷰
- `기본`, `반반 가이드` 탭
- 사진/동영상 모드
- 메이크업 부위 칩
- 옵션 그룹 칩
- 옵션 카드 목록
- `형태 수정`, `저장` 버튼
- 촬영 버튼

옵션 그룹:

- 전체: `스타일`, `형태`
- 개별 부위: `프리셋`, `컬러`, `타입`, `질감`, `형태`

이동:

- 뒤로가기 → `HomeTab`
- 형태 수정 → `ARFilterLocationAdjust`
- 저장 → 현재 코드상 `ExtractedMakeupStyleSaveForm`
- 촬영 완료 → `HomeTab`

파일:

- 화면: `apps/mobile/src/features/ar/screens/ARFilterScreen.tsx`
- service: `shared/services/makeupGuideService.ts`
- mock: `shared/mocks/makeupGuide.mock.ts`
- type: `shared/types/makeupGuide.ts`

주요 변수/타입:

- `ARMakeupOptionGroupId`
- `selectedMakeupStyleCardId`
- `selectedMakeupPresetCardId`
- `selectedMakeupOptionGroup`
- `selectedFacePartId`
- `selectedColorId`
- `selectedTypeId`
- `selectedTextureId`
- `selectedShapeId`
- `hasUnsavedMakeupChanges`
- `getARFilterOptionGroupLabels`
- `getARFilterMakeupStyleCardIdAfterOptionEdit`
- `isARFilterSaveEnabled`

#### ARFilterLocationAdjust

역할:

AR 필터의 형태를 얼굴 랜드마크 기준으로 세밀하게 조정하는 화면이다. 화면 문구는 `형태 수정`을 사용하지만 파일명과 타입은 아직 `Location`을 사용한다.

화면 내용:

- 라이브 카메라 프리뷰
- 메이크업 레이어 오버레이
- 랜드마크 점 표시/숨김
- 되돌리기
- 부위 선택
- 좌우 이동, 상하 이동, 크기, 각도 조정
- 현재 형태 저장

이동:

- 저장 또는 뒤로가기 → `ARFilter`

파일:

- 화면: `ARFilterLocationAdjustScreen.tsx`
- service: `filterCustomizationService.ts`
- mock: `filterCustomization.mock.ts`

주요 변수/타입:

- `FilterLocationState`
- `FilterLocationAdjustment`
- `FilterLocationAdjustmentKey`
- `FilterLandmarkPoint`
- `mockFilterLocationState`
- `locationState`
- `updateFilterLocationAdjustment`
- `LOCATION_ADJUST_TITLE`

#### ARFilterStyleAdjust

역할:

현재 코드상 AR 필터의 컬러/타입/질감 옵션을 조정하는 별도 화면이다. 최근 용어 결정 이후 사용자 문구는 `프리셋 수정`으로 바뀌었지만 파일명과 타입에는 `Style`이 남아 있다.

화면 내용:

- 라이브 카메라 프리뷰
- 부위 선택
- 프리셋 옵션: 컬러, 타입, 질감
- 컬러 스와치 또는 텍스트 칩
- 현재 프리셋 저장

파일:

- 화면: `ARFilterStyleAdjustScreen.tsx`
- service: `filterCustomizationService.ts`
- mock: `filterCustomization.mock.ts`

주요 변수/타입:

- `FilterStyleState`
- `StyleOptionGroupId`
- `STYLE_GROUPS`
- `styleState`
- `selectedColor`
- `getFilterStyleState`
- `updateFilterStyleSelection`

### 3.6 메이크업 피드백 플로우

#### MakeupFeedbackEntry

역할:

메이크업 피드백 기능의 시작 화면이다.

화면 내용:

- 메이크업 피드백 소개 카드
- `AI 피드백` 시작 버튼

이동:

- `AI 피드백` 선택 → `MakeupFeedbackCapture`

파일:

- 화면: `MakeupFeedbackEntryScreen.tsx`
- 공통 scaffold: `MakeupFeedbackScreenScaffold.tsx`

주요 변수/타입:

- `MakeupFeedbackEntryScreenProps`
- `onPressAiFeedback`

#### MakeupFeedbackCapture

역할:

피드백 분석에 사용할 현재 메이크업 사진을 촬영하거나 갤러리에서 선택하는 화면이다.

화면 내용:

- expo-camera 기반 카메라
- 카메라 권한 안내
- 촬영 버튼
- 전/후면 전환 버튼
- 갤러리 선택 버튼

이동:

- 사진 선택 시 `MakeupFeedbackLoading`

파일:

- 화면: `MakeupFeedbackCaptureScreen.tsx`
- type: `MakeupFeedbackPhotoSelection`

주요 변수/타입:

- `MakeupFeedbackPhotoSource`
- `MakeupFeedbackPhotoSelection`
- `cameraFacing`
- `isCameraReady`
- `isTakingPhoto`
- `isPickingImage`
- `mountError`
- `onSelectPhoto`

#### MakeupFeedbackLoading

역할:

선택한 메이크업 사진을 분석하는 진행 화면이다.

화면 내용:

- AI 분석 중 카드
- 로딩 인디케이터

이동:

- 분석 완료 시 `MakeupFeedbackResult`

파일:

- 화면: `MakeupFeedbackLoadingScreen.tsx`
- service: `makeupFeedbackService.ts`
- mock: `makeupFeedback.mock.ts`

주요 변수/타입:

- `analyzeMakeupForFeedback`
- `createMockMakeupFeedback`
- `MakeupFeedbackResult`
- `selection`
- `onComplete`

#### MakeupFeedbackResult

역할:

현재 메이크업의 점수, 수정 포인트, 잘한 포인트를 보여주는 결과 화면이다.

화면 내용:

- 업로드/촬영 이미지
- 얼굴 위 annotation marker
- 종합 점수
- 요약 badge
- 수정 포인트 3가지
- 잘한 포인트 accordion
- 사진 다시 업로드
- 다시 촬영
- 가이드 오버레이 보기

이동:

- 수정팁 → `MakeupCorrectionTip`
- 가이드 오버레이 → `MakeupCorrectionGuide`
- 다시 촬영/업로드 → `MakeupFeedbackCapture`

파일:

- 화면: `MakeupFeedbackResultScreen.tsx`
- type: `MakeupFeedbackCorrectionPoint`, `MakeupFeedbackStrength`, `MakeupFeedbackResult`

주요 변수/타입:

- `MakeupFeedbackAnnotation`
- `MakeupFeedbackCorrectionPoint`
- `MakeupFeedbackStrength`
- `openStrengthId`
- `onOpenGuide`
- `onOpenTip`
- `onRetake`
- `onUploadAgain`

#### MakeupCorrectionGuide

역할:

피드백 결과 사진 위에 부위별 수정 가이드를 오버레이로 보여준다.

화면 내용:

- 사진 위 SVG 가이드 라인
- 전체/눈/눈썹/입술/블러셔/베이스 탭
- 부위별 상세 가이드 카드

파일:

- 화면: `MakeupCorrectionGuideOverlayScreen.tsx`

주요 변수/타입:

- `GuideCategory`
- `GuideSection`
- `GUIDE_TABS`
- `GUIDE_SECTIONS`
- `activeCategory`
- `GuideOverlay`

#### MakeupCorrectionTip

역할:

수정 포인트 하나에 대한 구체적인 3단계 수정 루틴을 보여준다.

화면 내용:

- 수정 포인트별 히어로 카드
- 오늘의 수정 기준
- 3단계 수정 루틴
- 거울 앞 체크 포인트
- 마무리 팁
- 피드백 결과로 돌아가기

파일:

- 화면: `MakeupCorrectionTipScreen.tsx`

주요 변수/타입:

- `MakeupFeedbackCorrectionPointKind`
- `TIP_CONTENT`
- `TipContent`
- `getPointIcon`

### 3.7 레퍼런스 메이크업 추출/저장 플로우

#### ReferenceMakeupExtractionUpload

역할:

참고할 메이크업 사진을 앨범 또는 카메라에서 선택하는 화면이다.

화면 내용:

- `앨범에서 선택`, `카메라로 촬영` 탭
- 업로드/촬영 CTA 카드
- 사진 grid
- 선택된 사진 정보
- 분석 시작하기 버튼

이동:

- 분석 시작 → `ReferenceMakeupExtractionLoading`

파일:

- 화면: `ReferenceMakeupExtractionUploadScreen.tsx`
- service: `makeupExtractionService.ts`
- mock: `referenceMakeupExtraction.mock.ts`
- type: `ReferenceMakeupPhoto`, `ReferenceMakeupSource`

주요 변수/타입:

- `ReferenceMakeupExtractionData`
- `ReferenceMakeupPhoto`
- `ReferenceMakeupSource`
- `activeSource`
- `selectedPhotoId`
- `selectedPhoto`

#### ReferenceMakeupExtractionLoading

역할:

선택한 레퍼런스 사진에서 메이크업 정보를 추출하는 진행 화면이다.

화면 내용:

- 선택 사진 프리뷰
- 진행률 표시
- 단계별 분석 상태
- 분석 소요 시간 안내

이동:

- mock 타이머 완료 후 `ReferenceMakeupExtractionResult`

파일:

- 화면: `ReferenceMakeupExtractionLoadingScreen.tsx`
- type: `MakeupExtractionStep`, `MakeupExtractionStepStatus`

주요 변수/타입:

- `MakeupExtractionStepStatus`
- `StepStatusIcon`
- `loadingSteps`
- `photo`

#### ReferenceMakeupExtractionResult

역할:

레퍼런스 사진에서 추출된 메이크업 스타일의 요약 결과를 보여준다.

화면 내용:

- 원본 source image
- 추출된 메이크업 스타일 제목/설명/tags
- 추출된 컬러 밸런스
- 분석 정확도
- 반영 포인트
- 다시 선택
- 스타일 조정해보기

이동:

- 다시 선택 → `ReferenceMakeupExtractionUpload`
- 스타일 조정해보기 → `ExtractedMakeupStyleAdjust`

파일:

- 화면: `ReferenceMakeupExtractionResultScreen.tsx`
- type: `MakeupExtractionResult`, `MakeupStylePalette`, `MakeupStylePoint`

주요 변수/타입:

- `extractedMakeupStyle`
- `palette`
- `points`
- `accuracy`

#### ExtractedMakeupStyleAdjust

역할:

추출된 메이크업 스타일을 AR처럼 미리 적용해 보고 컬러/타입/질감을 조정하거나 저장/레시피 생성으로 이어지는 화면이다.

화면 내용:

- 닫기 버튼
- `위치 조정`, `스타일 조정` 상단 탭
- 사진 프리뷰와 메이크업 overlay
- 강도 slider mock
- 컬러/타입/질감 옵션
- 얼굴 영역 탭
- 현재 스타일 저장하기
- 현재 메이크업 레시피 생성하기

이동:

- 닫기 → `ReferenceMakeupExtractionResult`
- 저장 → `ExtractedMakeupStyleSaveForm`
- 레시피 생성 → `ExtractedMakeupStyleRecipeDetail`

파일:

- 화면: `ExtractedMakeupStyleAdjustScreen.tsx`

주요 변수/타입:

- `MakeupStyleAdjustmentTab`
- `MakeupStyleAttributeGroup`
- `MakeupStyleFaceArea`
- `adjustmentTab`
- `styleGroup`
- `selectedColorId`
- `selectedFaceArea`
- `selectedType`
- `selectedTexture`

주의:

이 화면은 아직 `위치 조정`, `스타일 조정`, `position`, `style` 용어를 사용한다. AR 필터 화면에서 정한 `형태`, `프리셋` 체계와 맞출지 검토가 필요하다.

#### ExtractedMakeupStyleSaveForm

역할:

추출된 메이크업 스타일을 이름, 태그, 공개 설정과 함께 저장하는 폼이다.

화면 내용:

- 선택 사진 썸네일
- 메이크업 스타일 이름 입력
- 태그 목록/추가 버튼
- 공개 설정: 나만 보기/공개하기
- 저장하기 버튼

이동:

- 저장 완료 → `ExtractedMakeupStyleSaveComplete`

파일:

- 화면: `ExtractedMakeupStyleSaveFormScreen.tsx`

주요 변수/타입:

- `makeupStyleName`
- `visibility`
- `defaultTags`
- `onSave`

#### ExtractedMakeupStyleSaveComplete

역할:

메이크업 스타일 저장 완료 화면이다.

화면 내용:

- 저장 완료 아이콘
- 저장된 스타일 이름 안내
- 지금 적용해보기
- 마이페이지로 이동

이동:

- 지금 적용해보기 → `ExtractedMakeupStyleAdjust`
- 마이페이지로 이동 → `ProfileTab`

파일:

- 화면: `ExtractedMakeupStyleSaveCompleteScreen.tsx`

주요 변수/타입:

- `extractedMakeupStyle`
- `onApplyNow`
- `onGoToProfile`

#### ExtractedMakeupStyleRecipeDetail

역할:

추출된 메이크업 스타일을 실제 메이크업 적용 순서로 풀어낸 레시피 상세 화면이다.

화면 내용:

- 전체/눈/입술/볼/베이스 탭
- 아이섀도우/아이라이너/속눈썹/애교살 하위 탭
- 사진 위 guide number
- 레시피 단계 카드
- 레시피 적용 팁
- 현재 메이크업 레시피 저장하기

이동:

- 저장 → `ExtractedMakeupStyleRecipeSaveComplete`

파일:

- 화면: `ExtractedMakeupStyleRecipeDetailScreen.tsx`

주요 변수/타입:

- `MakeupStyleRecipeTab`
- `mainTabs`
- `subTabs`
- `recipeItems`
- `activeTab`
- `activeSubTab`
- `visibleItems`

#### ExtractedMakeupStyleRecipeSaveComplete

역할:

메이크업 레시피 저장 완료 화면이다.

화면 내용:

- 레시피 저장 완료 아이콘
- 저장된 레시피 설명
- 마이페이지로 이동
- 상세 분석 다시 보기

이동:

- 마이페이지로 이동 → `ProfileTab`
- 상세 분석 다시 보기 → `ExtractedMakeupStyleRecipeDetail`

파일:

- 화면: `ExtractedMakeupStyleRecipeSaveCompleteScreen.tsx`

주요 변수/타입:

- `extractedMakeupStyle`
- `onBackToDetail`
- `onGoToProfile`

### 3.8 마이페이지/프로필 플로우

#### ProfileTab / ProfileScreen

역할:

사용자 프로필, 최근 이미지 분석 결과, 저장 메이크업 스타일, 좋아요 제품을 요약해서 보여주는 화면이다.

화면 내용:

- 프로필 요약 카드
- 이미지 분석 결과 요약과 전체 보기
- 메이크업 스타일 3개 preview와 전체 보기
- 좋아요한 제품 목록 3개 preview와 전체 보기

이동:

- 설정 버튼 → `ProfileEdit`
- 이미지 분석 결과 전체 보기 → `ImageAnalysisReportsList`
- 이미지 분석 카드 선택 → `ImageAnalysisReportDetail`
- 메이크업 스타일 전체 보기 → `MakeupStyleList`
- 좋아요한 제품목록 전체 보기 → `LikedProductList`

파일:

- 화면: `ProfileScreen.tsx`
- components: `ProfileSummaryCard.tsx`, `ImageAnalysisSummaryCard.tsx`, `MakeupStyleCard.tsx`, `ProductCard.tsx`
- service: `profileScreenData.ts`, `profileLoadState.ts`
- shared service: `profileService.ts`, `userService.ts`, `makeupService.ts`, `productService.ts`
- type: `shared/types/profile.ts`

주요 변수/타입:

- `ProfileData`
- `UserProfile`
- `MakeupStylePreview`
- `LikedProductPreview`
- `ProfileLoadState`
- `loadProfileScreenData`
- `savedMakeupStyle`
- `makeupStyles`
- `previewMakeupStyles`
- `likedProducts`

#### ProfileEdit

역할:

사용자 프로필 정보를 mock state로 수정하는 화면이다.

화면 내용:

- 프로필 이미지 placeholder
- 이름, 닉네임, 전화번호, 이메일, 생년월일, 성별, 관심사 행
- 필드별 편집 UI
- 생년월일 캘린더
- 관심사 다중 선택
- 로그아웃
- 회원 탈퇴 UI

파일:

- 화면: `ProfileEditScreen.tsx`
- component: `ProfileEditRow.tsx`
- constants: `profileEditOptions.ts`
- service: `shared/services/userService.ts`
- type: `ProfileEditField`, `UserProfile`

주요 변수/타입:

- `EditableProfileFieldId`
- `CalendarCell`
- `editableFieldIds`
- `profile`
- `fields`
- `editingFieldId`
- `draftValue`
- `selectedInterests`
- `calendarMonth`
- `getValidationMessage`
- `getProfileFieldValue`

### 3.9 저장 스타일/좋아요 제품 목록 플로우

#### MakeupStyleList

역할:

마이페이지의 메이크업 스타일 전체 보기 화면이다.

화면 내용:

- 저장된 메이크업 스타일 2열 grid
- 페이지 단위 표시
- 각 카드에는 이미지와 이름 표시

파일:

- 화면: `apps/mobile/src/features/recommendation/screens/MakeupStyleListScreen.tsx`
- service: `shared/services/makeupService.ts`
- mock: `shared/mocks/makeupStyles.mock.ts`
- type: `MakeupStyle`

주요 변수/타입:

- `MakeupStyle`
- `makeupStyles`
- `getMakeupStyles`
- `PagedGrid`

#### LikedProductList

역할:

마이페이지의 좋아요 제품 전체 보기 화면이다.

화면 내용:

- 좋아요한 제품 2열 grid
- 제품 이미지, 브랜드명, 제품명, 가격
- 하트 badge

파일:

- 화면: `apps/mobile/src/features/recommendation/screens/LikedProductListScreen.tsx`
- service: `shared/services/productService.ts`
- mock: `shared/mocks/products.mock.ts`
- type: `Product`

주요 변수/타입:

- `Product`
- `products`
- `getLikedProducts`
- `LIKED_PRODUCT_LIST_FAVORITE_ICON_NAME`

### 3.10 추천 제품 플로우

#### CustomTab / ProductRecommendationScreen

역할:

저장한 메이크업 스타일과 잘 맞는 제품을 추천하는 화면이다.

화면 내용:

- 저장한 메이크업 스타일 요약 카드
- 카테고리 탭: 전체, 립, 블러셔, 아이섀도우, 아이라이너, 베이스
- AI가 추천하는 유사 제품 grid
- 유사도 높은 순 sort button mock
- 추천 조합 카드
- 추천 조합 담기 CTA

파일:

- 화면: `ProductRecommendationScreen.tsx`
- service: `productRecommendationService.ts`
- mock: `productRecommendation.mock.ts`
- type: `features/recommendation/types.ts`

주요 변수/타입:

- `ProductRecommendationData`
- `ProductRecommendationItem`
- `ProductRecommendationStyle`
- `ProductRecommendationSet`
- `ProductRecommendationCategory`
- `activeCategory`
- `products`
- `getProductRecommendations`
- `getRecommendationSetSectionTitle`

## 4. 기능/플로우별 파일명과 변수명 지도

### 4.1 인증

파일명:

- `LoginScreen.tsx`
- `authService.ts`
- `socialLoginProviders.mock.ts`
- `types.ts`

주요 변수명:

- `SocialLoginProvider`
- `AuthSession`
- `loginWithSocialProvider`
- `loadingProvider`
- `feedback`

### 4.2 온보딩/촬영 가이드

파일명:

- `TutorialIntroScreen.tsx`
- `PhotoCaptureGuideScreen.tsx`

주요 변수명:

- `tutorialIntroHeroContent`
- `isPhotoGuideVisible`
- `photoCaptureGuideSteps`
- `currentStepIndex`
- `hasAgreedToPrivacy`

### 4.3 얼굴 진단/이미지 분석

파일명:

- `FaceCaptureScreen.tsx`
- `faceCaptureValidation.ts`
- `ImageAnalysisLoadingScreen.tsx`
- `ImageAnalysisReportsListScreen.tsx`
- `ImageAnalysisReportDetailScreen.tsx`
- `imageAnalysisService.ts`
- `imageAnalysis.mock.ts`
- `imageAnalysis.ts`

주요 변수명:

- `FaceCaptureCheckState`
- `FaceCaptureGuidance`
- `evaluateFaceCaptureGuidance`
- `ImageAnalysisReport`
- `ImageAnalysisFacePointGuide`
- `ImageAnalysisMakeupCard`
- `getImageAnalysisReports`
- `getLatestImageAnalysisReport`
- `getImageAnalysisReportSummaryItems`

### 4.4 AR 필터

파일명:

- `ARFilterScreen.tsx`
- `ARFilterLocationAdjustScreen.tsx`
- `ARFilterStyleAdjustScreen.tsx`
- `filterCustomizationService.ts`
- `filterCustomization.mock.ts`
- `makeupGuideService.ts`
- `makeupGuide.mock.ts`
- `makeupGuide.ts`

주요 변수명:

- `MakeupFilter`
- `ARMakeupGuideData`
- `ARMakeupOptionGroupId`
- `selectedMakeupStyleCardId`
- `selectedMakeupPresetCardId`
- `selectedMakeupOptionGroup`
- `hasUnsavedMakeupChanges`
- `FilterLocationState`
- `FilterStyleState`
- `StyleOptionGroupId`

### 4.5 메이크업 피드백

파일명:

- `MakeupFeedbackEntryScreen.tsx`
- `MakeupFeedbackCaptureScreen.tsx`
- `MakeupFeedbackLoadingScreen.tsx`
- `MakeupFeedbackResultScreen.tsx`
- `MakeupCorrectionGuideOverlayScreen.tsx`
- `MakeupCorrectionTipScreen.tsx`
- `makeupFeedbackService.ts`
- `makeupFeedback.mock.ts`
- `types.ts`

주요 변수명:

- `MakeupFeedbackPhotoSelection`
- `MakeupFeedbackResult`
- `MakeupFeedbackCorrectionPoint`
- `MakeupFeedbackStrength`
- `MakeupFeedbackAnnotation`
- `analyzeMakeupForFeedback`
- `createMockMakeupFeedback`
- `TIP_CONTENT`

### 4.6 레퍼런스 메이크업 추출

파일명:

- `ReferenceMakeupExtractionUploadScreen.tsx`
- `ReferenceMakeupExtractionLoadingScreen.tsx`
- `ReferenceMakeupExtractionResultScreen.tsx`
- `ExtractedMakeupStyleAdjustScreen.tsx`
- `ExtractedMakeupStyleSaveFormScreen.tsx`
- `ExtractedMakeupStyleSaveCompleteScreen.tsx`
- `ExtractedMakeupStyleRecipeDetailScreen.tsx`
- `ExtractedMakeupStyleRecipeSaveCompleteScreen.tsx`
- `makeupExtractionService.ts`
- `referenceMakeupExtraction.mock.ts`
- `types.ts`

주요 변수명:

- `ReferenceMakeupExtractionData`
- `ReferenceMakeupPhoto`
- `ReferenceMakeupSource`
- `MakeupExtractionResult`
- `MakeupStylePalette`
- `MakeupStylePoint`
- `MakeupStyleAdjustmentTab`
- `MakeupStyleAttributeGroup`
- `MakeupStyleFaceArea`
- `MakeupStyleRecipeTab`
- `extractedMakeupStyle`

### 4.7 마이페이지/프로필

파일명:

- `ProfileScreen.tsx`
- `ProfileEditScreen.tsx`
- `ProfileSummaryCard.tsx`
- `ImageAnalysisSummaryCard.tsx`
- `MakeupStyleCard.tsx`
- `ProductCard.tsx`
- `ProfileEditRow.tsx`
- `profileScreenData.ts`
- `profileLoadState.ts`
- `profileService.ts`
- `userService.ts`
- `profile.ts`

주요 변수명:

- `UserProfile`
- `ProfileData`
- `ProfileEditField`
- `MakeupStyle`
- `MakeupStylePreview`
- `Product`
- `LikedProductPreview`
- `savedMakeupStyle`
- `loadProfileScreenData`

### 4.8 추천 제품

파일명:

- `ProductRecommendationScreen.tsx`
- `productRecommendationService.ts`
- `productRecommendation.mock.ts`
- `features/recommendation/types.ts`

주요 변수명:

- `ProductRecommendationData`
- `ProductRecommendationItem`
- `ProductRecommendationStyle`
- `ProductRecommendationSet`
- `ProductRecommendationCategory`
- `activeCategory`
- `productRecommendationMock`

## 5. 비슷하지만 다른 개념과 네이밍 충돌 후보

### 5.1 `스타일`이 여러 의미로 쓰임

현재 `스타일`은 아래 의미로 쓰인다.

1. 저장 가능한 메이크업 스타일: `MakeupStyle`, `MakeupStylePreview`, `makeupStylesMock`
2. 레퍼런스 사진에서 추출된 스타일: `ExtractedMakeupStyle*`, `extractedMakeupStyle`, `MakeupExtractionResult`
3. 추천 제품 기준 스타일: `ProductRecommendationStyle`
4. AR 필터 전체 얼굴 조합: `makeupStyle`, `selectedMakeupStyleCardId`
5. React Native `style` prop 및 `StyleSheet`의 `styles`

정리 제안:

- 사용자 저장 단위는 계속 `MakeupStyle` 유지
- AR 필터 전체 조합은 코드에서 `ARMakeupStyle` 또는 `ARMakeupFullStyle`처럼 한 단계 더 좁히는 방안 검토
- 부위별 조합은 `Preset/프리셋`으로 분리 유지
- React Native `style/styles`는 플랫폼 용어이므로 변경하지 않음

### 5.2 AR 필터의 `프리셋`과 기존 `MakeupFilter`

AR 필터 화면에서는 부위별 조합을 `프리셋`으로 부르기로 했지만, 기존 데이터 타입은 `MakeupFilter`다.

현재 상태:

- `MakeupFilter`: AR 필터 카드 데이터
- `selectedMakeupPresetCardId`: 부위별 프리셋 선택값
- 화면 문구: `프리셋`

정리 제안:

- `MakeupFilter`는 실제 AR 효과 단위로 유지할 수 있다.
- 카드 선택 UI에서는 `MakeupPreset` 타입을 별도 도입할지 검토한다.
- 전체 스타일과 부위별 프리셋이 같은 `filters` 배열을 공유하는 현재 구조는 추후 API 설계 때 분리 가능성이 높다.

### 5.3 `위치`, `Location`, `Position`, `형태` 혼재

AR 필터 적용 화면에서는 `위치` 대신 `형태`로 최종 결정했다.

현재 남아 있는 이름:

- `ARFilterLocationAdjust`
- `ARFilterLocationAdjustScreen`
- `FilterLocationState`
- `FilterLocationAdjustment`
- `mockFilterLocationState`
- `MakeupStyleAdjustmentTab = 'position' | 'style'`
- `ExtractedMakeupStyleAdjustScreen`의 `위치 조정` 문구
- 레퍼런스 추출 문구의 `색감, 위치, 질감`

정리 제안:

- AR 필터 쪽은 파일/route/type을 추후 `Shape` 기반으로 rename 검토
  - `ARFilterLocationAdjust` → `ARFilterShapeAdjust`
  - `FilterLocationState` → `FilterShapeState`
  - `FilterLocationAdjustment` → `FilterShapeAdjustment`
- 레퍼런스 추출 쪽의 `위치`가 실제 형태 개념이면 `형태`로 통일
- 단순 좌표 이동만 뜻하는 곳은 `좌우 이동`, `상하 이동`처럼 조작 단위로 표현

### 5.4 `StyleAdjust` 화면과 `프리셋 수정` 문구 불일치

`ARFilterStyleAdjustScreen`은 사용자 문구를 `프리셋 수정`으로 바꿨지만 파일명과 route는 여전히 `StyleAdjust`다.

현재 상태:

- route: `ARFilterStyleAdjust`
- file: `ARFilterStyleAdjustScreen.tsx`
- visible title: `프리셋 수정`
- state: `FilterStyleState`

정리 제안:

- 이 화면을 계속 유지한다면 `ARFilterPresetAdjustScreen`으로 rename 검토
- 다만 현재 AR 필터 적용 화면 안에서 프리셋/컬러/타입/질감/형태 카드를 직접 고르는 구조가 생겼으므로, 이 별도 화면이 계속 필요한지 먼저 검토 필요

### 5.5 얼굴 진단 `ImageAnalysis`와 메이크업 피드백 `MakeupFeedback`

둘 다 AI 분석처럼 보이지만 목적이 다르다.

- `ImageAnalysis`: 사용자의 얼굴/톤/피부/무드 분석. 추천 메이크업과 AR 필터 생성의 근거.
- `MakeupFeedback`: 이미 한 메이크업 사진의 완성도 평가와 수정 제안.

충돌 가능 지점:

- 둘 다 `Loading`, `Result`, `Guide`, `Tip` 구조를 가진다.
- 결과 화면 모두 분석/가이드 문구를 사용한다.

정리 제안:

- 얼굴 자체 분석은 `ImageAnalysis` 또는 `FaceAnalysis`
- 현재 메이크업 평가/수정은 `MakeupFeedback`과 `MakeupCorrection`
- 문구에서도 `얼굴 진단 결과`와 `메이크업 피드백 결과`를 구분

### 5.6 레퍼런스 메이크업 추출과 얼굴 진단의 `분석 결과`

`분석 결과`라는 route title은 여러 플로우에서 쓰일 수 있다.

현재 상태:

- `ImageAnalysisReportDetail`: 맞춤 분석 보고서
- `ReferenceMakeupExtractionResult`: 분석 결과
- `ExtractedMakeupStyleRecipeDetail`: 상세 분석

정리 제안:

- 레퍼런스 추출 결과는 `메이크업 추출 결과`
- 얼굴 진단 보고서는 `얼굴 분석 보고서` 또는 `맞춤 분석 보고서`
- 레시피 상세는 `메이크업 레시피 상세` 또는 `추출 상세 분석`

### 5.7 `Guide` 용어가 여러 기능에 걸쳐 쓰임

현재 `Guide`는 다음 의미로 쓰인다.

- `PhotoCaptureGuideScreen`: 촬영 전 안내
- `ARMakeupGuideData`: AR 필터 적용 guide/mock 데이터
- `MakeupCorrectionGuideOverlayScreen`: 피드백 수정 가이드
- `ImageAnalysisFacePointGuide`: 분석 보고서의 부위별 메이크업 가이드

정리 제안:

- 촬영 전 안내: `CaptureGuide`
- AR 필터 데이터: `ARMakeupGuide`
- 피드백 수정: `CorrectionGuide`
- 분석 보고서 부위별 추천: `FacePointGuide`

### 5.8 `Product`와 `ProductRecommendationItem`

마이페이지 좋아요 제품과 추천 제품은 둘 다 제품이지만 데이터 의미가 다르다.

- `Product`: 좋아요/프로필에서 쓰는 기본 제품 preview
- `ProductRecommendationItem`: 추천 플로우에서 matchRate, shadeName, palette, reason을 포함한 추천 제품

정리 제안:

- 공통 제품 기본값을 만들려면 `ProductBase` 검토
- 추천 전용 확장 타입은 `RecommendedProduct` 또는 현재 `ProductRecommendationItem` 유지

### 5.9 `source` 필드가 서로 다른 의미로 쓰임

현재 `source`는 아래 타입에서 쓰인다.

- `MakeupFeedbackPhotoSelection.source`: `camera` 또는 `gallery`
- `ReferenceMakeupPhoto.source`: `album` 또는 `camera`

정리 제안:

- 피드백 사진은 `MakeupFeedbackPhotoSource`
- 레퍼런스 사진은 `ReferenceMakeupSource`
- 문서와 API에서 `gallery`와 `album` 중 하나로 통일할지 검토

### 5.10 `getUserProfile` 서비스 중복

현재 같은 함수명이 두 곳에 있다.

- `shared/services/userService.ts`의 `getUserProfile`
- `shared/services/profileService.ts`의 `getUserProfile`

`profileService.ts`는 내부에서 `userService`의 함수를 re-export처럼 감싸고 있다.

정리 제안:

- 사용자 단일 정보 조회는 `userService.getUserProfile`로 고정
- 프로필 화면 집계 데이터는 `profileService.getProfileData` 또는 `profileScreenData.loadProfileScreenData`로 구분
- 같은 이름 wrapper는 제거하거나 `getProfileUser`처럼 명확히 변경 검토

### 5.11 `Look` asset 파일명과 `Style` 도메인 용어

도메인 용어는 `룩` 대신 `스타일`로 정리했지만 asset 파일명에는 `look-*.png`가 남아 있다.

예:

- `look-ojigirl.png`
- `look-morigirl.png`
- `look-clean-smoky.png`
- `look-mute-rosy-daily.png`

정리 기준:

- 현재 가이드에 따라 기존 asset 파일명은 import 영향이 크므로 바로 변경하지 않는다.
- 새 도메인 코드/타입/문구에서는 `Style/스타일`을 사용한다.
- asset rename은 별도 정리 작업으로 분리한다.

### 5.12 AR 필터 저장이 `ExtractedMakeupStyleSaveForm`으로 이동함

현재 `ARFilterScreen`의 저장 버튼은 `ExtractedMakeupStyleSaveForm`으로 이동한다.

충돌 가능성:

- AR 필터에서 직접 만든 조합 저장
- 레퍼런스 추출 스타일 저장

두 플로우 모두 저장 화면을 공유할 수 있지만, 데이터 출처와 필드가 다르다.

정리 제안:

- 공통 저장 화면으로 유지하려면 `MakeupStyleSaveForm` 같은 중립 이름 검토
- 플로우별로 다르면 `ARMakeupFilterSaveForm`과 `ExtractedMakeupStyleSaveForm` 분리 검토

### 5.13 `FacePartId`, `MakeupStyleFaceArea`, `GuideCategory` 부위 타입 분산

유사한 부위 개념이 여러 타입으로 나뉘어 있다.

- `FacePartId = 'all' | 'base' | 'eye' | 'lip' | 'contour'`
- `MakeupStyleFaceArea = 'all' | 'base' | 'eye' | 'lip' | 'contour'`
- `MakeupStyleRecipeTab = 'all' | 'eye' | 'lip' | 'cheek' | 'base'`
- `GuideCategory = 'all' | 'eye' | 'brow' | 'lip' | 'cheek' | 'base'`
- `ProductRecommendationCategory = 'all' | 'lip' | 'cheek' | 'shadow' | 'liner' | 'base'`

정리 제안:

- 공통 얼굴 부위는 `MakeupFaceArea` 같은 shared 타입으로 승격 검토
- 제품 카테고리는 얼굴 부위가 아니라 제품 분류이므로 별도 유지
- `contour`, `cheek`, `brow`, `shadow`, `liner`처럼 범주 수준이 다른 값은 문서화 필요

## 6. 우선 정리 권장 순서

1. AR 필터 관련 `Location/Position` 이름을 `Shape/형태` 기준으로 정리할지 결정한다.
2. `ARFilterStyleAdjust` 화면을 유지할지, 적용 화면 내부 옵션 카드 체계로 흡수할지 결정한다.
3. 레퍼런스 추출 플로우의 `위치 조정`, `스타일 조정` 문구를 새 용어 체계에 맞출지 결정한다.
4. 저장 화면을 공통 `MakeupStyleSaveForm`으로 추상화할지, 플로우별 저장 화면으로 분리할지 결정한다.
5. `ImageAnalysis`, `MakeupFeedback`, `ReferenceMakeupExtraction`의 `분석 결과` 문구를 더 구체적으로 분리한다.
6. `getUserProfile` 서비스 중복 wrapper를 정리한다.
7. 얼굴 부위/제품 카테고리 타입을 공통화할 범위와 분리 유지할 범위를 정한다.
