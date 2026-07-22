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
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {ChevronLeft, ChevronRight, List, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

export type StoryReportPageKind = 'cover' | 'content' | 'cta';

export interface StoryReportPage {
  id: string;
  sectionId: string;
  kind: StoryReportPageKind;
  title: string;
  accentColor: string;
  render: React.ReactNode;
}

export interface StoryReportSection {
  id: string;
  title: string;
  pageIds: string[];
  accentColor: string;
}

export interface StoryReportPagerRef {
  goToPage: (pageId: string, animated?: boolean) => void;
  goToSection: (sectionId: string, animated?: boolean) => void;
  setPagingEnabled: (enabled: boolean) => void;
  openTableOfContents: () => void;
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
    const [tocOpen, setTocOpen] = useState(false);

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
      openTableOfContents: () => setTocOpen(true),
    }), [goToPage, goToSection]);

    useEffect(() => {
      const initialIndex = initialPageId ? pages.findIndex(page => page.id === initialPageId) : 0;
      const nextIndex = initialIndex >= 0 ? initialIndex : 0;
      setCurrentIndex(nextIndex);
      setTocOpen(false);
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

    return (
      <View
        style={{flex: 1, backgroundColor: '#F6FAFC'}}
        onLayout={event => setPageWidth(Math.round(event.nativeEvent.layout.width))}>
        <View style={{paddingHorizontal: 16, paddingTop: 8, gap: 9}}>
          <View accessibilityRole="progressbar" style={{flexDirection: 'row', gap: 5}}>
            {sections.map(section => {
              const firstIndex = pageIndexById.get(section.pageIds[0] ?? '') ?? 0;
              const lastIndex = pageIndexById.get(section.pageIds[section.pageIds.length - 1] ?? '') ?? firstIndex;
              const fill = currentIndex < firstIndex ? 0 : currentIndex > lastIndex
                ? 1
                : (currentIndex - firstIndex + 1) / Math.max(1, section.pageIds.length);
              return (
                <Pressable
                  accessibilityLabel={`${section.title} 섹션으로 이동`}
                  accessibilityRole="button"
                  key={section.id}
                  onPress={() => goToSection(section.id)}
                  style={{flex: Math.max(1, section.pageIds.length), height: 4, borderRadius: 999, overflow: 'hidden', backgroundColor: '#DCE6EA'}}>
                  <View style={{width: `${fill * 100}%`, height: '100%', backgroundColor: section.accentColor}} />
                </Pressable>
              );
            })}
          </View>
          <View style={{alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'}}>
            <View style={{flex: 1}}>
              <Text style={{fontFamily: 'Pretendard', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: currentPage?.accentColor ?? MUTED}}>
                {currentSection?.title ?? ''}
              </Text>
              <Text numberOfLines={1} style={{fontFamily: 'Pretendard', fontSize: 14, fontWeight: '800', color: INK, marginTop: 2}}>
                {currentPage?.title ?? ''}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="보고서 목차 열기"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setTocOpen(true)}
              style={({pressed}) => ({alignItems: 'center', flexDirection: 'row', gap: 6, opacity: pressed ? 0.6 : 1, padding: 6})}>
              <Text style={{fontFamily: 'Pretendard', fontSize: 12, fontWeight: '700', color: MUTED}}>
                {currentIndex + 1} / {pages.length}
              </Text>
              <List size={18} color={INK} strokeWidth={2} />
            </Pressable>
          </View>
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
          renderItem={({item}) => (
            <View style={{width: pageWidth, flex: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8}}>
              <View
                accessibilityLabel={`${item.title} 카드`}
                style={{flex: 1, borderRadius: 26, overflow: 'hidden', backgroundColor: '#FFFFFF'}}>
                {item.render}
              </View>
            </View>
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
          <View style={{height: 5, width: 68, borderRadius: 99, overflow: 'hidden', backgroundColor: '#DCE6EA'}}>
            <View style={{height: '100%', width: `${pages.length ? ((currentIndex + 1) / pages.length) * 100 : 0}%`, backgroundColor: currentPage?.accentColor ?? INK}} />
          </View>
          <Pressable
            accessibilityLabel="다음 카드"
            accessibilityRole="button"
            accessibilityState={{disabled: currentIndex === pages.length - 1}}
            disabled={currentIndex === pages.length - 1}
            onPress={() => goToIndex(currentIndex + 1)}
            style={({pressed}) => ({width: 44, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: currentPage?.accentColor ?? INK, opacity: currentIndex === pages.length - 1 ? 0.35 : pressed ? 0.75 : 1})}>
            <ChevronRight size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        <Modal animationType="slide" transparent visible={tocOpen} onRequestClose={() => setTocOpen(false)}>
          <Pressable style={{flex: 1, backgroundColor: 'rgba(16,31,38,0.42)', justifyContent: 'flex-end'}} onPress={() => setTocOpen(false)}>
            <Pressable
              accessibilityViewIsModal
              onPress={event => event.stopPropagation()}
              style={{maxHeight: '82%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#FFFFFF', paddingBottom: Math.max(insets.bottom, 16)}}>
              <View style={{paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                <View>
                  <Text style={{fontFamily: 'Lora', fontSize: 25, color: INK}}>INDEX</Text>
                  <Text style={{fontFamily: 'Pretendard', fontSize: 12, color: MUTED, marginTop: 2}}>원하는 카드로 바로 이동하세요</Text>
                </View>
                <Pressable accessibilityLabel="목차 닫기" accessibilityRole="button" hitSlop={8} onPress={() => setTocOpen(false)} style={{padding: 8}}>
                  <X size={21} color={INK} />
                </Pressable>
              </View>
              <FlatList
                data={sections}
                keyExtractor={section => section.id}
                contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 12}}
                renderItem={({item: section, index}) => (
                  <View style={{borderTopWidth: index === 0 ? 0 : 1, borderTopColor: '#E8EFF2', paddingVertical: 13}}>
                    <Pressable
                      accessibilityLabel={`${section.title} 섹션 표지로 이동`}
                      accessibilityRole="button"
                      onPress={() => {
                        setTocOpen(false);
                        goToSection(section.id);
                      }}
                      style={({pressed}) => ({flexDirection: 'row', alignItems: 'center', gap: 9, opacity: pressed ? 0.6 : 1})}>
                      <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: section.accentColor}} />
                      <Text style={{fontFamily: 'Pretendard', fontSize: 14, fontWeight: '800', color: INK}}>{section.title}</Text>
                    </Pressable>
                    <View style={{paddingLeft: 17, paddingTop: 7, gap: 3}}>
                      {section.pageIds.map(pageId => {
                        const page = pages[pageIndexById.get(pageId) ?? -1];
                        if (!page) return null;
                        return (
                          <Pressable
                            accessibilityLabel={`${page.title} 카드로 이동`}
                            accessibilityRole="button"
                            key={page.id}
                            onPress={() => {
                              setTocOpen(false);
                              goToPage(page.id);
                            }}
                            style={({pressed}) => ({paddingVertical: 5, opacity: pressed ? 0.55 : 1})}>
                            <Text style={{fontFamily: 'Pretendard', fontSize: 12.5, color: page.id === currentPage?.id ? page.accentColor : MUTED, fontWeight: page.id === currentPage?.id ? '800' : '500'}}>
                              {page.kind === 'cover' ? '표지' : page.title}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  },
);
