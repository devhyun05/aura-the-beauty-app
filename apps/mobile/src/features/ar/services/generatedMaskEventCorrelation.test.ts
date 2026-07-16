// Jest provides these at runtime; the app tsconfig has no test-runner types,
// so declare the minimal surface locally (matches how this repo's other
// tests avoid runner typings).
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (actual: unknown) => {toBe: (expected: unknown) => void};

import {
  TERMINAL_GENERATED_MASK_BLOCKED_REASONS,
  isTerminalGeneratedMaskEvent,
  shouldClearScheduledGeneratedMaskPost,
} from './generatedMaskEventCorrelation';

describe('isTerminalGeneratedMaskEvent', () => {
  const terminalReason = 'generated_lip_mask_texture_registration_failed';

  it('treats a matching terminal event as terminal', () => {
    expect(
      isTerminalGeneratedMaskEvent(
        {blockedReason: terminalReason, generatedMaskId: 'mask-1'},
        'mask-1',
      ),
    ).toBe(true);
  });

  it('covers every registered terminal reason', () => {
    for (const reason of TERMINAL_GENERATED_MASK_BLOCKED_REASONS) {
      expect(
        isTerminalGeneratedMaskEvent(
          {blockedReason: reason, generatedMaskId: 'mask-1'},
          'mask-1',
        ),
      ).toBe(true);
    }
  });

  it('ignores non-terminal blocked reasons', () => {
    expect(
      isTerminalGeneratedMaskEvent(
        {blockedReason: 'face_tracking_lost', generatedMaskId: 'mask-1'},
        'mask-1',
      ),
    ).toBe(false);
  });

  it('ignores terminal events without a mask id (cannot correlate)', () => {
    expect(
      isTerminalGeneratedMaskEvent({blockedReason: terminalReason}, 'mask-1'),
    ).toBe(false);
  });

  it('ignores terminal events while no request is pending (initial-generation window)', () => {
    expect(
      isTerminalGeneratedMaskEvent(
        {blockedReason: terminalReason, generatedMaskId: 'mask-old'},
        null,
      ),
    ).toBe(false);
  });

  it('ignores stale terminal events from a previous mask id', () => {
    expect(
      isTerminalGeneratedMaskEvent(
        {blockedReason: terminalReason, generatedMaskId: 'mask-old'},
        'mask-new',
      ),
    ).toBe(false);
  });
});

describe('shouldClearScheduledGeneratedMaskPost', () => {
  it('clears a post whose id matches and revision is at or below the ack', () => {
    expect(
      shouldClearScheduledGeneratedMaskPost({packageId: 'mask-1', revision: 3}, 'mask-1', 3),
    ).toBe(true);
    expect(
      shouldClearScheduledGeneratedMaskPost({packageId: 'mask-1', revision: 2}, 'mask-1', 3),
    ).toBe(true);
  });

  it('keeps a NEWER revision when a delayed ack for an older one arrives', () => {
    expect(
      shouldClearScheduledGeneratedMaskPost({packageId: 'mask-1', revision: 4}, 'mask-1', 3),
    ).toBe(false);
  });

  it('clears nothing when the event has no mask id', () => {
    expect(
      shouldClearScheduledGeneratedMaskPost({packageId: 'mask-1', revision: 1}, undefined, 1),
    ).toBe(false);
    expect(
      shouldClearScheduledGeneratedMaskPost({packageId: 'mask-1', revision: 1}, '', 1),
    ).toBe(false);
  });

  it('keeps posts for a different mask id', () => {
    expect(
      shouldClearScheduledGeneratedMaskPost({packageId: 'mask-2', revision: 1}, 'mask-1', 1),
    ).toBe(false);
  });

  it('falls back to id-only matching when either side lacks a revision', () => {
    expect(
      shouldClearScheduledGeneratedMaskPost({packageId: 'mask-1'}, 'mask-1', 3),
    ).toBe(true);
    expect(
      shouldClearScheduledGeneratedMaskPost({packageId: 'mask-1', revision: 4}, 'mask-1', undefined),
    ).toBe(true);
  });
});
