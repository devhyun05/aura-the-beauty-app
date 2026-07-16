import {Image as ExpoImage} from 'expo-image';

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

/**
 * Decode only the first hero before Home is shown. Remaining slides are loaded
 * by the carousel at low priority until they become active.
 */
export function prefetchHomeHeroImages(): void {
  firstHeroImagePreload ??= ExpoImage.loadAsync(homeHeroFaceDiagnosis).catch(
    () => undefined,
  );
}
