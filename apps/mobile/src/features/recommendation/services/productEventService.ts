import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import type {CatalogProduct} from '../types';

export type ProductEventSection =
  | 'legacy'
  | 'ar'
  | 'seasonal'
  | 'search'
  | 'personalized'
  | 'cohort'
  | 'auradin';

export type ProductEventCategory =
  | 'all'
  | 'base'
  | 'shadow'
  | 'brow'
  | 'cheek'
  | 'lip'
  | 'liner';

export type ProductClientEvent = {
  eventId: string;
  eventType: 'impression' | 'product_open' | 'search_result_open' | 'hide';
  occurredAt: string;
  section: ProductEventSection;
  productId?: string;
  externalSource?: string;
  externalProductId?: string;
  shadeId?: string | null;
  runId?: string;
  collectionId?: string;
  searchRequestId?: string;
  position: number;
  exposureToken?: string | null;
  context?: {category?: ProductEventCategory; viewportRatio?: number; visibleMs?: number; screen?: string; source?: string};
};

export function productEventIdentity(
  product: Pick<CatalogProduct, 'externalSource' | 'productId' | 'shadeId'>,
): Pick<ProductClientEvent, 'externalProductId' | 'externalSource' | 'productId' | 'shadeId'> {
  const externalSource = product.externalSource?.trim();
  if (externalSource) {
    return {
      externalProductId: product.productId,
      externalSource,
    };
  }
  return {
    productId: product.productId,
    shadeId: product.shadeId,
  };
}

let enabled = false;
let initialized = false;
let initialization: Promise<boolean> | null = null;
type QueuedProductEvent = ProductClientEvent & {queuedAtMs: number; attempts: number};
let queue: QueuedProductEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
const MAX_QUEUE_SIZE = 100;
const QUEUE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 2;

function createEventId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function setProductEventCollectionEnabled(nextEnabled: boolean): void {
  enabled = nextEnabled;
  initialized = true;
  if (!enabled) {
    queue = [];
    if (timer) clearTimeout(timer);
    timer = null;
  }
}

export async function initializeProductEventCollection(): Promise<boolean> {
  if (initialized) return enabled;
  if (!getBackendApiBaseUrl()) {
    initialized = true;
    enabled = false;
    return false;
  }
  if (initialization) return initialization;
  initialization = requestBackendJson<{
    purposes: {engagement_personalization?: {accepted?: boolean}};
  }>('/products/consents')
    .then(data => {
      enabled = Boolean(data.purposes.engagement_personalization?.accepted);
      initialized = true;
      return enabled;
    })
    .catch(() => {
      enabled = false;
      initialized = true;
      return false;
    })
    .finally(() => {initialization = null;});
  return initialization;
}

export function clearProductEventQueue(): void {
  queue = [];
  if (timer) clearTimeout(timer);
  timer = null;
}

export function resetProductEventCollection(): void {
  initialized = false;
  enabled = false;
  initialization = null;
  clearProductEventQueue();
}

export function queueProductEvent(
  event: Omit<ProductClientEvent, 'eventId' | 'occurredAt'>,
): void {
  if (!enabled || !getBackendApiBaseUrl()) return;
  const hasInternalIdentity = Boolean(event.productId?.trim());
  const hasExternalIdentity = Boolean(event.externalSource?.trim() && event.externalProductId?.trim());
  if (hasInternalIdentity === hasExternalIdentity) return;
  queue.push({...event, eventId: createEventId(), occurredAt: new Date().toISOString(), queuedAtMs: Date.now(), attempts: 0});
  if (queue.length > MAX_QUEUE_SIZE) queue.splice(0, queue.length - MAX_QUEUE_SIZE);
  if (queue.length >= 20) {
    void flushProductEvents();
    return;
  }
  if (!timer) {
    timer = setTimeout(() => void flushProductEvents(), 2000);
  }
}

export async function flushProductEvents(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (flushing || !enabled || queue.length === 0 || !getBackendApiBaseUrl()) return;
  flushing = true;
  queue = queue.filter(event => Date.now() - event.queuedAtMs <= QUEUE_TTL_MS);
  const pending = queue.splice(0, 50);
  try {
    const events = pending.map(({queuedAtMs: _queuedAtMs, attempts: _attempts, ...event}) => event);
    await requestBackendJson('/products/events', {method: 'POST', body: {events}});
  } catch {
    if (enabled) {
      const retryable = pending
        .filter(event => event.attempts + 1 < MAX_ATTEMPTS && Date.now() - event.queuedAtMs <= QUEUE_TTL_MS)
        .map(event => ({...event, attempts: event.attempts + 1}));
      queue = [...retryable, ...queue].slice(0, MAX_QUEUE_SIZE);
      if (queue.length > 0 && !timer) timer = setTimeout(() => void flushProductEvents(), 5000);
    }
  } finally {
    flushing = false;
    if (enabled && queue.length > 0 && !timer) timer = setTimeout(() => void flushProductEvents(), 2000);
  }
}
