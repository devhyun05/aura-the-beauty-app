import { Image, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { userPageColors, userPageRadius } from '../../../shared/theme/tokens';
import type { MakeupStylePreview } from '../../../shared/types/userPage';
import { HeartIcon } from './HeartIcon';

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
          <View style={styles.heartBadge}>
            <HeartIcon />
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
    gap: 8,
    width: 104,
  },
  heartBadge: {
    alignItems: 'center',
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 24,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageFrame: {
    backgroundColor: userPageColors.surfaceMuted,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    height: 144,
    overflow: 'hidden',
    width: 104,
  },
  title: {
    color: userPageColors.text,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'center',
  },
});
