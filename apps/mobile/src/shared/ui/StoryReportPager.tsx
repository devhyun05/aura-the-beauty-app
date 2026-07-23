import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {ChevronLeft, ChevronRight, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useReducedMotion} from 'react-native-reanimated';
import {
  classifyStoryReportGesture,
  resolveStoryReportSwipeTarget,
  type StoryReportGestureAxis,
} from './storyReportPagerGesture';

export type StoryReportPageKind = 'cover' | 'content' | 'cta';

export interface StoryReportPage {
  id: string;
  sectionId: string;
  kind: StoryReportPageKind;
  title: string;
  shortTitle?: string;
  accentColor: string;
  render: React.ReactNode;
}

export interface StoryReportSection {
  id: string;
  title: string;
  shortTitle?: string;
  pageIds: string[];
  accentColor: string;
  available?: boolean;
  showPageIndex?: boolean;
}

export interface StoryReportPagerRef {
  goToPage: (pageId: string, animated?: boolean) => void;
  goToSection: (sectionId: string, animated?: boolean) => void;
  setPagingEnabled: (enabled: boolean) => void;
}

interface StoryReportPagerProps {
  pages: StoryReportPage[];
  sections: StoryReportSection[];
  resetKey: string;
  initialPageId?: string;
  onPageChange?: (page: StoryReportPage, index: number) => void;
  showFooter?: boolean;
}

const INK = '#16303B';
const MUTED = '#718791';
const ACCENT = '#0E7DA8';
const OUTLINE = 'rgba(22,48,59,0.10)';

export const StoryReportPager = forwardRef<StoryReportPagerRef, StoryReportPagerProps>(
  function StoryReportPager({
    pages,
    sections,
    resetKey,
    initialPageId,
    onPageChange,
    showFooter = true,
  }, ref) {
    const insets = useSafeAreaInsets();
    const reduceMotion = useReducedMotion();
    const listRef = useRef<FlatList<StoryReportPage>>(null);
    const [pageWidth, setPageWidth] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(() => {
      const initialIndex = initialPageId ? pages.findIndex(page => page.id === initialPageId) : 0;
      return initialIndex >= 0 ? initialIndex : 0;
    });
    const [tableOfContentsVisible, setTableOfContentsVisible] = useState(false);
    const pagingEnabledRef = useRef(true);
    const currentIndexRef = useRef(currentIndex);
    const currentPageIdRef = useRef(pages[currentIndex]?.id ?? null);
    const gestureAxisRef = useRef<StoryReportGestureAxis>('undecided');
    const dragStartIndexRef = useRef(currentIndex);

    const setPagerEnabled = useCallback((enabled: boolean) => {
      // Interaction locks (for example the 3D face viewer) must take effect
      // synchronously inside responder callbacks.
      pagingEnabledRef.current = enabled;
    }, []);

    const pageIndexById = useMemo(
      () => new Map(pages.map((page, index) => [page.id, index])),
      [pages],
    );

    const commitIndex = useCallback((index: number) => {
      if (!pages.length) return;
      const nextIndex = Math.max(0, Math.min(index, pages.length - 1));
      currentIndexRef.current = nextIndex;
      currentPageIdRef.current = pages[nextIndex]?.id ?? null;
      setCurrentIndex(nextIndex);
      const page = pages[nextIndex];
      if (page) onPageChange?.(page, nextIndex);
    }, [onPageChange, pages]);

    const goToIndex = useCallback((index: number, animated = true) => {
      if (!pages.length) return;
      const nextIndex = Math.max(0, Math.min(index, pages.length - 1));
      const shouldAnimate = animated && !reduceMotion;

      if (!pageWidth || !listRef.current) {
        commitIndex(nextIndex);
        return;
      }

      // Start settling in the same release frame. Committing the new page
      // first can trigger a heavy report re-render and leave the card visibly
      // paused between pages before the native scroll command is dispatched.
      listRef.current.scrollToOffset({
        animated: shouldAnimate,
        offset: nextIndex * pageWidth,
      });

      if (!shouldAnimate) {
        commitIndex(nextIndex);
      }
    }, [commitIndex, pageWidth, pages.length, reduceMotion]);

    const goToPage = useCallback((pageId: string, animated = true) => {
      const index = pageIndexById.get(pageId);
      if (typeof index === 'number') goToIndex(index, animated);
    }, [goToIndex, pageIndexById]);

    const goToSection = useCallback((sectionId: string, animated = true) => {
      const section = sections.find(item => item.id === sectionId);
      const target = section?.pageIds[0];
      if (target) goToPage(target, animated);
    }, [goToPage, sections]);

    useImperativeHandle(ref, () => ({
      goToPage,
      goToSection,
      setPagingEnabled: setPagerEnabled,
    }), [goToPage, goToSection, setPagerEnabled]);

    useEffect(() => {
      const initialIndex = initialPageId ? pages.findIndex(page => page.id === initialPageId) : 0;
      const nextIndex = initialIndex >= 0 ? initialIndex : 0;
      currentIndexRef.current = nextIndex;
      currentPageIdRef.current = pages[nextIndex]?.id ?? null;
      setCurrentIndex(nextIndex);
      requestAnimationFrame(() => listRef.current?.scrollToIndex({index: nextIndex, animated: false}));
      if (pages[nextIndex]) onPageChange?.(pages[nextIndex], nextIndex);
    // resetKey is the report identity (and includes the generated page IDs).
    // Keeping this effect keyed to it prevents unrelated parent renders from
    // snapping a reader back to the first card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    useEffect(() => {
      const currentPageId = currentPageIdRef.current;
      if (!currentPageId) return;
      const nextIndex = pages.findIndex(page => page.id === currentPageId);
      if (nextIndex < 0 || nextIndex === currentIndexRef.current) return;
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      requestAnimationFrame(() => {
        if (pageWidth > 0) {
          listRef.current?.scrollToOffset({
            animated: false,
            offset: nextIndex * pageWidth,
          });
        }
      });
    }, [pageWidth, pages]);

    const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!pageWidth) return;
      const index = Math.max(0, Math.min(Math.round(event.nativeEvent.contentOffset.x / pageWidth), pages.length - 1));
      if (index === currentIndexRef.current) return;
      commitIndex(index);
    };

    const pagerPanResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => {
            gestureAxisRef.current = 'undecided';
            return false;
          },
          onStartShouldSetPanResponderCapture: () => {
            gestureAxisRef.current = 'undecided';
            return false;
          },
          onMoveShouldSetPanResponder: () => false,
          onMoveShouldSetPanResponderCapture: (_event, gesture) => {
            if (
              !pagingEnabledRef.current
              || pageWidth <= 0
              || pages.length < 2
              || gestureAxisRef.current === 'vertical'
            ) {
              return false;
            }
            if (gestureAxisRef.current === 'horizontal') {
              return true;
            }

            const axis = classifyStoryReportGesture(gesture.dx, gesture.dy);
            if (axis !== 'undecided') {
              // Sticky for this touch: a gesture that first reads as vertical
              // can never be stolen by the pager later in the same drag.
              gestureAxisRef.current = axis;
            }
            return axis === 'horizontal';
          },
          onPanResponderGrant: () => {
            gestureAxisRef.current = 'horizontal';
            dragStartIndexRef.current = currentIndexRef.current;
          },
          onPanResponderMove: (_event, gesture) => {
            if (!pageWidth || !pagingEnabledRef.current) return;
            const maxOffset = Math.max(0, (pages.length - 1) * pageWidth);
            const offset = Math.max(
              0,
              Math.min(
                dragStartIndexRef.current * pageWidth - gesture.dx,
                maxOffset,
              ),
            );
            listRef.current?.scrollToOffset({animated: false, offset});
          },
          onPanResponderRelease: (_event, gesture) => {
            const target = resolveStoryReportSwipeTarget({
              currentIndex: dragStartIndexRef.current,
              dx: gesture.dx,
              pageCount: pages.length,
              pageWidth,
              velocityX: gesture.vx,
            });
            gestureAxisRef.current = 'undecided';
            goToIndex(target);
          },
          onPanResponderTerminate: () => {
            const target = dragStartIndexRef.current;
            gestureAxisRef.current = 'undecided';
            goToIndex(target);
          },
          // Once a horizontal swipe wins the direction gate, keep ownership
          // until release so a late vertical wobble cannot change axes.
          onPanResponderTerminationRequest: () => false,
        }),
      [goToIndex, pageWidth, pages.length],
    );

    const currentPage = pages[currentIndex];
    const currentSection = sections.find(section => section.id === currentPage?.sectionId);
    const currentSectionPages = (currentSection?.pageIds ?? [])
      .map(pageId => pages[pageIndexById.get(pageId) ?? -1])
      .filter((page): page is StoryReportPage => Boolean(page));

    return (
      <View
        style={{flex: 1, backgroundColor: '#F6FAFC'}}
        onLayout={event => setPageWidth(Math.round(event.nativeEvent.layout.width))}>
        <View style={{paddingTop: 6, gap: 6}}>
          <View
            accessibilityLabel="보고서 섹션 목차"
            style={{
              borderBottomColor: '#DCE6EA',
              borderBottomWidth: 1,
              flexDirection: 'row',
            }}>
            {sections.map(section => {
              const selected = section.id === currentSection?.id;
              const available = section.available ?? section.pageIds.length > 0;
              return (
                <Pressable
                  accessibilityLabel={`${section.title} 섹션으로 이동`}
                  accessibilityRole="button"
                  accessibilityState={{disabled: !available, selected}}
                  disabled={!available}
                  key={section.id}
                  onPress={() => goToSection(section.id, false)}
                  style={({pressed}) => ({
                    alignItems: 'center',
                    flex: 1,
                    justifyContent: 'center',
                    minHeight: 44,
                    opacity: !available ? 0.38 : pressed ? 0.55 : 1,
                    paddingHorizontal: 1,
                    position: 'relative',
                  })}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: selected ? INK : MUTED,
                      fontFamily: 'Pretendard',
                      fontSize: 13,
                      fontWeight: selected ? '800' : '500',
                    }}>
                    {section.shortTitle ?? section.title}
                  </Text>
                  {selected ? (
                    <View
                      style={{
                        backgroundColor: ACCENT,
                        bottom: -1,
                        height: 2,
                        left: 0,
                        position: 'absolute',
                        right: 0,
                      }}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {currentSection?.showPageIndex ? (
            <View
              accessibilityLabel={`${currentSection.title} 페이지 목차`}
              style={{
                backgroundColor: '#E8EFF2',
                borderRadius: 11,
                flexDirection: 'row',
                padding: 2,
              }}>
              {currentSectionPages.map(page => {
                const selected = page.id === currentPage?.id;
                return (
                  <Pressable
                    accessibilityLabel={`${page.title} 카드로 이동`}
                    accessibilityRole="button"
                    accessibilityState={{selected}}
                    key={page.id}
                    onPress={() => goToPage(page.id, false)}
                    style={({pressed}) => ({
                      alignItems: 'center',
                      backgroundColor: selected ? '#FFFFFF' : 'transparent',
                      borderRadius: 9,
                      flex: 1,
                      justifyContent: 'center',
                      minHeight: 30,
                      opacity: pressed ? 0.55 : 1,
                      paddingHorizontal: 3,
                    })}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: selected ? INK : MUTED,
                        fontFamily: 'Pretendard',
                        fontSize: 10.5,
                        fontWeight: selected ? '800' : '600',
                      }}>
                      {page.shortTitle ?? (page.kind === 'cover' ? '표지' : page.title)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        <View
          style={{flex: 1}}
          {...pagerPanResponder.panHandlers}>
          <FlatList
            ref={listRef}
            data={pages}
            extraData={pageWidth}
            keyExtractor={page => page.id}
            horizontal
            bounces={false}
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumScrollEnd}
            onScrollToIndexFailed={info => {
              requestAnimationFrame(() => listRef.current?.scrollToOffset({offset: info.index * pageWidth, animated: false}));
            }}
            getItemLayout={(_, index) => ({length: pageWidth, offset: pageWidth * index, index})}
            renderItem={({item}) => (
              <View
                style={{
                  flex: 1,
                  paddingBottom: 12,
                  paddingHorizontal: 16,
                  paddingTop: 18,
                  width: pageWidth,
                }}>
                <View
                  accessibilityLabel={`${item.title} 카드`}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#D7E1E5',
                    borderRadius: 12,
                    borderWidth: 1,
                    flex: 1,
                    overflow: 'hidden',
                  }}>
                  {item.render}
                </View>
              </View>
            )}
          />
        </View>

        {showFooter ? (
          <View style={{paddingHorizontal: 16, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 10) + 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
          <Pressable
            accessibilityLabel="이전 카드"
            accessibilityRole="button"
            accessibilityState={{disabled: currentIndex === 0}}
            disabled={currentIndex === 0}
            onPress={() => goToIndex(currentIndex - 1)}
            style={({pressed}) => ({
              alignItems: 'center',
              backgroundColor: '#FFFFFF',
              borderColor: OUTLINE,
              borderRadius: 22,
              borderWidth: 1,
              height: 44,
              justifyContent: 'center',
              opacity: currentIndex === 0 ? 0.35 : pressed ? 0.65 : 1,
              width: 44,
            })}>
            <ChevronLeft size={20} color={INK} />
          </Pressable>
          <Pressable
            accessibilityHint="전체 카드 목차를 엽니다."
            accessibilityLabel={`전체 ${pages.length}장 중 ${currentIndex + 1}장`}
            accessibilityRole="button"
            onPress={() => setTableOfContentsVisible(true)}
            style={({pressed}) => ({
              alignItems: 'center',
              borderRadius: 22,
              justifyContent: 'center',
              minHeight: 44,
              minWidth: 72,
              opacity: pressed ? 0.58 : 1,
              paddingHorizontal: 12,
            })}>
            <Text
              style={{
                color: MUTED,
                fontFamily: 'Pretendard',
                fontSize: 12,
                fontWeight: '700',
              }}>
              {currentIndex + 1} / {pages.length}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="다음 카드"
            accessibilityRole="button"
            accessibilityState={{disabled: currentIndex === pages.length - 1}}
            disabled={currentIndex === pages.length - 1}
            onPress={() => goToIndex(currentIndex + 1)}
            style={({pressed}) => ({width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT, opacity: currentIndex === pages.length - 1 ? 0.35 : pressed ? 0.75 : 1})}>
            <ChevronRight size={20} color="#FFFFFF" />
          </Pressable>
          </View>
        ) : null}

        <Modal
          animationType="fade"
          onRequestClose={() => setTableOfContentsVisible(false)}
          transparent
          visible={tableOfContentsVisible}>
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: 'rgba(7, 22, 28, 0.42)',
              flex: 1,
              justifyContent: 'flex-end',
            }}>
            <Pressable
              accessibilityLabel="목차 닫기"
              onPress={() => setTableOfContentsVisible(false)}
              style={{flex: 1}}
            />
            <View
              style={{
                backgroundColor: '#F8FBFC',
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                maxHeight: '76%',
                paddingBottom: Math.max(insets.bottom, 16),
                paddingHorizontal: 20,
                paddingTop: 12,
              }}>
              <View style={{alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'}}>
                <View>
                  <Text style={{color: INK, fontFamily: 'Pretendard', fontSize: 20, fontWeight: '800'}}>
                    보고서 목차
                  </Text>
                  <Text style={{color: MUTED, fontFamily: 'Pretendard', fontSize: 12, marginTop: 3}}>
                    원하는 카드로 바로 이동하세요
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="목차 닫기"
                  accessibilityRole="button"
                  onPress={() => setTableOfContentsVisible(false)}
                  style={({pressed}) => ({
                    alignItems: 'center',
                    backgroundColor: '#FFFFFF',
                    borderRadius: 22,
                    height: 44,
                    justifyContent: 'center',
                    opacity: pressed ? 0.62 : 1,
                    width: 44,
                  })}>
                  <X color={INK} size={19} />
                </Pressable>
              </View>
              <ScrollView
                contentContainerStyle={{gap: 18, paddingBottom: 12, paddingTop: 22}}
                showsVerticalScrollIndicator={false}>
                {sections.filter(section => section.pageIds.length > 0).map(section => (
                  <View key={section.id} style={{gap: 8}}>
                    <Text style={{color: INK, fontFamily: 'Pretendard', fontSize: 13, fontWeight: '800'}}>
                      {section.title}
                    </Text>
                    <View style={{gap: 6}}>
                      {section.pageIds.map(pageId => {
                        const page = pages[pageIndexById.get(pageId) ?? -1];
                        if (!page) return null;
                        const selected = page.id === currentPage?.id;
                        return (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{selected}}
                            key={page.id}
                            onPress={() => {
                              setTableOfContentsVisible(false);
                              goToPage(page.id, false);
                            }}
                            style={({pressed}) => ({
                              alignItems: 'center',
                              backgroundColor: selected ? '#E8F1F4' : '#FFFFFF',
                              borderRadius: 14,
                              flexDirection: 'row',
                              minHeight: 48,
                              opacity: pressed ? 0.64 : 1,
                              paddingHorizontal: 14,
                            })}>
                            <Text
                              style={{
                                color: selected ? INK : MUTED,
                                flex: 1,
                                fontFamily: 'Pretendard',
                                fontSize: 13,
                                fontWeight: selected ? '800' : '600',
                              }}>
                              {page.title}
                            </Text>
                            <Text style={{color: MUTED, fontFamily: 'Pretendard', fontSize: 11}}>
                              {(pageIndexById.get(page.id) ?? 0) + 1}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    );
  },
);
