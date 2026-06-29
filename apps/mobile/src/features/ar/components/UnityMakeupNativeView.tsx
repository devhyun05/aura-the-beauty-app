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

type UnityMakeupNativeBridge = {
  isFrameworkAvailable?: () => boolean;
};

const NativeUnityMakeupView =
  Platform.OS === 'ios'
    ? requireNativeComponent<ViewProps>(UNITY_MAKEUP_NATIVE_VIEW_NAME)
    : View;

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

export function UnityMakeupNativeView({style, ...props}: ViewProps) {
  return <NativeUnityMakeupView {...props} style={[styles.view, style]} />;
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
