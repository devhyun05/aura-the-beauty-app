import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

/** Always-visible reference-image disclaimers — deliberately not collapsible
 * (policy: the result screen must never show a stage image without these). */
export function DisclaimerBlock({disclaimers}: {disclaimers: string[]}) {
  return (
    <View style={styles.card}>
      {disclaimers.map(text => (
        <Text key={text} style={styles.text}>
          · {text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fbf4ec',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  text: {fontSize: 12, lineHeight: 17, color: '#8a6d3b'},
});
