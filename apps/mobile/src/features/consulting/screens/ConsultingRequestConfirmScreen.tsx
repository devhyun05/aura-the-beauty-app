import {StyleSheet, View as RNView} from 'react-native';
import type {ReactNode} from 'react';
import {Bell, CalendarClock, FileText, MessageCircle, Phone} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {
  consultingColors,
  consultingRadius,
  spacing,
  typography,
} from '../../../shared/theme';
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';
import {
  ConsultingBottomBar,
  ConsultingSectionTitle,
  ExpertAvatar,
  PrimaryButton,
} from '../components/consultingComponents';
import {
  findConsultingDuration,
  formatConsultingPrice,
  formatConsultingSlotLabel,
} from '../mocks/consulting.mock';
import type {ConsultingBookingDraft, ConsultingExpert} from '../types';

type ConsultingRequestConfirmScreenProps = {
  expert: ConsultingExpert;
  draft: ConsultingBookingDraft;
  onSubmit: () => void;
  submitting?: boolean;
};

const contactLabels = {
  sms: '문자',
  call: '전화',
} as const;

export function ConsultingRequestConfirmScreen({
  expert,
  draft,
  onSubmit,
  submitting = false,
}: ConsultingRequestConfirmScreenProps) {
  const duration = findConsultingDuration(expert, draft.durationId);
  const slotLabel = formatConsultingSlotLabel(draft.dayId, draft.slotId);

  return (
    <RNView style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={spacing.md} contentGap={spacing.xl}>
        <View style={styles.summaryCard}>
          <ExpertAvatar expert={expert} size={44} />
          <RNView style={styles.summaryText}>
            <Text numberOfLines={1} style={styles.summaryTitle}>
              {expert.name} · 온라인 컨설팅 {duration.label}
            </Text>
            <Text numberOfLines={1} style={styles.summaryMeta}>
              {slotLabel}
            </Text>
          </RNView>
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>신청 내용</ConsultingSectionTitle>
          <View style={styles.detailCard}>
            <DetailRow
              icon={<CalendarClock color={consultingColors.roseStrong} size={17} />}
              label="희망 일정"
              value={slotLabel}
            />
            <DetailRow
              icon={<MessageCircle color={consultingColors.roseStrong} size={17} />}
              label="상담 시간"
              value={`${duration.label} · 표시용 예상가 ${formatConsultingPrice(duration.price)}`}
            />
            <DetailRow
              icon={<FileText color={consultingColors.roseStrong} size={17} />}
              label="전달 리포트"
              value={draft.sharedReportIds.length > 0 ? `${draft.sharedReportIds.length}개` : '없음'}
            />
            <DetailRow
              icon={<Phone color={consultingColors.roseStrong} size={17} />}
              label="연락처"
              value={`${draft.contactName} · ${draft.contactPhone} · ${contactLabels[draft.preferredContactMethod]}`}
            />
          </View>
        </View>

        {draft.question ? (
          <View style={styles.section}>
            <ConsultingSectionTitle>사전 질문</ConsultingSectionTitle>
            <View style={styles.questionCard}>
              <Text style={styles.questionText}>{draft.question}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.noticeCard}>
          <Bell color={consultingColors.roseStrong} size={18} />
          <Text style={styles.noticeText}>
            신청 후 운영팀이 프리랜서 일정과 가능 여부를 확인해요. 앱에서는 결제하지 않고, 프리랜서가 외부 정산과 일정을 확인한 뒤 웹에서 예약 확정을 눌러요.
          </Text>
        </View>
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <PrimaryButton
          disabled={submitting}
          label={submitting ? '신청 접수 중' : '예약 신청 접수하기'}
          onPress={onSubmit}
        />
      </ConsultingBottomBar>
    </RNView>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <RNView style={styles.detailRow}>
      <RNView style={styles.detailIcon}>{icon}</RNView>
      <RNView style={styles.detailBody}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </RNView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  detailBody: {
    flex: 1,
    gap: 2,
  },
  detailCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: 16,
  },
  detailIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  detailLabel: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  detailValue: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  noticeCard: {
    alignItems: 'flex-start',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: 16,
  },
  noticeText: {
    color: consultingColors.textMuted,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  questionCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    padding: 16,
  },
  questionText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.md,
  },
  root: {
    backgroundColor: consultingColors.background,
    flex: 1,
  },
  section: {
    gap: spacing.md,
  },
  summaryCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    flexDirection: 'row',
    gap: spacing.md,
    padding: 16,
  },
  summaryMeta: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  summaryText: {
    flex: 1,
  },
  summaryTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
