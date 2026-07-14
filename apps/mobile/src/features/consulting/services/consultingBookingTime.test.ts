import {
  disablePastConsultingSlots,
  isConsultingSlotInFuture,
} from './consultingBookingTime';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const now = Date.parse('2026-07-13T10:15:00+09:00');

expectEqual(
  isConsultingSlotInFuture('2026-07-13', '10:00', now),
  false,
  'past slot',
);
expectEqual(
  isConsultingSlotInFuture('2026-07-13', '10:30', now),
  true,
  'future slot today',
);
expectEqual(
  isConsultingSlotInFuture('2026-07-14', '09:00', now),
  true,
  'future slot tomorrow',
);

const [day] = disablePastConsultingSlots(
  [
    {
      id: '2026-07-13',
      weekday: '월',
      day: 13,
      slots: [
        {id: '10:00', label: '10:00', available: true},
        {id: '10:30', label: '10:30', available: true},
        {id: '11:00', label: '11:00', available: false},
      ],
    },
  ],
  now,
);

expectEqual(day.slots[0]?.available, false, 'past slot disabled');
expectEqual(day.slots[1]?.available, true, 'future slot stays available');
expectEqual(day.slots[2]?.available, false, 'server-disabled slot stays disabled');
