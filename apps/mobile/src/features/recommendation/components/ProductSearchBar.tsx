import {useState} from 'react';
import {Pressable, StyleSheet, TextInput, View} from 'react-native';
import {Search} from 'lucide-react-native';
import {Text} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';

export function ProductSearchBar({onSubmit}: {onSubmit: (query: string) => void}) {
  const [query, setQuery] = useState('');
  const submit = () => {
    const normalized = query.trim();
    if (normalized) onSubmit(normalized);
  };
  return (
    <View style={styles.wrap}>
      <Search color={colors.textSecondary} size={iconSize.sm} />
      <TextInput
        accessibilityLabel="브랜드, 제품명 또는 카테고리 검색"
        onChangeText={setQuery}
        onSubmitEditing={submit}
        placeholder="브랜드·제품명·카테고리 검색"
        placeholderTextColor={colors.textTertiary}
        returnKeyType="search"
        style={styles.input}
        value={query}
      />
      <Pressable accessibilityLabel="제품 검색" accessibilityRole="button" onPress={submit} style={styles.button}>
        <Text style={styles.buttonText}>검색</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  input: {color: colors.textPrimary, flex: 1, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.md, minHeight: 48},
  button: {alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44},
  buttonText: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
});
