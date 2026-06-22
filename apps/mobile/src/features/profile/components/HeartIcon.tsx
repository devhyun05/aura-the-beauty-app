import { Image, StyleSheet } from 'react-native';

const heartFilled = require('../../../assets/icons/profile/heart-filled.png');

export const HeartIcon = () => {
  return (
    <Image
      resizeMode="contain"
      source={heartFilled}
      style={styles.icon}
    />
  );
};

const styles = StyleSheet.create({
  icon: {
    height: 15,
    width: 16,
  },
});
