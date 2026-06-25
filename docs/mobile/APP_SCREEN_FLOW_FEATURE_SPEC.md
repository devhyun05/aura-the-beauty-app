# 앱 전체 화면/플로우 기능 상세 기획서

작성일: 2026-06-26

이 문서는 `apps/mobile` 현재 코드 기준으로 앱의 모든 주요 화면을 기능/플로우별로 분류하고, 화면별 역할, 이동 흐름, 관련 파일, 주요 변수/타입/서비스 이름을 정리한 문서다. 또한 앱 전체 용어 사전과 비슷하지만 다른 개념이 같은 용어, 파일명, 변수명으로 섞여 있는 지점을 별도로 정리한다.

현재 모바일 앱은 실제 백엔드, Unity AR, ARKit/ARCore, AI 모델을 붙인 상태가 아니라 프론트엔드 UI와 mock 데이터 중심으로 구현되어 있다.

네이밍 최종 결정과 실제 rename 작업 순서는 다음 문서를 기준으로 한다.

- `docs/mobile/NAMING_DECISIONS.md`
- `docs/mobile/NAMING_REFACTOR_WORK_PLAN.md`

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
- `savedMakeupStyle` 현재 코드명, 권장 이름 `savedMakeupLook`
- `makeupFeedbackResult`

### 1.2 Root Stack 화면 목록

현재 root stack route는 다음과 같다.

| Route | 화면 파일 | 기능 분류 | Chrome |
| --- | --- | --- | --- |
| `Login` | `LoginScreen.tsx` | 인증 진입 | fullscreen |
| `Tutorial` | `TutorialIntroScreen.tsx`, `PhotoCaptureGuideScreen.tsx` | 온보딩/얼굴 촬영 튜토리얼 | fullscreen |
| `MainTabs` | `MainTabNavigator.tsx` | 탭 호스트 | fullscreen |
| `FaceCapture` | `FaceCaptureScreen.tsx` | 얼굴 진단 촬영 | fullscreen |
| `ImageAnalysisLoading` | `ImageAnalysisLoadingScreen.tsx` | 얼굴 분석 진행, 권장 이름 `FaceAnalysisLoading` | detail |
| `ImageAnalysisReportsList` | `ImageAnalysisReportsListScreen.tsx` | 얼굴 분석 보고서 목록, 권장 이름 `FaceAnalysisReportsList` | detail |
| `ImageAnalysisReportDetail` | `ImageAnalysisReportDetailScreen.tsx` | 얼굴 분석 보고서 상세, 권장 이름 `FaceAnalysisReportDetail` | detail |
| `ProfileEdit` | `ProfileEditScreen.tsx` | 프로필 수정 | detail |
| `MakeupStyleList` | `MakeupStyleListScreen.tsx` | 저장 메이크업 룩 목록, 권장 이름 `MakeupLookList` | detail |
| `LikedProductList` | `LikedProductListScreen.tsx` | 좋아요 제품 목록 | detail |
| `ARFilter` | `ARFilterScreen.tsx` | AR 필터 적용 | fullscreen |
| `ARFilterLocationAdjust` | `ARFilterLocationAdjustScreen.tsx` | AR 필터 형태 수정, 권장 이름 `ARFilterShapeAdjust` | fullscreen |
| `ARFilterStyleAdjust` | `ARFilterStyleAdjustScreen.tsx` | 메이크업 필터 편집, 권장 이름 `MakeupFilterEdit` | fullscreen |
| `MakeupFeedbackEntry` | `MakeupFeedbackEntryScreen.tsx` | 메이크업 피드백 시작 | detail |
| `MakeupFeedbackCapture` | `MakeupFeedbackCaptureScreen.tsx` | 피드백 사진 촬영/선택 | fullscreen |
| `MakeupFeedbackLoading` | `MakeupFeedbackLoadingScreen.tsx` | 피드백 분석 진행 | detail |
| `MakeupFeedbackResult` | `MakeupFeedbackResultScreen.tsx` | 피드백 결과 | detail |
| `MakeupCorrectionGuide` | `MakeupCorrectionGuideOverlayScreen.tsx` | 메이크업 수정 가이드/가이드라인 오버레이 | detail |
| `MakeupCorrectionTip` | `MakeupCorrectionTipScreen.tsx` | 수정팁 상세 | detail |
| `ReferenceMakeupExtractionUpload` | `ReferenceMakeupExtractionUploadScreen.tsx` | 레퍼런스 메이크업 사진 선택 | detail |
| `ReferenceMakeupExtractionLoading` | `ReferenceMakeupExtractionLoadingScreen.tsx` | 메이크업 추출 진행 | fullscreen |
| `ReferenceMakeupExtractionResult` | `ReferenceMakeupExtractionResultScreen.tsx` | 레퍼런스 메이크업 추출 결과 | detail |
| `ExtractedMakeupStyleAdjust` | `ExtractedMakeupStyleAdjustScreen.tsx` | 추출 룩 편집, 권장 이름 `ExtractedMakeupLookEdit` | fullscreen |
| `ExtractedMakeupStyleSaveForm` | `ExtractedMakeupStyleSaveFormScreen.tsx` | 메이크업 필터 저장 폼, 권장 이름 `MakeupFilterSave` | detail |
| `ExtractedMakeupStyleSaveComplete` | `ExtractedMakeupStyleSaveCompleteScreen.tsx` | 메이크업 필터 저장 완료 | fullscreen |
| `ExtractedMakeupStyleRecipeDetail` | `ExtractedMakeupStyleRecipeDetailScreen.tsx` | 메이크업 레시피 상세 | detail |
| `ExtractedMakeupStyleRecipeSaveComplete` | `ExtractedMakeupStyleRecipeSaveCompleteScreen.tsx` | 메이크업 레시피 저장 완료 | fullscreen |

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

`메이크업 필터`

AR 카메라 위에 적용하고 저장할 수 있는 메이크업 효과 단위다. 필터는 얼굴 전체에 적용될 수도 있고, 눈, 립, 칙, 베이스, 윤곽처럼 한 부위에만 적용될 수도 있다. 코드에서는 현재 `ARFilter`, `MakeupFilter`, `ARMakeupGuideData`, `mockARMakeupGuideData`가 핵심이다.

`룩`

사용자가 카드, 저장 목록, 추천 기준에서 인식하는 메이크업 필터의 이름 단위다. 기존 문서와 화면에서 `스타일`이라고 부르던 사용자-facing 개념은 모두 `룩`으로 바꾼다.

`토탈메이크업`

얼굴 전체 메이크업을 다루는 영역이다. 여러 포인트메이크업 값 또는 포인트메이크업룩을 조합해 하나의 전체 얼굴 적용 상태를 만든다.

`토탈메이크업룩`

얼굴 전체에 적용되는 하나의 메이크업 필터다. 저장, 추천, 레퍼런스 추출 결과, AR 적용 화면에서 전체 얼굴 단위로 다루는 룩은 토탈메이크업룩으로 정의한다.

`포인트메이크업`

눈, 립, 칙, 베이스, 윤곽처럼 특정 부위에 적용되는 메이크업 영역이다. 포인트메이크업도 독립 필터로 저장할 수 있다.

`포인트메이크업룩`

특정 부위에만 적용되는 하나의 메이크업 필터다. 립 룩, 아이 룩, 칙 룩처럼 부위별로 저장하고 재사용할 수 있으며, 여러 포인트메이크업룩을 조합해 토탈메이크업룩을 만들 수 있다.

`프리셋`

필터가 가진 설정값 묶음이다. 하나의 메이크업 필터는 그 자체로 프리셋이거나 프리셋값을 가진 데이터로 볼 수 있다. 다만 사용자-facing 카드와 저장 목록의 주 용어는 `프리셋`보다 `룩`을 우선 사용한다.

`스타일`

기존 화면, 파일명, 타입명에서 저장 가능한 메이크업 단위를 부르던 레거시 용어다. 사용자-facing 용어로는 더 이상 사용하지 않고 `룩`으로 대체한다. React Native `style` prop과 `StyleSheet`의 `styles` 객체는 플랫폼 용어이므로 이 정리 대상이 아니다.

`컬러`

메이크업의 색상 옵션이다. AR 필터, 레퍼런스 추출, 제품 추천 모두에서 사용한다.

`타입`

메이크업 표현 방식 또는 제품/적용 카테고리를 뜻한다. AR 필터 옵션에서는 `typeOptions`, 레퍼런스 룩 조정에서는 현재 코드상 `MakeupStyleAttributeGroup = 'type'`로 사용한다.

`질감`

메이크업 표면감이다. 예: 매트, 글로우, 새틴, 쉬머.

`형태`

AR 필터에서 메이크업 레이어가 얼굴 기준점에 붙는 모양, 적용 범위, 변형 패턴이다. 단순 좌표 이동보다 넓은 개념이므로 `위치` 대신 사용하는 최종 용어다. 사용자가 손가락으로 옮기는 형태 조정점은 `shapePoint`, 점의 기준/현재 좌표는 `position`, 기준점 대비 이동량은 `offset`으로 구분한다.

`메이크업 부위`

메이크업 적용, 저장, 편집 범위의 기준 타입이다. 코드에서는 `MakeupArea`를 기준 타입으로 사용한다. 특정 동작의 적용 대상일 때만 변수명에서 `targetMakeupArea`처럼 `target`을 붙인다.

`원본`

AR 필터 옵션 카드의 첫 번째 항목이다. 해당 부위의 필터 적용을 끄거나 형태를 기본 랜드마크 상태로 되돌린다.

`얼굴 진단`

사용자 얼굴 촬영 후 AI가 퍼스널 컬러, 얼굴형, 피부 타입, 추천 무드, 포인트 가이드를 분석하는 플로우다. 코드 최종 용어는 `FaceAnalysis` 계열이다. 현재 route는 `FaceCapture` → `ImageAnalysisLoading` → `ImageAnalysisReportDetail`로 이어지지만, 추후 `FaceAnalysisLoading`, `FaceAnalysisReportDetail` 계열 rename 대상이다.

`얼굴 분석 결과`

얼굴 진단 실행 후 앱이 들고 있는 구조화 결과 데이터다. 코드명은 `FaceAnalysisResult`를 사용한다.

`얼굴 분석 보고서`

사용자가 읽는 설명형 문서, 요약, 진단서 형태의 산출물이다. 코드명은 `FaceAnalysisReport`를 사용한다.

`이미지 분석`

현재 얼굴 진단이나 메이크업 피드백의 이름으로 사용하지 않는다. 향후 얼굴, 메이크업, 헤어, 의상, 분위기처럼 사진 전체 또는 전체 인상을 함께 분석하는 상위 기능이 생기면 `ImageAnalysis`를 상위 도메인명으로 사용할 수 있다.

`메이크업 피드백`

사용자가 현재 한 메이크업 사진을 촬영/선택하면 AI가 점수, 수정 포인트, 잘한 포인트를 알려주는 플로우다. 저장된 룩을 만드는 플로우가 아니라 현재 메이크업을 평가하고 수정하는 플로우다.

`수정 포인트`

메이크업 피드백 결과에서 개선이 필요한 부위/항목이다. 코드에서는 `MakeupFeedbackCorrectionPoint`를 사용한다.

`수정팁`

수정 포인트 하나에 대한 상세 루틴이다. 코드에서는 `MakeupCorrectionTipScreen`이 담당한다.

`가이드 오버레이`

메이크업 피드백 결과를 사진 위 랜드마크/라인으로 보여주는 수정 가이드 화면이다. 코드에서는 `MakeupCorrectionGuideOverlayScreen`이 담당한다.

`레퍼런스 메이크업 추출`

참고할 메이크업 사진에서 색감, 포인트, 룩을 추출하는 플로우다. 코드에서는 `ReferenceMakeupExtraction*`를 사용한다.

`레퍼런스 메이크업 추출 결과`

레퍼런스 사진에서 추출된 구조화 결과 데이터다. 코드명은 `ReferenceMakeupExtractionResult`를 사용한다.

`레퍼런스 메이크업 추출 보고서`

사용자가 읽는 설명형 보고서 형태의 산출물이다. 코드명은 `ReferenceMakeupExtractionReport`를 사용한다.

`추출된 메이크업 룩`

레퍼런스 사진에서 분석되어 저장 또는 조정 가능한 형태로 변환된 메이크업 룩이다. 현재 코드에서는 `MakeupExtractionResult`, `extractedMakeupStyle`, `ExtractedMakeupStyle*`처럼 `Style` 이름이 남아 있다.

`메이크업 레시피`

추출된 메이크업 룩을 실제 적용 순서와 부위별 단계로 풀어낸 구성/절차/조합이다. 코드 최종 용어는 `MakeupRecipe` 계열이다. 현재 코드에서는 `ExtractedMakeupStyleRecipeDetailScreen`과 `MakeupStyleRecipeTab`을 사용하지만, 추후 `ExtractedMakeupLookRecipeDetailScreen`, `MakeupRecipeTab` 계열 rename 대상이다.

`추천 제품`

저장한 메이크업 룩과 어울리는 제품 추천이다. 실제 제품 엔티티는 `Product`, 추천 결과 항목은 `RecommendedProduct`, 추천 행위/플로우/서비스는 `ProductRecommendation` 계열로 구분한다.

`좋아요 제품`

사용자가 좋아요한 제품 목록이다. 마이페이지 요약과 전체 목록에서 사용한다. 코드에서는 `Product`, `LikedProductPreview`, `getLikedProducts`를 사용한다.

`튜토리얼`

사용자가 기능을 따라 하며 익히는 사용법 안내다. 온보딩 안내는 `OnboardingTutorial`, 얼굴 사진 촬영법 안내는 `FaceCaptureTutorial` 계열로 정리한다.

`가이드`

AR 반반가이드처럼 화면 위에 겹쳐지는 기준 UI에 사용한다. 사용법 안내에는 `Tutorial`, 메이크업 구성/절차에는 `Recipe`, 적용 기준선/규칙에는 `Guideline`을 우선 사용한다.

`가이드라인`

메이크업 적용 기준선, 규칙, 판단 기준을 뜻한다. 코드에서는 `MakeupGuideline`, `MakeupApplicationGuideline` 계열을 사용한다.

`사용자 프로필`

닉네임, 이메일, 프로필 사진 등 계정/회원 기본 정보다. 코드명은 `UserProfile`을 사용한다.

`마이페이지 프로필 요약`

마이페이지 화면에 보여주기 위해 가공한 요약 데이터다. 코드명은 `MyPageProfileSummary`를 사용한다.

`뷰티 프로필`

얼굴형, 피부톤, 퍼스널 컬러, 민감도처럼 얼굴 분석과 메이크업 추천에 계속 활용되는 사용자 특성 데이터다. 코드명은 `BeautyProfile`을 사용한다.

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
- `HomeMakeupStyle` 현재 코드명, 권장 이름 `HomeMakeupLook`
- `quickActions`
- `HomeQuickActionId`
- `getHomeQuickActionPressHandler`
- `homeData`
- `active hero carousel offset` 관련 `getHeroCarousel*` 헬퍼

### 3.4 얼굴 진단/이미지 분석 플로우

최신 네이밍 기준:

- 얼굴 자체 분석 기능은 `FaceAnalysis` 계열로 정리한다.
- 현재 코드의 `ImageAnalysis*` route, 파일, 타입은 얼굴 분석 관련 레거시 이름이다.
- 향후 `ImageAnalysis`는 사진 전체 또는 전체 인상 분석 상위 도메인명으로만 사용한다.
- 얼굴 분석 결과 데이터는 `FaceAnalysisResult`, 사용자가 읽는 보고서는 `FaceAnalysisReport`로 구분한다.

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

- 촬영 시 현재 route 기준 `ImageAnalysisLoading`으로 이동한다.
- 최종 네이밍 기준에서는 `FaceAnalysisLoading` 계열로 rename한다.

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

#### ImageAnalysisLoading / 권장 이름 FaceAnalysisLoading

역할:

촬영 이미지를 바탕으로 얼굴 분석을 진행하는 화면이다. 현재 route/file 이름은 `ImageAnalysis` 계열이지만, 최종 도메인 이름은 `FaceAnalysis`다.

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

#### ImageAnalysisReportsList / 권장 이름 FaceAnalysisReportsList

역할:

사용자의 과거 얼굴 분석 보고서 목록이다. 현재 `ImageAnalysisReportsList`는 레거시 route 이름이며, 최종 이름은 `FaceAnalysisReportsList` 계열이다.

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

#### ImageAnalysisReportDetail / 권장 이름 FaceAnalysisReportDetail

역할:

얼굴 분석 결과 상세 보고서다. 구조화 데이터는 `FaceAnalysisResult`, 사용자가 읽는 보고서형 산출물은 `FaceAnalysisReport`로 구분한다.

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

- `AR 필터 만들기` 선택 시 현재 코드에서는 `ARFilterStyleAdjust`로 이동한다.
- 최종 네이밍 기준에서는 `MakeupFilterEditScreen`으로 이동한다.
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

최신 네이밍 기준:

- 현재 AR에 적용될 필터 조합을 편집하는 화면은 `MakeupFilterEditScreen`이다.
- 현재 조합된 필터를 저장하는 화면은 `MakeupFilterSaveScreen`이다.
- 형태 선택/저장 옵션은 `Shape`, 사용자가 옮기는 조정점은 `shapePoint`다.
- 메이크업 적용/저장/편집 범위 기준 타입은 `MakeupArea`다.

#### ARFilter

역할:

라이브 카메라 위에 메이크업 필터를 적용하고, 토탈메이크업룩 또는 포인트메이크업룩/옵션을 선택해 저장 가능한 필터 상태를 만드는 화면이다.

메이크업 필터는 얼굴 전체 단위와 부위 단위 모두 저장할 수 있다. 전체 얼굴 상태를 저장하면 토탈메이크업룩이 되고, 립/아이/칙 등 특정 부위 상태를 저장하면 포인트메이크업룩이 된다. 여러 포인트메이크업룩은 하나의 토탈메이크업룩을 구성하는 재료로 사용할 수 있다.

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

- 전체: `룩`, `형태`
- 개별 부위: `룩`, `컬러`, `타입`, `질감`, `형태`

이동:

- 뒤로가기 → `HomeTab`
- 형태 수정 → 현재 route 기준 `ARFilterLocationAdjust`, 권장 이름 `ARFilterShapeAdjust`
- 필터 편집 → 현재 route 기준 `ARFilterStyleAdjust`, 권장 이름 `MakeupFilterEdit`
- 저장 → 현재 코드상 `ExtractedMakeupStyleSaveForm`, 권장 이름 `MakeupFilterSaveScreen`
- 촬영 완료 → `HomeTab`

파일:

- 화면: `apps/mobile/src/features/ar/screens/ARFilterScreen.tsx`
- service: `shared/services/makeupGuideService.ts`
- mock: `shared/mocks/makeupGuide.mock.ts`
- type: `shared/types/makeupGuide.ts`

주요 변수/타입:

- `ARMakeupOptionGroupId`
- `selectedMakeupStyleCardId` 현재 코드명, 권장 이름 `selectedTotalMakeupLookId`
- `selectedMakeupPresetCardId` 현재 코드명, 권장 이름 `selectedPointMakeupLookId`
- `selectedMakeupOptionGroup`
- `selectedFacePartId` 현재 코드명, 권장 이름 `selectedMakeupArea`
- `selectedColorId`
- `selectedTypeId`
- `selectedTextureId`
- `selectedShapeId`
- `hasUnsavedMakeupChanges`
- `getARFilterOptionGroupLabels`
- `getARFilterMakeupStyleCardIdAfterOptionEdit` 현재 코드명, 권장 이름 `getARFilterMakeupLookIdAfterOptionEdit`
- `isARFilterSaveEnabled`

#### ARFilterLocationAdjust / 권장 이름 ARFilterShapeAdjust

역할:

AR 필터의 형태를 얼굴 기준점 기반으로 세밀하게 조정하는 화면이다. 화면 문구는 `형태 수정`을 사용하지만 파일명과 타입은 아직 `Location`을 사용한다. 사용자가 직접 옮기는 조정점은 `shapePoint`로 부르고, 원본 얼굴 인식 기준점에만 `landmark` 계열 이름을 사용한다.

화면 내용:

- 라이브 카메라 프리뷰
- 메이크업 레이어 오버레이
- 형태 조정점 표시/숨김
- 되돌리기
- 부위 선택
- 손가락으로 `shapePoint` 이동
- `position`, `offset`, 크기, 각도 값 조정
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
- `FilterLandmarkPoint` 현재 코드명, 권장 이름 `ShapePoint`
- `mockFilterLocationState`
- `locationState`
- `updateFilterLocationAdjustment`
- `LOCATION_ADJUST_TITLE`

#### ARFilterStyleAdjust / 권장 이름 MakeupFilterEdit

역할:

현재 코드상 AR 필터의 컬러/타입/질감 옵션을 조정하는 별도 화면이다. 최신 용어 기준으로는 현재 AR에 적용될 메이크업 필터 구성을 편집하는 `MakeupFilterEditScreen`이며, 파일명과 타입에는 아직 `Style`이 남아 있다.

화면 내용:

- 라이브 카메라 프리뷰
- 부위 선택
- 옵션 그룹: 룩, 컬러, 타입, 질감, 형태
- 컬러 스와치 또는 텍스트 칩
- 현재 필터 저장 화면으로 이동

파일:

- 화면: `ARFilterStyleAdjustScreen.tsx`
- service: `filterCustomizationService.ts`
- mock: `filterCustomization.mock.ts`

주요 변수/타입:

- `FilterStyleState` 현재 코드명, 권장 이름 `MakeupFilterEditState`
- `StyleOptionGroupId` 현재 코드명, 권장 이름 `MakeupFilterEditOptionGroupId`
- `STYLE_GROUPS`
- `styleState` 현재 코드명, 권장 이름 `makeupFilterEditState`
- `selectedColor`
- `getFilterStyleState`
- `updateFilterStyleSelection` 현재 코드명, 권장 이름 `updateMakeupFilterEditSelection`

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

피드백 결과 사진 위에 부위별 수정 기준선과 가이드를 오버레이로 보여준다. `Guide`는 화면 위 기준 UI 의미로 유지할 수 있고, 적용 규칙/기준선 성격이 강한 데이터는 추후 `MakeupGuideline` 계열로 분리한다.

화면 내용:

- 사진 위 SVG 가이드 라인
- 전체/눈/눈썹/입술/블러셔/베이스 탭
- 부위별 상세 가이드 카드

파일:

- 화면: `MakeupCorrectionGuideOverlayScreen.tsx`

주요 변수/타입:

- `GuideCategory` 현재 코드명, 권장 이름 `MakeupGuidelineCategory`
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

레퍼런스 사진에서 추출된 메이크업 룩의 요약 결과를 보여준다. 구조화 결과 데이터는 `ReferenceMakeupExtractionResult`, 보고서형 산출물은 `ReferenceMakeupExtractionReport`로 구분한다.

화면 내용:

- 원본 source image
- 추출된 메이크업 룩 제목/설명/tags
- 추출된 컬러 밸런스
- 분석 정확도
- 반영 포인트
- 다시 선택
- 룩 조정해보기

이동:

- 다시 선택 → `ReferenceMakeupExtractionUpload`
- 룩 조정해보기 → 현재 route 기준 `ExtractedMakeupStyleAdjust`, 권장 이름 `ExtractedMakeupLookEdit`

파일:

- 화면: `ReferenceMakeupExtractionResultScreen.tsx`
- type: `MakeupExtractionResult`, `MakeupStylePalette` 현재 코드명, 권장 이름 `MakeupLookPalette`, `MakeupStylePoint` 현재 코드명, 권장 이름 `MakeupLookPoint`

주요 변수/타입:

- `extractedMakeupStyle` 현재 코드명, 권장 이름 `extractedMakeupLook`
- `palette`
- `points`
- `accuracy`

#### ExtractedMakeupStyleAdjust / 권장 이름 ExtractedMakeupLookEdit

역할:

추출된 메이크업 룩을 AR처럼 미리 적용해 보고 컬러/타입/질감/형태를 조정하거나 저장/레시피 생성으로 이어지는 화면이다. 현재 코드명은 `ExtractedMakeupStyleAdjust`지만, 최종 용어 기준에서는 `ExtractedMakeupLookEdit` 계열로 rename한다.

화면 내용:

- 닫기 버튼
- `위치 조정`, `스타일 조정` 상단 탭 현재 문구, 권장 문구 `형태 조정`, `룩 조정`
- 사진 프리뷰와 메이크업 overlay
- 강도 slider mock
- 컬러/타입/질감 옵션
- 얼굴 영역 탭
- 현재 룩 저장하기
- 현재 메이크업 레시피 생성하기

이동:

- 닫기 → `ReferenceMakeupExtractionResult`
- 저장 → 현재 route 기준 `ExtractedMakeupStyleSaveForm`, 권장 이름 `MakeupFilterSaveScreen`
- 레시피 생성 → `ExtractedMakeupStyleRecipeDetail`

파일:

- 화면: `ExtractedMakeupStyleAdjustScreen.tsx`

주요 변수/타입:

- `MakeupStyleAdjustmentTab` 현재 코드명, 권장 이름 `MakeupLookEditTab`
- `MakeupStyleAttributeGroup` 현재 코드명, 권장 이름 `MakeupLookAttributeGroup`
- `MakeupStyleFaceArea` 현재 코드명, 권장 이름 `MakeupArea`
- `adjustmentTab`
- `styleGroup` 현재 코드명, 권장 이름 `lookGroup`
- `selectedColorId`
- `selectedFaceArea`
- `selectedType`
- `selectedTexture`

주의:

이 화면은 아직 `위치 조정`, `스타일 조정`, `position`, `style` 용어를 사용한다. 새 용어 체계에 맞춰 사용자-facing 문구는 `형태`, `룩`으로 정리하고, 코드명은 `Shape`, `Look`, `MakeupArea` 기준으로 rename한다.

#### ExtractedMakeupStyleSaveForm / 권장 이름 MakeupFilterSave

역할:

추출된 메이크업 룩 또는 AR에서 조합한 메이크업 필터를 이름, 태그, 공개 설정과 함께 저장하는 폼이다. 현재 코드명은 `ExtractedMakeupStyleSaveForm`이지만, 최종 용어 기준에서는 `MakeupFilterSaveScreen`/`MakeupFilterSaveForm` 계열로 rename한다.

화면 내용:

- 선택 사진 썸네일
- 메이크업 룩 이름 입력
- 태그 목록/추가 버튼
- 공개 설정: 나만 보기/공개하기
- 저장하기 버튼

이동:

- 저장 완료 → `ExtractedMakeupStyleSaveComplete`

파일:

- 화면: `ExtractedMakeupStyleSaveFormScreen.tsx`

주요 변수/타입:

- `makeupStyleName` 현재 코드명, 권장 이름 `makeupLookName`
- `makeupFilterSaveState`
- `submitMakeupFilterSave`
- `visibility`
- `defaultTags`
- `onSave`

#### ExtractedMakeupStyleSaveComplete

역할:

메이크업 룩 저장 완료 화면이다.

화면 내용:

- 저장 완료 아이콘
- 저장된 룩 이름 안내
- 지금 적용해보기
- 마이페이지로 이동

이동:

- 지금 적용해보기 → `ExtractedMakeupStyleAdjust`
- 마이페이지로 이동 → `ProfileTab`

파일:

- 화면: `ExtractedMakeupStyleSaveCompleteScreen.tsx`

주요 변수/타입:

- `extractedMakeupStyle` 현재 코드명, 권장 이름 `extractedMakeupLook`
- `onApplyNow`
- `onGoToProfile`

#### ExtractedMakeupStyleRecipeDetail

역할:

추출된 메이크업 룩을 실제 메이크업 적용 순서로 풀어낸 레시피 상세 화면이다.

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

- `MakeupStyleRecipeTab` 현재 코드명, 권장 이름 `MakeupRecipeTab`
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

- `extractedMakeupStyle` 현재 코드명, 권장 이름 `extractedMakeupLook`
- `onBackToDetail`
- `onGoToProfile`

### 3.8 마이페이지/프로필 플로우

#### ProfileTab / ProfileScreen

역할:

사용자 프로필, 최근 얼굴 분석 보고서, 저장 메이크업 룩, 좋아요 제품을 요약해서 보여주는 화면이다. 화면 표시용 데이터는 `MyPageProfileSummary`, 계정 기본 정보는 `UserProfile`, 추천/분석에 계속 쓰는 뷰티 특성은 `BeautyProfile`로 구분한다.

화면 내용:

- 프로필 요약 카드
- 이미지 분석 결과 요약과 전체 보기
- 메이크업 룩 3개 preview와 전체 보기
- 좋아요한 제품 목록 3개 preview와 전체 보기

이동:

- 설정 버튼 → `ProfileEdit`
- 얼굴 분석 보고서 전체 보기 → 현재 route 기준 `ImageAnalysisReportsList`, 권장 이름 `FaceAnalysisReportsList`
- 얼굴 분석 보고서 카드 선택 → 현재 route 기준 `ImageAnalysisReportDetail`, 권장 이름 `FaceAnalysisReportDetail`
- 메이크업 룩 전체 보기 → `MakeupStyleList`
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
- `MyPageProfileSummary`
- `BeautyProfile`
- `MakeupStylePreview` 현재 코드명, 권장 이름 `MakeupLookPreview`
- `LikedProductPreview`
- `ProfileLoadState`
- `loadProfileScreenData`
- `savedMakeupStyle` 현재 코드명, 권장 이름 `savedMakeupLook`
- `makeupStyles` 현재 코드명, 권장 이름 `makeupLooks`
- `previewMakeupStyles` 현재 코드명, 권장 이름 `previewMakeupLooks`
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

### 3.9 저장 룩/좋아요 제품 목록 플로우

#### MakeupStyleList

역할:

마이페이지의 메이크업 룩 전체 보기 화면이다. 현재 route/file 이름은 `MakeupStyleList`지만, 최종 용어 기준에서는 `MakeupLookList` 계열로 rename한다.

화면 내용:

- 저장된 메이크업 룩 2열 grid
- 페이지 단위 표시
- 각 카드에는 이미지와 이름 표시

파일:

- 화면: `apps/mobile/src/features/recommendation/screens/MakeupStyleListScreen.tsx`
- service: `shared/services/makeupService.ts`
- mock: `shared/mocks/makeupStyles.mock.ts`
- type: `MakeupStyle` 현재 코드명, 권장 이름 `MakeupLook`

주요 변수/타입:

- `MakeupStyle` 현재 코드명, 권장 이름 `MakeupLook`
- `makeupStyles` 현재 코드명, 권장 이름 `makeupLooks`
- `getMakeupStyles` 현재 코드명, 권장 이름 `getMakeupLooks`
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

저장한 메이크업 룩과 잘 맞는 제품을 추천하는 화면이다. 실제 제품 엔티티는 `Product`, 추천 결과 항목은 `RecommendedProduct`, 추천 기능/플로우는 `ProductRecommendation` 계열로 구분한다.

화면 내용:

- 저장한 메이크업 룩 요약 카드
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
- `ProductRecommendationItem` 현재 코드명, 권장 이름 `RecommendedProduct`
- `ProductRecommendationStyle` 현재 코드명, 권장 이름 `ProductRecommendationLook`
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
- `PhotoCaptureGuideScreen.tsx` 현재 파일명, 권장 이름 `FaceCaptureTutorialScreen.tsx`

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
- `ImageAnalysisLoadingScreen.tsx` 현재 파일명, 권장 이름 `FaceAnalysisLoadingScreen.tsx`
- `ImageAnalysisReportsListScreen.tsx` 현재 파일명, 권장 이름 `FaceAnalysisReportsListScreen.tsx`
- `ImageAnalysisReportDetailScreen.tsx` 현재 파일명, 권장 이름 `FaceAnalysisReportDetailScreen.tsx`
- `imageAnalysisService.ts`
- `imageAnalysis.mock.ts`
- `imageAnalysis.ts`

주요 변수명:

- `FaceCaptureCheckState`
- `FaceCaptureGuidance`
- `evaluateFaceCaptureGuidance`
- `ImageAnalysisReport` 현재 코드명, 권장 이름 `FaceAnalysisReport`
- `ImageAnalysisFacePointGuide` 현재 코드명, 권장 이름 `FaceAnalysisMakeupGuideline`
- `ImageAnalysisMakeupCard` 현재 코드명, 권장 이름 `FaceAnalysisMakeupCard`
- `getImageAnalysisReports` 현재 코드명, 권장 이름 `getFaceAnalysisReports`
- `getLatestImageAnalysisReport` 현재 코드명, 권장 이름 `getLatestFaceAnalysisReport`
- `getImageAnalysisReportSummaryItems` 현재 코드명, 권장 이름 `getFaceAnalysisReportSummaryItems`

### 4.4 AR 필터

파일명:

- `ARFilterScreen.tsx`
- `ARFilterLocationAdjustScreen.tsx` 현재 파일명, 권장 이름 `ARFilterShapeAdjustScreen.tsx`
- `ARFilterStyleAdjustScreen.tsx` 현재 파일명, 권장 이름 `MakeupFilterEditScreen.tsx`
- `filterCustomizationService.ts`
- `filterCustomization.mock.ts`
- `makeupGuideService.ts`
- `makeupGuide.mock.ts`
- `makeupGuide.ts`

주요 변수명:

- `MakeupFilter`
- `ARMakeupGuideData`
- `ARMakeupOptionGroupId`
- `selectedMakeupStyleCardId` 현재 코드명, 권장 이름 `selectedTotalMakeupLookId`
- `selectedMakeupPresetCardId` 현재 코드명, 권장 이름 `selectedPointMakeupLookId`
- `selectedMakeupOptionGroup`
- `selectedFacePartId` 현재 코드명, 권장 이름 `selectedMakeupArea`
- `hasUnsavedMakeupChanges`
- `FilterLocationState` 현재 코드명, 권장 이름 `FilterShapeState`
- `FilterStyleState` 현재 코드명, 권장 이름 `MakeupFilterEditState`
- `StyleOptionGroupId` 현재 코드명, 권장 이름 `MakeupFilterEditOptionGroupId`
- `ShapePoint`
- `MakeupArea`

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
- `ExtractedMakeupStyleAdjustScreen.tsx` 현재 파일명, 권장 이름 `ExtractedMakeupLookEditScreen.tsx`
- `ExtractedMakeupStyleSaveFormScreen.tsx` 현재 파일명, 권장 이름 `MakeupFilterSaveScreen.tsx`
- `ExtractedMakeupStyleSaveCompleteScreen.tsx` 현재 파일명, 권장 이름 `MakeupFilterSaveCompleteScreen.tsx`
- `ExtractedMakeupStyleRecipeDetailScreen.tsx` 현재 파일명, 권장 이름 `MakeupRecipeDetailScreen.tsx`
- `ExtractedMakeupStyleRecipeSaveCompleteScreen.tsx` 현재 파일명, 권장 이름 `MakeupRecipeSaveCompleteScreen.tsx`
- `makeupExtractionService.ts`
- `referenceMakeupExtraction.mock.ts`
- `types.ts`

주요 변수명:

- `ReferenceMakeupExtractionData`
- `ReferenceMakeupPhoto`
- `ReferenceMakeupSource`
- `MakeupExtractionResult` 현재 코드명, 권장 이름 `ReferenceMakeupExtractionResult`
- `MakeupStylePalette` 현재 코드명, 권장 이름 `MakeupLookPalette`
- `MakeupStylePoint` 현재 코드명, 권장 이름 `MakeupLookPoint`
- `MakeupStyleAdjustmentTab` 현재 코드명, 권장 이름 `MakeupLookEditTab`
- `MakeupStyleAttributeGroup` 현재 코드명, 권장 이름 `MakeupLookAttributeGroup`
- `MakeupStyleFaceArea` 현재 코드명, 권장 이름 `MakeupArea`
- `MakeupStyleRecipeTab` 현재 코드명, 권장 이름 `MakeupRecipeTab`
- `extractedMakeupStyle` 현재 코드명, 권장 이름 `extractedMakeupLook`

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
- `MyPageProfileSummary`
- `BeautyProfile`
- `ProfileData`
- `ProfileEditField`
- `MakeupStyle` 현재 코드명, 권장 이름 `MakeupLook`
- `MakeupStylePreview` 현재 코드명, 권장 이름 `MakeupLookPreview`
- `Product`
- `LikedProductPreview`
- `savedMakeupStyle` 현재 코드명, 권장 이름 `savedMakeupLook`
- `loadProfileScreenData`

### 4.8 추천 제품

파일명:

- `ProductRecommendationScreen.tsx`
- `productRecommendationService.ts`
- `productRecommendation.mock.ts`
- `features/recommendation/types.ts`

주요 변수명:

- `ProductRecommendationData`
- `ProductRecommendationItem` 현재 코드명, 권장 이름 `RecommendedProduct`
- `ProductRecommendationStyle` 현재 코드명, 권장 이름 `ProductRecommendationLook`
- `ProductRecommendationSet`
- `ProductRecommendationCategory`
- `activeCategory`
- `productRecommendationMock`

## 5. 최종 네이밍 결정 및 rename 타깃

이 섹션은 과거 `비슷하지만 다른 개념과 네이밍 충돌 후보`였던 내용을 확정 결정 기준으로 갱신한 것이다. 자세한 결정 이유와 작업 순서는 `docs/mobile/NAMING_DECISIONS.md`, `docs/mobile/NAMING_REFACTOR_WORK_PLAN.md`를 따른다.

### 5.1 `스타일` 레거시 이름과 `룩` 최종 용어

확정 기준:

- 사용자-facing 용어는 `스타일`을 사용하지 않고 `룩`으로 통일한다.
- 코드에서도 새 작업은 `Look` 계열을 우선 사용한다.
- React Native `style` prop, `StyleSheet`, `styles`는 플랫폼 용어이므로 변경하지 않는다.

대표 rename 타깃:

- `MakeupStyle` -> `MakeupLook`
- `MakeupStylePreview` -> `MakeupLookPreview`
- `MakeupStyleCard` -> `MakeupLookCard`
- `ExtractedMakeupStyle*` -> `ExtractedMakeupLook*`
- `ProductRecommendationStyle` -> `ProductRecommendationLook`
- `selectedMakeupStyleCardId` -> `selectedTotalMakeupLookId`

### 5.2 `메이크업 필터`, `룩`, `프리셋`의 계층

확정 기준:

- `MakeupFilter`는 저장/적용 가능한 메이크업 효과 전체를 포괄한다.
- 사용자가 카드나 저장 목록에서 인식하는 단위는 `MakeupLook`이다.
- 얼굴 전체 룩은 `TotalMakeupLook`, 특정 부위 룩은 `PointMakeupLook`으로 구분한다.
- `Preset`은 사용자-facing 카드명이 아니라 룩이 가진 설정값 묶음이다.

권장 데이터 관계:

```text
MakeupFilter
├─ TotalMakeupLook
└─ PointMakeupLook
   ├─ LipMakeupLook
   ├─ EyeMakeupLook
   ├─ CheekMakeupLook
   ├─ EyebrowMakeupLook
   └─ ContourMakeupLook
```

### 5.3 `위치`, `Location`, `Position`, `형태` 혼재

확정 기준:

- 사용자-facing 옵션명은 `위치`가 아니라 `형태`를 사용한다.
- 저장/선택 가능한 옵션은 `Shape` 계열을 사용한다.
- 사용자가 옮기는 조정점은 `shapePoint`라고 부른다.
- 실제 얼굴 인식 모델이 제공하는 원본 기준점에만 `landmark` 계열 이름을 사용한다.
- `position`은 점의 기준/현재 좌표, `offset`은 기준점 대비 이동량에 사용한다.

대표 rename 타깃:

- `ARFilterLocationAdjust` -> `ARFilterShapeAdjust`
- `ARFilterLocationAdjustScreen` -> `ARFilterShapeAdjustScreen`
- `FilterLocationState` -> `FilterShapeState`
- `FilterLocationAdjustment` -> `FilterShapeAdjustment`
- `locationOption` -> `shapeOption`
- `selectedLocationId` -> `selectedMakeupShapeId`

### 5.4 `StyleAdjust` 화면과 메이크업 필터 편집 화면

확정 기준:

- `ARFilterStyleAdjustScreen`은 `LookEdit`이 아니라 `MakeupFilterEditScreen` 계열로 정리한다.
- 이 화면은 룩 엔티티 자체만 편집하는 것이 아니라, 현재 AR에 적용될 메이크업 필터 구성 전체를 편집하는 화면이다.
- 저장 화면은 `MakeupFilterSaveScreen`으로 맞춘다.

대표 rename 타깃:

- `ARFilterStyleAdjustScreen` -> `MakeupFilterEditScreen`
- `StyleAdjust` -> `MakeupFilterEdit`
- `styleAdjustState` -> `makeupFilterEditState`
- `openStyleAdjust` -> `openMakeupFilterEdit`

### 5.5 얼굴 분석, 메이크업 피드백, 이미지 분석

확정 기준:

- 얼굴 자체 분석은 `FaceAnalysis` 계열을 사용한다.
- 얼굴 분석 결과 데이터는 `FaceAnalysisResult`, 사용자가 읽는 보고서는 `FaceAnalysisReport`다.
- 메이크업 적용 결과 평가와 개선 의견은 `MakeupFeedback` 계열을 사용한다.
- `ImageAnalysis`는 현재 얼굴 분석이나 메이크업 피드백 화면명으로 쓰지 않는다.
- `ImageAnalysis`는 향후 얼굴, 메이크업, 헤어, 의상, 분위기를 포함한 전체 이미지/전체 인상 분석 상위 도메인명으로 예약한다.

대표 rename 타깃:

- `ImageAnalysisLoading` -> `FaceAnalysisLoading`
- `ImageAnalysisReportsList` -> `FaceAnalysisReportsList`
- `ImageAnalysisReportDetail` -> `FaceAnalysisReportDetail`
- `ImageAnalysisReport` -> `FaceAnalysisReport`

### 5.6 레퍼런스 메이크업 추출 결과와 보고서

확정 기준:

- 레퍼런스 사진에서 메이크업을 뽑는 기능은 `ReferenceMakeupExtraction`이다.
- 추출 결과 데이터는 `ReferenceMakeupExtractionResult`다.
- 사용자가 읽는 보고서형 산출물은 `ReferenceMakeupExtractionReport`다.
- 화면 문구에서 `분석 결과`를 뭉뚱그려 쓰지 않고 `추출 결과`, `얼굴 분석 결과`, `보고서`로 구분한다.

### 5.7 `Guide`, `Tutorial`, `Recipe`, `Guideline`

확정 기준:

- 사용법 안내는 `Tutorial` 계열을 사용한다.
- 온보딩 안내는 `OnboardingTutorial`, 얼굴 사진 촬영법 안내는 `FaceCaptureTutorial` 계열을 사용한다.
- 특정 메이크업 룩을 재현하기 위한 구성/절차/조합은 `MakeupRecipe` 계열을 사용한다.
- AR 반반가이드처럼 화면 위 기준 UI는 `Guide` 계열을 사용할 수 있다.
- 메이크업 적용 기준선/규칙은 `Guideline` 계열을 사용한다.

대표 rename 타깃:

- `PhotoCaptureGuideScreen` -> `FaceCaptureTutorialScreen`
- `MakeupStyleRecipeTab` -> `MakeupRecipeTab`
- `GuideCategory` -> 목적에 따라 `TutorialCategory`, `MakeupRecipeCategory`, `MakeupGuidelineCategory`

### 5.8 `Product`와 `RecommendedProduct`

확정 기준:

- 실제 제품 엔티티는 `Product`다.
- 추천 결과 리스트에 노출되는 제품 항목은 `RecommendedProduct`다.
- 추천 행위/플로우/서비스 자체에는 `ProductRecommendation` 계열을 사용할 수 있다.

대표 rename 타깃:

- `ProductRecommendationItem` -> `RecommendedProduct`
- `ProductRecommendationItemCard` -> `RecommendedProductCard`
- `ProductRecommendationStyle` -> `ProductRecommendationLook`

### 5.9 `source` 필드 구체화

확정 기준:

- 공유 타입, 화면 이동 파라미터, API 응답에 단독 `source`를 새로 만들지 않는다.
- 이미지 파일/URI/asset 출처는 `imageSource` 계열을 사용한다.
- 레퍼런스 입력 출처는 `referenceSource` 계열을 사용한다.
- 추천 근거/채널은 `recommendationSource` 계열을 사용한다.
- 화면 진입점은 `navigationSource`, `entryPoint`, `openedFrom` 중 맥락에 맞게 사용한다.

예:

- `MakeupFeedbackPhotoSelection.source` -> `makeupFeedbackPhotoSource`
- `ReferenceMakeupPhoto.source` -> `referenceImageSource` 또는 `referenceSource`

### 5.10 프로필 도메인 분리

확정 기준:

- 계정/회원 기본 정보는 `UserProfile`이다.
- 마이페이지 표시용 요약 데이터는 `MyPageProfileSummary`다.
- 얼굴 분석/추천에 활용되는 뷰티 특성 데이터는 `BeautyProfile`이다.
- `FaceAnalysisResult`는 분석 실행 결과이고, `BeautyProfile`은 계속 저장해 추천/개인화에 쓰는 사용자 특성 데이터다.

대표 rename 타깃:

- `profileService.getUserProfile` wrapper -> `getMyPageProfileSummary` 또는 `loadProfileScreenData`
- 뷰티 특성 조회/저장은 `getBeautyProfile`, `updateBeautyProfile`

### 5.11 asset 파일명과 `Style` 코드명

확정 기준:

- 룩 도메인의 asset/mock data/type/component/state 이름은 `Look` 계열로 정리한다.
- 기존 `look-*.png`처럼 이미 룩 의미가 드러나는 asset 파일명은 유지할 수 있다.
- `Style`이 UI 스타일링이 아니라 메이크업 룩을 뜻한다면 rename 대상이다.

### 5.12 AR 필터 저장 화면

확정 기준:

- AR 필터 저장 화면은 `MakeupFilterSaveScreen` 계열로 정리한다.
- `MakeupLookSaveScreen`은 룩 보고서 저장 등 다른 저장 플로우와 충돌할 수 있으므로 사용하지 않는다.
- `MakeupLookFilterScreen`은 룩 목록을 필터링하는 화면처럼 읽힐 수 있으므로 사용하지 않는다.
- 저장 화면 내부에서 저장 대상이 `TotalMakeupLook`인지 `PointMakeupLook`인지 구분한다.

대표 rename 타깃:

- `ExtractedMakeupStyleSaveForm` -> `MakeupFilterSaveForm`
- `ExtractedMakeupStyleSaveFormScreen` -> `MakeupFilterSaveScreen`
- `makeupStyleName` -> `makeupLookName`

### 5.13 메이크업 부위 기준 타입

확정 기준:

- 메이크업 적용/저장/편집 범위의 기준 타입은 `MakeupArea`다.
- 특정 동작의 적용 대상은 변수명에서 `targetMakeupArea`처럼 표현한다.
- 얼굴 인식 모델의 물리적 얼굴 부위나 랜드마크 그룹은 `FacePart` 또는 `FaceLandmarkGroup`으로 분리한다.
- 제품 카테고리는 얼굴 부위가 아니라 제품 분류이므로 별도 유지한다.

권장 `MakeupArea` 값:

```text
total
lip
eye
eyeShadow
eyeLine
eyelash
contactLens
aegyosal
cheek
eyebrow
contour
```

## 6. 우선 정리 권장 순서

1. 문서 용어 사전과 화면 기획서를 최신 결정 기준으로 동기화한다.
2. 공통 타입 `MakeupFilter`, `TotalMakeupLook`, `PointMakeupLook`, `MakeupArea`를 정리한다.
3. AR 필터 편집/저장 화면을 `MakeupFilterEditScreen`, `MakeupFilterSaveScreen` 축으로 rename한다.
4. 형태 관련 `Location`/`Position` 혼재를 `Shape`, `shapePoint`, `position`, `offset` 기준으로 정리한다.
5. 룩 도메인의 `Style` 계열 이름을 `Look` 계열로 rename한다.
6. 얼굴 분석, 레퍼런스 추출, 메이크업 피드백 도메인을 `FaceAnalysis`, `ReferenceMakeupExtraction`, `MakeupFeedback` 기준으로 분리한다.
7. `Tutorial`, `MakeupRecipe`, `Guide`, `Guideline` 용어를 역할별로 정리한다.
8. `Product`, `RecommendedProduct`, `ProductRecommendation`을 구분한다.
9. `UserProfile`, `MyPageProfileSummary`, `BeautyProfile`을 구분한다.
10. 공유 타입과 화면 이동 파라미터의 단독 `source`를 구체 이름으로 바꾼다.
