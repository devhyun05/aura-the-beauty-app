import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

export const DEFAULT_TREND_REGION_CODE = 'KR-00' as const;
export const TREND_REGION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type TrendRegionCode =
  | typeof DEFAULT_TREND_REGION_CODE
  | 'KR-11'
  | 'KR-26'
  | 'KR-27'
  | 'KR-28'
  | 'KR-29'
  | 'KR-30'
  | 'KR-31'
  | 'KR-50'
  | 'KR-41'
  | 'KR-42'
  | 'KR-43'
  | 'KR-44'
  | 'KR-45'
  | 'KR-46'
  | 'KR-47'
  | 'KR-48'
  | 'KR-49';

export type TrendRegionAddress = Pick<
  Location.LocationGeocodedAddress,
  'city' | 'district' | 'formattedAddress' | 'isoCountryCode' | 'region' | 'subregion'
>;

type Coordinates = {latitude: number; longitude: number};
type PermissionResult = {status: string; canAskAgain?: boolean};

export type TrendRegionResolverDependencies = {
  now: () => number;
  loadCache: () => Promise<string | null>;
  saveCache: (value: string) => Promise<void>;
  getPermission: () => Promise<PermissionResult>;
  requestPermission: () => Promise<PermissionResult>;
  getLastKnownCoordinates: () => Promise<Coordinates | null>;
  getCurrentCoordinates: () => Promise<Coordinates>;
  reverseGeocode: (coordinates: Coordinates) => Promise<TrendRegionAddress[]>;
};

type TrendRegionCache = {
  regionCode: TrendRegionCode;
  resolvedAt: number;
};

const STORAGE_KEY = 'product-recommendation:trend-region:v1';
const VALID_REGION_CODES = new Set<TrendRegionCode>([
  DEFAULT_TREND_REGION_CODE,
  'KR-11',
  'KR-26',
  'KR-27',
  'KR-28',
  'KR-29',
  'KR-30',
  'KR-31',
  'KR-50',
  'KR-41',
  'KR-42',
  'KR-43',
  'KR-44',
  'KR-45',
  'KR-46',
  'KR-47',
  'KR-48',
  'KR-49',
]);

const REGION_ALIASES: ReadonlyArray<{code: TrendRegionCode; aliases: string[]}> = [
  {code: 'KR-11', aliases: ['서울특별시', '서울', 'seoul']},
  {code: 'KR-26', aliases: ['부산광역시', '부산', 'busan']},
  {code: 'KR-27', aliases: ['대구광역시', '대구', 'daegu']},
  {code: 'KR-28', aliases: ['인천광역시', '인천', 'incheon']},
  {code: 'KR-29', aliases: ['광주광역시', '광주', 'gwangju']},
  {code: 'KR-30', aliases: ['대전광역시', '대전', 'daejeon']},
  {code: 'KR-31', aliases: ['울산광역시', '울산', 'ulsan']},
  {code: 'KR-50', aliases: ['세종특별자치시', '세종', 'sejong']},
  {code: 'KR-41', aliases: ['경기도', '경기', 'gyeonggido', 'gyeonggi']},
  {code: 'KR-42', aliases: ['강원특별자치도', '강원도', '강원', 'gangwondo', 'gangwon']},
  {code: 'KR-43', aliases: ['충청북도', '충북', 'chungcheongbukdo', 'northchungcheong']},
  {code: 'KR-44', aliases: ['충청남도', '충남', 'chungcheongnamdo', 'southchungcheong']},
  {code: 'KR-45', aliases: ['전북특별자치도', '전라북도', '전북', 'jeollabukdo', 'northjeolla']},
  {code: 'KR-46', aliases: ['전라남도', '전남', 'jeollanamdo', 'southjeolla']},
  {code: 'KR-47', aliases: ['경상북도', '경북', 'gyeongsangbukdo', 'northgyeongsang']},
  {code: 'KR-48', aliases: ['경상남도', '경남', 'gyeongsangnamdo', 'southgyeongsang']},
  {code: 'KR-49', aliases: ['제주특별자치도', '제주도', '제주', 'jejudo', 'jeju']},
];

function normalizeRegionText(value: string): string {
  return value.toLocaleLowerCase('ko-KR').replace(/[\s._-]+/g, '');
}

export function normalizeTrendRegionCode(value?: string | null): TrendRegionCode {
  const normalized = String(value ?? '').trim().toUpperCase() as TrendRegionCode;
  return VALID_REGION_CODES.has(normalized) ? normalized : DEFAULT_TREND_REGION_CODE;
}

export function mapAddressToTrendRegionCode(
  address?: TrendRegionAddress | null,
): TrendRegionCode {
  if (!address) return DEFAULT_TREND_REGION_CODE;
  const countryCode = address.isoCountryCode?.trim().toUpperCase();
  if (countryCode && countryCode !== 'KR' && countryCode !== 'KOR') {
    return DEFAULT_TREND_REGION_CODE;
  }

  const fields = [
    address.region,
    address.city,
    address.subregion,
    address.district,
    address.formattedAddress,
  ];
  for (const field of fields) {
    if (!field) continue;
    const candidate = normalizeRegionText(field);
    const matches = REGION_ALIASES.flatMap(({code, aliases}) => aliases
      .map(normalizeRegionText)
      .map(alias => ({alias, code, index: candidate.indexOf(alias)}))
      .filter(match => match.index >= 0))
      .sort((left, right) => left.index - right.index || right.alias.length - left.alias.length);
    if (matches[0]) return matches[0].code;
  }
  return DEFAULT_TREND_REGION_CODE;
}

export function readCachedTrendRegionCode(
  raw: string | null,
  now = Date.now(),
): TrendRegionCode | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TrendRegionCache>;
    const rawRegionCode = String(parsed.regionCode ?? '').trim().toUpperCase() as TrendRegionCode;
    if (!VALID_REGION_CODES.has(rawRegionCode)) return null;
    const regionCode = normalizeTrendRegionCode(rawRegionCode);
    const resolvedAt = Number(parsed.resolvedAt);
    if (!Number.isFinite(resolvedAt) || resolvedAt > now || now - resolvedAt >= TREND_REGION_CACHE_TTL_MS) {
      return null;
    }
    return regionCode;
  } catch {
    return null;
  }
}

export async function getCachedTrendRegionCode(): Promise<TrendRegionCode | null> {
  try {
    return readCachedTrendRegionCode(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

async function persistRegionCode(
  dependencies: TrendRegionResolverDependencies,
  regionCode: TrendRegionCode,
): Promise<void> {
  try {
    await dependencies.saveCache(JSON.stringify({regionCode, resolvedAt: dependencies.now()}));
  } catch {
    // 저장소 오류는 추천 화면을 막지 않는다. 정확한 좌표는 어떤 경우에도 저장하지 않는다.
  }
}

export async function resolveTrendRegionCodeWith(
  dependencies: TrendRegionResolverDependencies,
): Promise<TrendRegionCode> {
  try {
    const cached = readCachedTrendRegionCode(await dependencies.loadCache(), dependencies.now());
    if (cached) return cached;

    let permission = await dependencies.getPermission();
    if (permission.status !== 'granted') {
      if (permission.canAskAgain === false) {
        await persistRegionCode(dependencies, DEFAULT_TREND_REGION_CODE);
        return DEFAULT_TREND_REGION_CODE;
      }
      permission = await dependencies.requestPermission();
    }
    if (permission.status !== 'granted') {
      await persistRegionCode(dependencies, DEFAULT_TREND_REGION_CODE);
      return DEFAULT_TREND_REGION_CODE;
    }

    const coordinates = await dependencies.getLastKnownCoordinates()
      ?? await dependencies.getCurrentCoordinates();
    const addresses = await dependencies.reverseGeocode(coordinates);
    const regionCode = mapAddressToTrendRegionCode(addresses[0]);
    await persistRegionCode(dependencies, regionCode);
    return regionCode;
  } catch {
    await persistRegionCode(dependencies, DEFAULT_TREND_REGION_CODE);
    return DEFAULT_TREND_REGION_CODE;
  }
}

const nativeDependencies: TrendRegionResolverDependencies = {
  now: () => Date.now(),
  loadCache: () => AsyncStorage.getItem(STORAGE_KEY),
  saveCache: value => AsyncStorage.setItem(STORAGE_KEY, value),
  getPermission: () => Location.getForegroundPermissionsAsync(),
  requestPermission: () => Location.requestForegroundPermissionsAsync(),
  getLastKnownCoordinates: async () => {
    const position = await Location.getLastKnownPositionAsync({
      maxAge: TREND_REGION_CACHE_TTL_MS,
      requiredAccuracy: 50_000,
    });
    if (!position) return null;
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  },
  getCurrentCoordinates: async () => {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
      mayShowUserSettingsDialog: false,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  },
  reverseGeocode: coordinates => Location.reverseGeocodeAsync(coordinates),
};

let pendingResolution: Promise<TrendRegionCode> | null = null;

export function resolveTrendRegionCode(): Promise<TrendRegionCode> {
  if (pendingResolution) return pendingResolution;
  pendingResolution = resolveTrendRegionCodeWith(nativeDependencies)
    .finally(() => {
      pendingResolution = null;
    });
  return pendingResolution;
}
