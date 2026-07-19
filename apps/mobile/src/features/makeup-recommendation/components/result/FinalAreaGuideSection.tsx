import {Check, ChevronRight} from 'lucide-react-native';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {FaceAnalysisRegionVisuals} from '../../../face-analysis/services/faceAnalysisMeasurements';
import type {Look, PartKey} from '../../screens/recommendationResultTypes';
import {colors, radius, type as typography} from '../../theme/makeupResultTokens';
import type {MakeupLookRecommendation} from '../../types';
import {FinalAreaCropPreview} from './FinalAreaCropPreview';
import {FinalMakeupRecipeStepCard} from './FinalMakeupRecipeStepCard';
import {FinalRecommendedProductCard} from './FinalRecommendedProductCard';
import {buildFinalAreaRecipes} from './finalAreaGuideRecipe';
import {ResultGlassCard} from './ResultGlassCard';

export interface FinalAreaGuideSectionProps {
  look: Look;
  sourceLook: MakeupLookRecommendation;
  generatedReady: boolean;
  onAreaOpened: (area: PartKey) => void;
  onCropSettledChange?: (settled: boolean) => void;
  onProductImageSettledChange?: (settled: boolean) => void;
  sourceImageUri?: string;
  sourceRegionVisuals?: FaceAnalysisRegionVisuals;
}

type FinalAreaRecipe = ReturnType<typeof buildFinalAreaRecipes>[number];
type TabLayout = {width: number; x: number};

const AREA_SEQUENCE_COLORS: Record<PartKey, string> = {
  base: '#C9AE98',
  brow: '#756057',
  eye: '#8B7B9D',
  cheek: '#D5969D',
  lip: '#B86678',
};

const PROGRAMMATIC_SCROLL_UNLOCK_MS = 520;

export function FinalAreaGuideSection({
  look,
  sourceLook,
  generatedReady,
  onAreaOpened,
  onCropSettledChange,
  onProductImageSettledChange,
  sourceImageUri,
  sourceRegionVisuals,
}: FinalAreaGuideSectionProps) {
  const recipes = useMemo(
    () => buildFinalAreaRecipes(sourceLook.areaGuides, look.parts),
    [look.parts, sourceLook.areaGuides],
  );
  const [selectedArea, setSelectedArea] = useState<PartKey>(
    () => recipes[0]?.area ?? 'base',
  );
  const [pagerWidth, setPagerWidth] = useState(0);
  const [sequenceViewportWidth, setSequenceViewportWidth] = useState(0);
  const pagerRef = useRef<ScrollView | null>(null);
  const previousPagerWidthRef = useRef(0);
  const sequenceRef = useRef<ScrollView | null>(null);
  const tabLayoutsRef = useRef(new Map<PartKey, TabLayout>());
  const isProgrammaticScrollRef = useRef(false);
  const programmaticUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOpenedAreaRef = useRef<PartKey | null>(null);

  const selectedIndex = recipes.findIndex(recipe => recipe.area === selectedArea);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const activeArea = recipes[activeIndex]?.area ?? 'base';

  const clearProgrammaticTimer = useCallback(() => {
    if (programmaticUnlockTimerRef.current) {
      clearTimeout(programmaticUnlockTimerRef.current);
      programmaticUnlockTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearProgrammaticTimer(), [clearProgrammaticTimer]);

  useEffect(() => {
    if (recipes.length === 0 || selectedIndex >= 0) return;
    const nextArea = recipes[0].area;
    setSelectedArea(nextArea);
    pagerRef.current?.scrollTo({animated: false, x: 0, y: 0});
  }, [recipes, selectedIndex]);

  useEffect(() => {
    if (pagerWidth <= 0 || previousPagerWidthRef.current === pagerWidth) return;
    previousPagerWidthRef.current = pagerWidth;
    pagerRef.current?.scrollTo({
      animated: false,
      x: activeIndex * pagerWidth,
      y: 0,
    });
  }, [activeIndex, pagerWidth]);

  const notifyAreaOpened = useCallback((area: PartKey) => {
    if (lastOpenedAreaRef.current === area) return;
    lastOpenedAreaRef.current = area;
    onAreaOpened(area);
  }, [onAreaOpened]);

  const centerSequenceTab = useCallback((area: PartKey) => {
    const layout = tabLayoutsRef.current.get(area);
    if (!layout || sequenceViewportWidth <= 0) return;
    sequenceRef.current?.scrollTo({
      animated: true,
      x: Math.max(0, layout.x + layout.width / 2 - sequenceViewportWidth / 2),
      y: 0,
    });
  }, [sequenceViewportWidth]);

  useEffect(() => {
    centerSequenceTab(activeArea);
  }, [activeArea, centerSequenceTab]);

  const selectAreaIndex = useCallback((index: number, notify: boolean) => {
    if (index < 0 || index >= recipes.length) return;
    const area = recipes[index].area;
    setSelectedArea(current => current === area ? current : area);
    centerSequenceTab(area);
    if (notify) notifyAreaOpened(area);
  }, [centerSequenceTab, notifyAreaOpened, recipes]);

  const handleSelectArea = useCallback((index: number) => {
    if (index < 0 || index >= recipes.length) return;
    if (index === activeIndex) {
      centerSequenceTab(recipes[index].area);
      return;
    }
    isProgrammaticScrollRef.current = true;
    clearProgrammaticTimer();
    selectAreaIndex(index, true);
    if (pagerWidth > 0) {
      pagerRef.current?.scrollTo({animated: true, x: index * pagerWidth, y: 0});
    }
    programmaticUnlockTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
      programmaticUnlockTimerRef.current = null;
    }, PROGRAMMATIC_SCROLL_UNLOCK_MS);
  }, [activeIndex, centerSequenceTab, clearProgrammaticTimer, pagerWidth, recipes, selectAreaIndex]);

  const indexFromOffset = useCallback((offsetX: number) => {
    if (pagerWidth <= 0 || recipes.length === 0) return 0;
    return Math.min(
      recipes.length - 1,
      Math.max(0, Math.round(offsetX / pagerWidth)),
    );
  }, [pagerWidth, recipes.length]);

  const handlePagerScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isProgrammaticScrollRef.current) return;
    selectAreaIndex(indexFromOffset(event.nativeEvent.contentOffset.x), false);
  }, [indexFromOffset, selectAreaIndex]);

  const handlePagerMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const wasProgrammatic = isProgrammaticScrollRef.current;
    isProgrammaticScrollRef.current = false;
    clearProgrammaticTimer();
    selectAreaIndex(
      indexFromOffset(event.nativeEvent.contentOffset.x),
      !wasProgrammatic,
    );
  }, [clearProgrammaticTimer, indexFromOffset, selectAreaIndex]);

  const handlePagerLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth > 0) setPagerWidth(current => current === nextWidth ? current : nextWidth);
  }, []);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={styles.title}>
          부위별 메이크업
        </Text>
      </View>

      <View style={styles.sequencePanel}>
        <View style={styles.sequenceHeader}>
          <View style={styles.sequenceHeaderCopy}>
            <Text accessibilityRole="header" style={styles.sequenceTitle}>
              메이크업 순서
            </Text>
          </View>
          <Text style={styles.sequenceCount}>{recipes.length}개 부위</Text>
        </View>

        <ScrollView
          accessibilityLabel="메이크업 순서"
          accessibilityRole="tablist"
          contentContainerStyle={styles.sequenceContent}
          horizontal
          onLayout={event => setSequenceViewportWidth(Math.round(event.nativeEvent.layout.width))}
          ref={sequenceRef}
          showsHorizontalScrollIndicator={false}>
          {recipes.map((recipe, index) => {
            const selected = activeArea === recipe.area;
            return (
              <View
                key={recipe.area}
                onLayout={event => {
                  const {width, x} = event.nativeEvent.layout;
                  tabLayoutsRef.current.set(recipe.area, {width, x});
                }}
                style={styles.sequenceItemWrap}>
                <Pressable
                  accessibilityHint={`${recipe.displayOrder}번째 메이크업 상세 레시피로 이동합니다.`}
                  accessibilityLabel={`${recipe.displayOrder}번째 ${recipe.label}`}
                  accessibilityRole="tab"
                  accessibilityState={{selected}}
                  onPress={() => handleSelectArea(index)}
                  style={({pressed}) => [
                    styles.sequenceItem,
                    selected && styles.selectedSequenceItem,
                    pressed && styles.pressed,
                  ]}>
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={[
                      styles.sequenceColor,
                      {backgroundColor: AREA_SEQUENCE_COLORS[recipe.area]},
                      selected && styles.selectedSequenceColor,
                    ]}
                  />
                  <Text style={[
                    styles.sequenceArea,
                    selected && styles.selectedSequenceArea,
                  ]}>
                    {recipe.label}
                  </Text>
                </Pressable>
                {index < recipes.length - 1 ? (
                  <ChevronRight
                    accessibilityElementsHidden
                    color={colors.faint}
                    importantForAccessibility="no-hide-descendants"
                    size={15}
                    strokeWidth={1.8}
                  />
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </View>

      <View onLayout={handlePagerLayout} style={styles.pagerViewport}>
        {pagerWidth > 0 ? (
          <ScrollView
            bounces={false}
            directionalLockEnabled
            horizontal
            nestedScrollEnabled
            onMomentumScrollEnd={handlePagerMomentumEnd}
            onScroll={handlePagerScroll}
            pagingEnabled
            ref={pagerRef}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            style={styles.pager}>
            {recipes.map((recipe, index) => (
              <View
                accessibilityElementsHidden={index !== activeIndex}
                importantForAccessibility={index === activeIndex ? 'auto' : 'no-hide-descendants'}
                key={recipe.area}
                style={[styles.page, {width: pagerWidth}]}>
                <FinalAreaRecipePage
                  active={index === activeIndex}
                  generatedReady={generatedReady}
                  look={look}
                  onCropSettledChange={onCropSettledChange}
                  onProductImageSettledChange={onProductImageSettledChange}
                  recipe={recipe}
                  sourceImageUri={sourceImageUri}
                  sourceLook={sourceLook}
                  sourceRegionVisuals={sourceRegionVisuals}
                />
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

function FinalAreaRecipePage({
  active,
  generatedReady,
  look,
  onCropSettledChange,
  onProductImageSettledChange,
  recipe,
  sourceImageUri,
  sourceLook,
  sourceRegionVisuals,
}: {
  active: boolean;
  generatedReady: boolean;
  look: Look;
  onCropSettledChange?: (settled: boolean) => void;
  onProductImageSettledChange?: (settled: boolean) => void;
  recipe: FinalAreaRecipe;
  sourceImageUri?: string;
  sourceLook: MakeupLookRecommendation;
  sourceRegionVisuals?: FaceAnalysisRegionVisuals;
}) {
  const [cropSettled, setCropSettled] = useState(false);
  const [productSettled, setProductSettled] = useState(false);
  const activeArea = recipe.area;
  const part = look.parts[activeArea];
  const sourceGuide = recipe.sourceGuide;
  const sourceProduct =
    sourceGuide?.products[0]
    ?? sourceLook.products.find(product => product.area === activeArea);
  const areaLabel = recipe.label || part.label || activeArea;
  const colorName = sourceGuide?.color.name || part.colorName || '컬러 정보 준비 중';
  const colorHex = sourceGuide?.color.hex || part.hex || colors.heroPlaceholder;
  const texture = recipe.texture || part.texture;
  const productSearchQuery = `${colorName} ${texture || ''} ${areaLabel} 메이크업`.trim();

  const handleCropSettledChange = useCallback((settled: boolean) => {
    setCropSettled(settled);
  }, []);
  const handleProductSettledChange = useCallback((settled: boolean) => {
    setProductSettled(settled);
  }, []);

  useEffect(() => {
    if (active) onCropSettledChange?.(cropSettled);
  }, [active, cropSettled, onCropSettledChange]);

  useEffect(() => {
    if (active) onProductImageSettledChange?.(productSettled);
  }, [active, onProductImageSettledChange, productSettled]);

  return (
    <ResultGlassCard style={styles.card}>
      <FinalAreaCropPreview
        area={activeArea}
        areaLabel={areaLabel}
        cropRegions={sourceLook.imageCropRegions}
        generatedImage={look.image}
        generatedReady={generatedReady}
        onSettledChange={handleCropSettledChange}
        sourceImageUri={sourceImageUri}
        sourceRegionVisuals={sourceRegionVisuals}
      />

      <View style={styles.areaHeader}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[
            styles.areaColorAccent,
            {backgroundColor: AREA_SEQUENCE_COLORS[activeArea]},
          ]}
        />
        <Text style={styles.areaEnglish}>{part.en}</Text>
        <Text accessibilityRole="header" style={styles.areaLabel}>{areaLabel}</Text>
        {recipe.goal ? (
          <Text style={styles.areaGoal}>{recipe.goal}</Text>
        ) : null}
        {texture ? (
          <View style={styles.textureRow}>
            <Text style={styles.detailLabel}>마무리 질감</Text>
            <Text style={styles.textureText}>{texture}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.divider} />

      <View style={styles.recipeHeader}>
        <View style={styles.recipeHeaderCopy}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            추천 메이크업 레시피
          </Text>
          <Text style={styles.recipeSubtitle}>
            색상·도구·사용량·범위와 블렌딩 순서를 확인하세요.
          </Text>
        </View>
        <Text style={styles.recipeCount}>{recipe.steps.length} STEPS</Text>
      </View>

      {!recipe.detailed ? (
        <View accessibilityLiveRegion="polite" style={styles.legacyNotice}>
          <Text style={styles.legacyTitle}>이전 결과 요약</Text>
          <Text style={styles.legacyBody}>
            이 결과에는 도구·사용량·색상 레이어·완료 기준이 저장되지 않아,
            서버가 제공한 기존 단계만 표시해요. 새 추천을 생성하면 상세 메이크업 레시피를 받을 수 있어요.
          </Text>
        </View>
      ) : null}

      {recipe.steps.length > 0 ? (
        <View style={styles.stepList}>
          {recipe.steps.map(step => (
            <FinalMakeupRecipeStepCard
              accentHex={colorHex}
              key={step.key}
              step={step}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyDetail}>저장된 단계 설명이 없어요.</Text>
      )}

      {recipe.completionCriteria.length > 0 ? (
        <View style={styles.completionCard}>
          <Text accessibilityRole="header" style={styles.completionTitle}>
            이 부위의 최종 완료 체크
          </Text>
          <View style={styles.completionList}>
            {recipe.completionCriteria.map(criterion => (
              <View key={criterion} style={styles.completionRow}>
                <View style={styles.checkIcon}>
                  <Check color={colors.white} size={12} strokeWidth={2.5} />
                </View>
                <Text style={styles.completionText}>{criterion}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <FinalRecommendedProductCard
        colorHex={colorHex}
        onImageSettledChange={handleProductSettledChange}
        product={sourceProduct}
        searchQuery={productSearchQuery}
      />
    </ResultGlassCard>
  );
}

const styles = StyleSheet.create({
  section: {gap: 10},
  sectionHeader: {gap: 5},
  title: {...typography.displayMd},
  sequencePanel: {
    backgroundColor: 'rgba(238,244,255,0.72)',
    borderColor: colors.glassBorder,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: 12,
    paddingBottom: 12,
    paddingTop: 14,
  },
  sequenceHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  sequenceHeaderCopy: {gap: 2},
  sequenceTitle: {color: colors.ink, fontSize: 15, fontWeight: '800'},
  sequenceCount: {color: colors.sub2, fontSize: 11, fontWeight: '800'},
  sequenceContent: {alignItems: 'center', paddingHorizontal: 12},
  sequenceItemWrap: {alignItems: 'center', flexDirection: 'row'},
  sequenceItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: colors.glassBorder,
    borderRadius: radius.tile,
    borderWidth: 1,
    gap: 4,
    minHeight: 74,
    minWidth: 88,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  selectedSequenceItem: {backgroundColor: colors.dark, borderColor: colors.dark},
  sequenceColor: {
    borderColor: 'rgba(16,24,40,0.12)',
    borderRadius: 15,
    borderWidth: 1,
    height: 28,
    width: 28,
  },
  selectedSequenceColor: {borderColor: colors.white, borderWidth: 2},
  sequenceArea: {color: colors.ink, fontSize: 12, fontWeight: '800'},
  selectedSequenceArea: {color: colors.white},
  pagerViewport: {width: '100%'},
  pager: {width: '100%'},
  page: {paddingTop: 2},
  card: {width: '100%'},
  areaHeader: {gap: 5, marginTop: 15},
  areaColorAccent: {borderRadius: 2, height: 4, marginBottom: 3, width: 36},
  areaEnglish: {...typography.eyebrow, color: colors.faint, letterSpacing: 2.2},
  areaLabel: {color: colors.ink, fontSize: 21, fontWeight: '800', lineHeight: 27},
  areaGoal: {color: colors.ink3, fontSize: 12.5, fontWeight: '600', lineHeight: 19},
  textureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  detailLabel: {color: colors.faint, fontSize: 10, fontWeight: '800', letterSpacing: 0.7},
  textureText: {color: colors.ink3, fontSize: 11.5, fontWeight: '700'},
  divider: {backgroundColor: 'rgba(16,24,40,0.1)', height: 1, marginVertical: 18},
  recipeHeader: {alignItems: 'flex-start', flexDirection: 'row', gap: 10},
  recipeHeaderCopy: {flex: 1, gap: 4, minWidth: 0},
  cardTitle: {color: colors.ink, fontSize: 17, fontWeight: '800'},
  recipeSubtitle: {color: colors.sub2, fontSize: 11.5, fontWeight: '500', lineHeight: 17},
  recipeCount: {color: colors.faint, fontSize: 9.5, fontWeight: '800', letterSpacing: 1},
  legacyNotice: {
    backgroundColor: 'rgba(229,237,233,0.82)',
    borderColor: 'rgba(110,136,120,0.22)',
    borderRadius: radius.tile,
    borderWidth: 1,
    gap: 5,
    marginTop: 14,
    padding: 12,
  },
  legacyTitle: {color: '#51675A', fontSize: 11.5, fontWeight: '800'},
  legacyBody: {color: '#53655A', fontSize: 11, fontWeight: '500', lineHeight: 17},
  stepList: {gap: 11, marginTop: 14},
  emptyDetail: {color: colors.sub2, fontSize: 12, lineHeight: 18, marginTop: 12},
  completionCard: {
    backgroundColor: 'rgba(221,235,228,0.72)',
    borderColor: 'rgba(110,136,120,0.2)',
    borderRadius: radius.tile,
    borderWidth: 1,
    gap: 10,
    marginTop: 15,
    padding: 13,
  },
  completionTitle: {color: colors.ink, fontSize: 13, fontWeight: '800'},
  completionList: {gap: 8},
  completionRow: {alignItems: 'flex-start', flexDirection: 'row', gap: 8},
  checkIcon: {
    alignItems: 'center',
    backgroundColor: '#6E8878',
    borderRadius: 9,
    height: 18,
    justifyContent: 'center',
    marginTop: 1,
    width: 18,
  },
  completionText: {color: colors.ink3, flex: 1, fontSize: 11.5, fontWeight: '600', lineHeight: 18},
  pressed: {opacity: 0.76},
});
