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
import {Image as ImageIcon, RefreshCw, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {CameraCaptureButton, LiveCameraLayer} from '../../../shared/ui';
import {mockReadyFaceCaptureChecks} from '../mocks/faceCapture.mock';
import {
  evaluateFaceCaptureGuidance,
  type FaceCaptureCheckState,
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
  onPress?: (event: GestureResponderEvent) => void;
};

export function getFaceCaptureCameraMode(): 'live-camera' {
  return 'live-camera';
}

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
  const guideScaleY = guideHeight / guideWidth;
  const guideCenterY = Math.max(insets.top + guideHeight / 2 + 130, height * 0.48);
  const guideTop = guideCenterY - guideWidth / 2;
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
      <LiveCameraLayer facing={cameraDirection} />

      <Pressable
        accessibilityLabel="촬영 화면 닫기"
        accessibilityRole="button"
        hitSlop={12}
        onPress={onClose}
        style={[styles.closeButton, {top: insets.top + 18}]}>
        <X color={guidance.tintColor} size={iconSize.xl} strokeWidth={1.8} />
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
            borderRadius: guideWidth / 2,
            height: guideWidth,
            left: (width - guideWidth) / 2,
            top: guideTop,
            transform: [{scaleY: guideScaleY}],
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
        <ControlButton accessibilityLabel="앨범에서 사진 가져오기" onPress={onPickImage}>
          <ImageIcon color={guidance.tintColor} size={iconSize.lg} strokeWidth={2.1} />
        </ControlButton>

        <CameraCaptureButton
          accessibilityLabel="사진 촬영"
          disabled={!guidance.isCaptureEnabled}
          onPress={onCapture}
        />

        <ControlButton
          accessibilityLabel={`${cameraDirection === 'front' ? '후면' : '전면'} 카메라로 전환`}
          onPress={handleToggleCamera}>
          <RefreshCw color={guidance.tintColor} size={iconSize.lg} strokeWidth={2.1} />
        </ControlButton>
      </View>
    </View>
  );
}

function ControlButton({accessibilityLabel, children, onPress}: ControlButtonProps) {
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

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.black,
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
  errorBubble: {
    borderRadius: radius.lg,
    maxWidth: 310,
    minHeight: 42,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    position: 'absolute',
    shadowColor: shadows.errorBubble.shadowColor,
    shadowOffset: shadows.errorBubble.shadowOffset,
    shadowOpacity: shadows.errorBubble.shadowOpacity,
    shadowRadius: shadows.errorBubble.shadowRadius,
  },
  errorBubbleHost: {
    alignItems: 'center',
    left: spacing.xxl,
    position: 'absolute',
    right: spacing.xxl,
  },
  errorText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  faceGuide: {
    alignItems: 'center',
    backgroundColor: colors.guideSurface,
    borderWidth: 3,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: shadows.guideGlow.shadowColor,
    shadowOffset: shadows.guideGlow.shadowOffset,
    shadowOpacity: shadows.guideGlow.shadowOpacity,
    shadowRadius: shadows.guideGlow.shadowRadius,
  },
  controls: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl * 2 + spacing.xs,
    position: 'absolute',
    width: '100%',
  },
  controlButton: {
    alignItems: 'center',
    height: iconSize.xl + spacing.xxl,
    justifyContent: 'center',
    width: iconSize.xl + spacing.xxl,
  },
});
