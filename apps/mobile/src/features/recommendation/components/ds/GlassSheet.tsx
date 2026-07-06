// AURADIN bottom glass sheet — container for composer + chips + meta.
// Full liquid-glass recipe (sheet tier) with diagonal edge glare, radius 28.
// `iridescent` puts the holo rim on the sheet — the HOME entry sheet only.
import * as React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { radius, space } from '../../theme/auradinTokens';
import { GlassBase } from './GlassBase';

export type GlassSheetProps = {
  /** holo emphasis rim — home entry sheet only */
  iridescent?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function GlassSheet({
  iridescent = false,
  style,
  contentStyle,
  children,
}: GlassSheetProps): React.JSX.Element {
  return (
    <GlassBase
      tier="sheet"
      radius={radius.sheet}
      glare
      iridescent={iridescent}
      style={style}
      contentStyle={[{ paddingTop: 18, paddingHorizontal: space.s4, paddingBottom: space.pad }, contentStyle]}
    >
      {children}
    </GlassBase>
  );
}
