import {useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {MAKEUP_SITUATION_ASSETS} from '../data/situations/makeupRecommendationSituationAssets';
import type {MakeupSituation} from '../types';

export function SituationCard({
  cardWidth,
  onPress,
  selected,
  situation,
}: {
  cardWidth: number;
  onPress: () => void;
  selected: boolean;
  situation: MakeupSituation;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <Pressable
      accessibilityHint={situation.description}
      accessibilityLabel={situation.label + ' 상황 선택'}
      accessibilityRole="button"
      accessibilityState={{selected}}
      onPress={onPress}
      style={({pressed}) => [
        styles.card,
        {width: cardWidth},
        selected && styles.cardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.imageFrame}>
        {imageFailed ? (
          <View style={styles.fallback}>
            <Text style={styles.fallbackIcon}>✦</Text>
          </View>
        ) : (
          <Image
            accessible={false}
            accessibilityIgnoresInvertColors
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            source={MAKEUP_SITUATION_ASSETS[situation.imageAssetKey]}
            style={styles.image}
          />
        )}
      </View>
      <View style={[styles.footer, selected && styles.footerSelected]}>
        <Text numberOfLines={2} style={styles.label}>{situation.label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardSelected: {borderColor: colors.textPrimary},
  pressed: {opacity: 0.8},
  image: {height: '100%', width: '100%'},
  imageFrame: {
    aspectRatio: 1,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  fallback: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    flex: 1,
    justifyContent: 'center',
  },
  fallbackIcon: {color: colors.textTertiary, fontSize: 22},
  footer: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  footerSelected: {backgroundColor: colors.surfaceMuted},
  label: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
});
