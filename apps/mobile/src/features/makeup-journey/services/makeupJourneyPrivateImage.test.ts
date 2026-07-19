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
expect(
  firstSource?.uri?.includes('cacheRevision=4') === true,
  'private thumbnail URL includes the account cache revision',
);
expect(
  getMakeupJourneyPrivateImageSource('https://public.example/face.jpg', 4) === null,
  'public or arbitrary image URLs are rejected by the private calendar helper',
);

const generationBeforeClear = getMakeupJourneyPrivateImageGeneration();
clearMakeupJourneyPrivateImageMemoryCache();
const secondSource = getMakeupJourneyPrivateImageSource(endpointPath, 5);
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
  getMakeupJourneyPrivateImageSource(endpointPath, 5) === null,
  'private thumbnail source is unavailable without authentication',
);

console.log('makeup journey private image contract passed');
