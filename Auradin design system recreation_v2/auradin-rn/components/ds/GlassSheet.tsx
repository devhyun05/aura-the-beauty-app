// AURADIN bottom glass sheet — container for composer + chips + meta.
// Full liquid-glass recipe (sheet tier) with diagonal edge glare, radius 28.
import * as React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { radius, space } from '../../theme/auradinTokens';
import { GlassBase } from './GlassBase';

export type GlassSheetProps = {
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function GlassSheet({ style, contentStyle, children }: GlassSheetProps): React.JSX.Element {
  return (
    <GlassBase
      tier="sheet"
      radius={radius.sheet}
      glare
      style={style}
      contentStyle={[{ paddingTop: 18, paddingHorizontal: space.s4, paddingBottom: space.pad }, contentStyle]}
    >
      {children}
    </GlassBase>
  );
}
