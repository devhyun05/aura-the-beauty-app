import {useEffect, useMemo, useRef, useState} from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';
import {AlertCircle, Check, ChevronLeft, ChevronRight} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {FaceAnalysisSummaryCard} from '../../profile/components/FaceAnalysisSummaryCard';
import {
  consultingColors,
  consultingRadius,
  spacing,
  typography,
} from '../../../shared/theme';
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';
import {
  ConsultingBottomBar,
  ConsultingChip,
  ConsultingSectionTitle,
  PrimaryButton,
} from '../components/consultingComponents';
import {
  consultingConcerns,
} from '../mocks/consulting.mock';
import {
  getConsultingExpertSlots,
  getConsultingShareableReports,
} from '../services/consultingService';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {
  ConsultingBookingDay,
  ConsultingBookingDraft,
  ConsultingExpert,
  ConsultingPreferredContactMethod,
  ConsultingRecord,
  ConsultingTimeSlot,
} from '../types';

type ConsultingBookingScreenProps = {
  expert: ConsultingExpert;
  durationId: string;
  initialRecord?: ConsultingRecord | null;
  mode?: 'create' | 'edit';
  submitting?: boolean;
  onNext: (draft: ConsultingBookingDraft) => void;
};

type CalendarCell = {
  day?: ConsultingBookingDay;
  dayNumber?: number;
  id: string;
  inMonth: boolean;
  isAvailable: boolean;
};

type SlotPeriodId = 'morning' | 'afternoon' | 'evening';

const koreanWeekdays = ['일', '월', '화', '수', '목', '금', '토'] as const;
const slotPeriodLabels: Record<SlotPeriodId, string> = {
  morning: '오전',
  afternoon: '오후',
  evening: '저녁',
};
const bookingNoticeItems = [
  '예약 신청 후 운영팀이 프리랜서 일정과 가능 여부를 확인해요.',
  '확정 전까지는 앱에서 신청 내용을 수정하거나 취소할 수 있어요.',
  '확정 안내는 문자 또는 전화로만 보내드려요.',
  '앱 안에서는 결제하지 않으며, 비용 정산은 연결된 프리랜서와 직접 진행해요.',
  '프리랜서가 외부 정산과 일정을 확인한 뒤 웹에서 예약 확정을 눌러요.',
] as const;
const contactMethods: readonly {
  id: ConsultingPreferredContactMethod;
  label: string;
}[] = [
  {id: 'sms', label: '문자'},
  {id: 'call', label: '전화'},
];

export function ConsultingBookingScreen({
  expert,
  durationId,
  initialRecord,
  mode = 'create',
  submitting = false,
  onNext,
}: ConsultingBookingScreenProps) {
  const [days, setDays] = useState<readonly ConsultingBookingDay[]>([]);
  const [visibleMonthId, setVisibleMonthId] = useState<string | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const selectedDayIdRef = useRef<string | null>(null);
  const [selectedConcernId, setSelectedConcernId] = useState<string | null>(
    null,
  );
  const [shareableReports, setShareableReports] = useState<
    readonly FaceAnalysisReport[]
  >([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [selectedReportIds, setSelectedReportIds] = useState<readonly string[]>(
    [],
  );
  const [question, setQuestion] = useState('');
  const [contactName, setContactName] = useState(initialRecord?.contactName ?? '');
  const [contactPhone, setContactPhone] = useState(initialRecord?.contactPhone ?? '');
  const [preferredContactMethod, setPreferredContactMethod] =
    useState<ConsultingPreferredContactMethod>(
      initialRecord?.preferredContactMethod ?? 'sms',
    );
  const initialSharedReportKey = initialRecord?.sharedReportIds?.join('|') ?? '';

  useEffect(() => {
    let isMounted = true;

    getConsultingExpertSlots(expert.id, durationId).then(data => {
      if (!isMounted) {
        return;
      }

      const normalizedDays = initialRecord
        ? restoreCurrentSlotAvailability(data, initialRecord)
        : data;

      if (normalizedDays.length === 0) {
        setDays([]);
        setVisibleMonthId(null);
        setSelectedDayId(null);
        setSelectedSlotId(null);
        return;
      }

      const firstSelectableDay =
        normalizedDays.find(day => day.slots.some(slot => slot.available)) ??
        normalizedDays[0];
      const firstMonthId = getMonthId(firstSelectableDay.id);
      const previousDayId = selectedDayIdRef.current;
      const nextSelectedDayId =
        previousDayId && normalizedDays.some(day => day.id === previousDayId)
          ? previousDayId
          : initialRecord?.dayId ?? firstSelectableDay.id;
      const nextSelectedDay = normalizedDays.find(
        day => day.id === nextSelectedDayId,
      );

      setDays(normalizedDays);
      setVisibleMonthId(current =>
        current && normalizedDays.some(day => getMonthId(day.id) === current)
          ? current
          : firstMonthId,
      );
      setSelectedDayId(nextSelectedDayId);
      setSelectedSlotId(current => {
        const currentSlot = nextSelectedDay?.slots.find(
          slot => slot.id === current,
        );
        if (currentSlot?.available) {
          return current;
        }

        const initialSlot = nextSelectedDay?.slots.find(
          slot => slot.id === initialRecord?.slotId,
        );
        return initialSlot?.available ? initialRecord?.slotId ?? null : null;
      });
    });

    return () => {
      isMounted = false;
    };
  }, [durationId, expert.id, initialRecord]);

  useEffect(() => {
    selectedDayIdRef.current = selectedDayId;
  }, [selectedDayId]);

  useEffect(() => {
    if (!initialRecord) {
      return;
    }

    setContactName(initialRecord.contactName ?? '');
    setContactPhone(initialRecord.contactPhone ?? '');
    setPreferredContactMethod(initialRecord.preferredContactMethod ?? 'sms');
  }, [initialRecord]);

  useEffect(() => {
    let isMounted = true;

    setReportsLoading(true);
    getConsultingShareableReports()
      .then(reports => {
        if (!isMounted) {
          return;
        }

        const selectableIds = reports.map(report => report.id);

        setShareableReports(reports);
        setSelectedReportIds(() => {
          if (mode === 'edit') {
            const sharedIds = initialRecord?.sharedReportIds ?? [];
            return selectableIds.filter(id => sharedIds.includes(id));
          }

          return selectableIds;
        });
      })
      .catch(() => {
        if (isMounted) {
          setShareableReports([]);
          setSelectedReportIds([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setReportsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [initialRecord, initialSharedReportKey, mode]);

  const monthIds = useMemo(() => buildMonthIds(days), [days]);
  const activeMonthId = visibleMonthId ?? monthIds[0] ?? null;
  const selectedDay = useMemo(
    () => days.find(day => day.id === selectedDayId) ?? null,
    [days, selectedDayId],
  );
  const calendarCells = useMemo(
    () => (activeMonthId ? buildCalendarCells(days, activeMonthId) : []),
    [activeMonthId, days],
  );
  const activeMonthIndex = activeMonthId
    ? monthIds.indexOf(activeMonthId)
    : -1;
  const slotGroups = useMemo(
    () => buildSlotGroups(selectedDay?.slots ?? []),
    [selectedDay],
  );

  const canProceed = Boolean(
    selectedDay &&
      selectedSlotId &&
      contactName.trim() &&
      contactPhone.trim(),
  );
  const shareReports = selectedReportIds.length > 0;
  const primaryLabel =
    mode === 'edit' ? (submitting ? '수정 중' : '신청 수정') : '신청 내용 확인';

  const handleMonthStep = (offset: -1 | 1) => {
    if (activeMonthIndex < 0) {
      return;
    }
    const nextMonthId = monthIds[activeMonthIndex + offset];
    if (!nextMonthId) {
      return;
    }
    const firstSelectableDay =
      days.find(
        day =>
          getMonthId(day.id) === nextMonthId &&
          day.slots.some(slot => slot.available),
      ) ?? days.find(day => getMonthId(day.id) === nextMonthId);

    setVisibleMonthId(nextMonthId);
    setSelectedDayId(firstSelectableDay?.id ?? null);
    setSelectedSlotId(null);
  };

  const handleSelectDay = (day: ConsultingBookingDay) => {
    setSelectedDayId(day.id);
    setSelectedSlotId(null);
  };

  const toggleReport = (reportId: string) => {
    setSelectedReportIds(current =>
      current.includes(reportId)
        ? current.filter(id => id !== reportId)
        : [...current, reportId],
    );
  };

  const handleNext = () => {
    if (!selectedDay || !selectedSlotId) {
      return;
    }

    onNext({
      expertId: expert.id,
      durationId,
      dayId: selectedDay.id,
      slotId: selectedSlotId,
      concernId: selectedConcernId,
      shareReports,
      sharedReportIds: selectedReportIds,
      question: question.trim(),
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      preferredContactMethod,
    });
  };

  return (
    <RNView style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={spacing.md}>
        <View style={styles.section}>
          <RNView style={styles.sectionHeader}>
          <ConsultingSectionTitle>희망 날짜 선택</ConsultingSectionTitle>
            {activeMonthId ? (
              <Text style={styles.availableLabel}>
                신청 가능한 날짜만 선택할 수 있어요
              </Text>
            ) : null}
          </RNView>

          {activeMonthId ? (
            <View style={styles.calendarCard}>
              <RNView style={styles.monthHeader}>
                <Pressable
                  accessibilityLabel="이전 달"
                  accessibilityRole="button"
                  accessibilityState={{disabled: activeMonthIndex <= 0}}
                  disabled={activeMonthIndex <= 0}
                  onPress={() => handleMonthStep(-1)}
                  style={({pressed}) => [
                    styles.monthButton,
                    activeMonthIndex <= 0 && styles.monthButtonDisabled,
                    pressed && activeMonthIndex > 0 ? styles.pressed : null,
                  ]}>
                  <ChevronLeft color={consultingColors.textMuted} size={18} />
                </Pressable>
                <Text style={styles.monthTitle}>
                  {formatMonthTitle(activeMonthId)}
                </Text>
                <Pressable
                  accessibilityLabel="다음 달"
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: activeMonthIndex >= monthIds.length - 1,
                  }}
                  disabled={activeMonthIndex >= monthIds.length - 1}
                  onPress={() => handleMonthStep(1)}
                  style={({pressed}) => [
                    styles.monthButton,
                    activeMonthIndex >= monthIds.length - 1 &&
                      styles.monthButtonDisabled,
                    pressed && activeMonthIndex < monthIds.length - 1
                      ? styles.pressed
                      : null,
                  ]}>
                  <ChevronRight color={consultingColors.textMuted} size={18} />
                </Pressable>
              </RNView>

              <RNView style={styles.weekdayRow}>
                {koreanWeekdays.map(weekday => (
                  <Text key={weekday} style={styles.weekdayText}>
                    {weekday}
                  </Text>
                ))}
              </RNView>

              <RNView style={styles.calendarGrid}>
                {calendarCells.map(cell => {
                  const selected = cell.id === selectedDayId;
                  const disabled = !cell.day || !cell.isAvailable;
                  return (
                    <RNView key={cell.id} style={styles.calendarCell}>
                      {cell.inMonth ? (
                        <Pressable
                          accessibilityLabel={`${cell.dayNumber}일 예약 날짜`}
                          accessibilityRole="button"
                          accessibilityState={{disabled, selected}}
                          disabled={disabled}
                          onPress={() => {
                            if (cell.day) {
                              handleSelectDay(cell.day);
                            }
                          }}
                          style={({pressed}) => [
                            styles.calendarDate,
                            selected && styles.calendarDateSelected,
                            disabled && styles.calendarDateDisabled,
                            pressed && !disabled ? styles.pressed : null,
                          ]}>
                          <Text
                            style={[
                              styles.calendarDateText,
                              selected && styles.calendarDateTextSelected,
                              disabled && styles.calendarDateTextDisabled,
                            ]}>
                            {cell.dayNumber}
                          </Text>
                          {cell.isAvailable ? (
                            <RNView
                              style={[
                                styles.availableDot,
                                selected && styles.availableDotSelected,
                              ]}
                            />
                          ) : null}
                        </Pressable>
                      ) : (
                        <RNView style={styles.calendarDatePlaceholder} />
                      )}
                    </RNView>
                  );
                })}
              </RNView>
            </View>
          ) : (
            <View style={styles.emptySlots}>
              <Text style={styles.emptySlotsText}>
                등록된 예약 가능 날짜가 없어요.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>희망 시간 선택</ConsultingSectionTitle>
          {selectedDay ? (
            <View style={styles.timePanel}>
              <RNView style={styles.selectedDateRow}>
                <Text style={styles.selectedDateLabel}>
                  {formatDayTitle(selectedDay)}
                </Text>
                <Text style={styles.selectedDateMeta}>
                  {selectedDay.slots.filter(slot => slot.available).length}개 가능
                </Text>
              </RNView>
              {slotGroups.length > 0 ? (
                <View style={styles.slotGroupList}>
                  {slotGroups.map(group => (
                    <RNView key={group.id} style={styles.slotGroup}>
                      <Text style={styles.slotGroupTitle}>{group.label}</Text>
                      <RNView style={styles.timeGrid}>
                        {group.slots.map(slot => (
                          <TimeSlotButton
                            key={slot.id}
                            onPress={() => setSelectedSlotId(slot.id)}
                            selected={slot.id === selectedSlotId}
                            slot={slot}
                          />
                        ))}
                      </RNView>
                    </RNView>
                  ))}
                </View>
              ) : (
                <View style={styles.emptySlots}>
                  <Text style={styles.emptySlotsText}>
                    선택한 날짜에 가능한 시간이 없어요.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptySlots}>
              <Text style={styles.emptySlotsText}>
                날짜를 먼저 선택해 주세요.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>어떤 고민인가요?</ConsultingSectionTitle>
          <View style={styles.chipRow}>
            {consultingConcerns.map(concern => (
              <ConsultingChip
                key={concern.id}
                label={concern.label}
                onPress={() =>
                  setSelectedConcernId(current =>
                    current === concern.id ? null : concern.id,
                  )
                }
                selected={concern.id === selectedConcernId}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <RNView style={styles.sectionHeader}>
            <ConsultingSectionTitle>전달할 리포트</ConsultingSectionTitle>
            <Text style={styles.availableLabel}>
              {reportsLoading ? '불러오는 중' : `${selectedReportIds.length}개 선택`}
            </Text>
          </RNView>
          {reportsLoading ? (
            <View style={styles.reportEmptyCard}>
              <Text style={styles.reportEmptyTitle}>리포트를 불러오고 있어요</Text>
              <Text style={styles.reportEmptyText}>
                마이페이지의 분석 리포트와 같은 카드로 표시돼요.
              </Text>
            </View>
          ) : shareableReports.length > 0 ? (
            <View style={styles.reportList}>
              {shareableReports.map(report => (
                <ReportOption
                  key={report.id}
                  onPress={() => toggleReport(report.id)}
                  report={report}
                  selected={selectedReportIds.includes(report.id)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.reportEmptyCard}>
              <Text style={styles.reportEmptyTitle}>
                전달 가능한 리포트가 없어요
              </Text>
              <Text style={styles.reportEmptyText}>
                마이페이지에 저장된 실제 얼굴 분석 리포트가 있으면 상담 전에
                선택해서 보낼 수 있어요.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>사전 질문 (선택)</ConsultingSectionTitle>
          <TextInput
            multiline
            onChangeText={setQuestion}
            placeholder="상담 전에 미리 전달하고 싶은 내용을 적어주세요."
            placeholderTextColor={consultingColors.textSoft}
            style={styles.questionInput}
            value={question}
          />
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>확정 안내 연락처</ConsultingSectionTitle>
          <View style={styles.contactCard}>
            <TextInput
              onChangeText={setContactName}
              placeholder="이름"
              placeholderTextColor={consultingColors.textSoft}
              style={styles.contactInput}
              value={contactName}
            />
            <TextInput
              keyboardType="phone-pad"
              onChangeText={setContactPhone}
              placeholder="휴대폰 번호"
              placeholderTextColor={consultingColors.textSoft}
              style={styles.contactInput}
              value={contactPhone}
            />
            <View style={styles.contactMethodRow}>
              {contactMethods.map(method => (
                <ConsultingChip
                  key={method.id}
                  label={method.label}
                  onPress={() => setPreferredContactMethod(method.id)}
                  selected={preferredContactMethod === method.id}
                />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.noticeCard}>
          <RNView style={styles.noticeHeader}>
            <AlertCircle color={consultingColors.roseStrong} size={18} />
            <Text style={styles.noticeTitle}>신청 전 확인사항</Text>
          </RNView>
          <View style={styles.noticeList}>
            {bookingNoticeItems.map(item => (
              <RNView key={item} style={styles.noticeItem}>
                <RNView style={styles.noticeBullet} />
                <Text style={styles.noticeText}>{item}</Text>
              </RNView>
            ))}
          </View>
        </View>
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <PrimaryButton
          disabled={!canProceed || submitting}
          label={primaryLabel}
          onPress={handleNext}
        />
      </ConsultingBottomBar>
    </RNView>
  );
}

function TimeSlotButton({
  slot,
  selected,
  onPress,
}: {
  slot: ConsultingTimeSlot;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled: !slot.available, selected}}
      disabled={!slot.available}
      onPress={onPress}
      style={({pressed}) => [
        styles.timeButton,
        selected && styles.timeButtonSelected,
        !slot.available && styles.timeButtonDisabled,
        pressed && slot.available ? styles.pressed : null,
      ]}>
      <Text
        style={[
          styles.timeButtonText,
          selected && styles.timeButtonTextSelected,
          !slot.available && styles.timeButtonTextDisabled,
        ]}>
        {slot.label}
      </Text>
    </Pressable>
  );
}

function ReportOption({
  report,
  selected,
  onPress,
}: {
  report: FaceAnalysisReport;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <RNView style={[styles.reportOption, selected && styles.reportOptionSelected]}>
      <FaceAnalysisSummaryCard
        accessibilityLabel={`${report.title} 전달 리포트`}
        accessibilityRole="checkbox"
        accessibilityState={{checked: selected}}
        report={report}
        onPress={onPress}
      />
      <RNView
        pointerEvents="none"
        style={[styles.reportCheck, selected && styles.reportCheckSelected]}>
        {selected ? <Check color={consultingColors.onAccent} size={13} /> : null}
      </RNView>
    </RNView>
  );
}

function restoreCurrentSlotAvailability(
  days: readonly ConsultingBookingDay[],
  record: ConsultingRecord,
): readonly ConsultingBookingDay[] {
  if (!record.dayId || !record.slotId) {
    return days;
  }

  return days.map(day =>
    day.id === record.dayId
      ? {
          ...day,
          slots: day.slots.map(slot =>
            slot.id === record.slotId ? {...slot, available: true} : slot,
          ),
        }
      : day,
  );
}

function buildMonthIds(days: readonly ConsultingBookingDay[]): string[] {
  return Array.from(new Set(days.map(day => getMonthId(day.id)))).sort();
}

function buildCalendarCells(
  days: readonly ConsultingBookingDay[],
  monthId: string,
): CalendarCell[] {
  const month = parseMonthId(monthId);
  if (!month) {
    return [];
  }

  const dayById = new Map(days.map(day => [day.id, day]));
  const firstDate = new Date(month.year, month.monthIndex, 1);
  const leadingBlankCount = firstDate.getDay();
  const daysInMonth = new Date(month.year, month.monthIndex + 1, 0).getDate();
  const cellCount =
    Math.ceil((leadingBlankCount + daysInMonth) / koreanWeekdays.length) *
    koreanWeekdays.length;

  return Array.from({length: cellCount}, (_, index) => {
    const dayNumber = index - leadingBlankCount + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      return {
        id: `${monthId}-blank-${index}`,
        inMonth: false,
        isAvailable: false,
      };
    }

    const dayId = `${monthId}-${String(dayNumber).padStart(2, '0')}`;
    const day = dayById.get(dayId);
    return {
      day,
      dayNumber,
      id: dayId,
      inMonth: true,
      isAvailable: Boolean(day?.slots.some(slot => slot.available)),
    };
  });
}

function buildSlotGroups(slots: readonly ConsultingTimeSlot[]) {
  const periods: readonly SlotPeriodId[] = ['morning', 'afternoon', 'evening'];
  return periods
    .map(period => ({
      id: period,
      label: slotPeriodLabels[period],
      slots: slots.filter(slot => getSlotPeriod(slot.label) === period),
    }))
    .filter(group => group.slots.length > 0);
}

function getMonthId(dayId: string): string {
  return dayId.slice(0, 7);
}

function parseMonthId(monthId: string): {year: number; monthIndex: number} | null {
  const [yearText, monthText] = monthId.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return null;
  }
  return {year, monthIndex: month - 1};
}

function formatMonthTitle(monthId: string): string {
  const month = parseMonthId(monthId);
  if (!month) {
    return monthId;
  }
  return `${month.year}년 ${month.monthIndex + 1}월`;
}

function formatDayTitle(day: ConsultingBookingDay): string {
  const [yearText, monthText, dayText] = day.id.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const date = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(date)) {
    return `${day.day}일 (${day.weekday})`;
  }

  const weekday = koreanWeekdays[new Date(year, month - 1, date).getDay()];
  return `${month}월 ${date}일 (${weekday})`;
}

function getSlotPeriod(label: string): SlotPeriodId {
  const hour = Number(label.slice(0, 2));
  if (Number.isNaN(hour)) {
    return 'afternoon';
  }
  if (hour < 12) {
    return 'morning';
  }
  if (hour < 18) {
    return 'afternoon';
  }
  return 'evening';
}

const styles = StyleSheet.create({
  availableDot: {
    backgroundColor: consultingColors.roseStrong,
    borderRadius: 999,
    height: 4,
    marginTop: 3,
    width: 4,
  },
  availableDotSelected: {
    backgroundColor: consultingColors.onAccent,
  },
  availableLabel: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  calendarCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: 14,
  },
  calendarCell: {
    alignItems: 'center',
    width: '14.2857%',
  },
  calendarDate: {
    alignItems: 'center',
    borderRadius: consultingRadius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  calendarDateDisabled: {
    opacity: 0.32,
  },
  calendarDatePlaceholder: {
    height: 42,
    width: 42,
  },
  calendarDateSelected: {
    backgroundColor: consultingColors.accent,
  },
  calendarDateText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  calendarDateTextDisabled: {
    color: consultingColors.textSoft,
  },
  calendarDateTextSelected: {
    color: consultingColors.onAccent,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  emptySlots: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  emptySlotsText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  knobOff: {
    alignSelf: 'flex-start',
  },
  knobOn: {
    alignSelf: 'flex-end',
  },
  monthButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  monthButtonDisabled: {
    opacity: 0.35,
  },
  monthHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  contactCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: 14,
  },
  contactInput: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    color: consultingColors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    minHeight: 44,
    paddingHorizontal: 13,
  },
  contactMethodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: 4,
  },
  noticeBullet: {
    backgroundColor: consultingColors.roseStrong,
    borderRadius: 999,
    height: 4,
    marginTop: 8,
    width: 4,
  },
  noticeCard: {
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.card,
    gap: spacing.md,
    padding: 16,
  },
  noticeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  noticeItem: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  noticeList: {
    gap: 7,
  },
  noticeText: {
    color: consultingColors.roseText,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  noticeTitle: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  pressed: {
    opacity: 0.85,
  },
  questionInput: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    color: consultingColors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    minHeight: 96,
    padding: 14,
    textAlignVertical: 'top',
  },
  root: {
    backgroundColor: consultingColors.background,
    flex: 1,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  selectedDateLabel: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  selectedDateMeta: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  selectedDateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reportCheck: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 14,
    top: 14,
    width: 24,
    zIndex: 2,
  },
  reportCheckSelected: {
    backgroundColor: consultingColors.accent,
    borderColor: consultingColors.accent,
  },
  reportEmptyCard: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  reportEmptyText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  reportEmptyTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  reportList: {
    gap: spacing.sm,
  },
  reportOption: {
    borderColor: 'transparent',
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 2,
    position: 'relative',
  },
  reportOptionSelected: {
    borderColor: consultingColors.accent,
  },
  slotGroup: {
    gap: spacing.sm,
  },
  slotGroupList: {
    gap: spacing.lg,
  },
  slotGroupTitle: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  timeButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexBasis: '31.5%',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 10,
  },
  timeButtonDisabled: {
    backgroundColor: consultingColors.surfaceMuted,
    opacity: 0.42,
  },
  timeButtonSelected: {
    backgroundColor: consultingColors.accent,
    borderColor: consultingColors.accent,
  },
  timeButtonText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  timeButtonTextDisabled: {
    color: consultingColors.textSoft,
    textDecorationLine: 'line-through',
  },
  timeButtonTextSelected: {
    color: consultingColors.onAccent,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  timePanel: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.lg,
    padding: 16,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayText: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
    width: '14.2857%',
  },
});
