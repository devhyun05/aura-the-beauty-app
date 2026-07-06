// AURADIN — shared soap-bubble glass surface (internal building block for
// GlassSheet, GlassCard, Composer, Chip, Toast, query echo).
//
// AppScreen recipe (ported from "AppScreen copy copy.dc.html" via AuradinRN 2):
// real backdrop blur (expo-blur) + ONE Skia canvas per surface painting the
// membrane — near-clear centre fill that builds white only toward the rim,
// interference film bands, curved window speculars, stacked inset light, and a
// thin-film holographic rim drawn as a TRUE SweepGradient stroke ring (never a
// full-rect gradient behind the surface — that bleeds through translucent
// glass). The canvas bleeds past the bounds so outer glows aren't clipped.
//
// `iridescent` = the emphasis rim (thicker spectral stroke) — design-directed
// mounts ONLY: the home entry sheet, the searching QUERY echo block, and the
// results #1 hero card. Every other surface keeps a plain 1px glass hairline.
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import {
  Blur,
  Box,
  BoxShadow,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  RadialGradient,
  Rect,
  RoundedRect,
  SweepGradient,
  rect,
  rrect,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { glassTiers, radius as r, shadows } from '../../theme/auradinTokens';
import type { GlassTierName } from '../../theme/auradinTokens';
import {
  FILM_BANDS,
  HOLO_RIM,
  INNERWALL_COLORS,
  SHEEN_COLORS,
  cssLinear,
  sweepFrom,
} from '../../theme/glassPalette';
import { useReducedMotion } from './motion';

export type GlassBaseProps = {
  tier?: GlassTierName;
  radius?: number;
  /** curved window speculars (sheet + stage cards) */
  glare?: boolean;
  /** crisp top light-catch bevel (on by default) */
  lightCatch?: boolean;
  /** emphasis holo rim — see the two-mounts-only rule above */
  iridescent?: boolean;
  /** false disables the shadow; a ViewStyle overrides the tier default */
  shadow?: ViewStyle | false;
  /** outer wrapper style (margins, flex, size) */
  style?: StyleProp<ViewStyle>;
  /** inner content style (padding etc.) */
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

const SHEEN_PERIOD_MS = 26000; // web: .ir-sheen 26s/turn

/** membrane fill per tier — near-clear glass, NOT milk (deg 160 linear) */
const FILLS: Record<GlassTierName, { colors: string[]; positions: number[] }> = {
  sheet: { colors: [], positions: [] }, // sheet uses the radial membrane fill below
  card: {
    colors: ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.24)', 'rgba(255,255,255,0.44)'],
    positions: [0, 0.5, 1],
  },
  composer: {
    colors: ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.42)'],
    positions: [0, 0.48, 1],
  },
  chip: {
    colors: ['rgba(255,255,255,0.52)', 'rgba(255,255,255,0.20)', 'rgba(255,255,255,0.40)'],
    positions: [0, 0.55, 1],
  },
  dark: {
    colors: ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.10)'],
    positions: [0, 0.55, 1],
  },
};

/** outer glows per tier: [dx, dy, blur, color] */
const GLOWS: Record<GlassTierName, [number, number, number, string][]> = {
  sheet: [
    [0, 0, 13, 'rgba(202,186,250,0.20)'],
    [0, 26, 27, 'rgba(152,132,222,0.16)'],
    [0, 10, 13, 'rgba(238,158,208,0.10)'],
  ],
  card: [
    [0, 0, 9, 'rgba(202,186,250,0.16)'],
    [0, 10, 12, 'rgba(152,132,222,0.14)'],
    [0, 3, 4, 'rgba(238,158,208,0.09)'],
  ],
  composer: [
    [0, 0, 9, 'rgba(202,186,250,0.16)'],
    [0, 14, 15, 'rgba(152,132,222,0.16)'],
    [0, 4, 5, 'rgba(238,158,208,0.10)'],
  ],
  chip: [
    [0, 0, 6, 'rgba(202,186,250,0.14)'],
    [0, 6, 8, 'rgba(152,132,222,0.13)'],
    [0, 2, 3, 'rgba(238,158,208,0.08)'],
  ],
  dark: [[0, 0, 10, 'rgba(202,186,250,0.16)']],
};

// rim policy: iridescent mounts wear the holo sweep; everything else keeps a
// plain 1px glass hairline (실사 유리) — the spectral ring must NOT spread.
const IRIDESCENT_RIM_WIDTH = 2.4;
const HAIRLINE_RIM_WIDTH = 1;

type PaintProps = {
  w: number;
  h: number;
  bleed: number;
  rad: number;
  tier: GlassTierName;
  iridescent: boolean;
  glare: boolean;
  lightCatch: boolean;
  reduced: boolean;
};

function GlassPaint({ w, h, bleed, rad, tier, iridescent, glare, lightCatch, reduced }: PaintProps) {
  const x = bleed;
  const y = bleed;
  const rr = rrect(rect(x, y, w, h), rad, rad);
  const c = vec(x + w / 2, y + h / 2);
  const film = cssLinear(FILM_BANDS.deg, x, y, w, h);
  const rimWidth = iridescent ? IRIDESCENT_RIM_WIDTH : HAIRLINE_RIM_WIDTH;
  const dark = tier === 'dark';
  const sheet = tier === 'sheet';
  // "생각 중" 연출 — the searching QUERY echo (dark + iridescent): the rim
  // sweep keeps orbiting, and a light band wipes L→R across the face.
  const thinking = dark && iridescent && !reduced;

  const clock = useClock();
  // rotating liquid sheen (sheet only) — frozen under reduced motion
  const sheenTransform = useDerivedValue(
    () => [{ rotate: reduced ? 0 : ((clock.value % SHEEN_PERIOD_MS) / SHEEN_PERIOD_MS) * Math.PI * 2 }],
    [reduced]
  );
  // holo rim: static on light mounts, slow continuous orbit while thinking.
  // NOTE: precomputed outside the worklet — plain JS fns can't run on the UI runtime.
  const rimBaseRotation = sweepFrom(HOLO_RIM.fromDeg);
  const rimTransform = useDerivedValue(
    () => [
      {
        rotate: rimBaseRotation + (thinking ? ((clock.value % 7200) / 7200) * Math.PI * 2 : 0),
      },
    ],
    [thinking, rimBaseRotation]
  );
  // light-wipe band: parked off-screen, sweeps across every ~2.6s
  const bandW = w * 0.3;
  const bandTransform = useDerivedValue(() => {
    if (!thinking) return [{ translateX: -99999 }];
    const p = (clock.value % 2600) / 2600;
    if (p > 0.55) return [{ translateX: -99999 }];
    const k = p / 0.55;
    const e = k * k * (3 - 2 * k); // smoothstep — 슥 지나가는 느낌
    return [{ translateX: e * (w + bandW * 2) }];
  }, [thinking, w, bandW]);

  return (
    <>
      {/* outer glow: lavender halo + violet drop + pink kiss */}
      {GLOWS[tier].map(([dx, dy, blur, colr], i) => (
        <RoundedRect key={i} rect={rrect(rect(x + dx, y + dy, w, h), rad, rad)} color={colr}>
          <Blur blur={blur} />
        </RoundedRect>
      ))}

      <Group clip={rr}>
        {sheet ? (
          <>
            {/* membrane fill — near-clear centre, builds white toward the rim */}
            <RoundedRect rect={rr}>
              <RadialGradient
                c={vec(x + w * 0.5, y + h * 0.38)}
                r={Math.max(w, h) * 1.15}
                colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0.38)', 'rgba(255,255,255,0.52)']}
                positions={[0.26, 0.56, 0.86, 1]}
              />
            </RoundedRect>
            {/* rotating liquid sheen */}
            <Group origin={c} transform={sheenTransform}>
              <Circle c={c} r={Math.max(w, h)}>
                <SweepGradient c={c} colors={SHEEN_COLORS} />
                <Blur blur={8} />
              </Circle>
            </Group>
          </>
        ) : (
          <RoundedRect rect={rr}>
            <LinearGradient
              start={cssLinear(160, x, y, w, h).start}
              end={cssLinear(160, x, y, w, h).end}
              colors={FILLS[tier].colors}
              positions={FILLS[tier].positions}
            />
          </RoundedRect>
        )}

        {/* static interference bands (soft on the dark tier) */}
        <Group opacity={dark ? 0.5 : 1}>
          <RoundedRect rect={rr}>
            <LinearGradient start={film.start} end={film.end} colors={FILM_BANDS.colors} positions={FILM_BANDS.positions} />
          </RoundedRect>
        </Group>
        {sheet ? (
          <RoundedRect rect={rr}>
            <RadialGradient
              c={vec(x + w * 0.5, y + h * 0.45)}
              r={Math.max(w, h) * 0.95}
              colors={['rgba(255,255,255,0)', 'rgba(255,178,222,0.08)', 'rgba(147,208,255,0.12)', 'rgba(151,235,215,0.10)']}
              positions={[0.46, 0.7, 0.86, 0.96]}
            />
          </RoundedRect>
        ) : null}

        {/* arc gloss along the top (light tiers; skipped on iridescent mounts —
            rim + gloss stacked reads as a warped top edge) */}
        {!dark && !sheet && !iridescent ? (
          <RoundedRect rect={rr}>
            <RadialGradient
              c={vec(x + w * 0.5, y - h * 0.45)}
              r={w * 0.62}
              colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0)']}
              positions={[0.3, 0.62]}
            />
          </RoundedRect>
        ) : null}

        {/* thinking light-wipe — L→R sheen pass over the QUERY echo */}
        {dark && iridescent ? (
          <Group transform={bandTransform} blendMode="screen">
            <Rect x={x - bandW} y={y - 6} width={bandW} height={h + 12}>
              <LinearGradient
                start={vec(x - bandW, 0)}
                end={vec(x, 0)}
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
                positions={[0, 0.5, 1]}
              />
            </Rect>
          </Group>
        ) : null}

        {/* curved window speculars — kept FAINT: a bright white wash on the
            face reads as a warped/soap-scum surface, not glass */}
        {glare ? (
          <Group blendMode="screen">
            <RoundedRect rect={rr}>
              <RadialGradient
                c={vec(x + w * 0.5, y - h * 0.58)}
                r={w * 0.78}
                colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
                positions={[0.38, 0.61]}
              />
            </RoundedRect>
            <RoundedRect rect={rr}>
              <RadialGradient
                c={vec(x + w * 0.16, y - h * 0.06)}
                r={w * 0.38}
                colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
                positions={[0, 0.58]}
              />
            </RoundedRect>
            <RoundedRect rect={rr}>
              <RadialGradient
                c={vec(x + w * 0.82, y + h * 1.16)}
                r={w * 0.3}
                colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
                positions={[0, 0.6]}
              />
            </RoundedRect>
          </Group>
        ) : null}

        {/* inset light — top bevel, corner tints, bottom pool */}
        <Box box={rr} color="rgba(255,255,255,0.01)">
          {lightCatch ? (
            <BoxShadow dx={0} dy={1.5} blur={0.6} color={dark ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.62)'} inner />
          ) : null}
          <BoxShadow dx={0} dy={-1} blur={0.6} color={dark ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.35)'} inner />
          {sheet ? (
            <>
              <BoxShadow dx={0} dy={22} blur={17} color="rgba(255,255,255,0.20)" inner />
              <BoxShadow dx={-18} dy={-22} blur={20} color="rgba(202,186,250,0.16)" inner />
              <BoxShadow dx={20} dy={-28} blur={22} color="rgba(255,178,222,0.14)" inner />
              <BoxShadow dx={-14} dy={18} blur={18} color="rgba(151,214,255,0.14)" inner />
              <BoxShadow dx={0} dy={-30} blur={17} color="rgba(255,255,255,0.20)" inner />
            </>
          ) : dark ? (
            <BoxShadow dx={0} dy={-5} blur={6} color="rgba(255,255,255,0.12)" inner />
          ) : (
            <>
              <BoxShadow dx={0} dy={-5} blur={6} color="rgba(255,255,255,0.45)" inner />
              <BoxShadow dx={-8} dy={-5} blur={8} color="rgba(202,186,250,0.14)" inner />
              <BoxShadow dx={8} dy={6} blur={7} color="rgba(255,255,255,0.30)" inner />
            </>
          )}
        </Box>

        {/* second membrane wall just inside the sheet rim */}
        {sheet ? (
          <RoundedRect
            rect={rrect(rect(x + 4.5, y + 4.5, w - 9, h - 9), Math.max(rad - 4, 4), Math.max(rad - 4, 4))}
            style="stroke"
            strokeWidth={1}
            blendMode="screen"
          >
            <SweepGradient c={c} colors={INNERWALL_COLORS} transform={[{ rotate: sweepFrom(30) }]} origin={c} />
          </RoundedRect>
        ) : null}
      </Group>

      {/* rim — iridescent mounts get the holo sweep (TRUE stroke ring, never a
          full-rect gradient); everything else keeps a plain glass hairline */}
      {iridescent ? (
        <Group opacity={0.9}>
          <RoundedRect
            rect={rrect(
              rect(x + rimWidth / 2, y + rimWidth / 2, w - rimWidth, h - rimWidth),
              Math.max(rad - rimWidth / 2, 1),
              Math.max(rad - rimWidth / 2, 1)
            )}
            style="stroke"
            strokeWidth={rimWidth}
          >
            <SweepGradient
              c={c}
              colors={HOLO_RIM.colors}
              positions={HOLO_RIM.positions}
              transform={rimTransform}
              origin={c}
            />
          </RoundedRect>
        </Group>
      ) : (
        <RoundedRect
          rect={rrect(
            rect(x + rimWidth / 2, y + rimWidth / 2, w - rimWidth, h - rimWidth),
            Math.max(rad - rimWidth / 2, 1),
            Math.max(rad - rimWidth / 2, 1)
          )}
          style="stroke"
          strokeWidth={rimWidth}
          color={dark ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.65)'}
        />
      )}
    </>
  );
}

export function GlassBase({
  tier = 'card',
  radius = r.card,
  glare = false,
  lightCatch = true,
  iridescent = false,
  shadow,
  style,
  contentStyle,
  children,
}: GlassBaseProps): React.JSX.Element {
  const spec = glassTiers[tier];
  const reduced = useReducedMotion();
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const shadowStyle: ViewStyle | null =
    shadow === false ? null : (shadow ?? (iridescent ? shadows.iridescent : spec.shadow));
  const bleed = tier === 'sheet' ? 64 : 36;
  const rad = size.h > 0 ? Math.min(radius, size.h / 2, size.w / 2) : radius;

  return (
    <View
      style={[{ borderRadius: radius }, shadowStyle, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      }}
    >
      <View style={[StyleSheet.absoluteFill, { borderRadius: rad, overflow: 'hidden' }]}>
        <BlurView
          intensity={spec.intensity}
          tint={spec.tint}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
      </View>
      {size.w > 0 && size.h > 0 ? (
        <Canvas
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -bleed,
            top: -bleed,
            width: size.w + bleed * 2,
            height: size.h + bleed * 2,
          }}
        >
          <GlassPaint
            w={size.w}
            h={size.h}
            bleed={bleed}
            rad={rad}
            tier={tier}
            iridescent={iridescent}
            glare={glare}
            lightCatch={lightCatch}
            reduced={reduced}
          />
        </Canvas>
      ) : null}
      {/* content clips to the surface so absolute-fill overlays (Chip hl) stay rounded */}
      <View style={[{ borderRadius: rad, overflow: 'hidden' }, contentStyle]}>{children}</View>
    </View>
  );
}
