import React, {useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {useReducedMotion} from 'react-native-reanimated';
import {Check, Download, Images, Share2, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  OptionalViewShot,
  type OptionalViewShotRef,
} from '../../../shared/ui/OptionalViewShot';
import type {ReportData} from '../reportTypes';
import {color, font, radius} from '../reportTokens';
import {
  captureReportImages,
  cleanupReportShareImages,
  DEFAULT_REPORT_SHARE_PRIVACY,
  getReportCaptureTitle,
  getShareErrorMessage,
  saveReportImagesToLibrary,
  shareReportImagesWithSystemSheet,
  type ReportShareFormat,
  type ReportSharePrivacy,
} from '../services/reportImageShare';

type FaceReportShareSheetProps = {
  data: ReportData;
  onClose: () => void;
  profileName?: string;
  visible: boolean;
};

type ShareCardKind =
  | 'summary'
  | 'face'
  | 'color-skin'
  | 'style'
  | 'recommendation'
  | 'body';

const FORMAT_LABELS: Record<ReportShareFormat, {label: string; detail: string}> = {
  summary: {label: '피드', detail: '4:5 · 1장'},
  story: {label: '스토리', detail: '9:16 · 1장'},
  full: {label: '전체', detail: '카드 묶음'},
};

const SHARE_CAPTURE_OPTIONS = {
  format: 'jpg',
  quality: 0.95,
  result: 'tmpfile',
} as const;

function getCardCopy(data: ReportData, kind: ShareCardKind) {
  const highlights = data.s1.cards.slice(0, 4).map(card => `${card.label} · ${card.value}`);
  switch (kind) {
    case 'summary':
      return {
        eyebrow: 'MY AURA REPORT',
        title: data.s1.headline,
        description: data.s1.body,
        items: highlights,
      };
    case 'face':
      return {
        eyebrow: '02 · FACE',
        title: data.s2?.title ?? data.s3?.title ?? '나의 얼굴 특징',
        description:
          data.s2?.paragraph ??
          data.s6?.paragraph ??
          '얼굴의 비율과 이목구비, 전체 인상을 함께 살펴봤어요.',
        items: [
          ...(data.s3?.cards.slice(0, 3).map(card => card.regionTitle) ?? []),
          ...(data.s6?.keywords.slice(0, 2) ?? []),
        ],
      };
    case 'color-skin':
      return {
        eyebrow: '03 · COLOR & SKIN',
        title: data.s4?.season.headline ?? data.s8?.title ?? '컬러와 피부',
        description:
          data.s4?.sub ??
          data.s8?.sub ??
          '나에게 어울리는 색과 피부 관찰 결과를 한 장에 정리했어요.',
        items: [
          ...(data.s4?.drape.goodSwatches.slice(0, 3).map(swatch => swatch.name) ?? []),
          ...(data.s8?.aspects.slice(0, 2).map(aspect => `${aspect.heading} · ${aspect.label}`) ?? []),
        ],
      };
    case 'style':
      return {
        eyebrow: '04 · STYLE',
        title: data.s7?.title ?? '나에게 어울리는 스타일',
        description: '분석 결과를 실제 메이크업과 스타일 선택으로 이어보세요.',
        items: [
          data.s7?.naturalCard.title,
          data.s7?.glamCard.title,
        ].filter((item): item is string => Boolean(item)),
      };
    case 'body':
      return {
        eyebrow: 'APPENDIX · BODY',
        title: data.s5?.title ?? '체형 스타일 가이드',
        description: data.s5?.sub ?? '설문을 바탕으로 체형 스타일 팁을 정리했어요.',
        items: [
          data.s5 ? `${data.s5.silhouetteLabel} · ${data.s5.silhouetteValue}` : null,
          data.s5 ? `${data.s5.skeletonLabel} · ${data.s5.skeletonValue}` : null,
          ...(data.s5?.doItems.slice(0, 2) ?? []),
        ].filter((item): item is string => Boolean(item)),
      };
    case 'recommendation':
      return {
        eyebrow: 'NEXT STEP',
        title: data.footer.cta,
        description: '내 분석을 바탕으로 어울리는 메이크업을 바로 확인해 보세요.',
        items: ['얼굴 특징 기반', '퍼스널 컬러 반영', '피부 관찰 결과 반영'],
      };
  }
}

function ReportShareCard({
  data,
  kind,
  privacy,
  profileName,
  story = false,
}: {
  data: ReportData;
  kind: ShareCardKind;
  privacy: ReportSharePrivacy;
  profileName?: string;
  story?: boolean;
}) {
  const copy = getCardCopy(data, kind);
  const photoUri = privacy.includePhoto ? data.s1.photo.uri : undefined;
  const content = (
    <View style={[styles.captureContent, story ? styles.captureContentStory : null]}>
      <View style={styles.captureBrandRow}>
        <Text style={styles.captureBrand}>AURA</Text>
        <Text style={styles.capturePage}>{copy.eyebrow}</Text>
      </View>
      <View style={styles.captureCopy}>
        {privacy.includeName && profileName ? (
          <Text style={styles.captureName}>{profileName}님의 분석</Text>
        ) : null}
        <Text numberOfLines={4} style={[styles.captureTitle, story ? styles.captureTitleStory : null]}>
          {copy.title}
        </Text>
        <Text numberOfLines={4} style={styles.captureDescription}>
          {copy.description}
        </Text>
      </View>
      <View style={styles.captureItems}>
        {copy.items.slice(0, story ? 5 : 4).map((item, index) => (
          <View key={`${item}-${index}`} style={styles.captureItem}>
            <View style={styles.captureCheck}>
              <Check color={color.white} size={11} strokeWidth={3} />
            </View>
            <Text numberOfLines={2} style={styles.captureItemText}>{item}</Text>
          </View>
        ))}
      </View>
      <View style={styles.captureFooter}>
        <Text style={styles.captureFooterText}>YOUR BEAUTY, DECODED</Text>
        {privacy.includeDate ? (
          <Text style={styles.captureFooterText}>{data.s1.dateLine}</Text>
        ) : null}
      </View>
    </View>
  );

  if (!photoUri) {
    return (
      <View style={[styles.captureCard, story ? styles.captureCardStory : null]}>
        <View style={styles.captureAuraOne} />
        <View style={styles.captureAuraTwo} />
        {content}
      </View>
    );
  }

  return (
    <ImageBackground
      blurRadius={privacy.blurPhotoBackground ? 22 : 0}
      resizeMode="cover"
      source={{uri: photoUri}}
      style={[styles.captureCard, story ? styles.captureCardStory : null]}>
      <View style={styles.capturePhotoScrim} />
      {content}
    </ImageBackground>
  );
}

function PrivacyRow({
  disabled,
  label,
  onValueChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View style={[styles.privacyRow, disabled ? styles.privacyRowDisabled : null]}>
      <Text style={styles.privacyLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{false: '#CFDADD', true: color.accentDeep}}
        value={value}
      />
    </View>
  );
}

export function FaceReportShareSheet({
  data,
  onClose,
  profileName,
  visible,
}: FaceReportShareSheetProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [format, setFormat] = useState<ReportShareFormat>('summary');
  const [privacy, setPrivacy] = useState(DEFAULT_REPORT_SHARE_PRIVACY);
  const [busyTarget, setBusyTarget] = useState<'save' | 'share' | null>(null);

  const summaryRef = useRef<OptionalViewShotRef | null>(null);
  const storyRef = useRef<OptionalViewShotRef | null>(null);
  const faceRef = useRef<OptionalViewShotRef | null>(null);
  const colorSkinRef = useRef<OptionalViewShotRef | null>(null);
  const styleRef = useRef<OptionalViewShotRef | null>(null);
  const recommendationRef = useRef<OptionalViewShotRef | null>(null);
  const bodyRef = useRef<OptionalViewShotRef | null>(null);

  const captureRefs = useMemo(() => {
    if (format === 'summary') return [summaryRef];
    if (format === 'story') return [storyRef];
    return [
      summaryRef,
      faceRef,
      colorSkinRef,
      styleRef,
      recommendationRef,
      ...(data.s5 ? [bodyRef] : []),
    ];
  }, [data.s5, format]);

  const runExport = async (target: 'save' | 'share') => {
    if (busyTarget) return;
    setBusyTarget(target);
    const imageUris: string[] = [];
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      imageUris.push(...await captureReportImages(captureRefs));
      if (target === 'save') {
        await saveReportImagesToLibrary(imageUris);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('저장했어요', `${imageUris.length}장의 보고서 이미지를 사진에 저장했어요.`);
      } else {
        await shareReportImagesWithSystemSheet({
          imageUris,
          title: getReportCaptureTitle(
            privacy.includeName ? profileName : undefined,
          ),
        });
      }
    } catch (error) {
      console.info('[aura:analysis] report-export:failed', {
        format,
        message: error instanceof Error ? error.message : String(error),
        target,
      });
      Alert.alert(target === 'save' ? '저장하지 못했어요' : '공유하지 못했어요', getShareErrorMessage(error));
    } finally {
      cleanupReportShareImages(imageUris);
      setBusyTarget(null);
    }
  };

  const setPrivacyValue = (key: keyof ReportSharePrivacy, value: boolean) => {
    void Haptics.selectionAsync();
    setPrivacy(current => ({...current, [key]: value}));
  };

  return (
    <Modal
      animationType={reduceMotion ? 'fade' : 'slide'}
      onRequestClose={busyTarget ? undefined : onClose}
      transparent
      visible={visible}>
      <View accessibilityViewIsModal style={styles.backdrop}>
        <Pressable
          accessibilityLabel="공유 설정 닫기"
          disabled={Boolean(busyTarget)}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, 16)}]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>보고서 공유</Text>
              <Text style={styles.sheetDescription}>공유 전 포함할 정보를 직접 선택하세요.</Text>
            </View>
            <Pressable
              accessibilityLabel="공유 설정 닫기"
              accessibilityRole="button"
              disabled={Boolean(busyTarget)}
              onPress={onClose}
              style={({pressed}) => [styles.closeButton, pressed ? styles.buttonPressed : null]}>
              <X color={color.ink} size={19} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.sheetScroll}
            showsVerticalScrollIndicator={false}>
            <View style={styles.formatTabs}>
              {(Object.keys(FORMAT_LABELS) as ReportShareFormat[]).map(item => {
                const selected = format === item;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{selected}}
                    key={item}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setFormat(item);
                    }}
                    style={({pressed}) => [
                      styles.formatTab,
                      selected ? styles.formatTabSelected : null,
                      pressed ? styles.buttonPressed : null,
                    ]}>
                    <Text style={[styles.formatLabel, selected ? styles.formatLabelSelected : null]}>
                      {FORMAT_LABELS[item].label}
                    </Text>
                    <Text style={[styles.formatDetail, selected ? styles.formatDetailSelected : null]}>
                      {item === 'full' && data.s5 ? '6장' : FORMAT_LABELS[item].detail}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.preview}>
              <View style={[styles.previewCard, format === 'story' ? styles.previewCardStory : null]}>
                <Text style={styles.previewBrand}>AURA</Text>
                <Text numberOfLines={3} style={styles.previewTitle}>{data.s1.headline}</Text>
                <Text style={styles.previewMeta}>
                  {format === 'full'
                    ? `핵심 카드 ${data.s5 ? 6 : 5}장`
                    : FORMAT_LABELS[format].detail}
                </Text>
              </View>
              {format === 'full' ? (
                <>
                  <View style={[styles.previewCard, styles.previewStackOne]} />
                  <View style={[styles.previewCard, styles.previewStackTwo]} />
                </>
              ) : null}
            </View>

            <View style={styles.privacyCard}>
              <Text style={styles.sectionTitle}>개인정보</Text>
              <PrivacyRow
                label="원본 얼굴 사진 포함"
                onValueChange={value => setPrivacyValue('includePhoto', value)}
                value={privacy.includePhoto}
              />
              <PrivacyRow
                disabled={!privacy.includePhoto}
                label="사진 배경 흐림"
                onValueChange={value => setPrivacyValue('blurPhotoBackground', value)}
                value={privacy.blurPhotoBackground}
              />
              <PrivacyRow
                disabled={!profileName}
                label="이름 포함"
                onValueChange={value => setPrivacyValue('includeName', value)}
                value={privacy.includeName}
              />
              <PrivacyRow
                label="분석 날짜 포함"
                onValueChange={value => setPrivacyValue('includeDate', value)}
                value={privacy.includeDate}
              />
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={Boolean(busyTarget)}
              onPress={() => void runExport('save')}
              style={({pressed}) => [styles.secondaryAction, pressed ? styles.buttonPressed : null]}>
              {busyTarget === 'save' ? (
                <ActivityIndicator color={color.ink} size="small" />
              ) : (
                <Download color={color.ink} size={18} />
              )}
              <Text style={styles.secondaryActionText}>사진에 저장</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={Boolean(busyTarget)}
              onPress={() => void runExport('share')}
              style={({pressed}) => [styles.primaryAction, pressed ? styles.buttonPressed : null]}>
              {busyTarget === 'share' ? (
                <ActivityIndicator color={color.white} size="small" />
              ) : format === 'full' ? (
                <Images color={color.white} size={18} />
              ) : (
                <Share2 color={color.white} size={18} />
              )}
              <Text style={styles.primaryActionText}>
                {format === 'full' ? '여러 장 공유' : '공유하기'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View pointerEvents="none" style={styles.captureHost}>
          <OptionalViewShot
            ref={summaryRef}
            options={{...SHARE_CAPTURE_OPTIONS, height: 1350, width: 1080}}>
            <ReportShareCard data={data} kind="summary" privacy={privacy} profileName={profileName} />
          </OptionalViewShot>
          <OptionalViewShot
            ref={storyRef}
            options={{...SHARE_CAPTURE_OPTIONS, height: 1920, width: 1080}}>
            <ReportShareCard data={data} kind="summary" privacy={privacy} profileName={profileName} story />
          </OptionalViewShot>
          {(['face', 'color-skin', 'style', 'recommendation'] as ShareCardKind[]).map(kind => {
            const ref =
              kind === 'face'
                ? faceRef
                : kind === 'color-skin'
                  ? colorSkinRef
                  : kind === 'style'
                    ? styleRef
                    : recommendationRef;
            return (
              <OptionalViewShot
                key={kind}
                ref={ref}
                options={{...SHARE_CAPTURE_OPTIONS, height: 1350, width: 1080}}>
                <ReportShareCard data={data} kind={kind} privacy={privacy} profileName={profileName} />
              </OptionalViewShot>
            );
          })}
          {data.s5 ? (
            <OptionalViewShot
              ref={bodyRef}
              options={{...SHARE_CAPTURE_OPTIONS, height: 1350, width: 1080}}>
              <ReportShareCard data={data} kind="body" privacy={privacy} profileName={profileName} />
            </OptionalViewShot>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  backdrop: {
    backgroundColor: 'rgba(7, 22, 28, 0.42)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{scale: 0.99}],
  },
  captureAuraOne: {
    backgroundColor: 'rgba(113, 184, 205, 0.16)',
    borderRadius: 160,
    height: 300,
    position: 'absolute',
    right: -120,
    top: -80,
    width: 300,
  },
  captureAuraTwo: {
    backgroundColor: 'rgba(218, 192, 151, 0.17)',
    borderRadius: 130,
    bottom: -100,
    height: 260,
    left: -90,
    position: 'absolute',
    width: 260,
  },
  captureBrand: {
    color: color.ink,
    fontFamily: 'Pretendard',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 3,
  },
  captureBrandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  captureCard: {
    backgroundColor: '#F1F6F6',
    height: 450,
    overflow: 'hidden',
    width: 360,
  },
  captureCardStory: {
    height: 640,
  },
  captureCheck: {
    alignItems: 'center',
    backgroundColor: color.accentDeep,
    borderRadius: 14,
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  captureContent: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 29,
  },
  captureContentStory: {
    paddingBottom: 42,
    paddingTop: 40,
  },
  captureCopy: {
    gap: 10,
  },
  captureDescription: {
    ...font(12.5, '500', 1.55),
    color: color.body,
    maxWidth: 290,
  },
  captureFooter: {
    alignItems: 'center',
    borderTopColor: 'rgba(22, 48, 59, 0.18)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  captureFooterText: {
    ...font(8.5, '700', undefined, 0.7),
    color: color.muted,
  },
  captureItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 10,
    minHeight: 42,
    paddingHorizontal: 11,
  },
  captureItemText: {
    ...font(11, '700', 1.35),
    color: color.ink,
    flex: 1,
  },
  captureItems: {
    gap: 7,
  },
  captureName: {
    ...font(11, '800'),
    color: color.accentDeep,
  },
  capturePage: {
    ...font(9, '800', undefined, 1),
    color: color.muted,
  },
  capturePhotoScrim: {
    backgroundColor: 'rgba(241, 246, 246, 0.76)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  captureTitle: {
    color: color.ink,
    fontFamily: 'Pretendard',
    fontSize: 27,
    fontWeight: '800',
    lineHeight: 34,
  },
  captureTitleStory: {
    fontSize: 34,
    lineHeight: 42,
  },
  captureHost: {
    left: -10000,
    position: 'absolute',
    top: 0,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: color.surface2,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  formatDetail: {
    ...font(9.5, '600'),
    color: color.muted,
  },
  formatDetailSelected: {
    color: 'rgba(255,255,255,0.76)',
  },
  formatLabel: {
    ...font(13, '800'),
    color: color.ink,
  },
  formatLabelSelected: {
    color: color.white,
  },
  formatTab: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 54,
  },
  formatTabSelected: {
    backgroundColor: color.accentDeep,
  },
  formatTabs: {
    backgroundColor: color.surface2,
    borderRadius: 17,
    flexDirection: 'row',
    padding: 3,
  },
  preview: {
    alignItems: 'center',
    height: 190,
    justifyContent: 'center',
    position: 'relative',
  },
  previewBrand: {
    color: color.accentDeep,
    fontFamily: 'Pretendard',
    fontSize: 9,
    letterSpacing: 2,
  },
  previewCard: {
    backgroundColor: '#EEF5F6',
    borderColor: 'rgba(22,48,59,0.08)',
    borderRadius: 15,
    borderWidth: 1,
    height: 166,
    justifyContent: 'space-between',
    padding: 15,
    width: 134,
    zIndex: 3,
  },
  previewCardStory: {
    height: 178,
    width: 100,
  },
  previewMeta: {
    ...font(8.5, '700'),
    color: color.muted,
  },
  previewStackOne: {
    position: 'absolute',
    transform: [{rotate: '6deg'}, {translateX: 18}],
    zIndex: 2,
  },
  previewStackTwo: {
    position: 'absolute',
    transform: [{rotate: '-6deg'}, {translateX: -18}],
    zIndex: 1,
  },
  previewTitle: {
    color: color.ink,
    fontFamily: 'Pretendard',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: color.accentDeep,
    borderRadius: radius.lg,
    flex: 1.12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryActionText: {
    ...font(13.5, '800'),
    color: color.white,
  },
  privacyCard: {
    backgroundColor: color.surface2,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  privacyLabel: {
    ...font(13, '700'),
    color: color.ink,
  },
  privacyRow: {
    alignItems: 'center',
    borderBottomColor: color.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  privacyRowDisabled: {
    opacity: 0.4,
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: color.surface2,
    borderRadius: radius.lg,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryActionText: {
    ...font(13, '800'),
    color: color.ink,
  },
  sectionTitle: {
    ...font(11, '800', undefined, 0.8),
    color: color.muted,
    marginBottom: 2,
  },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingTop: 9,
  },
  sheetDescription: {
    ...font(11.5, '400'),
    color: color.muted,
    marginTop: 3,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: color.divider,
    borderRadius: 2,
    height: 4,
    marginBottom: 10,
    width: 42,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  sheetHeaderCopy: {
    flex: 1,
  },
  sheetScroll: {
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetTitle: {
    ...font(20, '800'),
    color: color.ink,
  },
});
