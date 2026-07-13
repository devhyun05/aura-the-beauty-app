import * as SecureStore from '../../../shared/services/localSecureStore';
import {
  isConsultingChatAvailable,
  isConsultingMessageStatus,
} from './consultingFlow';
import type {ConsultingRecord, ConsultingRecordStatus} from '../types';

export type ConsultingInboxKind = 'messages' | 'notifications';

export type ConsultingUnreadState = Record<ConsultingInboxKind, boolean>;

const READ_STATE_KEY_PREFIX = 'aura.consulting.readState.v1';
const MAX_STORED_SIGNATURES = 160;
const readStateListeners = new Set<() => void>();

export function subscribeConsultingReadStateChange(listener: () => void): () => void {
  readStateListeners.add(listener);
  return () => readStateListeners.delete(listener);
}

function notifyReadStateChanged(): void {
  readStateListeners.forEach(listener => listener());
}

function getReadStateKey(kind: ConsultingInboxKind): string {
  return `${READ_STATE_KEY_PREFIX}.${kind}`;
}

export function isConsultingNotificationStatus(
  status: ConsultingRecordStatus,
): boolean {
  return (
    status === 'requested' ||
    status === 'contacting' ||
    status === 'confirmed' ||
    status === 'scheduled' ||
    status === 'in_progress' ||
    status === 'unavailable'
  );
}

function isRelevantRecord(
  kind: ConsultingInboxKind,
  record: ConsultingRecord,
): boolean {
  return kind === 'notifications'
    ? isConsultingNotificationStatus(record.status)
    : isConsultingMessageStatus(record.status) && isConsultingChatAvailable(record);
}

function getRecordSignature(record: ConsultingRecord): string {
  const messageSignature = record.lastExpertMessageAt ?? '';
  return [
    record.id,
    record.status,
    messageSignature,
    record.dayId ?? '',
    record.slotId ?? '',
    record.dateLabel,
    record.durationLabel,
  ].join(':');
}

function getSignatures(
  kind: ConsultingInboxKind,
  records: readonly ConsultingRecord[],
): readonly string[] {
  return records
    .filter(
      record =>
        isRelevantRecord(kind, record) &&
        (kind !== 'messages' || Boolean(record.lastExpertMessageAt)),
    )
    .map(getRecordSignature);
}

/**
 * Returns the booking ids with an unread expert message.  The messages screen
 * uses this before marking the inbox read so each card can show its own badge.
 */
export async function getConsultingUnreadRecordIds(
  kind: ConsultingInboxKind,
  records: readonly ConsultingRecord[],
): Promise<ReadonlySet<string>> {
  const signatures = getSignatures(kind, records);
  if (signatures.length === 0) {
    return new Set();
  }

  const readSignatures = await getReadSignatures(kind);
  return new Set(
    records
      .filter(record => {
        const signature = getRecordSignature(record);
        return signatures.includes(signature) && !readSignatures.has(signature);
      })
      .map(record => record.id),
  );
}

async function getReadSignatures(
  kind: ConsultingInboxKind,
): Promise<Set<string>> {
  try {
    const storedValue = await SecureStore.getItemAsync(getReadStateKey(kind));
    const parsed = storedValue ? (JSON.parse(storedValue) as unknown) : [];

    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}

async function setReadSignatures(
  kind: ConsultingInboxKind,
  signatures: Set<string>,
): Promise<void> {
  const next = Array.from(signatures).slice(-MAX_STORED_SIGNATURES);
  await SecureStore.setItemAsync(getReadStateKey(kind), JSON.stringify(next));
}

async function hasUnreadRecords(
  kind: ConsultingInboxKind,
  records: readonly ConsultingRecord[],
): Promise<boolean> {
  const signatures = getSignatures(kind, records);
  if (signatures.length === 0) {
    return false;
  }

  const readSignatures = await getReadSignatures(kind);
  return signatures.some(signature => !readSignatures.has(signature));
}

export async function getConsultingUnreadState(
  records: readonly ConsultingRecord[],
): Promise<ConsultingUnreadState> {
  const [notifications, messages] = await Promise.all([
    hasUnreadRecords('notifications', records),
    hasUnreadRecords('messages', records),
  ]);

  return {messages, notifications};
}

export async function markConsultingInboxRead(
  kind: ConsultingInboxKind,
  records: readonly ConsultingRecord[],
): Promise<void> {
  const signatures = getSignatures(kind, records);
  if (signatures.length === 0) {
    return;
  }

  try {
    const readSignatures = await getReadSignatures(kind);
    signatures.forEach(signature => readSignatures.add(signature));
    await setReadSignatures(kind, readSignatures);
    notifyReadStateChanged();
  } catch {
    // 읽음 상태 저장 실패는 화면 진입 자체를 막지 않는다.
  }
}

export async function clearConsultingReadState(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(getReadStateKey('messages')),
    SecureStore.deleteItemAsync(getReadStateKey('notifications')),
  ]);
  notifyReadStateChanged();
}
