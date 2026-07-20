import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Image, Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {ChevronDown, ChevronRight, X} from 'lucide-react-native';
import {Text} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {
  getMakeupReportProductRecommendations,
  getMakeupReportRecommendationReports,
  refreshMakeupReportProductRecommendations,
  resolveMakeupReportSelection,
} from '../services/makeupReportProductRecommendationService';
import {productEventIdentity, queueProductEvent} from '../services/productEventService';
import {productLikeKey} from '../services/productLikeIdentity';
import type {
  MakeupReportProductCategory,
  MakeupReportProductRecommendations,
  MakeupReportRecommendationReport,
} from '../services/makeupReportProductRecommendationTypes';
import {PRODUCT_SHELF_CATEGORY_TABS} from '../services/productShelfCategories';
import {sortCatalogProductsByMatchRate} from '../services/productMatchPresentation';
import type {
  CatalogProduct,
  MakeupReportProductShelfContext,
  ProductRecommendationCategory,
} from '../types';
import {MakeupReportTargetLegend} from './MakeupReportTargetLegend';
import {ProductRail} from './ProductRail';
import {RecommendationSectionState} from './RecommendationSectionState';

type SectionLoad<T> =
  | {status: 'loading'; data?: T}
  | {status: 'ready'; data: T}
  | {status: 'error'; data?: T; message: string};
type RecommendationLoad =
  | SectionLoad<MakeupReportProductRecommendations>
  | {status: 'idle'; data?: undefined};

const SNAPSHOT_POLL_DELAYS_MS = [1500, 2500, 4000, 6000, 8000] as const;
const MAKEUP_REPORT_CATEGORY_TABS = PRODUCT_SHELF_CATEGORY_TABS;
const MAKEUP_REPORT_CATEGORIES = new Set<MakeupReportProductCategory>([
  'base',
  'shadow',
  'brow',
  'cheek',
  'lip',
  'liner',
]);

export function MakeupReportProductRecommendationShelf({
  isActive = true,
  likedProductKeys,
  onCreateRecommendation,
  onOpenMore,
  onOpenProduct,
  onToggleLike,
  preferredMakeupReportId,
  refreshKey = 0,
}: {
  isActive?: boolean;
  likedProductKeys: Set<string>;
  onCreateRecommendation?: () => void;
  onOpenMore?: (context: MakeupReportProductShelfContext) => void;
  onOpenProduct: (product: CatalogProduct) => void;
  onToggleLike: (product: CatalogProduct) => void;
  preferredMakeupReportId?: string | null;
  refreshKey?: number;
}) {
  const [reports, setReports] = useState<SectionLoad<MakeupReportRecommendationReport[]>>({
    status: 'loading',
  });
  const [recommendations, setRecommendations] = useState<RecommendationLoad>({status: 'idle'});
  const [recommendationRefreshKey, setRecommendationRefreshKey] = useState(0);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ProductRecommendationCategory>('all');
  const [reportPickerVisible, setReportPickerVisible] = useState(false);
  const [snapshotPollExhausted, setSnapshotPollExhausted] = useState(false);
  const selectedReportIdRef = useRef<string | null>(null);
  const selectedLookIdRef = useRef<string | null>(null);
  const recommendationsRef = useRef<RecommendationLoad>(recommendations);
  const isActiveRef = useRef(isActive);
  const revalidateRecommendationsOnFocusRef = useRef(false);
  const appliedPreferredReportIdRef = useRef<string | null>(null);
  const previousPreferredReportIdRef = useRef(preferredMakeupReportId);
  const requestRefs = useRef({reports: 0, recommendations: 0});
  const recommendationPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recommendationAbortRef = useRef<AbortController | null>(null);
  recommendationsRef.current = recommendations;
  isActiveRef.current = isActive;

  const cancelRecommendationPolling = useCallback(() => {
    requestRefs.current.recommendations += 1;
    if (recommendationPollTimerRef.current) {
      clearTimeout(recommendationPollTimerRef.current);
      recommendationPollTimerRef.current = null;
    }
    recommendationAbortRef.current?.abort();
    recommendationAbortRef.current = null;
  }, []);

  const loadRecommendations = useCallback((
    reportId: string,
    lookId: string,
    options: {preserveData?: boolean; refresh?: boolean} = {},
  ) => {
    cancelRecommendationPolling();
    const requestId = requestRefs.current.recommendations;
    const abortController = new AbortController();
    recommendationAbortRef.current = abortController;
    setSnapshotPollExhausted(false);
    if (!options.preserveData) setRecommendations({status: 'loading'});
    let pollIndex = 0;

    const requestSnapshot = (refresh: boolean) => {
      const request = refresh
        ? refreshMakeupReportProductRecommendations(reportId, lookId, 6, {
          signal: abortController.signal,
        })
        : getMakeupReportProductRecommendations(reportId, lookId, 6, {
          signal: abortController.signal,
        });
      request
        .then(data => {
          if (requestRefs.current.recommendations !== requestId) return;
          if (
            selectedReportIdRef.current !== reportId
            || selectedLookIdRef.current !== lookId
          ) return;
          setRecommendations({status: 'ready', data});
          const snapshotInProgress = data.snapshot.status === 'pending'
            || data.snapshot.status === 'processing';
          if (!snapshotInProgress) {
            setSnapshotPollExhausted(false);
            return;
          }
          const delay = SNAPSHOT_POLL_DELAYS_MS[pollIndex];
          if (delay === undefined) {
            setSnapshotPollExhausted(true);
            return;
          }
          pollIndex += 1;
          recommendationPollTimerRef.current = setTimeout(() => {
            recommendationPollTimerRef.current = null;
            if (
              requestRefs.current.recommendations === requestId
              && selectedReportIdRef.current === reportId
              && selectedLookIdRef.current === lookId
            ) requestSnapshot(false);
          }, delay);
        })
        .catch(error => {
          if (requestRefs.current.recommendations !== requestId) return;
          if (abortController.signal.aborted) return;
          setRecommendations({
            status: 'error',
            message: error instanceof Error
              ? error.message
              : '보고서 기반 추천제품을 불러오지 못했어요.',
          });
        });
    };

    requestSnapshot(Boolean(options.refresh));
  }, [cancelRecommendationPolling]);

  const applySelection = useCallback((report: MakeupReportRecommendationReport) => {
    const canPreserveLook = selectedReportIdRef.current === report.reportId;
    const nextLookId = canPreserveLook
      ? report.looks.find(look => look.lookId === selectedLookIdRef.current)?.lookId
        ?? report.looks[0]?.lookId
        ?? null
      : report.looks[0]?.lookId ?? null;
    const selectionChanged = selectedReportIdRef.current !== report.reportId
      || selectedLookIdRef.current !== nextLookId;
    if (!selectionChanged) return;
    cancelRecommendationPolling();
    selectedReportIdRef.current = report.reportId;
    selectedLookIdRef.current = nextLookId;
    setSelectedReportId(report.reportId);
    setSelectedLookId(nextLookId);
    setActiveCategory('all');
    setSnapshotPollExhausted(false);
    setRecommendations(nextLookId ? {status: 'loading'} : {status: 'idle'});
    setRecommendationRefreshKey(current => current + 1);
  }, [cancelRecommendationPolling]);

  const loadReports = useCallback(() => {
    const requestId = ++requestRefs.current.reports;
    setReports(current => current.data ? current : {status: 'loading'});
    getMakeupReportRecommendationReports()
      .then(items => {
        if (requestRefs.current.reports !== requestId) return;
        setReports({status: 'ready', data: items});
        if (items.length === 0) {
          selectedReportIdRef.current = null;
          selectedLookIdRef.current = null;
          setSelectedReportId(null);
          setSelectedLookId(null);
          setRecommendations({status: 'idle'});
          setReportPickerVisible(false);
          return;
        }
        const nextReport = resolveMakeupReportSelection(
          items,
          preferredMakeupReportId
            && appliedPreferredReportIdRef.current !== preferredMakeupReportId
            && items.some(report => report.reportId === preferredMakeupReportId)
            ? preferredMakeupReportId
            : null,
          selectedReportIdRef.current,
        );
        if (nextReport) {
          if (preferredMakeupReportId && nextReport.reportId === preferredMakeupReportId) {
            appliedPreferredReportIdRef.current = preferredMakeupReportId;
          }
          applySelection(nextReport);
        }
      })
      .catch(error => {
        if (requestRefs.current.reports !== requestId) return;
        setReports(current => current.data
          ? current
          : {
            status: 'error',
            message: error instanceof Error
              ? error.message
              : '메이크업 추천 보고서를 불러오지 못했어요.',
          });
      });
  }, [applySelection, preferredMakeupReportId]);

  useEffect(() => {
    if (previousPreferredReportIdRef.current === preferredMakeupReportId) return;
    previousPreferredReportIdRef.current = preferredMakeupReportId;
    appliedPreferredReportIdRef.current = null;
  }, [preferredMakeupReportId]);

  useEffect(() => {
    if (!isActive) {
      requestRefs.current.reports += 1;
      return;
    }
    loadReports();
  }, [isActive, loadReports, refreshKey]);

  useEffect(() => {
    if (!isActiveRef.current || !selectedReportId || !selectedLookId) return;
    loadRecommendations(selectedReportId, selectedLookId);
  }, [
    loadRecommendations,
    recommendationRefreshKey,
    selectedLookId,
    selectedReportId,
  ]);

  useEffect(() => {
    if (!isActive) {
      revalidateRecommendationsOnFocusRef.current = Boolean(
        selectedReportIdRef.current && selectedLookIdRef.current,
      );
      cancelRecommendationPolling();
      return;
    }
    if (
      revalidateRecommendationsOnFocusRef.current
      && selectedReportIdRef.current
      && selectedLookIdRef.current
    ) {
      revalidateRecommendationsOnFocusRef.current = false;
      loadRecommendations(
        selectedReportIdRef.current,
        selectedLookIdRef.current,
        {preserveData: recommendationsRef.current.status === 'ready'},
      );
    }
  }, [cancelRecommendationPolling, isActive, loadRecommendations]);

  useEffect(() => () => {
    requestRefs.current.reports += 1;
    cancelRecommendationPolling();
  }, []);

  const selectedReport = useMemo(
    () => reports.data?.find(report => report.reportId === selectedReportId)
      ?? recommendations.data?.report,
    [recommendations.data, reports.data, selectedReportId],
  );
  const selectedLook = selectedReport?.looks.find(look => look.lookId === selectedLookId)
    ?? recommendations.data?.selectedLook;

  const selectReport = useCallback((report: MakeupReportRecommendationReport) => {
    applySelection(report);
    setReportPickerVisible(false);
  }, [applySelection]);

  const retryRecommendations = useCallback(() => {
    if (!selectedReportIdRef.current || !selectedLookIdRef.current) return;
    const reportId = selectedReportIdRef.current;
    const lookId = selectedLookIdRef.current;
    const shouldRefresh = recommendations.data?.snapshot.status === 'failed'
      || recommendations.data?.status === 'noEligibleProducts';
    loadRecommendations(reportId, lookId, {refresh: shouldRefresh});
  }, [
    loadRecommendations,
    recommendations.data?.snapshot.status,
    recommendations.data?.status,
  ]);

  const activeItems = useMemo(() => {
    const groups = recommendations.data?.groups?.filter(group =>
      MAKEUP_REPORT_CATEGORIES.has(group.category),
    ) ?? [];
    const source = activeCategory === 'all'
      ? groups.flatMap(group => group.items)
      : groups.find(group => group.category === activeCategory)?.items ?? [];
    const seen = new Set<string>();
    return sortCatalogProductsByMatchRate(source
      .filter(product => {
        const identity = `${product.productId}:${product.shadeId ?? 'family'}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      })
      .map(product => ({
        ...product,
        viewerState: {
          liked: product.canLike === false
            ? false
          : likedProductKeys.has(productLikeKey(product.productId, product.externalSource)),
        },
      })));
  }, [activeCategory, likedProductKeys, recommendations.data]);
  const reportTargetGroups = useMemo(() => recommendations.data?.groups?.filter(group =>
    MAKEUP_REPORT_CATEGORIES.has(group.category),
  ) ?? [], [recommendations.data]);
  const activeTargetGroups = useMemo(() => {
    return activeCategory === 'all'
      ? []
      : reportTargetGroups.filter(group => group.category === activeCategory);
  }, [activeCategory, reportTargetGroups]);
  const canOpenReportPicker = Boolean(reports.data?.length);
  const queueReportProductEvent = useCallback((
    eventType: 'impression' | 'product_open',
    product: CatalogProduct,
    position: number,
  ) => {
    queueProductEvent({
      eventType,
      section: 'legacy',
      ...productEventIdentity(product),
      position,
      context: eventType === 'impression'
        ? {
          category: activeCategory,
          screen: 'product_hub',
          source: 'makeup_report',
          viewportRatio: 0.6,
          visibleMs: 700,
        }
        : {category: activeCategory, screen: 'product_hub', source: 'makeup_report'},
    });
  }, [activeCategory]);
  const snapshotStatus = recommendations.status === 'ready'
    ? recommendations.data.snapshot.status
    : null;
  const snapshotInProgress = snapshotStatus === 'pending' || snapshotStatus === 'processing';
  const snapshotFailed = snapshotStatus === 'failed';
  const snapshotHasNoProducts = recommendations.status === 'ready'
    && recommendations.data.status === 'noEligibleProducts';
  const snapshotCanDisplay = recommendations.status === 'ready'
    && (snapshotStatus === 'ready' || snapshotStatus === 'partial')
    && !snapshotHasNoProducts;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>
          메이크업 추천 보고서 기반 추천제품
        </Text>
        <Pressable
          accessibilityState={{disabled: !canOpenReportPicker}}
          accessibilityRole="button"
          disabled={!canOpenReportPicker}
          onPress={() => setReportPickerVisible(true)}
          style={[styles.headerAction, !canOpenReportPicker ? styles.headerActionDisabled : undefined]}>
          <Text style={styles.headerActionText}>보고서 선택</Text>
          <ChevronDown color={colors.textPrimary} size={iconSize.xs} />
        </Pressable>
      </View>

      {reports.status === 'loading' && !reports.data ? (
        <RecommendationSectionState kind="loading" message="메이크업 추천 보고서를 불러오는 중이에요." />
      ) : null}
      {reports.status === 'error' && !reports.data ? (
        <RecommendationSectionState
          actionLabel="다시 시도"
          kind="error"
          message={reports.message}
          onAction={loadReports}
        />
      ) : null}
      {reports.status === 'ready' && reports.data.length === 0 ? (
        <RecommendationSectionState
          actionLabel={onCreateRecommendation ? '메이크업 추천 받기' : undefined}
          kind="empty"
          message="완료된 메이크업 추천 보고서가 아직 없어요. 추천을 완료하면 룩의 색상과 질감에 가까운 실제 제품을 보여드려요."
          onAction={onCreateRecommendation}
        />
      ) : null}

      {selectedReport ? (
        <View style={styles.stack}>
          <View style={styles.reportSummary}>
            <ReportThumbnail imageUrl={selectedLook?.imageUrl} title={selectedLook?.title} />
            <View style={styles.reportCopy}>
              <Text numberOfLines={1} style={styles.reportDate}>{formatDate(selectedReport.createdAt)}</Text>
              <Text numberOfLines={2} style={styles.reportScenario}>{selectedReport.scenarioText}</Text>
              <Text numberOfLines={1} style={styles.reportLook}>보고서 기준 색상·피니시</Text>
            </View>
          </View>
          {reportTargetGroups.length > 0 ? (
            <View style={styles.reportTargets}>
              <View style={styles.reportTargetsHeader}>
                <Text style={styles.reportTargetsTitle}>보고서 색상 기준</Text>
                <Text numberOfLines={1} style={styles.reportTargetsHint}>
                  이 색·피니시와 가까운 제품을 추천해요
                </Text>
              </View>
              <View style={styles.reportTargetLegends}>
                {reportTargetGroups.map(group => (
                  <MakeupReportTargetLegend
                    category={group.category}
                    categoryLabel={group.label}
                    key={group.category}
                    style={styles.reportTargetLegend}
                    target={group.target}
                    variant="compact"
                  />
                ))}
              </View>
            </View>
          ) : null}

          {recommendations.status === 'loading' ? (
            <RecommendationSectionState kind="loading" message="저장된 맞춤 추천을 확인하고 있어요." />
          ) : null}
          {recommendations.status === 'error' ? (
            <RecommendationSectionState
              actionLabel="다시 시도"
              kind="error"
              message={recommendations.message}
              onAction={retryRecommendations}
            />
          ) : null}
          {snapshotInProgress ? (
            <RecommendationSectionState
              actionLabel={snapshotPollExhausted ? '상태 다시 확인' : undefined}
              kind="loading"
              message={snapshotPollExhausted
                ? '제품 매칭이 계속 진행 중이에요. 잠시 후 상태를 다시 확인해 주세요.'
                : snapshotStatus === 'pending'
                  ? '보고서를 바탕으로 맞춤 제품을 찾을 준비 중이에요.'
                  : '색상과 제품 유형이 가까운 실제 제품을 매칭하고 있어요.'}
              onAction={snapshotPollExhausted ? retryRecommendations : undefined}
            />
          ) : null}
          {snapshotFailed ? (
            <RecommendationSectionState
              actionLabel="추천 다시 만들기"
              kind="error"
              message={recommendations.data?.message
                ?? '제품 매칭을 완료하지 못했어요. 같은 보고서와 룩으로 다시 만들 수 있어요.'}
              onAction={retryRecommendations}
            />
          ) : null}
          {snapshotHasNoProducts ? (
            <RecommendationSectionState
              actionLabel="추천 다시 찾기"
              kind="empty"
              message="현재 판매 중인 제품 가운데 이 룩의 색상과 조건에 맞는 제품을 찾지 못했어요. 카탈로그가 갱신되면 다시 확인해 주세요."
              onAction={retryRecommendations}
            />
          ) : null}
          {snapshotCanDisplay ? (
            <View style={styles.stack}>
              {snapshotStatus === 'partial' ? (
                <Text style={styles.rankingCopy}>조건을 충족한 카테고리부터 저장된 추천을 보여드려요.</Text>
              ) : null}
              <View style={styles.rankingHeader}>
                <Text style={[styles.rankingCopy, styles.rankingDescription]}>
                  {recommendations.data.ranking?.embeddingApplied
                    ? '색상·피니시 조건으로 후보를 고른 뒤 제품 유형·질감 유사도로 정렬했어요.'
                    : '보고서의 색상·피니시 조건과 검증된 제품 정보를 기준으로 골랐어요.'}
                </Text>
                {onOpenMore && selectedLookId ? (
                  <Pressable
                    accessibilityLabel={`${selectedReport.scenarioText} ${categoryLabel(activeCategory)} 추천제품 더보기`}
                    accessibilityRole="button"
                    onPress={() => onOpenMore({
                      reportId: selectedReport.reportId,
                      lookId: selectedLookId,
                      category: activeCategory,
                      title: `${selectedReport.scenarioText} 추천제품`,
                    })}
                    style={styles.moreButton}>
                    <Text style={styles.moreButtonText}>더보기</Text>
                    <ChevronRight color={colors.textPrimary} size={iconSize.xs} />
                  </Pressable>
                ) : null}
              </View>
              <ScrollView
                contentContainerStyle={styles.chips}
                horizontal
                showsHorizontalScrollIndicator={false}>
                {MAKEUP_REPORT_CATEGORY_TABS.map(tab => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{selected: tab.id === activeCategory}}
                    key={tab.id}
                    onPress={() => setActiveCategory(tab.id)}
                    style={tab.id === activeCategory ? styles.chipActive : styles.chip}>
                    <Text style={tab.id === activeCategory ? styles.chipTextActive : styles.chipText}>
                      {tab.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              {activeTargetGroups.length > 0 ? (
                <ScrollView
                  contentContainerStyle={styles.targetLegends}
                  horizontal
                  showsHorizontalScrollIndicator={false}>
                  {activeTargetGroups.map(group => (
                    <MakeupReportTargetLegend
                      category={group.category}
                      categoryLabel={group.label}
                      key={group.category}
                      target={group.target}
                    />
                  ))}
                </ScrollView>
              ) : null}
              {activeItems.length > 0 ? (
                <ProductRail
                  impressionScopeKey={`${recommendations.data.snapshot.runId ?? recommendations.data.runId ?? selectedReport.reportId}:${recommendations.data.snapshot.revision ?? 0}:${selectedLookId ?? 'default'}:${activeCategory}`}
                  items={activeItems}
                  onImpression={(product, position) => {
                    queueReportProductEvent('impression', product, position);
                  }}
                  onOpen={(product, position) => {
                    queueReportProductEvent('product_open', product, position);
                    onOpenProduct(product);
                  }}
                  onToggleLike={onToggleLike}
                  showReason
                />
              ) : (
                <RecommendationSectionState
                  kind="empty"
                  message={`${categoryLabel(activeCategory)}에 조건이 맞는 판매 제품을 준비하고 있어요.`}
                />
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      <Modal
        animationType="fade"
        onRequestClose={() => setReportPickerVisible(false)}
        transparent
        visible={reportPickerVisible}>
        <View accessibilityViewIsModal style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleCopy}>
                <Text accessibilityRole="header" style={styles.modalTitle}>메이크업 추천 보고서 선택</Text>
                <Text style={styles.modalSubtitle}>제품을 찾을 룩이 들어 있는 보고서를 골라 주세요.</Text>
              </View>
              <Pressable
                accessibilityLabel="보고서 선택 닫기"
                accessibilityRole="button"
                onPress={() => setReportPickerVisible(false)}
                style={styles.modalClose}>
                <X color={colors.textPrimary} size={iconSize.sm} />
              </Pressable>
            </View>
            {reports.status === 'loading' && !reports.data ? (
              <RecommendationSectionState kind="loading" message="보고서를 불러오는 중이에요." />
            ) : null}
            {reports.status === 'error' && !reports.data ? (
              <RecommendationSectionState
                actionLabel="다시 시도"
                kind="error"
                message={reports.message}
                onAction={loadReports}
              />
            ) : null}
            {reports.data?.length ? (
              <ScrollView contentContainerStyle={styles.reportList}>
                {reports.data.map(report => {
                  const previewLook = report.looks[0];
                  const selected = report.reportId === selectedReportId;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{selected}}
                      key={report.reportId}
                      onPress={() => selectReport(report)}
                      style={selected ? styles.reportOptionSelected : styles.reportOption}>
                      <ReportThumbnail imageUrl={previewLook?.imageUrl} title={previewLook?.title} />
                      <View style={styles.reportOptionCopy}>
                        <Text style={styles.reportDate}>{formatDate(report.createdAt)}</Text>
                        <Text numberOfLines={2} style={styles.reportScenario}>{report.scenarioText}</Text>
                        <Text numberOfLines={1} style={styles.reportLook}>
                          {report.looks.length}개 룩 · {previewLook?.title ?? '추천 룩'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ReportThumbnail({imageUrl, title}: {imageUrl?: string | null; title?: string}) {
  return (
    <View style={styles.thumbnail}>
      {imageUrl ? (
        <Image accessibilityLabel={title ?? '추천 메이크업 룩'} resizeMode="cover" source={{uri: imageUrl}} style={styles.thumbnailImage} />
      ) : (
        <Text style={styles.thumbnailFallback}>LOOK</Text>
      )}
    </View>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '최근 추천';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function categoryLabel(category: ProductRecommendationCategory): string {
  return MAKEUP_REPORT_CATEGORY_TABS.find(tab => tab.id === category)?.label ?? '선택한 카테고리';
}

const styles = StyleSheet.create({
  section: {gap: spacing.sm},
  header: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between'},
  title: {color: colors.textPrimary, flex: 1, fontFamily: typography.fontFamily.bold, fontSize: 22, lineHeight: 28},
  headerAction: {alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: spacing.xs, justifyContent: 'center', minHeight: 44, paddingLeft: spacing.sm},
  headerActionDisabled: {opacity: 0.36},
  headerActionText: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  stack: {gap: spacing.sm},
  reportSummary: {alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, flexDirection: 'row', gap: spacing.md, padding: spacing.md},
  reportCopy: {flex: 1, gap: 2, minWidth: 0},
  reportDate: {...typography.caption, color: colors.textTertiary},
  reportScenario: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  reportLook: {...typography.caption, color: colors.textSecondary},
  reportTargets: {backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, gap: spacing.xs, padding: spacing.sm},
  reportTargetsHeader: {alignItems: 'baseline', flexDirection: 'row', gap: spacing.xs},
  reportTargetsTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  reportTargetsHint: {color: colors.textTertiary, flex: 1, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
  reportTargetLegends: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  reportTargetLegend: {flexBasis: '48%', flexGrow: 1, maxWidth: '100%'},
  thumbnail: {alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, height: 72, justifyContent: 'center', overflow: 'hidden', width: 72},
  thumbnailImage: {height: '100%', width: '100%'},
  thumbnailFallback: {color: colors.textTertiary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, letterSpacing: 1},
  rankingCopy: {...typography.caption, color: colors.textSecondary},
  rankingDescription: {flex: 1},
  rankingHeader: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between'},
  moreButton: {alignItems: 'center', flexDirection: 'row', flexShrink: 0, justifyContent: 'center', minHeight: 44, paddingLeft: spacing.sm},
  moreButtonText: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  targetLegends: {gap: spacing.xs},
  chips: {gap: spacing.xs},
  chip: {borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md},
  chipActive: {backgroundColor: colors.black, borderRadius: radius.pill, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md},
  chipText: {...typography.caption, color: colors.textSecondary},
  chipTextActive: {...typography.caption, color: colors.white},
  modalBackdrop: {backgroundColor: 'rgba(0,0,0,0.42)', flex: 1, justifyContent: 'flex-end', padding: spacing.sm},
  modalCard: {backgroundColor: colors.background, borderRadius: radius.lg, gap: spacing.md, maxHeight: '78%', padding: spacing.lg},
  modalHeader: {alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between'},
  modalTitleCopy: {flex: 1, gap: spacing.xs},
  modalTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md, lineHeight: typography.lineHeight.md},
  modalSubtitle: {...typography.caption, color: colors.textSecondary},
  modalClose: {alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44},
  reportList: {gap: spacing.sm},
  reportOption: {alignItems: 'center', borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 96, padding: spacing.sm},
  reportOptionSelected: {alignItems: 'center', backgroundColor: colors.surfaceMuted, borderColor: colors.textPrimary, borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 96, padding: spacing.sm},
  reportOptionCopy: {flex: 1, gap: 2, minWidth: 0},
});
