import {
  PROFILE_LOAD_ERROR_MESSAGE,
  resolveProfileLoadState,
} from './profileLoadState';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function expectRejectedLoadShowsErrorState() {
  const state = await resolveProfileLoadState(() =>
    Promise.reject(new Error('network unavailable')),
  );

  expectEqual(state.status, 'error', 'rejected profile load state');

  if (state.status !== 'error') {
    throw new Error('rejected profile load should return an error state');
  }

  expectEqual(
    state.message,
    PROFILE_LOAD_ERROR_MESSAGE,
    'rejected profile load message',
  );
}

void expectRejectedLoadShowsErrorState();
