// AURADIN DS 컴포넌트 (RN 근사) — 출처: AURADIN Design System/components/** + ui_kits/*.jsx.
// 글라스 = expo-blur BlurView + 이중 보더/그라디언트 오버레이 + 바이올렛 섀도 근사.
// 팔레트는 auradinTokens(로컬)만 사용 — 전역 shared/theme에 유입 금지.

import {type ReactNode, useEffect, useRef} from 'react';
import {Animated, Easing, Image, Pressable, StyleSheet, Text, View, type ViewStyle} from 'react-native';
import {BlurView} from 'expo-blur';
import {LinearGradient} from 'expo-linear-gradient';

import {typography} from '../../../shared/theme';
import {auBlur, auColors, auGlassShadow, auGroundStops, auRadius, auType} from '../theme/auradinTokens';

// ------------------------------------------------------------------ Ground

export function AuradinGround({darkOpacity}: {darkOpacity: Animated.Value}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={auGroundStops.light.colors}
        locations={auGroundStops.light.locations}
        style={StyleSheet.absoluteFill}
      />
      {/* 라이트 지반 위 헤이즈 블롭 (blur 근사: 저불투명 라운드 뷰) */}
      <View style={styles.hazeA} />
      <View style={styles.hazeB} />
      {/* searching 다크 몰입 베일 — 오브는 이 위에 그려져 빛난다 */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {opacity: darkOpacity}]}>
        <LinearGradient
          colors={auGroundStops.dark.colors}
          locations={auGroundStops.dark.locations}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

// ------------------------------------------------------------------ Wordmark / StatusBar

export function Wordmark({dark, small, onPress}: {dark?: boolean; small?: boolean; onPress?: () => void}) {
  const label = (
    <Text
      style={[
        styles.wordmark,
        small && styles.wordmarkSmall,
        {color: dark ? auColors.inkInverse : auColors.ink},
      ]}>
      AURADIN
    </Text>
  );
  if (!onPress) {
    return label;
  }
  return (
    <Pressable accessibilityLabel="처음으로" hitSlop={8} onPress={onPress}>
      {label}
    </Pressable>
  );
}

export function StatusDot() {
  return <View style={styles.statusDot} />;
}

// ------------------------------------------------------------------ Glass surfaces

type GlassCardProps = {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  radius?: number;
  padding?: number;
  intensity?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
};

export function GlassCard({
  children,
  style,
  radius = auRadius.card,
  padding = 14,
  intensity = auBlur.sheet,
  onPress,
  accessibilityLabel,
}: GlassCardProps) {
  const body = (
    <View style={[styles.glassOuter, {borderRadius: radius}, auGlassShadow, style]}>
      <BlurView intensity={intensity} style={[styles.glassClip, {borderRadius: radius}]} tint="light">
        <LinearGradient
          colors={[auColors.glassFillTop, auColors.glassFillMid, auColors.glassFillBottom]}
          end={{x: 0.8, y: 1}}
          locations={[0, 0.48, 1]}
          start={{x: 0.2, y: 0}}
          style={StyleSheet.absoluteFill}
        />
        {/* 엣지 글레어 (대각 하이라이트 근사) */}
        <LinearGradient
          colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
          end={{x: 0.35, y: 0.4}}
          pointerEvents="none"
          start={{x: 0, y: 0}}
          style={StyleSheet.absoluteFill}
        />
        <View style={{padding}}>{children}</View>
      </BlurView>
    </View>
  );
  if (!onPress) {
    return body;
  }
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({pressed}) => (pressed ? styles.pressedCard : undefined)}>
      {body}
    </Pressable>
  );
}

// ------------------------------------------------------------------ Badge / Chip

export function Badge({label, tone = 'dark'}: {label: string; tone?: 'dark' | 'ink'}) {
  if (tone === 'ink') {
    return (
      <View style={[styles.badge, styles.badgeInk]}>
        <Text style={[styles.badgeText, {color: auColors.inkSoft}]}>{label}</Text>
      </View>
    );
  }
  return (
    <LinearGradient
      colors={[auColors.badgeDarkTop, auColors.badgeDarkBottom]}
      style={[styles.badge, styles.badgeDark]}>
      <Text style={[styles.badgeText, {color: auColors.inkInverse}]}>{label}</Text>
    </LinearGradient>
  );
}

export function Chip({
  label,
  onPress,
  highlighted,
  disabled,
}: {
  label: string;
  onPress: () => void;
  highlighted?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.chip,
        highlighted && styles.chipHl,
        pressed && {transform: [{scale: 0.96}]},
        disabled && {opacity: 0.55},
      ]}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

// ------------------------------------------------------------------ CTA / Heart / Toast

export function CTAButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <View style={[styles.cta, styles.ctaDisabled]}>
        <Text style={[styles.ctaText, {color: auColors.inkFaint}]}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({pressed}) => [pressed && {transform: [{scale: 0.96}]}, {flex: 1}]}>
      <LinearGradient
        colors={[auColors.ctaFrom, auColors.ctaMid, auColors.ctaTo]}
        end={{x: 1, y: 1}}
        locations={[0, 0.38, 1]}
        start={{x: 0, y: 0}}
        style={styles.cta}>
        <Text style={[styles.ctaText, {color: auColors.inkInverse}]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function HeartButton({liked, onToggle}: {liked: boolean; onToggle: () => void}) {
  return (
    <Pressable
      accessibilityLabel={liked ? '보관 해제' : '보관함에 담기'}
      accessibilityState={{selected: liked}}
      onPress={onToggle}
      style={({pressed}) => [styles.heartWrap, pressed && {transform: [{scale: 0.88}]}]}>
      <Text style={[styles.heartGlyph, {color: liked ? auColors.heart : auColors.inkFaint}]}>
        {liked ? '♥' : '♡'}
      </Text>
    </Pressable>
  );
}

export function Toast({visible, label}: {visible: boolean; label: string}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [anim, visible]);
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={[
        styles.toast,
        {
          opacity: anim,
          transform: [{translateY: anim.interpolate({inputRange: [0, 1], outputRange: [8, 0]})}],
        },
      ]}>
      <GlassCard padding={0} radius={auRadius.pill}>
        <Text style={styles.toastText}>{label}</Text>
      </GlassCard>
    </Animated.View>
  );
}

// ------------------------------------------------------------------ Product bits

export function PaletteSwatches({colors: swatches, size = 16}: {colors: string[]; size?: number}) {
  return (
    <View style={{flexDirection: 'row'}}>
      {swatches.slice(0, 4).map((color, index) => (
        <View
          key={`${color}-${index}`}
          style={[
            styles.swatch,
            {
              backgroundColor: color,
              borderRadius: size / 2,
              height: size,
              marginLeft: index ? -5 : 0,
              width: size,
            },
          ]}
        />
      ))}
    </View>
  );
}

export function ProductThumb({
  uri,
  palette,
  height,
  radius = auRadius.md,
}: {
  uri?: string;
  palette: string[];
  height: number;
  radius?: number;
}) {
  if (uri) {
    return (
      <Image
        resizeMode="cover"
        source={{uri}}
        style={{backgroundColor: '#ffffff', borderRadius: radius, height, width: '100%'}}
      />
    );
  }
  // 이미지가 없으면 팔레트 그라디언트 — 회색 박스 금지 (DS 규칙)
  const stops = palette.length >= 2 ? palette : [auColors.pink, auColors.sky];
  return (
    <LinearGradient
      colors={stops as [string, string, ...string[]]}
      end={{x: 1, y: 1}}
      start={{x: 0, y: 0}}
      style={{borderRadius: radius, height, width: '100%'}}
    />
  );
}

const styles = StyleSheet.create({
  hazeA: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 140,
    height: 200,
    left: -90,
    opacity: 0.55,
    position: 'absolute',
    top: 110,
    width: 280,
  },
  hazeB: {
    backgroundColor: 'rgba(251,227,238,0.6)',
    borderRadius: 130,
    height: 220,
    opacity: 0.6,
    position: 'absolute',
    right: -80,
    top: 300,
    width: 260,
  },
  wordmark: {
    fontFamily: auType.mono,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 4.2,
  },
  wordmarkSmall: {fontSize: 11.5, letterSpacing: 3.4},
  statusDot: {
    backgroundColor: auColors.magenta,
    borderRadius: 3,
    height: 6,
    shadowColor: auColors.magenta,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.7,
    shadowRadius: 6,
    width: 6,
  },
  glassOuter: {
    borderColor: auColors.glassBorder,
    borderWidth: 1,
  },
  glassClip: {overflow: 'hidden'},
  pressedCard: {opacity: 0.92, transform: [{scale: 0.97}]},
  badge: {
    alignItems: 'center',
    borderRadius: auRadius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeDark: {borderColor: 'rgba(255,255,255,0.25)', borderWidth: 1},
  badgeInk: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderColor: auColors.glassBorder,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: auType.mono,
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.34)',
    borderColor: auColors.glassBorder,
    borderRadius: auRadius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipHl: {backgroundColor: 'rgba(176,108,240,0.18)', borderColor: 'rgba(176,108,240,0.4)'},
  chipText: {color: auColors.ink, fontFamily: typography.fontFamily.semibold, fontSize: 12.5},
  cta: {
    alignItems: 'center',
    borderRadius: auRadius.pill,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 15,
  },
  ctaDisabled: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderColor: auColors.glassBorder,
    borderWidth: 1,
    flex: 1,
  },
  ctaText: {fontFamily: typography.fontFamily.semibold, fontSize: 14.5},
  heartWrap: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  heartGlyph: {fontSize: 21},
  toast: {alignItems: 'center', bottom: 28, left: 0, position: 'absolute', right: 0},
  toastText: {
    color: auColors.ink,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 12.5,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  swatch: {
    borderColor: '#ffffff',
    borderWidth: 1.6,
    shadowColor: auColors.ink,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
});
