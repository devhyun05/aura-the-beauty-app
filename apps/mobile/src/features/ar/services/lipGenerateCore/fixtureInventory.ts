import { LipMaskProvider } from './contracts';

export type LipGenerateFixture = {
  fixtureId: string;
  label: string;
  capturePairId: string;
  framePath: string;
  arFaceExportPath: string;
  fusionSummaryPath: string;
  referenceMaskPath: string;
  providers: Record<
    LipMaskProvider,
    {
      status: 'available' | 'partial' | 'blocked';
      contourPath?: string;
      maskPath?: string;
      pointsPath?: string;
      warnings: string[];
    }
  >;
  privacy: {
    localOnly: true;
    offDeviceUpload: false;
    longTermRawFrameStored: false;
  };
  expectedWarnings: string[];
};

export type LipGenerateFixtureInventory = {
  schemaVersion: 'e7-lip-generate-fixture-inventory-v0';
  defaultFixtureId: string;
  fixtures: LipGenerateFixture[];
};

export function findFixture(
  inventory: LipGenerateFixtureInventory,
  fixtureId: string,
): LipGenerateFixture | undefined {
  return inventory.fixtures.find(fixture => fixture.fixtureId === fixtureId);
}

export function providerAvailable(
  fixture: LipGenerateFixture,
  provider: LipMaskProvider,
): boolean {
  return fixture.providers[provider]?.status !== 'blocked';
}
