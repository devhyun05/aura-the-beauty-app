import {
  forwardRef,
  useMemo,
  type ComponentType,
  type ForwardedRef,
  type ReactNode,
} from 'react';
import {View, type StyleProp, type ViewStyle} from 'react-native';

declare const require: (moduleName: string) => unknown;

export type OptionalViewShotRef = {
  capture?: () => Promise<string | undefined> | string | undefined;
};

export type OptionalViewShotOptions = {
  format?: 'jpg' | 'png' | 'webm' | 'raw';
  quality?: number;
  result?: 'tmpfile' | 'base64' | 'data-uri' | 'zip-base64';
  // 대형(긴) 뷰는 기본 drawViewHierarchy 캡처가 실기기에서 실패한다.
  // layer.renderInContext 경로로 전환하는 네이티브 옵션.
  useRenderInContext?: boolean;
};

type OptionalViewShotProps = {
  children: ReactNode;
  options?: OptionalViewShotOptions;
  style?: StyleProp<ViewStyle>;
};

type NativeViewShotComponent = ComponentType<
  OptionalViewShotProps & {
    ref?: ForwardedRef<OptionalViewShotRef>;
  }
>;

function isNativeViewShotComponent(value: unknown): value is NativeViewShotComponent {
  return typeof value === 'function' || (typeof value === 'object' && value !== null);
}

function loadNativeViewShotComponent() {
  try {
    const viewShotModule = require('react-native-view-shot') as {
      default?: unknown;
    };
    const candidate = viewShotModule.default ?? viewShotModule;

    return isNativeViewShotComponent(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export const OptionalViewShot = forwardRef<OptionalViewShotRef, OptionalViewShotProps>(
  function OptionalViewShot({children, options, style}, ref) {
    const NativeViewShot = useMemo(loadNativeViewShotComponent, []);

    if (!NativeViewShot) {
      return <View style={style}>{children}</View>;
    }

    return (
      <NativeViewShot options={options} ref={ref} style={style}>
        {children}
      </NativeViewShot>
    );
  },
);
