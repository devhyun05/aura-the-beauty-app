# Project Guidelines

## Source Of Truth
- `docs/spec.md` is the 룩톡 product spec; `docs/plan.md` is its implementation order.
- `docs/planning/MAKEUP_JOURNEY_CALENDAR_PLAN.md` is the MakeupJourney feature contract.
- Read `docs/mobile/FRONTEND_WORK_GUIDE.md` before mobile frontend changes.

## Product Boundaries
- 룩톡 is a beauty-look discovery feed, not a text board; keep UI copy `룩톡` and internal names `Community`/`community_*`.
- UI copy for this feature is `메이크업 성장`; internal route/API/DB names use `MakeupJourney`/`makeup_journey_*`.
- Do not redesign existing Home, feedback, recommendation, AR, or Profile screens for the calendar feature.
- Calendar mockup colors are illustrative only; do not introduce pink/blush styling, a feature-only accent, or copied image colors—use the current app theme tokens.
- `makeup_feedback_reports` is the score/report source of truth; do not duplicate feedback scores into calendar tables.
- Calendar success/failure uses the latest completed daily score against the current global goal score.

## Mobile
- Work in `apps/mobile/src` with Expo React Native, TypeScript, React Navigation, and Tamagui.
- Do not add a UI or icon library; reuse theme tokens, shared components, and existing icon sizes.
- Keep MakeupJourney code under `features/makeup-journey`; only truly shared code belongs in `shared`.
- Use `requestBackendJson` for APIs and the existing makeup-feedback upload flow with `mediaKind: "makeup_feedback"`.
- Preserve loading, empty, error, refresh, keyboard, accessibility, and safe-area states.
- Keep dates as `YYYY-MM-DD` strings at API boundaries to avoid timezone shifts.
- Keep day detail vertically scrollable with persistent calendar-back/graph actions; never shrink all cards into one viewport.
- A correction reuses the feedback flow, inherits parent goal context, and clears navigation context on success/cancel/error.
- Floating action short tap opens the menu; ~400ms long press drags; clamp and persist normalized coordinates locally.

## Backend
- Put FastAPI routes under `services/backend/app/api` and use `success()` plus camelCase responses.
- Writes require auth and DB; every journey/report/mission/note query must scope by `user_id`.
- Extend `/feedback/jobs`; do not create a second feedback-generation path for calendar entries.
- Validate correction parent ownership, completion state, date inheritance, and feedback kind.
- Calendar list queries must avoid N+1 and exclude failed, incomplete, or scoreless reports.
- Build calendar digests from stored report fields only; do not re-score, call AI again, or copy full report payloads into month responses.

## Database
- Update `docs/backend/schema.sql`, `docs/backend/aws-postgresql-schema.dbml`, `app/db/init_db.py`, and `app/db/check_schema.py` together.
- Keep SQL idempotent; add FKs, checks, indexes, unique constraints, and safe backfills.
- Account deletion and media deletion must keep working after feedback self-FKs are added.

## Quality
- Prefer existing patterns over new abstractions; avoid unrelated refactors, logs, broad `any`, and unused code.
- Add focused tests for API contracts, ownership, score aggregation, goal re-evaluation, mapping, gestures, and navigation.
- Run backend tests for touched routes/schema and mobile typecheck/tests for mobile changes.
- Preserve user changes and never commit local signing or incidental native dependency edits.

## Physical iPhone Verification (WiFi Only)
- Never boot or use an iOS Simulator/emulator; runtime testing is physical-device only.
- If iOS support is missing, install only the required combined iOS Platform Support in Xcode Components; do not use `xcodebuild -downloadPlatform iOS`.
- Get the real UDID from `xcrun xctrace list devices | grep -v Simulator | grep iPhone`; `devicectl` UUID is not an xcodebuild UDID.
- Confirm `xcrun devicectl list devices` shows the unlocked phone as `available`.
- Local Debug signing edits in `apps/mobile/ios/AURA.xcodeproj/project.pbxproj` must never be committed.
- Build with the current LAN IP: `REACT_NATIVE_PACKAGER_HOSTNAME=$(ipconfig getifaddr en0) npm run ios:face-capture-lab -- --device <UDID>`.
- A locked-device launch failure after successful build means install succeeded; unlock and open manually instead of rebuilding.
- Arm evidence capture before the user run; prefer Hermes/Metro logs over asking for a second measurement.
