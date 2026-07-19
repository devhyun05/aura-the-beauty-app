# Project Guidelines

## Source Of Truth
- Product spec `docs/spec.md`, build order `docs/plan.md`, MakeupJourney contract `docs/planning/MAKEUP_JOURNEY_CALENDAR_PLAN.md`.
- Read `docs/mobile/FRONTEND_WORK_GUIDE.md` before mobile frontend work.

## Product Boundaries
- 룩톡 = discovery feed (not text board): UI `룩톡`, internal `Community`/`community_*`. Calendar: UI `메이크업 성장`, internal `MakeupJourney`/`makeup_journey_*`.
- Don't redesign Home/feedback/recommendation/AR/Profile for the calendar. Theme tokens only — no pink/blush or mockup-copied colors.
- `makeup_feedback_reports` is the score source of truth (never duplicate into calendar tables); success/failure = latest completed daily score vs current global goal.

## Mobile
- `apps/mobile/src`: Expo RN, TS, React Navigation, Tamagui. No new UI/icon libs — reuse tokens/shared components/icon sizes. MakeupJourney under `features/makeup-journey`; only truly shared code in `shared`.
- APIs via `requestBackendJson`; uploads via makeup-feedback flow (`mediaKind: "makeup_feedback"`). Dates as `YYYY-MM-DD` at API boundaries. Preserve loading/empty/error/refresh/keyboard/a11y/safe-area states.
- Day detail vertically scrollable with persistent back/graph actions (never one viewport). Correction reuses feedback flow, inherits parent goal, clears nav context on success/cancel/error.
- Floating action: short tap = menu, ~400ms long press = drag; clamp + persist normalized coords locally.

## Backend
- FastAPI routes under `services/backend/app/api`; `success()` + camelCase. Writes need auth + DB; scope every query by `user_id`.
- Extend `/feedback/jobs` — no second feedback path. Validate correction parent ownership, completion, date inheritance, feedback kind.
- Calendar list queries: no N+1, exclude failed/incomplete/scoreless. Month digests from stored fields only — no re-score/AI re-call/full-payload copy.

## Database
- Update together: `docs/backend/schema.sql`, `aws-postgresql-schema.dbml`, `app/db/init_db.py`, `app/db/check_schema.py`. Idempotent SQL; FKs/checks/indexes/unique/safe backfills.
- Account + media deletion must keep working after feedback self-FKs.

## Quality
- Prefer existing patterns; no unrelated refactors, stray logs, broad `any`, unused code. Never commit local signing or incidental native dep edits.
- Focused tests: API contracts, ownership, score aggregation, goal re-eval, mapping, gestures, navigation. Run backend tests for touched routes/schema; mobile typecheck/tests for mobile changes.

## Build Prerequisites (실기기 빌드 전)
- `.env` gitignored — verify `apps/mobile/.env` has the Cognito block or login shows `Missing Cognito domain`. Keys: `EXPO_PUBLIC_COGNITO_CLIENT_ID`/`_DOMAIN`/`_REGION`/`_REDIRECT_URI`/`_SCOPES`/`_PROMPT`/`_GOOGLE_IDP`/`_KAKAO_IDP`/`_NAVER_IDP` (values secret). `EXPO_PUBLIC_API_BASE_URL`: local LAN `http://<ip>:8000/api` OR cloudfront, don't mix.
- `sandbox not in sync with Podfile.lock` → `npm run pods`. `No space left` → clear `~/Library/Developer/Xcode/DerivedData`. After `.env` change → restart Metro `npm run start -- --clear`.

## Physical iPhone Verification (WiFi Only)
- Physical device only — never boot a Simulator. Missing iOS support: install combined iOS Platform Support via Xcode Components, not `xcodebuild -downloadPlatform iOS`.
- Real UDID: `xcrun xctrace list devices | grep -v Simulator | grep iPhone` (devicectl UUID ≠ xcodebuild UDID); confirm `available` via `xcrun devicectl list devices`.
- Build: `REACT_NATIVE_PACKAGER_HOSTNAME=$(ipconfig getifaddr en0) npm run ios:face-capture-lab -- --device <UDID>`.
- Never commit local signing: `project.pbxproj` (`DEVELOPMENT_TEAM`, `PRODUCT_BUNDLE_IDENTIFIER` e.g. `com.aurathebeautyapp.wei.mobile`), `AURA.entitlements`, `Info.plist` reorders, `Podfile.lock` Hermes checksum. Backup at `apps/mobile/ios/.local-signing.patch` (`git apply` to restore).
- Locked-device launch failure after a successful build = install OK; unlock and open manually. Arm evidence capture before the user run; prefer Hermes/Metro logs over a second measurement.
