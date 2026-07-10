import type {AuthUser} from '../../auth';
import {clearProfileSetupCompletion} from '../../auth';
import {clearConsultingReadState} from '../../consulting/services/consultingReadStateService';
import {clearFaceCaptureTutorialCompletion} from '../../onboarding/services/tutorialCompletionService';
import {revokePersonalColorConsent} from '../../personal-color/services/personalColorConsentStore';
import {requestBackendJson} from '../../../shared/services/backendApi';
import {clearCachedUserProfile} from '../../../shared/services/userService';

export type DeleteAccountResponse = {
  deleted: boolean;
  identityDeleted: boolean;
  mediaDeletionPending: number;
};

export async function deleteMyAccount(): Promise<DeleteAccountResponse> {
  return requestBackendJson<DeleteAccountResponse>('/users/me', {
    method: 'DELETE',
  });
}

export async function clearLocalAccountData(user: AuthUser): Promise<void> {
  await Promise.allSettled([
    clearCachedUserProfile(),
    clearProfileSetupCompletion(user),
    clearFaceCaptureTutorialCompletion(user),
    clearConsultingReadState(),
    revokePersonalColorConsent(),
  ]);
}
