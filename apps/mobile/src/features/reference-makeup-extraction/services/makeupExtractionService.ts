import {Image} from 'react-native';

import {uploadFaceCaptureImage} from '../../face-capture/services/faceCaptureUploadService';
import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import {referenceMakeupExtractionMock} from '../mocks/referenceMakeupExtraction.mock';
import type {
  MakeupExtractionProgressUpdate,
  MakeupExtractionStep,
  ReferenceMakeupAreaGuide,
  ReferenceMakeupExtractionData,
  ReferenceMakeupExtractionResult,
  ReferenceMakeupPhoto,
} from '../types';

type BackendReferenceMakeupExtractionLook = Partial<ReferenceMakeupExtractionResult> & {
  areaGuides?: Array<Partial<ReferenceMakeupAreaGuide>>;
};

type BackendReferenceMakeupExtractionResponse = {
  aiStatus?: string;
  extractedMakeupLook?: BackendReferenceMakeupExtractionLook;
  loadingSteps?: MakeupExtractionStep[];
  productSource?: string;
};

let latestReferenceMakeupExtractionData: ReferenceMakeupExtractionData = referenceMakeupExtractionMock;

function isPlainBackendObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function camelizeBackendKey(key: string): string {
  return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function camelizeBackendValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => camelizeBackendValue(item));
  }

  if (!isPlainBackendObject(value)) {
    return value;
  }

  return Object.entries(value).reduce<Record<string, unknown>>((nextValue, [key, nestedValue]) => {
    nextValue[camelizeBackendKey(key)] = camelizeBackendValue(nestedValue);
    return nextValue;
  }, {});
}

function normalizeBackendExtractionResponse(
  response: unknown,
): BackendReferenceMakeupExtractionResponse {
  return camelizeBackendValue(response) as BackendReferenceMakeupExtractionResponse;
}

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

function resolveReferencePhotoContentType(photo: ReferenceMakeupPhoto, uri: string): string | null {
  if (photo.contentType?.trim()) {
    return photo.contentType.trim();
  }

  const normalizedUri = uri.split('?')[0].toLowerCase();

  if (normalizedUri.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedUri.endsWith('.webp')) {
    return 'image/webp';
  }

  if (normalizedUri.endsWith('.jpg') || normalizedUri.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  return typeof photo.imageSource === 'number' ? 'image/png' : null;
}

function getReferencePhotoUploadExtension(contentType: string | null): string {
  if (contentType === 'image/png') {
    return 'png';
  }

  if (contentType === 'image/webp') {
    return 'webp';
  }

  return 'jpg';
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
  onProgress?: (update: MakeupExtractionProgressUpdate) => void,
): Promise<ReferenceMakeupExtractionData> {
  const hasBackendApiBaseUrl = Boolean(getBackendApiBaseUrl());
  const fallbackData = buildFallbackDataForPhoto(photo);

  onProgress?.({activeStepId: 'reference-read', phase: 'queued', progress: 0.03});

  if (!hasBackendApiBaseUrl) {
    console.info('[aura:reference-extraction] fallback:no-api-base');
    latestReferenceMakeupExtractionData = fallbackData;
    onProgress?.({activeStepId: 'ar-filter-ready', phase: 'fallback', progress: 1});
    return latestReferenceMakeupExtractionData;
  }

  const photoUri = resolveReferencePhotoUri(photo);

  if (!photoUri) {
    console.info('[aura:reference-extraction] fallback:no-photo-uri', {photoId: photo.id});
    latestReferenceMakeupExtractionData = fallbackData;
    onProgress?.({activeStepId: 'ar-filter-ready', phase: 'fallback', progress: 1});
    return latestReferenceMakeupExtractionData;
  }

  try {
    onProgress?.({activeStepId: 'reference-read', phase: 'uploading', progress: 0.1});

    console.info('[aura:reference-extraction] upload:start', {
      photoId: photo.id,
      referenceSource: photo.referenceSource,
      runAi: shouldRunReferenceMakeupAi(),
    });

    const referencePhotoContentType = resolveReferencePhotoContentType(photo, photoUri);
    const referencePhotoExtension = getReferencePhotoUploadExtension(referencePhotoContentType);
    const upload = await uploadFaceCaptureImage({
      captureType: 'filter_extraction',
      contentType: referencePhotoContentType,
      fileName: `${photo.id}.${referencePhotoExtension}`,
      mediaKind: 'filter-extraction',
      source: photo.referenceSource === 'camera' ? 'camera' : 'gallery',
      uri: photoUri,
    });

    onProgress?.({activeStepId: 'core-points', phase: 'uploaded', progress: 0.24});
    onProgress?.({activeStepId: 'area-guides', phase: 'analyzing', progress: 0.46});

    const response = await requestBackendJson<unknown>(
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

    const normalizedResponse = normalizeBackendExtractionResponse(response);

    onProgress?.({activeStepId: 'product-criteria', phase: 'products', progress: 0.86});

    latestReferenceMakeupExtractionData = {
      ...referenceMakeupExtractionMock,
      loadingSteps: normalizedResponse.loadingSteps ?? referenceMakeupExtractionMock.loadingSteps,
      extractedMakeupLook: mergeBackendExtractionLook(normalizedResponse.extractedMakeupLook, photo),
    };

    onProgress?.({activeStepId: 'ar-filter-ready', phase: 'complete', progress: 1});

    console.info('[aura:reference-extraction] analyze:success', {
      aiStatus: normalizedResponse.aiStatus,
      areaGuideCount: latestReferenceMakeupExtractionData.extractedMakeupLook.areaGuides.length,
      productSource: normalizedResponse.productSource,
      title: latestReferenceMakeupExtractionData.extractedMakeupLook.title,
    });

    return latestReferenceMakeupExtractionData;
  } catch (error) {
    console.info('[aura:reference-extraction] fallback:backend-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    latestReferenceMakeupExtractionData = fallbackData;
    onProgress?.({activeStepId: 'ar-filter-ready', phase: 'fallback', progress: 1});
    return latestReferenceMakeupExtractionData;
  }
}