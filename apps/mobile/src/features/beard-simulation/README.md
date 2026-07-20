# beard-simulation (수염 제거) — native feature

Frontend-only React Native implementation of the AURA 수염 제거 flow, rebuilt 1:1 from the
prototype (`../../../../AURA Beard Flow.dc.html`) and the design handoff. Drop this folder in at
`apps/mobile/src/features/beard-simulation/`.

> Environment note: this folder was authored in a design tool, not compiled against the app repo.
> Run `yarn tsc --noEmit` + the tests in your repo; fix any import-path/type deltas from the real
> Tamagui/RN versions. Everything below is written to be drop-in for the stated stack.

## Stack used (no new runtime libs beyond the brief)
Expo RN + TS + React Navigation (native-stack) · **Tamagui** for layout/text · **lucide-react-native**
for icons · **expo-blur / expo-linear-gradient / react-native-reanimated / expo-haptics /
expo-media-library** · RN `PanResponder` for the compare drag (no gesture-handler dep needed).

**One extra dependency:** `expo-clipboard` (used in the report copy actions). RN core `Clipboard`
is removed; if the repo already has `@react-native-clipboard/clipboard`, swap the two imports in
`screens/ReportScreen.tsx`. Flagged because it's outside the brief's explicit list.

## Wiring behind the existing "수염 제거" entry
```tsx
import { BeardSimulationNavigator } from '@/features/beard-simulation';
// in the root/tab navigator:
<RootStack.Screen name="BeardSimulation" component={BeardSimulationNavigator} />
```
`BeardSimulationNavigator` self-contains its providers (flow state, toast, service). Requires
`SafeAreaProvider` + a `NavigationContainer` above it (already present app-wide in Expo apps).

## Swapping in the real backend (Stage 2)
Components consume ONLY `BeardSimulationService` (`contracts/types.ts`) via `useBeardService()`.
Ship the real impl and pass it once:
```tsx
<BeardSimulationNavigator service={realBeardSimulationService} />
```
`contracts/types.ts` is the exact contract from the brief (`BeardIntensity`,
`BeardSimulationResult`, `BeardSimulationService`). No screen imports the mock directly.

### Mock toggles (every state reachable without a backend)
`createMockBeardSimulationService({ generationDelay?, generationFailure?, saveFailure? })`
- `generationDelay` → 지연 안내 ("평소보다 조금 더 걸리고 있어요") path
- `generationFailure` → `status:'blocked'` → 실패/재촬영 screen
- `saveFailure` → save rejects → 저장 실패 토스트 + 다시 시도

## File map
```
index.ts                      public entry + re-exported contracts
BeardSimulationNavigator.tsx  native-stack + providers (accepts service / initialFlow / initialRouteName)
contracts/
  types.ts                    backend contract + INTENSITY_LABELS (locked copy)
  surveyRules.ts              canAdvanceSurvey() — pure, unit-tested
services/
  mockBeardSimulationService.ts  mock + toggles + demoReadyResult() + placeholder assets
  BeardServiceContext.tsx     DI provider + useBeardService()
state/
  BeardFlowContext.tsx        shared flow state (survey persists; reset on delete/new-photo)
  ToastContext.tsx            top glass toast + useToast()
hooks/
  useSaveResult.ts            one-tap save of current intensity (spinner, success/fail toast)
components/
  BeforeAfterCompare.tsx      overflow-container compare + PanResponder (drag wins over scroll)
  IntensitySlider.tsx         3-stop slider (disables missing stages)
  HoldOriginalButton.tsx      hold-to-peek + <260ms tap = pin, light haptic
  ScanOverlay.tsx             reanimated 하관 scan (reduced-motion aware)
  GlassPanel.tsx              the single blur/glass surface (+ fallback)
  SurveyControls.tsx          SelectRow / Chip
  DeleteConfirmSheet.tsx      dark confirm dialog
screens/                      PurposeSelect · Survey · Camera · Generating · Result · Report · Failure
__tests__/                    surveyRules · mock service · flow state
storybook/                    BeardSimulation.stories.tsx (all states)
assets/                       4 neutral placeholder portraits (demo/story/test only)
tokens/tokens.ts              feature-local Onyx tokens (NOT the global theme)
```

## Locked behaviours (verify these)
- Korean copy verbatim; forbidden words absent (진단/영구제모/회차/효과보장).
- 390×844 px → dp 1:1.
- No fake percent anywhere; loading is stepwise only.
- Survey answers persist on back; cleared only on 삭제 / 새 사진.
- Before/After: overflow-container reveal (not clip-path); horizontal drag captures over scroll;
  divider kept across intensity change; save writes ONE clean image at current intensity (no divider).
- Hold-original: press = peek, short tap (<260ms) = pin toggle, light haptic on enter.

## State matrix (maps to the handoff checklist → Storybook + tests)
survey disabled/enabled (`surveyRules.test`) · 생성 지연 (`GenerationDelay`) · 생성 실패 →
failure (`GenerationFailure`) · result analysis/photo (`ResultAnalysis`/`ResultPhoto`) · 원본
hold·pin · 저장 중/성공/실패+재시도 (`SaveFailure`) · 보고서 앵커/복사 (`DetailedReport`) ·
삭제 확인 · 실패 화면 (`FailureScreenState`).

## TODO(backend) markers (grep `TODO(backend)`)
- Camera: compose over the existing `CameraFaceCaptureScreen` live preview + real face/brightness
  detection (here: demo image + ~950ms auto-cycling guidance mock). Also real capture frame,
  image picker (앨범), camera flip.
- `saveResultToLibrary`: expo-media-library permission/save is wired but gated behind
  `useRealMediaLibrary`; confirm final data-policy storage location. Permission-denied UI TODO.
- `사진 처리 및 삭제 기준` links → real policy document screen.

## Fidelity flags (couldn't be reproduced 1:1 in RN — approximated, noted)
1. **screen-blend scan band** — CSS `mix-blend-mode:screen` (actually brightens the photo) has no
   RN equivalent; approximated with a translucent ice→lavender `LinearGradient` band. Visually close,
   not physically brightening. (`components/ScanOverlay.tsx`)
2. **backdrop blur** — `expo-blur` used for the one glass panel + header/camera circles; `GlassPanel`
   has an opaque-fill fallback (`disableBlur`) for low-end/perf or web. Verify blur perf on target
   devices. (`components/GlassPanel.tsx`)
3. **Pretendard weights** — the prototype used variable-font weights (650/680/730/750); RN
   `fontWeight` only allows 100-step values, so they're snapped to 600/700. For exact weights,
   register named Pretendard families (SemiBold/Bold) and set `fontFamily` per weight, and make sure
   Pretendard is bundled — otherwise the system font is the fallback.
4. **camera spotlight oval** — the exact oval-only dimming needs a mask lib (@react-native-masked-view
   or react-native-svg), which is outside the stack; approximated with a 4-band scrim around the oval
   bounding box. Corners of the box aren't dimmed. (`screens/CameraScreen.tsx`)
5. **reduced motion** — `useReducedMotion()` drops the scan travel/shimmer to a static core line;
   the compare cross-fade also respects it.

## Verify
```
yarn tsc --noEmit
yarn jest src/features/beard-simulation
```
