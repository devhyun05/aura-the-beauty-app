# Project Guidelines

## Source Of Truth
- Treat `docs/spec.md` as the product spec for 룩톡, the look-first community feature.
- Treat `docs/plan.md` as the implementation order and priority guide.
- For mobile frontend work, read `docs/mobile/FRONTEND_WORK_GUIDE.md` first.

## Product Direction
- 룩톡 is not a text 게시판; it is a beauty look discovery feed.
- Keep `HomeTab` as home and use the existing Community entry action.
- UI copy may say `룩톡`; internal route/API/DB names should use `Community` or `community_*`.
- Prioritize image, mood tags, product usage, save, and lightweight replies.

## Mobile Rules
- Work in `apps/mobile/src` with Expo React Native, TypeScript, React Navigation, and Tamagui.
- Do not add a new UI or icon library.
- Use existing theme tokens for colors, spacing, typography, radius, shadows, and icon sizes.
- Keep feature code under `features/community` unless a truly shared component belongs in `shared/ui`.
- Use `requestBackendJson` for backend calls and `uploadMediaAsset` for community images.
- Use `mediaKind: "community-thread"` for 룩톡 uploaded images.
- Preserve loading, empty, error, refresh, keyboard, and safe-area states.

## Backend Rules
- Use FastAPI route files under `services/backend/app/api`.
- Use the existing `success()` envelope and camelCase response behavior.
- Writes require auth and DB; reads should return safe empty fallback when DB is unavailable where practical.
- Validate media ownership before attaching images to community threads.
- Keep reply depth to one nested level.

## DB Rules
- Update both `docs/backend/schema.sql` and `docs/backend/aws-postgresql-schema.dbml` for schema changes.
- Keep schema SQL idempotent with existing `create table if not exists` style.
- Add FKs, checks, indexes, and duplicate-prevention constraints for likes, saves, reports, and media order.
- Prefer JSONB for MVP product usage, leaving room for later product DB linking.

## Quality
- Prefer existing patterns and helpers over new abstractions.
- Avoid unrelated refactors, temporary logs, broad `any`, and unused code.
- Add focused tests for route contracts, API behavior, service mapping, validation, and navigation.
- Run mobile typecheck when mobile code changes.
- Do not revert user changes unless explicitly asked.

## iOS Real-Device Build & Verify (WiFi)

The user always connects the iPhone over WiFi (never USB). Follow this order to build,
install, run, and verify a device measurement in one pass. Each step lists the failure it prevents.

### Real-device only (no Simulator / Emulator testing)
- All iOS runtime testing in this project is **physical-device only**. Never boot, create, or use
  an iOS Simulator or emulator as a test target.
- Xcode 26.6 bundles physical-device iOS Platform Support and the matching Simulator runtime in
  one Components download (for example, `iOS 26.5.1 + iOS 26.5 Simulator`). When Xcode reports
  `iOS 26.5 is not installed`, install that combined **iOS Platform Support** package from
  `Xcode > Settings > Components`; it is required even when testing only on a physical iPhone.
- Install only the required iOS Platform Support row. Do not install unrelated watchOS, tvOS, or
  visionOS components, and do not launch the bundled Simulator runtime.
- Do **not** use `xcodebuild -downloadPlatform iOS` as a substitute for the Components package.
  That command downloads a standalone Simulator runtime and may not install/register the combined
  physical-device Platform Support required by Xcode.
- After the Components installation finishes, re-run `xcodebuild -showdestinations` and continue
  only when the physical iPhone appears as an eligible destination.

### Device identity
- Get the UDID from `xctrace`, NOT `devicectl`. `xcrun devicectl list devices` prints a
  CoreDevice UUID that expo/xcodebuild reject with "No device UDID or name matching ...".
  Use: `xcrun xctrace list devices | grep -v Simulator | grep iPhone`
  → real UDID like `<device-udid>`.
- Confirm the device is reachable before building: `xcrun devicectl list devices` should
  show `available`. Over WiFi it often shows `unavailable` when the phone is
  locked/asleep; that also blocks `devicectl` log pulls (see Verify).

### Signing (local dev)
- The committed Debug team `G7X4226T2Q` has no account on this Mac, so signing fails with
  "No profiles for '...' were found ... Automatic signing is disabled".
- This Mac's only signing identity is team `<local-dev-team>`
  (Apple Development: <local-dev-account>), bundle `<local-dev-bundle>`.
- Before a device build, set the Debug config in
  `apps/mobile/ios/AURA.xcodeproj/project.pbxproj` to this team + bundle. Keep it a
  LOCAL edit — do NOT commit it. Empty entitlements (`<dict/>`) means no extra
  capabilities are needed, so this signs cleanly.

### Metro host (WiFi)
- A dev build bakes the Mac's LAN IP at build time. If the Mac's DHCP IP later changes,
  the app shows a red "Could not connect to development server" screen pointing at the
  OLD IP (e.g. it wants `<old-lan-ip>` while the Mac is now `<current-lan-ip>`).
- Prevent it: inject the CURRENT IP at build time so the baked URL is correct:
  `REACT_NATIVE_PACKAGER_HOSTNAME=$(ipconfig getifaddr en0) npm run ios:face-capture-lab -- --device <UDID>`
- Phone and Mac must be on the same WiFi/subnet (compare against `ipconfig getifaddr en0`),
  or the app cannot reach Metro.
- Emergency recover WITHOUT rebuilding: if only the Mac IP changed and the old baked IP is
  free (`ping -c1 <OLD_IP>` → no reply), re-add the old IP as an alias, then tap "Reload JS"
  in the app. The `netmask` keyword is REQUIRED — without it macOS treats the arg as
  broadcast and defaults the mask to /16, which breaks routing:
  `sudo ifconfig en0 alias <OLD_IP> netmask 255.255.255.255`

### Install / launch
- "Cannot launch ... because the device is locked" (xcodebuild exit after a successful
  build) means the app INSTALLED fine and only auto-launch failed. Unlock the phone and
  open the app manually; do not rebuild.

### Verify the measurement (arm capture BEFORE the run)
- The app appends every Face3D event (including `face3d_analyzed` with frame counts and the
  11 G2 metrics when available; legacy G1 profiles contain 5) to
  `Documents/face3d-runtime-evidence/events.jsonl` when `__DEV__` is true.
- Set up result capture BEFORE asking for a measurement, so the user only has to run it once:
  - **WiFi (no USB) via Hermes debugger:** while the app is foregrounded and connected to
    Metro, `curl http://localhost:8081/json/list` returns a `webSocketDebuggerUrl`. Open a
    CDP client on it and call `Runtime.evaluate` (with `awaitPromise` + `returnByValue`) to
    read the file from inside the app via `globalThis.expo.modules` FileSystem
    (`documentDirectory` + `readAsStringAsync`), or capture the `[aura:face3d] analyzed`
    console logs. The debug target only exists while the app is on screen — poll
    `/json/list` until it appears.
  - **USB:** `xcrun devicectl device copy from --device <UDID> --domain-type appDataContainer --domain-identifier <bundle> --source Documents/face3d-runtime-evidence/events.jsonl --destination ./events.jsonl`
- A screenshot of the results screen is also acceptable proof (frame count `30/30` + the
  metric grid), but prefer the log so values are exact.
