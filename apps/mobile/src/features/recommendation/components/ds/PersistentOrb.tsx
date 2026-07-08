// AURADIN — THE ORB. The agent itself: an irregular soap-bubble membrane
// (thin-film interference rim · liquid sheen · curved reflections · caustic
// ring · two floating satellite bubbles), breathing scale + slow float.
//
// SHARED ELEMENT: mount exactly ONE PersistentOrb per app, above <AuradinGround>
// and below the screen view. Phase changes only MORPH position/scale/glow —
// the component never remounts and never hard-cuts:
//
//   <AuradinGround dark={phase === 'searching'} …>
//     <PersistentOrb phase={phase} />
//     {currentView}
//   </AuradinGround>
//
// Rendering: expo-gl + three@0.128 (shaders in orbShaders.ts, scene in
// OrbGLCanvas.tsx). The magenta thinking glow is a TARGET the GL loop lerps a
// uniform toward; the big soft halo aura stays SVG behind the canvas. If GL
// init/render fails, the orb swaps to the layered-SVG artwork below — same
// footprint, same morphs, never a blank. paused / reduced-motion freeze every
// loop (GL RAF included) on a stable frame.
// On results/detail/saved it recedes to a small top-right aura so it can't
// overlap the title on small screens.
import * as React from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, RadialGradient, Stop } from 'react-native-svg';
import { color, motion } from '../../theme/auradinTokens';
import type { AuradinPhase } from '../../types';
import { useReducedMotion } from './motion';

type OrbPhaseSpec = {
  /** center, as fraction of screen width/height */
  cx: number;
  cy: number;
  scale: number;
  /** magenta thinking-glow strength 0–1 */
  glow: number;
  opacity: number;
};

/** Morph targets per phase (mirrors the web kit's ORB_BY_PHASE). */
export const ORB_BY_PHASE: Record<AuradinPhase, OrbPhaseSpec> = {
  home: { cx: 0.5, cy: 0.51, scale: 1, glow: 0, opacity: 1 }, // entry v3: optically mid, between headline and sheet
  searching: { cx: 0.5, cy: 0.44, scale: 1.18, glow: 1, opacity: 1 },
  question: { cx: 0.5, cy: 0.22, scale: 0.5, glow: 0, opacity: 0.95 },
  results: { cx: 0.5, cy: 0.1, scale: 0.42, glow: 0, opacity: 0.9 },
  detail: { cx: 0.5, cy: 0.1, scale: 0.4, glow: 0, opacity: 0.85 },
  saved: { cx: 0.5, cy: 0.1, scale: 0.45, glow: 0, opacity: 0.9 },
  failed: { cx: 0.5, cy: 0.4, scale: 0.62, glow: 0.25, opacity: 1 },
};

// Canvas/artwork box: sphere Ø196 centered in a 430 box (room for halo,
// caustic ring and the satellite bubbles). OrbGLCanvas' camera is proportioned
// to the same 196/430 footprint, so GL and SVG fallback morph identically.
const BOX = 430;
const C = BOX / 2; // 215
const R = 98;

/** Layered-SVG fallback artwork (pre-GL orb) — used only when GL fails. */
function OrbArtwork(): React.JSX.Element {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${BOX} ${BOX}`}>
      <Defs>
        <RadialGradient id="auOrbCore" gradientUnits="userSpaceOnUse" cx={198} cy={192} r={132}>
          <Stop offset="0" stopColor="#7A5CC4" stopOpacity="0.9" />
          <Stop offset="0.5" stopColor="#8E6ED2" stopOpacity="0.62" />
          <Stop offset="0.8" stopColor="#B4A0E8" stopOpacity="0.34" />
          <Stop offset="1" stopColor={color.orbLavender} stopOpacity="0.12" />
        </RadialGradient>
        <RadialGradient id="auOrbLav" gradientUnits="userSpaceOnUse" cx={205} cy={140} r={105}>
          <Stop offset="0" stopColor={color.orbLavender} stopOpacity="0.62" />
          <Stop offset="1" stopColor={color.orbLavender} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="auOrbPnk" gradientUnits="userSpaceOnUse" cx={286} cy={222} r={112}>
          <Stop offset="0" stopColor={color.orbPink} stopOpacity="0.6" />
          <Stop offset="1" stopColor={color.orbPink} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="auOrbTea" gradientUnits="userSpaceOnUse" cx={150} cy={292} r={108}>
          <Stop offset="0" stopColor={color.orbTeal} stopOpacity="0.55" />
          <Stop offset="1" stopColor={color.orbTeal} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="auOrbCya" gradientUnits="userSpaceOnUse" cx={148} cy={162} r={96}>
          <Stop offset="0" stopColor={color.orbCyan} stopOpacity="0.5" />
          <Stop offset="1" stopColor={color.orbCyan} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="auOrbGld" gradientUnits="userSpaceOnUse" cx={262} cy={296} r={94}>
          <Stop offset="0" stopColor={color.orbGold} stopOpacity="0.55" />
          <Stop offset="1" stopColor={color.orbGold} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="auOrbBtm" gradientUnits="userSpaceOnUse" cx={C} cy={302} r={92}>
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.3" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="auOrbRim" gradientUnits="userSpaceOnUse" cx={C} cy={C} r={R}>
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.72" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.84" stopColor={color.orbPink} stopOpacity="0.25" />
          <Stop offset="0.93" stopColor={color.orbLavender} stopOpacity="0.65" />
          <Stop offset="0.975" stopColor="#FFFFFF" stopOpacity="0.85" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="auOrbSpec" gradientUnits="userSpaceOnUse" cx={176} cy={152} r={42}>
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.32" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="auOrbSpec2" gradientUnits="userSpaceOnUse" cx={258} cy={264} r={24}>
          <Stop offset="0" stopColor="#E9FFF8" stopOpacity="0.75" />
          <Stop offset="1" stopColor="#E9FFF8" stopOpacity="0" />
        </RadialGradient>
        <ClipPath id="auOrbClip">
          <Circle cx={C} cy={C} r={R} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#auOrbClip)">
        <Circle cx={C} cy={C} r={R} fill="url(#auOrbCore)" />
        <Circle cx={C} cy={C} r={R} fill="url(#auOrbLav)" />
        <Circle cx={C} cy={C} r={R} fill="url(#auOrbPnk)" />
        <Circle cx={C} cy={C} r={R} fill="url(#auOrbTea)" />
        <Circle cx={C} cy={C} r={R} fill="url(#auOrbCya)" />
        <Circle cx={C} cy={C} r={R} fill="url(#auOrbGld)" />
        <Circle cx={C} cy={C} r={R} fill="url(#auOrbBtm)" />
        <Circle cx={C} cy={C} r={R} fill="url(#auOrbRim)" />
        <G rotation={-18} origin="176,152">
          <Ellipse cx={176} cy={152} rx={40} ry={26} fill="url(#auOrbSpec)" />
        </G>
        <G rotation={24} origin="258,264">
          <Ellipse cx={258} cy={264} rx={18} ry={11} fill="url(#auOrbSpec2)" />
        </G>
      </G>
    </Svg>
  );
}

type HaloStop = { offset: string; color: string; opacity: string };
const HALO_STOPS: Record<'ambient' | 'glow', HaloStop[]> = {
  // faint violet aura — always on, so the orb never reads as a hard-edged disc
  ambient: [
    { offset: '0', color: color.violet, opacity: '0.28' },
    { offset: '0.45', color: color.violet, opacity: '0.14' },
    { offset: '0.72', color: color.violet, opacity: '0' },
  ],
  // magenta thinking focus (searching) — rgba(224,72,156,.45) soft radial
  glow: [
    { offset: '0', color: color.magenta, opacity: '0.5' },
    { offset: '0.42', color: color.violet, opacity: '0.22' },
    { offset: '0.7', color: color.violet, opacity: '0' },
  ],
};

/** Soft radial halo (never hard-edged). */
function Halo({ kind }: { kind: 'ambient' | 'glow' }): React.JSX.Element {
  const id = kind === 'ambient' ? 'auHaloAmb' : 'auHaloGlow';
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${BOX} ${BOX}`} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={id} gradientUnits="userSpaceOnUse" cx={C} cy={C} r={C}>
          {HALO_STOPS[kind].map((s) => (
            <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
          ))}
        </RadialGradient>
      </Defs>
      <Circle cx={C} cy={C} r={C} fill={`url(#${id})`} />
    </Svg>
  );
}

export type PersistentOrbProps = {
  phase: AuradinPhase;
  /** blob diameter at scale 1 (default: 36% of screen width, ≤155 — AppScreen framing) */
  diameter?: number;
  /** host pause (e.g. AppState background) — freezes GL + idle loops */
  paused?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function PersistentOrb({ phase, diameter, paused = false, style }: PersistentOrbProps): React.JSX.Element {
  const { width: W, height: H } = useWindowDimensions();
  const reduced = useReducedMotion();
  const frozen = reduced || paused;
  const dia = diameter ?? Math.min(W * 0.36, 155);
  const box = dia * (BOX / (R * 2)); // halo/canvas box in px

  const spec = ORB_BY_PHASE[phase];
  const tx = React.useRef(new Animated.Value(spec.cx * W - box / 2)).current;
  const ty = React.useRef(new Animated.Value(spec.cy * H - box / 2)).current;
  const scale = React.useRef(new Animated.Value(spec.scale)).current;
  const opacity = React.useRef(new Animated.Value(spec.opacity)).current;
  const glow = React.useRef(new Animated.Value(spec.glow)).current;
  const breath = React.useRef(new Animated.Value(1)).current;
  const float = React.useRef(new Animated.Value(0)).current;
  const glowPulse = React.useRef(new Animated.Value(1)).current;

  // Phase morph — position/scale/glow only; the orb itself never remounts.
  React.useEffect(() => {
    const s = ORB_BY_PHASE[phase];
    const dur = reduced ? 0 : motion.durMorph;
    Animated.parallel([
      Animated.timing(tx, { toValue: s.cx * W - box / 2, duration: dur, easing: motion.easeLiquid, useNativeDriver: true }),
      Animated.timing(ty, { toValue: s.cy * H - box / 2, duration: dur, easing: motion.easeLiquid, useNativeDriver: true }),
      Animated.timing(scale, { toValue: s.scale, duration: dur, easing: motion.easeLiquid, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: s.opacity, duration: dur, easing: motion.easeLiquid, useNativeDriver: true }),
      Animated.timing(glow, { toValue: s.glow, duration: reduced ? 0 : motion.durVeil, useNativeDriver: true }),
    ]).start();
  }, [W, H, box, glow, opacity, phase, reduced, scale, tx, ty]);

  // Idle life: breathing scale + slow float + halo glow pulse (frozen on
  // reduced motion or host pause — the GL loop freezes via the same flag).
  React.useEffect(() => {
    if (frozen) {
      breath.setValue(1);
      float.setValue(0);
      glowPulse.setValue(1);
      return;
    }
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(breath, { toValue: 1.045, duration: 1600, useNativeDriver: true }),
          Animated.timing(breath, { toValue: 1, duration: 1600, useNativeDriver: true }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(float, { toValue: -4, duration: 2400, useNativeDriver: true }),
          Animated.timing(float, { toValue: 4, duration: 2400, useNativeDriver: true }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowPulse, { toValue: 0.72, duration: 1400, useNativeDriver: true }),
          Animated.timing(glowPulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        ])
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [breath, float, frozen, glowPulse]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={{
          position: 'absolute',
          width: box,
          height: box,
          opacity,
          transform: [
            { translateX: tx },
            { translateY: Animated.add(ty, float) },
            { scale: Animated.multiply(scale, breath) },
          ],
        }}
      >
        <Halo kind="ambient" />
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: Animated.multiply(glow, glowPulse) }]}>
          <Halo kind="glow" />
        </Animated.View>
        <OrbArtwork />
      </Animated.View>
    </View>
  );
}
