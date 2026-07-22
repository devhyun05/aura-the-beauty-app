// AURADIN — Narrowing question as tappable representative-product/photo tiles,
// with deterministic swatches when a matching catalog photo is unavailable.
// Tapping advances immediately; the first option with neither visual is skip.
// Recreated from prompts/2-question.md.
import * as React from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font, layout, text, tracking } from '../../theme/auradinTokens';
import type { AuradinQuestionOption } from '../../types';
import { Composer, SwatchTile, useEnterTransition, Wordmark } from '../../components/ds';

export type QuestionViewProps = {
  title: string;
  options: AuradinQuestionOption[];
  onPick: (optionId: string) => void;
  onFreeText: (value: string) => void;
  onHome: () => void;
};

export function QuestionView({
  title,
  options,
  onPick,
  onFreeText,
  onHome,
}: QuestionViewProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const enter = useEnterTransition(12);
  const [draft, setDraft] = React.useState('');

  const tiles = options.filter((o) => o.swatch || o.imageUrl);
  const skip = options.find((o) => !o.swatch && !o.imageUrl);

  const sendFree = () => {
    const v = draft.trim();
    if (v) onFreeText(v);
  };

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
        <View style={{ alignItems: 'flex-start' }}>
          <Wordmark onHome={onHome} />
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          {/* eyebrow — the screen's one magenta emphasis */}
          <Text
            style={{
              textAlign: 'center',
              fontFamily: font.mono,
              fontWeight: '700',
              fontSize: 10.5,
              letterSpacing: tracking(10.5, 0.22),
              textTransform: 'uppercase',
              color: color.magenta,
            }}
            allowFontScaling={false}
          >
            거의 다 왔어요
          </Text>
          <Text
            style={[text.title, { marginTop: 12, textAlign: 'center', lineHeight: 32 }]}
            accessibilityRole="header"
          >
            {title}
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 30 }}>
            {tiles.map((o) => (
              <SwatchTile
                key={o.id}
                imageUrl={o.imageUrl}
                swatch={o.swatch ?? color.swatchNeutral}
                label={o.label}
                onPick={() => onPick(o.id)}
                style={{ flexGrow: 1, flexBasis: '40%' }}
              />
            ))}
          </View>

          {skip ? (
            <Pressable
              onPress={() => onPick(skip.id)}
              accessibilityRole="button"
              accessibilityLabel={`${skip.label} 선택`}
              hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
              style={{ alignSelf: 'center', marginTop: 22 }}
            >
              <Text
                style={{
                  fontFamily: font.sans,
                  fontSize: 13,
                  color: color.inkSoft,
                  textDecorationLine: 'underline',
                }}
                allowFontScaling={false}
              >
                {skip.label}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={sendFree}
          placeholder="직접 답해도 좋아요"
        />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
