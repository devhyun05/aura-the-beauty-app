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
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {ChevronLeft, ChevronRight} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

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
}

const INK = '#16303B';
const MUTED = '#718791';

export const StoryReportPager = forwardRef<StoryReportPagerRef, StoryReportPagerProps>(
  function StoryReportPager({pages, sections, resetKey, initialPageId, onPageChange}, ref) {
    const insets = useSafeAreaInsets();
    const listRef = useRef<FlatList<StoryReportPage>>(null);
    const [pageWidth, setPageWidth] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(() => {
      const initialIndex = initialPageId ? pages.findIndex(page => page.id === initialPageId) : 0;
      return initialIndex >= 0 ? initialIndex : 0;
    });
    const [pagingEnabled, setPagingEnabled] = useState(true);

    const pageIndexById = useMemo(
      () => new Map(pages.map((page, index) => [page.id, index])),
      [pages],
    );

    const goToIndex = useCallback((index: number, animated = true) => {
      if (!pages.length) return;
      const nextIndex = Math.max(0, Math.min(index, pages.length - 1));
      setCurrentIndex(nextIndex);
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({index: nextIndex, animated});
      });
      const page = pages[nextIndex];
      if (page) onPageChange?.(page, nextIndex);
    }, [onPageChange, pages]);

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
      setPagingEnabled,
    }), [goToPage, goToSection]);

    useEffect(() => {
      const initialIndex = initialPageId ? pages.findIndex(page => page.id === initialPageId) : 0;
      const nextIndex = initialIndex >= 0 ? initialIndex : 0;
      setCurrentIndex(nextIndex);
      requestAnimationFrame(() => listRef.current?.scrollToIndex({index: nextIndex, animated: false}));
      if (pages[nextIndex]) onPageChange?.(pages[nextIndex], nextIndex);
    // resetKey is the report identity (and includes the generated page IDs).
    // Keeping this effect keyed to it prevents unrelated parent renders from
    // snapping a reader back to the first card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!pageWidth) return;
      const index = Math.max(0, Math.min(Math.round(event.nativeEvent.contentOffset.x / pageWidth), pages.length - 1));
      if (index === currentIndex) return;
      setCurrentIndex(index);
      const page = pages[index];
      if (page) onPageChange?.(page, index);
    };

    const currentPage = pages[currentIndex];
    const currentSection = sections.find(section => section.id === currentPage?.sectionId);
    const currentSectionPages = (currentSection?.pageIds ?? [])
      .map(pageId => pages[pageIndexById.get(pageId) ?? -1])
      .filter((page): page is StoryReportPage => Boolean(page));

    return (
      <View
        style={{flex: 1, backgroundColor: '#F6FAFC'}}
        onLayout={event => setPageWidth(Math.round(event.nativeEvent.layout.width))}>
        <View style={{paddingHorizontal: 12, paddingTop: 6, gap: 6}}>
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
                    minHeight: 34,
                    opacity: !available ? 0.38 : pressed ? 0.55 : 1,
                    paddingHorizontal: 1,
                    position: 'relative',
                  })}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: selected ? INK : MUTED,
                      fontFamily: 'Pretendard',
                      fontSize: 10.5,
                      fontWeight: selected ? '800' : '600',
                    }}>
                    {section.shortTitle ?? section.title}
                  </Text>
                  {selected ? (
                    <View
                      style={{
                        backgroundColor: INK,
                        bottom: -1,
                        height: 2,
                        left: 4,
                        position: 'absolute',
                        right: 4,
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

        <FlatList
          ref={listRef}
          data={pages}
          extraData={pageWidth}
          keyExtractor={page => page.id}
          horizontal
          pagingEnabled
          directionalLockEnabled
          bounces={false}
          decelerationRate="fast"
          scrollEnabled={pagingEnabled}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScrollToIndexFailed={info => {
            requestAnimationFrame(() => listRef.current?.scrollToOffset({offset: info.index * pageWidth, animated: false}));
          }}
          getItemLayout={(_, index) => ({length: pageWidth, offset: pageWidth * index, index})}
          renderItem={({item, index}) => (
            <Pressable
              accessible={false}
              onPress={event => {
                if (!pagingEnabled || !pageWidth) {
                  return;
                }
                const tappedLeftHalf =
                  event.nativeEvent.locationX < pageWidth / 2;
                goToIndex(tappedLeftHalf ? index - 1 : index + 1);
              }}
              style={{
                flex: 1,
                paddingBottom: 8,
                paddingHorizontal: 12,
                paddingTop: 10,
                width: pageWidth,
              }}>
              <View
                accessibilityLabel={`${item.title} 카드`}
                style={{flex: 1, borderRadius: 26, overflow: 'hidden', backgroundColor: '#FFFFFF'}}>
                {item.render}
              </View>
            </Pressable>
          )}
        />

        <View style={{paddingHorizontal: 16, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 10) + 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
          <Pressable
            accessibilityLabel="이전 카드"
            accessibilityRole="button"
            accessibilityState={{disabled: currentIndex === 0}}
            disabled={currentIndex === 0}
            onPress={() => goToIndex(currentIndex - 1)}
            style={({pressed}) => ({width: 44, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', opacity: currentIndex === 0 ? 0.35 : pressed ? 0.65 : 1})}>
            <ChevronLeft size={20} color={INK} />
          </Pressable>
          <Text
            accessibilityLabel={`전체 ${pages.length}장 중 ${currentIndex + 1}장`}
            style={{
              color: MUTED,
              fontFamily: 'Pretendard',
              fontSize: 12,
              fontWeight: '700',
            }}>
            {currentIndex + 1} / {pages.length}
          </Text>
          <Pressable
            accessibilityLabel="다음 카드"
            accessibilityRole="button"
            accessibilityState={{disabled: currentIndex === pages.length - 1}}
            disabled={currentIndex === pages.length - 1}
            onPress={() => goToIndex(currentIndex + 1)}
            style={({pressed}) => ({width: 44, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: INK, opacity: currentIndex === pages.length - 1 ? 0.35 : pressed ? 0.75 : 1})}>
            <ChevronRight size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    );
  },
);
