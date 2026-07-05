#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

UNITY_BIN="${UNITY_BIN:-/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity}"
UNITY_PROJECT_PATH="${UNITY_PROJECT_PATH:-${REPO_ROOT}/apps/unity/MakeupAR}"
UNITY_EXPORT_PATH="${UNITY_EXPORT_PATH:-${REPO_ROOT}/apps/unity-builds/ios-export}"
MOBILE_UNITY_BUILD_DIR="${MOBILE_UNITY_BUILD_DIR:-${REPO_ROOT}/apps/mobile/ios/UnityBuild}"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-/private/tmp/aura-unity-ios-derived-data}"
UNITY_LOG_FILE="${UNITY_LOG_FILE:-/private/tmp/aura_unity_ios_export.log}"

if [[ ! -x "${UNITY_BIN}" ]]; then
  echo "[aura:unity] Unity binary not found: ${UNITY_BIN}" >&2
  exit 1
fi

echo "[aura:unity] Exporting Unity iOS project..."
"${UNITY_BIN}" \
  -batchmode \
  -quit \
  -projectPath "${UNITY_PROJECT_PATH}" \
  -executeMethod MakeupARValidationSetup.ExportIosProject \
  -logFile "${UNITY_LOG_FILE}"

if [[ ! -d "${UNITY_EXPORT_PATH}/Unity-iPhone.xcodeproj" ]]; then
  echo "[aura:unity] Unity export was not created: ${UNITY_EXPORT_PATH}" >&2
  tail -120 "${UNITY_LOG_FILE}" >&2 || true
  exit 1
fi

echo "[aura:unity] Building UnityFramework from exported Xcode project..."
xcodebuild \
  -project "${UNITY_EXPORT_PATH}/Unity-iPhone.xcodeproj" \
  -scheme UnityFramework \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -derivedDataPath "${DERIVED_DATA_PATH}" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  build

BUILT_FRAMEWORK="${DERIVED_DATA_PATH}/Build/Products/Release-iphoneos/UnityFramework.framework"
if [[ ! -d "${BUILT_FRAMEWORK}" ]]; then
  echo "[aura:unity] Built UnityFramework.framework was not found: ${BUILT_FRAMEWORK}" >&2
  exit 1
fi

if [[ ! -d "${UNITY_EXPORT_PATH}/Data" ]]; then
  echo "[aura:unity] Exported Unity Data folder was not found: ${UNITY_EXPORT_PATH}/Data" >&2
  exit 1
fi

echo "[aura:unity] Copying framework and Unity Data into mobile iOS project..."
mkdir -p "${MOBILE_UNITY_BUILD_DIR}"
rsync -a --delete "${BUILT_FRAMEWORK}" "${MOBILE_UNITY_BUILD_DIR}/"
rsync -a --delete "${UNITY_EXPORT_PATH}/Data/" "${MOBILE_UNITY_BUILD_DIR}/Data/"

echo "[aura:unity] Done:"
echo "[aura:unity]   ${MOBILE_UNITY_BUILD_DIR}/UnityFramework.framework"
echo "[aura:unity]   ${MOBILE_UNITY_BUILD_DIR}/Data"
