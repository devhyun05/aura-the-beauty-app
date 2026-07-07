import {resolveFaceAnalysisReportImageSource} from './faceAnalysisService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const originalApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const originalCdnBaseUrl = process.env.EXPO_PUBLIC_CDN_BASE_URL;

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://cdn.example.com/api';

const localCaptureSource = resolveFaceAnalysisReportImageSource(
  {
    detailPayload: {
      request: {
        cdnUrl: 'https://cdn.example.com/uploads/capture/server-face.jpg',
      },
    },
  },
  {
    imageUri: 'file:///tmp/latest-face.jpg',
  },
) as {uri?: string};

expectEqual(
  localCaptureSource.uri,
  'file:///tmp/latest-face.jpg',
  'analysis report image source prefers the just-captured local image',
);

const storedCaptureSource = resolveFaceAnalysisReportImageSource({
  detailPayload: {
    request: {
      cdnUrl: 'https://cdn.example.com/uploads/capture/stored-face.jpg',
    },
  },
}) as {uri?: string};

expectEqual(
  storedCaptureSource.uri,
  'https://cdn.example.com/uploads/capture/stored-face.jpg',
  'analysis report image source restores stored capture cdn url',
);

const objectKeySource = resolveFaceAnalysisReportImageSource({
  detailPayload: {
    request: {
      objectKey: 'uploads/capture/object-key-face.jpg',
    },
  },
}) as {uri?: string};

expectEqual(
  objectKeySource.uri,
  'https://cdn.example.com/uploads/capture/object-key-face.jpg',
  'analysis report image source builds cdn url from stored object key',
);

process.env.EXPO_PUBLIC_CDN_BASE_URL = 'https://media.example.com/';

const explicitCdnObjectKeySource = resolveFaceAnalysisReportImageSource({
  detailPayload: {
    request: {
      objectKey: 'uploads/capture/explicit-cdn-face.jpg',
    },
  },
}) as {uri?: string};

expectEqual(
  explicitCdnObjectKeySource.uri,
  'https://media.example.com/uploads/capture/explicit-cdn-face.jpg',
  'analysis report image source uses explicit cdn base url before api base url',
);

process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBaseUrl;
process.env.EXPO_PUBLIC_CDN_BASE_URL = originalCdnBaseUrl;
