import {StyleSheet, View as RNView} from 'react-native';
import {Bell, Check, MapPin, Video} from 'lucide-react-native';
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
} from '../mocks/consulting.mock';
import type {ConsultingBookingDraft, ConsultingExpert, ConsultingRecord} from '../types';

type ConsultingBookingCompleteScreenProps = {
  expert: ConsultingExpert;
  draft: ConsultingBookingDraft;
  record?: ConsultingRecord;
  onGoToConsultingHome: () => void;
  onPressHistory: () => void;
};

export function ConsultingBookingCompleteScreen({
  expert,
  draft,
  record,
  onGoToConsultingHome,
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
            운영팀이 프리랜서 일정을 확인한 뒤 알림과 톡으로 안내드려요.
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

        <View style={styles.infoCard}>
          <Bell color={consultingColors.roseStrong} size={17} />
            <Text style={styles.infoText}>
            신청 내역은 마이페이지 &gt; 내 상담에서 다시 볼 수 있어요.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <ModeIcon color={consultingColors.roseStrong} size={17} />
          <Text style={styles.infoText}>
            {sessionMode === 'offline'
              ? '오프라인 상담은 프리랜서가 장소와 준비 내용을 확인한 뒤 톡에서 세부 안내를 드려요.'
              : '온라인 상담은 프리랜서와 직접 정산과 일정을 맞춘 뒤 확정되면 대화방과 통화가 열려요.'}
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
        <PrimaryButton label="내 상담 내역 보기" onPress={onPressHistory} />
        <SecondaryButton label="컨설팅 홈으로" onPress={onGoToConsultingHome} />
      </ConsultingBottomBar>
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
