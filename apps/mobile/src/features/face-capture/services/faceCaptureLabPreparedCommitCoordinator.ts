type PreparedCommitAttempt = {
  generation: number;
  requestId: string;
};

type RunPreparedCommitInput<TValue, TResult> = {
  finalize: (context: {
    isCurrent: () => boolean;
    value: TValue;
  }) => Promise<TResult> | TResult;
  persistEvidence: () => Promise<TValue>;
  requestId: string;
};

/**
 * Prepared Exact-30의 evidence write와 Lab 화면 전환 사이를 직렬화한다.
 *
 * cancel/change-mode는 generation을 즉시 무효화하지만 active attempt는
 * evidence 후처리가 끝날 때까지 유지한다. 따라서 같은 planned request가
 * 재진입해 evidence를 중복 기록하거나 이전 결과가 새 화면을 덮을 수 없다.
 */
export class FaceCaptureLabPreparedCommitCoordinator {
  private activeAttempt: PreparedCommitAttempt | null = null;
  private generation = 0;

  get pendingRequestId() {
    return this.activeAttempt?.requestId ?? null;
  }

  invalidate() {
    this.generation += 1;
  }

  async run<TValue, TResult>({
    finalize,
    persistEvidence,
    requestId,
  }: RunPreparedCommitInput<TValue, TResult>): Promise<TResult> {
    if (!requestId) {
      throw new Error('Prepared commit request ID is required');
    }
    if (this.activeAttempt) {
      throw new Error(
        `Prepared commit ${this.activeAttempt.requestId} is still pending`,
      );
    }

    const attempt = {
      generation: this.generation,
      requestId,
    };
    this.activeAttempt = attempt;

    try {
      const value = await persistEvidence();
      return await finalize({
        isCurrent: () =>
          this.activeAttempt === attempt &&
          this.generation === attempt.generation,
        value,
      });
    } finally {
      if (this.activeAttempt === attempt) {
        this.activeAttempt = null;
      }
    }
  }
}
