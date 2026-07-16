function isExpoGoRedirectUri(uri: string): boolean {
  return uri.startsWith('exp://') || uri.startsWith('exps://');
}

export function selectCognitoRedirectUri({
  allowConfiguredOverride = false,
  automaticRedirectUri,
  configuredRedirectUri,
}: {
  allowConfiguredOverride?: boolean;
  automaticRedirectUri: string;
  configuredRedirectUri?: string;
}): string {
  const configured = configuredRedirectUri?.trim();

  if (!allowConfiguredOverride || !configured) {
    return automaticRedirectUri;
  }

  const automaticIsExpoGo = isExpoGoRedirectUri(automaticRedirectUri);
  const configuredIsExpoGo = isExpoGoRedirectUri(configured);

  // Never let a LAN-only Expo Go callback leak into a native build, or a
  // native callback prevent Expo Go from reopening the current project.
  return automaticIsExpoGo === configuredIsExpoGo ? configured : automaticRedirectUri;
}
