import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {
  MATCH_BADGE_THRESHOLD,
  buildReportMatchContext,
  computeThreadMatch,
} from './reportMatchService';

function expectTrue(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`${label}: expected true`);
  }
}

const springWarmReport = {
  id: 'report-spring-warm',
  personalColor: '봄웜 라이트',
  recommendedMood: '맑은 코랄 글로우',
  reportTitle: '5월 진단 리포트',
  skinType: '건성 피부',
  tags: ['봄웜', '코랄', '윤광'],
  toneSummary: '노란기 도는 밝은 피부',
} as FaceAnalysisReport;

const context = buildReportMatchContext(springWarmReport);

expectTrue(
  context.keywords.includes('코랄') && context.keywords.includes('글로우'),
  'context includes report tags and tone dictionary keywords',
);

expectTrue(
  context.keywords.includes('물광'),
  'dry skin adds moist-texture keywords',
);

const coralGlowThread = {
  moodTags: ['글로우', '코랄'],
  situationTags: ['데일리'],
  title: '속광 코랄 데일리 룩',
};

const coralMatch = computeThreadMatch(context, coralGlowThread);

expectTrue(
  coralMatch.percent >= MATCH_BADGE_THRESHOLD,
  `coral glow thread should exceed badge threshold (got ${coralMatch.percent})`,
);

const smokyThread = {
  moodTags: ['스모키', '버건디'],
  situationTags: ['저녁약속'],
  title: '딥 버건디 스모키',
};

const smokyMatch = computeThreadMatch(context, smokyThread);

expectTrue(
  smokyMatch.percent === 0,
  `winter-cool smoky thread should not match spring warm report (got ${smokyMatch.percent})`,
);

expectTrue(
  coralMatch.percent <= 96,
  'match percent is capped at 96',
);
