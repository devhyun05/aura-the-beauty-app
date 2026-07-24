# RN 포트 — 원본 HTML 대비 불가피한 편차 목록

원본: `얼굴 분석 보고서.dc.html` (single source of truth). 아래 항목 외의 모든 레이아웃·간격·색·타이포·카피·인터랙션은 1:1입니다.

1. **S4 조명 필터** — HTML은 CSS `filter: sepia()/hue-rotate()/saturate()`로 셀피를 재조명. RN 코어에는 색 필터가 없어 **웜/쿨 틴트 오버레이**(#D7913C / #3C96D7, 다이얼 값에 비례한 opacity)로 근사했습니다. 픽셀 단위 재현이 필요하면 `@shopify/react-native-skia`의 ColorMatrix로 교체 가능(허용 목록에 있음).
2. **얼굴 윤곽 도형(S6·S7)** — HTML의 4축 타원형 `border-radius: 50% 50% 46% 46% / 42%…`는 RN에서 표현 불가. `react-native-svg` Path(계란형 곡선, `FACE_PATH`)로 근사.
3. **사진 위 가이드선의 글로우** — CSS `box-shadow: 0 0 8px`을 View 기반 가로선에는 RN shadow로 재현했으나, SVG 스트로크(S3 가이드)에는 그림자가 없어 글로우가 빠집니다(선 두께·색·대시는 동일).
4. **backdrop-filter 필** — `expo-blur` BlurView + 동일 반투명 배경으로 재현. Android에서는 블러 강도가 iOS와 미세하게 다를 수 있음.
5. **스와치 선택 링** — CSS `box-shadow 0 0 0 2.5px #fff, 0 0 0 5px accent`는 레이아웃 비침범. RN에서는 절대배치 오버레이 2겹(동일 지오메트리)으로 재현 — 시각 결과 동일.
6. **인셋 섀도** — S2 활성 밴드의 `inset box-shadow`는 2px 흰 보더로, 조명 다이얼의 인셋 섀도는 생략(1px 보더만). RN은 inset shadow 미지원.
7. **rise-in 트리거** — IntersectionObserver 대신 reanimated `measure()` + 스크롤 오프셋 감지. 타이밍·이징(.55s cubic-bezier(.22,.9,.3,1))·16px 오프셋은 동일.
8. **S7 슬라이더 썸** — `<input type="range" accent-color>` 대신 `@react-native-community/slider`. iOS 썸은 시스템 흰색(교체 불가), 트랙 색은 동일. 필요시 커스텀 썸은 reanimated로 별도 구현 가능.
9. **해칭 패턴** — `repeating-linear-gradient(135deg …)`를 SVG Pattern으로 재현(각도·스트라이프 폭 동일).
10. **간격 토큰화 범위** — 색·라운드·타입·섀도는 `reportTokens.ts`로 전부 토큰화. 간격은 HTML의 픽셀 리듬을 그대로 보존하기 위해 공통 리듬(`space`)만 토큰이고 나머지는 원본과 동일한 리터럴입니다.
11. **상단바 여백** — HTML의 `padding-top: 64px`(상태바 포함 고정값)는 기기별 safe-area(`useSafeAreaInsets`) 기반으로 치환: `max(inset.top, 54) + 10`.
12. **모노스페이스 플레이스홀더** — 사진 슬롯/실루엣 자리표시자의 `ui-monospace`는 앱 폰트 정책상 Pretendard로 통일(크기·행간·색 동일).
13. **S2 측정 사진은 원본 좌표계만 사용** — 실제 촬영 사진(보통 3:4 등)을 고정 프레임에 `contentFit="cover"`로 넣으면 세로 크롭이 발생해, 원본 이미지 기준 H/G/Sn/Me 가이드가 얼굴에서 어긋난다. S2는 `SourceAlignedPhotoSlotData.sourceWidth/sourceHeight`를 필수로 받고 `getVerticalThirdsPhotoAspectRatio`에서 프레임 비율을 계산한다. 임의 `aspectRatio` prop, 별도 비율 필드, crop rect, 기본 4:5 폴백은 금지한다. 헤어라인을 측정하지 못한 회차에는 상안부 band·pill·수치도 데이터에서 제외한다.

## 파일 구성
```
report/
  reportTokens.ts        색·라운드·타입·섀도 토큰
  reportTypes.ts         전 섹션 props/DTO 타입 (수치는 0..1 지오메트리만)
  fixtures.ts            HTML과 동일한 데모 데이터 (백엔드 없이 렌더 가능)
  ReportScreenScaffold.tsx  스크롤 컨테이너 + 상단바 + 섹션 순서 + S2→S3 스크롤 연결
  sections/S1Summary … S7Styling
  visuals/               PhotoSlot · Pill · Badge · SpectrumRail · WhatIfRail · BlendBar ·
                         GuidePhotoOverlay · RegionLens · GuideOverlay · GazeReplay ·
                         LightingDial · SwatchRow · SummaryCard · SectionHeader · Card ·
                         EmptyNotice · Hatch · RiseIn
```

## 사용
```tsx
import { ReportScreenScaffold } from './report/ReportScreenScaffold';
import { demoReport } from './report/fixtures';

<SafeAreaProvider>
  <ReportScreenScaffold
    data={demoReport}
    onRetake={() => {/* 재촬영 플로우 */}}
    onResurvey={() => {/* 설문 플로우 */}}
  />
</SafeAreaProvider>
```
Pretendard Variable은 앱 측 `expo-font` 로딩(`fontFamily: 'Pretendard'`) 전제. 원격 리소스 로드는 없습니다.
