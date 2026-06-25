# 모바일 네이밍 리팩터링 작업 플랜

작성일: 2026-06-26

참조 문서:

- `docs/mobile/NAMING_DECISIONS.md`
- `docs/mobile/APP_SCREEN_FLOW_FEATURE_SPEC.md`
- `docs/mobile/AR_FILTER_SCREEN_FEATURE_SPEC.md`
- `docs/mobile/FRONTEND_WORK_GUIDE.md`

## 1. 목표

이 문서는 모바일 앱 전반의 네이밍 결정사항을 실제 문서/코드에 반영하기 위한 작업 순서와 검증 기준을 정의한다.

이 문서는 사람이 읽는 회의록이 아니라, AI 코딩 에이전트에게 작업 지시로 전달할 수 있는 실행 문서다. 따라서 각 용어는 최종 이름뿐 아니라 선택 이유, 사용 범위, 피해야 할 대체 이름까지 함께 기록한다.

이번 리팩터링의 핵심 목표는 다음과 같다.

- 사용자-facing 용어와 코드 도메인 용어를 같은 방향으로 정리한다.
- `스타일`, `필터`, `룩`, `프리셋`, `형태`, `가이드`처럼 비슷하지만 다른 개념을 분리한다.
- 화면명, 타입명, 변수명, 파일명을 기능/플로우 기준으로 예측 가능하게 만든다.
- 기존 레거시 이름은 한 번에 섞어 쓰지 않고 단계적으로 rename한다.

## 2. AI 작업 지시 원칙

AI 에이전트에게 이 작업을 맡길 때는 다음 원칙을 반드시 함께 전달한다.

- 이 문서의 최종 용어를 우선 사용하고, 새 이름을 임의로 만들지 않는다.
- 이미 확정된 용어가 불편해 보여도 같은 개념에 다른 이름을 새로 붙이지 않는다.
- 파일명, 타입명, 변수명, 화면명, mock data 이름은 같은 도메인 축을 따라 맞춘다.
- 사용자-facing 한국어 문구와 코드 영어명이 서로 다른 개념을 가리키지 않게 한다.
- `Style`, `Location`, `Guide`, `source`, `Profile`처럼 넓거나 과거에 섞여 쓰인 단어는 반드시 이 문서의 분리 기준을 확인한 뒤 사용한다.
- React Native 플랫폼 용어인 `style`, `StyleSheet`, `styles`는 리팩터링 대상에서 제외한다.
- 기능 변경과 rename을 섞어야 할 때는 먼저 타입/이름을 정리하고, 그 다음 UI 동작을 바꾼다.
- rename 후에는 전체 검색으로 레거시 이름이 의도치 않게 남지 않았는지 확인한다.

## 3. 확정 용어 요약

| 개념 | 최종 용어 | 코드명 | 왜 이렇게 부르는가 |
| --- | --- | --- | --- |
| 저장/적용 가능한 메이크업 효과 | 메이크업 필터 | `MakeupFilter` | 얼굴 전체든 특정 부위든 AR에 적용하고 저장할 수 있는 효과 단위이기 때문이다. `Look`은 사용자가 인식하는 룩 카드이고, `Filter`는 앱이 적용/저장하는 효과 단위다. |
| 얼굴 전체 메이크업 룩 | 토탈메이크업룩 | `TotalMakeupLook` | 얼굴 전체를 하나의 완성된 룩으로 저장/적용하는 단위다. 전체라는 범위를 `Total`로 명확히 드러낸다. |
| 특정 부위 메이크업 룩 | 포인트메이크업룩 | `PointMakeupLook` | 립/아이/치크처럼 특정 부위만 강조하는 룩이다. 부분 룩이라는 의미를 `Point`로 표현한다. |
| 룩의 설정값 묶음 | 프리셋값 | `makeupPresetValues` | 사용자에게 노출되는 카드명은 룩이고, 프리셋은 그 룩 안에 저장된 설정값 묶음이기 때문이다. |
| 메이크업 적용 모양 | 형태 | `Shape` | 단순 위치가 아니라 메이크업 레이어가 얼굴 기준점에 붙는 모양, 적용 범위, 변형 패턴을 포함하기 때문이다. |
| 형태 조정점 | 형태 점 | `shapePoint` | 실제 얼굴 인식 랜드마크를 옮기는 것이 아니라, 메이크업 형태를 조정하는 점이기 때문이다. 그래서 `landmarkPoint`를 쓰지 않는다. |
| 점의 현재/기준 좌표 | 좌표 | `position` | 좌우/상하 위치 데이터 자체를 나타낼 때는 `position`이 자연스럽다. 단, 사용자-facing 옵션명으로는 쓰지 않는다. |
| 기준점 대비 이동량 | 이동값 | `offset` | 기준 좌표에서 얼마나 이동했는지 표현하는 값이므로 `offset`이 가장 정확하다. |
| 메이크업 부위 | 메이크업 부위 | `MakeupArea` | 부위 자체의 기준 타입이다. `MakeupTargetArea`는 특정 동작의 대상이라는 뉘앙스가 강하므로 변수명에서만 `target`을 붙인다. |
| 얼굴 분석 | 얼굴 분석 | `FaceAnalysis` | 얼굴형/톤/특징처럼 얼굴 자체를 분석하는 기능이다. 메이크업 평가나 이미지 전체 분석과 구분한다. |
| 메이크업 피드백 | 메이크업 피드백 | `MakeupFeedback` | 적용된 메이크업이나 룩 조합에 대한 평가/개선 의견이므로 얼굴 분석과 별도 기능이다. |
| 레퍼런스 메이크업 추출 | 레퍼런스 메이크업 추출 | `ReferenceMakeupExtraction` | 레퍼런스 사진에서 메이크업 정보를 뽑아내는 행위이므로 `Analysis`보다 `Extraction`이 정확하다. |
| 메이크업 레시피 | 메이크업 레시피 | `MakeupRecipe` | 특정 룩을 재현하기 위한 구성, 순서, 조합을 담으므로 단순 안내인 `Guide`보다 `Recipe`가 맞다. |
| 사용법 안내 | 튜토리얼 | `Tutorial` | 사용자가 따라 하며 기능을 익히는 안내다. 온보딩이나 촬영법 안내도 이 계열로 둔다. |
| 기준 UI/기준선 | 가이드/가이드라인 | `Guide`/`Guideline` | `Guide`는 AR 반반가이드처럼 화면 위 기준 UI에, `Guideline`은 적용 규칙/기준선에 사용한다. |
| 실제 제품 | 제품 | `Product` | 브랜드/제품명/이미지/가격 등을 가진 실제 제품 엔티티다. |
| 추천된 제품 항목 | 추천 제품 | `RecommendedProduct` | 추천 맥락에서 노출되는 제품 항목이다. `ProductRecommendation`은 추천 행위/기능으로 읽힐 수 있어 카드명에는 쓰지 않는다. |
| 계정 프로필 | 사용자 프로필 | `UserProfile` | 닉네임/이메일/프로필 사진 등 계정 기본 정보다. |
| 마이페이지 요약 | 마이페이지 프로필 요약 | `MyPageProfileSummary` | 마이페이지 화면에 보여주기 위해 가공한 요약 데이터다. |
| 뷰티 특성 데이터 | 뷰티 프로필 | `BeautyProfile` | 얼굴 분석/메이크업 추천에 계속 활용되는 얼굴형, 피부톤, 퍼스널 컬러 같은 사용자 특성 데이터다. |

## 4. 용어별 금지/대체 기준

| 쓰지 않을 이름 | 대신 쓸 이름 | 이유 |
| --- | --- | --- |
| `Style` | `Look` | 사용자-facing 용어를 `룩`으로 확정했기 때문이다. 단, UI 스타일링 `style`은 제외한다. |
| `MakeupLookFilterScreen` | `MakeupFilterEditScreen` 또는 `MakeupFilterSaveScreen` | 영어상 룩 목록을 필터링하는 화면처럼 읽힐 수 있다. |
| `MakeupLookSaveScreen` | `MakeupFilterSaveScreen` | 룩 보고서 저장 등 다른 저장 플로우와 충돌할 수 있다. 필터 저장 화면은 필터 기준으로 부른다. |
| `Location` 옵션 | `Shape` 옵션 | 사용자가 조정하는 것은 단순 위치가 아니라 메이크업 적용 모양이다. |
| `landmarkPoint` | `shapePoint` | 사용자가 옮기는 점은 실제 얼굴 인식 랜드마크가 아니다. |
| 단독 `source` | `imageSource`, `referenceSource`, `recommendationSource`, `navigationSource`, `entryPoint` | 출처의 의미가 너무 넓어 타입과 화면 파라미터에서 혼선을 만든다. |
| `ImageAnalysis` | `FaceAnalysis`, `MakeupFeedback`, `ReferenceMakeupExtraction` | 현재 기능은 얼굴 분석, 메이크업 피드백, 레퍼런스 추출로 나뉜다. `ImageAnalysis`는 향후 전체 이미지 분석 상위 도메인으로 예약한다. |
| `MakeupGuide` | `MakeupRecipe` 또는 `MakeupGuideline` | 따라 만드는 구성/절차는 `Recipe`, 기준/규칙은 `Guideline`으로 나눈다. |
| `ProductRecommendationItem` | `RecommendedProduct` | 추천 항목은 추천된 제품이다. `ProductRecommendation`은 추천 기능/행위로 읽힐 수 있다. |
| `MakeupTargetArea` 기준 타입 | `MakeupArea` | 기준 타입은 짧고 중립적인 `MakeupArea`를 쓰고, 적용 대상 맥락은 `targetMakeupArea` 변수명으로 표현한다. |

## 5. 화면/플로우 기준 이름

| 화면/플로우 | 최종 화면명/타입 | 역할 |
| --- | --- | --- |
| AR 필터 메인 화면 | `ARFilterScreen` | 카메라에서 메이크업 필터를 적용/미리보기 |
| 메이크업 필터 편집 화면 | `MakeupFilterEditScreen` | 룩, 컬러, 타입, 질감, 형태를 선택/수정 |
| 메이크업 필터 저장 화면 | `MakeupFilterSaveScreen` | 현재 조합된 메이크업 필터를 저장 |
| 형태 수정 화면/모드 | `MakeupShapeEdit` 또는 `ARFilterShapeEdit` | `shapePoint`를 손가락으로 조정 |
| 얼굴 분석 화면 | `FaceAnalysisScreen` | 얼굴 분석 실행 |
| 얼굴 분석 결과 화면 | `FaceAnalysisResultScreen` | 구조화된 얼굴 분석 결과 표시 |
| 얼굴 분석 보고서 화면 | `FaceAnalysisReportScreen` | 사용자가 읽는 보고서형 산출물 표시 |
| 레퍼런스 추출 화면 | `ReferenceMakeupExtractionScreen` | 레퍼런스 사진에서 메이크업 추출 |
| 레퍼런스 추출 결과 화면 | `ReferenceMakeupExtractionResultScreen` | 추출 결과 데이터 확인 |
| 레퍼런스 추출 보고서 화면 | `ReferenceMakeupExtractionReportScreen` | 추출 내용을 보고서 형태로 표시 |
| 메이크업 피드백 화면 | `MakeupFeedbackScreen` | 적용 결과/조합에 대한 피드백 제공 |

## 6. 작업 원칙

- 새 기능과 새 파일은 최종 용어를 먼저 사용한다.
- 기존 코드 rename은 기능 단위로 나눠 진행한다.
- UI 문구 변경과 코드 rename은 한 커밋에 과하게 섞지 않는다.
- React Native의 `style` prop, `StyleSheet`, `styles.container`처럼 플랫폼 스타일링 용어는 변경하지 않는다.
- 단독 `source`는 공유 타입, 화면 이동 파라미터, API 응답에서 새로 만들지 않는다.
- `ImageAnalysis`는 현재 얼굴 분석/메이크업 피드백 이름으로 쓰지 않고, 향후 전체 이미지/전체 인상 분석 상위 도메인명으로 예약한다.

## 7. 단계별 작업 계획

### 7.0 2026-06-26 코드 적용 현황

- 적용 완료:
  - `ImageAnalysis*` route/file/type/service/mock -> `FaceAnalysis*`
  - `MakeupStyle*`, `makeupStyle*`, `makeupStylesMock`, `savedMakeupStyle` -> `MakeupLook*`, `makeupLook*`, `makeupLooksMock`, `savedMakeupLook`
  - `ARFilterStyleAdjustScreen` -> `MakeupFilterEditScreen`
  - `ARFilterLocationAdjustScreen` -> `ARFilterShapeAdjustScreen`
  - `ExtractedMakeupStyleAdjust` -> `ExtractedMakeupLookAdjust`
  - `ExtractedMakeupStyleSaveForm`/`SaveComplete` -> `MakeupFilterSaveForm`/`MakeupFilterSaveComplete`
  - `ExtractedMakeupStyleRecipe*` -> `ExtractedMakeupLookRecipe*`
  - `FacePartId`/`FacePart` 기준 타입 -> `MakeupArea`/`MakeupAreaOption`
  - 사용자가 옮기는 조정점 이름 -> `shapePoint`
  - `ProductRecommendationItem` -> `RecommendedProduct`
  - `MakeupFeedbackPhotoSelection.source` -> `photoSource`
  - `ReferenceMakeupPhoto.source` -> `referenceSource`
  - `ProfileData` -> `MyPageProfileSummary`
  - `MakeupLookRecipeTab` -> `MakeupRecipeTab`
  - `PhotoCaptureGuideScreen` -> `FaceCaptureTutorialScreen`
- 의도적 예외:
  - React Native `style` prop, `StyleSheet`, `styles`, `TextStyle`, `ViewStyle`
  - React Native `Image`/`ImagePlaceholder`의 `source` prop
  - UI 레이아웃 CSS성 `position`

### 7.1 문서 동기화

- [x] `APP_SCREEN_FLOW_FEATURE_SPEC.md`의 용어 사전을 최종 결정 기준으로 갱신한다.
- [x] `AR_FILTER_SCREEN_FEATURE_SPEC.md`의 AR 필터 화면 용어를 `MakeupFilter`, `MakeupLook`, `Shape`, `MakeupArea` 기준으로 갱신한다.
- [x] `스타일`을 사용자-facing 용어에서 제거하고 `룩`으로 통일한다.
- [x] `위치` 옵션을 `형태` 옵션으로 정리하고, `shapePoint`, `position`, `offset` 정의를 추가한다.
- [ ] `메이크업 가이드`로 적힌 기능 중 레시피 성격이면 `메이크업 레시피`로 바꾼다.

### 7.2 공통 도메인 타입 정리

- [x] `MakeupFilter` 상위 타입을 정의한다.
- [x] `TotalMakeupLook`과 `PointMakeupLook` 타입을 분리한다.
- [ ] 포인트메이크업룩 하위 타입 또는 scope를 정리한다.
  - `LipMakeupLook`
  - `EyeMakeupLook`
  - `EyeShadowMakeupLook`
  - `EyeLineMakeupLook`
  - `EyelashMakeupLook`
  - `ContactLensMakeupLook`
  - `AegyosalMakeupLook`
  - `CheekMakeupLook`
  - `EyebrowMakeupLook`
  - `ContourMakeupLook`
- [x] `MakeupArea` 기준 타입을 만들고 기존 부위 타입을 연결한다.
- [ ] `FacePart` 또는 `FaceLandmarkGroup`은 얼굴 인식 모델의 물리적 부위/랜드마크 그룹에만 사용한다.
- [x] `Preset` 또는 `makeupPresetValues`를 룩 내부 설정값 묶음으로 제한한다.

### 7.3 AR 필터 화면 rename

- [x] `ARFilterStyleAdjustScreen`을 `MakeupFilterEditScreen` 계열로 rename한다.
- [x] `StyleAdjust` 관련 상태/핸들러를 `MakeupFilterEdit` 계열로 rename한다.
  - `styleAdjustState` -> `makeupFilterEditState`
  - `openStyleAdjust` -> `openMakeupFilterEdit`
- [x] 필터 저장 화면/폼은 `MakeupFilterSave` 계열로 rename한다.
  - `ExtractedMakeupStyleSaveForm` -> `MakeupFilterSaveForm`
  - `makeupFilterSaveState`
  - `submitMakeupFilterSave`
- [x] 화면 내부 탭은 `룩`, `컬러`, `타입`, `질감`, `형태` 순서와 노출 조건을 확인한다.
- [x] 전체 선택 상태에서는 `룩`, `형태`만 노출하는 규칙을 반영한다.
- [x] 개별 부위 선택 상태에서는 `룩`, `컬러`, `타입`, `질감`, `형태`를 사용할 수 있게 정리한다.
- [x] 선택 카드의 첫 항목은 항상 `원본` 카드로 둔다.

### 7.4 형태 편집 모델 정리

- [x] `locationOption`, `selectedLocationId`, `makeupLocation` 계열을 `shapeOption`, `selectedMakeupShapeId`, `makeupShape` 계열로 rename한다.
- [x] 사용자가 옮기는 조정점은 `shapePoint`로 명명한다.
- [x] 얼굴 인식 원본 기준점에만 `landmark` 계열 이름을 사용한다.
- [x] `shapePoint.position`은 기준/현재 좌표로 사용한다.
- [x] `shapePoint.offset`은 기준점 대비 이동량으로 사용한다.
- [ ] 형태 저장값이 룩/필터 저장값과 어떻게 조합되는지 타입으로 명확히 표현한다.

### 7.5 룩/스타일 레거시 rename

- [x] 룩 도메인의 `Style` 타입/컴포넌트/변수명을 `Look` 계열로 rename한다.
  - `MakeupStyle` -> `MakeupLook`
  - `MakeupStyleCard` -> `MakeupLookCard`
  - `MakeupStylePreview` -> `MakeupLookPreview`
  - `selectedStyleId` -> `selectedLookId`
  - `selectedMakeupStyleCardId` -> `selectedMakeupLookId`
- [x] asset/mock data 이름을 `Look` 계열로 rename한다.
  - `makeupStyleImages` -> `makeupLookImages`
  - `styleCardImage` -> `lookCardImage`
  - `makeupStyleCards` -> `makeupLookCards`
- [x] `ExtractedMakeupStyle*` 계열은 `ExtractedMakeupLook*` 계열로 rename한다.
- [x] UI 스타일링 의미의 `style`, `StyleSheet`, `styles`는 변경하지 않는다.

### 7.6 분석/추출/피드백 도메인 정리

- [x] 얼굴 분석 기능은 `FaceAnalysis` 계열로 정리한다.
  - `FaceAnalysis`
  - `FaceAnalysisResult`
  - `FaceAnalysisReport`
- [x] 메이크업 피드백은 `MakeupFeedback` 계열로 분리한다.
  - `MakeupFeedback`
  - `MakeupFeedbackResult`
- [x] 레퍼런스 메이크업 추출은 `ReferenceMakeupExtraction` 계열로 정리한다.
  - `ReferenceMakeupExtraction`
  - `ReferenceMakeupExtractionResult`
  - `ReferenceMakeupExtractionReport`
- [x] 화면 문구에서 `분석 결과`를 뭉뚱그려 쓰지 않고 `추출 결과`, `얼굴 분석 결과`, `보고서`로 나눈다.
- [x] `ImageAnalysis`는 향후 전체 이미지/전체 인상 분석 상위 도메인명으로만 예약한다.

### 7.7 안내/레시피/가이드 정리

- [x] 사용법 안내는 `Tutorial` 계열로 정리한다.
  - `Tutorial`
  - `OnboardingTutorial`
  - `FaceCaptureTutorial`
- [x] 룩을 따라 만들기 위한 구성/절차/조합은 `MakeupRecipe` 계열로 정리한다.
- [x] AR 비교 기준 UI는 `Guide` 계열로 유지할 수 있다.
  - `ARHalfGuide`
  - `ARComparisonGuide`
- [x] 메이크업 적용 기준선/규칙은 `Guideline` 계열로 분리한다.
  - `MakeupGuideline`
  - `MakeupApplicationGuideline`
- [x] 기존 `GuideCategory`는 목적에 따라 `TutorialCategory`, `MakeupRecipeCategory`, `MakeupGuidelineCategory`로 분리한다.

### 7.8 제품 추천 도메인 정리

- [ ] 실제 제품 엔티티는 `Product` 계열로 유지한다.
  - `Product`
  - `ProductDetail`
  - `ProductCategory`
- [x] 추천 결과 항목은 `RecommendedProduct` 계열로 rename한다.
  - `ProductRecommendationItem` -> `RecommendedProduct`
  - `RecommendedProductCard`
  - `recommendedProducts`
- [ ] 추천 기능/플로우/서비스 자체에만 `ProductRecommendation` 계열을 사용한다.
  - `ProductRecommendationScreen`
  - `ProductRecommendationResult`
  - `productRecommendationService`
- [ ] 추천 사유, 매칭 점수, 추천 출처는 `RecommendedProduct`에 붙인다.

### 7.9 프로필 도메인 정리

- [x] 계정/회원 기본 정보는 `UserProfile` 계열로 유지한다.
  - `UserProfile`
  - `getUserProfile`
  - `updateUserProfile`
- [x] 마이페이지 표시용 요약은 `MyPageProfileSummary` 계열로 분리한다.
  - `MyPageProfileSummary`
  - `getMyPageProfileSummary`
- [x] 얼굴 분석/추천에 활용되는 뷰티 특성 데이터는 `BeautyProfile` 계열로 분리한다.
  - `BeautyProfile`
  - `getBeautyProfile`
  - `updateBeautyProfile`
- [x] `FaceAnalysisResult`는 분석 실행 결과, `BeautyProfile`은 계속 저장해 개인화에 쓰는 특성 데이터로 구분한다.

### 7.10 `source` 필드 구체화

- [x] 단독 `source`가 공유 타입, 화면 파라미터, API 응답에 남아 있는지 검색한다.
- [x] 이미지 경로/asset 출처는 `imageSource` 계열로 바꾼다.
  - `profileImageSource`
  - `referenceImageSource`
  - `productImageSource`
- [x] 레퍼런스 입력 출처는 `referenceSource` 계열로 바꾼다.
- [ ] 추천 근거/채널은 `recommendationSource` 계열로 바꾼다.
- [ ] 화면 진입점은 `navigationSource`, `entryPoint`, `openedFrom` 중 맥락에 맞게 사용한다.
- [ ] 원본/가공 데이터 계보는 `rawSource`, `originalSource`, `derivedFrom`으로 표현한다.

## 8. 권장 작업 순서

1. 문서 용어 사전과 화면 기획서부터 갱신한다.
2. 공통 타입과 mock data 이름을 먼저 정리한다.
3. AR 필터 화면의 `MakeupFilterEditScreen`/`MakeupFilterSaveScreen` rename을 진행한다.
4. 형태 관련 `Shape`/`shapePoint` 모델을 정리한다.
5. `Style` -> `Look` 레거시 rename을 기능 단위로 진행한다.
6. 분석/추출/피드백 도메인 rename을 진행한다.
7. 제품 추천, 프로필, `source` 필드 정리를 진행한다.
8. 마지막에 전체 검색으로 레거시 이름 잔여분을 확인한다.

## 9. 검색 체크리스트

작업 전후로 다음 키워드를 검색한다.

```text
StyleAdjust
MakeupStyle
ExtractedMakeupStyle
ProductRecommendationItem
MakeupStyleFaceArea
FacePartId
GuideCategory
ImageAnalysis
source
locationOption
selectedLocationId
makeupLocation
```

작업 후 남아도 되는 예외 키워드는 다음과 같다.

```text
style
StyleSheet
styles
position
```

단, `position`은 UI 레이아웃 또는 좌표 데이터일 때만 허용하고, 사용자-facing 옵션명으로는 사용하지 않는다.

## 10. 검증 기준

2026-06-26 적용 검증:

- `rg` 기준 앱 코드에는 `MakeupStyle`, `ExtractedMakeupStyle`, `ARFilterLocationAdjust`, `ARFilterStyleAdjust`, `FacePartId`, `ImageAnalysis`, `ProductRecommendationItem`, `GuideCategory` 레거시 식별자가 남아 있지 않다.
- 단독 `source`는 React Native 이미지 prop 또는 `ImagePlaceholder`의 프레임워크 호환 prop으로만 남아 있다.
- `npm --prefix apps/mobile run typecheck` 통과.

- [x] 앱 화면 문구에 `스타일`이 룩 의미로 남아 있지 않다.
- [x] 룩 도메인 코드에 신규 `Style` 이름이 추가되지 않는다.
- [x] AR 필터 편집/저장 플로우가 `MakeupFilterEdit`/`MakeupFilterSave` 축으로 정리되어 있다.
- [x] `Shape`, `shapePoint`, `position`, `offset`, `landmark`의 의미가 타입과 변수명에서 구분된다.
- [x] `MakeupArea`가 메이크업 적용/저장/편집 범위의 기준 타입으로 쓰인다.
- [ ] 분석/추출/피드백 결과와 보고서가 `Result`/`Report`로 구분된다.
- [x] `Product`와 `RecommendedProduct`가 분리되어 있다.
- [x] `UserProfile`, `MyPageProfileSummary`, `BeautyProfile`이 서로 다른 데이터로 분리되어 있다.
- [x] 공유 타입과 화면 이동 파라미터에 단독 `source`가 새로 추가되지 않는다.
- [x] TypeScript 타입 체크를 통과한다.
- [ ] lint와 관련 화면 빌드/시뮬레이터 실행 검증은 별도 실행 시점에 기록한다.

## 11. 커밋 분리 제안

문서와 코드 변경이 커질 수 있으므로 다음 단위로 커밋을 나누는 것을 권장한다.

1. `docs: 모바일 네이밍 리팩터링 계획 추가`
2. `docs: 모바일 기능 기획 용어 갱신`
3. `refactor: 메이크업 필터 공통 타입 정리`
4. `refactor: AR 필터 편집 저장 화면 이름 정리`
5. `refactor: 메이크업 룩 레거시 스타일 이름 정리`
6. `refactor: 분석 추출 피드백 도메인 이름 정리`
7. `refactor: 제품 추천 프로필 출처 필드 이름 정리`

## 12. 보류/주의사항

- 실제 코드 rename은 import 경로, navigation route 이름, mock data, 테스트 스냅샷까지 같이 움직일 가능성이 크다.
- `MakeupFilter`와 `MakeupLook`은 의도적으로 둘 다 유지한다.
  - `MakeupFilter`: 저장/적용 가능한 효과 전체
  - `MakeupLook`: 사용자가 인식하는 룩 단위
- `MakeupLookFilterScreen`은 사용하지 않는다. 영어상 룩 목록을 필터링하는 화면처럼 읽힐 수 있기 때문이다.
- `MakeupLookReportSaveScreen`처럼 보고서 저장 화면이 생기면 `MakeupFilterSaveScreen`과 별도 플로우로 둔다.
- `ImageAnalysis`는 폐기하지 않고 향후 전체 이미지/전체 인상 분석 상위 도메인명으로 예약한다.
