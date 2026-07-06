// AURADIN overlapping palette swatch circles (16px, 1.6px white border,
// −5px overlap). Product palettes + the image-absent placeholder motif.
import * as React from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { color } from '../../theme/auradinTokens';

export type PaletteSwatchesProps = {
  colors: string[];
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function PaletteSwatches({ colors, size = 16, style }: PaletteSwatchesProps): React.JSX.Element {
  return (
    <View style={[{ flexDirection: 'row' }, style]}>
      {colors.map((c, i) => (
        <View
          key={`${c}-${i}`}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.6,
            borderColor: '#FFFFFF',
            backgroundColor: c,
            marginLeft: i === 0 ? 0 : -5,
            shadowColor: color.ink,
            shadowOpacity: 0.18,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 1 },
            elevation: 1,
          }}
        />
      ))}
    </View>
  );
}
