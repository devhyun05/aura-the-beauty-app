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
  prepareUnityMakeupRuntime,
  setUnityMakeupPlayerPaused,
} from '../services/unityMakeupBridge';

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
    this.subscription = addUnityMakeupEventListener(event => {
      const message = typeof event.message === 'string' ? event.message : '';
      if (!message) {
        return;
      }

      try {
        const parsed = JSON.parse(message) as {type?: string};
        if (parsed.type === 'ready' || parsed.type === 'unity_initialized') {
          this.activateStencilRuntime();
          this.reportReady(message);
          return;
        }
      } catch {
        // The original handler owns protocol validation and ignores unknown data.
      }

      this.props.onUnityMessage?.({
        nativeEvent: {message},
      } as UnityMessageEvent);
    });

    setUnityMakeupPlayerPaused(false);
    prepareUnityMakeupRuntime();
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
    postUnityMessage('Aura Stencil Runtime', 'SetStencilActive', 'false');
    hideUnityMakeupView();
  }

  postMessage(gameObject: string, method: string, payload: string) {
    postUnityMessage(gameObject, method, payload);
  }

  private activateStencilRuntime() {
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
    const {
      androidKeepPlayerMounted: _androidKeepPlayerMounted,
      onUnityMessage: _onUnityMessage,
      ...viewProps
    } = this.props;

    return <UnityMakeupNativeView {...viewProps} />;
  }
}
