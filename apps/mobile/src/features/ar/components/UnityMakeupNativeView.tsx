import React, {useEffect, useState} from 'react';
import {
  NativeModules,
  Platform,
  requireNativeComponent,
  StyleSheet,
  UIManager,
  View,
  type ViewProps,
} from 'react-native';

const UNITY_MAKEUP_NATIVE_VIEW_NAME = 'AURAUnityMakeupView';

export type UnityMakeupRuntimeMode = 'live' | 'still';

export type UnityMakeupNativeViewProps = ViewProps & {
  runtimeMode?: UnityMakeupRuntimeMode;
};

type UnityMakeupNativeBridge = {
  isFrameworkAvailable?: () => boolean;
};

const NativeUnityMakeupView =
  Platform.OS === 'ios'
    ? requireNativeComponent<UnityMakeupNativeViewProps>(
        UNITY_MAKEUP_NATIVE_VIEW_NAME,
      )
    : (View as React.ComponentType<UnityMakeupNativeViewProps>);

export function isUnityMakeupNativeViewSupported(): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }

  if (!UIManager.getViewManagerConfig?.(UNITY_MAKEUP_NATIVE_VIEW_NAME)) {
    return false;
  }

  const nativeBridge = NativeModules.UnityMakeupBridge as
    | UnityMakeupNativeBridge
    | undefined;

  return nativeBridge?.isFrameworkAvailable?.() ?? false;
}

export function useUnityMakeupNativeViewReady(): boolean {
  const [isSupported, setIsSupported] = useState(isUnityMakeupNativeViewSupported);

  useEffect(() => {
    setIsSupported(isUnityMakeupNativeViewSupported());
  }, []);

  return isSupported;
}

export function UnityMakeupNativeView({
  runtimeMode = 'live',
  style,
  ...props
}: UnityMakeupNativeViewProps) {
  return (
    <NativeUnityMakeupView
      {...props}
      {...(Platform.OS === 'ios' ? {runtimeMode} : {})}
      style={[styles.view, style]}
    />
  );
}

const styles = StyleSheet.create({
  view: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
