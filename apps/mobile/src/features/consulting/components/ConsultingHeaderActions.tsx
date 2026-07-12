import React from 'react';
import {Pressable, StyleSheet, Text as RNText, View as RNView} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Bell, CalendarDays, MessageCircle} from 'lucide-react-native';

import {useAuthSession} from '../../auth';
import {consultingColors, consultingRadius} from '../../../shared/theme';
import {getConsultingBookings} from '../services/consultingService';
import {
  getConsultingUnreadState,
  type ConsultingUnreadState,
} from '../services/consultingReadStateService';

type ConsultingHeaderActionsProps = {
  onPressHistory?: () => void;
  onPressMessages: () => void;
  onPressNotifications: () => void;
  showHistory?: boolean;
};

export function ConsultingHeaderActions({
  onPressHistory,
  onPressMessages,
  onPressNotifications,
  showHistory = false,
}: ConsultingHeaderActionsProps) {
  const {getAuthToken} = useAuthSession();
  const [unreadState, setUnreadState] = React.useState<ConsultingUnreadState>({
    messages: false,
    notifications: false,
  });

  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;

      const refreshUnreadState = () => {
        if (!getAuthToken()) {
          if (isMounted) {
            setUnreadState({messages: false, notifications: false});
          }
          return;
        }

        void getConsultingBookings(undefined, {force: true})
          .then(records => getConsultingUnreadState(records))
          .then(nextUnreadState => {
            if (isMounted) {
              setUnreadState(nextUnreadState);
            }
          });
      };

      refreshUnreadState();
      const refreshTimer = setInterval(refreshUnreadState, 30000);

      return () => {
        isMounted = false;
        clearInterval(refreshTimer);
      };
    }, [getAuthToken]),
  );

  return (
    <RNView style={styles.actions}>
      <ConsultingHeaderActionButton
        icon="bell"
        label="알림"
        onPress={onPressNotifications}
        showDot={unreadState.notifications}
      />
      <ConsultingHeaderActionButton
        icon="message"
        label="톡"
        onPress={onPressMessages}
        showDot={unreadState.messages}
      />
      {showHistory && onPressHistory ? (
        <ConsultingHeaderActionButton
          icon="calendar"
          label="내역"
          onPress={onPressHistory}
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
}: {
  icon: 'bell' | 'calendar' | 'message';
  label: string;
  onPress: () => void;
  showDot?: boolean;
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
      <Icon color={consultingColors.text} size={21} strokeWidth={2.1} />
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
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
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
