# AR Skin Correction and Look Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen default and maximum skin smoothing, cap tone-up foundation brightness at the accepted rosy-look result, and keep parent look contents out of sub-region pickers.

**Architecture:** Keep the existing `FilterParams` and RN-to-Unity bridge contract. Add explicit picker-scope metadata to serialized look definitions, strengthen the existing bilateral smoothing curve in the shared screen-space shader, and apply a per-pixel luminance guard after foundation tone correction. Contract tests cover catalog provenance and shader math while Unity batch compilation validates shader/C# integration.

**Tech Stack:** React Native, TypeScript 6, Node.js contract runners, Unity 6000.3.18f1, HLSL/ShaderLab

## Global Constraints

- Preserve `skinSmoothing` and all existing bridge fields as 0..1 values; value 0 remains an exact no-op.
- Do not add UI controls or dependencies.
- Preserve eye, brow, lip, hairline, background, and segmentation exclusions.
- Preserve existing local iOS signing/build edits and do not stage them.
- Use only explicit look metadata for hierarchy filtering; do not filter by display names.
- Keep full-face, slot, and sub-region picker behavior independent.

---

### Task 1: Enforce sub-region picker provenance

**Files:**
- Create: `apps/mobile/src/features/ar/stencil/src/composer/skinAndLookScopeContract.test.ts`
- Create: `scripts/mobile/run-ar-skin-and-look-scope-contract.mjs`
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/lookTree.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/lookVariants.ts`

**Interfaces:**
- Produces: `LookDef.pickerScope?: 'internal' | 'standalone'`.
- Produces: `subDefsForRegion(lib, region)` returning only explicit standalone definitions plus metadata-free legacy user definitions.
- Preserves: `regionDefsForSlot`, `buildSystemLibrary`, `instantiate`, `setSlotRegion`, and `setSubRegion` signatures.

- [ ] **Step 1: Write the failing picker-scope contract**

Create a merged library from `buildSystemLibrary()` and `buildVariantLibrary()`, then assert:

~~~ts
const upperLiner = subDefsForRegion(library, 'eyelinerUpper');
expect(
  upperLiner.every(def => def.pickerScope === 'standalone'),
  '상위 눈 룩의 내부 아이라이너가 세부부위 카드에 노출되면 안 된다',
);
expect(
  !upperLiner.some(def => /로지|로즈골드|스모키/.test(def.name)),
  '상위 눈 룩 이름이 아이라인 세부부위 카드에 섞이면 안 된다',
);

const lowerLiner = subDefsForRegion(library, 'eyelinerLower');
expect(lowerLiner.some(def => def.name === '소프트 브라운'), '아이라인 하 전용 룩은 유지한다');

const skin = subDefsForRegion(library, 'skin');
expect(skin.some(def => def.name === '모공 프라이머'), '모공 프라이머 전용 카드를 유지한다');
expect(skin.some(def => def.name === '윤광 프라이머'), '윤광 프라이머 전용 카드를 유지한다');

expect(
  regionDefsForSlot(library, '눈').some(def => def.name === '로즈골드 시머'),
  '상위 눈 룩은 눈 전체 카드에 계속 노출되어야 한다',
);
~~~

Add a metadata-free user `sub` fixture and assert it remains visible for backward compatibility.

- [ ] **Step 2: Add and run the contract runner to verify RED**

Create `run-ar-skin-and-look-scope-contract.mjs` using the existing `run-ar-skin-primer-contract.mjs` compile-and-execute pattern. Add:

~~~json
"test:ar-skin-look-scope": "node ../../scripts/mobile/run-ar-skin-and-look-scope-contract.mjs"
~~~

Run: `npm --prefix apps/mobile run test:ar-skin-look-scope`

Expected: FAIL because `LookDef.pickerScope` does not exist and upper-look children are still returned.

- [ ] **Step 3: Implement explicit picker scope**

In `lookTree.ts` add:

~~~ts
export type SubPickerScope = 'internal' | 'standalone';

export interface LookDef {
  pickerScope?: SubPickerScope;
}
~~~

Mark `buildSystemLibrary()` sub definitions `internal`. Change `subDefsForRegion()` to require `standalone`, retaining metadata-free user definitions:

~~~ts
const pickerVisible =
  d.pickerScope === 'standalone' ||
  (d.pickerScope == null && d.owner === 'user');
~~~

When materializing child sub definitions for saved region/group looks, set `pickerScope: 'internal'`.

In `lookVariants.ts`, mark generated sub definitions `internal` when `exposeAtRegionLevel` is true and `standalone` when false. Add two region-wrapper-free standalone definitions for `모공 프라이머` and `윤광 프라이머` using the same params as their parent skin looks.

- [ ] **Step 4: Verify GREEN**

Run:

~~~bash
npm --prefix apps/mobile run test:ar-skin-look-scope
npm --prefix apps/mobile run test:ar-skin-primer
~~~

Expected: both exit 0; upper eye look children are absent while dedicated liner and primer cards remain.

- [ ] **Step 5: Commit**

~~~bash
git add apps/mobile/package.json scripts/mobile/run-ar-skin-and-look-scope-contract.mjs apps/mobile/src/features/ar/stencil/src/composer/skinAndLookScopeContract.test.ts apps/mobile/src/features/ar/stencil/src/composer/lookTree.ts apps/mobile/src/features/ar/stencil/src/composer/lookVariants.ts
git commit -m "fix(ar): isolate sub-region look cards"
~~~

---

### Task 2: Strengthen default and maximum skin smoothing

**Files:**
- Modify: `apps/mobile/src/features/ar/stencil/src/presets.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/lookVariants.ts`
- Modify: `apps/mobile/src/features/ar/services/unityMakeupBridge.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/skinAndLookScopeContract.test.ts`
- Modify: `scripts/mobile/run-ar-skin-and-look-scope-contract.mjs`
- Modify: `apps/unity/MakeupAR/Assets/Resources/ScreenSpaceFoundation.shader`

**Interfaces:**
- Consumes: existing `skinSmoothing: number`.
- Produces: nonlinear shader radius curve with a roughly 5.2x maximum radius scale.
- Preserves: exact smoothing no-op at 0 and existing mask/grain logic.

- [ ] **Step 1: Extend the contract for stronger presets and curve**

Assert exact preset strengths:

~~~ts
expect(byId.bare.params.skinSmoothing === 0, '원본은 피부 보정이 없어야 한다');
expect(byId.custom.params.skinSmoothing === 0, '직접 시작점은 피부 보정이 없어야 한다');
expect(byId.natural.params.skinSmoothing === 0.53, '내추럴 기본 보정을 강화한다');
expect(byId.rosy.params.skinSmoothing === 0.63, '로지 기본 보정을 강화한다');
expect(byId.peach.params.skinSmoothing === 0.58, '피치 기본 보정을 강화한다');
expect(byId.glam.params.skinSmoothing === 0.68, '글램 기본 보정을 강화한다');
expect(byId.smoky.params.skinSmoothing === 0.58, '스모키 기본 보정을 강화한다');
~~~

In the Node runner, read `ScreenSpaceFoundation.shader` and numerically verify:

~~~js
const oldRadius = strength => 0.7 + 2.3 * strength;
const newRadius = strength => 0.8 + 2.4 * strength + 2.0 * strength ** 3;
assert.ok(newRadius(0.55) >= oldRadius(0.55) * 1.15);
assert.ok(newRadius(1) >= oldRadius(1) * 1.7);
~~~

- [ ] **Step 2: Verify RED**

Run: `npm --prefix apps/mobile run test:ar-skin-look-scope`

Expected: FAIL on unchanged preset values and missing nonlinear shader term.

- [ ] **Step 3: Implement stronger defaults and response**

Set preset smoothing values to `0.53`, `0.63`, `0.58`, `0.68`, and `0.58` for natural, rosy, peach, glam, and smoky. Raise glow primer smoothing from `0.35` to `0.45`, pore primer from `0.50` to `0.60`, and the default foundation-selection smoothing in `unityMakeupBridge.ts` from `0.35` to `0.45`.

In `SkinSmoothedCamera()` use:

~~~hlsl
float smoothStrength = saturate(strength);
float highStrength = smoothStrength * smoothStrength * smoothStrength;
float radiusScale = 0.8 + 2.4 * smoothStrength + 2.0 * highStrength;
float rangeSharpness = lerp(140.0, 6.0, smoothStrength);
~~~

Raise the blend response from `1.7` to `1.85`. Keep the zero guard, mask sampling, and micro-grain unchanged.

- [ ] **Step 4: Verify GREEN**

Run:

~~~bash
npm --prefix apps/mobile run test:ar-skin-look-scope
npm --prefix apps/mobile run test:unity-bridge
~~~

Expected: both exit 0 and the new maximum radius is at least 70% above the former maximum.

- [ ] **Step 5: Commit**

~~~bash
git add apps/mobile/src/features/ar/stencil/src/presets.ts apps/mobile/src/features/ar/stencil/src/composer/lookVariants.ts apps/mobile/src/features/ar/services/unityMakeupBridge.ts apps/mobile/src/features/ar/stencil/src/composer/skinAndLookScopeContract.test.ts scripts/mobile/run-ar-skin-and-look-scope-contract.mjs apps/unity/MakeupAR/Assets/Resources/ScreenSpaceFoundation.shader
git commit -m "feat(ar): strengthen skin smoothing response"
~~~

---

### Task 3: Cap foundation tone-up at the rosy reference

**Files:**
- Modify: `apps/unity/MakeupAR/Assets/Resources/ScreenSpaceFoundation.shader`
- Modify: `scripts/mobile/run-ar-skin-and-look-scope-contract.mjs`

**Interfaces:**
- Produces: `ClampFoundationToRosyReference(cameraColor, candidateColor)`.
- Preserves: darker foundation movement, intensity, coverage, evenness, and mask behavior.

- [ ] **Step 1: Add a failing rosy luminance contract**

In the Node runner, require a rosy strength of `0.3`, require the clamp call from `CorrectCameraColor`, and verify a JavaScript mirror:

~~~js
const luma = rgb => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
const rosy = rgb => rgb.map(channel => Math.min(1, channel * (1 + 0.18 * 0.3) + 0.04 * 0.3));
const clampToRosy = (camera, candidate) => {
  const limit = luma(rosy(camera));
  const current = luma(candidate);
  const scale = current > limit ? limit / Math.max(current, 1e-4) : 1;
  return candidate.map(channel => Math.min(1, channel * scale));
};
assert.ok(
  luma(clampToRosy([0.62, 0.48, 0.40], [0.85, 0.75, 0.70])) <=
    luma(rosy([0.62, 0.48, 0.40])) + 1e-6,
);
~~~

- [ ] **Step 2: Verify RED**

Run: `npm --prefix apps/mobile run test:ar-skin-look-scope`

Expected: FAIL because the rosy luminance clamp is absent.

- [ ] **Step 3: Implement the luminance guard**

Add beside `FoundationLuma` and use from `CorrectCameraColor`:

~~~hlsl
float3 ClampFoundationToRosyReference(float3 cameraColor, float3 candidateColor)
{
    const float rosyStrength = 0.3;
    float3 rosyReference = saturate(
        cameraColor * (1.0 + 0.18 * rosyStrength) + 0.04 * rosyStrength);
    float maxLuma = FoundationLuma(rosyReference);
    float candidateLuma = max(FoundationLuma(candidateColor), 1e-4);
    float lumaScale = min(1.0, maxLuma / candidateLuma);
    return saturate(candidateColor * lumaScale);
}
~~~

Mix the candidate by `amount`, then clamp the mixed result before returning. Candidates below the rosy reference keep scale 1, so darker movement remains unchanged.

- [ ] **Step 4: Verify GREEN**

Run:

~~~bash
npm --prefix apps/mobile run test:ar-skin-look-scope
"/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity" -batchmode -quit -projectPath "/Users/hi/dev/Jungle/302-group5-final-project/.worktrees/makeup-ar-0715/apps/unity/MakeupAR" -logFile -
~~~

Expected: contract exits 0; Unity reports script compilation success and exits 0.

- [ ] **Step 5: Commit**

~~~bash
git add apps/unity/MakeupAR/Assets/Resources/ScreenSpaceFoundation.shader scripts/mobile/run-ar-skin-and-look-scope-contract.mjs
git commit -m "fix(ar): cap foundation tone-up luminance"
~~~

---

### Task 4: Full regression verification

**Files:**
- Verify only; no planned product file changes.

- [ ] **Step 1: Run focused contracts**

~~~bash
npm --prefix apps/mobile run test:ar-skin-look-scope
npm --prefix apps/mobile run test:ar-skin-primer
npm --prefix apps/mobile run test:unity-bridge
npm --prefix apps/mobile run test:ar-guide-all
~~~

Expected: all four commands exit 0.

- [ ] **Step 2: Run mobile typecheck**

Run: `npm --prefix apps/mobile run typecheck`

Expected: TypeScript exits 0 with no diagnostics.

- [ ] **Step 3: Run fresh Unity batch compile**

Run the Unity command from Task 3.

Expected: Unity exits 0 with no compile errors.

- [ ] **Step 4: Audit the final diff and local-only files**

Run:

~~~bash
git diff --check HEAD~3..HEAD
git status --short
git log -4 --oneline
~~~

Expected: no whitespace errors; only pre-existing iOS/Unity build-local edits remain uncommitted; all implementation commits use Conventional Commit messages.

