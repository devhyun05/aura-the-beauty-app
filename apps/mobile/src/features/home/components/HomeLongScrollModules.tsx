import {memo, useCallback, useEffect, useRef, useState} from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  type ImageSourcePropType,
  type ImageStyle,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
} from 'react-native';
import {ArrowRight, ImageOff, PackageSearch, Search} from 'lucide-react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {CachedImage} from '../../../shared/ui/CachedImage';
import {trackHomeCarouselScroll} from '../services/homeAnalytics';
import {
  getHomeImageSourceForStage,
  type HomeImageLoadStage,
} from '../services/homeImageScheduler';
import type {
  HomeFeatureId,
  HomeFeaturePressPayload,
  HomeModuleConfig,
  HomeModuleItem,
} from '../types/homeModules';

type HomeModuleRendererProps = {
  imageLoadStage: HomeImageLoadStage;
  isFeedLoading?: boolean;
  module: HomeModuleConfig;
  onPressFeature: (
    featureId: HomeFeatureId,
    payload?: HomeFeaturePressPayload,
  ) => void;
};

type ModuleSectionProps = {
  imageLoadStage: HomeImageLoadStage;
  module: HomeModuleConfig;
  onPressFeature: HomeModuleRendererProps['onPressFeature'];
};

export const HOME_MODULE_HORIZONTAL_INSET = spacing.xl;
export const HOME_MODULE_CONTENT_GAP = spacing.xl;
export const HOME_PRODUCT_CARD_WIDTH = 154;

const PRODUCT_CARD_INTERVAL = HOME_PRODUCT_CARD_WIDTH + spacing.md;

export const HomeModuleRenderer = memo(function HomeModuleRenderer({
  imageLoadStage,
  isFeedLoading = false,
  module,
  onPressFeature,
}: HomeModuleRendererProps) {
  if (module.kind === 'faceAnalysis') {
    return (
      <FaceAnalysisModule
        imageLoadStage={imageLoadStage}
        module={module}
        onPressFeature={onPressFeature}
      />
    );
  }

  if (module.kind === 'products') {
    return (
      <ProductsModule
        imageLoadStage={imageLoadStage}
        isLoading={isFeedLoading}
        module={module}
        onPressFeature={onPressFeature}
      />
    );
  }

  if (module.kind === 'makeupRecommendation') {
    return (
      <MakeupRecommendationModule
        imageLoadStage={imageLoadStage}
        module={module}
        onPressFeature={onPressFeature}
      />
    );
  }

  if (module.kind === 'makeupExtraction') {
    return (
      <MakeupExtractionModule
        imageLoadStage={imageLoadStage}
        module={module}
        onPressFeature={onPressFeature}
      />
    );
  }

  if (module.kind === 'auradin') {
    return (
      <AuradinModule
        imageLoadStage={imageLoadStage}
        module={module}
        onPressFeature={onPressFeature}
      />
    );
  }

  if (module.kind === 'makeupFeedback') {
    return (
      <MakeupFeedbackModule
        imageLoadStage={imageLoadStage}
        module={module}
        onPressFeature={onPressFeature}
      />
    );
  }

  return (
    <ConsultingModule
      imageLoadStage={imageLoadStage}
      module={module}
      onPressFeature={onPressFeature}
    />
  );
});

HomeModuleRenderer.displayName = 'HomeModuleRenderer';

function FaceAnalysisModule({
  imageLoadStage,
  module,
  onPressFeature,
}: ModuleSectionProps) {
  const imageSource = getHomeImageSourceForStage(
    module.imageSources[0],
    0,
    imageLoadStage,
  );

  return (
    <YStack style={styles.sectionWithInset}>
      <ModuleHeader title={module.title} />
      <Pressable
        accessibilityLabel="AI 얼굴 진단 시작하기"
        accessibilityRole="button"
        onPress={() => onPressFeature('faceAnalysis')}
        style={({pressed}) => [styles.faceAnalysisCard, pressed && styles.pressed]}>
        <ModuleImage
          accessibilityLabel="AI가 얼굴형과 비율을 진단하는 기능 이미지"
          contentFit="cover"
          priority={imageLoadStage === 'visible' ? 'normal' : 'low'}
          source={imageSource}
          style={styles.fullBleedImage}
        />
        <LinearGradient
          colors={[
            'rgba(18, 27, 56, 0.62)',
            'rgba(18, 27, 56, 0.24)',
            'rgba(18, 27, 56, 0.04)',
          ]}
          end={{x: 1, y: 0.5}}
          start={{x: 0, y: 0.5}}
          style={styles.faceDiagnosisScrim}
        />
        <YStack style={styles.faceAnalysisCopy}>
          <Text numberOfLines={2} style={styles.faceDiagnosisTitle}>
            AI로 알아보는{`\n`}내 얼굴형과 비율
          </Text>
          <XStack style={styles.lightActionRow}>
            <Text style={styles.lightActionLabel}>{module.ctaLabel}</Text>
            <ArrowRight color={colors.white} size={iconSize.xs} strokeWidth={1.9} />
          </XStack>
        </YStack>
      </Pressable>
    </YStack>
  );
}

/** Keep the approved real-catalog product module unchanged. */
function ProductsModule({
  imageLoadStage,
  isLoading,
  module,
  onPressFeature,
}: ModuleSectionProps & {isLoading: boolean}) {
  const items = module.items ?? [];
  const lastCarouselIndexRef = useRef(0);
  const renderItem = useCallback(({
    index,
    item,
  }: ListRenderItemInfo<HomeModuleItem>) => (
    <ProductCard
      imageSource={getHomeImageSourceForStage(
        item.imageSource,
        index,
        imageLoadStage,
      )}
      item={item}
      module={module}
      onPressFeature={onPressFeature}
      priority={imageLoadStage === 'visible' ? 'normal' : 'low'}
    />
  ), [imageLoadStage, module, onPressFeature]);
  const handleMomentumEnd = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextIndex = Math.max(
      0,
      Math.min(
        items.length - 1,
        Math.round(event.nativeEvent.contentOffset.x / PRODUCT_CARD_INTERVAL),
      ),
    );

    trackHomeCarouselScroll(module.id, lastCarouselIndexRef.current, nextIndex);
    lastCarouselIndexRef.current = nextIndex;
  }, [items.length, module.id]);

  return (
    <YStack style={styles.section}>
      <View style={styles.sectionHeaderInset}>
        <ModuleHeader
          onPress={items.length > 0
            ? () => onPressFeature(module.featureId)
            : undefined}
          title={module.title}
        />
      </View>

      {isLoading && items.length === 0 ? (
        <ContentLoadingRail />
      ) : items.length === 0 ? (
        <View style={styles.emptyInset}>
          <CompactProductAction
            label="추천 제품 보러가기"
            onPress={() => onPressFeature(module.featureId, {source: 'seasonal'})}
          />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.horizontalListContent}
          data={items}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({
            index,
            length: PRODUCT_CARD_INTERVAL,
            offset: PRODUCT_CARD_INTERVAL * index,
          })}
          horizontal
          initialNumToRender={3}
          ItemSeparatorComponent={HorizontalItemSeparator}
          keyExtractor={item => item.id}
          maxToRenderPerBatch={3}
          onMomentumScrollEnd={handleMomentumEnd}
          removeClippedSubviews
          renderItem={renderItem}
          showsHorizontalScrollIndicator={false}
          snapToInterval={PRODUCT_CARD_INTERVAL}
          windowSize={4}
        />
      )}
    </YStack>
  );
}

function ProductCard({
  imageSource,
  item,
  module,
  onPressFeature,
  priority,
}: {
  imageSource?: ImageSourcePropType;
  item: HomeModuleItem;
  module: HomeModuleConfig;
  onPressFeature: HomeModuleRendererProps['onPressFeature'];
  priority: 'low' | 'normal';
}) {
  const brandName = item.eyebrow;
  const price = getMetadataNumber(item, 'price');
  const disclosureLabel = getMetadataString(item, 'disclosureLabel');

  return (
    <Pressable
      accessibilityLabel={[
        brandName,
        item.title,
        price === undefined ? undefined : `${formatPrice(price)}원`,
      ].filter(Boolean).join(' ')}
      accessibilityRole="button"
      onPress={() => pressItemOrModule(module, item, onPressFeature)}
      style={({pressed}) => [styles.productCard, pressed && styles.pressed]}>
      <ModuleImage
        accessibilityLabel={`${item.title} 제품 이미지`}
        contentFit="contain"
        priority={priority}
        source={imageSource}
        style={styles.productImage}
      />
      <YStack style={styles.productCopy}>
        {disclosureLabel ? (
          <Text numberOfLines={1} style={styles.disclosureLabel}>
            {disclosureLabel}
          </Text>
        ) : null}
        {brandName ? (
          <Text numberOfLines={1} style={styles.productBrand}>
            {brandName}
          </Text>
        ) : null}
        <Text numberOfLines={2} style={styles.productName}>
          {item.title}
        </Text>
        {price !== undefined ? (
          <Text numberOfLines={1} style={styles.productPrice}>
            {formatPrice(price)}원
          </Text>
        ) : null}
      </YStack>
    </Pressable>
  );
}

function MakeupRecommendationModule({
  imageLoadStage,
  module,
  onPressFeature,
}: ModuleSectionProps) {
  const items = module.items ?? [];
  const primaryItem = items[0];
  const secondaryItems = items.slice(1, 3);

  return (
    <YStack style={styles.sectionWithInset}>
      <YStack style={styles.recommendationHeading}>
        <ModuleHeader title={module.title} />
        {module.description ? (
          <Text numberOfLines={2} style={styles.recommendationDescription}>
            {module.description}
          </Text>
        ) : null}
      </YStack>
      <Pressable
        accessibilityLabel="얼굴 분석을 바탕으로 상황별 맞춤 메이크업 추천받기"
        accessibilityRole="button"
        onPress={() => onPressFeature(module.featureId)}
        style={({pressed}) => [styles.recommendationBento, pressed && styles.pressed]}>
        <View style={styles.recommendationPrimary}>
          <ModuleImage
            accessibilityLabel={`${primaryItem?.title ?? '일상'} 상황 메이크업 예시`}
            contentFit="cover"
            priority={imageLoadStage === 'visible' ? 'normal' : 'low'}
            source={getHomeImageSourceForStage(
              primaryItem?.imageSource,
              0,
              imageLoadStage,
            )}
            style={styles.fullBleedImage}
          />
          {primaryItem ? (
            <View style={styles.recommendationScenarioBadge}>
              <Text style={styles.recommendationScenarioLabel}>{primaryItem.title}</Text>
            </View>
          ) : null}
          <View style={styles.featureScrim} />
          <YStack style={styles.recommendationCopy}>
            <Text numberOfLines={2} style={styles.recommendationTitle}>
              상황을 고르면{`\n`}내 얼굴에 맞게
            </Text>
            <XStack style={styles.lightActionRow}>
              <Text style={styles.lightActionLabel}>{module.ctaLabel}</Text>
              <ArrowRight color={colors.white} size={iconSize.xs} strokeWidth={1.9} />
            </XStack>
          </YStack>
        </View>
        <YStack style={styles.recommendationSecondaryColumn}>
          {secondaryItems.map((item, index) => (
            <View key={item.id} style={styles.recommendationSecondary}>
              <ModuleImage
                accessibilityLabel={`${item.title} 상황 메이크업 예시`}
                contentFit="cover"
                priority={imageLoadStage === 'visible' ? 'normal' : 'low'}
                source={getHomeImageSourceForStage(
                  item.imageSource,
                  index + 1,
                  imageLoadStage,
                )}
                style={styles.fullBleedImage}
              />
              <View style={styles.recommendationScenarioBadge}>
                <Text numberOfLines={1} style={styles.recommendationScenarioLabel}>
                  {item.title}
                </Text>
              </View>
            </View>
          ))}
        </YStack>
      </Pressable>
    </YStack>
  );
}

function MakeupExtractionModule({
  imageLoadStage,
  module,
  onPressFeature,
}: ModuleSectionProps) {
  return (
    <YStack style={styles.sectionWithInset}>
      <ModuleHeader title={module.title} />
      <Pressable
        accessibilityLabel="연예인 또는 얼굴 사진에서 메이크업 색상과 바르는 방법 추출하기"
        accessibilityRole="button"
        onPress={() => onPressFeature(module.featureId)}
        style={({pressed}) => [styles.makeupFeatureCard, pressed && styles.pressed]}>
        <ModuleImage
          accessibilityLabel="사진 속 눈, 볼, 입술 메이크업 컬러를 추출하는 이미지"
          contentFit="cover"
          priority={imageLoadStage === 'visible' ? 'normal' : 'low'}
          source={getHomeImageSourceForStage(
            module.imageSources[0],
            0,
            imageLoadStage,
          )}
          style={styles.fullBleedImage}
        />
        <View style={styles.makeupExtractionScrim} />
        <YStack style={styles.makeupExtractionCopy}>
          <Text numberOfLines={2} style={styles.makeupFeatureTitleLight}>
            사진 속 컬러부터{`\n`}바르는 순서까지
          </Text>
          <XStack style={styles.lightActionRow}>
            <Text style={styles.lightActionLabel}>메이크업 추출하기</Text>
            <ArrowRight color={colors.white} size={iconSize.xs} strokeWidth={1.9} />
          </XStack>
        </YStack>
      </Pressable>
    </YStack>
  );
}

function MakeupFeedbackModule({
  imageLoadStage,
  module,
  onPressFeature,
}: ModuleSectionProps) {
  return (
    <YStack style={styles.sectionWithInset}>
      <ModuleHeader title={module.title} />
      <Pressable
        accessibilityLabel="내 얼굴 사진에서 메이크업 점수와 잘한 점, 보완할 점 확인하기"
        accessibilityRole="button"
        onPress={() => onPressFeature(module.featureId)}
        style={({pressed}) => [styles.makeupFeatureCard, pressed && styles.pressed]}>
        <ModuleImage
          accessibilityLabel="셀피의 눈, 볼, 입술 메이크업을 평가하는 이미지"
          contentFit="cover"
          priority={imageLoadStage === 'visible' ? 'normal' : 'low'}
          source={getHomeImageSourceForStage(
            module.imageSources[0],
            0,
            imageLoadStage,
          )}
          style={styles.fullBleedImage}
        />
        <YStack style={styles.makeupFeedbackCopy}>
          <Text numberOfLines={3} style={styles.makeupFeedbackTitle}>
            점수와 함께 보는{`\n`}잘한 점·보완할 점
          </Text>
          <XStack style={styles.lightActionRow}>
            <Text style={styles.makeupFeedbackActionLabel}>피드백 받기</Text>
            <ArrowRight color="#635747" size={iconSize.xs} strokeWidth={1.9} />
          </XStack>
        </YStack>
      </Pressable>
    </YStack>
  );
}

function AuradinModule({
  imageLoadStage,
  module,
  onPressFeature,
}: ModuleSectionProps) {
  return (
    <YStack style={styles.sectionWithInset}>
      <ModuleHeader title={module.title} />
      <Pressable
        accessibilityLabel="색상, 제형, 예산 조건으로 제품을 찾는 AURA딘 열기"
        accessibilityRole="button"
        onPress={() => onPressFeature(module.featureId)}
        style={({pressed}) => [styles.auradinCard, pressed && styles.pressed]}>
        <ModuleImage
          accessibilityLabel="AURA딘 AI 제품 탐색 이미지"
          contentFit="cover"
          priority={imageLoadStage === 'visible' ? 'normal' : 'low'}
          source={getHomeImageSourceForStage(
            module.imageSources[0],
            0,
            imageLoadStage,
          )}
          style={styles.fullBleedImage}
        />

        <YStack style={styles.auradinCopy}>
          <Text numberOfLines={2} style={styles.auradinTitle}>
            컬러·제형·예산으로{`\n`}딱 맞는 제품 찾기
          </Text>
          <Text numberOfLines={2} style={styles.auradinDescription}>
            원하는 조건을 말하면 AURA딘이 비교해드려요
          </Text>
        </YStack>

        <XStack style={styles.auradinSearchBar}>
          <Search color="#57526D" size={iconSize.xs} strokeWidth={1.9} />
          <Text numberOfLines={1} style={styles.auradinSearchText}>
            예: 2만원대 촉촉한 코랄 립
          </Text>
          <ArrowRight color="#6D6686" size={iconSize.xs} strokeWidth={1.9} />
        </XStack>
      </Pressable>
    </YStack>
  );
}

function ConsultingModule({
  imageLoadStage,
  module,
  onPressFeature,
}: ModuleSectionProps) {
  const item = module.items?.[0];

  return (
    <YStack style={styles.sectionWithInset}>
      <ModuleHeader title={module.title} />
      <Pressable
        accessibilityLabel="전문가 컨설팅 보기"
        accessibilityRole="button"
        onPress={() => onPressFeature(module.featureId)}
        style={({pressed}) => [styles.consultingCard, pressed && styles.pressed]}>
        <ModuleImage
          accessibilityLabel="전문가 컨설팅 이미지"
          contentFit="cover"
          priority={imageLoadStage === 'visible' ? 'normal' : 'low'}
          source={getHomeImageSourceForStage(
            item?.imageSource ?? module.imageSources[0],
            0,
            imageLoadStage,
          )}
          style={styles.fullBleedImage}
        />
        <View style={styles.consultingScrim} />
        <YStack style={styles.consultingCopy}>
          <Text numberOfLines={2} style={styles.featureTitleLight}>
            전문가와 함께{`\n`}메이크업 완성하기
          </Text>
          <XStack style={styles.lightActionRow}>
            <Text style={styles.lightActionLabel}>상담 보기</Text>
            <ArrowRight color={colors.white} size={iconSize.xs} strokeWidth={1.9} />
          </XStack>
        </YStack>
      </Pressable>
    </YStack>
  );
}

function ModuleHeader({
  onPress,
  title,
}: {
  onPress?: () => void;
  title: string;
}) {
  return (
    <XStack style={styles.moduleHeader}>
      <Text numberOfLines={1} style={styles.moduleTitle}>
        {title}
      </Text>
      {onPress ? (
        <Pressable
          accessibilityLabel={`${title} 더보기`}
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={onPress}
          style={({pressed}) => [styles.moreButton, pressed && styles.pressed]}>
          <Text style={styles.moreLabel}>더보기</Text>
          <ArrowRight color={colors.textSecondary} size={iconSize.xs} strokeWidth={1.8} />
        </Pressable>
      ) : null}
    </XStack>
  );
}

function CompactProductAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.compactAction, pressed && styles.pressed]}>
      <View style={styles.compactActionIcon}>
        <PackageSearch color={colors.textPrimary} size={iconSize.sm} strokeWidth={1.8} />
      </View>
      <Text style={styles.compactActionLabel}>{label}</Text>
      <ArrowRight color={colors.textSecondary} size={iconSize.sm} strokeWidth={1.8} />
    </Pressable>
  );
}

function ContentLoadingRail() {
  return (
    <XStack style={styles.loadingRail}>
      {[0, 1].map(index => (
        <YStack key={`products-loading-${index}`} style={styles.productLoadingCard}>
          <View style={styles.loadingImage} />
          <View style={[styles.loadingLine, {width: HOME_PRODUCT_CARD_WIDTH * 0.48}]} />
          <View style={[styles.loadingLine, {width: HOME_PRODUCT_CARD_WIDTH * 0.76}]} />
        </YStack>
      ))}
    </XStack>
  );
}

function ModuleImage({
  accessibilityLabel,
  contentFit,
  priority,
  source,
  style,
}: {
  accessibilityLabel: string;
  contentFit: 'contain' | 'cover';
  priority: 'low' | 'normal';
  source?: ImageSourcePropType;
  style: StyleProp<ImageStyle>;
}) {
  const sourceKey = getImageSourceKey(source);
  const [failedSourceKey, setFailedSourceKey] = useState<string>();
  const hasError = Boolean(sourceKey && failedSourceKey === sourceKey);

  useEffect(() => {
    if (!source) {
      setFailedSourceKey(undefined);
    }
  }, [source]);

  if (!source) {
    return <View accessibilityLabel="이미지 불러오는 중" style={[styles.imagePlaceholder, style]} />;
  }

  if (hasError) {
    return (
      <View
        accessibilityLabel="이미지를 불러오지 못했어요"
        style={[styles.imagePlaceholder, styles.imageErrorPlaceholder, style]}>
        <ImageOff color={colors.textTertiary} size={iconSize.md} strokeWidth={1.6} />
      </View>
    );
  }

  return (
    <CachedImage
      accessibilityLabel={accessibilityLabel}
      contentFit={contentFit}
      onError={() => setFailedSourceKey(sourceKey)}
      priority={priority}
      recyclingKey={getImageRecyclingKey(source)}
      source={source}
      style={style}
    />
  );
}

function pressItemOrModule(
  module: HomeModuleConfig,
  item: HomeModuleItem,
  onPressFeature: HomeModuleRendererProps['onPressFeature'],
) {
  const payload: HomeFeaturePressPayload = {
    ...(getMetadataString(item, 'disclosureLabel')
      ? {disclosureLabel: getMetadataString(item, 'disclosureLabel')}
      : {}),
    ...(item.targetId ? {itemId: item.targetId} : {}),
    ...(getMetadataString(item, 'shadeId')
      ? {shadeId: getMetadataString(item, 'shadeId')}
      : {}),
    ...(getMetadataBoolean(item, 'sponsored') !== undefined
      ? {sponsored: getMetadataBoolean(item, 'sponsored')}
      : {}),
    ...(getMetadataString(item, 'sponsorshipType')
      ? {sponsorshipType: getMetadataString(item, 'sponsorshipType')}
      : {}),
    ...(getMetadataString(item, 'source')
      ? {source: getMetadataString(item, 'source')}
      : {}),
  };

  onPressFeature(
    item.featureId ?? module.featureId,
    Object.keys(payload).length > 0 ? payload : undefined,
  );
}

function getMetadataNumber(
  item: HomeModuleItem,
  key: string,
): number | undefined {
  const value = item.metadata?.[key];
  return typeof value === 'number' ? value : undefined;
}

function getMetadataString(
  item: HomeModuleItem,
  key: string,
): string | undefined {
  const value = item.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function getMetadataBoolean(
  item: HomeModuleItem,
  key: string,
): boolean | undefined {
  const value = item.metadata?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function getImageRecyclingKey(source: ImageSourcePropType): string | null {
  if (typeof source === 'object' && source && 'uri' in source) {
    return source.uri ?? null;
  }

  return null;
}

function getImageSourceKey(
  source?: ImageSourcePropType,
): string | undefined {
  if (!source) {
    return undefined;
  }

  if (typeof source === 'number') {
    return `asset:${source}`;
  }

  if (Array.isArray(source)) {
    return `sources:${source.map(item => item.uri ?? '').join('|')}`;
  }

  return source.uri ? `uri:${source.uri}` : undefined;
}

function formatPrice(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('ko-KR');
}

function HorizontalItemSeparator() {
  return <View style={styles.horizontalSeparator} />;
}

const styles = StyleSheet.create({
  auradinCard: {
    backgroundColor: '#F0EDFF',
    borderColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 252,
    overflow: 'hidden',
    position: 'relative',
  },
  auradinCopy: {
    gap: spacing.sm,
    position: 'absolute',
    left: spacing.xl,
    top: spacing.xl,
    width: 188,
    zIndex: 3,
  },
  auradinDescription: {
    color: '#5F5976',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    width: 164,
  },
  auradinSearchBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
    borderColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: spacing.lg,
    gap: spacing.sm,
    left: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    position: 'absolute',
    right: spacing.lg,
    zIndex: 4,
  },
  auradinSearchText: {
    color: '#57526D',
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  auradinTitle: {
    color: '#27223B',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  compactAction: {
    alignItems: 'center',
    borderColor: colors.divider,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 92,
    paddingHorizontal: spacing.xl,
  },
  compactActionIcon: {
    alignItems: 'center',
    backgroundColor: '#F5F5F3',
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  compactActionLabel: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  consultingCard: {
    borderRadius: radius.lg,
    height: 252,
    overflow: 'hidden',
    position: 'relative',
  },
  consultingCopy: {
    bottom: spacing.xl,
    gap: spacing.md,
    left: spacing.xl,
    position: 'absolute',
    right: spacing.xl,
    zIndex: 2,
  },
  consultingScrim: {
    backgroundColor: 'rgba(18, 14, 12, 0.34)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  disclosureLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  emptyInset: {
    paddingHorizontal: HOME_MODULE_HORIZONTAL_INSET,
  },
  faceAnalysisCard: {
    borderRadius: radius.lg,
    height: 264,
    overflow: 'hidden',
    position: 'relative',
  },
  faceAnalysisCopy: {
    bottom: spacing.xl,
    gap: spacing.md,
    left: spacing.xl,
    position: 'absolute',
    width: 200,
    zIndex: 2,
  },
  faceDiagnosisScrim: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  faceDiagnosisTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: {height: 1, width: 0},
    textShadowRadius: 4,
  },
  featureScrim: {
    backgroundColor: 'rgba(12, 12, 12, 0.24)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  featureTitleLight: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xxl,
    textShadowColor: 'rgba(0, 0, 0, 0.28)',
    textShadowOffset: {height: 1, width: 0},
    textShadowRadius: 5,
  },
  fullBleedImage: {
    height: '100%',
    width: '100%',
  },
  horizontalListContent: {
    paddingHorizontal: HOME_MODULE_HORIZONTAL_INSET,
    paddingRight: HOME_MODULE_HORIZONTAL_INSET + spacing.md,
  },
  horizontalSeparator: {
    width: spacing.md,
  },
  imagePlaceholder: {
    backgroundColor: '#F4F4F2',
  },
  imageErrorPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightActionLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  lightActionRow: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  loadingImage: {
    backgroundColor: '#F4F4F2',
    borderRadius: radius.md,
    height: HOME_PRODUCT_CARD_WIDTH,
    width: HOME_PRODUCT_CARD_WIDTH,
  },
  loadingLine: {
    backgroundColor: '#F4F4F2',
    borderRadius: radius.pill,
    height: 12,
  },
  loadingRail: {
    gap: spacing.md,
    overflow: 'hidden',
    paddingHorizontal: HOME_MODULE_HORIZONTAL_INSET,
  },
  makeupExtractionCopy: {
    bottom: spacing.xl,
    gap: spacing.md,
    left: spacing.xl,
    position: 'absolute',
    width: 210,
    zIndex: 2,
  },
  makeupExtractionScrim: {
    backgroundColor: 'rgba(12, 8, 10, 0.1)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  makeupFeatureCard: {
    borderRadius: radius.lg,
    height: 252,
    overflow: 'hidden',
    position: 'relative',
  },
  makeupFeatureTitleLight: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
    textShadowColor: 'rgba(0, 0, 0, 0.28)',
    textShadowOffset: {height: 1, width: 0},
    textShadowRadius: 4,
  },
  makeupFeedbackActionLabel: {
    color: '#635747',
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  makeupFeedbackCopy: {
    gap: spacing.md,
    left: '52%',
    position: 'absolute',
    right: spacing.lg,
    top: spacing.xl,
    zIndex: 2,
  },
  makeupFeedbackTitle: {
    color: '#3C332B',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  moduleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  moduleTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
  },
  moreButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    minHeight: 40,
  },
  moreLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  pressed: {
    opacity: 0.76,
  },
  productBrand: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  productCard: {
    gap: spacing.md,
    width: HOME_PRODUCT_CARD_WIDTH,
  },
  productCopy: {
    gap: spacing.xs,
    minHeight: 96,
  },
  productImage: {
    backgroundColor: '#F7F7F5',
    borderRadius: radius.md,
    height: HOME_PRODUCT_CARD_WIDTH,
    overflow: 'hidden',
    width: HOME_PRODUCT_CARD_WIDTH,
  },
  productLoadingCard: {
    gap: spacing.md,
    width: HOME_PRODUCT_CARD_WIDTH,
  },
  productName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  productPrice: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  recommendationBento: {
    flexDirection: 'row',
    gap: spacing.sm,
    height: 292,
  },
  recommendationCopy: {
    bottom: spacing.lg,
    gap: spacing.md,
    left: spacing.lg,
    position: 'absolute',
    right: spacing.md,
    zIndex: 2,
  },
  recommendationDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  recommendationHeading: {
    gap: spacing.sm,
  },
  recommendationPrimary: {
    borderRadius: radius.lg,
    flex: 1.62,
    overflow: 'hidden',
    position: 'relative',
  },
  recommendationSecondary: {
    borderRadius: radius.md,
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  recommendationSecondaryColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  recommendationScenarioBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: radius.pill,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    position: 'absolute',
    top: spacing.sm,
    zIndex: 3,
  },
  recommendationScenarioLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  recommendationTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
    textShadowColor: 'rgba(0, 0, 0, 0.26)',
    textShadowOffset: {height: 1, width: 0},
    textShadowRadius: 4,
  },
  section: {
    gap: HOME_MODULE_CONTENT_GAP,
  },
  sectionHeaderInset: {
    paddingHorizontal: HOME_MODULE_HORIZONTAL_INSET,
  },
  sectionWithInset: {
    gap: HOME_MODULE_CONTENT_GAP,
    paddingHorizontal: HOME_MODULE_HORIZONTAL_INSET,
  },
});
