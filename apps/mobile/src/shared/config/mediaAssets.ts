import type {ImageSourcePropType} from 'react-native';

const DEFAULT_MEDIA_BASE_URL = 'https://d3t1pbvtir1lj.cloudfront.net';

function getMediaBaseUrl() {
  return (
    process.env.EXPO_PUBLIC_MEDIA_BASE_URL?.trim().replace(/\/+$/, '') ||
    DEFAULT_MEDIA_BASE_URL
  );
}

export function appAssetUri(path: string): string {
  return `${getMediaBaseUrl()}/uploads/app-assets/${path.replace(/^\/+/, '')}`;
}

export function appAssetSource(path: string): ImageSourcePropType {
  return {uri: appAssetUri(path)};
}

export function makeupFilterAssetSource(filename: string): ImageSourcePropType {
  return {uri: `${getMediaBaseUrl()}/uploads/makeup-filters/${filename}`};
}
