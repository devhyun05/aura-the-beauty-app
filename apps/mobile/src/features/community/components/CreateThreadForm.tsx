import {useState} from 'react';
import {ActivityIndicator, Image, Pressable, StyleSheet, TextInput} from 'react-native';
import {ArrowLeftRight, ImagePlus, Trash2, X} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, communityColors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {CommunityDifficulty, WritableCommunityCategory} from '../types';
import {writableCommunityCategories} from '../types';
import {difficultyLabels} from '../utils/format';

export type CommunityCreateImage = {
  fileName?: string | null;
  height?: number | null;
  id: string;
  mimeType?: string | null;
  uri: string;
  width?: number | null;
};

export type CreateThreadFormValues = {
  body: string;
  category: WritableCommunityCategory;
  difficulty: CommunityDifficulty | null;
  durationMinutes: number | null;
  moodTags: string[];
  productBase: string;
  productCheek: string;
  productEye: string;
  productLip: string;
  situationTags: string[];
  title: string;
};

export type CreateFormSection = 'photo' | 'info' | 'tags' | 'products';

/**
 * 카테고리별 섹션 구성 (진행 도트 수의 단일 소스).
 * - 룩북/비포애프터: 사진 → 룩 정보 → 무드·상황(난이도/시간 포함) → 제품 (4)
 * - 질문: 사진 → 질문 내용(+고민 태그) (2) — 레시피 필드는 질문에 무의미하므로 숨김
 * - 제품조합: 사진 → 제품(②로 승격, 필수) → 조합 정보(+태그) (3)
 */
export function getCreateFormSections(category: WritableCommunityCategory): CreateFormSection[] {
  if (category === 'question') {
    return ['photo', 'info'];
  }

  if (category === 'product_combo') {
    return ['photo', 'products', 'info'];
  }

  return ['photo', 'info', 'tags', 'products'];
}

const titlePlaceholders: Record<WritableCommunityCategory, string> = {
  before_after: '어떤 변화인지 제목으로 알려주세요.',
  lookbook: '제목을 입력해 주세요.',
  product_combo: '조합 이름 (예: 물복숭아 조합)',
  question: '무엇이 궁금한가요? (예: 이 톤에 맞는 립)',
};

const bodyPlaceholders: Record<WritableCommunityCategory, string> = {
  before_after: '무엇을 바꿨는지 적어주세요. (선택)',
  lookbook: '룩 설명, 사용 팁, 따라 하기 포인트를 적어주세요. (선택)',
  product_combo: '조합 순서나 발색 팁을 적어주세요. (선택)',
  question: '어디가 고민인지 콕 집어주세요. (선택)',
};

const photoGuides: Partial<Record<WritableCommunityCategory, string>> = {
  before_after: '비포와 같은 각도·조명이면 변화가 잘 보여요.',
  product_combo: '발색 컷이나 제품 나열 컷이 좋아요.',
  question: '궁금한 부위가 잘 보이게 1장이면 충분해요.',
};

const difficulties: Array<{id: CommunityDifficulty; label: string}> = [
  {id: 'easy', label: '쉬움'},
  {id: 'medium', label: '보통'},
  {id: 'hard', label: '어려움'},
];
const durations = [5, 10, 15, 20];

export function CreateThreadForm({
  errors,
  images,
  isSubmitting,
  onChange,
  onClearImages,
  onPickImages,
  onRemoveImage,
  onPickSlotImage,
  onSectionLayout,
  onSubmit,
  onSwapSlots,
  categoryHelpText,
  categoryLocked = false,
  submitLabel,
  submitText,
  values,
}: {
  errors: string[];
  images: CommunityCreateImage[];
  isSubmitting: boolean;
  onChange: (values: CreateThreadFormValues) => void;
  onClearImages: () => void;
  onPickImages: () => void;
  /** 비포애프터 전용 — 슬롯(0=BEFORE, 1=AFTER) 단위 사진 선택. */
  onPickSlotImage?: (slot: 0 | 1) => void;
  onRemoveImage: (index: number) => void;
  onSectionLayout?: (sectionIndex: number, y: number) => void;
  onSubmit: () => void;
  /** 비포애프터 전용 — BEFORE/AFTER 스왑. */
  onSwapSlots?: () => void;
  categoryHelpText?: string;
  categoryLocked?: boolean;
  submitLabel?: string;
  submitText?: string;
  values: CreateThreadFormValues;
}) {
  const canSubmit = errors.length === 0 && !isSubmitting;
  const sections = getCreateFormSections(values.category);
  const isBeforeAfter = values.category === 'before_after';
  const isQuestion = values.category === 'question';
  const isProductCombo = values.category === 'product_combo';
  const photoGuide = photoGuides[values.category];

  const renderPhotoSection = (step: string) => (
    <>
      <SectionTitle step={step} title="사진" />
      {photoGuide ? <Text style={styles.sectionGuide}>{photoGuide}</Text> : null}
      {isBeforeAfter ? (
        <XStack style={styles.slotRow}>
          <SlotTile
            image={images[0]}
            label="BEFORE · 피드 커버"
            onPress={() => onPickSlotImage?.(0)}
          />
          <Pressable
            accessibilityLabel="비포와 애프터 사진 순서 바꾸기"
            accessibilityRole="button"
            disabled={images.length < 2}
            onPress={onSwapSlots}
            style={({pressed}) => [
              styles.swapButton,
              images.length < 2 && styles.swapDisabled,
              pressed && styles.pressed,
            ]}>
            <ArrowLeftRight color={colors.textPrimary} size={iconSize.xs} strokeWidth={2.2} />
          </Pressable>
          <SlotTile
            image={images[1]}
            label="AFTER"
            onPress={() => onPickSlotImage?.(1)}
          />
        </XStack>
      ) : (
        <Pressable
          accessibilityLabel="룩 사진 선택"
          accessibilityRole="button"
          onPress={onPickImages}
          style={({pressed}) => [styles.photoPicker, pressed && styles.pressed]}>
          {images.length > 0 ? (
            <YStack style={styles.previewStack}>
              <XStack style={styles.photoHeaderRow}>
                <Text style={styles.optionalMark}>사진 {images.length}/4 · 탭하면 추가</Text>
                <Pressable
                  accessibilityLabel="사진 전체 빼기"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={onClearImages}
                  style={({pressed}) => pressed && styles.pressed}>
                  <Text style={styles.clearAllText}>전체 빼기</Text>
                </Pressable>
              </XStack>
              <Image resizeMode="cover" source={{uri: images[0].uri}} style={styles.coverPreview} />
              <XStack style={styles.thumbnailRail}>
                {images.slice(0, 4).map((image, index) => (
                  <YStack key={image.id} style={styles.thumbnailWrap}>
                    <Image resizeMode="cover" source={{uri: image.uri}} style={styles.thumbnailImage} />
                    {index === 0 ? <Text style={styles.coverLabel}>커버</Text> : null}
                    <Pressable
                      accessibilityLabel={`${index + 1}번째 사진 빼기`}
                      accessibilityRole="button"
                      hitSlop={6}
                      onPress={() => onRemoveImage(index)}
                      style={({pressed}) => [styles.thumbnailRemove, pressed && styles.pressed]}>
                      <Trash2 color={colors.white} size={iconSize.xs - 4} strokeWidth={2.2} />
                    </Pressable>
                  </YStack>
                ))}
                {images.length < 4 ? (
                  <YStack style={styles.addPhotoSlot}>
                    <ImagePlus color={colors.textSecondary} size={iconSize.sm} strokeWidth={2} />
                    <Text style={styles.addPhotoText}>{4 - images.length}장 더</Text>
                  </YStack>
                ) : null}
              </XStack>
            </YStack>
          ) : (
            <YStack style={styles.emptyPhotoCopy}>
              <ImagePlus color={colors.textPrimary} size={iconSize.lg} strokeWidth={2.1} />
              <Text style={styles.photoPickerTitle}>대표 사진을 먼저 골라주세요.</Text>
              <Text style={styles.photoPickerSubtext}>최대 4장까지, 첫 사진이 피드 커버로 보여요.</Text>
            </YStack>
          )}
        </Pressable>
      )}
    </>
  );

  const renderInfoSection = (step: string) => (
    <>
      <SectionTitle step={step} title={isQuestion ? '질문 내용' : isProductCombo ? '조합 정보' : '룩 정보'} />
      <TextInput
        maxLength={30}
        onChangeText={title => onChange({...values, title})}
        placeholder={titlePlaceholders[values.category]}
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
        value={values.title}
      />
      <Text style={styles.counter}>{values.title.length}/30</Text>
      <TextInput
        multiline
        onChangeText={body => onChange({...values, body})}
        placeholder={bodyPlaceholders[values.category]}
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, styles.bodyInput]}
        value={values.body}
      />
      {/* 질문·제품조합은 태그를 별도 섹션 없이 여기에 압축한다. */}
      {isQuestion || isProductCombo ? (
        <>
          <TagInput
            label={isQuestion ? '고민 태그' : '무드 태그'}
            placeholder="예: 글로우, 물광, 클린걸"
            tags={values.moodTags}
            onChange={moodTags => onChange({...values, moodTags})}
          />
          <TagInput
            label="상황 태그"
            placeholder="예: 하객룩, 데일리, 출근"
            tags={values.situationTags}
            onChange={situationTags => onChange({...values, situationTags})}
          />
        </>
      ) : null}
    </>
  );

  const renderTagsSection = (step: string) => (
    <>
      <SectionTitle step={step} title="무드와 상황" />
      <TagInput
        label="무드 태그"
        placeholder="예: 글로우, 물광, 클린걸"
        tags={values.moodTags}
        onChange={moodTags => onChange({...values, moodTags})}
      />
      <TagInput
        label="상황 태그"
        placeholder="예: 하객룩, 데일리, 출근"
        tags={values.situationTags}
        onChange={situationTags => onChange({...values, situationTags})}
      />
      <Text style={styles.fieldLabel}>난이도 · 소요시간 <Text style={styles.optionalMark}>선택</Text></Text>
      <ChipRow
        items={difficulties}
        selected={values.difficulty}
        onSelect={difficulty => onChange({
          ...values,
          difficulty: values.difficulty === difficulty ? null : difficulty,
        })}
      />
      <ChipRow
        items={durations.map(duration => ({id: duration, label: `${duration}분`}))}
        selected={values.durationMinutes}
        onSelect={durationMinutes => onChange({
          ...values,
          durationMinutes: values.durationMinutes === durationMinutes ? null : durationMinutes,
        })}
      />
    </>
  );

  const renderProductsSection = (step: string) => (
    <>
      <SectionTitle
        optional={!isProductCombo}
        step={step}
        title="사용 제품"
        badge={isProductCombo ? '필수 · 2개 이상' : undefined}
      />
      <ProductInput label="베이스" value={values.productBase} onChangeText={productBase => onChange({...values, productBase})} />
      <ProductInput label="아이" value={values.productEye} onChangeText={productEye => onChange({...values, productEye})} />
      <ProductInput label="치크" value={values.productCheek} onChangeText={productCheek => onChange({...values, productCheek})} />
      <ProductInput label="립" value={values.productLip} onChangeText={productLip => onChange({...values, productLip})} />
    </>
  );

  return (
    <YStack style={styles.form}>
      {/* 카테고리가 폼 전체의 모양(섹션 구성·검증)을 결정하므로 최우선으로 고른다. */}
      <YStack style={styles.categoryBlock}>
        <Text style={styles.fieldLabel}>어떤 글인가요?</Text>
        {categoryLocked ? (
          <>
            <XStack style={styles.lockedCategoryPill}>
              <Text style={styles.lockedCategoryText}>
                {writableCommunityCategories.find(category => category.id === values.category)?.label ?? values.category}
              </Text>
            </XStack>
            {categoryHelpText ? <Text style={styles.lockedCategoryHint}>{categoryHelpText}</Text> : null}
          </>
        ) : (
          <ChipRow
            items={writableCommunityCategories}
            selected={values.category}
            onSelect={category => onChange({...values, category})}
          />
        )}
      </YStack>

      {sections.map((section, index) => (
        <YStack
          key={section}
          style={styles.section}
          onLayout={event => onSectionLayout?.(index, event.nativeEvent.layout.y)}>
          {section === 'photo' ? renderPhotoSection(String(index + 1)) : null}
          {section === 'info' ? renderInfoSection(String(index + 1)) : null}
          {section === 'tags' ? renderTagsSection(String(index + 1)) : null}
          {section === 'products' ? renderProductsSection(String(index + 1)) : null}
        </YStack>
      ))}

      {/* 스펙: 실제 피드 카드 미리보기 — 크롭·제목 잘림·레시피 스트립 숨김 규칙 사전 확인 */}
      {images.length > 0 || values.title.trim() ? (
        <YStack style={styles.section}>
          <Text style={styles.fieldLabel}>피드 미리보기</Text>
          <FeedPreviewCard images={images} values={values} />
        </YStack>
      ) : null}

      {/* 스펙: 게시 버튼 위 미충족 사유 1줄 */}
      {errors.length > 0 ? (
        <Text style={styles.reasonText}>{errors[0]}</Text>
      ) : null}

      <Pressable
        accessibilityLabel={submitText ?? "룩톡 게시"}
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={onSubmit}
        style={({pressed}) => [
          styles.submitButton,
          !canSubmit && styles.disabledSubmit,
          pressed && styles.pressed,
        ]}>
        {isSubmitting ? <ActivityIndicator color={colors.white} size="small" /> : null}
        <Text style={styles.submitText}>
          {isSubmitting ? submitLabel ?? '게시 중...' : submitText ?? '룩톡에 게시하기'}
        </Text>
      </Pressable>
    </YStack>
  );
}

function SlotTile({
  image,
  label,
  onPress,
}: {
  image?: CommunityCreateImage;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} 사진 선택`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.slotTile, pressed && styles.pressed]}>
      {image ? (
        <Image resizeMode="cover" source={{uri: image.uri}} style={styles.slotImage} />
      ) : (
        <YStack style={styles.slotEmpty}>
          <ImagePlus color={colors.textSecondary} size={iconSize.md} strokeWidth={2} />
        </YStack>
      )}
      <Text style={styles.slotLabel}>{label}</Text>
    </Pressable>
  );
}

function FeedPreviewCard({
  images,
  values,
}: {
  images: CommunityCreateImage[];
  values: CreateThreadFormValues;
}) {
  const metaParts: string[] = [];

  if (values.durationMinutes != null) {
    metaParts.push(`${values.durationMinutes}분`);
  }

  if (values.difficulty) {
    metaParts.push(difficultyLabels[values.difficulty]);
  }

  const previewMeta = metaParts.length > 0
    ? `${metaParts.join(' · ')} — 카드에 이렇게 보여요`
    : values.category === 'question'
      ? '답변 수가 표시되는 질문 카드로 보여요'
      : values.category === 'before_after'
        ? '상세에서 비포·애프터 슬라이더로 보여요'
        : '난이도·시간을 고르면 레시피 스트립이 붙어요';

  return (
    <XStack style={styles.previewCard}>
      {images[0] ? (
        <Image resizeMode="cover" source={{uri: images[0].uri}} style={styles.previewThumb} />
      ) : (
        <View style={[styles.previewThumb, styles.previewThumbEmpty]} />
      )}
      <YStack style={styles.previewCopy}>
        <Text numberOfLines={1} style={styles.previewTitle}>
          {values.title.trim() || '제목이 여기에 보여요'}
        </Text>
        <Text numberOfLines={2} style={styles.previewMeta}>{previewMeta}</Text>
      </YStack>
    </XStack>
  );
}

function SectionTitle({
  badge,
  optional = false,
  step,
  title,
}: {
  badge?: string;
  optional?: boolean;
  step: string;
  title: string;
}) {
  return (
    <XStack style={styles.sectionTitleRow}>
      <Text style={styles.step}>{step}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      {optional ? <Text style={styles.optionalMark}>선택</Text> : null}
      {badge ? <Text style={styles.requiredBadge}>{badge}</Text> : null}
    </XStack>
  );
}

function ChipRow<T extends string | number>({
  items,
  onSelect,
  selected,
}: {
  items: Array<{id: T; label: string}>;
  onSelect: (id: T) => void;
  selected: T | null;
}) {
  return (
    <XStack style={styles.chipRow}>
      {items.map(item => {
        const active = item.id === selected;
        return (
          <Pressable
            key={String(item.id)}
            onPress={() => onSelect(item.id)}
            style={({pressed}) => [styles.choiceChip, active && styles.activeChip, pressed && styles.pressed]}>
            <Text style={[styles.choiceText, active && styles.activeChoiceText]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/**
 * 자유 입력 태그 — #글로우처럼 직접 쓰고 스페이스/쉼표/엔터로 추가한다.
 * 어떤 태그를 쓸지 모를 수 있으니 placeholder로 예시를 옅게 보여준다. 최대 6개.
 */
function TagInput({
  label,
  onChange,
  placeholder,
  tags,
}: {
  label: string;
  onChange: (tags: string[]) => void;
  placeholder: string;
  tags: string[];
}) {
  const [draft, setDraft] = useState('');

  const commitDraft = (rawValue: string) => {
    const cleaned = rawValue.replace(/^#+/, '').trim();

    if (cleaned && !tags.includes(cleaned) && tags.length < 6) {
      onChange([...tags, cleaned]);
    }

    setDraft('');
  };

  return (
    <YStack style={styles.tagInputGroup}>
      <Text style={styles.fieldLabel}>
        {label} <Text style={styles.optionalMark}>선택 · 최대 6개</Text>
      </Text>
      {tags.length > 0 ? (
        <XStack style={styles.chipRow}>
          {tags.map(tag => (
            <XStack key={tag} style={[styles.choiceChip, styles.activeChip, styles.tagChip]}>
              <Text style={[styles.choiceText, styles.activeChoiceText]}>#{tag}</Text>
              <Pressable
                accessibilityLabel={`${tag} 태그 빼기`}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => onChange(tags.filter(current => current !== tag))}
                style={({pressed}) => pressed && styles.pressed}>
                <X color={colors.white} size={iconSize.xs - 4} strokeWidth={2.4} />
              </Pressable>
            </XStack>
          ))}
        </XStack>
      ) : null}
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={false}
        editable={tags.length < 6}
        placeholder={tags.length >= 6 ? '최대 6개까지예요' : placeholder}
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, draft.startsWith('#') && styles.tagInputActive]}
        value={draft}
        onChangeText={text => {
          // 스페이스·쉼표를 치는 순간 태그로 확정
          if (/[ ,]$/.test(text)) {
            commitDraft(text.slice(0, -1));
            return;
          }
          setDraft(text);
        }}
        onSubmitEditing={() => commitDraft(draft)}
      />
      {/* SNS식 실시간 태그 제안 — 입력 중이면 "#___ 태그 추가" 칩이 떠서 탭으로 확정 */}
      {draft.replace(/^#+/, '').trim() ? (
        <Pressable
          accessibilityLabel="입력한 태그 추가"
          accessibilityRole="button"
          onPress={() => commitDraft(draft)}
          style={({pressed}) => [styles.tagSuggest, pressed && styles.pressed]}>
          <Text style={styles.tagSuggestText}>
            #{draft.replace(/^#+/, '').trim()} <Text style={styles.tagSuggestHint}>태그 추가</Text>
          </Text>
        </Pressable>
      ) : null}
    </YStack>
  );
}

function ProductInput({label, onChangeText, value}: {label: string; onChangeText: (value: string) => void; value: string}) {
  return (
    <YStack style={styles.productInputGroup}>
      <Text style={styles.productLabel}>{label}</Text>
      <TextInput
        onChangeText={onChangeText}
        placeholder="예: 비글로우(21호), 워터뱅크 프라이머"
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
        value={value}
      />
    </YStack>
  );
}

const styles = StyleSheet.create({
  activeChoiceText: {
    color: colors.white,
  },
  activeChip: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  addPhotoSlot: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: spacing.xs,
    height: 78,
    justifyContent: 'center',
    width: 64,
  },
  addPhotoText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  bodyInput: {
    minHeight: 128,
    textAlignVertical: 'top',
  },
  categoryBlock: {
    gap: spacing.sm,
  },
  lockedCategoryHint: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  lockedCategoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  lockedCategoryText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  clearAllText: {
    color: colors.danger,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  photoHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tagChip: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  tagInputActive: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
  },
  tagInputGroup: {
    gap: spacing.sm,
  },
  tagSuggest: {
    alignSelf: 'flex-start',
    backgroundColor: communityColors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  tagSuggestHint: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
  },
  tagSuggestText: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  thumbnailRemove: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 17, 17, 0.62)',
    borderRadius: radius.pill,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 3,
    top: 3,
    width: 22,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choiceChip: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: spacing.md,
  },
  choiceText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  counter: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'right',
  },
  coverLabel: {
    backgroundColor: 'rgba(17, 17, 17, 0.70)',
    borderRadius: radius.pill,
    bottom: spacing.xs,
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    left: spacing.xs,
    lineHeight: typography.lineHeight.xs,
    paddingHorizontal: spacing.xs,
    position: 'absolute',
  },
  coverPreview: {
    aspectRatio: 4 / 5,
    borderRadius: radius.sm,
    width: '100%',
  },
  disabledSubmit: {
    opacity: 0.36,
  },
  emptyPhotoCopy: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  form: {
    gap: spacing.xl,
  },
  lockedPhotoEmpty: {
    aspectRatio: 4 / 5,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    width: 74,
  },
  lockedPhotoPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  lockedPhotoRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  lockedPhotoText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  lockedPhotoThumb: {
    height: 92,
    width: 74,
  },
  lockedPhotoThumbWrap: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionalMark: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  photoPicker: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 188,
    overflow: 'hidden',
    padding: spacing.md,
    ...shadows.soft,
  },
  photoPickerSubtext: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  photoPickerTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
    transform: [{scale: 0.99}],
  },
  previewCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  previewCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  previewMeta: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  previewThumb: {
    borderRadius: radius.sm,
    height: 70,
    width: 56,
  },
  previewThumbEmpty: {
    backgroundColor: colors.surfaceMuted,
  },
  previewTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  previewStack: {
    gap: spacing.sm,
  },
  productInputGroup: {
    gap: spacing.xs,
  },
  productLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  reasonText: {
    color: colors.danger,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  requiredBadge: {
    backgroundColor: communityColors.accentSoft,
    borderRadius: radius.pill,
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  section: {
    gap: spacing.md,
  },
  sectionGuide: {
    backgroundColor: communityColors.accentSoft,
    borderRadius: radius.md,
    color: communityColors.accent,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  slotEmpty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  slotImage: {
    height: '100%',
    width: '100%',
  },
  slotLabel: {
    backgroundColor: 'rgba(17, 17, 17, 0.55)',
    borderRadius: radius.pill,
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    left: spacing.sm,
    lineHeight: typography.lineHeight.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    position: 'absolute',
    top: spacing.sm,
  },
  slotRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  slotTile: {
    aspectRatio: 4 / 5,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  step: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    height: 24,
    lineHeight: 24,
    textAlign: 'center',
    width: 24,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
  },
  submitText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  swapButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  swapDisabled: {
    opacity: 0.4,
  },
  thumbnailImage: {
    height: 78,
    width: 64,
  },
  thumbnailRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  thumbnailWrap: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
});
