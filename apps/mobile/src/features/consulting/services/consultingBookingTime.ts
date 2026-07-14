import type {ConsultingBookingDay} from '../types';

const KOREA_TIME_OFFSET = '+09:00';

export function isConsultingSlotInFuture(
  dayId: string,
  slotId: string,
  now = Date.now(),
): boolean {
  const startsAt = Date.parse(`${dayId}T${slotId}:00${KOREA_TIME_OFFSET}`);
  return Number.isFinite(startsAt) && startsAt > now;
}

export function disablePastConsultingSlots(
  days: readonly ConsultingBookingDay[],
  now = Date.now(),
): readonly ConsultingBookingDay[] {
  return days.map(day => ({
    ...day,
    slots: day.slots.map(slot => ({
      ...slot,
      available:
        slot.available && isConsultingSlotInFuture(day.id, slot.id, now),
    })),
  }));
}
