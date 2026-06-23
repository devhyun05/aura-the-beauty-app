import React from 'react';
import {StyleSheet} from 'react-native';
import {YStack} from 'tamagui';

import {colors} from '../theme';

type FooterIconProps = {
  color?: string;
};

export function HomeFooterIcon({color = colors.black}: FooterIconProps) {
  return (
    <YStack pointerEvents="none" style={styles.homeRoot}>
      <YStack style={[styles.homeRoof, {borderColor: color}]} />
      <YStack style={[styles.homeBody, {borderColor: color}]}>
        <YStack style={[styles.homeDoor, {backgroundColor: color}]} />
      </YStack>
    </YStack>
  );
}

export function CameraFooterIcon({color = colors.black}: FooterIconProps) {
  return (
    <YStack pointerEvents="none" style={styles.cameraRoot}>
      <YStack style={[styles.cameraTop, {borderColor: color}]} />
      <YStack style={[styles.cameraBody, {borderColor: color}]}>
        <YStack style={[styles.cameraLens, {borderColor: color}]} />
      </YStack>
    </YStack>
  );
}

export function BrushFooterIcon({color = colors.black}: FooterIconProps) {
  return (
    <YStack pointerEvents="none" style={styles.brushRoot}>
      <YStack style={[styles.brushHandle, {backgroundColor: color}]} />
      <YStack style={[styles.brushHandleEnd, {backgroundColor: color}]} />
      <YStack style={[styles.brushFerrule, {backgroundColor: color}]} />
      <YStack style={[styles.brushBristle, {borderBottomColor: color}]} />
    </YStack>
  );
}

const styles = StyleSheet.create({
  homeRoot: {
    height: 24,
    width: 32,
  },
  homeRoof: {
    borderLeftWidth: 2.8,
    borderRadius: 4,
    borderTopWidth: 2.8,
    height: 17,
    left: 7,
    position: 'absolute',
    top: 1,
    transform: [{rotate: '45deg'}],
    width: 17,
  },
  homeBody: {
    alignItems: 'center',
    borderBottomWidth: 2.8,
    borderLeftWidth: 2.8,
    borderRightWidth: 2.8,
    bottom: 0,
    height: 14,
    justifyContent: 'flex-end',
    left: 7,
    position: 'absolute',
    width: 18,
  },
  homeDoor: {
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    height: 7,
    width: 5,
  },
  cameraRoot: {
    height: 28,
    width: 32,
  },
  cameraTop: {
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderTopWidth: 3,
    height: 7,
    left: 9,
    position: 'absolute',
    top: 2,
    width: 14,
  },
  cameraBody: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 3,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    top: 6,
    width: 32,
  },
  cameraLens: {
    borderRadius: 7,
    borderWidth: 3,
    height: 14,
    width: 14,
  },
  brushRoot: {
    height: 30,
    width: 34,
  },
  brushHandle: {
    borderRadius: 3,
    height: 23,
    position: 'absolute',
    right: 9,
    top: 1,
    transform: [{rotate: '45deg'}],
    width: 4,
  },
  brushHandleEnd: {
    borderRadius: 3,
    height: 5,
    position: 'absolute',
    right: 5,
    top: 1,
    transform: [{rotate: '45deg'}],
    width: 5,
  },
  brushFerrule: {
    borderRadius: 2,
    height: 9,
    left: 12,
    position: 'absolute',
    top: 13,
    transform: [{rotate: '45deg'}],
    width: 8,
  },
  brushBristle: {
    borderBottomWidth: 13,
    borderLeftColor: 'transparent',
    borderLeftWidth: 5,
    borderRightColor: 'transparent',
    borderRightWidth: 5,
    height: 0,
    left: 5,
    position: 'absolute',
    top: 18,
    transform: [{rotate: '45deg'}],
    width: 0,
  },
});
