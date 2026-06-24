import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {CameraView, useCameraPermissions, type CameraType} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
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
import {CameraCaptureButton} from '../../../shared/ui';
import type {FeedbackPhotoSelection} from '../types';

type FeedbackCaptureScreenProps = {
  onClose: () => void;
  onSelectPhoto: (selection: FeedbackPhotoSelection) => void;
};

export function FeedbackCaptureScreen({onClose, onSelectPhoto}: FeedbackCaptureScreenProps) {
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState<CameraType>('front');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [isPickingImage, setIsPickingImage] = useState(false);
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
        source: 'camera',
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

  const handlePickImage = async () => {
    if (isPickingImage) {
      return;
    }

    setIsPickingImage(true);

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ['images'],
        quality: 0.9,
      });

      if (!pickerResult.canceled && pickerResult.assets.length > 0) {
        onSelectPhoto({
          imageUri: pickerResult.assets[0]?.uri,
          source: 'gallery',
        });
      }
    } finally {
      setIsPickingImage(false);
    }
  };

  const shouldShowCamera = permission?.granted === true;

  return (
    <View style={styles.screen}>
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

      <Pressable
        accessibilityLabel="AI 피드백 촬영 닫기"
        accessibilityRole="button"
        hitSlop={12}
        onPress={onClose}
        style={[styles.closeButton, {top: insets.top + spacing.xxl * 3}]}>
        <X color={colors.white} size={iconSize.xl} strokeWidth={1.9} />
      </Pressable>

      <View style={[styles.captureControls, {bottom: insets.bottom + 112}]}>
        <CameraCaptureButton
          accessibilityLabel="메이크업 사진 촬영"
          disabled={isTakingPhoto}
          onPress={handleCapture}
        />

        <Pressable
          accessibilityLabel={`${cameraFacing === 'front' ? '후면' : '전면'} 카메라로 전환`}
          accessibilityRole="button"
          onPress={handleToggleCamera}
          style={({pressed}) => [
            styles.switchControl,
            {
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <RefreshCw color={colors.white} size={iconSize.lg} strokeWidth={2.1} />
        </Pressable>
      </View>

      <View style={[styles.modeSwitch, {bottom: insets.bottom + spacing.xxl}]}>
        <Pressable accessibilityRole="button" style={styles.activeMode}>
          <Text style={styles.activeModeText}>사진</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="갤러리에서 사진 선택"
          accessibilityRole="button"
          accessibilityState={{disabled: isPickingImage}}
          disabled={isPickingImage}
          onPress={handlePickImage}
          style={({pressed}) => [
            styles.inactiveMode,
            {
              opacity: pressed || isPickingImage ? 0.7 : 1,
            },
          ]}>
          <Text style={styles.inactiveModeText}>갤러리</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  activeMode: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    flex: 1,
    height: 36,
    justifyContent: 'center',
  },
  activeModeText: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  cameraFallback: {
    backgroundColor: colors.black,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  captureControls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    left: spacing.xxl + spacing.sm,
    position: 'absolute',
    right: spacing.xxl + spacing.sm,
  },
  closeButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xxl,
    width: 48,
    zIndex: 20,
  },
  inactiveMode: {
    alignItems: 'center',
    flex: 1,
    height: 36,
    justifyContent: 'center',
  },
  inactiveModeText: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  modeSwitch: {
    alignItems: 'center',
    backgroundColor: feedbackColors.overlayStrong,
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 44,
    left: spacing.xl,
    padding: spacing.xs,
    position: 'absolute',
    right: spacing.xl,
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
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  switchControl: {
    alignItems: 'center',
    height: iconSize.xl + spacing.xl,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: iconSize.xl + spacing.xl,
  },
});
