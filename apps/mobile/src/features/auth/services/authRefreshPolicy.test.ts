import assert from 'node:assert/strict';

import {interpretCognitoRefreshResponse} from './authRefreshPolicy';

const refreshed = interpretCognitoRefreshResponse(200, {
  access_token: 'new-access-token',
  expires_in: 3600,
});
assert.equal(refreshed?.access_token, 'new-access-token');

assert.equal(
  interpretCognitoRefreshResponse(400, {
    error: 'invalid_grant',
    error_description: 'Refresh Token has been revoked',
  }),
  null,
  'invalid_grant is a definitive session expiry',
);

assert.throws(
  () => interpretCognitoRefreshResponse(503, {error: 'temporarily_unavailable'}),
  /temporarily_unavailable/,
  '5xx refresh failures remain retryable',
);
assert.throws(
  () => interpretCognitoRefreshResponse(503, {error: 'invalid_grant'}),
  /invalid_grant/,
  'a 5xx response can never prove that the refresh token expired',
);
assert.throws(
  () => interpretCognitoRefreshResponse(400, {error: 'invalid_client'}),
  /invalid_client/,
  'client/configuration failures must not erase the user session',
);
assert.throws(
  () => interpretCognitoRefreshResponse(200, {token_type: 'Bearer'}),
  /access token/,
  'a malformed success response remains retryable',
);
assert.throws(
  () => interpretCognitoRefreshResponse(200, null),
  /malformed/,
  'a non-object response remains retryable',
);
