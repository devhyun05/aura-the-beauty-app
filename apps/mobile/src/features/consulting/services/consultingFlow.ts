import type {ConsultingRecord, ConsultingRecordStatus} from '../types';

const ACTIVE_STATUSES = new Set<ConsultingRecordStatus>([
  'requested',
  'contacting',
  'confirmed',
  'scheduled',
  'in_progress',
]);
const CHAT_STATUSES = new Set<ConsultingRecordStatus>([
  'confirmed',
  'scheduled',
  'in_progress',
  'completed',
]);

export function isConsultingActiveStatus(status: ConsultingRecordStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function isConsultingPendingStatus(status: ConsultingRecordStatus): boolean {
  return status === 'requested' || status === 'contacting';
}

export function isConsultingMessageStatus(status: ConsultingRecordStatus): boolean {
  return CHAT_STATUSES.has(status);
}

export function isConsultingChatAvailable(record: ConsultingRecord): boolean {
  if (typeof record.chatAvailable === 'boolean') {
    return record.chatAvailable;
  }

  return (
    isConsultingMessageStatus(record.status) &&
    !record.customerLeftAt &&
    !record.expertLeftAt
  );
}

export function canJoinConsultingCall(record: ConsultingRecord | null): boolean {
  return Boolean(
    record &&
      record.sessionMode !== 'offline' &&
      ['confirmed', 'scheduled', 'in_progress'].includes(record.status),
  );
}
