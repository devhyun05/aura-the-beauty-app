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
- Implementation screenshot: 없음
- Intended viewport: iPhone 실기기 세로 화면
- State: 얼굴 분석 보고서 첫 카드에서 원본 얼굴을 본 뒤 아래로 스크롤해 3D 마스크와 원본 비교 배지를 확인하는 상태
- Density normalization: 구현 스크린샷을 캡처하지 못해 수행하지 못함

## Full-view comparison evidence

선택 시안은 열 수 있었지만, 현재 연결된 Apple 기기는 Mac뿐이며 iPhone 실기기가 연결되어 있지 않아 변경된 React Native 보고서 화면을 캡처하지 못했다. 프로젝트 지침상 시뮬레이터로 대체하지 않았다.

## Focused-region comparison evidence

구현 캡처가 없어 카드 외곽선, 44 × 2 챕터 마커, Pretendard 타이포, 원형 원본 사진, 3D 마스크의 작은 원본 비교 배지, 공유 시트의 실제 화면 비교를 수행하지 못했다.

## Findings

- [P1] 실기기 렌더링 비교 미완료
  - Location: 얼굴 분석 보고서 전체
  - Evidence: 선택 시안은 확인했지만 동일 상태의 구현 스크린샷이 없다.
  - Impact: 폰트 렌더링, 세로 리듬, 카드 테두리 대비, Unity 마스크 합성 위치를 코드와 정적 검사만으로 확정할 수 없다.
  - Fix: iPhone 실기기를 연결한 뒤 동일 보고서 상태를 캡처하고 선택 시안과 한 화면으로 결합해 비교한다.

## Required fidelity surfaces

- Fonts and typography: 코드상 Pretendard와 지정된 크기·두께로 통일했지만 실기기 렌더링 미확인
- Spacing and layout rhythm: 공통 카드 반경·외곽선·챕터 마커·내부 divider를 반영했지만 캡처 비교 미확인
- Colors and visual tokens: 청회색 배경, 딥틸 위계, 제한된 시안 포인트 컬러를 반영했지만 화면 샘플링 미확인
- Image quality and asset fidelity: 실제 사용자 원본 사진과 Unity 3D 마스크를 유지했지만 동일 상태 캡처 미확인
- Copy and content: 기존 분석 데이터와 공유 형식을 유지하고 카드 표현만 변경함

## Interaction verification

- `npm run typecheck`: 통과
- `npm run test:face-report`: 통과
- 원본 얼굴 우선 노출, 아래 스크롤 시 마스크 lazy mount, 마스크 위 원본 비교 사진 유지: 코드 및 계약 테스트 확인
- 실기기 스크롤·3D 회전·공유 시트 시각 확인: iPhone 미연결로 차단

## Implementation checklist

- [x] 선택한 1번 시안의 카드 무드 반영
- [x] 전폭 상단선을 짧은 챕터 마커로 교체
- [x] 공통 카드 그림자 제거 및 얇은 외곽선 적용
- [x] 원본 얼굴 우선, 아래 스크롤 시 마스크 노출 유지
- [x] 마스크 옆 작은 원본 얼굴 비교 배지 유지
- [x] 공유 카드와 CTA 타이포·딥틸 색상 정렬
- [ ] iPhone 실기기 구현 캡처 및 선택 시안과 시각 비교

final result: blocked
