import React from 'react';
import {StyleSheet} from 'react-native';
import {YStack} from 'tamagui';

import {colors} from '../theme';

type HeaderIconProps = {
  color?: string;
};

export function SearchHeaderIcon({color = colors.black}: HeaderIconProps) {
  return (
    <YStack pointerEvents="none" style={styles.searchRoot}>
      <YStack style={[styles.searchLens, {borderColor: color}]} />
      <YStack style={[styles.searchHandle, {backgroundColor: color}]} />
    </YStack>
  );
}

export function ProfileHeaderIcon({color = colors.black}: HeaderIconProps) {
  return (
    <YStack pointerEvents="none" style={styles.profileRoot}>
      <YStack style={[styles.profileHead, {borderColor: color}]} />
      <YStack style={[styles.profileShoulders, {borderColor: color}]} />
    </YStack>
  );
}

const styles = StyleSheet.create({
  searchRoot: {
    height: 24,
    width: 24,
  },
  searchLens: {
    borderRadius: 8,
    borderWidth: 2,
    height: 15,
    left: 2,
    position: 'absolute',
    top: 2,
    width: 15,
  },
  searchHandle: {
    borderRadius: 1,
    bottom: 4,
    height: 2,
    position: 'absolute',
    right: 2,
    transform: [{rotate: '45deg'}],
    width: 10,
  },
  profileRoot: {
    alignItems: 'center',
    height: 24,
    width: 24,
  },
  profileHead: {
    borderRadius: 5,
    borderWidth: 2,
    height: 10,
    width: 10,
  },
  profileShoulders: {
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
    borderTopWidth: 2,
    height: 10,
    marginTop: 4,
    width: 22,
  },
});
