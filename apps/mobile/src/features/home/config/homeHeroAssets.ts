import {Image as ExpoImage} from 'expo-image';

import {prefetchImageSources} from '../../../shared/services/imageCacheService';

export const homeHeroFaceDiagnosis = require('../../../assets/images/home-hero/hero-face-diagnosis.webp') as number;
export const homeHeroMakeupExtraction = require('../../../assets/images/home-hero/hero-makeup-extraction.webp') as number;
export const homeHeroConsulting = require('../../../assets/images/home-hero/hero-consulting.webp') as number;
export const homeHeroAuradin = require('../../../assets/images/home-hero/hero-auradin.webp') as number;

export const homeHeroImageSources = [
  homeHeroFaceDiagnosis,
  homeHeroMakeupExtraction,
  homeHeroConsulting,
  homeHeroAuradin,
] as const;

let firstHeroImagePreload: Promise<unknown> | undefined;

export function prefetchHomeHeroImages(): void {
  prefetchImageSources(homeHeroImageSources);

  // Retain the decoded first slide so the initial home render can display it immediately.
  firstHeroImagePreload ??= ExpoImage.loadAsync(homeHeroFaceDiagnosis).catch(
    () => undefined,
  );
}
