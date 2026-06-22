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
    gap: 10,
    width: 104,
  },
  heartBadge: {
    alignItems: 'center',
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.border,
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
    borderColor: userPageColors.border,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    height: 150,
    overflow: 'hidden',
    width: 104,
  },
  title: {
    color: userPageColors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
