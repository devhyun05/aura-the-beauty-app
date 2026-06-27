import React, {useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {Image as ImageIcon, RefreshCw, X} from 'lucide-react-native';
import {CameraView} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {
  CameraCaptureControlRow,
  CameraCaptureButton,
  CameraUtilityButton,
  FloatingOverlayIconButton,
  FullscreenOverlayScreen,
  LiveCameraLayer,
} from '../../../shared/ui';
import {mockReadyFaceCaptureChecks} from '../mocks/faceCapture.mock';
import {
  evaluateFaceCaptureGuidance,
  type FaceCaptureCheckState,
} from '../services/faceCaptureValidation';
import {
  uploadFaceCaptureImage,
  type FaceCaptureUploadResult,
} from '../services/faceCaptureUploadService';

type CameraDirection = 'front' | 'back';

type FaceCaptureScreenProps = {
  checks?: FaceCaptureCheckState;
  onCapture?: (result?: FaceCaptureUploadResult) => void;
  onClose?: () => void;
  onPickImage?: () => void;
  onToggleCamera?: (direction: CameraDirection) => void;
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
  const cameraRef = useRef<CameraView>(null);
  const [cameraDirection, setCameraDirection] = useState<CameraDirection>('front');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const guidance = useMemo(() => evaluateFaceCaptureGuidance(checks), [checks]);
  const guideWidth = Math.min(Math.max(width * 0.48, 174), 202);
  const guideHeight = guideWidth * 1.28;
  const guideScaleY = guideHeight / guideWidth;
  const guideCenterY = Math.max(insets.top + guideHeight / 2 + 130, height * 0.48);
  const guideTop = guideCenterY - guideWidth / 2;
  const controlsBottom = Math.max(insets.bottom + 64, height * 0.1);
  const errorTop = Math.max(insets.top + 82, guideCenterY - guideHeight / 2 - 74);
  const captureMessage = uploadError ?? (isUploading ? 'Uploading photo...' : guidance.message);
  const captureTintColor = uploadError ? colors.danger : guidance.tintColor;
  const isCaptureDisabled = !guidance.isCaptureEnabled || !isCameraReady || isUploading;

  const handleToggleCamera = () => {
    const nextDirection = cameraDirection === 'front' ? 'back' : 'front';
    setCameraDirection(nextDirection);
    setIsCameraReady(false);
    setUploadError(null);
    onToggleCamera?.(nextDirection);
  };

  const handleCapture = async () => {
    if (isCaptureDisabled) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const picture = await cameraRef.current?.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });

      if (!picture?.uri) {
        throw new Error('Camera did not return an image file.');
      }

      const result = await uploadFaceCaptureImage({
        height: picture.height,
        source: 'camera',
        uri: picture.uri,
        width: picture.width,
      });

      onCapture?.(result);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Photo upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePickImage = async () => {
    if (onPickImage) {
      onPickImage();
      return;
    }

    if (isPickingImage || isUploading) {
      return;
    }

    setIsPickingImage(true);
    setUploadError(null);

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

      if (pickerResult.canceled || pickerResult.assets.length === 0) {
        return;
      }

      setIsUploading(true);
      const asset = pickerResult.assets[0];
      const result = await uploadFaceCaptureImage({
        contentType: asset.mimeType,
        fileName: asset.fileName,
        height: asset.height,
        source: 'gallery',
        uri: asset.uri,
        width: asset.width,
      });

      onCapture?.(result);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Photo upload failed.');
    } finally {
      setIsPickingImage(false);
      setIsUploading(false);
    }
  };

  return (
    <FullscreenOverlayScreen>
      <StatusBar style="light" />
      <LiveCameraLayer
        facing={cameraDirection}
        ref={cameraRef}
        onCameraReady={() => setIsCameraReady(true)}
        onMountError={() => setIsCameraReady(false)}
      />

      <FloatingOverlayIconButton
        accessibilityLabel="Close capture screen"
        onPress={onClose}>
        <X color={captureTintColor} size={iconSize.xl} strokeWidth={1.8} />
      </FloatingOverlayIconButton>

      {captureMessage ? (
        <View pointerEvents="none" style={[styles.errorBubbleHost, {top: errorTop}]}>
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.errorBubble,
              {
                backgroundColor: captureTintColor,
              },
            ]}>
            <Text style={styles.errorText}>{captureMessage}</Text>
          </View>
        </View>
      ) : null}

      <View
        pointerEvents="none"
        style={[
          styles.faceGuide,
          {
            borderColor: captureTintColor,
            borderRadius: guideWidth / 2,
            height: guideWidth,
            left: (width - guideWidth) / 2,
            top: guideTop,
            transform: [{scaleY: guideScaleY}],
            width: guideWidth,
          },
        ]}
      />

      <CameraCaptureControlRow
        bottom={controlsBottom}
        centerSlot={
          <CameraCaptureButton
            accessibilityLabel={
              isCaptureDisabled ? 'Capture disabled until face landmarks pass' : 'Capture photo'
            }
            disabled={isCaptureDisabled}
            innerColor={captureTintColor}
            onPress={handleCapture}
            showInnerDot={!isUploading}>
            {isUploading ? <ActivityIndicator color={colors.white} size="small" /> : null}
          </CameraCaptureButton>
        }
        horizontalPadding={spacing.xxl * 2 + spacing.xs}
        leftSlot={
          <CameraUtilityButton
            accessibilityLabel="Pick photo from album"
            disabled={isPickingImage || isUploading}
            onPress={handlePickImage}>
            <ImageIcon color={captureTintColor} size={iconSize.lg} strokeWidth={2.1} />
          </CameraUtilityButton>
        }
        rightSlot={
          <CameraUtilityButton
            accessibilityLabel={`Switch to ${cameraDirection === 'front' ? 'back' : 'front'} camera`}
            disabled={isUploading}
            onPress={handleToggleCamera}>
            <RefreshCw color={captureTintColor} size={iconSize.lg} strokeWidth={2.1} />
          </CameraUtilityButton>
        }
      />
    </FullscreenOverlayScreen>
  );
}

const styles = StyleSheet.create({
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
});
