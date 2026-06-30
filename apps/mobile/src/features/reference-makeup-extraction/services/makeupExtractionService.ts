import {Image} from 'react-native';

import {uploadFaceCaptureImage} from '../../face-capture/services/faceCaptureUploadService';
import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import {referenceMakeupExtractionMock} from '../mocks/referenceMakeupExtraction.mock';
import type {
  MakeupExtractionStep,
  ReferenceMakeupAreaGuide,
  ReferenceMakeupExtractionData,
  ReferenceMakeupExtractionResult,
  ReferenceMakeupPhoto,
} from '../types';

type BackendReferenceMakeupExtractionResponse = {
  extractedMakeupLook?: Partial<ReferenceMakeupExtractionResult> & {
    areaGuides?: Array<Partial<ReferenceMakeupAreaGuide>>;
  };
  loadingSteps?: MakeupExtractionStep[];
};

let latestReferenceMakeupExtractionData: ReferenceMakeupExtractionData = referenceMakeupExtractionMock;

function buildFallbackDataForPhoto(photo?: ReferenceMakeupPhoto | null): ReferenceMakeupExtractionData {
  if (!photo) {
    return referenceMakeupExtractionMock;
  }

  return {
    ...referenceMakeupExtractionMock,
    extractedMakeupLook: {
      ...referenceMakeupExtractionMock.extractedMakeupLook,
      imageSource: photo.imageSource,
    },
  };
}

function getFallbackAreaGuide(id: string | undefined): ReferenceMakeupAreaGuide | undefined {
  return referenceMakeupExtractionMock.extractedMakeupLook.areaGuides.find(
    (guide) => guide.id === id,
  );
}

function mergeBackendAreaGuide(
  backendGuide: Partial<ReferenceMakeupAreaGuide>,
): ReferenceMakeupAreaGuide | null {
  const fallbackGuide = getFallbackAreaGuide(backendGuide.id);

  if (!fallbackGuide) {
    return null;
  }

  const backendProduct = backendGuide.productRecommendation?.product;
  const fallbackProduct = fallbackGuide.productRecommendation.product;

  return {
    ...fallbackGuide,
    ...backendGuide,
    color: {
      ...fallbackGuide.color,
      ...backendGuide.color,
    },
    productRecommendation: {
      ...fallbackGuide.productRecommendation,
      ...backendGuide.productRecommendation,
      product: backendProduct && fallbackProduct
        ? {
            ...fallbackProduct,
            ...backendProduct,
            imageSource: fallbackProduct.imageSource,
          }
        : fallbackProduct,
    },
  };
}

function mergeBackendExtractionLook(
  backendLook: BackendReferenceMakeupExtractionResponse['extractedMakeupLook'],
  photo: ReferenceMakeupPhoto,
): ReferenceMakeupExtractionResult {
  const fallbackLook = referenceMakeupExtractionMock.extractedMakeupLook;
  const backendGuides = Array.isArray(backendLook?.areaGuides)
    ? backendLook.areaGuides
        .map((guide) => mergeBackendAreaGuide(guide))
        .filter((guide): guide is ReferenceMakeupAreaGuide => Boolean(guide))
    : [];

  return {
    ...fallbackLook,
    ...backendLook,
    imageSource: photo.imageSource,
    lookDna: {
      ...fallbackLook.lookDna,
      ...backendLook?.lookDna,
      keyAreas: backendLook?.lookDna?.keyAreas ?? fallbackLook.lookDna.keyAreas,
      moodKeywords: backendLook?.lookDna?.moodKeywords ?? fallbackLook.lookDna.moodKeywords,
      textureBalance: backendLook?.lookDna?.textureBalance ?? fallbackLook.lookDna.textureBalance,
    },
    palette: backendLook?.palette ?? fallbackLook.palette,
    points: backendLook?.points ?? fallbackLook.points,
    tags: backendLook?.tags ?? fallbackLook.tags,
    areaGuides: backendGuides.length > 0 ? backendGuides : fallbackLook.areaGuides,
  };
}

function resolveReferencePhotoUri(photo: ReferenceMakeupPhoto): string | null {
  const resolvedSource = Image.resolveAssetSource(photo.imageSource);

  return resolvedSource?.uri ?? null;
}

function shouldRunReferenceMakeupAi(): boolean {
  return process.env.EXPO_PUBLIC_REFERENCE_MAKEUP_AI_ENABLED === 'true';
}

export const getReferenceMakeupExtractionData = async (): Promise<ReferenceMakeupExtractionData> => {
  return Promise.resolve(latestReferenceMakeupExtractionData);
};

export const getReferenceMakeupExtractionDataSync = (): ReferenceMakeupExtractionData =>
  latestReferenceMakeupExtractionData;

export async function runReferenceMakeupExtraction(
  photo: ReferenceMakeupPhoto,
): Promise<ReferenceMakeupExtractionData> {
  const hasBackendApiBaseUrl = Boolean(getBackendApiBaseUrl());
  const fallbackData = buildFallbackDataForPhoto(photo);

  if (!hasBackendApiBaseUrl) {
    console.info('[aura:reference-extraction] fallback:no-api-base');
    latestReferenceMakeupExtractionData = fallbackData;
    return latestReferenceMakeupExtractionData;
  }

  const photoUri = resolveReferencePhotoUri(photo);

  if (!photoUri) {
    console.info('[aura:reference-extraction] fallback:no-photo-uri', {photoId: photo.id});
    latestReferenceMakeupExtractionData = fallbackData;
    return latestReferenceMakeupExtractionData;
  }

  try {
    console.info('[aura:reference-extraction] upload:start', {
      photoId: photo.id,
      referenceSource: photo.referenceSource,
      runAi: shouldRunReferenceMakeupAi(),
    });

    const upload = await uploadFaceCaptureImage({
      captureType: 'filter_extraction',
      fileName: `${photo.id}.jpg`,
      mediaKind: 'filter-extraction',
      source: photo.referenceSource === 'camera' ? 'camera' : 'gallery',
      uri: photoUri,
    });

    const response = await requestBackendJson<BackendReferenceMakeupExtractionResponse>(
      '/filter-extractions/analyze',
      {
        body: {
          photoCaptureId: upload.photoCaptureId,
          referenceImageId: photo.id,
          resultMediaId: upload.mediaId,
          runAi: shouldRunReferenceMakeupAi(),
          subtitle: null,
          title: photo.title,
          requestPayload: {
            bucket: upload.bucket,
            cdnUrl: upload.cdnUrl ?? null,
            contentType: upload.contentType ?? 'image/jpeg',
            imageUrl: upload.cdnUrl ?? null,
            objectKey: upload.objectKey,
            referenceImageId: photo.id,
            referenceSource: photo.referenceSource,
            referenceTitle: photo.title,
            sourceUri: photoUri,
            task: 'reference_makeup_extraction_report_v1',
          },
        },
        method: 'POST',
        timeoutMs: 120000,
      },
    );

    latestReferenceMakeupExtractionData = {
      ...referenceMakeupExtractionMock,
      loadingSteps: response.loadingSteps ?? referenceMakeupExtractionMock.loadingSteps,
      extractedMakeupLook: mergeBackendExtractionLook(response.extractedMakeupLook, photo),
    };

    console.info('[aura:reference-extraction] analyze:success', {
      areaGuideCount: latestReferenceMakeupExtractionData.extractedMakeupLook.areaGuides.length,
      title: latestReferenceMakeupExtractionData.extractedMakeupLook.title,
    });

    return latestReferenceMakeupExtractionData;
  } catch (error) {
    console.info('[aura:reference-extraction] fallback:backend-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    latestReferenceMakeupExtractionData = fallbackData;
    return latestReferenceMakeupExtractionData;
  }
}