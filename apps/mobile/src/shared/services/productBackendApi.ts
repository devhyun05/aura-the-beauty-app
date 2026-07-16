import {
  getBackendApiBaseUrl,
  requestBackendJson,
  type BackendJsonRequestInit,
} from './backendApi';

type ProductBackendJsonRequestInit = Omit<BackendJsonRequestInit, 'baseUrl'>;

function getProductBackendOverride(): string | null {
  return process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_API_BASE_URL?.trim() || null;
}

export function getProductBackendApiBaseUrl(): string | null {
  return getProductBackendOverride() ?? getBackendApiBaseUrl();
}

export function requestProductBackendJson<T>(
  path: string,
  init: ProductBackendJsonRequestInit = {},
): Promise<T> {
  return requestBackendJson<T>(path, {
    ...init,
    baseUrl: getProductBackendOverride(),
  });
}
