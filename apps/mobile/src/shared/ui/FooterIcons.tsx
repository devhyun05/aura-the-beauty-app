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
      <YStack style={[styles.brushTip, {backgroundColor: color}]} />
      <YStack style={[styles.brushStroke, {backgroundColor: color}]} />
    </YStack>
  );
}

const styles = StyleSheet.create({
  homeRoot: {
    height: 28,
    width: 30,
  },
  homeRoof: {
    borderLeftWidth: 3,
    borderRadius: 4,
    borderTopWidth: 3,
    height: 19,
    left: 5,
    position: 'absolute',
    top: 0,
    transform: [{rotate: '45deg'}],
    width: 19,
  },
  homeBody: {
    alignItems: 'center',
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    bottom: 0,
    height: 16,
    justifyContent: 'flex-end',
    left: 6,
    position: 'absolute',
    width: 18,
  },
  homeDoor: {
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    height: 8,
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
    borderRadius: 9,
    height: 27,
    position: 'absolute',
    right: 4,
    top: 0,
    transform: [{rotate: '42deg'}],
    width: 10,
  },
  brushTip: {
    borderRadius: 9,
    bottom: 5,
    height: 17,
    left: 8,
    position: 'absolute',
    transform: [{rotate: '24deg'}],
    width: 11,
  },
  brushStroke: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 3,
    borderTopLeftRadius: 2,
    bottom: 1,
    height: 8,
    left: 0,
    position: 'absolute',
    transform: [{rotate: '-16deg'}],
    width: 17,
  },
});
