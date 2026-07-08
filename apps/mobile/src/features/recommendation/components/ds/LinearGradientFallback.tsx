import * as React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';

type LinearGradientFallbackProps = {
  children?: React.ReactNode;
  colors: readonly string[];
  end?: {x: number; y: number};
  locations?: readonly number[];
  pointerEvents?: 'auto' | 'box-none' | 'box-only' | 'none';
  start?: {x: number; y: number};
  style?: StyleProp<ViewStyle>;
};

export function LinearGradient({
  children,
  colors,
  pointerEvents,
  style,
}: LinearGradientFallbackProps): React.JSX.Element {
  return (
    <View
      pointerEvents={pointerEvents}
      style={[
        styles.base,
        {backgroundColor: colors[0] ?? 'transparent'},
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
