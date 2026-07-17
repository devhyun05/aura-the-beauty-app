# Report Lab design QA

- Static QA: **PASS**
- Visual/browser QA: **PENDING_PERMISSION**

## Scope and safety boundary

- The implementation uses only the previously approved local thumbnail as a visual reference.
- No original design runtime, sidecar, support script, remote image, CDN, or generated image is loaded by the app.
- No human image is bundled in the Report Lab fixture or web runtime. `src/assets/report-lab-manifest.json` has an empty asset list and records the explicit no-approved-provenance state.
- The report preview uses the existing Phosphor icon system and plain unavailable-state copy wherever a visual would otherwise appear; it does not substitute CSS/SVG art or a different person's image.
- The body-profile section deliberately omits a silhouette image. No verified body asset is available, and the face marketing image is not reused as a misleading stand-in.

## Implementation review

| Area | Result | Evidence |
| --- | --- | --- |
| Desktop structure | Pass at code level | Three independently scrollable setup, preview, and comparison/history columns. |
| Compact structure | Pass at code level | Setup, preview, and run-history tabs replace the columns below the responsive breakpoint; report content stays capped at 390px. |
| Report hierarchy | Pass at code level | Seven sequential sections cover summary, proportion, features, personal color, body profile, impression, and styling. |
| Numeric-free presentation | Pass | Runtime parser rejects numeric primitives anywhere in the report DTO and rejects unknown fields. |
| Interaction states | Pass at code level | Proportion bands, what-if spectrum, swatches, lighting, gaze playback, style mixer, run, cancel, compare, select, and bookmark states are implemented. |
| Accessibility | Pass at code level | Skip link, tab semantics, visible focus, live regions, reduced-motion handling, labels, pressed states, and non-color status copy are present. |
| Runtime network boundary | Pass | Vite and optional API client accept only unauthenticated HTTP on `127.0.0.1`; fixture mode requires no network. |

## Automated evidence

- `npm --prefix packages/face-report-contract run typecheck` — pass
- `npm --prefix apps/report-lab test` — pass (contract 5 + application 7)
- `npm --prefix apps/report-lab run typecheck` — pass
- `npm --prefix apps/report-lab run build` — pass (no human raster bundled)
- Static source and built-output scan found no copied design runtime markers,
  `support.js`, `image-slot.js`, `eval`, `new Function`, Bedrock/AWS client,
  `XMLHttpRequest`, or `WebSocket` usage.
- Vite startup advertised only `http://127.0.0.1:5173/`.

## Browser verification handoff

Browser execution requires separate user permission. After permission, supplement this file with:

- a desktop screenshot showing all three columns;
- a 390px screenshot for each tab;
- the implementation/reference side-by-side review;
- keyboard and interaction smoke results;
- console/network results;
- the final result (`pass`, `pass with exceptions`, or `blocked`).

Current final result: **PENDING_PERMISSION**. Static QA is complete; this is not a visual/browser pass.
