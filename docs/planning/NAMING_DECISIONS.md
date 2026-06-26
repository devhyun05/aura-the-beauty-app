# 모바일 네이밍 결정사항

작성일: 2026-06-26

이 문서는 모바일 앱의 사용자-facing 용어와 코드 도메인 이름을 정리한 결정 문서다. 완료된 실행 체크리스트는 별도 플랜 문서로 남기지 않고 이 문서에는 결정 이유와 현재 적용 상태만 남긴다.

## 문서 기준

- 새 화면/타입/변수 이름은 이 문서의 최종 용어를 우선 사용한다.
- 이미 확정된 용어와 같은 개념에 다른 이름을 새로 붙이지 않는다.
- React Native 플랫폼 용어인 `style`, `StyleSheet`, `styles`, 이미지 `source` prop은 도메인 rename 대상이 아니다.
- 구조 리팩터링 적용 상태는 화면/플로우 기획서와 코드 구조를 기준으로 확인한다.

## 2026-06-26 코드 적용 현황

이 문서는 결정 히스토리를 보존하기 때문에 `MakeupStyle`, `ExtractedMakeupStyle`, `ImageAnalysis`, `ProductRecommendationItem`, `FacePartId` 같은 이전 이름을 결정 질문과 근거 안에 그대로 남긴다. 단, 현재 앱 코드와 화면 상세 문서는 다음 rename을 적용한 상태다.

- 룩 도메인의 `Style` 계열은 `Look` 계열로 정리했다.
- 얼굴 분석 화면/파일/서비스/mock/type은 `FaceAnalysis` 계열로 정리했다.
- AR 형태 수정 화면은 `ARFilterShapeAdjust` 계열로 정리했다.
- AR 필터 옵션 편집 화면은 `MakeupFilterEdit` 계열로 정리했다.
- 필터 저장 화면은 `MakeupFilterSave`/`MakeupFilterSaveComplete` 계열로 정리했다.
- 레퍼런스 추출 결과 편집 화면은 `ExtractedMakeupLook` 계열로 정리했다.
- 추천 제품 항목은 `RecommendedProduct`, 추천 룩 요약은 `ProductRecommendationLook`으로 정리했다.
- 메이크업 적용/저장/편집 범위의 기준 타입은 `MakeupArea`로 정리했다.
- 사용자가 옮기는 형태 조정점은 `shapePoint`/`FilterShapePoint`로 정리했다.
- 마이페이지 요약은 `MyPageProfileSummary`, 개인화 특성 데이터는 `BeautyProfile`로 분리했다.
- 얼굴 촬영법 안내 화면은 `FaceCaptureTutorialScreen` 계열로 정리했다.
- 메이크업 레시피 탭 타입은 `MakeupRecipeTab`으로 정리했다.
- 저장 route는 `MakeupFilterSave`, 레시피 route는 `MakeupRecipeDetail`/`MakeupRecipeSaveComplete`로 최종화했다.
- 얼굴 분석 보고서 내부의 메이크업 적용 기준은 `FaceAnalysisMakeupGuideline`과 `makeupGuideline`으로 정리했다.

## 적용 요약

완료:

- `MakeupStyle`, `ExtractedMakeupStyle*`, `ProductRecommendationStyle` 계열을 `Look` 계열로 정리했다.
- `ImageAnalysis*` 화면/파일/서비스/mock/type을 현재 얼굴 분석 의미의 `FaceAnalysis*`로 정리했다.
- `ARFilterLocationAdjust` 계열을 `ARFilterShapeAdjust` 계열로 정리했다.
- `ARFilterStyleAdjust` 계열을 `MakeupFilterEdit` 계열로 정리했다.
- `ExtractedMakeupStyleSaveForm` 계열을 `MakeupFilterSave`/`MakeupFilterSaveComplete` 계열로 정리했다.
- `ProductRecommendationItem`을 `RecommendedProduct`로 정리했다.
- `FacePartId`, `MakeupStyleFaceArea`, `GuideCategory`처럼 분산된 부위 타입은 `MakeupArea` 기준으로 정리했다.
- `PhotoCaptureGuideScreen`은 `FaceCaptureTutorialScreen`, `MakeupLookRecipeTab`은 `MakeupRecipeTab`으로 정리했다.
- `MakeupFilterSave`와 `MakeupRecipe*` route 이름을 최종화했다.
- `FaceAnalysisMakeupGuideline`과 `makeupGuideline`으로 얼굴 분석 보고서의 메이크업 기준 데이터를 구체화했다.

새 기능에서 계속 지킬 기준:

- `Result`는 구조화 데이터, `Report`는 사용자가 읽는 설명형 산출물에 사용한다.
- `Guide`는 화면 위 안내 UI, `Guideline`은 적용 기준이나 규칙에 사용한다.
- 단독 `source` 대신 `imageSource`, `photoSource`, `referenceSource`, `recommendationSource`, `navigationSource`, `entryPoint`, `rawSource`, `originalSource`, `derivedFrom`처럼 용도별 이름을 사용한다.

## 결정 현황

| 항목 | 주제 | 상태 | 결정 |
| --- | --- | --- | --- |
| 5.1 | `스타일` 레거시 이름과 `룩` 최종 용어 | 결정 | `룩/Look`으로 통일 |
| 5.2 | `메이크업 필터`, `룩`, `프리셋`의 계층 | 결정 | `메이크업 필터 > 룩 > 프리셋값` 계층으로 정리 |
| 5.3 | `위치`, `Location`, `Position`, `형태` 혼재 | 결정 | 선택/저장 단위는 `형태/Shape`, 조정점은 `shapePoint` |
| 5.4 | `StyleAdjust` 화면과 `룩/옵션 수정` 문구 불일치 | 결정 | `MakeupFilterEdit` 계열로 정리 |
| 5.5 | 얼굴 진단 `ImageAnalysis`와 메이크업 피드백 `MakeupFeedback` | 결정 | `FaceAnalysis`와 `MakeupFeedback`으로 분리 |
| 5.6 | 레퍼런스 메이크업 추출과 얼굴 진단의 `분석 결과` | 결정 | 추출 기능/결과/보고서를 분리 |
| 5.7 | `Guide` 용어가 여러 기능에 걸쳐 쓰임 | 결정 | `Tutorial`, `Recipe`, `Guide/Guideline`을 역할별로 분리 |
| 5.8 | `Product`와 `ProductRecommendationItem` | 결정 | 실제 제품은 `Product`, 추천 항목은 `RecommendedProduct` |
| 5.9 | `source` 필드가 서로 다른 의미로 쓰임 | 결정 | 단독 `source` 대신 용도별 구체 이름 사용 |
| 5.10 | `getUserProfile` 서비스 중복 | 결정 | `UserProfile`, `MyPageProfileSummary`, `BeautyProfile`로 분리 |
| 5.11 | `Look` asset 파일명과 `Style` 코드명 | 결정 | 룩 도메인의 `Style`은 `Look` 계열로 rename |
| 5.12 | AR 필터 저장이 `ExtractedMakeupStyleSaveForm`으로 이동함 | 결정 | 필터 저장 화면은 `MakeupFilterSave` 계열로 정리 |
| 5.13 | `FacePartId`, `MakeupStyleFaceArea`, `GuideCategory` 부위 타입 분산 | 결정 | 메이크업 부위 기준 타입은 `MakeupArea`로 통합 |

## 결정 로그

### 5.1 `스타일` 레거시 이름과 `룩` 최종 용어

질문:
사용자-facing 용어는 `룩`으로 통일하고, 코드의 `Style` 계열 이름도 새 작업에서 `Look` 계열로 바꾸는 방향으로 확정할까?

선택지:

1. `룩/Look`으로 통일
   - 화면 문구는 `룩`, 새 코드명은 `Look`을 사용한다.
   - 기존 `MakeupStyle`, `ExtractedMakeupStyle*`, `ProductRecommendationStyle`은 추후 rename 대상으로 둔다.
2. 화면만 `룩`, 코드는 `Style` 유지
   - 사용자 문구만 정리하고 코드명 변경 비용은 줄인다.
   - 문서에는 `Style`이 레거시가 아니라 내부 코드명이라고 명시한다.
3. 도메인별 혼합 유지
   - AR 필터는 `Look`, 저장/추천/추출은 `Style`을 유지한다.
   - 용어 분리가 많아져 문서와 UI에서 설명 비용이 늘어난다.

결정: `룩/Look`으로 통일한다.

이유:

- 사용자-facing 용어에서 `스타일`을 제거하고 `룩`을 최종 용어로 사용하기로 했다.
- 코드명도 새 작업부터 `Look` 계열을 우선 사용하면 화면 용어와 도메인 코드 용어가 같은 방향을 바라본다.
- 기존 `MakeupStyle`, `ExtractedMakeupStyle*`, `ProductRecommendationStyle` 등은 2026-06-26 rename 작업에서 `Look` 계열로 반영했다.

문서/코드 반영 방향:

- 화면 문구: `스타일` 대신 `룩` 사용
- 새 코드명: `Look` 계열 사용
- 권장 rename 예시:
  - `MakeupStyle` → `MakeupLook`
  - `MakeupStylePreview` → `MakeupLookPreview`
  - `ExtractedMakeupStyle*` → `ExtractedMakeupLook*`
  - `ProductRecommendationStyle` → `ProductRecommendationLook`
  - `selectedMakeupStyleCardId` → `selectedTotalMakeupLookId`
- React Native `style` prop과 `StyleSheet`의 `styles`는 플랫폼 용어이므로 변경하지 않는다.

### 5.2 `메이크업 필터`, `룩`, `프리셋`의 계층

질문:
`메이크업 필터`를 전체/부분 룩을 모두 포함하는 큰 개념으로 두고, 사용자가 보는 카드는 `토탈메이크업룩` 또는 `포인트메이크업룩`, `프리셋`은 그 안의 설정값 묶음으로 정리할까?

결정: `메이크업 필터 > 룩 > 프리셋값` 계층으로 정리한다.

이유:

- 메이크업 필터는 앱이 저장하거나 AR 화면에 적용할 수 있는 메이크업 효과 전체를 포괄한다.
- 얼굴 전체에 적용되는 필터도, 립/아이/치크처럼 특정 부위에만 적용되는 필터도 모두 메이크업 필터다.
- 사용자가 카드나 저장 목록에서 인식하는 단위는 `룩`이다.
- `프리셋`은 카드명이나 사용자-facing 선택 단위가 아니라, 하나의 필터/룩이 가진 설정값 묶음으로 사용한다.

계층:

```text
메이크업 필터
├─ 토탈메이크업룩
└─ 포인트메이크업룩
   ├─ 립메이크업룩
   ├─ 아이메이크업룩
   │  ├─ 아이섀도우메이크업룩
   │  ├─ 아이라인메이크업룩
   │  ├─ 아이래쉬메이크업룩
   │  ├─ 콘택트렌즈메이크업룩
   │  └─ 애교살메이크업룩
   ├─ 치크메이크업룩
   ├─ 아이브로우메이크업룩
   └─ 컨투어메이크업룩
```

문서/코드 반영 방향:

- 상위 타입은 `MakeupFilter`로 둔다.
- 룩 범위는 `TotalMakeupLook`과 `PointMakeupLook`으로 구분한다.
- 포인트메이크업룩은 부위/세부 부위 scope를 가진다.
- 권장 타입 예시:
  - `TotalMakeupLook`
  - `PointMakeupLook`
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
- `Preset` 또는 `makeupPresetValues`는 룩이 가진 설정값 묶음으로 사용한다.
- 여러 포인트메이크업룩을 조합해 하나의 토탈메이크업룩을 만들 수 있다.

### 5.3 `위치`, `Location`, `Position`, `형태` 혼재

질문:
`형태` 옵션을 사용자가 저장/선택하는 랜드마크 기반 모양으로 두고, 실제 수정은 슬라이더가 아니라 얼굴 위 랜드마크 점을 손가락으로 옮기는 방식으로 정의할까?

결정: 선택/저장 단위는 `형태/Shape`, 조정 대상은 `shapePoint`, 점의 좌우/상하 이동값은 `position` 또는 `offset`으로 정리한다.

이유:

- 사용자는 위치값을 숫자나 슬라이더로 조정하는 것이 아니라, 얼굴 위의 랜드마크 점을 직접 옮겨 메이크업이 적용되는 모양을 바꾼다.
- 따라서 `위치`, `Location`, `Position`은 핵심 사용자 개념으로는 부정확하다.
- `형태`는 메이크업 레이어가 얼굴 랜드마크에 붙는 모양, 적용 범위, 변형 패턴을 포괄한다.
- 다만 형태 안에서 개별 랜드마크 점을 옮긴 결과로 생기는 좌우/상하 이동값은 좌표 데이터이므로 `position` 또는 `offset` 계열이 적합하다.
- 같은 룩이라도 형태가 달라지면 얼굴 위에 적용되는 모양이 달라진다.

문서/코드 반영 방향:

- 화면 문구: `위치` 대신 `형태` 사용
- 새 코드명: 저장/선택 가능한 옵션은 `Shape` 계열 사용
- 권장 rename 예시:
  - `ARFilterLocationAdjust` → `ARFilterShapeAdjust`
  - `locationOption` → `shapeOption`
  - `selectedLocationId` → `selectedMakeupShapeId`
  - `makeupLocation` → `makeupShape`
- 손가락으로 옮기는 개별 조정점은 `shapePoint` 계열을 사용한다.
- 실제 얼굴 인식 랜드마크를 옮기는 것은 아니므로, 사용자가 조정하는 점 이름에는 `landmarkPoint`를 쓰지 않는다.
- 얼굴 인식 모델이 제공하는 원본 기준점 또는 참조 데이터에만 `landmark` 계열 이름을 사용할 수 있다.
- 점의 기준 좌표나 현재 좌표는 `position` 계열을 사용할 수 있다.
- 기준점 대비 이동량은 `offset` 계열을 사용할 수 있다.
- 좌표 필드가 필요할 때는 `x`, `y`, `position`, `offset`, `point`, `coordinate`처럼 데이터 성격을 드러내고, 사용자-facing 옵션명으로 `Position`을 쓰지 않는다.
- 플랫폼 레이아웃이나 스타일 좌표처럼 일반 UI 코드에서 쓰는 `position`은 변경 대상이 아니다.

### 5.4 `StyleAdjust` 화면과 `룩/옵션 수정` 문구 불일치

질문:
`StyleAdjust` 계열 화면/파일명은 `MakeupFilterEdit` 계열로 정리하고, 이 화면을 룩뿐 아니라 컬러/타입/질감/형태까지 수정하는 필터 편집 화면으로 정의할까?

결정: `MakeupFilterEdit` 계열로 정리한다.

이유:

- 사용자-facing 용어에서 `스타일`은 `룩`으로 바꾸기로 확정했다.
- 해당 화면은 전체/부분 룩을 선택하는 기능만 담당하지 않고, 컬러/타입/질감/형태 옵션을 바꿔 현재 메이크업 필터 구성을 편집한다.
- `LookEdit`은 룩 엔티티 자체를 수정하는 화면처럼 읽힐 수 있다.
- 저장 화면을 `MakeupFilterSaveScreen`으로 정리했으므로, 편집 화면도 `MakeupFilterEditScreen`으로 맞추는 편이 플로우가 일관적이다.
- 따라서 `Adjust`보다 `Edit`이 화면 역할을 더 넓고 정확하게 설명한다.

문서/코드 반영 방향:

- 화면 문구: `스타일 조정`, `스타일 수정` 대신 `필터 편집` 또는 맥락에 맞는 `옵션 편집` 사용
- 새 화면/파일명: `MakeupFilterEdit` 계열 사용
- 권장 rename 예시:
  - `ARFilterStyleAdjustScreen` → `MakeupFilterEditScreen`
  - `StyleAdjust` → `MakeupFilterEdit`
  - `styleAdjustState` → `makeupFilterEditState`
  - `openStyleAdjust` → `openMakeupFilterEdit`
- 화면 내부에서 현재 선택한 탭이 룩/컬러/타입/질감/형태일 때는 `필터 편집`보다 해당 옵션명을 우선 노출할 수 있다.
- React Native `style` prop과 `StyleSheet`의 `styles`는 플랫폼 용어이므로 변경하지 않는다.

### 5.5 얼굴 진단 `ImageAnalysis`와 메이크업 피드백 `MakeupFeedback`

질문:
얼굴 사진을 바탕으로 얼굴형/톤/특징을 분석하는 기능은 `FaceAnalysis`, 메이크업 적용 결과를 평가하거나 개선 의견을 주는 기능은 `MakeupFeedback`으로 분리해서 정의할까?

결정: `FaceAnalysis`와 `MakeupFeedback`으로 분리하고, 기능/결과/보고서 산출물을 구분한다.

이유:

- `FaceAnalysis`는 사용자의 얼굴 자체를 분석하는 기능/플로우다.
- `FaceAnalysisResult`는 얼굴 분석이 끝난 뒤 앱이 들고 있는 구조화 결과 데이터다.
- `FaceAnalysisReport`는 사용자가 읽는 설명형 문서, 요약, 진단서 형태의 산출물이다.
- `MakeupFeedback`은 사용자의 메이크업 적용 결과, 룩 조합, 개선 방향을 평가하는 기능이다.
- 메이크업 피드백은 얼굴 분석 결과를 참고할 수 있지만, 두 기능의 입력/출력/사용 목적은 다르다.
- `ImageAnalysis`는 얼굴 분석이나 메이크업 피드백 단일 기능명으로 쓰기에는 범위가 너무 넓다.
- 다만 향후 얼굴, 메이크업, 헤어, 의상, 분위기처럼 사진 전체 또는 전체 인상을 함께 분석하는 상위 기능에는 `ImageAnalysis`를 사용할 수 있다.

문서/코드 반영 방향:

- 얼굴 진단 화면/결과/서비스는 `FaceAnalysis` 계열을 사용한다.
  - `FaceAnalysisScreen`
  - `FaceAnalysisResultScreen`
  - `FaceAnalysisResult`
  - `FaceAnalysisReportScreen`
  - `FaceAnalysisReport`
  - `faceAnalysisService`
- 메이크업 피드백 화면/결과/서비스는 `MakeupFeedback` 계열을 사용한다.
  - `MakeupFeedbackScreen`
  - `MakeupFeedbackResultScreen`
  - `MakeupFeedbackResult`
  - `makeupFeedbackService`
- `ImageAnalysis`는 현재 얼굴 진단/메이크업 피드백 화면명으로 사용하지 않는다.
- 향후 사진 전체 또는 전체 인상을 분석하는 상위 도메인이 생기면 `ImageAnalysis`를 상위 모듈명으로 사용할 수 있다.
- 사람 중심의 전체 인상 분석 제품명이나 기능명이 필요하면 `AppearanceAnalysis`도 후보로 검토한다.
- 화면 문구는 `얼굴 분석`, `얼굴 진단`, `메이크업 피드백`처럼 기능 목적이 드러나는 이름을 사용한다.

### 5.6 레퍼런스 메이크업 추출과 얼굴 진단의 `분석 결과`

질문:
레퍼런스 사진에서 메이크업을 뽑는 기능, 그 결과 데이터, 사람이 읽는 보고서를 각각 분리해서 이름 붙일까?

결정: `ReferenceMakeupExtraction`, `ReferenceMakeupExtractionResult`, `ReferenceMakeupExtractionReport`로 분리한다.

이유:

- 레퍼런스 사진에서 메이크업 정보를 뽑는 행위 자체는 `Extraction`이다.
- 추출이 끝난 뒤 앱이 들고 있는 구조화 데이터는 `Result`다.
- 사용자가 읽는 설명형 문서, 요약, 진단서 형태의 산출물은 `Report`가 더 정확하다.
- 얼굴 진단의 결과인 `FaceAnalysisResult`와 레퍼런스 메이크업 추출 결과를 모두 `분석 결과`라고 부르면 플로우와 데이터 타입이 섞인다.

문서/코드 반영 방향:

- 레퍼런스 사진에서 메이크업 정보를 추출하는 기능/플로우는 `ReferenceMakeupExtraction` 계열을 사용한다.
  - `ReferenceMakeupExtractionScreen`
  - `referenceMakeupExtractionService`
  - `startReferenceMakeupExtraction`
- 추출 결과 데이터는 `ReferenceMakeupExtractionResult` 계열을 사용한다.
  - `ReferenceMakeupExtractionResultScreen`
  - `ReferenceMakeupExtractionResult`
  - `referenceMakeupExtractionResult`
- 사용자가 읽는 보고서 형태의 산출물이 필요하면 `ReferenceMakeupExtractionReport` 계열을 사용한다.
  - `ReferenceMakeupExtractionReportScreen`
  - `ReferenceMakeupExtractionReport`
- 얼굴 진단 결과는 `FaceAnalysisResult` 계열을 사용한다.
- 화면 문구는 `추출 결과`, `얼굴 분석 결과`, `보고서`처럼 산출물 성격이 드러나게 나눈다.

### 5.7 `Guide` 용어가 여러 기능에 걸쳐 쓰임

질문:
사용법 안내, 온보딩 안내, 얼굴 사진 촬영법 안내, 메이크업 추천/구성, AR 반반가이드, 메이크업 기준선을 모두 `Guide`로 부르지 않고 역할별로 나눌까?

결정: `Tutorial`, `Recipe`, `Guide/Guideline`을 역할별로 분리한다.

이유:

- `Tutorial`은 사용자가 기능을 따라 하며 익히는 사용법 안내에 적합하다.
- `OnboardingTutorial`은 앱 첫 사용 흐름에서 제공되는 안내에 적합하다.
- `FaceCaptureTutorial`은 얼굴 사진 촬영법처럼 특정 행동을 알려주는 안내에 적합하다.
- `Recipe`는 특정 메이크업 룩을 재현하기 위한 구성, 순서, 조합을 뜻하기에 기존 `메이크업 가이드`보다 `메이크업 레시피`에 더 잘 맞는다.
- `Guide`는 화면 위에 겹쳐지는 기준 UI나 넓은 안내에 사용할 수 있다.
- `Guideline`은 메이크업 적용 기준선, 규칙, 판단 기준처럼 지켜야 할 기준을 뜻할 때 사용한다.

문서/코드 반영 방향:

- 사용법 안내는 `Tutorial` 계열을 사용한다.
  - `Tutorial`
  - `OnboardingTutorial`
  - `FaceCaptureTutorial`
- 메이크업 룩을 따라 만들기 위한 구성/절차/조합은 `MakeupRecipe` 계열을 사용한다.
  - `MakeupRecipe`
  - `MakeupRecipeScreen`
  - `MakeupRecipeStep`
- AR 화면의 비교 기준 UI는 `Guide` 계열을 사용할 수 있다.
  - `ARHalfGuide`
  - `ARComparisonGuide`
- 메이크업 적용 기준선이나 규칙은 `Guideline` 계열을 사용한다.
  - `MakeupGuideline`
  - `MakeupApplicationGuideline`
- 새 기능에서 단독 `Guide`를 쓰기 전에 `Tutorial`, `Recipe`, `Guideline` 중 더 정확한 이름이 있는지 먼저 검토한다.

### 5.8 `Product`와 `ProductRecommendationItem`

질문:
`Product`는 실제 제품 엔티티로 두고, 추천 결과 리스트에 노출되는 제품 항목은 `RecommendedProduct`로 분리할까?

결정: 실제 제품 엔티티는 `Product`, 추천 결과 항목은 `RecommendedProduct`로 정리한다.

이유:

- `Product`는 브랜드, 제품명, 이미지, 가격, 카테고리 등 실제 제품 자체를 나타낸다.
- `RecommendedProduct`는 추천 맥락 안에서 노출되는 제품 항목이다.
- `ProductRecommendation`은 영어상 추천 행위, 추천 기능, 추천 결과 묶음으로 읽힐 수 있어 단일 제품 카드 이름으로는 덜 정확하다.
- 추천 사유, 매칭 점수, 관련 룩/레시피, 추천 출처 같은 추천 전용 메타데이터는 실제 제품 엔티티가 아니라 `RecommendedProduct`에 붙이는 편이 자연스럽다.

문서/코드 반영 방향:

- 실제 제품 데이터는 `Product` 계열을 사용한다.
  - `Product`
  - `ProductDetail`
  - `ProductCategory`
  - `productService`
- 추천 결과 항목은 `RecommendedProduct` 계열을 사용한다.
  - `RecommendedProduct`
  - `RecommendedProductCard`
  - `recommendedProducts`
- 추천 기능/플로우/서비스 자체는 필요할 때 `ProductRecommendation` 계열을 사용할 수 있다.
  - `ProductRecommendationScreen`
  - `ProductRecommendationResult`
  - `productRecommendationService`
- 기존 `ProductRecommendationItem`은 2026-06-26 rename 작업에서 `RecommendedProduct`로 반영했다.

### 5.9 `source` 필드가 서로 다른 의미로 쓰임

질문:
여러 곳의 `source` 필드는 의미가 섞이기 쉬우니, 용도별로 `imageSource`, `referenceSource`, `recommendationSource`, `navigationSource`처럼 구체화해서 사용할까?

결정: 단독 `source` 대신 용도별 구체 이름을 사용한다.

이유:

- `source`는 데이터 출처, 이미지 경로, 추천 근거, 화면 진입점, 원본 레퍼런스 등 여러 의미로 읽힐 수 있다.
- 기능이 늘어나면 `source`만 보고는 값의 타입과 사용 목적을 알기 어렵다.
- 필드명을 구체화하면 타입 정의, API 응답, 화면 전환 파라미터에서 의미가 바로 드러난다.
- 단독 `source`는 아주 좁은 내부 범위에서만 쓰고, 공유 타입이나 화면 간 전달값에는 사용하지 않는 편이 좋다.

문서/코드 반영 방향:

- 이미지 파일/URI/asset 출처는 `imageSource` 또는 더 구체적인 이름을 사용한다.
  - `profileImageSource`
  - `referenceImageSource`
  - `productImageSource`
- 레퍼런스 사진이나 참조 입력의 출처는 `referenceSource` 계열을 사용한다.
  - `referenceSource`
  - `referenceImageSource`
  - `makeupReferenceSource`
- 추천의 근거/채널/생성 출처는 `recommendationSource` 계열을 사용한다.
  - `recommendationSource`
  - `productRecommendationSource`
  - `lookRecommendationSource`
- 화면 진입 경로나 이전 화면 정보는 `navigationSource` 또는 `entryPoint` 계열을 사용한다.
  - `navigationSource`
  - `entryPoint`
  - `openedFrom`
- 원본 데이터와 가공 데이터를 비교해야 할 때는 `rawSource`, `originalSource`, `derivedFrom`처럼 데이터 계보가 드러나는 이름을 사용한다.
- 기존 `MakeupFeedbackPhotoSelection.source`는 2026-06-26 rename 작업에서 `photoSource`로 반영했다.
- 기존 `ReferenceMakeupPhoto.source`는 2026-06-26 rename 작업에서 `referenceSource`로 반영했다.

### 5.10 `getUserProfile` 서비스 중복

질문:
`프로필`을 계정/회원 기본 정보, 마이페이지 표시용 요약 정보, 얼굴/톤/메이크업 추천에 쓰는 뷰티 특성 데이터로 분리할까?

결정: `UserProfile`, `MyPageProfileSummary`, `BeautyProfile`로 분리한다.

이유:

- `UserProfile`은 계정/회원 기본 프로필이다.
- `MyPageProfileSummary`는 마이페이지 화면에 보여주기 위해 가공한 요약 데이터다.
- `BeautyProfile`은 얼굴형, 피부톤, 퍼스널 컬러, 민감도처럼 얼굴 분석과 메이크업 추천에 쓰이는 뷰티 특성 데이터다.
- 세 데이터를 모두 `UserProfile` 또는 `getUserProfile`로 부르면 API 응답, 캐시, 화면 상태에서 어떤 목적의 데이터인지 헷갈릴 수 있다.

문서/코드 반영 방향:

- 계정/회원 기본 프로필은 `UserProfile` 계열을 사용한다.
  - `UserProfile`
  - `getUserProfile`
  - `updateUserProfile`
- 마이페이지 표시용 요약 데이터는 `MyPageProfileSummary` 계열을 사용한다.
  - `MyPageProfileSummary`
  - `getMyPageProfileSummary`
- 얼굴 분석과 메이크업 추천에 쓰는 뷰티 특성 데이터는 `BeautyProfile` 계열을 사용한다.
  - `BeautyProfile`
  - `getBeautyProfile`
  - `updateBeautyProfile`
- 다른 사용자의 공개 프로필 요약이 필요하면 `PublicProfileSummary` 또는 `UserProfileSummary`를 별도 후보로 검토한다.
- `FaceAnalysisResult`는 얼굴 분석의 결과 데이터이고, `BeautyProfile`은 추천/개인화에 계속 활용되는 사용자 특성 데이터로 구분한다.

### 5.11 `Look` asset 파일명과 `Style` 코드명

질문:
이미지 asset 파일명이나 코드에 남은 `Style`도 룩 관련이면 전부 `Look` 계열로 바꿀까?

결정: 룩 도메인의 `Style`은 `Look` 계열로 rename한다.

이유:

- 사용자-facing 용어와 새 코드명은 `룩/Look`으로 통일하기로 했다.
- asset, mock data, 카드 컴포넌트, 상태 변수에 `Style`이 남아 있으면 같은 개념이 두 이름으로 관리된다.
- 반면 React Native의 `style` prop, `StyleSheet`, CSS 스타일링 의미의 `styles`는 플랫폼/프레임워크 용어이므로 변경 대상이 아니다.

문서/코드 반영 방향:

- 룩 도메인 asset과 mock data는 `Look` 계열을 사용한다.
  - `makeupStyleImages` → `makeupLookImages`
  - `styleCardImage` → `lookCardImage`
  - `makeupStyleCards` → `makeupLookCards`
- 타입/컴포넌트/상태도 룩 의미라면 `Look` 계열을 사용한다.
  - `MakeupStyle` → `MakeupLook`
  - `MakeupStyleCard` → `MakeupLookCard`
  - `selectedStyleId` → `selectedLookId`
  - `selectedMakeupStyleCardId` → `selectedMakeupLookId`
- 이미 5.1에서 정한 `ExtractedMakeupStyle*` 계열도 2026-06-26 rename 작업에서 `ExtractedMakeupLook*` 계열로 반영했다.
- React Native `style` prop, `StyleSheet`, `styles.container` 같은 스타일링 코드는 변경하지 않는다.

### 5.12 AR 필터 저장이 `ExtractedMakeupStyleSaveForm`으로 이동함

질문:
AR 필터 저장 화면이 `ExtractedMakeupStyleSaveForm` 이름을 쓰는 것은 현재 도메인에 맞지 않으니, `MakeupFilterSaveScreen` 계열로 바꿀까?

결정: 필터 저장 화면은 `MakeupFilterSave` 계열로 정리한다.

이유:

- 사용자에게 저장되는 단위는 토탈메이크업룩 또는 포인트메이크업룩이다.
- 레퍼런스 사진에서 추출한 룩뿐 아니라, AR 화면에서 직접 조합/수정한 룩도 저장 대상이다.
- `ExtractedMakeupStyleSaveForm`은 레퍼런스 추출 결과만 저장하는 화면처럼 읽히고, `Style`도 레거시 용어다.
- `MakeupLookSaveScreen`은 나중에 `MakeupLookReportSaveScreen`처럼 룩 관련 보고서/산출물 저장 화면이 생기면 의미가 넓게 충돌할 수 있다.
- `MakeupLookFilterSaveScreen`은 의미는 드러나지만 영어 복합어가 길고, `LookFilter`가 "룩을 필터링하는 기능"처럼 읽힐 여지가 있다.
- 저장/적용 가능한 효과 전체의 상위 개념을 `MakeupFilter`로 두기로 했으므로, 필터 저장 화면은 `MakeupFilterSave` 계열이 가장 짧고 명확하다.

문서/코드 반영 방향:

- 필터 저장 화면/폼은 `MakeupFilterSave` 계열을 사용한다.
  - `MakeupFilterSaveScreen`
  - `MakeupFilterSave`
  - `makeupFilterSaveState`
  - `submitMakeupFilterSave`
- 저장 대상 범위는 룩 타입으로 구분한다.
  - `TotalMakeupLook`
  - `PointMakeupLook`
- 필터 엔진, 저장소, 적용 시스템처럼 전체 효과 단위를 다루는 내부 계층에서도 `MakeupFilter` 계열을 사용한다.
  - `MakeupFilter`
  - `savedMakeupFilters`
  - `applyMakeupFilter`
- 저장 화면 내부에서 저장 대상 룩의 종류는 `TotalMakeupLook` 또는 `PointMakeupLook`으로 구분한다.
- 룩 보고서 저장 기능이 생기면 `MakeupLookReportSaveScreen`처럼 산출물 성격을 포함한 이름을 사용한다.
- 기존 `ExtractedMakeupStyleSaveForm`은 2026-06-26 rename 작업에서 `MakeupFilterSave`로 반영했다.
- route 화면명과 화면 컴포넌트는 `MakeupFilterSave` 계열을 사용한다. 내부 폼 컴포넌트를 별도로 만들 때만 `MakeupFilterSaveForm`처럼 `Form`을 붙인다.

### 5.13 `FacePartId`, `MakeupStyleFaceArea`, `GuideCategory` 부위 타입 분산

질문:
부위 타입이 `FacePartId`, `MakeupStyleFaceArea`, `GuideCategory`처럼 흩어져 있으니, 메이크업 적용/저장 범위의 기준 타입은 `MakeupArea`로 통합할까?

결정: 메이크업 부위 기준 타입은 `MakeupArea`로 통합한다.

이유:

- `MakeupArea`는 메이크업 부위 자체를 뜻한다.
- `MakeupTargetArea`는 특정 동작의 적용 대상이라는 뉘앙스가 강해 기준 타입명으로는 조금 무겁다.
- 기준 타입은 `MakeupArea`로 짧게 두고, 선택/적용/저장 같은 맥락은 변수명에서 표현하는 편이 자연스럽다.
- `FacePartId`, `MakeupStyleFaceArea`, `GuideCategory`처럼 기능별 타입이 따로 있으면 같은 부위를 서로 다른 값으로 변환해야 해서 구현과 문서가 복잡해진다.

문서/코드 반영 방향:

- 메이크업 적용/저장/편집 범위의 기준 타입은 `MakeupArea`를 사용한다.
  - `MakeupArea`
  - `selectedMakeupArea`
  - `targetMakeupArea`
  - `makeupAreaScope`
- `MakeupArea`는 토탈/포인트 메이크업룩의 적용 범위를 표현할 수 있어야 한다.
  - `total`
  - `lip`
  - `eye`
  - `eyeShadow`
  - `eyeLine`
  - `eyelash`
  - `contactLens`
  - `aegyosal`
  - `cheek`
  - `eyebrow`
  - `contour`
- 얼굴 인식 모델의 물리적 얼굴 부위나 랜드마크 그룹은 `FacePart` 또는 `FaceLandmarkGroup`처럼 별도 타입으로 둘 수 있다.
- 가이드/튜토리얼 분류는 `GuideCategory` 대신 목적에 따라 `TutorialCategory`, `MakeupRecipeCategory`, `MakeupGuidelineCategory`처럼 분리한다.
- 기존 `MakeupStyleFaceArea`는 2026-06-26 rename 작업에서 `MakeupArea`로 반영했다.
