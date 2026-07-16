import {deleteUnifiedFaceCaptureTempImage} from './unifiedFaceCaptureTempImageCleanup';

type DeleteTempImage = (
  uri: string | null | undefined,
) => Promise<boolean>;

/**
 * Local Face Capture Lab의 stub "upload"가 인수한 Unity cache JPEG만 추적한다.
 * 제품 업로드 소유권과 섞지 않고, 화면 참조가 끝난 뒤 또는 Lab unmount 때
 * best-effort로 지운다.
 */
export class FaceCaptureLabTempImageOwnership {
  private readonly ownedUris = new Set<string>();

  constructor(
    private readonly deleteTempImage: DeleteTempImage =
      deleteUnifiedFaceCaptureTempImage,
  ) {}

  get pendingCount() {
    return this.ownedUris.size;
  }

  take(uri: string) {
    if (!uri) {
      throw new Error('Face Capture Lab temp image URI is required');
    }
    this.ownedUris.add(uri);
  }

  async release(uri: string | null | undefined) {
    if (!uri || !this.ownedUris.has(uri)) {
      return false;
    }

    const deleted = await this.deleteTempImage(uri);
    if (deleted) {
      this.ownedUris.delete(uri);
    }
    return deleted;
  }

  async releaseAll() {
    const results = await Promise.all(
      [...this.ownedUris].map(uri => this.release(uri)),
    );
    return results.filter(Boolean).length;
  }
}
