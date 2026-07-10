import {Platform, StyleProp, UIManager, View, ViewStyle, requireNativeComponent} from 'react-native';

type NativeChimeVideoViewProps = {
  style?: StyleProp<ViewStyle>;
  tileType: 'local' | 'remote';
};

const NATIVE_VIEW_NAME = 'AURAChimeVideoView';

function hasNativeChimeVideoView(): boolean {
  return Platform.OS === 'ios' && Boolean(UIManager.getViewManagerConfig?.(NATIVE_VIEW_NAME));
}

const NativeChimeVideoView = hasNativeChimeVideoView()
  ? requireNativeComponent<NativeChimeVideoViewProps>(NATIVE_VIEW_NAME)
  : null;

export function isNativeChimeVideoViewAvailable(): boolean {
  return Boolean(NativeChimeVideoView);
}

export function ChimeVideoView({style, tileType}: NativeChimeVideoViewProps) {
  if (!NativeChimeVideoView) {
    return <View style={style} />;
  }

  return <NativeChimeVideoView style={style} tileType={tileType} />;
}
