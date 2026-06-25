# Frontend Work Guide

## 프로젝트 개요

AI AR Makeup Guide는 사용자의 얼굴, 피부톤, 취향, 분위기를 바탕으로 개인 맞춤 메이크업 룩을 추천하고, AR 가이드를 통해 실제 메이크업 적용을 도와주는 모바일 앱입니다.

이 프로젝트의 핵심 가치는 단순한 메이크업 필터가 아니라, 추천 → AR 적용 → 사용자 편집 → 피드백 → 재추천으로 이어지는 개인화 메이크업 가이드 경험을 제공하는 것입니다.

## 현재 개발 범위

현재 단계에서는 프론트엔드 UI/UX 구현을 우선합니다.

- 백엔드 API, Unity AR, ARKit, ARCore, AI 추천 로직은 실제 구현하지 않습니다.
- 필요한 데이터는 mock 데이터로 처리합니다.
- 나중에 실제 API 또는 Unity 모듈로 교체할 수 있도록 interface와 service layer를 분리합니다.
- 프론트엔드 작업 중 임의로 백엔드 서버, 데이터베이스, Unity 프로젝트, 네이티브 AR 코드를 생성하지 않습니다.
- 이 프로젝트의 모바일 앱은 iOS 우선으로 작업합니다.

## 기술 스택

- React Native
- TypeScript
- React Navigation
- UI 라이브러리는 Tamagui만 사용합니다.
- 상태 관리는 팀에서 확정한 방식을 따릅니다.
- 스타일링은 기존 코드 스타일을 우선 따릅니다.
- 새 라이브러리는 팀 합의 없이 추가하지 않습니다.
- Tamagui 외의 UI 라이브러리는 추가하지 않습니다.

## 우선 구현 화면

현재 우선 구현 화면은 다음과 같습니다.

1. Login Screen
2. Signup Screen
3. Onboarding Screen
4. Home Screen
5. Face Capture Screen
6. Face Analysis Loading Screen
7. Face Analysis Result Screen
8. AR Makeup Guide Screen
9. Saved Looks Screen
10. My Page Screen
11. Profile Edit Screen

현재 우선순위는 로그인, 회원가입, 홈, 로딩 화면, 마이페이지 UI 구현입니다. 구현 시 실제 API 연동보다 화면 흐름, 컴포넌트 구조, mock 데이터 연결, 모바일 UI 완성도를 우선합니다.

## 디자인 방향

전체 디자인 톤은 Premium K-beauty tech를 기준으로 합니다.

- 현재 디자인은 블랙 & 화이트 컬러를 중심으로 구현합니다.
- 포인트 컬러 사용은 최소화하며, 필요한 경우 팀 합의 후 적용합니다.
- 전체 UI는 흑백 기반의 깔끔하고 프리미엄한 K-beauty tech 무드를 유지합니다.
- 깔끔하고 부드러운 카드형 UI를 사용합니다.
- 과하게 화려한 네온, 사이버펑크, 어두운 대시보드 스타일은 지양합니다.
- 둥근 모서리와 은은한 그림자를 사용합니다.
- 한국어 문구는 짧고 자연스럽게 작성합니다.
- 모바일 기준으로 여백을 넉넉하게 사용합니다.
- W 402 x H 874 모바일 프레임을 우선 고려합니다.

## 폴더 구조

프론트엔드 코드는 `apps/mobile/src` 아래에 둡니다.

```text
apps/mobile/src/
  app/
  assets/
  config/
  features/
  shared/
```

권장 구조는 다음과 같습니다.

```text
apps/mobile/src/
  app/
    navigation/
  assets/
    images/
    icons/
    fonts/
  config/
  features/
    ar/
    auth/
    face-capture/
    home/
    face-analysis/
    makeup-feedback/
    onboarding/
    preference/
    profile/
    recipe/
    recommendation/
    reference-makeup-extraction/
  shared/
    api/
    hooks/
    mocks/
    services/
    theme/
    types/
    ui/
    utils/
```

## 폴더 규칙

- `app`: 앱 초기화, navigation, 전역 provider 구성을 둡니다.
- `features`: 특정 기능 단위의 화면, 컴포넌트, hook, service를 둡니다.
- `shared/ui`: 여러 화면에서 재사용되는 공통 UI 컴포넌트를 둡니다.
- `shared/theme`: 색상, spacing, typography, radius 등 디자인 토큰을 둡니다.
- `shared/services`: API 호출 함수 또는 mock service 함수를 둡니다.
- `shared/mocks`: 백엔드 없이 사용할 mock 데이터를 둡니다.
- `shared/types`: 여러 feature에서 공유하는 TypeScript 타입을 둡니다.
- `assets`: 이미지, 아이콘, 폰트 등 정적 리소스를 둡니다.

## 코드 스타일

- TypeScript를 사용합니다.
- `any` 사용을 피합니다.
- 컴포넌트는 작고 재사용 가능하게 작성합니다.
- 화면 컴포넌트와 공통 UI 컴포넌트를 분리합니다.
- 공통 UI 컴포넌트는 Tamagui 기반으로 작성합니다.
- 반복되는 색상, spacing, font size는 theme 파일에서 관리합니다.
- 화면 컴포넌트 안에 복잡한 비즈니스 로직을 직접 넣지 않습니다.
- 실제 API가 없으면 mock 데이터를 사용합니다.
- mock 데이터도 실제 API 응답으로 교체하기 쉬운 형태로 작성합니다.
- 사용하지 않는 코드, 불필요한 `console.log`, 임시 주석은 정리합니다.

## Mock 데이터 규칙

현재 백엔드 API는 구현 전이므로 모든 데이터는 mock 데이터로 처리합니다.

- API 연동이 필요한 부분은 service 함수로 분리합니다.
- 화면 컴포넌트에서 직접 `fetch`를 작성하지 않습니다.
- mock 데이터는 실제 API 응답으로 교체하기 쉬운 형태로 작성합니다.

예시:

```text
features/recommendation/screens/ResultScreen.tsx
→ features/recommendation/services/makeupService.ts
→ features/recommendation/mocks/makeup.mock.ts
```

또는 여러 feature에서 공유되는 데이터라면:

```text
shared/services/makeupService.ts
shared/mocks/makeup.mock.ts
```

## 네이밍 규칙

- 컴포넌트 파일은 PascalCase를 사용합니다.
  - 예: `LoginScreen.tsx`, `PrimaryButton.tsx`
- hook은 `use`로 시작합니다.
  - 예: `useAuthForm.ts`
- type/interface는 의미가 드러나게 작성합니다.
  - 예: `UserProfile`, `MakeupLook`, `FaceAnalysisReport`
- mock 데이터 파일은 `*.mock.ts` 또는 명확한 mock 이름을 사용합니다.
  - 예: `makeup.mock.ts`, `user.mock.ts`

## 도메인 네이밍 규칙

- 사용자가 저장, 추천, 추출 결과로 인식하는 메이크업 단위는 `Look/룩`을 기본으로 사용합니다.
  - 예: `MakeupLook`, `MakeupLookPreview`, `makeupLooksMock`, `savedMakeupLook`
- React Native의 `style`, `StyleSheet`, `styles`는 UI 스타일링 용어이므로 `Look`으로 바꾸지 않습니다.
- 레퍼런스 이미지에서 메이크업 정보를 분석해 추출하는 현재 플로우는 `ReferenceMakeupExtraction`을 사용합니다.
  - 예: `ReferenceMakeupExtractionUploadScreen`, `ReferenceMakeupExtractionResultScreen`
- 레퍼런스 추출의 결과 타입은 `ReferenceMakeupExtractionResult`를 사용합니다.
  - 예: `makeupExtractionService`, `ReferenceMakeupExtractionResult`
- 메이크업 피드백 플로우는 단독 `Feedback` 대신 `MakeupFeedback`을 사용합니다.
  - 예: `MakeupFeedbackEntryScreen`, `MakeupFeedbackResult`, `analyzeMakeupForFeedback`
- `Correction`은 수정 포인트, 수정팁, 수정 가이드처럼 실제 보정 방법을 다루는 이름에만 사용합니다.
  - 예: `MakeupCorrectionTipScreen`, `MakeupCorrectionGuideOverlayScreen`
- `Filter`는 실제 AR 필터, 필터 적용, 필터 생성, 필터 프리셋 의미일 때만 사용합니다.
  - 예: `ARFilter`, `MakeupFilterGeneration`, `MakeupFilterPreset`
- React Native의 `style` prop, `StyleSheet`의 `styles` 객체, 영어 동사 `look` 의미의 이름은 도메인 네이밍 정리 대상이 아닙니다.
  - 예: `styles.container`, `isLookingForward`
- 기존 이미지 asset의 `look-*.png` 파일명은 import 영향이 크므로 별도 asset 정리 작업이 있을 때만 변경합니다.

## 하지 말아야 할 것

- 백엔드 서버 코드를 임의로 만들지 않습니다.
- Unity, ARKit, ARCore 실제 구현 코드를 임의로 만들지 않습니다.
- 팀 합의 없이 새로운 라이브러리를 추가하지 않습니다.
- Tamagui 외의 UI 라이브러리를 임의로 추가하지 않습니다.
- 기존 폴더 구조를 큰 폭으로 바꾸지 않습니다.
- 실제 개인정보, API key, token을 코드에 넣지 않습니다.
- 디자인 톤과 다른 스타일을 임의로 적용하지 않습니다.
- 임시 화면을 만들더라도 추후 연결이 불가능한 구조로 만들지 않습니다.

## 완료 기준

프론트엔드 작업 완료 기준은 다음과 같습니다.

- 모바일 화면 기준으로 레이아웃이 깨지지 않습니다.
- TypeScript 에러가 없어야 합니다.
- 기본 화면 이동 흐름이 동작해야 합니다.
- mock 데이터로 주요 UI 상태를 확인할 수 있어야 합니다.
- 공통 UI 컴포넌트는 재사용 가능하게 분리되어야 합니다.
- 실제 API 연동 전에도 화면 데모가 가능해야 합니다.

## 발표 데모 우선순위

수요일 발표 또는 중간 점검을 위해 다음 흐름을 우선적으로 보여줄 수 있어야 합니다.

```text
로그인 또는 시작 화면
→ 홈 화면
→ 얼굴 분석/촬영 진입
→ AI 분석 로딩 화면
→ AI 얼굴 분석 결과 화면
→ AR 가이드 화면 또는 저장 화면
```

데모는 기능 나열이 아니라 실제 사용자가 앱을 사용하는 흐름처럼 보여주는 것을 우선합니다.

## 협업 규칙

- 작업 전 담당 화면과 파일 범위를 명확히 확인합니다.
- 다른 팀원의 화면이나 공통 컴포넌트를 수정할 경우 변경 이유를 남깁니다.
- 큰 구조 변경은 팀원에게 먼저 공유합니다.
- 하루 단위로 실제 동작하는 화면 또는 코드 결과물을 확인합니다.
- 발표용으로 필요한 화면은 완성도를 우선하고, 내부 로직은 mock으로 대체할 수 있습니다.
- Codex는 파일을 수정한 뒤 최종 응답에 수정한 파일 경로를 항상 명시합니다.

## 충돌 방지 규칙

충돌이 자주 나는 파일은 수정 전 팀에 공유합니다.

```text
apps/mobile/package.json
apps/mobile/package-lock.json
apps/mobile/ios/Podfile
apps/mobile/ios/Podfile.lock
apps/mobile/src/app/navigation/
apps/mobile/src/shared/theme/
apps/mobile/src/shared/ui/
```

규칙:

- 기능 구현, 의존성 변경, UI 시스템 변경, 전체 포맷팅 변경은 별도 PR로 분리합니다.
- 관련 없는 파일을 수정하지 않습니다.
- 전체 프로젝트 포맷팅을 임의로 실행하지 않습니다.
- lockfile은 직접 수정하지 않습니다.
- 작업 시작 전 최신 `dev`를 pull 합니다.

## Codex 작업 요청 프롬프트 작성법

팀원이 Codex에게 작업을 요청할 때는 아래 정보를 같이 적습니다.

```text
1. 작업할 화면 또는 feature
2. 수정 가능한 파일 범위
3. 디자인 톤 또는 참고 화면
4. 사용할 mock 데이터
5. 건드리면 안 되는 파일
6. 완료 기준
```

좋은 예시:

```text
apps/mobile에서 Login Screen UI를 구현해줘.

범위:
- apps/mobile/src/features/auth/
- apps/mobile/src/shared/ui/
- apps/mobile/src/shared/theme/

조건:
- 실제 API 연동하지 말고 mock login service만 만들어줘.
- 블랙 & 화이트 기반 Premium K-beauty tech 톤으로 구현해줘.
- 새로운 라이브러리는 추가하지 마.
- navigation 구조는 필요한 최소 범위만 수정해줘.
- TypeScript any는 쓰지 마.

완료 기준:
- 로그인 화면이 모바일 기준으로 깨지지 않아야 함.
- mock 로그인 성공/실패 상태를 확인할 수 있어야 함.
- 재사용 가능한 버튼/입력 컴포넌트는 shared/ui로 분리해줘.
```

나쁜 예시:

```text
로그인 만들어줘.
예쁘게 해줘.
필요한 거 다 알아서 해줘.
```

이런 요청은 범위가 불명확해서 다른 팀원의 작업 파일과 충돌하거나, 불필요한 의존성이 추가될 수 있습니다.

## 작업 요청 템플릿

아래 템플릿을 복사해서 사용합니다.

```text
[작업 요청]
작업할 화면/기능:

수정 가능한 파일 범위:

건드리면 안 되는 파일:

디자인 방향:

사용할 mock 데이터:

필요한 navigation 흐름:

새 라이브러리 추가 가능 여부:
- 불가능

완료 기준:
- 
- 
- 
```
