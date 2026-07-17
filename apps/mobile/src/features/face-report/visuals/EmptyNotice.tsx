import React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { color, font, radius } from '../reportTokens';

interface Props {
  icon?: string;
  title: string;
  body: string;
  linkLabel?: string;
  onLink?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Dashed empty/failure notice card (측정 실패, 헤어라인 미확인 등). */
export function EmptyNotice({ icon = '!', title, body, linkLabel, onLink, style }: Props) {
  return (
    <View style={[{
      backgroundColor: color.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: color.dashed22,
      borderRadius: radius.lg, paddingVertical: 13, paddingHorizontal: 14,
      flexDirection: 'row', gap: 11, alignItems: 'flex-start',
    }, style]}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[font(14, '800'), { color: color.faint }]}>{icon}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[font(12.5, '700'), { color: color.ink }]}>{title}</Text>
        <Text style={[font(12, '400', 1.6), { color: color.text }]}>{body}</Text>
        {linkLabel ? (
          <Text onPress={onLink} suppressHighlighting style={[font(12, '700'), { color: color.accentDeep, marginTop: 2 }]}>
            {linkLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
