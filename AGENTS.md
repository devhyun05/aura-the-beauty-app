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
- Run backend tests for touched routes/schema and mobile typecheck/tests for mobile changes unless the user explicitly asks to skip tests. A user request for a minimal physical-device build with self-verification overrides routine test, QA, evidence-capture, and extra validation steps.
- Preserve user changes and never commit local signing or incidental native dependency edits.

## Build Prerequisites (실기기 빌드 전 매번 확인)
- `.env`는 gitignore라 브랜치 전환·재생성 시 사라진다. 빌드 전 `apps/mobile/.env`에 Cognito 블록이 있는지 확인할 것 — 없으면 로그인 화면에 `Missing Cognito domain. Set EXPO_PUBLIC_COGNITO_DOMAIN` 에러가 뜬다.
- 필수 Cognito 키: `EXPO_PUBLIC_COGNITO_CLIENT_ID`, `EXPO_PUBLIC_COGNITO_DOMAIN`(`https://...auth.ap-northeast-2.amazoncognito.com`), `EXPO_PUBLIC_COGNITO_REGION`, `EXPO_PUBLIC_COGNITO_REDIRECT_URI=aiarmakeup://auth/callback`, `_SCOPES`, `_PROMPT`, `_GOOGLE_IDP`/`_KAKAO_IDP`/`_NAVER_IDP`. 값은 비밀이라 문서에 적지 않는다.
- `EXPO_PUBLIC_API_BASE_URL`은 로컬 개발이면 현재 LAN IP(`http://<ip>:8000/api`), 배포 백엔드면 cloudfront. 둘을 섞지 말 것.
- `The sandbox is not in sync with the Podfile.lock`가 발생해도 `npm run pods`/`pod install`을 자동 실행하지 않는다. 먼저 빌드 중 임시 변경을 정확히 원복하고 `Podfile`, `Podfile.lock`, `package.json`, 네이티브 의존성이 현재 작업에서 실제로 변경됐는지 확인한다. 실제 네이티브 Pod 입력 변경이 확인된 경우에만 사용자에게 전체 네이티브 재컴파일 가능성을 알리고 명시적 승인을 받은 뒤 실행한다.
- 디스크 여유가 부족해도 재사용 중인 `/private/tmp/aura-release-seojin-derived`, Unity `Library`, Pods, `node_modules`, `UnityBuild`를 자동 삭제하지 않는다. 최소 증분 빌드에서는 캐시를 삭제하거나 `clean`으로 재시도하지 말고 정확한 용량 오류를 보고한다.
- `.env`(`EXPO_PUBLIC_*`)를 바꾸면 네이티브 재빌드는 불필요하지만 실행 중인 Metro가 옛 값을 캐시하므로, 기존 Metro를 종료하고 `npm run start -- --clear`로 재시작해야 반영된다.

## Physical iPhone Verification (WiFi Only)
- Never boot or use an iOS Simulator/emulator; runtime testing is physical-device only.
- When the user explicitly requests end-to-end physical-device verification, Codex owns the preflight, required Unity/native rebuild, overwrite installation, launch, and host-side health/process checks. Do not defer that workflow back to the user; request user help only for actions that inherently require a person, such as unlocking the phone, trusting the developer, or interacting with a live face/camera flow.
- When the user says they will verify the result themselves and requests a minimal Release overwrite install, do only the silent prerequisites required to build, the incremental Release build, bundle-ID safety check, overwrite install, and launch. Skip tests, QA, screenshots, evidence capture, backend probes, extra feature verification, and explanatory detours unless explicitly requested.
- If iOS support is missing, install only the required combined iOS Platform Support in Xcode Components; do not use `xcodebuild -downloadPlatform iOS`.
- Get the real UDID from `xcrun xctrace list devices | grep -v Simulator | grep iPhone`; `devicectl` UUID is not an xcodebuild UDID.
- Confirm `xcrun devicectl list devices` shows the unlocked phone as `available`.
- Local Debug signing edits in `apps/mobile/ios/AURA.xcodeproj/project.pbxproj` must never be committed. This includes the local `DEVELOPMENT_TEAM` and the local `PRODUCT_BUNDLE_IDENTIFIER` (e.g. the personal-team `com.aurathebeautyapp.wei.mobile`) — never commit the bundle ID change. Also keep local-signing side effects out of commits: `AURA/AURA.entitlements` (applesignin/aps-environment removal), `Info.plist` key reordering, and `Podfile.lock` local Hermes checksum changes.
- Build with the current LAN IP: `REACT_NATIVE_PACKAGER_HOSTNAME=$(ipconfig getifaddr en0) npm run ios:face-capture-lab -- --device <UDID>`.
- A locked-device launch failure after successful build means install succeeded; unlock and open manually instead of rebuilding.
- Arm evidence capture before the user run only when the user requests Codex-run verification. Do not add evidence capture to a user-verified minimal Release install.

## Seojin Release Fast Path (Physical iPhone)
- For the existing QA app, keep `PRODUCT_BUNDLE_IDENTIFIER=com.aiarmakeupguides.mobile.seojin` and `DEVELOPMENT_TEAM=5947QNM627` as command-line build overrides only. Never change the shared Xcode bundle ID and never uninstall the existing app before installation.
- A user request for a "minimal incremental Release build", "no tests", "no archive", "no cache deletion", or "I will verify it myself" activates **Minimal Incremental Mode**. This mode overrides generic test, Pod repair, archive, cleanup, backend-verification, and evidence-capture instructions.
- Before starting, check whether another `xcodebuild` or Seojin install flow is already active. Never start a duplicate build, `pod install`, archive, or retry beside an active build.
- Always reuse `/private/tmp/aura-release-seojin-derived` with the same Xcode `build` action and stable build settings. Never run `clean`, delete this directory, switch between `archive` and `build`, or change cache-affecting flags during routine overwrite installs.
- Use `scripts/mobile/install-seojin-release.sh <devicectl-device-identifier>` for Minimal Incremental Mode. Install the signed `/private/tmp/aura-release-seojin-derived/Build/Products/Release-iphoneos/AURA.app` directly.
- In Minimal Incremental Mode, never run `npm run pods`, `pod install`, `expo prebuild`, or any command that regenerates the Pods project. Never modify `Podfile.lock`, `Pods/Manifest.lock`, `AURA.xcodeproj/project.pbxproj`, or `app.json`. These operations invalidate the native cache and can turn an incremental build into a full rebuild.
- A Pod sandbox mismatch is a hard stop in Minimal Incremental Mode, not permission to repair automatically. Restore only this run's exact temporary files, report the mismatch, and ask before any Pod regeneration or full native retry.
- Do not retry the already-known Personal Team signing failure. For the local build only, back up and temporarily remove `aps-environment` and `com.apple.developer.applesignin` from `AURA/AURA.entitlements` and `remote-notification` from `Info.plist` `UIBackgroundModes`, pass `CODE_SIGN_ENTITLEMENTS=`, and restore the exact pre-build bytes on success, failure, signal, or cancellation. Do not mutate `app.json` for signing. Never commit these temporary edits.
- Use the existing UnityFramework unless it is missing or tracked Unity inputs changed in the current task. React Native, TypeScript, backend, navigation, API, or report changes do not authorize Unity export or UnityFramework rebuild.
- Never create or delete `/private/tmp/AURA-seojin-Release.xcarchive` in Minimal Incremental Mode. Use `archive` only when the user explicitly asks for an archive artifact.
- If the incremental build fails, do not automatically fall back to `archive`, `pod install`, Unity rebuild, cache deletion, or a clean build. Restore temporary files, preserve the cache, report the exact error, and wait for explicit direction.
- After a successful build, perform only: restore temporary signing files, verify `CFBundleIdentifier=com.aiarmakeupguides.mobile.seojin`, overwrite-install with `xcrun devicectl device install app`, and launch with `xcrun devicectl device process launch`. A host-side Personal Team trust warning is not a reason to rebuild if installation succeeds.
- Restart or probe the backend only when the user explicitly includes backend verification in the current request. Keep backend diagnosis separate from the minimal native build.
- Default Minimal Incremental Mode order: confirm no duplicate build, silently check required env/device/disk, run one incremental `build`, restore temporary signing files, verify bundle ID, overwrite-install, launch, stop. Do not run tests or additional verification when the user will inspect the result.
