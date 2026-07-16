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

let heroImagesPreload: Promise<unknown> | undefined;

/**
 * Decode every bundled hero as early as possible so carousel changes never
 * wait on the image pipeline.
 */
export function prefetchHomeHeroImages(): void {
  heroImagesPreload ??= Promise.all(
    homeHeroImageSources.map(source => (
      ExpoImage.loadAsync(source).catch(() => undefined)
    )),
  );
}
