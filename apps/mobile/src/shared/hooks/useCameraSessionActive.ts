import {useEffect, useState} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {useIsFocused} from '@react-navigation/native';

type CameraSessionActiveInput = {
  appState: AppStateStatus;
  isFocused: boolean;
};

export function isCameraSessionActive({
  appState,
  isFocused,
}: CameraSessionActiveInput): boolean {
  return isFocused && appState === 'active';
}

export function useCameraSessionActive(enabled = true): boolean {
  const isFocused = useIsFocused();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);

    return () => {
      subscription.remove();
    };
  }, []);

  return enabled && isCameraSessionActive({appState, isFocused});
}
