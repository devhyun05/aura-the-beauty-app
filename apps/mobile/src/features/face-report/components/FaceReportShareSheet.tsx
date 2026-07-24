import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {Download, FileText, Images, Share2, ShieldCheck, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import type {
  ReportExportSnapshot,
  ReportScreenScaffoldRef,
} from '../ReportScreenScaffold';
import type {ReportData} from '../reportTypes';
import {color, font, radius, shadow} from '../reportTokens';
import {
  cleanupReportShareImages,
  getReportCaptureTitle,
  getShareErrorMessage,
  requestReportImageSavePermission,
  saveReportImageToLibrary,
  shareReportImagesWithSystemSheet,
  type ReportSaveScope,
} from '../services/reportImageShare';

type FaceReportShareSheetProps = {
  data: ReportData;
  onClose: () => void;
  profileName?: string;
  reportRef: React.RefObject<ReportScreenScaffoldRef | null>;
  visible: boolean;
};

type BusyTarget = 'save' | 'share';

function resolveExportPageIds(
  scope: ReportSaveScope,
  snapshot: ReportExportSnapshot,
): string[] {
  if (scope === 'current') {
    return snapshot.activePageId ? [snapshot.activePageId] : [];
  }
  return snapshot.pages.map(page => page.id);
}

export function FaceReportShareSheet({
  data,
  onClose,
  profileName,
  reportRef,
  visible,
}: FaceReportShareSheetProps) {
  const insets = useSafeAreaInsets();
  const [scope, setScope] = useState<ReportSaveScope>('current');
  const [snapshot, setSnapshot] = useState<ReportExportSnapshot | null>(null);
  const [busyTarget, setBusyTarget] = useState<BusyTarget | null>(null);
  const [progress, setProgress] = useState({completed: 0, total: 0});
  const exportInFlightRef = useRef(false);
  const exportOperationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      exportOperationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      exportOperationRef.current += 1;
      return;
    }
    setScope('current');
    setProgress({completed: 0, total: 0});
    setSnapshot(reportRef.current?.getExportSnapshot() ?? null);
  }, [reportRef, visible]);

  const runExport = async (target: BusyTarget) => {
    if (exportInFlightRef.current) return;

    const controller = reportRef.current;
    const nextSnapshot = controller?.getExportSnapshot() ?? snapshot;
    if (!controller || !nextSnapshot) {
      Alert.alert(
        target === 'save' ? '저장하지 못했어요' : '공유하지 못했어요',
        '실제 보고서 화면이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.',
      );
      return;
    }

    const pageIds = resolveExportPageIds(scope, nextSnapshot);
    if (!pageIds.length) {
      Alert.alert(
        target === 'save' ? '저장하지 못했어요' : '공유하지 못했어요',
        '저장할 실제 보고서 카드를 찾지 못했어요.',
      );
      return;
    }

    exportInFlightRef.current = true;
    const operationId = ++exportOperationRef.current;
    const originalPageId = nextSnapshot.activePageId;
    const imageUris: string[] = [];
    let savedCount = 0;
    setBusyTarget(target);
    setProgress({completed: 0, total: pageIds.length});

    const shouldContinue = () =>
      mountedRef.current &&
      visible &&
      exportOperationRef.current === operationId;

    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (target === 'save') {
        await requestReportImageSavePermission();
      }

      for (let index = 0; index < pageIds.length; index += 1) {
        const imageUri = await controller.capturePage(
          pageIds[index],
          shouldContinue,
        );
        imageUris.push(imageUri);

        if (target === 'save') {
          await saveReportImageToLibrary(imageUri);
          savedCount += 1;
        }
        if (mountedRef.current) {
          setProgress({completed: index + 1, total: pageIds.length});
        }
      }

      if (target === 'share') {
        await shareReportImagesWithSystemSheet({
          imageUris,
          title: getReportCaptureTitle(profileName),
        });
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          '실제 보고서를 저장했어요',
          `${savedCount}장의 보고서 카드를 사진 앱에 저장했어요.`,
        );
      }
    } catch (error) {
      if (!mountedRef.current || exportOperationRef.current !== operationId) {
        return;
      }
      const message =
        target === 'save' && savedCount > 0
          ? `${savedCount}장은 저장했지만 나머지를 완료하지 못했어요.\n${getShareErrorMessage(error)}`
          : getShareErrorMessage(error);
      console.info('[aura:analysis] actual-report-export:failed', {
        completed: target === 'save' ? savedCount : imageUris.length,
        message: error instanceof Error ? error.message : String(error),
        scope,
        target,
        total: pageIds.length,
      });
      Alert.alert(
        target === 'save' ? '저장을 완료하지 못했어요' : '공유하지 못했어요',
        message,
      );
    } finally {
      controller.restorePage(originalPageId);
      cleanupReportShareImages(imageUris);
      exportInFlightRef.current = false;
      if (mountedRef.current) {
        setBusyTarget(null);
      }
    }
  };

  const activePage =
    snapshot?.pages.find(page => page.id === snapshot.activePageId) ?? null;
  const pageCount = snapshot?.pages.length ?? 0;
  const selectedCount = scope === 'current' ? (activePage ? 1 : 0) : pageCount;
  const progressLabel =
    busyTarget && progress.total > 0
      ? `${progress.completed}/${progress.total}`
      : null;

  return (
    <Modal
      animationType="slide"
      onRequestClose={busyTarget ? undefined : onClose}
      transparent
      visible={visible}>
      <View style={styles.modal}>
        <Pressable
          accessibilityLabel="보고서 저장 창 닫기"
          disabled={Boolean(busyTarget)}
          onPress={onClose}
          style={styles.backdrop}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {paddingBottom: Math.max(insets.bottom, 16)},
          ]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{flex: 1, gap: 3}}>
              <Text style={styles.eyebrow}>ACTUAL REPORT</Text>
              <Text style={styles.title}>실제 보고서 저장</Text>
            </View>
            <Pressable
              accessibilityLabel="보고서 저장 창 닫기"
              accessibilityRole="button"
              disabled={Boolean(busyTarget)}
              hitSlop={8}
              onPress={onClose}
              style={({pressed}) => [
                styles.closeButton,
                pressed ? styles.pressed : null,
              ]}>
              <X color={color.ink} size={19} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}>
            <View style={styles.scopeTabs}>
              {(
                [
                  {
                    detail: '지금 보고 있는 카드 1장',
                    icon: FileText,
                    label: '현재 카드',
                    value: 'current',
                  },
                  {
                    detail: `보고서 전체 ${pageCount}장`,
                    icon: Images,
                    label: '전체 보고서',
                    value: 'all',
                  },
                ] as const
              ).map(option => {
                const selected = scope === option.value;
                const Icon = option.icon;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{selected}}
                    disabled={Boolean(busyTarget)}
                    key={option.value}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setScope(option.value);
                    }}
                    style={({pressed}) => [
                      styles.scopeTab,
                      selected ? styles.scopeTabSelected : null,
                      pressed ? styles.pressed : null,
                    ]}>
                    <Icon
                      color={selected ? color.white : color.accentDeep}
                      size={18}
                      strokeWidth={2.2}
                    />
                    <Text
                      style={[
                        styles.scopeLabel,
                        selected ? styles.scopeTextSelected : null,
                      ]}>
                      {option.label}
                    </Text>
                    <Text
                      style={[
                        styles.scopeDetail,
                        selected ? styles.scopeDetailSelected : null,
                      ]}>
                      {option.detail}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.actualCard}>
              <View style={styles.actualCardIcon}>
                <FileText color={color.accentDeep} size={20} strokeWidth={2.2} />
              </View>
              <View style={{flex: 1, gap: 4}}>
                <Text style={styles.actualCardLabel}>
                  {scope === 'current' ? '현재 실제 카드' : '전체 실제 보고서'}
                </Text>
                <Text numberOfLines={2} style={styles.actualCardTitle}>
                  {scope === 'current'
                    ? activePage?.title ?? data.s1.headline
                    : `${data.s1.headline} · ${selectedCount}장`}
                </Text>
                <Text style={styles.actualCardDescription}>
                  화면과 같은 본문·사진·분석 결과를 임시 요약 이미지 없이 저장해요.
                </Text>
              </View>
            </View>

            <View style={styles.privacyNotice}>
              <ShieldCheck color="#6C5313" size={20} strokeWidth={2.1} />
              <Text style={styles.privacyText}>
                저장 이미지에는 보고서에 보이는 얼굴 사진과 분석 결과가 포함될 수
                있어요. 공유 전 받는 사람과 공개 범위를 확인해 주세요.
              </Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              accessibilityLabel={`실제 보고서 ${selectedCount}장 사진에 저장`}
              accessibilityRole="button"
              disabled={Boolean(busyTarget) || selectedCount === 0}
              onPress={() => void runExport('save')}
              style={({pressed}) => [
                styles.secondaryAction,
                pressed ? styles.pressed : null,
              ]}>
              {busyTarget === 'save' ? (
                <ActivityIndicator color={color.accentDeep} size="small" />
              ) : (
                <Download color={color.accentDeep} size={18} />
              )}
              <Text style={styles.secondaryActionText}>
                {busyTarget === 'save' && progressLabel
                  ? `저장 중 ${progressLabel}`
                  : '사진에 저장'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`실제 보고서 ${selectedCount}장 공유`}
              accessibilityRole="button"
              disabled={Boolean(busyTarget) || selectedCount === 0}
              onPress={() => void runExport('share')}
              style={({pressed}) => [
                styles.primaryAction,
                pressed ? styles.pressed : null,
              ]}>
              {busyTarget === 'share' ? (
                <ActivityIndicator color={color.white} size="small" />
              ) : (
                <Share2 color={color.white} size={18} />
              )}
              <Text style={styles.primaryActionText}>
                {busyTarget === 'share' && progressLabel
                  ? `준비 중 ${progressLabel}`
                  : selectedCount > 1
                    ? '여러 장 공유'
                    : '공유하기'}
              </Text>
            </Pressable>
          </View>
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
  actualCard: {
    alignItems: 'center',
    backgroundColor: color.surface2,
    borderColor: color.divider,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
  },
  actualCardDescription: {
    ...font(12.5, '500', 1.55),
    color: color.muted,
  },
  actualCardIcon: {
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  actualCardLabel: {
    ...font(11, '800', undefined, 0.5),
    color: color.accentDeep,
  },
  actualCardTitle: {
    ...font(15, '800', 1.35),
    color: color.ink,
  },
  backdrop: {
    backgroundColor: 'rgba(7, 22, 28, 0.44)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
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
  content: {
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  eyebrow: {
    ...font(10, '800', undefined, 1.1),
    color: color.accentDeep,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: color.divider,
    borderRadius: 2,
    height: 4,
    marginBottom: 8,
    width: 38,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  modal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pressed: {
    opacity: 0.72,
    transform: [{scale: 0.985}],
  },
  primaryAction: {
    ...shadow.cta,
    alignItems: 'center',
    backgroundColor: color.accentDeep,
    borderRadius: radius.lg,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
  },
  primaryActionText: {
    ...font(13.5, '800'),
    color: color.white,
  },
  privacyNotice: {
    alignItems: 'flex-start',
    backgroundColor: '#FFF8E5',
    borderColor: '#E9D99E',
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    padding: 14,
  },
  privacyText: {
    ...font(12.5, '500', 1.55),
    color: '#6C5313',
    flex: 1,
  },
  scopeDetail: {
    ...font(11, '600', 1.35),
    color: color.muted,
    textAlign: 'center',
  },
  scopeDetailSelected: {
    color: 'rgba(255,255,255,0.76)',
  },
  scopeLabel: {
    ...font(13.5, '800'),
    color: color.ink,
  },
  scopeTab: {
    alignItems: 'center',
    borderRadius: 15,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 86,
    paddingHorizontal: 8,
  },
  scopeTabSelected: {
    backgroundColor: color.accentDeep,
  },
  scopeTabs: {
    backgroundColor: color.surface2,
    borderRadius: 18,
    flexDirection: 'row',
    padding: 4,
  },
  scopeTextSelected: {
    color: color.white,
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: color.surface,
    borderColor: color.divider,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
  },
  secondaryActionText: {
    ...font(13.5, '800'),
    color: color.accentDeep,
  },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    paddingTop: 10,
  },
  title: {
    ...font(20, '800'),
    color: color.ink,
  },
});
