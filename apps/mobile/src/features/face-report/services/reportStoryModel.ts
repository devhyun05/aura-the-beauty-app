import type {ReportData} from '../reportTypes';
import {color} from '../reportTokens';

export type FaceReportStorySectionId =
  | 'summary'
  | 'face'
  | 'color-skin'
  | 'style';

export type FaceReportStoryPageKind = 'content' | 'cta';

export type FaceReportStoryContentKey =
  | 'summary'
  | 'summary:combined'
  | 'summary:generation'
  | 'proportion'
  | `features:${string}`
  | 'impression'
  | 'personal-color:tone'
  | 'personal-color:drape'
  | 'skin'
  | 'styling:natural'
  | 'styling:glam'
  | 'body'
  | 'makeup:cta';

export interface FaceReportStoryPage {
  id: string;
  sectionId: FaceReportStorySectionId;
  kind: FaceReportStoryPageKind;
  title: string;
  shortTitle: string;
  contentKey: FaceReportStoryContentKey;
}

export interface FaceReportStorySection {
  id: FaceReportStorySectionId;
  number: string;
  englishTitle: string;
  koreanTitle: string;
  accent: string;
  tint: string;
  pages: FaceReportStoryPage[];
}

export interface FaceReportStoryModel {
  sections: FaceReportStorySection[];
  pages: FaceReportStoryPage[];
  sectionCoverPageIds: Partial<Record<FaceReportStorySectionId, string>>;
  featurePageIds: Record<string, string>;
}

type StoryInput = Pick<
  ReportData,
  'generationStatus' | 'goldenMask' | 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8'
>;

interface SectionDefinition {
  id: FaceReportStorySectionId;
  number: string;
  englishTitle: string;
  koreanTitle: string;
  accent: string;
  tint: string;
}

const SECTION_DEFINITIONS: Record<FaceReportStorySectionId, SectionDefinition> = {
  summary: {
    id: 'summary',
    number: '01',
    englishTitle: 'PORTRAIT',
    koreanTitle: '요약',
    accent: color.accentDeep,
    tint: color.surface,
  },
  face: {
    id: 'face',
    number: '02',
    englishTitle: 'FACE',
    koreanTitle: '얼굴',
    accent: color.accentDeep,
    tint: color.surface,
  },
  'color-skin': {
    id: 'color-skin',
    number: '03',
    englishTitle: 'COLOR & SKIN',
    koreanTitle: '컬러·피부',
    accent: color.accentDeep,
    tint: color.surface,
  },
  style: {
    id: 'style',
    number: '04',
    englishTitle: 'STYLE',
    koreanTitle: '스타일',
    accent: color.accentDeep,
    tint: color.surface,
  },
};

function contentPage(
  sectionId: FaceReportStorySectionId,
  id: string,
  title: string,
  shortTitle: string,
  contentKey: FaceReportStoryContentKey,
  kind: FaceReportStoryPageKind = 'content',
): FaceReportStoryPage {
  return {id, sectionId, kind, title, shortTitle, contentKey};
}

function section(
  id: FaceReportStorySectionId,
  pages: FaceReportStoryPage[],
): FaceReportStorySection {
  return {...SECTION_DEFINITIONS[id], pages};
}

/**
 * 얼굴 보고서의 네 개 상위 챕터와 직접 이동 대상을 계산하는 단일 소스다.
 * 측정값이 없는 카드는 숨기되 상위 챕터는 실제 카드가 있을 때만 노출한다.
 * 별도 표지는 만들지 않고 각 챕터의 첫 카드가 간결한 편집형 헤더를 담당한다.
 */
export function buildFaceReportStoryModel(data: StoryInput): FaceReportStoryModel {
  const summaryPages = [
    contentPage(
      'summary',
      'summary:overview',
      '분석 요약',
      '한눈에 보기',
      data.goldenMask ? 'summary:combined' : 'summary',
    ),
    ...(data.generationStatus
      ? [
          contentPage(
            'summary',
            'summary:generation',
            '보고서 생성 상태',
            data.generationStatus === 'failed' ? '생성 중단' : '상세 생성 중',
            'summary:generation',
          ),
        ]
      : []),
  ];

  const facePages: FaceReportStoryPage[] = [];
  if (data.s2) {
    facePages.push(
      contentPage('face', 'proportion:overview', '얼굴 비율', '비율', 'proportion'),
    );
  }
  if (data.s3?.cards.length) {
    facePages.push(
      ...data.s3.cards.slice(0, 4).map(card =>
        contentPage(
          'face',
          `features:${card.key}`,
          card.regionTitle,
          card.regionChip,
          `features:${card.key}`,
        ),
      ),
    );
  }
  if (data.s6) {
    facePages.push(
      contentPage('face', 'impression:overview', '인상', '인상', 'impression'),
    );
  }

  const colorSkinPages: FaceReportStoryPage[] = [];
  if (data.s4) {
    colorSkinPages.push(
      contentPage(
        'color-skin',
        'personal-color:tone',
        '퍼스널 컬러',
        '톤',
        'personal-color:tone',
      ),
      contentPage(
        'color-skin',
        'personal-color:drape',
        '어울리는 색',
        '드레이프',
        'personal-color:drape',
      ),
    );
  }
  if (data.s8) {
    colorSkinPages.push(
      contentPage('color-skin', 'skin:overview', '피부', '피부', 'skin'),
    );
  }

  const stylePages: FaceReportStoryPage[] = [];
  if (data.s7) {
    stylePages.push(
      contentPage('style', 'styling:natural', '내추럴 스타일링', '내추럴', 'styling:natural'),
      contentPage('style', 'styling:glam', '글램 스타일링', '글램', 'styling:glam'),
    );
  }
  if (data.s5) {
    stylePages.push(
      contentPage('style', 'body:overview', '체형 스타일 가이드', '체형 부록', 'body'),
    );
  }
  stylePages.push(
    contentPage('style', 'makeup:cta', '메이크업 추천', '추천', 'makeup:cta', 'cta'),
  );

  const sections = [
    section('summary', summaryPages),
    ...(facePages.length ? [section('face', facePages)] : []),
    ...(colorSkinPages.length ? [section('color-skin', colorSkinPages)] : []),
    section('style', stylePages),
  ];
  const pages = sections.flatMap(item => item.pages);
  const sectionCoverPageIds = Object.fromEntries(
    sections.map(item => [item.id, item.pages[0]?.id]),
  ) as FaceReportStoryModel['sectionCoverPageIds'];
  const featurePageIds = Object.fromEntries(
    pages
      .filter(page => page.contentKey.startsWith('features:'))
      .map(page => [page.contentKey.slice('features:'.length), page.id]),
  );

  return {sections, pages, sectionCoverPageIds, featurePageIds};
}

export {SECTION_DEFINITIONS as FACE_REPORT_STORY_SECTIONS};
