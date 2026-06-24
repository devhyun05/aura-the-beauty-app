import {
  MY_PAGE_LOAD_ERROR_MESSAGE,
  resolveMyPageLoadState,
} from './myPageLoadState';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function expectRejectedLoadShowsErrorState() {
  const state = await resolveMyPageLoadState(() =>
    Promise.reject(new Error('network unavailable')),
  );

  expectEqual(state.status, 'error', 'rejected my page load state');

  if (state.status !== 'error') {
    throw new Error('rejected my page load should return an error state');
  }

  expectEqual(
    state.message,
    MY_PAGE_LOAD_ERROR_MESSAGE,
    'rejected my page load message',
  );
}

void expectRejectedLoadShowsErrorState();
