import React from 'react';
import {
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

function splitIntoParagraphs(text: string, maxSentences: number): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const sentences =
    normalized.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g)?.map(sentence =>
      sentence.trim(),
    ) ?? [normalized];

  if (sentences.length <= maxSentences) {
    return [normalized];
  }

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += maxSentences) {
    paragraphs.push(sentences.slice(index, index + maxSentences).join(' '));
  }
  return paragraphs;
}

export function ReadableParagraphs({
  gap = 8,
  maxSentences = 2,
  style,
  text,
  textStyle,
}: {
  gap?: number;
  maxSentences?: number;
  style?: StyleProp<ViewStyle>;
  text: string;
  textStyle?: StyleProp<TextStyle>;
}) {
  const paragraphs = splitIntoParagraphs(
    text,
    Math.max(1, Math.floor(maxSentences)),
  );

  return (
    <View style={[{gap}, style]}>
      {paragraphs.map((paragraph, index) => (
        <Text key={`${index}-${paragraph}`} style={textStyle}>
          {paragraph}
        </Text>
      ))}
    </View>
  );
}
