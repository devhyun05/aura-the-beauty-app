const {
  getAuradinInternalBackTarget,
  shouldClaimAuradinBackSwipe,
  shouldCommitAuradinBackSwipe,
}: typeof import('./auradinNavigation') = require('./auradinNavigation.ts');

function expectEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getAuradinInternalBackTarget({phase: 'detail', detailOrigin: 'results', hasResults: true}),
  'results',
  'detail opened from results returns to results',
);
expectEqual(
  getAuradinInternalBackTarget({phase: 'detail', detailOrigin: 'saved', hasResults: true}),
  'saved',
  'detail opened from saved returns to saved',
);
expectEqual(
  getAuradinInternalBackTarget({phase: 'saved', detailOrigin: 'results', hasResults: true}),
  'results',
  'saved page returns to existing results',
);
expectEqual(
  getAuradinInternalBackTarget({phase: 'saved', detailOrigin: 'results', hasResults: false}),
  'home',
  'saved page without a search returns to AURADIN home',
);
expectEqual(
  getAuradinInternalBackTarget({phase: 'results', detailOrigin: 'results', hasResults: true}),
  null,
  'top-level results delegates back to native navigation',
);

expectEqual(
  shouldClaimAuradinBackSwipe({enabled: true, startX: 12, dx: 24, dy: 3}),
  true,
  'right swipe from the left edge is claimed',
);
expectEqual(
  shouldClaimAuradinBackSwipe({enabled: true, startX: 80, dx: 24, dy: 3}),
  false,
  'horizontal content away from the edge is not stolen',
);
expectEqual(
  shouldClaimAuradinBackSwipe({enabled: true, startX: 12, dx: 8, dy: 24}),
  false,
  'vertical scrolling is not stolen',
);
expectEqual(
  shouldCommitAuradinBackSwipe({dx: 72, velocityX: 0.1}),
  true,
  'a sufficiently long swipe commits back',
);
expectEqual(
  shouldCommitAuradinBackSwipe({dx: 18, velocityX: 0.8}),
  true,
  'a short fast swipe commits back',
);
expectEqual(
  shouldCommitAuradinBackSwipe({dx: 18, velocityX: 0.1}),
  false,
  'a short slow drag is cancelled',
);

console.log('auradinNavigation contract assertions passed');
