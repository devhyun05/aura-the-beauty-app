import type {AuthSession, SocialLoginProvider} from '../types';

type MockSocialLoginOptions = {
  delayMs?: number;
  shouldFail?: boolean;
};

const wait = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

export async function loginWithSocialProvider(
  provider: SocialLoginProvider,
  options: MockSocialLoginOptions = {},
): Promise<AuthSession> {
  await wait(options.delayMs ?? 450);

  if (options.shouldFail) {
    throw new Error('로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }

  return {
    accessToken: `mock-${provider}-token`,
    provider,
    user: {
      id: 'mock-user-001',
      nickname: 'AURA User',
    },
  };
}
