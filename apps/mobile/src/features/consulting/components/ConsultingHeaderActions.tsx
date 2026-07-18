import React from 'react';
import {Pressable, StyleSheet, Text as RNText, View as RNView} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Bell, CalendarDays, MessageCircle} from 'lucide-react-native';

import {useAuthSession} from '../../auth';
import {
  getUnreadAppNotificationCount,
  subscribeNotificationStateChange,
} from '../../notifications/services/notificationService';
import {colors, consultingColors, consultingRadius} from '../../../shared/theme';
import {getConsultingBookings} from '../services/consultingService';
import {
  getConsultingUnreadState,
  subscribeConsultingReadStateChange,
  type ConsultingUnreadState,
} from '../services/consultingReadStateService';
import {useConsultingBookingStatusSync} from '../hooks/useConsultingBookingStatusSync';
import type {ConsultingRecord} from '../types';

type ConsultingHeaderActionsProps = {
  onPressHistory?: () => void;
  onPressMessages?: () => void;
  onPressNotifications: () => void;
  showMessages?: boolean;
  showHistory?: boolean;
  variant?: 'default' | 'hero';
};

export function ConsultingHeaderActions({
  onPressHistory,
  onPressMessages,
  onPressNotifications,
  showMessages = true,
  showHistory = false,
  variant = 'default',
}: ConsultingHeaderActionsProps) {
  const {getAuthToken} = useAuthSession();
  const [unreadState, setUnreadState] = React.useState<ConsultingUnreadState>({
    messages: false,
    notifications: false,
  });
  const [records, setRecords] = React.useState<readonly ConsultingRecord[]>([]);

  const refreshConsultingUnreadState = React.useCallback(() => {
    if (!getAuthToken()) {
      setRecords([]);
      setUnreadState(current => ({...current, messages: false}));
      return;
    }

    void getConsultingBookings(undefined, {force: true})
      .catch(() => [])
      .then(async nextRecords => {
        setRecords(nextRecords);
        const consultingUnreadState = await getConsultingUnreadState(nextRecords);
        return consultingUnreadState.messages;
      })
      .then(messages => {
        setUnreadState(current => ({...current, messages}));
      });
  }, [getAuthToken]);

  const refreshNotificationUnreadState = React.useCallback(() => {
    if (!getAuthToken()) {
      setUnreadState(current => ({...current, notifications: false}));
      return;
    }

    void getUnreadAppNotificationCount()
      .catch(() => 0)
      .then(unreadNotificationCount => {
        setUnreadState(current => ({
          ...current,
          notifications: unreadNotificationCount > 0,
        }));
      });
  }, [getAuthToken]);

  useConsultingBookingStatusSync({
    authToken: getAuthToken(),
    onStatusChange: refreshConsultingUnreadState,
    records,
  });

  React.useEffect(() => {
    const unsubscribeConsulting =
      subscribeConsultingReadStateChange(refreshConsultingUnreadState);
    const unsubscribeNotifications =
      subscribeNotificationStateChange(refreshNotificationUnreadState);

    return () => {
      unsubscribeConsulting();
      unsubscribeNotifications();
    };
  }, [refreshConsultingUnreadState, refreshNotificationUnreadState]);

  useFocusEffect(
    React.useCallback(() => {
      refreshConsultingUnreadState();
      refreshNotificationUnreadState();
      const refreshTimer = setInterval(refreshConsultingUnreadState, 30000);

      return () => {
        clearInterval(refreshTimer);
      };
    }, [refreshConsultingUnreadState, refreshNotificationUnreadState]),
  );

  return (
    <RNView style={styles.actions}>
      <ConsultingHeaderActionButton
        icon="bell"
        label="알림"
        onPress={onPressNotifications}
        showDot={unreadState.notifications}
        variant={variant}
      />
      {showMessages && onPressMessages ? (
        <ConsultingHeaderActionButton
          icon="message"
          label="톡"
          onPress={onPressMessages}
          showDot={unreadState.messages}
          variant={variant}
        />
      ) : null}
      {showHistory && onPressHistory ? (
        <ConsultingHeaderActionButton
          icon="calendar"
          label="내역"
          onPress={onPressHistory}
          variant={variant}
        />
      ) : null}
    </RNView>
  );
}

function ConsultingHeaderActionButton({
  icon,
  label,
  onPress,
  showDot = false,
  variant = 'default',
}: {
  icon: 'bell' | 'calendar' | 'message';
  label: string;
  onPress: () => void;
  showDot?: boolean;
  variant?: 'default' | 'hero';
}) {
  const Icon =
    icon === 'bell'
      ? Bell
      : icon === 'message'
        ? MessageCircle
        : CalendarDays;

  return (
    <Pressable
      accessibilityLabel={`${label} 바로가기`}
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={({pressed}) => [
        styles.actionButton,
        pressed ? styles.pressed : null,
      ]}>
      <Icon
        color={variant === 'hero' ? colors.brandMuted : consultingColors.text}
        size={variant === 'hero' ? 20 : 21}
        strokeWidth={variant === 'hero' ? 2 : 2.1}
      />
      {showDot ? (
        <RNView style={styles.badge}>
          <RNText style={styles.badgeText}>1</RNText>
        </RNView>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    position: 'relative',
    width: 40,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    backgroundColor: consultingColors.roseStrong,
    borderColor: consultingColors.surface,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    height: 17,
    position: 'absolute',
    right: 1,
    top: 1,
    width: 17,
  },
  badgeText: {
    color: consultingColors.surface,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.82,
  },
});
