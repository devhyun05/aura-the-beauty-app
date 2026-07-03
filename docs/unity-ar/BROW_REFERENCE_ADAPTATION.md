# Generated Brow Reference Adaptation

This note records how the generated brow engine adapts the MIT-licensed
`otdnnc/virtual-makeup` web implementation into this app's React Native +
Unity AR runtime.

Reference repository:

- Source: https://github.com/otdnnc/virtual-makeup
- License: MIT, declared in the upstream README license section.
- Checked files:
  - `apps/web/src/lib/makeup/landmarks.ts`
  - `apps/web/src/lib/makeup/face.ts`

## Reference Engine

The web reference uses a small canvas/OpenCV flow:

1. MediaPipe Face Landmarker returns normalized landmarks.
2. `EYE_BROW_CONNECTIONS` selects two eyebrow polygon rings:
   - `[55, 107, 66, 105, 63, 70, 46, 53, 52, 65, 55]`
   - `[285, 336, 296, 334, 293, 300, 276, 283, 295, 285]`
3. `normalizedToPixel` converts landmarks into image pixels.
4. `fillPoly` rasterizes each brow ring into a colored mask.
5. `GaussianBlur(mask, mask, new cv.Size(7, 7), 4)` feathers the mask edge.
6. `addWeighted(mat, 1.0, mask, 0.2, 0.5, mat)` blends the mask onto the camera frame.

The key idea is not a screen-space sticker. It is landmark-anchored polygon
masking with soft compositing.

## App Adaptation

Our app keeps that idea, but changes the runtime target:

| Reference web repo | This app |
| --- | --- |
| React/Vite canvas frame | React Native capture/AR screen |
| MediaPipe Face Landmarker points | MediaPipe/Vision brow, eye, eyelid, temple, nose, face oval regions |
| `EYE_BROW_CONNECTIONS` polygon | `brow_surround_anchor_envelope_v2` shape-corrected brow envelope |
| `fillPoly` into an OpenCV mask | `buildBrowUvMaskRawRgba` rasterizes an ARFace UV mask |
| `GaussianBlur` | `maskFeatherUvNormalized` + Unity mask feather radius |
| `addWeighted` | `E3RegionMaskOverlay` shader/material blending on ARFace |
| canvas RGBA output | `e7-generated-brow-mask-runtime-payload-v0` raw RGBA texture |

The generated brow mask is a sibling pipeline to generated lip. It must not
be merged into the lip payload or the legacy lip/blush shader paths.

## Runtime Contract

The generated brow texture uses this channel contract:

- Red: intentionally empty for generated brow runtime masks.
- Green: desired brow fill mask coverage.
- Blue: strand/hair texture strength.
- Alpha: desired brow fill mask coverage.

Unity must sample generated brow coverage from `max(G, A)`, not red.

The normal production path should render color plus strand texture directly
over the existing eyebrow. Existing brow removal/neutralization is disabled
for the current MVP.

## Verification

Run these from the repo root after changing generated brow logic:

```bash
npm run mobile:test:generated-brow
npm run mobile:test:unity-bridge
npm run mobile:check:brow-runtime-log -- --self-test
npm run mobile:typecheck
```

The generated brow contract test covers:

- raw RGBA channel contract,
- non-empty UV mask generation,
- soft-edge texel output carried into the Unity runtime payload,
- strand texture channel output,
- MediaPipe/reference brow core and shape-base ring point counts carried into
  the Unity runtime payload,
- right brow shape mirrored onto the left side,
- minimum brow vertical lift,
- eye exclusion separation,
- surrounding anchor usage,
- Unity feather payload equivalent to the reference blur step,
- disabled cleanup/neutralize values.

Live device verification is still required to prove final visual attachment,
head-angle stability, and delay behavior on ARFace.
