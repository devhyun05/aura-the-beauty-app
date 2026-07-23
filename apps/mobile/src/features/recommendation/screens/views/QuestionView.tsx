// AURADIN narrowing question screen.
// Every non-noop option remains tappable; only an explicit noop becomes the skip link.
import * as React from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {color, font, layout, text, tracking} from '../../theme/auradinTokens';
import type {AuradinQuestionAttribute, AuradinQuestionCategory, AuradinQuestionOption} from '../../types';
import {Composer, SwatchTile, useEnterTransition, Wordmark} from '../../components/ds';
import {resolveAuradinQuestionVisual} from '../../services/auradinQuestionVisual';

export type QuestionViewProps = {
  title: string;
  attribute?: AuradinQuestionAttribute;
  contextCategory?: AuradinQuestionCategory;
  options: AuradinQuestionOption[];
  onPick: (optionId: string) => void;
  onFreeText: (value: string) => void;
  onHome: () => void;
};

const CATEGORY_CONTEXT_LABEL: Record<AuradinQuestionCategory, string> = {
  lip: '\uc785\uc220',
  cheek: '\ubcfc',
  shadow: '\ub208\ub450\ub369',
  base: '\ud53c\ubd80',
  brow: '\ub208\uc379',
  liner: '\ub208\ub9e4',
};

const MAX_TILE_GRID_WIDTH = 386;
const SINGLE_TILE_MAX_WIDTH = 240;
const DEFAULT_TILE_GAP = 12;
const THREE_COLUMN_TILE_GAP = 8;

function getTileColumnCount(optionCount: number): 1 | 2 | 3 {
  if (optionCount <= 1) {
    return 1;
  }
  if (optionCount === 3) {
    return 3;
  }
  return 2;
}

function getQuestionContextCopy(
  attribute?: AuradinQuestionAttribute,
  contextCategory?: AuradinQuestionCategory,
): string | null {
  if (!contextCategory) {
    return null;
  }

  const categoryLabel = CATEGORY_CONTEXT_LABEL[contextCategory];
  if (attribute === 'finish') {
    return categoryLabel + '\uc5d0 \uc801\uc6a9\ud588\uc744 \ub54c \ubcf4\uc774\ub294 \ub9c8\ubb34\ub9ac \ucc28\uc774\uc608\uc694.';
  }

  if (attribute === 'texture') {
    return categoryLabel + ' \uc81c\ud488\uc758 \uc81c\ud615\uacfc \uc0ac\uc6a9\uac10\uc744 \uace8\ub77c\uc8fc\uc138\uc694. \uc81c\ud615\ub9cc\uc73c\ub85c \uad11\ud0dd\uc774 \uc815\ud574\uc9c0\uc9c0\ub294 \uc54a\uc544\uc694.';
  }

  return null;
}

export function QuestionView({
  title,
  attribute,
  contextCategory,
  options,
  onPick,
  onFreeText,
  onHome,
}: QuestionViewProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const {width: viewportWidth} = useWindowDimensions();
  const enter = useEnterTransition(12);
  const [draft, setDraft] = React.useState('');

  const resolvedOptions = options.map((option) => ({
    option,
    visual: resolveAuradinQuestionVisual(option, {attribute}),
  }));
  const tiles = resolvedOptions.filter(({visual}) => visual.kind !== 'noop');
  const skip = resolvedOptions.find(({visual}) => visual.kind === 'noop');
  const isPriceQuestion = attribute === 'priceTier';
  const tileColumnCount = isPriceQuestion ? 1 : getTileColumnCount(tiles.length);
  const tileGap = tileColumnCount === 3 ? THREE_COLUMN_TILE_GAP : DEFAULT_TILE_GAP;
  const availableGridWidth = Math.max(0, viewportWidth - layout.padH * 2);
  const maxGridWidth =
    !isPriceQuestion && tileColumnCount === 1 ? SINGLE_TILE_MAX_WIDTH : MAX_TILE_GRID_WIDTH;
  const gridWidth = Math.min(availableGridWidth, maxGridWidth);
  const tileWidth = Math.max(
    0,
    (gridWidth - tileGap * (tileColumnCount - 1)) / tileColumnCount,
  );
  const tileHeight = isPriceQuestion
    ? 56
    : tileColumnCount === 3
      ? Math.max(128, Math.min(148, Math.round(tileWidth + 42)))
      : 160;
  const contextCopy = getQuestionContextCopy(attribute, contextCategory);

  const sendFree = () => {
    const value = draft.trim();
    if (value) onFreeText(value);
  };

  return (
    <KeyboardAvoidingView
      style={{flex: 1}}
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
        <View style={{alignItems: 'flex-start'}}>
          <Wordmark onHome={onHome} />
        </View>

        <ScrollView
          contentContainerStyle={{flexGrow: 1, justifyContent: 'center', paddingVertical: 16}}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{flex: 1}}
        >
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
            style={[text.title, {marginTop: 12, textAlign: 'center', lineHeight: 32}]}
            accessibilityRole="header"
          >
            {title}
          </Text>

          {contextCopy ? (
            <Text
              style={{
                alignSelf: 'center',
                color: color.inkSoft,
                fontFamily: font.sans,
                fontSize: 13,
                lineHeight: 19,
                marginTop: 10,
                paddingHorizontal: 8,
                textAlign: 'center',
              }}
              allowFontScaling={false}
            >
              {contextCopy}
            </Text>
          ) : null}

          <View
            style={{
              alignSelf: 'center',
              flexDirection: isPriceQuestion ? 'column' : 'row',
              flexWrap: isPriceQuestion ? 'nowrap' : 'wrap',
              gap: isPriceQuestion ? 10 : tileGap,
              justifyContent: 'center',
              marginTop: isPriceQuestion ? 24 : contextCopy ? 20 : 30,
              width: gridWidth,
            }}
          >
            {tiles.map(({option, visual}) => (
              <SwatchTile
                key={option.id}
                visual={visual}
                label={option.label}
                onPick={() => onPick(option.id)}
                height={tileHeight}
                style={{width: tileWidth}}
              />
            ))}
          </View>

          {skip ? (
            <Pressable
              onPress={() => onPick(skip.option.id)}
              accessibilityRole="button"
              accessibilityLabel={`${skip.option.label} \uc120\ud0dd`}
              hitSlop={{top: 10, bottom: 10, left: 16, right: 16}}
              style={{alignSelf: 'center', marginTop: 22}}
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
                {skip.option.label}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={sendFree}
          placeholder="직접 말해도 좋아요"
        />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
