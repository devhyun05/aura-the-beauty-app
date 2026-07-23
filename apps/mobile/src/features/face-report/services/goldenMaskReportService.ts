import * as FileSystem from 'expo-file-system/legacy';

import {
  parseGoldenMaskReportDescriptor,
  type GoldenMaskReportDescriptor,
} from '../../../shared/contracts/goldenMask';
import {requestBackendJson} from '../../../shared/services/backendApi';

type GetGoldenMaskResponse = {
  goldenMask: unknown;
};

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

const downloads = new Map<
  string,
  Promise<{descriptor: GoldenMaskReportDescriptor; fileUri: string}>
>();

async function validCachedFile(
  uri: string,
  expectedByteSize: number,
): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return (
      info.exists &&
      !info.isDirectory &&
      typeof info.size === 'number' &&
      info.size === expectedByteSize
    );
  } catch {
    return false;
  }
}

export async function getGoldenMaskDownloadDescriptor(
  reportId: string,
  knownDescriptor: GoldenMaskReportDescriptor,
  forceRefresh = false,
): Promise<GoldenMaskReportDescriptor> {
  if (knownDescriptor.downloadUrl && !forceRefresh) {
    return knownDescriptor;
  }

  const response = await requestBackendJson<GetGoldenMaskResponse>(
    `/analysis/reports/${reportId}/golden-mask`,
  );
  const descriptor = parseGoldenMaskReportDescriptor(response.goldenMask);
  if (!descriptor || descriptor.mediaId !== knownDescriptor.mediaId) {
    throw new Error('골든마스크 다운로드 정보를 확인하지 못했어요.');
  }
  return descriptor;
}

async function downloadGoldenMaskForReportOnce(
  reportId: string,
  knownDescriptor: GoldenMaskReportDescriptor,
): Promise<{descriptor: GoldenMaskReportDescriptor; fileUri: string}> {
  const startedAt = Date.now();
  if (!FileSystem.cacheDirectory) {
    throw new Error('골든마스크 임시 저장 공간을 사용할 수 없어요.');
  }

  let descriptor = await getGoldenMaskDownloadDescriptor(
    reportId,
    knownDescriptor,
  );
  if (!descriptor.downloadUrl) {
    throw new Error('골든마스크 다운로드 주소가 비어 있어요.');
  }

  const fileUri = `${FileSystem.cacheDirectory}golden-mask-${safePathPart(
    reportId,
  )}-${descriptor.topologyFingerprint.slice(0, 12)}.auragm`;

  if (await validCachedFile(fileUri, descriptor.byteSize)) {
    console.info('[aura:golden-mask] download:cache-hit', {
      elapsedMs: Date.now() - startedAt,
      reportId,
    });
    return {descriptor, fileUri};
  }

  try {
    console.info('[aura:golden-mask] download:start', {reportId});
    await FileSystem.deleteAsync(fileUri, {idempotent: true});
    let downloaded = await FileSystem.downloadAsync(
      descriptor.downloadUrl,
      fileUri,
    );
    if (downloaded.status === 401 || downloaded.status === 403) {
      await FileSystem.deleteAsync(fileUri, {idempotent: true});
      descriptor = await getGoldenMaskDownloadDescriptor(
        reportId,
        knownDescriptor,
        true,
      );
      if (!descriptor.downloadUrl) {
        throw new Error('골든마스크 다운로드 주소가 비어 있어요.');
      }
      downloaded = await FileSystem.downloadAsync(
        descriptor.downloadUrl,
        fileUri,
      );
    }
    if (
      downloaded.status < 200 ||
      downloaded.status >= 300 ||
      !(await validCachedFile(downloaded.uri, descriptor.byteSize))
    ) {
      throw new Error('골든마스크 파일을 안전하게 내려받지 못했어요.');
    }

    console.info('[aura:golden-mask] download:done', {
      byteSize: descriptor.byteSize,
      elapsedMs: Date.now() - startedAt,
      reportId,
    });
    return {descriptor, fileUri: downloaded.uri};
  } catch (error) {
    await FileSystem.deleteAsync(fileUri, {idempotent: true}).catch(
      () => undefined,
    );
    throw error;
  }
}

export function downloadGoldenMaskForReport(
  reportId: string,
  knownDescriptor: GoldenMaskReportDescriptor,
): Promise<{descriptor: GoldenMaskReportDescriptor; fileUri: string}> {
  const key = `${reportId}:${knownDescriptor.topologyFingerprint}`;
  const existing = downloads.get(key);
  if (existing) {
    return existing;
  }

  const download = downloadGoldenMaskForReportOnce(
    reportId,
    knownDescriptor,
  ).finally(() => {
    downloads.delete(key);
  });
  downloads.set(key, download);
  return download;
}
