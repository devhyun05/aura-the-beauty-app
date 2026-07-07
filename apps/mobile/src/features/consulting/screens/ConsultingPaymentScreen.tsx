import {useMemo, useState} from 'react';
import {Pressable, StyleSheet, View as RNView} from 'react-native';
import {
  Check,
  CreditCard,
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
} from '../types';

const FIRST_SESSION_COUPON_RATE = 0.2;

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
  submitting?: boolean;
};

export function ConsultingPaymentScreen({
  expert,
  draft,
  onPay,
  submitting = false,
}: ConsultingPaymentScreenProps) {
  const [couponApplied, setCouponApplied] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>('card');

  const duration = findConsultingDuration(expert, draft.durationId);
  const slotLabel = formatConsultingSlotLabel(draft.dayId, draft.slotId);

  const pricing = useMemo(() => {
    const basePrice = duration.price;
    const couponDiscount = couponApplied
      ? Math.round(basePrice * FIRST_SESSION_COUPON_RATE)
      : 0;

    return {
      label: `화상 상담 ${duration.label}`,
      original: basePrice,
      discountLabel: `첫 상담 ${Math.round(FIRST_SESSION_COUPON_RATE * 100)}% 쿠폰`,
      discount: couponDiscount,
      total: basePrice - couponDiscount,
    };
  }, [couponApplied, duration.label, duration.price]);

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
          <ConsultingSectionTitle>예약 확인</ConsultingSectionTitle>
          <View style={styles.reservationCard}>
            <RNView style={styles.reservationHeader}>
              <RNView style={styles.reservationIcon}>
                <Ticket color={consultingColors.roseStrong} size={17} />
              </RNView>
              <RNView style={styles.reservationBody}>
                <Text style={styles.reservationTitle}>
                  이번 예약 1건 결제
                </Text>
                <Text style={styles.reservationDescription}>
                  선택한 날짜와 시간에 {duration.label} 화상 상담이 진행돼요.
                </Text>
              </RNView>
              <Text style={styles.reservationPrice}>
                {formatConsultingPrice(duration.price)}
              </Text>
            </RNView>
            <RNView style={styles.reservationMetaRow}>
              <Text style={styles.reservationMetaLabel}>전달 리포트</Text>
              <Text style={styles.reservationMetaValue}>
                {draft.sharedReportIds.length > 0
                  ? `${draft.sharedReportIds.length}개`
                  : '없음'}
              </Text>
            </RNView>
            <RNView style={styles.reservationMetaRow}>
              <Text style={styles.reservationMetaLabel}>상담 시작</Text>
              <Text style={styles.reservationMetaValue}>
                상담사가 예약 시간에 먼저 연락
              </Text>
            </RNView>
          </View>
        </View>

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
              상담 24시간 전까지 전액 환불 · 이후 취소는 정책에 따라 환불돼요
            </Text>
          </RNView>
        </View>
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <PrimaryButton
          disabled={submitting}
          label={
            submitting
              ? '예약 저장 중...'
              : `${formatConsultingPrice(pricing.total)} 결제하기`
          }
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
  methodCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  methodCardSelected: {
    borderColor: consultingColors.accent,
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
  pressed: {
    opacity: 0.85,
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
  reservationBody: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  reservationCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: 16,
  },
  reservationDescription: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: 17,
  },
  reservationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reservationIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  reservationMetaLabel: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  reservationMetaRow: {
    alignItems: 'center',
    borderTopColor: consultingColors.borderSoft,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  reservationMetaValue: {
    color: consultingColors.text,
    flexShrink: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    paddingLeft: spacing.md,
    textAlign: 'right',
  },
  reservationPrice: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  reservationTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
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
