import type {ReportData} from '../reportTypes';

export type FaceReportStorySectionId =
  | 'summary'
  | 'proportion'
  | 'features'
  | 'personal-color'
  | 'body'
  | 'impression'
  | 'styling'
  | 'skin';

export type FaceReportStoryPageKind = 'cover' | 'content';

export type FaceReportStoryContentKey =
  | 'summary'
  | 'summary:golden-mask'
  | 'summary:generation'
  | 'proportion'
  | `features:${string}`
  | 'personal-color:tone'
  | 'personal-color:drape'
  | 'body'
  | 'impression'
  | 'styling:natural'
  | 'styling:glam'
  | 'skin';

export interface FaceReportStoryPage {
  id: string;
  sectionId: FaceReportStorySectionId;
  kind: FaceReportStoryPageKind;
  title: string;
  shortTitle: string;
  contentKey?: FaceReportStoryContentKey;
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
    koreanTitle: '분석 요약',
    accent: '#455A64',
    tint: '#F2F5F6',
  },
  proportion: {
    id: 'proportion',
    number: '02',
    englishTitle: 'PROPORTION',
    koreanTitle: '얼굴 비율',
    accent: '#167AA4',
    tint: '#F0F8FB',
  },
  features: {
    id: 'features',
    number: '03',
    englishTitle: 'FEATURES',
    koreanTitle: '이목구비',
    accent: '#19766F',
    tint: '#F0F8F6',
  },
  'personal-color': {
    id: 'personal-color',
    number: '04',
    englishTitle: 'COLOR',
    koreanTitle: '퍼스널 컬러',
    accent: '#7654A5',
    tint: '#F7F2FB',
  },
  body: {
    id: 'body',
    number: '05',
    englishTitle: 'SILHOUETTE',
    koreanTitle: '체형',
    accent: '#8B6A56',
    tint: '#F8F4F1',
  },
  impression: {
    id: 'impression',
    number: '06',
    englishTitle: 'IMPRESSION',
    koreanTitle: '인상',
    accent: '#565CA5',
    tint: '#F3F3FA',
  },
  styling: {
    id: 'styling',
    number: '07',
    englishTitle: 'STYLING',
    koreanTitle: '스타일링',
    accent: '#A34769',
    tint: '#FBF1F5',
  },
  skin: {
    id: 'skin',
    number: '08',
    englishTitle: 'SKIN',
    koreanTitle: '피부',
    accent: '#2C8091',
    tint: '#EFF8F9',
  },
};

function coverPage(section: SectionDefinition): FaceReportStoryPage {
  return {
    id: `${section.id}:cover`,
    sectionId: section.id,
    kind: 'cover',
    title: section.koreanTitle,
    shortTitle: '표지',
  };
}

function contentPage(
  sectionId: FaceReportStorySectionId,
  id: string,
  title: string,
  shortTitle: string,
  contentKey: FaceReportStoryContentKey,
): FaceReportStoryPage {
  return {id, sectionId, kind: 'content', title, shortTitle, contentKey};
}

function withCover(
  id: FaceReportStorySectionId,
  content: FaceReportStoryPage[],
): FaceReportStorySection {
  const definition = SECTION_DEFINITIONS[id];
  return {...definition, pages: [coverPage(definition), ...content]};
}

/**
 * 얼굴 보고서의 화면 순서와 직접 이동 대상을 계산하는 단일 소스다.
 * 측정 데이터가 없는 선택 섹션은 표지까지 함께 빠지므로 페이지 수와 진행률도
 * 항상 실제 렌더링 결과를 따른다.
 */
export function buildFaceReportStoryModel(data: StoryInput): FaceReportStoryModel {
  const summaryPages = [
    ...(data.goldenMask
      ? [
          contentPage(
            'summary',
            'summary:golden-mask',
            '골든마스크',
            '나의 3D 페이스',
            'summary:golden-mask',
          ),
        ]
      : []),
    contentPage('summary', 'summary:overview', '분석 요약', '한눈에 보기', 'summary'),
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
  const sections: FaceReportStorySection[] = [
    withCover('summary', summaryPages),
  ];

  if (data.s2) {
    sections.push(
      withCover('proportion', [
        contentPage('proportion', 'proportion:overview', '얼굴 비율', '가늠선과 구획', 'proportion'),
      ]),
    );
  }

  if (data.s3?.cards.length) {
    sections.push(
      withCover(
        'features',
        data.s3.cards.slice(0, 4).map(card =>
          contentPage(
            'features',
            `features:${card.key}`,
            card.regionTitle,
            card.regionChip,
            `features:${card.key}`,
          ),
        ),
      ),
    );
  }

  if (data.s4) {
    sections.push(
      withCover('personal-color', [
        contentPage(
          'personal-color',
          'personal-color:tone',
          '퍼스널 컬러',
          '톤 맵과 컬러 축',
          'personal-color:tone',
        ),
        contentPage(
          'personal-color',
          'personal-color:drape',
          '어울리는 색',
          '드레이프와 색상표',
          'personal-color:drape',
        ),
      ]),
    );
  }

  if (data.s5) {
    sections.push(
      withCover('body', [
        contentPage('body', 'body:overview', '체형', '체형 스타일 가이드', 'body'),
      ]),
    );
  }

  if (data.s6) {
    sections.push(
      withCover('impression', [
        contentPage('impression', 'impression:overview', '인상', '인상 맵과 키워드', 'impression'),
      ]),
    );
  }

  if (data.s7) {
    sections.push(
      withCover('styling', [
        contentPage('styling', 'styling:natural', '내추럴 스타일링', '내추럴', 'styling:natural'),
        contentPage('styling', 'styling:glam', '글램 스타일링', '글램', 'styling:glam'),
      ]),
    );
  }

  if (data.s8) {
    sections.push(
      withCover('skin', [
        contentPage('skin', 'skin:overview', '피부', '9가지 피부 관찰', 'skin'),
      ]),
    );
  }

  const pages = sections.flatMap(section => section.pages);
  const sectionCoverPageIds: FaceReportStoryModel['sectionCoverPageIds'] = {};
  for (const section of sections) {
    sectionCoverPageIds[section.id] = section.pages[0]?.id;
  }

  const featurePageIds = Object.fromEntries(
    pages
      .filter(page => page.sectionId === 'features' && page.kind === 'content')
      .map(page => [page.contentKey?.slice('features:'.length) ?? '', page.id]),
  );

  return {sections, pages, sectionCoverPageIds, featurePageIds};
}

export {SECTION_DEFINITIONS as FACE_REPORT_STORY_SECTIONS};
