# ARwithFable Render Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the grafted AR makeup renderer and stencil payloads match `cloud-9-git/ARwithFable` `origin/main`, while preserving the shared Face3D camera, landmark, and segmentation producers.

**Architecture:** Treat the upstream `origin/main` files as the rendering reference and remove fork-only makeup consumers. Keep AURA host integration and Face3D input production, but ensure one makeup renderer owns each region and lock RN/C# JsonUtility fields together.

**Tech Stack:** Unity C#/ShaderLab, React Native TypeScript, Node contract tests, Git.

## Global Constraints

- ARwithFable `origin/main` is the rendering authority; fork-only rendering behavior is removed even when visually preferable.
- Preserve Face3D camera frames, landmarks, and segmentation generation.
- Change `apps/mobile/src/features/ar/stencil/src/bridge/types.ts` and `BridgeMessages.cs` in lockstep.
- Preserve Korean comments that remain applicable.
- Complete each behavior change with a focused verification and commit.

---

### Task 1: Remove camera-color lip boundary snapping

**Files:**
- Modify: `scripts/mobile/run-unity-makeup-bridge-contract.mjs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/LipRenderer.cs`

**Interfaces:**
- Consumes: `FaceLandmarkSource.Landmarks` and the existing lip-ring geometry.
- Produces: lip outer control points based only on landmarks/fit/overline, with no camera RGB sampling.

- [ ] Add a static contract that rejects `EnableSnap`, `TrySampleColor`, snap constants/buffers, and `ComputeOuterSnap` camera sampling in `LipRenderer.cs`.
- [ ] Run `npm --prefix apps/mobile run test:unity-bridge`; expect failure naming the lip snap contract.
- [ ] Replace the snap phase with landmark-only geometry while retaining center/radius, upper-lip bias, overline, liner, and arc-fit calculations.
- [ ] Re-run the focused contract; expect exit 0.
- [ ] Commit as `fix(ar): remove fork lip image boundary snapping`.

### Task 2: Match upstream lower-lid/aegyo rendering

**Files:**
- Modify: `scripts/mobile/run-unity-makeup-bridge-contract.mjs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/ARBootstrap.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/LowerLidRenderer.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/IrisRenderer.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MakeupQueues.cs`
- Modify: `apps/unity/MakeupAR/Assets/Resources/LowerLid.shader`
- Delete: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/AegyoRenderer.cs`
- Delete: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/AegyoRenderer.cs.meta`
- Delete: `apps/unity/MakeupAR/Assets/Resources/Aegyo.shader`
- Delete: `apps/unity/MakeupAR/Assets/Resources/Aegyo.shader.meta`

**Interfaces:**
- Consumes: upstream `FilterParams.aegyoIntensity`, `aegyoColor`, `aegyoFinish`, `aegyoShimmer`, `aegyoTexture`, `aegyoShape`, and imported aegyo art.
- Produces: the upstream combined lower-lid pass and upstream render-queue order.

- [ ] Add static contracts rejecting the dedicated `AegyoRenderer` pass and requiring upstream queue values and lower-lid uniforms.
- [ ] Run the focused contract and verify it fails on the dedicated pass.
- [ ] Restore the upstream lower-lid renderer/shader behavior, remove dedicated bootstrap/call sites, and restore queue numbers.
- [ ] Re-run the focused contract and `npm --prefix apps/mobile run test:ar-guide-all`; expect exit 0.
- [ ] Commit as `fix(ar): restore upstream aegyo lower-lid pass`.

### Task 3: Match the upstream FaceMakeup foundation pass

**Files:**
- Modify: `scripts/mobile/run-unity-makeup-bridge-contract.mjs`
- Modify: `apps/unity/MakeupAR/Assets/Resources/FaceMakeup.shader`

**Interfaces:**
- Consumes: the existing graft `FilterParams` foundation uniforms and camera feed.
- Produces: the upstream `Foundation.cginc` target, soft-clip, texture parameters, and blend response in the single `FaceMakeup` pass.

- [ ] Add a contract requiring the upstream `Foundation.cginc`, `FoundationTextureParams`, `FoundationTarget`, `FoundationSoftClip`, and `FoundationBlend` calls.
- [ ] Run the focused contract; expect failure on the fork-local formula.
- [ ] Apply the upstream shader implementation without changing Face3D resources or segmentation producers.
- [ ] Re-run the focused contract; expect exit 0.
- [ ] Commit as `fix(ar): align FaceMakeup foundation with upstream`.

### Task 4: Remove fork-only bridge and look payload divergence

**Files:**
- Modify: `apps/mobile/src/features/ar/stencil/src/bridge/types.ts`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Bridge/BridgeMessages.cs`
- Modify: `apps/mobile/src/features/ar/stencil/src/presets.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/fitSheets.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/lookTree.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/lookVariants.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/model.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/multiUse.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/regions.ts`
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/stencilSteps.ts`
- Modify: `apps/mobile/src/features/ar/stencil/StencilARApp.tsx`
- Modify: `scripts/mobile/run-unity-makeup-bridge-contract.mjs`

**Interfaces:**
- Consumes: upstream `FilterParams` and upstream preset/composer definitions.
- Produces: RN JSON fields identical to C# JsonUtility field names and upstream look values.

- [ ] Add a lockstep contract that compares the expected field set and rejects fork-only makeup fields.
- [ ] Run typecheck/contracts and verify the new contract fails before production changes.
- [ ] Mechanically synchronize upstream common files, retaining only AURA host adapter/back-navigation/all-guide integration.
- [ ] Remove stale fork UI/debug assignments for deleted fields and update any affected tests to assert upstream behavior.
- [ ] Run typecheck, Unity bridge, and AR guide contracts; expect exit 0.
- [ ] Commit as `fix(ar): sync stencil payloads and looks with upstream`.

### Task 5: Prove extra foundation/vision paths cannot double-render the graft

**Files:**
- Modify: `scripts/mobile/run-unity-makeup-bridge-contract.mjs`
- Modify only if evidence shows an active duplicate: `apps/unity/MakeupAR/Assets/Scripts/RNBridge.cs`, `apps/unity/MakeupAR/Assets/Scripts/E3RegionMaskOverlay.cs`, and/or `apps/unity/MakeupAR/Assets/Scripts/ScreenSpaceFoundationController.cs`

**Interfaces:**
- Consumes: AURA `RNBridge` recipes and stencil `NativeBridge` flat filters.
- Produces: one owner per region; no E7 Vision lip boundary or screen-space foundation pass on the graft filter path.

- [ ] Trace both bridge targets and bootstrap ownership, recording whether the same mode sends both payload families.
- [ ] Add static contracts for the proven ownership boundary and for absence of Vision lip parsing from the graft lip renderer.
- [ ] If a duplicate is reachable, first make the contract fail, then disable only the makeup consumer; preserve Face3D producers.
- [ ] Run the focused contract and Face3D preflight; expect exit 0/PASS.
- [ ] Commit only if production code changes, as `fix(ar): enforce single upstream makeup render path`.

### Task 6: Full verification and parity audit

**Files:**
- Inspect: all changed C#, ShaderLab, TypeScript, and tests.

**Interfaces:**
- Consumes: all task outputs.
- Produces: verified branch with no rejected patches and preserved Face3D preflight.

- [ ] Compare all mapped upstream makeup files and classify every remaining difference as host integration, Face3D input infrastructure, or an unresolved render divergence.
- [ ] Check C# braces, duplicate members, undefined identifiers, method arity, shader uniforms/properties, and RN/C# field lockstep.
- [ ] Run `npm --prefix apps/mobile run typecheck`.
- [ ] Run `cd apps/mobile && npm run test:unity-bridge`.
- [ ] Run `cd apps/mobile && npm run test:ar-guide-all`.
- [ ] Run `npm run face3d:collection:preflight`.
- [ ] Run `find apps -name "*.rej" -print`; expect no output.
- [ ] Review `git diff`, `git status`, and commit history before reporting.
