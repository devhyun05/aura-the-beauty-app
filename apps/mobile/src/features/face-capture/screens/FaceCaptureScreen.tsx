import React, {useMemo, useState} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  useWindowDimensions,
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {mockReadyFaceCaptureChecks} from '../mocks/faceCapture.mock';
import {
  evaluateFaceCaptureGuidance,
  type FaceCaptureCheckState,
  type FaceCaptureGuidance,
} from '../services/faceCaptureValidation';

type CameraDirection = 'front' | 'back';

type FaceCaptureScreenProps = {
  checks?: FaceCaptureCheckState;
  onCapture?: () => void;
  onClose?: () => void;
  onPickImage?: () => void;
  onToggleCamera?: (direction: CameraDirection) => void;
};

type ControlButtonProps = {
  accessibilityLabel: string;
  children: React.ReactNode;
  tintColor: string;
  onPress?: (event: GestureResponderEvent) => void;
};

type CaptureButtonProps = {
  guidance: FaceCaptureGuidance;
  onPress?: () => void;
};

export function FaceCaptureScreen({
  checks = mockReadyFaceCaptureChecks,
  onCapture,
  onClose,
  onPickImage,
  onToggleCamera,
}: FaceCaptureScreenProps) {
  const {height, width} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [cameraDirection, setCameraDirection] = useState<CameraDirection>('front');

  const guidance = useMemo(() => evaluateFaceCaptureGuidance(checks), [checks]);
  const guideWidth = Math.min(Math.max(width * 0.48, 174), 202);
  const guideHeight = guideWidth * 1.28;
  const guideCenterY = Math.max(insets.top + guideHeight / 2 + 130, height * 0.48);
  const guideTop = guideCenterY - guideHeight / 2;
  const controlsBottom = Math.max(insets.bottom + 64, height * 0.1);
  const errorTop = Math.max(insets.top + 82, guideCenterY - guideHeight / 2 - 74);

  const handleToggleCamera = () => {
    const nextDirection = cameraDirection === 'front' ? 'back' : 'front';
    setCameraDirection(nextDirection);
    onToggleCamera?.(nextDirection);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <Pressable
        accessibilityLabel="촬영 화면 닫기"
        accessibilityRole="button"
        hitSlop={12}
        onPress={onClose}
        style={[styles.closeButton, {top: insets.top + 18}]}>
        <CloseIcon color={guidance.tintColor} />
      </Pressable>

      {guidance.message ? (
        <View pointerEvents="none" style={[styles.errorBubbleHost, {top: errorTop}]}>
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.errorBubble,
              {
                backgroundColor: guidance.tintColor,
              },
            ]}>
            <Text style={styles.errorText}>{guidance.message}</Text>
          </View>
        </View>
      ) : null}

      <View
        pointerEvents="none"
        style={[
          styles.faceGuide,
          {
            borderColor: guidance.tintColor,
            borderRadius: '50%',
            height: guideHeight,
            left: (width - guideWidth) / 2,
            top: guideTop,
            width: guideWidth,
          },
        ]}
      />

      <View
        style={[
          styles.controls,
          {
            bottom: controlsBottom,
          },
        ]}>
        <ControlButton accessibilityLabel="앨범에서 사진 가져오기" tintColor={guidance.tintColor} onPress={onPickImage}>
          <GalleryIcon color={guidance.tintColor} />
        </ControlButton>

        <CaptureButton guidance={guidance} onPress={onCapture} />

        <ControlButton
          accessibilityLabel={`${cameraDirection === 'front' ? '후면' : '전면'} 카메라로 전환`}
          tintColor={guidance.tintColor}
          onPress={handleToggleCamera}>
          <SwitchCameraIcon color={guidance.tintColor} />
        </ControlButton>
      </View>
    </View>
  );
}

function ControlButton({accessibilityLabel, children, tintColor, onPress}: ControlButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={12}
      onPress={onPress}
      style={({pressed}) => [
        styles.controlButton,
        {
          opacity: pressed ? 0.72 : 1,
        },
      ]}>
      {children}
    </Pressable>
  );
}

function CaptureButton({guidance, onPress}: CaptureButtonProps) {
  const isDisabled = !guidance.isCaptureEnabled;

  return (
    <Pressable
      accessibilityLabel="사진 촬영"
      accessibilityRole="button"
      accessibilityState={{disabled: isDisabled}}
      disabled={isDisabled}
      hitSlop={12}
      onPress={onPress}
      style={({pressed}) => [
        styles.captureButton,
        styles.liquidGlassSurface,
        {
          borderColor: guidance.tintColor,
          opacity: pressed ? 0.72 : 1,
        },
      ]}>
      <View
        style={[
          styles.captureButtonInner,
          {
            backgroundColor: guidance.tintColor,
            opacity: isDisabled ? 0.58 : 1,
          },
        ]}
      />
    </Pressable>
  );
}

function CloseIcon({color}: {color: string}) {
  return <Text style={[styles.closeIconText, {color}]}>×</Text>;
}

function GalleryIcon({color}: {color: string}) {
  return (
    <View style={[styles.galleryIcon, {borderColor: color}]}>
      <View style={[styles.galleryPlusHorizontal, {backgroundColor: color}]} />
      <View style={[styles.galleryPlusVertical, {backgroundColor: color}]} />
    </View>
  );
}

function SwitchCameraIcon({color}: {color: string}) {
  return <Text style={[styles.switchIconText, {color}]}>↻</Text>;
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#000000',
    flex: 1,
    overflow: 'hidden',
  },
  closeButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    right: 22,
    width: 48,
  },
  closeIconText: {
    fontSize: 36,
    fontWeight: '200',
    includeFontPadding: false,
    lineHeight: 40,
    textAlign: 'center',
  },
  errorBubble: {
    borderRadius: 18,
    maxWidth: 310,
    minHeight: 42,
    paddingHorizontal: 18,
    paddingVertical: 11,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: {
      height: 8,
      width: 0,
    },
    shadowOpacity: 0.16,
    shadowRadius: 16,
  },
  errorBubbleHost: {
    alignItems: 'center',
    left: 24,
    position: 'absolute',
    right: 24,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 20,
    textAlign: 'center',
  },
  faceGuide: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderWidth: 3,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: '#FFFFFF',
    shadowOffset: {
      height: 0,
      width: 0,
    },
    shadowOpacity: 0.28,
    shadowRadius: 12,
  },
  controls: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 52,
    position: 'absolute',
    width: '100%',
  },
  controlButton: {
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  captureButton: {
    alignItems: 'center',
    borderRadius: 42,
    borderWidth: 1,
    height: 78,
    justifyContent: 'center',
    width: 78,
  },
  captureButtonInner: {
    borderRadius: 31,
    height: 62,
    width: 62,
  },
  liquidGlassSurface: {
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
    shadowColor: '#FFFFFF',
    shadowOffset: {
      height: 0,
      width: 0,
    },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },
  galleryIcon: {
    alignItems: 'center',
    borderRadius: 5,
    borderWidth: 2.4,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  galleryPlusHorizontal: {
    borderRadius: 1.2,
    height: 2.4,
    width: 12,
  },
  galleryPlusVertical: {
    borderRadius: 1.2,
    height: 12,
    position: 'absolute',
    width: 2.4,
  },
  switchIconText: {
    fontSize: 35,
    fontWeight: '300',
    includeFontPadding: false,
    lineHeight: 38,
    textAlign: 'center',
  },
});
