import { Image, type ImageSourcePropType, StyleSheet } from 'react-native';
import { View } from 'tamagui';

import { colors } from '../theme';

type ImagePlaceholderProps = {
  source?: ImageSourcePropType;
  borderRadius?: number;
  resizeMode?: 'cover' | 'contain';
};

export function ImagePlaceholder({
  source,
  borderRadius = 12,
  resizeMode = 'cover',
}: ImagePlaceholderProps) {
  if (!source) {
    return <View style={[styles.placeholder, { borderRadius }]} />;
  }

  return (
    <Image
      resizeMode={resizeMode}
      source={source}
      style={[styles.image, { borderRadius }]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    height: '100%',
    width: '100%',
  },
  placeholder: {
    backgroundColor: colors.surfaceMuted,
    height: '100%',
    width: '100%',
  },
});
