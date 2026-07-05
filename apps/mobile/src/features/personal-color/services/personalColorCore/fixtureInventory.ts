// 타입 TS 픽스처 (JSON 아님). 스키마버전 규약(lipGenerateCore/fixtureInventory.ts) 준수.
// RGB는 probe로 검증된 값 — axisModel 테스트의 부호 assertion을 만족.

import type { NativePersonalColorResult, NativeRegionStats, Rgb } from './contracts';

export type PersonalColorFixture = {
  fixtureId: string;
  label: string;
  expectedSeason: 'spring' | 'summer' | 'autumn' | 'winter' | 'cusp' | 'none';
  native: NativePersonalColorResult;
  expectedWarnings: string[];
};

export type PersonalColorFixtureInventory = {
  schemaVersion: 'aura-personal-color-fixture-inventory-v1';
  defaultFixtureId: string;
  fixtures: PersonalColorFixture[];
};

type StatsOverrides = Partial<NativeRegionStats>;

function stats(rgb: Rgb, overrides: StatsOverrides = {}): NativeRegionStats {
  return {
    rgbMean: rgb,
    rgbVariance: { r: 60, g: 60, b: 60 },
    dominant: rgb,
    sampleCount: 800,
    areaRatio: 0.8, // matte-gated coverage 비율 (0..1)
    matteCoverage: 0.9,
    overexposedRatio: 0,
    underexposedRatio: 0,
    specularRejectedRatio: 0.05,
    confidence: 0.85,
    ...overrides,
  };
}

function skinPatches(rgb: Rgb, overrides: StatsOverrides = {}) {
  return {
    skinCheekLeft: stats(rgb, overrides),
    skinCheekRight: stats(rgb, overrides),
    skinForehead: stats(rgb, overrides),
  };
}

function base(regions: NativePersonalColorResult['regions']): NativePersonalColorResult {
  return {
    status: 'ok',
    faceCount: 1,
    landmarkCount: 478,
    imageWidth: 1080,
    imageHeight: 1440,
    colorSpace: 'srgb',
    matte: { skinAvailable: true, hairAvailable: true, matteWidth: 512, matteHeight: 682 },
    regions,
    warnings: [],
  };
}

export const PERSONAL_COLOR_FIXTURES: PersonalColorFixtureInventory = {
  schemaVersion: 'aura-personal-color-fixture-inventory-v1',
  defaultFixtureId: 'light_cool_summer',
  fixtures: [
    {
      fixtureId: 'light_cool_summer',
      label: '밝고 쿨한 여름 (value<0, temperature<0)',
      expectedSeason: 'summer',
      native: base({
        ...skinPatches({ r: 232, g: 214, b: 214 }),
        hair: stats({ r: 35, g: 33, b: 38 }),
        lip: stats({ r: 170, g: 80, b: 95 }, { matteCoverage: 1 }),
      }),
      expectedWarnings: [],
    },
    {
      fixtureId: 'deep_warm_autumn',
      label: '어둡고 웜한 가을 (value>0, temperature>0)',
      expectedSeason: 'autumn',
      native: base({
        ...skinPatches({ r: 140, g: 100, b: 72 }),
        hair: stats({ r: 60, g: 44, b: 30 }),
        lip: stats({ r: 210, g: 110, b: 85 }, { matteCoverage: 1 }),
      }),
      expectedWarnings: [],
    },
    {
      fixtureId: 'bright_clear_winter',
      label: '선명 쿨 겨울 (chroma>0)',
      expectedSeason: 'winter',
      native: base({
        ...skinPatches({ r: 200, g: 175, b: 170 }),
        hair: stats({ r: 33, g: 31, b: 36 }),
        lip: stats({ r: 200, g: 40, b: 60 }, { matteCoverage: 1 }),
      }),
      expectedWarnings: [],
    },
    {
      fixtureId: 'muted_soft_summer',
      label: '뮤트 소프트 여름 (chroma<0)',
      expectedSeason: 'summer',
      native: base({
        ...skinPatches({ r: 232, g: 214, b: 214 }),
        hair: stats({ r: 150, g: 120, b: 80 }),
        lip: stats({ r: 150, g: 110, b: 110 }, { matteCoverage: 1 }),
      }),
      expectedWarnings: [],
    },
    {
      fixtureId: 'low_confidence_all',
      label: '전부 저신뢰 → insufficient',
      expectedSeason: 'none',
      native: base({
        ...skinPatches({ r: 200, g: 175, b: 170 }, { confidence: 0.1, areaRatio: 0.05 }),
        hair: stats({ r: 33, g: 31, b: 36 }, { confidence: 0.1, areaRatio: 0.05 }),
        lip: stats({ r: 200, g: 40, b: 60 }, { confidence: 0.1, areaRatio: 0.05, matteCoverage: 1 }),
      }),
      expectedWarnings: ['insufficient_signal'],
    },
    {
      fixtureId: 'hair_missing',
      label: '헤어 매트 부재 (skin+lip만)',
      expectedSeason: 'none',
      native: base({
        ...skinPatches({ r: 232, g: 214, b: 214 }),
        lip: stats({ r: 170, g: 80, b: 95 }, { matteCoverage: 1 }),
      }),
      expectedWarnings: ['hair_missing'],
    },
    {
      fixtureId: 'overexposed_skin',
      label: '피부 과노출',
      expectedSeason: 'none',
      native: base({
        ...skinPatches({ r: 248, g: 240, b: 238 }, { overexposedRatio: 0.5 }),
        hair: stats({ r: 60, g: 44, b: 30 }),
        lip: stats({ r: 210, g: 110, b: 85 }, { matteCoverage: 1 }),
      }),
      expectedWarnings: ['skin_overexposed'],
    },
  ],
};

export function findFixture(id: string): PersonalColorFixture | undefined {
  return PERSONAL_COLOR_FIXTURES.fixtures.find(f => f.fixtureId === id);
}

export function requireFixture(id: string): PersonalColorFixture {
  const f = findFixture(id);
  if (!f) throw new Error(`fixture not found: ${id}`);
  return f;
}
