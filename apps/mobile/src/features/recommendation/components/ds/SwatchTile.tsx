// AURADIN semantic answer tile for narrowing questions.
// Local semantic images are deterministic and labels live in a separate footer.
import * as React from 'react';
import {Animated, Image, Pressable, Text, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {color, font, radius as r, shadows} from '../../theme/auradinTokens';
import type {AuradinQuestionVisual} from '../../types';
import {usePressScale} from './motion';

export type SwatchTileProps = {
  visual: AuradinQuestionVisual;
  label: string;
  onPick: () => void;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

const FILL = {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0} as const;

const CHANNEL_MARK = {
  oliveyoung: 'OLIVE YOUNG',
  department_store: 'DEPARTMENT',
  naver: 'NAVER',
} as const;

const CHANNEL_BACKGROUND: Record<
  'oliveyoung' | 'department_store' | 'naver',
  [string, string, string]
> = {
  oliveyoung: ['#E8F2ED', '#D9E9E6', '#F0DFEC'],
  department_store: ['#F1E6F3', '#E2E7F5', '#F4E1EA'],
  naver: ['#E1F0EF', '#DCE8F5', '#EADFF3'],
};

export function SwatchTile({
  visual,
  label,
  onPick,
  height = 160,
  style,
}: SwatchTileProps): React.JSX.Element {
  const {pressStyle, onPressIn, onPressOut} = usePressScale(0.97, 0.92);
  const imageVisual =
    visual.kind === 'category' || visual.kind === 'application' ? visual : null;
  const imageKey =
    imageVisual === null
      ? null
      : imageVisual.kind === 'category'
        ? `category:${imageVisual.category}`
        : `application:${imageVisual.attribute}:${imageVisual.value}`;
  const [failedImageKey, setFailedImageKey] = React.useState<string | null>(null);
  const imageFailed = imageKey !== null && failedImageKey === imageKey;
  const baseColor =
    visual.kind === 'gradient'
      ? visual.colors[1]
      : imageVisual
        ? '#F7F1F4'
        : visual.kind === 'price'
          ? '#EEEAF7'
          : visual.kind === 'channel'
            ? '#E7EDF5'
            : color.swatchNeutral;
  const accessibilityLabel =
    visual.kind === 'descriptor'
      ? label + ', ' + visual.description + ' \uc120\ud0dd'
      : label + ' \uc120\ud0dd';

  return (
    <Pressable
      onPress={onPick}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      <Animated.View
        style={[
          {
            height,
            borderRadius: r.tile,
            backgroundColor: baseColor,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.64)',
            overflow: 'hidden',
          },
          shadows.tile,
          pressStyle,
        ]}
      >
        {visual.kind === 'price' ? (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={['#F8EEF7', '#E7E8F7', '#E6F1F1']}
              locations={[0, 0.56, 1]}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 1}}
              style={FILL}
            />
            <View pointerEvents="none" style={[FILL, {alignItems: 'center', justifyContent: 'center'}]}>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={{
                  color: color.ink,
                  fontFamily: font.sansSemiBold,
                  fontSize: 15,
                  lineHeight: 20,
                  paddingHorizontal: 14,
                  textAlign: 'center',
                }}
              >
                {label}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={{flex: 1, backgroundColor: '#F7F1F4', overflow: 'hidden'}}>
              {imageVisual && !imageFailed ? (
                <Image
                  accessibilityIgnoresInvertColors
                  resizeMode="contain"
                  source={imageVisual.source}
                  onError={() => {
                    if (imageKey) setFailedImageKey(imageKey);
                  }}
                  style={{height: '100%', width: '100%'}}
                />
              ) : null}

              {visual.kind === 'gradient' ? (
                <LinearGradient
                  pointerEvents="none"
                  colors={visual.colors}
                  locations={[0, 0.52, 1]}
                  start={{x: 0.12, y: 0}}
                  end={{x: 0.88, y: 1}}
                  style={FILL}
                />
              ) : null}

              {visual.kind === 'descriptor' ? (
                <>
                  <LinearGradient
                    pointerEvents="none"
                    colors={['#F5EEF2', '#E9E8F2', '#E5EEF0']}
                    locations={[0, 0.54, 1]}
                    start={{x: 0, y: 0}}
                    end={{x: 1, y: 1}}
                    style={FILL}
                  />
                  <View
                    pointerEvents="none"
                    style={[FILL, {alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12}]}
                  >
                    <Text
                      allowFontScaling={false}
                      numberOfLines={3}
                      style={{
                        color: color.inkSoft,
                        fontFamily: font.sans,
                        fontSize: 12.5,
                        lineHeight: 18,
                        textAlign: 'center',
                      }}
                    >
                      {visual.description}
                    </Text>
                  </View>
                </>
              ) : null}

              {visual.kind === 'channel' ? (
                <>
                  <LinearGradient
                    pointerEvents="none"
                    colors={CHANNEL_BACKGROUND[visual.channel]}
                    locations={[0, 0.55, 1]}
                    start={{x: 0, y: 0}}
                    end={{x: 1, y: 1}}
                    style={FILL}
                  />
                  <View pointerEvents="none" style={[FILL, {alignItems: 'center', justifyContent: 'center'}]}>
                    <Text
                      allowFontScaling={false}
                      numberOfLines={1}
                      style={{
                        fontFamily: font.sansBold,
                        fontSize: visual.channel === 'department_store' ? 13 : 16,
                        letterSpacing: 0.5,
                        color: color.ink,
                      }}
                    >
                      {CHANNEL_MARK[visual.channel]}
                    </Text>
                  </View>
                </>
              ) : null}

              {visual.kind === 'neutral' || imageFailed ? (
                <>
                  <LinearGradient
                    pointerEvents="none"
                    colors={['#F3E9EE', '#E7E7F3', '#E4EEF0']}
                    locations={[0, 0.52, 1]}
                    start={{x: 0, y: 0}}
                    end={{x: 1, y: 1}}
                    style={FILL}
                  />
                  <View pointerEvents="none" style={[FILL, {alignItems: 'center', justifyContent: 'center'}]}>
                    <Text allowFontScaling={false} style={{fontSize: 24, color: color.inkFaint}}>
                      {'\u2726'}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>

            <View
              pointerEvents="none"
              style={{
                alignItems: 'center',
                backgroundColor: '#FFFDFD',
                borderTopColor: 'rgba(105,82,100,0.10)',
                borderTopWidth: 1,
                justifyContent: 'center',
                minHeight: 44,
                paddingHorizontal: 10,
                paddingVertical: 7,
              }}
            >
              <Text
                allowFontScaling={false}
                numberOfLines={2}
                style={{
                  color: color.ink,
                  fontFamily: font.sansSemiBold,
                  fontSize: 13.5,
                  lineHeight: 18,
                  textAlign: 'center',
                }}
              >
                {label}
              </Text>
            </View>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}
