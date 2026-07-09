import {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  ImageBackground,
  Linking,
  Pressable,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';
import * as Location from 'expo-location';
import {
  ChevronDown,
  ChevronUp,
  DollarSign,
  ExternalLink,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  Search,
  SlidersHorizontal,
  Star,
} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {
  consultingColors,
  consultingRadius,
  spacing,
  typography,
} from '../../../shared/theme';
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';
import {ConsultingChip, ConsultingSectionTitle} from '../components/consultingComponents';
import {getConsultingLocalPlaces} from '../services/consultingService';
import type {
  ConsultingLocalPlace,
  ConsultingLocalPlaceCategoryId,
} from '../types';

type LocalCategory = {
  id: ConsultingLocalPlaceCategoryId;
  label: string;
};

type RegionGroup = {
  title: string;
  items: readonly string[];
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

const consultingCdnBaseUrl = (
  process.env.EXPO_PUBLIC_CDN_BASE_URL?.trim().replace(/\/+$/, '') ??
  'https://d3t1pbvtir1lj.cloudfront.net'
);

const localCategories: readonly LocalCategory[] = [
  {id: 'hair', label: '헤어'},
  {id: 'makeup', label: '메이크업'},
  {id: 'personalColor', label: '퍼스널컬러'},
  {id: 'fashion', label: '골격진단'},
];

const regionGroups: readonly RegionGroup[] = [
  {
    title: '서울',
    items: ['강남', '청담', '압구정', '성수', '홍대', '신촌', '잠실', '여의도', '명동', '마곡'],
  },
  {
    title: '수도권',
    items: ['분당', '판교', '수원 인계', '일산', '인천 송도', '부천'],
  },
  {
    title: '광역시',
    items: ['부산 서면', '부산 해운대', '대구 동성로', '대전 둔산', '광주 충장로'],
  },
  {
    title: '기타',
    items: ['제주 연동', '천안 신부동', '전주 객사'],
  },
];

function imageForPlace(place: ConsultingLocalPlace) {
  const key = place.thumbnailKey || 'consulting-hero-online.jpg';
  return {uri: `${consultingCdnBaseUrl}/uploads/optimized/consulting/${key}`};
}

export function ConsultingLocalPlacesScreen() {
  const [category, setCategory] = useState<ConsultingLocalPlaceCategoryId>('hair');
  const [region, setRegion] = useState('강남');
  const [submittedRegion, setSubmittedRegion] = useState(region);
  const [searchRevision, setSearchRevision] = useState(0);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [places, setPlaces] = useState<readonly ConsultingLocalPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeCategoryLabel = useMemo(
    () => localCategories.find(item => item.id === category)?.label ?? '뷰티샵',
    [category],
  );

  useEffect(() => {
    let isMounted = true;

    setLoading(true);
    setFailed(false);
    getConsultingLocalPlaces({
      category,
      region: useCurrentLocation ? undefined : submittedRegion,
      latitude: useCurrentLocation ? coordinates?.latitude : undefined,
      longitude: useCurrentLocation ? coordinates?.longitude : undefined,
      limit: 20,
    })
      .then(data => {
        if (isMounted) {
          setPlaces(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setFailed(true);
          setPlaces([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [category, coordinates, searchRevision, submittedRegion, useCurrentLocation]);

  const handleSearch = () => {
    setUseCurrentLocation(false);
    setCoordinates(null);
    setSubmittedRegion(region.trim() || '서울');
    setSearchRevision(current => current + 1);
    setFiltersOpen(false);
  };

  const handlePresetPress = (preset: string) => {
    setRegion(preset);
    setSubmittedRegion(preset);
    setUseCurrentLocation(false);
    setCoordinates(null);
  };

  const handleCategoryPress = (nextCategory: ConsultingLocalPlaceCategoryId) => {
    setCategory(nextCategory);
  };

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        Alert.alert(
          '위치 권한이 필요해요',
          '현재 위치 주변 업체를 보려면 설정에서 위치 권한을 허용해 주세요.',
        );
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoordinates({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
      setUseCurrentLocation(true);
      setSubmittedRegion('');
      setFiltersOpen(false);
    } catch {
      Alert.alert(
        '현재 위치를 불러오지 못했어요',
        '잠시 후 다시 시도하거나 지역을 직접 선택해 주세요.',
      );
    } finally {
      setLocating(false);
    }
  };

  const resultTitle = useCurrentLocation
    ? `내 위치 주변 ${activeCategoryLabel}`
    : `${submittedRegion} ${activeCategoryLabel}`;
  const filterSummary = useCurrentLocation
    ? `내 위치 · ${activeCategoryLabel}`
    : `${submittedRegion || region || '서울'} · ${activeCategoryLabel}`;
  const regionSearchPending =
    !useCurrentLocation && region.trim() !== submittedRegion;

  return (
    <ConsultingScreenScaffold contentGap={spacing.xl}>
      <View style={styles.intro}>
        <Text style={styles.title}>근처 뷰티샵 찾기</Text>
        <Text style={styles.subtitle}>
          실제 예약과 최신 평점·사진은 네이버 지도에서 확인해요. AURA 직접 예약은 섭외 프리랜서만 가능해요.
        </Text>
      </View>

      <View style={styles.searchCard}>
        <RNView style={styles.inputRow}>
          <Search color={consultingColors.textSoft} size={18} />
          <TextInput
            onChangeText={setRegion}
            onSubmitEditing={handleSearch}
            placeholder="지역 입력"
            placeholderTextColor={consultingColors.textSoft}
            returnKeyType="search"
            style={styles.input}
            value={region}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="업체 검색"
            disabled={loading}
            onPress={handleSearch}
            style={({pressed}) => [
              styles.searchButton,
              loading ? styles.searchButtonDisabled : null,
              pressed && !loading ? styles.pressed : null,
            ]}>
            <Text style={styles.searchButtonText}>
              {loading ? '검색 중' : '검색'}
            </Text>
          </Pressable>
        </RNView>

        <RNView style={styles.filterSummaryRow}>
          <RNView style={styles.activeFilterPill}>
            <MapPin color={consultingColors.roseStrong} size={14} />
            <Text numberOfLines={1} style={styles.activeFilterText}>
              {filterSummary}
            </Text>
          </RNView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={filtersOpen ? '지역과 분야 필터 닫기' : '지역과 분야 필터 열기'}
            onPress={() => setFiltersOpen(current => !current)}
            style={({pressed}) => [
              styles.filterToggleButton,
              filtersOpen ? styles.filterToggleButtonActive : null,
              pressed ? styles.pressed : null,
            ]}>
            <SlidersHorizontal
              color={filtersOpen ? consultingColors.onAccent : consultingColors.text}
              size={15}
            />
            <Text
              style={[
                styles.filterToggleText,
                filtersOpen ? styles.filterToggleTextActive : null,
              ]}>
              필터
            </Text>
            {filtersOpen ? (
              <ChevronUp color={consultingColors.onAccent} size={14} />
            ) : (
              <ChevronDown color={consultingColors.text} size={14} />
            )}
          </Pressable>
        </RNView>

        {regionSearchPending ? (
          <Text style={styles.searchHintText}>
            입력한 지역은 검색 버튼을 누르면 결과에 반영돼요.
          </Text>
        ) : null}

        {filtersOpen ? (
          <View style={styles.filterPanel}>
            <Text style={styles.filterLabel}>분야</Text>
            <View style={styles.chipRow}>
              {localCategories.map(item => (
                <ConsultingChip
                  key={item.id}
                  label={item.label}
                  onPress={() => handleCategoryPress(item.id)}
                  selected={category === item.id}
                />
              ))}
            </View>

            <RNView style={styles.filterDivider} />

            <RNView style={styles.filterHeaderRow}>
              <Text style={styles.filterLabel}>지역</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="내 위치 주변 업체 찾기"
                disabled={locating}
                onPress={handleUseCurrentLocation}
                style={({pressed}) => [
                  styles.locationButton,
                  useCurrentLocation && styles.locationButtonActive,
                  locating ? styles.locationButtonDisabled : null,
                  pressed && !locating ? styles.pressed : null,
                ]}>
                <LocateFixed
                  color={useCurrentLocation ? consultingColors.onAccent : consultingColors.roseStrong}
                  size={15}
                />
                <Text
                  style={[
                    styles.locationButtonText,
                    useCurrentLocation && styles.locationButtonTextActive,
                  ]}>
                  {locating ? '위치 확인 중' : '내 위치'}
                </Text>
              </Pressable>
            </RNView>

            {regionGroups.map(group => (
              <View key={group.title} style={styles.regionGroup}>
                <Text style={styles.regionGroupTitle}>{group.title}</Text>
                <RNView style={styles.regionChipRow}>
                  {group.items.map(preset => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${preset} 업체 보기`}
                      key={preset}
                      onPress={() => handlePresetPress(preset)}
                      style={({pressed}) => [
                        styles.presetChip,
                        !useCurrentLocation && submittedRegion === preset
                          ? styles.presetChipSelected
                          : null,
                        pressed ? styles.pressed : null,
                      ]}>
                      <Text
                        style={[
                          styles.presetChipText,
                          !useCurrentLocation && submittedRegion === preset
                            ? styles.presetChipTextSelected
                            : null,
                        ]}>
                        {preset}
                      </Text>
                    </Pressable>
                  ))}
                </RNView>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <RNView style={styles.sectionHeader}>
          <ConsultingSectionTitle>{resultTitle}</ConsultingSectionTitle>
          <Text style={styles.sourceText}>NAVER</Text>
        </RNView>

        {loading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>업체 정보를 불러오고 있어요</Text>
            <Text style={styles.emptyText}>네이버 지역 검색 결과를 정리하는 중이에요.</Text>
          </View>
        ) : failed ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>검색 결과를 불러오지 못했어요</Text>
            <Text style={styles.emptyText}>네트워크와 네이버 API 설정을 확인해 주세요.</Text>
          </View>
        ) : places.length > 0 ? (
          <>
            <MapPreview places={places} />
            <View style={styles.placeList}>
              {places.map(place => (
                <PlaceCard
                  key={place.id}
                  place={place}
                />
              ))}
            </View>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>표시할 업체가 없어요</Text>
            <Text style={styles.emptyText}>다른 지역이나 분야로 다시 검색해 보세요.</Text>
          </View>
        )}
      </View>
    </ConsultingScreenScaffold>
  );
}

function PlaceCard({
  place,
}: {
  place: ConsultingLocalPlace;
}) {
  const address = place.roadAddress || place.address;
  const naverMapUrl = place.naverMapUrl || place.naverUrl;
  const placeUrl = place.naverPlaceSearchUrl || naverMapUrl;
  const highlights = place.serviceHighlights ?? [];
  const detailLines = place.detailLines ?? [];

  const openUrl = (url?: string) => {
    if (url) {
      void Linking.openURL(url);
    }
  };

  const openPhone = () => {
    if (place.telephone) {
      void Linking.openURL(`tel:${place.telephone.replace(/[^0-9+]/g, '')}`);
    }
  };

  return (
    <View style={styles.placeCard}>
      <RNView style={styles.placePressArea}>
        <ImageBackground
          imageStyle={styles.placeImage}
          resizeMode="cover"
          source={imageForPlace(place)}
          style={styles.placeImageFrame}>
          <RNView style={styles.placeImageScrim}>
            <RNView style={styles.placeBadgeRow}>
              <Text style={styles.placeBadge}>{place.categoryLabel || '뷰티'}</Text>
              {place.distanceLabel ? (
                <Text style={styles.distanceBadge}>{place.distanceLabel}</Text>
              ) : null}
            </RNView>
          </RNView>
        </ImageBackground>

        <RNView style={styles.placeTopRow}>
          <RNView style={styles.placeBody}>
            <Text numberOfLines={1} style={styles.placeName}>
              {place.name}
            </Text>
            {place.category ? (
              <Text numberOfLines={1} style={styles.placeCategory}>
                {place.category}
              </Text>
            ) : null}
          </RNView>
        </RNView>

        {place.summary ? (
          <Text style={styles.summaryText}>
            {place.summary}
          </Text>
        ) : null}

        {address ? (
          <RNView style={styles.metaRow}>
            <MapPin color={consultingColors.textSoft} size={14} />
            <Text style={styles.metaText}>
              {address}
            </Text>
          </RNView>
        ) : null}
      </RNView>

      <RNView style={styles.expandedArea}>
        {highlights.length > 0 ? (
          <RNView style={styles.highlightRow}>
            {highlights.map(highlight => (
              <RNView key={highlight} style={styles.highlightChip}>
                <Text style={styles.highlightText}>{highlight}</Text>
              </RNView>
            ))}
          </RNView>
        ) : null}

        <RNView style={styles.infoGrid}>
          <InfoPill icon="star" text={place.ratingHint || '리뷰는 네이버에서 확인'} />
          <InfoPill icon="price" text={place.priceHint || '가격은 네이버에서 확인'} />
        </RNView>

        {detailLines.length > 0 ? (
          <RNView style={styles.detailBox}>
            <Text style={styles.detailBoxTitle}>업체 정보</Text>
            {detailLines.map(line => (
              <RNView key={line} style={styles.detailRow}>
                <RNView style={styles.detailDot} />
                <Text style={styles.detailText}>{line}</Text>
              </RNView>
            ))}
          </RNView>
        ) : null}

        {place.bookingHint ? (
          <RNView style={styles.bookingHintBox}>
            <Text style={styles.bookingHintText}>{place.bookingHint}</Text>
          </RNView>
        ) : null}

        <RNView style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${place.name} 네이버 플레이스 확인`}
            disabled={!placeUrl}
            onPress={() => openUrl(placeUrl)}
            style={({pressed}) => [
              styles.actionButton,
              styles.primaryActionButton,
              !placeUrl && styles.actionButtonDisabled,
              pressed && placeUrl ? styles.pressed : null,
            ]}>
            <ExternalLink color={consultingColors.onAccent} size={15} />
            <Text style={styles.primaryActionText}>예약·가격 확인</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${place.name} 네이버 지도 확인`}
            disabled={!naverMapUrl}
            onPress={() => openUrl(naverMapUrl)}
            style={({pressed}) => [
              styles.actionButton,
              !naverMapUrl && styles.actionButtonDisabled,
              pressed && naverMapUrl ? styles.pressed : null,
            ]}>
            <Navigation color={naverMapUrl ? consultingColors.roseStrong : consultingColors.textSoft} size={15} />
            <Text
              style={[
                styles.actionText,
                !naverMapUrl && styles.actionTextDisabled,
              ]}>
              지도
            </Text>
          </Pressable>
          {place.websiteUrl ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${place.name} 공식 채널 열기`}
              onPress={() => openUrl(place.websiteUrl)}
              style={({pressed}) => [
                styles.actionButton,
                pressed ? styles.pressed : null,
              ]}>
              <ExternalLink color={consultingColors.roseStrong} size={15} />
              <Text style={styles.actionText}>공식 채널</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${place.name} 전화 가능 여부 확인`}
            disabled={!place.telephone}
            onPress={openPhone}
            style={({pressed}) => [
              styles.actionButton,
              !place.telephone && styles.actionButtonDisabled,
              pressed && place.telephone ? styles.pressed : null,
            ]}>
            <Phone color={place.telephone ? consultingColors.roseStrong : consultingColors.textSoft} size={15} />
            <Text
              style={[
                styles.actionText,
                !place.telephone && styles.actionTextDisabled,
              ]}>
              {place.telephone ? '전화 문의' : '전화 없음'}
            </Text>
          </Pressable>
        </RNView>
      </RNView>
    </View>
  );
}

function MapPreview({places}: {places: readonly ConsultingLocalPlace[]}) {
  const pinnedPlaces = places
    .filter(
      place =>
        typeof place.latitude === 'number' &&
        typeof place.longitude === 'number',
    )
    .slice(0, 8);

  if (pinnedPlaces.length === 0) {
    return (
      <View style={styles.mapPreview}>
        <RNView style={styles.mapHeaderRow}>
          <Text style={styles.mapTitle}>업체 위치 지도</Text>
          <Text style={styles.mapCount}>{places.length}곳</Text>
        </RNView>
        <RNView style={styles.mapEmpty}>
          <MapPin color={consultingColors.textSoft} size={22} />
          <Text style={styles.mapEmptyText}>
            위치 좌표가 없는 업체는 카드의 지도 버튼으로 확인해 주세요.
          </Text>
        </RNView>
      </View>
    );
  }

  const latitudes = pinnedPlaces.map(place => place.latitude ?? 0);
  const longitudes = pinnedPlaces.map(place => place.longitude ?? 0);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeRange = Math.max(maxLatitude - minLatitude, 0.01);
  const longitudeRange = Math.max(maxLongitude - minLongitude, 0.01);

  return (
    <View style={styles.mapPreview}>
      <RNView style={styles.mapHeaderRow}>
        <Text style={styles.mapTitle}>업체 위치 지도</Text>
        <Text style={styles.mapCount}>{places.length}곳</Text>
      </RNView>
      <RNView style={styles.mapCanvas}>
        <RNView style={styles.mapGridLineVertical} />
        <RNView style={styles.mapGridLineHorizontal} />
        {pinnedPlaces.map((place, index) => {
          const leftPercent =
            (((place.longitude ?? minLongitude) - minLongitude) / longitudeRange) *
            76 +
            12;
          const topPercent =
            (1 -
              ((place.latitude ?? minLatitude) - minLatitude) / latitudeRange) *
              70 +
            14;

          return (
            <RNView
              key={place.id}
              style={[
                styles.mapPin,
                {
                  left: `${leftPercent}%`,
                  top: `${topPercent}%`,
                },
              ]}>
              <Text style={styles.mapPinText}>{index + 1}</Text>
            </RNView>
          );
        })}
      </RNView>
      <RNView style={styles.mapLegend}>
        {pinnedPlaces.slice(0, 3).map((place, index) => (
          <RNView key={place.id} style={styles.mapLegendItem}>
            <RNView style={styles.mapLegendIndex}>
              <Text style={styles.mapLegendIndexText}>{index + 1}</Text>
            </RNView>
            <Text numberOfLines={1} style={styles.mapLegendText}>
              {place.name}
            </Text>
          </RNView>
        ))}
      </RNView>
    </View>
  );
}

function InfoPill({
  icon,
  text,
}: {
  icon: 'star' | 'price';
  text: string;
}) {
  const Icon = icon === 'star' ? Star : DollarSign;
  return (
    <RNView style={styles.infoPill}>
      <Icon color={consultingColors.textMuted} size={13} />
      <Text numberOfLines={2} style={styles.infoText}>
        {text}
      </Text>
    </RNView>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.pill,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
  },
  actionButtonDisabled: {
    opacity: 0.56,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 14,
  },
  actionText: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  actionTextDisabled: {
    color: consultingColors.textSoft,
  },
  activeFilterPill: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  activeFilterText: {
    color: consultingColors.text,
    flex: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  bookingHintBox: {
    backgroundColor: consultingColors.goldSoft,
    borderRadius: consultingRadius.card,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bookingHintText: {
    color: consultingColors.goldText,
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
    lineHeight: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  collapsedFooter: {
    alignItems: 'center',
    borderTopColor: consultingColors.borderSoft,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  collapsedHint: {
    color: consultingColors.textSoft,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
  },
  compactReservationButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.text,
    borderRadius: consultingRadius.pill,
    flexDirection: 'row',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 12,
  },
  compactReservationText: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
  },
  detailBox: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  detailBoxTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: 2,
  },
  detailDot: {
    backgroundColor: consultingColors.roseStrong,
    borderRadius: consultingRadius.pill,
    height: 5,
    marginTop: 6,
    width: 5,
  },
  detailRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  detailText: {
    color: consultingColors.textMuted,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  distanceBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: consultingRadius.pill,
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    gap: 5,
    paddingHorizontal: 18,
    paddingVertical: 32,
  },
  emptyText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
  },
  emptyTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  expandedArea: {
    borderTopColor: consultingColors.borderSoft,
    borderTopWidth: 1,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  filterDivider: {
    backgroundColor: consultingColors.borderSoft,
    height: 1,
  },
  filterHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  filterLabel: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  filterPanel: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: 13,
  },
  filterSummaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterToggleButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  filterToggleButtonActive: {
    backgroundColor: consultingColors.text,
    borderColor: consultingColors.text,
  },
  filterToggleText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  filterToggleTextActive: {
    color: consultingColors.onAccent,
  },
  highlightChip: {
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  highlightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
  },
  highlightText: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  iconButtonDisabled: {
    opacity: 0.45,
  },
  infoGrid: {
    gap: 7,
    marginTop: 12,
  },
  infoPill: {
    alignItems: 'flex-start',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  infoText: {
    color: consultingColors.textMuted,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  input: {
    color: consultingColors.text,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    minHeight: 42,
    padding: 0,
  },
  inputRow: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: 14,
  },
  intro: {
    gap: 6,
  },
  locationButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  locationButtonActive: {
    backgroundColor: consultingColors.accent,
    borderColor: consultingColors.accent,
  },
  locationButtonDisabled: {
    opacity: 0.6,
  },
  locationButtonText: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  locationButtonTextActive: {
    color: consultingColors.onAccent,
  },
  mapCanvas: {
    backgroundColor: consultingColors.surfaceMuted,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    height: 168,
    overflow: 'hidden',
    position: 'relative',
  },
  mapCount: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  mapEmpty: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    gap: 7,
    minHeight: 120,
    padding: 20,
  },
  mapEmptyText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  mapGridLineHorizontal: {
    backgroundColor: consultingColors.borderSoft,
    height: 1,
    left: 0,
    opacity: 0.7,
    position: 'absolute',
    right: 0,
    top: '50%',
  },
  mapGridLineVertical: {
    backgroundColor: consultingColors.borderSoft,
    bottom: 0,
    left: '50%',
    opacity: 0.7,
    position: 'absolute',
    top: 0,
    width: 1,
  },
  mapHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mapLegend: {
    gap: 7,
  },
  mapLegendIndex: {
    alignItems: 'center',
    backgroundColor: consultingColors.text,
    borderRadius: consultingRadius.pill,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  mapLegendIndexText: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
  },
  mapLegendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  mapLegendText: {
    color: consultingColors.textMuted,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  mapPin: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseStrong,
    borderColor: consultingColors.surface,
    borderRadius: consultingRadius.pill,
    borderWidth: 2,
    height: 26,
    justifyContent: 'center',
    marginLeft: -13,
    marginTop: -13,
    position: 'absolute',
    width: 26,
  },
  mapPinText: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.bold,
    fontSize: 11,
    fontWeight: typography.fontWeight.bold,
  },
  mapPreview: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: 14,
  },
  mapTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  metaRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  metaText: {
    color: consultingColors.textMuted,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  placeBadge: {
    backgroundColor: 'rgba(31, 25, 23, 0.76)',
    borderRadius: consultingRadius.pill,
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  placeBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  placeBody: {
    flex: 1,
  },
  placeCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  placeCategory: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 3,
  },
  placeImage: {
    borderTopLeftRadius: consultingRadius.card,
    borderTopRightRadius: consultingRadius.card,
  },
  placeImageFrame: {
    height: 124,
  },
  placeImageScrim: {
    backgroundColor: 'rgba(12, 10, 9, 0.28)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
  },
  placeList: {
    gap: spacing.md,
  },
  placeName: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  placePressArea: {
    paddingBottom: 12,
  },
  placeTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: 16,
    paddingTop: 15,
  },
  pressed: {
    opacity: 0.82,
  },
  presetChip: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
  },
  presetChipSelected: {
    backgroundColor: consultingColors.text,
    borderColor: consultingColors.text,
  },
  presetChipText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  presetChipTextSelected: {
    color: consultingColors.onAccent,
  },
  presetRow: {
    gap: spacing.sm,
    paddingRight: 6,
  },
  primaryActionButton: {
    backgroundColor: consultingColors.text,
  },
  primaryActionText: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  regionChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  regionGroup: {
    gap: 8,
  },
  regionGroupTitle: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
  },
  searchButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.text,
    borderRadius: consultingRadius.pill,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 13,
  },
  searchButtonDisabled: {
    opacity: 0.56,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  searchCard: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    gap: spacing.md,
    padding: 14,
  },
  searchHintText: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sourceText: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
  },
  subtitle: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  summaryText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: 9,
    paddingHorizontal: 16,
  },
  title: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
});
