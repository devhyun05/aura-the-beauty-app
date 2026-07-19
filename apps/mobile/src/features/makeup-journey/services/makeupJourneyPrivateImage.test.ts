import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {setBackendAuthTokenProvider} from '../../../shared/services/backendApi';
import {
  clearMakeupJourneyPrivateImageMemoryCache,
  getMakeupJourneyPrivateImageGeneration,
  getMakeupJourneyPrivateImageSource,
} from './makeupJourneyPrivateImage';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.com/api';
setBackendAuthTokenProvider(() => 'private-token');

const endpointPath = '/makeup-journey/reports/11111111-1111-1111-1111-111111111111/thumbnail';
const firstSource = getMakeupJourneyPrivateImageSource(endpointPath, 4);
expect(
  firstSource?.uri?.startsWith('https://api.example.com/api/makeup-journey/reports/') === true,
  'private thumbnail source stays on the configured authenticated backend origin',
);
expect(
  firstSource?.headers?.Authorization === 'Bearer private-token',
  'private thumbnail source includes the current backend authorization header',
);

const privateImageServiceSource = readFileSync(
  join(
    process.cwd(),
    'apps/mobile/src/features/makeup-journey/services/makeupJourneyPrivateImage.ts',
  ),
  'utf8',
);
expect(
  privateImageServiceSource.includes(
    'const prefetchOptions: ImagePrefetchOptions = {',
  ) &&
    privateImageServiceSource.includes('headers: source.headers') &&
    privateImageServiceSource.includes(
      'ExpoImage.prefetch(source.uri, prefetchOptions)',
    ),
  'private thumbnail prefetch uses the expo-image options overload so Authorization headers reach the native request',
);
expect(
  !privateImageServiceSource.includes("ExpoImage.prefetch(source, 'memory')"),
  'private thumbnail prefetch does not use the unsupported ImageSource overload',
);
expect(
  firstSource?.uri?.includes('cacheRevision=4') === true,
  'private thumbnail URL includes the data revision for transport revalidation',
);
const sameAccountNewDataRevision = getMakeupJourneyPrivateImageSource(endpointPath, 5);
expect(
  firstSource?.cacheKey === sameAccountNewDataRevision?.cacheKey,
  'unrelated journey data revisions keep an immutable report thumbnail warm',
);
expect(
  firstSource?.uri !== sameAccountNewDataRevision?.uri,
  'transport URLs can revalidate without changing the report image cache identity',
);
expect(
  getMakeupJourneyPrivateImageSource('https://public.example/face.jpg', 4) === null,
  'public or arbitrary image URLs are rejected by the private calendar helper',
);

const generationBeforeClear = getMakeupJourneyPrivateImageGeneration();
clearMakeupJourneyPrivateImageMemoryCache();
const secondSource = getMakeupJourneyPrivateImageSource(endpointPath, 6);
expect(
  getMakeupJourneyPrivateImageGeneration() === generationBeforeClear + 1,
  'account changes advance the private image generation',
);
expect(
  firstSource?.cacheKey !== secondSource?.cacheKey,
  'a prior account private thumbnail cache key cannot be reused after clearing',
);

setBackendAuthTokenProvider(null);
expect(
  getMakeupJourneyPrivateImageSource(endpointPath, 6) === null,
  'private thumbnail source is unavailable without authentication',
);

console.log('makeup journey private image contract passed');
