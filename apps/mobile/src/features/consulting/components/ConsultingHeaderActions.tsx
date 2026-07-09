import React from 'react';
import {Pressable, StyleSheet, View as RNView} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Bell, CalendarDays, MessageCircle} from 'lucide-react-native';

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
  const [unreadState, setUnreadState] = React.useState<ConsultingUnreadState>({
    messages: false,
    notifications: false,
  });

  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;

      getConsultingBookings()
        .then(records => getConsultingUnreadState(records))
        .then(nextUnreadState => {
          if (isMounted) {
            setUnreadState(nextUnreadState);
          }
        });

      return () => {
        isMounted = false;
      };
    }, []),
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
      {showDot ? <RNView style={styles.dot} /> : null}
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
  dot: {
    backgroundColor: consultingColors.roseStrong,
    borderColor: consultingColors.surface,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    height: 9,
    position: 'absolute',
    right: 5,
    top: 5,
    width: 9,
  },
  pressed: {
    opacity: 0.82,
  },
});
