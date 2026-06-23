import {useEffect, useState} from 'react';
import {StyleSheet, useWindowDimensions} from 'react-native';
import {Text, View} from 'tamagui';

import {getMakeupLooks} from '../../../shared/services/makeupService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupLook} from '../../../shared/types/userPage';
import {
  AppHeader,
  AppScreen,
  BookmarkIcon,
  ImagePlaceholder,
  PaginationDots,
} from '../../../shared/ui';

type MakeupStyleListScreenProps = {
  onBack?: () => void;
};

export function MakeupStyleListScreen({onBack}: MakeupStyleListScreenProps) {
  const {width} = useWindowDimensions();
  const [looks, setLooks] = useState<MakeupLook[]>([]);
  const gap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - gap * 2) / 3);

  useEffect(() => {
    let isMounted = true;

    getMakeupLooks().then((nextLooks) => {
      if (isMounted) {
        setLooks(nextLooks);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AppScreen contentGap={spacing.xl}>
      <AppHeader onBack={onBack} title="메이크업 룩" />

      <View style={[styles.grid, {gap}]}>
        {looks.map((look) => (
          <View key={look.id} style={[styles.card, {width: cardWidth}]}>
            <View style={styles.imageArea}>
              <ImagePlaceholder
                borderRadius={radius.md}
                resizeMode="cover"
                source={look.imageSource}
              />
              <View style={styles.bookmarkBadge}>
                <BookmarkIcon color={colors.black} />
              </View>
            </View>
            <Text numberOfLines={1} style={styles.title}>
              {look.title}
            </Text>
          </View>
        ))}
      </View>

      <PaginationDots count={5} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  bookmarkBadge: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: 28,
  },
  card: {
    gap: spacing.sm,
    minWidth: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  imageArea: {
    aspectRatio: 0.82,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
});
