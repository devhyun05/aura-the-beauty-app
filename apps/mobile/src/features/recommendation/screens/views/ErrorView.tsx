// AURADIN — Search failure / recovery. Plain, non-blaming one line + a single
// "start over" path. Enters STATICALLY (no fade — per spec). Light ground; the
// residual orb (host) sits above the message. Never shows error codes.
// Recreated from prompts/6-error.md.
import * as React from 'react';
import { StatusBar as RNStatusBar, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font, layout } from '../../theme/auradinTokens';
import { CTAButton, Wordmark } from '../../components/ds';

export type ErrorViewProps = {
  /** turn.error.message — UI shows ONLY the message (never code/recoverable) */
  message?: string;
  onHome: () => void;
};

export function ErrorView({ message, onHome }: ErrorViewProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top + layout.padTopExtra,
        paddingHorizontal: layout.padH,
        paddingBottom: Math.max(insets.bottom, layout.padBottom),
      }}
    >
      <RNStatusBar barStyle="dark-content" animated />
      <View style={{ alignItems: 'flex-start' }}>
        <Wordmark onHome={onHome} />
      </View>
      <View
        style={{
          flex: 1,
          minHeight: 420,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
        }}
      >
        {/* the small residual orb floats here (host-mounted, phase="failed") */}
        <View style={{ height: 150 }} />
        <Text
          style={{
            fontFamily: font.sans,
            fontSize: 13.5,
            lineHeight: 23,
            color: color.inkSoft,
            textAlign: 'center',
            maxWidth: 250,
          }}
          accessibilityLiveRegion="polite"
        >
          {message ?? '검색을 완료하지 못했어요.'}
        </Text>
        <CTAButton
          label="처음부터 다시"
          onPress={onHome}
          paddingVertical={13}
          paddingHorizontal={26}
          style={{ alignSelf: 'center' }}
        />
      </View>
    </View>
  );
}
