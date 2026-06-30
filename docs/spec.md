# 15개 추천 메이크업 필터 패널 스펙

## 1. 목표

홈 화면의 `저장된 메이크업` 패널을 `추천 메이크업 필터` 패널로 교체한다. 이 패널은 사용자가 이미 저장한 룩을 보여주는 영역이 아니라, 사용자 얼굴과 어울릴 가능성이 높은 AR 메이크업 필터를 추천하는 영역이다.

추천 필터는 앱에 준비된 메이크업 필터 후보를 키워드, mock embedding vector, mock match score 기준으로 정렬해서 보여준다. 현재 단계에서는 실제 백엔드 임베딩, 실제 얼굴 기반 추천, 실제 이미지 분석을 구현하지 않고, 나중에 API로 교체 가능한 mock service 구조로 만든다.

사용자는 추천 카드에서 필터를 고르고, 해당 카드 썸네일에 보이는 메이크업이 추출된 것처럼 구성된 AR 필터를 자신의 얼굴에 적용한다. AR 화면에서는 기존 얼굴 진단/AR 흐름과 유사하게 반반 가이드, 세부 옵션 조정, 랜드마크/형태 조정을 할 수 있다. 저장한 필터는 마이페이지의 `메이크업 룩`에 저장된다.

## 2. 안전 원칙

추천 카드 이미지는 "배우, 연예인, 인플루언서 같은 감도 있는 화보" 느낌을 지향하되, 실존 인물의 사진, 이름, 닮은꼴, 특정 인물을 떠올리게 하는 프롬프트를 사용하지 않는다. 모든 이미지는 가상 모델 기반 asset으로 생성하거나, 라이선스가 명확한 이미지로만 대체한다.

외부 URL 이미지는 초상권, 라이선스, 네트워크 안정성 문제가 있으므로 기본 구현에서 제외한다. 이미지는 앱 번들 asset으로 저장한다.

각 필터는 서로 다른 모델 얼굴을 사용한다. 같은 얼굴에 메이크업만 바꾸는 방식은 금지한다. 얼굴형, 피부톤, 눈매, 헤어, 표정, 조명, 구도까지 최대한 다르게 구성한다.

`쿠로갸루`는 브론즈 태닝, 골드 하이라이트, 강한 아이 메이크업을 가진 패션 서브컬처로만 표현한다. 인종적 캐리커처, 과도한 피부색 과장, 희화화된 표현은 금지한다.

`지뢰계`, `소프트 고스`, `뱀파이어`, `그런지` 계열은 색조/패션 스타일로만 표현한다. 자해, 병약함, 폭력성, 위험 행동 연출은 넣지 않는다.

이미지에는 브랜드 로고, 워터마크, SNS 핸들, 잡지명, 실존 인물명, 제품명이 들어가면 안 된다. 카드 텍스트는 이미지에 직접 합성하지 않고 React Native UI 오버레이로 렌더링한다.

## 3. 사용자 경험

홈 화면에서 사용자는 `추천 메이크업 필터` 섹션을 본다. 카드에는 모델 얼굴 이미지가 크게 보이고, 이미지 하단에는 어두운 scrim 위에 다음 형태의 문구가 표시된다.

```text
차가운 도시의
클린 스모키
```

카드는 단순한 상품 카드가 아니라 화보형 필터 버튼처럼 보여야 한다. 사용자는 카드를 누르면 바로 AR 필터 화면으로 이동한다.

AR 화면 진입 시 선택한 필터가 이미 적용된 상태여야 한다. 추천 필터 진입의 기본 모드는 `반반 가이드`이며, 왼쪽 또는 오른쪽 얼굴에 필터 적용 상태를 비교할 수 있어야 한다.

AR 화면 하단에서는 다음 조정이 가능해야 한다.

- 메이크업 영역 선택: 전체, 베이스, 아이, 브로우, 치크, 립, 컨투어
- 옵션 그룹 선택: 룩, 컬러, 타입, 질감, 형태
- 필터 세부 옵션 변경
- 형태/랜드마크 조정 화면 진입
- 저장

저장 후에는 마이페이지의 `메이크업 룩`에 저장된 필터가 가장 앞에 보인다. 전체 메이크업 룩 목록에서도 동일하게 보인다.

## 4. 추천 필터 15개

| id | 카드 카피 | 필터명 | 주요 트렌드 | 핵심 색감 | AR 영역 |
| --- | --- | --- | --- | --- | --- |
| `filter-clean-smoky-city` | 차가운 도시의 | 클린 스모키 | 홑꺼풀 스모키, 차도녀 | 쿨 브라운, 그레이 베이지, 로즈 누드 | eye, brow, lip, cheek |
| `filter-gyaru-glow` | 빛나는 거리의 | 갸루 글로우 | 갸루 메이크업 | 샴페인 펄, 코랄 핑크, 또렷한 라이너 | eye, cheek, lip |
| `filter-kuro-gyaru-bronze` | 브론즈 태닝의 | 쿠로갸루 무드 | 쿠로갸루 | 브론즈 베이스, 골드 하이라이트, 누드 글로스 | base, eye, cheek, lip |
| `filter-one-gyaru-rose` | 단정한 어른빛 | 오네갸루 로즈 | 오네갸루 | 로즈 브라운, 소프트 래쉬, 새틴 립 | eye, brow, lip |
| `filter-water-glow-clean` | 하얀 조명의 | 물광 클린 | 물광, 투명 메이크업 | 클리어 베이스, 젤리 핑크, 투명 치크 | base, cheek, lip |
| `filter-glass-skin-nude` | 유리알 피부의 | 윤광 누디 | 윤광, 누디 메이크업 | 누드 베이지, 피부광, 연한 브라운 | base, contour, lip |
| `filter-milky-strawberry-pink` | 딸기 우유빛 | 밀키 핑크 | 딸기우유 립, 코켓, 발레코어 | 밀키 핑크, 라이트 모브, 소프트 블러셔 | cheek, lip, eye |
| `filter-mori-girl-natural` | 숲속 오후의 | 모리걸 내추럴 | 모리걸 | 세이지 브라운, 살구 베이지, 소프트 매트 | brow, cheek, lip |
| `filter-dolly-larme` | 인형 같은 시선의 | 돌리 라르무 | 돌리, Larme Kei | 핑크 베이지, 언더 포인트, 글로시 립 | eye, cheek, lip |
| `filter-igari-blush` | 붉게 번진 | 이가리 블러시 | 숙취 메이크업, 도화살 | 애프리콧 레드, 코랄 블러셔, 촉촉한 립 | cheek, lip |
| `filter-juice-coral` | 과즙 터지는 | 자몽 코랄 | 과즙 메이크업 | 자몽 코랄, 투명 글로스, 밝은 치크 | cheek, lip, eye |
| `filter-douyin-pink` | 렌즈광 같은 | 도우인 핑크 | 도우인, 왕홍 | 핑크 펄, 애교살, 글리터 포인트 | eye, cheek, lip |
| `filter-latte-brown` | 따뜻한 카페의 | 라떼 브라운 | 라떼, 음영 정석 | 밀크 브라운, 토스트 베이지, 소프트 컨투어 | eye, contour, lip |
| `filter-office-siren` | 날카로운 출근길 | 오피스 사이렌 | Office Siren, Sleek | 쿨 토프, 얇은 아이라인, 뮤트 립 | eye, brow, contour, lip |
| `filter-soft-goth` | 희미한 밤의 | 소프트 고스 | Soft Goth, 90s Grunge | 플럼 브라운, 번진 스모키, 딥 로즈 립 | eye, lip, contour |

## 5. 이미지 asset 요구사항

새 asset 폴더를 사용한다.

```text
apps/mobile/src/assets/images/makeup-filters/
```

파일명은 필터 id와 맞춘다.

```text
filter-clean-smoky-city.png
filter-gyaru-glow.png
filter-kuro-gyaru-bronze.png
filter-one-gyaru-rose.png
filter-water-glow-clean.png
filter-glass-skin-nude.png
filter-milky-strawberry-pink.png
filter-mori-girl-natural.png
filter-dolly-larme.png
filter-igari-blush.png
filter-juice-coral.png
filter-douyin-pink.png
filter-latte-brown.png
filter-office-siren.png
filter-soft-goth.png
```

이미지는 정사각형 1200x1200을 기본으로 한다. 얼굴이 메이크업을 확인할 수 있을 만큼 가까워야 하고, 모바일 카드에서 잘려도 핵심 색조가 보이도록 중앙 구도를 유지한다.

이미지 생성 시 각 프롬프트는 다음 공통 조건을 포함한다.

- fictional model only
- no celebrity resemblance
- beauty editorial portrait
- close-up face composition
- clean studio or editorial background
- no text, no logo, no watermark
- makeup clearly visible
- premium K-beauty tech mood

## 6. 데이터 모델

`MakeupFilter` 또는 이를 확장한 `RecommendedMakeupFilter`에 다음 필드를 둔다.

```ts
type RecommendedMakeupFilter = MakeupFilter & {
  headline: string;
  displayTitle: string;
  description: string;
  keywords: readonly string[];
  embeddingVector: readonly number[];
  matchScore: number;
  sourceImageId: string;
  categoryTags: readonly string[];
  presetValues: {
    makeupArea: MakeupArea;
    colorId: string;
    typeId: string;
    textureId: string;
    shapeId: string;
    intensity: number;
    finish: string;
  };
};
```

기존 AR 필터 화면과 호환되도록 `imageSource`, `categoryId`, `title`, `subtitle`, `intensityLabel`, `makeupAreas`, `colorOptions`, `typeOptions`, `textureOptions`는 유지한다.

`displayTitle`은 카드 표시용 한국어 이름이고, 기존 `title`은 AR 옵션 카드와 접근성에서 함께 사용할 수 있다. 구현 시 중복이 부담되면 `title`을 표시명으로 쓰고 `headline`만 추가해도 된다.

## 7. 추천 정렬

현재 구현은 mock 추천으로 처리한다.

추천 service는 다음 함수를 제공한다.

```ts
getRecommendedMakeupFilters(userProfileVector?)
sortMakeupFiltersByRecommendationScore(filters, userProfileVector)
getRecommendedMakeupFilterById(filterId)
mapMakeupFilterToSavedLook(filter)
```

정렬 점수는 다음 순서로 계산한다.

1. 사용자 얼굴 분석/취향 키워드와 필터 `keywords`의 겹침
2. mock `embeddingVector` cosine similarity
3. `matchScore`
4. 필터 id 기준 안정 정렬

현재 사용자 profile vector가 없으면 기본 mock vector를 사용한다. 필터 데이터가 비어 있으면 15개 기본 필터를 그대로 반환한다.

홈에는 상위 6개 또는 8개를 보여준다. `전체 보기` 화면에는 15개 전체를 보여준다.

## 8. 홈 UI

`HomeScreen`에서 기존 `저장된 메이크업` 섹션을 제거하고 `추천 메이크업 필터` 섹션으로 교체한다.

섹션 구성:

- 제목: `추천 메이크업 필터`
- 보조 카피: `얼굴 무드에 맞춰 바로 적용해볼 수 있어요.`
- 액션: `전체 보기`
- 카드: 가로 스크롤

카드 구성:

- 이미지
- 하단 scrim
- `headline`
- `displayTitle`
- match pill: `92% match`
- action pill: `AR 적용`

카드 전체가 버튼이다. 탭하면 다음 route로 이동한다.

```ts
navigation.navigate('ARFilter', {
  initialMakeupFilterId: filter.id,
  initialGuideMode: 'half',
  source: 'recommendedFilter',
});
```

카드의 텍스트는 2줄 고정 구조를 우선한다. 긴 문구는 말줄임보다 짧은 카피를 데이터 단계에서 유지한다.

## 9. 전체 필터 화면

`FilterStoreScreen`은 15개 추천 필터 전체 목록 화면으로 재정의한다.

상단 요약:

- 제목: `추천 필터`
- 설명: `썸네일의 메이크업을 AR 필터로 바로 적용해요.`

카테고리 칩:

- 전체
- 글로우
- 스모키
- 핑크
- 브라운
- 트렌드
- 유니크

그리드:

- 2열
- 이미지 위 오버레이 텍스트
- 하단 설명
- 키워드 chip 2개
- match score

15개 고정 목록이므로 검색은 이번 범위에서 제외한다.

## 10. AR 진입

`RootStackParamList.ARFilter`를 다음처럼 확장한다.

```ts
ARFilter:
  | {
      initialMakeupFilterId?: string;
      initialGuideMode?: GuideMode;
      source?: 'quickAction' | 'recommendedFilter' | 'savedLook';
    }
  | undefined;
```

추천 필터에서 진입하면:

- `selectedMakeupArea`: `all`
- `selectedTotalMakeupLookId`: `initialMakeupFilterId`
- `guideMode`: `half`
- `selectedComparisonMode`: `left`
- 저장 버튼: 활성화

기존 빠른 실행 AR 버튼에서 진입하면 현재 기본 동작을 유지한다.

## 11. AR mock extraction

실제 썸네일 이미지 분석은 구현하지 않는다. 각 필터 데이터의 `presetValues`가 "썸네일에서 추출된 메이크업" 역할을 한다.

AR recipe 생성은 기존 `createUnityMakeupRecipeBatchFromARFilterSelections` 흐름을 사용한다. 필요한 경우 다음 helper를 추가한다.

```ts
createARSelectionStateFromMakeupFilter(filter)
createUnityRecipeFromRecommendedFilter(filter)
```

각 필터의 preset은 Unity layer에 다음처럼 연결한다.

- `base`: 피부광, 윤광, 브론즈 표현
- `eye`: 스모키, 글리터, 애교살, 라인
- `brow`: 일자, 슬릭, 소프트 아치
- `cheek`: 이가리, 코랄, 밀키 핑크
- `lip`: MLBB, 글로스, 플럼, 탕후루 광택
- `contour`: 라떼, 오피스 사이렌, 소프트 고스

## 12. 조정 UX

AR 화면 하단 기존 구조를 유지한다.

- 메이크업 영역 탭
- 옵션 그룹 탭
- 룩/컬러/타입/질감/형태 카드
- 형태 수정 버튼
- 저장 버튼
- 촬영/완료 컨트롤

추천 필터 진입 시 선택된 룩 카드가 활성화되어 보여야 한다. 사용자가 세부 옵션을 바꾸면 기존처럼 `hasUnsavedMakeupChanges`가 true가 된다.

추천 진입의 저장 버튼은 처음부터 활성화한다. 사용자는 추천 필터를 수정하지 않아도 그대로 저장할 수 있어야 한다.

랜드마크/형태 조정 화면에서 저장 후 AR로 돌아오면 선택 필터 상태가 유지되어야 한다.

## 13. 저장 플로우

권장 흐름:

```text
추천 카드 탭
→ ARFilter
→ 저장
→ MakeupFilterSave
→ MakeupFilterSaveComplete
→ 마이페이지 또는 AR 재적용
```

`MakeupFilterSaveScreen`은 reference extraction 전용 문구를 일반화한다.

- 기존: `추출된 메이크업 룩`
- 변경: `저장할 메이크업 룩`

저장 payload:

```ts
{
  id: `saved-${filter.id}-${timestamp}`,
  title: filter.displayTitle,
  moodLabel: filter.headline,
  shortDescription: filter.description,
  imageSource: filter.imageSource,
  isSaved: true,
  scope: 'totalMakeup',
  makeupArea: 'all',
  makeupPresetValues: filter.presetValues,
}
```

저장된 룩은 `NavigationFlowState.savedMakeupLook`에 저장하고, 프로필 미리보기와 전체 룩 목록 앞에 추가한다.

## 14. Navigation state

`NavigationFlowState`에 추천 필터 흐름을 위한 상태를 추가한다.

```ts
selectedRecommendedMakeupFilterId: string | null;
savedMakeupLook: MakeupLookPreview | null;
```

필터 object 전체를 route param으로 넘기지 않고 id만 넘긴다. 화면은 service에서 id로 다시 조회한다. 이 방식이 딥링크, 새로고침, 테스트에 안전하다.

## 15. 접근성

카드 접근성 라벨은 다음 정보를 포함한다.

```text
차가운 도시의 클린 스모키, 92퍼센트 추천, AR 적용
```

이미지 위 텍스트는 충분한 대비를 갖는다. scrim은 이미지 하단 텍스트 영역에만 적용한다. match score만으로 의미를 전달하지 않고, `추천` 또는 `match` 텍스트를 함께 사용한다.

## 16. 완료 기준

- 홈 화면에 `저장된 메이크업` 패널이 보이지 않는다.
- 홈 화면에 `추천 메이크업 필터` 패널이 보인다.
- 추천 필터는 15개다.
- 15개 필터는 서로 다른 모델 얼굴 asset을 사용한다.
- 각 카드에는 이미지 위에 `headline`과 `displayTitle`이 보인다.
- 카드 탭 시 선택 필터가 적용된 AR 화면으로 이동한다.
- 추천 AR 진입은 `반반 가이드` 모드로 시작한다.
- AR에서 세부 조정, 형태/랜드마크 조정, 저장이 가능하다.
- 저장한 필터는 마이페이지 `메이크업 룩`과 전체 룩 목록에 보인다.
- TypeScript 에러가 없다.
- 새 UI 라이브러리를 추가하지 않는다.
