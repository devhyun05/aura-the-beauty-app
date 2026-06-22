import {StyleSheet} from 'react-native';
import {Text} from 'tamagui';

export function AuraLogo() {
  return <Text style={styles.logo}>AURA</Text>;
}

const styles = StyleSheet.create({
  logo: {
    color: '#8FA59A',
    fontFamily: 'NixieOne-Regular',
    fontSize: 58,
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 70,
  },
});
