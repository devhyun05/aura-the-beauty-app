#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FRAMEWORK_INFO_PLIST="${REPOSITORY_ROOT}/apps/mobile/ios/UnityBuild/MediaPipeUnity.framework/Info.plist"

if [[ ! -f "${FRAMEWORK_INFO_PLIST}" ]]; then
  echo "[aura:unity] MediaPipeUnity.framework/Info.plist is missing." >&2
  exit 1
fi

# MediaPipeUnity is a Mach-O dynamic framework. Some upstream exports mark its
# bundle as APPL, which makes App Store Connect look for a separate application
# record named com.github.homuler.mediapipe.unity. Normalize only the bundle
# package type; the framework identifier, executable, and runtime linkage stay
# unchanged.
/usr/bin/plutil -replace CFBundlePackageType -string FMWK "${FRAMEWORK_INFO_PLIST}"

PACKAGE_TYPE=$(
  /usr/libexec/PlistBuddy -c "Print :CFBundlePackageType" "${FRAMEWORK_INFO_PLIST}"
)

if [[ "${PACKAGE_TYPE}" != "FMWK" ]]; then
  echo "[aura:unity] MediaPipeUnity.framework must use CFBundlePackageType=FMWK." >&2
  exit 1
fi

echo "[aura:unity] MediaPipeUnity.framework bundle type verified: ${PACKAGE_TYPE}"
