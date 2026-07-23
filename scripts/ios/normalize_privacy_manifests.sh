#!/usr/bin/env bash

set -euo pipefail

if [[ "${EAS_BUILD_PLATFORM:-ios}" != "ios" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MOBILE_DIR="${MOBILE_DIR:-${REPO_ROOT}/apps/mobile}"
PLIST_BUDDY="/usr/libexec/PlistBuddy"

chime_root="${MOBILE_DIR}/ios/Pods/AmazonChimeSDK"
chime_count=0

if [[ -d "${chime_root}" ]]; then
  while IFS= read -r -d '' manifest; do
    "${PLIST_BUDDY}" \
      -c "Set :NSPrivacyCollectedDataTypes:0:NSPrivacyCollectedDataTypePurposes:0 NSPrivacyCollectedDataTypePurposeAppFunctionality" \
      "${manifest}"

    purpose="$("${PLIST_BUDDY}" \
      -c "Print :NSPrivacyCollectedDataTypes:0:NSPrivacyCollectedDataTypePurposes:0" \
      "${manifest}")"

    if [[ "${purpose}" != "NSPrivacyCollectedDataTypePurposeAppFunctionality" ]]; then
      echo "[aura:privacy] invalid Amazon Chime collection purpose: ${purpose}" >&2
      exit 1
    fi

    plutil -lint "${manifest}" >/dev/null
    chime_count=$((chime_count + 1))
  done < <(find "${chime_root}" -type f \
    -path "*/AmazonChimeSDK.framework/PrivacyInfo.xcprivacy" -print0)
fi

if [[ "${chime_count}" -eq 0 ]]; then
  echo "[aura:privacy] Amazon Chime privacy manifest was not found" >&2
  exit 1
fi

view_shot_manifest="${MOBILE_DIR}/node_modules/react-native-view-shot/ios/PrivacyInfo.xcprivacy"

if [[ ! -f "${view_shot_manifest}" ]]; then
  echo "[aura:privacy] react-native-view-shot privacy manifest was not found" >&2
  exit 1
fi

for key in \
  NSPrivacyAccessedAPITypes \
  NSPrivacyCollectedDataTypes \
  NSPrivacyTrackingDomains
do
  value="$(plutil -extract "${key}" json -o - "${view_shot_manifest}" 2>/dev/null || true)"

  if [[ "${value}" == "[]" ]]; then
    "${PLIST_BUDDY}" -c "Delete :${key}" "${view_shot_manifest}"
  fi
done

plutil -lint "${view_shot_manifest}" >/dev/null

if plutil -extract NSPrivacyAccessedAPITypes json -o - \
  "${view_shot_manifest}" >/dev/null 2>&1; then
  echo "[aura:privacy] react-native-view-shot still declares an empty accessed API list" >&2
  exit 1
fi

echo "[aura:privacy] normalized ${chime_count} Amazon Chime manifest(s)"
echo "[aura:privacy] normalized react-native-view-shot privacy manifest"
