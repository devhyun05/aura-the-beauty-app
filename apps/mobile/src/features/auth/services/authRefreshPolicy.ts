export type CognitoRefreshPayload = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * Cognito's OAuth token endpoint uses `invalid_grant` when the refresh token
 * is expired, revoked, or otherwise no longer usable. Only that definitive
 * credential rejection should sign the user out. Transport failures, 5xx
 * responses, configuration errors, and malformed payloads remain retryable.
 */
export function interpretCognitoRefreshResponse(
  status: number,
  rawPayload: unknown,
): CognitoRefreshPayload | null {
  if (!isRecord(rawPayload)) {
    throw new Error('Cognito refresh response was malformed.');
  }

  const payload: CognitoRefreshPayload = {
    access_token: optionalString(rawPayload.access_token),
    error: optionalString(rawPayload.error),
    error_description: optionalString(rawPayload.error_description),
    expires_in:
      typeof rawPayload.expires_in === 'number' ? rawPayload.expires_in : undefined,
    id_token: optionalString(rawPayload.id_token),
    refresh_token: optionalString(rawPayload.refresh_token),
    token_type: optionalString(rawPayload.token_type),
  };

  if (status === 400 && payload.error?.toLowerCase() === 'invalid_grant') {
    return null;
  }

  if (status < 200 || status >= 300 || payload.error) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        'Cognito refresh failed with HTTP ' + status + '.',
    );
  }

  if (!payload.access_token) {
    throw new Error('Cognito refresh response did not include an access token.');
  }

  return payload;
}
