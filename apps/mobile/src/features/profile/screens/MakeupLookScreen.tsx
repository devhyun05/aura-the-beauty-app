import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, Text, View } from 'tamagui';

import { getMakeupStyles } from '../../../shared/services/userPageService';
import {
  userPageColors,
  userPageRadius,
  userPageSpacing,
  userPageTypography,
} from '../../../shared/theme/tokens';
import type { MakeupStylePreview } from '../../../shared/types/userPage';

interface MakeupLookScreenProps {
  onBack?: () => void;
}

const PAGE_SIZE = 5;

export const MakeupLookScreen = ({ onBack }: MakeupLookScreenProps) => {
  const insets = useSafeAreaInsets();
  const [looks, setLooks] = useState<MakeupStylePreview[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let isMounted = true;

    getMakeupStyles().then((makeupStyles) => {
      if (isMounted) {
        setLooks(makeupStyles);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(looks.length / PAGE_SIZE));
  const pageLooks = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;

    return looks.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, looks]);

  const handleToggleSave = (lookId: string) => {
    setLooks((currentLooks) =>
      currentLooks.map((look) =>
        look.id === lookId
          ? {
              ...look,
              isSaved: !look.isSaved,
            }
          : look,
      ),
    );
  };

  const handlePreviousPage = () => {
    setCurrentPage((page) => Math.max(1, page - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Pressable
          accessibilityLabel="메이크업 룩에서 뒤로가기"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onBack}
          style={styles.backButton}
        >
          <BackIcon />
        </Pressable>

        <View style={styles.headerTitleGroup}>
          <Text style={styles.eyebrow}>SAVED LOOKS</Text>
          <Text style={styles.title}>메이크업 룩</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {looks.length > 0 ? (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>
                저장한 룩 {looks.filter((look) => look.isSaved).length}개
              </Text>
              <Text style={styles.summaryText}>
                {currentPage} / {totalPages}
              </Text>
            </View>

            <View style={styles.grid}>
              {pageLooks.map((look) => (
                <MakeupLookCard
                  key={look.id}
                  look={look}
                  onToggleSave={() => handleToggleSave(look.id)}
                />
              ))}
            </View>

            <Pagination
              currentPage={currentPage}
              onNext={handleNextPage}
              onPrevious={handlePreviousPage}
              onSelectPage={setCurrentPage}
              totalPages={totalPages}
            />
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>저장된 메이크업 룩이 없어요</Text>
            <Text style={styles.emptyDescription}>
              마음에 드는 룩을 저장하면 이곳에서 다시 볼 수 있어요.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

interface MakeupLookCardProps {
  look: MakeupStylePreview;
  onToggleSave: () => void;
}

const MakeupLookCard = ({ look, onToggleSave }: MakeupLookCardProps) => {
  return (
    <View style={styles.lookCard}>
      <Image resizeMode="cover" source={look.imageSource} style={styles.lookImage} />

      <Pressable
        accessibilityLabel={`${look.title} 저장 상태 변경`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onToggleSave}
        style={styles.saveButton}
      >
        <BookmarkIcon isSaved={look.isSaved} />
      </Pressable>

      <View style={styles.lookBody}>
        <Text numberOfLines={1} style={styles.lookTitle}>
          {look.title}
        </Text>
        <Text numberOfLines={1} style={styles.lookMood}>
          {look.moodLabel}
        </Text>
        <Text numberOfLines={2} style={styles.lookDescription}>
          {look.shortDescription}
        </Text>
      </View>
    </View>
  );
};

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  onSelectPage: (page: number) => void;
}

const Pagination = ({
  currentPage,
  totalPages,
  onPrevious,
  onNext,
  onSelectPage,
}: PaginationProps) => {
  return (
    <View style={styles.pagination}>
      <Pressable
        accessibilityLabel="이전 메이크업 룩 페이지"
        accessibilityRole="button"
        disabled={currentPage === 1}
        onPress={onPrevious}
        style={[styles.pageMoveButton, currentPage === 1 ? styles.disabled : null]}
      >
        <ChevronLeftIcon />
      </Pressable>

      <View style={styles.pageDots}>
        {Array.from({ length: totalPages }, (_, index) => {
          const page = index + 1;
          const isActive = page === currentPage;

          return (
            <Pressable
              accessibilityLabel={`${page}페이지로 이동`}
              accessibilityRole="button"
              key={page}
              onPress={() => onSelectPage(page)}
              style={[styles.pageDot, isActive ? styles.pageDotActive : null]}
            />
          );
        })}
      </View>

      <Pressable
        accessibilityLabel="다음 메이크업 룩 페이지"
        accessibilityRole="button"
        disabled={currentPage === totalPages}
        onPress={onNext}
        style={[
          styles.pageMoveButton,
          currentPage === totalPages ? styles.disabled : null,
        ]}
      >
        <ChevronRightIcon />
      </Pressable>
    </View>
  );
};

function BackIcon() {
  return (
    <View pointerEvents="none" style={styles.backIcon}>
      <View style={[styles.backLine, styles.backLineTop]} />
      <View style={[styles.backLine, styles.backLineBottom]} />
    </View>
  );
}

function BookmarkIcon({ isSaved }: { isSaved: boolean }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.bookmarkIcon, isSaved ? styles.bookmarkIconSaved : null]}
    >
      <View style={styles.bookmarkCut} />
    </View>
  );
}

function ChevronLeftIcon() {
  return (
    <View pointerEvents="none" style={styles.chevronIcon}>
      <View style={[styles.chevronLine, styles.chevronLeftTop]} />
      <View style={[styles.chevronLine, styles.chevronLeftBottom]} />
    </View>
  );
}

function ChevronRightIcon() {
  return (
    <View pointerEvents="none" style={styles.chevronIcon}>
      <View style={[styles.chevronLine, styles.chevronRightTop]} />
      <View style={[styles.chevronLine, styles.chevronRightBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  backIcon: {
    height: 22,
    position: 'relative',
    width: 22,
  },
  backLine: {
    backgroundColor: userPageColors.text,
    borderRadius: 2,
    height: 2,
    left: 4,
    position: 'absolute',
    width: 14,
  },
  backLineBottom: {
    top: 13,
    transform: [{ rotate: '45deg' }],
  },
  backLineTop: {
    top: 5,
    transform: [{ rotate: '-45deg' }],
  },
  bookmarkCut: {
    alignSelf: 'center',
    backgroundColor: userPageColors.surface,
    height: 7,
    marginTop: 11,
    transform: [{ rotate: '45deg' }],
    width: 7,
  },
  bookmarkIcon: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.text,
    borderRadius: 3,
    borderWidth: 1.5,
    height: 18,
    overflow: 'hidden',
    width: 14,
  },
  bookmarkIconSaved: {
    backgroundColor: userPageColors.text,
  },
  chevronIcon: {
    height: 18,
    position: 'relative',
    width: 18,
  },
  chevronLeftBottom: {
    left: 4,
    top: 10,
    transform: [{ rotate: '45deg' }],
  },
  chevronLeftTop: {
    left: 4,
    top: 6,
    transform: [{ rotate: '-45deg' }],
  },
  chevronLine: {
    backgroundColor: userPageColors.text,
    borderRadius: 2,
    height: 2,
    position: 'absolute',
    width: 9,
  },
  chevronRightBottom: {
    right: 4,
    top: 10,
    transform: [{ rotate: '-45deg' }],
  },
  chevronRightTop: {
    right: 4,
    top: 6,
    transform: [{ rotate: '45deg' }],
  },
  disabled: {
    opacity: 0.3,
  },
  emptyDescription: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.body,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.card,
    borderWidth: 1,
    gap: 8,
    padding: 28,
  },
  emptyTitle: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 22,
  },
  eyebrow: {
    color: userPageColors.textSoft,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    lineHeight: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  header: {
    alignItems: 'center',
    backgroundColor: userPageColors.background,
    borderBottomColor: userPageColors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: userPageSpacing.screenX,
  },
  headerTitleGroup: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    marginRight: 38,
    minWidth: 0,
  },
  lookBody: {
    gap: 4,
    padding: 12,
  },
  lookCard: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    flexGrow: 1,
    maxWidth: '48.2%',
    minWidth: '48.2%',
    overflow: 'hidden',
    position: 'relative',
  },
  lookDescription: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.caption,
    lineHeight: 17,
  },
  lookImage: {
    aspectRatio: 0.78,
    backgroundColor: userPageColors.surfaceMuted,
    width: '100%',
  },
  lookMood: {
    color: userPageColors.textSoft,
    fontSize: userPageTypography.caption,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  lookTitle: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    fontWeight: '700',
    lineHeight: 19,
  },
  pageDot: {
    backgroundColor: userPageColors.borderSubtle,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  pageDotActive: {
    backgroundColor: userPageColors.text,
    width: 18,
  },
  pageDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  pageMoveButton: {
    alignItems: 'center',
    borderColor: userPageColors.borderSubtle,
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  pagination: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    paddingTop: 4,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
    top: 10,
    width: 30,
  },
  screen: {
    backgroundColor: userPageColors.background,
    flex: 1,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 48,
    paddingHorizontal: userPageSpacing.screenX,
    paddingTop: 16,
  },
  scrollView: {
    backgroundColor: userPageColors.background,
    flex: 1,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryText: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.caption,
    fontWeight: '600',
    lineHeight: 16,
  },
  title: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 22,
  },
});
