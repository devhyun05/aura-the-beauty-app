import { postUnityMessage } from '../services/unityMakeupBridge';

import type { RNToUnityMessage } from './src/bridge/types';
import { BARE } from './src/presets';

// 화면 이탈 시 Unity 싱글턴에 남은 메이크업을 즉시 맨얼굴로 비운다. Unity 플레이어는
// 화면 밖에서도 살아 있어 마지막 applyFilter 파라미터를 그대로 들고 있는다 — 재진입해
// 카메라/AR 세션이 다시 뜨는 첫 프레임들이 그 이전 필터를 몇 초간 렌더한 뒤에야
// resyncAll(맨얼굴)이 도착해 풀린다. 이탈 순간 브리지로 직접 중립값을 실어두면(뷰
// 마운트와 무관하게 싱글턴에 전달) 재개 프레임이 처음부터 맨얼굴이라 그 깜빡임이 없다.
//
// 반드시 SetStencilActive(false)보다 먼저 보내야 한다: Unity MakeupController는
// OnDisable에서 NativeBridge 구독을 해제하므로, 비활성화 뒤에 도착한 리셋은 아무도
// 처리하지 않고 증발한다(UnitySendMessage는 순서 보존 큐라 송신 순서=처리 순서).
export function resetUnityMakeupToBare() {
  const send = (msg: RNToUnityMessage) =>
    postUnityMessage('NativeBridge', 'OnMessageFromRN', JSON.stringify(msg));
  send({ type: 'applyFilter', filter: BARE });
  send({ type: 'setOverlayLayers', overlayLayers: [] });
  send({ type: 'setLensLayers', lensLayers: [] });
  send({ type: 'setEyeshadowLayers', eyeshadowLayers: [] });
  send({
    type: 'setStencil',
    stencil: {
      opacity: 0,
      lips: false,
      brows: false,
      eyeshadow: false,
      eyeliner: false,
      aegyo: false,
      blush: false,
      highlighter: false,
      contour: false,
      pulse: false,
      dash: false,
    },
  });
  send({ type: 'setSymmetry', symmetry: { opacity: 0, midline: false, pairs: false } });
  send({ type: 'setLighting', lighting: { preset: 0, intensity: 0.85, temperature: 0.5 } });
}
