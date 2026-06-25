import React, {useMemo, useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Svg, {Circle, Ellipse, G, Line, Path, Text as SvgText} from 'react-native-svg';
import {
  Brush,
  CheckCircle2,
  Eye,
  Heart,
  Palette,
  Sparkles,
} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {
  colors,
  feedbackColors,
  feedbackRadius,
  feedbackSpacing,
  iconSize,
  radius,
  shadows,
  spacing,
  typography,
} from '../../../shared/theme';
import {FeedbackScreenScaffold} from '../components/FeedbackScreenScaffold';
import type {MakeupFeedbackResult} from '../types';

type FeedbackGuideOverlayScreenProps = {
  headerTitle?: string;
  result: MakeupFeedbackResult;
  onBack?: () => void;
};

type GuideCategory = 'all' | 'eye' | 'brow' | 'lip' | 'cheek' | 'base';

type GuideSection = {
  id: Exclude<GuideCategory, 'all'>;
  title: string;
  subtitle: string;
  items: Array<{
    label: string;
    value: string;
  }>;
};

const GUIDE_TABS: Array<{id: GuideCategory; label: string}> = [
  {id: 'all', label: '전체'},
  {id: 'eye', label: '눈'},
  {id: 'brow', label: '눈썹'},
  {id: 'lip', label: '입술'},
  {id: 'cheek', label: '블러셔'},
  {id: 'base', label: '베이스'},
];

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'eye',
    title: '눈 메이크업',
    subtitle: '아이라인 각도와 음영 범위를 정리해 눈매 균형을 맞춰요.',
    items: [
      {label: '아이섀도우', value: '쌍꺼풀 라인 위 2mm까지만 부드러운 브라운 음영'},
      {label: '아이라이너', value: '오른쪽 꼬리는 3도 낮춰 수평에 가깝게 연결'},
      {label: '마스카라', value: '중앙은 세우고 꼬리 쪽은 바깥 방향으로 얇게'},
    ],
  },
  {
    id: 'brow',
    title: '눈썹 정리',
    subtitle: '눈썹 산과 꼬리 높이를 맞추면 인상이 더 또렷해져요.',
    items: [
      {label: '눈썹 산', value: '검은자 바깥쪽 위에 산을 두고 각도는 낮게'},
      {label: '눈썹 꼬리', value: '눈꼬리보다 살짝 길게, 아래로 처지지 않게'},
      {label: '빈 곳 채움', value: '앞머리는 연하게, 중간부터 꼬리만 한 톤 진하게'},
    ],
  },
  {
    id: 'lip',
    title: '입술 메이크업',
    subtitle: '입꼬리 경계와 중앙 볼륨을 정리해 선명도를 올려요.',
    items: [
      {label: '립 컬러', value: '중앙은 한 번 더 얹고 바깥은 손가락으로 얇게 블렌딩'},
      {label: '립 포인트', value: '아랫입술 중앙 광택만 살려 볼륨감 추가'},
      {label: '립 엣지', value: '입꼬리 바깥 번짐은 컨실러 브러시로 정리'},
    ],
  },
  {
    id: 'cheek',
    title: '블러셔',
    subtitle: '블러셔 위치를 위로 올리면 얼굴 중심이 자연스럽게 리프팅돼요.',
    items: [
      {label: '시작 위치', value: '코끝보다 아래로 내려오지 않게 광대 위쪽에서 시작'},
      {label: '방향', value: '관자놀이 방향으로 짧게 쓸어 올려 사선감 만들기'},
      {label: '농도', value: '볼 중앙은 연하게, 바깥쪽으로 갈수록 더 옅게'},
    ],
  },
  {
    id: 'base',
    title: '베이스',
    subtitle: '중앙 광은 남기고 외곽은 보송하게 잡아 얼굴 윤곽을 정돈해요.',
    items: [
      {label: 'T존', value: '이마와 콧대 중앙만 얇게 밝혀 입체감 유지'},
      {label: '외곽', value: '헤어라인과 턱선은 파우더로 번들거림 정리'},
      {label: '마무리', value: '코 옆과 입가만 한 번 더 눌러 지속력 높이기'},
    ],
  },
];

export function FeedbackGuideOverlayScreen({
  result,
}: FeedbackGuideOverlayScreenProps) {
  const {width} = useWindowDimensions();
  const [activeCategory, setActiveCategory] = useState<GuideCategory>('all');
  const photoWidth = width;
  const photoHeight = Math.round(photoWidth * 1.14);
  const visibleSections = useMemo(
    () =>
      activeCategory === 'all'
        ? GUIDE_SECTIONS
        : GUIDE_SECTIONS.filter((section) => section.id === activeCategory),
    [activeCategory],
  );

  return (
    <FeedbackScreenScaffold topPadding="none">
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}>
          <View style={[styles.photoStage, {height: photoHeight, width: photoWidth}]}>
            <Image resizeMode="cover" source={result.uploadedImage} style={styles.photo} />
            <View pointerEvents="none" style={styles.photoScrim} />
            <GuideOverlay activeCategory={activeCategory} />
            <View style={styles.photoBadge}>
              <Text style={styles.photoBadgeText}>
                {GUIDE_TABS.find((tab) => tab.id === activeCategory)?.label} 가이드
              </Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.tabList}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {GUIDE_TABS.map((tab) => {
              const isActive = activeCategory === tab.id;

              return (
                <Pressable
                  accessibilityLabel={`${tab.label} 가이드 보기`}
                  accessibilityRole="button"
                  key={tab.id}
                  onPress={() => setActiveCategory(tab.id)}
                  style={styles.tabButton}>
                  <Text style={isActive ? styles.tabTextActive : styles.tabText}>
                    {tab.label}
                  </Text>
                  <View style={isActive ? styles.tabIndicatorActive : styles.tabIndicator} />
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}>
              <Sparkles color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryTitle}>사진 위 랜드마크를 기준으로 수정해요</Text>
              <Text style={styles.summaryText}>
                탭을 누르면 같은 사진 안에서 해당 부위의 가이드 라인만 강조돼요.
              </Text>
            </View>
          </View>

          <View style={styles.guideSectionList}>
            {visibleSections.map((section) => (
              <GuideSectionCard key={section.id} section={section} />
            ))}
          </View>
        </ScrollView>
      </View>
    </FeedbackScreenScaffold>
  );
}

function GuideSectionCard({section}: {section: GuideSection}) {
  const Icon = getSectionIcon(section.id);

  return (
    <View style={styles.guideCard}>
      <View style={styles.guideHeader}>
        <View style={styles.guideIcon}>
          <Icon color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
        </View>
        <View style={styles.guideTitleWrap}>
          <Text style={styles.guideTitle}>{section.title}</Text>
          <Text style={styles.guideSubtitle}>{section.subtitle}</Text>
        </View>
      </View>
      <View style={styles.guideItemList}>
        {section.items.map((item) => (
          <View key={item.label} style={styles.guideItem}>
            <CheckCircle2 color={feedbackColors.text} size={iconSize.xs} strokeWidth={2} />
            <View style={styles.guideItemCopy}>
              <Text style={styles.guideItemLabel}>{item.label}</Text>
              <Text style={styles.guideItemValue}>{item.value}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function GuideOverlay({activeCategory}: {activeCategory: GuideCategory}) {
  const show = (category: GuideCategory) =>
    activeCategory === 'all' || activeCategory === category;
  const mutedOpacity = activeCategory === 'all' ? 0.84 : 1;

  return (
    <Svg height="100%" style={styles.overlaySvg} viewBox="0 0 360 410" width="100%">
      {show('base') ? <BaseGuide opacity={mutedOpacity} /> : null}
      {show('brow') ? <BrowGuide opacity={mutedOpacity} /> : null}
      {show('eye') ? <EyeGuide opacity={mutedOpacity} /> : null}
      {show('cheek') ? <CheekGuide opacity={mutedOpacity} /> : null}
      {show('lip') ? <LipGuide opacity={mutedOpacity} /> : null}
    </Svg>
  );
}

function EyeGuide({opacity}: {opacity: number}) {
  return (
    <G opacity={opacity}>
      <Path d="M72 176 C98 154 130 154 156 176 C132 195 99 195 72 176" {...guidePathProps} />
      <Path d="M204 176 C232 154 265 154 292 176 C264 196 232 196 204 176" {...guidePathProps} />
      <Path d="M214 167 C246 151 278 155 304 170" {...accentPathProps} />
      <Path d="M90 201 C111 212 138 210 158 199" {...guidePathProps} />
      <GuidePoint cx={225} cy={166} label="1" />
      <GuidePoint cx={292} cy={174} label="2" />
      <GuidePoint cx={255} cy={196} label="3" />
    </G>
  );
}

function BrowGuide({opacity}: {opacity: number}) {
  return (
    <G opacity={opacity}>
      <Path d="M66 132 C101 110 137 112 166 128" {...accentPathProps} />
      <Path d="M196 128 C230 108 271 112 306 132" {...accentPathProps} />
      <Line x1={83} x2={155} y1={142} y2={130} {...guideLineProps} />
      <Line x1={212} x2={294} y1={130} y2={142} {...guideLineProps} />
      <GuidePoint cx={154} cy={128} label="산" />
    </G>
  );
}

function LipGuide({opacity}: {opacity: number}) {
  return (
    <G opacity={opacity}>
      <Path d="M120 300 C146 274 168 289 180 287 C193 287 216 274 242 300 C220 324 140 324 120 300" {...guidePathProps} />
      <Path d="M132 302 C156 307 204 307 230 302" {...accentPathProps} />
      <Line x1={118} x2={100} y1={301} y2={286} {...guideLineProps} />
      <Line x1={242} x2={260} y1={301} y2={286} {...guideLineProps} />
      <GuidePoint cx={180} cy={287} label="볼륨" />
    </G>
  );
}

function CheekGuide({opacity}: {opacity: number}) {
  return (
    <G opacity={opacity}>
      <Ellipse cx={112} cy={244} rx={48} ry={24} transform="rotate(-18 112 244)" {...softFillProps} />
      <Ellipse cx={248} cy={244} rx={48} ry={24} transform="rotate(18 248 244)" {...softFillProps} />
      <Path d="M78 254 C100 236 126 224 154 218" {...accentPathProps} />
      <Path d="M282 254 C260 236 234 224 206 218" {...accentPathProps} />
      <GuidePoint cx={112} cy={238} label="UP" />
    </G>
  );
}

function BaseGuide({opacity}: {opacity: number}) {
  return (
    <G opacity={opacity * 0.78}>
      <Path d="M180 74 C102 78 64 144 72 236 C80 326 128 366 180 370 C232 366 280 326 288 236 C296 144 258 78 180 74" {...guidePathProps} />
      <Line x1={180} x2={180} y1={106} y2={260} {...guideLineProps} />
      <Path d="M148 136 C170 128 190 128 212 136" {...guideLineProps} />
      <GuidePoint cx={180} cy={142} label="T" />
    </G>
  );
}

function GuidePoint({
  cx,
  cy,
  label,
}: {
  cx: number;
  cy: number;
  label: string;
}) {
  return (
    <G>
      <Circle cx={cx} cy={cy} fill={feedbackColors.text} r={12} stroke={colors.white} strokeWidth={2} />
      <SvgText
        fill={colors.white}
        fontFamily={typography.fontFamily.bold}
        fontSize={label.length > 1 ? 7 : 10}
        fontWeight="700"
        textAnchor="middle"
        x={cx}
        y={cy + 3}>
        {label}
      </SvgText>
    </G>
  );
}

function getSectionIcon(id: GuideSection['id']) {
  if (id === 'eye' || id === 'brow') {
    return Eye;
  }

  if (id === 'lip') {
    return Heart;
  }

  if (id === 'cheek') {
    return Brush;
  }

  return Palette;
}

const guidePathProps = {
  fill: 'none',
  stroke: colors.white,
  strokeDasharray: '6 5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 2.2,
} as const;

const accentPathProps = {
  fill: 'none',
  stroke: feedbackColors.text,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 2.4,
} as const;

const guideLineProps = {
  stroke: colors.white,
  strokeDasharray: '5 5',
  strokeLinecap: 'round',
  strokeWidth: 2,
} as const;

const softFillProps = {
  fill: feedbackColors.overlayStrong,
  stroke: colors.white,
  strokeDasharray: '5 5',
  strokeWidth: 2,
} as const;

const sharedCardShadow = {
  shadowColor: feedbackColors.shadow,
  shadowOffset: shadows.soft.shadowOffset,
  shadowOpacity: shadows.soft.shadowOpacity,
  shadowRadius: shadows.soft.shadowRadius,
} as const;

const styles = StyleSheet.create({
  content: {
    gap: feedbackSpacing.cardGap,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.xl,
  },
  guideCard: {
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.card,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    ...sharedCardShadow,
  },
  guideHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  guideIcon: {
    alignItems: 'center',
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  guideItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  guideItemCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  guideItemLabel: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  guideItemList: {
    gap: spacing.md,
  },
  guideItemValue: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  guideSectionList: {
    gap: spacing.md,
    paddingHorizontal: feedbackSpacing.screenX,
  },
  guideSubtitle: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  guideTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  guideTitleWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  overlaySvg: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  photo: {
    height: '100%',
    width: '100%',
  },
  photoBadge: {
    backgroundColor: feedbackColors.text,
    borderRadius: radius.pill,
    bottom: spacing.lg,
    left: feedbackSpacing.screenX,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
  },
  photoBadgeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  photoScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  photoStage: {
    alignSelf: 'center',
    backgroundColor: feedbackColors.surfaceMuted,
    overflow: 'hidden',
    position: 'relative',
  },
  screen: {
    backgroundColor: feedbackColors.background,
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  summaryCard: {
    alignItems: 'center',
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: feedbackSpacing.screenX,
    padding: spacing.lg,
    ...sharedCardShadow,
  },
  summaryCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  summaryText: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  summaryTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  tabButton: {
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 54,
    paddingTop: spacing.md,
  },
  tabIndicator: {
    backgroundColor: 'transparent',
    borderRadius: radius.pill,
    height: 3,
    width: '100%',
  },
  tabIndicatorActive: {
    backgroundColor: feedbackColors.text,
    borderRadius: radius.pill,
    height: 3,
    width: '100%',
  },
  tabList: {
    gap: spacing.xl,
    paddingHorizontal: feedbackSpacing.screenX,
  },
  tabText: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  tabTextActive: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
});
