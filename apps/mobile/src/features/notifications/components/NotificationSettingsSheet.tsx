import {useCallback, useEffect, useState} from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  View as RNView,
} from 'react-native';
import {BellRing, X} from 'lucide-react-native';
import {Text, XStack, YStack} from 'tamagui';

import {
  colors,
  consultingColors,
  consultingRadius,
  iconSize,
  spacing,
  typography,
} from '../../../shared/theme';
import {
  getBackgroundReportNotificationsEnabled,
  setBackgroundReportNotificationsEnabled,
} from '../services/notificationService';

type NotificationSettingsSheetProps = {
  onClose: () => void;
  visible: boolean;
};

export function NotificationSettingsSheet({
  onClose,
  visible,
}: NotificationSettingsSheetProps) {
  const [enabled, setEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!visible) {
      return;
    }

    let isMounted = true;
    setMessage('');
    void getBackgroundReportNotificationsEnabled().then(nextEnabled => {
      if (isMounted) {
        setEnabled(nextEnabled);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [visible]);

  const handleToggle = useCallback(async (nextEnabled: boolean) => {
    if (isLoading) {
      return;
    }

    const previousEnabled = enabled;
    setEnabled(nextEnabled);
    setIsLoading(true);
    setMessage('');

    try {
      const result = await setBackgroundReportNotificationsEnabled(nextEnabled);

      if (result.status === 'permission-denied') {
        setEnabled(false);
        setMessage('아이폰 알림 권한이 꺼져 있어요.');
        Alert.alert(
          '알림 권한이 필요해요',
          '설정에서 AURA 알림을 허용하면 앱이 꺼져 있을 때도 보고서 완료 알림을 받을 수 있어요.',
          [
            {text: '취소', style: 'cancel'},
            {
              text: '설정 열기',
              onPress: () => {
                void Linking.openSettings();
              },
            },
          ],
        );
        return;
      }

      if (result.status === 'project-id-missing') {
        setEnabled(false);
        setMessage('푸시 프로젝트 연결이 필요해요.');
        return;
      }

      setMessage(
        result.status === 'registered'
          ? '앱이 꺼져 있어도 완료 알림을 받을 수 있어요.'
          : '백그라운드 푸시 알림을 껐어요.',
      );
    } catch (error) {
      setEnabled(previousEnabled);
      setMessage(
        error instanceof Error
          ? error.message
          : '알림 설정을 저장하지 못했어요.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [enabled, isLoading]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <RNView style={styles.modalRoot}>
        <Pressable
          accessibilityLabel="알림 설정 닫기"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
        />
        <YStack style={styles.sheet}>
          <RNView style={styles.handle} />
          <XStack style={styles.titleRow}>
            <YStack style={styles.titleCopy}>
              <Text style={styles.eyebrow}>NOTIFICATION SETTINGS</Text>
              <Text style={styles.title}>알림 설정</Text>
            </YStack>
            <Pressable
              accessibilityLabel="닫기"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={({pressed}) => [
                styles.closeButton,
                pressed ? styles.pressed : null,
              ]}>
              <X color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
            </Pressable>
          </XStack>

          <XStack style={styles.settingRow}>
            <RNView style={styles.settingIcon}>
              <BellRing
                color={consultingColors.roseStrong}
                size={22}
                strokeWidth={1.9}
              />
            </RNView>
            <YStack style={styles.settingCopy}>
              <Text style={styles.settingTitle}>앱이 꺼져도 알림 받기</Text>
              <Text style={styles.settingDescription}>
                얼굴 분석, 메이크업 추천·추출·피드백 보고서가 완료되면
                백그라운드나 종료 상태에서도 알려드려요.
              </Text>
            </YStack>
            <Switch
              accessibilityLabel="앱이 꺼져도 보고서 완료 알림 받기"
              disabled={isLoading}
              ios_backgroundColor={colors.borderStrong}
              onValueChange={value => {
                void handleToggle(value);
              }}
              trackColor={{
                false: colors.borderStrong,
                true: consultingColors.roseStrong,
              }}
              value={enabled}
            />
          </XStack>

          <Text style={styles.note}>
            이 설정을 꺼도 완료 알림은 앱 안의 알림 목록에 계속 저장돼요.
          </Text>
          {message ? (
            <Text accessibilityLiveRegion="polite" style={styles.message}>
              {message}
            </Text>
          ) : null}
        </YStack>
      </RNView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    alignItems: 'center',
    borderRadius: consultingRadius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  eyebrow: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    letterSpacing: 1.1,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: consultingRadius.pill,
    height: 4,
    width: 42,
  },
  message: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  note: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  pressed: {
    opacity: 0.72,
  },
  scrim: {
    backgroundColor: 'rgba(17, 17, 17, 0.28)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  settingCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  settingDescription: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  settingIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  settingRow: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    gap: spacing.md,
    padding: spacing.md,
  },
  settingTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: spacing.lg,
    paddingBottom: 36,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  title: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  titleCopy: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    alignItems: 'center',
    gap: spacing.md,
  },
});
