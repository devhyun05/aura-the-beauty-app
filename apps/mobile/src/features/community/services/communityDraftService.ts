import {File, Paths} from 'expo-file-system';

import type {CommunityCreateImage, CreateThreadFormValues} from '../components/CreateThreadForm';

export type CommunityThreadDraft = {
  images: CommunityCreateImage[];
  savedAt: string;
  values: CreateThreadFormValues;
  version?: number;
};

const DRAFT_FILE_NAME = 'community-create-draft.json';
// 폼 구조가 바뀔 때 올린다 — 구버전 draft가 새 폼에 그대로 복원되는 사고 방지.
const DRAFT_VERSION = 2;

function getDraftFile() {
  return new File(Paths.document, DRAFT_FILE_NAME);
}

export function loadCommunityThreadDraft(): CommunityThreadDraft | null {
  try {
    const draftFile = getDraftFile();

    if (!draftFile.exists) {
      return null;
    }

    const parsed = JSON.parse(draftFile.textSync()) as CommunityThreadDraft;

    if (!parsed || typeof parsed !== 'object' || !parsed.values || !Array.isArray(parsed.images)) {
      return null;
    }

    if (parsed.version !== DRAFT_VERSION) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveCommunityThreadDraft(draft: CommunityThreadDraft) {
  try {
    getDraftFile().write(JSON.stringify({...draft, version: DRAFT_VERSION}));
  } catch {
    // draft 저장 실패는 작성 흐름을 막지 않는다.
  }
}

export function clearCommunityThreadDraft() {
  try {
    const draftFile = getDraftFile();

    if (draftFile.exists) {
      draftFile.delete();
    }
  } catch {
    // 삭제 실패 시 다음 저장에서 덮어쓴다.
  }
}
