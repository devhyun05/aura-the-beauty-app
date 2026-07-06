import {useState, type ReactNode} from 'react';
import {Pressable, StyleSheet, View as RNView} from 'react-native';
import {BadgePercent, CalendarHeart, Check, Crown, Sparkles} from 'lucide-react-native';
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
  PrimaryButton,
} from '../components/consultingComponents';
import {
  consultingMembershipPlans,
  formatConsultingPrice,
} from '../mocks/consulting.mock';
import type {ConsultingMembershipPlan} from '../types';

type ConsultingMembershipScreenProps = {
  onSubscribe: (planId: string) => void;
};

export function ConsultingMembershipScreen({
  onSubscribe,
}: ConsultingMembershipScreenProps) {
  const defaultPlan =
    consultingMembershipPlans.find(plan => plan.highlight) ??
    consultingMembershipPlans[0];
  const [selectedPlanId, setSelectedPlanId] = useState(defaultPlan.id);
  const selectedPlan =
    consultingMembershipPlans.find(plan => plan.id === selectedPlanId) ??
    defaultPlan;

  return (
    <RNView style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={spacing.md} contentGap={spacing.xl}>
        <View style={styles.hero}>
          <RNView style={styles.heroIcon}>
            <Crown color={consultingColors.goldText} size={22} />
          </RNView>
          <Text style={styles.heroTitle}>AURA 멤버십</Text>
          <Text style={styles.heroSubtitle}>
            매달 나를 돌보는 가장 확실한 방법.{'\n'}상시 할인과 정기 체크인으로
            뷰티 루틴을 완성하세요.
          </Text>
        </View>

        <View style={styles.benefitRow}>
          <BenefitCell
            icon={<BadgePercent color={consultingColors.goldText} size={17} />}
            label="상담 상시 할인"
          />
          <BenefitCell
            icon={<CalendarHeart color={consultingColors.goldText} size={17} />}
            label="월 정기 체크인"
          />
          <BenefitCell
            icon={<Sparkles color={consultingColors.goldText} size={17} />}
            label="샘플 · 리포트"
          />
        </View>

        <View style={styles.planList}>
          {consultingMembershipPlans.map(plan => (
            <PlanCard
              key={plan.id}
              onPress={() => setSelectedPlanId(plan.id)}
              plan={plan}
              selected={plan.id === selectedPlanId}
            />
          ))}
        </View>

        <Text style={styles.footnote}>
          첫 달은 언제든 전액 환불할 수 있어요. 결제일 기준 매월 자동 갱신되며,
          해지는 마이페이지에서 바로 가능해요.
        </Text>
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <PrimaryButton
          label={`월 ${formatConsultingPrice(selectedPlan.pricePerMonth)}로 시작하기`}
          onPress={() => onSubscribe(selectedPlan.id)}
        />
      </ConsultingBottomBar>
    </RNView>
  );
}

function BenefitCell({icon, label}: {icon: ReactNode; label: string}) {
  return (
    <RNView style={styles.benefitCell}>
      {icon}
      <Text numberOfLines={1} style={styles.benefitLabel}>
        {label}
      </Text>
    </RNView>
  );
}

function PlanCard({
  plan,
  selected,
  onPress,
}: {
  plan: ConsultingMembershipPlan;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{selected}}
      onPress={onPress}
      style={({pressed}) => [
        styles.planCard,
        selected && styles.planCardSelected,
        pressed ? styles.pressed : null,
      ]}>
      {plan.badge ? (
        <RNView style={styles.planBadge}>
          <Text style={styles.planBadgeText}>{plan.badge}</Text>
        </RNView>
      ) : null}
      <RNView style={styles.planHeader}>
        <RNView style={styles.planTitleGroup}>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text numberOfLines={1} style={styles.planTagline}>
            {plan.tagline}
          </Text>
        </RNView>
        <RNView style={styles.planPriceGroup}>
          {plan.originalPricePerMonth ? (
            <Text style={styles.planOriginalPrice}>
              {formatConsultingPrice(plan.originalPricePerMonth)}
            </Text>
          ) : null}
          <Text style={styles.planPrice}>
            월 {formatConsultingPrice(plan.pricePerMonth)}
          </Text>
        </RNView>
      </RNView>
      <RNView style={styles.planBenefits}>
        {plan.benefits.map(benefit => (
          <RNView key={benefit} style={styles.planBenefitRow}>
            <Check color={consultingColors.goldText} size={14} />
            <Text style={styles.planBenefitText}>{benefit}</Text>
          </RNView>
        ))}
      </RNView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  benefitCell: {
    alignItems: 'center',
    backgroundColor: consultingColors.goldSoft,
    borderRadius: consultingRadius.card,
    flex: 1,
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 14,
  },
  benefitLabel: {
    color: consultingColors.goldText,
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
  },
  benefitRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  footnote: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: 17,
    textAlign: 'center',
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.goldSoft,
    borderRadius: consultingRadius.pill,
    height: 52,
    justifyContent: 'center',
    marginBottom: 12,
    width: 52,
  },
  heroSubtitle: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: 8,
    textAlign: 'center',
  },
  heroTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  planBadge: {
    alignSelf: 'flex-start',
    backgroundColor: consultingColors.goldSoft,
    borderRadius: consultingRadius.pill,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  planBadgeText: {
    color: consultingColors.goldText,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
  },
  planBenefitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  planBenefitText: {
    color: consultingColors.text,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  planBenefits: {
    borderTopColor: consultingColors.borderSoft,
    borderTopWidth: 1,
    gap: spacing.sm,
    marginTop: 12,
    paddingTop: 12,
  },
  planCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    padding: 18,
  },
  planCardSelected: {
    borderColor: consultingColors.accent,
    borderWidth: 2,
  },
  planHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  planList: {
    gap: spacing.md,
  },
  planName: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  planOriginalPrice: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    textDecorationLine: 'line-through',
  },
  planPrice: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  planPriceGroup: {
    alignItems: 'flex-end',
  },
  planTagline: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  planTitleGroup: {
    flex: 1,
    paddingRight: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
  root: {
    backgroundColor: consultingColors.background,
    flex: 1,
  },
});
