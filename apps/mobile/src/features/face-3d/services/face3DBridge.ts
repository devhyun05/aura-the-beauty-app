import {NativeModules} from 'react-native';

import {addUnityMakeupEventListener} from '../../ar/services/unityMakeupBridge';
import type {Face3DEvent, Face3DStartRequest} from '../types';
import {parseFace3DEvent} from './face3DContract';

export const FACE_3D_BRIDGE_TARGET = {
  cancelMethod: 'CancelFace3DAnalysisJson',
  gameObject: 'RNBridge',
  startMethod: 'StartFace3DAnalysisJson',
} as const;

type NativeFace3DBridge = {
  isFrameworkAvailable?: () => boolean;
  isReady?: () => boolean;
  isRuntimeAvailable?: () => boolean;
  postMessage?: (gameObject: string, method: string, payload: string) => void;
  prepareRuntime?: () => void;
};

export type Face3DBridgeResult =
  | {ok: true}
  | {message: string; ok: false};

function getNativeFace3DBridge(): NativeFace3DBridge | undefined {
  return NativeModules.UnityMakeupBridge as NativeFace3DBridge | undefined;
}

export function prepareFace3DRuntime(): Face3DBridgeResult {
  const bridge = getNativeFace3DBridge();

  if (!bridge?.postMessage) {
    return {message: '이 빌드에는 Unity Face3D 브리지가 포함되어 있지 않습니다.', ok: false};
  }

  if (bridge.isFrameworkAvailable?.() === false) {
    return {message: 'UnityFramework를 사용할 수 없는 기기 또는 빌드입니다.', ok: false};
  }

  bridge.prepareRuntime?.();
  return {ok: true};
}

export function isFace3DRuntimeReady(): boolean {
  const bridge = getNativeFace3DBridge();

  if (!bridge?.postMessage || bridge.isFrameworkAvailable?.() === false) {
    return false;
  }

  return (bridge.isReady?.() ?? false) || (bridge.isRuntimeAvailable?.() ?? false);
}

export function postFace3DStartRequest(
  request: Face3DStartRequest,
): Face3DBridgeResult {
  const bridge = getNativeFace3DBridge();

  if (!bridge?.postMessage) {
    return {message: 'Face3D 시작 명령을 보낼 수 없습니다.', ok: false};
  }

  bridge.postMessage(
    FACE_3D_BRIDGE_TARGET.gameObject,
    FACE_3D_BRIDGE_TARGET.startMethod,
    JSON.stringify(request),
  );
  return {ok: true};
}

export function postFace3DCancelRequest(requestId: string): Face3DBridgeResult {
  const bridge = getNativeFace3DBridge();

  if (!bridge?.postMessage) {
    return {message: 'Face3D 취소 명령을 보낼 수 없습니다.', ok: false};
  }

  bridge.postMessage(
    FACE_3D_BRIDGE_TARGET.gameObject,
    FACE_3D_BRIDGE_TARGET.cancelMethod,
    JSON.stringify({requestId}),
  );
  return {ok: true};
}

export function addFace3DEventListener(listener: (event: Face3DEvent) => void) {
  return addUnityMakeupEventListener(event => {
    const parsed = parseFace3DEvent(event.message);

    if (parsed) {
      listener(parsed);
    }
  });
}
