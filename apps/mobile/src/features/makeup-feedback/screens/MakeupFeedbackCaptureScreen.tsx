import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {CameraView, useCameraPermissions, type CameraType} from 'expo-camera';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {RefreshCw, X} from 'lucide-react-native';

import {
  colors,
  feedbackColors,
  iconSize,
  radius,
  spacing,
  typography,
} from '../../../shared/theme';
import {
  CameraCaptureControlRow,
  CameraCaptureButton,
  CameraUtilityButton,
  FloatingOverlayIconButton,
  FullscreenOverlayScreen,
} from '../../../shared/ui';
import type {MakeupFeedbackPhotoSelection} from '../types';

type MakeupFeedbackCaptureScreenProps = {
  onClose: () => void;
  onSelectPhoto: (selection: MakeupFeedbackPhotoSelection) => void;
};

export function MakeupFeedbackCaptureScreen({onClose, onSelectPhoto}: MakeupFeedbackCaptureScreenProps) {
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState<CameraType>('front');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const handleCapture = async () => {
    if (isTakingPhoto) {
      return;
    }

    setIsTakingPhoto(true);
    let capturedImageUri: string | undefined;

    try {
      if (permission?.granted && isCameraReady) {
        const picture = await cameraRef.current?.takePictureAsync({
          quality: 0.82,
          skipProcessing: false,
        });

        capturedImageUri = picture?.uri;
      }
    } catch {
      // Simulator camera capture can fail even when the UI flow is still demoable.
    } finally {
      setIsTakingPhoto(false);
      onSelectPhoto({
        imageUri: capturedImageUri,
        photoSource: 'camera',
      });
    }
  };

  const handleRequestPermission = async () => {
    const nextPermission = await requestPermission();

    if (nextPermission.granted) {
      setMountError(null);
    }
  };

  const handleToggleCamera = () => {
    setCameraFacing((currentFacing) => (currentFacing === 'front' ? 'back' : 'front'));
  };


  const shouldShowCamera = permission?.granted === true;

  return (
    <FullscreenOverlayScreen>
      {shouldShowCamera ? (
        <CameraView
          active
          animateShutter
          facing={cameraFacing}
          flash="off"
          mirror={cameraFacing === 'front'}
          mode="picture"
          onCameraReady={() => setIsCameraReady(true)}
          onMountError={(error) => {
            setMountError(error.message);
            setIsCameraReady(false);
          }}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={styles.cameraFallback} />
      )}

      {!shouldShowCamera || mountError ? (
        <View style={styles.permissionLayer}>
          {permission === null ? (
            <ActivityIndicator color={colors.white} size="large" />
          ) : (
            <>
              <Text style={styles.permissionTitle}>
                {mountError ? '카메라를 사용할 수 없어요' : '카메라 권한이 필요해요'}
              </Text>
              <Text style={styles.permissionText}>
                {mountError ?? '메이크업 사진 촬영을 위해 카메라 접근을 허용해주세요.'}
              </Text>
              {permission.canAskAgain ? (
                <Pressable
                  accessibilityLabel="카메라 권한 허용"
                  accessibilityRole="button"
                  onPress={handleRequestPermission}
                  style={styles.permissionButton}>
                  <Text style={styles.permissionButtonText}>권한 허용</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      <FloatingOverlayIconButton
        accessibilityLabel="AI 피드백 촬영 닫기"
        onPress={onClose}
        rightOffset={spacing.xxl + spacing.sm}
        topOffset={spacing.xxl + spacing.sm}>
        <X color={colors.white} size={iconSize.xl} strokeWidth={1.9} />
      </FloatingOverlayIconButton>

      <CameraCaptureControlRow
        bottom={insets.bottom + 112}
        centerSlot={
          <CameraCaptureButton
            accessibilityLabel="메이크업 사진 촬영"
            disabled={isTakingPhoto}
            onPress={handleCapture}
          />
        }
        horizontalPadding={spacing.xxl + spacing.sm}
        rightSlot={
          <CameraUtilityButton
            accessibilityLabel={`${cameraFacing === 'front' ? '후면' : '전면'} 카메라로 전환`}
            onPress={handleToggleCamera}
            size={iconSize.xl + spacing.xl}>
            <RefreshCw color={colors.white} size={iconSize.lg} strokeWidth={2.1} />
          </CameraUtilityButton>
        }
        sideSlotSize={iconSize.xl + spacing.xl}
      />
    </FullscreenOverlayScreen>
  );
}

const styles = StyleSheet.create({
  cameraFallback: {
    backgroundColor: colors.black,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  permissionButton: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  permissionButtonText: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  permissionLayer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: spacing.xxl,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  permissionText: {
    color: colors.white,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    marginTop: spacing.sm,
    opacity: 0.82,
    textAlign: 'center',
  },
  permissionTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
});
