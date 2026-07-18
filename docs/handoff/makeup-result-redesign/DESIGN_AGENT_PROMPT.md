# Prompt for the design agent — produce standalone React Native files

You already have the finished mockup (`Makeup Result v3.dc.html`) in your workspace. Reproduce it as **standalone React Native (TypeScript) component files** — same layout, colors, motion, and interactions.

**You do NOT have the app repo.** Don't reference or import repo files, and don't try to run builds/tests. Just output clean, self-contained `.tsx` that someone will integrate into the app afterward.

## Translate your CSS techniques to this stack (all available in the target app)

- React Native + TypeScript, `StyleSheet` (no styled-components).
- `expo-blur` `BlurView` → the glass/`backdrop-filter: blur` surfaces.
- `expo-linear-gradient` → the screen background gradient (`175deg,#D5DEF4,#DCD6EF,#F0DED4`), hero overlays, veils.
- `expo-image` → images (`contentFit="cover"`, `contentPosition` ≈ `center 20%`); use its placeholder/transition for the loading state.
- `react-native-svg` → the SVG face outline + hotspots + moving radial-gradient tint circles, and the dashed match/progress bars (do NOT use CSS repeating gradients).
- `react-native-reanimated` → all motion (shimmer skeleton, discovery blur-in reveal, confetti burst, pulsing ring/hotspot, toast). `PanResponder` is fine for the drag gestures.
- No `clip-path` → for the before/after reveal, put the "before" layer in an `overflow:hidden` View with an animated `width` driven by the drag.
- No `position: sticky` → make the top bar and bottom CTA bar absolute/overlay elements.
- No IntersectionObserver → do reveal-on-scroll with `onLayout` + scroll offset (or just fade/slide sections in on mount).

## What to reproduce

All 9 sections exactly as in the mockup: sticky top bar · title block · swipeable 3-look hero (with ok / skeleton / error+retry states and the veiled discovery reveal + confetti) · look pills · WHY IT FITS (match gauge, reasons, before/after slider) · LOOK MAP (2-axis) · PART GUIDE (tab rail + SVG face hotspots + per-part swatch/steps/product) · SHARE CARD · sticky bottom CTA bar + toast. Keep all Korean copy verbatim. Support a `reduceMotion` flag.

## Output

- One main screen component + small sub-components as needed, all RN/TSX.
- Use a local placeholder data array shaped like the mockup's `LOOKS` (3 looks; each with role, name, image, match, difficulty, time, `reasons[]`, and `parts{base,brow,eye,cheek,lip}` = colorName, hex, texture, note, `steps[]`, finish, `prod{brand,name,price,why}`). Mark clearly (via props) where real data would plug in.
- Handle the three image states (ok / skeleton / error+retry).
- Self-contained: assume only the libraries listed above; styles in `StyleSheet`; no repo imports.

Deliver the `.tsx` code.
