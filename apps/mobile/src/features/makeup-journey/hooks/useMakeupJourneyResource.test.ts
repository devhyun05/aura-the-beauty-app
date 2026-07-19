import {resolveMakeupJourneyRefreshData} from './useMakeupJourneyResource';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const current = {data: {owner: 'previous-user'}, key: '2026-07'};
const patched = {owner: 'current-user'};

expect(
  resolveMakeupJourneyRefreshData(current, patched, '2026-07', true) === patched,
  'a mutation-patched shared cache is shown before background revalidation',
);
expect(
  resolveMakeupJourneyRefreshData(current, null, '2026-07', true) === current.data,
  'a targeted refresh may keep same-account visible data while loading',
);
expect(
  resolveMakeupJourneyRefreshData(current, null, '2026-07', false) === null,
  'a global account-boundary invalidation never exposes the previous user data',
);

console.log('makeup journey resource visibility contract passed');
