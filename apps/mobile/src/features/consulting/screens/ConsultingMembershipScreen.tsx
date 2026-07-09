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
import {consultingMembershipPlans} from '../mocks/consulting.mock';
import type {ConsultingMembershipPlan} from '../types';

type ConsultingMembershipScreenProps = {
  onSubscribe: (planId: string) => void;
};

export function ConsultingMembershipScreen({
  onSubscribe,
}: ConsultingMembershipScreenProps) {
  const plans: readonly ConsultingMembershipPlan[] = consultingMembershipPlans;

  const defaultPlan = plans.find(plan => plan.highlight) ?? plans[0];
  const [selectedPlanId, setSelectedPlanId] = useState(defaultPlan.id);
  const selectedPlan =
    plans.find(plan => plan.id === selectedPlanId) ?? defaultPlan;

  return (
    <RNView style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={spacing.md} contentGap={spacing.xl}>
        <View style={styles.hero}>
          <RNView style={styles.heroIcon}>
            <Crown color={consultingColors.goldText} size={22} />
          </RNView>
          <Text style={styles.heroTitle}>멤버십 준비 중</Text>
          <Text style={styles.heroSubtitle}>
            사업자 등록과 결제 정책을 준비한 뒤 다시 열 예정이에요.{'\n'}현재 MVP에서는 예약 신청만 운영합니다.
          </Text>
        </View>

        <View style={styles.benefitRow}>
          <BenefitCell
            icon={<BadgePercent color={consultingColors.goldText} size={17} />}
            label="혜택 검토"
          />
          <BenefitCell
            icon={<CalendarHeart color={consultingColors.goldText} size={17} />}
            label="정기 체크인"
          />
          <BenefitCell
            icon={<Sparkles color={consultingColors.goldText} size={17} />}
            label="리포트 연계"
          />
        </View>

        <View style={styles.planList}>
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              onPress={() => setSelectedPlanId(plan.id)}
              plan={plan}
              selected={plan.id === selectedPlanId}
            />
          ))}
        </View>

        <Text style={styles.footnote}>
          결제, 자동 갱신, 할인 혜택은 이번 MVP에 포함하지 않아요.
        </Text>
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <PrimaryButton
          label="준비 중"
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
          <Text style={styles.planPrice}>
            출시 검토 중
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
