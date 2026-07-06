import * as Haptics from 'expo-haptics';

/**
 * 저장/좋아요 등 가벼운 피드백용 햅틱.
 * 시뮬레이터 등 미지원 환경에서는 조용히 무시한다.
 */
export function triggerLightHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
