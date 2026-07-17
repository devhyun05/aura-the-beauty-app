import {
  DEFAULT_FLOATING_ACTION_ANCHOR,
  FLOATING_ACTION_ANCHOR_STORAGE_KEY,
  getFloatingActionButtonPositionForAnchor,
  LEFT_FLOATING_ACTION_ANCHOR,
  LEGACY_FLOATING_ACTION_POSITION_STORAGE_KEY,
  loadFloatingActionAnchor,
  parseFloatingActionAnchor,
  saveFloatingActionAnchor,
} from './floatingActionAnchorStore';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  parseFloatingActionAnchor('{"xRatio":0.3,"yRatio":0.6}')?.xRatio,
  0.3,
  'normalized anchor parses',
);
expectEqual(
  parseFloatingActionAnchor('{"xRatio":2,"yRatio":0.6}'),
  null,
  'out-of-range anchor is rejected',
);
expectEqual(
  parseFloatingActionAnchor('left')?.xRatio,
  LEFT_FLOATING_ACTION_ANCHOR.xRatio,
  'legacy left enum migrates',
);
expectEqual(
  parseFloatingActionAnchor('{"position":"right"}')?.xRatio,
  DEFAULT_FLOATING_ACTION_ANCHOR.xRatio,
  'legacy position object migrates',
);
expectEqual(
  getFloatingActionButtonPositionForAnchor(LEFT_FLOATING_ACTION_ANCHOR),
  'left',
  'normalized left anchor keeps the legacy settings position in sync',
);
expectEqual(
  getFloatingActionButtonPositionForAnchor(DEFAULT_FLOATING_ACTION_ANCHOR),
  'right',
  'normalized right anchor keeps the legacy settings position in sync',
);

void (async () => {
  const values = new Map<string, string>([
    [LEGACY_FLOATING_ACTION_POSITION_STORAGE_KEY, 'left'],
  ]);
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const migrated = await loadFloatingActionAnchor(storage);

  expectEqual(migrated.xRatio, LEFT_FLOATING_ACTION_ANCHOR.xRatio, 'legacy anchor load');
  expectEqual(
    Boolean(values.get(FLOATING_ACTION_ANCHOR_STORAGE_KEY)),
    true,
    'legacy anchor is persisted with the v1 key',
  );

  await saveFloatingActionAnchor({xRatio: 0.45, yRatio: 0.25}, storage);
  expectEqual(
    parseFloatingActionAnchor(values.get(FLOATING_ACTION_ANCHOR_STORAGE_KEY))?.yRatio,
    0.25,
    'saved normalized anchor round-trips',
  );
})();
