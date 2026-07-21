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

## Build Prerequisites (실기기 빌드 전 매번 확인)
- `.env`는 gitignore라 브랜치 전환·재생성 시 사라진다. 빌드 전 `apps/mobile/.env`에 Cognito 블록이 있는지 확인할 것 — 없으면 로그인 화면에 `Missing Cognito domain. Set EXPO_PUBLIC_COGNITO_DOMAIN` 에러가 뜬다.
- 필수 Cognito 키: `EXPO_PUBLIC_COGNITO_CLIENT_ID`, `EXPO_PUBLIC_COGNITO_DOMAIN`(`https://...auth.ap-northeast-2.amazoncognito.com`), `EXPO_PUBLIC_COGNITO_REGION`, `EXPO_PUBLIC_COGNITO_REDIRECT_URI=aiarmakeup://auth/callback`, `_SCOPES`, `_PROMPT`, `_GOOGLE_IDP`/`_KAKAO_IDP`/`_NAVER_IDP`. 값은 비밀이라 문서에 적지 않는다.
- `EXPO_PUBLIC_API_BASE_URL`은 로컬 개발이면 현재 LAN IP(`http://<ip>:8000/api`), 배포 백엔드면 cloudfront. 둘을 섞지 말 것.
- 빌드가 `The sandbox is not in sync with the Podfile.lock`로 실패하면 `npm run pods`(=`pod install`)를 먼저 돌려 샌드박스를 재동기화한 뒤 재빌드한다.
- 디스크 여유가 부족하면(`No space left on device`) `~/Library/Developer/Xcode/DerivedData` 정리 후 재빌드. iOS 빌드는 DerivedData에 수 GB를 쓴다.
- `.env`(`EXPO_PUBLIC_*`)를 바꾸면 네이티브 재빌드는 불필요하지만 실행 중인 Metro가 옛 값을 캐시하므로, 기존 Metro를 종료하고 `npm run start -- --clear`로 재시작해야 반영된다.

## Physical iPhone Verification (WiFi Only)
- Never boot or use an iOS Simulator/emulator; runtime testing is physical-device only.
- If iOS support is missing, install only the required combined iOS Platform Support in Xcode Components; do not use `xcodebuild -downloadPlatform iOS`.
- Get the real UDID from `xcrun xctrace list devices | grep -v Simulator | grep iPhone`; `devicectl` UUID is not an xcodebuild UDID.
- Confirm `xcrun devicectl list devices` shows the unlocked phone as `available`.
- Local Debug signing edits in `apps/mobile/ios/AURA.xcodeproj/project.pbxproj` must never be committed. This includes the local `DEVELOPMENT_TEAM` and the local `PRODUCT_BUNDLE_IDENTIFIER` (e.g. the personal-team `com.aurathebeautyapp.wei.mobile`) — never commit the bundle ID change. Also keep local-signing side effects out of commits: `AURA/AURA.entitlements` (applesignin/aps-environment removal), `Info.plist` key reordering, and `Podfile.lock` local Hermes checksum changes.
- Build with the current LAN IP: `REACT_NATIVE_PACKAGER_HOSTNAME=$(ipconfig getifaddr en0) npm run ios:face-capture-lab -- --device <UDID>`.
- A locked-device launch failure after successful build means install succeeded; unlock and open manually instead of rebuilding.
- Arm evidence capture before the user run; prefer Hermes/Metro logs over asking for a second measurement.

## Seojin Release Fast Path (Physical iPhone)
- For the existing QA app, keep `PRODUCT_BUNDLE_IDENTIFIER=com.aiarmakeupguides.mobile.seojin` and `DEVELOPMENT_TEAM=5947QNM627` as command-line build overrides only. Never change the shared Xcode bundle ID and never uninstall the existing app before installation.
- Reuse `/private/tmp/aura-release-seojin-derived` for incremental Release builds. Remove only the old `/private/tmp/AURA-seojin-Release.xcarchive` before a new archive; do not delete DerivedData unless a concrete cache corruption or disk-space error proves it is necessary.
- Do not retry the already-known Personal Team signing failure. Personal Team cannot provision the checked-in Push Notifications and Sign in with Apple capabilities. For this local Release archive only, temporarily remove `aps-environment` and `com.apple.developer.applesignin` from `AURA/AURA.entitlements` and `remote-notification` from `UIBackgroundModes`, archive with `CODE_SIGN_ENTITLEMENTS=`, and restore the exact pre-build file contents immediately afterward even on failure. These temporary edits must never be committed.
- Use the existing UnityFramework unless it is missing or Unity inputs changed. Do not rebuild UnityFramework for ordinary React Native/backend changes.
- After archiving, verify the built app's `CFBundleIdentifier` is exactly `com.aiarmakeupguides.mobile.seojin`, then use `xcrun devicectl device install app` to overwrite the existing app and `xcrun devicectl device process launch` to run it. A host-side Personal Team trust warning is not a reason to rebuild if `devicectl` installation succeeds.
- Keep the backend separate from the native build diagnosis. If backend code changed after port 8001 started, restart it from `services/backend` with `.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload --reload-dir app`, then verify both localhost and the LAN health URL before testing the Release app.
- Default order: preflight env/device/backend/disk, reuse cached archive build, restore signing files, verify bundle ID, overwrite-install, launch, confirm the app process and backend health. Do not rediscover this path through repeated clean builds.
