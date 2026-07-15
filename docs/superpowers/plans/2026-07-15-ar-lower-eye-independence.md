# AR Lower Eye Independence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하단 아이섀도에 실제 앞·중앙·뒤·전체·스모키 위치 마스크를 추가하고 하단 아이라인 색상을 상단과 독립시킨다.

**Architecture:** 모바일 `FilterParams`와 룩 카탈로그가 두 전용 필드를 소유하고 기존 필터 JSON 브리지로 전달한다. Unity는 기존 `LowerLidRenderer`/`LowerLid.shader` 안에서 하단 아이섀도 가로 마스크를 적용하고, 하단 아이라인 색은 전용 필드를 우선 사용하되 구형 payload만 상단 색으로 폴백한다.

**Tech Stack:** React Native, TypeScript, Node 계약 러너, Unity 6, C#, ShaderLab/HLSL

## Global Constraints

- 새 UI·아이콘·렌더링 라이브러리를 추가하지 않는다.
- 기존 `LowerLidRenderer`와 `LowerLid.shader` 경계를 유지한다.
- 상단 아이섀도와 상단 아이라인 동작은 변경하지 않는다.
- 생략된 `eyeshadowLowerShape=0`은 기존 전체 모양이다.
- 빈 `eyelinerLowerColor`는 구형 payload 호환을 위해 `eyelinerColor`로 폴백한다.
- 기존 iOS 서명·Pod·Unity 씬/XR 설정 로컬 변경을 스테이징하지 않는다.

---

### Task 1: Mobile lower-eye contract and catalog

**Files:**
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/eyeHighlightAegyoContract.test.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/bridge/types.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/presets.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/regions.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/lookVariants.ts`

**Interfaces:**
- Produces: `FilterParams.eyeshadowLowerShape?: number`
- Produces: `FilterParams.eyelinerLowerColor?: string`
- Produces: `EYESHADOW_LOWER_SHAPES` with values `0..4`

- [ ] **Step 1: Write the failing mobile contract**

Add exact assertions to `eyeHighlightAegyoContract.test.ts`:

```ts
const lowerShadowShapes = subDefsForRegion(library, 'eyeshadowLower')
  .map(def => firstParams(def).eyeshadowLowerShape)
  .sort((a, b) => Number(a) - Number(b));
expect(
  JSON.stringify(lowerShadowShapes) === JSON.stringify([0, 0, 1, 2, 3, 4]),
  '하단 아이섀도 룩은 전체·앞·중앙·뒤·스모키 위치를 명시해야 한다',
);

expect(
  subDefsForRegion(library, 'eyelinerLower').every(def => {
    const params = firstParams(def);
    return typeof params.eyelinerLowerColor === 'string' && params.eyelinerColor == null;
  }),
  '하단 아이라인 룩은 전용 색만 소유해야 한다',
);
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```bash
npm --prefix apps/mobile run test:ar-eye-highlight-aegyo -- --mobile-only
```

Expected: FAIL because lower-shadow look params have no `eyeshadowLowerShape` and lower-liner look params still own `eyelinerColor`.

- [ ] **Step 3: Add the mobile fields and controls**

Add optional fields to `FilterParams` and initialize new-client defaults in `BARE`:

```ts
eyeshadowLowerShape?: number;
eyelinerLowerColor?: string;
```

```ts
eyeshadowLowerShape: 0,
eyelinerLowerColor: '#181418',
```

Add the shape options and expose them on the lower-shadow shape axis:

```ts
export const EYESHADOW_LOWER_SHAPES = [
  {value: 0, label: '전체'},
  {value: 1, label: '앞쪽'},
  {value: 2, label: '중앙'},
  {value: 3, label: '뒤쪽'},
  {value: 4, label: '스모키'},
];
```

Change the lower-liner color swatch key to `eyelinerLowerColor` and remove the shared-color note.

- [ ] **Step 4: Assign every lower-eye look explicitly**

Extend the lower-shadow tuple with shapes:

```ts
['peach-satin', '피치 새틴', 0, '#D79A85', 0.34, 0, 0.08],
['taupe-matte', '토프 매트', 0, '#826C67', 0.42, 1, 0],
['rosy-shimmer', '로지 시머', 2, '#C98291', 0.38, 3, 0.48],
['inner-bright', '앞머리 밝힘', 1, '#EBC7B2', 0.3, 3, 0.38],
['outer-shadow', '바깥 음영', 3, '#77555C', 0.46, 1, 0],
['under-smoky', '언더 스모키', 4, '#514A50', 0.52, 1, 0],
```

Write each lower-liner look color to `eyelinerLowerColor`, never `eyelinerColor`.

- [ ] **Step 5: Verify GREEN and type safety**

Run:

```bash
npm --prefix apps/mobile run test:ar-eye-highlight-aegyo -- --mobile-only
npm --prefix apps/mobile run typecheck
```

Expected: both exit 0.

- [ ] **Step 6: Commit mobile behavior**

```bash
git add apps/mobile/src/features/ar/stencil/src/composer/eyeHighlightAegyoContract.test.ts apps/mobile/src/features/ar/stencil/src/bridge/types.ts apps/mobile/src/features/ar/stencil/src/presets.ts apps/mobile/src/features/ar/stencil/src/composer/regions.ts apps/mobile/src/features/ar/stencil/src/composer/lookVariants.ts
git commit -m "feat(ar): separate lower eye controls"
```

---

### Task 2: Unity lower-shadow masks and liner color

**Files:**
- Modify: `scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Bridge/BridgeMessages.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/LowerLidRenderer.cs`
- Modify: `apps/unity/MakeupAR/Assets/Resources/LowerLid.shader`

**Interfaces:**
- Consumes: `eyeshadowLowerShape` values `0..4`
- Consumes: `eyelinerLowerColor`, with an empty-string legacy fallback
- Produces: shader properties `_LowerShadowShape` and existing `_LinerColor`

- [ ] **Step 1: Write the failing Unity contract**

Add `checkLowerEyeIndependence()` to the runner. It must require these source markers:

```js
mustHave(bridge, 'public int eyeshadowLowerShape = 0;');
mustHave(bridge, 'public string eyelinerLowerColor = "";');
mustHave(lower, 'LowerShadowShapeId');
mustHave(shader, '_LowerShadowShape');
mustHave(shader, 'LowerShadowHorizontalMask');
mustHave(controller, 'string.IsNullOrEmpty(p.eyelinerLowerColor)');
```

Add a JavaScript mirror of the five horizontal masks and assert:

```js
assert.ok(lowerShadowMask(1, 0.18) > lowerShadowMask(1, 0.82));
assert.ok(lowerShadowMask(2, 0.5) > lowerShadowMask(2, 0.15));
assert.ok(lowerShadowMask(3, 0.82) > lowerShadowMask(3, 0.18));
assert.ok(lowerShadowMask(4, 0.82) > lowerShadowMask(4, 0.18));
```

- [ ] **Step 2: Run the Unity contract and verify RED**

Run:

```bash
node scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs --section lower-eye
```

Expected: FAIL on the missing bridge fields or `_LowerShadowShape` marker.

- [ ] **Step 3: Extend the bridge and controller**

Add fields:

```csharp
public int eyeshadowLowerShape = 0;
public string eyelinerLowerColor = "";
```

Normalize only legacy lower-liner payloads:

```csharp
var lowerLinerColor = string.IsNullOrEmpty(p.eyelinerLowerColor)
    ? p.eyelinerColor
    : p.eyelinerLowerColor;
```

Pass `lowerLinerColor` to `ApplyParams` and `p.eyeshadowLowerShape` to `ApplyLowerShadow`.

- [ ] **Step 4: Add the renderer property**

Add `LowerShadowShapeId`, accept `int shape` in `ApplyLowerShadow`, clamp it to `0..4`, and set `_LowerShadowShape` on the material.

- [ ] **Step 5: Add the shader mask**

Declare `_LowerShadowShape` and implement:

```hlsl
float LowerShadowHorizontalMask(float shape, float along)
{
    float edge = smoothstep(0.0, 0.08, along)
               * (1.0 - smoothstep(0.92, 1.0, along));
    if (shape < 0.5) return edge;
    if (shape < 1.5) return edge * (1.0 - smoothstep(0.22, 0.5, along));
    if (shape < 2.5)
        return edge * smoothstep(0.18, 0.4, along)
                    * (1.0 - smoothstep(0.6, 0.82, along));
    if (shape < 3.5) return edge * smoothstep(0.5, 0.78, along);
    return edge * lerp(0.55, 1.0, smoothstep(0.2, 0.86, along));
}
```

Multiply the existing lower-shadow vertical band by this function. Shape 0 remains algebraically identical to the existing `edge` path.

- [ ] **Step 6: Verify GREEN and compile Unity**

Run:

```bash
node scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs --section lower-eye
"/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity" -batchmode -quit -projectPath "$(pwd)/apps/unity/MakeupAR" -logFile -
```

Expected: contract exits 0; Unity logs `Tundra build success` and exits 0.

- [ ] **Step 7: Commit Unity behavior**

```bash
git add scripts/mobile/run-ar-eye-highlight-aegyo-contract.mjs apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Bridge/BridgeMessages.cs apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/LowerLidRenderer.cs apps/unity/MakeupAR/Assets/Resources/LowerLid.shader
git commit -m "feat(ar): localize lower eye makeup"
```

---

### Task 3: Regression verification and branch hygiene

**Files:**
- Verify only; no planned production edits

**Interfaces:**
- Consumes: the completed mobile and Unity lower-eye contracts
- Produces: fresh verification evidence and a clean intended commit range

- [ ] **Step 1: Run focused and neighboring AR contracts**

```bash
npm --prefix apps/mobile run test:ar-eye-highlight-aegyo
npm --prefix apps/mobile run test:ar-skin-look-scope
npm --prefix apps/mobile run test:unity-bridge
npm --prefix apps/mobile run test:ar-guide-all
npm --prefix apps/mobile run typecheck
```

Expected: every command exits 0.

- [ ] **Step 2: Inspect the intended diff**

```bash
git diff --check HEAD~3..HEAD
git status --short --branch
git log -5 --oneline
```

Expected: no whitespace error in the new commit range; only pre-existing iOS/Unity build-local edits remain uncommitted; the branch remains `fix/makeup-ar-0715`.
