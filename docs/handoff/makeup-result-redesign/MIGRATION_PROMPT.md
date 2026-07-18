# Task: implement the "Makeup Result v3" redesign in React Native — now, in this repo

**This is an implementation job, not a review or a hand-off.** You have the design folder and the app repo open. Port the finished web mockup into this app's React Native stack, **1:1 faithful** in layout, color, motion, and interaction — by writing the actual RN code (create/modify the source files, wire the data, make the checks pass). Do NOT summarize, re-save, re-describe, or forward this to another agent. Build it, then report the files you changed. Do not redesign — reproduce the mockup exactly.

## Source design

- Mockup: `디자인 세련화 및 색감 조정/Makeup Result v3.dc.html` — a proprietary "DC"/React component (`sc-for` = list, `sc-if` = conditional, `renderVals()` returns the bound props, styles are inline CSS in `style` attrs). Read the whole file first.
- Assets: `디자인 세련화 및 색감 조정/assets/` (`1_anchor.png`, `2_bold.png`, `3_discovery.png`). The same look images already live in-repo at `apps/mobile/src/assets/images/makeup-filters/`.
- The `LOOKS` array in the bottom `<script>` is **demo data** — treat it as the visual/interaction spec, not the data source.

## Target

- Screen: `apps/mobile/src/features/makeup-recommendation/screens/RecommendationResultsView.tsx` and sub-components under `apps/mobile/src/features/makeup-recommendation/`.
- Keep the existing props/callback contract (`onApplyAR`, `onAreaOpened`, `onRetryImages`, `onRefine`, `onReset`, `results`, `imageStatus`, `context`, …) and extend as needed. Wire the new actions: save / share / save-share-card / AR.

## Stack — use these (all already installed; add no new deps without checking `apps/mobile/package.json`)

- React Native + TypeScript, `StyleSheet`.
- Glassmorphism (`backdrop-filter: blur`) → **`expo-blur`** `BlurView`.
- Gradients (screen bg `linear-gradient(175deg,#D5DEF4,#DCD6EF,#F0DED4)`, hero overlays, veils) → **`expo-linear-gradient`**.
- Images (bg-image `cover`, `center 20%`) → **`expo-image`** (`contentFit="cover"`, `contentPosition`) — use its placeholder/transition for the loading state.
- SVG face outline + hotspots + moving radial-gradient tint circles → **`react-native-svg`** (`RadialGradient`, `Circle`, `Path`).
- Dashed match/progress bars (`repeating-linear-gradient`) → `react-native-svg` dashed lines or a masked `LinearGradient`. Do NOT attempt CSS repeating gradients.
- Motion (shimmer skeleton, discovery blur-in reveal, confetti burst, pulsing ring/hotspot, toast) and all gestures → **`react-native-reanimated` 4.3.1** (`withRepeat`/`withTiming`/`withSequence`). `@shopify/react-native-skia` is available if a shimmer/gradient is easier there.
- Drag gestures (hero swipe carousel, before/after handle) → PanResponder following the iOS back-swipe-safe contract in `apps/mobile/src/features/face-report/visuals/WhatIfRail.tsx` (or reanimated `Gesture`).
- `clip-path: inset()` (before/after reveal) has no RN equivalent → absolute-position the "before" layer inside an `overflow:hidden` View with an animated `width` driven by the drag.
- Scroll-triggered reveal (design uses IntersectionObserver) → reuse `apps/mobile/src/features/face-report/visuals/RiseIn.tsx` + `ScrollAnimContext`. Honor a reduce-motion path (design exposes a `reduceMotion` prop).
- Sticky header + sticky bottom CTA bar → render outside the scroll content (absolute overlays) via `apps/mobile/src/shared/ui/AppScreen.tsx` + safe-area insets. Do not fake sticky inside the ScrollView.
- Share card "save as image" → `react-native-view-shot` + the `OptionalViewShot` wrapper, mirroring `apps/mobile/src/features/face-report/services/reportImageShare.ts`.

## Design tokens — feature-local (do NOT touch `shared/theme`)

Extract the palette/type/shadow into `apps/mobile/src/features/makeup-recommendation/theme/makeupRecommendationTokens.ts` (same approach as `face-report/reportTokens.ts`). Key values from the mockup:

- Screen gradient `#D5DEF4 → #DCD6EF → #F0DED4` (175deg). Ink `#101828`; sub-inks `#1C2740`, `#2C3852`, `#3D4C6B`, `#5B6B8C`, `#6B7794`, `#8794AD`. Link/accent `#3D5BB0`. Dark button/active `#0E1420`.
- Glass surface `rgba(238,244,255,.82)` + 1px `rgba(255,255,255,.6)` border + blur 18–22. Card shadow `0 18px 40px rgba(15,30,70,.2)`; hero shadow `0 24px 50px rgba(15,30,70,.3)`.
- Radius: pills/badges 8–14, cards 18–20, hero 20. Eyebrow labels 9–10px / weight 700 / letter-spacing .26–.3em. Display titles 25–36px / weight 500 / letter-spacing -.02em. Hex readouts monospace.
- **CRITICAL**: never import or modify `shared/theme`; keep the guard green — `npm --prefix apps/mobile run test:auradin-theme-scope`.

## Sections to reproduce (in order)

1. Sticky top bar (back / eyebrow "MAKEUP REPORT" + "메이크업 추천" / more).
2. Title block: `date · situation`, "오늘의 추천, {lookName}", stat row (룩 수 / 매치% / 소요시간).
3. Hero (h≈470): swipeable 3-look carousel. Per look, all three states are required (the live app's image genuinely fails): image **ok** / shimmer **skeleton** (loading) / **error + retry**. Bottom gradient + role label + name + match/difficulty/time glass pills; index badge "01 — 03". The discovery look starts **veiled** (blur + "?" + "탭해서 공개하기") → tap reveals with blur-in + confetti burst.
4. Look pills (3, tap-select) + "좌우로 밀어서 룩을 넘겨보세요" hint.
5. WHY IT FITS: match-score card (big %, dashed bar, trait chips), numbered reasons, before/after drag slider (grayscale before ↔ AI after).
6. LOOK MAP: 2-axis map (글램↔캐주얼 / 자연스러움↔개성) with 3 positioned thumbnails + legend rows; tapping a point/row switches the hero look and scrolls to top.
7. PART GUIDE: part tab rail (베이스/브로우/아이/치크/립 with color dots) + SVG face with tappable hotspots + moving tint; the selected part shows swatch+name+hex, texture+note, numbered steps, finish comment, recommended product (brand/name/price/why + initial avatar).
8. SHARE CARD: a capturable 272px card (match%, name, meta, dashed bar, 3 thumbnails) + "이미지로 저장하기".
9. Sticky bottom CTA bar: 저장 / AR로 입어보기 (primary dark) / 공유. Toast for confirmations.

## Data wiring — replace the demo `LOOKS`

Bind to the real `MakeupLookRecommendation[]` (`apps/mobile/src/features/makeup-recommendation/types.ts`):

- `role` → roleLabel/roleEn (anchor = 가장 잘 어울리는 / BEST MATCH, bold = 조금 더 과감한 / BOLDER PICK, discovery = 예상 밖의 발견 / DISCOVERY); `title` → name; `imageSource` → hero image; `reasons[]` → numbered reasons; `difficulty` (easy/medium/advanced → 쉬움/보통/어려움); `durationMinutes` → "{n}분".
- `areaGuides[]` → PART GUIDE (area → tab; `color.name`/`color.hex` → swatch; `texture`; `placement` → textureNote; `steps[]`; `reason` → finish; `products[0]` → brand/name/price/reason).
- **Gaps to resolve (don't hardcode)**:
  - Per-look match %: the type has `products[].matchRate`, not a look-level score — add a look-level match (prop or derive) and clarify with the data owner; degrade gracefully if absent.
  - Map coordinates (자연↔개성 / 캐주얼↔글램): not in the type — derive deterministically from look attributes or add fields.
  - Trait chips + matchLine (봄웜 라이트 / 계란형 / 건성 피부): come from the linked FaceAnalysisReport / session profile (personalColor, face shape, skin type) — source from `context`, not the look.
  - Header date/situation: from the recommendation session/context.
- Respect `imageStatus` (pending/processing → skeleton, failed/partial → error + retry via `onRetryImages`).

## Definition of done — you are NOT finished until all of these are true

- `RecommendationResultsView.tsx` (and new sub-components) render the redesigned screen with every section above, matching the mockup's spacing, colors, radii, motion timing/easing, and interaction behavior. Korean copy verbatim.
- All interactions actually work: hero swipe, discovery reveal, before/after drag, look-map select, part-tab/hotspot select.
- All three image states handled (ok / skeleton / error+retry), plus reduce-motion and safe areas.
- `npm --prefix apps/mobile run typecheck` and lint pass; existing makeup-recommendation tests green; new tests added for the interactions above; theme-scope guard green (`npm --prefix apps/mobile run test:auradin-theme-scope`).
- You have edited real source files under `apps/mobile/src/features/makeup-recommendation/` and reported the list of changed files, plus any data gaps you had to stub. A summary or a saved copy of this document is NOT a valid deliverable.
