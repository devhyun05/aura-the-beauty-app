import type {ReactNode} from 'react';
import {Pressable, StyleSheet, View as RNView} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ChevronRight, Star} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {
  consultingColors,
  consultingRadius,
  consultingSpacing,
  spacing,
  typography,
} from '../../../shared/theme';
import type {ConsultingExpert, ConsultingRecordStatus} from '../types';
import {formatConsultingPrice} from '../mocks/consulting.mock';

const avatarToneColors: Record<
  ConsultingExpert['avatarTone'],
  {background: string; text: string}
> = {
  rose: {background: '#F1DDDA', text: '#7C4A45'},
  sand: {background: '#EDE4D6', text: '#6B5E48'},
  mauve: {background: '#E6DCE4', text: '#5F4A5C'},
};

export function ConsultingSectionLabel({children}: {children: ReactNode}) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function ConsultingSectionTitle({children}: {children: ReactNode}) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function ExpertAvatar({
  expert,
  size = 44,
}: {
  expert: ConsultingExpert;
  size?: number;
}) {
  const tone = avatarToneColors[expert.avatarTone];
  return (
    <RNView
      style={[
        styles.avatar,
        {
          backgroundColor: tone.background,
          borderRadius: size / 2,
          height: size,
          width: size,
        },
      ]}>
      <Text
        style={[
          styles.avatarText,
          {color: tone.text, fontSize: Math.round(size * 0.3)},
        ]}>
        {expert.initials}
      </Text>
    </RNView>
  );
}

export function RatingRow({
  rating,
  suffix,
}: {
  rating: number;
  suffix?: string;
}) {
  return (
    <RNView style={styles.ratingRow}>
      <Star
        color={consultingColors.roseStrong}
        fill={consultingColors.roseStrong}
        size={13}
      />
      <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
      {suffix ? (
        <Text numberOfLines={1} style={styles.ratingSuffix}>
          {suffix}
        </Text>
      ) : null}
    </RNView>
  );
}

export function StarRating({rating, size = 12}: {rating: number; size?: number}) {
  return (
    <RNView style={styles.starRow}>
      {[1, 2, 3, 4, 5].map(step => (
        <Star
          color={
            step <= rating
              ? consultingColors.roseStrong
              : consultingColors.borderSoft
          }
          fill={
            step <= rating
              ? consultingColors.roseStrong
              : consultingColors.borderSoft
          }
          key={step}
          size={size}
        />
      ))}
    </RNView>
  );
}

const statusBadgePresets: Record<
  ConsultingRecordStatus,
  {label: string; background: string; color: string}
> = {
  upcoming: {
    label: '예정',
    background: consultingColors.roseSoft,
    color: consultingColors.roseText,
  },
  completed: {
    label: '완료',
    background: consultingColors.surfaceMuted,
    color: consultingColors.textMuted,
  },
  canceled: {
    label: '취소',
    background: consultingColors.dangerSoft,
    color: consultingColors.danger,
  },
};

export function ConsultingStatusBadge({
  status,
}: {
  status: ConsultingRecordStatus;
}) {
  const preset = statusBadgePresets[status];
  return (
    <RNView style={[styles.statusBadge, {backgroundColor: preset.background}]}>
      <Text style={[styles.statusBadgeText, {color: preset.color}]}>
        {preset.label}
      </Text>
    </RNView>
  );
}

export function ConsultingChip({
  label,
  selected = false,
  onPress,
  disabled = false,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled, selected}}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({pressed}) => [
        styles.chip,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
        pressed && !disabled ? styles.pressed : null,
      ]}>
      <Text
        style={[
          styles.chipText,
          selected && styles.chipTextSelected,
          disabled && styles.chipTextDisabled,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ExpertListCard({
  expert,
  onPress,
}: {
  expert: ConsultingExpert;
  onPress: () => void;
}) {
  const fromPrice = Math.min(...expert.durations.map(duration => duration.price));
  const shortestMinutes = Math.min(
    ...expert.durations.map(duration => duration.minutes),
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expert.name} 상담 보기`}
      onPress={onPress}
      style={({pressed}) => [styles.expertCard, pressed ? styles.pressed : null]}>
      <ExpertAvatar expert={expert} size={52} />
      <View style={styles.expertCardBody}>
        <RNView style={styles.expertNameRow}>
          <Text style={styles.expertName}>{expert.name}</Text>
          <Text style={styles.expertTitle} numberOfLines={1}>
            {expert.title}
          </Text>
        </RNView>
        <Text numberOfLines={1} style={styles.expertSignature}>
          {expert.signatureLine}
        </Text>
        <View style={styles.expertBottomRow}>
          <RatingRow rating={expert.rating} suffix={`(${expert.reviewCount})`} />
          <Text style={styles.expertPrice}>
            {shortestMinutes}분 {formatConsultingPrice(fromPrice)}~
          </Text>
        </View>
      </View>
      <ChevronRight color={consultingColors.textSoft} size={18} />
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.primaryButton,
        disabled && styles.primaryButtonDisabled,
        pressed && !disabled ? styles.primaryPressed : null,
      ]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.secondaryButton,
        pressed ? styles.pressed : null,
      ]}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function ConsultingBottomBar({children}: {children: ReactNode}) {
  const insets = useSafeAreaInsets();
  return (
    <RNView
      style={[
        styles.bottomBar,
        {paddingBottom: Math.max(insets.bottom, spacing.md)},
      ]}>
      {children}
    </RNView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: typography.fontFamily.bold,
    fontWeight: typography.fontWeight.bold,
  },
  bottomBar: {
    backgroundColor: consultingColors.surface,
    borderTopColor: consultingColors.borderSoft,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: consultingSpacing.screenX,
    paddingTop: spacing.md,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.border,
    borderRadius: consultingRadius.chip,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipDisabled: {
    backgroundColor: consultingColors.surfaceMuted,
    borderColor: consultingColors.borderSoft,
  },
  chipSelected: {
    backgroundColor: consultingColors.accent,
    borderColor: consultingColors.accent,
  },
  chipText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  chipTextDisabled: {
    color: consultingColors.textSoft,
    textDecorationLine: 'line-through',
  },
  chipTextSelected: {
    color: consultingColors.onAccent,
  },
  expertBottomRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  expertCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  expertCardBody: {
    flex: 1,
  },
  expertName: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  expertNameRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 6,
  },
  expertPrice: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  expertSignature: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 3,
  },
  expertTitle: {
    color: consultingColors.textSoft,
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.accent,
    borderRadius: consultingRadius.pill,
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: 15,
  },
  primaryButtonDisabled: {
    backgroundColor: consultingColors.textSoft,
  },
  primaryButtonText: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  primaryPressed: {
    opacity: 0.85,
  },
  ratingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 4,
  },
  ratingSuffix: {
    color: consultingColors.textMuted,
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  ratingText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.border,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: 15,
  },
  secondaryButtonText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  sectionLabel: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0.3,
  },
  sectionTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  starRow: {
    flexDirection: 'row',
    gap: 2,
  },
  statusBadge: {
    borderRadius: consultingRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
  },
});
