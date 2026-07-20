import React, { createContext, useContext } from 'react';
import type { BeardSimulationService } from '../contracts/types';
import { mockBeardSimulationService } from './mockBeardSimulationService';

/**
 * Dependency-injection boundary for the beard-simulation service.
 * Screens call `useBeardService()` and never import the mock directly, so wiring the real
 * Stage 2 backend is a single-line swap at the provider (or app root).
 */
const BeardServiceContext = createContext<BeardSimulationService>(mockBeardSimulationService);

export function BeardServiceProvider({
  service = mockBeardSimulationService,
  children,
}: {
  service?: BeardSimulationService;
  children: React.ReactNode;
}) {
  return (
    <BeardServiceContext.Provider value={service}>{children}</BeardServiceContext.Provider>
  );
}

export function useBeardService(): BeardSimulationService {
  return useContext(BeardServiceContext);
}
