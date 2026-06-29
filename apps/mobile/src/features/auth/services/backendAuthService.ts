import type {AuthSession, AuthUser} from '../types';
import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';

type BackendUser = {
  email?: string | null;
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

function mapBackendUser(sessionUser: AuthUser, backendUser: BackendUser): AuthUser {
  const email = sessionUser.email ?? backendUser.email;
  const name = sessionUser.name ?? backendUser.name;
  const nickname = sessionUser.nickname ?? backendUser.nickname ?? name ?? email ?? 'AURA User';
  const profileCompleted =
    sessionUser.profileCompleted ?? backendUser.profileCompleted ?? backendUser.profile_completed;

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

  const token = session.accessToken ?? session.idToken;

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
