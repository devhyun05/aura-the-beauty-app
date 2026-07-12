import {StyleSheet, View as RNView} from 'react-native';
import {
  CalendarCheck,
  Check,
  CreditCard,
  MapPin,
  MessageCircle,
  Video,
} from 'lucide-react-native';
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
  ExpertAvatar,
  PrimaryButton,
  SecondaryButton,
} from '../components/consultingComponents';
import {
  findConsultingDuration,
  formatConsultingPrice,
  formatConsultingSlotLabel,
  getConsultingDurationPrice,
  getConsultingSessionModeLabel,
} from '../consultingCatalog';
import type {ConsultingBookingDraft, ConsultingExpert, ConsultingRecord} from '../types';

type ConsultingBookingCompleteScreenProps = {
  expert: ConsultingExpert;
  draft: ConsultingBookingDraft;
  record?: ConsultingRecord;
  onPressConversation: () => void;
  onPressHistory: () => void;
};

export function ConsultingBookingCompleteScreen({
  expert,
  draft,
  record,
  onPressConversation,
  onPressHistory,
}: ConsultingBookingCompleteScreenProps) {
  const duration = findConsultingDuration(expert, draft.durationId);
  const slotLabel = record?.dateLabel ?? formatConsultingSlotLabel(draft.dayId, draft.slotId);
  const durationLabel = record?.durationLabel ?? duration.label;
  const sessionMode = record?.sessionMode ?? draft.sessionMode ?? 'online';
  const sessionModeLabel = getConsultingSessionModeLabel(sessionMode);
  const estimatedPrice =
    record?.estimatedPrice ??
    draft.estimatedPrice ??
    getConsultingDurationPrice(duration, sessionMode);
  const ModeIcon = sessionMode === 'offline' ? MapPin : Video;

  return (
    <RNView style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={spacing.md}>
        <View style={styles.hero}>
          <RNView style={styles.checkCircle}>
            <Check color={consultingColors.roseText} size={26} />
          </RNView>
          <Text style={styles.title}>예약 신청이 접수됐어요</Text>
          <Text style={styles.subtitle}>
            아직 예약이 확정된 것은 아니에요.
          </Text>
        </View>

        <View style={styles.bookingCard}>
          <ExpertAvatar expert={expert} size={44} />
          <RNView style={styles.bookingText}>
            <Text style={styles.bookingTitle}>
              {expert.name} · {sessionModeLabel} {durationLabel}
            </Text>
            <Text style={styles.bookingMeta}>
              {slotLabel} · 예상가 {formatConsultingPrice(estimatedPrice)}
            </Text>
          </RNView>
        </View>

        <View style={styles.pendingCard}>
          <Text style={styles.pendingLabel}>현재 상태 · 신청 접수</Text>
          <Text style={styles.pendingTitle}>입금 확인 후 최종 예약이 확정돼요</Text>
          <Text style={styles.pendingDescription}>
            전문가가 문자 또는 톡으로 일정과 입금 방법을 안내해 드려요. 안내받은
            계좌로 입금한 뒤 전문가가 확인하면 예약 확정 알림이 도착해요.
          </Text>
        </View>

        <View style={styles.flowCard}>
          <Text style={styles.flowTitle}>예약 확정까지 이렇게 진행돼요</Text>
          <FlowStep icon={MessageCircle} number="1" text="전문가가 문자 또는 톡으로 연락해요" />
          <FlowStep icon={CreditCard} number="2" text="안내받은 방법으로 입금해요" />
          <FlowStep icon={CalendarCheck} number="3" text="입금 확인 후 예약이 최종 확정돼요" />
        </View>

        <View style={styles.infoCard}>
          <ModeIcon color={consultingColors.roseStrong} size={17} />
          <Text style={styles.infoText}>
            {sessionMode === 'offline'
              ? '확정 후 전문가가 상담 장소와 준비 내용을 안내해 드려요.'
              : '확정 후 대화방에서 화상 상담 버튼을 이용할 수 있어요.'}
          </Text>
        </View>

        {draft.sharedReportIds.length > 0 ? (
          <View style={styles.infoCard}>
            <Video color={consultingColors.roseStrong} size={17} />
            <Text style={styles.infoText}>
              선택한 AI 리포트 {draft.sharedReportIds.length}개가 전문가에게 미리
              공유돼요. 짧은 시간에 바로 본론부터 시작할 수 있어요.
            </Text>
          </View>
        ) : null}
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <PrimaryButton label="전문가 톡 확인하기" onPress={onPressConversation} />
        <SecondaryButton label="내 상담 내역 보기" onPress={onPressHistory} />
      </ConsultingBottomBar>
    </RNView>
  );
}

function FlowStep({
  icon: Icon,
  number,
  text,
}: {
  icon: typeof MessageCircle;
  number: string;
  text: string;
}) {
  return (
    <RNView style={styles.flowStep}>
      <RNView style={styles.flowIcon}>
        <Icon color={consultingColors.roseStrong} size={17} />
      </RNView>
      <Text style={styles.flowNumber}>{number}</Text>
      <Text style={styles.flowText}>{text}</Text>
    </RNView>
  );
}

const styles = StyleSheet.create({
  bookingCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    flexDirection: 'row',
    gap: spacing.md,
    padding: 16,
  },
  bookingMeta: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  bookingText: {
    flex: 1,
  },
  bookingTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  checkCircle: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    height: 56,
    justifyContent: 'center',
    marginBottom: 14,
    width: 56,
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  flowCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: 16,
  },
  flowIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  flowNumber: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  flowStep: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flowText: {
    color: consultingColors.text,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
  },
  flowTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  infoCard: {
    alignItems: 'flex-start',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: 16,
  },
  infoText: {
    color: consultingColors.textMuted,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  pendingCard: {
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.card,
    gap: 6,
    padding: 16,
  },
  pendingDescription: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  pendingLabel: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  pendingTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  root: {
    backgroundColor: consultingColors.background,
    flex: 1,
  },
  subtitle: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    marginTop: 6,
    textAlign: 'center',
  },
  title: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
});
