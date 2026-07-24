# Golden Mask 명암·회전 Design QA

## 비교 대상

- Source visual truth:
  - `/Users/wiseungcheol/Documents/석고상1.jpeg` (362 × 550 px)
  - `/Users/wiseungcheol/Documents/석고상2.jpeg` (220 × 293 px)
- Implementation screenshot:
  - `/private/tmp/aura-golden-mask-clean-cut-final/golden-mask-front.png` (804 × 1000 px)
- Combined comparison:
  - `/private/tmp/golden-mask-design-qa-comparison.png` (2412 × 1000 px)
- Additional rendered states:
  - `/private/tmp/aura-golden-mask-clean-cut-final/golden-mask-left-profile.png`
  - `/private/tmp/aura-golden-mask-clean-cut-final/golden-mask-right-profile.png`
  - `/private/tmp/aura-golden-mask-clean-cut-final/golden-mask-high-angle.png`
  - `/private/tmp/aura-golden-mask-clean-cut-final/golden-mask-low-angle.png`
- Viewport: Unity presentation camera, 804 × 1000 px, density 1
- State: still 3D TrueDepth mesh; yaw 0°/−90°/+90°, pitch +40°/−40°
- Normalization: both references were aspect-fit into separate 804 × 1000 black panels; implementation remained native 804 × 1000.

## Full-view comparison evidence

The implementation preserves the supplied references' primary art direction: a neutral plaster surface on a dark field, one broad high-side key light, visible facial relief through mid-tone transitions, and a distinctly darker opposite plane. The biometric face geometry intentionally remains the user's measured mask rather than copying the sculptures' hair, neck, pedestal, or facial identity.

## Focused-region comparison evidence

A separate crop was not needed: the face and its lighting occupy nearly the full 804 × 1000 implementation frame, so the full-view comparison exposes the important nose, brow, cheek, lip, silhouette, and cavity transitions at readable scale. The four additional rotation captures were inspected for profile silhouette, top/bottom relief, detached geometry, clipping, and boundary artifacts.

## Required fidelity surfaces

- Fonts and typography: not applicable; the Golden Mask render contains no text.
- Spacing and layout rhythm: the face remains centered with stable black breathing room at all five verified angles; no crop hides the nose, chin, or profile.
- Colors and visual tokens: neutral warm plaster, charcoal cavity tones, and the existing dark presentation background match the reference direction without adding a feature-only accent.
- Image quality and asset fidelity: the real 1220-vertex/6912-index TrueDepth mesh remains the visible source. Lighting changes do not exaggerate or replace geometry. Recessed eye/mouth caps are presentation-only and disappear near profile to avoid silhouette artifacts.
- Copy and content: not applicable; no visible copy was added or changed.

## Comparison history

1. Earlier finding — P1: the first chiaroscuro pass clipped the light side to flat white and crushed the shadow side and eye/mouth openings to black.
   - Fix: broadened the key light, restored mid-tones, softened the specular shoulder, and added recessed dark-plaster cavity surfaces.
   - Post-fix evidence: `aura-golden-mask-chiaroscuro-v2/golden-mask-front.png`.
2. Earlier finding — P1: a single large backing surface improved the front view but became a detached oval at full profile.
   - Fix: replaced the large surface with local concave caps built only from measured inner boundary loops.
   - Post-fix evidence: `aura-golden-mask-chiaroscuro-v3/golden-mask-left-profile.png`.
3. Earlier finding — P2: inner boundary thickness around the eyes and mouth produced pointed overlap artifacts near ±90°.
   - Fix: retained thickness only on the outer face boundary and hid the small cavity caps beyond 72° yaw.
   - Post-fix evidence: `aura-golden-mask-chiaroscuro-final-v2/golden-mask-left-profile.png` and `golden-mask-right-profile.png`.
4. Earlier finding — P2: the rear cut edge inherited local depth noise and per-quad normals, producing an uneven segmented rim at profile.
   - Fix: low-pass filtered only the presentation rear ring, preserved the measured front contour, rebuilt the cut as one shared-vertex ribbon, and used consistent two-sided normals.
   - Post-fix evidence: `aura-golden-mask-clean-cut-final/golden-mask-left-profile.png` and `golden-mask-right-profile.png`.

## Findings

- No actionable P0/P1/P2 visual mismatch remains for the requested scope.
- P3 follow-up: the measured ARKit topology naturally ends at the face perimeter and has narrow eye/mouth openings, so a full-profile view reads as a sculptural mask rather than a complete head bust. Completing a head or inventing eyelids would alter biometric geometry and is intentionally out of scope.

## Interaction verification

- Horizontal rotation reaches both full profiles at −90° and +90°.
- Vertical rotation reaches +40° and −40°.
- Golden Mask drag ownership disables the report pager and native back gesture until release or termination.
- Interaction contract tests cover clamp limits and back-gesture restoration.

## Implementation checklist

- [x] Remove line/wireframe/measurement-guide presentation.
- [x] Preserve the real 3D mesh and immutable measured vertices.
- [x] Apply dramatic but readable plaster chiaroscuro.
- [x] Support full left/right profile and increased up/down rotation.
- [x] Prevent page swipe and back navigation while manipulating the mask.
- [x] Verify five rendered angles, Unity compilation, mobile typecheck, and focused contracts.

Golden Mask prior result: passed

---

# 얼굴 분석 보고서 카드 무드 Design QA

## 비교 대상

- Source visual truth: `/Users/wiseungcheol/.codex/generated_images/019f8f78-74fb-7e70-962b-e4bbcdcc1b6c/call_VD0MikvbD23rpF6qXEUvtirp.png` (853 × 1844 px)
- Implementation screenshots:
  - `/Users/wiseungcheol/Downloads/IMG_4736.PNG` (1179 × 2556 px, 요약 1/11)
  - `/Users/wiseungcheol/Downloads/IMG_4737.PNG` (1179 × 2556 px, 얼굴 2/11)
  - `/Users/wiseungcheol/Downloads/IMG_4738.PNG` (1179 × 2556 px, 얼굴 4/11)
- Combined comparison: `/private/tmp/aura-face-report-reference-vs-implementation.png` (1704 × 1844 px)
- Viewport: iPhone 393 × 852 CSS px, implementation deviceScaleFactor 3
- State: 얼굴 챕터의 비율 분석 카드
- Density normalization: 구현 스크린샷을 1844 px 높이로 축소해 소스와 동일 높이로 정규화한 뒤 좌우 결합

## Full-view comparison evidence

좌우 결합 비교에서 선택 시안은 `02 · FACE → 얼굴 → 대형 사진 → 얼굴 비율 설명 → divider 행`의 단순한 한 장 구성을 사용한다. 구현은 `02 · FACE → PROPORTION → 별도 인트로 → 채워진 해석 박스 → 사진`으로 시작하며, 고정형 11장 페이저와 큰 원형 이동 버튼을 유지한다. 색상 일부만 가까울 뿐 정보 구조, 첫 화면의 시각 중심, 카드 밀도와 세로 리듬이 다르다.

## Focused-region comparison evidence

상단과 사진 시작부를 중점 비교했다. 선택 시안은 챕터 표기 직후 `얼굴` 제목과 사진이 빠르게 나오며 사진이 첫 화면의 대부분을 차지한다. 구현은 영문 eyebrow, 큰 설명 문장, 채워진 결과 박스가 사진 위 공간을 차지해 사진이 화면 아래로 밀린다. `IMG_4738.PNG`에서도 선택 시안의 평평한 divider 구조와 달리 외곽 카드 안에 또 다른 테두리 카드와 채워진 결론 카드가 겹쳐 중첩 카드 인상이 강하다.

## Findings

- [P1] 선택 시안의 화면 구조를 구현하지 않고 기존 11장 구조를 유지함
  - Location: `StoryReportPager`, `ReportScreenScaffold`
  - Evidence: 시안은 챕터별 긴 보고서 카드지만 구현은 11개의 독립 카드와 고정 이전/다음 버튼을 사용한다.
  - Impact: 샘플의 편집형 리포트 무드가 아니라 기존 카드 캐러셀처럼 보인다.
  - Fix: 챕터당 하나의 세로 스크롤 보고서로 재구성하고, 하단 페이지 카운터와 큰 원형 이동 버튼을 제거하거나 보조 목차로 축소한다.
- [P1] 얼굴 비율 카드의 첫 시각 중심이 사진이 아님
  - Location: `S2Proportion`
  - Evidence: 시안은 제목 다음에 대형 얼굴 사진이 나오지만 구현은 영문 eyebrow, 설명, 채워진 해석 박스가 사진보다 먼저 나온다.
  - Impact: 측정 보고서의 핵심 근거인 얼굴 사진이 아래로 밀리고 텍스트 카드가 주인공이 된다.
  - Fix: `02 · FACE → 얼굴 → 대형 사진` 순서로 이동하고, 현재 해석 박스 내용은 사진 아래 설명과 divider 행으로 편입한다.
- [P1] 카드 중첩과 채워진 박스가 시안보다 과함
  - Location: `S3RegionCard`
  - Evidence: 구현은 외곽 카드 안에 테두리 카드, 다시 청색 결론 카드가 중첩된다. 시안은 하나의 얇은 외곽선과 평평한 행 구분만 사용한다.
  - Impact: 화면이 무겁고 템플릿형 대시보드처럼 보여 선택한 가벼운 에디토리얼 무드와 어긋난다.
  - Fix: 내부 테두리와 채워진 박스를 제거하고 제목·근거 사진·본문·divider 행의 단일 평면 구조로 바꾼다.
- [P2] 타이포 위계와 여백이 과장됨
  - Location: 챕터 카드 헤더 전반
  - Evidence: 구현의 `PROPORTION`과 설명 블록은 시안에 없는 추가 위계를 만들며 상단 공백도 더 크다.
  - Impact: 한 화면에 핵심 사진과 설명이 함께 보이지 않고 카드가 불필요하게 길어진다.
  - Fix: 영문 eyebrow를 제거하고 제목 22–24 px, 본문 14–15 px, 섹션 간격 20–24 px 중심으로 압축한다.

## Required fidelity surfaces

- Fonts and typography: Pretendard와 딥틸 위계는 가깝지만, 시안에 없는 영문 eyebrow와 과도한 크기 차이가 있음
- Spacing and layout rhythm: 시안보다 상단 텍스트와 중첩 카드가 많아 사진이 늦게 나오고 세로 밀도가 크게 다름
- Colors and visual tokens: 청회색 배경과 딥틸은 유사하나 채워진 청색 박스 사용량이 시안보다 많음
- Image quality and asset fidelity: 실제 사용자 사진을 사용한 점은 맞지만 크롭과 화면 내 점유율이 시안보다 작음
- Copy and content: 분석 데이터는 유지됐지만 시안의 간결한 제목·설명 구조 대신 기존 설명 계층이 남아 있음

## Comparison history

1. 최초 구현은 공통 토큰, 챕터 마커, 외곽선과 타이포만 조정하고 기존 11장 카드 구조를 유지했다.
2. 실기기 스크린샷과 선택 시안을 결합 비교한 결과 구조·사진 우선순위·중첩 카드에서 P1 차이를 확인했다.
3. 구조 수정:
   - 고정 하단 11장 페이저를 보고서 화면에서 숨기고 탭 밑줄을 탭 폭 전체로 확장했다.
   - 얼굴 비율 카드를 `02 · FACE → 얼굴 → 대형 사진 → 얼굴 비율 설명 → divider 행` 순서로 재배치했다.
   - 이목구비 상세의 내부 테두리 카드와 채워진 결론 박스를 제거하고 사진·결론·측정 행의 평면 구조로 바꿨다.
4. 타입체크와 얼굴 보고서 계약 테스트는 통과했다. 수정 후 실기기 스크린샷이 아직 없어 post-fix 시각 증거는 대기 중이다.

## Implementation checklist

- [x] 얼굴 챕터에서 제목 직후 대형 사진 배치
- [x] 중첩 카드와 채워진 결론 박스 제거
- [x] 기존 데이터는 사진 아래 설명·divider 행으로 재배치
- [x] 하단 11장 페이저 UI 제거
- [ ] 수정 후 동일 iPhone 상태로 재캡처하고 결합 비교

final result: blocked

---

# 얼굴 보고서 생성 상태 마이크로 UI Design QA

## 비교 대상

- Source visual truth: `/Users/wiseungcheol/.codex/generated_images/019f9029-b145-7e82-a818-f94120b998f5/call_sIFp3tTwr5qYCMGI8K1Zyz2u.png` (853 × 1844 px)
- Implementation screenshot: unavailable
- Viewport: intended iPhone 393 × 852 CSS px
- Source density: approximately 2.17 px/CSS px
- Implementation density normalization: unavailable
- State: `2/3 성공 · 스타일링 분석 실패` terminal issue state

## Full-view comparison evidence

The selected source was opened and inspected. It places the generation result as quiet, right-aligned microcopy in the report header with no spinner, progress bar, warning emoji, or warning icon. The implementation could not be captured because XcodeBuildMCP found no installed or available iOS Simulator, so a same-state visual comparison is not possible.

## Focused-region comparison evidence

The intended focus is the top-right report-header status cluster. Source inspection confirms a small success fraction followed by the failed section label. No implementation crop exists to compare type size, wrapping, alignment, or visual weight.

## Required fidelity surfaces

- Fonts and typography: source calls for compact secondary text; implementation uses the existing report font helper at 10–11.5 px, but rendered weight and truncation remain unverified.
- Spacing and layout rhythm: source calls for a small right-aligned cluster; implementation caps the width at 280 px and removes the full-width stepper, but rendered header balance remains unverified.
- Colors and visual tokens: implementation uses the existing accent and muted tokens plus restrained orange issue text; visual contrast remains unverified.
- Image quality and asset fidelity: no image asset is involved in this status control.
- Copy and content: automated contracts cover `2/3`, completed/current labels, `보고서 생성 완료`, and `2/3 성공 · 스타일링 분석 실패`.

## Findings

- [P1] Rendered implementation evidence is unavailable.
  - Location: `ReportCompletionIndicator`, report header.
  - Evidence: source image is available, but no simulator/device screenshot can be produced.
  - Impact: clipping, wrapping, alignment, and perceived prominence cannot be judged.
  - Fix: capture the generating, complete, and partial-failure states on an iPhone 393 × 852 viewport and compare the header region to the source.

## Comparison history

1. Replaced the prominent three-stage stepper and spinner with compact text states.
2. TypeScript typecheck and face-report contract tests passed.
3. XcodeBuildMCP project discovery succeeded, but simulator discovery returned no available devices; no post-fix screenshot exists.

## Implementation checklist

- [x] Show overall success count during generation.
- [x] Show completed/current section names in small adjacent text.
- [x] Collapse the completed state to `보고서 생성 완료`.
- [x] Show failed section names in the compact terminal state.
- [x] Remove warning emoji/icon and spinner.
- [ ] Capture all three rendered states at the target viewport.

final result: blocked

---

# 얼굴·메이크업 보고서 선택 시안 2 구현 후 Design QA

## 비교 대상

- 얼굴 기준 시안: `/Users/wiseungcheol/.codex/generated_images/019f8f78-74fb-7e70-962b-e4bbcdcc1b6c/call_885aGjrtwdavyfMSiXDCskZx.png`
- 메이크업 기준 시안:
  - `/Users/wiseungcheol/.codex/generated_images/019f8f78-74fb-7e70-962b-e4bbcdcc1b6c/call_wpOv4ANHtEmvDY1nY8gvdAYJ.png`
  - `/Users/wiseungcheol/.codex/generated_images/019f8f78-74fb-7e70-962b-e4bbcdcc1b6c/call_Blqca1uBuTZFIFHHQrzZvxfj.png`
- 구현 대상: React Native 실제 얼굴 분석 보고서와 최종 메이크업 추천 화면

## 구현 확인

- 부위 사진 하단에 무지개색이 없는 중립 글라스 캡션을 배치했다.
- 작은 원형 원본 얼굴을 유지해 부위 크롭과 전체 얼굴을 함께 비교할 수 있다.
- `이 부위의 결론` 라벨을 제거했다.
- 측정 목록은 핵심 결과와 수치를 먼저 보여주고 현재 항목 하나만 상세를 펼친다.
- 얼굴 비율의 세로·가로 근거도 하나씩 펼치는 구조로 바꿨다.
- 메이크업은 전체 단계 타임라인과 현재 단계 상세, 이전·다음 탐색을 결합했다.
- 공통 카드·섹션 헤더·메이크업 글라스에 동일한 반경, 얇은 경계, 절제된 빛받이를 적용했다.

## 자동 검증

- Mobile TypeScript typecheck: passed
- Face report contracts: passed
- Makeup recommendation contracts: passed
- AURADIN theme scope guard: passed
- Diff whitespace check: passed

## 시각 검증 상태

- `xcrun xctrace list devices`에서 iPhone과 iPad가 모두 Offline으로 확인됐다.
- 현재 구현 상태의 실기기 스크린샷을 캡처할 수 없어 동일 뷰포트 결합 비교와 P0–P2 판정은 수행하지 못했다.
- 기기 연결 후 요약, 얼굴 비율, 부위 상세, 메이크업 타임라인/단계 상세을 다시 캡처해야 한다.

final result: blocked
