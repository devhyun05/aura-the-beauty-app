// AURADIN ground — the screen's base: powder-blue → lilac → orchid-pink
// gradient (entry v3: the entry screen is a CLEAN GRADIENT — no photo), soft
// haze blobs, an opt-in legacy photo slot, and the deep-navy veil that
// descends for the searching immersion and lifts back to light.
//
// Mount ONE per app and swap only its props; children (orb + view) render
// above the veil:
//   <AuradinGround dark={phase === 'searching'}>…</AuradinGround>
//
// Photo slot (LEGACY, opt-in): the v2 entry used a photo at opacity .22 +
// mix-blend-mode:luminosity; v3 dropped it for the clean gradient. Hosts that
// still want it pass photoSource (pre-desaturated asset ships in assets/) +
// photoVisible — behavior is unchanged.
// Haze blobs are SVG radial fades — soft-edged, never hard circles.
import * as React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';
import {LinearGradient} from './LinearGradientFallback';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { gradient, gradPoints, motion } from '../../theme/auradinTokens';
import { useReducedMotion } from './motion';

function HazeBlob({
  width,
  height,
  color,
  maxOpacity,
  style,
}: {
  width: number;
  height: number;
  color: string;
  maxOpacity: number;
  style: ViewStyle;
}): React.JSX.Element {
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View pointerEvents="none" style={[{ width, height }, style]}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={`auHaze${id}`} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={color} stopOpacity={maxOpacity} />
            <Stop offset="0.55" stopColor={color} stopOpacity={maxOpacity * 0.8} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} fill={`url(#auHaze${id})`} />
      </Svg>
    </View>
  );
}

export type AuradinGroundProps = {
  /** deep-navy immersion — the searching screen ONLY */
  dark?: boolean;
  /** LEGACY opt-in: pre-desaturated brand photo (v3 entry is a clean gradient) */
  photoSource?: ImageSourcePropType;
  photoVisible?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function AuradinGround({
  dark = false,
  photoSource,
  photoVisible = false,
  style,
  children,
}: AuradinGroundProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const veil = React.useRef(new Animated.Value(dark ? 1 : 0)).current;
  const photo = React.useRef(new Animated.Value(photoVisible && !dark ? 0.22 : 0)).current;

  React.useEffect(() => {
    const dur = reduced ? 0 : motion.durVeil;
    Animated.parallel([
      Animated.timing(veil, { toValue: dark ? 1 : 0, duration: dur, useNativeDriver: true }),
      Animated.timing(photo, {
        toValue: photoVisible && !dark ? 0.22 : 0,
        duration: dur,
        useNativeDriver: true,
      }),
    ]).start();
  }, [dark, photo, photoVisible, reduced, veil]);

  const hazeOpacity = veil.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View style={[{ flex: 1, overflow: 'hidden' }, style]}>
      {/* ground: 178° powder-blue → lilac → orchid-pink (entry v3) */}
      <LinearGradient
        colors={gradient.ground.colors}
        locations={gradient.ground.locations}
        start={gradPoints.deg178.start}
        end={gradPoints.deg178.end}
        style={StyleSheet.absoluteFill}
      />
      {/* legacy opt-in background photo (pre-desaturated, opacity .22) */}
      {photoSource ? (
        <Animated.Image
          source={photoSource}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, { opacity: photo }]}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {/* soft haze blobs (hidden under the dark veil) */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: hazeOpacity }]}>
        <HazeBlob
          width={280}
          height={200}
          color="#FFFFFF"
          maxOpacity={0.5}
          style={{ position: 'absolute', left: -90, top: 110 }}
        />
        <HazeBlob
          width={260}
          height={220}
          color="#FBE3EE"
          maxOpacity={0.6}
          style={{ position: 'absolute', right: -80, top: 300 }}
        />
      </Animated.View>
      {/* dark veil — descends into searching, lifts to reveal light */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: veil }]}>
        <LinearGradient
          colors={gradient.navy.colors}
          locations={gradient.navy.locations}
          start={gradPoints.deg178.start}
          end={gradPoints.deg178.end}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {/* orb + screen content */}
      {children}
    </View>
  );
}
