import {
  canJoinConsultingCall,
  isConsultingActiveStatus,
  isConsultingChatAvailable,
  isConsultingPendingStatus,
} from './consultingFlow';
import type {ConsultingRecord} from '../types';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function record(
  status: ConsultingRecord['status'],
  overrides: Partial<ConsultingRecord> = {},
): ConsultingRecord {
  return {
    id: `booking-${status}`,
    expertId: 'expert-1',
    status,
    categoryLabel: '퍼스널 컬러',
    dateLabel: '2026. 07. 13.',
    durationLabel: '30분',
    sessionMode: 'online',
    ...overrides,
  };
}

expect(isConsultingActiveStatus('requested'), 'requested booking stays visible in application status');
expect(isConsultingPendingStatus('requested'), 'requested booking is editable before confirmation');
expect(!isConsultingChatAvailable(record('requested')), 'pending booking must not open chat');
expect(isConsultingChatAvailable(record('confirmed')), 'confirmed booking opens chat on legacy payloads');
expect(
  !isConsultingChatAvailable(record('confirmed', {chatAvailable: false})),
  'server chatAvailable=false must override a confirmed-looking public status',
);
expect(
  isConsultingChatAvailable(record('canceled', {chatAvailable: true})),
  'a confirmed conversation remains readable after cancellation',
);
expect(
  !isConsultingChatAvailable(record('completed', {customerLeftAt: '2026-07-13T00:00:00Z'})),
  'leaving a conversation hides it from the inbox',
);
expect(canJoinConsultingCall(record('confirmed')), 'confirmed online booking can receive a call');
expect(
  !canJoinConsultingCall(record('confirmed', {sessionMode: 'offline'})),
  'offline booking never exposes a video-call action',
);
expect(!canJoinConsultingCall(record('completed')), 'completed booking cannot restart the old call');

console.log('consulting flow contract passed');
