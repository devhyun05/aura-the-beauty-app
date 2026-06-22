import { Image, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import {
  userPageColors,
  userPageRadius,
  userPageTypography,
} from '../../../shared/theme/tokens';
import type { AnalysisMakeupCard } from '../../../shared/types/analysis';

interface AnalysisMakeupGuideCardProps {
  item: AnalysisMakeupCard;
}

export const AnalysisMakeupGuideCard = ({
  item,
}: AnalysisMakeupGuideCardProps) => {
  return (
    <View style={styles.card}>
      <Image resizeMode="cover" source={item.imageSource} style={styles.image} />

      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.title}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {item.subtitle}
        </Text>
        <Text numberOfLines={3} style={styles.description}>
          {item.description}
        </Text>

        <View style={styles.tags}>
          {item.tags.slice(0, 2).map((tag) => (
            <Text key={tag} style={styles.tag}>
              {tag}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  body: {
    gap: 6,
    padding: 12,
  },
  card: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    overflow: 'hidden',
    width: 168,
  },
  description: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.caption,
    lineHeight: 17,
  },
  image: {
    backgroundColor: userPageColors.surfaceMuted,
    height: 96,
    width: '100%',
  },
  subtitle: {
    color: userPageColors.textSoft,
    fontSize: userPageTypography.caption,
    lineHeight: 16,
  },
  tag: {
    backgroundColor: userPageColors.surfaceMuted,
    borderRadius: userPageRadius.chip,
    color: userPageColors.textMuted,
    fontSize: userPageTypography.caption,
    lineHeight: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    paddingTop: 2,
  },
  title: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    fontWeight: '700',
    lineHeight: 20,
  },
});
