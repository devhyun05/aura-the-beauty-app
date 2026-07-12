# AURADIN — React Native port (presentational layer) · entry-v3

Faithful RN recreation of the AURADIN "premium liquid glass" design system
(entry + 6 screens). Presentational components only — no networking, no state
machines; you wire the logic through the callback props.

**v3 (this drop):** entry screen rebuilt to the AppScreen redesign (clean
gradient, no photo) · milk-glass upgrade across ALL screens · the orb is now a
real GL soap-bubble membrane (expo-gl + three) with the old SVG orb kept as an
automatic fallback. File structure, component names and props contracts are
unchanged — replace the folder wholesale.

## Stack

- React Native 0.85 + Expo SDK 56, TypeScript strict, functional components + StyleSheet
- `expo-blur`, `expo-linear-gradient`, `react-native-svg`, `react-native-safe-area-context`
- **Orb:** `expo-gl` + `three@0.128.0` (GLSL in `components/ds/orbShaders.ts`;
  no expo-three needed — the renderer bootstrap is self-contained)
- Animation: core `Animated` API + one RAF loop inside OrbGLCanvas
- Fonts expected preloaded: `Lora`, `Pretendard-Regular|Medium|SemiBold|Bold`
  (mono is the system stack: Menlo on iOS / monospace on Android)

## Files

```
types.ts                      AuradinReason · AuradinCandidateProduct · AuradinQuestionOption · AuradinPhase
theme/auradinTokens.ts        colors · gradients · type presets · radius · spacing · glass tiers · iridescent rim · shadows · motion
components/ds/                Wordmark · StatusBarRow · GlassBase(shared) · GlassSheet · GlassCard · Badge ·
                              Chip · Composer · SwatchTile · CTAButton · HeartButton · Toast · PaletteSwatches ·
                              ProductThumb · LoaderDots · ThinkingSteps · PersistentOrb · orbShaders(GLSL) ·
                              OrbGLCanvas · AuradinGround · motion(hooks)
screens/views/                HomeView · SearchingView · QuestionView · ResultsView · DetailView · SavedView · ErrorView
assets/                       bubble-background(-desaturated).jpg — LEGACY, only for the opt-in photo slot
```

## Composition — ONE ground, ONE orb (never remounted)

The orb is a shared element: phase changes only morph its position/scale/glow.
Mount it once, above the ground, below the current view. Entry v3 is a clean
gradient — do NOT pass `photoSource` unless you deliberately want the legacy
photo treatment back:

```tsx
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuradinGround, PersistentOrb } from './components/ds';
import { HomeView, SearchingView /* … */ } from './screens/views';
import type { AuradinPhase } from './types';

function App() {
  const [phase, setPhase] = useState<AuradinPhase>('home');
  // …your flow logic (min-show: searching ≥ ~2300ms initial / ~1700ms after an answer)…
  return (
    <SafeAreaProvider>
      <AuradinGround dark={phase === 'searching'}>
        <PersistentOrb phase={phase} />
        {phase === 'home' && (
          <HomeView query={q} setQuery={setQ} onSubmit={search}
                    onPickSuggestion={pick} savedCount={saved.length} onOpenSaved={openSaved} />
        )}
        {/* …other phases… */}
      </AuradinGround>
    </SafeAreaProvider>
  );
}
```

Screen ↔ orb map (from `ORB_BY_PHASE`): home = center orbzone · searching =
forward + magenta glow · question = small, upper center · results/detail/saved =
small top-right aura (never overlaps titles on small screens) · failed =
residual, above the message.

## The GL orb (soap-bubble membrane)

- `components/ds/orbShaders.ts` — framework-free GLSL strings + constants:
  `NOISE` (simplex chunk) · `BLOB_VERT` (lumpy displacement + jelly boing) ·
  `BLOB_FRAG` (thin-film interference rim, liquid sheen, curved reflections,
  magenta glow uniform) · `CAUSTIC_VERT/FRAG` (chromatic ring below) ·
  `ORB_ANIM` (every period/amplitude: rotation 26s · boing 3.6s · rim hue 12s ·
  sheen 7.5s · glow lerp/pulse · bubble orbits · camera).
- `components/ds/OrbGLCanvas.tsx` — three r128 scene on `GLView`: caustic ring →
  main blob → two floating satellite bubbles (same membrane shader, thinner
  film). Transparent clear color; the SVG halos + ground show through.
- Glow is a **uniform lerp**: `PersistentOrb` passes the `ORB_BY_PHASE` target,
  the loop eases `uGlow` toward it (`ORB_ANIM.GLOW_LERP`), so entering/leaving
  `searching` never snaps.
- **Pause:** reduced motion or `<PersistentOrb paused>` cancels the RAF loop on
  a stable rendered frame (host may wire AppState → `paused`).
- **Fallback:** any GL/three failure flips PersistentOrb to the old layered-SVG
  artwork — same 196/430 footprint, same morphs, never a blank.
- WebGL1-safe GLSL (ES 1.00): three r128 on expo-gl takes the WebGL1 path; no
  `#version`, no derivatives extension, attributes come from three's prefix.

## Global rules carried over (DESIGN.md §0/§9)

- Ink-first text `#2B3A52`; white text ONLY on saturated fills + the dark searching screen
- ONE magenta emphasis per screen (send/CTA, eyebrow, active dot…)
- **Iridescent rim: exactly TWO mounts app-wide** — searching QUERY echo block +
  results #1 hero card (`iridescent` prop on GlassBase/GlassCard). Never on
  chips, badges, composer, sheet, or detail cards.
- Dark ground ONLY on searching; leaving always lifts back to light
- Prices `18,000원` in mono — never `₩18,000`; exact Korean copy strings preserved
- No emoji, no exclamation marks, no chat log; unicode-as-iconography (↗ · ← !)
- `prefers-reduced-motion` respected everywhere (loops freeze — GL RAF included —
  morphs jump)

## RN approximations (vs. the web source)

- `backdrop-filter: blur(26) saturate(1.7)` → `BlurView` intensity 60 (chips 30) +
  the white gradient fill; saturation boost is not reproducible
- Web's multi-inset milk glass → innerGlow wash + bottom fill-light + dual
  hairlines (top light-catch, bottom refracted catch) per tier
- 3 layered colored shadows → single violet iOS shadow + Android elevation
- Gradient border → solid translucent border; the iridescent rim uses a padded
  gradient wrapper (RN has no border-image)
- `mix-blend-mode: luminosity` photo → retired with the v3 clean-gradient entry
  (pre-desaturated asset still ships for the legacy opt-in slot)
- Specular hover-sweep: removed in the source system (2026-07) — not ported

## Wiring notes

- **expo-gl + three@0.128.0 must be installed** (they are, per the port brief);
  without them the import of OrbGLCanvas fails at bundle time — the SVG
  fallback covers GL *runtime* failures, not missing packages.
- SavedView header (title/onBack) is REAL here — the legacy screen ignored those
  props; wire them into your AppHeader. Grid pages by 4 in this mock
  (source-kit density); real `pageSize = 10` — change `PER_PAGE`.
- DetailView opens `purchaseUrl` via `Linking`; save-toggle is `onToggleSave`
  (parent owns `liked`). Toast fires on the rising edge automatically.
- ResultsView refine dials call `onRefine('more_similar' | 'more_diverse')`;
  pass `refining` to swap the dials for the wait row.
- Chip's `hl` variant still exists but home no longer uses it (v3 chips are
  uniform milk glass).
- Keep these tokens in `features/recommendation` — NOT app-wide `shared/theme`
  (guard: `npm run test:auradin-theme-scope`).

## Suggested (NOT used in code)

- `@react-native-masked-view/masked-view` — true magenta→violet gradient text for
  the question eyebrow (currently solid magenta)
- `@shopify/react-native-skia` — closer glass (real saturation boost, multi-layer
  shadows) if you want to push the milk-glass further
- `expo-image` — better remote product-image caching than core `Image`
