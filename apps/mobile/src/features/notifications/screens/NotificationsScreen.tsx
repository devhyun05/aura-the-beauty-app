import {useCallback, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {Pressable, StyleSheet, View as RNView} from 'react-native';
import {
  Bell,
  ChevronRight,
  MessageSquareText,
  ScanFace,
  Sparkles,
  WandSparkles,
} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {ConsultingScreenScaffold} from '../../consulting/components/ConsultingScreenScaffold';
import {
  colors,
  consultingColors,
  consultingRadius,
  spacing,
  typography,
} from '../../../shared/theme';
import {
  getAppNotifications,
  markAllAppNotificationsRead,
  markAppNotificationRead,
} from '../services/notificationService';
import type {AppNotification, AppNotificationType} from '../types';


type NotificationsScreenProps = {
  onPressNotification: (notification: AppNotification) => void;
};

function formatNotificationDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getNotificationCategory(type: AppNotificationType | string): string {
  if (type === 'analysis_report_completed') {
    return '얼굴 분석';
  }
  if (type === 'makeup_recommendation_completed') {
    return '메이크업 추천';
  }
  if (type === 'filter_extraction_completed') {
    return '메이크업 추출';
  }
  return '메이크업 피드백';
}

function NotificationTypeIcon({
  type,
}: {
  type: AppNotificationType | string;
}) {
  const Icon =
    type === 'analysis_report_completed'
      ? ScanFace
      : type === 'makeup_recommendation_completed'
        ? Sparkles
        : type === 'filter_extraction_completed'
          ? WandSparkles
          : MessageSquareText;

  return <Icon color={colors.brandMuted} size={22} strokeWidth={1.9} />;
}

export function NotificationsScreen({
  onPressNotification,
}: NotificationsScreenProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await getAppNotifications();
      setNotifications(response.notifications ?? []);
      if (response.unreadCount > 0) {
        await markAllAppNotificationsRead();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '알림을 불러오지 못했어요.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadNotifications();
    }, [loadNotifications]),
  );

  const handlePressNotification = useCallback(
    (notification: AppNotification) => {
      if (!notification.readAt) {
        void markAppNotificationRead(notification.id).catch(() => undefined);
      }
      onPressNotification(notification);
    },
    [onPressNotification],
  );

  return (
    <ConsultingScreenScaffold contentGap={spacing.xl}>
      <View style={styles.hero}>
        <RNView style={styles.heroIcon}>
          <Bell color={consultingColors.roseStrong} size={22} />
        </RNView>
        <RNView style={styles.heroBody}>
          <Text style={styles.heroTitle}>알림</Text>
          <Text style={styles.heroText}>
            얼굴 분석, 메이크업 추천·추출·피드백 보고서의 완료 소식을 모아
            보여드려요.
          </Text>
        </RNView>
      </View>

      {notifications.length > 0 ? (
        <View style={styles.list}>
          {notifications.map(notification => (
            <Pressable
              accessibilityLabel={`${notification.title}, 결과 보기`}
              accessibilityRole="button"
              key={notification.id}
              onPress={() => handlePressNotification(notification)}
              style={({pressed}) => [
                styles.notificationCard,
                pressed ? styles.pressed : null,
              ]}>
              <RNView style={styles.notificationIcon}>
                <NotificationTypeIcon type={notification.notificationType} />
              </RNView>
              <RNView style={styles.notificationBody}>
                <RNView style={styles.notificationMeta}>
                  <Text style={styles.notificationCategory}>
                    {getNotificationCategory(notification.notificationType)}
                  </Text>
                  <Text style={styles.notificationDate}>
                    {formatNotificationDate(notification.createdAt)}
                  </Text>
                </RNView>
                <Text numberOfLines={1} style={styles.notificationTitle}>
                  {notification.title}
                </Text>
                <Text numberOfLines={2} style={styles.notificationText}>
                  {notification.body}
                </Text>
              </RNView>
              <ChevronRight color={consultingColors.textSoft} size={18} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Bell color={consultingColors.textSoft} size={32} />
          <Text style={styles.emptyTitle}>
            {isLoading ? '알림을 확인하고 있어요' : '새 알림이 없어요'}
          </Text>
          <Text style={styles.emptyText}>
            {errorMessage ||
              (isLoading
                ? '완료된 보고서 알림을 불러오는 중이에요.'
                : '보고서 생성이 완료되면 이곳과 푸시 알림으로 알려드릴게요.')}
          </Text>
          {errorMessage ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadNotifications()}
              style={({pressed}) => [
                styles.retryButton,
                pressed ? styles.pressed : null,
              ]}>
              <Text style={styles.retryText}>다시 확인하기</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </ConsultingScreenScaffold>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.sheet,
    gap: spacing.sm,
    paddingHorizontal: 24,
    paddingVertical: 38,
  },
  emptyText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  emptyTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  hero: {
    alignItems: 'flex-start',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: 16,
  },
  heroBody: {
    flex: 1,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  heroText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: 4,
  },
  heroTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  list: {
    gap: spacing.md,
  },
  notificationBody: {
    flex: 1,
    minWidth: 0,
  },
  notificationCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: 16,
  },
  notificationCategory: {
    color: colors.brandMuted,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
  },
  notificationDate: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  notificationIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: consultingRadius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  notificationMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  notificationText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: 3,
  },
  notificationTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginTop: 5,
  },
  pressed: {
    opacity: 0.82,
  },
  retryButton: {
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    marginTop: spacing.sm,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  retryText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
});
