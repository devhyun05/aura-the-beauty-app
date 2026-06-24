import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {CameraView, useCameraPermissions, type CameraType} from 'expo-camera';

import {colors, radius, spacing, typography} from '../theme';

type LiveCameraPermissionReason = 'permission' | 'mountError';

type LiveCameraPermissionCopy = {
  title: string;
  description: string;
};

type LiveCameraLayerProps = {
  active?: boolean;
  facing?: CameraType;
  fallback?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function shouldMirrorLiveCamera(facing: CameraType): boolean {
  return facing === 'front';
}

export function getLiveCameraPermissionCopy(
  reason: LiveCameraPermissionReason,
  mountError?: string | null,
): LiveCameraPermissionCopy {
  if (reason === 'mountError') {
    return {
      title: '카메라를 사용할 수 없어요',
      description: mountError ?? '기기 또는 시뮬레이터의 카메라 상태를 확인해 주세요.',
    };
  }

  return {
    title: '카메라 권한이 필요해요',
    description: 'AR 필터와 얼굴 촬영을 위해 카메라 접근을 허용해 주세요.',
  };
}

export function LiveCameraLayer({
  active = true,
  facing = 'front',
  fallback,
  style,
}: LiveCameraLayerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mountError, setMountError] = useState<string | null>(null);
  const shouldShowCamera = permission?.granted === true && !mountError;
  const permissionCopy = getLiveCameraPermissionCopy(
    mountError ? 'mountError' : 'permission',
    mountError,
  );

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const handleRequestPermission = async () => {
    const nextPermission = await requestPermission();

    if (nextPermission.granted) {
      setMountError(null);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, !shouldShowCamera ? styles.permissionHost : undefined, style]}>
      {shouldShowCamera ? (
        <CameraView
          active={active}
          facing={facing}
          flash="off"
          mirror={shouldMirrorLiveCamera(facing)}
          mode="picture"
          onCameraReady={() => setMountError(null)}
          onMountError={error => setMountError(error.message)}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={styles.fallbackLayer}>{fallback}</View>
      )}

      {!shouldShowCamera ? (
        <View style={styles.permissionLayer}>
          {permission === null && !mountError ? (
            <ActivityIndicator color={colors.white} size="large" />
          ) : (
            <>
              <Text style={styles.permissionTitle}>{permissionCopy.title}</Text>
              <Text style={styles.permissionDescription}>{permissionCopy.description}</Text>
              {permission?.canAskAgain ? (
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
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackLayer: {
    backgroundColor: colors.black,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  layer: {
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  permissionHost: {
    zIndex: 30,
  },
  permissionButton: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  permissionButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  permissionDescription: {
    color: colors.borderStrong,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    marginTop: spacing.sm,
    maxWidth: 280,
    textAlign: 'center',
  },
  permissionLayer: {
    alignItems: 'center',
    backgroundColor: colors.black,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: spacing.xxl,
    position: 'absolute',
    right: 0,
    top: 0,
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
