#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
UNITY_PROJECT="${REPO_ROOT}/apps/unity/MakeupAR"
MP_VERSION="0.16.3"
TGZ_NAME="com.github.homuler.mediapipe-${MP_VERSION}.tgz"
TGZ_DIR="${UNITY_PROJECT}/Packages/local"
STREAMING_ASSETS="${UNITY_PROJECT}/Assets/StreamingAssets"

mkdir -p "${TGZ_DIR}" "${STREAMING_ASSETS}"

if [[ ! -f "${TGZ_DIR}/${TGZ_NAME}" ]]; then
  curl -L --fail -o "${TGZ_DIR}/${TGZ_NAME}" \
    "https://github.com/homuler/MediaPipeUnityPlugin/releases/download/v${MP_VERSION}/${TGZ_NAME}"
fi

if [[ ! -f "${STREAMING_ASSETS}/face_landmarker.task" ]]; then
  curl -L --fail -o "${STREAMING_ASSETS}/face_landmarker.task" \
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
fi

if [[ ! -f "${STREAMING_ASSETS}/canonical_face_model.obj" ]]; then
  curl -L --fail -o "${STREAMING_ASSETS}/canonical_face_model.obj" \
    "https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj"
fi

if [[ ! -f "${STREAMING_ASSETS}/selfie_multiclass_256x256.tflite" ]]; then
  curl -L --fail -o "${STREAMING_ASSETS}/selfie_multiclass_256x256.tflite" \
    "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite"
fi

echo "[aura:stencil] MediaPipe package and runtime models are ready."
