# AR Eyebrow Mask Alignment Debug Prompt

## Role

You are the implementation owner for a React Native + Unity based AR makeup app.

The app renders makeup through this flow:

```text
React Native controls/state
-> MediaPipe/Vision face landmarks from iOS native provider
-> generated brow mask payload
-> UnityFramework bridge
-> Unity ARFace UV / E3RegionMaskOverlay
-> SmoothRegionMask shader
```

Your task is not to redesign the whole AR engine. Your task is to debug and fix the current eyebrow problem:

> The generated eyebrow mask is still not reliably placed on top of the user's real eyebrow in the exact eyebrow shape.

The most important failure is **mask alignment and attachment on the eyebrow area**, not color selection, not RN UI, and not lip/blush rendering.

## Current Status

### Already Implemented

- A separate generated brow pipeline exists. Do not merge brow logic into generated lip.
- React Native can build and send a generated brow payload using:
  - `e7-generated-brow-mask-runtime-payload-v0`
  - Unity method `ApplyGeneratedBrowMaskJson`
- The brow payload uses MediaPipe/Vision face data and includes:
  - eyebrow core landmarks
  - eyebrow surrounding anchors
  - eye and upper eyelid landmarks
  - temple anchors
  - nose bridge anchors
  - face oval anchors
- Native iOS provider exposes brow-related named regions:
  - `leftEyebrow`
  - `rightEyebrow`
  - `leftEyebrowCore`
  - `rightEyebrowCore`
  - `leftEyebrowSurroundAnchors`
  - `rightEyebrowSurroundAnchors`
  - `leftEyebrowAppearance`
  - `rightEyebrowAppearance`
- Brow shape generation exists in:
  - `apps/mobile/src/features/ar/services/browGenerateCore.ts`
- Current desired shape baseline:
  - keep the smooth v14-style brow silhouette
  - keep the later thicker body adjustment
  - keep the pre-arch x-axis extension adjustment
- Existing eyebrow removal is disabled:
  - `cleanupStrength = 0`
  - `neutralizeStrength = 0`
  - the filter should overlay color + hair texture on top of the user's real eyebrow
- Brow UI colors are constrained to:
  - black
  - brown
  - light brown
  - wine
- Unity side has a generated brow entry path:
  - `apps/unity/MakeupAR/Assets/Scripts/RNBridge.cs`
  - `ApplyGeneratedBrowMaskJson`
  - `BuildGeneratedBrowMaskLayer`
- Unity overlay has generated brow texture registration:
  - `apps/unity/MakeupAR/Assets/Scripts/E3RegionMaskOverlay.cs`
  - `RegisterGeneratedBrowMaskTexture`
- Shader has a generated brow mode:
  - `apps/unity/MakeupAR/Assets/Shaders/SmoothRegionMask.shader`
  - `_BrowGeneratedMode`
  - green channel = desired brow mask
  - blue channel = hair strand detail
  - alpha = desired brow alpha
- Offline debug scripts exist:
  - `scripts/e7_brow_debug/validate_generated_brow_package.js`
  - `scripts/e7_brow_debug/render_image_guided_brow_preview.swift`
- Static checks have passed after recent edits:
  - `npm run typecheck` in `apps/mobile`
  - `xcrun swiftc -parse apps/mobile/ios/AURA/E7NativeLipBoundaryProviders.swift`

### Not Proven / Not Done

- The latest Unity source changes are not proven inside the embedded iOS `UnityFramework.framework`.
- Unity batch export was attempted, but Unity Licensing Client failed before a successful export/build could be proven.
- The existing `apps/mobile/ios/UnityBuild/UnityFramework.framework` timestamp predates the newest Unity brow changes.
- Live device runtime behavior is not verified.
- It is not proven that the generated brow texture lands on the actual ARFace UV eyebrow area.
- It is not proven that MediaPipe image-space brow mask coordinates match Unity ARFace UV sampling.
- It is not proven that left/right brow mapping is correct in live AR.
- It is not proven that U/V orientation is correct in live AR.
- There is no complete runtime debug overlay that shows brow landmarks, brow bounds, brow UV bounds, and brow mask preview on-device.
- There is no acceptance gate proving that the mask follows the eyebrow during face movement without jitter or delay.
- Offline preview images are useful, but they do not prove final AR attachment.

## Main Problem To Solve

The mask shape is closer now, but the system still fails the commercial filter requirement if:

- the mask is not exactly on the user's eyebrow body,
- the mask floats above or below the eyebrow,
- the mask is too short at the head/body/tail,
- the mask flips left/right,
- the mask samples the wrong UV area,
- the mask is only correct in offline image preview but wrong in live Unity AR,
- the mask jitters or lags relative to the face.

Do not keep blindly tuning the brow shape in TypeScript until runtime placement evidence is available.

First prove where the mask is in Unity runtime. Then fix the coordinate, UV, route, or texture issue based on evidence.

## Strict Constraints

Do not break existing lip, blush, or foundation rendering.

Do not:

- rewrite the whole AR renderer,
- add a new camera loop,
- introduce a new segmentation stack,
- mix brow logic into generated lip,
- re-enable eyebrow cleanup/removal,
- change existing recipe fields incompatibly,
- change shader property names without matching C# changes,
- make broad unrelated refactors,
- rely only on React Native UI changes,
- treat an offline PNG/SVG preview as proof of live AR correctness.

If `brow.enabled=false`, no eyebrow effect should render.

If `brow.intensity=0` or `opacity=0`, the eyebrow effect should disappear.

## Required Investigation

### 1. Confirm Runtime Brow Payload Delivery

Verify that React Native sends the generated brow payload to Unity.

Check:

- payload method is `ApplyGeneratedBrowMaskJson`,
- schema is `e7-generated-brow-mask-runtime-payload-v0`,
- `enabled`, `visible`, `maskVisible`, `validationVisible` are true when brow is on,
- `colorHex`, `opacity`, `intensity`, `coverage`, `strandTextureAmount` are non-zero,
- `maskRawRgbaBase64` is present when a new mask should be registered,
- `maskTextureId` begins with `e7-generated-brow`.

Log once per apply/change, not every frame.

### 2. Confirm Unity Route And Texture Registration

Verify in Unity:

- `ApplyGeneratedBrowMaskJson` is called,
- `RegisterGeneratedBrowMaskTexture` returns true,
- raw RGBA byte count equals `width * height * 4`,
- generated brow recipe region is `brow`,
- active region is `brow`,
- `_BrowGeneratedMode` is set to `1`,
- `_MaskTex` is the generated brow texture, not an old static brow asset.

If any of these fail, report the exact blocked reason:

- `payload_missing`
- `payload_parse_failed`
- `raw_mask_missing`
- `raw_mask_invalid_size`
- `texture_registration_failed`
- `region_overlay_missing`
- `route_missing`
- `shader_property_missing`
- `disabled`
- `intensity_zero`

### 3. Add Runtime Brow Debug Modes

Add debug modes only for brow. Keep default off.

Suggested optional payload fields:

```ts
debugMode?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
debugShowLeftRight?: boolean;
debugExaggerate?: boolean;
```

Modes:

- `0`: off
- `1`: log payload/route/material/shader status
- `2`: show brow landmark or vertex points on the face
- `3`: show brow bounds/polygon on the face
- `4`: show brow mask preview on the actual face surface
- `5`: exaggerated brow preview with strong debug color and high opacity
- `6`: left/right orientation check

The debug overlay must render in the iOS Unity runtime. Do not rely on Unity Gizmos only.

### 4. Prove ARFace UV Placement

This is the critical part.

For each brow side, log or display:

- ARFace vertex count
- ARFace index count
- ARFace UV count
- brow triangle count
- left brow UV bounds
- right brow UV bounds
- left brow screen/world bounds
- right brow screen/world bounds
- whether UV bounds are inside 0..1
- whether left/right ordering makes sense after camera mirroring
- whether V appears flipped

Acceptance for this step:

- debug mask appears over the real eyebrow region, not forehead, eye, nose, mouth, or cheek,
- left brow mask appears on user's left brow and right brow mask appears on user's right brow,
- the mask stays attached during small head movement.

### 5. Compare Image-Space Mask And Unity UV Mask

The TypeScript brow generator currently builds a mask from MediaPipe/image-space brow envelope plus ARFace UV projection.

Verify:

- image-space polygon is correct before UV projection,
- UV rasterization uses the correct triangle mapping,
- screen/image coordinate origin is not inverted,
- camera mirroring does not swap sides,
- Unity shader samples the same UV orientation expected by the generated texture,
- the generated texture channels match shader expectations:
  - R = 0
  - G = desired brow alpha
  - B = hair strand detail
  - A = desired brow alpha

If offline preview is correct but live Unity is wrong, prioritize UV projection, texture sampling, mirroring, or shader channel usage over shape tweaks.

### 6. Fix The Actual Cause

After runtime evidence, fix the smallest correct layer:

- If RN payload is not sent: fix RN bridge/payload apply timing.
- If Unity route is blocked: fix `RNBridge.cs` / `E3RegionMaskOverlay.cs`.
- If texture is missing: fix raw mask registration.
- If shader properties mismatch: fix property names in both C# and shader.
- If UV is flipped: fix U/V transform or texture coordinate mapping.
- If left/right swapped: fix side mapping with debug evidence.
- If shape is correct but shifted: fix coordinate transform/anchor offset, not arbitrary shape geometry.
- If mask is too weak: adjust shader alpha/intensity only after placement is correct.

## Acceptance Criteria

This work is done only when all of the following are true:

1. Brow can be toggled on/off without affecting lip/blush/foundation.
2. Generated brow payload is visible in Unity logs with valid mask texture registration.
3. Runtime debug mode can show brow mask on the actual face surface.
4. The mask sits on top of the user's real eyebrow body, following the lower brow hair flow and dense upper body.
5. The mask does not invade the eyes.
6. The mask does not float on the forehead.
7. Tail, body, and head align with the user's eyebrow shape in live AR, not just offline preview.
8. Left/right orientation is verified.
9. U/V orientation is verified.
10. Small head movement does not create obvious jitter or delayed sliding.
11. Existing lip and blush still render as before.
12. Latest Unity changes are included in a rebuilt iOS `UnityFramework.framework`.
13. The app/device runtime result is visually checked.

## Verification Commands

Mobile typecheck:

```bash
cd apps/mobile
npm run typecheck
```

Swift provider parse:

```bash
xcrun swiftc -parse apps/mobile/ios/AURA/E7NativeLipBoundaryProviders.swift
```

Offline generated brow package validation:

```bash
node scripts/e7_brow_debug/validate_generated_brow_package.js \
  /path/to/compiled/browGenerateCore.js \
  /private/tmp/aura_brow_debug/pair_face_full_face_1782993935689/frame.png \
  /private/tmp/aura_brow_debug/pair_face_full_face_1782993935689/mediapipe_face_landmarks.json \
  /private/tmp/aura_brow_debug/pair_face_full_face_1782993935689/arface_export.json \
  /private/tmp/aura_brow_debug/brow_appearance_regions_v4.json \
  /private/tmp/aura_brow_debug/output
```

Unity export/build helper:

```bash
scripts/unity/build_ios_unity_framework.sh
```

If Unity export fails because of Unity Licensing Client, report it explicitly. Do not claim the framework was rebuilt.

## Report Format

When finished, report:

1. Files changed.
2. What was already present and left untouched.
3. Brow runtime delivery result.
4. Texture registration result.
5. Shader property result.
6. Left/right orientation result.
7. U/V orientation result.
8. Runtime debug screenshots or device observations.
9. Lip/blush regression check result.
10. UnityFramework rebuild result.
11. Remaining risk, if any.

## Current Highest-Priority Next Step

Do **not** continue tuning only the TypeScript brow silhouette.

The next highest-value step is:

> Add and run Unity runtime brow debug mode that proves where the generated brow mask is sampled on the ARFace surface.

Only after that evidence should the implementation adjust UV mapping, left/right mapping, coordinate flipping, offsets, or shader sampling.
