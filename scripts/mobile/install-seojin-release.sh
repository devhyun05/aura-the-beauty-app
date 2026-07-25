#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 || ( $# -eq 2 && "$2" != "--build-only" ) ]]; then
  echo "Usage: $0 <devicectl-device-identifier> [--build-only]" >&2
  exit 64
fi

DEVICE_ID="$1"
BUILD_ONLY=false
if [[ $# -eq 2 ]]; then
  BUILD_ONLY=true
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_DIR="${REPO_ROOT}/apps/mobile/ios"
DERIVED_DATA_PATH="/private/tmp/aura-release-seojin-derived"
APP_PATH="${DERIVED_DATA_PATH}/Build/Products/Release-iphoneos/AURA.app"
BUILD_LOG="/private/tmp/aura-seojin-release-build.log"
TEMP_DIR="$(mktemp -d /private/tmp/aura-seojin-release.XXXXXX)"
APP_CONFIG_PATH="${REPO_ROOT}/apps/mobile/app.json"
ENTITLEMENTS_PATH="${IOS_DIR}/AURA/AURA.entitlements"
INFO_PLIST_PATH="${IOS_DIR}/AURA/Info.plist"
PODFILE_LOCK_PATH="${IOS_DIR}/Podfile.lock"
PODS_MANIFEST_PATH="${IOS_DIR}/Pods/Manifest.lock"
BUNDLE_ID="com.aiarmakeupguides.mobile.seojin"

cp "${APP_CONFIG_PATH}" "${TEMP_DIR}/app.json"
cp "${ENTITLEMENTS_PATH}" "${TEMP_DIR}/AURA.entitlements"
cp "${INFO_PLIST_PATH}" "${TEMP_DIR}/Info.plist"
cp "${PODFILE_LOCK_PATH}" "${TEMP_DIR}/Podfile.lock"

restore_signing_files() {
  if [[ -f "${TEMP_DIR}/app.json" ]]; then
    cp "${TEMP_DIR}/app.json" "${APP_CONFIG_PATH}"
  fi
  if [[ -f "${TEMP_DIR}/AURA.entitlements" ]]; then
    cp "${TEMP_DIR}/AURA.entitlements" "${ENTITLEMENTS_PATH}"
  fi
  if [[ -f "${TEMP_DIR}/Info.plist" ]]; then
    cp "${TEMP_DIR}/Info.plist" "${INFO_PLIST_PATH}"
  fi
  if [[ -f "${TEMP_DIR}/Podfile.lock" ]]; then
    cp "${TEMP_DIR}/Podfile.lock" "${PODFILE_LOCK_PATH}"
  fi
  rm -rf "${TEMP_DIR}"
}
trap restore_signing_files EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

# Personal Team cannot provision these checked-in capabilities. This mutation is
# local to the build and the trap above restores the exact pre-build files.
/usr/bin/plutil -remove expo.ios.usesAppleSignIn "${APP_CONFIG_PATH}" 2>/dev/null || true
/usr/bin/plutil -remove expo.ios.infoPlist.UIBackgroundModes "${APP_CONFIG_PATH}" 2>/dev/null || true
/usr/bin/plutil -remove expo.plugins.6 "${APP_CONFIG_PATH}" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Delete :aps-environment" "${ENTITLEMENTS_PATH}" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Delete :com.apple.developer.applesignin" "${ENTITLEMENTS_PATH}" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Delete :UIBackgroundModes" "${INFO_PLIST_PATH}" 2>/dev/null || true

# Keep the installed Pods sandbox untouched and use its resolved lock only for
# this local build. The checked-in Podfile.lock is restored by the trap.
if [[ ! -f "${PODS_MANIFEST_PATH}" ]]; then
  echo "[aura:release] Pods Manifest.lock is missing; run npm run pods once." >&2
  exit 1
fi
if ! cmp -s "${PODFILE_LOCK_PATH}" "${PODS_MANIFEST_PATH}"; then
  cp "${PODS_MANIFEST_PATH}" "${PODFILE_LOCK_PATH}"
fi

echo "[aura:release] Incremental Release build using ${DERIVED_DATA_PATH}"
if ! /usr/bin/time -p xcodebuild -quiet \
  -workspace "${IOS_DIR}/AURA.xcworkspace" \
  -scheme AURA \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -derivedDataPath "${DERIVED_DATA_PATH}" \
  -allowProvisioningUpdates \
  PRODUCT_BUNDLE_IDENTIFIER="${BUNDLE_ID}" \
  DEVELOPMENT_TEAM=5947QNM627 \
  CODE_SIGN_STYLE=Automatic \
  CODE_SIGN_ENTITLEMENTS= \
  COMPILER_INDEX_STORE_ENABLE=NO \
  DEBUG_INFORMATION_FORMAT=dwarf \
  GCC_GENERATE_DEBUGGING_SYMBOLS=NO \
  build >"${BUILD_LOG}" 2>&1; then
  tail -120 "${BUILD_LOG}" >&2
  exit 1
fi

if [[ ! -d "${APP_PATH}" ]]; then
  echo "[aura:release] Built app not found: ${APP_PATH}" >&2
  exit 1
fi

BUILT_BUNDLE_ID="$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${APP_PATH}/Info.plist")"
if [[ "${BUILT_BUNDLE_ID}" != "${BUNDLE_ID}" ]]; then
  echo "[aura:release] Refusing install: expected ${BUNDLE_ID}, got ${BUILT_BUNDLE_ID}" >&2
  exit 1
fi

if [[ "${BUILD_ONLY}" == "true" ]]; then
  echo "[aura:release] Built ${BUILT_BUNDLE_ID}; install skipped"
  exit 0
fi

echo "[aura:release] Overwrite-installing ${BUILT_BUNDLE_ID}"
xcrun devicectl device install app --device "${DEVICE_ID}" "${APP_PATH}"
xcrun devicectl device process launch --device "${DEVICE_ID}" "${BUNDLE_ID}"

echo "[aura:release] Installed and launched ${BUNDLE_ID}"
