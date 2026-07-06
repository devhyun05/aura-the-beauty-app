import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View as RNView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {X} from 'lucide-react-native';
import {Text, XStack} from 'tamagui';

import {getBackendApiBaseUrl} from '../../../shared/services/backendApi';
import {getFaceAnalysisReports} from '../../../shared/services/faceAnalysisService';
import {uploadMediaAsset} from '../../../shared/services/mediaUploadService';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {colors, communityColors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {PaginationDots} from '../../../shared/ui';
import {
  type CommunityCreateImage,
  CreateThreadForm,
  type CreateThreadFormValues,
  getCreateFormSections,
} from '../components/CreateThreadForm';
import {ReportPickerModal} from '../components/ReportPickerModal';
import {
  clearCommunityThreadDraft,
  loadCommunityThreadDraft,
  saveCommunityThreadDraft,
} from '../services/communityDraftService';
import {
  createCommunityThread,
  getCommunityThreadDetail,
  updateCommunityThread,
  validateCreateCommunityThreadInput,
} from '../services/communityService';
import type {CommunityProductUsage, CommunityThreadDetail, WritableCommunityCategory} from '../types';

const DRAFT_SAVE_DEBOUNCE_MS = 800;
// 스크롤 기준선: 이 지점을 지난 섹션을 활성으로 본다.
const SECTION_ACTIVE_OFFSET = 140;
const MEDIA_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPersistedMediaId(id: string): boolean {
  return MEDIA_ID_PATTERN.test(id);
}

// "제품명(쉐이드)" 문법 지원 — 쉼표는 제품 구분자, 괄호 안은 쉐이드.
// 예: "비글로우(21호), 워터뱅크 프라이머" → [{name:'비글로우', shade:'21호'}, {name:'워터뱅크 프라이머'}]
function parseProductList(value: string) {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map(entry => {
      const shadeMatch = entry.match(/^(.+?)\s*\(([^)]+)\)$/);

      return shadeMatch
        ? {name: shadeMatch[1].trim(), shade: shadeMatch[2].trim()}
        : {name: entry};
    });
}

function buildProductUsage(values: CreateThreadFormValues): CommunityProductUsage {
  return {
    base: parseProductList(values.productBase),
    cheek: parseProductList(values.productCheek),
    eye: parseProductList(values.productEye),
    lip: parseProductList(values.productLip),
  };
}

function formatProductListForInput(items: CommunityProductUsage[keyof CommunityProductUsage]): string {
  return items
    .map(item => item.shade ? `${item.name}(${item.shade})` : item.name)
    .join(', ');
}

function getFormValuesFromThread(thread: CommunityThreadDetail): CreateThreadFormValues {
  return {
    body: thread.body,
    category: thread.category,
    difficulty: thread.difficulty ?? null,
    durationMinutes: thread.durationMinutes ?? null,
    moodTags: thread.moodTags,
    productBase: formatProductListForInput(thread.productUsage.base),
    productCheek: formatProductListForInput(thread.productUsage.cheek),
    productEye: formatProductListForInput(thread.productUsage.eye),
    productLip: formatProductListForInput(thread.productUsage.lip),
    situationTags: thread.situationTags,
    title: thread.title,
  };
}

function getImagesFromThread(thread: CommunityThreadDetail): CommunityCreateImage[] {
  return thread.media
    .map((media, index) => ({
      fileName: `community-${index + 1}.jpg`,
      id: media.id,
      mimeType: 'image/jpeg',
      uri: media.imageUrl ?? media.cdnUrl ?? '',
    }))
    .filter(image => image.uri.length > 0);
}
async function resolveMediaIdsForSubmit(
  images: CommunityCreateImage[],
  apiBaseUrl: string | null | undefined,
  setSubmitLabel: (label: string | null) => void,
): Promise<{localMedia?: Array<{id: string; imageUrl: string}>; mediaIds: string[]}> {
  const localMedia = images.map(image => ({id: image.id, imageUrl: image.uri}));

  if (!apiBaseUrl) {
    return {localMedia, mediaIds: images.map(image => image.id)};
  }

  const mediaIds: string[] = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];

    if (isPersistedMediaId(image.id)) {
      mediaIds.push(image.id);
      continue;
    }

    setSubmitLabel(`업로드 중 ${index + 1}/${images.length}`);
    const media = await uploadMediaAsset({
      contentType: image.mimeType,
      fileName: image.fileName,
      height: image.height,
      mediaKind: 'community-thread',
      normalize: {compress: 0.82, format: 'jpeg', maxDimension: 1440},
      source: 'gallery',
      uri: image.uri,
      width: image.width,
    });
    mediaIds.push(media.id);
  }

  return {mediaIds};
}

const initialValues: CreateThreadFormValues = {
  body: '',
  category: 'lookbook',
  difficulty: null,
  durationMinutes: null,
  moodTags: [],
  productBase: '',
  productCheek: '',
  productEye: '',
  productLip: '',
  situationTags: [],
  title: '',
};

export function CommunityCreateThreadScreen({
  mode = 'create',
  onCreated,
  onUpdated,
  threadId,
}: {
  mode?: 'create' | 'edit';
  onCreated?: (thread: CommunityThreadDetail) => void;
  onUpdated?: (thread: CommunityThreadDetail) => void;
  threadId?: string;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const isEditMode = mode === 'edit';
  const [activeSection, setActiveSection] = useState(0);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [images, setImages] = useState<CommunityCreateImage[]>([]);
  const [isHydrating, setIsHydrating] = useState(isEditMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [submitLabel, setSubmitLabel] = useState<string | null>(null);
  const [values, setValues] = useState<CreateThreadFormValues>(initialValues);
  const [pickerReports, setPickerReports] = useState<FaceAnalysisReport[] | null>(null);
  // 카테고리별 독립 작성 버퍼 — 룩북에 쓰던 내용이 다른 카테고리로 새지 않는다.
  const categoryBuffersRef = useRef<Partial<Record<
    WritableCommunityCategory,
    {images: CommunityCreateImage[]; values: CreateThreadFormValues}
  >>>({});
  const formOffsetRef = useRef(0);
  const hasHydratedRef = useRef(false);
  const isSubmittingRef = useRef(false);
  // 카테고리별 섹션 수가 달라 단일 소스(getCreateFormSections)에서 파생한다.
  const formSections = getCreateFormSections(values.category);
  const sectionOffsetsRef = useRef<number[]>([]);

  const loadEditThread = useCallback(async () => {
    if (!isEditMode || !threadId) {
      return;
    }

    setIsHydrating(true);
    setHasLoadError(false);

    try {
      const thread = await getCommunityThreadDetail(threadId);
      setImages(getImagesFromThread(thread));
      setValues(getFormValuesFromThread(thread));
    } catch {
      setHasLoadError(true);
    } finally {
      hasHydratedRef.current = true;
      setIsHydrating(false);
    }
  }, [isEditMode, threadId]);

  useEffect(() => {
    void loadEditThread();
  }, [loadEditThread]);

  // 카테고리 전환 시 언마운트된 섹션의 stale offset이 남지 않게 리셋.
  useEffect(() => {
    sectionOffsetsRef.current = Array.from({length: formSections.length}, () => 0);
    setActiveSection(0);
  }, [values.category, formSections.length]);

  // 스펙: 진행 도트는 섹션 스크롤과 연동된다.
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const baseline = event.nativeEvent.contentOffset.y + SECTION_ACTIVE_OFFSET;
    let nextSection = 0;

    sectionOffsetsRef.current.forEach((sectionY, index) => {
      if (baseline >= sectionY + formOffsetRef.current) {
        nextSection = index;
      }
    });

    setActiveSection(current => current === nextSection ? current : nextSection);
  };

  // 이탈 복귀 시 로컬 draft 복원.
  useEffect(() => {
    if (isEditMode) {
      return;
    }

    const draft = loadCommunityThreadDraft();

    if (draft) {
      setImages(draft.images);
      setValues(draft.values);
      setShowDraftBanner(true);
    }

    hasHydratedRef.current = true;
  }, [isEditMode]);

  // 작성 내용 자동 임시저장 (debounce).
  useEffect(() => {
    if (!hasHydratedRef.current || isEditMode) {
      return;
    }

    const isPristine = !values.title.trim() && !values.body.trim() && images.length === 0;

    if (isPristine) {
      return;
    }

    const timeout = setTimeout(() => {
      saveCommunityThreadDraft({
        images,
        savedAt: new Date().toISOString(),
        values,
      });
    }, DRAFT_SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [images, isEditMode, values]);

  // 업로드 중 화면 이탈 확인.
  useEffect(() => {
    return navigation.addListener('beforeRemove', event => {
      if (!isSubmittingRef.current) {
        return;
      }

      event.preventDefault();
      Alert.alert(
        '업로드가 진행 중이에요',
        '지금 나가면 게시가 중단돼요. 작성 내용은 임시저장돼 있어요.',
        [
          {style: 'cancel', text: '계속 작성'},
          {
            onPress: () => navigation.dispatch(event.data.action),
            style: 'destructive',
            text: '나가기',
          },
        ],
      );
    });
  }, [navigation]);

  const draftInput = useMemo(() => ({
    body: values.body,
    category: values.category,
    difficulty: values.difficulty,
    durationMinutes: values.durationMinutes,
    mediaIds: images.map(image => image.id),
    moodTags: values.moodTags,
    productUsage: buildProductUsage(values),
    situationTags: values.situationTags,
    title: values.title,
  }), [images, values]);
  const errors = validateCreateCommunityThreadInput(draftInput);

  const handlePickImages = async () => {
    // 이미 고른 사진은 유지하고 남은 슬롯만큼만 추가한다 (기존: 통째로 교체돼 다시 골라야 했음).
    const remaining = 4 - images.length;

    if (remaining <= 0) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
      selectionLimit: remaining,
    });

    if (result.canceled) {
      return;
    }

    const pickedImages = result.assets.slice(0, remaining).map((asset, index) => ({
      fileName: asset.fileName,
      height: asset.height,
      id: `local-image-${Date.now()}-${index}`,
      mimeType: asset.mimeType,
      uri: asset.uri,
      width: asset.width,
    }));

    setImages(current => [...current, ...pickedImages].slice(0, 4));
  };

  // ─── 비포애프터 2슬롯 (0=BEFORE, 1=AFTER) ───

  const pickSingleImage = async (): Promise<CommunityCreateImage | null> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    const asset = result.assets[0];
    return {
      fileName: asset.fileName,
      height: asset.height,
      id: `local-image-${Date.now()}`,
      mimeType: asset.mimeType,
      uri: asset.uri,
      width: asset.width,
    };
  };

  const setSlotImage = (slot: 0 | 1, image: CommunityCreateImage) => {
    setImages(current => {
      const next = [...current];
      next[slot] = image;
      return next.slice(0, 2).filter(Boolean);
    });
  };

  const pickImageForSlot = async (slot: 0 | 1) => {
    const image = await pickSingleImage();

    if (image) {
      setSlotImage(slot, image);
    }
  };

  // ImageSourcePropType에서 표시/업로드 가능한 uri를 추출.
  // 원격 uri 우선, 번들 에셋(number)은 Metro가 제공하는 uri로 해석(개발/목 데모 지원). 죽은 file://는 차단.
  const resolveImageUri = (source: unknown): string | null => {
    if (source && typeof source === 'object' && !Array.isArray(source) && 'uri' in source) {
      const uri = (source as {uri?: unknown}).uri;

      if (typeof uri === 'string' && /^https?:/.test(uri)) {
        return uri;
      }

      return null;
    }

    if (typeof source === 'number') {
      return RNImage.resolveAssetSource(source)?.uri ?? null;
    }

    return null;
  };

  const slotFallbackToGallery = (slot: 0 | 1, title: string) => {
    Alert.alert(title, `갤러리에서 ${slot === 0 ? '비포' : '애프터'} 사진을 선택해 주세요.`, [
      {onPress: () => void pickImageForSlot(slot), text: '갤러리 열기'},
      {style: 'cancel', text: '취소'},
    ]);
  };

  const getRecommendedMakeupUri = (report: FaceAnalysisReport) => {
    const candidate = (report.recommendedMakeups ?? [])
      .map(card => ({card, uri: resolveImageUri(card.imageSource)}))
      .find(item =>
        item.uri != null && item.card.imageStatus !== 'failed' && item.card.imageStatus !== 'pending');

    return candidate?.uri
      ? {id: `report-reco-${candidate.card.id}`, uri: candidate.uri}
      : null;
  };

  // 선택한 리포트를 슬롯에 적용: BEFORE = 분석 사진(민낯), AFTER = 그 리포트의 추천 메이크업 자동 매칭.
  const applyReportToSlots = (report: FaceAnalysisReport) => {
    const beforeUri = resolveImageUri(report.imageSource);

    if (!beforeUri) {
      slotFallbackToGallery(0, '분석 사진을 쓸 수 없어요');
      return;
    }

    setSlotImage(0, {id: `report-${report.id}`, uri: beforeUri});

    const recommended = getRecommendedMakeupUri(report);

    if (recommended) {
      setSlotImage(1, recommended);
    } else {
      Alert.alert('애프터 자동 매칭 실패', '이 리포트에는 추천 메이크업 이미지가 없어요. 애프터는 갤러리에서 선택해 주세요.');
    }
  };

  // 쌓아둔 분석 결과 목록을 썸네일 시트로 열어 고르게 한다.
  const handleChooseReportForSlots = async () => {
    try {
      const reports = await getFaceAnalysisReports({withRecommendedMakeups: true});
      const usableReports = reports
        .filter(report => resolveImageUri(report.imageSource) != null)
        .slice(0, 12);

      if (usableReports.length === 0) {
        slotFallbackToGallery(0, '사용할 수 있는 분석 사진이 없어요');
        return;
      }

      setPickerReports(usableReports);
    } catch {
      slotFallbackToGallery(0, '분석 결과를 불러오지 못했어요');
    }
  };

  const handlePickSlotImage = (slot: 0 | 1) => {
    if (slot === 1 && images.length === 0) {
      Alert.alert('비포 사진 먼저', '변화의 기준이 되는 비포 사진을 먼저 선택해 주세요.');
      return;
    }

    // BEFORE는 분석 결과에서 고르는 게 기본 경로 — 바로 리포트 시트를 연다.
    // (리포트가 없으면 handleChooseReportForSlots 내부에서 갤러리 폴백)
    if (slot === 0) {
      void handleChooseReportForSlots();
      return;
    }

    void pickImageForSlot(1);
  };

  const handleSwapSlots = () => {
    setImages(current => current.length >= 2
      ? [current[1], current[0], ...current.slice(2)]
      : current);
  };

  const handleValuesChange = (nextValues: CreateThreadFormValues) => {
    // 카테고리 전환 = 다른 글 종류 — 현재 내용은 버퍼에 보관하고 그 카테고리의 버퍼를 복원한다.
    if (!isEditMode && nextValues.category !== values.category) {
      categoryBuffersRef.current[values.category] = {images, values};

      const saved = categoryBuffersRef.current[nextValues.category];

      if (saved) {
        setImages(saved.images);
        setValues({...saved.values, category: nextValues.category});
      } else {
        setImages([]);
        setValues({...initialValues, category: nextValues.category});
      }

      return;
    }

    if (isEditMode && nextValues.category !== values.category) {
      setValues({...nextValues, category: values.category});
      return;
    }

    setValues(nextValues);
  };

  const handleDiscardDraft = () => {
    clearCommunityThreadDraft();
    categoryBuffersRef.current = {};
    setImages([]);
    setValues(initialValues);
    setShowDraftBanner(false);
  };

  const handleSubmit = async () => {
    if (errors.length > 0 || isSubmittingRef.current) {
      return;
    }

    setIsSubmitting(true);
    isSubmittingRef.current = true;

    try {
      const apiBaseUrl = getBackendApiBaseUrl();
      const {localMedia, mediaIds} = await resolveMediaIdsForSubmit(images, apiBaseUrl, setSubmitLabel);
      const threadInput = {
        ...draftInput,
        localMedia,
        mediaIds,
      };

      if (isEditMode) {
        if (!threadId) {
          throw new Error('수정할 글을 찾지 못했어요.');
        }

        setSubmitLabel('수정 중...');
        const thread = await updateCommunityThread(threadId, threadInput);
        onUpdated?.(thread);
        return;
      }

      setSubmitLabel('게시 중...');
      const thread = await createCommunityThread(threadInput);
      clearCommunityThreadDraft();
      onCreated?.(thread);
    } catch (error) {
      // 작성 내용은 자동 임시저장으로 보존돼 있다.
      Alert.alert(
        isEditMode ? '수정 실패' : '게시 실패',
        isEditMode
          ? `${error instanceof Error ? error.message : '룩 수정에 실패했어요.'}`
          : `${error instanceof Error ? error.message : '룩톡 게시에 실패했어요.'}\n작성 내용은 임시저장돼 있어요.`,
        [
          {style: 'cancel', text: '닫기'},
          {onPress: () => void handleSubmit(), text: '다시 시도'},
        ],
      );
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      setSubmitLabel(null);
    }
  };
  if (isEditMode && isHydrating) {
    return (
      <RNView style={[styles.screen, styles.stateScreen]}>
        <ActivityIndicator color={colors.textPrimary} size="small" />
        <Text style={styles.stateText}>룩을 불러오는 중...</Text>
      </RNView>
    );
  }

  if (isEditMode && hasLoadError) {
    return (
      <RNView style={[styles.screen, styles.stateScreen]}>
        <Text style={styles.stateTitle}>룩을 불러오지 못했어요</Text>
        <Pressable
          accessibilityLabel="다시 시도"
          accessibilityRole="button"
          onPress={() => void loadEditThread()}
          style={({pressed}) => [styles.retryButton, pressed && styles.pressed]}>
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
      </RNView>
    );
  }
  return (
    <RNView style={styles.screen}>
      <RNView style={styles.dotsBar}>
        <PaginationDots activeIndex={activeSection} count={formSections.length} />
      </RNView>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xxl},
        ]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}>
        {showDraftBanner ? (
        <XStack style={styles.draftBanner}>
          <Text style={styles.draftBannerText}>임시저장된 글을 복원했어요</Text>
          <XStack style={styles.draftBannerActions}>
            <Pressable
              accessibilityLabel="임시저장 삭제하고 새로 쓰기"
              accessibilityRole="button"
              onPress={handleDiscardDraft}
              style={({pressed}) => pressed && styles.pressed}>
              <Text style={styles.draftBannerAction}>새로 쓰기</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="배너 닫기"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setShowDraftBanner(false)}
              style={({pressed}) => pressed && styles.pressed}>
              <X color={communityColors.accent} size={iconSize.xs} strokeWidth={2.2} />
            </Pressable>
          </XStack>
        </XStack>
      ) : null}

        <RNView onLayout={event => {
          formOffsetRef.current = event.nativeEvent.layout.y;
        }}>
          <CreateThreadForm
            errors={errors}
            images={images}
            isSubmitting={isSubmitting}
            categoryHelpText="글 종류는 게시 후 변경할 수 없어요."
            categoryLocked={isEditMode}
            submitLabel={submitLabel ?? undefined}
            submitText={isEditMode ? '수정 완료' : undefined}
            values={values}
            onChange={handleValuesChange}
            onClearImages={() => setImages([])}
            onPickImages={handlePickImages}
            onPickSlotImage={handlePickSlotImage}
            onRemoveImage={index => setImages(current => current.filter((_, i) => i !== index))}
            onSectionLayout={(sectionIndex, y) => {
              sectionOffsetsRef.current[sectionIndex] = y;
            }}
            onSubmit={handleSubmit}
            onSwapSlots={handleSwapSlots}
          />
        </RNView>
      </ScrollView>

      <ReportPickerModal
        reports={pickerReports}
        onClose={() => setPickerReports(null)}
        onSelect={report => {
          applyReportToSlots(report);
          setPickerReports(null);
        }}
      />
    </RNView>
  );
}

const styles = StyleSheet.create({
  dotsBar: {
    backgroundColor: colors.background,
    paddingBottom: spacing.sm,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  stateScreen: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  stateText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  scrollContent: {
    gap: spacing.xxl,
    paddingHorizontal: spacing.screenX,
  },
  draftBanner: {
    alignItems: 'center',
    backgroundColor: communityColors.accentSoft,
    borderRadius: radius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  draftBannerAction: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textDecorationLine: 'underline',
  },
  draftBannerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  draftBannerText: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  retryButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  retryText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  pressed: {
    opacity: 0.72,
  },
});
