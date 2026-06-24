import React from 'react';
import {StyleSheet} from 'react-native';
import {YStack} from 'tamagui';

import {colors, iconSize} from '../theme';

type HeaderIconProps = {
  color?: string;
};

export const PROFILE_HEADER_ICON_ROOT_SIZE = iconSize.sm;
export const PROFILE_HEADER_ICON_HEAD_SIZE = 9;
export const PROFILE_HEADER_ICON_SHOULDERS_WIDTH = 18;

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
    height: PROFILE_HEADER_ICON_ROOT_SIZE,
    width: PROFILE_HEADER_ICON_ROOT_SIZE,
  },
  profileHead: {
    borderRadius: PROFILE_HEADER_ICON_HEAD_SIZE / 2,
    borderWidth: 2,
    height: PROFILE_HEADER_ICON_HEAD_SIZE,
    width: PROFILE_HEADER_ICON_HEAD_SIZE,
  },
  profileShoulders: {
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderTopLeftRadius: PROFILE_HEADER_ICON_SHOULDERS_WIDTH / 2,
    borderTopRightRadius: PROFILE_HEADER_ICON_SHOULDERS_WIDTH / 2,
    borderTopWidth: 2,
    height: 9,
    marginTop: 3,
    width: PROFILE_HEADER_ICON_SHOULDERS_WIDTH,
  },
});
