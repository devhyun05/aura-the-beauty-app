import {useCallback, useEffect, useRef, useState} from 'react';

import {isRequestAbortedError} from '../../../shared/services/backendApi';
import {
  createJourneyRequestGate,
  matchesMakeupJourneyCacheTarget,
  subscribeMakeupJourneyCacheInvalidation,
} from '../services/makeupJourneyCache';
import type {MakeupJourneyCacheTarget} from '../types';

type ResourceState<T> = {
  data: T | null;
  enabled: boolean;
  error: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  key: string;
};

export type MakeupJourneyResource<T> = Omit<ResourceState<T>, 'enabled' | 'key'> & {
  refresh: () => Promise<void>;
  setData: (updater: T | ((current: T) => T)) => void;
};

type UseResourceInput<T> = {
  cacheTarget: {entryDate?: string; month?: string};
  enabled: boolean;
  key: string;
  load: (key: string, signal: AbortSignal) => Promise<T>;
  readCache: (key: string) => T | null;
  writeCache: (key: string, data: T) => void;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '데이터를 불러오지 못했어요.';
}

export function resolveMakeupJourneyVisibleState<T>(
  state: ResourceState<T>,
  input: {cached: T | null; enabled: boolean; key: string},
): ResourceState<T> {
  if (state.key === input.key && state.enabled === input.enabled) {
    return state;
  }

  return {
    data: input.enabled ? input.cached : null,
    enabled: input.enabled,
    error: null,
    isLoading: input.enabled && !input.cached,
    isRefreshing: false,
    key: input.key,
  };
}

export function useMakeupJourneyResource<T>({
  cacheTarget,
  enabled,
  key,
  load,
  readCache,
  writeCache,
}: UseResourceInput<T>): MakeupJourneyResource<T> {
  const gateRef = useRef(createJourneyRequestGate());
  const abortRef = useRef<AbortController | null>(null);
  const initialCache = enabled ? readCache(key) : null;
  const [state, setState] = useState<ResourceState<T>>({
    data: initialCache,
    enabled,
    error: null,
    isLoading: enabled && !initialCache,
    isRefreshing: false,
    key,
  });

  const runLoad = useCallback(async (force: boolean) => {
    if (!enabled) {
      abortRef.current?.abort();
      gateRef.current.begin(`disabled:${key}`);
      setState({
        data: null,
        enabled: false,
        error: null,
        isLoading: false,
        isRefreshing: false,
        key,
      });
      return;
    }

    const cached = readCache(key);
    if (cached && !force) {
      setState({
        data: cached,
        enabled: true,
        error: null,
        isLoading: false,
        isRefreshing: false,
        key,
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const token = gateRef.current.begin(key);

    setState(current => ({
      data: current.key === key ? current.data : cached,
      enabled: true,
      error: null,
      isLoading: !(current.key === key ? current.data : cached),
      isRefreshing: Boolean(current.key === key ? current.data : cached),
      key,
    }));

    try {
      const data = await load(key, controller.signal);
      if (!gateRef.current.isCurrent(token, key)) {
        return;
      }
      writeCache(key, data);
      setState({
        data,
        enabled: true,
        error: null,
        isLoading: false,
        isRefreshing: false,
        key,
      });
    } catch (error) {
      if (!gateRef.current.isCurrent(token, key) || isRequestAbortedError(error)) {
        return;
      }
      setState(current => ({
        data: current.key === key ? current.data : null,
        enabled: true,
        error: getErrorMessage(error),
        isLoading: false,
        isRefreshing: false,
        key,
      }));
    }
  }, [enabled, key, load, readCache, writeCache]);

  useEffect(() => {
    void runLoad(false);
    return () => {
      abortRef.current?.abort();
    };
  }, [runLoad]);

  useEffect(() => subscribeMakeupJourneyCacheInvalidation(target => {
    if (enabled && matchesMakeupJourneyCacheTarget(target, cacheTarget)) {
      void runLoad(true);
    }
  }), [cacheTarget.entryDate, cacheTarget.month, enabled, runLoad]);

  const refresh = useCallback(() => runLoad(true), [runLoad]);
  const setData = useCallback((updater: T | ((current: T) => T)) => {
    setState(current => {
      if (!current.data || current.key !== key) {
        return current;
      }
      const nextData = typeof updater === 'function'
        ? (updater as (current: T) => T)(current.data)
        : updater;
      writeCache(key, nextData);
      return {...current, data: nextData, error: null};
    });
  }, [key, writeCache]);

  const visibleState = resolveMakeupJourneyVisibleState(state, {
    cached: enabled ? readCache(key) : null,
    enabled,
    key,
  });

  return {
    data: visibleState.data,
    error: visibleState.error,
    isLoading: visibleState.isLoading,
    isRefreshing: visibleState.isRefreshing,
    refresh,
    setData,
  };
}
