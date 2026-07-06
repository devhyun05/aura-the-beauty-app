// AURADIN — Searching / reasoning wait state. The ONLY dark screen: deep-navy
// immersion, orb forward + glowing magenta (host morphs it), calm copy.
// Wordmark is the only exit. Recreated from prompts/1-searching.md.
//
// Host notes: keep this phase visible ≥ ~2300ms (initial) / ~1700ms (after an
// answer) even on an instant backend reply — calm, no flicker. Leaving always
// lifts the veil back to a LIGHT screen.
import * as React from 'react';
import {
  Animated,
  StatusBar as RNStatusBar,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font, layout, tracking } from '../../theme/auradinTokens';
import type { ThinkingStep } from '../../types';
import {
  GlassBase,
  LoaderDots,
  ThinkingSteps,
  useEnterTransition,
  Wordmark,
} from '../../components/ds';

export type SearchingViewProps = {
  query: string;
  /** false = first search ("색을 읽는 중") · true = after a question answer */
  answering: boolean;
  onHome: () => void;
};

/** Hardcoded 3 steps (per spec). */
const STEPS: ThinkingStep[] = [
  { label: '색감과 조건 정리', state: 'done' },
  { label: '어울리는 후보 좁히는 중', state: 'active' },
  { label: '구매 링크 확인', state: 'pending' },
];

export function SearchingView({ query, answering, onHome }: SearchingViewProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const enter = useEnterTransition(12);
  return (
    <Animated.View
      style={[
        {
          flex: 1,
          paddingTop: insets.top + layout.padTopExtra,
          paddingHorizontal: layout.padH,
          paddingBottom: Math.max(insets.bottom, layout.padBottom),
        },
        enter,
      ]}
    >
      <RNStatusBar barStyle="light-content" animated />
      <View style={{ alignItems: 'flex-start' }}>
        <Wordmark dark onHome={onHome} />
      </View>

      {/* query echo pill */}
      <View style={{ marginTop: 26, alignItems: 'center' }}>
        <GlassBase
          tier="dark"
          radius={999}
          style={{ maxWidth: '100%' }}
          contentStyle={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 9,
            paddingHorizontal: 16,
          }}
        >
          <Text
            style={{
              fontFamily: font.mono,
              fontSize: 9,
              letterSpacing: tracking(9, 0.16),
              color: 'rgba(255,255,255,0.4)',
            }}
            allowFontScaling={false}
          >
            QUERY
          </Text>
          <Text
            style={{ fontFamily: font.sans, fontSize: 12.5, color: color.inkInverse, flexShrink: 1 }}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {query}
          </Text>
        </GlassBase>
      </View>

      {/* the glowing orb floats here (host-mounted PersistentOrb, phase="searching") */}
      <View style={{ flex: 1 }} />

      <View style={{ alignItems: 'center', gap: 22, paddingBottom: 34 }}>
        <LoaderDots
          tone="light"
          label={answering ? '딱 맞는 컬러를 고르는 중' : '아우라딘이 색을 읽는 중'}
        />
        <ThinkingSteps steps={STEPS} />
      </View>
    </Animated.View>
  );
}
