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
            <SavedIcon />
          </View>
        ) : null}
      </View>

      <Text style={styles.title}>{style.title}</Text>
    </View>
  );
};

function SavedIcon() {
  return (
    <View pointerEvents="none" style={styles.savedIcon}>
      <View style={styles.savedIconTop} />
      <View style={styles.savedIconBottom} />
    </View>
  );
}

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
    borderColor: userPageColors.border,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    height: 150,
    overflow: 'hidden',
    width: 104,
  },
  savedBadge: {
    alignItems: 'center',
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 20,
  },
  savedIcon: {
    height: 11,
    position: 'relative',
    width: 9,
  },
  savedIconBottom: {
    borderBottomColor: userPageColors.text,
    borderBottomWidth: 1.5,
    borderLeftColor: 'transparent',
    borderLeftWidth: 4.5,
    borderRightColor: 'transparent',
    borderRightWidth: 4.5,
    bottom: 0,
    height: 0,
    position: 'absolute',
    width: 0,
  },
  savedIconTop: {
    backgroundColor: userPageColors.text,
    borderRadius: 1,
    height: 8,
    width: 9,
  },
  title: {
    color: userPageColors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
