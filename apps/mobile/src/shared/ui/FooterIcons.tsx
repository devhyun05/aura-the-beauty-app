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
      <YStack style={[styles.brushFerrule, {backgroundColor: color}]} />
      <YStack style={[styles.brushBristle, {backgroundColor: color}]} />
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
    width: 32,
  },
  brushHandle: {
    borderRadius: 4,
    height: 24,
    position: 'absolute',
    right: 7,
    top: 1,
    transform: [{rotate: '45deg'}],
    width: 5,
  },
  brushFerrule: {
    borderRadius: 3,
    height: 10,
    left: 11,
    position: 'absolute',
    top: 13,
    transform: [{rotate: '45deg'}],
    width: 8,
  },
  brushBristle: {
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 9,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    height: 13,
    left: 6,
    position: 'absolute',
    top: 17,
    transform: [{rotate: '45deg'}],
    width: 9,
  },
});
