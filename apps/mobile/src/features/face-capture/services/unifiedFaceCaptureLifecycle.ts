export function shouldFinalizeUnifiedCaptureForAppState(
  nextState: string,
): boolean {
  // iOS briefly enters `inactive` for Control Center, notification overlays,
  // and other transient interruptions. Only a real background transition gives
  // up camera ownership and finalizes the request.
  return nextState === 'background';
}
