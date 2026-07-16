// AURADIN — abstract finish/texture swatch fills (§8.2-1). Self-drawn with
// gradients + deterministic sparkle dots only: NO product photos (they bias the
// answer toward a specific product, §8.2-2) and NO generative swatch imagery
// (can't guarantee real payoff, §8.2-5). Tones are neutral rosy-beige so no
// color family is implied — the tile communicates FINISH, not color.
import * as React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { AuradinTextureKind } from '../../types';

export type TextureSwatchProps = {
  texture: AuradinTextureKind;
};

// Neutral base ramps per finish (light → deep). Deliberately close in hue so
// the four tiles read as "same substance, different finish".
const BASE: Record<AuradinTextureKind, [string, string]> = {
  glossy: ['#EBD3C9', '#C79E90'],
  matte: ['#D6BAAE', '#C7A89A'],
  velvet: ['#CBA394', '#A97D6C'],
  shimmer: ['#E2C4B5', '#BE9484'],
};

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

// mulberry32 — deterministic sparkle field (stable across renders/devices).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Sparkle = {left: string; top: string; size: number; opacity: number; warm: boolean};

const SPARKLES: Sparkle[] = (() => {
  const random = mulberry32(0xaead1e);
  const dots: Sparkle[] = [];
  for (let i = 0; i < 30; i += 1) {
    dots.push({
      left: `${4 + random() * 92}%`,
      top: `${6 + random() * 88}%`,
      size: 1.5 + random() * 2.2,
      opacity: 0.3 + random() * 0.6,
      warm: random() > 0.62,
    });
  }
  return dots;
})();

/** Sharp specular band — the "wet" read of gloss. */
function GlossyOverlay(): React.JSX.Element {
  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.78)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
        locations={[0.24, 0.4, 0.5, 0.62]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={FILL}
      />
      {/* small hard highlight — glass-like point light */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '14%',
          left: '16%',
          width: 26,
          height: 12,
          borderRadius: 8,
          backgroundColor: 'rgba(255,255,255,0.82)',
          transform: [{ rotate: '-24deg' }],
        }}
      />
    </>
  );
}

/** Diffuse wide sheen — soft-focus blurred read of velvet. */
function VelvetOverlay(): React.JSX.Element {
  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
        locations={[0.15, 0.5, 0.85]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={FILL}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(66,29,24,0.14)', 'rgba(66,29,24,0)']}
        locations={[0, 0.55]}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0 }}
        style={FILL}
      />
    </>
  );
}

/** Deterministic sparkle field over a soft glare — shimmer. */
function ShimmerOverlay(): React.JSX.Element {
  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.24)', 'rgba(255,255,255,0)']}
        locations={[0.2, 0.48, 0.78]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={FILL}
      />
      {SPARKLES.map((dot, index) => (
        <View
          key={`sp-${index}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: dot.left as `${number}%`,
            top: dot.top as `${number}%`,
            width: dot.size,
            height: dot.size,
            borderRadius: dot.size / 2,
            backgroundColor: dot.warm ? '#FFF3E2' : '#FFFFFF',
            opacity: dot.opacity,
          }}
        />
      ))}
    </>
  );
}

export function TextureSwatch({ texture }: TextureSwatchProps): React.JSX.Element {
  const [light, deep] = BASE[texture];
  return (
    <View pointerEvents="none" style={FILL}>
      <LinearGradient
        colors={texture === 'matte' ? [light, deep] : [light, deep, light === deep ? deep : light]}
        locations={texture === 'matte' ? [0, 1] : [0, 0.62, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={FILL}
      />
      {texture === 'glossy' ? <GlossyOverlay /> : null}
      {texture === 'velvet' ? <VelvetOverlay /> : null}
      {texture === 'shimmer' ? <ShimmerOverlay /> : null}
      {/* matte: flat by definition — no highlight, no sparkle */}
    </View>
  );
}
