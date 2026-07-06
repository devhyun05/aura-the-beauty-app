import {StyleSheet, View as RNView} from 'react-native';
import {Bell, Check, Video} from 'lucide-react-native';
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
  formatConsultingSlotLabel,
} from '../mocks/consulting.mock';
import type {ConsultingBookingDraft, ConsultingExpert} from '../types';

type ConsultingBookingCompleteScreenProps = {
  expert: ConsultingExpert;
  draft: ConsultingBookingDraft;
  onEnterCall: () => void;
  onGoToConsultingHome: () => void;
};

export function ConsultingBookingCompleteScreen({
  expert,
  draft,
  onEnterCall,
  onGoToConsultingHome,
}: ConsultingBookingCompleteScreenProps) {
  const duration = findConsultingDuration(expert, draft.durationId);
  const slotLabel = formatConsultingSlotLabel(draft.dayId, draft.slotId);

  return (
    <RNView style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={spacing.md}>
        <View style={styles.hero}>
          <RNView style={styles.checkCircle}>
            <Check color={consultingColors.roseText} size={26} />
          </RNView>
          <Text style={styles.title}>예약이 완료됐어요</Text>
          <Text style={styles.subtitle}>
            상담 10분 전에 입장 알림을 보내드릴게요.
          </Text>
        </View>

        <View style={styles.bookingCard}>
          <ExpertAvatar expert={expert} size={44} />
          <RNView style={styles.bookingText}>
            <Text style={styles.bookingTitle}>
              {expert.name} · 화상 {duration.label}
            </Text>
            <Text style={styles.bookingMeta}>{slotLabel}</Text>
          </RNView>
        </View>

        <View style={styles.infoCard}>
          <Bell color={consultingColors.roseStrong} size={17} />
          <Text style={styles.infoText}>
            예약 내역과 입장 링크는 마이페이지 &gt; 내 상담에서 다시 볼 수 있어요.
          </Text>
        </View>

        {draft.shareReports ? (
          <View style={styles.infoCard}>
            <Video color={consultingColors.roseStrong} size={17} />
            <Text style={styles.infoText}>
              전달한 AI 리포트가 전문가에게 미리 공유돼요. 짧은 시간에 바로 본론부터
              시작할 수 있어요.
            </Text>
          </View>
        ) : null}
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <PrimaryButton label="상담 입장하기 (미리보기)" onPress={onEnterCall} />
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
