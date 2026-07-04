import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Linking,
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

type LiveCameraPermissionAction = 'request' | 'settings';

type LiveCameraPermissionState = {
  canAskAgain: boolean;
  granted: boolean;
};

type LiveCameraLayerProps = {
  active?: boolean;
  facing?: CameraType;
  fallback?: React.ReactNode;
  onCameraReady?: () => void;
  onMountError?: (message: string) => void;
  style?: StyleProp<ViewStyle>;
};

export function shouldMirrorLiveCamera(facing: CameraType): boolean {
  return facing === 'front';
}

export function shouldRenderLiveCamera({
  active,
  mountError,
  permission,
}: {
  active: boolean;
  mountError?: string | null;
  permission: LiveCameraPermissionState | null | undefined;
}): boolean {
  return active && permission?.granted === true && !mountError;
}

export function getLiveCameraPermissionAction(
  permission: LiveCameraPermissionState | null | undefined,
  hasMountError = false,
): LiveCameraPermissionAction | null {
  if (!permission || permission.granted || hasMountError) {
    return null;
  }

  return permission.canAskAgain ? 'request' : 'settings';
}

export function getLiveCameraPermissionCopy(
  reason: LiveCameraPermissionReason,
  mountError?: string | null,
): LiveCameraPermissionCopy {
  if (reason === 'mountError') {
    return {
      title: 'Camera is unavailable',
      description: mountError ?? 'Check the device or simulator camera state.',
    };
  }

  return {
    title: 'Camera permission is required',
    description: 'Allow camera access to capture a face photo.',
  };
}

export const LiveCameraLayer = React.forwardRef<CameraView, LiveCameraLayerProps>(
  function LiveCameraLayer(
    {
      active = true,
      facing = 'front',
      fallback,
      onCameraReady,
      onMountError,
      style,
    },
    ref,
  ) {
    const [permission, requestPermission] = useCameraPermissions();
    const [mountError, setMountError] = useState<string | null>(null);
    const shouldShowCamera = shouldRenderLiveCamera({active, mountError, permission});
    const shouldShowPermission = active && !shouldShowCamera;
    const permissionCopy = getLiveCameraPermissionCopy(
      mountError ? 'mountError' : 'permission',
      mountError,
    );
    const permissionAction = getLiveCameraPermissionAction(permission, Boolean(mountError));

    useEffect(() => {
      if (!active) {
        return;
      }

      if (permission && !permission.granted && permission.canAskAgain) {
        void requestPermission();
      }
    }, [active, permission, requestPermission]);

    const handleRequestPermission = async () => {
      const nextPermission = await requestPermission();

      if (nextPermission.granted) {
        setMountError(null);
      }
    };

    const handleOpenSettings = () => {
      void Linking.openSettings();
    };

    return (
      <View
        pointerEvents="box-none"
        style={[styles.layer, shouldShowPermission ? styles.permissionHost : undefined, style]}>
        {shouldShowCamera ? (
          <CameraView
            active={active}
            facing={facing}
            flash="off"
            mirror={shouldMirrorLiveCamera(facing)}
            mode="picture"
            onCameraReady={() => {
              setMountError(null);
              onCameraReady?.();
            }}
            onMountError={error => {
              setMountError(error.message);
              onMountError?.(error.message);
            }}
            ref={ref}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={styles.fallbackLayer}>{fallback}</View>
        )}

        {shouldShowPermission ? (
          <View style={styles.permissionLayer}>
            {permission === null && !mountError ? (
              <ActivityIndicator color={colors.white} size="large" />
            ) : (
              <>
                <Text style={styles.permissionTitle}>{permissionCopy.title}</Text>
                <Text style={styles.permissionDescription}>{permissionCopy.description}</Text>
                {permissionAction ? (
                  <Pressable
                    accessibilityLabel={
                      permissionAction === 'settings'
                        ? 'Open camera permission settings'
                        : 'Allow camera permission'
                    }
                    accessibilityRole="button"
                    onPress={permissionAction === 'settings' ? handleOpenSettings : handleRequestPermission}
                    style={styles.permissionButton}>
                    <Text style={styles.permissionButtonText}>
                      {permissionAction === 'settings' ? 'Open settings' : 'Allow camera'}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </View>
    );
  },
);

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
