// AURADIN — orb host-pause signal (3-3 게이팅).
// 오브 GL 루프를 "안 볼 때" 멈춰 GPU·배터리를 아낀다:
//   · 앱이 백그라운드(AppState !== 'active') → 화면에 없음
//   · 키보드가 올라옴 → 오브가 접히거나(홈 1-1) 주의가 입력창에 있음
// PersistentOrb의 paused는 GL RAF를 멈추고 안정된 한 프레임만 남긴다(빈 캔버스 아님).
import * as React from 'react';
import { AppState, Keyboard, Platform } from 'react-native';

/** 앱 백그라운드 || 키보드 표시 → true. AuradinSearchScreen이 PersistentOrb.paused로 전달. */
export function useHostPause(): boolean {
  const [backgrounded, setBackgrounded] = React.useState(() => AppState.currentState !== 'active');
  const [keyboardUp, setKeyboardUp] = React.useState(false);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setBackgrounded(state !== 'active'));
    return () => sub.remove();
  }, []);

  React.useEffect(() => {
    // iOS는 will* 이벤트가 프레임 앞서 도착 → 프리즈 타이밍이 자연스럽다. Android는 did*만 신뢰 가능.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardUp(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return backgrounded || keyboardUp;
}
