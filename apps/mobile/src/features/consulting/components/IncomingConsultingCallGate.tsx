import {useCallback, useEffect, useRef, useState} from 'react';
import {
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  View as RNView,
} from 'react-native';
import {Phone, PhoneOff} from 'lucide-react-native';
import {Text} from 'tamagui';

import {useAuthSession} from '../../auth';
import {
  consultingColors,
  consultingRadius,
  spacing,
  typography,
} from '../../../shared/theme';
import {connectConsultingConversationSocket} from '../services/consultingRealtimeService';
import {
  getConsultingBookings,
  getConsultingCallState,
  getConsultingExpert,
} from '../services/consultingService';
import type {ConsultingExpert, ConsultingRecord} from '../types';

type IncomingConsultingCallGateProps = {
  onAnswer: (record: ConsultingRecord) => void;
};

const BOOKING_SUBSCRIPTION_REFRESH_INTERVAL_MS = 10_000;
const CALL_STATE_POLL_INTERVAL_MS = 2_000;
const DISMISSED_CALL_REMINDER_DELAY_MS = 15_000;

export function IncomingConsultingCallGate({
  onAnswer,
}: IncomingConsultingCallGateProps) {
  const {getAuthToken, session} = useAuthSession();
  const [incomingRecord, setIncomingRecord] = useState<ConsultingRecord | null>(null);
  const [incomingExpert, setIncomingExpert] = useState<ConsultingExpert | null>(null);
  const clientsRef = useRef(new Map<string, ReturnType<typeof connectConsultingConversationSocket>>());
  const callKeyByBookingIdRef = useRef(new Map<string, string>());
  const answeredCallKeysRef = useRef(new Set<string>());
  const dismissedCallUntilRef = useRef(new Map<string, number>());
  const callableRecordsRef = useRef<readonly ConsultingRecord[]>([]);
  const callStateRefreshInFlightRef = useRef(false);

  const presentIncomingCall = useCallback((record: ConsultingRecord, callSessionId?: string | null) => {
    const callKey = callSessionId || `booking:${record.id}`;
    callKeyByBookingIdRef.current.set(record.id, callKey);
    if (answeredCallKeysRef.current.has(callKey)) {
      return;
    }
    const dismissedUntil = dismissedCallUntilRef.current.get(callKey) ?? 0;
    if (dismissedUntil > Date.now()) {
      return;
    }
    dismissedCallUntilRef.current.delete(callKey);
    setIncomingRecord(current => current?.id === record.id ? current : record);
  }, []);

  const endIncomingCall = useCallback((bookingId: string) => {
    const callKey = callKeyByBookingIdRef.current.get(bookingId);
    callKeyByBookingIdRef.current.delete(bookingId);
    if (callKey) {
      answeredCallKeysRef.current.delete(callKey);
      dismissedCallUntilRef.current.delete(callKey);
    }
    setIncomingRecord(current => current?.id === bookingId ? null : current);
  }, []);

  const closeClients = useCallback(() => {
    clientsRef.current.forEach(client => client.close());
    clientsRef.current.clear();
  }, []);

  const refreshCallStates = useCallback(async () => {
    if (callStateRefreshInFlightRef.current || AppState.currentState !== 'active') {
      return;
    }

    const callableRecords = callableRecordsRef.current;
    if (!callableRecords.length) {
      setIncomingRecord(null);
      return;
    }

    callStateRefreshInFlightRef.current = true;
    try {
      const callStates = await Promise.all(
        callableRecords.map(async record => ({
          record,
          state: await getConsultingCallState(record.id),
        })),
      );
      const activeCall = callStates.find(item => item.state?.status === 'active');
      if (activeCall) {
        presentIncomingCall(activeCall.record, activeCall.state?.callSessionId);
        return;
      }

      if (callStates.every(item => item.state !== null)) {
        setIncomingRecord(null);
      }
    } finally {
      callStateRefreshInFlightRef.current = false;
    }
  }, [presentIncomingCall]);

  const refreshCallSubscriptions = useCallback(async () => {
    const authToken = getAuthToken();
    if (!session || !authToken) {
      closeClients();
      callableRecordsRef.current = [];
      callKeyByBookingIdRef.current.clear();
      answeredCallKeysRef.current.clear();
      dismissedCallUntilRef.current.clear();
      setIncomingRecord(null);
      return;
    }

    const records = await getConsultingBookings(undefined, {force: true});
    const callableRecords = records.filter(record =>
      record.sessionMode !== 'offline' &&
      ['confirmed', 'scheduled', 'in_progress'].includes(record.status),
    );
    callableRecordsRef.current = callableRecords;
    const callableIds = new Set(callableRecords.map(record => record.id));

    clientsRef.current.forEach((client, bookingId) => {
      if (!callableIds.has(bookingId)) {
        client.close();
        clientsRef.current.delete(bookingId);
      }
    });

    for (const record of callableRecords) {
      if (!clientsRef.current.has(record.id)) {
        const client = connectConsultingConversationSocket({
          authToken,
          bookingId: record.id,
          participantType: 'user',
          onEvent: event => {
            if (event.type === 'call.status' && event.status === 'started') {
              presentIncomingCall(record, event.callSessionId);
            }
            if (event.type === 'call.status' && event.status === 'ended') {
              endIncomingCall(record.id);
            }
          },
        });
        clientsRef.current.set(record.id, client);
      }
    }

    await refreshCallStates();
  }, [closeClients, endIncomingCall, getAuthToken, presentIncomingCall, refreshCallStates, session]);

  useEffect(() => {
    void refreshCallSubscriptions();
    const subscriptionInterval = setInterval(() => {
      if (AppState.currentState === 'active') {
        void refreshCallSubscriptions();
      }
    }, BOOKING_SUBSCRIPTION_REFRESH_INTERVAL_MS);
    const callStateInterval = setInterval(() => {
      void refreshCallStates();
    }, CALL_STATE_POLL_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void refreshCallSubscriptions();
        void refreshCallStates();
      }
    });

    return () => {
      clearInterval(subscriptionInterval);
      clearInterval(callStateInterval);
      subscription.remove();
      closeClients();
    };
  }, [closeClients, refreshCallStates, refreshCallSubscriptions]);

  useEffect(() => {
    let isMounted = true;
    setIncomingExpert(null);

    if (incomingRecord) {
      void getConsultingExpert(incomingRecord.expertId).then(expert => {
        if (isMounted) {
          setIncomingExpert(expert);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [incomingRecord]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (incomingRecord) {
          const callKey = callKeyByBookingIdRef.current.get(incomingRecord.id);
          if (callKey) {
            dismissedCallUntilRef.current.set(callKey, Date.now() + DISMISSED_CALL_REMINDER_DELAY_MS);
          }
        }
        setIncomingRecord(null);
      }}
      transparent
      visible={Boolean(incomingRecord)}>
      <RNView style={styles.backdrop}>
        <RNView style={styles.sheet}>
          <RNView style={styles.iconWrap}>
            <Phone color="#FFFFFF" size={28} />
          </RNView>
          <Text style={styles.eyebrow}>AURA 화상 상담</Text>
          <Text style={styles.title}>{incomingExpert?.name ?? '상담사'}님에게 전화가 왔어요</Text>
          <Text style={styles.description}>
            {incomingRecord?.dateLabel} · {incomingRecord?.durationLabel}
          </Text>
          <RNView style={styles.actions}>
            <Pressable
              accessibilityLabel="전화 거절"
              accessibilityRole="button"
              onPress={() => {
                if (incomingRecord) {
                  const callKey = callKeyByBookingIdRef.current.get(incomingRecord.id);
                  if (callKey) {
                    dismissedCallUntilRef.current.set(callKey, Date.now() + DISMISSED_CALL_REMINDER_DELAY_MS);
                  }
                }
                setIncomingRecord(null);
              }}
              style={({pressed}) => [styles.action, styles.reject, pressed ? styles.pressed : null]}>
              <PhoneOff color="#FFFFFF" size={20} />
              <Text style={styles.actionText}>나중에</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="전화 받기"
              accessibilityRole="button"
              onPress={() => {
                if (!incomingRecord) return;
                const record = incomingRecord;
                const callKey = callKeyByBookingIdRef.current.get(record.id);
                if (callKey) {
                  answeredCallKeysRef.current.add(callKey);
                }
                setIncomingRecord(null);
                onAnswer(record);
              }}
              style={({pressed}) => [styles.action, styles.answer, pressed ? styles.pressed : null]}>
              <Phone color="#FFFFFF" size={20} />
              <Text style={styles.actionText}>받기</Text>
            </Pressable>
          </RNView>
        </RNView>
      </RNView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderRadius: consultingRadius.pill,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
  },
  actionText: {
    color: '#FFFFFF',
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  actions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  answer: {
    backgroundColor: consultingColors.success,
  },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(18, 17, 15, 0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  description: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  eyebrow: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    marginTop: spacing.md,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: consultingColors.success,
    borderRadius: consultingRadius.pill,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  pressed: {
    opacity: 0.82,
  },
  reject: {
    backgroundColor: consultingColors.danger,
  },
  sheet: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderRadius: consultingRadius.sheet,
    maxWidth: 420,
    padding: spacing.xl,
    width: '100%',
  },
  title: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
