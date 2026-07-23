import React from 'react';
import {
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';

import {UnityMakeupNativeView} from '../components/UnityMakeupNativeView';
import {
  addUnityMakeupEventListener,
  hideUnityMakeupView,
  isUnityMakeupReady,
  postUnityMessage,
} from '../services/unityMakeupBridge';
import {resetUnityMakeupToBare} from './stencilMakeupReset';

type UnityMessageEvent = NativeSyntheticEvent<{message: string}>;

type StencilUnityViewProps = ViewProps & {
  androidKeepPlayerMounted?: boolean;
  onUnityMessage?: (event: UnityMessageEvent) => void;
};

/**
 * API-compatible adapter for the standalone stencil app's UnityView.
 * It keeps AURA's hardened singleton native runtime and only translates the
 * ref/event surface expected by the original App.tsx.
 */
export default class StencilUnityViewAdapter extends React.PureComponent<
  StencilUnityViewProps
> {
  private activationTimer: ReturnType<typeof setInterval> | null = null;
  private didReceiveReady = false;
  private subscription: {remove: () => void} | null = null;

  componentDidMount() {
    if (__DEV__) {
      console.info('[aura:ar-filter] unity-view:did-mount');
    }
    if (__DEV__) {
      console.info('[aura:ar-filter] unity-view:add-listener-start');
    }
    this.subscription = addUnityMakeupEventListener(event => {
      const message = typeof event.message === 'string' ? event.message : '';
      if (!message) {
        return;
      }

      try {
        const parsed = JSON.parse(message) as {type?: string};
        if (parsed.type === 'ready' || parsed.type === 'unity_initialized') {
          if (this.didReceiveReady) {
            // 첫 ready 이후의 ready/unity_initialized는 반드시 삼킨다. 네이티브
            // 브리지가 메시지 전송(ensureRunning)마다 이런 이벤트를 되쏠 수 있어,
            // 화면에 전달하면 전송→이벤트→재동기화→전송 피드백 루프가 된다
            // (2026-07-24 실기기에서 앱이 jetsam으로 죽는 플러딩 재현됨).
            // 웜 재활성 시 유실된 적용의 복구는 FilterScreen의 ready 후 1회성
            // 타이머 재동기화가 담당한다.
            return;
          }

          // Mark ready before activation. SetStencilActive(true) synchronously
          // emits another ready event, so activating first recursively re-enters
          // this handler and floods the bridge.
          this.reportReady(message);
          this.activateStencilRuntime();
          return;
        }
      } catch {
        // The original handler owns protocol validation and ignores unknown data.
      }

      this.props.onUnityMessage?.({
        nativeEvent: {message},
      } as UnityMessageEvent);
    });
    if (__DEV__) {
      console.info('[aura:ar-filter] unity-view:add-listener-success');
    }

    // The native Unity container owns visible runtime startup through
    // AURAUnityMakeupView.didMoveToWindow. Calling prepareRuntime here races that
    // owner path and can re-enter UnityFramework startup on physical devices.
    this.activationTimer = setInterval(() => {
      this.activateStencilRuntime();
      this.recoverMissedReadyEvent();
    }, 350);
    this.activateStencilRuntime();
    this.recoverMissedReadyEvent();
  }

  componentWillUnmount() {
    this.stopActivationRetry();
    this.subscription?.remove();
    this.subscription = null;
    // 순서 중요: 맨얼굴 리셋 → SetStencilActive(false). Unity MakeupController가
    // OnDisable에서 브리지 구독을 해제하므로, 비활성화 뒤에 보낸 리셋은 증발한다.
    resetUnityMakeupToBare();
    postUnityMessage('Aura Stencil Runtime', 'SetStencilActive', 'false');
    hideUnityMakeupView();
  }

  postMessage(gameObject: string, method: string, payload: string) {
    postUnityMessage(gameObject, method, payload);
  }

  private activateStencilRuntime() {
    if (!isUnityMakeupReady()) {
      if (__DEV__) {
        console.info('[aura:ar-filter] unity-view:activate-stencil-deferred');
      }
      return;
    }

    if (__DEV__) {
      console.info('[aura:ar-filter] unity-view:activate-stencil');
    }
    postUnityMessage('Aura Stencil Runtime', 'SetStencilActive', 'true');
    postUnityMessage('NativeBridge', 'SendReady', '');
  }

  private recoverMissedReadyEvent() {
    if (this.didReceiveReady || !isUnityMakeupReady()) {
      return;
    }

    // Unity is prewarmed before this screen mounts. Its ready event can therefore
    // fire before the RN listener exists; replay the state once so the stencil UI
    // does not remain on "Unity 로딩 중…" forever.
    this.reportReady(JSON.stringify({type: 'ready'}));
  }

  private reportReady(message: string) {
    if (this.didReceiveReady) {
      return;
    }

    this.didReceiveReady = true;
    this.stopActivationRetry();
    this.props.onUnityMessage?.({
      nativeEvent: {
        message:
          message.includes('unity_initialized')
            ? JSON.stringify({type: 'ready'})
            : message,
      },
    } as UnityMessageEvent);
  }

  private stopActivationRetry() {
    if (this.activationTimer) {
      clearInterval(this.activationTimer);
      this.activationTimer = null;
    }
  }

  render() {
    if (__DEV__) {
      console.info('[aura:ar-filter] unity-view:render');
    }
    const {
      androidKeepPlayerMounted: _androidKeepPlayerMounted,
      onUnityMessage: _onUnityMessage,
      ...viewProps
    } = this.props;

    return <UnityMakeupNativeView {...viewProps} />;
  }
}
