import { makeupLooksMock } from '../mocks/makeupLooks.mock';
import type { FaceAnalysisReport } from '../types/faceAnalysis';
import type { MakeupLook } from '../types/profile';
import { getFaceAnalysisReports } from './faceAnalysisService';

export function mapFaceAnalysisReportsToMakeupLooks(
  reports: readonly FaceAnalysisReport[],
): MakeupLook[] {
  return reports.flatMap(report =>
    report.recommendedMakeups.slice(0, 3).map((makeup, index) => ({
      id: `${report.id}-${makeup.id}-${index}`,
      title: makeup.title,
      moodLabel: makeup.subtitle || report.recommendedMood,
      shortDescription:
        makeup.description || report.shortSummary || report.summary || report.recommendedMood,
      imageSource: makeup.imageSource,
      isSaved: true,
      scope: 'totalMakeup',
      makeupArea: 'all',
      makeupPresetValues: {},
    })),
  );
}

export const getMakeupLooks = async (): Promise<MakeupLook[]> => {
  try {
    const reports = await getFaceAnalysisReports({
      limit: 80,
      withRecommendedMakeups: true,
    });
    const reportMakeupLooks = mapFaceAnalysisReportsToMakeupLooks(reports);

    return reportMakeupLooks.length > 0 ? reportMakeupLooks : makeupLooksMock;
  } catch (error) {
    console.info('[aura:profile] makeup-looks:fallback-mock', {
      message: error instanceof Error ? error.message : String(error),
    });

    return makeupLooksMock;
  }
};

export const getMakeupLookPreviews = async (
  limit = 3,
): Promise<MakeupLook[]> => {
  const makeupLooks = await getMakeupLooks();

  return makeupLooks.slice(0, limit);
};
