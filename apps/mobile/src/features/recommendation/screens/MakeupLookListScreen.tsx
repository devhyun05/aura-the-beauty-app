import {useEffect, useState} from 'react';
import {StyleSheet, useWindowDimensions} from 'react-native';
import {Text, View} from 'tamagui';

import {getMakeupLooks} from '../../../shared/services/makeupService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupLook} from '../../../shared/types/profile';
import {
  AppScreen,
  ImagePlaceholder,
  PagedGrid,
} from '../../../shared/ui';

type MakeupLookListScreenProps = {
  headerTitle?: string;
  onBack?: () => void;
};

export function MakeupLookListScreen(_props: MakeupLookListScreenProps = {}) {
  const {width} = useWindowDimensions();
  const [looks, setLooks] = useState<MakeupLook[]>([]);
  const gap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - gap) / 2);

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
    <AppScreen contentGap={spacing.xl} topPadding="none">
      <PagedGrid
        data={looks}
        keyExtractor={(look) => look.id}
        pageSize={10}
        pageStyle={[styles.grid, {gap}]}
        pageWidth={contentWidth}
        renderItem={(look) => (
          <View style={[styles.card, {width: cardWidth}]}>
            <View style={styles.imageArea}>
              <ImagePlaceholder
                borderRadius={radius.md}
                resizeMode="cover"
                source={look.imageSource}
              />
            </View>
            <Text numberOfLines={1} style={styles.title}>
              {look.title}
            </Text>
          </View>
        )}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
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
