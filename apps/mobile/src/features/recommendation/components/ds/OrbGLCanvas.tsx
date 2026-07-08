import * as React from 'react';
import {Animated} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

export type OrbGLCanvasProps = {
  glowTarget: number;
  paused: boolean;
  onFail: () => void;
  style?: StyleProp<ViewStyle>;
};

export function OrbGLCanvas({onFail, style}: OrbGLCanvasProps): React.JSX.Element {
  React.useEffect(() => {
    onFail();
  }, [onFail]);

  return <Animated.View style={style} />;
}
