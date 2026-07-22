import * as Haptics from 'expo-haptics';

function ignoreUnsupportedHaptics(result: Promise<void>) {
  void result.catch(() => undefined);
}

export const feedbackHaptics = {
  select() {
    ignoreUnsupportedHaptics(Haptics.selectionAsync());
  },
  tap() {
    ignoreUnsupportedHaptics(
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    );
  },
  success() {
    ignoreUnsupportedHaptics(
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    );
  },
  error() {
    ignoreUnsupportedHaptics(
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    );
  },
};
