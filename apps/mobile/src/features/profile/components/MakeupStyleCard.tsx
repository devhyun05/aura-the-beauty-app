import { Image, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { userPageColors, userPageRadius } from '../../../shared/theme/tokens';
import type { MakeupStylePreview } from '../../../shared/types/userPage';

interface MakeupStyleCardProps {
  style: MakeupStylePreview;
}

export const MakeupStyleCard = ({ style }: MakeupStyleCardProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.imageFrame}>
        <Image
          resizeMode="cover"
          source={style.imageSource}
          style={styles.image}
        />

        {style.isSaved ? (
          <View style={styles.savedBadge}>
            <Text style={styles.savedIcon}>⌑</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.title}>{style.title}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: 10,
    width: 104,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageFrame: {
    borderRadius: userPageRadius.image,
    height: 150,
    overflow: 'hidden',
    width: 104,
  },
  savedBadge: {
    alignItems: 'center',
    backgroundColor: userPageColors.surface,
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 20,
  },
  savedIcon: {
    color: userPageColors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    color: userPageColors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
