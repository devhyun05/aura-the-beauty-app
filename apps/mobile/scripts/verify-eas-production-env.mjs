const force = process.argv.includes('--force');
const buildProfile = process.env.EAS_BUILD_PROFILE ?? '';
const isProductionIosBuild =
  process.env.EAS_BUILD_PLATFORM === 'ios' &&
  buildProfile.startsWith('production');

if (!force && !isProductionIosBuild) {
  console.log('[aura:release] Production iOS environment check skipped.');
  process.exit(0);
}

const errors = [];

function value(name) {
  return process.env[name]?.trim() ?? '';
}

function requireValue(name) {
  if (!value(name)) {
    errors.push(`${name} is missing`);
  }
}

function requireProductionHttpsUrl(name) {
  const raw = value(name);
  if (!raw) {
    errors.push(`${name} is missing`);
    return;
  }

  try {
    const url = new URL(raw);
    const localHost =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname.endsWith('.local');

    if (url.protocol !== 'https:' || localHost) {
      errors.push(`${name} must use a non-local HTTPS URL`);
    }
  } catch {
    errors.push(`${name} must be a valid URL`);
  }
}

requireProductionHttpsUrl('EXPO_PUBLIC_API_BASE_URL');
requireValue('EXPO_PUBLIC_COGNITO_CLIENT_ID');

const cognitoDomain = value('EXPO_PUBLIC_COGNITO_DOMAIN');
const cognitoDomainPrefix = value('EXPO_PUBLIC_COGNITO_DOMAIN_PREFIX');
const cognitoRegion = value('EXPO_PUBLIC_COGNITO_REGION');

if (cognitoDomain) {
  requireProductionHttpsUrl('EXPO_PUBLIC_COGNITO_DOMAIN');
} else if (!cognitoDomainPrefix || !cognitoRegion) {
  errors.push(
    'Set EXPO_PUBLIC_COGNITO_DOMAIN or both EXPO_PUBLIC_COGNITO_DOMAIN_PREFIX and EXPO_PUBLIC_COGNITO_REGION',
  );
}

for (const optionalUrlName of [
  'EXPO_PUBLIC_MAKEUP_RECOMMENDATION_API_BASE_URL',
  'EXPO_PUBLIC_PRODUCT_RECOMMENDATION_API_BASE_URL',
]) {
  if (value(optionalUrlName)) {
    requireProductionHttpsUrl(optionalUrlName);
  }
}

if (errors.length > 0) {
  console.error('[aura:release] Production iOS environment is incomplete:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('[aura:release] Production iOS environment verified.');
