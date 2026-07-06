import {StyleSheet} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

/**
 * 커버 이미지 하단에 깔리는 스크림 그라데이션.
 * 스펙: 투명 → communityColors.scrimEnd(rgba(17,17,17,0.65)), 기본 하단 45%.
 * 그라데이션 id는 같은 Svg 루트 안에서만 해석되므로 인스턴스 간 충돌이 없다.
 */
export function ScrimOverlay({heightRatio = 0.45}: {heightRatio?: number}) {
  return (
    <Svg
      pointerEvents="none"
      preserveAspectRatio="none"
      style={[styles.scrim, {height: `${Math.round(heightRatio * 100)}%`}]}
      viewBox="0 0 1 1">
      <Defs>
        <LinearGradient id="community-scrim" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#111111" stopOpacity="0" />
          <Stop offset="1" stopColor="#111111" stopOpacity="0.65" />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#community-scrim)" height="1" width="1" x="0" y="0" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  scrim: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
