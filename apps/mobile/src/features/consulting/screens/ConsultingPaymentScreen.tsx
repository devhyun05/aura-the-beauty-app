import {useMemo, useState} from 'react';
import {Pressable, StyleSheet, View as RNView} from 'react-native';
import {
  Check,
  CreditCard,
  Crown,
  MessageCircle,
  ShieldCheck,
  Ticket,
  Wallet,
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
  ConsultingSectionTitle,
  ExpertAvatar,
  PrimaryButton,
} from '../components/consultingComponents';
import {
  findConsultingDuration,
  formatConsultingPrice,
  formatConsultingSlotLabel,
} from '../mocks/consulting.mock';
import type {
  ConsultingBookingDraft,
  ConsultingExpert,
  ConsultingPurchaseOptionId,
} from '../types';

const FIRST_SESSION_COUPON_RATE = 0.2;
const PACKAGE_DISCOUNT_RATE = 0.15;
const MEMBERSHIP_FIRST_MONTH_PRICE = 14900;
const MEMBERSHIP_SESSION_DISCOUNT_RATE = 0.2;

type PaymentMethodId = 'card' | 'kakao' | 'naver';

const paymentMethods: readonly {
  id: PaymentMethodId;
  label: string;
  icon: 'card' | 'kakao' | 'naver';
}[] = [
  {id: 'card', label: '신용 · 체크카드', icon: 'card'},
  {id: 'kakao', label: '카카오페이', icon: 'kakao'},
  {id: 'naver', label: '네이버페이', icon: 'naver'},
];

type ConsultingPaymentScreenProps = {
  expert: ConsultingExpert;
  draft: ConsultingBookingDraft;
  onPay: () => void;
  onPressMembershipDetail: () => void;
};

export function ConsultingPaymentScreen({
  expert,
  draft,
  onPay,
  onPressMembershipDetail,
}: ConsultingPaymentScreenProps) {
  const [purchaseOption, setPurchaseOption] =
    useState<ConsultingPurchaseOptionId>('single');
  const [couponApplied, setCouponApplied] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>('card');

  const duration = findConsultingDuration(expert, draft.durationId);
  const slotLabel = formatConsultingSlotLabel(draft.dayId, draft.slotId);

  const pricing = useMemo(() => {
    const basePrice = duration.price;

    if (purchaseOption === 'package3') {
      const packageTotal = Math.round(basePrice * 3 * (1 - PACKAGE_DISCOUNT_RATE));
      return {
        label: `3회 패키지 (회당 ${formatConsultingPrice(Math.round(packageTotal / 3))})`,
        original: basePrice * 3,
        discountLabel: `패키지 ${Math.round(PACKAGE_DISCOUNT_RATE * 100)}% 할인`,
        discount: basePrice * 3 - packageTotal,
        total: packageTotal,
        couponUsable: false,
      };
    }

    if (purchaseOption === 'membership') {
      const discountedSession = Math.round(
        basePrice * (1 - MEMBERSHIP_SESSION_DISCOUNT_RATE),
      );
      return {
        label: '멤버십 첫 달 + 이번 상담',
        original: basePrice + MEMBERSHIP_FIRST_MONTH_PRICE,
        discountLabel: `멤버십 상담 ${Math.round(MEMBERSHIP_SESSION_DISCOUNT_RATE * 100)}% 할인`,
        discount: basePrice - discountedSession,
        total: discountedSession + MEMBERSHIP_FIRST_MONTH_PRICE,
        couponUsable: false,
      };
    }

    const couponDiscount = couponApplied
      ? Math.round(basePrice * FIRST_SESSION_COUPON_RATE)
      : 0;
    return {
      label: `1회 상담 (${duration.label})`,
      original: basePrice,
      discountLabel: `첫 상담 ${Math.round(FIRST_SESSION_COUPON_RATE * 100)}% 쿠폰`,
      discount: couponDiscount,
      total: basePrice - couponDiscount,
      couponUsable: true,
    };
  }, [couponApplied, duration.label, duration.price, purchaseOption]);

  return (
    <RNView style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={spacing.md} contentGap={spacing.xl}>
        <View style={styles.summaryCard}>
          <ExpertAvatar expert={expert} size={44} />
          <RNView style={styles.summaryText}>
            <Text numberOfLines={1} style={styles.summaryTitle}>
              {expert.name} · 화상 {duration.label}
            </Text>
            <Text numberOfLines={1} style={styles.summaryMeta}>
              {slotLabel}
            </Text>
          </RNView>
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>이용권 선택</ConsultingSectionTitle>

          <PurchaseOptionCard
            description={`이번 상담 1회 · ${formatConsultingPrice(duration.price)}`}
            label={`1회 상담 (${duration.label})`}
            onPress={() => setPurchaseOption('single')}
            selected={purchaseOption === 'single'}
          />
          <PurchaseOptionCard
            badge={`${Math.round(PACKAGE_DISCOUNT_RATE * 100)}% 할인`}
            description={`같은 전문가와 3회 · 3개월 내 사용 · ${formatConsultingPrice(
              Math.round(duration.price * 3 * (1 - PACKAGE_DISCOUNT_RATE)),
            )}`}
            label="3회 패키지"
            onPress={() => setPurchaseOption('package3')}
            selected={purchaseOption === 'package3'}
          />
          <PurchaseOptionCard
            badge="첫 달 혜택"
            description={`월 ${formatConsultingPrice(
              MEMBERSHIP_FIRST_MONTH_PRICE,
            )} · 모든 상담 20% 상시 할인 + 월 1회 체크인`}
            gold
            label="AURA 멤버십과 함께"
            onPress={() => setPurchaseOption('membership')}
            selected={purchaseOption === 'membership'}
          />

          {purchaseOption === 'membership' ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={6}
              onPress={onPressMembershipDetail}
              style={({pressed}) => [pressed ? styles.pressed : null]}>
              <Text style={styles.membershipDetailLink}>
                멤버십 플랜 자세히 보기
              </Text>
            </Pressable>
          ) : null}
        </View>

        {pricing.couponUsable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{selected: couponApplied}}
            onPress={() => setCouponApplied(current => !current)}
            style={({pressed}) => [
              styles.couponRow,
              pressed ? styles.pressed : null,
            ]}>
            <RNView style={styles.couponLabel}>
              <Ticket color={consultingColors.roseStrong} size={17} />
              <Text style={styles.couponText}>첫 상담 20% 쿠폰</Text>
            </RNView>
            <RNView
              style={[
                styles.couponCheck,
                couponApplied && styles.couponCheckOn,
              ]}>
              {couponApplied ? (
                <Check color={consultingColors.onAccent} size={13} />
              ) : null}
            </RNView>
          </Pressable>
        ) : null}

        <View style={styles.section}>
          <ConsultingSectionTitle>결제 수단</ConsultingSectionTitle>
          <View style={styles.methodList}>
            {paymentMethods.map(method => {
              const selected = method.id === selectedMethod;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{selected}}
                  key={method.id}
                  onPress={() => setSelectedMethod(method.id)}
                  style={({pressed}) => [
                    styles.methodCard,
                    selected && styles.methodCardSelected,
                    pressed ? styles.pressed : null,
                  ]}>
                  <RNView style={styles.methodLabel}>
                    <MethodIcon icon={method.icon} selected={selected} />
                    <Text
                      style={[
                        styles.methodText,
                        selected && styles.methodTextSelected,
                      ]}>
                      {method.label}
                    </Text>
                  </RNView>
                  {selected ? (
                    <Check color={consultingColors.text} size={16} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.totalCard}>
          <RNView style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>{pricing.label}</Text>
            <Text style={styles.breakdownValue}>
              {formatConsultingPrice(pricing.original)}
            </Text>
          </RNView>
          {pricing.discount > 0 ? (
            <RNView style={styles.breakdownRow}>
              <Text style={styles.breakdownDiscountLabel}>
                {pricing.discountLabel}
              </Text>
              <Text style={styles.breakdownDiscountValue}>
                −{formatConsultingPrice(pricing.discount)}
              </Text>
            </RNView>
          ) : null}
          <RNView style={styles.totalRow}>
            <Text style={styles.totalLabel}>총 결제 금액</Text>
            <Text style={styles.totalPrice}>
              {formatConsultingPrice(pricing.total)}
            </Text>
          </RNView>
          <RNView style={styles.refundRow}>
            <ShieldCheck color={consultingColors.textMuted} size={13} />
            <Text style={styles.refundText}>
              상담 24시간 전까지 전액 환불 · 멤버십은 언제든 해지 가능
            </Text>
          </RNView>
        </View>
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <PrimaryButton
          label={`${formatConsultingPrice(pricing.total)} 결제하기`}
          onPress={onPay}
        />
      </ConsultingBottomBar>
    </RNView>
  );
}

function MethodIcon({
  icon,
  selected,
}: {
  icon: 'card' | 'kakao' | 'naver';
  selected: boolean;
}) {
  const color = selected ? consultingColors.text : consultingColors.textSoft;

  if (icon === 'card') {
    return <CreditCard color={color} size={17} />;
  }

  if (icon === 'kakao') {
    return <MessageCircle color={color} size={17} />;
  }

  return <Wallet color={color} size={17} />;
}

function PurchaseOptionCard({
  label,
  description,
  selected,
  onPress,
  badge,
  gold = false,
}: {
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  badge?: string;
  gold?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{selected}}
      onPress={onPress}
      style={({pressed}) => [
        styles.optionCard,
        gold && styles.optionCardGold,
        selected && styles.optionCardSelected,
        pressed ? styles.pressed : null,
      ]}>
      <RNView style={styles.optionHeader}>
        <RNView style={styles.optionTitleRow}>
          {gold ? (
            <Crown color={consultingColors.goldText} size={15} />
          ) : null}
          <Text style={styles.optionLabel}>{label}</Text>
          {badge ? (
            <RNView
              style={[styles.optionBadge, gold && styles.optionBadgeGold]}>
              <Text
                style={[
                  styles.optionBadgeText,
                  gold && styles.optionBadgeTextGold,
                ]}>
                {badge}
              </Text>
            </RNView>
          ) : null}
        </RNView>
        <RNView
          style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
          {selected ? <RNView style={styles.radioInner} /> : null}
        </RNView>
      </RNView>
      <Text style={styles.optionDescription}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  breakdownDiscountLabel: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  breakdownDiscountValue: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  breakdownLabel: {
    color: consultingColors.textMuted,
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    paddingRight: spacing.md,
  },
  breakdownRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  breakdownValue: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  couponCheck: {
    alignItems: 'center',
    borderColor: consultingColors.border,
    borderRadius: consultingRadius.pill,
    borderWidth: 1.5,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  couponCheckOn: {
    backgroundColor: consultingColors.accent,
    borderColor: consultingColors.accent,
  },
  couponLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  couponRow: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  couponText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  membershipDetailLink: {
    color: consultingColors.goldText,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  methodCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  methodCardSelected: {
    borderColor: consultingColors.accent,
    borderWidth: 2,
  },
  methodLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  methodList: {
    gap: spacing.sm,
  },
  methodText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  methodTextSelected: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.medium,
    fontWeight: typography.fontWeight.medium,
  },
  optionBadge: {
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  optionBadgeGold: {
    backgroundColor: consultingColors.goldSoft,
  },
  optionBadgeText: {
    color: consultingColors.roseText,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
  },
  optionBadgeTextGold: {
    color: consultingColors.goldText,
  },
  optionCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    padding: 16,
  },
  optionCardGold: {
    backgroundColor: consultingColors.surfaceSoft,
  },
  optionCardSelected: {
    borderColor: consultingColors.accent,
    borderWidth: 2,
  },
  optionDescription: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: 17,
    marginTop: 6,
  },
  optionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  optionLabel: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  optionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 6,
    paddingRight: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
  radioInner: {
    backgroundColor: consultingColors.accent,
    borderRadius: consultingRadius.pill,
    height: 10,
    width: 10,
  },
  radioOuter: {
    alignItems: 'center',
    borderColor: consultingColors.border,
    borderRadius: consultingRadius.pill,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  radioOuterSelected: {
    borderColor: consultingColors.accent,
  },
  refundRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  refundText: {
    color: consultingColors.textMuted,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
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
  totalCard: {
    borderTopColor: consultingColors.border,
    borderTopWidth: 1,
    paddingTop: spacing.lg,
  },
  totalLabel: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  totalPrice: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  totalRow: {
    alignItems: 'center',
    borderTopColor: consultingColors.borderSoft,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 12,
  },
});
