// AURADIN — Home (entry). Serif hero + orb zone + bottom glass sheet
// (composer + suggestion chips + terminal meta). Recreated from the
// AppScreen entry-v3 redesign: clean-gradient ground (no photo), milk-glass
// sheet/composer, UNIFORM chips (the violet `hl` tint was retired — no
// iridescent rims on home; the send gem is the screen's one emphasis).
import * as React from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, text, tracking } from '../../theme/auradinTokens';
import {
  Chip,
  Composer,
  GlassSheet,
  StatusBarRow,
  useEnterTransition,
} from '../../components/ds';

export type HomeViewProps = {
  query: string;
  setQuery: (v: string) => void;
  onSubmit: () => void;
  onPickSuggestion: (label: string) => void;
  savedCount: number;
  onOpenSaved?: () => void;
};

/** Suggestion chips — Korean conversational fragments (brand copy, fixed). */
const SUGGESTIONS = ['쿨톤 글로시 립', '면접용 블러셔', '올리브영에서만'] as const;

export function HomeView({
  query,
  setQuery,
  onSubmit,
  onPickSuggestion,
  savedCount,
  onOpenSaved,
}: HomeViewProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const enter = useEnterTransition(12);
  const heroSize = W < 360 ? 46 : 53; // small-screen tolerance

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <RNStatusBar barStyle="dark-content" animated />
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
        <StatusBarRow />
        {onOpenSaved ? (
          <Pressable
            onPress={onOpenSaved}
            accessibilityRole="button"
            accessibilityLabel={`보관함, ${savedCount}개`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ alignSelf: 'flex-end', marginTop: 10 }}
          >
            <Text style={[text.meta, { textDecorationLine: 'underline' }]} allowFontScaling={false}>
              보관함 · {savedCount}
            </Text>
          </Pressable>
        ) : null}

        <Text
          style={[
            text.hero,
            {
              marginTop: onOpenSaved ? 12 : 30,
              fontSize: heroSize,
              lineHeight: Math.round(heroSize * 1.08),
              letterSpacing: tracking(heroSize, -0.035),
            },
          ]}
          accessibilityRole="header"
        >
          Find your{'\n'}own Cosmetic.
        </Text>
        <Text style={[text.heroSub, { marginTop: 14 }]}>
          색·질감·예산 — 편하게 말하면 아우라딘이 찾아드려요.
        </Text>

        {/* orb zone — the PersistentOrb (mounted by the host) floats here on home */}
        <View style={{ flex: 1, minHeight: 180 }} />

        <GlassSheet style={{ marginHorizontal: -layout.sheetBleed }}>
          <Composer value={query} onChangeText={setQuery} onSend={onSubmit} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {SUGGESTIONS.map((label) => (
              <Chip
                key={label}
                label={label}
                on={query === label}
                onPress={() => onPickSuggestion(label)}
              />
            ))}
          </View>
          {/* sheet meta — terminal voice */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: 12,
            }}
          >
            <Text style={text.metaSm} allowFontScaling={false}>
              {'> user_input'}
            </Text>
            <Text style={text.metaSm} allowFontScaling={false}>
              SESSION 001 · KR
            </Text>
          </View>
        </GlassSheet>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
