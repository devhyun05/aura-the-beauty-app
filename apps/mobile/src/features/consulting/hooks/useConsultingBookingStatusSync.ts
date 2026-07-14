import {useEffect, useMemo, useRef} from 'react';

import {isConsultingActiveStatus} from '../services/consultingFlow';
import {connectConsultingConversationSocket} from '../services/consultingRealtimeService';
import type {ConsultingRecord} from '../types';

type StatusListener = (bookingId: string) => void;
type SharedStatusSubscription = {
  client: ReturnType<typeof connectConsultingConversationSocket>;
  listeners: Set<StatusListener>;
};

const sharedSubscriptions = new Map<string, SharedStatusSubscription>();

function subscribeToBookingStatus(
  authToken: string,
  bookingId: string,
  listener: StatusListener,
): () => void {
  const key = `${authToken}:${bookingId}`;
  let subscription = sharedSubscriptions.get(key);

  if (!subscription) {
    const listeners = new Set<StatusListener>();
    const client = connectConsultingConversationSocket({
      authToken,
      bookingId,
      participantType: 'user',
      onEvent: event => {
        if (
          event.type === 'booking.status' ||
          event.type === 'call.status' ||
          (event.type === 'message.new' && event.senderType !== 'user')
        ) {
          listeners.forEach(currentListener => currentListener(bookingId));
        }
      },
    });
    subscription = {client, listeners};
    sharedSubscriptions.set(key, subscription);
  }

  subscription.listeners.add(listener);
  return () => {
    const current = sharedSubscriptions.get(key);
    if (!current) {
      return;
    }
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      current.client.close();
      sharedSubscriptions.delete(key);
    }
  };
}

type UseConsultingBookingStatusSyncOptions = {
  authToken?: string | null;
  onStatusChange: (bookingId: string) => void;
  records: readonly ConsultingRecord[];
};

export function useConsultingBookingStatusSync({
  authToken,
  onStatusChange,
  records,
}: UseConsultingBookingStatusSyncOptions): void {
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const bookingIds = useMemo(
    () =>
      records
        .filter(record => isConsultingActiveStatus(record.status))
        .map(record => record.id),
    [records],
  );
  const bookingIdsKey = bookingIds.join(',');

  useEffect(() => {
    if (!authToken || bookingIds.length === 0) {
      return undefined;
    }

    const unsubscribers = bookingIds.map(bookingId =>
      subscribeToBookingStatus(
        authToken,
        bookingId,
        currentBookingId => onStatusChangeRef.current(currentBookingId),
      ),
    );

    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
    // bookingIdsKey is the stable subscription identity for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, bookingIdsKey]);
}
