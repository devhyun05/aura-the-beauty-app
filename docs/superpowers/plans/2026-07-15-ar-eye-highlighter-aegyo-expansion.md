# AR Eye, Highlighter, and Aegyo Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selectable upper/lower eyeshadow and eyeliner looks, extend upper eyeshadow past the outer corner, split highlighter into five independently controlled facial zones, and replace the coupled lower-lid aegyo bands with a dedicated natural-volume/pearl renderer.

**Architecture:** Preserve the shared React Native look catalog, tree, compiler, and bridge as the data plane. Add anatomy-specific fields and standalone definitions to that plane, while retaining specialized Unity renderers for eyeshadow, eyeliner, highlighter masks, and aegyo. Keep legacy combined highlighter and old aegyo fields readable for saved-look compatibility, but hide legacy combined/decal controls from new pickers.

**Tech Stack:** Expo React Native, TypeScript 6, Node.js contract runners, Unity 6000.3.18f1, C#, ShaderLab/HLSL

## Global Constraints

- Implement the approved design in `docs/superpowers/specs/2026-07-15-ar-eye-highlighter-aegyo-expansion-design.md` without broadening it into a universal makeup renderer.
- Preserve existing `FilterParams` field names and numeric meanings. New numeric fields default to `0`; existing saved looks must remain parseable. `aegyoRendererVersion=1` is an internal presence marker set only by new aegyo definitions so explicit natural mode `0` is distinguishable from a legacy payload that omitted `aegyoMode`.
- Treat anatomical `inner`, `center`, and `outer` as eye-relative coordinates so the right and left eyes mirror correctly.
- Keep parent/slot look children `pickerScope: 'internal'`; only explicit `pickerScope: 'standalone'` definitions may appear in sub-region pickers.
- Keep legacy `highlighter` in `REGION_MAP` for old trees, but mark it `pickerHidden` and remove it from all add/swap/multi-use picker lists. New trees use the five zone keys.
- Preserve the shared highlighter color, finish, shimmer, finish-detail, mask-fit, and imported-mask fields. Only intensity is split by facial zone.
- Remove aegyo texture/decal selection from new UI and rendering. Continue accepting the old bridge message without crashing, but make it a compatibility no-op.
- Preserve lower eyeliner, lower shadow, triangle-zone, and under-eye concealer responsibilities in `LowerLidRenderer`.
- Preserve local iOS signing/build edits and generated Unity scene/XR edits; do not stage them.
- Add no UI or icon dependency.

## Three-pass Plan Review Record

1. **Requirement/spec coverage:** Replaced open-ended card styling with exact card names and parameter seeds; added explicit per-zone highlighter visibility/count checks. All approved upper/lower shadow, upper/lower liner, five-zone highlighter, two-mode aegyo, tail extension, and picker-scope requirements are represented.
2. **Data/interface/compatibility:** Added lower-liner-specific finish/shimmer fields so `소프트 펄` is real and cannot mutate the upper liner. Added internal `aegyoRendererVersion` so explicit natural mode `0` remains distinct from a legacy missing field while old shimmer looks still migrate to pearl mode.
3. **Execution/verification/rollback:** Kept old aegyo rendering alive through the eyeliner task and moves ownership atomically only after the dedicated renderer exists. Added exact Unity import/compile commands, render-queue uniqueness checks, clean-diff checks, and feature-scoped commits for straightforward rollback.

---

### Task 1: Establish the cross-layer expansion contract

**Files:**
- Create: `apps/mobile/src/features/ar/stencil/src/composer/eyeHighlightAegyoContract.test.ts`
- Create: `scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs`
- Modify: `apps/mobile/package.json`

**Interfaces:**
- Produces: package script `test:ar-eye-highlight-aegyo`.
- Tests: mobile catalog cardinality/provenance, bridge field declarations, Unity routing/source markers, and numerical eyeshadow tail behavior.
- Preserves: all existing AR contract runners.

- [ ] **Step 1: Write the mobile catalog contract and verify RED**

Create a TypeScript contract that builds the merged system/variant library and uses `subDefsForRegion()` to assert exact standalone counts:

```ts
expect(subDefsForRegion(library, 'eyeshadow').length === 12, '아이섀도 상 12개');
expect(subDefsForRegion(library, 'eyeshadowLower').length === 6, '아이섀도 하 6개');
expect(subDefsForRegion(library, 'eyelinerUpper').length === 8, '아이라인 상 8개');
expect(subDefsForRegion(library, 'eyelinerLower').length === 6, '아이라인 하 6개');
expect(subDefsForRegion(library, 'aegyo').length === 6, '애교살 6개');
```

Assert all 12 `eyeshadowShape` values appear exactly once among the upper standalone cards, upper liner styles cover `0..5`, lower liner styles cover `0..2`, and aegyo modes cover both `0` and `1` with three cards each. Assert every returned definition is `pickerScope === 'standalone'` and that no parent eye-look name is present.

Assert the visible contour region keys are exactly:

```ts
[
  'blush',
  'highlightCheek',
  'highlightNoseBridge',
  'highlightNoseTip',
  'highlightBrowBone',
  'highlightCupid',
  'contour',
]
```

Assert `REGION_MAP.highlighter.pickerHidden === true`, the five zone definitions exist, and `pickerVisibleRegionDefs()` excludes `highlighter` while retaining all five zone keys.

Run: `npm --prefix apps/mobile run test:ar-eye-highlight-aegyo`

Expected: FAIL because the script and new fields/regions/cards do not exist.

- [ ] **Step 2: Add the Node runner with Unity source checks**

Follow the compile-to-temporary-directory pattern in `scripts/mobile/run-ar-skin-and-look-scope-contract.mjs`. Compile the new TypeScript test, execute it, then read the authoritative Unity files and assert these stable markers:

```js
mustHave(bridge, 'public float highlightCheekIntensity;');
mustHave(bridge, 'public float eyelinerLowerStyle;');
mustHave(bridge, 'public float aegyoMode;');
mustHave(iris, 'const int EyeshadowShapeCount = 12;');
mustHave(iris, 'const int EyeshadowTailSubdiv');
mustHave(maskGenerator, 'HighlightNoseTipRegion');
mustHave(controller, 'AegyoRenderer.Instance.ApplyParams');
mustNotHave(lowerLid, 'SetAegyoTextureFromFile');
mustHave(aegyoShader, 'AegyoVerticalProfile');
```

Add a pure numerical mirror of the tail rule and assert:

```js
assert.ok(anatomicalXAtTail > 1, 'tail must extend beyond the outer corner');
assert.equal(tailFade(anatomicalXAtTail), 0, 'tail tip alpha must be zero');
assert.ok(shapeWeight(5, 0.72, 1.08) > 0, 'main outer uses the extension');
assert.ok(shapeWeight(0, 0.72, 1.08) < 0.05, 'base full does not paint the tail');
```

Add to `apps/mobile/package.json`:

```json
"test:ar-eye-highlight-aegyo": "node ../../scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs"
```

- [ ] **Step 3: Keep the contract RED and commit it with the first GREEN feature**

Do not commit a permanently failing tree. Leave this task uncommitted until Task 2 makes the catalog/protocol portion green; the runner will continue to report missing Unity markers until the later tasks are complete.

---

### Task 2: Expand the mobile catalog and bridge protocol

**Files:**
- Modify: `apps/mobile/src/features/ar/stencil/src/bridge/types.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/regions.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/components/BasicMode.tsx`
- Modify: `apps/mobile/src/features/ar/stencil/src/components/ComposerSheet.tsx`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/multiUse.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/fitSheets.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/stencilSteps.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/lookVariants.ts`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Bridge/BridgeMessages.cs`
- Test: `apps/mobile/src/features/ar/stencil/src/composer/eyeHighlightAegyoContract.test.ts`

**Interfaces:**
- Produces: `RegionDef.pickerHidden?: boolean` and `pickerVisibleRegionDefs(defs?: RegionDef[]): RegionDef[]`.
- Produces: `highlightCheekIntensity`, `highlightNoseBridgeIntensity`, `highlightNoseTipIntensity`, `highlightBrowBoneIntensity`, `highlightCupidIntensity`, `eyelinerLowerStyle`, `eyelinerLowerFinish`, `eyelinerLowerShimmer`, `aegyoMode`, `aegyoShadowIntensity`, and internal `aegyoRendererVersion` in both bridge schemas.
- Produces: 12 upper shadow, 6 lower shadow, 8 upper liner, 6 lower liner, 10 zone highlighter, and 6 aegyo standalone definitions.
- Preserves: legacy `highlighter`, `highlightIntensity`, `aegyoFinish`, and `aegyoStyleIntensity` parsing.

- [ ] **Step 1: Add picker visibility and protocol assertions**

Extend the failing contract to assert that `BasicMode`, `ComposerSheet`, `multiUseTargets()`, and `fitCapableRegions()` all consume the same picker-visible helper, so legacy `highlighter` cannot leak through a secondary add flow.

Run: `npm --prefix apps/mobile run test:ar-eye-highlight-aegyo`

Expected: FAIL on missing helper, fields, region keys, and counts.

- [ ] **Step 2: Add mobile and C# fields with compatible defaults**

Add optional TypeScript fields near their legacy owners:

```ts
highlightCheekIntensity?: number;
highlightNoseBridgeIntensity?: number;
highlightNoseTipIntensity?: number;
highlightBrowBoneIntensity?: number;
highlightCupidIntensity?: number;
eyelinerLowerStyle?: number;
eyelinerLowerFinish?: number;
eyelinerLowerShimmer?: number;
aegyoMode?: number;
aegyoShadowIntensity?: number;
aegyoRendererVersion?: number;
```

Add the same names as `public float` fields in `ARwithFable/Bridge/BridgeMessages.cs`. Do not edit the obsolete shorter `MediaPipeGraft/BridgeMessages.cs` unless Unity compilation proves it is active. The version field is data-only and must not appear as a UI control.

- [ ] **Step 3: Replace option tables with approved enums**

Set `EYESHADOW_SHAPES` to these exact labels and values: `베이스 전체(0)`, `베이스 앞쪽(1)`, `베이스 뒤쪽(2)`, `메인 앞쪽(3)`, `메인 중앙(4)`, `메인 뒤쪽(5)`, `포인트 앞머리(6)`, `포인트 눈동자 위(7)`, `포인트 눈꼬리(8)`, `크리스(9)`, `스모키(10)`, `와이드 그라데(11)`.

Extend `EYELINER_STYLES` with `캣(3)`, `스트레이트(4)`, and `소프트 드롭(5)`. Add:

```ts
export const EYELINER_LOWER_STYLES = [
  {value: 0, label: '전체 소프트'},
  {value: 1, label: '점막 밀착'},
  {value: 2, label: '바깥 1/3'},
];
```

Expose lower style in the lower-eyeliner shape axis. Add a lower-specific finish control backed by `eyelinerLowerFinish` and `eyelinerLowerShimmer`; do not reuse upper `eyelinerFinish`, because selecting a lower card must not mutate the upper liner. Expose `aegyoMode` as two shape buttons and `aegyoShadowIntensity` as `볼륨 음영` under opacity. Remove the aegyo import control and `aegyoFinish` control from the new UI; keep color, intensity, shimmer, and height. Set `aegyoRendererVersion: 1` in the aegyo region defaults and all six new aegyo cards.

- [ ] **Step 4: Split highlighter regions without breaking old trees**

Extend `RegionKey` with the five approved keys. Add `pickerHidden?: boolean` to `RegionDef`, set it on legacy `highlighter`, and export:

```ts
export function pickerVisibleRegionDefs(
  defs: readonly RegionDef[] = REGION_DEFS,
): RegionDef[] {
  return defs.filter(def => !def.pickerHidden);
}
```

Create five zone definitions with zone-specific `onKeys`, defaults, and opacity sliders. Reuse `highlightColor`, `highlightFinish`, `highlightShimmer`, `highlightFinishDetail`, `highlightMaskImported`, `highlightLift`, and `highlightSpread` controls so all zones share product appearance and mask fit.

Filter picker-hidden regions in:

- `BasicMode.tsx` while deriving `REGIONS_BY_SLOT`.
- `ComposerSheet.tsx` before rendering group region cells.
- `multiUseTargets()`.
- `fitCapableRegions()`.

Map each new highlighter region to the existing `highlighter` guide key in `stencilSteps.ts`. Keep legacy `highlighter` mapping for saved trees.

- [ ] **Step 5: Add exact standalone cards**

In `lookVariants.ts`, add explicit `level: 'sub'`, `pickerScope: 'standalone'` definitions. Use these exact parameter seeds; unspecified fields remain at their existing bare/default value.

| Upper eyeshadow name | `eyeshadowShape` | Color / color2 | Intensity | Gradient | Finish / shimmer |
|---|---:|---|---:|---:|---|
| 베이스 전체 | 0 | `#C99186` / `#E5B4AA` | 0.42 | 0.35 | satin 0 / 0.10 |
| 베이스 앞쪽 | 1 | `#D7A39B` / `#F1C7BC` | 0.40 | 0.30 | satin 0 / 0.08 |
| 베이스 뒤쪽 | 2 | `#9B645F` / `#C88A82` | 0.48 | 0.45 | matte 1 / 0.00 |
| 메인 앞쪽 | 3 | `#B87773` / `#D99A92` | 0.52 | 0.35 | satin 0 / 0.12 |
| 메인 중앙 | 4 | `#B77A86` / `#E2A7AF` | 0.55 | 0.45 | shimmer 3 / 0.38 |
| 메인 뒤쪽 | 5 | `#85515B` / `#B9787E` | 0.58 | 0.50 | satin 0 / 0.15 |
| 포인트 앞머리 | 6 | `#F0CDB6` / `#FFE7CD` | 0.50 | 0.55 | shimmer 3 / 0.58 |
| 포인트 눈동자 위 | 7 | `#E7B3A9` / `#FFD9C8` | 0.56 | 0.60 | shimmer 3 / 0.68 |
| 포인트 눈꼬리 | 8 | `#7D4658` / `#B66B7A` | 0.62 | 0.55 | satin 0 / 0.18 |
| 크리스 | 9 | `#795B59` / `#A77B75` | 0.50 | 0.25 | matte 1 / 0.00 |
| 스모키 | 10 | `#554B52` / `#846F75` | 0.62 | 0.60 | matte 1 / 0.00 |
| 와이드 그라데 | 11 | `#B36F7B` / `#E0A4A7` | 0.56 | 0.75 | satin 0 / 0.20 |

Set upper height to `1.0` except `스모키=1.15` and `와이드 그라데=1.25`.

| Lower eyeshadow name | Color | Intensity | Finish | Shimmer |
|---|---|---:|---:|---:|
| 피치 새틴 | `#D79A85` | 0.34 | 0 | 0.08 |
| 토프 매트 | `#826C67` | 0.42 | 1 | 0.00 |
| 로지 시머 | `#C98291` | 0.38 | 3 | 0.48 |
| 앞머리 밝힘 | `#EBC7B2` | 0.30 | 3 | 0.38 |
| 바깥 음영 | `#77555C` | 0.46 | 1 | 0.00 |
| 언더 스모키 | `#514A50` | 0.52 | 1 | 0.00 |

The lower renderer does not yet have a separate horizontal shape field, so the first four use the current full band and `바깥 음영`/`언더 스모키` remain full-band color seeds; do not pretend they are localized until a separate approved lower-shadow shape feature exists.

| Upper eyeliner name | Style | Segment | Texture | Finish | Color | Intensity |
|---|---:|---:|---:|---:|---|---:|
| 얇은 브라운 | 4 | 0 | 0 | 0 | `#4A302A` | 0.46 |
| 샤프 블랙 윙 | 0 | 0 | 0 | 1 | `#171416` | 0.72 |
| 퍼피 브라운 | 1 | 0 | 1 | 0 | `#55352F` | 0.58 |
| 가로 롱 | 2 | 0 | 0 | 1 | `#272126` | 0.64 |
| 꼬리 포인트 | 3 | 1 | 0 | 1 | `#20191D` | 0.70 |
| 앞머리+꼬리 | 4 | 2 | 0 | 0 | `#3A2525` | 0.60 |
| 스모키 젤 | 5 | 0 | 1 | 0 | `#46383E` | 0.55 |
| 컬러 펄 | 0 | 3 | 2 | 3 | `#6F486D` | 0.52 |

| Lower eyeliner name | Style | `eyelinerLowerFinish` / `eyelinerLowerShimmer` | Color | Intensity |
|---|---:|---|---|---:|
| 소프트 브라운 | 0 | satin 0 / 0.00 | `#5B3D35` | 0.36 |
| 딥 브라운 | 0 | matte 1 / 0.00 | `#34241F` | 0.48 |
| 버건디 | 0 | satin 0 / 0.05 | `#63313D` | 0.44 |
| 얇은 점막 | 1 | matte 1 / 0.00 | `#292023` | 0.40 |
| 바깥 1/3 | 2 | satin 0 / 0.05 | `#493036` | 0.50 |
| 소프트 펄 | 2 | pearl 3 / 0.48 | `#8A647F` | 0.38 |

| Highlighter region | Intensity field | `은은` seed | `펄` seed |
|---|---|---|---|
| `highlightCheek` | `highlightCheekIntensity` | 0.42, `#F6D6C7`, finish 0, shimmer 0.12 | 0.52, `#FFE2C2`, finish 3, shimmer 0.58 |
| `highlightNoseBridge` | `highlightNoseBridgeIntensity` | 0.32, `#F4D9CB`, finish 0, shimmer 0.08 | 0.42, `#FFE4C7`, finish 3, shimmer 0.48 |
| `highlightNoseTip` | `highlightNoseTipIntensity` | 0.30, `#F6D8C9`, finish 0, shimmer 0.10 | 0.48, `#FFE3C2`, finish 3, shimmer 0.62 |
| `highlightBrowBone` | `highlightBrowBoneIntensity` | 0.30, `#F2D7CA`, finish 0, shimmer 0.08 | 0.40, `#F7DECF`, finish 3, shimmer 0.44 |
| `highlightCupid` | `highlightCupidIntensity` | 0.28, `#F4D5C9`, finish 0, shimmer 0.08 | 0.44, `#FFE0C4`, finish 3, shimmer 0.54 |

Name each highlighter card `<부위> 은은` and `<부위> 펄`. Each definition sets only its matching zone intensity; every other new zone intensity is omitted.

| Aegyo name | Mode | Color | Intensity | Shadow | Shimmer | Height |
|---|---:|---|---:|---:|---:|---:|
| 내추럴 소프트 | 0 | `#F1D2C7` | 0.36 | 0.26 | 0.00 | 0.85 |
| 로지 볼륨 | 0 | `#E9BFC0` | 0.44 | 0.32 | 0.00 | 1.00 |
| 도톰 볼륨 | 0 | `#F0CBBB` | 0.52 | 0.38 | 0.00 | 1.18 |
| 샴페인 펄 | 1 | `#FFE0B8` | 0.44 | 0.28 | 0.54 | 0.95 |
| 핑크 펄 | 1 | `#F2BDD0` | 0.46 | 0.30 | 0.58 | 1.00 |
| 라일락 펄 | 1 | `#DCC8F2` | 0.42 | 0.28 | 0.62 | 0.96 |

Do not change any existing parent eye look child from `internal` to `standalone`. Set `aegyoRendererVersion: 1` on every aegyo row in the table.

- [ ] **Step 6: Verify the mobile half GREEN**

Run the TypeScript contract directly while temporarily allowing the Node runner to skip later Unity markers through a `--mobile-only` flag:

```bash
npm --prefix apps/mobile run test:ar-eye-highlight-aegyo -- --mobile-only
npm --prefix apps/mobile run test:ar-skin-look-scope
npm --prefix apps/mobile run typecheck
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/package.json scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs apps/mobile/src/features/ar/stencil/src/composer/eyeHighlightAegyoContract.test.ts apps/mobile/src/features/ar/stencil/src/bridge/types.ts apps/mobile/src/features/ar/stencil/src/composer/regions.ts apps/mobile/src/features/ar/stencil/src/components/BasicMode.tsx apps/mobile/src/features/ar/stencil/src/components/ComposerSheet.tsx apps/mobile/src/features/ar/stencil/src/composer/multiUse.ts apps/mobile/src/features/ar/stencil/src/composer/fitSheets.ts apps/mobile/src/features/ar/stencil/src/composer/stencilSteps.ts apps/mobile/src/features/ar/stencil/src/composer/lookVariants.ts apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Bridge/BridgeMessages.cs
git commit -m "feat(ar): expand eye and highlight catalogs"
```

---

### Task 3: Extend upper eyeshadow geometry and implement all 12 masks

**Files:**
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/IrisRenderer.cs`
- Modify: `apps/unity/MakeupAR/Assets/Resources/Eyeshadow.shader`
- Test: `scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs`

**Interfaces:**
- Produces: `EyeshadowShapeCount = 12`, anatomical band coordinate `0..1` across the lid and `1..1.28` through the outer extension, and tail alpha `1..0`.
- Preserves: `setEyeshadowLayers`, `EyeshadowLayer.shape`, imported region mask, finish/material/particle paths, and `eyeshadowHeight`.

- [ ] **Step 1: Strengthen the source and numerical contract**

Assert the renderer clamps both direct and layered `shape` values to `0..11`, creates tail vertices, and writes an anatomical coordinate past `1`. Assert the shader has a single shared shape-weight helper called by both single-layer and multi-layer branches.

Run: `npm --prefix apps/mobile run test:ar-eye-highlight-aegyo`

Expected: FAIL on missing geometry/helper markers.

- [ ] **Step 2: Add outer-corner tail topology**

In `IrisRenderer.cs`:

- Add `const int EyeshadowShapeCount = 12` and `const int EyeshadowTailSubdiv = 6`.
- Increase each eye's eyeshadow band columns from the lid sample count to `lid sample count + EyeshadowTailSubdiv`.
- Build the extension from the outer corner along a normalized blend of the outer upper-lid tangent and a small browward vector. Scale total length to `0.28 * eyeWidth`.
- Interpolate six extension samples from the outer corner to the tail tip.
- Store `bandUV.x = 0` at the inner corner, `1` at the original outer corner, and `1.28` at the tail tip. Store the existing bottom/top vertical coordinate in `bandUV.y`.
- Preserve winding, per-eye mirroring, tracking gates, and mesh bounds updates.

- [ ] **Step 3: Implement one shared 12-shape function**

In `Eyeshadow.shader`, add a helper with this contract:

```hlsl
float EyeshadowShapeWeight(float shape, float vertical, float anatomicalX)
```

Use smooth bell/window functions centered at inner `0.18`, center `0.52`, and outer `0.84`. Use vertical profiles for base, main, point, crease, smoky, and wide-gradient families. Compute `tailFade = 1 - smoothstep(1.0, 1.28, anatomicalX)` and apply it to every shape. Additionally suppress tail use for shapes `0`, `1`, `3`, `4`, `6`, `7`, and `9`; allow meaningful tail weight only for `2`, `5`, `8`, `10`, and `11`.

Call the helper from both the direct/single-color and multi-layer branches. Keep imported mask, finish, material, particle, and camera-luma blending after the shape mask.

- [ ] **Step 4: Verify GREEN**

```bash
npm --prefix apps/mobile run test:ar-eye-highlight-aegyo -- --section eyeshadow
npm --prefix apps/mobile run test:unity-bridge
```

Expected: both exit 0; the numerical test confirms outer shapes remain nonzero after `x=1` and all shapes fade to zero at `x=1.28`.

- [ ] **Step 5: Commit**

```bash
git add apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/IrisRenderer.cs apps/unity/MakeupAR/Assets/Resources/Eyeshadow.shader scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs
git commit -m "feat(ar): extend eyeshadow beyond outer corners"
```

---

### Task 4: Expand upper and lower eyeliner rendering

**Files:**
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/IrisRenderer.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/LowerLidRenderer.cs`
- Modify: `apps/unity/MakeupAR/Assets/Resources/LowerLid.shader`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs`
- Test: `scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs`

**Interfaces:**
- Produces: six upper tail profiles and three lower segment profiles with independent lower finish/shimmer.
- Consumes: `FilterParams.eyelinerStyle` and new `FilterParams.eyelinerLowerStyle`, `eyelinerLowerFinish`, and `eyelinerLowerShimmer`.
- Preserves: upper texture/segment/finish controls and lower shared liner color.

- [ ] **Step 1: Add failing style-route assertions**

Assert upper arrays contain six entries and lower `ApplyParams`/shader receive `eyelinerLowerStyle`, `eyelinerLowerFinish`, and `eyelinerLowerShimmer`. Assert a lower standalone card never owns or mutates upper `eyelinerFinish`.

Run: `npm --prefix apps/mobile run test:ar-eye-highlight-aegyo -- --section eyeliner`

Expected: FAIL because upper arrays contain three entries and the lower style is unrouted.

- [ ] **Step 2: Implement six upper profiles**

Replace the three-entry angle/length tables in `IrisRenderer` with six entries for wing-up, puppy, long, cat, straight, and soft-drop. Clamp style to `0..5`. Give cat the steepest positive angle and a medium-long tail, straight a near-zero angle and medium tail, and soft-drop a shallow negative angle with a feathered tail. Preserve the user's thickness and wing-length multipliers.

- [ ] **Step 3: Implement three lower profiles without moving aegyo yet**

Extend the existing `LowerLidRenderer.ApplyParams` signature with lower style, finish, and shimmer while retaining all current aegyo arguments and rendering until Task 6. Pass the three lower-specific fields from `MakeupController` and bind `_LowerLinerStyle`, `_LowerLinerFinish`, and `_LowerLinerShimmer` in `LowerLid.shader`.

Use the existing horizontal lower-lid coordinate to implement:

- style 0: current full soft line.
- style 1: full line with a narrower vertical profile and reduced blur/height.
- style 2: `smoothstep(0.58, 0.82, anatomicalX)` outer-third gate, mirrored per eye by using anatomical rather than screen coordinates.

Apply the existing finish helper semantics to the lower line: `0=satin`, `1=matte`, `2=glossy`, `3=pearl`; pearl uses cell sparkle scaled by `_LowerLinerShimmer`. Do not remove or change the existing aegyo, lower shadow, triangle-zone, or concealer branches in this task.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm --prefix apps/mobile run test:ar-eye-highlight-aegyo -- --section eyeliner
npm --prefix apps/mobile run test:unity-bridge
git add apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/IrisRenderer.cs apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/LowerLidRenderer.cs apps/unity/MakeupAR/Assets/Resources/LowerLid.shader apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs
git commit -m "feat(ar): expand eyeliner shape rendering"
```

---

### Task 5: Split the highlighter into five independently composited zones

**Files:**
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MaskGenerator.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs`
- Modify: `apps/unity/MakeupAR/Assets/Resources/FaceMakeup.shader`
- Test: `scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs`

**Interfaces:**
- Produces: five generated textures and shader properties `_HighlightCheekMask`, `_HighlightNoseBridgeMask`, `_HighlightNoseTipMask`, `_HighlightBrowBoneMask`, `_HighlightCupidMask` plus matching intensity properties.
- Preserves: legacy `_HighlightMask` and `_HighlightIntensity` fallback when every zone intensity is zero.
- Preserves: common highlighter color, finish, shimmer, finish-detail, imported-mask multiplier, lift, spread, and edge-softness behavior.

- [ ] **Step 1: Add failing mask/fallback assertions**

Assert five distinct region definitions and generated-mask accessors exist, the nose-tip coordinates do not belong to the nose-bridge array, and `FaceMakeup.shader` contains a guarded legacy fallback.

Run: `npm --prefix apps/mobile run test:ar-eye-highlight-aegyo -- --section highlighter`

Expected: FAIL because only the combined mask exists.

- [ ] **Step 2: Generate and cache five masks**

Split `HighlightRegion` in `MaskGenerator` into `HighlightCheekRegion`, `HighlightNoseBridgeRegion`, `HighlightNoseTipRegion`, `HighlightBrowBoneRegion`, and `HighlightCupidRegion`. Keep the existing cheek, bridge, brow-bone, and cupid coordinates; add a small elliptical nose-tip point centered below the bridge. Give each mask its own cache key and public shape-mask method. Keep `HighlightShapeMask()` as a combined compatibility texture.

- [ ] **Step 3: Bind masks and intensities**

Add shader property IDs in `MakeupController`, bind all five masks in material creation and mask rebakes, and set all five clamped intensities on every `FilterParams` application. Continue setting the legacy intensity and mask.

- [ ] **Step 4: Composite with explicit fallback**

In `FaceMakeup.shader`, sample all five masks and compute:

```hlsl
float zonePeak = max(max(_HighlightCheekIntensity, _HighlightNoseBridgeIntensity),
                     max(max(_HighlightNoseTipIntensity, _HighlightBrowBoneIntensity),
                         _HighlightCupidIntensity));
float zoneHighlight = max(max(cheekMask * _HighlightCheekIntensity,
                              bridgeMask * _HighlightNoseBridgeIntensity),
                          max(max(tipMask * _HighlightNoseTipIntensity,
                                  browMask * _HighlightBrowBoneIntensity),
                              cupidMask * _HighlightCupidIntensity));
float highlightAmount = zonePeak > 1e-5
  ? zoneHighlight
  : legacyHighlightMask * _HighlightIntensity;
```

Apply imported mask and common finish/color logic after selecting the zone/legacy amount. Use `max`, not sum, so overlap does not overexpose.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm --prefix apps/mobile run test:ar-eye-highlight-aegyo -- --section highlighter
npm --prefix apps/mobile run test:unity-bridge
git add apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MaskGenerator.cs apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs apps/unity/MakeupAR/Assets/Resources/FaceMakeup.shader scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs
git commit -m "feat(ar): split highlighter facial zones"
```

---

### Task 6: Rebuild aegyo as a dedicated renderer

**Files:**
- Create: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/AegyoRenderer.cs`
- Create: `apps/unity/MakeupAR/Assets/Resources/Aegyo.shader`
- Generate: corresponding Unity `.meta` files
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/LowerLidRenderer.cs`
- Modify: `apps/unity/MakeupAR/Assets/Resources/LowerLid.shader`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MakeupQueues.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/ARBootstrap.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/IrisRenderer.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/StencilGuideRenderer.cs`
- Test: `scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs`

**Interfaces:**
- Produces: singleton `AegyoRenderer`, `NeedsEyeMask`, `TryGetAegyoFitHandle`, and `ApplyParams(intensity, color, height, mode, shadowIntensity, shimmer)`.
- Consumes: `aegyoRendererVersion >= 1` as the explicit new-mode marker; only version-0 payloads infer mode from legacy `aegyoFinish`.
- Preserves: eye-stencil exclusion, ARKit occlusion, tracking visibility, fit-guide handle, and current `aegyoIntensity/color/height/shimmer` fields.

- [ ] **Step 1: Add failing ownership assertions**

Assert `LowerLidRenderer.cs` and `LowerLid.shader` contain no `Aegyo`, decal texture, finish, or shimmer identifiers; `AegyoRenderer` owns the fit handle and eye-mask need; bootstrap/controller/stencil all reference it; and `setAegyoStyle` is accepted as a no-op rather than routed to a texture loader.

Run: `npm --prefix apps/mobile run test:ar-eye-highlight-aegyo -- --section aegyo`

Expected: FAIL because aegyo is still coupled to `LowerLidRenderer`.

- [ ] **Step 2: Create the dedicated mesh renderer**

Implement `AegyoRenderer` using the existing lower-lid landmark arcs and `LidArcFit` smoothing helper. Build one two-dimensional band per eye with enough vertical rows to separate highlight and shadow profiles. Scale band height by eye width and clamped `aegyoHeight` (`0.3..1.4`). Write anatomical inner-to-outer position and vertical position into UVs.

Set `NeedsEyeMask` when intensity is positive, expose the highlight-peak viewport position through `TryGetAegyoFitHandle`, and use the same tracking/visibility decay pattern as `LowerLidRenderer`. Assign `MakeupQueues.Aegyo` between lower-lid color and lower lashes.

- [ ] **Step 3: Implement the natural-volume and pearl shader**

Create `Aegyo.shader` with shared `_CameraFeed`, eye-stencil `NotEqual`, ARKit occlusion, and transparent premultiplied blending consistent with neighboring eye overlays. Add one helper:

```hlsl
void AegyoVerticalProfile(float vertical, out float lift, out float shadow)
```

Use overlapping Gaussian/bell profiles rather than hard bands. Derive lift from camera-feed luminance so the natural mode raises local skin without replacing it with flat color. Place a broad, low-opacity shadow immediately below the lift. Multiply both by a soft horizontal edge fade.

For mode 1, add cell-based micro-sparkle concentrated near anatomical center (`x ~= 0.5`) and the lift peak. Multiply pearl strength by `aegyoShimmer`; mode 0 must have exactly zero sparkle. End alpha at every mesh edge.

- [ ] **Step 4: Remove old ownership and wire the new renderer**

Remove aegyo material IDs, state, texture loading, fit handle, mesh-height coupling, and shader branches from `LowerLidRenderer`/`LowerLid.shader`. Keep the lower-lid mesh height sufficient for lower liner, shadow, triangle-zone, and concealer independently of `aegyoHeight`.

Add `MakeupQueues.Aegyo = 3008`, shift lower lash and subsequent named constants by one, and update the queue documentation. Instantiate `AegyoRenderer` after `LowerLidRenderer` in `ARBootstrap`.

In `MakeupController`:

```csharp
var isNewAegyo = p.aegyoRendererVersion >= 1f;
var normalizedAegyoMode = isNewAegyo
    ? (p.aegyoMode >= 0.5f ? 1 : 0)
    : (p.aegyoFinish == 3f ? 1 : 0);
var normalizedShadow = isNewAegyo
    ? Mathf.Clamp01(p.aegyoShadowIntensity)
    : Mathf.Clamp01(p.aegyoIntensity * 0.68f);
AegyoRenderer.Instance.ApplyParams(
    p.aegyoIntensity,
    p.aegyoColor,
    p.aegyoHeight,
    normalizedAegyoMode,
    normalizedShadow,
    p.aegyoShimmer);
```

This preserves an explicit shadow value of `0` in new looks and derives a default only for version-0 legacy payloads. Handle `setAegyoStyle` by logging a compatibility message and returning success without loading a file.

Include `AegyoRenderer.Instance.NeedsEyeMask` in `IrisRenderer`'s stencil visibility gate. Change `StencilGuideRenderer` fit-handle lookup from `LowerLidRenderer` to `AegyoRenderer` while preserving its landmark fallback.

- [ ] **Step 5: Import assets, verify GREEN, and commit**

Run Unity once so it generates `.meta` files and compiles the ownership transfer:

```bash
"/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity" \
  -batchmode -quit \
  -projectPath "/Users/hi/dev/Jungle/302-group5-final-project/.worktrees/makeup-ar-0715/apps/unity/MakeupAR" \
  -logFile -
```

Expected: exit 0 and `.meta` files exist beside both new assets. Then run:

```bash
npm --prefix apps/mobile run test:ar-eye-highlight-aegyo -- --section aegyo
npm --prefix apps/mobile run test:unity-bridge
```

Expected: both exit 0; the source contract proves all aegyo ownership moved and the old decal path is inert.

Also have the contract parse `MakeupQueues.cs` and assert every makeup queue value is unique and the eye order is `LowerLid < Aegyo < LowerLash < Iris < Eyeliner`.

Stage only the new renderer/shader `.meta` files, not unrelated Unity-generated scene/XR changes:

```bash
git add apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/AegyoRenderer.cs apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/AegyoRenderer.cs.meta apps/unity/MakeupAR/Assets/Resources/Aegyo.shader apps/unity/MakeupAR/Assets/Resources/Aegyo.shader.meta apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/LowerLidRenderer.cs apps/unity/MakeupAR/Assets/Resources/LowerLid.shader apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MakeupQueues.cs apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/ARBootstrap.cs apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/IrisRenderer.cs apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/StencilGuideRenderer.cs scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs
git commit -m "feat(ar): rebuild aegyo rendering"
```

---

### Task 7: Run full regression and review evidence

**Files:**
- Modify if needed: `docs/superpowers/plans/2026-07-15-ar-skin-correction-and-look-scope.md`
- Modify if needed: only files directly implicated by failing tests

- [ ] **Step 1: Run all focused contracts**

```bash
npm --prefix apps/mobile run test:ar-eye-highlight-aegyo
npm --prefix apps/mobile run test:ar-skin-look-scope
npm --prefix apps/mobile run test:ar-skin-primer
npm --prefix apps/mobile run test:unity-bridge
npm --prefix apps/mobile run test:ar-guide-all
```

Expected: every command exits 0.

- [ ] **Step 2: Run mobile typecheck**

Run: `npm --prefix apps/mobile run typecheck`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 3: Run Unity batch compilation**

```bash
"/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity" \
  -batchmode -quit \
  -projectPath "/Users/hi/dev/Jungle/302-group5-final-project/.worktrees/makeup-ar-0715/apps/unity/MakeupAR" \
  -logFile -
```

Expected: exit 0; no C# or shader compilation errors.

- [ ] **Step 4: Inspect diff hygiene**

Fix the previously detected extra blank line at EOF in `docs/superpowers/plans/2026-07-15-ar-skin-correction-and-look-scope.md`, then run:

```bash
git diff --check aedf3ea8..HEAD
git diff --check
git diff --cached --check
git status --short
```

Expected: no whitespace errors. Only the known local iOS/Unity build files remain unstaged.

- [ ] **Step 5: Commit verification-only cleanup if needed**

```bash
git add docs/superpowers/plans/2026-07-15-ar-skin-correction-and-look-scope.md
git commit -m "docs(ar): clean implementation plan formatting"
```

Skip this commit if no tracked cleanup remains.

- [ ] **Step 6: Review other makeup gaps without scope creep**

Inspect only evidence encountered during this implementation. If another makeup area has a concrete structural gap, report current behavior, user impact, proposed addition, and rough file/test scope separately. Do not implement it in this branch without a new request.
