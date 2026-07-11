import type {AuthSession, AuthUser} from '../types';
import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';

type BackendUser = {
  birthDate?: string | null;
  birth_date?: string | null;
  email?: string | null;
  gender?: string | null;
  id: string;
  name?: string | null;
  nickname?: string | null;
  profileCompleted?: boolean | null;
  profile_completed?: boolean | null;
};

type UsersMePayload = {
  auth?: {
    provider?: string;
  };
  user?: BackendUser;
};

const devAuthPlaceholderValues = new Set(['Local Dev', 'dev@example.com']);

function resolveBackendAuthText(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized || devAuthPlaceholderValues.has(normalized)) {
    return undefined;
  }

  return normalized;
}

function hasCompletedBackendProfile(user: BackendUser): boolean {
  return Boolean(
    resolveBackendAuthText(user.email) &&
      resolveBackendAuthText(user.name) &&
      resolveBackendAuthText(user.nickname) &&
      (user.birthDate ?? user.birth_date) &&
      user.gender,
  );
}

function mapBackendUser(sessionUser: AuthUser, backendUser: BackendUser): AuthUser {
  const sessionEmail = resolveBackendAuthText(sessionUser.email);
  const sessionName = resolveBackendAuthText(sessionUser.name);
  const sessionNickname = resolveBackendAuthText(sessionUser.nickname);
  const backendEmail = resolveBackendAuthText(backendUser.email);
  const backendName = resolveBackendAuthText(backendUser.name);
  const backendNickname = resolveBackendAuthText(backendUser.nickname);
  const email = sessionEmail ?? backendEmail;
  const name = sessionName ?? backendName;
  const nickname = sessionNickname ?? backendNickname ?? name ?? email ?? 'AURA User';
  const backendProfileCompleted =
    backendUser.profileCompleted ??
    backendUser.profile_completed ??
    hasCompletedBackendProfile(backendUser);
  // A cached `false` from an earlier login must not override the authoritative
  // completion state returned by the backend.
  const profileCompleted = backendProfileCompleted || sessionUser.profileCompleted;

  return {
    email: email ?? undefined,
    id: backendUser.id,
    name: name ?? undefined,
    nickname,
    profileCompleted: profileCompleted ?? undefined,
  };
}

export async function syncAuthSessionWithBackend(session: AuthSession): Promise<AuthSession> {
  const apiBaseUrl = getBackendApiBaseUrl();

  if (!apiBaseUrl) {
    return session;
  }

  // The ID token carries the verified profile claims used to populate users.
  // Access tokens identify the same Cognito subject, but commonly omit email/name.
  const token = session.idToken ?? session.accessToken;

  if (!token) {
    throw new Error('Missing Cognito token for backend user sync.');
  }

  const data = await requestBackendJson<UsersMePayload>('/users/me', {
    authToken: token,
    method: 'GET',
  });

  const backendUser = data.user;

  if (!backendUser?.id) {
    throw new Error('Backend user sync did not return a user id.');
  }

  return {
    ...session,
    user: mapBackendUser(session.user, backendUser),
  };
}
