import React from 'react';
import {StyleSheet, TouchableOpacity, View} from 'react-native';

interface Props {
  colors: string[];
  selected: string;
  onSelect: (color: string) => void;
}

export default function ColorSwatches({colors, selected, onSelect}: Props) {
  return (
    <View style={styles.row}>
      {colors.map(color => {
        const isSelected = color.toLowerCase() === selected.toLowerCase();
        return (
          <TouchableOpacity
            key={color}
            onPress={() => onSelect(color)}
            style={[styles.swatchOuter, isSelected && styles.swatchSelected]}>
            <View style={[styles.swatch, {backgroundColor: color}]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  swatchOuter: {
    padding: 2,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: '#FFFFFF',
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
});
